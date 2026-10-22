// Appearance (the theme, the Rainbow clock, the custom cursor and its smoothing) lives in this place's
// localStorage, so it's there before first paint (theme-boot.js), with a copy in settings: the copy is what a
// linked Memoir shares (link.js, like the other settings), and what the toolbar icon reads (rainbow). A change
// made here goes to the copy (saveAppearance); a copy changed on the other side comes here (adoptAppearance).

import { getThemePref, applyThemePref, rainbowOn, setRainbow } from './theme.js';
import { cursorEnabled, cursorSmooth, setCursorPref, setCursorSmooth } from './cursor.js';
import { updateSettings } from './core.js';

const FIELDS = {
  theme: { valid: v => v === 'auto' || v === 'light' || v === 'dark', here: getThemePref, set: applyThemePref },
  rainbow: { valid: v => typeof v === 'boolean', here: rainbowOn, set: setRainbow },
  cursor: { valid: v => typeof v === 'boolean', here: cursorEnabled, set: setCursorPref },
  cursorSmooth: { valid: v => typeof v === 'boolean', here: cursorSmooth, set: setCursorSmooth },
};

// The copy's choices that differ from this place's are shown here. Returns whether any did.
export function adoptAppearance(settings) {
  let changed = false;
  for (const [f, { valid, here, set }] of Object.entries(FIELDS)) {
    const v = settings && settings[f];
    if (valid(v) && v !== here()) { set(v); changed = true; }
  }
  return changed;
}

// On opening: a copy from before Appearance synced (no theme in it) takes this place's choices; otherwise this
// place takes the copy's (changed on the other side while this page was closed).
export async function syncAppearance() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings && FIELDS.theme.valid(settings.theme)) return adoptAppearance(settings);
  await saveAppearance(Object.fromEntries(Object.entries(FIELDS).map(([f, { here }]) => [f, here()])));
  return false;
}

export const saveAppearance = patch => updateSettings(patch);
