using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;

namespace Memoir {
    // One browser profile's line to Memoir: its native host's connection to the app's pipe. It carries the
    // tab in front (the extension's connector role, or the old Memoir Windows Connector) and, from a linked
    // extension, the sync exchange (Sync.cs). Thread-safe sends; messages arrive on the connection's thread.
    internal sealed class Peer {
        private readonly Stream pipe;
        private readonly object writing = new object();
        public readonly string Id = Guid.NewGuid().ToString("N");
        public string Browser = "chrome.exe";
        public Peer(Stream pipe) { this.pipe = pipe; }
        public bool Send(object message) { try { lock (writing) BrowserLink.WriteFrame(pipe, message, BrowserLink.ToBrowserLimit); return true; } catch { return false; } }
    }

    // The app's end: a pipe only this Windows account can open, any number of connections at once (one per
    // browser profile with Memoir in it), each held open and two-way. (C# 5: the compiler Windows ships.)
    internal sealed class BrowserLink : IDisposable {
        public const int ToBrowserLimit = 1024 * 1024;   // Chrome takes at most 1 MB a message from a native host
        public const int PipeLimit = 4 * 1024 * 1024;
        private readonly string pipeName;
        private readonly Dictionary<string, Dictionary<string, object>> states = new Dictionary<string, Dictionary<string, object>>();
        private readonly List<Stream> open = new List<Stream>();
        // every browser a linked extension runs in (from its host), known or not: its tabs count as websites
        private readonly HashSet<string> browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private static readonly System.Text.RegularExpressions.Regex Program = new System.Text.RegularExpressions.Regex(@"^[a-z0-9 ._-]{1,64}\.exe$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        public bool Knows(string executable) { lock (browsers) return browsers.Contains(executable); }
        private bool disposed;
        private long sequence;
        public event Action Changed;                                        // the tab in front changed
        public event Action<Peer> Closed;
        public event Action<Peer, Dictionary<string, object>> Message;      // anything else (the sync exchange)
        public BrowserLink(string dataDirectory) { pipeName = Name(dataDirectory); new Thread(Listen) { IsBackground = true, Name = "Memoir link" }.Start(); }
        internal static string Name(string directory) { return "Memoir.Browser." + Identity.IconName(Path.GetFullPath(directory).ToLowerInvariant()).Replace(".png", ""); }
        private void Listen() {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
            while (!disposed) {
                NamedPipeServerStream pipe = null;
                try {
                    pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 65536, 65536, security);
                    lock (open) { if (disposed) { pipe.Dispose(); break; } open.Add(pipe); }
                    pipe.WaitForConnection();
                    var connected = pipe; new Thread(() => Serve(connected)) { IsBackground = true, Name = "Memoir peer" }.Start();
                } catch { if (pipe != null) { lock (open) open.Remove(pipe); pipe.Dispose(); } if (disposed) break; Thread.Sleep(1000); }
            }
        }
        private void Serve(Stream pipe) {
            var peer = new Peer(pipe);
            try {
                while (!disposed) {
                    var message = Json.Map(Json.Decode(Encoding.UTF8.GetString(ReadFrame(pipe, PipeLimit))));
                    string type = Json.Text(Json.Get(message, "type"));
                    if (type == "host") {
                        string browser = Json.Text(Json.Get(message, "browser"));
                        if (BrowserProbe.IsBrowser(browser) || (Program.IsMatch(browser) && !browser.Equals("memoir.exe", StringComparison.OrdinalIgnoreCase))) { peer.Browser = browser; lock (browsers) browsers.Add(browser); }
                    }
                    else if (type == "tab" || type.Length == 0) Tab(peer, type == "tab" ? Json.Map(Json.Get(message, "tab")) : message);
                    else { var handler = Message; if (handler != null) handler(peer, message); }
                }
            } catch { }
            finally {
                lock (open) open.Remove(pipe);
                try { pipe.Dispose(); } catch { }
                bool had; lock (states) had = states.Remove(peer.Id);
                var closed = Closed; if (closed != null) closed(peer);
                var changed = Changed; if (had && changed != null) changed();
            }
        }
        private void Tab(Peer peer, Dictionary<string, object> tab) {
            var state = Json.Object("browser", peer.Browser, "tab", tab, "received", Engine.Now);
            lock (states) { if (states.Count >= 16 && !states.ContainsKey(peer.Id)) states.Clear(); state["sequence"] = ++sequence; states[peer.Id] = state; }
            var handler = Changed; if (handler != null) handler();
        }
        // The tab in front of this browser, from its freshest focused connection (seen in the last 45 s)
        public Dictionary<string, object> Current(string executable) {
            lock (states) {
                return states.Values.Where(s => Json.Text(Json.Get(s, "browser")) == executable && Json.Bool(Json.Get(Json.Map(Json.Get(s, "tab")), "focused")) && Engine.Now - Json.Number(Json.Get(s, "received")) < 45000)
                    .OrderByDescending(s => Json.Number(Json.Get(s, "sequence"))).Select(s => Json.Clone(Json.Map(Json.Get(s, "tab")))).FirstOrDefault();
            }
        }

        internal static byte[] ReadFrame(Stream stream, int limit) {
            byte[] header = Read(stream, 4); int length = BitConverter.ToInt32(header, 0);
            if (length < 0 || length > limit) throw new InvalidDataException("Invalid local browser message length.");
            return Read(stream, length);
        }
        private static byte[] Read(Stream stream, int count) { byte[] bytes = new byte[count]; int offset = 0; while (offset < count) { int read = stream.Read(bytes, offset, count - offset); if (read == 0) throw new EndOfStreamException(); offset += read; } return bytes; }
        internal static void WriteFrame(Stream stream, object message, int limit) { WriteBytes(stream, Encoding.UTF8.GetBytes(Json.Encode(message)), limit); }
        internal static void WriteBytes(Stream stream, byte[] bytes, int limit) {
            if (bytes.Length > limit) throw new InvalidDataException("Local browser message too large.");
            byte[] header = BitConverter.GetBytes(bytes.Length); stream.Write(header, 0, 4); stream.Write(bytes, 0, bytes.Length); stream.Flush();
        }

        // The browser's end: Chrome (or Edge…) starts Memoir.exe as its native host. It relays both ways
        // between the browser and the running app, and tells the extension whether the app is open
        // ({ type: 'host', app: 'online' | 'offline' }), trying the pipe again every few seconds. It ends
        // when the browser closes the connection.
        // (A browser starts it without --data-dir: then it joins the Memoir that registered last.)
        internal static void NativeHost(string dataDirectory, bool fixedDirectory) {
            string directory = (fixedDirectory ? null : Registration.DataDirectory()) ?? dataDirectory, browser = ParentExecutable();
            var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
            object toBrowser = new object(), pipeLock = new object(); NamedPipeClientStream pipe = null;
            Action<object> tell = message => { try { lock (toBrowser) WriteFrame(output, message, ToBrowserLimit); } catch { Environment.Exit(0); } };
            new Thread(() => {
                string said = null;
                while (true) {
                    // overlapped: a synchronous pipe makes a write wait behind the read that's always pending
                    var client = new NamedPipeClientStream(".", Name(directory), PipeDirection.InOut, PipeOptions.Asynchronous);
                    try {
                        client.Connect(1000);
                        WriteFrame(client, Json.Object("type", "host", "browser", browser), PipeLimit);
                        lock (pipeLock) pipe = client;
                        tell(Json.Object("type", "host", "app", said = "online"));
                        while (true) { byte[] frame = ReadFrame(client, ToBrowserLimit); lock (toBrowser) WriteBytes(output, frame, ToBrowserLimit); }
                    } catch { }
                    lock (pipeLock) pipe = null;
                    try { client.Dispose(); } catch { }
                    if (said != "offline") tell(Json.Object("type", "host", "app", said = "offline"));
                    Thread.Sleep(3000);
                }
            }) { IsBackground = true }.Start();
            try {
                while (true) {
                    byte[] frame = ReadFrame(input, PipeLimit);
                    lock (pipeLock) { if (pipe != null) try { WriteBytes(pipe, frame, PipeLimit); } catch { } }
                }
            } catch (EndOfStreamException) { /* the browser let go */ }
            catch (Exception error) { Console.Error.WriteLine("Memoir host: " + error.GetType().Name + ": " + error.Message); }
            Environment.Exit(0);
        }
        [StructLayout(LayoutKind.Sequential)] private struct ProcessBasic { public IntPtr Reserved, Peb, Reserved2, Reserved3, ProcessId, ParentId; }
        [DllImport("ntdll.dll")] private static extern int NtQueryInformationProcess(IntPtr process, int information, out ProcessBasic basic, int size, out int returned);
        // The browser that started this host: Chrome and Edge start native hosts through cmd.exe, so past that
        private static string ParentExecutable() {
            try {
                var process = Process.GetCurrentProcess();
                for (int depth = 0; depth < 4; depth++) {
                    ProcessBasic basic; int returned;
                    if (NtQueryInformationProcess(process.Handle, 0, out basic, Marshal.SizeOf(typeof(ProcessBasic)), out returned) != 0) break;
                    var parent = Process.GetProcessById(basic.ParentId.ToInt32()); process.Dispose(); process = parent;
                    string name = parent.ProcessName.ToLowerInvariant() + ".exe";
                    if (name != "cmd.exe" && name != "conhost.exe") { parent.Dispose(); return name; }
                }
                process.Dispose();
            } catch { }
            return "chrome.exe";
        }
        public void Dispose() { lock (open) { disposed = true; foreach (var pipe in open.ToArray()) try { pipe.Dispose(); } catch { } open.Clear(); } lock (states) states.Clear(); }
    }
}
