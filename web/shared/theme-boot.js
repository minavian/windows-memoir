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
  // Performance (Settings: shared/motion-dial.js). Reduced motion: as if the system asked for less motion, so
  // every check for it here and in the styles takes it, but for the styles' end-everything rule: things stop
  // moving, and fades and colours still ease (theme.css). No animations: every animation and transition ends at
  // once (theme.css, and Element.animate below).
  const root = document.documentElement;
  const motion = () => root.dataset.motion || 'full';
  try { const m = localStorage.getItem('bst-motion'); if (m === 'reduced' || m === 'off') root.dataset.motion = m; } catch { /* storage unavailable */ }
  const nativeQuery = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const q = String(query);
    if (motion() === 'full' || !/prefers-reduced-motion/.test(q)) return nativeQuery(query);
    const matches = /reduce/.test(q) && !/no-preference/.test(q);
    return { matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (motion() !== 'off') return nativeAnimate.call(this, keyframes, options);
    const o = typeof options === 'object' && options ? { ...options } : {};
    return nativeAnimate.call(this, keyframes, Object.assign(o, { duration: 0, delay: 0, endDelay: 0, iterations: 1 }));
  };
  // the styles' own reduced-motion rules: on with Reduced motion (but the one that ends everything) or No
  // animations, else the system's own again
  const kept = new WeakMap();
  const endsAll = r => [...r.cssRules].some(x => /^\*\s*,/.test(x.selectorText || ''));
  const styles = () => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (!(r instanceof CSSMediaRule)) continue;
        const was = kept.has(r) ? kept.get(r) : r.media.mediaText;
        if (!/prefers-reduced-motion/.test(was)) continue;
        kept.set(r, was);
        const want = motion() === 'full' || (motion() === 'reduced' && endsAll(r)) ? was : /no-preference/.test(was) ? 'not all' : 'all';
        if (r.media.mediaText !== want) r.media.mediaText = want;
      }
    }
  };
  document.addEventListener('DOMContentLoaded', styles);
  addEventListener('load', styles);
  window.memoirMotion = {
    level: motion,
    set(level) {
      const v = level === 'reduced' || level === 'off' ? level : 'full';
      try { if (v === 'full') localStorage.removeItem('bst-motion'); else localStorage.setItem('bst-motion', v); } catch { /* kept for this page only */ }
      if (v === 'full') delete root.dataset.motion;
      else root.dataset.motion = v;
      styles();
    },
  };
  // changed on another of Memoir's pages
  addEventListener('storage', e => { if (e.key === 'bst-motion') window.memoirMotion.set(e.newValue); });
  // Inter is the text's font everywhere but on a Mac (SF Pro there): fetched now, so the first
  // paint already has it (theme.css; on a Mac it would only go unused)
  if (!/Mac/.test(navigator.userAgentData?.platform || navigator.platform)) {
    const font = document.createElement('link');
    Object.assign(font, { rel: 'preload', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', href: '/fonts/InterVariable-memoir.woff2' });
    document.head.appendChild(font);
  }
})();
