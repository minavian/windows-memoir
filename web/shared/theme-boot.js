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
    document.documentElement.dataset.cursor = localStorage.getItem('bst-cursor') === 'off' ? 'off' : 'on';
  } catch { /* storage unavailable: follow the system */ }
  // Animations (Settings): off, every animation and transition ends at once, in the styles (theme.css) and in
  // scripts (Element.animate below), and every check for reduced motion says yes, so the scripts' own motion
  // (waves, glides, flights) takes its instant way. The custom cursor keeps its own (shared/cursor.js, .cc).
  const root = document.documentElement;
  const off = () => root.dataset.motion === 'off';
  try { if (localStorage.getItem('bst-motion') === 'off') root.dataset.motion = 'off'; } catch { /* storage unavailable */ }
  const nativeQuery = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const q = String(query);
    if (!off() || !/prefers-reduced-motion/.test(q)) return nativeQuery(query);
    const matches = /reduce/.test(q) && !/no-preference/.test(q);
    return { matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (!off() || this.closest?.('.cc')) return nativeAnimate.call(this, keyframes, options);
    const o = typeof options === 'object' && options ? { ...options } : {};
    return nativeAnimate.call(this, keyframes, Object.assign(o, { duration: 0, delay: 0, endDelay: 0, iterations: 1 }));
  };
  window.memoirMotion = {
    off,
    // the system's own wish (for the cursor, which the switch leaves alone)
    systemReduced: () => nativeQuery('(prefers-reduced-motion: reduce)').matches,
    set(on) {
      try { if (on) localStorage.removeItem('bst-motion'); else localStorage.setItem('bst-motion', 'off'); } catch { /* kept for this page only */ }
      if (on) delete root.dataset.motion;
      else root.dataset.motion = 'off';
    },
  };
  // changed on another of Memoir's pages
  addEventListener('storage', e => { if (e.key === 'bst-motion') window.memoirMotion.set(e.newValue !== 'off'); });
  // Inter is the text's font everywhere but on a Mac (SF Pro there): fetched now, so the first
  // paint already has it (theme.css; on a Mac it would only go unused)
  if (!/Mac/.test(navigator.userAgentData?.platform || navigator.platform)) {
    const font = document.createElement('link');
    Object.assign(font, { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', href: '/fonts/InterVariable-memoir.woff2' });
    document.head.appendChild(font);
  }
})();
