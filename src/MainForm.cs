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
        private readonly NotifyIcon tray;
        private readonly Tracker tracker;
        private Process trayMenu;
        private readonly EventWaitHandle closeTrayMenu = new EventWaitHandle(false, EventResetMode.ManualReset, "Local\\Memoir.Tray." + Process.GetCurrentProcess().Id);
        private DateTime ignoreTrayClickUntil;
        private WebView2 web;
        private CoreWebView2Environment environment;
        private bool exiting, hiddenStart, loading, recovering;
        private int generation, recoveryAttempts;
        private string view = "recap.html";
        private readonly Timer diagnosticsTimer;
        private readonly Timer releaseTimer;
        private readonly int restoreMessage;
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public MainForm(string directory, string dataDirectory, bool minimized, string diagnostics) {
            this.directory = directory; this.dataDirectory = dataDirectory; this.diagnostics = diagnostics; hiddenStart = minimized;
            restoreMessage = Native.RegisterWindowMessage("Local\\Memoir-" + Tracker.IconName(dataDirectory.ToLowerInvariant()).Replace(".png", ""));
            Text = "Memoir"; BackColor = Color.FromArgb(245, 245, 247); ClientSize = new Size(1360, 850); MinimumSize = new Size(680, 520); StartPosition = FormStartPosition.CenterScreen; AutoScaleMode = AutoScaleMode.Dpi;
            if (File.Exists(Path.Combine(directory, "Memoir.ico"))) Icon = new Icon(Path.Combine(directory, "Memoir.ico"));
            store = new Store(dataDirectory); engine = new Engine(store, TimeZoneInfo.Local);
            ApplySavedTheme();
            tray = new NotifyIcon { Icon = Icon, Text = engine.Paused ? "Memoir — tracking paused" : "Memoir — tracking screen time", Visible = true };
            tray.MouseClick += delegate(object sender, MouseEventArgs args) { if (DateTime.UtcNow >= ignoreTrayClickUntil && (args.Button == MouseButtons.Left || args.Button == MouseButtons.Right)) ShowTrayMenu(); };
            tray.DoubleClick += delegate { ignoreTrayClickUntil = DateTime.UtcNow.AddMilliseconds(SystemInformation.DoubleClickTime); RestoreWindow(); };
            tray.BalloonTipClicked += delegate { RestoreWindow(); };
            engine.Notification += delegate(string title, string text) { tray.ShowBalloonTip(6000, title, text, ToolTipIcon.Info); store.Save(); };
            IntPtr handle = Handle; Native.WTSRegisterSessionNotification(handle, 0);
            tracker = new Tracker(this, store, engine, dataDirectory);
            store.Changed += delegate(Dictionary<string, object> changes) { if (changes.ContainsKey("settings")) tray.Text = engine.Paused ? "Memoir — tracking paused" : "Memoir — tracking screen time"; Post(Json.Object("event", "storage", "area", "local", "changes", changes)); };
            engine.SessionChanged += delegate(Dictionary<string, object> session) { Post(Json.Object("event", "storage", "area", "session", "changes", Json.Object("session", Json.Object("newValue", session)))); };
            SystemEvents.PowerModeChanged += OnPower;
            Shown += async delegate { if (hiddenStart) { Hide(); hiddenStart = false; releaseTimer.Start(); } else await LoadView(); };
            Resize += delegate { if (WindowState == FormWindowState.Minimized) MinimizeToTray(); };
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (args.CloseReason == CloseReason.WindowsShutDown || args.CloseReason == CloseReason.TaskManagerClosing) exiting = true;
                if (!exiting) { args.Cancel = true; MinimizeToTray(); return; }
                ++generation; CloseTrayMenu(); ReleaseWeb(); tracker.Dispose(); diagnosticsTimer.Dispose(); releaseTimer.Dispose(); closeTrayMenu.Dispose(); tray.Visible = false; tray.Dispose(); SystemEvents.PowerModeChanged -= OnPower; Native.WTSUnRegisterSessionNotification(Handle);
            };
            diagnosticsTimer = new Timer { Interval = 5000 };
            diagnosticsTimer.Tick += delegate { WriteDiagnostics(); };
            if (!String.IsNullOrEmpty(diagnostics)) diagnosticsTimer.Start();
            releaseTimer = new Timer { Interval = 1500 };
            releaseTimer.Tick += delegate {
                releaseTimer.Stop();
                if (Visible || web != null || loading || exiting || trayMenu != null) return;
                GC.Collect(2, GCCollectionMode.Forced, true, true); GC.WaitForPendingFinalizers(); GC.Collect();
                using (var process = Process.GetCurrentProcess()) Native.SetProcessWorkingSetSize(process.Handle, new IntPtr(-1), new IntPtr(-1));
                WriteDiagnostics();
            };
            engine.Prune(DateTime.Now);
        }
        private async Task LoadView() {
            if (web != null || loading || exiting || !Visible) return;
            loading = true; int current = ++generation;
            var control = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor }; web = control; Controls.Add(control);
            try {
                var options = new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update --disable-features=msEdgeSidebarV2");
                bool existingProfile = Directory.Exists(Path.Combine(dataDirectory, "WebView"));
                environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDirectory, "WebView"), options);
                if (current != generation || web != control || control.IsDisposed) return;
                await control.EnsureCoreWebView2Async(environment);
                if (current != generation || web != control || control.IsDisposed) return;
                var core = control.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false; core.Settings.IsStatusBarEnabled = false; core.Settings.AreDevToolsEnabled = !String.IsNullOrEmpty(diagnostics); core.Settings.IsZoomControlEnabled = false;
                // Not .local: Chromium resolves .local names over the network first, which added ~2 s to every page load.
                core.SetVirtualHostNameToFolderMapping("memoir.example", Path.Combine(directory, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.SetVirtualHostNameToFolderMapping("memoir-icons.example", Path.Combine(dataDirectory, "icons"), CoreWebView2HostResourceAccessKind.DenyCors);
                await MovePreferences(control, existingProfile);
                if (current != generation || web != control || control.IsDisposed) return;
                core.WebMessageReceived += OnMessage;
                core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                    if (args.Uri.StartsWith("https://memoir.example/", StringComparison.Ordinal)) return;
                    args.Cancel = true; OpenLink(args.Uri);
                };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; OpenLink(args.Uri); };
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
                        if (theme == "light" || theme == "dark" || theme == "pink") seed += "localStorage.setItem('bst-theme', '" + theme + "');";
                        if (Json.Text(Json.Get(saved, "cursor")) == "off") seed += "localStorage.setItem('bst-cursor', 'off');";
                        if (seed.Length > 0) await core.AddScriptToExecuteOnDocumentCreatedAsync("try { if (location.host === 'memoir.example' && !localStorage.getItem('memoir-preferences-moved')) { " + seed + " localStorage.setItem('memoir-preferences-moved', '1'); } } catch {}");
                    }
                } catch (Exception error) { Log("Preferences: " + error.GetType().Name); }
                finally { if (!control.IsDisposed) { core.NavigationCompleted -= completed; core.ClearVirtualHostNameToFolderMapping("memoir.local"); control.Visible = true; } }
            }
            // An interrupted attempt (the window was minimized) runs again next time.
            if (!control.IsDisposed) try { File.WriteAllText(marker, ""); } catch { }
        }
        private void ReleaseWeb() {
            ++generation;
            var control = web; web = null;
            if (control != null) { Controls.Remove(control); control.Dispose(); }
            environment = null;
        }
        private void MinimizeToTray() { if (exiting) return; CloseTrayMenu(); Hide(); ReleaseWeb(); engine.Flush(Engine.Now); store.Save(); releaseTimer.Start(); WriteDiagnostics(); }
        public async void RestoreWindow() { if (exiting) return; CloseTrayMenu(); releaseTimer.Stop(); ApplySavedTheme(); Show(); WindowState = FormWindowState.Normal; Activate(); tracker.RefreshForeground(true); await LoadView(); }
        private void CloseTrayMenu() { if (trayMenu != null) closeTrayMenu.Set(); }
        private void ShowTrayMenu() {
            if (exiting) return;
            if (trayMenu != null) { CloseTrayMenu(); return; }
            releaseTimer.Stop(); engine.Stop(Engine.Now);
            var anchor = Control.MousePosition;
            string appearance = Convert.ToBase64String(Encoding.UTF8.GetBytes(Json.Encode(Appearance.Resolve(Json.Get(store.Data, "windowsAppearance")))));
            string arguments = "--tray-popup --parent=" + Process.GetCurrentProcess().Id + " --owner=" + Handle.ToInt64() + " --message=" + restoreMessage + " --anchor=" + anchor.X + "," + anchor.Y + " --appearance=" + appearance + (engine.Paused ? " --paused" : "") + (!String.IsNullOrEmpty(diagnostics) ? " --inspect-menu" : "");
            var menu = new Process { StartInfo = new ProcessStartInfo(Path.Combine(directory, "Memoir.exe"), arguments) { UseShellExecute = false, CreateNoWindow = true }, EnableRaisingEvents = true };
            closeTrayMenu.Reset(); trayMenu = menu;
            int popupPid = 0;
            menu.Exited += delegate { try { BeginInvoke(new Action(delegate {
                if (trayMenu != menu) return; trayMenu = null; tracker.IgnoreProcess(popupPid, false); menu.Dispose();
                if (!exiting) { tracker.RefreshForeground(true); if (!Visible) releaseTimer.Start(); WriteDiagnostics(); }
            })); } catch { menu.Dispose(); } };
            try { menu.Start(); popupPid = menu.Id; tracker.IgnoreProcess(popupPid, true); WriteDiagnostics(); }
            catch (Exception error) { trayMenu = null; menu.Dispose(); Log("Tray menu: " + error.GetType().Name); if (!Visible) releaseTimer.Start(); }
        }
        private void ApplySavedTheme() {
            var appearance = Appearance.Resolve(Json.Get(store.Data, "windowsAppearance"));
            ApplyTheme(Json.Text(Json.Get(appearance, "theme")), Json.Text(Json.Get(Json.Map(Json.Get(appearance, "palette")), "surface")));
        }
        private void ChangeView(string page) {
            if (page != "popup.html" && page != "recap.html") return;
            view = page; ReleaseWeb(); MinimumSize = page == "popup.html" ? new Size(380, 640) : new Size(680, 520); ClientSize = page == "popup.html" ? new Size(380, 600) : new Size(1360, 850); RestoreWindow();
        }
        private static void OpenLink(string address) {
            Uri uri; if (!Uri.TryCreate(address, UriKind.Absolute, out uri) || (uri.Scheme != "https" && uri.Scheme != "http") || uri.Host == "memoir.example") return;
            try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); } catch { }
        }
        private void Post(object payload) { if (web == null || web.IsDisposed || web.CoreWebView2 == null) return; try { web.CoreWebView2.PostWebMessageAsJson(Json.Encode(payload)); } catch { } }
        private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
            Uri origin; if (!Uri.TryCreate(args.Source, UriKind.Absolute, out origin) || origin.Scheme != "https" || origin.Host != "memoir.example") return;
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
                    case "window.report": Post(Json.Object("id", id, "result", Json.Object("ok", true))); ChangeView("recap.html"); return;
                    case "window.today": Post(Json.Object("id", id, "result", true)); ChangeView("popup.html"); return;
                    case "window.minimize": Post(Json.Object("id", id, "result", true)); MinimizeToTray(); return;
                    case "privacy.titles": engine.Flush(Engine.Now); engine.EraseTitles(); store.Save(); break;
                    case "link.open": OpenLink(Json.Text(Json.Get(data, "url"))); break;
                    case "clipboard.read": result = Clipboard.ContainsText() ? Clipboard.GetText() : ""; break;
                    case "clipboard.write": string text = Json.Text(Json.Get(data, "text")); if (text.Length == 0) Clipboard.Clear(); else Clipboard.SetText(text); break;
                    case "theme":
                        store.Set(Json.Object("windowsAppearance", data)); store.Save(); ApplySavedTheme(); break;
                    case "status": result = Json.Object("browser", tracker.BrowserStatus, "paused", engine.Paused, "uiLoaded", web != null, "dataDirectory", dataDirectory); break;
                    case "folder.open": Process.Start(new ProcessStartInfo(dataDirectory) { UseShellExecute = true }); break;
                    case "log": Log(Json.Text(Json.Get(data, "message"))); break;
                    default: throw new InvalidOperationException("Unknown desktop request.");
                }
                Post(Json.Object("id", id, "result", result));
            } catch (Exception error) { Log(operation + ": " + error.GetType().Name); Post(Json.Object("id", id, "error", "The desktop action could not be completed: " + error.Message)); }
        }
        private void ApplyTheme(string theme, string surface) {
            try { Color color = ColorTranslator.FromHtml(surface); BackColor = color; if (web != null) web.DefaultBackgroundColor = color; int dark = theme == "dark" || color.GetBrightness() < .45 ? 1 : 0; DwmSetWindowAttribute(Handle, 20, ref dark, 4); int caption = color.R | (color.G << 8) | (color.B << 16); DwmSetWindowAttribute(Handle, 35, ref caption, 4); } catch { }
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
        protected override void WndProc(ref Message message) {
            if (message.Msg == restoreMessage && restoreMessage != 0) {
                int command = message.WParam.ToInt32();
                BeginInvoke(new Action(delegate {
                    if (command == 2) { exiting = true; Close(); }
                    else if (command == 1) MinimizeToTray();
                    else if (command == 3) ShowTrayMenu();
                    else if (command == 4) ChangeView("recap.html");
                    else if (command == 5) ChangeView("popup.html");
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
