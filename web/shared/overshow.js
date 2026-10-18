// Over the daily limit: the ring's own flame takes the stage. It comes up as big as the
// overshoot (four sizes, each burning harder than the last), with how far over, and past an
// hour a dry line, then flies home into its ring. One element all the way: the flame leaves
// its spot (an empty one its size keeps the room, so nothing in the ring moves), plays, and
// lands back in it. Transform and opacity only; the flicker always comes to rest exactly as
// the flame lands, so the ring's own flicker takes up from there without a jump.

import { formatDuration } from './core.js';
import { reducedMotion } from './fx.js';

export const OVER_LINES = [
  'Your limit called. It wants to know if you’re okay.',
  'At this point the limit is more of a suggestion.',
  'Bold of you to call that a limit.',
  'The internet will still be here tomorrow. Promise.',
  'Somewhere, a book is quietly gathering dust.',
  'A new personal best. Not the good kind.',
  'Even your browser could use a break.',
  'That “one more video” was a while ago.',
  'Fun fact: the limit was your idea.',
  'Plot twist: the tabs won.',
];

// By how far over: the flame's height (a share of the stage's smaller side, capped), how
// hard and fast it flickers, its embers, its glow, and how long it holds the stage. Past
// two hours it's a wall of fire, taller than the stage. Each holds long enough to read its words
// (the dry line, from an hour, a second more).
const TIERS = [
  { name: 'small', at: 0, share: 0.24, cap: 120, amp: 1, period: 1100, embers: 0, glow: 0.18, hold: 2000 },
  { name: 'big', at: 30 * 60e3, share: 0.42, cap: 220, amp: 1.7, period: 820, embers: 0, glow: 0.28, hold: 2200 },
  { name: 'huge', at: 60 * 60e3, share: 0.56, cap: 320, amp: 2.4, period: 640, embers: 22, glow: 0.38, hold: 3400 },
  { name: 'wall', at: 120 * 60e3, share: 1.3, cap: Infinity, amp: 3.2, period: 520, embers: 48, glow: 0.55, hold: 3800 },
];
export function overTier(overMs) {
  return TIERS.reduce((t, x) => (overMs >= x.at ? x : t), TIERS[0]);
}

const GROW = 'cubic-bezier(0.33, 1, 0.68, 1)';    // comes up: an even ease out
const IN = 'cubic-bezier(0.16, 1, 0.3, 1)';       // the words: quick, then a long soft settle
const HOME = 'cubic-bezier(0.65, 0, 0.25, 1)';    // flies home: firm in, long soft landing
// Home, it's back to its own size this far into the flight, and glides the rest: drawn
// shrunk from big, a flame is drawn a hair differently from itself at its size, and the
// switch then happens in flight, not as it lands
const SIZED = 0.78;

// a dry line, never the same twice running
function line() {
  let last = -1;
  try { last = Number(localStorage.getItem('memoir:overLine')); } catch { /* no storage */ }
  let i = Math.floor(Math.random() * OVER_LINES.length);
  if (i === last) i = (i + 1) % OVER_LINES.length;
  try { localStorage.setItem('memoir:overLine', String(i)); } catch { /* no storage */ }
  return OVER_LINES[i];
}

let playing = null;

/**
 * Plays it. flame: the ring's .gr-flame (the ring must show "over"). lifted: the flame is
 * already on screen in its ring (it rises out of it), else it comes up at the middle.
 * Resolves once it's home.
 */
export function playOverShow({ flame, overMs, limitMs, lifted = false }) {
  if (!flame || playing || reducedMotion() || !(overMs > 0) || !flame.getClientRects().length) return Promise.resolve();
  // its own laid-out size (not as drawn: the ring may still be bringing it in, scaled down)
  const cs = getComputedStyle(flame);
  const fw = parseFloat(cs.width), fh = parseFloat(cs.height);
  if (!fw || !fh) return Promise.resolve();
  const tier = overTier(overMs);
  const vw = innerWidth, vh = innerHeight, short = Math.min(vw, vh);
  const wall = tier.name === 'wall';
  // the flame's own shape in its 24-unit box: 21.2 tall, its base 23 down. A wall is taller
  // than the stage, its base just under the bottom edge
  const H = wall ? vh * tier.share : Math.min(short * tier.share, tier.cap);
  const S = H / (fh * (21.2 / 24));
  const cx = vw / 2, cy = wall ? vh * 1.04 - fh * S * (23 / 24 - 0.5) : vh * 0.4;

  // the stage: a dim with a glow behind the flame, the words, the embers
  const stage = document.createElement('div');
  stage.className = 'os';
  stage.dataset.tier = tier.name;
  stage.style.setProperty('--os-cy', `${cy}px`);
  stage.style.setProperty('--os-glow', String(tier.glow));
  const sarcasm = overMs >= 60 * 60e3 ? `<p class="os-line">${line()}</p>` : '';
  stage.innerHTML = `<div class="os-back"></div><div class="os-embers"></div>
    <div class="os-text" role="status"><p class="os-big num">${formatDuration(overMs)} over</p><p class="os-sub">your ${formatDuration(limitMs)} daily limit</p>${sarcasm}</div>`;
  const text = stage.querySelector('.os-text');
  text.style.top = wall ? `${vh * 0.15}px` : `${cy + H / 2 + 14}px`;
  document.body.appendChild(stage);

  // the flame leaves its spot: an empty one its size keeps the room (and says where home is)
  const slot = document.createElement('span');
  slot.className = 'gr-flame-slot';
  slot.setAttribute('aria-hidden', 'true');
  Object.assign(slot.style, {
    display: 'block', flex: 'none', width: cs.width, height: cs.height,
    marginTop: cs.marginTop, marginRight: cs.marginRight, marginBottom: cs.marginBottom, marginLeft: cs.marginLeft,
  });
  flame.before(slot);
  const out = flame.querySelector('.fl-out'), core = flame.querySelector('.fl-in');
  // rising out of its ring, it may be mid-flicker: the show's flicker starts from that shape
  const was = [out, core].map(e => {
    const c = e && lifted ? getComputedStyle(e) : null;
    return c && (c.transform !== 'none' || c.opacity !== '1') ? { transform: c.transform, opacity: c.opacity } : null;
  });
  // (held there until that starts: out of its ring, the ring's flicker stops at once)
  [out, core].forEach((e, i) => { if (e && was[i]) Object.assign(e.style, was[i]); });
  stage.appendChild(flame);
  // where it was: its spot, now the flame has left it (with both in the ring, they'd share it)
  const r = slot.getBoundingClientRect();
  // its own size (none of the ring's resting look: that scales it down), laid out at the
  // middle of the stage, on whole pixels; the show is all
  // transform. Its spot is drawn on whole pixels too (Chrome rounds where a resting element
  // goes), so it flies to exactly there: landing, nothing moves
  const snap = v => Math.round(v * devicePixelRatio) / devicePixelRatio;
  const left = snap(cx - fw / 2), top = snap(cy - fh / 2);
  Object.assign(flame.style, {
    position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${fw}px`, height: `${fh}px`,
    margin: '0', opacity: '1', transition: 'none', transform: 'none', transformOrigin: '50% 50%',
  });
  const atSlot = `${snap(r.left) - left}px ${snap(r.top) - top}px`;

  const intro = wall ? 950 : 800, home = wall ? 1150 : 950;
  const total = intro + tier.hold + home;

  // up: out of the ring, from the middle, or (a wall) from below the stage. Moved and sized
  // apart (translate, scale), so the way home can size it on its own clock
  const from = lifted ? { translate: atSlot, scale: '1' } : wall ? { translate: `0px ${vh * 0.9}px`, scale: `${S}` } : { translate: '0px 0px', scale: `${S * 0.4}` };
  const show = flame.animate([
    { ...from, easing: lifted ? 'cubic-bezier(0.45, 0, 0.2, 1)' : GROW },
    { translate: '0px 0px', scale: `${S}`, offset: intro / (intro + tier.hold) },
    { translate: '0px 0px', scale: `${S}` },
  ], { duration: intro + tier.hold, fill: 'forwards' });
  if (!lifted && !wall) flame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: intro * 0.5, easing: 'ease-out', fill: 'both' });
  // and until those first draw (a new animation waits a frame to start), it's already there
  // as they begin: never a frame of it at the middle, its own size
  Object.assign(flame.style, { translate: from.translate, scale: from.scale, opacity: !lifted && !wall ? '0' : '1' });

  // the flicker, harder the further over, always at rest again exactly as it lands
  const flick = [];
  const a = tier.amp;
  const ease = was.some(Boolean) ? 220 : 0;
  [out, core].forEach((e, i) => {
    if (e && was[i]) flick.push(e.animate([was[i], { transform: 'none', opacity: 1 }], { duration: ease, easing: 'ease-out', fill: 'forwards' }));
  });
  const n = Math.max(2, Math.round((total - ease) / tier.period));
  if (out) flick.push(out.animate([
    { transform: 'none' },
    { transform: `scale(${1 - 0.03 * a}, ${1 + 0.05 * a}) skewX(${-2.5 * a}deg)`, offset: 0.3 },
    { transform: `scale(${1 + 0.025 * a}, ${1 - 0.035 * a}) skewX(${1.8 * a}deg)`, offset: 0.65 },
    { transform: 'none' },
  ], { duration: (total - ease) / n, delay: ease, iterations: n, easing: 'ease-in-out' }));
  if (core) flick.push(core.animate([
    { transform: 'none', opacity: 1 },
    { transform: `scale(${1 - 0.07 * a}, ${1 + 0.09 * a})`, opacity: 0.82, offset: 0.45 },
    { transform: `scale(${1 + 0.05 * a}, ${1 - 0.05 * a})`, opacity: 1, offset: 0.75 },
    { transform: 'none', opacity: 1 },
  ], { duration: (total - ease) / (n * 2), delay: ease, iterations: n * 2, easing: 'ease-in-out' }));

  // the dim (and its glow) comes up almost at once, so the flame and its words are seen
  // straight away; it goes as the flame flies home
  const DIM = 220;
  const back = stage.querySelector('.os-back');
  back.animate([{ opacity: 0, easing: 'ease-out' }, { opacity: 1, offset: DIM / total }, { opacity: 1, offset: (intro + tier.hold) / total }, { opacity: 0, offset: (intro + tier.hold + home * 0.7) / total }, { opacity: 0 }],
    { duration: total, fill: 'forwards', easing: 'ease-in-out' });
  text.animate([
    { opacity: 0, transform: 'translate(-50%, 10px)' },
    { opacity: 0, transform: 'translate(-50%, 10px)', offset: DIM / total, easing: IN },
    { opacity: 1, transform: 'translate(-50%, 0)', offset: (DIM + 600) / total },
    { opacity: 1, transform: 'translate(-50%, 0)', offset: (intro + tier.hold - 260) / total, easing: 'ease-in' },
    { opacity: 0, transform: 'translate(-50%, -6px)', offset: (intro + tier.hold - 40) / total },
    { opacity: 0, transform: 'translate(-50%, -6px)' },
  ], { duration: total, fill: 'forwards' });

  // embers, rising off it while it holds the stage (gone before it flies)
  const embers = stage.querySelector('.os-embers');
  for (let i = 0; i < tier.embers; i++) {
    const e = document.createElement('i');
    const spread = wall ? vw * 0.9 : H * 0.55;
    const x = cx + (Math.random() - 0.5) * spread;
    const y = wall ? vh * (0.7 + Math.random() * 0.28) : cy + H * (0.1 + Math.random() * 0.25);
    const size = 4 + Math.random() * 5;
    Object.assign(e.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
    embers.appendChild(e);
    const dur = 1100 + Math.random() * 900;
    const delay = intro * 0.4 + Math.random() * Math.max(0, intro * 0.6 + tier.hold - dur);
    const rise = (wall ? vh * 0.55 : H * 0.9) * (0.6 + Math.random() * 0.4);
    const drift = (Math.random() - 0.5) * (wall ? 120 : 50);
    e.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${rise}px)) scale(0.3)`, opacity: 0 },
    ], { duration: dur, delay, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'both' });
  }

  playing = new Promise(resolve => {
    show.finished.then(() => {
      // home: to where its spot is now (measured now, so an entrance that moved the card
      // since doesn't matter), its own size again
      const t = slot.getBoundingClientRect();
      const dx = snap(t.left) - left, dy = snap(t.top) - top;
      // (these take over from the show's last values, which hold until they start)
      flame.animate([{ scale: `${S}` }, { scale: '1' }], { duration: home * SIZED, easing: 'cubic-bezier(0.6, 0, 0.3, 1)', fill: 'forwards' });
      const fly = flame.animate([{ translate: '0px 0px' }, { translate: `${dx}px ${dy}px` }], { duration: home, easing: HOME, fill: 'forwards' });
      return fly.finished;
    }).catch(() => {}).then(() => {
      // landed: back into its spot, looking just as it did (the flicker at rest)
      for (const f of flick) f.cancel();
      for (const e of [out, core]) if (e) { e.style.removeProperty('transform'); e.style.removeProperty('opacity'); }
      slot.replaceWith(flame);
      flame.removeAttribute('style');
      for (const an of flame.getAnimations()) an.cancel();
      stage.remove();
      playing = null;
      resolve();
    });
  });
  return playing;
}
