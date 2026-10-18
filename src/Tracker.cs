using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Memoir {
    internal sealed class Tracker : IDisposable {
        private readonly Control owner;
        private readonly Store store;
        private readonly Engine engine;
        private readonly string iconDirectory;
        private readonly BrowserProbe browser = new BrowserProbe();
        private readonly BrowserLink link;
        private readonly Native.WinEventDelegate callback;
        private readonly Timer timer;
        private readonly Dictionary<int, Target> apps = new Dictionary<int, Target>();
        private readonly Dictionary<int, string> executables = new Dictionary<int, string>();
        private readonly HashSet<int> ignoredProcesses = new HashSet<int>();
        private IntPtr foreground, foregroundHook, titleHook;
        private Target app, target;
        private bool locked, busy, disposed;
        private long lastBrowserPoll, lastAudioPoll, audibleUntil;
        public string BrowserStatus { get; private set; }
        public Tracker(Control owner, Store store, Engine engine, string dataDirectory) {
            this.owner = owner; this.store = store; this.engine = engine; iconDirectory = Path.Combine(dataDirectory, "icons"); Directory.CreateDirectory(iconDirectory);
            link = new BrowserLink(dataDirectory);
            link.Changed += delegate { try { owner.BeginInvoke(new Action(delegate { if (!disposed && app != null && BrowserProbe.IsBrowser(app.Domain.Substring(4))) PollBrowser(true); })); } catch { } };
            BrowserStatus = "Website detection is ready";
            callback = delegate(IntPtr hook, uint eventId, IntPtr hwnd, int objectId, int childId, uint threadId, uint time) {
                if (disposed || hwnd == IntPtr.Zero) return;
                if (eventId == 3 || (eventId == 0x800C && objectId == 0 && hwnd == Native.GetForegroundWindow())) {
                    try { owner.BeginInvoke(new Action(delegate { if (!disposed) { RefreshForeground(); if (app != null && BrowserProbe.IsBrowser(app.Domain.Substring(4))) PollBrowser(true); else if (target != null && Json.Bool(Json.Get(engine.Settings, "titles"))) { target.Title = Native.Title(foreground); engine.Observe(target, Engine.Now, Native.IdleMilliseconds()); } } })); } catch { }
                }
            };
            foregroundHook = Native.SetWinEventHook(3, 3, IntPtr.Zero, callback, 0, 0, 2);
            titleHook = Native.SetWinEventHook(0x800C, 0x800C, IntPtr.Zero, callback, 0, 0, 2);
            browser.UrlChanged += delegate(IntPtr hwnd, string url) { try { owner.BeginInvoke(new Action(delegate { ApplyBrowser(hwnd, url); })); } catch { } };
            timer = new Timer { Interval = 1000 };
            timer.Tick += delegate {
                try {
                    RefreshForeground();
                    long idle = Native.IdleMilliseconds(), now = Engine.Now;
                    if (app != null && BrowserProbe.IsBrowser(app.Domain.Substring(4)) && !locked && !engine.Paused) PollBrowser(false);
                    var exact = app == null ? null : link.Current(app.Domain.Substring(4));
                    if (!locked && !engine.Paused && target != null && exact == null && idle >= Engine.IdleLimit - 2000 && now - lastAudioPoll >= 2000) {
                        lastAudioPoll = now;
                        if (AudioProbe.Audible(target.ProcessId, app.Domain.Substring(4))) audibleUntil = now + 5000;
                        target.Audible = now < audibleUntil;
                    }
                    if (target != null) target.Audible = exact != null ? Json.Bool(Json.Get(exact, "audible")) && !Json.Bool(Json.Get(exact, "muted")) : now < audibleUntil;
                    engine.Observe(locked ? null : target, now, idle);
                    engine.Pulse(now);
                } catch (Exception error) { Log(error); }
            };
            RefreshForeground(); timer.Start();
        }
        public void SetLocked(bool value) { locked = value; if (value) engine.Suspend(Engine.Now); else { engine.Resume(); RefreshForeground(true); } }
        public void Resume() { locked = false; engine.Resume(); RefreshForeground(true); }
        public void RefreshForeground(bool force = false) {
            IntPtr next = Native.GetForegroundWindow();
            if (!force && next == foreground) return;
            engine.Stop(Engine.Now); foreground = next; target = app = null; audibleUntil = 0; lastBrowserPoll = 0;
            if (next == IntPtr.Zero || Native.IsIconic(next) || locked) return;
            string classname = Native.ClassName(next);
            if (classname == "Progman" || classname == "WorkerW" || classname == "Shell_TrayWnd" || classname == "Shell_SecondaryTrayWnd") return;
            uint pid; Native.GetWindowThreadProcessId(next, out pid);
            try { if (Native.ProcessName((int)pid).Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) {
                uint framePid = pid, contentPid = 0;
                Native.EnumChildWindows(next, delegate(IntPtr child, IntPtr unused) { uint childPid; Native.GetWindowThreadProcessId(child, out childPid); if (childPid != framePid && childPid != 0) contentPid = childPid; return true; }, IntPtr.Zero);
                if (contentPid != 0) pid = contentPid;
            } } catch { }
            if (pid == Process.GetCurrentProcess().Id || pid == 0 || ignoredProcesses.Contains((int)pid)) return;
            app = Describe((int)pid);
            if (app == null) return;
            target = app.Copy(); target.Title = Json.Bool(Json.Get(engine.Settings, "titles")) ? Native.Title(next) : null;
            Remember(app);
            engine.Observe(target, Engine.Now, Native.IdleMilliseconds());
            if (BrowserProbe.IsBrowser(app.Domain.Substring(4)) && !engine.Paused) PollBrowser(true);
        }
        public void SettingsChanged() { engine.SettingsChanged(Engine.Now); RefreshForeground(true); }
        public void IgnoreProcess(int pid, bool ignore) { if (ignore) ignoredProcesses.Add(pid); else ignoredProcesses.Remove(pid); RefreshForeground(true); }
        private void PollBrowser(bool force) {
            var exact = app == null ? null : link.Current(app.Domain.Substring(4));
            if (exact != null) { ApplyBrowser(foreground, Json.Text(Json.Get(exact, "url")), exact); return; }
            if (busy || disposed || foreground == IntPtr.Zero) return;
            long now = Engine.Now;
            if (!force && now - lastBrowserPoll < 5000) return;
            lastBrowserPoll = now; busy = true; IntPtr hwnd = foreground;
            // UIA providers can stall. At most one read runs, always off the UI thread.
            Task.Run(delegate {
                string url = browser.Read(hwnd);
                try { owner.BeginInvoke(new Action(delegate { busy = false; ApplyBrowser(hwnd, url); })); } catch { busy = false; }
            });
        }
        private void ApplyBrowser(IntPtr hwnd, string url, Dictionary<string, object> exact = null) {
            if (disposed || locked || foreground != hwnd || Native.GetForegroundWindow() != hwnd || app == null || !BrowserProbe.IsBrowser(app.Domain.Substring(4))) return;
            if (exact == null) { exact = link.Current(app.Domain.Substring(4)); if (exact != null) url = Json.Text(Json.Get(exact, "url")); }
            string domain = BrowserProbe.Domain(url);
            target = app.Copy();
            if (exact != null && Json.Bool(Json.Get(exact, "incognito"))) { domain = "~private"; target.Origin = null; }
            if (domain != null) { target.Domain = domain; target.Origin = BrowserProbe.Origin(url); target.Name = domain; BrowserStatus = "Website detection is active"; }
            else BrowserStatus = "This browser window is recorded as app time until its address is available";
            target.Title = Json.Bool(Json.Get(engine.Settings, "titles")) ? Regex.Replace(Native.Title(hwnd), @"\s[-—]\s(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera|Vivaldi)$", "") : null;
            if (exact != null) { target.Title = Json.Text(Json.Get(exact, "title")); target.Audible = Json.Bool(Json.Get(exact, "audible")) && !Json.Bool(Json.Get(exact, "muted")); BrowserStatus = "Browser connector is active"; }
            else target.Audible = Engine.Now < audibleUntil;
            engine.Observe(target, Engine.Now, Native.IdleMilliseconds());
        }
        private Target Describe(int pid) {
            try {
                string processName = Native.ProcessName(pid), file = processName.ToLowerInvariant() + ".exe", path = null, name = processName;
                Target cached; if (apps.TryGetValue(pid, out cached) && cached.Domain == "app:" + file) return cached.Copy();
                using (var process = Process.GetProcessById(pid)) {
                    try { path = process.MainModule.FileName; var info = FileVersionInfo.GetVersionInfo(path); if (!String.IsNullOrWhiteSpace(info.FileDescription)) name = info.FileDescription; } catch { }
                    if (file == "applicationframehost.exe") name = Native.Title(foreground);
                    var result = new Target { Domain = "app:" + file, Name = name, Category = Category(file), ProcessId = pid };
                    if (apps.Count >= 128) { apps.Clear(); executables.Clear(); }
                    apps[pid] = result.Copy(); if (path != null) executables[pid] = path;
                    return result;
                }
            } catch { return null; }
        }
        private void Remember(Target value) {
            if (engine.Paused || Engine.Excluded(value.Domain, Json.Get(engine.Settings, "excluded"))) return;
            var all = Json.Clone(Json.Map(Json.Get(store.Data, "apps")));
            if (all.ContainsKey(value.Domain)) return;
            string file = IconName(value.Domain); string executable;
            if (!File.Exists(Path.Combine(iconDirectory, file)) && executables.TryGetValue(value.ProcessId, out executable)) {
                try { using (Icon icon = Icon.ExtractAssociatedIcon(executable)) if (icon != null) using (Bitmap image = icon.ToBitmap()) image.Save(Path.Combine(iconDirectory, file), System.Drawing.Imaging.ImageFormat.Png); } catch { }
            }
            all[value.Domain] = Json.Object("name", value.Name, "category", value.Category, "icon", File.Exists(Path.Combine(iconDirectory, file)) ? file : null);
            store.Set(Json.Object("apps", all));
        }
        public static string IconName(string domain) { return Identity.IconName(domain); }
        public static string Category(string file) {
            if (Regex.IsMatch(file, @"(discord|telegram|whatsapp|slack|teams|messenger)")) return "social";
            if (Regex.IsMatch(file, @"(spotify|vlc|mpv|music|netflix|potplayer|media|wmplayer)")) return "video";
            if (Regex.IsMatch(file, @"(steam|epicgames|roblox|minecraft|valorant|game|gog|battle)")) return "games";
            if (Regex.IsMatch(file, @"(code|devenv|notepad|word|excel|powerpnt|onenote|outlook|photoshop|figma|blender|obs|terminal|powershell|cmd|explorer|notion|acrobat|sumatra)")) return "work";
            return "other";
        }
        private void Log(Exception error) { try { File.AppendAllText(Path.Combine(Path.GetDirectoryName(store.FilePath), "errors.log"), DateTime.UtcNow.ToString("o") + " " + error.GetType().Name + ": " + error.Message + Environment.NewLine); } catch { } }
        public void Dispose() { disposed = true; timer.Stop(); timer.Dispose(); link.Dispose(); Native.UnhookWinEvent(foregroundHook); Native.UnhookWinEvent(titleHook); Task.Run(delegate { browser.Dispose(); }); engine.Stop(Engine.Now); store.Save(); }
    }
}
