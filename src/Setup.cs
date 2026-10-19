using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace Memoir {
    // Installing and uninstalling, for this Windows account only (no administrator).
    //
    // Memoir Setup.exe unpacks Memoir into a temporary folder and runs Memoir.exe --install from there: a small window
    // (setup.html) comes in while Memoir is copied to %LOCALAPPDATA%\Programs\Memoir and written into Windows' list of
    // installed apps, then Memoir opens in its place. A Memoir already there is closed and updated, its history kept;
    // a Memoir first run from a folder of its own (the one that last linked with the browser) is closed and its history
    // copied over, so nothing is lost. Its Start menu shortcut and Start with Windows follow on its first start.
    //
    // Uninstalling, from Windows' Settings (Apps) or Control Panel: Memoir.exe --uninstall copies itself to a temporary
    // folder and runs from there, so every file of it can go; it asks once, keeps the history only if asked to, and
    // takes away everything it put on this computer: its files, its Start menu shortcut, Start with Windows, its link
    // with the browsers and its entry in the list. Only a Memoir that was installed (install.json beside it) can be.
    //
    // Tests point every place at their own: MEMOIR_TEST_INSTALL_DIR, MEMOIR_TEST_UNINSTALL_KEY (a key under HKCU),
    // MEMOIR_TEST_NATIVE_HOST, MEMOIR_TEST_START_MENU and MEMOIR_TEST_STARTUP_KEY.
    internal static class Setup {
        private const string Record = "install.json";
        private static string Env(string name) { string value = Environment.GetEnvironmentVariable(name); return String.IsNullOrEmpty(value) ? null : value; }
        public static string InstallDirectory { get { return Env("MEMOIR_TEST_INSTALL_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Memoir"); } }
        private static string UninstallKey { get { return Env("MEMOIR_TEST_UNINSTALL_KEY") ?? @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Memoir"; } }
        public static string Version { get { var v = typeof(Setup).Assembly.GetName().Version; return v.Major + "." + v.Minor + "." + v.Build; } }

        // --install, --uninstall [--quiet], --uninstall-from=<folder>: handled here (true), or a normal start (false)
        private static int waiting;   // the Memoir that started a quiet uninstall, waiting for it to finish
        public static bool Command(string[] args) {
            bool quiet = args.Contains("--quiet");
            int.TryParse(args.Where(a => a.StartsWith("--waiting=")).Select(a => a.Substring(10)).FirstOrDefault(), out waiting);
            string from = args.Where(a => a.StartsWith("--uninstall-from=")).Select(a => a.Substring(17)).FirstOrDefault();
            if (args.Contains("--install")) { Prepare(); Install(AppDomain.CurrentDomain.BaseDirectory); return true; }
            if (from != null) { Prepare(); Uninstall(Path.GetFullPath(from), quiet); return true; }
            if (args.Contains("--uninstall")) { Prepare(); Relaunch(AppDomain.CurrentDomain.BaseDirectory, quiet); return true; }
            return false;
        }
        private static void Prepare() { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); }
        private static string Full(string path) { return Path.GetFullPath(path).TrimEnd('\\'); }
        private static bool Same(string a, string b) { return String.Equals(Full(a), Full(b), StringComparison.OrdinalIgnoreCase); }

        // ---------- installing ----------
        private static void Install(string source) {
            string target = InstallDirectory, profile = Scratch();
            bool update = File.Exists(Path.Combine(target, "Memoir.exe"));
            var look = Look(update ? Path.Combine(target, "Data") : null);
            var window = new SetupWindow(Path.Combine(source, "web"), profile, update ? "update" : "install", look, 360, 380, "Memoir Setup");
            Process opened = null; var waitForWindow = new System.Windows.Forms.Timer { Interval = 50 }; var since = DateTime.UtcNow;
            window.Message += delegate(string op, Dictionary<string, object> data) {
                if (op == "start") {
                    window.Busy = true;
                    Task.Run(delegate {
                        Dictionary<string, object> result;
                        try { bool migrated = Put(source, target); result = Json.Object("op", "done", "ok", true, "migrated", migrated); }
                        catch (Exception error) { result = Json.Object("op", "done", "ok", false, "error", error.Message); }
                        window.Busy = false;
                        window.Post(result);
                    });
                } else if (op == "launch") {
                    // Memoir opens in this window's place: this one goes once Memoir's own is up
                    try { opened = Process.Start(new ProcessStartInfo(Path.Combine(target, "Memoir.exe")) { WorkingDirectory = target, UseShellExecute = false }); Native.AllowSetForegroundWindow(opened.Id); } catch { window.Close(); return; }
                    since = DateTime.UtcNow;
                    waitForWindow.Tick += delegate {
                        bool up = false;
                        try { opened.Refresh(); up = opened.HasExited || (opened.MainWindowHandle != IntPtr.Zero && IsWindowVisible(opened.MainWindowHandle)); } catch { up = true; }
                        if (up || DateTime.UtcNow - since > TimeSpan.FromSeconds(12)) { waitForWindow.Stop(); window.Close(); }
                    };
                    waitForWindow.Start();
                }
            };
            Run(window);
            waitForWindow.Dispose();
            DeleteLater(profile);
        }

        // Memoir's files into its folder (closing the one there first), and Memoir into the list of installed apps.
        // Returns whether another Memoir's history was brought along.
        private static bool Put(string source, string target) {
            Directory.CreateDirectory(target);
            Stop(target);
            bool migrated = BringHistory(target);
            var previous = Recorded(target);
            if (Same(source, target)) { List(target, previous); return migrated; }
            var files = new List<string>();
            foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories)) {
                string relative = file.Substring(source.TrimEnd('\\').Length + 1);
                string to = Path.Combine(target, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(to));
                Replace(file, to);
                files.Add(relative);
            }
            // files an older Memoir had that this one doesn't
            foreach (string old in previous.Except(files, StringComparer.OrdinalIgnoreCase)) TryDelete(Path.Combine(target, old));
            RemoveEmpty(Path.Combine(target, "web"));
            File.WriteAllText(Path.Combine(target, Record), Json.Encode(Json.Object("version", Version, "files", files.ToArray())), new UTF8Encoding(false));
            List(target, files);
            return migrated;
        }
        // A file still held by Windows (a Memoir that hasn't let go yet) can be renamed out of the way, and goes later
        private static void Replace(string from, string to) {
            for (int attempt = 0; ; attempt++) {
                try { File.Copy(from, to, true); return; }
                catch (IOException) {
                    if (attempt >= 1) throw;
                    string aside = to + ".old"; TryDelete(aside);
                    try { File.Move(to, aside); } catch { Thread.Sleep(400); }
                }
                catch (UnauthorizedAccessException) { if (attempt >= 1) throw; File.SetAttributes(to, FileAttributes.Normal); }
            }
        }
        // Windows' list of installed apps (Settings → Apps, Control Panel), for this account
        private static void List(string target, List<string> files) {
            long bytes = files.Sum(f => { try { return new FileInfo(Path.Combine(target, f)).Length; } catch { return 0L; } });
            string exe = Path.Combine(target, "Memoir.exe");
            using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey)) {
                key.SetValue("DisplayName", "Memoir");
                key.SetValue("DisplayVersion", Version);
                key.SetValue("Publisher", "Mina Vian");
                key.SetValue("DisplayIcon", exe + ",0");
                key.SetValue("InstallLocation", target);
                key.SetValue("UninstallString", "\"" + exe + "\" --uninstall");
                key.SetValue("QuietUninstallString", "\"" + exe + "\" --uninstall --quiet");
                key.SetValue("Comments", "Your screen time, kept on your computer");
                key.SetValue("URLInfoAbout", "https://memoir.minavian.com");
                key.SetValue("HelpLink", "mailto:iamminavian@gmail.com");
                key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                key.SetValue("EstimatedSize", (int)Math.Max(1, bytes / 1024), RegistryValueKind.DWord);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
        // A Memoir run from a folder of its own before (the one the browsers link with): its history comes along, once,
        // to a Memoir installed with none. That Memoir is closed first, so its last minutes are in it; its own folder
        // is left as it was.
        private static bool BringHistory(string target) {
            string data = Path.Combine(target, "Data");
            if (File.Exists(Path.Combine(data, "history.json"))) return false;
            string other = Registration.DataDirectory();
            if (other == null || Same(other, data) || !File.Exists(Path.Combine(other, "history.json"))) return false;
            Quit(other);
            Directory.CreateDirectory(data);
            foreach (string name in new[] { "history.json", "history.json.backup" }) if (File.Exists(Path.Combine(other, name))) File.Copy(Path.Combine(other, name), Path.Combine(data, name), true);
            string icons = Path.Combine(other, "icons");
            if (Directory.Exists(icons)) { Directory.CreateDirectory(Path.Combine(data, "icons")); foreach (string icon in Directory.GetFiles(icons)) try { File.Copy(icon, Path.Combine(data, "icons", Path.GetFileName(icon)), true); } catch { } }
            return true;
        }

        // ---------- uninstalling ----------
        // From the installed folder: a copy of Memoir in a temporary folder does it, so all of this one can go
        private static void Relaunch(string directory, bool quiet) {
            if (!File.Exists(Path.Combine(directory, Record))) {
                if (!quiet) MessageBox.Show("This copy of Memoir wasn't installed, so there's nothing to uninstall. To remove it, quit it from the clock in the notification area and delete its folder.", "Memoir", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            string root = Scratch(), app = Path.Combine(root, "app");
            foreach (string relative in Recorded(directory).Where(f => !f.StartsWith("Data\\", StringComparison.OrdinalIgnoreCase))) {
                string from = Path.Combine(directory, relative); if (!File.Exists(from)) continue;
                string to = Path.Combine(app, relative); Directory.CreateDirectory(Path.GetDirectoryName(to)); File.Copy(from, to, true);
            }
            var start = new ProcessStartInfo(Path.Combine(app, "Memoir.exe"), "\"--uninstall-from=" + directory.TrimEnd('\\') + "\"" + (quiet ? " --quiet --waiting=" + Process.GetCurrentProcess().Id : "")) { WorkingDirectory = root, UseShellExecute = false };
            var process = Process.Start(start);
            Native.AllowSetForegroundWindow(process.Id);
            if (quiet) process.WaitForExit();   // tools that uninstall quietly wait for it to be done
        }

        private static void Uninstall(string directory, bool quiet) {
            string root = Path.GetDirectoryName(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'));
            bool temporary = root != null && Path.GetFileName(root).StartsWith("Memoir ", StringComparison.Ordinal) && Same(Path.GetDirectoryName(root), Path.GetTempPath());
            try {
                if (quiet) { Remove(directory, true); return; }
                var look = Look(Path.Combine(directory, "Data"));
                string profile = Path.Combine(temporary ? root : Scratch(), "WebView");
                var window = new SetupWindow(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web"), profile, "uninstall", look, 400, 500, "Uninstall Memoir");
                window.Message += delegate(string op, Dictionary<string, object> data) {
                    if (op != "uninstall") return;
                    bool keep = Json.Bool(Json.Get(data, "keep"));
                    window.Busy = true;
                    Task.Run(delegate {
                        Dictionary<string, object> result;
                        try { Remove(directory, keep); result = Json.Object("op", "done", "ok", true, "kept", keep); }
                        catch (Exception error) { result = Json.Object("op", "done", "ok", false, "error", error.Message); }
                        window.Post(result);
                        window.Busy = false;
                    });
                };
                Run(window);
                if (!temporary) DeleteLater(Path.GetDirectoryName(profile));
            } finally { if (temporary) DeleteLater(root); }
        }

        // Everything Memoir put on this computer, from the Memoir in this folder: closed, then its files (and its history
        // unless kept), its Start menu shortcut, Start with Windows, its link with the browsers, its entry in the list
        private static void Remove(string directory, bool keepHistory) {
            Stop(directory);
            Startup.Remove(directory);
            StartMenu.Remove(directory);
            Registration.Remove(directory);
            // a file still in use (the Memoir that started a quiet uninstall waits for it to finish) moves out of the
            // folder, and goes as soon as it's free
            string trash = null;
            foreach (string relative in Recorded(directory)) {
                string file = Path.Combine(directory, relative);
                TryDelete(file); TryDelete(file + ".old");
                if (File.Exists(file)) { if (trash == null) trash = Scratch(); try { File.Move(file, Path.Combine(trash, Guid.NewGuid().ToString("N"))); } catch { } }
            }
            if (Directory.Exists(directory)) foreach (string aside in Directory.GetFiles(directory, "*.old", SearchOption.AllDirectories)) TryDelete(aside);
            string data = Path.Combine(directory, "Data");
            if (!keepHistory && Directory.Exists(data)) DeleteFolder(data);
            TryDelete(Path.Combine(directory, Record));
            RemoveEmpty(directory);
            if (trash != null) DeleteLater(trash);
            using (var list = Registry.CurrentUser.OpenSubKey(Path.GetDirectoryName(UninstallKey), true)) {
                if (list != null) {
                    using (var key = list.OpenSubKey(Path.GetFileName(UninstallKey))) {
                        string location = key == null ? null : key.GetValue("InstallLocation") as string;
                        if (key != null && (location == null || Same(location, directory))) { key.Close(); list.DeleteSubKeyTree(Path.GetFileName(UninstallKey), false); }
                    }
                }
            }
        }

        // ---------- closing a Memoir ----------
        // The Memoir using this folder's Data is asked to quit (it saves first), then anything still running from the
        // folder (the browsers' link, a menu) is ended
        private static void Stop(string directory) {
            Quit(Path.Combine(directory, "Data"));
            foreach (var process in Running(Path.Combine(directory, "Memoir.exe"))) try { process.Kill(); process.WaitForExit(3000); } catch { }
        }
        // asks the Memoir using this data folder to quit, and waits for it (up to 10 s)
        private static void Quit(string data) {
            string name = "Local\\Memoir-" + Tracker.IconName(Full(data).ToLowerInvariant()).Replace(".png", "");
            Mutex open;
            if (!Mutex.TryOpenExisting(name, out open)) return;
            open.Dispose();
            Native.PostMessage(new IntPtr(0xffff), Native.RegisterWindowMessage(name), new IntPtr(2), IntPtr.Zero);
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (DateTime.UtcNow < deadline) { Thread.Sleep(100); if (!Mutex.TryOpenExisting(name, out open)) return; open.Dispose(); }
        }
        private static List<Process> Running(string exe) {
            var found = new List<Process>();
            int me = Process.GetCurrentProcess().Id;
            foreach (var process in Process.GetProcessesByName("Memoir")) {
                if (process.Id == me || process.Id == waiting) continue;
                string path = Native.ImagePath(process.Id);
                if (path != null && String.Equals(path, exe, StringComparison.OrdinalIgnoreCase)) found.Add(process);
            }
            return found;
        }

        // ---------- small things ----------
        // the files an install put in this folder (install.json)
        private static List<string> Recorded(string directory) {
            try { return Json.Array(Json.Get(Json.Map(Json.Decode(File.ReadAllText(Path.Combine(directory, Record), Encoding.UTF8))), "files")).Select(f => Json.Text(f)).Where(f => f.Length > 0 && !f.Contains("..") && !Path.IsPathRooted(f)).ToList(); }
            catch { return new List<string>(); }
        }
        // the window's look: the Memoir being removed or updated keeps its own (theme, Rainbow clock, cursor); a new one
        // follows Windows
        private static Dictionary<string, object> Look(string data) {
            Dictionary<string, object> history = null;
            try { if (data != null && File.Exists(Path.Combine(data, "history.json"))) history = Json.Map(Json.Decode(File.ReadAllText(Path.Combine(data, "history.json"), Encoding.UTF8))); } catch { }
            var appearance = Appearance.Resolve(history == null ? null : Json.Get(history, "windowsAppearance"));
            var settings = history == null ? new Dictionary<string, object>() : Json.Map(Json.Get(history, "settings"));
            return Json.Object("theme", Json.Text(Json.Get(appearance, "theme")), "rainbow", Json.Bool(Json.Get(settings, "rainbow")), "cursor", !(Json.Get(settings, "cursor") is bool) || Json.Bool(Json.Get(settings, "cursor")));
        }
        private static string Scratch() { string path = Path.Combine(Path.GetTempPath(), "Memoir " + Guid.NewGuid().ToString("N").Substring(0, 8)); Directory.CreateDirectory(path); return path; }
        private static void TryDelete(string path) { try { if (File.Exists(path)) { File.SetAttributes(path, FileAttributes.Normal); File.Delete(path); } } catch { } }
        // a folder whose files a closing WebView may hold for a moment longer
        private static void DeleteFolder(string path) {
            for (int attempt = 0; ; attempt++) {
                try { if (Directory.Exists(path)) Directory.Delete(path, true); return; }
                catch (Exception) { if (attempt >= 50) throw; Thread.Sleep(200); }
            }
        }
        private static void RemoveEmpty(string path) {
            if (!Directory.Exists(path)) return;
            foreach (string folder in Directory.GetDirectories(path)) RemoveEmpty(folder);
            try { if (!Directory.EnumerateFileSystemEntries(path).Any()) Directory.Delete(path); } catch { }
        }
        // a temporary folder still in use by this process (or its web view) goes a moment after it has ended
        public static void DeleteLater(string folder) {
            if (String.IsNullOrEmpty(folder)) return;
            try {
                string command = "/d /c for /l %i in (1,1,15) do (ping -n 2 127.0.0.1 >nul & rd /s /q \"" + folder + "\" 2>nul & if not exist \"" + folder + "\" exit /b 0)";
                Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), command) { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = Path.GetTempPath() });
            } catch { }
        }
        private static void Run(SetupWindow window) {
            var context = new ApplicationContext();
            window.FormClosed += delegate { context.ExitThread(); };
            window.Begin();
            Application.Run(context);
        }
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    }

    // The installer's and uninstaller's window: setup.html in a small window with Windows' frame (its shadow, rounded
    // corners and opening animation) but no title bar, shown once the page has painted
    internal sealed class SetupWindow : Form {
        public event Action<string, Dictionary<string, object>> Message;
        public bool Busy;   // while files move, it can't be closed
        private readonly string web, profile, query;
        private readonly WebView2 view;
        private readonly Color background;
        private readonly bool dark;

        public SetupWindow(string web, string profile, string mode, Dictionary<string, object> look, int width, int height, string title) {
            this.web = web; this.profile = profile;
            dark = Json.Text(Json.Get(look, "theme")) == "dark";
            background = dark ? Color.Black : Color.FromArgb(245, 245, 247);
            query = "mode=" + mode + "&theme=" + (dark ? "dark" : "light") + "&rainbow=" + (Json.Bool(Json.Get(look, "rainbow")) ? "1" : "0") + "&cursor=" + (Json.Bool(Json.Get(look, "cursor"), true) ? "1" : "0");
            float scale; using (var screen = Graphics.FromHwnd(IntPtr.Zero)) scale = screen.DpiX / 96f;
            Text = title; BackColor = background; AutoScaleMode = AutoScaleMode.None;
            FormBorderStyle = FormBorderStyle.Sizable; MaximizeBox = false; MinimizeBox = true; ShowInTaskbar = true;
            StartPosition = FormStartPosition.Manual;
            var area = Screen.FromPoint(Cursor.Position).WorkingArea;
            var size = new Size((int)Math.Round(width * scale), (int)Math.Round(height * scale));
            Bounds = new Rectangle(area.Left + (area.Width - size.Width) / 2, area.Top + (area.Height - size.Height) / 2, size.Width, size.Height);
            try { string icon = Path.Combine(Path.GetDirectoryName(web.TrimEnd('\\')), "Memoir.ico"); if (File.Exists(icon)) Icon = new Icon(icon); } catch { }
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = background, BackColor = background };
            Controls.Add(view);
            FormClosing += delegate(object sender, FormClosingEventArgs args) { if (Busy && args.CloseReason == CloseReason.UserClosing) args.Cancel = true; };
        }

        // the page loads with the window hidden; it shows when the page says it has painted
        public async void Begin() {
            IntPtr handles = Handle; handles = view.Handle;
            try {
                var environment = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update --disable-features=msEdgeSidebarV2"));
                await view.EnsureCoreWebView2Async(environment);
            } catch (Exception error) {
                var answer = MessageBox.Show("Memoir needs Microsoft Edge WebView2 Runtime, which comes with Windows but isn't on this computer.\n\nOpen Microsoft's page to get it?\n\n(" + error.Message + ")", "Memoir", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                if (answer == DialogResult.Yes) Open("https://developer.microsoft.com/microsoft-edge/webview2/");
                Busy = false; Close(); return;
            }
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false; core.Settings.IsStatusBarEnabled = false; core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDevToolsEnabled = false; core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.SetVirtualHostNameToFolderMapping("memoir.example", web, CoreWebView2HostResourceAccessKind.DenyCors);
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
            core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                if (args.Uri.StartsWith("https://memoir.example/", StringComparison.Ordinal)) return;
                args.Cancel = true; Open(args.Uri);
            };
            core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; Open(args.Uri); };
            core.WebMessageReceived += delegate(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
                Dictionary<string, object> data; try { data = Json.Map(Json.Decode(args.WebMessageAsJson)); } catch { return; }
                string op = Json.Text(Json.Get(data, "op"));
                if (op == "ready") Reveal();
                else if (op == "drag") { ReleaseCapture(); SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero); }
                else if (op == "copy") { try { Clipboard.SetText(Json.Text(Json.Get(data, "text"))); } catch { } }
                else if (op == "close") { Busy = false; Close(); }
                else if (Message != null) Message(op, data);
            };
            // a page that never says it's ready is shown anyway
            core.NavigationCompleted += delegate {
                var late = new System.Windows.Forms.Timer { Interval = 3000 };
                late.Tick += delegate { late.Dispose(); if (!IsDisposed) Reveal(); };
                late.Start();
            };
            core.Navigate("https://memoir.example/setup.html?" + query);
        }
        private void Reveal() {
            if (Visible) return;
            Show(); Activate(); Native.ToFront(Handle);
            // the page starts its entrance as the window finishes opening
            var timer = new System.Windows.Forms.Timer { Interval = 90 };
            timer.Tick += delegate { timer.Dispose(); Post(Json.Object("op", "shown")); };
            timer.Start();
        }
        public void Post(Dictionary<string, object> message) {
            if (IsDisposed) return;
            if (InvokeRequired) { try { BeginInvoke(new Action(delegate { Post(message); })); } catch { } return; }
            try { if (view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(Json.Encode(message)); } catch { }
        }
        private static void Open(string uri) {
            if (!(uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || uri.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))) return;
            try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); } catch { }
        }

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            try {
                int on = dark ? 1 : 0; DwmSetWindowAttribute(Handle, 20, ref on, 4);
                int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4);
                Color edge = dark ? Color.FromArgb(48, 48, 52) : Color.FromArgb(222, 222, 226);
                int border = edge.R | (edge.G << 8) | (edge.B << 16); DwmSetWindowAttribute(Handle, 34, ref border, 4);
                int caption = background.R | (background.G << 8) | (background.B << 16); DwmSetWindowAttribute(Handle, 35, ref caption, 4);
            } catch { }
            TitleBar.Refresh(Handle);
        }
        protected override void WndProc(ref Message message) {
            // no title bar: the page goes right to the top (TitleBar.cs)
            if (message.Msg == TitleBar.CalcSize && message.WParam != IntPtr.Zero) { int top = TitleBar.ProposedTop(message.LParam); base.WndProc(ref message); TitleBar.GiveCaption(Handle, message.LParam, top); message.Result = IntPtr.Zero; return; }
            base.WndProc(ref message);
            // the edges don't resize it
            if (message.Msg == 0x0084) { int hit = message.Result.ToInt32(); if (hit >= 10 && hit <= 17) message.Result = new IntPtr(18); }
        }
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
    }
}
