// Installing and uninstalling Memoir (setup.html), in a small window of Memoir.exe's own (Setup.cs).
//
// Installing: the clock comes in while the files go in, then it winds once and says it's ready, and Memoir opens
// in its place. Uninstalling: the clock comes in smiling and its hands droop (10:10 to 8:20); it asks once, with
// the email for feedback and a switch to keep the history. Keep Memoir: it smiles again and goes. Uninstall: the
// question folds away, the clock grows into the middle and turns once while Memoir is removed, then says thank you.
//
// Memoir.exe and the page talk in messages. To it: ready (painted: show the window), start (install now), launch
// (open the installed Memoir), uninstall {keep}, copy {text}, drag, close. From it: shown, done {ok, error,
// migrated}.

import { playLogo } from './shared/logo.js';
import { reducedMotion, EASE_OUT, POP } from './shared/fx.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const mode = root.dataset.mode;
const host = window.chrome && window.chrome.webview;
const send = (op, data = {}) => host && host.postMessage({ op, ...data });
const still = reducedMotion();
const wait = ms => new Promise(r => setTimeout(r, ms));
const WM = '<span class="wordmark wm-in">Memoir</span>';
const SWEEP = 'cubic-bezier(0.45, 0, 0.1, 1)';
const EMAIL = 'iamminavian@gmail.com';

const logo = $('logo'), title = $('title'), sub = $('sub'), ask = $('ask');
const clock = logo.querySelector('.lg-clock');
const hand = { min: logo.querySelector('.lg-min'), hour: logo.querySelector('.lg-hour') };

// ---------- the hands' poses ----------
// The hands turn about a point a little below the ring's middle; pointing down, the long one would reach into the
// ring, so that point moves up opposite it (logo.js does the same for a live clock)
const BAR = { min: [59, 11], hour: [45, 11] };
const shift = (minAngle, [w, h]) => {
  const phi = ((minAngle + 30) * Math.PI) / 180;
  return `${((-8 * Math.sin(phi)) / w * 100).toFixed(3)}% ${((8 * Math.cos(phi) - 8) / h * 100).toFixed(3)}%`;
};
const POSE = { smile: { min: -30, hour: 215 }, sad: { min: 30, hour: 160 }, sadder: { min: 48, hour: 142 } };
function pose(name, ms = 1100, ease = SWEEP) {
  const p = POSE[name];
  logo.style.setProperty('--hand-ms', `${ms}ms`);
  logo.style.setProperty('--hand-ease', ease);
  for (const k of ['min', 'hour']) {
    hand[k].style.transform = `rotate(${p[k]}deg)`;
    hand[k].style.translate = shift(p.min, BAR[k]);
  }
}

// ---------- words ----------
async function swap(el, html) {
  if (el.innerHTML === html) return;
  if (still || !el.innerHTML) { el.innerHTML = html; if (!still) fadeUp(el, 0); return; }
  const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  await out.finished.catch(() => {});
  el.innerHTML = html;
  el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE_OUT });
  out.cancel();
}
const fadeUp = (el, delay) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay, easing: EASE_OUT, fill: 'backwards' });

// ---------- talking to Memoir.exe ----------
let shown, done;
const whenShown = new Promise(r => { shown = r; });
const whenDone = new Promise(r => { done = r; });
if (host) host.addEventListener('message', e => {
  const m = e.data || {};
  if (m.op === 'shown') shown();
  else if (m.op === 'done') done(m);
});
else { shown(); }

// the empty parts of the window move it
addEventListener('pointerdown', e => {
  if (e.button === 0 && !e.target.closest('a, button, label, input')) send('drag');
});

function fail(heading, error) {
  pose('sad', 900);
  swap(title, heading);
  swap(sub, '');
  $('error-text').textContent = error || 'Something went wrong.';
  const box = $('error');
  box.hidden = false;
  if (!still) [...box.children].forEach((el, i) => fadeUp(el, 120 + i * 70));
  $('error-close').addEventListener('click', () => send('close'), { once: true });
  $('error-close').focus({ focusVisible: false });
}

// ---------- installing ----------
async function install() {
  const update = mode === 'update';
  title.innerHTML = update ? `Updating ${WM}` : `Installing ${WM}`;
  sub.textContent = 'Your screen time, kept on your computer';
  title.style.opacity = sub.style.opacity = '0';
  await paint();
  send('ready');
  await whenShown;
  title.style.opacity = sub.style.opacity = '';
  send('start');
  const entrance = playLogo(logo, { delay: 60 });
  if (!still) { fadeUp(title, 380); fadeUp(sub, 470); }
  await entrance;
  // still working: the clock breathes (never a spinner or a bar)
  let breath = null;
  const timer = setTimeout(() => {
    if (!still) breath = logo.animate([{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }], { duration: 1800, iterations: Infinity, easing: 'ease-in-out' });
  }, 250);
  const result = await whenDone;
  clearTimeout(timer);
  if (breath) breath.cancel();
  if (!result.ok) return fail(`${WM} couldn't be ${update ? 'updated' : 'installed'}`, result.error);
  // ready: the long hand winds once round, the knob gives a little click
  if (!still) {
    hand.min.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 950, easing: SWEEP, composite: 'add' });
    hand.hour.animate([{ rotate: '0deg' }, { rotate: '30deg' }, { rotate: '0deg' }], { duration: 950, easing: 'ease-in-out', composite: 'add' });
    logo.querySelector('.lg-knob').animate([{ transform: 'none' }, { transform: 'scale(1.35)', offset: 0.35 }, { transform: 'none' }], { duration: 520, delay: 640, easing: POP });
  }
  swap(title, update ? `${WM} is up to date` : `${WM} is ready`);
  swap(sub, result.migrated ? 'Your history came along too' : 'Opening it for you');
  await wait(still ? 300 : 1250);
  send('launch');
}

// ---------- uninstalling ----------
async function uninstall() {
  title.innerHTML = `Uninstall ${WM}?`;
  ask.hidden = false;
  const parts = [...ask.querySelector('.st-ask-in').children];
  if (!still) { title.style.opacity = '0'; parts.forEach(el => { el.style.opacity = '0'; }); }
  await paint();
  send('ready');
  await whenShown;
  title.style.opacity = '';
  parts.forEach(el => { el.style.opacity = ''; });
  const entrance = playLogo(logo, { delay: 40, pace: 0.85 });
  if (!still) { fadeUp(title, 300); parts.forEach((el, i) => fadeUp(el, 420 + i * 70)); }
  await entrance;
  let going = false, settled = false;
  // it notices you're leaving
  await wait(still ? 0 : 120);
  if (!going) pose('sad', still ? 0 : 1300, 'cubic-bezier(0.5, 0, 0.3, 1)');
  setTimeout(() => { settled = true; }, still ? 0 : 1300);

  // hovering Keep Memoir cheers it up; hovering Uninstall, it droops further and trembles a little
  const stay = $('stay'), go = $('go');
  const mood = name => { if (!going && settled) pose(name, 520, EASE_OUT); };
  stay.addEventListener('pointerenter', () => mood('smile'));
  stay.addEventListener('pointerleave', () => mood('sad'));
  go.addEventListener('pointerenter', () => {
    mood('sadder');
    if (!going && settled && !still) clock.animate([{ rotate: '0deg' }, { rotate: '-4deg' }, { rotate: '3.5deg' }, { rotate: '-2.5deg' }, { rotate: '1.5deg' }, { rotate: '0deg' }], { duration: 560, delay: 120, easing: 'ease-in-out' });
  });
  go.addEventListener('pointerleave', () => mood('sad'));

  // the email: a click on it writes to me, Copy copies it
  const copy = $('copy');
  let copied = 0;
  copy.addEventListener('click', () => {
    send('copy', { text: EMAIL });
    copy.classList.add('copied');
    copy.setAttribute('aria-label', 'Copied');
    clearTimeout(copied);
    copied = setTimeout(() => { copy.classList.remove('copied'); copy.setAttribute('aria-label', 'Copy the email address'); }, 1800);
  });

  stay.addEventListener('click', async () => {
    if (going) return;
    going = true;
    stay.disabled = go.disabled = true;
    pose('smile', 600, EASE_OUT);
    if (!still) logo.animate([{ transform: 'none' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'none' }], { duration: 620, delay: 120, easing: POP });
    fold(ask);
    swap(title, `Yay, ${WM} stays!`);
    swap(sub, 'Thank you for keeping it');
    await wait(still ? 500 : 1500);
    send('close');
  });

  go.addEventListener('click', async () => {
    if (going) return;
    going = true;
    stay.disabled = go.disabled = true;
    send('uninstall', { keep: $('keep').checked });
    // everything else folds away and the clock grows into a big one in the middle (the same clock, its own size
    // changing, so it stays sharp), then turns round once while Memoir goes
    fold(ask);
    fold(title, 22);
    fold(sub, 5);
    const big = Math.round(Math.min(innerWidth * 0.5, innerHeight * 0.4));
    let turn = null;
    if (!still) {
      logo.animate([{ width: `${logo.offsetWidth}px` }, { width: `${big}px` }], { duration: 760, easing: 'cubic-bezier(0.45, 0, 0.15, 1)', fill: 'forwards' });
      turn = logo.animate([{ transform: 'none' }, { transform: 'rotate(360deg)' }], { duration: 1100, delay: 560, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
    }
    const [result] = await Promise.all([whenDone, turn ? turn.finished : null]);
    if (!result.ok) {
      logo.getAnimations().forEach(a => a.cancel());
      [ask, title, sub].forEach(el => el.getAnimations().forEach(a => a.cancel()));
      ask.hidden = true;
      return fail(`${WM} couldn't be uninstalled`, result.error);
    }
    // then, in its place: thank you
    if (!still) await logo.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished;
    logo.style.display = 'none';
    [title, sub].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    title.classList.add('st-thanks');
    title.textContent = 'Thank you';
    sub.textContent = result.kept ? 'Your history is kept, for if you come back' : 'For all the time together';
    if (!still) { fadeUp(title, 0); fadeUp(sub, 110); }
    await wait(still ? 1200 : 1900);
    if (!still) await document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished;
    send('close');
  });

  // Esc: keep it
  addEventListener('keydown', e => { if (e.key === 'Escape' && !going) stay.click(); });
}

// a part folds away (the rest comes together in the middle as it goes)
function fold(el, margin = 20) {
  if (still) { el.style.display = 'none'; return; }
  const h = el.offsetHeight;
  el.animate([{ height: `${h}px`, marginTop: `${margin}px` }, { height: '0px', marginTop: '0px' }], { duration: 560, easing: 'cubic-bezier(0.45, 0, 0.15, 1)', fill: 'forwards' });
  el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
}

// ready to be shown: its fonts are in (the window is hidden until then, and a hidden page doesn't paint, so not a frame)
const paint = () => document.fonts.ready;

if (mode === 'uninstall') uninstall(); else install();
