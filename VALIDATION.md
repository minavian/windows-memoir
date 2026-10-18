# Windows Memoir verification

Version 6.0.0, October 18, 2026. Made by Mina Vian.

The 64-bit `Memoir.exe` was built with Windows' .NET Framework 4.8 compiler and run on this PC (2560 × 1440 at 125% display scaling) with a test data folder (`--data-dir`), so no personal history was read or changed.

## Checks that passed

- **63 native checks** (`tests/run.ps1`): app and site switches, repeated synchronization without double counting, idle and audio timing, pausing, locking, missed sleep events, midnight and daylight-saving boundaries, effective daily limits, notification deduplication, title limits, retention, excluded identities, backup redaction, recovery from damaged history. New in 6.0: a Windows save keeps the extension's whole day record (page links, hour titles, the deleted-titles list); window titles are kept hour by hour and split at the hour; Never track removes a name from hour titles and links; Erase titles clears all of them; titles are screened like the extension's (unread counts, addresses, a site's own name, reserved names).
- **11 native browser-link checks**: a real local pipe, browser identity and focus isolation, private-window metadata, UTF-8 framing, invalid and truncated messages.
- **42 interface checks** (`tests/interface.cjs`, the pages in Chrome with a stand-in host): the export carrying the limit history and the import bringing it back; app names and icons, Memoir's own time shown as Memoir, the version the report reads, Day as the Categories default, the large and narrow layouts, scrolling glide, right-click menus in Light and Dark, the tray palette following the theme, pausing (it asks "Sure?" first) and resuming, Settings in Windows words with no extra note, How Memoir works and the privacy policy in Windows words with a way back, Today and report navigation, the first-run opening and welcome, and no JavaScript errors or host error logs.
- **49 native tray checks** (`tests/tray.ps1`): action sizes and callback delivery before closing in Light and Dark, and a Pink theme saved by 5.x becoming Light or Dark.
- **The real app, driven over its WebView2** (19 checks): first run with the opening and the Windows welcome; the report naming apps, websites and Memoir, on one screen in three columns (1360 × 850 CSS pixels at 125%); Settings fitting, footer included; How Memoir works and the privacy policy opening in the window and coming back (Back to Memoir, and Esc); the Rainbow clock saved for the tray icon; Today at its full size, naming apps; hour titles kept in `history.json`; no page errors and an empty `errors.log`.
- **Live tracking**: with Memoir's window in front, the live session was Memoir (`~memoir`), and its time was saved when Memoir quit.

## Found and fixed while verifying

- At 125% display scaling the windows were sized in physical pixels: the report fell back to its two-column scrolling layout, Settings lost its footer, and Today was narrower than its page. Window sizes now scale with Windows' display scaling, within the screen's free area.
- Today asked the window for a missing `/favicon.ico`; it now names its icon.

## Background resources (5.0.2, not measured again for 6.0)

A 30.34-second sample followed opening and minimizing the interface and opening/dismissing the native tray menu, with everything minimized.

| Measurement | Result |
| --- | --- |
| Resident memory | 13.67 MB |
| Private memory | 31.88 MB |
| CPU time in sample | 46.88 ms |
| Average usage of one CPU core | 0.155% |
| Child processes after dismissal | None |

The tracker and the minimized behaviour didn't change in 6.0 (the interface is released when minimized); run `tests/performance.ps1` to measure again. The source results are in `tests/performance-final.json`.

## Practical limits

Address-bar accessibility is a fallback and can be unavailable in some browsers and windows; those sessions count under the browser app. Without the optional connector, browser audio is detected per process and private windows can't be told apart. The connector provides exact active-tab and private-window metadata for Chromium browsers; its script and native pipe were verified, but it wasn't installed into a browser during development. Physical lock and sleep and every installed browser weren't exhaustively exercised; their transitions and accounting are covered by the code tests. Existing Data and verification profiles are preserved, and must be excluded from distributed copies.
