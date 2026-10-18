// Appearance: System (default — follows light/dark), Light, Dark or Pink.
// Pink is never chosen automatically; it only applies when picked.
// Stored in localStorage so the popup and the report share it instantly and it
// can be applied before first paint (see theme-boot.js).

export const THEME_KEY = 'bst-theme';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === 'light' || p === 'dark' || p === 'pink' ? p : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolvedTheme(pref = getThemePref()) {
  if (pref === 'auto') return darkQuery.matches ? 'dark' : 'light';
  return pref;
}

function apply(pref) {
  if (pref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

// Switches theme with a circular reveal from `origin` ({x, y}) when supported.
export function setThemePref(pref, origin) {
  const before = resolvedTheme();
  try {
    if (pref === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* ignore */ }
  const after = resolvedTheme(pref);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (before === after || calm || !document.startViewTransition) {
    apply(pref);
    return;
  }
  const x = origin ? origin.x : innerWidth / 2;
  const y = origin ? origin.y : 0;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(() => apply(pref));
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

// Keeps every open page in step when the choice or the system theme changes.
export function watchTheme(onChange) {
  addEventListener('storage', e => {
    if (e.key !== THEME_KEY) return;
    apply(getThemePref());
    if (onChange) onChange();
  });
  darkQuery.addEventListener('change', () => { if (onChange) onChange(); });
}
