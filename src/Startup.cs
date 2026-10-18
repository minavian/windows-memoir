using System;
using System.IO;
using Microsoft.Win32;

namespace Memoir {
    // Start with Windows: one value in this Windows account's startup list (HKCU\...\Run) that opens Memoir
    // straight into the notification area (--tray) when you sign in. On by default, from the first start; the
    // Settings switch turns it off and on. Windows' own Startup apps can turn it off too (StartupApproved), which
    // the switch shows; turning it on in Memoir turns that back on. Only the Memoir using the Data folder next to
    // it does this: a copy started with --data-dir (tests) never touches the real list unless a test key is given.
    internal static class Startup {
        private const string Name = "Memoir";
        private static string Root { get { string test = Environment.GetEnvironmentVariable("MEMOIR_TEST_STARTUP_KEY"); return String.IsNullOrEmpty(test) ? @"Software\Microsoft\Windows\CurrentVersion" : @"Software\" + test; } }
        private static string Run { get { return Root + @"\Run"; } }
        private static string Approved { get { return Root + @"\Explorer\StartupApproved\Run"; } }
        public static bool Available(bool fixedData) { return !fixedData || !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("MEMOIR_TEST_STARTUP_KEY")); }
        public static string Command(string appDirectory, string dataDirectory, bool fixedData) {
            string command = "\"" + Path.Combine(appDirectory, "Memoir.exe") + "\" --tray";
            return fixedData ? command + " \"--data-dir=" + dataDirectory + "\"" : command;
        }
        public static bool IsOn() {
            try {
                using (var run = Registry.CurrentUser.OpenSubKey(Run)) if (run == null || !(run.GetValue(Name) is string)) return false;
                // Startup apps: an odd first byte is "turned off there"
                using (var approved = Registry.CurrentUser.OpenSubKey(Approved)) { var state = approved == null ? null : approved.GetValue(Name) as byte[]; if (state != null && state.Length > 0 && (state[0] & 1) == 1) return false; }
                return true;
            } catch { return false; }
        }
        public static bool Set(bool on, string command) {
            try {
                using (var run = Registry.CurrentUser.CreateSubKey(Run)) { if (on) run.SetValue(Name, command); else run.DeleteValue(Name, false); }
                using (var approved = Registry.CurrentUser.CreateSubKey(Approved)) { if (on) approved.SetValue(Name, new byte[12] { 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }, RegistryValueKind.Binary); else approved.DeleteValue(Name, false); }
            } catch { }
            return IsOn();
        }
        // At every start: the first time, it's turned on; after that, a moved folder takes the entry with it (when on)
        public static void Start(Store store, string command) {
            try {
                if (!(Json.Get(store.Data, "windowsStartup") is System.Collections.Generic.Dictionary<string, object>)) {
                    Set(true, command);
                    store.Set(Json.Object("windowsStartup", Json.Object("since", Engine.Now))); store.Save();
                    return;
                }
                using (var run = Registry.CurrentUser.OpenSubKey(Run, true)) { var now = run == null ? null : run.GetValue(Name) as string; if (now != null && now != command) run.SetValue(Name, command); }
            } catch { }
        }
    }
}
