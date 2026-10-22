/*! Made with care and love by Mina Vian */
// The page's side of the dust (see dust-engine.js): a canvas per hidden word, handed to a
// worker that draws them all, sized by a ResizeObserver and paused while off screen or
// while nothing that holds them is open.
import { Runner } from './dust-engine.js';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createDust() {
  const offscreen = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
  let worker = null;
  let local = null;
  const ids = new WeakMap();   // canvas -> id
  const live = new Map();      // id -> canvas
  let nextId = 1;
  let paused = false;

  const send = (m, transfer) => {
    if (offscreen) {
      if (!worker) worker = new Worker(new URL('./dust-worker.js', import.meta.url), { type: 'module' });
      worker.postMessage(m, transfer || []);
    } else {
      if (!local) local = new Runner(cb => requestAnimationFrame(cb));
      local.message(m);
    }
  };

  const sizes = new ResizeObserver(entries => {
    for (const e of entries) {
      const id = ids.get(e.target);
      if (!id) continue;
      const { width, height } = e.contentRect;
      if (!width || !height) continue;
      const key = `${width}x${height}@${devicePixelRatio}`;
      if (e.target._dustSize === key) continue;
      e.target._dustSize = key;
      send({ type: 'resize', id, w: width, h: height, dpr: devicePixelRatio });
    }
  });
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      const id = ids.get(e.target);
      if (id) send({ type: 'visible', id, on: e.isIntersecting });
    }
  });
  // a page zoom changes the pixel ratio, not the size
  addEventListener('resize', () => {
    for (const [id, c] of live) {
      if (!c.isConnected || !c.offsetWidth) continue;
      const key = `${c.offsetWidth}x${c.offsetHeight}@${devicePixelRatio}`;
      if (c._dustSize === key) continue;
      c._dustSize = key;
      send({ type: 'resize', id, w: c.offsetWidth, h: c.offsetHeight, dpr: devicePixelRatio });
    }
  });
  document.addEventListener('visibilitychange', () => send({ type: 'pause', on: paused || document.hidden }));

  const idOf = canvas => ids.get(canvas);
  // where a pointer event is, in the canvas (its middle for a key press)
  const at = (canvas, e) => {
    const r = canvas.getBoundingClientRect();
    if (!e || !e.detail || e.clientX == null) return { x: r.width / 2, y: r.height / 2 };
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };

  return {
    // shown: the word starts out visible (it's about to be hidden, as it lands)
    attach(canvas, { shown = false } = {}) {
      if (ids.has(canvas)) return;
      const id = nextId++;
      ids.set(canvas, id);
      live.set(id, canvas);
      const w = canvas.offsetWidth || 1;
      const h = canvas.offsetHeight || 1;
      canvas._dustSize = `${w}x${h}@${devicePixelRatio}`;
      const target = offscreen ? canvas.transferControlToOffscreen() : canvas;
      send({ type: 'add', id, canvas: target, w, h, dpr: devicePixelRatio, shown, still: still() }, offscreen ? [target] : []);
      sizes.observe(canvas);
      seen.observe(canvas);
    },
    detach(canvas) {
      const id = idOf(canvas);
      if (!id) return;
      sizes.unobserve(canvas);
      seen.unobserve(canvas);
      ids.delete(canvas);
      live.delete(id);
      send({ type: 'remove', id });
    },
    heat(canvas, k) { const id = idOf(canvas); if (id) send({ type: 'heat', id, k }); },
    poke(canvas, e, k) { const id = idOf(canvas); if (id) send({ type: 'poke', id, k, ...at(canvas, e) }); },
    reveal(canvas, e) { const id = idOf(canvas); if (id) send({ type: 'reveal', id, ...at(canvas, e) }); },
    conceal(canvas, instant = false) { const id = idOf(canvas); if (id) send({ type: 'conceal', id, instant }); },
    // nothing holding the dust is open: no drawing at all
    pause(on) { paused = on; send({ type: 'pause', on: on || document.hidden }); },
    at,
  };
}
