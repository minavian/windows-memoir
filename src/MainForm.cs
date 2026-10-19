using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using SaveFileDialog = System.Windows.Forms.SaveFileDialog;
using Timer = System.Windows.Forms.Timer;

namespace Memoir {
    internal sealed class MainForm : Form {
        private readonly Store store;
        private readonly Engine engine;
        private readonly string directory, dataDirectory, diagnostics;
        private readonly TrayIcon tray;          // the clock in the notification area (TrayIcon.cs)
        private TrayTip trayTip;                 // its tooltip, in Memoir's look
        private Flyout flyout;                   // Today, by the clock: the popup, as in the browser (Flyout.cs)
        private WebView2 flyoutWeb;
        private bool flyoutLoaded;
        private readonly Timer flyoutRelease = new Timer();
        private readonly Tracker tracker;
        private readonly Sync sync;
        private Process trayMenu;
        private readonly EventWaitHandle closeTrayMenu = new EventWaitHandle(false, EventResetMode.ManualReset, "Local\\Memoir.Tray." + Process.GetCurrentProcess().Id);
        // the menu, started while the mouse is over the clock (hidden, ready), shown by a click (TrayPopup --standby)
        private readonly EventWaitHandle showTrayMenu = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\Memoir.TrayShow." + Process.GetCurrentProcess().Id);
        private Process trayStandby; private string trayStandbyFor;
        private DateTime ignoreTrayClickUntil;
        private WebView2 web;
        private Splash splash;   // over the web view until its page has painted (Splash.cs)
        private CoreWebView2Environment environment;   // shared by the window's page and Today's
        private const string WebOptions = "--disable-background-networking --disable-component-update --disable-features=msEdgeSidebarV2";
        private readonly Icon plainIcon, rainbowIcon;
        private bool exiting, hiddenStart, loading, recovering;
        private int generation, recoveryAttempts;
        private string view = "recap.html";
        private readonly Timer diagnosticsTimer;
        private readonly Timer releaseTimer;
        private System.Threading.Timer registration; // browsers installed later get Memoir's host too
        private readonly int restoreMessage;
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        private readonly bool fixedData;   // started with --data-dir (a test copy): it leaves Windows' startup list alone
        public MainForm(string directory, string dataDirectory, bool fixedData, bool minimized, string diagnostics) {
            this.directory = directory; this.dataDirectory = dataDirectory; this.fixedData = fixedData; this.diagnostics = diagnostics; hiddenStart = minimized;
            restoreMessage = Native.RegisterWindowMessage("Local\\Memoir-" + Tracker.IconName(dataDirectory.ToLowerInvariant()).Replace(".png", ""));
            Text = "Memoir"; BackColor = Color.FromArgb(245, 245, 247); ClientSize = Scaled(1360, 850, true); MinimumSize = Scaled(680, 520); StartPosition = FormStartPosition.CenterScreen; AutoScaleMode = AutoScaleMode.Dpi;
            if (File.Exists(Path.Combine(directory, "Memoir.ico"))) Icon = plainIcon = new Icon(Path.Combine(directory, "Memoir.ico"));
            if (File.Exists(Path.Combine(directory, "Memoir-rainbow.ico"))) rainbowIcon = new Icon(Path.Combine(directory, "Memoir-rainbow.ico"));
            store = new Store(dataDirectory); engine = new Engine(store, TimeZoneInfo.Local);
            if (Startup.Available(fixedData)) Startup.Start(store, StartupCommand());
            ApplySavedTheme();
            // the clock: a click opens Today beside it, a right-click the menu, a double-click the window; resting on it
            // gets both ready (so a click shows them at once) and shows its tooltip
            tray = new TrayIcon { Icon = Icon, Text = TrayName() }; tray.Show();
            ApplyIcon();
            tray.Hover += delegate { WarmTrayMenu(); WarmFlyout(); };
            tray.Select += delegate { if (DateTime.UtcNow >= ignoreTrayClickUntil) ToggleFlyout(); };
            tray.Open += delegate { ignoreTrayClickUntil = DateTime.UtcNow.AddMilliseconds(SystemInformation.DoubleClickTime); HideTip(); HideFlyout(); RestoreWindow(); };
            tray.Menu += delegate { HideTip(); HideFlyout(); ShowTrayMenu(); };
            tray.PopupOpen += delegate(Point at) { ShowTip(at); };
            tray.PopupClose += delegate { HideTip(); };
            tray.BalloonClicked += delegate { RestoreWindow(); };
            engine.Notification += delegate(string title, string text) { tray.ShowBalloon(title, text); store.Save(); };
            flyoutRelease.Tick += delegate { flyoutRelease.Stop(); if (flyout != null && !flyout.Visible) ReleaseFlyout(); };
            IntPtr handle = Handle; Native.WTSRegisterSessionNotification(handle, 0);
            tracker = new Tracker(this, store, engine, dataDirectory);
            // the Memoir extension can reach this app (native messaging), and syncs once linked from its Settings
            Registration.Register(directory, dataDirectory);
            registration = new System.Threading.Timer(delegate { Registration.Register(directory, dataDirectory); }, null, 600000, 600000);
            var version = typeof(MainForm).Assembly.GetName().Version;
            sync = new Sync(this, store, engine, tracker.Link, version.Major + "." + version.Minor + "." + version.Build, Path.Combine(dataDirectory, "icons"), delegate { tracker.SettingsChanged(); });
            // the first browser linked here brings a short tour of what linking does (recap.js maybeLinkTour): Memoir
            // comes to the front for it; a browser linked before this version gets it the next time Memoir opens
            sync.Linked += delegate(string device) {
                if (Json.Get(store.Data, "linkTour") != null) return;
                store.Set(Json.Object("linkTour", Json.Object("pending", device))); store.Save(); RestoreWindow();
            };
            if (Json.Get(store.Data, "linkTour") == null) { var peers = Json.Map(Json.Get(Json.Map(Json.Get(store.Data, "sync")), "peers")); if (peers.Count > 0) store.Set(Json.Object("linkTour", Json.Object("pending", peers.Keys.First()))); }
            store.Changed += delegate(Dictionary<string, object> changes) { if (changes.ContainsKey("settings")) { tray.Text = TrayName(); ApplyIcon(); FollowTheme(); } Post(Json.Object("event", "storage", "area", "local", "changes", changes)); };
            engine.SessionChanged += delegate(Dictionary<string, object> session) { Post(Json.Object("event", "storage", "area", "session", "changes", Json.Object("session", Json.Object("newValue", session)))); };
            SystemEvents.PowerModeChanged += OnPower;
            Shown += async delegate { if (hiddenStart) { Hide(); hiddenStart = false; releaseTimer.Start(); } else await LoadView(); };
            Resize += delegate { if (WindowState == FormWindowState.Minimized) MinimizeToTray(); else PostWindowState(); };
            Activated += delegate { PostWindowState(); };
            Deactivate += delegate { PostWindowState(); };
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (args.CloseReason == CloseReason.WindowsShutDown || args.CloseReason == CloseReason.TaskManagerClosing) exiting = true;
                if (!exiting) { args.Cancel = true; MinimizeToTray(); return; }
                ++generation; CloseTrayMenu(); ReleaseFlyout(); if (trayTip != null) trayTip.Dispose(); ReleaseWeb(); tracker.Dispose(); diagnosticsTimer.Dispose(); releaseTimer.Dispose(); flyoutRelease.Dispose(); registration.Dispose(); closeTrayMenu.Dispose(); tray.Dispose(); SystemEvents.PowerModeChanged -= OnPower; Native.WTSUnRegisterSessionNotification(Handle);
            };
            diagnosticsTimer = new Timer { Interval = 5000 };
            diagnosticsTimer.Tick += delegate { WriteDiagnostics(); };
            if (!String.IsNullOrEmpty(diagnostics)) diagnosticsTimer.Start();
            releaseTimer = new Timer { Interval = 1500 };
            releaseTimer.Tick += delegate {
                releaseTimer.Stop();
                if (Visible || web != null || loading || exiting || trayMenu != null || flyout != null) return;
                GC.Collect(2, GCCollectionMode.Forced, true, true); GC.WaitForPendingFinalizers(); GC.Collect();
                using (var process = Process.GetCurrentProcess()) Native.SetProcessWorkingSetSize(process.Handle, new IntPtr(-1), new IntPtr(-1));
                WriteDiagnostics();
            };
            engine.Prune(DateTime.Now);
        }
        private async Task LoadView() {
            if (web != null || loading || exiting || !Visible) return;
            loading = true; int current = ++generation;
            var control = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor, BackColor = BackColor }; web = control; Controls.Add(control);
            ShowSplash();
            try {
                bool existingProfile = Directory.Exists(Path.Combine(dataDirectory, "WebView"));
                if (environment == null) environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDirectory, "WebView"), new CoreWebView2EnvironmentOptions(WebOptions));
                if (current != generation || web != control || control.IsDisposed) return;
                await control.EnsureCoreWebView2Async(environment);
                if (current != generation || web != control || control.IsDisposed) return;
                var core = control.CoreWebView2;
                ApplyColorScheme();
                core.NavigationCompleted += delegate { var check = new Timer { Interval = 2500 }; check.Tick += delegate { check.Dispose(); if (web == control) HideSplash(); }; check.Start(); };   // (a page that never says)
                Configure(core);
                await MovePreferences(control, existingProfile);
                if (current != generation || web != control || control.IsDisposed) return;
                core.WebMessageReceived += OnMessage;
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                    if (args.Uri.StartsWith("https://memoir.example/", StringComparison.Ordinal)) return;
                    args.Cancel = true; OpenLink(args.Uri);
                };
                // Memoir's own pages (How Memoir works, the privacy policy) open in this window: there are no tabs here
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) {
                    args.Handled = true;
                    if (args.Uri.StartsWith("https://memoir.example/", StringComparison.Ordinal)) core.Navigate(args.Uri); else OpenLink(args.Uri);
                };
                core.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs args) {
                    if (web != control || exiting) return;
                    Log("WebView " + args.ProcessFailedKind + ": " + args.Reason + " (" + args.ExitCode + ")");
                    if (exiting || recovering || web != control || (args.ProcessFailedKind != CoreWebView2ProcessFailedKind.BrowserProcessExited && args.ProcessFailedKind != CoreWebView2ProcessFailedKind.RenderProcessExited)) return;
                    recovering = true;
                    BeginInvoke(new Action(async delegate {
                        ReleaseWeb();
                        if (++recoveryAttempts <= 2) await LoadView();
                        else MessageBox.Show(this, "The Windows web runtime could not keep the interface running. Tracking continues in the notification area. See Data\\errors.log for details.", "Memoir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        recovering = false;
                    }));
                };
                core.DownloadStarting += OnDownload;
                core.Navigate("https://memoir.example/" + view);
            } catch (Exception error) {
                if (current == generation && !exiting) { ReleaseWeb(); MessageBox.Show(this, "Memoir’s tracker is running, but its interface could not open.\n\n" + error.Message + "\n\nMicrosoft Edge WebView2 Runtime must be installed.", "Memoir", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            } finally {
                loading = false;
                if (!exiting && web == null) {
                    if (!Visible) releaseTimer.Start();
                    else if (current != generation && !recovering) BeginInvoke(new Action(async delegate { await LoadView(); }));
                }
                WriteDiagnostics();
            }
        }
        // What every Memoir page gets: its files (Not .local: Chromium resolves .local names over the network first, which
        // added ~2 s to every page load), no browser menus or zoom, no permissions
        private void Configure(CoreWebView2 core) {
            core.Settings.AreDefaultContextMenusEnabled = false; core.Settings.IsStatusBarEnabled = false; core.Settings.AreDevToolsEnabled = !String.IsNullOrEmpty(diagnostics); core.Settings.IsZoomControlEnabled = false;
            core.SetVirtualHostNameToFolderMapping("memoir.example", Path.Combine(directory, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
            core.SetVirtualHostNameToFolderMapping("memoir-icons.example", Path.Combine(dataDirectory, "icons"), CoreWebView2HostResourceAccessKind.DenyCors);
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
        }

        // ---------- Today, by the clock (Flyout.cs) ----------
        // The mouse rests on the clock: Today's page gets ready, hidden, so a click shows it at once. Unused, it goes
        // after 20 s; closed, after a minute (Memoir in the background stays small).
        private void WarmFlyout() {
            if (exiting) return;
            if (flyout == null) CreateFlyout();
            if (!flyout.Visible && (!flyoutRelease.Enabled || flyoutRelease.Interval < 20000)) { flyoutRelease.Stop(); flyoutRelease.Interval = 20000; flyoutRelease.Start(); }
        }
        private async void CreateFlyout() {
            releaseTimer.Stop();
            var appearance = Appearance.Resolve(Json.Get(store.Data, "windowsAppearance"));
            var form = new Flyout(BackColor) { Dark = Json.Text(Json.Get(appearance, "theme")) == "dark" };
            var control = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor, BackColor = BackColor };
            form.Controls.Add(control); flyout = form; flyoutWeb = control; flyoutLoaded = false;
            form.Dismissed += delegate { if (flyout == form) FlyoutClosed(); };
            IntPtr handles = form.Handle; handles = control.Handle;   // ready while hidden: the page loads before it's shown
            try {
                if (environment == null) environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDirectory, "WebView"), new CoreWebView2EnvironmentOptions(WebOptions));
                if (flyout != form || control.IsDisposed) return;
                await control.EnsureCoreWebView2Async(environment);
                if (flyout != form || control.IsDisposed) return;
                var core = control.CoreWebView2;
                Configure(core); ApplyColorScheme();
                core.WebMessageReceived += OnMessage;
                // Today's page only: links open in the browser, Memoir's other pages in the window
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                    if (args.Uri.StartsWith("https://memoir.example/popup.html", StringComparison.Ordinal)) return;
                    args.Cancel = true; OpenElsewhere(args.Uri);
                };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; OpenElsewhere(args.Uri); };
                core.NavigationCompleted += delegate { if (flyout != form) return; flyoutLoaded = true; if (form.Visible) Send(control, Json.Object("event", "flyout", "state", "shown")); };
                core.ProcessFailed += delegate { if (flyout == form) BeginInvoke(new Action(ReleaseFlyout)); };
                core.Navigate("https://memoir.example/popup.html?flyout");
            } catch (Exception error) { Log("Today: " + error.GetType().Name); if (flyout == form) ReleaseFlyout(); }
        }
        private void OpenElsewhere(string address) {
            Uri uri; if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) return;
            if (uri.Host != "memoir.example") { OpenLink(address); return; }
            string page = uri.AbsolutePath.TrimStart('/');
            HideFlyout(); if (page == "recap.html" || page == "how-it-works.html" || page == "privacy.html") { view = page; ReleaseWeb(); RestoreWindow(); }
        }
        private void ToggleFlyout() {
            if (exiting) return;
            HideTip(); CloseTrayMenu();
            if (flyout != null && flyout.Visible) { HideFlyout(); return; }
            // the click on the clock that closed it (it lost the focus to the taskbar a moment ago) doesn't open it again
            if (flyout != null && (DateTime.UtcNow - flyout.HiddenAt).TotalMilliseconds < 400) return;
            ShowFlyout();
        }
        private void ShowFlyout() {
            if (exiting) return;
            if (flyout == null) CreateFlyout();
            flyoutRelease.Stop(); releaseTimer.Stop();
            engine.Flush(Engine.Now);
            flyout.ShowNear(tray.Bounds, Control.MousePosition);
            if (flyoutLoaded) Send(flyoutWeb, Json.Object("event", "flyout", "state", "shown"));
        }
        private void HideFlyout() { if (flyout == null || !flyout.Visible) return; flyout.HideNow(); FlyoutClosed(); }
        // closed: its page starts again, hidden, so the next opening plays its entrance; unused for a minute, it goes
        private void FlyoutClosed() {
            if (flyoutWeb != null && !flyoutWeb.IsDisposed && flyoutWeb.CoreWebView2 != null) { flyoutLoaded = false; try { flyoutWeb.CoreWebView2.Reload(); } catch { } }
            flyoutRelease.Stop(); flyoutRelease.Interval = 60000; flyoutRelease.Start();
            tracker.RefreshForeground(true);
        }
        private void ReleaseFlyout() {
            flyoutRelease.Stop();
            var form = flyout; var control = flyoutWeb; flyout = null; flyoutWeb = null; flyoutLoaded = false;
            if (control != null) { control.Dispose(); }
            if (form != null) form.Dispose();
            if (web == null) environment = null;
            if (!exiting && !Visible && web == null) releaseTimer.Start();
        }

        // ---------- the clock's tooltip (TrayTip.cs) ----------
        private string TrayName() { return engine.Paused ? "Memoir — tracking paused" : "Memoir — tracking screen time"; }
        private void ShowTip(Point at) {
            if (exiting || trayMenu != null || (flyout != null && flyout.Visible)) return;
            if (trayTip == null) trayTip = new TrayTip();
            if (splashLogo == null) try { splashLogo = Image.FromFile(Path.Combine(directory, "web", "icons", "icon128.png")); } catch { }
            if (splashRainbow == null) try { splashRainbow = Image.FromFile(Path.Combine(directory, "web", "icons", "rainbow128.png")); } catch { }
            var appearance = Appearance.Resolve(Json.Get(store.Data, "windowsAppearance")); var palette = Json.Map(Json.Get(appearance, "palette"));
            bool dark = Json.Text(Json.Get(appearance, "theme")) == "dark";
            var icon = tray.Bounds; if (icon.IsEmpty) icon = new Rectangle(at.X - 8, at.Y - 8, 16, 16);
            engine.Flush(Engine.Now);
            double ms = engine.Total(Engine.Day(engine.Local(Engine.Now)));
            string today = ms < 1000 ? "Nothing yet today" : ms < 60000 ? "Under a minute today" : Duration(ms) + " today";
            trayTip.ShowAt(icon, Json.Bool(Json.Get(engine.Settings, "rainbow")) && splashRainbow != null ? splashRainbow : splashLogo,
                engine.Paused ? "Tracking paused · " + today : today, dark,
                CssColor(Json.Text(Json.Get(palette, "surface")), dark ? Color.FromArgb(28, 28, 30) : Color.White),
                CssColor(Json.Text(Json.Get(palette, "label")), dark ? Color.FromArgb(245, 245, 247) : Color.FromArgb(29, 29, 31)),
                CssColor(Json.Text(Json.Get(palette, "secondary")), dark ? Color.FromArgb(161, 161, 166) : Color.FromArgb(110, 110, 115)));
        }
        private void HideTip() { if (trayTip != null && trayTip.Visible) trayTip.Hide(); }
        private static string Duration(double ms) { long minutes = (long)(ms / 60000); return minutes >= 60 ? (minutes / 60) + "h " + (minutes % 60) + "m" : minutes + "m"; }
        // a colour as the page's CSS gives it (#rrggbb, or rgb()/rgba() over the surface)
        private static Color CssColor(string css, Color fallback) {
            try {
                css = (css ?? "").Trim(); if (css.Length == 0) return fallback;
                if (css.StartsWith("#")) return ColorTranslator.FromHtml(css);
                var numbers = System.Text.RegularExpressions.Regex.Matches(css, @"[\d.]+").Cast<System.Text.RegularExpressions.Match>().Select(m => double.Parse(m.Value, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
                if (css.StartsWith("rgb") && numbers.Length >= 3) return Color.FromArgb((int)numbers[0], (int)numbers[1], (int)numbers[2]);
            } catch { }
            return fallback;
        }

        // Once: carry the theme and cursor choices saved under the former memoir.local origin to memoir.example.
        private async Task MovePreferences(WebView2 control, bool existingProfile) {
            string marker = Path.Combine(dataDirectory, "WebView", "preferences-moved");
            if (File.Exists(marker)) return;
            if (existingProfile) {
                var core = control.CoreWebView2; var loaded = new TaskCompletionSource<bool>();
                EventHandler<CoreWebView2NavigationCompletedEventArgs> completed = delegate(object sender, CoreWebView2NavigationCompletedEventArgs args) { loaded.TrySetResult(args.IsSuccess); };
                core.SetVirtualHostNameToFolderMapping("memoir.local", Path.Combine(directory, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationCompleted += completed; control.Visible = false;
                try {
                    core.Navigate("https://memoir.local/icons/icon16.png");
                    if (await Task.WhenAny(loaded.Task, Task.Delay(10000)) == loaded.Task && loaded.Task.Result) {
                        var saved = Json.Map(Json.Decode(await core.ExecuteScriptAsync("({ theme: localStorage.getItem('bst-theme'), cursor: localStorage.getItem('bst-cursor') })")));
                        string theme = Json.Text(Json.Get(saved, "theme")), seed = "";
                        if (theme == "light" || theme == "dark") seed +="localStorage.setItem('bst-theme', '" + theme + "');";
                        if (Json.Text(Json.Get(saved, "cursor")) == "off") seed += "localStorage.setItem('bst-cursor', 'off');";
                        if (seed.Length > 0) await core.AddScriptToExecuteOnDocumentCreatedAsync("try { if (location.host === 'memoir.example' && !localStorage.getItem('memoir-preferences-moved')) { " + seed + " localStorage.setItem('memoir-preferences-moved', '1'); } } catch {}");
                    }
                } catch (Exception error) { Log("Preferences: " + error.GetType().Name); }
                finally { if (!control.IsDisposed) { core.NavigationCompleted -= completed; core.ClearVirtualHostNameToFolderMapping("memoir.local"); control.Visible = true; } }
            }
            // An interrupted attempt (the window was minimized) runs again next time.
            if (!control.IsDisposed) try { File.WriteAllText(marker, ""); } catch { }
        }
        // the loading clock, over the web view; and away again, once the page has painted
        private void ShowSplash() {
            if (splash != null) { splash.BackColor = BackColor; return; }
            if (splashLogo == null) try { splashLogo = Image.FromFile(Path.Combine(directory, "web", "icons", "icon128.png")); } catch { }
            if (splashRainbow == null) try { splashRainbow = Image.FromFile(Path.Combine(directory, "web", "icons", "rainbow128.png")); } catch { }
            splash = new Splash(Json.Bool(Json.Get(engine.Settings, "rainbow")) && splashRainbow != null ? splashRainbow : splashLogo, BackColor);
            Controls.Add(splash); splash.BringToFront();
        }
        private Image splashLogo, splashRainbow;
        private void HideSplash() {
            var gone = splash; if (gone == null) return;
            gone.Finish(delegate { if (splash == gone) splash = null; Controls.Remove(gone); gone.Dispose(); });
        }
        // the web view's own colours (before a page has any, and its default for "System") follow Memoir's theme,
        // not Windows': no dark frame under a Light Memoir
        private void ApplyColorScheme() {
            try {
                var core = web != null && web.CoreWebView2 != null ? web.CoreWebView2 : flyoutWeb != null && !flyoutWeb.IsDisposed ? flyoutWeb.CoreWebView2 : null;   // (one profile: both pages)
                if (core == null) return;
                string mode = Json.Text(Json.Get(Appearance.Resolve(Json.Get(store.Data, "windowsAppearance")), "mode"), "auto");
                core.Profile.PreferredColorScheme = mode == "light" ? CoreWebView2PreferredColorScheme.Light : mode == "dark" ? CoreWebView2PreferredColorScheme.Dark : CoreWebView2PreferredColorScheme.Auto;
            } catch { }
        }
        private void ReleaseWeb() {
            ++generation;
            var control = web; web = null;
            if (splash != null) { var gone = splash; splash = null; Controls.Remove(gone); gone.Dispose(); }
            if (control != null) { Controls.Remove(control); control.Dispose(); }
            if (flyoutWeb == null) environment = null;
        }
        private void MinimizeToTray() { if (exiting) return; CloseTrayMenu(); Hide(); ReleaseWeb(); engine.Flush(Engine.Now); store.Save(); releaseTimer.Start(); WriteDiagnostics(); }
        public async void RestoreWindow() { if (exiting) return; CloseTrayMenu(); releaseTimer.Stop(); ApplySavedTheme(); Show(); WindowState = FormWindowState.Normal; Activate(); Native.ToFront(Handle); tracker.RefreshForeground(true); await LoadView(); }
        private void CloseTrayMenu() { if (trayMenu != null) closeTrayMenu.Set(); }
        // what the menu shows (the theme, paused or not): a menu made ready for something else isn't used
        private string TrayState() { return Convert.ToBase64String(Encoding.UTF8.GetBytes(Json.Encode(Appearance.Resolve(Json.Get(store.Data, "windowsAppearance"))))) + (engine.Paused ? " --paused" : ""); }
        private Process StartTrayMenu(string arguments) {
            var menu = new Process { StartInfo = new ProcessStartInfo(Path.Combine(directory, "Memoir.exe"), "--tray-popup --parent=" + Process.GetCurrentProcess().Id + " --owner=" + Handle.ToInt64() + " --message=" + restoreMessage + " " + arguments + (!String.IsNullOrEmpty(diagnostics) ? " --inspect-menu" : "")) { UseShellExecute = false, CreateNoWindow = true }, EnableRaisingEvents = true };
            menu.Exited += delegate { try { BeginInvoke(new Action(delegate {
                if (trayStandby == menu) { trayStandby = null; menu.Dispose(); return; }
                if (trayMenu != menu) return; trayMenu = null; tracker.IgnoreProcess(trayMenuPid, false); menu.Dispose();
                if (!exiting) { tracker.RefreshForeground(true); if (!Visible) releaseTimer.Start(); WriteDiagnostics(); }
            })); } catch { menu.Dispose(); } };
            menu.Start();
            return menu;
        }
        private int trayMenuPid;
        // the mouse is over the clock: the menu gets ready, so a click shows it at once
        private void WarmTrayMenu() {
            if (exiting || trayMenu != null || trayStandby != null) return;
            try { closeTrayMenu.Reset(); trayStandbyFor = TrayState(); trayStandby = StartTrayMenu("--standby --anchor=0,0 --appearance=" + trayStandbyFor); }
            catch (Exception error) { trayStandby = null; Log("Tray menu: " + error.GetType().Name); }
        }
        private void ShowTrayMenu() {
            if (exiting) return;
            if (trayMenu != null) { CloseTrayMenu(); return; }
            releaseTimer.Stop(); engine.Stop(Engine.Now);
            var ready = trayStandby; trayStandby = null;
            if (ready != null && !ready.HasExited && trayStandbyFor == TrayState()) {
                trayMenu = ready; trayMenuPid = ready.Id; tracker.IgnoreProcess(trayMenuPid, true);
                // the click gave this app the front: the menu may take it, so it closes when you click elsewhere
                Native.AllowSetForegroundWindow(trayMenuPid);
                showTrayMenu.Set(); WriteDiagnostics();
                return;
            }
            if (ready != null) try { ready.Kill(); } catch { }
            var anchor = Control.MousePosition;
            try { closeTrayMenu.Reset(); trayMenu = StartTrayMenu("--anchor=" + anchor.X + "," + anchor.Y + " --appearance=" + TrayState()); trayMenuPid = trayMenu.Id; tracker.IgnoreProcess(trayMenuPid, true); WriteDiagnostics(); }
            catch (Exception error) { trayMenu = null; Log("Tray menu: " + error.GetType().Name); if (!Visible) releaseTimer.Start(); }
        }
        // the clock in the notification area and on the window, in rainbow colours with the Rainbow clock on
        private void ApplyIcon() {
            var icon = Json.Bool(Json.Get(engine.Settings, "rainbow")) && rainbowIcon != null ? rainbowIcon : plainIcon;
            if (icon == null) return;
            if (Icon != icon) Icon = icon;
            if (tray != null && tray.Icon != icon) tray.Icon = icon;
        }
        // A theme chosen in a linked browser (settings.theme) while the page is closed: the window, the loading
        // screen and the tray menu take it now (the page, when open, reports its own, with its colours)
        private void FollowTheme() {
            string mode = Json.Text(Json.Get(engine.Settings, "theme"));
            if (web != null || (mode != "auto" && mode != "light" && mode != "dark")) return;
            if (Json.Text(Json.Get(Json.Map(Json.Get(store.Data, "windowsAppearance")), "mode"), "auto") == mode) return;
            store.Set(Json.Object("windowsAppearance", Json.Object("mode", mode, "theme", mode == "auto" ? "light" : mode))); store.Save();
            ApplySavedTheme(); ApplyColorScheme();
        }
        private void ApplySavedTheme() {
            var appearance = Appearance.Resolve(Json.Get(store.Data, "windowsAppearance"));
            // the window's own colour is the page's background, so the title bar and edges never show a seam
            var palette = Json.Map(Json.Get(appearance, "palette"));
            ApplyTheme(Json.Text(Json.Get(appearance, "theme")), Json.Text(Json.Get(palette, "background"), Json.Text(Json.Get(palette, "surface"))));
        }
        private void ChangeView(string page) {
            if (page != "popup.html" && page != "recap.html") return;
            view = page; ReleaseWeb(); MinimumSize = page == "popup.html" ? Scaled(380, 640) : Scaled(680, 520); ClientSize = page == "popup.html" ? Scaled(380, 600, true) : Scaled(1360, 850, true); RestoreWindow();
        }
        // Sizes are the pages' own (CSS pixels, as in the extension), scaled with Windows' display scaling: at 125%
        // the report's 1360 × 850 is 1700 × 1063 on screen, or it falls back to its two-column scrolling layout and
        // Today is narrower than its page. A window's inside never outgrows the screen's free area.
        private Size Scaled(int width, int height, bool fit = false) {
            float scale; using (var screen = Graphics.FromHwnd(IntPtr.Zero)) scale = screen.DpiX / 96f; // (DeviceDpi says 96 before the window exists)
            int w = (int)Math.Round(width * scale), h = (int)Math.Round(height * scale);
            if (fit) { var area = Screen.FromPoint(Cursor.Position).WorkingArea; w = Math.Min(w, area.Width - 32); h = Math.Min(h, area.Height - 80); }
            return new Size(w, h);
        }
        // A website opens in the default browser; a mailto: link (the bug report, the author's address) in the email app
        private static void OpenLink(string address) {
            Uri uri; if (!Uri.TryCreate(address, UriKind.Absolute, out uri) || (uri.Scheme != "https" && uri.Scheme != "http" && uri.Scheme != "mailto") || uri.Host == "memoir.example") return;
            try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); } catch { }
        }
        // what happens (storage, the session) goes to every page open: the window's and Today's
        private void Post(object payload) { Send(web, payload); Send(flyoutWeb, payload); }
        private static void Send(WebView2 view, object payload) { if (view == null || view.IsDisposed || view.CoreWebView2 == null) return; try { view.CoreWebView2.PostWebMessageAsJson(Json.Encode(payload)); } catch { } }
        private static void Answer(CoreWebView2 core, object payload) { if (core == null) return; try { core.PostWebMessageAsJson(Json.Encode(payload)); } catch { } }
        private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
            Uri origin; if (!Uri.TryCreate(args.Source, UriKind.Absolute, out origin) || origin.Scheme != "https" || origin.Host != "memoir.example") return;
            // Today (the flyout by the clock) or the window: each page gets its own answers
            var from = sender as CoreWebView2; bool today = flyoutWeb != null && !flyoutWeb.IsDisposed && flyoutWeb.CoreWebView2 == from;
            Dictionary<string, object> message;
            try { message = Json.Map(Json.Decode(args.WebMessageAsJson)); } catch { return; }
            object id = Json.Get(message, "id"); string operation = Json.Text(Json.Get(message, "op")); object result = null;
            var data = Json.Map(Json.Get(message, "data"));
            try {
                switch (operation) {
                    case "storage.get": result = store.Get(Json.Get(data, "keys")); break;
                    case "storage.set":
                        var patch = Json.Map(Json.Get(data, "patch"));
                        engine.Flush(Engine.Now); store.Set(patch);
                        engine.EnforcePrivacy();
                        if (patch.ContainsKey("settings")) tracker.SettingsChanged();
                        if (patch.ContainsKey("goal")) engine.CheckGoal(Engine.Now);
                        store.Save(); break;
                    case "storage.remove": engine.Flush(Engine.Now); store.Remove(Json.Get(data, "keys")); store.Save(); break;
                    case "storage.keys": result = store.Data.Keys.ToArray(); break;
                    case "storage.bytes": result = Encoding.UTF8.GetByteCount(Json.Encode(store.Get(Json.Get(data, "keys")))); break;
                    case "session.get": result = Json.Object("session", engine.Session); break;
                    case "session.remove": engine.Stop(Engine.Now); break;
                    case "runtime.sync": engine.Flush(Engine.Now); result = Json.Object("ok", true); break;
                    case "window.report": Answer(from, Json.Object("id", id, "result", Json.Object("ok", true))); HideFlyout(); ChangeView("recap.html"); return;
                    case "window.today": Answer(from, Json.Object("id", id, "result", true)); if (!today) ChangeView("popup.html"); return;
                    case "window.minimize": Answer(from, Json.Object("id", id, "result", true)); if (today) HideFlyout(); else MinimizeToTray(); return;
                    // the page's title bar (TitleBar.cs)
                    case "window.state": result = today ? Json.Object("maximized", false, "active", true) : WindowFacts(); break;
                    case "window.painted": if (!today) HideSplash(); break;
                    case "window.maximize": Answer(from, Json.Object("id", id, "result", true)); if (today) return; BeginInvoke(new Action(delegate { WindowState = TitleBar.IsZoomed(Handle) ? FormWindowState.Normal : FormWindowState.Maximized; })); return;
                    case "window.close": Answer(from, Json.Object("id", id, "result", true)); if (today) HideFlyout(); else BeginInvoke(new Action(delegate { Close(); })); return;
                    case "window.drag": { int hit = (int)Json.Number(Json.Get(data, "hit"), TitleBar.Caption); Answer(from, Json.Object("id", id, "result", true)); if (today) return; BeginInvoke(new Action(delegate { TitleBar.Drag(Handle, hit); })); return; }
                    case "window.menu": Answer(from, Json.Object("id", id, "result", true)); if (today) return; BeginInvoke(new Action(delegate { TitleBar.Menu(Handle); })); return;
                    case "privacy.titles": engine.Flush(Engine.Now); engine.EraseTitles(); store.Save(); break;
                    case "link.open": OpenLink(Json.Text(Json.Get(data, "url"))); break;
                    case "clipboard.read": result = Clipboard.ContainsText() ? Clipboard.GetText() : ""; break;
                    case "clipboard.write": string text = Json.Text(Json.Get(data, "text")); if (text.Length == 0) Clipboard.Clear(); else Clipboard.SetText(text); break;
                    // Start with Windows (Startup.cs)
                    case "startup.get": result = Json.Object("available", Startup.Available(fixedData), "on", Startup.Available(fixedData) && Startup.IsOn()); break;
                    case "startup.set": if (!Startup.Available(fixedData)) throw new InvalidOperationException("Not for this copy."); result = Json.Object("available", true, "on", Startup.Set(Json.Bool(Json.Get(data, "on")), StartupCommand())); break;
                    case "theme":
                        store.Set(Json.Object("windowsAppearance", data)); store.Save(); ApplySavedTheme(); ApplyColorScheme(); break;
                    case "status": result = Json.Object("browser", tracker.BrowserStatus, "paused", engine.Paused, "uiLoaded", web != null, "dataDirectory", dataDirectory); break;
                    case "folder.open": Process.Start(new ProcessStartInfo(dataDirectory) { UseShellExecute = true }); break;
                    case "link.unlink": sync.Unlink(Json.Text(Json.Get(data, "device"))); break;
                    case "log": Log(Json.Text(Json.Get(data, "message"))); break;
                    default: throw new InvalidOperationException("Unknown desktop request.");
                }
                Answer(from, Json.Object("id", id, "result", result));
            } catch (Exception error) { Log(operation + ": " + error.GetType().Name); Answer(from, Json.Object("id", id, "error", "The desktop action could not be completed: " + error.Message)); }
        }
        private void ApplyTheme(string theme, string surface) {
            try { Color color = ColorTranslator.FromHtml(surface); BackColor = color; if (web != null) web.DefaultBackgroundColor = color; if (flyout != null) { flyout.BackColor = color; flyout.Dark = theme == "dark"; } if (flyoutWeb != null && !flyoutWeb.IsDisposed) flyoutWeb.DefaultBackgroundColor = color; int dark = theme == "dark" || color.GetBrightness() < .45 ? 1 : 0; DwmSetWindowAttribute(Handle, 20, ref dark, 4); int caption = color.R | (color.G << 8) | (color.B << 16); DwmSetWindowAttribute(Handle, 35, ref caption, 4); } catch { }
        }
        private void OnDownload(object sender, CoreWebView2DownloadStartingEventArgs args) {
            args.Handled = true;
            using (var dialog = new SaveFileDialog { Filter = "Memoir history (*.json)|*.json", FileName = Path.GetFileName(args.ResultFilePath), InitialDirectory = dataDirectory, OverwritePrompt = true }) {
                if (dialog.ShowDialog(this) == DialogResult.OK) args.ResultFilePath = dialog.FileName; else args.Cancel = true;
            }
        }
        private void OnPower(object sender, PowerModeChangedEventArgs args) {
            if (IsDisposed) return;
            try { Invoke(new Action(delegate { if (args.Mode == PowerModes.Suspend) { engine.Suspend(Engine.Now); store.Save(); } else if (args.Mode == PowerModes.Resume) tracker.Resume(); })); } catch { }
        }
        private string StartupCommand() { return Startup.Command(directory, dataDirectory, fixedData); }
        private Dictionary<string, object> WindowFacts() { return Json.Object("maximized", IsHandleCreated && TitleBar.IsZoomed(Handle), "active", ActiveForm == this); }
        private void PostWindowState() { if (IsHandleCreated) Send(web, Json.Object("event", "window", "state", WindowFacts())); }
        protected override void OnHandleCreated(EventArgs args) { base.OnHandleCreated(args); TitleBar.Refresh(Handle); }
        protected override void WndProc(ref Message message) {
            // no Windows caption: the page draws Memoir's own title bar in its place (TitleBar.cs)
            if (message.Msg == TitleBar.CalcSize && message.WParam != IntPtr.Zero) { int top = TitleBar.ProposedTop(message.LParam); base.WndProc(ref message); TitleBar.GiveCaption(Handle, message.LParam, top); message.Result = IntPtr.Zero; return; }
            if (message.Msg == restoreMessage && restoreMessage != 0) {
                int command = message.WParam.ToInt32();
                BeginInvoke(new Action(delegate {
                    if (command == 2) { exiting = true; Close(); }
                    else if (command == 1) MinimizeToTray();
                    else if (command == 3) ShowTrayMenu();
                    else if (command == 4) ChangeView("recap.html");
                    else if (command == 5) ShowFlyout();
                    else if (command == 6) { engine.Stop(Engine.Now); var settings = Json.Clone(engine.Settings); settings["paused"] = !engine.Paused; store.Set(Json.Object("settings", settings)); tracker.SettingsChanged(); store.Save(); }
                    else if (command == 7) CloseTrayMenu();
                    else RestoreWindow();
                }));
            }
            if (message.Msg == 0x02B1 && tracker != null) { if (message.WParam.ToInt32() == 7) tracker.SetLocked(true); else if (message.WParam.ToInt32() == 8) tracker.SetLocked(false); }
            base.WndProc(ref message);
        }
        private void WriteDiagnostics() {
            if (String.IsNullOrEmpty(diagnostics)) return;
            try { using (var process = Process.GetCurrentProcess()) File.WriteAllText(diagnostics, Json.Encode(Json.Object("pid", process.Id, "uiLoaded", web != null, "visible", Visible, "trayMenuOpen", trayMenu != null, "workingSet", process.WorkingSet64, "privateBytes", process.PrivateMemorySize64, "cpuMilliseconds", process.TotalProcessorTime.TotalMilliseconds, "session", engine.Session, "browser", tracker.BrowserStatus, "time", Engine.Now)), new UTF8Encoding(false)); } catch { }
        }
        private void Log(string text) { try { File.AppendAllText(Path.Combine(dataDirectory, "errors.log"), DateTime.UtcNow.ToString("o") + " " + text + Environment.NewLine); } catch { } }
    }
}
