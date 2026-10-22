/*! Made with care and love by Mina Vian */
// The web interface talks only to the native host; no localhost server is exposed.
(() => {
  const native = window.chrome?.webview;
  if (!native) throw new Error('Memoir needs its Windows host.');
  // Memoir's own title bar (desktop-chrome.css, src/TitleBar.cs): its styles before the page's first paint. Today by
  // the clock (popup.html?flyout, src/Flyout.cs) has none: it's the browser's popup, in a small window of its own
  const root = document.documentElement;
  const page = location.pathname.split('/').pop();
  const flyout = new URLSearchParams(location.search).has('flyout');
  root.classList.add(flyout ? 'win-flyout' : 'win-chrome');
  root.dataset.winPage = page === 'recap.html' ? 'report' : page === 'popup.html' ? 'today' : 'doc';
  const chromeCss = document.createElement('link');
  chromeCss.rel = 'stylesheet'; chromeCss.href = 'desktop-chrome.css';
  document.head.append(chromeCss);
  const windowState = state => {
    root.classList.toggle('win-max', !!state.maximized); root.classList.toggle('win-full', !!state.fullScreen); root.classList.toggle('win-inactive', !state.active);
    document.querySelector('.win-maximize')?.setAttribute('aria-label', state.maximized ? 'Restore' : 'Maximize');
  };
  const listeners = new Set();
  const pending = new Map();
  let sequence = 0;
  // Today gets ready hidden; it draws (and plays its entrance) once it's shown
  let shown = null;
  const firstShown = flyout ? new Promise(resolve => { shown = resolve; }) : null;
  const request = (op, data = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The desktop request timed out.')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    native.postMessage({ id, op, data });
  });
  native.addEventListener('message', event => {
    const msg = event.data;
    if (msg.event === 'window') { windowState(msg.state || {}); return; }
    if (msg.event === 'flyout') { if (msg.state === 'shown' && shown) { shown(); shown = null; } return; }
    if (msg.event === 'storage') {
      if (msg.area === 'local' && msg.changes.apps) window.memoir.apps = { ...window.memoir.sampleApps, ...msg.changes.apps.newValue };
      if (msg.area === 'local' && msg.changes.favicons) window.memoir.favicons = msg.changes.favicons.newValue || {};
      for (const fn of listeners) fn(msg.changes, msg.area);
      return;
    }
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id); clearTimeout(waiter.timer);
    if (msg.error) waiter.reject(new Error(msg.error)); else waiter.resolve(msg.result);
  });
  const host = new URL(location.href).origin;
  const storage = {
    get: keys => request('storage.get', { keys: keys ?? null }),
    set: patch => request('storage.set', { patch }),
    remove: keys => request('storage.remove', { keys }),
    getKeys: () => request('storage.keys'),
    getBytesInUse: keys => request('storage.bytes', { keys: keys ?? null }),
  };
  window.chrome.storage = {
    local: storage,
    session: { get: () => request('session.get'), remove: () => request('session.remove') },
    onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
  };
  window.chrome.runtime = {
    getURL: path => new URL(path.replace(/^\//, ''), `${host}/`).href,
    // the report reads the version (the bug report's subject); keep it with src/AssemblyInfo.cs
    getManifest: () => ({ name: 'Memoir for Windows', version: '0.9.0 for Windows', version_name: 'alpha v0.9' }),
    sendMessage: msg => request(msg.type === 'openRecap' ? 'window.report' : 'runtime.sync', msg),
  };
  window.chrome.tabs = { create: ({ url }) => request('link.open', { url }) };
  window.memoir = {
    // the apps' names, categories and icons; the websites' icons a linked browser sent (both in Data\icons);
    // the sample week's apps under the apps' own (recap.js)
    windows: true, apps: {}, sampleApps: {}, favicons: {}, request, flyout,
    ready: Promise.all([storage.get(['apps', 'favicons']).then(data => { window.memoir.apps = { ...window.memoir.sampleApps, ...data.apps }; window.memoir.favicons = data.favicons || {}; }), firstShown]),
    appName: key => window.memoir.apps[key]?.name || key.slice(4).replace(/\.exe$/, ''),
    today: () => request('window.today'), minimize: () => request('window.minimize'),
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    readText: () => request('clipboard.read'), writeText: text => request('clipboard.write', { text }),
  } });
  const theme = () => {
    const mode = document.documentElement.dataset.theme || 'auto';
    const style = getComputedStyle(document.documentElement);
    const token = name => style.getPropertyValue(name).trim();
    return request('theme', {
      mode, theme: mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode,
      palette: { surface: token('--surface'), background: token('--bg'), label: token('--label'), secondary: token('--label-2'), hover: token('--fill-1') },
    }).catch(() => {});
  };
  // No title bar (desktop-chrome.css): the window's top edge still resizes it, and the empty top of a page (above and
  // around the report's header, a page's heading) moves it, Snap included: drag it there, double-click to maximize,
  // right-click for the window's menu. The report's Settings button, pulled down, closes it (pull-close.js, recap.html).
  const FIXED = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="slider"], [tabindex]:not([tabindex="-1"]), [contenteditable], .card, .pop, .menu, .context-menu, .tour, .wel, .mark, .logo, .morph.open, .settings-scrim, .pk-layer, .gx-layer';
  const MOVE_BAND = 64;   // px from the top
  const frees = e => e.clientY <= MOVE_BAND && !root.classList.contains('win-full') && e.target instanceof Element && !e.target.closest(FIXED) && !e.target.closest('.win-edges');
  function windowFrame() {
    const edges = document.createElement('div');
    edges.className = 'win-edges';
    edges.setAttribute('aria-hidden', 'true');
    edges.innerHTML = '<div class="win-edge" data-hit="12"></div><div class="win-edge" data-hit="13"></div><div class="win-edge" data-hit="14"></div>';
    document.body.append(edges);
    edges.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const edge = e.target.closest('.win-edge');
      if (edge) request('window.drag', { hit: +edge.dataset.hit }).catch(() => {});
    });
    let last = { at: 0, x: 0, y: 0 };
    addEventListener('mousedown', e => {
      if (e.button !== 0 || e.defaultPrevented || !frees(e)) return;
      e.preventDefault();
      // the second press of a double-click maximizes (the first one's drag swallowed its own mouse-up)
      const twice = e.timeStamp - last.at < 500 && Math.abs(e.screenX - last.x) < 6 && Math.abs(e.screenY - last.y) < 6;
      last = twice ? { at: 0, x: 0, y: 0 } : { at: e.timeStamp, x: e.screenX, y: e.screenY };
      request(twice ? 'window.maximize' : 'window.drag', { hit: 2 }).catch(() => {});
    });
    addEventListener('contextmenu', e => { if (frees(e) && !e.defaultPrevented) { e.preventDefault(); request('window.menu').catch(() => {}); } });
    request('window.state').then(windowState).catch(() => {});
  }
  // Today: Esc closes it, as a click elsewhere does (a menu or popover open in it takes Esc first)
  if (flyout) addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) request('window.close').catch(() => {}); });
  // Alt+F4 closes the window (to the notification area, where Memoir keeps counting) or Today; F11 makes the
  // window full screen, and back
  addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    if (e.key === 'F4' && e.altKey) { e.preventDefault(); request('window.close').catch(() => {}); }
    else if (e.key === 'F11' && !e.altKey && !flyout) { e.preventDefault(); request('window.fullscreen').catch(() => {}); }
  }, true);
  addEventListener('DOMContentLoaded', () => {
    if (!flyout) windowFrame();   // (Today's close button: popup-close.js, as the extension's popup has)
    // painted: the window's loading clock can go (src/Splash.cs), as the report's cards start to come in (fx.js
    // reveal adds .ready); a page without that, two frames in
    let said = false;
    const painted = () => { if (said) return; said = true; request('window.painted').catch(() => {}); };
    if (document.body.classList.contains('ready')) painted();
    else {
      new MutationObserver((list, watch) => { if (document.body.classList.contains('ready')) { watch.disconnect(); painted(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(painted)), root.dataset.winPage === 'doc' ? 0 : 1500);
    }
    theme(); new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
    // How Memoir works, the privacy policy and PC specs tested open in this same window (there are no tabs here): a
    // way back to the report, a round ‹, kept at the window's top left however far the page is read (its room kept above their name, so
    // nothing there moves), and Esc
    const brand = document.querySelector('main > .brand');
    if (brand) {
      const back = document.createElement('a');
      back.className = 'btn btn-secondary desktop-back';
      back.href = 'recap.html';
      back.title = 'Back to Memoir';
      back.setAttribute('aria-label', 'Back to Memoir');
      back.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';
      const room = document.createElement('div');
      room.className = 'desktop-back-room';
      room.setAttribute('aria-hidden', 'true');
      brand.before(room);
      document.body.prepend(back);
      // lifted off the page, a soft shadow, once the page runs under it
      const lift = () => back.classList.toggle('lifted', scrollY > 4);
      addEventListener('scroll', lift, { passive: true });
      lift();
      addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) location.href = 'recap.html'; });
    }
  });
  addEventListener('error', e => request('log', { message: `JavaScript ${e.error?.name || 'Error'} at ${e.filename?.split('/').pop()}:${e.lineno}` }).catch(() => {}));
  addEventListener('unhandledrejection', e => request('log', { message: `JavaScript promise ${e.reason?.name || 'Error'}` }).catch(() => {}));
})();
