// Runs before first paint so a saved Light/Dark choice never flashes the wrong theme.
(() => {
  try {
    const pref = localStorage.getItem('bst-theme');
    if (pref === 'light' || pref === 'dark' || pref === 'pink') document.documentElement.dataset.theme = pref;
    document.documentElement.dataset.cursor = localStorage.getItem('bst-cursor') === 'off' ? 'off' : 'on';
  } catch { /* storage unavailable: follow the system */ }
})();
