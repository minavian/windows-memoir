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
using System.Threading.Tasks;

namespace Memoir {
    // Optional browser connector: exact active-tab URL and audio, over a local pipe.
    internal sealed class BrowserLink : IDisposable {
        private readonly string pipeName;
        private readonly Dictionary<string, Dictionary<string, object>> states = new Dictionary<string, Dictionary<string, object>>();
        private NamedPipeServerStream server;
        private bool disposed;
        private long sequence;
        public event Action Changed;
        public BrowserLink(string dataDirectory) { pipeName = Name(dataDirectory); Task.Run((Action)Listen); }
        internal static string Name(string directory) { return "Memoir.Browser." + Identity.IconName(Path.GetFullPath(directory).ToLowerInvariant()).Replace(".png", ""); }
        private void Listen() {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
            while (!disposed) {
                try {
                    var pipe = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 32768, 32768, security);
                    lock (states) { if (disposed) { pipe.Dispose(); break; } server = pipe; }
                    using (pipe) {
                        pipe.WaitForConnection();
                        var message = Json.Map(Json.Decode(Encoding.UTF8.GetString(ReadFrame(pipe))));
                        string source = Json.Text(Json.Get(message, "source")), browser = Json.Text(Json.Get(message, "browser"));
                        if (source.Length > 0 && source.Length < 80 && BrowserProbe.IsBrowser(browser)) {
                            message["received"] = Engine.Now;
                            lock (states) { if (states.Count >= 16 && !states.ContainsKey(source)) states.Clear(); message["sequence"] = ++sequence; states[source] = message; }
                            var handler = Changed; if (handler != null) handler();
                        }
                    }
                } catch { if (disposed) break; System.Threading.Thread.Sleep(1000); }
            }
        }
        public Dictionary<string, object> Current(string executable) {
            lock (states) {
                return states.Values.Where(s => Json.Text(Json.Get(s,"browser")) == executable && Json.Bool(Json.Get(Json.Map(Json.Get(s,"tab")),"focused")) && Engine.Now - Json.Number(Json.Get(s,"received")) < 45000)
                    .OrderByDescending(s => Json.Number(Json.Get(s,"sequence"))).Select(s => Json.Clone(Json.Map(Json.Get(s,"tab")))).FirstOrDefault();
            }
        }
        internal static byte[] ReadFrame(Stream stream) {
            byte[] header = Read(stream,4); int length = BitConverter.ToInt32(header,0);
            if (length < 0 || length > 32768) throw new InvalidDataException("Invalid local browser message length.");
            return Read(stream,length);
        }
        private static byte[] Read(Stream stream, int count) { byte[] bytes=new byte[count]; int offset=0; while(offset<count){int read=stream.Read(bytes,offset,count-offset);if(read==0)throw new EndOfStreamException();offset+=read;}return bytes; }
        internal static void WriteFrame(Stream stream, object message) { byte[] bytes=Encoding.UTF8.GetBytes(Json.Encode(message)); if(bytes.Length>32768)throw new InvalidDataException();byte[] header=BitConverter.GetBytes(bytes.Length);stream.Write(header,0,4);stream.Write(bytes,0,bytes.Length);stream.Flush(); }
        private static bool Relay(string dataDirectory, string source, string browser, object tab) {
            try { using(var pipe=new NamedPipeClientStream(".",Name(dataDirectory),PipeDirection.Out)){pipe.Connect(500);WriteFrame(pipe,Json.Object("source",source,"browser",browser,"tab",tab));}return true;} catch{return false;}
        }
        internal static void NativeHost(string dataDirectory) {
            string source=Guid.NewGuid().ToString("N"), browser=ParentExecutable();
            using(var input=Console.OpenStandardInput()) using(var output=Console.OpenStandardOutput()) {
                try { while(true) { var tab=Json.Map(Json.Decode(Encoding.UTF8.GetString(ReadFrame(input)))); bool connected=Relay(dataDirectory,source,browser,tab); WriteFrame(output,Json.Object("connected",connected)); } } catch { }
                Relay(dataDirectory,source,browser,Json.Object("focused",false));
            }
        }
        [StructLayout(LayoutKind.Sequential)] private struct ProcessBasic { public IntPtr Reserved, Peb, Reserved2, Reserved3, ProcessId, ParentId; }
        [DllImport("ntdll.dll")] private static extern int NtQueryInformationProcess(IntPtr process,int information,out ProcessBasic basic,int size,out int returned);
        private static string ParentExecutable() {
            try { using(var current=Process.GetCurrentProcess()){ProcessBasic basic;int returned;if(NtQueryInformationProcess(current.Handle,0,out basic,Marshal.SizeOf(typeof(ProcessBasic)),out returned)==0)using(var parent=Process.GetProcessById(basic.ParentId.ToInt32()))return parent.ProcessName.ToLowerInvariant()+".exe";} }catch{}
            return "chrome.exe";
        }
        public void Dispose() { lock(states) {disposed=true; if(server!=null)server.Dispose();states.Clear();} }
    }
}
