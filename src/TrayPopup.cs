using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;

namespace Memoir {
    internal static class TrayPopup {
        // This short-lived process releases WPF and its graphics heaps on dismissal.
        public static void Run(string[] args) {
            try {
                Func<string, string> option = prefix => Array.Find(args, arg => arg.StartsWith(prefix)).Substring(prefix.Length);
                int parentPid = Int32.Parse(option("--parent="));
                IntPtr owner = new IntPtr(Int64.Parse(option("--owner=")));
                int message = Int32.Parse(option("--message="));
                string[] position = option("--anchor=").Split(',');
                var appearance = Json.Map(Json.Decode(Encoding.UTF8.GetString(Convert.FromBase64String(option("--appearance=")))));
                Native.SetProcessDPIAware();
                var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
                var menu = new TrayMenu(AppDomain.CurrentDomain.BaseDirectory, appearance, Array.IndexOf(args, "--paused") >= 0,
                    new System.Drawing.Point(Int32.Parse(position[0]), Int32.Parse(position[1])), delegate(string action) {
                        Native.PostMessage(owner, message, new IntPtr(action == "quit" ? 2 : action == "today" ? 5 : action == "pause" ? 6 : 4), IntPtr.Zero);
                    });
                menu.ShowInTaskbar = Array.IndexOf(args, "--inspect-menu") >= 0;
                using (var close = EventWaitHandle.OpenExisting("Local\\Memoir.Tray." + parentPid))
                using (var parent = Process.GetProcessById(parentPid)) {
                    parent.EnableRaisingEvents = true;
                    parent.Exited += delegate { try { app.Dispatcher.BeginInvoke(new Action(delegate { menu.Dismiss(); })); } catch { } };
                    Task.Run(delegate { try { close.WaitOne(); app.Dispatcher.BeginInvoke(new Action(delegate { menu.Dismiss(); })); } catch { } });
                    app.Run(menu);
                }
            } catch { /* The tracker continues if a popup cannot be opened. */ }
        }
    }
}
