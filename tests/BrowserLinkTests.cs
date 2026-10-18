using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;

namespace Memoir {
    internal static class BrowserLinkTests {
        static int checks;
        static void Check(bool valid,string message){++checks;if(!valid)throw new Exception(message);}
        static void Send(string path,object message){using(var pipe=new NamedPipeClientStream(".",BrowserLink.Name(path),PipeDirection.Out)){pipe.Connect(3000);BrowserLink.WriteFrame(pipe,message);}}
        static void Main(string[] args){
            string path=args[0];Directory.CreateDirectory(path);
            if(args.Length>1&&args[1]=="--native-host"){BrowserLink.NativeHost(path);return;}
            using(var done=new AutoResetEvent(false))using(var link=new BrowserLink(path)){
                link.Changed+=delegate{done.Set();};
                Send(path,Json.Object("source","profile1","browser","chrome.exe","tab",Json.Object("focused",true,"url","https://example.com","audible",true,"muted",false,"title","Example")));
                Check(done.WaitOne(3000),"Native pipe accepts connector metadata");
                var tab=link.Current("chrome.exe");Check(tab!=null&&Json.Text(tab["url"])=="https://example.com"&&Json.Bool(tab["audible"]),"Exact active-tab URL and audio reach the tracker");
                Check(link.Current("msedge.exe")==null,"One browser cannot claim another browser's foreground time");
                tab["url"]="changed";Check(Json.Text(link.Current("chrome.exe")["url"])=="https://example.com","Clients cannot mutate cached metadata");
                Send(path,Json.Object("source","profile2","browser","chrome.exe","tab",Json.Object("focused",true,"url","https://second.example","audible",false,"muted",true)));
                Check(done.WaitOne(3000)&&Json.Text(link.Current("chrome.exe")["url"])=="https://second.example","Latest profile wins even when timestamps coincide");
                Send(path,Json.Object("source","profile1","browser","chrome.exe","tab",Json.Object("focused",false)));Check(done.WaitOne(3000),"Lost focus arrives");
                Send(path,Json.Object("source","profile2","browser","chrome.exe","tab",Json.Object("focused",false)));Check(done.WaitOne(3000)&&link.Current("chrome.exe")==null,"Background browser audio cannot keep an unrelated tab active");
                Send(path,Json.Object("source","private","browser","msedge.exe","tab",Json.Object("focused",true,"incognito",true,"url","https://private.example","audible",false)));
                Check(done.WaitOne(3000)&&Json.Bool(link.Current("msedge.exe")["incognito"]),"Private-window status reaches privacy filtering");
            }
            using(var stream=new MemoryStream()){BrowserLink.WriteFrame(stream,Json.Object("text","Unicode ✓ 日本語"));stream.Position=0;Check(Json.Text(Json.Map(Json.Decode(System.Text.Encoding.UTF8.GetString(BrowserLink.ReadFrame(stream))))["text"])=="Unicode ✓ 日本語","Native framing preserves UTF-8");}
            bool rejected=false;try{using(var stream=new MemoryStream(BitConverter.GetBytes(40000)))BrowserLink.ReadFrame(stream);}catch(InvalidDataException){rejected=true;}Check(rejected,"Oversized native messages are rejected");
            rejected=false;try{using(var stream=new MemoryStream(new byte[]{4,0,0,0,1}))BrowserLink.ReadFrame(stream);}catch(EndOfStreamException){rejected=true;}Check(rejected,"Truncated native messages are rejected");
            Console.WriteLine("PASS: "+checks+" native browser connector checks.");
        }
    }
}
