// "Reset the limit": ten increasingly pointed questions before a committed
// limit can be undone the same day. Every "no" is one click; every "yes" is work.
// Nothing says how many are left. Each kind of question has four versions, the
// middle eight come in a random order, the buttons swap sides, and the sums are
// made up on the spot, so no two attempts read the same.

import { morph, dropShell, reducedMotion, animateHeight, EASE_OUT, POP } from './shared/fx.js';

const rand = n => Math.floor(Math.random() * n);
const between = (lo, hi) => lo + rand(hi - lo + 1);
const coin = (p = 0.5) => Math.random() < p;
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const HALVES = { 2: 'two', 2.5: 'two and a half', 3: 'three', 3.5: 'three and a half', 4: 'four', 5: 'five', 6: 'six', 7: 'seven' };
const words = s => HALVES[s] || String(s);

// ---- the pools: four versions of every kind of question ----

const POOLS = {
  intro: [
    { title: 'Reset your limit?', text: 'You picked it and pressed <b>Commit</b>. On purpose. With your own finger.', no: 'Keep my limit', yes: 'Yes, reset it' },
    { title: 'Undo your own promise?', text: 'The limit is locked because <i>you</i> locked it. Bold of you to come back for the key.', no: 'Keep my promise', yes: 'Undo it' },
    { title: 'Wait. You want the limit gone?', text: 'The one you picked yourself? Interesting.', no: 'No, keep it', yes: 'Yes, that one' },
    { title: 'Unlock the limit?', text: 'Locks are usually there for a reason. This one’s reason is you.', no: 'Leave it locked', yes: 'Unlock it' },
  ],
  sure: [
    { title: 'Are you sure you’re sure?', text: 'Just checking. Past you sounded <i>very</i> confident about this.', no: 'Past me was right', yes: 'I’m sure' },
    { title: 'Really, really sure?', text: 'Not a little sure. The kind of sure you’d say out loud, to a friend, who knows you.', no: 'Not that sure', yes: 'Really sure' },
    { title: 'Double-checking…', text: 'Past you thought this limit was a great idea. Just saying.', no: 'Past me knows best', yes: 'Past me was naive' },
    { title: 'Absolutely positive?', text: 'Positive-positive, or just a bit bored right now?', no: 'Just bored. Keep it.', yes: 'Positive-positive' },
  ],
  pick: [
    {
      title: 'What changed since you set it?', text: 'Take your time. The limit isn’t going anywhere. Well, unless you keep clicking.', no: 'Nothing. Never mind.',
      options: [['I just want more screen time', 'Honest. Refreshing. Still suspicious.'], ['It’s for work, I promise', 'For work. Of course. (We believe you. Mostly.)']],
    },
    {
      title: 'What’s the emergency?', text: 'Pick whichever best describes this crisis.', no: 'There isn’t one. Keep it.',
      options: [['One more video', 'It’s never one more video.'], ['Someone is wrong on the internet', 'They’ll still be wrong tomorrow.'], ['Very important research', 'Research. Sure. Noted.']],
    },
    {
      title: 'Why now?', text: 'The day isn’t even over. Explain yourself.', no: 'Good point. Keep it.',
      options: [['I set it too low', 'Past you would like a word.'], ['Today is special', 'They all are, somehow.'], ['I’d rather not say', 'Fair. The ring has theories, though.']],
    },
    {
      title: 'Help us understand.', text: 'For science. What’s pulling you back in?', no: 'Nothing. I’m fine.',
      options: [['A group chat', 'It’ll survive without you for a bit.'], ['A rabbit hole', 'Rabbit holes don’t have bottoms. Just so you know.'], ['Honestly? Boredom', 'Boredom has an off switch. It’s called a walk.']],
    },
  ],
  type: [
    { title: 'Say it like you mean it', phrase: 'I am choosing more screen time', no: 'Too embarrassing', yes: 'Continue', lead: 'Type this, exactly:' },
    { title: 'Put it in writing', phrase: 'My limit was more of a suggestion', no: 'I can’t write that', yes: 'Continue', lead: 'For the record, type:' },
    { title: 'Repeat after me', phrase: 'Past me was wrong and present me knows best', no: 'Present me is tired. Keep it.', yes: 'Continue', lead: 'Word for word:' },
    { title: 'Sign here', phrase: 'I promise to go outside tomorrow', no: 'I won’t make promises', yes: 'Signed', lead: 'Type your promise:' },
  ],
  wait: [
    { title: 'Deep breath.', text: 'In… and out. The button wakes up in a few seconds. A great moment to reconsider.', no: 'Okay, I reconsidered', yes: 'Still resetting' },
    { title: 'Let’s sit with this.', text: 'The button needs a moment. So do you, probably.', no: 'You’re right, keep it', yes: 'Still sure' },
    { title: 'Loading your excuse…', text: 'Please hold. Your decision is important to us.', no: 'Hang up. Keep it.', yes: 'Carry on' },
    { title: 'Hmm.', text: 'Don’t say anything. Just wait. Feel the weight of it.', no: 'That was heavy. Keep it.', yes: 'Continue' },
  ],
  hold: [
    { title: 'Hold to continue', text: 'Press and hold for {s} seconds. Commitment works both ways.', no: 'Let go of this idea', yes: 'Hold me' },
    { title: 'Prove it', text: 'Hold the button for {s} seconds. Letting go early means you weren’t sure.', no: 'I wasn’t sure', yes: 'Press and hold' },
    { title: 'Hold the line', text: 'Keep pressing for {s} seconds. Think about what you’re doing the whole time.', no: 'I thought about it. Keep it.', yes: 'Hold' },
    { title: 'Don’t let go', text: '{S} seconds of holding. About as long as it takes to change your mind.', no: 'Mind changed', yes: 'Hold to go on' },
  ],
  math: [
    { title: 'Quick sanity check', text: 'What’s {q}? Just making sure you’re awake for this decision.', no: 'Math is hard. Keep the limit.', yes: 'Check' },
    { title: 'Pop quiz', text: 'Solve {q}. Big decisions need a working brain.', no: 'I skipped class. Keep it.', yes: 'Submit' },
    { title: 'Brain check', text: '{q} = ? No calculator. We’d know.', no: 'Numbers? No thanks.', yes: 'Check' },
    { title: 'One small sum', text: 'If you can work out {q}, you can surely live without a reset.', no: 'Fair point. Keep it.', yes: 'Answer' },
  ],
  dodge: [
    { title: 'Catch the button', text: 'Press “{yes}”. If you can.', no: 'I give up (good call)', yes: 'Reset', caught: 'Fine. Reset.' },
    { title: 'It’s shy', text: 'The button doesn’t want to do this either. Try anyway.', no: 'Leave it alone', yes: 'Press me', caught: 'Okay, okay.' },
    { title: 'One small click', text: 'Just press “{yes}”. What could go wrong?', no: 'Everything. Keep it.', yes: 'Continue', caught: 'You win.' },
    { title: 'Getting slippery', text: 'This one runs. It knows what you’re up to.', no: 'Let it run', yes: 'Go on', caught: 'Ugh. Go on.' },
  ],
  watching: [
    { title: 'The ring is watching.', text: 'It won’t say anything. It will just quietly go back to being a suggestion. No pressure.', no: 'Fine, keep it', yes: 'Reset anyway' },
    { title: 'Think of the ring.', text: 'It was so proud of you earlier. Look at it. Now look at this button.', no: 'Sorry, ring', yes: 'It’ll get over it' },
    { title: 'Your future self called.', text: 'They said “please don’t”. Then the line went quiet.', no: 'Call them back. Keep it.', yes: 'Let it ring' },
    { title: 'Tomorrow-you says hi.', text: 'They’re the one who’ll have to explain today’s number. Just so you know.', no: 'Be nice to tomorrow-me', yes: 'Tomorrow-me will cope' },
  ],
  final: [
    { title: 'Last chance.', text: 'After this, it’s between you and your browser history.', no: 'Keep my limit', yes: 'Reset my limit' },
    { title: 'This is it.', text: 'One more click and your limit is gone. The ring will remember.', no: 'Keep it after all', yes: 'Reset it' },
    { title: 'Final answer?', text: 'No lifelines left. Well, one: the other button.', no: 'Use the lifeline', yes: 'Final answer: reset' },
    { title: 'Okay. Last one, promise.', text: 'We’re out of questions. You’re out of excuses. Ready?', no: 'Actually, keep it', yes: 'Reset my limit' },
  ],
  done: [
    { title: 'Fine. It’s unlocked.', text: 'You can set a new limit now. We’ll pretend this never happened.' },
    { title: 'Done. No judgement.', text: 'Okay, a little judgement. Set a new limit whenever you’re ready.' },
    { title: 'Unlocked.', text: 'Your limit is gone. The ring is taking it well. Mostly.' },
    { title: 'There. Happy?', text: 'You can pick a new limit now. Maybe a slightly braver one.' },
  ],
};

// a sum that takes a moment but not a pencil
const SUMS = [
  () => { const a = between(6, 13), b = between(6, 9); return a === 10 ? null : [`${a} × ${b}`, a * b]; },
  () => { const a = between(24, 89), b = between(17, 78); return (a % 10) + (b % 10) < 10 ? null : [`${a} + ${b}`, a + b]; },
  () => { const a = between(52, 98), b = between(17, a - 9); return (a % 10) >= (b % 10) ? null : [`${a} − ${b}`, a - b]; },
  () => { const a = between(3, 9), b = between(4, 9), c = between(3, 19); return [`${a} × ${b} + ${c}`, a * b + c]; },
  () => { const a = between(4, 9), b = between(4, 9), c = between(3, 19); return a * b - c < 5 ? null : [`${a} × ${b} − ${c}`, a * b - c]; },
  () => { const a = between(12, 39), b = between(12, 39), c = between(11, 29); return [`${a} + ${b} + ${c}`, a + b + c]; },
  () => { const a = between(2, 6), b = between(3, 9), c = between(2, 5); return [`(${a} + ${b}) × ${c}`, (a + b) * c]; },
];
function makeSum(avoid) {
  for (let tries = 0; tries < 60; tries++) {
    const s = SUMS[rand(SUMS.length)]();
    if (s && s[0] !== avoid) return s;
  }
  return ['9 × 7', 63];
}

// remember what the last attempt showed, and show something else this time
const MEMO = 'bst-gx-last';
function recall() {
  try { return JSON.parse(localStorage.getItem(MEMO)) || {}; } catch { return {}; }
}
function remember(v) {
  try { localStorage.setItem(MEMO, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
function choose(kind, last) {
  const pool = POOLS[kind];
  let k = rand(pool.length);
  if (pool.length > 1 && k === last[kind]) k = (k + 1 + rand(pool.length - 1)) % pool.length;
  return k;
}

function buildRun() {
  const last = recall();
  const used = {};
  const take = kind => { const k = choose(kind, last); used[kind] = k; return { ...POOLS[kind][k] }; };
  const make = kind => {
    const s = take(kind);
    s.type = kind;
    s.flip = coin(); // which side "yes" sits on
    if (kind === 'pick') s.options = shuffle(s.options);
    if (kind === 'wait') s.seconds = between(4, 7);
    if (kind === 'hold') {
      const secs = [2.5, 3, 3.5, 4][rand(4)];
      s.ms = secs * 1000;
      const w = words(secs);
      s.text = s.text.replace('{s}', w).replace('{S}', w[0].toUpperCase() + w.slice(1));
    }
    if (kind === 'math') {
      const [q, answer] = makeSum(last.sum);
      used.sum = q;
      s.answer = answer;
      s.text = s.text.replace('{q}', `<b class="num">${q}</b>`);
    }
    if (kind === 'dodge') {
      s.dodges = between(2, 4);
      s.text = s.text.replace('{yes}', s.yes);
    }
    if (kind === 'type') s.text = `${s.lead} <b>${s.phrase}</b>`;
    // now and then the tempting-looking button is the one that keeps the limit
    if (kind === 'watching') s.trick = coin(0.5);
    if (kind === 'sure') s.trick = coin(0.25);
    return s;
  };
  const middle = shuffle(['sure', 'pick', 'type', 'wait', 'hold', 'math', 'dodge', 'watching']);
  const steps = [make('intro'), ...middle.map(make), make('final')];
  const done = take('done');
  remember(used);
  return { steps, done };
}

const norm = s => s.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!]+$/, '').toLowerCase();

export function runGauntlet({ fromEl, onReset }) {
  const { steps: STEPS, done: DONE } = buildRun();
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'gx-layer';
    layer.innerHTML = `
      <div class="gx-scrim"></div>
      <div class="gx-card" role="alertdialog" aria-modal="true" aria-labelledby="gx-title">
        <div class="gx-body"></div>
      </div>`;
    document.body.appendChild(layer);
    const card = layer.querySelector('.gx-card');
    const body = layer.querySelector('.gx-body');
    let index = -1;
    let closing = false;
    let cleanup = null;
    let result = false;
    let retort = '';

    function close(ok) {
      if (closing) return;
      closing = true;
      result = ok;
      if (cleanup) cleanup();
      layer.classList.add('closing');
      const done = () => {
        layer.remove();
        if (fromEl && fromEl.isConnected && !fromEl.disabled) fromEl.focus({ preventScroll: true });
        resolve(result);
      };
      if (reducedMotion()) { done(); return; }
      const from = card.getBoundingClientRect();
      const to = fromEl && fromEl.isConnected ? fromEl.getBoundingClientRect() : null;
      const bg = getComputedStyle(card).backgroundColor;
      card.style.opacity = '0';
      if (to && to.width) {
        morph({ from, to, fromRadius: 20, toRadius: 'pill', background: bg, fade: 'out', duration: 380, easing: EASE_OUT, z: 4300 })
          .finished.then(shell => { shell.remove(); done(); });
      } else setTimeout(done, 200);
    }

    function actions(step, { yesDisabled = false } = {}) {
      const noCls = step.trick ? 'btn-primary' : 'btn-secondary';
      const yesCls = step.type === 'final' ? 'btn-danger' : step.trick ? 'btn-secondary' : 'btn-primary';
      const no = `<button class="btn ${noCls} btn-sm gx-no" type="button">${step.no}</button>`;
      const yes = step.yes ? `<button class="btn ${yesCls} btn-sm gx-yes" type="button"${yesDisabled ? ' disabled' : ''}>${step.yes}</button>` : '';
      return `<div class="gx-actions">${step.flip ? yes + no : no + yes}</div>`;
    }

    function stepHtml(step) {
      let extra = '';
      if (step.type === 'pick') extra = `<div class="gx-options">${step.options.map(([o], k) => `<button class="gx-option" type="button" data-k="${k}">${o}</button>`).join('')}</div>`;
      if (step.type === 'type') extra = `<input class="gx-input" type="text" autocomplete="off" spellcheck="false" placeholder="${step.phrase}" aria-label="Type the sentence">`;
      if (step.type === 'math') extra = '<input class="gx-input gx-num" type="text" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="Your answer">';
      const said = retort ? `<p class="gx-retort">${retort}</p>` : '';
      retort = '';
      return `<div class="gx-step" data-kind="${step.type}">
        ${said}
        <h3 class="gx-title display" id="gx-title">${step.title}</h3>
        <p class="gx-text">${step.text}</p>
        ${extra}
        ${actions(step, { yesDisabled: ['type', 'math', 'wait'].includes(step.type) })}
      </div>`;
    }

    function show(i, dir = 1) {
      if (cleanup) { cleanup(); cleanup = null; }
      index = i;
      const old = body.firstElementChild;
      const next = document.createElement('div');
      next.innerHTML = i < STEPS.length ? stepHtml(STEPS[i]) : `<div class="gx-step gx-done">
          <span class="gx-done-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5.5 12.5 10 17 18.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h3 class="gx-title display" id="gx-title">${DONE.title}</h3>
          <p class="gx-text">${DONE.text}</p>
          <div class="gx-actions"><button class="btn btn-primary btn-sm gx-close" type="button">Close</button></div>
        </div>`;
      const stepEl = next.firstElementChild;
      animateHeight(body, () => {
        if (old) {
          old.classList.add('gx-leaving');
          if (reducedMotion()) old.remove();
          else {
            old.style.position = 'absolute';
            old.style.inset = '0 0 auto 0';
            old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-28 * dir}px)` }], { duration: 220, easing: EASE_OUT, fill: 'forwards' })
              .finished.then(() => old.remove(), () => old.remove());
          }
        }
        body.appendChild(stepEl);
      }, { duration: 420 });
      if (!reducedMotion()) {
        stepEl.animate([{ opacity: 0, transform: `translateX(${34 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 60, easing: EASE_OUT, fill: 'backwards' });
      }
      wireStep(stepEl, i);
    }

    let advancing = false;
    function advance() {
      if (closing || advancing) return;
      if (index === STEPS.length - 1) {
        advancing = true;
        Promise.resolve(onReset()).then(() => {
          advancing = false;
          result = true;
          show(STEPS.length);
        }, () => close(false));
        return;
      }
      show(index + 1);
    }

    function wireStep(el, i) {
      const step = STEPS[i];
      const focusFirst = () => {
        if (closing || !el.isConnected) return;
        const f = el.querySelector('.gx-input') || el.querySelector('.gx-close') || el.querySelector('.gx-no');
        if (f) f.focus({ preventScroll: true });
      };
      setTimeout(focusFirst, reducedMotion() ? 0 : 200);
      if (!step) {
        el.querySelector('.gx-close').addEventListener('click', () => close(true));
        return;
      }
      el.querySelector('.gx-no').addEventListener('click', () => close(false));
      const yes = el.querySelector('.gx-yes');

      if (step.type === 'intro' || step.type === 'sure' || step.type === 'watching' || step.type === 'final') yes.addEventListener('click', advance);

      if (step.type === 'pick') {
        let picked = false;
        for (const o of el.querySelectorAll('.gx-option')) {
          o.addEventListener('click', () => {
            if (picked) return;
            picked = true;
            retort = step.options[Number(o.dataset.k)][1];
            o.classList.add('picked');
            setTimeout(advance, reducedMotion() ? 0 : 180);
          });
        }
      }

      if (step.type === 'type' || step.type === 'math') {
        const input = el.querySelector('.gx-input');
        const ok = () => (step.type === 'type'
          ? norm(input.value) === norm(step.phrase)
          : input.value.trim() !== '' && Number(input.value.trim()) === step.answer);
        input.addEventListener('input', () => {
          if (step.type === 'math') input.value = input.value.replace(/\D/g, '').slice(0, 4);
          yes.disabled = !ok();
          input.classList.toggle('good', ok());
          input.classList.remove('bad');
        });
        input.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (ok()) { advance(); return; }
          input.classList.remove('bad');
          void input.offsetWidth;
          input.classList.add('bad');
        });
        yes.addEventListener('click', () => {
          if (ok()) { advance(); return; }
          input.classList.remove('bad');
          void input.offsetWidth;
          input.classList.add('bad');
        });
      }

      if (step.type === 'wait') {
        let left = step.seconds;
        const label = step.yes;
        yes.textContent = `${label} (${left})`;
        const t = setInterval(() => {
          left -= 1;
          if (left <= 0) {
            clearInterval(t);
            yes.disabled = false;
            yes.textContent = label;
            if (!reducedMotion()) yes.animate([{ transform: 'scale(0.92)' }, { transform: 'none' }], { duration: 420, easing: POP });
          } else yes.textContent = `${label} (${left})`;
        }, 1000);
        yes.addEventListener('click', advance);
        cleanup = () => clearInterval(t);
      }

      if (step.type === 'hold') {
        yes.classList.add('gx-hold');
        yes.innerHTML = `<span class="gx-fill"></span><span class="gx-hold-label">${step.yes}</span>`;
        const fill = yes.querySelector('.gx-fill');
        const label = yes.querySelector('.gx-hold-label');
        let raf = 0;
        let start = 0;
        const stop = () => {
          cancelAnimationFrame(raf);
          raf = 0;
          fill.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
          fill.style.transform = 'scaleX(0)';
          label.textContent = step.yes;
        };
        const tick = now => {
          const p = Math.min(1, (now - start) / step.ms);
          fill.style.transform = `scaleX(${p})`;
          const secs = Math.ceil((step.ms - (now - start)) / 1000);
          label.textContent = p < 1 ? `Keep holding… ${secs}` : 'Okay, okay';
          if (p >= 1) { raf = 0; advance(); return; }
          raf = requestAnimationFrame(tick);
        };
        const begin = e => {
          if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
          if (e.type === 'keydown') { if (e.repeat) return; e.preventDefault(); }
          if (e.type === 'pointerdown' && e.button !== 0) return;
          if (raf) return;
          fill.style.transition = 'none';
          start = performance.now();
          raf = requestAnimationFrame(tick);
        };
        yes.addEventListener('pointerdown', begin);
        yes.addEventListener('keydown', begin);
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) yes.addEventListener(ev, () => { if (raf) stop(); });
        yes.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && raf) stop(); });
        cleanup = () => cancelAnimationFrame(raf);
      }

      if (step.type === 'dodge') {
        let left = step.dodges;
        yes.classList.add('gx-dodge');
        const flee = e => {
          if (left <= 0 || (e.pointerType && e.pointerType !== 'mouse')) return;
          left -= 1;
          const c = card.getBoundingClientRect();
          const b = yes.getBoundingClientRect();
          const floor = el.querySelector('.gx-text').getBoundingClientRect().bottom + 8; // never over the words
          const nb = el.querySelector('.gx-no').getBoundingClientRect();
          const cur = yes._off || [0, 0];
          const baseL = b.left - cur[0];
          const baseT = b.top - cur[1];
          // somewhere inside the card, as far from the pointer as a few tries find
          let best = null;
          for (let tries = 0; tries < 30; tries++) {
            const cx = (Math.random() * 2 - 1) * (c.width * 0.45);
            const cy = -Math.random() * Math.max(0, baseT - floor);
            const l = baseL + cx;
            const t = baseT + cy;
            if (l < c.left + 12 || l + b.width > c.right - 12 || t < floor || t + b.height > c.bottom - 8) continue;
            // and never over "keep my limit", which stays one click away
            if (l < nb.right + 6 && l + b.width > nb.left - 6 && t < nb.bottom + 6 && t + b.height > nb.top - 6) continue;
            const d = Math.hypot(l + b.width / 2 - e.clientX, t + b.height / 2 - e.clientY);
            if (!best || d > best.d) best = { cx, cy, d };
            if (d > 130) break;
          }
          let dx = best ? best.cx : -cur[0];
          let dy = best ? best.cy : -cur[1];
          if (left === 0) { dx = 0; dy = 0; }
          yes._off = [dx, dy];
          yes.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
          if (left === 0) yes.textContent = step.caught;
        };
        yes.addEventListener('pointerenter', flee);
        yes.addEventListener('click', () => { if (left <= 0 || !yes._off || (!yes._off[0] && !yes._off[1])) advance(); });
      }
    }

    // focus stays inside; Esc is always "keep my limit"
    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(result);
        return;
      }
      e.stopPropagation();
      if (e.key !== 'Tab') return;
      const list = [...card.querySelectorAll('button, input')].filter(b => !b.disabled && b.offsetParent !== null && !b.closest('.gx-leaving'));
      if (!list.length) return;
      const k = list.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && k === list.length - 1) { e.preventDefault(); list[0].focus(); }
    });
    layer.querySelector('.gx-scrim').addEventListener('pointerdown', () => close(result));

    // open: the Reset button grows into the card
    show(0);
    requestAnimationFrame(() => layer.classList.add('open'));
    const src = fromEl && fromEl.isConnected ? fromEl.getBoundingClientRect() : null;
    if (src && src.width && !reducedMotion()) {
      card.style.opacity = '0';
      const m = morph({ from: src, to: card.getBoundingClientRect(), fromRadius: 'pill', toRadius: 20, background: getComputedStyle(card).backgroundColor, duration: 520, easing: POP, z: 4300 });
      m.finished.then(() => {
        card.style.opacity = '';
        card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
        dropShell(m.shell, 160);
      });
    }
  });
}
