using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;

namespace Memoir {
    // The link's pipe and native host (BrowserLink.cs): connections held open and two-way, one per browser
    // profile; the tab in front from the extension (or the old connector); the real host relaying both ways.
    internal static class BrowserLinkTests {
        static int checks;
        static void Check(bool valid, string message) { ++checks; if (!valid) throw new Exception(message); }
        static NamedPipeClientStream Open(string path, string browser) {
            var pipe = new NamedPipeClientStream(".", BrowserLink.Name(path), PipeDirection.InOut); pipe.Connect(3000);
            BrowserLink.WriteFrame(pipe, Json.Object("type", "host", "browser", browser), BrowserLink.PipeLimit); return pipe;
        }
        static void Tab(Stream pipe, object tab) { BrowserLink.WriteFrame(pipe, Json.Object("type", "tab", "tab", tab), BrowserLink.PipeLimit); }
        static Dictionary<string, object> Next(Stream stream) { return Json.Map(Json.Decode(Encoding.UTF8.GetString(BrowserLink.ReadFrame(stream, BrowserLink.PipeLimit)))); }
        static int Main(string[] args) {
            string path = args[0]; Directory.CreateDirectory(path);
            if (args.Length > 1 && args[1] == "--native-host") { BrowserLink.NativeHost(path, true); return 0; }
            Peer messaged = null; Dictionary<string, object> received = null;
            using (var done = new AutoResetEvent(false)) using (var heard = new AutoResetEvent(false)) using (var closed = new AutoResetEvent(false)) using (var link = new BrowserLink(path)) {
                link.Changed += delegate { done.Set(); };
                link.Message += delegate(Peer peer, Dictionary<string, object> message) { messaged = peer; received = message; heard.Set(); };
                link.Closed += delegate { closed.Set(); };
                var one = Open(path, "chrome.exe"); var two = Open(path, "chrome.exe"); var edge = Open(path, "msedge.exe");
                Tab(one, Json.Object("focused", true, "url", "https://example.com", "audible", true, "muted", false, "title", "Example"));
                Check(done.WaitOne(3000), "A held-open connection carries the tab in front");
                var tab = link.Current("chrome.exe"); Check(tab != null && Json.Text(tab["url"]) == "https://example.com" && Json.Bool(tab["audible"]), "Exact active-tab URL and audio reach the tracker");
                Check(link.Current("msedge.exe") == null, "One browser cannot claim another browser's foreground time");
                tab["url"] = "changed"; Check(Json.Text(link.Current("chrome.exe")["url"]) == "https://example.com", "Clients cannot mutate cached metadata");
                Tab(two, Json.Object("focused", true, "url", "https://second.example", "audible", false, "muted", true));
                Check(done.WaitOne(3000) && Json.Text(link.Current("chrome.exe")["url"]) == "https://second.example", "Latest profile wins even when timestamps coincide");
                Tab(one, Json.Object("focused", false)); Check(done.WaitOne(3000), "Lost focus arrives");
                Tab(two, Json.Object("focused", false)); Check(done.WaitOne(3000) && link.Current("chrome.exe") == null, "Background browser audio cannot keep an unrelated tab active");
                Tab(edge, Json.Object("focused", true, "incognito", true, "url", "https://private.example", "audible", false));
                Check(done.WaitOne(3000) && Json.Bool(link.Current("msedge.exe")["incognito"]), "Private-window status reaches privacy filtering");
                BrowserLink.WriteFrame(edge, Json.Object("focused", true, "url", "https://old.example"), BrowserLink.PipeLimit);
                Check(done.WaitOne(3000) && Json.Text(link.Current("msedge.exe")["url"]) == "https://old.example", "The old connector's messages (no type) still count");
                BrowserLink.WriteFrame(one, Json.Object("type", "hello", "device", "test-device"), BrowserLink.PipeLimit);
                Check(heard.WaitOne(3000) && Json.Text(received["type"]) == "hello" && messaged != null, "Other messages reach the sync, with their connection");
                Check(messaged.Send(Json.Object("type", "ack", "seq", 7)) && Json.Number(Next(one)["seq"]) == 7, "The app answers on the same connection");
                edge.Dispose(); Check(closed.WaitOne(3000) && done.WaitOne(3000) && link.Current("msedge.exe") == null, "A closed connection takes its tab with it");
                one.Dispose(); two.Dispose();
                Thread.Sleep(500); done.Reset(); heard.Reset(); // their closing signals too: let them settle

                // the real host: relays both ways, says when the app is there
                string exe = Process.GetCurrentProcess().MainModule.FileName;
                // .NET would put a UTF-8 byte-order mark in the child's stdin; a browser never does
                try { Console.InputEncoding = new UTF8Encoding(false); } catch { }
                var host = Process.Start(new ProcessStartInfo(exe, "\"" + path + "\" --native-host") { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true });
                var toHost = host.StandardInput.BaseStream; var fromHost = host.StandardOutput.BaseStream;
                Check(Json.Text(Next(fromHost)["app"]) == "online", "The host says the app is open");
                BrowserLink.WriteFrame(toHost, Json.Object("type", "tab", "tab", Json.Object("focused", true, "url", "https://relay.example")), BrowserLink.PipeLimit);
                bool relayed = done.WaitOne(3000); string starter = Path.GetFileNameWithoutExtension(exe).ToLowerInvariant() + ".exe"; var now = link.Current(starter);
                if (now == null || Json.Text(now["url"]) != "https://relay.example") Console.WriteLine("relay: changed=" + relayed + " current=" + (now == null ? "null" : Json.Encode(now)) + " hostExited=" + host.HasExited + " stderr=" + (host.HasExited ? host.StandardError.ReadToEnd() : ""));
                Check(now != null && Json.Text(now["url"]) == "https://relay.example", "The host relays the browser's messages to the app");
                Check(link.Knows(starter) && link.Current("chrome.exe") == null, "Any browser that starts the host counts as one, under its own name (not Chrome's)");
                BrowserLink.WriteFrame(toHost, Json.Object("type", "hello", "device", "relay-device"), BrowserLink.PipeLimit);
                Check(heard.WaitOne(3000) && messaged.Send(Json.Object("type", "hello", "kind", "windows")) && Json.Text(Next(fromHost)["kind"]) == "windows", "The host relays the app's answers to the browser");
                link.Dispose();
                Check(Json.Text(Next(fromHost)["app"]) == "offline", "The host says when the app has closed");
                toHost.Close(); Check(host.WaitForExit(5000), "The host ends when the browser lets go");
            }
            using (var stream = new MemoryStream()) { BrowserLink.WriteFrame(stream, Json.Object("text", "Unicode ✓ 日本語"), BrowserLink.PipeLimit); stream.Position = 0; Check(Json.Text(Next(stream)["text"]) == "Unicode ✓ 日本語", "UTF-8 frames survive"); }
            bool rejected = false; try { using (var stream = new MemoryStream(BitConverter.GetBytes(BrowserLink.PipeLimit + 1))) BrowserLink.ReadFrame(stream, BrowserLink.PipeLimit); } catch (InvalidDataException) { rejected = true; } Check(rejected, "Oversized native messages are rejected");
            rejected = false; try { using (var stream = new MemoryStream(new byte[] { 4, 0, 0, 0, 1 })) BrowserLink.ReadFrame(stream, BrowserLink.PipeLimit); } catch (EndOfStreamException) { rejected = true; } Check(rejected, "Truncated native messages are rejected");
            rejected = false; try { BrowserLink.WriteFrame(new MemoryStream(), new string('x', BrowserLink.ToBrowserLimit + 10), BrowserLink.ToBrowserLimit); } catch (InvalidDataException) { rejected = true; } Check(rejected, "Nothing over 1 MB goes to a browser");
            Console.WriteLine("PASS: " + checks + " native browser link checks.");
            return 0;
        }
    }
}
