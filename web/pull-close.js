// The report's Settings button closes it too. Pull it down and let go: in the browser, this tab closes; Memoir for
// Windows (no title bar, so the button does what its buttons did) closes to the notification area, where it keeps
// counting, as closing its window always did. Memoir for Windows only: pull it up for full screen, or back (as F11
// does). Resting the mouse by it for about a second (the corner where a window's close button would be) shows how:
// it turns into a red X, says "Pull to close" and nudges down, again and again with a short rest between, for as
// long as the mouse stays there. A click still opens Settings. In Memoir for Windows' tour step for it
// (data-pull-tour on the page) a pull down springs straight back instead and says so (memoir:pulled). Styles in
// recap.css. The same file in both.
const desktop = !!window.memoir?.windows;
const btn = document.getElementById('settings-btn');
const morph = document.getElementById('settings');
const DOWN = 84;          // px down to close
const UP = 20;            // px up for full screen (a maximized window has its gear about 30 px from the screen's top)
const NEAR = 40;          // px around the button that count as resting by it (up to the window's corner)
const LINGER = 1000;      // ms resting there before the hint
const NUDGE_MS = 950;     // one nudge (a tug down, twice)
const REST_MS = 650;      // the rest before the next
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

if (btn && morph) {
  document.documentElement.classList.add('can-pull');
  const label = document.createElement('span');
  label.className = 'pull-label';
  label.setAttribute('aria-hidden', 'true');
  label.innerHTML = '<span class="pull-text">Pull to close</span><svg viewBox="0 0 12 12"><path d="M6 2.5v7M3 6.6 6 9.6 9 6.6"/></svg>';
  // the way it goes, unseen: the tour's light takes it in
  const track = document.createElement('span');
  track.className = 'pull-track';
  morph.append(label, track);
  // pulled up (Memoir for Windows): full screen's corners (outward), or, full screen already, inward
  if (desktop) btn.insertAdjacentHTML('beforeend', '<svg class="g-full" viewBox="0 0 20 20" aria-hidden="true"><path class="gf-in" d="M4.5 8.5V7a2.5 2.5 0 0 1 2.5-2.5h1.5M11.5 4.5H13a2.5 2.5 0 0 1 2.5 2.5v1.5M15.5 11.5V13a2.5 2.5 0 0 1-2.5 2.5h-1.5M8.5 15.5H7A2.5 2.5 0 0 1 4.5 13v-1.5"/><path class="gf-out" d="M8 4.5V6a2 2 0 0 1-2 2H4.5M12 4.5V6a2 2 0 0 0 2 2h1.5M12 15.5V14a2 2 0 0 1 2-2h1.5M8 15.5V14a2 2 0 0 0-2-2H4.5"/></svg>');
  const text = label.querySelector('.pull-text');

  const settingsOpen = () => morph.classList.contains('open');
  const tourStep = () => document.documentElement.hasAttribute('data-pull-tour');
  const fullScreen = () => document.documentElement.classList.contains('win-full');
  const allowed = () => !settingsOpen() && !document.querySelector('.wel') && (!document.body.classList.contains('touring') || tourStep());
  const words = (up, armed) => (up
    ? (fullScreen() ? (armed ? 'Release to leave full screen' : 'Pull up to leave full screen') : (armed ? 'Release for full screen' : 'Pull up for full screen'))
    : (armed ? 'Release to close' : 'Pull to close'));
  const say = what => {
    if (text.textContent === what) return;
    text.textContent = what;
    if (!reduced()) text.animate([{ opacity: 0, translate: '0 3px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  };

  // ---------- the hint ----------
  let near = false, linger = 0, hinted = false, again = 0;
  // a little tug down, twice, as if pulled
  function nudge() {
    if (reduced()) return;
    const tug = [{ translate: '0 0' }, { translate: '0 9px', offset: 0.28 }, { translate: '0 0', offset: 0.56 }, { translate: '0 4px', offset: 0.76 }, { translate: '0 0' }];
    for (const el of [btn, label]) el.animate(tug, { duration: NUDGE_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', composite: 'add' });
  }
  // and again after a short rest, while the mouse stays by it (not while it's pulled)
  function keepNudging() {
    clearTimeout(again);
    again = setTimeout(() => { if (hinted && near && !(pull && pull.active)) { nudge(); keepNudging(); } }, NUDGE_MS + REST_MS);
  }
  function showHint(tug = true) {
    if (!hinted) { hinted = true; morph.classList.add('pull-hint'); btn.classList.add('pull-x'); say(words(false, false)); }
    if (tug) { nudge(); keepNudging(); }
  }
  function hideHint(force = false) {
    if (!hinted || (pull && pull.active && !force)) return;
    clearTimeout(again);
    hinted = false; morph.classList.remove('pull-hint', 'pull-going-up'); btn.classList.remove('pull-x', 'pull-up');
  }
  const isNear = (x, y) => { const r = btn.getBoundingClientRect(); return x >= r.left - NEAR && y <= r.bottom + NEAR; };
  addEventListener('pointermove', e => {
    if (pull && pull.active) return;
    const inside = isNear(e.clientX, e.clientY);
    if (inside === near) return;
    near = inside;
    clearTimeout(linger);
    if (inside) linger = setTimeout(() => { if (near && allowed()) showHint(); }, LINGER);
    else hideHint();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { near = false; clearTimeout(linger); hideHint(); });
  // Settings opening from it: the gear's own look again, at once
  btn.addEventListener('click', () => { clearTimeout(linger); hideHint(true); });

  // ---------- the pull ----------
  let pull = null, swallow = false;
  // down: a little give past the line; up: only a little way (the window's edge is right there)
  const travel = dy => (dy >= 0 ? (dy <= DOWN ? dy * 0.8 : DOWN * 0.8 + (dy - DOWN) * 0.22) : -Math.min(14, -dy * 0.35));
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !allowed()) return;
    pull = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, armed: false, up: false };
    try { btn.setPointerCapture(e.pointerId); } catch { /* gone already */ }
  });
  btn.addEventListener('pointermove', e => {
    if (!pull || e.pointerId !== pull.id) return;
    // (only Memoir for Windows goes up: full screen)
    const dy = desktop ? e.clientY - pull.y0 : Math.max(0, e.clientY - pull.y0);
    if (!pull.active) {
      // a click, or a move sideways: not a pull
      if (Math.abs(dy) < 6 || Math.abs(e.clientX - pull.x0) > Math.abs(e.clientY - pull.y0)) return;
      pull.active = true; clearTimeout(linger);
      morph.classList.add('pulling'); showHint(false);
    }
    const up = dy < 0, armed = up ? -dy >= UP : dy >= DOWN;
    if (up !== pull.up) {
      pull.up = up;
      btn.classList.toggle('pull-up', up); btn.classList.toggle('pull-x', !up);
      morph.classList.toggle('pull-going-up', up);
    }
    morph.style.setProperty('--pull', `${travel(dy).toFixed(1)}px`);
    pull.armed = armed;
    morph.classList.toggle('pull-armed', armed);
    say(words(up, armed));
  });
  const finish = (e, cancelled) => {
    if (!pull || (e && e.pointerId !== pull.id)) return;
    const { active, armed, up } = pull; pull = null;
    if (!active) return;                       // a click: Settings, as ever
    swallow = true; setTimeout(() => { swallow = false; }, 400);
    if (!armed || cancelled) springBack();
    else if (up) { window.memoir.request('window.fullscreen').catch(() => {}); springBack(); }
    else close();
  };
  btn.addEventListener('pointerup', e => finish(e, false));
  btn.addEventListener('pointercancel', e => finish(e, true));
  btn.addEventListener('lostpointercapture', e => finish(e, true));
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !pull || !pull.active) return;
    e.preventDefault(); e.stopPropagation();
    const id = pull.id; finish(null, true);
    try { btn.releasePointerCapture(id); } catch { /* released */ }
  }, true);
  // the click that ends a pull isn't one for Settings
  addEventListener('click', e => {
    if (!swallow || !(e.target instanceof Element) || !e.target.closest('#settings-btn')) return;
    swallow = false; e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // home on its spring, at once; `said` stays on the label a moment on the way
  let saying = 0;
  function springBack(said = null) {
    morph.classList.remove('pulling', 'pull-armed', 'pull-going-up');
    morph.style.setProperty('--pull', '0px');
    btn.classList.remove('pull-up');
    if (hinted) btn.classList.add('pull-x');
    clearTimeout(saying);
    say(said || words(false, false));
    if (said) saying = setTimeout(() => { if (!(pull && pull.active)) say(words(false, false)); }, 1100);
    if (hinted) keepNudging();
    if (!near && !tourStep()) setTimeout(() => { if (!near && !(pull && pull.active)) hideHint(true); }, 380);
  }
  function close() {
    // the tour: it would close here; it springs back and the step ticks off
    if (tourStep()) { document.dispatchEvent(new CustomEvent('memoir:pulled')); springBack('That’s it'); return; }
    morph.classList.remove('pulling');
    morph.classList.add('pull-closing');
    // the page lets go as the button drops away
    const fade = reduced() ? null : document.documentElement.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
    // (and if it couldn't close, it comes back)
    const stay = () => { if (fade) fade.cancel(); morph.classList.remove('pull-closing', 'pull-armed'); springBack(); };
    const go = desktop
      ? () => window.memoir.request('window.minimize').catch(stay)
      // in the browser: this tab (a window of its own: that window)
      : () => chrome.tabs.getCurrent().then(tab => (tab ? chrome.tabs.remove(tab.id) : window.close())).then(() => setTimeout(stay, 400), stay);
    if (fade) fade.finished.then(go, go); else go();
  }

  // Memoir for Windows' tour shows it once, and ends it when it moves on (recap.js, the step "Pull to close")
  if (desktop) window.memoir.pullHint = (on = true) => { if (on) showHint(); else { near = false; hideHint(true); } };
}
