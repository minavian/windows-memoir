// A number that rolls like an odometer as it changes, as the Categories card's times always have: a column a digit,
// each turning from its old digit to its new one, up as the number grows and down as it shrinks, blurred by how fast it
// turns and sharp as it settles. A column or a letter that comes or goes (an hour's digits, "h", "<", "%") opens or
// closes its room as it fades in or out. Changed again mid-roll, every column goes on from where it is. The words stay
// in a hidden copy, for screen readers and anything that reads the text. It rolls a time ("<1m", "45m", "1h 5m", "3h",
// "34s") or a share ("37%", "<1%"); anything else is simply put in. Its look: theme.css, .odo-t.
import { formatDuration } from './core.js';
import { reducedMotion, EASE_OUT } from './fx.js';

const ODO = { ms: 1000, line: 1.8, cycle: 10 };   // a digit's height in em (theme.css .odo-t), a whole window apart; its strip holds 0-9 three times
// every place a character can have, in reading order
const ODO_ORDER = ['lt', 'h3', 'h2', 'h1', 'h0', 'hu', 'sp', 'm1', 'm0', 'mu', 's1', 's0', 'su', 'p2', 'p1', 'p0', 'pu'];
const ODO_FORM = /^(<)?(?:(\d{1,4})h)? ?(?:(\d{1,2})m)?(?:(\d{1,2})s)?(?:(\d{1,3})%)?$/;
const rollable = text => text !== '' && ODO_FORM.test(text);
function odoSlots(text) {
  const [, lt, h, m, s, p] = text.match(ODO_FORM) || [];
  const slots = new Map();
  if (lt) slots.set('lt', { ch: '<' });
  const digits = (n, u) => [...n].forEach((d, i) => slots.set(`${u}${n.length - 1 - i}`, { d: +d }));
  if (h) { digits(h, 'h'); slots.set('hu', { ch: 'h' }); if (m) slots.set('sp', { ch: ' ' }); }   // (a space alone isn't drawn in its box)
  if (m) { digits(m, 'm'); slots.set('mu', { ch: 'm' }); }
  if (s) { digits(s, 's'); slots.set('su', { ch: 's' }); }
  if (p) { digits(p, 'p'); slots.set('pu', { ch: '%' }); }
  return slots;
}
function odoNode(key, slot) {
  const n = document.createElement('span');
  n.dataset.k = key;
  if (slot.ch != null) { n.className = 'odo-ch'; n.textContent = slot.ch; return n; }
  n.className = 'odo-col';
  // its strip: the digits as lines of one text, not an element each (a card full of them was slow to change)
  const strip = document.createElement('span');
  strip.className = 'odo-strip';
  strip.textContent = Array.from({ length: ODO.cycle * 3 }, (_, i) => i % 10).join('\n');
  n.appendChild(strip);
  return n;
}
const odoAt = (n, pos) => { n._pos = pos; n.firstChild.style.transform = `translateY(${(-pos * ODO.line).toFixed(4)}em)`; };

/**
 * Rolls `el` to `text`, whose number is `value` (it rolls up as that grows, down as it shrinks). `from`, as
 * [text, value], is where it rolls in from when it's drawn afresh; without it, it's simply drawn. `instant` sets it
 * without rolling.
 */
export function rollText(el, text, value, { instant = false, delay = 0, from = null } = {}) {
  if (!rollable(text)) {
    el._odo = null;
    if (el.textContent !== text) el.textContent = text;
    return;
  }
  let st = el._odo;
  if (!st || !el.contains(st.box)) {
    // drawn afresh (or after plain words were put in): as it is, or from `from` if it's to roll in
    const box = document.createElement('span');
    box.className = 'odo odo-t';
    box.setAttribute('aria-hidden', 'true');
    const said = document.createElement('span');
    said.className = 'odo-said';
    el.replaceChildren(said, box);
    const start = from && rollable(from[0]) ? from : [text, value];
    st = el._odo = { box, said, v: start[1], run: 0, raf: 0 };
    for (const [k, s] of odoSlots(start[0])) { const n = odoNode(k, s); box.appendChild(n); if (s.d != null) odoAt(n, ODO.cycle + s.d); }
    if (!from) instant = true;
  }
  st.said.textContent = text;
  const dir = Math.sign(value - st.v);
  st.v = value;
  const run = ++st.run;
  cancelAnimationFrame(st.raf);
  clearTimeout(st.wait);
  const want = odoSlots(text);
  const have = new Map([...st.box.children].map(n => [n.dataset.k, n]));
  if (instant || reducedMotion()) {
    st.box.replaceChildren(...ODO_ORDER.filter(k => want.has(k)).map(k => {
      const n = have.get(k) || odoNode(k, want.get(k));
      n._fade?.cancel();
      if (want.get(k).d != null) { odoAt(n, ODO.cycle + want.get(k).d); n.firstChild.style.filter = ''; }
      return n;
    }));
    return;
  }
  // where each column is now: whole, or (cut short opening or closing) as wide and clear as it is right then;
  // only those are measured, so a change mostly asks nothing of the page's layout. Then every one there will be,
  // in order.
  const now = new Map([...have].map(([k, n]) => {
    if (!n._fade || n._fade.playState !== 'running') return [k, null];
    const was = { w: `${n.getBoundingClientRect().width}px`, o: +getComputedStyle(n).opacity };
    n._fade.cancel();
    return [k, was];
  }));
  const nodes = [];
  for (const k of ODO_ORDER) {
    if (!want.has(k) && !have.has(k)) continue;
    const n = have.get(k) || odoNode(k, want.get(k));
    if (!have.has(k)) { now.set(k, { w: '0px', o: 0 }); if (want.get(k).d != null) odoAt(n, ODO.cycle + (dir < 0 ? 9 : 0)); }
    nodes.push(n);
  }
  st.box.replaceChildren(...nodes);
  for (const n of nodes) if (n.className === 'odo-col') n.firstChild.style.filter = '';
  // a column opens or closes its room up to a width no digit or letter reaches (so none is measured)
  const WHOLE = { w: '1.1em', o: 1 };
  const turns = [];
  for (const n of nodes) {
    const k = n.dataset.k, stays = want.has(k);
    const was = now.get(k) || WHOLE;
    const to = stays ? WHOLE : { w: '0px', o: 0 };
    if (was.w !== to.w || Math.abs(was.o - to.o) > 0.01) {
      const a = n._fade = n.animate([{ maxWidth: was.w, opacity: was.o }, { maxWidth: to.w, opacity: to.o }], { duration: 560, delay, easing: EASE_OUT, fill: stays ? 'backwards' : 'both' });
      if (!stays) a.finished.then(() => { if (st.run === run) n.remove(); }, () => {});
    } else if (!stays) n.remove();
    if (n.className !== 'odo-col') continue;
    // the column turns to its new digit the way the number went (a column going turns to 0), from where it is
    const mod = v => ((v % ODO.cycle) + ODO.cycle) % ODO.cycle;
    const p0 = ODO.cycle + mod(n._pos ?? ODO.cycle);
    const d = stays ? want.get(k).d : 0;
    const p1 = dir > 0 ? p0 + mod(d - p0) : dir < 0 ? p0 - mod(p0 - d) : ODO.cycle + d;
    odoAt(n, p0);
    if (Math.abs(p1 - p0) > 1e-3) turns.push({ n, p0, p1, last: p0 });
  }
  if (!turns.length) return;
  const ease = t => 1 - Math.pow(1 - t, 4);
  let start = 0, lastAt = 0;
  const step = time => {
    if (!start) { start = lastAt = time; }
    const t = Math.min(1, (time - start) / ODO.ms);
    for (const c of turns) {
      const pos = c.p0 + (c.p1 - c.p0) * ease(t);
      const speed = time > lastAt ? (Math.abs(pos - c.last) / (time - lastAt)) * 1000 : 0;   // digits a second
      c.last = pos;
      odoAt(c.n, pos);
      c.n.firstChild.style.filter = t < 1 && speed > 0.05 ? `blur(${Math.min(3.2, speed * 0.11).toFixed(2)}px)` : '';
    }
    lastAt = time;
    if (t < 1) st.raf = requestAnimationFrame(step);
  };
  const go = () => { st.raf = requestAnimationFrame(step); };
  if (delay) st.wait = setTimeout(go, delay); else go();
}

/** Rolls `el` to a time (`seconds`: under a minute it says its seconds). `from` is a time to roll in from. */
export function rollTime(el, ms, { seconds = false, from = null, ...o } = {}) {
  const say = v => formatDuration(v, { seconds });
  rollText(el, say(ms), ms, { ...o, from: from == null ? null : [say(from), from] });
}
