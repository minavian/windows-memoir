# Windows Memoir verification

Version 5.0.2, October 3, 2026. Made by Mina Vian.

The 64-bit `Memoir.exe` was built with Windows' .NET Framework 4.8 compiler. Its shared WebView2 runtime opened the Windows interface successfully on the user desktop. The executable and runtime files are in this folder.

## Checks that passed

- 53 native checks cover app/site switches, repeated synchronization without double counting, idle and audio timing, pausing, locking, missed sleep events, midnight and daylight-saving boundaries, effective daily limits, notification deduplication, title limits, retention, excluded identities, backup redaction, and recovery from damaged history.
- 11 native browser-link checks exercise a real local pipe, browser identity and focus isolation, private-window metadata, UTF-8 framing, and invalid/truncated messages.
- 35 interface checks cover app names and icons, Day as the Categories default, removal of the Today header button, the large/narrow layouts, scrolling glide, animated right-click menus in all themes, Escape dismissal, pause/resume bridging, Today/report navigation, welcome animation, tray palette synchronization, and absence of JavaScript errors.
- The connector checks verify that only the active tab's origin, exact audible/muted status, focus, and private-window status are sent. Paths and query strings are not sent; private-window titles are blank.
- 72 native tray checks cover usable action sizes and callback delivery before closing in Light, Dark, and Pink. Open Memoir, Today, Pause / Resume, and Quit all pass the lifecycle checks. The native menu was also visually inspected on the user desktop.

The tray has smooth scale, fade, and staggered row entrances, animated hover/focus states, and a short closing animation. It supports keyboard navigation and Windows' reduced-animation setting. Its graphics process exists only while the menu is open; the tracker ignores that process. Minimizing or restoring the app also dismisses the menu.

## Background resources

A final 30.34-second sample followed opening and minimizing the WebView interface and opening/dismissing the native tray menu. All sampled states were minimized, with both interface and popup closed.

| Measurement | Result |
| --- | --- |
| Resident memory | 13.67 MB |
| Private memory | 31.88 MB |
| CPU time in sample | 46.88 ms |
| Average usage of one CPU core | 0.155% |
| Child processes after dismissal | None |

These measurements are from this Windows machine and vary with history size, foreground apps, idle/audio checks, and installed runtimes. The source results are in `tests/performance-final.json`. An earlier design retained the WPF graphics heap after closing; the final version uses a temporary menu process to release it completely.

## Practical limits

Address-bar accessibility is a fallback and can be unavailable in some browsers/windows. Those sessions count under the browser app. Without the optional connector, browser audio is detected per process and private windows cannot be reliably distinguished. The connector provides exact active-tab and private-window metadata for Chromium browsers. Its script and native pipe were verified, but it was not installed into the user's browser or registered in their account during development. Follow the README for that optional setup.

Actual app and website detection were checked on the Windows desktop, alongside simulated edge-case time tests. Physical lock/sleep and every installed browser were not exhaustively exercised; their transitions and accounting were verified in code tests. No personal histories were removed or published. Existing Data and verification profiles are preserved, and must be excluded from distributed copies.
