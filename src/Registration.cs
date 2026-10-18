using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Memoir {
    // Memoir as a native messaging host, so the Memoir extension can reach it. Written at every start, for
    // this Windows account only (no administrator), so a moved folder fixes itself: the host's manifest in
    // %LOCALAPPDATA%\Memoir\NativeHost, the registry keys Chrome, Edge, Chromium, Brave and Vivaldi read, and
    // which data folder (whose pipe) the host connects to. Only the extensions listed in extension-ids.txt
    // (next to Memoir.exe) and the old Memoir Windows Connector may connect.
    internal static class Registration {
        public const string HostName = "com.minavian.memoir";
        private static readonly Regex ExtensionId = new Regex("^[a-p]{32}$");
        private static string Folder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Memoir", "NativeHost"); } }
        private static readonly string[] Browsers = { @"Software\Google\Chrome", @"Software\Microsoft\Edge", @"Software\Chromium", @"Software\BraveSoftware\Brave-Browser", @"Software\Vivaldi" };

        public static void Register(string appDirectory, string dataDirectory) {
            try {
                Directory.CreateDirectory(Folder);
                string manifest = Path.Combine(Folder, HostName + ".json");
                var origins = AllowedIds(appDirectory).Select(id => (object)("chrome-extension://" + id + "/")).ToArray();
                var utf8 = new UTF8Encoding(false);
                File.WriteAllText(manifest, Json.Encode(Json.Object("name", HostName, "description", "Memoir for Windows: its link with the Memoir extension, on this computer only",
                    "path", Path.Combine(appDirectory, "Memoir.exe"), "type", "stdio", "allowed_origins", origins)), utf8);
                File.WriteAllText(Path.Combine(Folder, "data-directory.txt"), Path.GetFullPath(dataDirectory), utf8);
                foreach (string browser in Browsers) using (var key = Registry.CurrentUser.CreateSubKey(browser + @"\NativeMessagingHosts\" + HostName)) key.SetValue("", manifest);
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
