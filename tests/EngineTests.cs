using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Memoir {
    internal static class EngineTests {
        static int checks;
        static string root;
        static Store Fresh() { return new Store(Path.Combine(root, Guid.NewGuid().ToString("N"))); }
        static long At(string value) { return DateTimeOffset.Parse(value).ToUnixTimeMilliseconds(); }
        static Target App(string domain = "app:notepad.exe", string title = "Notes") { return new Target { Domain = domain, Title = title, Origin = domain.StartsWith("app:") ? null : "https://" + domain }; }
        static void Eq(double actual, double expected, string name) { ++checks; if (Math.Abs(actual - expected) > .01) throw new Exception(name + ": expected " + expected + ", got " + actual); }
        static void True(bool value, string name) { ++checks; if (!value) throw new Exception(name); }
        static Engine UTC(Store store) { return new Engine(store, TimeZoneInfo.Utc); }
        static double Site(Store s, string day, string domain) { return Json.Number(Json.Get(Json.Map(Engine.Normalize(Json.Get(s.Data, "day:" + day))["s"]), domain)); }
        static double Hour(Store s, string day, int hour) { return Json.Number(Json.Array(Engine.Normalize(Json.Get(s.Data, "day:" + day))["h"])[hour]); }
        static void Main(string[] args) {
            root = args[0]; Directory.CreateDirectory(root);
            long t = At("2026-10-03T12:00:00Z");
            var s = Fresh(); var e = UTC(s);
            e.Observe(App(), t, 0); e.Observe(App("example.com"), t + 10000, 0); e.Flush(t + 15000);
            Eq(Site(s, "2026-10-03", "app:notepad.exe"), 10000, "App switch credits the previous app once");
            Eq(Site(s, "2026-10-03", "example.com"), 5000, "Website replaces app time");
            Eq(Json.Number(e.Session["start"]), t + 15000, "Sync moves the live session start");
            e.Flush(t + 15000); Eq(e.Total("2026-10-03"), 15000, "Repeated sync cannot double count");
            e.Stop(t + 17000); True(e.Session == null, "Stop removes live session"); Eq(e.Total("2026-10-03"), 17000, "Stop saves the final slice");
            True(Json.Map(Engine.Normalize(s.Data["day:2026-10-03"])["ti"]).Count == 0, "Titles are off by default");
            True(Json.Map(s.Data["origins"]).ContainsKey("example.com"), "Website origin saved locally");

            s = Fresh(); e = UTC(s); e.Observe(App(), t, 0);
            for (int i = 1; i <= 90; i++) { e.Observe(App(), t + i * 1000, i * 1000); e.Pulse(t + i * 1000); }
            Eq(e.Total("2026-10-03"), 60000, "Idle time stops exactly at sixty seconds"); True(e.Session == null, "Idle clears session");
            var media = App(); media.Audible = true;
            e.Observe(media, t + 91000, 91000);
            for (int i = 92; i <= 120; i++) e.Observe(media, t + i * 1000, i * 1000);
            e.Flush(t + 120000); Eq(e.Total("2026-10-03"), 89000, "Audible foreground app counts while idle");
            e.Suspend(t + 121000); e.Observe(media, t + 122000, 0); True(e.Session == null, "Locked or sleeping device cannot track audio");
            e.Resume(); e.Observe(App(), t + 300000, 0); e.Flush(t + 301000); Eq(e.Total("2026-10-03"), 91000, "Resume excludes suspended time");
            e.Observe(App(), t + 600000, 0); e.Flush(t + 601000); Eq(e.Total("2026-10-03"), 92000, "Unexpected timer gaps do not count sleep");

            s = Fresh(); e = UTC(s); e.Observe(App(), t, 0); e.Stop(t + 3000);
            s.Set(Json.Object("settings", Json.Object("paused", true))); e.Observe(App(), t + 4000, 0); e.Flush(t + 5000);
            Eq(e.Total("2026-10-03"), 3000, "Pause counts no new time"); True(e.Session == null, "Pause removes live target");
            s.Set(Json.Object("settings", Json.Object("titles", true, "excluded", new object[] { "example.com", "app:notepad.exe" })));
            e.Observe(App("sub.example.com", "Sensitive page"), t + 6000, 0); e.Flush(t + 8000); e.Observe(App(), t + 9000, 0); e.Stop(t + 11000);
            Eq(Site(s, "2026-10-03", "~private"), 5000, "Excluded apps and subdomains are anonymous but count");
            string encoded = Json.Encode(s.Data);
            True(!encoded.Contains("Sensitive page") && !encoded.Contains("https://sub"), "Private titles and origins never reach history");
            True(!Json.Map(Engine.Normalize(s.Data["day:2026-10-03"])["s"]).ContainsKey("app:notepad.exe") || Site(s,"2026-10-03","app:notepad.exe") == 3000, "Exclusion adds no identifying app time");
            True(!Engine.Excluded("app:my.notepad.exe", new object[]{"notepad.exe"}), "App exclusions do not use website suffix matching");

            s = Fresh(); e = UTC(s);
            e.Commit(App(), At("2026-10-03T23:59:50Z"), At("2026-10-04T00:00:10Z"), Json.Object());
            Eq(e.Total("2026-10-03"), 10000, "Midnight splits previous day"); Eq(e.Total("2026-10-04"), 10000, "Midnight splits next day");
            Eq(Hour(s,"2026-10-03",23),10000,"Midnight previous hour"); Eq(Hour(s,"2026-10-04",0),10000,"Midnight next hour");
            s = Fresh(); e = new Engine(s, TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time"));
            e.Commit(App(), At("2026-03-08T06:30:00Z"), At("2026-03-08T08:30:00Z"), Json.Object());
            Eq(e.Total("2026-03-08"),7200000,"Spring DST preserves elapsed time"); Eq(Hour(s,"2026-03-08",2),0,"Missing DST hour stays empty");
            e.Commit(App(), At("2026-11-01T05:30:00Z"), At("2026-11-01T07:30:00Z"), Json.Object());
            Eq(Hour(s,"2026-11-01",1),5400000,"Repeated DST hour accumulates both occurrences"); Eq(e.Total("2026-11-01"),7200000,"Autumn DST preserves elapsed time");

            s = Fresh(); e = UTC(s); int notifications = 0; e.Notification += delegate { ++notifications; };
            s.Set(Json.Object("goal", Json.Object("history", new object[]{Json.Object("from","2026-10-04","limit",120000),Json.Object("from","2026-10-01","limit",60000)})));
            Eq(e.Limit("2026-10-03"),60000,"Goal respects effective day even with unsorted history"); Eq(e.Limit("2026-09-30"),0,"Goal never applies retroactively");
            e.Commit(App(),t,t+57000,Json.Object()); e.CheckGoal(t+57000); e.CheckGoal(t+58000); Eq(notifications,1,"95 percent reminder is emitted once");
            e.Commit(App(),t+57000,t+61000,Json.Object()); e.CheckGoal(t+61000); e.CheckGoal(t+62000); Eq(notifications,2,"Over-limit reminder is emitted once");
            s.Set(Json.Object("goal", Json.Object("history", new object[]{Json.Object("from","2026-10-04","limit",1000)}))); e.Observe(App(),At("2026-10-03T23:59:59Z"),0);
            e.CheckGoal(At("2026-10-04T00:00:02Z")); Eq(notifications,3,"Pending time after midnight participates in next day's limit");

            s = Fresh(); e = UTC(s); var settings = Json.Object("titles",true);
            for (int i=0;i<40;i++) e.Commit(App("example.com","Page "+i),t+i*1000,t+(i+1)*1000,settings);
            var titles=Json.Map(Json.Get(Json.Map(Engine.Normalize(s.Data["day:2026-10-03"])["ti"]),"example.com"));
            Eq(titles.Count,31,"Title storage is capped with an anonymous overflow bucket"); Eq(titles.Values.Sum(v=>Json.Number(v)),40000,"Title cap does not lose elapsed time");
            s.Set(Json.Object("settings",Json.Object("retention",91),"day:2026-07-04",Engine.Normalize(null),"day:2026-07-05",Engine.Normalize(null)));
            e.Prune(new DateTime(2026,10,3)); True(!s.Data.ContainsKey("day:2026-07-04") && s.Data.ContainsKey("day:2026-07-05"),"Retention includes today and ninety previous days");
            s.Save(); var reload=new Store(Path.GetDirectoryName(s.FilePath)); True(Json.Encode(s.Data)==Json.Encode(reload.Data),"History survives a full store reload");
            s.Set(Json.Object("probe",1)); s.Save(); File.WriteAllText(s.FilePath,"{damaged"); var recovery=new Store(Path.GetDirectoryName(s.FilePath));
            True(!recovery.Data.ContainsKey("probe") && Directory.GetFiles(Path.GetDirectoryName(s.FilePath),"*.damaged-*").Length==1,"Corrupted history recovers backup and preserves damaged file");
            var copy=recovery.Get(null); copy["probe"]=2; True(!recovery.Data.ContainsKey("probe"),"Storage reads cannot mutate persisted objects");
            True(Json.Text(Json.Get(recovery.Get(Json.Object("fallback","yes")),"fallback"))=="yes","Storage object defaults match browser API");
            True(BrowserProbe.Domain("https://www.Example.com/path?q=private") == "example.com","Browser stores domain only");
            True(BrowserProbe.Domain("chrome://settings") == null && BrowserProbe.Domain("file:///private.txt") == null && BrowserProbe.Domain("typing a search") == null,"Internal pages and typed searches are not websites");
            True(BrowserProbe.Domain("localhost:3000/test") == "localhost" && BrowserProbe.Domain("example.com/path") == "example.com","Browser accepts hidden-scheme address bars");
            s=Fresh(); e=UTC(s); e.Observe(App(),t,0); e.Stop(t+120000);
            Eq(e.Total("2026-10-03"),0,"A foreground change after an unexplained sleep cannot credit the gap");
            s=Fresh(); e=UTC(s); e.Observe(App("~private","Incognito title"),t,0);
            True(e.Session["title"]==null && e.Session["origin"]==null,"Private sessions never expose names to the interface");
            e.Flush(t+5000); Eq(Site(s,"2026-10-03","~private"),5000,"Private browser windows still count anonymously");
            s=Fresh(); e=UTC(s); e.Commit(App("secret.example","Sensitive title"),t,t+10000,Json.Object("titles",true));
            s.Set(Json.Object("apps",Json.Object("app:notepad.exe",Json.Object("name","Notepad")),"categories",Json.Object("secret.example","work")));
            s.Save(); s.Set(Json.Object("probe",1)); s.Save();
            s.Set(Json.Object("settings",Json.Object("excluded",new object[]{"secret.example","app:notepad.exe"})));e.EnforcePrivacy();s.Save();
            foreach(string file in new[]{s.FilePath,s.FilePath+".backup"}){
                var saved=Json.Map(Json.Decode(File.ReadAllText(file)));var day=Engine.Normalize(saved["day:2026-10-03"]);
                True(!Json.Map(day["s"]).ContainsKey("secret.example") && !Json.Map(day["ti"]).ContainsKey("secret.example"),"Private activity is scrubbed from "+Path.GetFileName(file));
                Eq(Json.Number(Json.Get(Json.Map(day["s"]),"~private")),10000,"Privacy preserves totals in "+Path.GetFileName(file));
                True(!Json.Map(saved["origins"]).ContainsKey("secret.example") && !Json.Map(saved["apps"]).ContainsKey("app:notepad.exe"),"Private identity metadata is scrubbed from "+Path.GetFileName(file));
            }
            s=Fresh();e=UTC(s);e.Commit(App("example.com","Erase this title"),t,t+1000,Json.Object("titles",true));s.Save();s.Set(Json.Object("probe",1));s.Save();e.EraseTitles();s.Save();
            True(!File.ReadAllText(s.FilePath).Contains("Erase this title") && !File.ReadAllText(s.FilePath+".backup").Contains("Erase this title"),"Erase titles includes the recovery backup");
            Console.WriteLine("PASS: " + checks + " tracking, privacy, time, notification, and durability checks.");
        }
    }
}
