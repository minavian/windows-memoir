using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Memoir {
    // The shared merge cases (tests/merge-cases/merge.json, the same file as the extension's) against
    // src/SyncData.cs: each result must equal the case's, which is also what the extension's code gives.
    internal static class SyncTests {
        static int checks, failures;
        static object Hours(object h) {
            if (h is IList) return h;
            var map = Json.Map(h); return Enumerable.Range(0, 24).Select(i => (object)Json.Number(Json.Get(map, i.ToString()))).ToArray();
        }
        static Dictionary<string, object> Day(object value) {
            var d = value as Dictionary<string, object>; if (d == null) return null;
            var copy = Json.Clone(d); copy["h"] = Hours(Json.Get(d, "h"));
            foreach (string field in new[] { "ti", "th", "tu" }) if (!copy.ContainsKey(field)) copy[field] = new Dictionary<string, object>();
            if (!copy.ContainsKey("tp")) copy["tp"] = new object[0];
            return copy;
        }
        static void Check(object got, object want, string name) {
            ++checks;
            string g = got == null ? "null" : SyncData.Canonical(got), w = want == null ? "null" : SyncData.Canonical(want);
            if (g != w) { ++failures; Console.WriteLine("FAIL " + name + "\n  got  " + g + "\n  want " + w); }
        }
        static int Main(string[] args) {
            var cases = Json.Map(Json.Decode(File.ReadAllText(args[0])));
            foreach (object item in Json.Array(cases["merge"])) {
                var c = Json.Map(item);
                Check(SyncData.MergeDay(Engine.Normalize(Day(c["a"])), Engine.Normalize(Day(c["b"]))), Day(c["out"]), "merge: " + Json.Text(c["name"]));
            }
            foreach (object item in Json.Array(cases["clean"])) {
                var c = Json.Map(item); var input = c["in"] as Dictionary<string, object>;
                if (input != null) { input = Json.Clone(input); input["h"] = Hours(Json.Get(input, "h")); }
                Check(SyncData.CleanDay(input), Day(c["out"]), "clean: " + Json.Text(c["name"]));
            }
            foreach (object item in Json.Array(cases["anonymize"])) {
                var c = Json.Map(item); var rec = Engine.Normalize(Day(c["in"]));
                SyncData.AnonymizeDay(rec, c["list"]);
                Check(rec, Day(c["out"]), "anonymize: " + Json.Text(c["name"]));
            }
            if (failures > 0) { Console.WriteLine(failures + " of " + checks + " shared merge cases failed."); return 1; }
            Console.WriteLine("PASS: " + checks + " shared merge cases (the same as the extension's).");
            return 0;
        }
    }
}
