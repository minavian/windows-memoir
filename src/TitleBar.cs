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
            p.Proposed.Top = top + (IsZoomed(hwnd) ? GetSystemMetrics(33) + GetSystemMetrics(92) : 0); // SM_CYFRAME + SM_CXPADDEDBORDER
            Marshal.StructureToPtr(p, lparam, false);
        }
        // the frame is worked out again (once the window exists)
        public static void Refresh(IntPtr hwnd) { SetWindowPos(hwnd, IntPtr.Zero, 0, 0, 0, 0, 0x0020 | 0x0002 | 0x0001 | 0x0004 | 0x0010); }
        // Full screen: no frame, the whole screen, over the taskbar; then back to exactly where and how it was
        // (maximized too). As browsers do: a maximized window is restored first, so the screen's size is its own.
        public static bool IsFullScreen { get; private set; }
        private static Placement saved; private static long savedStyle;
        public static void FullScreen(IntPtr hwnd, bool on) {
            if (on == IsFullScreen) return;
            const int style = -16; const long caption = 0xC00000, frame = 0x40000;
            if (on) {
                saved = new Placement { Length = Marshal.SizeOf(typeof(Placement)) }; GetWindowPlacement(hwnd, ref saved);
                savedStyle = GetWindowLongPtr(hwnd, style).ToInt64();
                if (IsZoomed(hwnd)) SendMessage(hwnd, SysCommand, new IntPtr(0xF120), IntPtr.Zero);   // SC_RESTORE
                SetWindowLongPtr(hwnd, style, new IntPtr(savedStyle & ~(caption | frame)));
                var screen = Screen.FromHandle(hwnd).Bounds;
                SetWindowPos(hwnd, IntPtr.Zero, screen.X, screen.Y, screen.Width, screen.Height, 0x0020 | 0x0004 | 0x0200);   // FRAMECHANGED, NOZORDER, NOOWNERZORDER
            } else {
                SetWindowLongPtr(hwnd, style, new IntPtr(savedStyle));
                Refresh(hwnd);
                SetWindowPlacement(hwnd, ref saved);
            }
            IsFullScreen = on;
        }
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
