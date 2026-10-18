// Appearance: System (default — follows light/dark), Light or Dark.
// Stored in localStorage so the popup and the report share it instantly and it
// can be applied before first paint (see theme-boot.js).

export const THEME_KEY = 'bst-theme';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === 'light' || p === 'dark' ? p : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolvedTheme(pref = getThemePref()) {
  if (pref === 'auto') return darkQuery.matches ? 'dark' : 'light';
  return pref;
}

// Rainbow clock (Appearance), in support of the LGBTQ+ community: the clock's ring in the
// rainbow's colours, in either theme, on the page and the toolbar icon. Kept like the theme,
// so it's there before first paint (theme-boot.js); the tracker reads settings.rainbow for
// the icon.
export const RAINBOW_KEY = 'bst-rainbow';
export function rainbowOn() {
  try { return localStorage.getItem(RAINBOW_KEY) === 'on'; } catch { return false; }
}
function showRainbow(on) {
  if (on) document.documentElement.dataset.rainbow = 'on';
  else delete document.documentElement.dataset.rainbow;
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = on ? 'icons/rainbow32.png' : 'icons/icon32.png';
}
export function setRainbow(on) {
  try {
    if (on) localStorage.setItem(RAINBOW_KEY, 'on');
    else localStorage.removeItem(RAINBOW_KEY);
  } catch { /* ignore */ }
  showRainbow(on);
}

function apply(pref) {
  if (pref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

// ---------- theme change: waves ----------
// Every pick sends a wave across the page, and waves can follow each other without
// limit: light, dark, light… each one rolls in behind the last; none is cut short.
//
// Surfaces are painted by stacked layers, one per wave, each revealed by a soft-edged
// mask: the page background and the cards' surfaces sweep diagonally from the top-right
// corner; the Settings panel fills in a soft circle from the button. Content is themed
// in small blocks ([data-wave]: a row, a cell, a label), each switching as the middle of
// a wave's soft edge passes over it. No snapshots, no colour transitions, no page-wide
// restyle while waves run (each switch restyles one small block), and the page stays
// fully clickable.
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
const FIRST_MS = 840;
const REST_DELAY = 270;
const REST_MS = 1230;
export const THEME_SWITCH_MS = REST_DELAY + REST_MS;

// The same curve in JS, inverted: when does a wave's front reach a point?
const curve = (() => {
  const poly = (a, b) => { const c = 3 * a; const bb = 3 * (b - a) - c; const aa = 1 - c - bb; return t => ((aa * t + bb) * t + c) * t; };
  const X = poly(0.45, 0.2);
  const Y = poly(0, 1);
  const solve = (f, v) => { let lo = 0, hi = 1; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (f(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
  return { when: v => (v <= 0 ? 0 : v >= 1 ? 1 : X(solve(Y, v))) }; // progress → time fraction
})();
const SWEEP_SPAN = 1.3; // the mask's --wave-p runs 0% → 130%
const EDGE = 0.3;       // and its soft edge is 30% wide
const RING = 90;        // the panel circle's soft edge, in px
// where a viewport point lies along the sweep (0 = top-right corner, 1 = bottom-left)
const along = (x, y) => { const W = innerWidth, H = innerHeight; return ((W / 2 - x) * H + (y - H / 2) * W) / (2 * W * H) + 0.5; };
// ms after a wave starts when the middle of its soft edge reaches a point
const sweepAt = f => REST_DELAY + REST_MS * curve.when((f + EDGE / 2) / SWEEP_SPAN);
const circleAt = (d, reach) => FIRST_MS * curve.when((d + RING / 2) / reach);

// Small blocks: the topmost elements under this size, inside the parts given. A block
// normally gets the theme's own text colour; one that inherits a different colour from
// its parent (muted labels, grid cells) keeps inheriting it instead (data-wave-keep).
// (a whole card or panel is never switched at once: that restyles hundreds of elements)
const SMALL = 40000;
function blocksIn(parts, { split = false } = {}) {
  const bodyColor = getComputedStyle(document.body).color;
  const out = [];
  const visit = el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.width * r.height <= SMALL || !el.children.length || el instanceof SVGElement) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return; // unseen (e.g. the hour grid's entrance veil once it's done)
      const own = cs.color;
      const parent = el.parentElement ? getComputedStyle(el.parentElement).color : bodyColor;
      out.push({ el, keep: own === parent && own !== bodyColor, deep: split, x: r.left + r.width / 2, y: r.top + r.height / 2 });
      return;
    }
    for (const c of el.children) visit(c);
  };
  for (const p of parts) {
    const r = p.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // a small part (a button) switches whole, surface and all; a big one by its blocks
    if (!split && r.width * r.height <= SMALL) visit(p);
    else for (const c of p.children) visit(c);
  }
  return out;
}

let waves = [];
let measured = null;     // blocks measured for the waves in progress: { panel, sweep }
let base = null;         // the layer under the waves: the page as it was when they began
let loop = 0;
let switched = [];       // blocks switched last frame, their transitions held
let pointer = null;      // where the pointer is (from events: reading the cursor would force a restyle)
const touched = new Set();
addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

function layer(theme, rects) {
  const el = document.createElement('div');
  el.className = 'wave-layer';
  el.dataset.wave = theme;
  el.setAttribute('aria-hidden', 'true');
  const shapes = document.createElement('div');
  shapes.className = 'wave-shapes';
  for (const r of rects) {
    const s = document.createElement('i');
    s.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    shapes.appendChild(s);
  }
  el.appendChild(shapes);
  // under the board, above the page's own background, oldest first (after the last wave)
  const waves = document.querySelectorAll('body > .wave-layer');
  document.body.insertBefore(el, waves.length ? waves[waves.length - 1].nextSibling : document.body.firstChild);
  return el;
}

// One loop for all waves: each frame, the blocks a wave's edge has reached switch, and
// the cursor takes the theme of the newest wave that has reached it.
function run() {
  cancelAnimationFrame(loop);
  const cursor = document.querySelector('.cc');
  const tick = () => {
    // a block switches in one frame, with its own colour transitions held for that frame
    // (some have long, staggered ones) so it stays with the surface under it
    for (const el of switched) { delete el.dataset.waveNow; delete el.dataset.waveDeep; }
    switched = [];
    if (!waves.length) return;
    const now = performance.now();
    for (const w of waves) {
      const t = now - w.start;
      while (w.next < w.queue.length && w.queue[w.next].at <= t) {
        const { el, keep, fade, deep } = w.queue[w.next++];
        if (keep && !('waveKeep' in el.dataset)) el.dataset.waveKeep = '';
        if (el.dataset.wave !== w.theme) {
          // (on a floating surface, a block's few descendants are held too: buttons and
          // dots would otherwise fade behind the circle)
          if (!fade) { el.dataset.waveNow = ''; if (deep) el.dataset.waveDeep = ''; switched.push(el); }
          el.dataset.wave = w.theme;
        }
        touched.add(el);
      }
    }
    if (cursor && pointer) {
      let theme = base ? base.dataset.wave : null;
      for (const w of waves) {
        const inPanel = w.circles.some(({ rect: p }) => pointer.x >= p.left && pointer.x <= p.right && pointer.y >= p.top && pointer.y <= p.bottom);
        const at = inPanel ? circleAt(Math.hypot(pointer.x - w.cx, pointer.y - w.cy), w.reach) : sweepAt(along(pointer.x, pointer.y));
        if (now - w.start >= at) theme = w.theme;
      }
      if (theme && cursor.dataset.wave !== theme) cursor.dataset.wave = theme;
    }
    loop = requestAnimationFrame(tick);
  };
  tick();
}

function retire(w) {
  w.layer.remove();
  for (const c of w.circles) c.layer.remove();
}

// The last wave has landed: the page takes its theme for good, and the layers go.
function settle(pref) {
  cancelAnimationFrame(loop);
  for (const el of switched) { delete el.dataset.waveNow; delete el.dataset.waveDeep; }
  switched = [];
  measured = null;
  apply(pref);
  const done = waves;
  waves = [];
  // the page restyles to the new theme in the next frame while the layers (and the
  // cards' held transitions) are still there; they go the frame after, so nothing fades
  // from the old colours out from under them
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const w of done) retire(w);
    if (waves.length) return; // a new wave already began on top
    const root = document.documentElement;
    // the cards take their own surfaces back, their transitions held one frame more
    root.classList.replace('waving', 'wave-done');
    if (base) { base.remove(); base = null; }
    const cursor = document.querySelector('.cc');
    if (cursor) delete cursor.dataset.wave;
    // blocks go back to following the page, a batch per frame (each held still for its
    // frame: nothing should fade on the way back to colours it already shows)
    const left = [...touched];
    touched.clear();
    let held = [];
    const step = () => {
      for (const el of held) delete el.dataset.waveNow;
      root.classList.remove('wave-done');
      if (waves.length) { for (const el of left) touched.add(el); return; }
      held = left.splice(0, 60);
      for (const el of held) { el.dataset.waveNow = ''; delete el.dataset.wave; delete el.dataset.waveKeep; }
      if (held.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
}

// Returns { ready } for the progress line when a wave starts (null when instant).
// panel: the surface that fills in a circle from `origin`; panelParts / parts: the
// containers whose small blocks the circle / the sweep switch; cards: surfaces the
// layers paint.
export function setThemePref(pref, origin, { panels = [], parts = [], fades = [], cards = [] } = {}) {
  const before = waves.length ? waves[waves.length - 1].theme : resolvedTheme();
  try {
    if (pref === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* ignore */ }
  const theme = resolvedTheme(pref);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (waves.length) settle(pref);
    else apply(pref);
    return null;
  }
  if (theme === before) {
    // the same look as the last wave: nothing to sweep, but the choice (e.g. System) is kept
    if (waves.length) waves[waves.length - 1].pref = pref;
    else apply(pref);
    return null;
  }
  const root = document.documentElement;
  const rects = cards.map(c => c.getBoundingClientRect()).filter(r => r.width && r.height);
  if (!waves.length && !base) {
    // the first wave: a layer showing the page as it is goes underneath, and the cards
    // hand their surfaces to the layers (nothing changes on screen)
    base = layer(before, rects); // the theme the page shows now (the new choice is already stored)
    root.classList.add('waving');
  }
  const w = { theme, pref, start: performance.now(), layer: layer(theme, rects), circles: [], queue: [], next: 0 };
  w.layer.classList.add('sweeping');
  w.layer.animate({ '--wave-p': ['0%', `${SWEEP_SPAN * 100}%`] }, { duration: REST_MS, delay: REST_DELAY, easing: EASE, fill: 'both' });

  // floating surfaces (the Settings panel, the tour card): one soft circle from the
  // button grows across all of them, so they fill in together, before the rest
  const x = origin ? origin.x : innerWidth;
  const y = origin ? origin.y : 0;
  const shown = panels.filter(p => p.el && p.el.isConnected && p.el.getClientRects().length);
  const rectsOf = shown.map(p => p.el.getBoundingClientRect());
  const reach = Math.max(0, ...rectsOf.map(p => Math.hypot(Math.max(x - p.left, p.right - x), Math.max(y - p.top, p.bottom - y)))) + RING;
  Object.assign(w, { cx: x, cy: y, reach });
  if (!measured) measured = { panels: null, sweep: null, fades: null };
  // (a floating surface always switches by its blocks, however small: whole, it would
  // jump ahead of its circle)
  if (!measured.panels) measured.panels = blocksIn(shown.flatMap(p => p.parts || []), { split: true });
  shown.forEach(({ el }, k) => {
    const p = rectsOf[k];
    const pl = document.createElement('div');
    pl.className = 'wave-panel';
    pl.dataset.wave = theme;
    pl.setAttribute('aria-hidden', 'true');
    pl.style.height = `${el.scrollHeight}px`;
    pl.style.setProperty('--wave-cx', `${x - p.left}px`);
    pl.style.setProperty('--wave-cy', `${y - p.top + el.scrollTop}px`);
    el.appendChild(pl);
    pl.animate({ '--wave-r': ['0px', `${reach}px`] }, { duration: FIRST_MS, easing: EASE, fill: 'both' });
    w.circles.push({ rect: p, layer: pl });
  });
  if (shown.length) for (const b of measured.panels) w.queue.push({ el: b.el, keep: b.keep, deep: true, at: circleAt(Math.hypot(b.x - x, b.y - y), reach) });
  // everything else: crossed by the diagonal sweep
  if (!measured.sweep) measured.sweep = blocksIn(parts);
  for (const b of measured.sweep) w.queue.push({ el: b.el, keep: b.keep, at: sweepAt(along(b.x, b.y)) });
  // elements that fade on their own (a dim): they switch as the sweep passes their centre
  // and keep their own transition
  if (!measured.fades) measured.fades = fades.filter(el => el && el.isConnected).map(el => { const r = el.getBoundingClientRect(); return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  for (const b of measured.fades) w.queue.push({ el: b.el, fade: true, at: sweepAt(along(b.x, b.y)) });
  w.queue.sort((a, b) => a.at - b.at);
  waves.push(w);
  run();

  // a wave that has covered everything retires the layers under it; the last one settles
  setTimeout(() => {
    const i = waves.indexOf(w);
    if (i < 0) return;
    if (i === waves.length - 1) { settle(w.pref); return; }
    for (const old of waves.splice(0, i)) retire(old);
    if (base) { base.remove(); base = null; }
  }, THEME_SWITCH_MS + 60);
  return { ready: Promise.resolve() };
}

// Keeps every open page in step when the choice or the system theme changes.
export function watchTheme(onChange) {
  addEventListener('storage', e => {
    if (e.key === RAINBOW_KEY) { showRainbow(rainbowOn()); return; }
    if (e.key !== THEME_KEY) return;
    apply(getThemePref());
    if (onChange) onChange();
  });
  darkQuery.addEventListener('change', () => { if (onChange) onChange(); });
}
