// The popup's close button, at its top right beside Resume (Memoir for Windows: Today by the clock, src/Flyout.cs).
// A click closes it, or pull it down and let go, as the report's gear closes its tab or window (pull-close.js); a
// short pull springs back. A click elsewhere and Esc still close it too. Styles in popup.css.
const PULL = 56;          // px down to close
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = !!window.memoir?.windows;
const top = document.querySelector('.top');

// (Windows: only Today by the clock, a popup there too)
if (top && (!desktop || window.memoir.flyout)) {
  const side = document.createElement('div');
  side.className = 'close-side';
  const resume = document.getElementById('resume');
  if (resume) side.append(resume);
  const btn = document.createElement('button');
  btn.className = 'close-x';
  btn.type = 'button';
  btn.setAttribute('aria-label', desktop ? 'Close Today' : 'Close');
  btn.title = 'Close (or pull down)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
  side.append(btn);
  top.append(side);

  const close = () => (desktop ? window.memoir.request('window.close').catch(() => {}) : window.close());
  let pull = null, swallow = false;
  const travel = dy => (dy <= PULL ? dy * 0.8 : PULL * 0.8 + (dy - PULL) * 0.22);
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    pull = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, armed: false };
    try { btn.setPointerCapture(e.pointerId); } catch { /* gone already */ }
  });
  btn.addEventListener('pointermove', e => {
    if (!pull || e.pointerId !== pull.id) return;
    const dy = e.clientY - pull.y0;
    if (!pull.active) {
      if (dy < 6 || Math.abs(e.clientX - pull.x0) > dy) return;
      pull.active = true; btn.classList.add('pulling');
    }
    btn.style.setProperty('--pull', `${travel(Math.max(0, dy)).toFixed(1)}px`);
    pull.armed = dy >= PULL;
    btn.classList.toggle('armed', pull.armed);
  });
  const finish = (e, cancelled) => {
    if (!pull || (e && e.pointerId !== pull.id)) return;
    const { active, armed } = pull; pull = null;
    if (!active) return;                                   // a click: it closes (below)
    swallow = true; setTimeout(() => { swallow = false; }, 400);
    btn.classList.remove('pulling', 'armed');
    if (armed && !cancelled) { btn.classList.add('gone'); setTimeout(close, reduced() ? 0 : 120); return; }
    btn.style.setProperty('--pull', '0px');
  };
  btn.addEventListener('pointerup', e => finish(e, false));
  btn.addEventListener('pointercancel', e => finish(e, true));
  btn.addEventListener('lostpointercapture', e => finish(e, true));
  btn.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); return; } close(); });
}
