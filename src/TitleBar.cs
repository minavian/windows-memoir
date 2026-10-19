using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Memoir {
    // Memoir has no title bar: the window keeps Windows' frame everywhere else (resize borders, shadow, rounded
    // corners, Snap) and gives its caption area to the page. Dragging the empty top of a page, double-clicking it
    // and right-clicking it ask the window (desktop-bridge.js: window.drag, window.maximize, window.menu); the
    // report's gear pulled down closes it, pulled up (or F11) makes it full screen (window.fullscreen).
    internal static class TitleBar {
        public const int CalcSize = 0x0083;
        private const int NcButtonDown = 0x00A1, SysCommand = 0x0112;
        public const int Caption = 2, Top = 12, TopLeft = 13, TopRight = 14;
        [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] private struct CalcSizeParams { public Rect Proposed, Before, Client; public IntPtr Position; }
        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern IntPtr GetSystemMenu(IntPtr hwnd, bool revert);
        [DllImport("user32.dll")] private static extern int TrackPopupMenuEx(IntPtr menu, uint flags, int x, int y, IntPtr hwnd, IntPtr parameters);
        [DllImport("user32.dll")] private static extern bool EnableMenuItem(IntPtr menu, uint item, uint flags);
        [DllImport("user32.dll")] private static extern bool SetMenuDefaultItem(IntPtr menu, uint item, uint byPosition);
        [StructLayout(LayoutKind.Sequential)] private struct Placement { public int Length, Flags, ShowCmd, MinX, MinY, MaxX, MaxY; public Rect Normal; }
        [DllImport("user32.dll")] private static extern bool GetWindowPlacement(IntPtr hwnd, ref Placement placement);
        [DllImport("user32.dll")] private static extern bool SetWindowPlacement(IntPtr hwnd, ref Placement placement);
        [DllImport("user32.dll")] private static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
        [DllImport("user32.dll")] private static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);

        // WM_NCCALCSIZE: Windows works out its usual frame, then the client is given back the caption: it starts at
        // the window's top edge, or, maximized (the frame then hangs over the screen's edge), that much lower
        public static int ProposedTop(IntPtr lparam) { return ((CalcSizeParams)Marshal.PtrToStructure(lparam, typeof(CalcSizeParams))).Proposed.Top; }
        public static void GiveCaption(IntPtr hwnd, IntPtr lparam, int top) {
            var p = (CalcSizeParams)Marshal.PtrToStructure(lparam, typeof(CalcSizeParams));
            p.Proposed.Top = top + (IsZoomed(hwnd) && !IsFullScreen ? GetSystemMetrics(33) + GetSystemMetrics(92) : 0); // SM_CYFRAME + SM_CXPADDEDBORDER
            Marshal.StructureToPtr(p, lparam, false);
        }
        // the frame is worked out again (once the window exists)
        public static void Refresh(IntPtr hwnd) { SetWindowPos(hwnd, IntPtr.Zero, 0, 0, 0, 0, 0x0020 | 0x0002 | 0x0001 | 0x0004 | 0x0010); }
        // Full screen: no frame and no edge, the whole screen, over the taskbar; then back to exactly where and how it
        // was. Both ways go through maximized, which Windows animates, so it grows and shrinks smoothly like a
        // double-click on the top: in, maximize (Begin), then, once that's played, drop the frame and cover the screen
        // (Cover); out, put the frame back and restore (End), unless it was maximized to begin with.
        public static bool IsFullScreen { get; private set; }
        private static Placement saved; private static long savedStyle; private static bool wasZoomed;
        private const int StyleIndex = -16; private const long CaptionStyle = 0xC00000, FrameStyle = 0x40000;
        // returns whether Windows is animating to maximized (wait for it before Cover)
        public static bool Begin(IntPtr hwnd) {
            saved = new Placement { Length = Marshal.SizeOf(typeof(Placement)) }; GetWindowPlacement(hwnd, ref saved);
            savedStyle = GetWindowLongPtr(hwnd, StyleIndex).ToInt64(); wasZoomed = IsZoomed(hwnd);
            if (wasZoomed) return false;
            SendMessage(hwnd, SysCommand, new IntPtr(0xF030), IntPtr.Zero);   // SC_MAXIMIZE
            return true;
        }
        public static void Cover(IntPtr hwnd) {
            IsFullScreen = true;
            SetWindowLongPtr(hwnd, StyleIndex, new IntPtr(GetWindowLongPtr(hwnd, StyleIndex).ToInt64() & ~(CaptionStyle | FrameStyle)));
            var screen = Screen.FromHandle(hwnd).Bounds;
            SetWindowPos(hwnd, IntPtr.Zero, screen.X, screen.Y, screen.Width, screen.Height, 0x0020 | 0x0004 | 0x0200);   // FRAMECHANGED, NOZORDER, NOOWNERZORDER
        }
        // animate: restore as Windows does (a window about to hide goes straight back)
        public static void End(IntPtr hwnd, bool animate) {
            if (!IsFullScreen) return;
            IsFullScreen = false;
            SetWindowLongPtr(hwnd, StyleIndex, new IntPtr(GetWindowLongPtr(hwnd, StyleIndex).ToInt64() | (savedStyle & (CaptionStyle | FrameStyle))));
            Refresh(hwnd);
            if (!wasZoomed && animate) {
                // where it goes back to is where it was (taking the frame off and on moves Windows' own note of it)
                var now = new Placement { Length = Marshal.SizeOf(typeof(Placement)) }; GetWindowPlacement(hwnd, ref now);
                now.Normal = saved.Normal; now.ShowCmd = 3; SetWindowPlacement(hwnd, ref now);   // SW_SHOWMAXIMIZED
                SendMessage(hwnd, SysCommand, new IntPtr(0xF120), IntPtr.Zero);   // SC_RESTORE
                // (WinForms sizes a restored window again from its own note, a caption taller: the size it had wins)
                var r = saved.Normal; SetWindowPos(hwnd, IntPtr.Zero, 0, 0, r.Right - r.Left, r.Bottom - r.Top, 0x0002 | 0x0004 | 0x0010);   // NOMOVE, NOZORDER, NOACTIVATE
            }
            else SetWindowPlacement(hwnd, ref saved);
        }
        // closed while it was still maximizing: back where it was
        public static void Abandon(IntPtr hwnd) { if (!wasZoomed) SetWindowPlacement(hwnd, ref saved); }
        // Windows' own setting: are windows animated when they maximize (Settings, Accessibility, Animation effects)?
        public static bool Animated() { var info = new AnimationInfo { Size = Marshal.SizeOf(typeof(AnimationInfo)) }; return SystemParametersInfo(0x0048, info.Size, ref info, 0) && info.MinAnimate != 0; }
        [StructLayout(LayoutKind.Sequential)] private struct AnimationInfo { public int Size, MinAnimate; }
        [DllImport("user32.dll")] private static extern bool SystemParametersInfo(int action, int param, ref AnimationInfo info, int flags);
        // the empty top of a page pressed: the window moves (or, from its top edge, resizes) as from a real caption, Snap included
        public static void Drag(IntPtr hwnd, int hit) {
            if (hit != Caption && hit != Top && hit != TopLeft && hit != TopRight) return;
            if (IsFullScreen) return;
            if (hit != Caption && IsZoomed(hwnd)) return;
            ReleaseCapture(); SendMessage(hwnd, NcButtonDown, new IntPtr(hit), IntPtr.Zero);
        }
        // right-click: the window's own menu (Restore, Move, Size, Minimize, Maximize, Close) where the mouse is
        public static void Menu(IntPtr hwnd) {
            IntPtr menu = GetSystemMenu(hwnd, false); if (menu == IntPtr.Zero) return;
            bool zoomed = IsZoomed(hwnd);
            EnableMenuItem(menu, 0xF120, zoomed ? 0u : 1u);   // Restore
            EnableMenuItem(menu, 0xF010, zoomed ? 1u : 0u);   // Move
            EnableMenuItem(menu, 0xF000, zoomed ? 1u : 0u);   // Size
            EnableMenuItem(menu, 0xF030, zoomed ? 1u : 0u);   // Maximize
            EnableMenuItem(menu, 0xF020, 0u);                  // Minimize
            SetMenuDefaultItem(menu, 0xF060, 0);               // Close
            var at = Cursor.Position;
            int command = TrackPopupMenuEx(menu, 0x0100 | 0x0002, at.X, at.Y, hwnd, IntPtr.Zero); // TPM_RETURNCMD, TPM_RIGHTBUTTON
            if (command != 0) PostMessage(hwnd, SysCommand, new IntPtr(command), IntPtr.Zero);
        }
    }
}
