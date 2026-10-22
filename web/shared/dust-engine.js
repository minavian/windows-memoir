/*! Made with care and love by Mina Vian */
// Dust: a cloud of fine specks drifting over a hidden word (the sites under Never track).
// Each speck fades in and out on its own clock, so the cloud shimmers without moving as a
// whole; stirring it (hover, a first click) makes it livelier. Revealing blows the specks
// away from a point, a ring at a time, while the word shows through from there; hiding
// lets a fresh cloud settle back in. The cloud fills a pill and thins out towards the
// pill's rounded edge, so it has no hard border.
//
// Fields are drawn by a Runner: in a worker (dust-worker.js) on OffscreenCanvases, so none
// of this costs the page a thing, or on this thread where that isn't possible. A field
// that's off screen, or fully revealed, isn't drawn at all; with nothing to draw the loop
// stops. Specks are white; the page tints them to the theme (CSS filter on the canvas).

const TAU = Math.PI * 2;
const DENSITY = 7.5;   // css px² per fine speck
const HAZE = 55;       // css px² per soft blot (the blur under the specks)
const EDGE = 3.5;      // css px over which the cloud thins out at its edges
const easeOut = t => 1 - Math.pow(1 - t, 3);

let sprite = null;
function getSprite() {
  if (sprite) return sprite;
  const S = 32;
  sprite = new OffscreenCanvas(S, S);
  const g = sprite.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return sprite;
}

export class Dust {
  constructor(canvas, { w = 1, h = 1, dpr = 1, shown = false, still = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.still = still;
    this.heat = 1;        // how lively the specks are (eases towards heatTo)
    this.heatTo = 1;
    this.fade = shown ? 0 : 1;
    this.fadeTo = this.fade;
    this.wave = null;     // revealing: { x, y, t, max }
    this.state = shown ? 'shown' : 'hidden';
    this.resize(w, h, dpr);
  }

  resize(w, h, dpr) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    // soft blots first (drawn underneath, a blurred-looking haze), then the fine specks
    this.soft = Math.max(3, Math.min(200, Math.round((this.w * this.h) / HAZE)));
    const n = this.soft + Math.max(12, Math.min(1400, Math.round((this.w * this.h) / DENSITY)));
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.amax = new Float32Array(n);
    this.gone = new Float32Array(n);   // 1, falling to 0 once the reveal has blown it away
    this.hit = new Uint8Array(n);      // the reveal's ring has reached it
    for (let i = 0; i < n; i++) this.spawn(i, true);
    if (this.state === 'revealing') this.finishReveal();
    this.draw();
  }

  spawn(i, anywhere) {
    const soft = i < this.soft;
    this.x[i] = Math.random() * this.w;
    this.y[i] = soft ? this.h * (0.3 + Math.random() * 0.4) : Math.random() * this.h;
    const a = Math.random() * TAU;
    // css px a second: the haze barely moves, the specks drift
    const s = soft ? 0.8 + Math.random() * 2.2 : 2.5 + Math.random() * 8;
    this.vx[i] = Math.cos(a) * s;
    this.vy[i] = Math.sin(a) * s * (soft ? 0.4 : 1);
    this.life[i] = soft ? 2.4 + Math.random() * 2.6 : 0.6 + Math.random() * 1.5;
    this.age[i] = anywhere ? Math.random() * this.life[i] : 0;
    this.size[i] = soft ? 3.2 + Math.random() * 3 : 0.45 + Math.random() * 0.5;
    this.amax[i] = soft ? 0.07 + Math.random() * 0.08 : 0.45 + Math.random() * 0.55;
    this.gone[i] = 1;
    this.hit[i] = 0;
  }

  // the first of two clicks: a small puff from where it landed
  poke(px, py) {
    if (this.state !== 'hidden') return;
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - px;
      const dy = this.y[i] - py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 22) continue;
      const k = (1 - d / 22) * 46;
      this.vx[i] += (dx / d) * k;
      this.vy[i] += (dy / d) * k;
    }
  }

  reveal(px, py) {
    if (this.state === 'shown') return;
    if (this.still) { this.finishReveal(); return; }
    const max = Math.hypot(Math.max(px, this.w - px), Math.max(py, this.h - py)) + 4;
    this.wave = { x: px, y: py, t: 0, max };
    this.state = 'revealing';
  }

  finishReveal() {
    this.wave = null;
    this.state = 'shown';
    this.fade = 0;
    this.fadeTo = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  conceal(instant = false) {
    this.wave = null;
    this.state = 'hidden';
    for (let i = 0; i < this.n; i++) this.spawn(i, true);
    this.fadeTo = 1;
    if (instant || this.still) this.fade = 1;
    else {
      this.fade = 0;
      this.heat = 2.4; // settles in lively, then calms down
    }
  }

  get busy() { return this.state !== 'shown'; }

  // dt in seconds; returns whether it still has something to draw
  step(dt) {
    if (this.state === 'shown') return false;
    if (this.still) return false;
    const k = 1 - Math.exp(-dt / 0.22);
    this.heat += (this.heatTo - this.heat) * k;
    this.fade += (this.fadeTo - this.fade) * (1 - Math.exp(-dt / 0.16));
    if (Math.abs(this.fadeTo - this.fade) < 0.002) this.fade = this.fadeTo;
    const wave = this.wave;
    let r = 0;
    if (wave) {
      wave.t = Math.min(1, wave.t + dt / 0.62);
      r = wave.max * easeOut(wave.t);
    }
    const heat = this.heat;
    const clock = 0.55 + 0.45 * heat;
    const blow = Math.exp(-dt / 0.13);
    let left = 0;
    const { w, h } = this;
    for (let i = 0; i < this.n; i++) {
      if (wave && !this.hit[i]) {
        const dx = this.x[i] - wave.x;
        const dy = this.y[i] - wave.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d <= r) {
          this.hit[i] = 1;
          const s = 60 + Math.random() * 120;
          this.vx[i] += (dx / d) * s;
          this.vy[i] += (dy / d) * s;
        }
      }
      if (this.hit[i]) {
        this.gone[i] *= blow;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        if (this.gone[i] > 0.02) left++;
        continue;
      }
      if (wave) left++;
      this.age[i] += dt * clock;
      if (this.age[i] >= this.life[i]) { this.spawn(i, false); continue; }
      // a nudge back towards a calm drift after a puff
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      if (sp > 10.5) { const f = Math.exp(-dt / 0.35); this.vx[i] *= f; this.vy[i] *= f; }
      this.x[i] += this.vx[i] * dt * heat;
      this.y[i] += this.vy[i] * dt * heat;
      if (this.x[i] < 0) this.x[i] += w; else if (this.x[i] > w) this.x[i] -= w;
      if (this.y[i] < 0) this.y[i] += h; else if (this.y[i] > h) this.y[i] -= h;
    }
    if (wave && wave.t >= 1 && left === 0) { this.finishReveal(); return false; }
    return true;
  }

  draw() {
    const { ctx, dpr, w, h } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.state === 'shown' || this.fade <= 0.001) return;
    const img = getSprite();
    const fade = this.fade;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i];
      const y = this.y[i];
      const life = Math.sin(Math.PI * Math.min(1, this.age[i] / this.life[i]));
      // thinner towards the pill's edge, so the cloud has no border
      const R = h / 2;
      const inner = R - Math.hypot(x - Math.max(R, Math.min(w - R, x)), y - R);
      const edge = Math.min(1, (inner - this.size[i] * 0.9) / EDGE);
      const a = this.amax[i] * life * this.gone[i] * fade * Math.max(0, edge);
      if (a < 0.015) continue;
      const r = this.size[i] * dpr * (this.hit[i] ? 1.25 : 1);
      ctx.globalAlpha = a;
      ctx.drawImage(img, x * dpr - r, y * dpr - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Draws every field in one loop, only while one of them has something to show.
export class Runner {
  constructor(raf) {
    this.raf = raf;
    this.fields = new Map();
    this.frameId = 0;
    this.last = 0;
    this.paused = false;
    this.frame = this.frame.bind(this);
  }

  frame(now) {
    this.frameId = 0;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    let busy = false;
    for (const f of this.fields.values()) {
      if (!f.visible || !f.dust.busy) continue;
      if (f.dust.step(dt)) busy = true;
      f.dust.draw();
    }
    if (busy && !this.paused) this.frameId = this.raf(this.frame);
    else this.last = 0;
  }

  kick() {
    if (!this.frameId && !this.paused) this.frameId = this.raf(this.frame);
  }

  message(m) {
    const f = this.fields.get(m.id);
    switch (m.type) {
      case 'add':
        this.fields.set(m.id, { dust: new Dust(m.canvas, m), visible: true });
        break;
      case 'resize': if (f) f.dust.resize(m.w, m.h, m.dpr); break;
      case 'visible': if (f) f.visible = m.on; break;
      case 'heat': if (f) f.dust.heatTo = m.k; break;
      case 'poke': if (f) { f.dust.heatTo = m.k || f.dust.heatTo; f.dust.poke(m.x, m.y); } break;
      case 'reveal': if (f) f.dust.reveal(m.x, m.y); break;
      case 'conceal': if (f) { f.dust.conceal(m.instant); f.dust.draw(); } break;
      case 'remove': this.fields.delete(m.id); break;
      case 'pause': this.paused = m.on; break;
      default: break;
    }
    this.kick();
  }
}
