# Porting extension changes to Windows Memoir

Windows Memoir has two layers:

| Layer | Where | Relationship to the extension |
| --- | --- | --- |
| Interface | `web/` | A copy of the extension's pages and scripts, with a small set of Windows edits (listed below). |
| Native host | `src/*.cs` | Written for Windows. `Engine.cs` reimplements the tracking rules from `background.js`; the rest (tracker, storage, tray, browser connector, WebView window) has no extension counterpart. |

Interface-only changes in the extension (layout, charts, animations, wording) port by copying files and re-applying the edits below. Changes to storage, settings or tracking rules also need matching changes in `src/Engine.cs` (see **Data contract**).

## Sync procedure

1. Commit the current state, so the Windows edits stay visible in history.
2. Copy the extension's interface files over `web/`: `*.html`, `*.css`, `*.js` (except `background.js`), `shared/`, `fonts/` and `icons/`. Keep `web/desktop-bridge.js`; it exists only on Windows.
3. Re-apply every edit in **Windows edits**. `git diff` on `web/` after step 2 shows exactly which ones were overwritten.
4. Compare the extension's `background.js` and `shared/core.js` with the previous version. Port any rule or schema change to `src/Engine.cs`, and update `tests/EngineTests.cs` to match.
5. If the pages start using a `chrome.*` API that the bridge doesn't provide, add it to `desktop-bridge.js` and add a matching operation in `MainForm.OnMessage`.
6. Run the checks in **Verification**, then `build.ps1`.

Line endings: `web/` files use CRLF and the extension uses LF. Compare with `diff --strip-trailing-cr` (or `git diff`, which normalizes them), or every line will show as changed.

## Windows edits

`app:<name>.exe` is how Windows apps are stored, next to website domains. `window.memoir.appName(domain)` turns that key into the app's display name.

### Every page
- `popup.html` and `recap.html`: add `<script src="desktop-bridge.js"></script>` right after the theme-boot script in `<head>`.
- `popup.js` `main()` and `recap.js` `init()`: `await window.memoir.ready;` before anything else, so app names and categories are loaded before the first render.

### `shared/core.js`
- `categorize()`: first line `if (domain.startsWith('app:')) return window.memoir.apps[domain]?.category || 'other';`
- `normalizeSite()`: accept app keys, `if (/^app:[^<>:"/\\|?*\x00-\x1f]+\.exe$/.test(s)) return s;`
- `isExcluded()`: a parent-domain match must not apply to apps: `domain === ex || (!domain.startsWith('app:') && domain.endsWith(`.${ex}`))`

### `shared/fx.js`
- Favicon fetch (around `FAV_KEY`): `if (domain.startsWith('app:')) return null;`
- Icon source: when `window.memoir?.windows`, return `https://memoir-icons.example/<icon>` for apps that have a 24-hex-character `.png` icon, and `null` otherwise. **Keep the `.example` host.** A `.local` host adds about 2 s to every load.
- `faviconTile()`: a shared `fallback()` that shows the first letter of the app name. It also runs from `img.addEventListener('error', fallback, { once: true })`.
- `siteLinkHtml()`: apps render as `<span class="app-name …" title="Windows app">` with the app's name, not as a link.

### `shared/context-menu.js`
- Menu title: show `appName()` for `app:` domains.

### `popup.js`
- Now-playing label: `'Private activity'` instead of `'Private site'`; app keys go through `appName()`; `'No active app or website'` instead of `'Nothing to track on this page'`.
- Remove the `window.close()` after opening the report, and the `site-list` click handler that closes the popup. Today is a window here, not a popup.

### `popup.css`
- `html, body { width: 100%; height: 100%; min-width: 350px; min-height: 560px; overflow: auto; }` replaces the fixed 380 × 600 popup size.

### `recap.js`
- Wording: "browsing" becomes "screen time" / "activity", "sites" becomes "apps and websites", and "this browser" becomes "this computer". This covers the summary lines, the empty states, the hour and heatmap tooltips, the trend note, the private-time note and the tour steps.
- `topPagesHtml` tooltip title, category menu title and the "moved to" toast: use `appName()` for app keys.
- `anonymizeSites()`: also read `apps` and drop excluded entries: `if (raw.apps) patch.apps = …filter(([d]) => !isExcluded(d, list))`.
- `eraseTitles()`: also call `await window.memoir.request('privacy.titles');`. The native side erases titles from the backup too.
- `clearAllData()`: also remove `'apps'`.
- `importFile()`: accept an `apps` object (name ≤ 160 chars, known category, icon must match `^[a-f0-9]{24}\.png$`) and merge it into `window.memoir.apps`.
- `'Page and window titles…'` and `'Names only'` replace `'Page titles…'` and `'Domains only'` in the tracking-detail text.

- `readImport()` (extension 5.1.2+): its `siteKey` only accepts website names, so add the app case or every
  `app:` key in an import is dropped: `d === PRIVATE_KEY || /^app:[^<>:"/\\|?*\x00-\x1f]+\.exe$/.test(d) || domainFromUrl(...) === d`.
- `withData` (the `memoir-data` Web Lock) works in WebView2 but the native tracker doesn't take it; the page-side
  lock still orders the page's own writes, and the native `Store` applies each `storage.set` atomically.

### `recap.html`
- "Track screen time" / "Pause any time from Today or the tray" (tracking switch), "Names only" (detail option), Never-track description in terms of apps and websites, footer "Your data never leaves this computer", empty-state text, `aria-label="Apps and websites in this category"`.

### `welcome.js`
- Extension 5.1.2 rewrote the welcome (one card, no feature cards). Windows wording: tagline "Screen Time" instead of
  "Browser Screen Time"; "This app tracks your screen time and summarizes it."; "Everything stays on this computer."
  Replace the "Keep it in reach" pin text with: "Minimize Memoir to keep tracking. Double-click its hourglass in the
  notification area to return." (no arrow: there's no toolbar).

## Data contract

Both versions read and write the same `history.json` / `chrome.storage.local` layout, and exports must stay importable in both directions.

| Key | Shape | Written by (Windows) |
| --- | --- | --- |
| `day:YYYY-MM-DD` | `{ s: {domain: ms}, h: [24 × ms], hs: {"hour": {domain: ms}}, ti: {domain: {title: ms}} }` | `Engine.Commit` |
| `settings` | `paused, weeklyReminder, reminderDay, reminderMinutes, titles, excluded, retention` | interface |
| `goal` | `{ history: [{ from: "YYYY-MM-DD", limit: ms or null }] }` | interface; read by `Engine.Limit` |
| `goalNotify` | `{ day, n95, over }` | `Engine.CheckGoal` |
| `categories`, `origins`, `onboarded` | same as the extension | interface / `Engine.Commit` (origins) |
| `apps` *(Windows only)* | `{ "app:x.exe": { name, category, icon } }` | `Tracker.Remember` |
| `windowsAppearance`, `windowsWeeklyNotified` *(Windows only)* | theme palette for native UI; last weekly notice | `MainForm`, `Engine.WeeklyReminder` |

Rules that `Engine.cs` mirrors from `background.js` / `core.js`, and must keep in step:

| Rule | Extension | Windows |
| --- | --- | --- |
| Idle limit, audio keeps time running | `IDLE_SECONDS = 60` | `Engine.IdleLimit = 60000` |
| Private key, exclusions as Private time | `PRIVATE_KEY`, `isExcluded` | `"~private"`, `Engine.Excluded` (same parent-domain rule, not for `app:`) |
| Titles per site | `MAX_TITLES_PER_SITE = 30`, overflow under `''` | same, in `Commit` |
| Title cleanup | `cleanTitle()` | `Engine.Sanitize`: strips the `(n)` prefix, collapses spaces, limits to 120 characters. It does **not** yet reject titles that are URLs or bare hostnames the way `cleanTitle` does. |
| Hour/day split | local time, split at each hour | same; DST-safe |
| Retention | `RETENTION_OPTIONS = [0, 365, 182, 91]` | `Engine.Prune` hard-codes the same values |
| Daily-limit notices | 95 % and over-limit, once per day | same, in `CheckGoal` |
| Weekly reminder | `reminderDay`, `reminderMinutes` (default 19:00) | same, in `ScheduleReminder` / `WeeklyReminder` |
| Save cadence and sleep gaps | heartbeat 1 min; `MAX_GAP_MS` 3 min, `SLEEP_CREDIT_MS` 1 min | samples every second, commits every 30 s; a gap over 30 s ends the session at the last observation |

The last row differs on purpose: Windows observes every second instead of relying on browser events. Changing a constant or default in `core.js` usually means changing the matching line in `Engine.cs` and its test.

## Bridge surface

`desktop-bridge.js` provides only these extension APIs: `chrome.storage.local` (`get/set/remove/getKeys/getBytesInUse`), `chrome.storage.session` (`get/remove`), `chrome.storage.onChanged`, `chrome.runtime.getURL/sendMessage`, `chrome.tabs.create` and `navigator.clipboard`. Anything else the pages start calling will throw on Windows until it's added there and in `MainForm.OnMessage`.

## Don't undo

- Virtual hosts `memoir.example` and `memoir-icons.example` (`MainForm.LoadView`, `fx.js`, `tests/interface.cjs`). Chromium resolves `.local` over the network first, which cost about 2 s per page load. `MainForm.MovePreferences` copies the theme and cursor choices from the old `memoir.local` origin once.
- `Store` keeps the encoded bytes of each value and only re-encodes values that were replaced. Values in `store.Data` must never be mutated in place: clone, change, then `store.Set`.
- `Engine.EnforcePrivacy` runs the full-history pass only when the exclusion list changes or excluded names show up in the data.
- `Engine.Total` reads without cloning; it runs every second while a limit is set.
- Process names come from `Native.ProcessName`. `Process.ProcessName` snapshots every process on .NET Framework.

## Verification

```
powershell -File tests\run.ps1        # 53 tracking/privacy + 11 connector checks
node tests\interface.cjs              # 35 interface checks (Playwright + Chrome)
powershell -File tests\tray.ps1       # native tray menu
powershell -File build.ps1            # builds Memoir.exe; the previous exe moves to build-tools
```

Then open Memoir and switch apps and websites for a minute. Check that Today and the report show them with the right names and icons, that minimizing and restoring works, and that the tray menu works.
