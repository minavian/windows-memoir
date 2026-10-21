// An animated pointer. One arrow in every state: over something clickable it
// tilts and shrinks a little; pressing squeezes it. Its colours never flip.
// Text fields keep the system's I-beam. Can be turned off in Settings.
//
// It sits exactly where the mouse is (Smooth cursor, off by default, lets it glide
// a touch behind instead). A page-drawn arrow can only move when the page has a
// moment, so whenever the page is busy (opening, or a slow device catching up) the
// system draws the same arrow instead (theme.css --cursor), which never lags; the
// animated one takes over again on the next move once the page is free.

const KEY = 'bst-cursor';
const SMOOTH_KEY = 'bst-cursor-smooth';
const ARROW = 'M6.65 5.33L19.79 14.35Q21.60 15.60 19.46 16.09L16.02 16.88Q12.90 17.60 10.62 19.85L7.77 22.66Q6.20 24.20 6.07 22.00L5.12 6.20Q5.00 4.20 6.65 5.33Z';
const INTERACTIVE = [
  'a[href]', 'button', 'summary', 'select', 'label.switch', '[role="button"]', '[role="menuitem"]',
  '[role="menuitemradio"]', '[role="radio"]', '.col:not(.future)', '.cell:not(.future)', '.donut-seg',
  '.ring-seg', '.pk-hit', '.pk-knob', '.sb i', '.tr-svg', '.site.has-pages', '.row.has-pages', '.page-row[data-url]',
].join(',');
const TEXT = 'input[type="text"], input[type="search"], input:not([type]), input[inputmode], textarea';

export function cursorEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
// Performance mode (theme-boot.js) puts the system's cursor in its place, whatever the choice here
const performanceMode = () => !!window.memoirPerf?.on();
const wanted = () => cursorEnabled() && !performanceMode();
// Performance mode turned on or off on this page
export function refreshCursor() { apply(wanted()); }
export function cursorSmooth() {
  try { return localStorage.getItem(SMOOTH_KEY) === 'on'; } catch { return false; }
}

let live = null;
let smooth = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let edgeGuard = false;

// The page has settled after opening (loaded, then a moment with nothing to do):
// until then the system draws the arrow.
let settled = false;
const onSettled = [];
function watchSettled() {
  const idle = () => {
    const done = () => { settled = true; onSettled.splice(0).forEach(f => f()); };
    if ('requestIdleCallback' in window) requestIdleCallback(done, { timeout: 4000 });
    else setTimeout(done, 1200);
  };
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

// edge: in the popup, a fast exit through the side isn't always reported, so a
// pointer that stops right at the edge is treated as gone (it returns on the next move)
export function initCursor({ edge = false } = {}) {
  edgeGuard = edge;
  smooth = cursorSmooth();
  watchSettled();
  apply(wanted());
  addEventListener('storage', e => {
    if (e.key === KEY || e.key === 'bst-perf') apply(wanted());
    if (e.key === SMOOTH_KEY) smooth = cursorSmooth();
  });
}

export function setCursorPref(on) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch { /* storage unavailable */ }
  apply(on && !performanceMode());
}

export function setCursorSmooth(on) {
  try {
    if (on) localStorage.setItem(SMOOTH_KEY, 'on');
    else localStorage.removeItem(SMOOTH_KEY);
  } catch { /* storage unavailable */ }
  smooth = on;
}

function apply(on) {
  document.documentElement.dataset.cursor = on ? 'on' : 'off';
  const fine = matchMedia('(pointer: fine)').matches;
  if (on && fine && !live) live = mount();
  if ((!on || !fine) && live) { live(); live = null; }
}

function stateFor(t) {
  if (!(t instanceof Element)) return 'idle';
  if (t.closest(TEXT)) return 'text';
  const hit = t.closest(INTERACTIVE);
  if (!hit || t.closest('[aria-disabled="true"]')) return 'idle';
  if (hit.disabled || hit.getAttribute('aria-disabled') === 'true' || hit.getAttribute('aria-current') === 'true' || hit.closest('[inert]')) return 'idle';
  return 'hover';
}

function mount() {
  const el = document.createElement('div');
  el.className = 'cc is-out is-native';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="cc-inner"><svg class="cc-arrow" viewBox="0 0 28 28" width="28" height="28"><path class="halo" d="${ARROW}"/><path class="body" d="${ARROW}"/></svg></span>`;
  document.body.appendChild(el);
  const html = document.documentElement;

  // Who draws the arrow: the system (the same arrow, which can't lag) or this one.
  // Ours takes over on a move, once the page has settled and the moves arrive on
  // time; it hands back the moment they start arriving late.
  let native = true;
  let lateAt = -Infinity;    // when a move last arrived late
  const LATE_MS = 40;        // a move handled this long after the mouse sent it is late
  const CALM_MS = 900;       // on time for this long: ours again
  const toNative = () => {
    if (native) return;
    native = true;
    el.classList.add('is-native');
    html.classList.remove('cc-live');
  };
  const toOwn = () => {
    if (!native) return;
    native = false;
    // it appears at full strength at once, in the same frame the system's arrow goes:
    // never a moment with a faint arrow, or none
    const inner = el.firstElementChild;
    inner.style.transitionProperty = 'transform';
    el.classList.remove('is-native', 'is-out');
    html.classList.add('cc-live');
    getComputedStyle(inner).opacity;
    inner.style.transitionProperty = '';
  };

  let mode = 'idle';
  const setMode = m => {
    if (m === mode) return;
    mode = m;
    el.classList.toggle('is-hover', m === 'hover');
    el.classList.toggle('is-text', m === 'text');
  };
  let lastX = -1;
  let lastY = -1;
  let vx = 0; // px per ms, over the last few moments of motion
  let vy = 0;
  let edgeTimer = 0;
  const trail = []; // recent [t, x, y]
  let shownX = -1;
  let shownY = -1;
  // The arrow trails the real pointer by a hair: each frame it closes most of
  // the gap, so small tremors in the mouse's reports are smoothed away while it
  // still follows exactly the same path.
  let tx = -1;
  let ty = -1;
  let raf = 0;
  let lastFrame = 0;
  const SMOOTH_MS = 22; // how quickly it catches up (time constant)
  const draw = (x, y) => {
    if (x === shownX && y === shownY) return;
    shownX = x;
    shownY = y;
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  };
  const frame = now => {
    const dt = Math.min(50, now - (lastFrame || now - 16));
    lastFrame = now;
    const k = 1 - Math.exp(-dt / SMOOTH_MS);
    let x = shownX + (tx - shownX) * k;
    let y = shownY + (ty - shownY) * k;
    if (Math.abs(tx - x) < 0.15 && Math.abs(ty - y) < 0.15) { x = tx; y = ty; }
    draw(x, y);
    raf = x === tx && y === ty ? 0 : requestAnimationFrame(frame);
    if (!raf) lastFrame = 0;
  };
  const place = (x, y, now = false) => {
    tx = x;
    ty = y;
    if (now || !smooth || native || shownX < 0 || reduced()) { cancelAnimationFrame(raf); raf = 0; lastFrame = 0; draw(x, y); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const move = e => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const x = e.clientX;
    const y = e.clientY;
    // pointerover repeats the last position; that's not a new step
    if (x === lastX && y === lastY) return;
    const t = e.timeStamp || performance.now();
    // Speed is measured across the last ~40 ms, not between two raw reports a
    // millisecond apart — those are noisy and made the arrow quiver.
    if (trail.length && t - trail[trail.length - 1][0] > 80) trail.length = 0;
    trail.push([t, x, y]);
    while (trail.length > 2 && t - trail[0][0] > 40) trail.shift();
    const [t0, x0, y0] = trail[0];
    const span = t - t0;
    if (span >= 8) {
      vx = (x - x0) / span;
      vy = (y - y0) / span;
    } else if (trail.length === 1) {
      // first report after a pause: count it as one frame's worth of motion
      vx = lastX < 0 ? 0 : (x - lastX) / 16;
      vy = lastY < 0 ? 0 : (y - lastY) / 16;
    }
    lastX = x;
    lastY = y;
    // late (the page is busy): the system's arrow, which keeps up; on time again for a
    // while (and the page has settled): ours, starting right under the pointer
    const now = performance.now();
    if (e.timeStamp && now - e.timeStamp > LATE_MS) { lateAt = now; toNative(); }
    else if (native && settled && now - lateAt > CALM_MS) { place(x, y, true); toOwn(); }
    // coming back from outside: appear right under the pointer
    place(x, y, el.classList.contains('is-out'));
    el.classList.remove('is-out');
    if (edgeGuard) {
      // A pointer heading out fast enough that it would be outside by the next
      // frame, then going quiet, has left. One resting near the edge hasn't.
      clearTimeout(edgeTimer);
      const nx = x + vx * 22;
      const ny = y + vy * 22;
      const heading = nx < 0 || ny < 0 || nx > innerWidth || ny > innerHeight;
      const hugging = Math.min(x, y, innerWidth - x, innerHeight - y) < 3;
      if (heading || hugging) edgeTimer = setTimeout(() => el.classList.add('is-out'), 140);
    }
  };
  const over = e => {
    move(e);
    setMode(stateFor(e.target));
  };
  const out = e => { if (!e.relatedTarget) el.classList.add('is-out'); };
  const leave = () => el.classList.add('is-out');
  // Pressing squeezes the arrow itself (see .cc.is-down .cc-arrow). The hover
  // tilt lives on the wrapper, so a press looks the same over a button or over
  // nothing: it simply adds to whatever pose the arrow is already in.
  const down = e => { if (e.button === 0) el.classList.add('is-down'); };
  const up = () => el.classList.remove('is-down');
  const hide = () => { el.classList.add('is-out'); el.classList.remove('is-down'); };
  // a button can turn disabled (or a view can change) under a still pointer
  const recheck = () => {
    if (native || el.classList.contains('is-out') || lastX < 0) return;
    const t = document.elementFromPoint(lastX, lastY);
    if (t && !t.closest('.cc')) setMode(stateFor(t));
  };
  // the recheck only runs while the page can be seen
  let timer = 0;
  const watch = () => { clearInterval(timer); timer = document.hidden ? 0 : setInterval(recheck, 400); };
  const visibility = () => { hide(); watch(); };
  watch();

  // pointerrawupdate arrives as soon as the mouse reports, not once per frame
  const MOVE = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  document.addEventListener(MOVE, move, { passive: true });
  document.addEventListener('pointerover', over, { passive: true });
  document.addEventListener('pointerout', out, { passive: true });
  document.addEventListener('pointerdown', down, { passive: true });
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointercancel', up, { passive: true });
  document.documentElement.addEventListener('mouseleave', leave);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', hide);

  return () => {
    clearInterval(timer);
    clearTimeout(edgeTimer);
    document.documentElement.removeEventListener('mouseleave', leave);
    document.removeEventListener('visibilitychange', visibility);
    cancelAnimationFrame(raf);
    document.removeEventListener(MOVE, move);
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointerout', out);
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', hide);
    document.documentElement.classList.remove('cc-live');
    el.remove();
  };
}
