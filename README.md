# Windows Memoir

Made by Mina Vian. Version 0.9.0, alpha v0.9 (a dev build).

People install Memoir with **Memoir Setup.exe** (one file, about 1 MB; see Installing and uninstalling). This folder runs as it is too: open **Memoir.exe**, with the `web` folder, the three WebView2 DLLs, `Memoir.exe.config`, `Memoir.ico` and `Memoir-rainbow.ico` beside it. Neither needs administrator access. The app uses Windows' .NET Framework 4.8 and Microsoft Edge WebView2 Runtime, which come with Windows 10 and 11.

## Installing and uninstalling

**Installing** takes no clicks. Memoir Setup.exe is Memoir.exe itself, carrying the rest of Memoir inside it (`src/Setup.cs`): opened from anywhere but a Memoir's own folder, it installs. A small window with no title bar (`web/setup.html`, from what it carries) shows the clock coming in while it writes a copy of itself and the rest straight into `%LOCALAPPDATA%\Programs\Memoir` and adds Memoir to Windows' list of installed apps (`HKCU\...\Uninstall\Memoir`: Settings → Apps and Control Panel show it with its icon, version, size and publisher). The clock then winds once and says it's ready, and Memoir opens in its place. On that first start Memoir adds its Start menu shortcut and Start with Windows, as it always does.
- A Memoir already installed there is closed, updated ("Updating Memoir") and opened again, with its history kept.
- A Memoir that was run from a folder of its own (the one that last linked with the browsers) has its history copied over, once, to a new install with none. That Memoir is closed first, and its own folder is left as it was.
- The window follows Windows' light or dark.

**Uninstalling** starts from Windows' list: `Memoir.exe --uninstall` runs in Memoir's own folder; its own files, in use while it runs, go a moment after it ends. Nothing is unpacked into a temporary folder or run from one, installing or uninstalling: that's what made some antivirus engines mistake the earlier Setup for a dropper. Its window follows the Memoir being removed (theme, Rainbow clock, cursor).
- The clock comes in smiling and its hands droop, from 10:10 to 8:20. It asks "Did MEMOIR do something wrong?" with the email for feedback (Copy, or a click to write) and a switch to keep the history (off).
- Hovering Keep Memoir cheers the clock up; hovering Uninstall makes it droop further and tremble a little. Keep Memoir, or Esc, makes it smile, say "Yay, MEMOIR stays!" and go.
- Uninstall removes Memoir at once. The question folds away, the clock grows into a big clock in the middle and turns round once, then "Thank you" shows there and the window goes.
- Everything Memoir put on this computer goes: its files, its history (unless kept), the Start menu shortcut, Start with Windows, the browsers' link (only if it points at this Memoir) and its entry in the list.
- `--uninstall --quiet` (the list's QuietUninstallString, for tools such as winget) does the same without a window, keeping the history.
- Only an installed Memoir uninstalls (`install.json` beside it lists its files): a folder run as it is says so and deletes nothing.

Tests point every place at their own: `MEMOIR_TEST_INSTALL_DIR`, `MEMOIR_TEST_UNINSTALL_KEY` (a key under HKCU), `MEMOIR_TEST_NATIVE_HOST`, `MEMOIR_TEST_START_MENU` and `MEMOIR_TEST_STARTUP_KEY`.

Memoir tracks the focused Windows app and websites in supported browsers. The report keeps the extension's welcome, charts, transitions, Light and Dark themes (and the optional Rainbow clock, which also colours the clock in the notification area), custom cursor, and smooth scrolling. How Memoir works and the privacy policy, opened from Settings, describe the Windows app and open in the same window, with a way back. Categories starts on Day. The report header has a Settings button; Today opens from the clock in the notification area.

## Window

Memoir has no title bar: the page goes right to the top. Windows keeps the frame, so resizing (the top edge too), Snap and the shadow work as usual; the empty top of a page moves the window, a double-click there maximizes it, and a right-click there opens the window menu. The report's gear does what the title bar's buttons did (`web/pull-close.js`): pulled down and let go, it closes the window to the notification area; pulled up, full screen (and back). Resting the mouse by it for a second, it nudges down, turns into a red X and says "Pull to close"; a click still opens Settings. Alt+F4 closes the window and F11 makes it full screen: borderless, the whole monitor, no edge line. Both ways go through maximized, which Windows animates, so it grows and shrinks as smoothly as a double-click on the top, and it comes back exactly where and how it was (`TitleBar.Begin`, `Cover`, `End`). While the page loads (the window's web view starts fresh each time it opens), the window shows Memoir's clock on the page's own background, breathing gently, and hands over as the report's cards come in; the web view follows Memoir's theme rather than Windows', so nothing flashes another colour first (`Splash.cs`).

## Minimized behavior

Minimizing or closing the window keeps tracking in the Windows notification area. The web interface and its browser processes unload. The clock there is Memoir's own notification icon (`TrayIcon.cs`, Shell_NotifyIcon version 4). A click opens **Today** beside it: the extension's popup (`popup.html?flyout`) in a small borderless window above the taskbar (`Flyout.cs`), rounded on Windows 11; its close button at the top right (a click, or pulled down: `web/popup-close.js`, the extension popup's own), a click elsewhere, Esc or the clock closes it. Resting the mouse on the clock loads it hidden, so the click shows it at once; it unloads 20 s after that if unused, or a minute after it closes. A right-click opens a small native menu that matches the app theme, with animated entrances, hover states, and closing. A double-click opens the app. Windows' plain tooltip is replaced by Memoir's (`TrayTip.cs`): the clock, its name and today's time, in the theme's colours.

The menu offers Open Memoir, Today, Pause / Resume tracking, and Quit Memoir, with the app's own rounded icons. It gets ready while the mouse is over the clock (a hidden menu process that leaves after 10 seconds unclicked), so a click shows it at once; Open Memoir and Today bring the window to the front, over whatever is open. Arrow keys navigate, Enter selects, and Escape or clicking elsewhere closes it. Windows' reduced-animation setting is respected. System appearance follows Windows.

Quit Memoir ends tracking and saves the current session. Memoir also saves on Windows shutdown, locking, sleep, and regular intervals. Opening it again starts tracking.

## Start with Windows

Memoir starts when you sign in, in the notification area without its window (`--tray`), from one value in your account's startup list (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`). It's turned on at Memoir's first start; Settings → Start with Windows turns it off and on (and remembers that it's off), and Windows' Startup apps can turn it off too (Settings shows that). A moved folder takes the entry with it at the next start, and an entry that's gone (an uninstall, then an install with the history kept or brought along) comes back at the next start, unless Settings turned it off. Paused tracking stays paused after a restart: Memoir starts, counts nothing, and its tray icon shows it's paused. Copies started with `--data-dir` (tests) never touch the startup list; `MEMOIR_TEST_STARTUP_KEY` points them at a test key instead.

## In the Start menu

Memoir is in the Start menu, so Windows Search finds it by name: one shortcut, `Memoir.lnk`, in your account's Start menu programs (`%APPDATA%\Microsoft\Windows\Start Menu\Programs`), made at Memoir's first start (`StartMenu.cs`), and by the installer every time it installs or updates Memoir. After that, a moved folder takes it with it, and a shortcut you deleted stays deleted until the next install. Its icon follows the Rainbow clock (`Memoir-rainbow.ico` while it's on): Windows' taskbar, Start and Search take Memoir's icon from this shortcut, not from the window. Copies started with `--data-dir` (tests) never touch the Start menu; `MEMOIR_TEST_START_MENU` points them at a test folder instead.

## Tracking and data

Only the foreground app counts. A browser counts as an app, with all its time, and the website in front counts too: the same seconds under both names (`Target.Browser`), so the report can list Apps and Browsers apart; totals, the limit, categories and hours count them once (`SyncData.HourParts`, the extension's `hourParts`). After 60 seconds without input, tracking pauses unless that app is playing audio. Locking or sleeping stops the clock. Memoir's own window counts as Memoir, as the extension counts its own pages; its tray menu and the desktop/taskbar are ignored. Time is assigned to local days and hours, including daylight-saving changes.

Data stays in `Data` beside the executable: `history.json`, a last-valid backup, and cached app icons. The WebView profile stores interface preferences. Page/window titles are off by default; when on, they're also kept hour by hour, as the extension keeps them. Never track entries become anonymous Private time, including their existing history; erasing titles also removes them from the backup. Use Settings to import or export history and change retention.

Website detection reads supported browsers' address bars using Windows accessibility, without inspecting webpage content. Chrome, Edge, Brave, Opera, Vivaldi, Firefox, Comet, and Arc are recognized. An inaccessible address bar falls back to the browser app. Without the optional connector, audio detection is at browser-process level, so background-tab audio can keep a foreground browser session active. Private-window detection requires the connector; the fallback cannot reliably distinguish private browsing.

## Linked with the Memoir extension

The Memoir extension, in any browser that runs Chrome extensions (Chrome, Edge, Brave, Opera, Vivaldi, Arc, Comet and others), links with this app from its own Settings (Your data → Memoir for Windows → Link), asking first whether to merge both histories or start from today. They talk through native messaging and a pipe restricted to your Windows account: on this computer only, never online. Each side keeps its own days and stores the other's apart (`link:<device>:<date>`); what you see is the two merged, taking the larger time for each app or website in each hour, so time both saw counts once. Never track, page titles, Keep history, the weekly reminder, the daily limit and categories follow whichever side changed last; Clear all and erasing titles reach both. While this app is open, it sends the limit's and the weekly notifications instead of the browser.

Memoir registers itself as the native host `com.minavian.memoir` when it starts and every 10 minutes after (your account only), in every Chromium browser it finds: the well-known ones and any other whose registry folder holds a Chromium launch beacon or other apps' native hosts. It trusts the extension IDs in `extension-ids.txt` and the Browser Connector's. Settings → Your data has a "Memoir in browser" row for each browser linked with this app (several browsers or profiles at once), whether it's in sync, and its own Unlink; with none linked, Guide shows how to connect one. Unlinking from either side keeps everything both have so far. The first browser linked brings a short tour of what linking does: Memoir opens in front for it, once. Websites in any linked browser count, even one Memoir doesn't know by name.

## Optional exact browser connector

For Chromium browsers, the small connector supplies the active tab's origin, focus, exact audio/mute status, and private-window status. Private time remains anonymous. It sends no paths or query strings. It uses a native messaging connection and a local pipe restricted to your Windows account; no local web server is opened.

1. In your browser's extensions page, enable Developer mode and load the **Browser Connector** folder unpacked.
2. Run **Register Browser Connector.ps1** from this folder. It registers this copy of Memoir for your Windows account in Chrome, Edge, Chromium, Brave, and Vivaldi. There is no administrator requirement.
3. Keep Memoir running. If you want private browsing counted anonymously, manually allow the connector in private windows in the browser's extension settings.

Run **Unregister Browser Connector.ps1** to remove those native messaging registrations, then remove the extension in your browser. Firefox works through address-bar detection; this Chromium connector is not a Firefox extension. If you move the Memoir folder, run the registration script again. The Memoir extension and this connector are separate: link the extension (above) or import its export to bring its history into Windows Memoir.

## Build and verification

`build.ps1` builds the 64-bit executable with the .NET Framework compiler already installed in Windows. The WebView2 SDK is in `build-tools/webview2` (Microsoft.Web.WebView2 1.0.4258.31). Windows supplies WPF for the native tray menu; the app uses the shared WebView2 runtime rather than bundling a browser.

`tests/run.ps1` checks native time accounting, privacy, limits, saving, and browser messaging. `tests/tray.ps1` checks native tray layout and action delivery across all themes. `tests/interface.cjs` checks the interface in Chrome with Playwright, and `tests/connector.cjs` checks the connector. `tests/performance.ps1` measures a minimized verification instance. See **VALIDATION.md** for results and practical limits. Diagnostic mode makes the tray popup discoverable as a window to accessibility inspection tools; normal mode keeps it out of the taskbar.

`release.ps1` makes **Memoir Setup.exe** (in `release/`, or `-Out <folder>`): Memoir.exe built again with the rest of what it needs to run inside it (`app.zip`; `build.ps1 -Payload`), no .exe among it: its config, both icons, the three DLLs, the extension IDs without their notes, and the `web` folder with every developer comment taken out and the code written compactly (`installer/strip.mjs`: terser for JavaScript, its code unchanged; CSS and HTML by a careful pass of its own). Memoir's own licence goes with it, as `LICENSE.txt` beside Memoir.exe, and what the licences of what ships ask for, in one `Third-party notices.txt`: the WebView2 SDK's licence and notice (its DLLs) and the fonts' licence. Nothing else ships: no READMEs, notes, tests, scripts, the Browser Connector, icons only the extension uses, or `Data`. Run `npm install` in `installer/` once first. It warns while `extension-ids.txt` has no Chrome Web Store ID: until the store's ID is added there, a released Memoir links only with the development extension. Moving or rebuilding the app does not erase existing data.

## Licence

Memoir for Windows is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. The licence's full text is in [LICENSE](LICENSE).

Copyright © 2026 Mina Vian.

**Over a network too.** A changed version that people use over a network, on a website or as an online service, has to
offer them its source, just as a copy that's shared does (section 13 of the AGPL).

**The name and the clock.** The licence covers the code, not the name "Memoir" or its clock logo (an additional term
under section 7(e) of the AGPL): a changed version may be shared under the AGPL, but under a name and a logo of its own.

**What it's built with** keeps its own licences: the Microsoft Edge WebView2 SDK, under a BSD-style licence (`build-tools/webview2/LICENSE.txt`), and the Inter and Unbounded fonts, under the SIL Open Font License 1.1 (`web/fonts/`).

Memoir's other half: [Memoir for Windows](https://github.com/minavian/windows-memoir) and [Memoir for
Chrome](https://github.com/minavian/memoir-browser-screen-time) are both open source under the same licence.
