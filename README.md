# Windows Memoir

Made by Mina Vian. Version 6.0.0.

Open **Memoir.exe** in this folder. Keep the `web` folder, the three WebView2 DLLs, `Memoir.exe.config`, `Memoir.ico` and `Memoir-rainbow.ico` beside it. No installer or administrator access is needed. The app uses Windows' .NET Framework 4.8 and Microsoft Edge WebView2 Runtime, which are installed on this computer.

Memoir tracks the focused Windows app and websites in supported browsers. The report keeps the extension's welcome, charts, transitions, Light and Dark themes (and the optional Rainbow clock, which also colours the clock in the notification area), custom cursor, and smooth scrolling. How Memoir works and the privacy policy, opened from Settings, describe the Windows app and open in the same window, with a way back. Categories starts on Day. The report header has a Settings button; Today is available from the tray menu.

## Minimized behavior

Minimizing or closing the window keeps tracking in the Windows notification area. The web interface and its browser processes unload. A click with either mouse button on the clock opens a small native menu that matches the app theme, with animated entrances, hover states, and closing. Double-click opens the app directly.

The menu offers Open Memoir, Today, Pause / Resume tracking, and Quit Memoir. Arrow keys navigate, Enter selects, and Escape or clicking elsewhere closes it. Windows' reduced-animation setting is respected. System appearance follows Windows.

Quit Memoir ends tracking and saves the current session. Memoir also saves on Windows shutdown, locking, sleep, and regular intervals. Opening it again starts tracking; it does not add itself to Windows startup.

## Tracking and data

Only the foreground app counts. After 60 seconds without input, tracking pauses unless that app is playing audio. Locking or sleeping stops the clock. Memoir's own window counts as Memoir, as the extension counts its own pages; its tray menu and the desktop/taskbar are ignored. Time is assigned to local days and hours, including daylight-saving changes.

Data stays in `Data` beside the executable: `history.json`, a last-valid backup, and cached app icons. The WebView profile stores interface preferences. Page/window titles are off by default; when on, they're also kept hour by hour, as the extension keeps them. Never track entries become anonymous Private time, including their existing history; erasing titles also removes them from the backup. Use Settings to import or export history and change retention.

Website detection reads supported browsers' address bars using Windows accessibility, without inspecting webpage content. Chrome, Edge, Brave, Opera, Vivaldi, Firefox, Comet, and Arc are recognized. An inaccessible address bar falls back to the browser app. Without the optional connector, audio detection is at browser-process level, so background-tab audio can keep a foreground browser session active. Private-window detection requires the connector; the fallback cannot reliably distinguish private browsing.

## Linked with the Memoir extension

The Memoir extension for Chrome and Edge links with this app from its own Settings (Your data → Memoir for Windows → Link). They talk through native messaging and a pipe restricted to your Windows account: on this computer only, never online. Each side keeps its own days and stores the other's apart (`link:<device>:<date>`); what you see is the two merged, taking the larger time for each app or website in each hour, so time both saw counts once. Never track, page titles, Keep history, the weekly reminder, the daily limit and categories follow whichever side changed last; Clear all and erasing titles reach both. While this app is open, it sends the limit's and the weekly notifications instead of the browser.

Memoir registers itself as the native host `com.minavian.memoir` each time it starts (your account only, for Chrome, Edge, Chromium, Brave and Vivaldi), trusting the extension IDs in `extension-ids.txt` and the Browser Connector's. Settings → Your data shows the browser linked with this app, whether it's in sync, and Unlink; unlinking from either side keeps everything both have so far.

## Optional exact browser connector

For Chromium browsers, the small connector supplies the active tab's origin, focus, exact audio/mute status, and private-window status. Private time remains anonymous. It sends no paths or query strings. It uses a native messaging connection and a local pipe restricted to your Windows account; no local web server is opened.

1. In your browser's extensions page, enable Developer mode and load the **Browser Connector** folder unpacked.
2. Run **Register Browser Connector.ps1** from this folder. It registers this copy of Memoir for your Windows account in Chrome, Edge, Chromium, Brave, and Vivaldi. There is no administrator requirement.
3. Keep Memoir running. If you want private browsing counted anonymously, manually allow the connector in private windows in the browser's extension settings.

Run **Unregister Browser Connector.ps1** to remove those native messaging registrations, then remove the extension in your browser. Firefox works through address-bar detection; this Chromium connector is not a Firefox extension. If you move the Memoir folder, run the registration script again. The Memoir extension and this connector are separate: link the extension (above) or import its export to bring its history into Windows Memoir.

## Build and verification

`build.ps1` builds the 64-bit executable with the .NET Framework compiler already installed in Windows. The WebView2 SDK is in `build-tools/webview2` (Microsoft.Web.WebView2 1.0.4258.31). Windows supplies WPF for the native tray menu; the app uses the shared WebView2 runtime rather than bundling a browser.

`tests/run.ps1` checks native time accounting, privacy, limits, saving, and browser messaging. `tests/tray.ps1` checks native tray layout and action delivery across all themes. `tests/interface.cjs` checks the interface in Chrome with Playwright, and `tests/connector.cjs` checks the connector. `tests/performance.ps1` measures a minimized verification instance. See **VALIDATION.md** for results and practical limits. Diagnostic mode makes the tray popup discoverable as a window to accessibility inspection tools; normal mode keeps it out of the taskbar.

When distributing the app, include the executable, config, both icons, three DLLs, and `web` folder. Include the connector and registration scripts if desired. Exclude `Data`, test profiles, logs, screenshots of personal history, and SDK/build outputs. Moving or rebuilding the app does not erase existing data.
