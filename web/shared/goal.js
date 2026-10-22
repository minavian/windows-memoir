// Daily limit: a countdown ring, and a circular picker to set the limit.
//
// Ring colours by how much of the limit is used:
//   under 75% green · 75% yellow · 90% orange · 95% red · over the limit: deep red + flame.
// The picker is its own circle in inverted colours, with a gap at the top that
// holds the ✓. Hours first (then it glides to minutes), or pick minutes directly.
// Minutes go one at a time, so a limit can be as short as a minute.

import { formatDuration, goalLevel, GOAL_MIN_MS } from './core.js';
import { reducedMotion, MorphPopover, EASE_OUT, EASE_IN_OUT, POP } from './fx.js';

const FLAME = `<svg class="gr-flame" viewBox="0 0 24 24" aria-hidden="true">
  <path class="fl-out" d="M12.2 1.8c.7 3.3-1.1 5-2.9 7.1-1.5 1.8-2.3 3.6-1.6 6-1.3-.6-2.2-1.9-2.3-3.5-1.7 2.2-2.2 4.9-.9 7.4C5.8 21.3 8.6 23 12 23c3.8 0 6.8-2.3 7.4-5.9.5-3-.9-5.9-3-8.3.1 1.6-.6 2.9-1.8 3.6.5-4.2-.6-7.9-2.4-10.6Z"/>
  <path class="fl-in" d="M12.1 12.4c-1.9 1.7-3 3.4-2.6 5.4.3 1.6 1.4 2.8 2.6 2.8s2.3-1.1 2.6-2.7c.4-2-.7-3.8-2.6-5.5Z"/>
</svg>`;
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5 10 17 18.5 7.5" pathLength="1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- the countdown ring ----------

export function createGoalRing(root, { variant = 'card', onSet = null } = {}) {
  const mini = variant === 'mini';
  root.innerHTML = `
    <div class="gr" data-variant="${variant}" data-level="none">
      <svg class="gr-svg" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="gr-track" cx="100" cy="100" r="${mini ? 80 : 86}"/>
        <circle class="gr-arc" cx="100" cy="100" r="${mini ? 80 : 86}" pathLength="1000" transform="rotate(-90 100 100)"/>
      </svg>
      <div class="gr-center">
        ${FLAME}
        ${mini ? '<span class="gr-mini-text num"></span>' : `
        <span class="gr-big num"></span>
        <span class="gr-sub"></span>
        <button class="btn btn-primary btn-xs gr-set" type="button">Set limit</button>
        <span class="gr-lock" title="You committed to this limit. Only Settings can unlock it, after a lot of questions.">${LOCK}<span>Locked in</span></span>`}
      </div>
    </div>`;
  const el = root.firstElementChild;
  const arc = el.querySelector('.gr-arc');
  const setBtn = el.querySelector('.gr-set');
  if (setBtn && onSet) setBtn.addEventListener('click', () => onSet(setBtn));
  let first = true;

  function update({ used = 0, limit = null, locked = false }) {
    const level = goalLevel(used, limit);
    el.dataset.level = level;
    el.dataset.locked = locked ? 'true' : 'false';
    const rem = limit ? Math.max(0, Math.min(1, 1 - used / limit)) : 0;
    const len = level === 'over' ? 1000 : Math.round(rem * 1000);
    arc.style.strokeDashoffset = String(1000 - len);
    arc.style.opacity = limit && len > 2 ? '1' : '0';
    if (first) {
      arc.style.transition = 'none';
      void arc.getBoundingClientRect();
      arc.style.transition = '';
      first = false;
    }
    if (mini) {
      const t = el.querySelector('.gr-mini-text');
      t.textContent = !limit ? '-' : level === 'over' ? '' : `${Math.min(100, Math.round((used / limit) * 100))}%`;
      return level;
    }
    const big = el.querySelector('.gr-big');
    const sub = el.querySelector('.gr-sub');
    if (!limit) {
      big.textContent = 'No limit';
      sub.textContent = 'Set a daily goal';
    } else if (level === 'over') {
      big.textContent = formatDuration(used - limit);
      sub.textContent = `over your ${formatDuration(limit)}`;
    } else {
      big.textContent = formatDuration(limit - used);
      sub.textContent = `left of ${formatDuration(limit)}`;
    }
    setBtn.textContent = limit ? 'Change' : 'Set limit';
    setBtn.hidden = locked;
    return level;
  }

  return { el, update, setButton: setBtn };
}

// ---------- the picker ----------

const G = 24;               // half the gap at the top, in degrees
const SPAN = 360 - 2 * G;
const C = 150;              // centre of the 300×300 viewBox
const R = 110;              // slider radius
const MAX = { h: 23, m: 59 };

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
const clamp01 = t => Math.max(0, Math.min(1, t));
const tFor = (unit, v) => v / MAX[unit];
const vFor = (unit, t) => Math.round(clamp01(t) * MAX[unit]);

// dots sit on the track itself (the fill covers them), numbers just outside it
function ticksSvg(unit) {
  const every = unit === 'h' ? 1 : 5;
  const label = unit === 'h' ? 3 : 15;
  let out = `<g class="pk-ticks" data-unit="${unit}">`;
  for (let v = 0; v <= MAX[unit]; v += every) {
    const deg = G + tFor(unit, v) * SPAN;
    const [x, y] = polar(deg);
    const major = v % label === 0;
    const t = tFor(unit, v).toFixed(4);
    out += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${major ? 2.3 : 1.5}" class="${major ? 'maj' : ''}" data-t="${t}"/>`;
    if (major) {
      const [lx, ly] = polar(deg, R + 23);
      out += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" dy="0.35em" data-t="${t}">${v}</text>`;
    }
  }
  return `${out}</g>`;
}

const pad2 = n => String(n).padStart(2, '0');

// The circle's surface flying between a small rect (the button or the ring) and
// its full size. Only transform and opacity move, so the compositor runs it and
// the main thread stays free for the animations inside the circle.
// It goes inside the picker's layer, just under the circle: in the same stacking
// context, so the circle's content is drawn on top of it, never hidden beneath it.
function flyShell(layer, full, small, { grow, background, duration, easing, fade = false }) {
  const shell = document.createElement('div');
  shell.className = 'morph-shell pk-shell';
  Object.assign(shell.style, {
    left: `${full.left}px`, top: `${full.top}px`, width: `${full.width}px`, height: `${full.height}px`,
    borderRadius: '50%', background, zIndex: '4050', willChange: 'transform, opacity', boxShadow: 'var(--pk-shadow)',
  });
  layer.insertBefore(shell, layer.querySelector('.pk'));
  const dx = small.left + small.width / 2 - (full.left + full.width / 2);
  const dy = small.top + small.height / 2 - (full.top + full.height / 2);
  const tiny = { transform: `translate(${dx}px, ${dy}px) scale(${small.width / full.width}, ${small.height / full.height})`, opacity: fade ? 0 : 1 };
  const whole = { transform: 'none', opacity: 1 };
  const anim = shell.animate(grow ? [tiny, whole] : [whole, tiny], { duration, easing, fill: 'forwards' });
  return {
    shell,
    finished: anim.finished.then(() => shell, () => shell),
    cancel: () => { anim.cancel(); shell.remove(); },
  };
}

// Past 8 hours a day, the hint has opinions. A new one each time the hours
// change, never the same one twice in a row, all of them before any repeats.
const SASS_FROM_MS = 8 * 3600000;
const SASS = [
  'Why do you even bother setting a limit at that point?',
  'Bold of you to call that a limit.',
  'That’s not a limit, that’s a full-time job.',
  'At this point just pick 23 and be honest.',
  'Ambitious. In the wrong direction.',
  'Sleep is also a hobby, you know.',
  'Your eyes would like a word.',
  'Somewhere, a houseplant is waiting for water.',
  'The limit will be so proud when you never reach it.',
  'Ah yes, the “technically a limit” plan.',
  'That’s a lot of “just one more video”.',
  'Outside called. It says it misses you.',
];
let sassBag = [];
let lastSass = '';
// "pick 23" makes no sense when 23 is already picked, so it waits for another hour
const PICK_23 = SASS.find(t => t.includes('pick 23'));
function nextSass(hours) {
  const ok = t => !(t === PICK_23 && hours === 23);
  let i = sassBag.findLastIndex(ok);
  if (i < 0) {
    sassBag = [...SASS.filter(t => t !== lastSass && !sassBag.includes(t)).sort(() => Math.random() - 0.5), ...sassBag];
    i = sassBag.findLastIndex(ok);
  }
  lastSass = sassBag.splice(i, 1)[0];
  return lastSass;
}

// How fast the knob catches up (a critically damped spring: it glides, never overshoots)
const FOLLOW = 38;   // while dragging
const HOP = 30;      // from dot to dot while dragging
const SETTLE = 24;   // onto the picked value after a drag, typing or arrow keys
const GLIDE = 11;    // switching between hours and minutes

// Dragging snaps to the white dots: every hour, every 5 minutes. Creeping slowly along
// the ring is fine-tuning, and the minutes then go one at a time, until the next quick
// sweep. Speeds are in minutes a second, smoothed over about a tenth of a second.
const DOT = { h: 1, m: 5 };
const CREEP = [0.4, 5];   // slower is holding still, faster is moving on
const CREEP_FOR = 0.35;   // seconds of creeping before the dots let go
const FAST = 18;          // this fast, the dots take over again

/**
 * Opens the circular limit picker.
 * fromEl: the button it grows out of (and shrinks back into).
 * center: {x, y} where the circle should sit (clamped to the window).
 * Resolves with 'commit' | 'remove' | 'cancel'.
 */
export function openPicker({ fromEl, returnTo = null, center, size = 320, initialMs = 0, canRemove = false, onCommit, onRemove, onClosing = null, focusBack = null }) {
  return new Promise(resolve => {
    const vw = innerWidth;
    const vh = innerHeight;
    const S = Math.min(size, vw - 24, vh - 24);
    let cx = center ? center.x : vw / 2;
    let cy = center ? center.y : vh / 2;
    cx = Math.max(12 + S / 2, Math.min(vw - 12 - S / 2, cx));
    cy = Math.max(12 + S / 2, Math.min(vh - 12 - S / 2, cy));

    const initH = Math.min(23, Math.floor(initialMs / 3600000));
    const initM = Math.min(59, Math.round((initialMs % 3600000) / 60000));
    const st = { h: initH, m: initM, unit: 'h', first: null, autoSwitched: false, dragging: false, closing: false, confirmOpen: false, dragT: 0, pin: null, fine: false, speed: 0, creep: 0, lastT: 0, lastAt: 0 };

    const layer = document.createElement('div');
    layer.className = 'pk-layer';
    layer.innerHTML = `
      <div class="pk-scrim"></div>
      <div class="pk" role="dialog" aria-modal="true" aria-label="Set your daily limit" style="left:${cx - S / 2}px;top:${cy - S / 2}px;width:${S}px;height:${S}px;--S:${S}px">
        <svg class="pk-svg" viewBox="0 0 300 300">
          <path class="pk-track" d="${arcD(G, 360 - G)}" pathLength="1"/>
          ${ticksSvg('h')}${ticksSvg('m')}
          <path class="pk-fill" d=""/>
          <path class="pk-hit" d="${arcD(G - 6, 360 - G + 6)}"/>
          <g class="pk-knob"><circle class="pk-knob-halo" r="17"/><circle class="pk-knob-dot" r="11"/></g>
        </svg>
        <button class="pk-check" type="button" aria-label="Set this limit">${CHECK}</button>
        <div class="pk-center">
          <div class="pk-fields">
            <label class="pk-field on" data-unit="h"><input class="num" inputmode="numeric" maxlength="2" aria-label="Hours" autocomplete="off"><span class="pk-u">h</span></label>
            <label class="pk-field" data-unit="m"><input class="num" inputmode="numeric" maxlength="2" aria-label="Minutes" autocomplete="off"><span class="pk-u">m</span></label>
          </div>
          <p class="pk-hint" aria-live="polite"><span class="pk-hint-text">Slide or type the hours</span></p>
          <div class="pk-foot">
            <button class="pk-link pk-cancel" type="button">Cancel</button>
            ${canRemove ? '<button class="pk-link pk-remove" type="button">Remove limit</button>' : ''}
          </div>
        </div>
      </div>
      <div class="pk-confirm" role="alertdialog" aria-label="Commit to this limit" hidden>
        <p class="pc-title">Are you committed?</p>
        <p class="pc-sub">It stays every day after this. Unlocking it is hard on purpose.</p>
        <p class="pc-limit num"></p>
        <div class="pc-actions">
          <button class="btn btn-secondary btn-sm pc-no" type="button">Not yet</button>
          <button class="btn btn-primary btn-sm pc-yes" type="button">${CHECK}<span>Commit</span></button>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const pk = layer.querySelector('.pk');
    const svg = layer.querySelector('.pk-svg');
    const fill = layer.querySelector('.pk-fill');
    const knob = layer.querySelector('.pk-knob');
    const dot = layer.querySelector('.pk-knob-dot');
    const hit = layer.querySelector('.pk-hit');
    const check = layer.querySelector('.pk-check');
    const checkPath = check.querySelector('path');
    const hint = layer.querySelector('.pk-hint-text');
    const hintBox = layer.querySelector('.pk-hint');
    const fields = { h: layer.querySelector('.pk-field[data-unit="h"]'), m: layer.querySelector('.pk-field[data-unit="m"]') };
    const inputs = { h: fields.h.querySelector('input'), m: fields.m.querySelector('input') };
    const confirmEl = layer.querySelector('.pk-confirm');
    const confirm = new MorphPopover(confirmEl, { radius: 18, z: 4200 });
    confirmEl.style.zIndex = '4201';

    function drawAt(t) {
      const deg = G + clamp01(t) * SPAN;
      fill.setAttribute('d', arcD(G, deg));
      const [x, y] = polar(deg);
      knob.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    }

    // ---- the knob glides on a spring towards wherever it's aimed ----
    const knobState = { x: tFor('h', st.h), v: 0, target: tFor('h', st.h), w: SETTLE, raf: 0, last: 0 };
    function knobStep(now) {
      const k = knobState;
      const dt = Math.min(0.05, Math.max(0, (now - k.last) / 1000));
      k.last = now;
      const x0 = k.x - k.target;
      const e = Math.exp(-k.w * dt);
      const b = (k.v + k.w * x0) * dt;
      const x1 = (x0 + b) * e;
      k.v = (k.v - k.w * b) * e;
      k.x = k.target + x1;
      if (Math.abs(x1) < 0.0003 && Math.abs(k.v) < 0.003) {
        k.x = k.target;
        k.v = 0;
        k.raf = 0;
      } else {
        k.raf = requestAnimationFrame(knobStep);
      }
      drawAt(k.x);
    }
    function aim(t, w = SETTLE) {
      const k = knobState;
      k.target = clamp01(t);
      k.w = w;
      if (reducedMotion()) {
        k.x = k.target;
        k.v = 0;
        drawAt(k.x);
        return;
      }
      if (!k.raf) {
        k.last = performance.now();
        k.raf = requestAnimationFrame(knobStep);
      }
    }
    const stopKnob = () => { cancelAnimationFrame(knobState.raf); knobState.raf = 0; };

    const totalMs = () => (st.h * 60 + st.m) * 60000;

    // ✓: enabled once there's a limit; becoming ready pops it and draws the tick
    let ready = null;
    function setReady(ok) {
      if (ok === ready) return;
      const was = ready;
      ready = ok;
      check.disabled = !ok;
      check.classList.toggle('ready', ok);
      if (was === null || reducedMotion() || !layer.classList.contains('open')) return;
      for (const a of check.getAnimations()) if (a.id === 'ck') a.cancel();
      const a = ok
        ? check.animate([{ transform: 'scale(0.72)' }, { transform: 'none' }], { duration: 480, easing: POP })
        : check.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 320, easing: EASE_OUT });
      a.id = 'ck';
      if (ok) checkPath.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 360, delay: 70, easing: EASE_OUT, fill: 'backwards' });
    }

    // the hint only changes (and animates) when what it says changes: not on every notch
    let sassFor = -1;
    let sassText = '';
    function refresh({ fromTyping = false } = {}) {
      if (!fromTyping || document.activeElement !== inputs.h) inputs.h.value = pad2(st.h);
      if (!fromTyping || document.activeElement !== inputs.m) inputs.m.value = pad2(st.m);
      const total = totalMs();
      const ok = total >= GOAL_MIN_MS;
      setReady(ok);
      const sass = total > SASS_FROM_MS;
      let text;
      if (total === 0) text = st.unit === 'h' ? 'Slide or type the hours' : 'Slide or type the minutes';
      else if (!ok) text = `At least ${formatDuration(GOAL_MIN_MS)}`;
      else if (sass) {
        if (sassFor !== st.h) { sassFor = st.h; sassText = nextSass(st.h); }
        text = sassText;
      } else text = 'a day';
      if (!sass) sassFor = -1;
      hintBox.classList.toggle('sass', sass);
      if (hint.textContent !== text) {
        hint.textContent = text;
        if (!reducedMotion()) hint.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_OUT });
      }
    }

    // held on a white dot, the knob grows a little (slowly) and stays grown until it leaves the dot
    const setOnDot = () => knob.classList.toggle('on-dot', st.dragging && st[st.unit] % DOT[st.unit] === 0);

    function setValue(unit, v, { fromTyping = false, glide = true } = {}) {
      const nv = Math.max(0, Math.min(MAX[unit], v | 0));
      st[unit] = nv;
      if (unit === st.unit && glide) aim(tFor(unit, nv));
      setOnDot();
      refresh({ fromTyping });
    }

    function switchUnit(unit, { auto = false, focus = true } = {}) {
      if (st.unit === unit) return;
      st.unit = unit;
      pk.dataset.unit = unit;
      fields.h.classList.toggle('on', unit === 'h');
      fields.m.classList.toggle('on', unit === 'm');
      aim(tFor(unit, st[unit]), GLIDE);
      setOnDot();
      if (auto && !reducedMotion()) {
        fields.m.animate([{ transform: 'scale(0.86)' }, { transform: 'none' }], { duration: 550, easing: POP });
      }
      refresh();
      if (focus) {
        inputs[unit].focus({ preventScroll: true });
        inputs[unit].select();
      }
    }

    // ---- dragging around the ring ----
    function angleFrom(e) {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 300 - C;
      const y = ((e.clientY - r.top) / r.height) * 300 - C;
      let deg = (Math.atan2(x, -y) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      return deg;
    }
    // inside the gap the knob rests on the nearer end; dragging past an end
    // through the gap keeps it pinned there until the pointer comes back
    function tFromPointer(e, jump) {
      const deg = angleFrom(e);
      let t = deg < G ? 0 : deg > 360 - G ? 1 : (deg - G) / SPAN;
      if (jump) st.pin = null;
      else if (st.pin != null) {
        if (Math.abs(t - st.pin) < 0.25) st.pin = null;
        else t = st.pin;
      } else if (Math.abs(t - st.dragT) > 0.5) {
        st.pin = st.dragT < 0.5 ? 0 : 1;
        t = st.pin;
      }
      st.dragT = t;
      return t;
    }
    // the nearest dot (the last one, not the ring's end, past it)
    const dotFor = (unit, t) => Math.min(MAX[unit] - (MAX[unit] % DOT[unit]), Math.round((clamp01(t) * MAX[unit]) / DOT[unit]) * DOT[unit]);
    // creeping slowly turns on fine-tuning; a quick sweep turns it off
    function pace(t, now, jump) {
      const dt = (now - st.lastAt) / 1000;
      if (jump) {
        // grabbing a knob that's between dots carries on fine-tuning it
        st.fine = st.m % DOT.m !== 0 && Math.abs(t - tFor('m', st.m)) * MAX.m < 2.5;
        st.creep = 0;
      }
      if (jump || dt > 0.25) st.speed = 0; // a new grab, or the pointer was resting
      else if (dt > 0) {
        const v = (Math.abs(t - st.lastT) * MAX.m) / dt;
        st.speed += (v - st.speed) * (1 - Math.exp(-dt / 0.12));
        if (st.speed > FAST) { st.fine = false; st.creep = 0; }
        else if (st.speed > CREEP[1]) st.creep = 0;
        else if (st.speed > CREEP[0] && (st.creep += dt) >= CREEP_FOR) st.fine = true;
      } else return; // same instant: measure the next one from the earlier sample
      st.lastT = t;
      st.lastAt = now;
    }
    function follow(e, jump = false) {
      const t = tFromPointer(e, jump);
      const unit = st.unit;
      if (unit === 'm') pace(t, e.timeStamp, jump);
      if (unit === 'm' && st.fine) {
        aim(t, FOLLOW);
        setValue(unit, vFor(unit, t), { glide: false });
      } else {
        const v = dotFor(unit, t);
        aim(tFor(unit, v), HOP);
        setValue(unit, v, { glide: false });
      }
    }
    function onDown(e) {
      if (e.button !== 0 || st.confirmOpen || st.closing) return;
      e.preventDefault();
      if (!st.first) st.first = st.unit;
      clearTimeout(pauseTimer);
      st.dragging = true;
      pk.classList.add('dragging');
      svg.setPointerCapture(e.pointerId);
      follow(e, true);
    }
    function onMove(e) {
      if (!st.dragging) return;
      // every pointer sample this frame, so fast drags stay smooth on high refresh screens
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      follow(list.length ? list[list.length - 1] : e);
    }
    function onUp(e) {
      if (!st.dragging) return;
      st.dragging = false;
      pk.classList.remove('dragging');
      setOnDot();
      try { svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      aim(tFor(st.unit, st[st.unit]), SETTLE);
      if (st.unit === 'h' && st.first === 'h' && !st.autoSwitched) {
        st.autoSwitched = true;
        setTimeout(() => { if (!st.closing && !st.dragging) switchUnit('m', { auto: true }); }, 260);
      }
    }
    let pauseTimer = 0;
    hit.addEventListener('pointerdown', onDown);
    knob.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);

    // ---- typing ----
    for (const unit of ['h', 'm']) {
      const input = inputs[unit];
      input.addEventListener('focus', () => {
        if (!st.first) st.first = unit;
        switchUnit(unit, { focus: false });
        input.select();
      });
      input.addEventListener('input', () => {
        clearTimeout(pauseTimer);
        const digits = input.value.replace(/\D/g, '').slice(0, 2);
        if (input.value !== digits) input.value = digits;
        if (!digits) { setValue(unit, 0, { fromTyping: true }); return; }
        const v = parseInt(digits, 10);
        setValue(unit, Math.min(MAX[unit], v), { fromTyping: true });
        if (unit !== 'h' || st.first !== 'h' || st.autoSwitched) return;
        // "3"–"9" or two digits can only mean hours; a lone "0"–"2" might be the
        // start of 10–23, so wait a moment for a second digit before moving on
        const toMinutes = () => {
          if (st.closing || st.autoSwitched || st.unit !== 'h' || st.dragging) return;
          st.autoSwitched = true;
          switchUnit('m', { auto: true });
        };
        if (digits.length === 2 || v >= 3) toMinutes();
        else pauseTimer = setTimeout(toMinutes, 1100);
      });
      input.addEventListener('blur', () => { input.value = pad2(st[unit]); });
      input.addEventListener('keydown', e => {
        // minutes go one at a time (Shift: five)
        const step = unit === 'm' && e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setValue(unit, Math.min(MAX[unit], st[unit] + step)); input.select(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setValue(unit, st[unit] - step); input.select(); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (unit === 'h') { st.autoSwitched = true; switchUnit('m'); }
          else if (!check.disabled) check.focus();
        }
      });
    }

    // ---- the "Are you committed?" card: as it grows out of the ✓, the title,
    // the line under it, the time and the two buttons arrive one after another
    // (and the tick on Commit draws itself). Closing sends them off in reverse,
    // then the card shrinks back into the ✓.
    const cq = sel => confirmEl.querySelector(sel);
    const lift = (px, sc) => [{ opacity: 0, transform: `translateY(${px}px) scale(${sc})` }, { opacity: 1, transform: 'none' }];
    const confirmParts = () => [
      { el: cq('.pc-title'), kf: lift(10, 0.96), duration: 480, delay: 0, easing: EASE_OUT },
      { el: cq('.pc-sub'), kf: lift(8, 1), duration: 460, delay: 60, easing: EASE_OUT },
      { el: cq('.pc-limit'), kf: [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], duration: 520, delay: 120, easing: POP },
      { el: cq('.pc-no'), kf: lift(10, 0.94), duration: 520, delay: 190, easing: EASE_OUT },
      { el: cq('.pc-yes'), kf: lift(10, 0.94), duration: 520, delay: 240, easing: EASE_OUT },
      { el: cq('.pc-yes path'), kf: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], duration: 360, delay: 420, easing: EASE_OUT },
    ].filter(p => p.el);
    let confirmAnims = [];
    function confirmIn() {
      const parts = confirmParts();
      for (const p of parts) p.el.getAnimations().forEach(a => a.cancel());
      confirmAnims = [];
      if (reducedMotion()) return;
      // set up paused on the first frame, started together once that frame is drawn
      for (const p of parts) {
        const a = p.el.animate(p.kf, { duration: p.duration, delay: 130 + p.delay, easing: p.easing, fill: 'backwards' });
        a.pause();
        confirmAnims.push({ ...p, a });
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!st.confirmOpen) return;
        const t = document.timeline.currentTime;
        for (const c of confirmAnims) if (c.a.playState === 'paused') c.a.startTime = t;
      }));
    }
    function confirmOut() {
      if (reducedMotion() || !confirmAnims.length) return Promise.resolve();
      const last = Math.max(...confirmAnims.map(c => c.delay));
      const waits = confirmAnims.map(c => {
        if (c.a.playState === 'paused') return null;
        if (c.a.playState === 'running') { c.a.updatePlaybackRate(-2.5); return c.a.finished.catch(() => {}); }
        const out = c.el.animate([...c.kf].reverse(), { duration: c.duration * 0.42, delay: (last - c.delay) * 0.35, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });
        return out.finished.catch(() => {});
      });
      return Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 450))]);
    }

    // ---- commit ----
    let confirmToken = 0;
    check.addEventListener('click', () => {
      if (check.disabled || st.confirmOpen || st.closing) return;
      st.confirmOpen = true;
      confirmToken++;
      layer.classList.add('confirming');
      layer.querySelector('.pc-limit').textContent = `${formatDuration(totalMs())} a day`;
      confirm.open(check, { fromRadius: 'circle' }).then(() => {
        if (st.confirmOpen) layer.querySelector('.pc-yes').focus({ preventScroll: true });
      });
      confirmIn();
    });
    function closeConfirm() {
      if (!st.confirmOpen) return Promise.resolve();
      st.confirmOpen = false;
      layer.classList.remove('confirming');
      const mine = confirmToken;
      return confirmOut().then(() => {
        if (mine !== confirmToken || st.confirmOpen) return; // opened again meanwhile
        return confirm.close().then(() => check.focus({ preventScroll: true }));
      });
    }
    layer.querySelector('.pc-no').addEventListener('click', closeConfirm);
    layer.querySelector('.pc-yes').addEventListener('click', async e => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await onCommit(totalMs());
      } catch (err) {
        btn.disabled = false;
        layer.querySelector('.pc-sub').textContent = err && err.message === 'locked' ? 'A limit is already locked in' : 'Couldn’t save, try again';
        return;
      }
      st.confirmOpen = false;
      await confirm.close({ instant: true });
      close('commit');
    });

    layer.querySelector('.pk-cancel').addEventListener('click', () => close('cancel'));
    const removeBtn = layer.querySelector('.pk-remove');
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      try { await onRemove(); } catch { return; }
      close('remove');
    });
    layer.querySelector('.pk-scrim').addEventListener('pointerdown', () => {
      if (st.confirmOpen) closeConfirm();
      else close('cancel');
    });

    function focusables() {
      const scope = st.confirmOpen ? confirmEl : pk;
      return [...scope.querySelectorAll('button, input')].filter(el => !el.disabled && el.offsetParent !== null);
    }
    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (st.confirmOpen) closeConfirm();
        else close('cancel');
      } else if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const i = list.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      }
    });

    // ---- choreography: the ring draws itself round from the ✓, its dots and
    // numbers pop in as the sweep passes them, and meanwhile the knob, the ✓, the
    // digits and the words arrive in the middle. Closing plays it all backwards.
    const SWEEP = 520;                                   // the ring drawing itself, ms
    const EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';   // for leaving
    const reach = t => 40 + t * SWEEP * 0.9;             // when the sweep passes t
    const rise = px => [{ opacity: 0, transform: `translateY(${px}px)` }, { opacity: 1, transform: 'none' }];
    let parts = null;
    function buildParts() {
      const list = [];
      const add = (el, kf, duration, delay, easing = EASE_OUT, pseudoElement = null) => { if (el) list.push({ el, kf, duration, delay, easing, pseudoElement }); };
      add(layer.querySelector('.pk-track'), [
        { strokeDashoffset: 1, opacity: 0 },
        { strokeDashoffset: 0.88, opacity: 1, offset: 0.12 },
        { strokeDashoffset: 0, opacity: 1 },
      ], SWEEP + 80, 0, 'cubic-bezier(0.45, 0, 0.2, 1)');
      const g = layer.querySelector(`.pk-ticks[data-unit="${st.unit}"]`);
      for (const c of g.querySelectorAll('circle')) {
        add(c, [{ transform: 'scale(0)' }, { transform: 'scale(1.6)', offset: 0.5 }, { transform: 'none' }], 420, reach(+c.dataset.t));
      }
      for (const tx of g.querySelectorAll('text')) {
        // the numbers drift outwards into place
        const x = +tx.getAttribute('x') - C;
        const y = +tx.getAttribute('y') - C;
        const k = 10 / Math.hypot(x, y);
        add(tx, [{ opacity: 0, transform: `translate(${(-x * k).toFixed(2)}px, ${(-y * k).toFixed(2)}px) scale(0.5)` }, { opacity: 1, transform: 'none' }], 480, reach(+tx.dataset.t) + 110);
      }
      const kt = reach(clamp01(knobState.x));
      add(fill, [{ opacity: 0 }, { opacity: 1 }], 320, kt + 40);
      add(layer.querySelector('.pk-knob-halo'), [{ transform: 'scale(0)' }, { transform: 'none' }], 560, kt + 90, POP);
      add(dot, [{ transform: 'scale(0)' }, { transform: 'none' }], 500, kt + 50, POP);
      add(check, [{ transform: 'scale(0) rotate(-100deg)' }, { transform: 'none' }], 600, 170, POP);
      add(checkPath, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], 400, 430);
      const digits = [{ opacity: 0, transform: 'translateY(45%) scale(0.8)' }, { opacity: 1, transform: 'none' }];
      add(inputs.h, digits, 600, 110);
      add(fields.h.querySelector('.pk-u'), rise(6), 460, 200);
      add(inputs.m, digits, 600, 190);
      add(fields.m.querySelector('.pk-u'), rise(6), 460, 280);
      add(fields[st.unit], [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 560, 340, EASE_OUT, '::after');
      add(hintBox, rise(10), 520, 330);
      add(layer.querySelector('.pk-foot'), rise(10), 520, 410);
      return list;
    }
    // Everything is set up paused (showing its first frame), and the clocks only
    // start two frames later, once that first frame has really been drawn. So no
    // part loses time to the setup and they all begin together, from the start.
    function playIn() {
      if (reducedMotion()) return;
      parts = buildParts();
      for (const p of parts) {
        p.anim = p.el.animate(p.kf, { duration: p.duration, delay: p.delay, easing: p.easing, fill: 'backwards', pseudoElement: p.pseudoElement });
        p.anim.pause();
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (st.closing) return;
        const t = document.timeline.currentTime;
        for (const p of parts) p.anim.startTime = t;
      }));
    }
    // backwards and quicker: what arrived last leaves first, the ring undraws last.
    // Anything still arriving simply turns round from where it is.
    function playOut() {
      if (reducedMotion() || !parts) return Promise.resolve();
      const last = Math.max(...parts.map(p => p.delay));
      const waits = parts.map(p => {
        let a = p.anim;
        if (a && a.playState === 'paused') return Promise.resolve(); // never started: still hidden
        if (a && a.playState === 'running') {
          a.updatePlaybackRate(-2.4);
        } else {
          const kf = p.kf.map(k => {
            const o = { ...k };
            if (o.offset != null) o.offset = 1 - o.offset;
            return o;
          }).reverse();
          a = p.el.animate(kf, { duration: p.duration * 0.45, delay: (last - p.delay) * 0.3, easing: EASE_IN, fill: 'forwards', pseudoElement: p.pseudoElement });
        }
        return a.finished.catch(() => {});
      });
      return Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 650))]);
    }

    // ---- open: grow out of the button ----
    pk.dataset.unit = 'h';
    drawAt(knobState.x);
    refresh();
    const src = fromEl && fromEl.isConnected ? fromEl.getBoundingClientRect() : null;
    const bg = getComputedStyle(pk).backgroundColor;
    layer.classList.add('opening');
    let openMorph = null;
    if (src && src.width && !reducedMotion()) {
      pk.style.opacity = '0';
      const m = flyShell(layer, pk.getBoundingClientRect(), src, { grow: true, background: bg, duration: 560, easing: POP });
      openMorph = m;
      // the content starts once the circle is ~90% grown (the shell is its surface
      // until it lands), so the ring draws inside it with no pause in between
      pk.classList.add('bare');
      let started = false;
      const start = () => {
        if (started || st.closing) return;
        started = true;
        pk.style.opacity = '';
        layer.classList.remove('opening');
        layer.classList.add('open');
        playIn();
      };
      const early = setTimeout(start, 190);
      m.finished.then(() => {
        clearTimeout(early);
        openMorph = null;
        // closed while still growing: the circle's own surface takes over from the shell
        if (st.closing) { pk.classList.remove('bare'); m.shell.remove(); return; }
        start();
        pk.classList.remove('bare');
        m.shell.remove(); // identical to the circle now (same shadow too), so a straight swap
      });
    } else {
      layer.classList.remove('opening');
      layer.classList.add('open');
      playIn();
    }
    // focus once the opening has mostly played, so it doesn't land in the middle of it
    setTimeout(() => { if (!st.closing) { inputs.h.focus({ preventScroll: true }); inputs.h.select(); } }, reducedMotion() ? 0 : 900);

    // ---- close: shrink back into the button ----
    function close(result) {
      if (st.closing) return;
      st.closing = true;
      clearTimeout(pauseTimer);
      stopKnob();
      const finish = () => {
        layer.remove();
        const to = focusBack ? focusBack() : fromEl;
        if (to && to.isConnected) to.focus({ preventScroll: true });
        resolve(result);
      };
      layer.classList.add('closing');
      if (onClosing) onClosing(result);
      // shrink back into the ring when there is one, otherwise into the button
      const back = returnTo && returnTo.isConnected ? returnTo : fromEl && fromEl.isConnected && !fromEl.hidden ? fromEl : null;
      const to = back ? back.getBoundingClientRect() : null;
      if (reducedMotion()) { finish(); return; }
      // the inside leaves first (the opening, backwards), then the circle shrinks
      const shrink = () => {
        if (openMorph) { openMorph.cancel(); openMorph = null; }
        const from = pk.getBoundingClientRect();
        pk.classList.remove('bare');
        const bgNow = getComputedStyle(pk).backgroundColor;
        pk.style.opacity = '0';
        if (to && to.width) {
          flyShell(layer, from, to, { grow: false, background: bgNow, fade: true, duration: 400, easing: EASE_IN_OUT })
            .finished.then(shell => { shell.remove(); finish(); });
        } else {
          const small = { left: from.left + from.width * 0.3, top: from.top + from.height * 0.3, width: from.width * 0.4, height: from.height * 0.4 };
          flyShell(layer, from, small, { grow: false, background: bgNow, fade: true, duration: 300, easing: EASE_OUT })
            .finished.then(shell => { shell.remove(); finish(); });
        }
      };
      if (!parts) shrink(); // nothing inside has arrived yet
      else playOut().then(shrink);
    }
  });
}
