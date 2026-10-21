// Motion & UI primitives shared by the popup and the report.
// Hover motion never overshoots; bounce is saved for things that pop open.

import { smoothScrollTo, stopSmoothScroll } from './scroll.js';
import { isPage, siteName, isApp, appIcon, ICON_FILE } from './core.js';
export { initSmoothScrolling } from './scroll.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const POP = 'cubic-bezier(0.32, 1.24, 0.5, 1)';
// one card turning into another (the welcome into the tour's first card, the Reset
// button into its questions): it sets off from rest and settles softly
export const RESHAPE = 'cubic-bezier(0.45, 0, 0.15, 1)';
export const RESHAPE_MS = 560;

const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function animateNumber(el, to, { duration = 900, delay = 0, format = v => String(Math.round(v)) } = {}) {
  const from = typeof el._value === 'number' ? el._value : 0;
  el._value = to;
  cancelAnimationFrame(el._raf);
  clearTimeout(el._timer);
  if (reducedMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const run = () => {
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = format(from + (to - from) * easeOutExpo(t));
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  };
  if (delay) {
    el.textContent = format(from);
    el._timer = setTimeout(run, delay);
  } else run();
}

export function tween(duration, onUpdate, { delay = 0, ease = easeOutExpo } = {}) {
  if (reducedMotion()) { onUpdate(1); return () => {}; }
  let raf = 0;
  let cancelled = false;
  const timer = setTimeout(() => {
    const start = performance.now();
    const step = now => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      onUpdate(ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }, delay);
  return () => { cancelled = true; clearTimeout(timer); cancelAnimationFrame(raf); };
}

// Restarts a CSS animation class.
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---------- tooltip: glides after the pointer and morphs its size ----------
// Size and position move together in one loop, so the edge nearest the pointer
// stays put while the tooltip grows or shrinks — nothing jumps.

export function createTooltip() {
  const el = document.createElement('div');
  el.className = 'tip';
  el.setAttribute('role', 'tooltip');
  const measure = document.createElement('div');
  measure.className = 'tip tip-measure';
  measure.setAttribute('aria-hidden', 'true');
  document.body.append(el, measure);

  const PAD = 10;
  let px = 0, py = 0;          // pointer
  let x = 0, y = 0;            // current top-left
  let cw = 0, ch = 0;          // current size
  let w = 0, h = 0;            // target size
  let raf = 0, visible = false;
  let html = null;
  let current = null;

  // which side of the pointer to sit on is decided by the final size
  function targetFor(sw, sh) {
    const flipX = px + 14 + w > innerWidth - PAD;
    const below = py - h - 12 < PAD;
    let tx = flipX ? px - sw - 14 : px + 14;
    let ty = below ? py + 20 : py - sh - 12;
    tx = Math.max(PAD, Math.min(tx, innerWidth - sw - PAD));
    ty = Math.max(PAD, Math.min(ty, innerHeight - sh - PAD));
    return { tx, ty, flipX, below };
  }
  function apply() {
    el.style.width = `${cw.toFixed(1)}px`;
    el.style.height = `${ch.toFixed(1)}px`;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  function loop() {
    raf = 0;
    const calm = reducedMotion();
    const k = calm ? 1 : 0.26;
    const nw = Math.abs(w - cw) < 0.4 ? w : cw + (w - cw) * k;
    const nh = Math.abs(h - ch) < 0.4 ? h : ch + (h - ch) * k;
    const { flipX, below } = targetFor(nw, nh);
    // keep the edge next to the pointer fixed while the size changes
    if (flipX) x -= nw - cw;
    if (!below) y -= nh - ch;
    cw = nw;
    ch = nh;
    const { tx, ty } = targetFor(cw, ch);
    const m = calm ? 1 : 0.3;
    x += (tx - x) * m;
    y += (ty - y) * m;
    if (Math.abs(tx - x) < 0.3) x = tx;
    if (Math.abs(ty - y) < 0.3) y = ty;
    apply();
    if (cw !== w || ch !== h || x !== tx || y !== ty) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function setContent(next, morphing) {
    measure.innerHTML = `<div class="tip-inner">${next}</div>`;
    // fractional sizes, rounded up: a width rounded down would wrap the last word
    const mr = measure.getBoundingClientRect();
    w = Math.ceil(mr.width);
    h = Math.ceil(mr.height);
    const innerW = Math.ceil(measure.firstElementChild.getBoundingClientRect().width + 0.5);
    const inner = document.createElement('div');
    inner.className = 'tip-inner';
    inner.style.width = `${innerW}px`;
    inner.innerHTML = next;
    if (!morphing || reducedMotion()) {
      el.textContent = '';
      el.appendChild(inner);
      cw = w;
      ch = h;
    } else {
      const old = current;
      if (old) {
        old.classList.add('leaving');
        old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => old.remove()).catch(() => old.remove());
      }
      el.appendChild(inner);
      inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 50, easing: 'ease-out', fill: 'backwards' });
    }
    current = inner;
    html = next;
  }

  return {
    show(next, cx, cy) {
      px = cx;
      py = cy;
      const wasVisible = visible;
      if (next !== html || !visible) setContent(next, visible);
      if (!wasVisible) {
        const { tx, ty } = targetFor(cw, ch);
        x = tx;
        y = ty + 4;
        apply();
      }
      visible = true;
      el.classList.add('on');
      kick();
    },
    move(cx, cy) {
      if (!visible) return;
      px = cx;
      py = cy;
      kick();
    },
    // instant: gone in this frame (a click that starts something bigger), no fade
    hide(instant = false) {
      visible = false;
      if (instant && el.classList.contains('on')) {
        el.style.transition = 'none';
        el.classList.remove('on');
        void el.offsetWidth;
        el.style.transition = '';
        return;
      }
      el.classList.remove('on');
    },
    get visible() { return visible; },
  };
}

export function reveal() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
}

// ---------- no hover tooltips ----------
// The browser's own tooltip (from a title) never shows: the title is taken away the
// moment the pointer arrives, before the browser's delay is up, including titles the
// page sets later. A control with no text of its own keeps it as its accessible name.

let titlesOff = false;
export function disableTitleTooltips() {
  if (titlesOff) return;
  titlesOff = true;
  document.addEventListener('pointerover', e => {
    const t = e.target instanceof Element ? e.target.closest('[title]') : null;
    if (!t) return;
    const text = t.getAttribute('title');
    t.removeAttribute('title');
    if (text && !t.hasAttribute('aria-label') && !t.textContent.trim()) t.setAttribute('aria-label', text);
  }, true);
}

// ---------- sites: favicons & links ----------

let ORIGINS = {};
const iconCache = new Map();
// icons already found (src, or null for none): a list drawn again shows them straight
// away, so a refresh never makes them blink
const iconKnown = new Map();

export function setOrigins(map) {
  const next = map || {};
  for (const d of new Set([...Object.keys(ORIGINS), ...Object.keys(next)])) {
    if (ORIGINS[d] !== next[d]) { iconCache.delete(d); iconKnown.delete(d); }
  }
  ORIGINS = next;
}

export function siteHref(domain) {
  if (domain.startsWith('app:')) return null;
  if (ORIGINS[domain]) return `${ORIGINS[domain]}/`;
  const plain = domain === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(domain);
  return `${plain ? 'http' : 'https'}://${domain}/`;
}

const favUrl = (page, size = 32) => chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(page)}&size=${size}`);

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let sigCanvas = null;
function signature(img) {
  if (!sigCanvas) {
    sigCanvas = document.createElement('canvas');
    sigCanvas.width = sigCanvas.height = 16;
  }
  const ctx = sigCanvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 16, 16);
  ctx.drawImage(img, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let hash = 2166136261;
  for (let i = 0; i < d.length; i++) hash = Math.imul(hash ^ d[i], 16777619);
  return hash >>> 0;
}

// Chrome returns the same grey globe for any page it has no icon for.
let defaultSig = null;
function defaultSignature() {
  if (!defaultSig) defaultSig = loadImage(favUrl('https://memoir-no-icon.invalid/')).then(img => (img ? signature(img) : -1));
  return defaultSig;
}

// Finding an icon is the heaviest part of a list (a few image loads and a pixel
// check per site), so the address that worked is remembered between visits and
// tried first; a site without an icon is asked about again after a day.
const FAV_KEY = 'memoir-fav:';
const FAV_RETRY_MS = 24 * 3600 * 1000;
function rememberedPage(domain) {
  try {
    const r = JSON.parse(localStorage.getItem(FAV_KEY + domain) || 'null');
    if (!r || r.o !== (ORIGINS[domain] || '')) return undefined;
    if (r.p === null && Date.now() - r.t > FAV_RETRY_MS) return undefined;
    return r.p;
  } catch { return undefined; }
}
function rememberPage(domain, page) {
  try { localStorage.setItem(FAV_KEY + domain, JSON.stringify({ p: page, o: ORIGINS[domain] || '', t: Date.now() })); } catch { /* storage full or blocked: just ask again next time */ }
}

// a few lookups at a time, so a long list never floods the page with image loads
const FAV_PARALLEL = 4;
let favActive = 0;
const favQueue = [];
function favSlot(task) {
  return new Promise(resolve => {
    const run = async () => {
      favActive++;
      try { resolve(await task()); } catch { resolve(null); } finally {
        favActive--;
        const nextTask = favQueue.shift();
        if (nextTask) nextTask();
      }
    };
    if (favActive < FAV_PARALLEL) run();
    else favQueue.push(run);
  });
}

// An icon known at once, with nothing to look up (undefined: look it up): on Windows, the files in Memoir's
// icons folder, an app's own and the websites' a linked browser sent (`favicons`); in the browser, a Windows
// app's icon that a linked Memoir for Windows sent.
function directIcon(domain) {
  if (window.memoir?.windows) {
    const file = isApp(domain) ? window.memoir.apps[domain]?.icon : window.memoir.favicons?.[domain];
    return ICON_FILE.test(file || '') ? `https://memoir-icons.example/${isApp(domain) ? '' : 'sites/'}${file}` : null;
  }
  if (isApp(domain)) return appIcon(domain);
  return undefined;
}

// Chrome keys icons by the exact address visited (www., port…), so try the
// address the site was really visited on first, then the usual spellings.
export function resolveFavicon(domain) {
  const direct = directIcon(domain);
  if (direct !== undefined) return Promise.resolve(direct);
  if (iconCache.has(domain)) return iconCache.get(domain);
  const p = favSlot(async () => {
    const known = rememberedPage(domain);
    if (known === null) return null;
    const def = await defaultSignature();
    if (known) {
      const img = await loadImage(favUrl(known));
      if (img && signature(img) !== def) return img.src;
    }
    const candidates = [...new Set([
      ORIGINS[domain] && `${ORIGINS[domain]}/`,
      `https://${domain}/`,
      `https://www.${domain}/`,
      `http://${domain}/`,
      `http://www.${domain}/`,
    ].filter(Boolean))].filter(page => page !== known);
    for (const page of candidates) {
      const img = await loadImage(favUrl(page));
      if (img && signature(img) !== def) { rememberPage(domain, page); return img.src; }
    }
    rememberPage(domain, null);
    return null;
  });
  iconCache.set(domain, p);
  p.then(src => { if (iconCache.get(domain) === p) iconKnown.set(domain, src); });
  return p;
}

// Icons are only looked up once their tile is on screen (or nearly): a list of
// sixty sites only fetches the dozen you can see.
let seenIO = null;
const watched = new Set();
function whenSeen(el, fn) {
  if (typeof IntersectionObserver !== 'function') { fn(); return; }
  if (!seenIO) {
    seenIO = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seenIO.unobserve(e.target);
        watched.delete(e.target);
        const f = e.target._onSeen;
        e.target._onSeen = null;
        if (f) f();
      }
    }, { rootMargin: '160px' });
  }
  // tiles from lists that have since been replaced are let go now and then
  if (watched.size > 200) {
    for (const w of watched) if (!w.isConnected) { seenIO.unobserve(w); watched.delete(w); w._onSeen = null; }
  }
  el._onSeen = fn;
  watched.add(el);
  seenIO.observe(el);
}

// rounded, like the rest: a new tab's plus, a browser window, a puzzle piece, a page
const glyph = d => `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const PAGE_GLYPHS = {
  '~newtab': glyph('<rect x="2.5" y="2.5" width="11" height="11" rx="3"/><path d="M8 5.5v5M5.5 8h5"/>'),
  '~browser': glyph('<rect x="2" y="3" width="12" height="10" rx="2.5"/><path d="M2 6.5h12"/><circle cx="4.6" cy="4.75" r=".35" fill="currentColor"/><circle cx="6.2" cy="4.75" r=".35" fill="currentColor"/>'),
  '~extensions': glyph('<path d="M6.5 3.2a1.5 1.5 0 0 1 3 0V4h2.2A1.3 1.3 0 0 1 13 5.3v2.2h-.8a1.5 1.5 0 0 0 0 3h.8v2.2a1.3 1.3 0 0 1-1.3 1.3H9.5v-.8a1.5 1.5 0 0 0-3 0v.8H4.3A1.3 1.3 0 0 1 3 12.7v-2.2h.8a1.5 1.5 0 0 0 0-3H3V5.3A1.3 1.3 0 0 1 4.3 4h2.2Z"/>'),
  '~files': glyph('<path d="M9 2H5.5A1.5 1.5 0 0 0 4 3.5v9A1.5 1.5 0 0 0 5.5 14h5a1.5 1.5 0 0 0 1.5-1.5V5Z"/><path d="M9 2v2.5A.5.5 0 0 0 9.5 5H12M6.5 8.5h3M6.5 11h3"/>'),
};
const LOCK_GLYPH = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

export function faviconTile(domain, color) {
  const tile = document.createElement('span');
  tile.className = 'favicon';
  if (domain === '~private') {
    tile.classList.add('is-private');
    tile.innerHTML = LOCK_GLYPH;
    return tile;
  }
  // Memoir shows its own icon; the browser's pages, extensions and files a glyph of their own
  if (domain === '~memoir') {
    const img = document.createElement('img');
    img.alt = '';
    img.src = chrome.runtime.getURL('icons/icon32.png');
    tile.appendChild(img);
    return tile;
  }
  if (isPage(domain)) {
    tile.classList.add('is-private');
    tile.innerHTML = PAGE_GLYPHS[domain];
    return tile;
  }
  // Windows: an app's first letter when it has no icon, or its icon file won't load
  const letterTile = () => {
    tile.replaceChildren();
    tile.style.background = color || 'var(--label-3)';
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = (siteName(domain) || '?').charAt(0).toUpperCase();
    tile.appendChild(letter);
  };
  const fill = (src, animate) => {
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', letterTile, { once: true });
      img.src = src;
      tile.appendChild(img);
      if (animate && !reducedMotion()) img.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_OUT });
    } else {
      letterTile();
    }
  };
  // known already: in place at once, no entrance (redrawn lists would otherwise blink)
  const direct = directIcon(domain);
  if (direct !== undefined) { fill(direct, false); return tile; }
  if (iconKnown.has(domain)) { fill(iconKnown.get(domain), false); return tile; }
  whenSeen(tile, () => resolveFavicon(domain).then(src => { if (tile.isConnected) fill(src, true); }));
  return tile;
}

export const ARROW_SVG = '<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.4 8.6 8.4 3.6M4.4 3.4h2.7a1.5 1.5 0 0 1 1.5 1.5v2.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A site name that opens the site; looks exactly like the text around it and
// shows a small ↗ on hover.
export function siteLinkHtml(domain, extra = '') {
  if (domain === '~private') return `<span class="private-name ${extra}">Private</span>`;
  if (domain.startsWith('app:')) return `<span class="app-name ${extra}" data-domain="${esc(domain)}" title="Windows app"><span class="sl-text">${esc(siteName(domain))}</span></span>`;
  // not a website, so nothing to open: just its name
  if (isPage(domain)) return `<span class="page-name ${extra}">${esc(siteName(domain))}</span>`;
  return `<a class="site-link ${extra}" href="${esc(siteHref(domain))}" target="_blank" rel="noopener noreferrer" data-domain="${esc(domain)}" title="Open ${esc(domain)}"><span class="sl-text">${esc(domain)}</span>${ARROW_SVG}</a>`;
}

export function siteLink(domain, extra = '') {
  const t = document.createElement('template');
  t.innerHTML = siteLinkHtml(domain, extra);
  return t.content.firstElementChild;
}

// ---------- morph: a surface that flies from one rect to another ----------

// exact: layout works in 1/64 px, so a shell landing on a box is on it to the last fraction
const px = n => `${n}px`;
const radiusFor = (r, rect) => (r === 'pill' || r === 'circle' ? Math.min(rect.width, rect.height) / 2 : r);

export function morph({
  from, to, fromRadius = 10, toRadius = 18, background = 'var(--raised)', fade = null, fromOpacity = null,
  duration = 440, easing = EASE_OUT, z = 3000, shadow = true, className = '', parent = document.body,
  fromBackground = null, toBackground = null,
}) {
  const shell = document.createElement('div');
  shell.className = `morph-shell ${className}`;
  shell.style.background = background;
  shell.style.zIndex = z;
  if (!shadow) shell.style.boxShadow = 'none';
  parent.appendChild(shell);
  const frame = (r, rad, op) => ({
    left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height),
    borderRadius: px(radiusFor(rad, r)), opacity: op,
  });
  const kf = [
    frame(from, fromRadius, fromOpacity ?? (fade === 'in' ? 0 : 1)),
    frame(to, toRadius, fade === 'out' ? 0 : 1),
  ];
  // an opacity that never changes stays out: animating it would put the shell on a layer
  // of its own, drawn between device pixels on scaled screens (125%…), so it would land
  // a soft edge away from the crisp box it turns into
  if (kf[0].opacity === 1 && kf[1].opacity === 1) for (const k of kf) delete k.opacity;
  // a surface that starts (or ends) as something else's colour, a switch's: it turns into the popover's as it grows
  if (fromBackground || toBackground) { kf[0].backgroundColor = fromBackground || background; kf[1].backgroundColor = toBackground || background; }
  if (reducedMotion()) {
    Object.assign(shell.style, kf[1]);
    return { shell, finished: Promise.resolve(shell), cancel: () => shell.remove() };
  }
  const anim = shell.animate(kf, { duration, easing, fill: 'forwards' });
  return {
    shell,
    finished: anim.finished.then(() => shell, () => shell),
    cancel: () => { anim.cancel(); shell.remove(); },
  };
}

// Fades a morph shell away once the real content is in place.
export function dropShell(shell, duration = 140) {
  if (!shell || !shell.isConnected) return;
  if (reducedMotion()) { shell.remove(); return; }
  shell.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' })
    .finished.then(() => shell.remove(), () => shell.remove());
}

// An interrupted trip turns around from rest instead of at full speed, so a reversal
// eases through its turn rather than snapping.
const TURN = 'cubic-bezier(0.4, 0, 0.2, 1)';

// How much of a trip from `start` to `to` is still ahead when the surface is at `now` (0–1).
function remaining(now, to, start) {
  const gap = (a, b) => Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height);
  const whole = gap(start, to);
  return whole < 1 ? 0 : Math.min(1, gap(now, to) / whole);
}

// A popover that grows out of the element that opened it and shrinks back into it.
// Fully interruptible: opening and closing always pick up from wherever the surface
// is at that moment, with one surface on screen, never a jump or a second shell.
export class MorphPopover {
  constructor(el, { width = null, radius = 16, onClose = null, z = 1990 } = {}) {
    this.el = el;
    this.z = z;
    this.width = width;
    this.radius = radius;
    this.anchor = null;
    this.token = 0;
    this.onClose = onClose;
    el.hidden = true;
  }

  get isOpen() { return !this.el.hidden && this.el.dataset.state !== 'closing'; }

  place(anchorRect) {
    const el = this.el;
    const vw = innerWidth;
    const vh = innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchorRect.left + anchorRect.width / 2 - w / 2;
    left = Math.max(12, Math.min(left, vw - w - 12));
    let top = anchorRect.bottom + 8;
    if (top + h > vh - 12) top = anchorRect.top - h - 8;
    if (top < 12) top = Math.max(12, Math.min(vh - h - 12, anchorRect.bottom + 8));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  // The surface still in flight (opening or closing): where it is right now, then gone.
  // The next surface starts from exactly there, in the same frame, so nothing flickers.
  takeShell() {
    const shell = this.shell;
    this.shell = null;
    if (!shell || !shell.isConnected) return null;
    const style = getComputedStyle(shell);
    const now = { rect: shell.getBoundingClientRect(), radius: parseFloat(style.borderTopLeftRadius) || 0, opacity: +style.opacity, background: style.backgroundColor };
    shell.remove();
    return now;
  }

  // fromRadius and fromBackground: the shape and colour it grows out of (and shrinks back into), as a switch's
  open(anchor, { fromRect = null, fromRadius = 8, fromBackground = null } = {}) {
    const token = ++this.token;
    this.from = { radius: fromRadius, background: fromBackground };
    const el = this.el;
    this.anchor = anchor;
    const flight = this.takeShell();
    el.getAnimations().forEach(a => a.cancel());
    el.hidden = false;
    el.style.background = '';
    el.style.boxShadow = '';
    el.dataset.state = 'opening';
    el.style.opacity = '0';
    const src = fromRect || anchor.getBoundingClientRect();
    this.place(src);
    const to = el.getBoundingClientRect();
    const bg = getComputedStyle(el).backgroundColor;
    // reopened mid-close: grow on from where it is, in the time the rest of the trip needs
    const left = flight ? remaining(flight.rect, to, src) : 1;
    // the shell goes next to the popover (same stacking context), so the content shows above it
    const m = morph({
      from: flight ? flight.rect : src, to, fromRadius: flight ? flight.radius : fromRadius, fromOpacity: flight ? flight.opacity : null,
      fromBackground: fromBackground ? (flight ? flight.background : fromBackground) : null,
      toRadius: this.radius, background: bg, duration: 160 + 300 * left, easing: flight ? TURN : POP, z: this.z, parent: el.parentNode || document.body,
    });
    this.shell = m.shell;
    // the content fades in while the shell is still growing (the shell is the
    // surface until it lands), so there's no pause before anything appears
    let shown = false;
    const show = () => {
      if (shown || token !== this.token) return;
      shown = true;
      el.style.background = 'transparent';
      el.style.boxShadow = 'none';
      el.style.opacity = '';
      if (!reducedMotion()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT });   // (words never zoom: they jiggle)
    };
    const early = setTimeout(show, reducedMotion() ? 0 : 150 * left);
    return m.finished.then(() => {
      clearTimeout(early);
      if (token !== this.token) { m.shell.remove(); return; }
      show();
      el.dataset.state = 'open';
      el.style.background = '';
      el.style.boxShadow = '';
      // the shell and the popover are identical now: swap at once (a fade would
      // stack two shadows for a moment and darken the edges)
      m.shell.remove();
      this.shell = null;
    });
  }

  close({ instant = false } = {}) {
    const el = this.el;
    if (el.hidden) return Promise.resolve();
    const token = ++this.token;
    const flight = this.takeShell();
    el.getAnimations().forEach(a => a.cancel());
    el.style.background = '';
    el.style.boxShadow = '';
    const anchor = this.anchor;
    this.anchor = null;
    const done = () => {
      if (token !== this.token) return;
      el.hidden = true;
      el.dataset.state = '';
      el.style.opacity = '';
      if (this.onClose) this.onClose();
    };
    if (instant || reducedMotion()) { done(); return Promise.resolve(); }
    el.dataset.state = 'closing';
    const full = el.getBoundingClientRect();
    const target = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
    const bg = getComputedStyle(el).backgroundColor;
    el.style.opacity = '0';
    if (!target || target.width === 0) { done(); return Promise.resolve(); }
    // closed mid-open: shrink back from where the surface had got to
    const from = flight ? flight.rect : full;
    const left = remaining(from, target, full);
    const m = morph({
      from, to: target, fromRadius: flight ? flight.radius : this.radius, fromOpacity: flight ? flight.opacity : null,
      toRadius: this.from?.radius ?? 8, background: bg, fade: 'out',
      fromBackground: this.from?.background && flight ? flight.background : null, toBackground: this.from?.background || null, duration: 120 + 180 * left, easing: flight ? TURN : EASE_OUT, z: this.z, parent: el.parentNode || document.body,
    });
    this.shell = m.shell;
    return m.finished.then(shell => {
      if (this.shell === shell) this.shell = null;
      shell.remove();
      done();
    });
  }
}

// ---------- misc ----------

export function syncSegmented(root, animate = true) {
  const thumb = root.querySelector('.thumb');
  const on = root.querySelector('button[aria-pressed="true"]');
  if (!thumb) return;
  if (!on) { thumb.style.opacity = '0'; return; }
  thumb.style.opacity = '';
  if (!animate) thumb.style.transition = 'none';
  thumb.style.width = `${on.offsetWidth}px`;
  thumb.style.transform = `translateX(${on.offsetLeft}px)`;
  if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
}

// A ring slice with softly rounded corners (angles in radians, 0 = 3 o'clock).
export function slicePath(cx, cy, r1, r2, a0, a1, corner) {
  const span = a1 - a0;
  if (span <= 0.0005) return '';
  if (span >= Math.PI * 2 - 0.0005) {
    return `M${cx + r2} ${cy}A${r2} ${r2} 0 1 1 ${cx - r2} ${cy}A${r2} ${r2} 0 1 1 ${cx + r2} ${cy}Z` +
      `M${cx + r1} ${cy}A${r1} ${r1} 0 1 0 ${cx - r1} ${cy}A${r1} ${r1} 0 1 0 ${cx + r1} ${cy}Z`;
  }
  const cr = Math.max(0, Math.min(corner, (r2 - r1) / 2, (span * r1) / 2 * 0.95));
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`;
  const dO = cr / r2;
  const dI = cr / r1;
  const bigO = span - 2 * dO > Math.PI ? 1 : 0;
  const bigI = span - 2 * dI > Math.PI ? 1 : 0;
  return `M${pt(r2, a0 + dO)}A${r2} ${r2} 0 ${bigO} 1 ${pt(r2, a1 - dO)}A${cr} ${cr} 0 0 1 ${pt(r2 - cr, a1)}` +
    `L${pt(r1 + cr, a1)}A${cr} ${cr} 0 0 1 ${pt(r1, a1 - dI)}A${r1} ${r1} 0 ${bigI} 0 ${pt(r1, a0 + dI)}` +
    `A${cr} ${cr} 0 0 1 ${pt(r1 + cr, a0)}L${pt(r2 - cr, a0)}A${cr} ${cr} 0 0 1 ${pt(r2, a0 + dO)}Z`;
}

// ---------- smooth height changes ----------

// Runs `mutate`, then animates the element from its old height to its new one.
// delay: ms (or a function giving them once mutate has run) to hold the old height first.
export function animateHeight(el, mutate, { duration = 380, easing = EASE_OUT, delay = 0 } = {}) {
  if (!el) { mutate(); return Promise.resolve(); }
  const from = el.getBoundingClientRect().height;
  if (el._hAnim) { el._hAnim.cancel(); el._hAnim = null; }
  mutate();
  const to = el.getBoundingClientRect().height;
  const wait = typeof delay === 'function' ? delay() : delay;
  if (reducedMotion() || Math.abs(to - from) < 0.5) {
    if (el._hOverflow != null) { el.style.overflow = el._hOverflow; el._hOverflow = null; }
    return Promise.resolve();
  }
  // remember the element's own overflow once, so back-to-back runs can't leave it clipped
  if (el._hOverflow == null) el._hOverflow = el.style.overflow;
  el.style.overflow = 'clip';
  const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing, delay: wait, fill: 'backwards' });
  el._hAnim = a;
  const done = () => {
    if (el._hAnim !== a) return;
    el._hAnim = null;
    el.style.overflow = el._hOverflow;
    el._hOverflow = null;
  };
  return a.finished.then(done, done);
}

// ---------- scrolling lists: eased wheel scrolling and a slim slider ----------

let scrollRO = null;
export function makeScroller(list) {
  if (list._scroller) { list._scroller.update(); return list._scroller; }
  const wrap = document.createElement('div');
  wrap.className = 'scroller at-top at-bottom';
  list.parentNode.insertBefore(wrap, list);
  wrap.appendChild(list);
  list.classList.add('scroll-area');
  const bar = document.createElement('div');
  bar.className = 'sb';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  wrap.appendChild(bar);
  const thumb = bar.firstElementChild;

  let idle = 0;
  const maxTop = () => Math.max(0, list.scrollHeight - list.clientHeight);

  function update() {
    const max = maxTop();
    const can = max > 1;
    wrap.classList.toggle('can-scroll', can);
    wrap.classList.toggle('at-top', !can || list.scrollTop <= 1);
    wrap.classList.toggle('at-bottom', !can || list.scrollTop >= max - 1);
    if (!can) return;
    const trackH = bar.clientHeight;
    const h = Math.max(22, (trackH * list.clientHeight) / list.scrollHeight);
    thumb.style.height = `${h.toFixed(1)}px`;
    thumb.style.transform = `translateY(${((trackH - h) * (list.scrollTop / max)).toFixed(1)}px)`;
  }
  function wake() {
    wrap.classList.add('active');
    clearTimeout(idle);
    idle = setTimeout(() => wrap.classList.remove('active'), 900);
  }
  function scrollToSmooth(y) {
    smoothScrollTo(list, { top: y });
    wake();
  }

  list.addEventListener('scroll', () => {
    update();
    wake();
  }, { passive: true });

  // drag the slider, or click the track to glide there
  thumb.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    stopSmoothScroll(list);
    thumb.setPointerCapture(e.pointerId);
    wrap.classList.add('dragging');
    const y0 = e.clientY;
    const s0 = list.scrollTop;
    const move = ev => {
      const free = Math.max(1, bar.clientHeight - thumb.offsetHeight);
      smoothScrollTo(list, { top: s0 + ((ev.clientY - y0) * maxTop()) / free }, { instant: true });
    };
    const up = () => {
      wrap.classList.remove('dragging');
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', up);
      thumb.removeEventListener('pointercancel', up);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
    thumb.addEventListener('pointercancel', up);
  });
  bar.addEventListener('pointerdown', e => {
    if (e.target === thumb || e.button !== 0) return;
    e.preventDefault();
    const r = bar.getBoundingClientRect();
    const ratio = (e.clientY - r.top) / r.height;
    scrollToSmooth(ratio * list.scrollHeight - list.clientHeight / 2);
  });

  if (!scrollRO) scrollRO = new ResizeObserver(entries => { for (const en of entries) if (en.target._scroller) en.target._scroller.update(); });
  scrollRO.observe(list);
  new MutationObserver(() => requestAnimationFrame(update)).observe(list, { childList: true });
  const api = { wrap, update, scrollTo: scrollToSmooth, reset() { smoothScrollTo(list, { top: 0 }, { instant: true }); update(); } };
  list._scroller = api;
  requestAnimationFrame(update);
  return api;
}
