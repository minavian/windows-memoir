using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace Memoir {
    // Never track's apps (Settings, web/app-picker.js): the apps on this computer to choose from, and any program chosen
    // with "Choose an app…". Read when the page asks, off the window's thread, and never saved: the Start menu's list
    // is kept in memory for five minutes, and each picture for as long as Memoir runs, so the list opens again at once.
    //   apps Memoir has seen (its `apps` record): with the names and icons the report shows them by
    //   apps open now: each program with a window
    //   apps in the Start menu (yours and everyone's) and on the desktop: the program each shortcut starts (a Squirrel
    //   app's, Discord's or Slack's, starts Update.exe --processStart X.exe: X, as the tracker sees it running)
    // Each is an app key (app:name.exe, the tracker's own: Tracker.Describe), a name and an icon: a small PNG as a data:
    // URL, or the icons folder's file for one Memoir has seen. Left out: Memoir itself (its window counts as Memoir,
    // never as an app), Windows' host for Store apps (every Store app under one name), uninstallers, installers and
    // updaters, and the parts of Windows that have windows but aren't apps (the Start menu, search, the keyboard).
    internal static class AppPicker {
        private sealed class Entry { public string Key, Name, Picture, Program; public bool Seen, Open, Installed; }

        private static readonly object gate = new object();
        private static List<Entry> shortcuts; private static DateTime shortcutsAt;
        private static readonly Dictionary<string, string> pictures = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static readonly Regex AppKey = new Regex("^app:[^<>:\"/\\\\|?*\\x00-\\x1f]+\\.exe$");
        private static readonly Regex IconFile = new Regex("^[a-f0-9]{24}\\.png$");
        private static readonly Regex NotAnApp = new Regex(@"^(unins\d*|uninstall.*|.*uninst|.*setup|.*install|.*installer|update|updater|.*crash.?(handler|reporter?)|.*helper)\.exe$", RegexOptions.IgnoreCase);
        private static readonly Regex NotAName = new Regex(@"\b(uninstall|readme|read me|release notes|license|licence|website|help|documentation|manual)\b", RegexOptions.IgnoreCase);
        private static readonly HashSet<string> NotApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "app:applicationframehost.exe", "app:textinputhost.exe", "app:shellexperiencehost.exe", "app:startmenuexperiencehost.exe",
            "app:searchhost.exe", "app:searchapp.exe", "app:lockapp.exe", "app:shellhost.exe", "app:widgets.exe", "app:rundll32.exe", "app:dllhost.exe",
        };

        // the whole list, answered on a thread of its own (COM reads the shortcuts there)
        public static void List(Dictionary<string, object> seen, Action<object> done) {
            var thread = new Thread(delegate() {
                object result;
                try { result = Collect(seen); } catch { result = new object[0]; }
                done(result);
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Start();
        }

        // one program, chosen with "Choose an app…" (on the window's thread: COM reads a shortcut there too): its key,
        // name and icon, or why it can't be one. A shortcut is read as the Start menu's are (a Squirrel app's too).
        public static Dictionary<string, object> Describe(string path) {
            if (String.IsNullOrEmpty(path) || !File.Exists(path)) return Json.Object("refused", "not-app");
            if (path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) {
                var entry = FromShortcut(path, true);
                if (entry == null) return Json.Object("refused", "not-app");
                if (entry.Key == "app:memoir.exe") return Json.Object("refused", "memoir");
                return Json.Object("key", entry.Key, "name", entry.Name, "icon", entry.Picture);
            }
            if (!path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return Json.Object("refused", "not-app");
            if (Own(path)) return Json.Object("refused", "memoir");
            string key = KeyOf(path);
            if (key == null) return Json.Object("refused", "not-app");
            if (NotApps.Contains(key)) return Json.Object("refused", "store-host");
            return Json.Object("key", key, "name", Described(path), "icon", Picture(path));
        }

        private static object Collect(Dictionary<string, object> seen) {
            List<Entry> installed;
            lock (gate) {
                if (shortcuts == null || DateTime.UtcNow - shortcutsAt > TimeSpan.FromMinutes(5)) { shortcuts = Shortcuts(); shortcutsAt = DateTime.UtcNow; }
                installed = shortcuts;
            }
            var all = new Dictionary<string, Entry>(StringComparer.Ordinal);
            // the names Memoir already shows win, then the Start menu's, then the program's own
            foreach (var pair in seen) {
                if (!AppKey.IsMatch(pair.Key)) continue;
                var info = Json.Map(pair.Value);
                string icon = Json.Text(Json.Get(info, "icon"));
                Merge(all, new Entry { Key = pair.Key, Name = Json.Text(Json.Get(info, "name")), Picture = IconFile.IsMatch(icon) ? "https://memoir-icons.example/" + icon : null, Seen = true });
            }
            // one program behind several shortcuts (DaVinci Resolve and its Proxy Generator, the consoles in mmc.exe) is
            // one app to the tracker: it goes by the program's own name, not whichever shortcut came first
            foreach (var group in installed.GroupBy(e => e.Key)) {
                var entry = group.First();
                if (group.Select(e => e.Name).Distinct(StringComparer.CurrentCultureIgnoreCase).Skip(1).Any() && File.Exists(entry.Program))
                    entry = new Entry { Key = entry.Key, Name = Described(entry.Program), Picture = Picture(entry.Program), Program = entry.Program, Installed = true };
                Merge(all, entry);
            }
            foreach (var entry in OpenNow()) Merge(all, entry);
            return all.Values.Where(e => !NotApps.Contains(e.Key)).OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase)
                .Select(e => (object)Json.Object("key", e.Key, "name", e.Name, "icon", e.Picture, "seen", e.Seen, "open", e.Open, "installed", e.Installed)).ToArray();
        }
        private static void Merge(Dictionary<string, Entry> all, Entry entry) {
            if (entry == null || entry.Key == null) return;
            Entry had;
            if (!all.TryGetValue(entry.Key, out had)) { all[entry.Key] = new Entry { Key = entry.Key, Name = entry.Name, Picture = entry.Picture, Seen = entry.Seen, Open = entry.Open, Installed = entry.Installed }; return; }
            if (String.IsNullOrWhiteSpace(had.Name)) had.Name = entry.Name;
            if (had.Picture == null) had.Picture = entry.Picture;
            had.Seen |= entry.Seen; had.Open |= entry.Open; had.Installed |= entry.Installed;
        }

        // ----- the Start menu and the desktop -----
        private static List<Entry> Shortcuts() {
            var found = new List<Entry>();
            var folders = new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            };
            foreach (string folder in folders.Where(f => !String.IsNullOrEmpty(f)).Distinct(StringComparer.OrdinalIgnoreCase))
                foreach (string file in Files(folder, 4)) { var entry = FromShortcut(file); if (entry != null) found.Add(entry); }
            return found;
        }
        private static List<string> Files(string folder, int depth) {
            var found = new List<string>();
            if (!Directory.Exists(folder)) return found;
            try { found.AddRange(Directory.GetFiles(folder, "*.lnk")); } catch { }
            if (depth > 0) try { foreach (string sub in Directory.GetDirectories(folder)) found.AddRange(Files(sub, depth - 1)); } catch { }
            return found;
        }
        // chosen: one picked on purpose keeps any name (only a program it can't be is refused)
        private static Entry FromShortcut(string file, bool chosen = false) {
            string name = Path.GetFileNameWithoutExtension(file);
            if (!chosen && NotAName.IsMatch(name)) return null;
            string target, arguments, iconPath; int iconIndex;
            var link = (IShellLinkW)new ShellLink();
            try {
                ((IPersistFile)link).Load(file, 0);
                var text = new StringBuilder(1024);
                link.GetPath(text, text.Capacity, IntPtr.Zero, 0); target = text.ToString();
                text.Length = 0; link.GetArguments(text, text.Capacity); arguments = text.ToString();
                text.Length = 0; link.GetIconLocation(text, text.Capacity, out iconIndex); iconPath = text.ToString();
            } catch { return null; } finally { Marshal.ReleaseComObject(link); }
            target = Environment.ExpandEnvironmentVariables(target ?? "");
            if (!target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(target)) return null;
            string program = target;
            // a Squirrel app: Update.exe --processStart Discord.exe starts the newest app-* folder's Discord.exe
            var squirrel = Regex.Match(arguments ?? "", "--processStart(?:=|\\s+)\"?([^\"]+?\\.exe)\"?(\\s|$)", RegexOptions.IgnoreCase);
            if (Path.GetFileName(target).Equals("update.exe", StringComparison.OrdinalIgnoreCase) && squirrel.Success) {
                string exe = Path.GetFileName(squirrel.Groups[1].Value), root = Path.GetDirectoryName(target);
                program = Path.Combine(root, exe);
                try { string newest = Directory.GetDirectories(root, "app-*").OrderByDescending(d => d, StringComparer.OrdinalIgnoreCase).Select(d => Path.Combine(d, exe)).FirstOrDefault(File.Exists); if (newest != null) program = newest; } catch { }
            }
            if ((!chosen && NotAnApp.IsMatch(Path.GetFileName(program))) || (File.Exists(program) && Own(program))) return chosen && Own(program) ? new Entry { Key = "app:memoir.exe" } : null;
            string key = KeyOf(program);
            if (key == null || NotApps.Contains(key)) return null;
            iconPath = Environment.ExpandEnvironmentVariables(iconPath ?? "");
            bool ownIcon = iconIndex == 0 && File.Exists(iconPath) && (iconPath.EndsWith(".ico", StringComparison.OrdinalIgnoreCase) || iconPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase));
            if (!File.Exists(program)) program = target;
            return new Entry { Key = key, Name = name, Picture = Picture(ownIcon ? iconPath : program), Program = program, Installed = true };
        }

        // ----- open now: each program with a window, in this Windows session -----
        private static List<Entry> OpenNow() {
            var found = new List<Entry>();
            int self = Process.GetCurrentProcess().Id, session = Process.GetCurrentProcess().SessionId;
            foreach (var process in Process.GetProcesses()) {
                try {
                    if (process.Id == self || process.SessionId != session || process.MainWindowHandle == IntPtr.Zero) continue;
                    string path = Native.ImagePath(process.Id);
                    if (path != null && Own(path)) continue;
                    string key = "app:" + Native.ProcessName(process.Id).ToLowerInvariant() + ".exe";
                    if (!AppKey.IsMatch(key) || NotApps.Contains(key)) continue;
                    found.Add(new Entry { Key = key, Name = path != null ? Described(path) : process.ProcessName, Picture = path != null ? Picture(path) : null, Open = true });
                } catch { } finally { process.Dispose(); }
            }
            return found;
        }

        // ----- one program -----
        private static string KeyOf(string path) {
            string key = "app:" + Path.GetFileName(path).ToLowerInvariant();
            return AppKey.IsMatch(key) ? key : null;
        }
        // its name as the tracker gives it: the program's own description, or its file's name
        private static string Described(string path) {
            try { var info = FileVersionInfo.GetVersionInfo(path); if (!String.IsNullOrWhiteSpace(info.FileDescription)) return info.FileDescription.Trim(); } catch { }
            return Path.GetFileNameWithoutExtension(path);
        }
        // another Memoir (an older copy, its installer, a test copy): its file says Memoir, by Mina Vian
        private static bool Own(string path) {
            try { var info = FileVersionInfo.GetVersionInfo(path); return info.ProductName == "Memoir" && info.CompanyName == "Mina Vian"; } catch { return false; }
        }
        // its icon, as the tracker saves an app's (Tracker.Remember): 32 px, as a PNG data: URL
        private static string Picture(string path) {
            lock (pictures) { string known; if (pictures.TryGetValue(path, out known)) return known; }
            string picture = null;
            try {
                using (Icon icon = Icon.ExtractAssociatedIcon(path)) if (icon != null) using (Bitmap image = icon.ToBitmap()) using (var bytes = new MemoryStream()) {
                    image.Save(bytes, ImageFormat.Png);
                    picture = "data:image/png;base64," + Convert.ToBase64String(bytes.ToArray());
                }
            } catch { }
            lock (pictures) { if (pictures.Count > 600) pictures.Clear(); pictures[path] = picture; }
            return picture;
        }

        [ComImport, Guid("00021401-0000-0000-C000-000000000046")] private class ShellLink { }
        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
        private interface IShellLinkW {
            void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int length, IntPtr data, uint flags);
            void GetIDList(out IntPtr list);
            void SetIDList(IntPtr list);
            void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int length);
            void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
            void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int length);
            void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
            void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int length);
            void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
            void GetHotkey(out short key);
            void SetHotkey(short key);
            void GetShowCmd(out int show);
            void SetShowCmd(int show);
            void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, out int index);
            void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
            void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
            void Resolve(IntPtr window, uint flags);
            void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
        }
    }
}
