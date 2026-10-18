using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Memoir {
    internal static class Program {
        [STAThread] private static void Main(string[] args) {
            if (Array.IndexOf(args, "--tray-popup") >= 0) { TrayPopup.Run(args); return; }
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string data = Path.Combine(directory, "Data"), diagnostics = null;
            bool minimized = false, nativeHost = false; string command = "";
            foreach (string arg in args) { if (arg == "--tray") minimized = true; else if (arg.StartsWith("--data-dir=")) data = Path.GetFullPath(arg.Substring(11)); else if (arg.StartsWith("--diagnostics=")) diagnostics = Path.GetFullPath(arg.Substring(14)); else if (arg == "--native-host" || arg.StartsWith("chrome-extension://")) nativeHost = true; else if (arg == "--quit" || arg == "--minimize" || arg == "--tray-menu" || arg == "--dismiss-menu") command = arg.Substring(2); }
            if (nativeHost) { BrowserLink.NativeHost(data); return; }
            bool first;
            string mutexName = "Local\\Memoir-" + Tracker.IconName(data.ToLowerInvariant()).Replace(".png", "");
            using (var mutex = new Mutex(true, mutexName, out first)) {
                if (!first) { int value = command == "quit" ? 2 : command == "minimize" ? 1 : command == "tray-menu" ? 3 : command == "dismiss-menu" ? 7 : 0; Native.PostMessage(new IntPtr(0xffff), Native.RegisterWindowMessage(mutexName), new IntPtr(value), IntPtr.Zero); return; }
                if (command.Length > 0) return;
                try { Native.SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new MainForm(directory, data, minimized, diagnostics)); }
                catch (Exception error) { MessageBox.Show(error.Message, "Memoir could not start", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            }
        }
    }
}
