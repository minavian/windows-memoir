using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Memoir {
    // Memoir in the Start menu, so Windows Search finds it by name: one shortcut, Memoir.lnk, in this Windows
    // account's Start menu programs. Made at the first start; after that, a moved folder takes it with it, and one
    // you deleted stays deleted. Only the Memoir using the Data folder next to it does this: a copy started with
    // --data-dir (tests) never touches the real Start menu unless a test folder is given.
    internal static class StartMenu {
        private static string Folder {
            get {
                string test = Environment.GetEnvironmentVariable("MEMOIR_TEST_START_MENU");
                return String.IsNullOrEmpty(test) ? Environment.GetFolderPath(Environment.SpecialFolder.Programs) : test;
            }
        }
        public static string ShortcutPath { get { return Path.Combine(Folder, "Memoir.lnk"); } }
        public static bool Available(bool fixedData) { return !fixedData || !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("MEMOIR_TEST_START_MENU")); }

        public static void Start(Store store, string appDirectory) {
            try {
                string target = Path.Combine(appDirectory, "Memoir.exe");
                bool first = !(Json.Get(store.Data, "startMenu") is System.Collections.Generic.Dictionary<string, object>);
                if (first) { Write(target, appDirectory); store.Set(Json.Object("startMenu", Json.Object("since", Engine.Now))); store.Save(); return; }
                if (File.Exists(ShortcutPath) && !String.Equals(Target(), target, StringComparison.OrdinalIgnoreCase)) Write(target, appDirectory);
            } catch { }
        }
        private static void Write(string target, string appDirectory) {
            Directory.CreateDirectory(Folder);
            var link = (IShellLinkW)new ShellLink();
            try {
                link.SetPath(target);
                link.SetWorkingDirectory(appDirectory);
                link.SetDescription("Your screen time, kept on your computer");
                link.SetIconLocation(target, 0);
                ((IPersistFile)link).Save(ShortcutPath, true);
            } finally { Marshal.ReleaseComObject(link); }
        }
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
