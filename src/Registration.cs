using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Memoir {
    // Memoir as a native messaging host, so the Memoir extension can reach it from any browser that runs Chrome
    // extensions. Written at every start and every 10 minutes (a browser installed later is found too), for this
    // Windows account only (no administrator), so a moved folder fixes itself: the host's manifest in
    // %LOCALAPPDATA%\Memoir\NativeHost, a key in every Chromium browser's own registry folder, and which data
    // folder (whose pipe) the host connects to. Only the extensions listed in extension-ids.txt (next to
    // Memoir.exe) and the old Memoir Windows Connector may connect.
    internal static class Registration {
        public const string HostName = "com.minavian.memoir";
        private static readonly Regex ExtensionId = new Regex("^[a-p]{32}$");
        private static string Folder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Memoir", "NativeHost"); } }
        // Each Chromium browser looks for native hosts in its own folder under HKCU\Software: these when that browser
        // is here (Chrome and Edge always), and any other folder a scan finds holding a Chromium launch beacon
        // (BLBeacon) or other apps' native hosts. Firefox's and WebView2's look alike but can't run the extension.
        private static readonly string[] Always = { @"Software\Google\Chrome", @"Software\Microsoft\Edge" };
        private static readonly string[] Known = { @"Software\Chromium", @"Software\BraveSoftware\Brave-Browser", @"Software\Vivaldi", @"Software\Opera Software\Opera Stable",
            @"Software\Opera Software\Opera GX Stable", @"Software\ArcBrowser\Arc", @"Software\Perplexity\Comet", @"Software\Yandex\YandexBrowser", @"Software\CocCoc\Browser",
            @"Software\Naver\Naver Whale", @"Software\Thorium", @"Software\Island\Island" };
        private static readonly Regex NotBrowser = new Regex(@"^Software\\(Classes|Mozilla|Policies|Wow6432Node|Microsoft\\EdgeWebView)(\\|$)", RegexOptions.IgnoreCase);
        public static List<string> BrowserFolders() {
            var found = new List<string>(Always);
            foreach (string path in Known) try { using (var key = Registry.CurrentUser.OpenSubKey(path)) if (key != null) found.Add(path); } catch { }
            try {
                using (var software = Registry.CurrentUser.OpenSubKey("Software")) {
                    foreach (string vendor in software.GetSubKeyNames()) {
                        string vendorPath = @"Software\" + vendor; if (NotBrowser.IsMatch(vendorPath)) continue;
                        try {
                            using (var v = software.OpenSubKey(vendor)) {
                                if (v == null) continue;
                                if (Chromium(v)) found.Add(vendorPath);
                                foreach (string product in v.GetSubKeyNames()) {
                                    string productPath = vendorPath + @"\" + product; if (NotBrowser.IsMatch(productPath)) continue;
                                    try { using (var p = v.OpenSubKey(product)) if (p != null && Chromium(p)) found.Add(productPath); } catch { }
                                }
                            }
                        } catch { }
                    }
                }
            } catch { }
            return found.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
        private static bool Chromium(RegistryKey key) { return key.GetSubKeyNames().Any(name => name.Equals("BLBeacon", StringComparison.OrdinalIgnoreCase) || name.Equals("NativeMessagingHosts", StringComparison.OrdinalIgnoreCase)); }

        public static void Register(string appDirectory, string dataDirectory) {
            try {
                Directory.CreateDirectory(Folder);
                string manifest = Path.Combine(Folder, HostName + ".json");
                var origins = AllowedIds(appDirectory).Select(id => (object)("chrome-extension://" + id + "/")).ToArray();
                var utf8 = new UTF8Encoding(false);
                File.WriteAllText(manifest, Json.Encode(Json.Object("name", HostName, "description", "Memoir for Windows: its link with the Memoir extension, on this computer only",
                    "path", Path.Combine(appDirectory, "Memoir.exe"), "type", "stdio", "allowed_origins", origins)), utf8);
                File.WriteAllText(Path.Combine(Folder, "data-directory.txt"), Path.GetFullPath(dataDirectory), utf8);
                foreach (string browser in BrowserFolders()) try { using (var key = Registry.CurrentUser.CreateSubKey(browser + @"\NativeMessagingHosts\" + HostName)) key.SetValue("", manifest); } catch { }
            } catch { /* the link waits for the next start */ }
        }
        // The data folder of the Memoir that registered last (the host connects to its pipe)
        public static string DataDirectory() {
            try { string file = Path.Combine(Folder, "data-directory.txt"); if (File.Exists(file)) { string directory = File.ReadAllText(file).Trim(); if (Directory.Exists(directory)) return directory; } } catch { }
            return null;
        }
        public static List<string> AllowedIds(string appDirectory) {
            var ids = new List<string>();
            foreach (string file in new[] { Path.Combine(appDirectory, "extension-ids.txt"), Path.Combine(appDirectory, "Browser Connector", "extension-id.txt") }) {
                try { if (File.Exists(file)) ids.AddRange(File.ReadAllLines(file).Select(line => line.Split('#')[0].Trim()).Where(id => ExtensionId.IsMatch(id))); } catch { }
            }
            // tests add the extension copy they load
            string extra = Environment.GetEnvironmentVariable("MEMOIR_EXTRA_EXTENSION_IDS") ?? "";
            ids.AddRange(extra.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries).Where(id => ExtensionId.IsMatch(id)));
            return ids.Distinct().ToList();
        }
    }
}
