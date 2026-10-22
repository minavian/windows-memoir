/*! Made with care and love by Mina Vian */
// Installing and uninstalling (setup.html): the look Memoir.exe asks for, before the first paint. The installer
// follows Windows' light or dark; the uninstaller follows the Memoir it's removing (its theme, Rainbow clock and
// cursor).
(() => {
  const q = new URLSearchParams(location.search), root = document.documentElement;
  // nothing is dragged out of the window (the address, a picture)
  document.addEventListener('dragstart', e => e.preventDefault(), true);
  root.dataset.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
  if (q.get('rainbow') === '1') root.dataset.rainbow = 'on';
  if (q.get('cursor') === '0') root.dataset.cursor = 'off';
  root.dataset.mode = q.get('mode') || 'install';
})();
