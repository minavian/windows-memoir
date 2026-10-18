using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Memoir {
    internal static class Native {
        internal delegate void WinEventDelegate(IntPtr hook, uint eventId, IntPtr hwnd, int objectId, int childId, uint threadId, uint time);
        internal delegate bool EnumWindowDelegate(IntPtr hwnd, IntPtr value);
        [DllImport("user32.dll")] internal static extern bool EnumChildWindows(IntPtr hwnd, EnumWindowDelegate callback, IntPtr value);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int RegisterWindowMessage(string name);
        [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
        [DllImport("user32.dll")] internal static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll")] internal static extern IntPtr SetWinEventHook(uint first, uint last, IntPtr module, WinEventDelegate callback, uint processId, uint threadId, uint flags);
        [DllImport("user32.dll")] internal static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInput input);
        [DllImport("kernel32.dll")] private static extern ulong GetTickCount64();
        [DllImport("wtsapi32.dll")] internal static extern bool WTSRegisterSessionNotification(IntPtr hwnd, uint flags);
        [DllImport("wtsapi32.dll")] internal static extern bool WTSUnRegisterSessionNotification(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
        [DllImport("kernel32.dll")] internal static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr minimum, IntPtr maximum);
        [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
        [StructLayout(LayoutKind.Sequential)] private struct LastInput { public uint Size, Time; }
        // Process.ProcessName snapshots every process and thread on .NET Framework (~4 ms, ~120 KB each); this asks for one image path.
        public static string ImagePath(int processId) {
            IntPtr process = OpenProcess(0x1000, false, processId); if (process == IntPtr.Zero) return null;
            try { var path = new StringBuilder(1024); int size = path.Capacity; return QueryFullProcessImageName(process, 0, path, ref size) ? path.ToString() : null; }
            finally { CloseHandle(process); }
        }
        public static string ProcessName(int processId) {
            string path = ImagePath(processId);
            if (path != null) return System.IO.Path.GetFileNameWithoutExtension(path);
            using (var process = Process.GetProcessById(processId)) return process.ProcessName;
        }
        public static long IdleMilliseconds() { var input = new LastInput { Size = (uint)Marshal.SizeOf(typeof(LastInput)) }; if (!GetLastInputInfo(ref input)) return 0; return unchecked((uint)GetTickCount64() - input.Time); }
        public static string Title(IntPtr hwnd) { var text = new StringBuilder(1024); GetWindowText(hwnd, text, text.Capacity); return text.ToString(); }
        public static string ClassName(IntPtr hwnd) { var text = new StringBuilder(128); GetClassName(hwnd, text, text.Capacity); return text.ToString(); }
    }
}
