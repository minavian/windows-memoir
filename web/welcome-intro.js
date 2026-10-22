/*! Made with care and love by Mina Vian */
// The welcome's opening, before the card. On black (on Light a soft white), a light drifting in behind,
// WELCOME TO and a big MEMOIR (the trailer's wordmark) arrive letter by letter from left
// to right while the page gets ready behind them (the week drawn, the tour's sample
// weeks made). The O is the card's clock itself, nothing standing in for it: all ring at
// first, heavy and wide in the wordmark's platinum (graphite on Light), it thins and rounds off into the
// clock's own ring as the clock sets itself, then flies on into the card as its logo,
// one element on one path. With it the letters fly one after another, left to right,
// onto the card's own MEMOIR and WELCOME TO into its kicker, while the black (white) lifts off.
// Transform and opacity on layers painted once (the O's band is the one repaint, after
// loading). Clicks and keys wait until the card has landed, so nothing unseen is pressed.

import { EASE_OUT } from './shared/fx.js';
import { playLogo } from './shared/logo.js';

// ms: from the start, then from the turn (the word has had its moment and the page is ready)
export const TIMES = {
  light: 250,     // the light behind the word drifts in
  kicker: 300,    // WELCOME TO, letter by letter
  word: 600,      // MEMOIR, the same
  turn: 1825,     // the word has arrived (the R's last ease-out tail aside); later if the page isn't ready
  thin: 0,        // the O thins and rounds off straight away…
  clock: 250,     // …as it takes the clock's own fade and the clock sets itself (done 1660 ms on: shared/logo.js)
  morph: 2510,    // 0.6 s after the clock is set, everything turns into the card…
  step: 75,       // …a letter at a time
  morphMs: 950,
};
const T = TIMES;
const MORPH = 'cubic-bezier(0.5, 0, 0.15, 1)';
const LIFT = 'cubic-bezier(0.4, 0, 0.2, 1)';    // the black lifting off the page
// a letter flying home is back to (a breath over) its own size this far into its flight,
// and glides the rest: drawn big and shrunk, a letter is drawn a hair differently from
// itself at its size, and the switch then happens in flight, unseen, not as it comes to
// rest. The breath (0.2%, unseen) keeps it off whole pixels as it glides, so it doesn't
// step a pixel at a time as it slows
const SHRUNK = 0.72, BREATH = 1.002;
// shrinks a letter (or the kicker) home from a size: to a breath over its own, then to it
function shrink(el, from, start, ms) {
  el.animate([{ scale: from }, { scale: `${BREATH}` }], { duration: ms * SHRUNK, delay: start, easing: MORPH, fill: 'both' });
  return el.animate([{ scale: `${BREATH}` }, { scale: '1' }], { duration: ms * (1 - SHRUNK), delay: start + ms * SHRUNK, easing: 'cubic-bezier(0.2, 0, 0.2, 1)', fill: 'forwards' });
}
const FONT = '"Memoir Unbounded"';
// Unbounded Black's O, in its size: 0.786 tall and 1.16 times as wide, its middle 0.375
// above the baseline, its counter about 0.42 across (wght 900; its room is in recap.css)
const O_TALL = 0.786, O_WIDE = 1.16, O_MID = 0.375, O_BAND = '42%', RING_BAND = '77.632%';

// where a line of text sits: a zero-size probe on its baseline
function baseline(el) {
  const probe = document.createElement('i');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  el.append(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
}

// a promise for when an animation-timeline moment comes (it keeps time with the rest)
function at(el, ms) {
  return el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, delay: Math.max(0, ms) }).finished.catch(() => {});
}

/**
 * Puts the opening's black up straight away (call before the page draws anything),
 * with its words waiting. play() runs it.
 */
export function createIntro(root) {
  const bg = document.createElement('div');
  bg.className = 'wi-bg';
  bg.setAttribute('aria-hidden', 'true');
  const type = document.createElement('div');
  type.className = 'wi-type';
  type.setAttribute('aria-hidden', 'true');
  const kick = [...'WELCOME TO'].map(ch => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  // the O is only room in the word: the card's clock takes it (play). The word is the
  // wordmark in the theme's colours (platinum on Dark, graphite on Light)
  const onLight = getComputedStyle(root).getPropertyValue('--logo-disc').trim() === 'transparent';
  const word = [...'MEMOIR'].map(ch => (ch === 'O' ? '<span class="wi-o"></span>'
    : `<span class="wordmark${onLight ? '' : ' wm-dark'}" data-t="${ch}">${ch}</span>`)).join('');
  type.innerHTML = `<p class="wi-kicker">${kick}</p><p class="wi-word">${word}</p>`;
  root.querySelector('.wel-dim').after(bg);
  root.append(type);
  root.classList.add('intro');

  let landed;
  const done = new Promise(r => { landed = r; });

  /**
   * Plays it, turning once `progress.promise` (the page's work) is done, into the card's
   * own MEMOIR, kicker and logo (found at rest). Resolves once it has begun: start the card's own entrance then; the rest of
   * the card waits for `.cascade`, which comes as the letters fly.
   */
  async function play({ card, mark, progress }) {
    await Promise.race([document.fonts.load(`900 100px ${FONT}`), new Promise(r => setTimeout(r, 1500))]).catch(() => {});

    // ---- everything measured at rest, before anything moves
    const word = type.querySelector('.wi-word');
    const kicker = type.querySelector('.wi-kicker');
    const big = [...word.children];                            // M E M, the O's room, I R
    const F = parseFloat(getComputedStyle(word).fontSize);
    const cap = F * 0.75;                                      // Unbounded's cap height
    const wr = word.getBoundingClientRect();
    const base = baseline(word);

    // The big word and its kicker are the card's own MEMOIR and WELCOME TO, made big: each
    // of the card's letters is scaled up onto its place in the word (the word up there is
    // only room, unseen) and flies home from it, so nothing hands over. The card's MEMOIR is
    // cut into letters (the face has no kerning, so it reads the same); its O is the one
    // letter not in the word (the clock took it) and comes in on its own, in the O's turn
    const whole = card.querySelector('.wel-title .wordmark');
    const letters = [...'Memoir'].map(ch => {
      const p = document.createElement('span');
      p.className = 'wordmark';
      p.dataset.t = ch.toUpperCase();
      p.textContent = ch;
      return p;
    });
    whole.replaceWith(...letters);
    const tl = letters[0].getBoundingClientRect().left, tr = letters[5].getBoundingClientRect().right;
    for (const p of letters) {
      p.style.setProperty('--wm-w', `${tr - tl}px`);
      p.style.setProperty('--wm-x', `${tl - p.getBoundingClientRect().left}px`);
    }
    const titleO = letters[3];
    const k = parseFloat(getComputedStyle(letters[0]).fontSize) / F;
    const tBase = baseline(letters[0].parentElement);
    // a letter in the word: its baseline's middle on the word's letter's, scaled up (moved
    // and sized apart, translate and scale, so it can be its own size before it stops)
    const inBig = letters.map((L, i) => {
      const a = big[i].getBoundingClientRect(), b = L.getBoundingClientRect();
      L.style.transformOrigin = `50% ${tBase - b.top}px`;
      return (nudge = 0, z = 1) => ({ translate: `${a.left + a.width / 2 + nudge - (b.left + b.width / 2)}px ${base - tBase}px`, scale: `${z / k}` });
    });
    // the grain is a 96 px tile: scaled up, the card's letters take one as much finer, so the
    // big word's grain is as fine as a word that size has; halfway home (in flight) they take
    // their own back
    for (const L of letters) L.style.setProperty('--wm-g', `${96 * k}px`);
    // WELCOME TO, the same way: the card's kicker (in the opening's own type), letter by letter
    const kick = card.querySelector('.wel-kicker');
    kick.innerHTML = [...kick.textContent].map(ch => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    const ka = kicker.getBoundingClientRect(), kb = kick.getBoundingClientRect();
    const kaBase = baseline(kicker), kbBase = baseline(kick);
    kick.style.transformOrigin = `50% ${kbBase - kb.top}px`;
    const kickBig = { translate: `${ka.left + ka.width / 2 - (kb.left + kb.width / 2)}px ${kaBase - kbBase}px`, scale: `${parseFloat(getComputedStyle(kicker).fontSize) / parseFloat(getComputedStyle(kick).fontSize)}` };
    const kickBigInk = getComputedStyle(kicker).color, kickInk = getComputedStyle(kick).color;

    // the card's clock is the O: one element, from the word to the card. In the word it's
    // scaled up to the O's height in the O's room, and its ring is the O, heavy (O_BAND) and
    // wide (O_WIDE), in the word's colour across it, with the letters' glow. On Light the
    // clock is the logo for light backgrounds all along: ink, no disc, the knob's middle a
    // hole (it opens as the knob comes in)
    const logo = mark.querySelector('.logo');
    const ring = logo.querySelector('.lg-ring');
    const m = mark.getBoundingClientRect(), o = big[3].getBoundingClientRect(), r = ring.getBoundingClientRect();
    const s = (F * O_TALL) / r.height;
    const ox = o.left + o.width / 2, oy = base - F * O_MID;
    const inWord = (nudge = 0, k = 1) => `translate(${ox + nudge - (m.left + m.width / 2)}px, ${oy - (m.top + m.height / 2)}px) scale(${s * k})`;
    const kx = s * O_WIDE, ky = s, lt = big[0].getBoundingClientRect();
    const left = ox - (r.width * kx) / 2, top = oy - (r.height * ky) / 2;
    if (!onLight) ring.classList.add('wm-dark');
    ring.style.setProperty('--wi-ox', `${(wr.left - left) / kx}px`);
    ring.style.setProperty('--wi-oy', `${(lt.top - top) / ky}px`);
    ring.style.setProperty('--wi-ow', `${wr.width / kx}px`);
    ring.style.setProperty('--wi-oh', `${lt.height / ky}px`);
    ring.style.setProperty('--wi-og', `${96 / kx}px ${96 / ky}px`);
    ring.style.setProperty('--lg-band', O_BAND);
    ring.style.scale = `${O_WIDE} 1`;
    const glow = onLight
      ? a => `0 ${(0.02 * F) / s}px ${(0.06 * F) / s}px rgba(0, 0, 0, ${0.14 * a})`
      : a => `0 0 ${(0.045 * F) / s}px rgba(255, 255, 255, ${0.32 * a}), 0 0 ${(0.16 * F) / s}px rgba(255, 255, 255, ${0.12 * a})`;
    if (onLight) {
      logo.style.setProperty('--lg-ink', getComputedStyle(logo).getPropertyValue('--logo-ink').trim());
      logo.style.setProperty('--lg-knob-mid', 'transparent');
    }
    ring.style.boxShadow = glow(1);
    mark.classList.add('as-o');                                // hands and knob wait for the turn

    // the light behind the word drifts in from the left and settles between the M and the O
    const light = document.createElement('div');
    light.className = 'wi-light';
    Object.assign(light.style, {
      left: `${wr.left + wr.width * 0.6 - wr.width * 0.55}px`, top: `${base - cap * 0.92 - cap * 1.1}px`,
      width: `${wr.width * 1.1}px`, height: `${cap * 2.2}px`,
    });
    bg.append(light);

    // ---- the start, all at once
    const go = (el, kf, opts) => el.animate(kf, { fill: 'both', easing: 'linear', ...opts });
    go(light, [{ opacity: 0, transform: `translateX(${-wr.width * 0.5}px)`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }, { opacity: 1, offset: 0.35 }, { opacity: 1, transform: 'none' }],
      { duration: 2600, delay: T.light });
    go(kick, [{ opacity: 1, ...kickBig, color: kickBigInk }, { opacity: 1, ...kickBig, color: kickBigInk }], { duration: 1 });
    [...kick.children].forEach((L, i) => go(L, [{ opacity: 0, transform: 'translateX(-0.7em)' }, { opacity: 1, transform: 'none' }],
      { duration: 800, delay: T.kicker + i * 40, easing: EASE_OUT }));
    big.forEach((L, i) => go(i === 3 ? mark : letters[i],
      i === 3 ? [{ opacity: 0, transform: inWord(-0.16 * F, 0.96) }, { opacity: 1, transform: inWord() }]
        : [{ opacity: 0, ...inBig[i](-0.16 * F, 0.96) }, { opacity: 1, ...inBig[i]() }],
      { duration: 1000, delay: T.word + i * 105, easing: EASE_OUT }));

    // ---- the turn: once the word has had its moment and the page's work is done
    const filled = Promise.all([at(word, T.turn), progress.promise]);

    // ---- the O becomes the clock, and it all becomes the card
    filled.then(() => {

      // the O thins and rounds off into the clock's ring (band and width in one animation,
      // so they keep step), its platinum giving way to the ring's own fade, as the clock sets itself
      go(ring, [{ '--lg-band': O_BAND, scale: `${O_WIDE} 1` }, { '--lg-band': RING_BAND, scale: '1 1' }],
        { duration: 900, delay: T.thin, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' });
      const tint = { duration: 650, delay: T.clock + 60, fill: 'forwards' };
      go(ring, [{ opacity: 1 }, { opacity: 0 }], { ...tint, pseudoElement: '::after' });
      go(ring, [{ opacity: 0 }, { opacity: 1 }], { ...tint, pseudoElement: '::before' });
      go(ring, [{ boxShadow: glow(1) }, { boxShadow: glow(0) }], tint);
      mark.classList.remove('as-o');
      playLogo(logo, { delay: T.clock, face: false, fromO: true });
      const settle = [];
      if (onLight) {
        // the knob's hole opens through the ring once the knob is mostly in (shared/logo.js
        // brings it 820 ms on, for 600), so the ring never shows a hole without it
        at(logo, T.clock + 820).then(() => logo.classList.add('cut'));
        settle.push(go(logo, [{ '--lg-hole': '0%' }, { '--lg-hole': '4.605%' }], { duration: 420, delay: T.clock + 1000, easing: EASE_OUT }));
      }

      // home into the card, a letter at a time from the left: the clock goes on in the O's
      // turn, from the word to its own place
      const flying = [];
      big.forEach((L, i) => {
        const start = T.morph + i * T.step;
        if (i === 3) {
          flying.push(go(mark, [{ opacity: 1, transform: inWord() }, { opacity: 1, transform: 'none' }], { duration: T.morphMs, delay: start, easing: MORPH }));
          // its disc comes in as it flies (on Light it has none)
          if (!onLight) go(logo, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: start + 250, pseudoElement: '::before', fill: 'forwards' });
          return;
        }
        flying.push(go(letters[i], [{ translate: inBig[i]().translate }, { translate: '0px 0px' }], { duration: T.morphMs, delay: start, easing: MORPH }));
        shrink(letters[i], inBig[i]().scale, start, T.morphMs);
        at(letters[i], start + T.morphMs * 0.4).then(() => letters[i].style.removeProperty('--wm-g'));
      });
      // the card's O comes in as soon as the second M has landed (to the eye: two thirds into
      // its flight the long settle has it there), so the word fills in in order: M, E, M, O,
      // I, R
      titleO.style.transformOrigin = `50% ${(tBase - titleO.getBoundingClientRect().top) - F * k * O_MID}px`;
      flying.push(go(titleO, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, delay: T.morph + 2 * T.step + T.morphMs * 0.66, easing: EASE_OUT }));
      // on Light, with no disc, the clock fills the disc's room as it flies (on the disc
      // it's 84% of it), so it lands as the Light logo is drawn
      if (onLight) {
        settle.push(go(logo.querySelector('.lg-clock'), [{ scale: '1' }, { scale: `${1 / 0.84}` }],
          { duration: T.morphMs, delay: T.morph + 3 * T.step, easing: MORPH, fill: 'forwards' }));
      }
      flying.push(go(kick, [{ opacity: 1, translate: kickBig.translate, color: kickBigInk }, { opacity: 1, translate: '0px 0px', color: kickInk }],
        { duration: T.morphMs, delay: T.morph, easing: MORPH }));
      shrink(kick, kickBig.scale, T.morph, T.morphMs);
      // the black (on Light the white) lifts off the page as they fly, and the rest of the
      // card follows them in
      flying.push(go(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 750, delay: T.morph + 60, easing: LIFT, fill: 'forwards' }));
      at(bg, T.morph).then(() => root.classList.add('cascade'));
      Promise.all(flying.map(a => a.finished)).catch(() => {}).then(() => {
        // from here it's the logo that follows the theme, as everywhere else (the same look)
        logo.classList.add('themed');
        settle.forEach(a => a.cancel());
        for (const L of letters) L.style.removeProperty('--wm-g');
        logo.style.removeProperty('--lg-knob-mid');
        logo.style.removeProperty('--lg-ink');
        bg.remove();
        type.remove();
        root.classList.add('landed');
        landed();
      });
    });
  }

  return {
    play,
    landed: done,
    // until the card has landed, a click or a key is for the opening (it does nothing)
    get busy() { return !root.classList.contains('landed'); },
  };
}
