// Motion & UI primitives shared by the popup and the report.
// Hover motion never overshoots; bounce is saved for things that pop open.

import { smoothScrollTo, stopSmoothScroll } from './scroll.js';
export { initSmoothScrolling } from './scroll.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const POP = 'cubic-bezier(0.32, 1.24, 0.5, 1)';

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
    hide() {
      visible = false;
      el.classList.remove('on');
    },
    get visible() { return visible; },
  };
}

export function reveal() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
}

// ---------- sites: favicons & links ----------

let ORIGINS = {};
const iconCache = new Map();

export function setOrigins(map) {
  const next = map || {};
  for (const d of new Set([...Object.keys(ORIGINS), ...Object.keys(next)])) {
    if (ORIGINS[d] !== next[d]) iconCache.delete(d);
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

// Chrome keys icons by the exact address visited (www., port…), so try the
// address the site was really visited on first, then the usual spellings.
export function resolveFavicon(domain) {
  if (window.memoir?.windows) {
    const icon = window.memoir.apps[domain]?.icon;
    return Promise.resolve(domain.startsWith('app:') && /^[a-f0-9]{24}\.png$/.test(icon || '') ? `https://memoir-icons.example/${icon}` : null);
  }
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

const LOCK_GLYPH = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.4a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

export function faviconTile(domain, color) {
  const tile = document.createElement('span');
  tile.className = 'favicon';
  if (domain === '~private') {
    tile.classList.add('is-private');
    tile.innerHTML = LOCK_GLYPH;
    return tile;
  }
  const fallback = () => {
    tile.replaceChildren();
    tile.style.background = color || 'var(--label-3)';
    const letter = document.createElement('span'); letter.className = 'letter';
    letter.textContent = (domain.startsWith('app:') ? window.memoir.appName(domain) : domain || '?').charAt(0).toUpperCase();
    tile.appendChild(letter);
  };
  whenSeen(tile, () => resolveFavicon(domain).then(src => {
    if (!tile.isConnected) return;
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', fallback, { once: true });
      img.src = src;
      tile.appendChild(img);
      if (!reducedMotion()) img.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_OUT });
    } else {
      fallback();
    }
  }));
  return tile;
}

export const ARROW_SVG = '<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.4 8.6 8.4 3.6M4.4 3.4h4.2v4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A site name that opens the site; looks exactly like the text around it and
// shows a small ↗ on hover.
export function siteLinkHtml(domain, extra = '') {
  if (domain === '~private') return `<span class="private-name ${extra}">Private</span>`;
  if (domain.startsWith('app:')) return `<span class="app-name ${extra}" data-domain="${esc(domain)}" title="Windows app"><span class="sl-text">${esc(window.memoir.appName(domain))}</span></span>`;
  return `<a class="site-link ${extra}" href="${esc(siteHref(domain))}" target="_blank" rel="noopener noreferrer" data-domain="${esc(domain)}" title="Open ${esc(domain)}"><span class="sl-text">${esc(domain)}</span>${ARROW_SVG}</a>`;
}

export function siteLink(domain, extra = '') {
  const t = document.createElement('template');
  t.innerHTML = siteLinkHtml(domain, extra);
  return t.content.firstElementChild;
}

// ---------- morph: a surface that flies from one rect to another ----------

const px = n => `${Math.round(n * 100) / 100}px`;
const radiusFor = (r, rect) => (r === 'pill' || r === 'circle' ? Math.min(rect.width, rect.height) / 2 : r);

export function morph({
  from, to, fromRadius = 10, toRadius = 18, background = 'var(--raised)', fade = null,
  duration = 440, easing = EASE_OUT, z = 3000, shadow = true, className = '', parent = document.body,
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
    frame(from, fromRadius, fade === 'in' ? 0 : 1),
    frame(to, toRadius, fade === 'out' ? 0 : 1),
  ];
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

// A popover that grows out of the element that opened it and shrinks back into it.
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

  open(anchor, { fromRect = null, fromRadius = 8 } = {}) {
    const token = ++this.token;
    const el = this.el;
    this.anchor = anchor;
    el.getAnimations().forEach(a => a.cancel());
    if (this.shell) { this.shell.remove(); this.shell = null; }
    el.hidden = false;
    el.style.background = '';
    el.style.boxShadow = '';
    el.dataset.state = 'opening';
    el.style.opacity = '0';
    const src = fromRect || anchor.getBoundingClientRect();
    this.place(src);
    const to = el.getBoundingClientRect();
    const bg = getComputedStyle(el).backgroundColor;
    // the shell goes next to the popover (same stacking context), so the content shows above it
    const m = morph({ from: src, to, fromRadius, toRadius: this.radius, background: bg, duration: 460, easing: POP, z: this.z, parent: el.parentNode || document.body });
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
      if (!reducedMotion()) el.animate([{ opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1 }], { duration: 240, easing: EASE_OUT });
    };
    const early = setTimeout(show, reducedMotion() ? 0 : 150);
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
    if (this.shell) { this.shell.remove(); this.shell = null; }
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
    const from = el.getBoundingClientRect();
    const target = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
    const bg = getComputedStyle(el).backgroundColor;
    el.style.opacity = '0';
    if (!target || target.width === 0) { done(); return Promise.resolve(); }
    const m = morph({ from, to: target, fromRadius: this.radius, toRadius: 8, background: bg, fade: 'out', duration: 300, easing: EASE_OUT, z: this.z, parent: el.parentNode || document.body });
    return m.finished.then(shell => { shell.remove(); done(); });
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

export function initPetals(count = 10, sizes = [9, 16]) {
  if (reducedMotion()) return;
  const r = (a, b) => a + Math.random() * (b - a);
  const amb = document.createElement('div');
  amb.className = 'ambient';
  amb.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'petal';
    const dur = r(15, 26);
    p.style.cssText = `--x:${r(-3, 98).toFixed(1)}%;--size:${r(sizes[0], sizes[1]).toFixed(1)}px;--dur:${dur.toFixed(1)}s;--delay:${(-r(0, dur)).toFixed(1)}s;--drift:${r(-80, 80).toFixed(0)}px`;
    const inner = document.createElement('i');
    inner.style.cssText = `--img:var(${i % 2 ? '--petal-b' : '--petal-a'});--flutter:${r(2.8, 4.4).toFixed(1)}s;--alpha:${r(0.22, 0.45).toFixed(2)}`;
    p.appendChild(inner);
    amb.appendChild(p);
  }
  document.body.prepend(amb);
}

// ---------- smooth height changes ----------

// Runs `mutate`, then animates the element from its old height to its new one.
export function animateHeight(el, mutate, { duration = 380, easing = EASE_OUT } = {}) {
  if (!el) { mutate(); return Promise.resolve(); }
  const from = el.getBoundingClientRect().height;
  if (el._hAnim) { el._hAnim.cancel(); el._hAnim = null; }
  mutate();
  const to = el.getBoundingClientRect().height;
  if (reducedMotion() || Math.abs(to - from) < 0.5) {
    if (el._hOverflow != null) { el.style.overflow = el._hOverflow; el._hOverflow = null; }
    return Promise.resolve();
  }
  // remember the element's own overflow once, so back-to-back runs can't leave it clipped
  if (el._hOverflow == null) el._hOverflow = el.style.overflow;
  el.style.overflow = 'clip';
  const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing });
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
