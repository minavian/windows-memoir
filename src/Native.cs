// Made with care and love by Mina Vian
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
        [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern bool AllowSetForegroundWindow(int processId);
        [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint attach, uint to, bool on);
        [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
        // A window brought in front of whatever is there, as when it's clicked: Windows lets only the program you're
        // using change the window in front, so this one borrows the front window's input for a moment
        internal static void ToFront(IntPtr hwnd) {
            IntPtr front = GetForegroundWindow(); uint frontPid; uint frontThread = front == IntPtr.Zero ? 0 : GetWindowThreadProcessId(front, out frontPid), me = GetCurrentThreadId();
            bool attached = frontThread != 0 && frontThread != me && AttachThreadInput(me, frontThread, true);
            try { BringWindowToTop(hwnd); SetForegroundWindow(hwnd); } finally { if (attached) AttachThreadInput(me, frontThread, false); }
        }
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
        [DllImport("kernel32.dll", EntryPoint = "K32QueryWorkingSet", SetLastError = true)] private static extern bool QueryWorkingSet(IntPtr process, IntPtr list, int size);
        [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
        // This Memoir's memory as Task Manager's Memory column shows it (its private working set; Process.WorkingSet64
        // counts what it shares with other programs too). Only the recorder: not the WebView2 processes its pages run in,
        // nor the bridge a browser starts. Windows lists the working set an entry a page (bit 8: shareable); a list that
        // grew since its size was asked is asked for again.
        public static long PrivateWorkingSet() {
            IntPtr process = GetCurrentProcess(); int entries = 8192;
            for (int attempt = 0; attempt < 4; attempt++) {
                int size = (entries + 1) * IntPtr.Size; IntPtr list = Marshal.AllocHGlobal(size);
                try {
                    if (QueryWorkingSet(process, list, size)) {
                        long count = Marshal.ReadIntPtr(list).ToInt64(), own = 0;
                        for (long i = 1; i <= count; i++) if ((Marshal.ReadIntPtr(list, (int)(i * IntPtr.Size)).ToInt64() & 0x100) == 0) own++;
                        return own * Environment.SystemPageSize;
                    }
                    if (Marshal.GetLastWin32Error() != 24) return -1;   // (ERROR_BAD_LENGTH: more pages than room)
                    entries = (int)Marshal.ReadIntPtr(list).ToInt64() + 1024;
                } finally { Marshal.FreeHGlobal(list); }
            }
            return -1;
        }
        [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
        // Installed from the Microsoft Store: Windows gives that copy a package identity, which Setup's copies don't have
        // (APPMODEL_ERROR_NO_PACKAGE). The Store brings such a copy its updates by itself.
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetCurrentPackageFullName(ref int length, StringBuilder name);
        private static int store = -1;
        internal static bool FromStore {
            get {
                if (store < 0) { try { int length = 0; int result = GetCurrentPackageFullName(ref length, null); store = result == 0 || result == 122 ? 1 : 0; } catch (EntryPointNotFoundException) { store = 0; } }
                return store == 1;
            }
        }
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
