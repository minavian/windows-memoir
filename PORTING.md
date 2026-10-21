# Porting extension changes to Windows Memoir

Windows Memoir has two layers:

| Layer | Where | Relationship to the extension |
| --- | --- | --- |
| Interface | `web/` | A copy of the extension's pages and scripts, with a small set of Windows edits (listed below). |
| Native host | `src/*.cs` | Written for Windows. `Engine.cs` reimplements the tracking rules from `background.js`; the rest (tracker, storage, tray, browser connector, WebView window) has no extension counterpart. |

Interface-only changes in the extension (layout, charts, animations, wording) port by merging files. Changes to storage, settings or tracking rules also need matching changes in `src/Engine.cs` (see **Data contract**).

**Last synced:** 1.0.0, from the extension's commit `d98eb6a` (minavian/memoir-browser-screen-time: the Performance dial). That commit is the merge base for the next port.

**The link** (SYNC-PLAN.md in the extension's repository): `BrowserLink.cs` (the pipe, many held-open two-way connections; the native host relaying both ways), `Registration.cs` (the host's manifest and HKCU keys at every start; trusted IDs in `extension-ids.txt`), `Sync.cs` (the exchange, per-peer pending dates, rules, markers) and `SyncData.cs` (`CleanDay`, `MergeDay`, `AnonymizeDay`: the extension's core.js in C#). `tests/merge-cases/merge.json` is a copy of the extension's: when it changes there, copy it here, and `tests/run.ps1` checks both agree.

## Sync procedure (a three-way merge per file)

1. Commit the current state.
2. For every interface file (`*.html`, `*.css`, `*.js` except `background.js`, `shared/*`): take three versions, the extension's at the last sync (the base above), today's `web/` copy (Windows) and the extension's now, and run
   `git merge-file -L windows -L base -L extension <windows copy> <base> <extension now>`. Files the Windows copy doesn't change are simply copied; new files are copied.
3. Resolve the conflicts by the rules in **Windows edits**: usually the extension's new code, with the Windows edit applied to it again. Then sweep the new text for browser words ("browsing", "browser", "site", "toolbar", "tab") and give it Windows wording.
4. Copy `fonts/` and `icons/` over. Keep `web/desktop-bridge.js` (Windows only), `web/how-it-works.html` and `web/privacy.html` (Windows' own words: re-check them against the extension's for any new section).
5. Compare the extension's `background.js` and `shared/core.js` with the base. Port any rule or schema change to `src/Engine.cs`, and update `tests/EngineTests.cs`.
6. If the pages call a `chrome.*` API the bridge doesn't provide, add it to `desktop-bridge.js` (and an operation in `MainForm.OnMessage` if it needs the host). A missing one throws, and can stop a whole page.
7. Run the checks in **Verification**, `build.ps1`, then update **Last synced** above.

Line endings: compare with `diff --strip-trailing-cr` (or `git diff`), or every line shows as changed.

## Windows edits

`app:<name>.exe` is how Windows apps are stored, next to website domains. Since the link (extension `d2bb440`), app keys are understood by the extension's own shared code: `isApp`, `appName`, `siteName`, `categorize`, `normalizeSite`, `isExcluded` (core.js, reading `window.memoir.apps` here and the synced `apps` there) and the app tiles and names in `fx.js`. Those files need no Windows edits any more.

### Every page
- `popup.html`, `recap.html`, `how-it-works.html`, `privacy.html`: `<script src="desktop-bridge.js"></script>` right after the theme-boot script.
- `popup.js` `main()` and `recap.js` `init()`: `await window.memoir.ready;` before anything else, so app names and categories are loaded before the first render. (In Today by the clock, `popup.html?flyout`, `ready` also waits until it's shown, so its entrance plays then: `desktop-bridge.js`.)

### `shared/fx.js` (shared, no edit; for reference)
- App icons come from `https://memoir-icons.example/<icon>` when `window.memoir?.windows`. **Keep the `.example` host.** A `.local` host adds about 2 s to every load.

### `popup.js`
- The category popover's click handler that closes the popup after a link is removed: Today is a window here, not a popup.
- Wording: "of private activity" (not "on private sites"), "No screen time yet today", "N used" (not "N sites").

### `popup.html`
- `<link rel="icon" href="icons/icon32.png">` after the title: Today is a page in a window, which otherwise asks for a missing `/favicon.ico`.

### `popup.css`
- `html, body { width: 100%; height: 100%; min-width: 350px; min-height: 560px; overflow: auto; }` replaces the fixed 380 × 600 popup size.

### `recap.js`
- Wording: "browsing" becomes "screen time" / "activity", "sites" becomes "apps and websites", and "this browser" becomes "this computer": the summary and highlights, empty states, hour and heatmap tooltips ("Screen time"), the trend note and "Days used", the private-time note, the category list's titles, toasts, the hidden Never-track entries' labels, "Never track it" in the category menu, and the tour steps (the last one points at the clock in the notification area).
- Tracking detail's text: titles on, "Saves page and window titles, like a video you watched on YouTube or a document you had open. They’re kept as long as your history."; off, "Only app and website names are saved, not titles, like Word or youtube.com."
- `eraseTitles()`: also call `await window.memoir.request('privacy.titles');`. The native side erases titles from the backup too.
- The tour's "Sample week, tour and data" step: "sync with the <b>Memoir extension</b>" (not "Memoir for Windows").
- (Shared, no edit: Start with Windows, `#startup-row` under Track screen time, hidden in the extension; `loadStartup` and its switch ask `startup.get` / `startup.set` only here.)
- (Shared since `3ff332f`, no edit: the link row's Windows side in `renderLink`/`pressLink`, from the `sync` record's peers and `link.unlink`.)
- (Shared since `d2bb440`, no edit: `apps` in `anonymizeSites`, `clearAllData` and Import.)
- `withData` (the `memoir-data` Web Lock) works in WebView2 but the native tracker doesn't take it; the page-side lock still orders the page's own writes, and the native `Store` applies each `storage.set` atomically.

### `recap.html`
- "Track screen time" / "Pause any time from Today or the tray" (tracking switch), "Names only" (detail option), Never-track description in terms of apps and websites, empty-state text, the link row's starting texts (`link-row` `data-key=""`, `link-title` "Memoir in browser", `link-desc` "Not linked yet", the button's label "Guide") and `nuke-also` ("Memoir in your browser is cleared too."), `aria-label="Apps and websites in this category"`, the heatmap's "Screen time by hour of day".

### `welcome.js`
- Tagline "Screen Time"; "This app tracks your screen time and summarizes it."; "Everything stays on this computer."
- The "Keep it in reach" card: "Minimize Memoir to keep tracking. Double-click its clock in the notification area to come back." No arrow: there's no toolbar.

### `gauntlet.js`
- "After this, it’s between you and your screen time." (not "your browser history").

### `how-it-works.html`, `privacy.html`
- Windows' own pages, written from `src/` and the README: what counts (the app in front, websites in supported browsers, Memoir itself), when the clock stops, Private time (private windows only with the connector), what's kept (the Data folder), WebView2 and the connector. Keep them true when the tracker changes.

### `desktop-bridge.js` (Windows only)
- `chrome.runtime.getManifest()`: `{ version: '1.0.0 for Windows' }` (the report reads it at load for the bug report's subject). Keep it with `src/AssemblyInfo.cs`.
- On How Memoir works and the privacy policy (pages with `main > .brand`): a "‹ Back to Memoir" link above the name, and Esc, back to the report. `MainForm` opens these pages in the same window.
- No title bar on any page (`desktop-chrome.css`, `desktop-bridge.js`, `src/TitleBar.cs`): invisible strips along the top edge resize the window; the empty top 64 px of a page moves it (double-click maximizes, right-click opens the window menu); Alt+F4 closes and F11 toggles full screen (`window.fullscreen`). Pages keep the extension's own spacing.
- The report's gear closes the window (`web/pull-close.js`, loaded by `desktop-bridge.js` on `recap.html`): pulled down past 84 px it closes, pulled up 20 px it toggles full screen, and resting by it for a second shows the hint (a nudge, a red X, "Pull to close"). It adds `.pull-label`, `.pull-track` and a `.g-full` icon to `#settings`; a port that changes the gear's markup (`#settings-btn`, `.g-gear`, `.g-close`) must keep them working.
- Today by the clock (`popup.html?flyout`) gets a close button beside Resume (`web/popup-close.js`, the extension's popup's own, closing Today with `window.close` here): it moves `#resume` into a `.close-side` wrapper at the end of `.top`.
- `shared/context-menu.js`: on Windows the right-click menu ends with Full screen (or Exit full screen, F11) and Close (Alt+F4); in Today, Close only. Icons `expand`, `shrink`, `close`.
- `recap.js`'s tour: a step "Pull to close" before "That’s the tour", with its watcher `onPulled` (it sets `data-pull-tour`, so a pull springs back and fires `memoir:pulled`).

## Data contract

Both versions read and write the same `history.json` / `chrome.storage.local` layout, and exports must stay importable in both directions.

| Key | Shape | Written by (Windows) |
| --- | --- | --- |
| `day:YYYY-MM-DD` | `{ s: {domain: ms}, h: [24 × ms], hs: {"hour": {domain: ms}}, ti: {domain: {title: ms}}, th: {"hour": {domain: {title: ms}}}, tu: {domain: {title: url}}, tp: [domain] }` | `Engine.Commit` (`s`, `h`, `hs`, `ti`, `th`; `tu` and `tp` come only from the extension and are kept as they are) |
| `settings` | `paused, weeklyReminder, reminderDay, reminderMinutes, titles, excluded, retention, rainbow` | interface (`rainbow` also turns the tray icon rainbow) |
| `goal` | `{ history: [{ from: "YYYY-MM-DD", limit: ms or null }] }` | interface; read by `Engine.Limit` |
| `goalNotify` | `{ day, n95, over }` | `Engine.CheckGoal` |
| `categories`, `origins`, `onboarded` | same as the extension | interface / `Engine.Commit` (origins) |
| `apps` | `{ "app:x.exe": { name, category, icon } }` | `Tracker.Remember` (the extension gets names and categories over the link) |
| `link:<device>:YYYY-MM-DD` | a linked extension's day, as it measured it (cleaned, Never track applied) | `Sync.ApplyDays`; shown merged with `day:` (`Engine.View`, core.js `getDays`) |
| `linkPeers` | the linked extensions' devices (whose `link:` days are shown) | `Sync` |
| `sync` | `{ device, meta: { settingsAt, excluded, goalAt, categoriesAt, wipe, titlesErased }, peers: { device: { name, mode, since, pending, lastSync, connected… } }, unlinked }` | `Sync` |
| `wipe`, `titlesErased` | when Clear all / Erase titles last ran (a marker the link carries) | interface |
| `windowsAppearance`, `windowsWeeklyNotified` *(Windows only)* | theme palette for native UI; last weekly notice | `MainForm`, `Engine.WeeklyReminder` |

Rules that `Engine.cs` mirrors from `background.js` / `core.js`, and must keep in step:

| Rule | Extension | Windows |
| --- | --- | --- |
| Idle limit, audio keeps time running | `IDLE_SECONDS = 60` | `Engine.IdleLimit = 60000` |
| Private key, exclusions as Private time | `PRIVATE_KEY`, `isExcluded` | `"~private"`, `Engine.Excluded` (same parent-domain rule, not for `app:`) |
| Memoir's own pages | `~memoir` (`PAGE_NAMES`) | `~memoir`: Memoir's own window (`Tracker.RefreshForeground`; the tray menu's process stays ignored) |
| Titles per site | `MAX_TITLES_PER_SITE = 30`, overflow under `''`, and the same hour by hour in `th` | same, in `Commit` |
| Title cleanup | `cleanTitle()` | `Engine.CleanTitle`: the same rules (unread-count prefix, spaces, addresses and the site's own name refused, 120 characters, reserved names) |
| Never track, Erase titles | `anonymizeSites`, `eraseTitles` cover `ti`, `th`, `tu`, `tp` | `Engine.Redact` does the same |
| Hour/day split | local time, split at each hour | same; DST-safe |
| Retention | `RETENTION_OPTIONS = [0, 365, 182, 91]`; titles go with their day | `Engine.Prune` hard-codes the same values |
| Daily-limit notices | 95 % and over-limit, once per day | same, in `CheckGoal` |
| Weekly reminder | `reminderDay`, `reminderMinutes` (default 19:00) | same, in `ScheduleReminder` / `WeeklyReminder` |
| Save cadence and sleep gaps | heartbeat 1 min; `MAX_GAP_MS` 3 min, `SLEEP_CREDIT_MS` 1 min | samples every second, commits every 30 s; a gap over 30 s ends the session at the last observation |

The last row differs on purpose: Windows observes every second instead of relying on browser events. Changing a constant or default in `core.js` usually means changing the matching line in `Engine.cs` and its test.

## Bridge surface

`desktop-bridge.js` provides only these extension APIs: `chrome.storage.local` (`get/set/remove/getKeys/getBytesInUse`), `chrome.storage.session` (`get/remove`), `chrome.storage.onChanged`, `chrome.runtime.getURL/getManifest/sendMessage`, `chrome.tabs.create` and `navigator.clipboard`. Anything else the pages start calling throws on Windows until it's added there (and in `MainForm.OnMessage` if it needs the host).

## Don't undo

- Virtual hosts `memoir.example` and `memoir-icons.example` (`MainForm.LoadView`, `fx.js`, `tests/interface.cjs`). Chromium resolves `.local` over the network first, which cost about 2 s per page load. `MainForm.MovePreferences` copies the theme and cursor choices from the old `memoir.local` origin once.
- `Store` keeps the encoded bytes of each value and only re-encodes values that were replaced. Values in `store.Data` must never be mutated in place: clone, change, then `store.Set`.
- `Engine.EnforcePrivacy` runs the full-history pass only when the exclusion list changes or excluded names show up in the data.
- `Engine.Total` reads without cloning; it runs every second while a limit is set.
- Process names come from `Native.ProcessName`. `Process.ProcessName` snapshots every process on .NET Framework.
- `MainForm.Scaled`: window sizes are the pages' CSS sizes times Windows' display scaling (read from the screen's DPI; `DeviceDpi` says 96 before the window exists), within the screen's free area. In physical pixels, 125% scaling gave the report its two-column fallback, cut Settings' footer and made Today narrower than its page.
- `Memoir.ico` and `Memoir-rainbow.ico`: the clock on its black disc, made from the extension's `icons/` (16, 32, 48, 128) and the logo master (20, 24, 40, 64, 256); the rainbow one recolours only the ring, as the extension's `rainbowN.png`.

## Verification

```
powershell -File tests\run.ps1        # 63 tracking/privacy, 9 shared merge cases, 21 link and host checks
node tests\interface.cjs              # 42 interface checks (Playwright + Chrome)
powershell -File tests\tray.ps1       # 49 native tray menu checks
powershell -File build.ps1            # builds Memoir.exe; the previous exe moves to build-tools
```

Then open Memoir (with `--data-dir=` a test folder, to leave your history alone) and switch apps and websites for a minute. Check that Today and the report show them with the right names and icons, that minimizing and restoring works, that the tray menu works, and that How Memoir works and the privacy policy open and come back.
