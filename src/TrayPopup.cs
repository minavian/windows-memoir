using System;
using System.Diagnostics;
using System.IO;
using System.Runtime;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;

namespace Memoir {
    internal static class TrayPopup {
        // This short-lived process releases WPF and its graphics heaps on dismissal. It starts while the mouse is
        // over the clock (--standby: ready, hidden), so a click shows it at once; unclicked, it's gone after 10 s.
        public static void Run(string[] args) {
            try {
                // later starts compile on every core at once, from what this one needed (multicore JIT)
                try { string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Memoir"); Directory.CreateDirectory(root); ProfileOptimization.SetProfileRoot(root); ProfileOptimization.StartProfile("tray-menu.jit"); } catch { }
                bool standby = Array.IndexOf(args, "--standby") >= 0;
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
                        // this menu has the front (it was just clicked): Memoir may take it, so it opens on top
                        Native.AllowSetForegroundWindow(parentPid);
                        Native.PostMessage(owner, message, new IntPtr(action == "quit" ? 2 : action == "today" ? 5 : action == "pause" ? 6 : 4), IntPtr.Zero);
                    });
                menu.ShowInTaskbar = Array.IndexOf(args, "--inspect-menu") >= 0;
                using (var close = EventWaitHandle.OpenExisting("Local\\Memoir.Tray." + parentPid))
                using (var parent = Process.GetProcessById(parentPid)) {
                    parent.EnableRaisingEvents = true;
                    parent.Exited += delegate { try { app.Dispatcher.BeginInvoke(new Action(delegate { menu.Dismiss(); })); } catch { } };
                    if (!standby) {
                        Task.Run(delegate { try { close.WaitOne(); app.Dispatcher.BeginInvoke(new Action(delegate { menu.Dismiss(); })); } catch { } });
                        app.Run(menu);
                        return;
                    }
                    app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                    menu.Closed += delegate { app.Shutdown(); };
                    new WindowInteropHelper(menu).EnsureHandle();
                    using (var show = EventWaitHandle.OpenExisting("Local\\Memoir.TrayShow." + parentPid)) {
                        Task.Run(delegate {
                            try {
                                int which = WaitHandle.WaitAny(new WaitHandle[] { show, close }, 10000);
                                app.Dispatcher.BeginInvoke(new Action(delegate { if (which == 0) menu.ShowAt(System.Windows.Forms.Cursor.Position); else app.Shutdown(); }));
                                if (which == 0) { close.WaitOne(); app.Dispatcher.BeginInvoke(new Action(delegate { menu.Dismiss(); })); }
                            } catch { }
                        });
                        app.Run();
                    }
                }
            } catch { /* The tracker continues if a popup cannot be opened. */ }
        }
    }
}
