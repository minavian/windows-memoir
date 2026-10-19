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
    root.classList.toggle('win-max', !!state.maximized); root.classList.toggle('win-inactive', !state.active);
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
      if (msg.area === 'local' && msg.changes.apps) window.memoir.apps = msg.changes.apps.newValue || {};
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
    getManifest: () => ({ name: 'Memoir for Windows', version: '6.0.0 for Windows', version_name: '6.0.0' }),
    sendMessage: msg => request(msg.type === 'openRecap' ? 'window.report' : 'runtime.sync', msg),
  };
  window.chrome.tabs = { create: ({ url }) => request('link.open', { url }) };
  window.memoir = {
    // the apps' names, categories and icons; the websites' icons a linked browser sent (both in Data\icons)
    windows: true, apps: {}, favicons: {}, request, flyout,
    ready: Promise.all([storage.get(['apps', 'favicons']).then(data => { window.memoir.apps = data.apps || {}; window.memoir.favicons = data.favicons || {}; }), firstShown]),
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
  // the band: drag it to move the window (Snap included), double-click to maximize, right-click for the window's
  // menu, its top edge to resize; Minimize (to the notification area, as before), Maximize and Close on the right
  const ICONS = {
    min: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8"/></svg>',
    max: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect class="win-max-icon" x="1" y="1" width="8" height="8" rx="1.6"/><g class="win-restore-icon"><rect x="1" y="3" width="6" height="6" rx="1.4"/><path d="M3 1.5h4.1A1.4 1.4 0 0 1 8.5 2.9V7"/></g></svg>',
    close: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>',
  };
  function buildTitleBar() {
    const band = document.createElement('div');
    band.className = 'win-band';
    band.innerHTML = '<div class="win-edge" data-hit="12"></div><div class="win-edge" data-hit="13"></div><div class="win-edge" data-hit="14"></div>';
    const buttons = document.createElement('div');
    buttons.className = 'win-buttons';
    buttons.innerHTML = `<button class="win-min" type="button" tabindex="-1" aria-label="Minimize">${ICONS.min}</button>`
      + `<button class="win-maximize" type="button" tabindex="-1" aria-label="Maximize">${ICONS.max}</button>`
      + `<button class="win-close" type="button" tabindex="-1" aria-label="Close">${ICONS.close}</button>`;
    document.body.append(band, buttons);
    let last = { at: 0, x: 0, y: 0 };
    band.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const edge = e.target.closest('.win-edge');
      if (edge) { request('window.drag', { hit: +edge.dataset.hit }).catch(() => {}); return; }
      // the second press of a double-click maximizes (the first one's drag swallowed its own mouse-up)
      const twice = e.timeStamp - last.at < 500 && Math.abs(e.screenX - last.x) < 6 && Math.abs(e.screenY - last.y) < 6;
      last = twice ? { at: 0, x: 0, y: 0 } : { at: e.timeStamp, x: e.screenX, y: e.screenY };
      request(twice ? 'window.maximize' : 'window.drag', { hit: 2 }).catch(() => {});
    });
    band.addEventListener('contextmenu', e => { e.preventDefault(); request('window.menu').catch(() => {}); });
    buttons.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      request(b.classList.contains('win-min') ? 'window.minimize' : b.classList.contains('win-close') ? 'window.close' : 'window.maximize').catch(() => {});
    });
    buttons.addEventListener('contextmenu', e => e.preventDefault());
    request('window.state').then(windowState).catch(() => {});
    const scrolled = () => root.classList.toggle('win-scrolled', scrollY > 0);
    addEventListener('scroll', scrolled, { passive: true }); scrolled();
  }
  // Today: Esc closes it, as a click elsewhere does (a menu or popover open in it takes Esc first)
  if (flyout) addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) request('window.close').catch(() => {}); });
  addEventListener('DOMContentLoaded', () => {
    if (!flyout) buildTitleBar();
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
    // How Memoir works and the privacy policy open in this same window (there are no tabs here):
    // a way back to the report above their name, and Esc
    const brand = document.querySelector('main > .brand');
    if (brand) {
      const back = document.createElement('a');
      back.className = 'btn btn-secondary btn-xs desktop-back';
      back.href = 'recap.html';
      back.textContent = '‹ Back to Memoir';
      back.style.marginBottom = '28px';
      brand.before(back);
      addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) location.href = 'recap.html'; });
    }
  });
  addEventListener('error', e => request('log', { message: `JavaScript ${e.error?.name || 'Error'} at ${e.filename?.split('/').pop()}:${e.lineno}` }).catch(() => {}));
  addEventListener('unhandledrejection', e => request('log', { message: `JavaScript promise ${e.reason?.name || 'Error'}` }).catch(() => {}));
})();
