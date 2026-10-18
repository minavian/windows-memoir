// One long, soft glide for every scrollable surface, independent of refresh rate.
const SMOOTH_MS = 145;
const controllers = new WeakMap();
const active = new Set();
let raf = 0;
let initialized = false;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const limit = (el, axis) => Math.max(0, axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth);
const position = (el, axis) => axis === 'y' ? el.scrollTop : el.scrollLeft;
const clamp = (el, axis, value) => Math.max(0, Math.min(limit(el, axis), value));

function controller(el) {
  let c = controllers.get(el);
  if (!c) {
    c = { el, x: el.scrollLeft, y: el.scrollTop, ax: el.scrollLeft, ay: el.scrollTop, tx: el.scrollLeft, ty: el.scrollTop, time: 0 };
    controllers.set(el, c);
  }
  return c;
}

function destination(el, axis) {
  const c = controllers.get(el);
  return c && active.has(c) ? clamp(el, axis, axis === 'y' ? c.ty : c.tx) : position(el, axis);
}

function write(c, x, y) {
  // CSS handles native navigation; our animation must write each frame instantly.
  c.el.scrollTo({ left: x, top: y, behavior: 'instant' });
  // Keep subpixel progress even when the browser rounds scroll offsets to pixels.
  c.x = x;
  c.y = y;
  c.ax = c.el.scrollLeft;
  c.ay = c.el.scrollTop;
}

export function stopSmoothScroll(el) {
  const c = controllers.get(el);
  if (c) active.delete(c);
  if (!active.size) { cancelAnimationFrame(raf); raf = 0; }
}

export function smoothScrollTo(el, { left = destination(el, 'x'), top = destination(el, 'y') }, { instant = false } = {}) {
  const c = controller(el);
  c.tx = clamp(el, 'x', left);
  c.ty = clamp(el, 'y', top);
  if (instant || reduced() || document.hidden) {
    stopSmoothScroll(el);
    write(c, c.tx, c.ty);
    return;
  }
  if (!active.has(c)) {
    c.x = c.ax = el.scrollLeft;
    c.y = c.ay = el.scrollTop;
    c.time = performance.now();
    active.add(c);
  }
  if (!raf) raf = requestAnimationFrame(step);
}

function step(now) {
  raf = 0;
  const calm = reduced();
  for (const c of active) {
    // A native drag, touch gesture, focus move or programmatic reset takes over.
    if (!c.el.isConnected || document.hidden || Math.abs(c.el.scrollLeft - c.ax) > 1 || Math.abs(c.el.scrollTop - c.ay) > 1) {
      active.delete(c);
      continue;
    }
    c.tx = clamp(c.el, 'x', c.tx);
    c.ty = clamp(c.el, 'y', c.ty);
    const dt = Math.max(0, Math.min(64, now - c.time));
    c.time = now;
    const k = 1 - Math.exp(-dt / SMOOTH_MS);
    const x = c.x + (c.tx - c.x) * k;
    const y = c.y + (c.ty - c.y) * k;
    if (calm || (Math.abs(c.tx - x) < 0.5 && Math.abs(c.ty - y) < 0.5)) {
      write(c, c.tx, c.ty);
      active.delete(c);
    } else {
      write(c, x, y);
    }
  }
  if (active.size) raf = requestAnimationFrame(step);
}

function findScroller(event, axis, direction) {
  const root = document.scrollingElement;
  const path = event.composedPath().filter(el => el instanceof HTMLElement && el !== document.body && el !== root);
  if (root) path.push(root);
  for (const el of path) {
    const style = getComputedStyle(el);
    let overflow = axis === 'y' ? style.overflowY : style.overflowX;
    // The body's overflow propagates to the viewport in these extension pages.
    if (el === root && overflow === 'visible') {
      const bodyStyle = getComputedStyle(document.body);
      overflow = axis === 'y' ? bodyStyle.overflowY : bodyStyle.overflowX;
    }
    if (!/^(auto|scroll|overlay)$/.test(overflow) && !(el === root && overflow === 'visible')) continue;
    const max = limit(el, axis);
    const base = destination(el, axis);
    const actual = position(el, axis);
    if (max > 1 && (direction < 0 ? base > 0 || actual > 0.5 : base < max || actual < max - 0.5)) return el;
    // An isolated list or Settings panel must never scroll the page behind it.
    const overscroll = axis === 'y' ? style.overscrollBehaviorY : style.overscrollBehaviorX;
    if (overscroll === 'contain' || overscroll === 'none') return null;
  }
  return null;
}

export function initSmoothScrolling() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('wheel', e => {
    if (e.defaultPrevented || !e.cancelable || e.ctrlKey || e.metaKey || reduced()) return;
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    const delta = axis === 'y' ? dy : dx;
    if (!delta) return;
    const el = findScroller(e, axis, delta);
    if (!el) return;
    const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? (axis === 'y' ? el.clientHeight : el.clientWidth) : 1;
    const actual = position(el, axis);
    const pending = destination(el, axis);
    // Reversing the wheel changes direction immediately, without queued travel.
    const base = (pending - actual) * delta < 0 ? actual : pending;
    e.preventDefault();
    smoothScrollTo(el, { [axis === 'y' ? 'top' : 'left']: base + delta * unit });
  }, { passive: false });

  // Run after the app's shortcuts and focused controls have handled their keys.
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || reduced()) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="listbox"], [role="menu"], [role="grid"], .heat')) return;
    if (e.key === ' ' && el && el.closest('button, a[href], [role="button"], summary')) return;
    const direction = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1, Home: -1, End: 1, ' ': e.shiftKey ? -1 : 1 }[e.key];
    if (!direction) return;
    const scroller = findScroller(e, 'y', direction);
    if (!scroller) return;
    const base = destination(scroller, 'y');
    const page = scroller.clientHeight * 0.85;
    const top = e.key === 'Home' ? 0 : e.key === 'End' ? limit(scroller, 'y') : base + direction * (e.key.startsWith('Arrow') ? 48 : page);
    e.preventDefault();
    smoothScrollTo(scroller, { top });
  });

  const stopAll = () => {
    for (const c of active) stopSmoothScroll(c.el);
  };
  document.addEventListener('pointerdown', stopAll, { capture: true, passive: true });
  document.addEventListener('touchstart', stopAll, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
}
