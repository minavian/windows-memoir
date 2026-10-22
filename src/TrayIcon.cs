// Made with care and love by Mina Vian
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Memoir {
    // The clock in the notification area, on Shell_NotifyIcon's version 4 (WinForms' NotifyIcon is version 0): a click
    // and a right-click come apart (Select, Menu), Windows' own tooltip stays off for Memoir's (TrayTip.cs: the shell
    // says when to show it, PopupOpen and PopupClose), and the icon's place on screen is known (Bounds), so what
    // opens from it sits beside it. Its text is still the icon's name for screen readers.
    internal sealed class TrayIcon : NativeWindow, IDisposable {
        private const int Id = 1, Callback = 0x8000 + 41;               // WM_APP + 41
        private const int NimAdd = 0, NimModify = 1, NimDelete = 2, NimSetVersion = 4;
        private const int NifMessage = 0x1, NifIcon = 0x2, NifTip = 0x4, NifInfo = 0x10;
        private const int MouseMove = 0x200, DoubleClickMessage = 0x203, ContextMenu = 0x7B;
        private const int NinSelect = 0x400, NinKeySelect = 0x401, NinBalloonClick = 0x405, NinPopupOpen = 0x406, NinPopupClose = 0x407;
        private readonly int taskbarCreated = RegisterWindowMessage("TaskbarCreated");
        private Icon icon; private string text = ""; private bool added, disposed;
        private DateTime lastKeySelect;

        public event Action Select, Open, Hover, PopupClose, BalloonClicked;   // Open: a double-click
        public event Action<Point> Menu, PopupOpen;                            // where: the icon's anchor point

        public TrayIcon() { CreateHandle(new CreateParams()); }
        public Icon Icon { get { return icon; } set { icon = value; Update(NifIcon); } }
        public string Text { get { return text; } set { text = value ?? ""; Update(NifTip); } }
        public void Show() { if (added || disposed) return; var data = Data(NifMessage | NifIcon | NifTip); added = Shell_NotifyIcon(NimAdd, ref data); if (added) { data.uVersion = 4; Shell_NotifyIcon(NimSetVersion, ref data); } }
        public void ShowBalloon(string title, string message) {
            if (!added) return;
            var data = Data(NifInfo); data.szInfoTitle = Clip(title, 63); data.szInfo = Clip(message, 255); data.dwInfoFlags = 0x1 | 0x20; // NIIF_INFO, NIIF_LARGE_ICON
            Shell_NotifyIcon(NimModify, ref data);
        }
        // the icon's rectangle on screen (inside the hidden-icons flyout, when it's there); empty when Windows won't say
        public Rectangle Bounds {
            get {
                var id = new NotifyIconIdentifier { cbSize = Marshal.SizeOf(typeof(NotifyIconIdentifier)), hWnd = Handle, uID = Id };
                Rect rect; if (Shell_NotifyIconGetRect(ref id, out rect) != 0) return Rectangle.Empty;
                return Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
            }
        }

        private void Update(int flags) { if (!added) return; var data = Data(flags); Shell_NotifyIcon(NimModify, ref data); }
        private NotifyIconData Data(int flags) {
            return new NotifyIconData { cbSize = Marshal.SizeOf(typeof(NotifyIconData)), hWnd = Handle, uID = Id, uFlags = flags, uCallbackMessage = Callback, hIcon = icon != null ? icon.Handle : IntPtr.Zero, szTip = Clip(text, 127), szInfo = "", szInfoTitle = "" };
        }
        private static string Clip(string value, int length) { value = value ?? ""; return value.Length > length ? value.Substring(0, length) : value; }

        protected override void WndProc(ref Message m) {
            if (m.Msg == Callback) {
                int what = (int)((long)m.LParam & 0xFFFF);
                var at = new Point((short)((long)m.WParam & 0xFFFF), (short)(((long)m.WParam >> 16) & 0xFFFF));
                switch (what) {
                    case MouseMove: Raise(Hover); break;
                    case NinSelect: Raise(Select); break;
                    // Enter on the focused icon arrives twice: once
                    case NinKeySelect: if ((DateTime.UtcNow - lastKeySelect).TotalMilliseconds > 400) { lastKeySelect = DateTime.UtcNow; Raise(Select); } break;
                    case DoubleClickMessage: Raise(Open); break;
                    case ContextMenu: if (Menu != null) Menu(at); break;
                    case NinPopupOpen: if (PopupOpen != null) PopupOpen(at); break;
                    case NinPopupClose: Raise(PopupClose); break;
                    case NinBalloonClick: Raise(BalloonClicked); break;
                }
                return;
            }
            // Explorer started again (it crashed, or was restarted): the icon goes back
            if (m.Msg == taskbarCreated && taskbarCreated != 0) { added = false; Show(); }
            base.WndProc(ref m);
        }
        private static void Raise(Action handler) { if (handler != null) handler(); }

        public void Dispose() {
            if (disposed) return; disposed = true;
            if (added) { var data = Data(0); Shell_NotifyIcon(NimDelete, ref data); added = false; }
            DestroyHandle();
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct NotifyIconData {
            public int cbSize; public IntPtr hWnd; public int uID; public int uFlags; public int uCallbackMessage; public IntPtr hIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
            public int dwState, dwStateMask;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
            public int uVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
            public int dwInfoFlags; public Guid guidItem; public IntPtr hBalloonIcon;
        }
        [StructLayout(LayoutKind.Sequential)] private struct NotifyIconIdentifier { public int cbSize; public IntPtr hWnd; public int uID; public Guid guidItem; }
        [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern bool Shell_NotifyIcon(int message, ref NotifyIconData data);
        [DllImport("shell32.dll")] private static extern int Shell_NotifyIconGetRect(ref NotifyIconIdentifier identifier, out Rect rect);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int RegisterWindowMessage(string name);
    }
}
