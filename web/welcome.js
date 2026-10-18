// First run: a welcome screen before the tour. It covers the report while the
// report gets ready, then plays in: the hourglass pops up and starts pouring,
// the name rises letter by letter, the rest follows in a cascade. On the way out
// the hourglass flies into the header's logo while the report fades in behind.

import { reducedMotion, EASE_OUT, EASE_IN_OUT } from './shared/fx.js';

const HOURGLASS = `<svg class="wel-glass" viewBox="0 0 128 128" aria-hidden="true">
  <rect class="wg-bg" width="128" height="128" rx="30"/>
  <g class="wg-turn">
    <path class="wg-sand wg-top" d="M48 40H80C78 52 66 58 64 62 62 58 50 52 48 40Z"/>
    <path class="wg-sand wg-bot" d="M48 88H80C78 76 66 70 64 66 62 70 50 76 48 88Z"/>
    <rect class="wg-sand wg-stream" x="63" y="62" width="2" height="24" rx="1"/>
    <path class="wg-line" d="M44 36c0 16 20 22 20 28s-20 12-20 28M84 36c0 16-20 22-20 28s20 12 20 28"/>
    <path class="wg-line wg-bar" d="M37 31h54M37 97h54"/>
  </g>
</svg>`;

const PUZZLE = '<svg class="wel-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 2.5a1.6 1.6 0 0 1 3.2 0V4h2.4c.4 0 .7.3.7.7v2.4h-1.1a1.6 1.6 0 0 0 0 3.2h1.1v2.4c0 .4-.3.7-.7.7H9.4v-1.1a1.6 1.6 0 0 0-3.2 0v1.1H3.8c-.4 0-.7-.3-.7-.7v-2.4h1.1a1.6 1.6 0 0 0 0-3.2H3.1V4.7c0-.4.3-.7.7-.7h2.4V2.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const PIN = '<svg class="wel-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.8 2.2 13.8 6.2 12.4 6.6 10.3 8.7 10.6 11.6 9.6 12.6 7 10 3.6 13.4M6 9 3.4 6.4 4.4 5.4 7.3 5.7 9.4 3.6 9.8 2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const FEATURES = [
  { icon: 'i-clock', title: 'Time, app by app', text: 'The active app or website counts. Idle time doesn’t.' },
  { icon: 'i-limit', title: 'A limit you keep', text: 'Commit to a daily limit. Once set, it stays locked in.' },
  { icon: 'i-grid', title: 'Your week at a glance', text: 'Days, hours, apps and websites, all on one screen.' },
];

/**
 * Puts the welcome screen up straight away (its background only), so nothing
 * flashes behind it. Call play() once the page underneath is ready.
 */
export function createWelcome() {
  const root = document.createElement('div');
  root.className = 'wel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'wel-title');
  const letters = [...'Memoir'].map((ch, i) => `<span style="--d:${260 + i * 55}">${ch}</span>`).join('');
  root.innerHTML = `
    <div class="wel-bg"><i class="wel-orb o1"></i><i class="wel-orb o2"></i><i class="wel-orb o3"></i></div>
    <div class="wel-pin" aria-hidden="true">
      <svg class="wel-arrow" viewBox="0 0 60 60"><path d="M8 54C14 34 26 20 48 12M48 12 36 10M48 12 44 23" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <p class="wel-pin-card"><b>Keep it in reach</b><span>Minimize Memoir to keep tracking. Double-click its hourglass in the notification area to return.</span></p>
    </div>
    <div class="wel-main">
      <div class="wel-mark">${HOURGLASS}</div>
      <p class="wel-kicker wel-in" style="--d:180">Welcome to</p>
      <h1 class="wel-title display" id="wel-title" aria-label="Memoir">${letters}</h1>
      <p class="wel-sub wel-in" style="--d:640">Memoir quietly notes where your screen time goes, so each week you can see it all at once.</p>
      <ul class="wel-feats">
        ${FEATURES.map((f, i) => `
        <li class="wel-feat wel-in" style="--d:${820 + i * 90}">
          <span class="wel-feat-ico"><svg><use href="#${f.icon}"/></svg></span>
          <b>${f.title}</b>
          <span>${f.text}</span>
        </li>`).join('')}
      </ul>
      <p class="wel-private wel-in" style="--d:1120"><svg><use href="#i-private"/></svg>Everything stays in this computer. Nothing is ever sent anywhere.</p>
      <div class="wel-actions wel-in" style="--d:1220">
        <button class="btn btn-primary btn-lg wel-go" type="button">Take the tour</button>
        <button class="btn btn-secondary btn-lg wel-skip" type="button">Skip for now</button>
      </div>
      <p class="wel-by wel-in" style="--d:1400">Made by Mina Vian</p>
    </div>`;
  document.body.appendChild(root);

  /**
   * Plays the welcome in, waits for a choice, then leaves.
   * markTarget: the header logo the hourglass flies into.
   * onLeave(choice): called as it starts leaving, with 'tour' or 'skip' (reveal the page there).
   * Resolves with 'tour' or 'skip' once it's gone.
   */
  function play({ markTarget = null, onLeave = () => {} } = {}) {
    return new Promise(resolve => {
      const go = root.querySelector('.wel-go');
      const skip = root.querySelector('.wel-skip');
      let leaving = false;

      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add('on');
        setTimeout(() => { if (!leaving) go.focus({ preventScroll: true }); }, reducedMotion() ? 0 : 1300);
      }));

      root.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); leave('skip'); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === go ? skip : go).focus();
        }
      });
      go.addEventListener('click', () => leave('tour'));
      skip.addEventListener('click', () => leave('skip'));

      function leave(choice) {
        if (leaving) return;
        leaving = true;
        go.disabled = true;
        skip.disabled = true;
        root.classList.add('leaving');
        onLeave(choice);
        const done = () => { root.remove(); resolve(choice); };
        if (reducedMotion()) { done(); return; }

        // the words drift up and away, last ones first
        const parts = [...root.querySelectorAll('.wel-main > :not(.wel-mark), .wel-pin')].reverse();
        parts.forEach((el, i) => {
          el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px) scale(0.98)' }],
            { duration: 320, delay: i * 25, easing: EASE_OUT, fill: 'forwards' });
        });
        root.querySelector('.wel-bg').animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: 650, delay: 220, easing: EASE_IN_OUT, fill: 'forwards' });

        // the hourglass flies into the logo in the header
        const mark = root.querySelector('.wel-mark');
        const from = mark.getBoundingClientRect();
        const to = markTarget && markTarget.getClientRects().length ? markTarget.getBoundingClientRect() : null;
        let fly;
        if (to && to.width && from.width) {
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          const s = to.width / from.width;
          mark.classList.add('flying');
          fly = mark.animate([
            { transform: 'none' },
            { transform: `translate(${dx * 0.35}px, ${dy * 0.5}px) scale(${(1 + s) / 1.6})`, offset: 0.45 },
            { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
          ], { duration: 820, delay: 120, easing: EASE_IN_OUT, fill: 'forwards' });
          fly.finished.then(() => mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).finished)
            .then(done, done);
        } else {
          fly = mark.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.7)' }],
            { duration: 420, delay: 80, easing: EASE_OUT, fill: 'forwards' });
          setTimeout(done, 880);
        }
      }
    });
  }

  return { play };
}
