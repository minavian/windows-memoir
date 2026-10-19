using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Memoir {
    // Memoir in the Start menu, so Windows Search finds it by name: one shortcut, Memoir.lnk, in this Windows
    // account's Start menu programs. Made at the first start; after that, a moved folder takes it with it, and one
    // you deleted stays deleted. Only the Memoir using the Data folder next to it does this: a copy started with
    // --data-dir (tests) never touches the real Start menu unless a test folder is given. Its icon is Memoir's, in
    // rainbow colours with the Rainbow clock on: Windows' taskbar takes a running app's icon from this shortcut.
    internal static class StartMenu {
        private static string Folder {
            get {
                string test = Environment.GetEnvironmentVariable("MEMOIR_TEST_START_MENU");
                return String.IsNullOrEmpty(test) ? Environment.GetFolderPath(Environment.SpecialFolder.Programs) : test;
            }
        }
        public static string ShortcutPath { get { return Path.Combine(Folder, "Memoir.lnk"); } }
        public static bool Available(bool fixedData) { return !fixedData || !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("MEMOIR_TEST_START_MENU")); }

        // icon: the .ico the shortcut shows ("" for Memoir.exe's own)
        public static void Start(Store store, string appDirectory, string icon) {
            try {
                string target = Path.Combine(appDirectory, "Memoir.exe");
                bool first = !(Json.Get(store.Data, "startMenu") is System.Collections.Generic.Dictionary<string, object>);
                if (first) { Write(target, appDirectory, icon); store.Set(Json.Object("startMenu", Json.Object("since", Engine.Now))); store.Save(); return; }
                if (File.Exists(ShortcutPath) && (!String.Equals(Target(), target, StringComparison.OrdinalIgnoreCase) || !String.Equals(Icon(), Icon(target, icon), StringComparison.OrdinalIgnoreCase))) Write(target, appDirectory, icon);
            } catch { }
        }
        // the Rainbow clock turned on or off: the shortcut (if it's there) shows it, and Windows is told
        public static void FollowIcon(string appDirectory, string icon) {
            try {
                string target = Path.Combine(appDirectory, "Memoir.exe");
                if (File.Exists(ShortcutPath) && !String.Equals(Icon(), Icon(target, icon), StringComparison.OrdinalIgnoreCase)) Write(target, appDirectory, icon);
            } catch { }
        }
        // Installing: the shortcut is made (or made again), whatever an earlier copy's history says
        public static void Make(string appDirectory, string icon) {
            try { Write(Path.Combine(appDirectory, "Memoir.exe"), appDirectory, icon); } catch { }
        }
        // Uninstalling: the shortcut goes, if it's this Memoir's
        public static void Remove(string appDirectory) {
            try {
                if (!File.Exists(ShortcutPath) || !String.Equals(Target(), Path.Combine(appDirectory, "Memoir.exe"), StringComparison.OrdinalIgnoreCase)) return;
                File.Delete(ShortcutPath);
                SHChangeNotify(0x0004, 0x0005, ShortcutPath, IntPtr.Zero);   // SHCNE_DELETE
            } catch { }
        }
        private static string Icon(string target, string icon) { return (String.IsNullOrEmpty(icon) ? target : icon) + ",0"; }
        private static void Write(string target, string appDirectory, string icon) {
            Directory.CreateDirectory(Folder);
            var link = (IShellLinkW)new ShellLink();
            try {
                link.SetPath(target);
                link.SetWorkingDirectory(appDirectory);
                link.SetDescription("Your screen time, kept on your computer");
                link.SetIconLocation(String.IsNullOrEmpty(icon) ? target : icon, 0);
                ((IPersistFile)link).Save(ShortcutPath, true);
            } finally { Marshal.ReleaseComObject(link); }
            SHChangeNotify(0x2000, 0x0005, ShortcutPath, IntPtr.Zero);   // SHCNE_UPDATEITEM, SHCNF_PATHW: its new icon shows
        }
        private static string Icon() {
            var link = (IShellLinkW)new ShellLink();
            try {
                ((IPersistFile)link).Load(ShortcutPath, 0);
                var path = new StringBuilder(260); int index; link.GetIconLocation(path, path.Capacity, out index);
                return path.ToString() + "," + index;
            } catch { return ""; } finally { Marshal.ReleaseComObject(link); }
        }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern void SHChangeNotify(int eventId, int flags, string item1, IntPtr item2);
        private static string Target() {
            var link = (IShellLinkW)new ShellLink();
            try {
                ((IPersistFile)link).Load(ShortcutPath, 0);
                var path = new StringBuilder(260); link.GetPath(path, path.Capacity, IntPtr.Zero, 0x4);   // SLGP_RAWPATH
                return path.ToString();
            } catch { return ""; } finally { Marshal.ReleaseComObject(link); }
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
