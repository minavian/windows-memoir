// Settings' Performance dial, built like the limit picker (shared/goal.js): an inverted disc, a track with a dot
// for each level (Default, Reduced motion, No animations) and the fill up to the knob. Drag the knob round and let
// go: it settles on the nearest dot. A press on the track goes to its nearest dot; the arrow keys step. Styles in
// recap.css. The level itself is applied by theme-boot.js (window.memoirMotion).
import { reducedMotion } from './fx.js';

export const MOTION_LEVELS = [
  { id: 'full', name: 'Default' },
  { id: 'reduced', name: 'Reduced' },
  { id: 'off', name: 'Off' },
];
const C = 60;               // centre of the 120×120 viewBox
const R = 41;               // track radius
const A = 120;              // the dots at -120°, 0° and 120° (0° at the top, clockwise): the gap is at the bottom
const STOPS = [-A, 0, A];

const polar = (deg, r = R) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};
function arcD(a0, a1) {
  if (a1 - a0 < 0.05) return '';
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
// a settle with a little give at the end, as the picker's knob has
const settleEase = t => { const c1 = 1.25, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };

export function createMotionDial(root, { value = 'full', onChange = () => {} } = {}) {
  let index = Math.max(0, MOTION_LEVELS.findIndex(l => l.id === value));
  let angle = STOPS[index];
  let glide = 0;
  root.classList.add('md');
  root.setAttribute('role', 'slider');
  root.tabIndex = 0;
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '2');
  root.innerHTML = `
    <svg class="md-svg" viewBox="0 0 120 120" aria-hidden="true">
      <path class="md-track" d="${arcD(-A, A)}"/>
      <path class="md-fill" d=""/>
      ${STOPS.map((s, i) => { const [x, y] = polar(s); return `<circle class="md-stop" data-i="${i}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2"/>`; }).join('')}
      <path class="md-hit" d="${arcD(-A - 8, A + 8)}"/>
      <g class="md-knob"><circle class="md-knob-halo" r="9"/><circle class="md-knob-dot" r="5.5"/></g>
    </svg>
    <span class="md-names" aria-hidden="true">${MOTION_LEVELS.map(l => `<span data-l="${l.id}">${l.name}</span>`).join('')}</span>`;
  const fill = root.querySelector('.md-fill');
  const knob = root.querySelector('.md-knob');
  const stops = [...root.querySelectorAll('.md-stop')];
  const names = [...root.querySelectorAll('.md-names > span')];

  const draw = () => {
    fill.setAttribute('d', arcD(-A, angle));
    const [x, y] = polar(angle);
    knob.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    stops.forEach((s, i) => s.classList.toggle('passed', STOPS[i] <= angle + 0.5));
    knob.classList.toggle('on-dot', STOPS.some(s => Math.abs(s - angle) < 0.6));
  };
  // the name in the middle: the one shown rises in, the one before rises away
  const showName = i => {
    for (const [k, n] of names.entries()) {
      if (k === i) {
        if (n.classList.contains('on')) continue;
        if (n.classList.contains('gone') && !n.getAnimations().length) { n.style.transition = 'none'; n.classList.remove('gone'); void n.offsetWidth; n.style.transition = ''; }
        n.classList.remove('gone');
        n.classList.add('on');
      } else if (n.classList.contains('on')) { n.classList.remove('on'); n.classList.add('gone'); }
    }
  };
  const label = i => {
    root.setAttribute('aria-valuenow', String(i));
    root.setAttribute('aria-valuetext', ['Default: every animation', 'Reduced motion', 'No animations'][i]);
  };
  const nearest = deg => STOPS.reduce((best, s, i) => (Math.abs(s - deg) < Math.abs(STOPS[best] - deg) ? i : best), 0);
  // the knob glides to a dot, then the level is applied (so the glide itself is never cut short by it)
  function settle(i, { quiet = false } = {}) {
    cancelAnimationFrame(glide);
    const from = angle, to = STOPS[i];
    const done = () => {
      angle = to; draw();
      const changed = i !== index;
      index = i; label(i);
      if (changed && !quiet) onChange(MOTION_LEVELS[i].id);
    };
    showName(i);
    if (reducedMotion() || Math.abs(to - from) < 0.5) { done(); return; }
    const t0 = performance.now(), ms = 360 + Math.min(260, Math.abs(to - from) * 1.4);
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      angle = from + (to - from) * settleEase(t);
      draw();
      if (t < 1) glide = requestAnimationFrame(step); else done();
    };
    glide = requestAnimationFrame(step);
  }

  // dragging round the track: the knob follows (kept on the track, out of the gap), the name shows where it would
  // settle, and letting go settles it; a press without a drag goes to the nearest dot
  const angleAt = e => {
    const r = root.getBoundingClientRect();
    const deg = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    return Math.max(-A, Math.min(A, deg));
  };
  let drag = null;
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest('.md-hit, .md-knob, .md-stop')) return;
    e.preventDefault();
    root.focus({ preventScroll: true });
    cancelAnimationFrame(glide);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try { root.setPointerCapture(e.pointerId); } catch { /* gone already */ }
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
    drag.moved = true;
    root.classList.add('dragging');
    angle = angleAt(e);
    draw();
    showName(nearest(angle));
  });
  const release = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const at = drag.moved ? angle : angleAt(e);
    drag = null;
    root.classList.remove('dragging');
    settle(nearest(at));
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', () => { if (drag) { drag = null; root.classList.remove('dragging'); settle(index); } });
  root.addEventListener('keydown', e => {
    const to = { ArrowRight: index + 1, ArrowUp: index + 1, ArrowLeft: index - 1, ArrowDown: index - 1, Home: 0, End: 2 }[e.key];
    if (to == null) return;
    e.preventDefault();
    settle(Math.max(0, Math.min(2, to)));
  });

  draw();
  showName(index);
  label(index);
  return { set: id => settle(Math.max(0, MOTION_LEVELS.findIndex(l => l.id === id)), { quiet: true }) };
}
