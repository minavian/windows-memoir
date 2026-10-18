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

// A smooth line through the points (monotone, so it never overshoots a value).
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const n = pts.length;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
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
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${(x0 + h).toFixed(1)} ${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

// Linear resample of a polyline to n points, so two lines of different lengths can morph.
function resample(pts, n) {
  if (!pts.length) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [...pts[0]]);
  const out = [];
  for (let k = 0; k < n; k++) {
    const f = (k / (n - 1)) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
  }
  return out;
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
    this.pts = [];
    this.data = [];
    this.cancel = null;
    this.hoverIdx = -1;
    this.wire();
  }

  size() {
    const r = this.host.getBoundingClientRect();
    return { w: Math.max(120, r.width), h: Math.max(90, r.height) };
  }

  // data: [{ start: Date, avg: ms|null, total, days, focus }]; limit: ms|null
  setData(data, { limit = null, animate = true } = {}) {
    const first = !this.data.length;
    const prevPts = this.pts;
    this.data = data;
    this.limit = limit;
    const { w, h } = this.size();
    this.w = w;
    this.h = h;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);

    const shown = data.filter(d => d.avg != null);
    const max = Math.max(...shown.map(d => d.avg), limit && limit < Math.max(1, ...shown.map(d => d.avg)) * 1.8 ? limit : 0, 60_000);
    const step = niceStep(max);
    this.top = Math.max(step, Math.ceil(max / step) * step);
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const n = data.length;
    this.x = i => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    this.y = v => PAD.top + plotH - (v / this.top) * plotH;
    this.pts = data.map((d, i) => (d.avg == null ? null : [this.x(i), this.y(d.avg)]));

    const calm = reducedMotion() || !animate;
    this.drawGrid(step, calm);
    this.drawRefs(shown, calm);
    this.drawX(calm);
    this.drawDots(calm || !first);
    this.hideHover();

    const next = this.pts.filter(Boolean);
    if (this.cancel) this.cancel();
    if (calm) { this.setLine(next); this.showNow(true); return; }
    if (first || prevPts.filter(Boolean).length < 2 || next.length < 2) {
      this.drawIn(next);
      return;
    }
    // morph: both lines resampled to the same number of points, then eased across
    const from = prevPts.filter(Boolean);
    const count = Math.max(from.length, next.length, 24);
    const a = resample(from, count);
    const b = resample(next, count);
    this.gDots.style.opacity = '0';
    this.nowGroup.style.opacity = '0';
    this.cancel = tween(720, p => {
      const cur = a.map((q, k) => [q[0] + (b[k][0] - q[0]) * p, q[1] + (b[k][1] - q[1]) * p]);
      this.paint(cur, false);
      if (p >= 1) {
        this.setLine(next);
        this.gDots.style.opacity = '';
        this.popDots();
        this.showNow(false);
        this.cancel = null;
      }
    }, { ease: easeInOut });
  }

  paint(pts, smooth = true) {
    const d = smooth ? smoothPath(pts) : `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`;
    this.line.setAttribute('d', d);
    if (pts.length > 1) {
      const base = this.h - PAD.bottom;
      this.area.setAttribute('d', `${d}L${pts[pts.length - 1][0].toFixed(1)} ${base}L${pts[0][0].toFixed(1)} ${base}Z`);
    } else this.area.setAttribute('d', '');
  }

  setLine(pts) {
    this.line.style.strokeDasharray = '';
    this.line.style.strokeDashoffset = '';
    this.paint(pts);
  }

  drawIn(pts) {
    this.setLine(pts);
    const len = this.line.getTotalLength ? this.line.getTotalLength() : 0;
    this.line.style.strokeDasharray = `${len} ${len}`;
    this.line.style.strokeDashoffset = `${len}`;
    this.line.getBoundingClientRect();
    this.line.animate([{ strokeDashoffset: `${len}px` }, { strokeDashoffset: '0px' }], { duration: 1100, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' })
      .finished.then(() => { this.line.getAnimations().forEach(a => a.cancel()); this.line.style.strokeDasharray = ''; this.line.style.strokeDashoffset = ''; }, () => {});
    this.area.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
    this.popDots(1100);
    this.nowGroup.style.opacity = '0';
    setTimeout(() => this.showNow(false), 950);
  }

  drawGrid(step, calm) {
    const old = [...this.gGrid.children];
    for (const o of old) {
      if (calm) o.remove();
      else o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => o.remove(), () => o.remove());
    }
    for (let v = 0; v <= this.top + 1; v += step) {
      const y = this.y(v);
      const g = el('g', {}, this.gGrid);
      el('line', { x1: PAD.left, x2: this.w - PAD.right + 6, y1: y, y2: y, class: v === 0 ? 'base' : '' }, g);
      const t = el('text', { x: this.w - 2, y, dy: '0.35em', 'text-anchor': 'end' }, g);
      t.textContent = fmt(v);
      if (!calm) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150, fill: 'backwards' });
    }
  }

  drawRefs(shown, calm) {
    this.gRef.textContent = '';
    const vals = shown.filter(d => !d.focus).map(d => d.avg);
    const lines = [];
    if (vals.length) lines.push(['avg', vals.reduce((a, b) => a + b, 0) / vals.length, 'Average of the other weeks']);
    if (this.limit && this.limit <= this.top) lines.push(['limit', this.limit, 'Your daily limit']);
    for (const [cls, v, label] of lines) {
      const y = this.y(v);
      const g = el('g', { class: `tr-${cls}` }, this.gRef);
      el('line', { x1: PAD.left, x2: this.w - PAD.right, y1: y, y2: y }, g);
      // labelled at the left end, clear of the dot for the week you're viewing
      const t = el('text', { x: PAD.left + 2, y: y - 5 }, g);
      t.textContent = cls === 'avg' ? `avg ${fmt(v)}` : `limit ${fmt(v)}`;
      const tt = el('title', {}, g);
      tt.textContent = `${label}: ${fmt(v)}`;
      if (!calm) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 700, fill: 'backwards' });
    }
    this.avgValue = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  drawX(calm) {
    this.gX.textContent = '';
    const n = this.data.length;
    const plotW = this.w - PAD.left - PAD.right;
    const every = Math.max(1, Math.ceil(58 / Math.max(1, plotW / Math.max(1, n - 1))));
    this.data.forEach((d, i) => {
      const last = i === n - 1;
      if (!last && (n - 1 - i) % every !== 0) return;
      if (!last && n - 1 - i < every) return;
      const t = el('text', { x: this.x(i), y: this.h - 6, 'text-anchor': i === 0 && n > 1 ? 'start' : last && n > 1 ? 'end' : 'middle', class: d.focus ? 'focus' : '' }, this.gX);
      t.textContent = monthDay.format(d.start);
    });
    if (!calm) this.gX.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 120, fill: 'backwards' });
  }

  drawDots(skipPop) {
    this.gDots.textContent = '';
    const n = this.data.length;
    const dense = n > 26;
    this.data.forEach((d, i) => {
      if (d.avg == null || d.focus || dense) return;
      const c = el('circle', { cx: this.x(i), cy: this.y(d.avg), r: 4, class: 'tr-dot' }, this.gDots);
      c.dataset.i = i;
    });
    if (skipPop) return;
    this.gDots.style.opacity = '0';
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
  }
}
