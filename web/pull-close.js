// Memoir for Windows has no title bar, so the report's Settings button closes it too. Pull it down and let go:
// Memoir closes to the notification area, where it keeps counting (as closing its window always did). Resting the
// mouse by it for about a second (the corner where a window's close button would be) shows how: it nudges down,
// turns into a red X and says "Pull to close". A click still opens Settings. In the tour's step for it (data-pull-tour on the page) a pull down springs back instead and says so
// (memoir:pulled). Styles in desktop-chrome.css; loaded on the report only (desktop-bridge.js).
const btn = document.getElementById('settings-btn');
const morph = document.getElementById('settings');
const DOWN = 84;          // px down to close
const NEAR = 40;          // px around the button that count as resting by it (up to the window's corner)
const LINGER = 1000;      // ms resting there before the hint
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

if (btn && morph) {
  const label = document.createElement('span');
  label.className = 'pull-label';
  label.setAttribute('aria-hidden', 'true');
  label.innerHTML = '<span class="pull-text">Pull to close</span><svg viewBox="0 0 12 12"><path d="M6 2.5v7M3 6.6 6 9.6 9 6.6"/></svg>';
  // the way it goes, unseen: the tour's light takes it in
  const track = document.createElement('span');
  track.className = 'pull-track';
  morph.append(label, track);
  const text = label.querySelector('.pull-text');

  const settingsOpen = () => morph.classList.contains('open');
  const tourStep = () => document.documentElement.hasAttribute('data-pull-tour');
  const allowed = () => !settingsOpen() && !document.querySelector('.wel') && (!document.body.classList.contains('touring') || tourStep());
  const words = armed => (armed ? 'Release to close' : 'Pull to close');
  const say = what => {
    if (text.textContent === what) return;
    text.textContent = what;
    if (!reduced()) text.animate([{ opacity: 0, translate: '0 3px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  };

  // ---------- the hint ----------
  let near = false, linger = 0, hinted = false;
  function showHint(nudge = true) {
    if (!hinted) { hinted = true; morph.classList.add('pull-hint'); btn.classList.add('pull-x'); say(words(false)); }
    // a little tug down, twice, as if pulled
    if (nudge && !reduced()) {
      const tug = [{ translate: '0 0' }, { translate: '0 9px', offset: 0.28 }, { translate: '0 0', offset: 0.56 }, { translate: '0 4px', offset: 0.76 }, { translate: '0 0' }];
      for (const el of [btn, label]) el.animate(tug, { duration: 950, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', composite: 'add' });
    }
  }
  function hideHint(force = false) {
    if (!hinted || (pull && pull.active && !force)) return;
    hinted = false; morph.classList.remove('pull-hint'); btn.classList.remove('pull-x');
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
  // a little give past the line
  const travel = dy => (dy <= DOWN ? dy * 0.8 : DOWN * 0.8 + (dy - DOWN) * 0.22);
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !allowed()) return;
    pull = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, armed: false };
    try { btn.setPointerCapture(e.pointerId); } catch { /* gone already */ }
  });
  btn.addEventListener('pointermove', e => {
    if (!pull || e.pointerId !== pull.id) return;
    const dy = e.clientY - pull.y0;
    if (!pull.active) {
      // a click, or a move sideways: not a pull
      if (dy < 6 || Math.abs(e.clientX - pull.x0) > dy) return;
      pull.active = true; clearTimeout(linger);
      morph.classList.add('pulling'); showHint(false);
    }
    const armed = dy >= DOWN;
    morph.style.setProperty('--pull', `${travel(Math.max(0, dy)).toFixed(1)}px`);
    pull.armed = armed;
    morph.classList.toggle('pull-armed', armed);
    say(words(armed));
  });
  const finish = (e, cancelled) => {
    if (!pull || (e && e.pointerId !== pull.id)) return;
    const { active, armed } = pull; pull = null;
    if (!active) return;                       // a click: Settings, as ever
    swallow = true; setTimeout(() => { swallow = false; }, 400);
    if (armed && !cancelled) close(); else springBack();
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

  function springBack() {
    morph.classList.remove('pulling', 'pull-armed');
    morph.style.setProperty('--pull', '0px');
    say(words(false));
    if (!near && !tourStep()) setTimeout(() => { if (!near && !(pull && pull.active)) hideHint(true); }, 380);
  }
  function close() {
    // the tour: it would close here; it springs back and the step ticks off
    if (tourStep()) { say('That’s it'); document.dispatchEvent(new CustomEvent('memoir:pulled')); setTimeout(springBack, 650); return; }
    morph.classList.remove('pulling');
    morph.classList.add('pull-closing');
    // the page lets go as the button drops away
    const fade = reduced() ? null : document.documentElement.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
    const go = () => window.memoir.request('window.minimize').catch(() => { if (fade) fade.cancel(); morph.classList.remove('pull-closing', 'pull-armed'); springBack(); });
    if (fade) fade.finished.then(go, go); else go();
  }

  // the tour shows it once, and ends it when it moves on (recap.js, the step "Pull to close")
  window.memoir.pullHint = (on = true) => { if (on) showHint(); else { near = false; hideHint(true); } };
}
