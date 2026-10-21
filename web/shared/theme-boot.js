// Runs before first paint so a saved Light/Dark choice never flashes the wrong theme.
(() => {
  try {
    let pref = localStorage.getItem('bst-theme');
    // Pink, then Pride, were themes once: back to System (the Rainbow clock stays off unless chosen)
    if (pref === 'pink' || pref === 'pride') {
      localStorage.removeItem('bst-theme');
      pref = null;
    }
    if (pref === 'light' || pref === 'dark') document.documentElement.dataset.theme = pref;
    if (localStorage.getItem('bst-rainbow') === 'on') {
      document.documentElement.dataset.rainbow = 'on';
      const icon = document.querySelector('link[rel="icon"]');
      if (icon) icon.href = 'icons/rainbow32.png';
    }
    document.documentElement.dataset.cursor = localStorage.getItem('bst-cursor') === 'off' || localStorage.getItem('bst-perf') === 'on' ? 'off' : 'on';
  } catch { /* storage unavailable: follow the system */ }
  // Performance mode (Settings): no animations (every animation and transition ends at once, in the styles,
  // theme.css, and in scripts, Element.animate below, and every check for reduced motion says yes, so the scripts'
  // own motion takes its instant way) and the system's cursor in place of the custom one (shared/cursor.js).
  const root = document.documentElement;
  const perf = () => root.dataset.perf === 'on';
  try {
    if (localStorage.getItem('bst-motion') === 'off') { localStorage.setItem('bst-perf', 'on'); localStorage.removeItem('bst-motion'); }   // (its first name)
    if (localStorage.getItem('bst-perf') === 'on') { root.dataset.perf = 'on'; root.dataset.cursor = 'off'; }
  } catch { /* storage unavailable */ }
  const nativeQuery = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const q = String(query);
    if (!perf() || !/prefers-reduced-motion/.test(q)) return nativeQuery(query);
    const matches = /reduce/.test(q) && !/no-preference/.test(q);
    return { matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (!perf()) return nativeAnimate.call(this, keyframes, options);
    const o = typeof options === 'object' && options ? { ...options } : {};
    return nativeAnimate.call(this, keyframes, Object.assign(o, { duration: 0, delay: 0, endDelay: 0, iterations: 1 }));
  };
  window.memoirPerf = {
    on: perf,
    set(on) {
      try { if (on) localStorage.setItem('bst-perf', 'on'); else localStorage.removeItem('bst-perf'); } catch { /* kept for this page only */ }
      if (on) root.dataset.perf = 'on';
      else delete root.dataset.perf;
    },
  };
  // changed on another of Memoir's pages (the cursor follows by itself: shared/cursor.js)
  addEventListener('storage', e => { if (e.key === 'bst-perf') window.memoirPerf.set(e.newValue === 'on'); });
  // Inter is the text's font everywhere but on a Mac (SF Pro there): fetched now, so the first
  // paint already has it (theme.css; on a Mac it would only go unused)
  if (!/Mac/.test(navigator.userAgentData?.platform || navigator.platform)) {
    const font = document.createElement('link');
    Object.assign(font, { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', href: '/fonts/InterVariable-memoir.woff2' });
    document.head.appendChild(font);
  }
})();
