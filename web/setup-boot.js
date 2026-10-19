// Installing and uninstalling (setup.html): the look Memoir.exe asks for, before the first paint. The installer
// follows Windows' light or dark; the uninstaller follows the Memoir it's removing (its theme, Rainbow clock and
// cursor).
(() => {
  const q = new URLSearchParams(location.search), root = document.documentElement;
  root.dataset.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
  if (q.get('rainbow') === '1') root.dataset.rainbow = 'on';
  if (q.get('cursor') === '0') root.dataset.cursor = 'off';
  root.dataset.mode = q.get('mode') || 'install';
})();
