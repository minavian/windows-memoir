// The web interface talks only to the native host; no localhost server is exposed.
(() => {
  const native = window.chrome?.webview;
  if (!native) throw new Error('Memoir needs its Windows host.');
  const listeners = new Set();
  const pending = new Map();
  let sequence = 0;
  const request = (op, data = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The desktop request timed out.')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    native.postMessage({ id, op, data });
  });
  native.addEventListener('message', event => {
    const msg = event.data;
    if (msg.event === 'storage') {
      if (msg.area === 'local' && msg.changes.apps) window.memoir.apps = msg.changes.apps.newValue || {};
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
    sendMessage: msg => request(msg.type === 'openRecap' ? 'window.report' : 'runtime.sync', msg),
  };
  window.chrome.tabs = { create: ({ url }) => request('link.open', { url }) };
  window.memoir = {
    windows: true, apps: {}, request,
    ready: storage.get('apps').then(data => { window.memoir.apps = data.apps || {}; }),
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
      palette: { surface: token('--surface'), label: token('--label'), secondary: token('--label-2'), hover: token('--fill-1') },
    }).catch(() => {});
  };
  addEventListener('DOMContentLoaded', () => {
    theme(); new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
    const panel = document.querySelector('.panel-inner');
    if (panel) {
      const note = document.createElement('p'); note.className = 'p-desc desktop-status'; note.textContent = 'Tracks the active Windows app and websites in supported browsers. Minimizing unloads the interface; tracking continues in the notification area.';
      panel.appendChild(note);
    }
  });
  addEventListener('error', e => request('log', { message: `JavaScript ${e.error?.name || 'Error'} at ${e.filename?.split('/').pop()}:${e.lineno}` }).catch(() => {}));
  addEventListener('unhandledrejection', e => request('log', { message: `JavaScript promise ${e.reason?.name || 'Error'}` }).catch(() => {}));
})();
