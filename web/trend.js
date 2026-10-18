// Trend over time: the daily average of each week as one line.
// Draws in on first show; switching the range morphs the line into its new shape.

import { formatDuration as fmt } from './shared/core.js';
import { reducedMotion, tween } from './shared/fx.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 26, right: 44, bottom: 26, left: 8 };
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function el(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function niceStep(maxMs) {
  const mins = [15, 30, 60, 120, 180, 240, 360, 480, 720];
  for (const m of mins) if (maxMs / (m * 60_000) <= 4) return m * 60_000;
  return 1440 * 60_000;
}

const WEEK = 7 * 86400000;
// a week's number: the same week is the same number in any range (rounded, so a
// daylight-saving hour doesn't move it)
const weekNo = d => Math.round(d.getTime() / WEEK);
const lerp = (a, b, p) => a + (b - a) * p;
let clipIds = 0;

// The line's slope at each point, in value per week (monotone, so it never overshoots
// a value). Worked out on the weeks and values themselves, not on the screen, so the
// same curve can be drawn at any zoom: switching the range only moves the camera.
function withTangents(pts) {
  const n = pts.length;
  if (n < 2) return pts.map(q => ({ ...q, T: 0 }));
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].u - pts[i].u);
    m.push((pts[i + 1].v - pts[i].v) / (dx[i] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return pts.map((q, i) => ({ ...q, T: t[i] }));
}

// The smooth line through [{ u, v, T }], drawn through X(week) and Y(value).
function curvePath(pts, X, Y) {
  if (!pts.length) return '';
  const f = n => n.toFixed(1);
  let d = `M${f(X(pts[0].u))} ${f(Y(pts[0].v))}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const h = (b.u - a.u) / 3;
    d += `C${f(X(a.u + h))} ${f(Y(a.v + a.T * h))} ${f(X(b.u - h))} ${f(Y(b.v - b.T * h))} ${f(X(b.u))} ${f(Y(b.v))}`;
  }
  return d;
}

export class TrendChart {
  constructor(host, { onHover, onLeave, onPick } = {}) {
    this.host = host;
    this.onHover = onHover;
    this.onLeave = onLeave;
    this.onPick = onPick;
    this.svg = el('svg', { class: 'tr-svg', role: 'img' }, host);
    this.gGrid = el('g', { class: 'tr-grid' }, this.svg);
    this.gRef = el('g', { class: 'tr-ref' }, this.svg);
    this.area = el('path', { class: 'tr-area' }, this.svg);
    this.line = el('path', { class: 'tr-line' }, this.svg);
    this.gX = el('g', { class: 'tr-x' }, this.svg);
    this.cross = el('line', { class: 'tr-cross' }, this.svg);
    this.gDots = el('g', { class: 'tr-dots' }, this.svg);
    this.hoverDot = el('circle', { class: 'tr-hover', r: 5 }, this.svg);
    this.nowGroup = el('g', { class: 'tr-now' }, this.svg);
    // while the range switches, what's leaving or arriving past the plot's edges is cut there
    const defs = el('defs', {}, this.svg);
    const id = ++clipIds;
    this.clipLine = el('rect', {}, el('clipPath', { id: `tr-clip-${id}` }, defs));
    this.clipDots = el('rect', {}, el('clipPath', { id: `tr-clipd-${id}` }, defs));
    this.clipId = id;
    this.els = { grid: new Map(), x: new Map(), refs: new Map(), dots: new Map() };
    this.cam = null; // what the plot shows right now: weeks u0…u1, values 0…top
    this.curve = []; // the line as drawn right now: [{ u, v, T }]
    this.focus = null;
    this.pts = [];
    // its box can still be settling when it first draws (the view arriving): it fits itself
    // to whatever size the box ends up
    this.ro = new ResizeObserver(() => this.relayout());
    this.ro.observe(host);
    this.data = [];
    this.cancel = null;
    this.hoverIdx = -1;
    this.wire();
  }

  // its laid-out size: not getBoundingClientRect, which a view still scaling in would
  // shrink, leaving the first drawing small until the next one
  size() {
    return { w: Math.max(120, this.host.offsetWidth), h: Math.max(90, this.host.offsetHeight) };
  }

  // where a week and a value are drawn, for a camera { u0, u1, top }
  X(cam, u) {
    const span = cam.u1 - cam.u0;
    return PAD.left + (span < 1e-6 ? this.plotW / 2 : ((u - cam.u0) / span) * this.plotW);
  }
  Y(cam, v) {
    return PAD.top + this.plotH - (v / cam.top) * this.plotH;
  }

  // data: [{ start: Date, avg: ms|null, total, days, focus }]; limit: ms|null
  // The first show draws the line in. Switching the range moves one camera over the same
  // weeks: each keeps its date and value, so the line stays smooth while it zooms, weeks
  // slide out past an edge or in from one, and the scale, grid, dates, average line and
  // dots glide with it (fading only where they come or go). It starts from exactly what's
  // on screen (even mid-switch) and lands exactly on the new chart.
  setData(data, { limit = null, animate = true } = {}) {
    const first = !this.data.length || !this.cam;
    this.data = data;
    this.limit = limit;
    this.fit();

    const shown = data.filter(d => d.avg != null);
    const max = Math.max(...shown.map(d => d.avg), limit && limit < Math.max(1, ...shown.map(d => d.avg)) * 1.8 ? limit : 0, 60_000);
    const step = niceStep(max);
    const n = data.length;
    const cam = { u0: weekNo(data[0].start), u1: weekNo(data[n - 1].start), top: Math.max(step, Math.ceil(max / step) * step) };
    this.top = cam.top;
    this.x = i => this.X(cam, weekNo(data[i].start));
    this.y = v => this.Y(cam, v);
    this.pts = data.map((d, i) => (d.avg == null ? null : [this.x(i), this.y(d.avg)]));

    const scene = {
      cam,
      curve: withTangents(shown.map(d => ({ u: weekNo(d.start), v: d.avg }))),
      grid: [],
      x: [],
      refs: [],
      dots: [],
    };
    for (let v = 0; v <= cam.top + 1; v += step) scene.grid.push({ key: v, v });
    const every = Math.max(1, Math.ceil(58 / Math.max(1, this.plotW / Math.max(1, n - 1))));
    data.forEach((d, i) => {
      const last = i === n - 1;
      if (!last && ((n - 1 - i) % every !== 0 || n - 1 - i < every)) return;
      const anchor = i === 0 && n > 1 ? 'start' : last && n > 1 ? 'end' : 'middle';
      const u = weekNo(d.start);
      scene.x.push({ key: `${u}|${anchor}|${d.focus ? 1 : 0}`, u, anchor, focus: !!d.focus, text: monthDay.format(d.start) });
    });
    const vals = shown.filter(d => !d.focus).map(d => d.avg);
    this.avgValue = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    if (this.avgValue != null) scene.refs.push({ key: 'avg', v: this.avgValue, label: 'Average of the other weeks' });
    if (limit && limit <= cam.top) scene.refs.push({ key: 'limit', v: limit, label: 'Your daily limit' });
    if (n <= 26) data.forEach((d, i) => { if (d.avg != null && !d.focus) scene.dots.push({ key: weekNo(d.start), u: weekNo(d.start), i }); });
    const f = data.findIndex(d => d.focus);
    scene.focus = f >= 0 && data[f].avg != null ? { u: weekNo(data[f].start), edge: f === 0 ? 'start' : f === n - 1 ? 'end' : 'middle' } : null;

    this.hideHover();
    if (this.cancel) { this.cancel(); this.cancel = null; }
    clearTimeout(this.nowTimer);
    const calm = reducedMotion() || !animate;
    if (first || calm || this.curve.length < 2 || scene.curve.length < 2) this.build(scene, { intro: !calm });
    else this.morph(scene);
  }

  // the drawing's size: the box's
  fit() {
    const { w, h } = this.size();
    this.w = w;
    this.h = h;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.plotW = w - PAD.left - PAD.right;
    this.plotH = h - PAD.top - PAD.bottom;
    // the line is cut at the plot's edges; the dots a little outside them (their size)
    for (const [r, m] of [[this.clipLine, 0], [this.clipDots, 7]]) {
      for (const [k, v] of Object.entries({ x: PAD.left - m, y: 0, width: this.plotW + 2 * m, height: h })) r.setAttribute(k, v);
    }
  }

  // the box changed size: the same chart, redrawn to fit (a switch under way just goes on
  // at the new size)
  relayout() {
    if (!this.host.isConnected) { this.ro.disconnect(); return; } // the view has gone
    if (!this.cam) return;
    const { w, h } = this.size();
    if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5) return;
    this.fit();
    if (this.cancel) return;
    const at = new Map(this.curve.map(q => [q.u, q.v]));
    this.paint(this.curve, this.cam);
    this.place(this.cam, 1, u => at.get(u));
    if (this.focus) this.placeNow(this.cam, at.get(this.focus.u));
  }

  // ---- what glides is kept by key, so a grid line, date, average line or dot that's in
  // both ranges is the same element all the way through ----
  make(kind, item) {
    if (kind === 'grid') {
      const g = el('g', {}, this.gGrid);
      el('line', { x1: PAD.left, class: item.v === 0 ? 'base' : '' }, g);
      el('text', { dy: '0.35em', 'text-anchor': 'end' }, g).textContent = fmt(item.v);
      return g;
    }
    if (kind === 'x') {
      const t = el('text', { 'text-anchor': item.anchor, class: item.focus ? 'focus' : '' }, this.gX);
      t.textContent = item.text;
      return t;
    }
    if (kind === 'refs') {
      const g = el('g', { class: `tr-${item.key}` }, this.gRef);
      el('line', { x1: PAD.left }, g);
      el('text', { x: PAD.left + 2 }, g); // labelled at the left end, clear of the week you're viewing
      el('title', {}, g);
      return g;
    }
    return el('circle', { r: 4, class: 'tr-dot' }, this.gDots);
  }

  // the new scene's elements: those staying fade from wherever they are to full, those
  // leaving to nothing, new ones in from nothing
  sync(scene) {
    for (const kind of ['grid', 'x', 'refs', 'dots']) {
      const map = this.els[kind];
      const want = new Map(scene[kind].map(it => [it.key, it]));
      for (const [key, e] of map) {
        e._from = e._op ?? 1;
        e._to = want.has(key) ? 1 : 0;
        e._v0 = e._v ?? e._item.v;
        if (want.has(key)) e._item = want.get(key);
      }
      for (const it of scene[kind]) {
        if (map.has(it.key)) continue;
        const e = this.make(kind, it);
        Object.assign(e, { _item: it, _from: 0, _to: 1, _op: 0, _v0: it.v });
        e.style.opacity = '0';
        map.set(it.key, e);
      }
    }
  }

  // everything placed for a camera, p of the way through a switch (1: at rest)
  place(cam, p, valueAt) {
    const { grid, x, refs, dots } = this.els;
    for (const g of grid.values()) {
      const y = this.Y(cam, g._item.v).toFixed(1);
      const [line, text] = g.children;
      line.setAttribute('x2', this.w - PAD.right + 6);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      text.setAttribute('x', this.w - 2);
      text.setAttribute('y', y);
    }
    for (const t of x.values()) {
      t.setAttribute('x', this.X(cam, t._item.u).toFixed(1));
      t.setAttribute('y', this.h - 6);
    }
    for (const g of refs.values()) {
      const v = g._to ? lerp(g._v0, g._item.v, p) : g._v0;
      g._v = v;
      const y = this.Y(cam, v);
      const [line, text, title] = g.children;
      line.setAttribute('x2', this.w - PAD.right);
      line.setAttribute('y1', y.toFixed(1));
      line.setAttribute('y2', y.toFixed(1));
      text.setAttribute('y', (y - 5).toFixed(1));
      const words = `${g._item.key} ${fmt(v)}`;
      if (text.textContent !== words) text.textContent = words;
      if (p >= 1) title.textContent = `${g._item.label}: ${fmt(v)}`;
    }
    for (const c of dots.values()) {
      const v = valueAt(c._item.u);
      if (v == null) continue;
      c.setAttribute('cx', this.X(cam, c._item.u).toFixed(1));
      c.setAttribute('cy', this.Y(cam, v).toFixed(1));
      c.dataset.i = c._item.i;
    }
    // what's leaving is gone by 60% of the way, what's arriving comes in over the last 60%,
    // so old and new dates never crowd each other
    const out = Math.min(1, p / 0.6);
    const into = Math.max(0, (p - 0.4) / 0.6);
    for (const map of [grid, x, refs, dots]) {
      for (const e of map.values()) {
        const op = e._to ? lerp(e._from, 1, into) : e._from * (1 - out);
        e._op = op;
        e.style.opacity = p >= 1 ? '' : op.toFixed(3);
      }
    }
  }

  // the line and its shaded area
  paint(curve, cam) {
    const X = u => this.X(cam, u);
    const Y = v => this.Y(cam, v);
    const d = curvePath(curve, X, Y);
    this.line.setAttribute('d', d);
    if (curve.length > 1) {
      const base = this.h - PAD.bottom;
      this.area.setAttribute('d', `${d}L${X(curve[curve.length - 1].u).toFixed(1)} ${base}L${X(curve[0].u).toFixed(1)} ${base}Z`);
    } else this.area.setAttribute('d', '');
  }

  // straight to a scene: the first show (drawn in), a calm redraw, or too few weeks to morph
  build(scene, { intro }) {
    for (const map of Object.values(this.els)) {
      for (const e of map.values()) {
        if (intro && e.parentNode === this.gGrid) {
          e.animate([{ opacity: e._op ?? 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => e.remove(), () => e.remove());
        } else e.remove();
      }
      map.clear();
    }
    this.sync(scene);
    this.cam = scene.cam;
    this.curve = scene.curve;
    this.focus = scene.focus;
    const at = new Map(scene.curve.map(q => [q.u, q.v]));
    this.place(scene.cam, 1, u => at.get(u));
    this.line.getAnimations().forEach(a => a.cancel());
    this.line.style.strokeDasharray = '';
    this.line.style.strokeDashoffset = '';
    this.paint(scene.curve, scene.cam);
    if (!intro) { this.showNow(true); return; }
    for (const g of this.els.grid.values()) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150, fill: 'backwards' });
    this.gX.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 120, fill: 'backwards' });
    for (const g of this.els.refs.values()) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 700, fill: 'backwards' });
    this.drawIn();
  }

  drawIn() {
    const len = this.line.getTotalLength ? this.line.getTotalLength() : 0;
    this.line.style.strokeDasharray = `${len} ${len}`;
    this.line.style.strokeDashoffset = `${len}`;
    this.line.getBoundingClientRect();
    this.line.animate([{ strokeDashoffset: `${len}px` }, { strokeDashoffset: '0px' }], { duration: 1100, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' })
      .finished.then(() => { this.line.getAnimations().forEach(a => a.cancel()); this.line.style.strokeDasharray = ''; this.line.style.strokeDashoffset = ''; }, () => {});
    this.area.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
    this.gDots.style.opacity = '0';
    this.popDots(1100);
    this.nowGroup.style.opacity = '0';
    this.nowTimer = setTimeout(() => this.showNow(false), 950);
  }

  // one camera, from what's on screen to the new range
  morph(scene) {
    const from = { ...this.cam };
    const to = scene.cam;
    const was = new Map(this.curve.map(q => [q.u, q]));
    const now = new Map(scene.curve.map(q => [q.u, q]));
    // every week either range has, in order; one only one of them has keeps its own value
    // and slope, and slides off (or in) past an edge
    const pairs = [...new Set([...was.keys(), ...now.keys()])].sort((a, b) => a - b)
      .map(u => { const a = was.get(u) || now.get(u); return { u, a, b: now.get(u) || a }; });
    // a draw-in still running finishes now: the line is whole from here
    for (const e of [this.line, this.area, this.gX, this.gDots, ...this.gDots.children, ...this.gGrid.children, ...this.gRef.children]) {
      e.getAnimations().forEach(a => a.cancel());
    }
    this.line.style.strokeDasharray = '';
    this.line.style.strokeDashoffset = '';
    this.gDots.style.opacity = '';
    this.sync(scene);
    // the week you're viewing rides along when it's the same one in both; otherwise it
    // fades and comes back once the line has landed
    const keepNow = !!(this.focus && scene.focus && this.focus.u === scene.focus.u && this.focus.edge === scene.focus.edge && this.nowGroup.children.length && this.nowGroup.style.opacity !== '0');
    this.nowGroup.getAnimations().forEach(a => a.finish());
    if (!keepNow) this.nowGroup.style.opacity = '0';
    const clip = `url(#tr-clip-${this.clipId})`;
    this.line.setAttribute('clip-path', clip);
    this.area.setAttribute('clip-path', clip);
    this.gDots.setAttribute('clip-path', `url(#tr-clipd-${this.clipId})`);
    const frame = p => {
      const cam = { u0: lerp(from.u0, to.u0, p), u1: lerp(from.u1, to.u1, p), top: lerp(from.top, to.top, p) };
      this.cam = cam;
      const cur = pairs.map(({ u, a, b }) => ({ u, v: lerp(a.v, b.v, p), T: lerp(a.T, b.T, p) }));
      this.curve = cur;
      const at = new Map(cur.map(q => [q.u, q.v]));
      this.paint(cur, cam);
      this.place(cam, p, u => at.get(u));
      if (keepNow) this.placeNow(cam, at.get(scene.focus.u));
      if (p < 1) return;
      // landed: exactly the new chart, with nothing left past the edges
      this.cancel = null;
      this.cam = to;
      this.curve = scene.curve;
      this.paint(scene.curve, to);
      for (const map of Object.values(this.els)) {
        for (const [key, e] of map) if (!e._to) { e.remove(); map.delete(key); }
      }
      this.line.removeAttribute('clip-path');
      this.area.removeAttribute('clip-path');
      this.gDots.removeAttribute('clip-path');
      this.focus = scene.focus;
      if (keepNow) this.placeNow(to, now.get(scene.focus.u).v);
      else this.showNow(false);
    };
    frame(0);
    this.cancel = tween(720, frame, { ease: easeInOut });
  }

  popDots(span = 0) {
    this.gDots.style.opacity = '';
    if (reducedMotion()) return;
    const n = Math.max(1, this.data.length - 1);
    for (const c of this.gDots.children) {
      const i = +c.dataset.i;
      c.animate([{ r: '0px', opacity: 0 }, { r: '4px', opacity: 1 }], { duration: 380, delay: span ? (i / n) * span * 0.85 : i * 18, easing: 'cubic-bezier(0.32, 1.24, 0.5, 1)', fill: 'backwards' });
    }
  }

  // the week you're looking at: a bigger dot with its value above it
  showNow(calm) {
    this.nowGroup.textContent = '';
    this.nowGroup.style.opacity = '';
    const i = this.data.findIndex(d => d.focus);
    if (i < 0 || this.data[i].avg == null) return;
    const x = this.x(i);
    const y = this.y(this.data[i].avg);
    const ring = el('circle', { cx: x, cy: y, r: 6, class: 'tr-now-ring' }, this.nowGroup);
    el('circle', { cx: x, cy: y, r: 6, class: 'tr-now-dot' }, this.nowGroup);
    const label = el('text', { x, y: y - 14, 'text-anchor': i === 0 ? 'start' : i === this.data.length - 1 ? 'end' : 'middle', class: 'tr-now-label' }, this.nowGroup);
    label.textContent = fmt(this.data[i].avg);
    if (calm || reducedMotion()) return;
    this.nowGroup.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    ring.animate([{ r: '6px', opacity: 0.55 }, { r: '16px', opacity: 0 }], { duration: 1100, delay: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }

  // the same week's dot and value, carried by the camera
  placeNow(cam, v) {
    if (v == null || this.nowGroup.children.length < 3) return;
    const x = this.X(cam, this.focus.u).toFixed(1);
    const y = this.Y(cam, v);
    const [ring, dot, label] = this.nowGroup.children;
    for (const c of [ring, dot]) { c.setAttribute('cx', x); c.setAttribute('cy', y.toFixed(1)); }
    label.setAttribute('x', x);
    label.setAttribute('y', (y - 14).toFixed(1));
    const words = fmt(v);
    if (label.textContent !== words) label.textContent = words;
  }

  hideHover() {
    this.hoverIdx = -1;
    this.svg.classList.remove('hovering');
    if (this.onLeave) this.onLeave();
  }

  wire() {
    const pick = e => {
      const r = this.svg.getBoundingClientRect();
      const x = e.clientX - r.left;
      let best = -1;
      let bd = Infinity;
      this.data.forEach((d, i) => {
        if (d.avg == null) return;
        const dd = Math.abs(this.x(i) - x);
        if (dd < bd) { bd = dd; best = i; }
      });
      return best;
    };
    this.svg.addEventListener('pointermove', e => {
      const i = pick(e);
      if (i < 0) return;
      const d = this.data[i];
      const x = this.x(i);
      const y = this.y(d.avg);
      // the crosshair and its dot glide from week to week
      const fresh = !this.svg.classList.contains('hovering');
      if (fresh) { this.cross.style.transition = 'none'; this.hoverDot.style.transition = 'none'; }
      this.cross.setAttribute('x1', 0);
      this.cross.setAttribute('x2', 0);
      this.cross.setAttribute('y1', PAD.top - 8);
      this.cross.setAttribute('y2', this.h - PAD.bottom);
      this.cross.style.transform = `translateX(${x.toFixed(1)}px)`;
      this.hoverDot.style.cx = `${x.toFixed(1)}px`;
      this.hoverDot.style.cy = `${y.toFixed(1)}px`;
      if (fresh) { this.cross.getBoundingClientRect(); this.cross.style.transition = ''; this.hoverDot.style.transition = ''; }
      this.svg.classList.add('hovering');
      if (i !== this.hoverIdx) {
        this.hoverIdx = i;
        const r = this.svg.getBoundingClientRect();
        if (this.onHover) this.onHover(d, r.left + x, r.top + y, this.avgValue);
      } else if (this.onHover) {
        const r = this.svg.getBoundingClientRect();
        this.onHover(null, r.left + x, r.top + y);
      }
    });
    this.svg.addEventListener('pointerleave', () => this.hideHover());
    this.svg.addEventListener('click', e => {
      const i = pick(e);
      if (i >= 0 && this.onPick) this.onPick(this.data[i]);
    });
  }

  destroy() {
    if (this.cancel) this.cancel();
    this.ro.disconnect();
  }
}
