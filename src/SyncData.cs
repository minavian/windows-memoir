using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Memoir {
    // Days from outside (the extension, once linked) on the same rules as the extension's shared/core.js:
    // cleanDay, mergeDay and anonymizeDay. tests/merge-cases/merge.json is shared by the two (SyncTests.cs
    // here, tests/merge.test.mjs there), so the two always agree. Change one, change both.
    internal static class SyncData {
        public const double HourMs = 3600000;
        public static readonly string[] PageKeys = { "~memoir", "~newtab", "~browser", "~extensions", "~files" };
        private static readonly Regex AppKey = new Regex("^app:[^<>:\"/\\\\|?*\\x00-\\x1f]+\\.exe$");
        private static readonly Regex HostName = new Regex("^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$");
        private static readonly Regex HourKey = new Regex("^([0-9]|1[0-9]|2[0-3])$");
        private static readonly Regex Tracking = new Regex("^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|igsh|yclid|_hsenc|_hsmi|ref_src|si)$", RegexOptions.IgnoreCase);
        private static readonly string[] Reserved = { "__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof", "isprototypeof", "propertyisenumerable", "tolocalestring" };

        public static bool IsApp(string d) { return d != null && AppKey.IsMatch(d); }
        public static bool IsPage(string d) { return Array.IndexOf(PageKeys, d) >= 0; }
        private static bool IsReserved(string k) { return Array.IndexOf(Reserved, k.ToLowerInvariant()) >= 0; }

        // a name the tracker could have written: a website, Private, a kind of page or a Windows app
        public static string SiteKey(string d) {
            if (d == null) return null;
            if (d == "~private" || IsPage(d) || IsApp(d)) return d;
            if (IsReserved(d) || d.StartsWith("www.") || !HostName.IsMatch(d)) return null;
            var labels = d.Split('.');
            if (labels.All(l => l.All(char.IsDigit)) && (labels.Length != 4 || labels.Any(l => l.Length > 3 || int.Parse(l) > 255))) return null;
            return d;
        }
        public static string TitleKey(string t) { return t != null && t.Length <= 256 && !IsReserved(t) ? t : null; }

        // The address a page title links to: a web page on that site, no login, no #, no tracking tags
        public static string CleanUrl(object value, string domain) {
            string url = value as string; Uri uri;
            if (url == null || url.Length > 4000 || !Uri.TryCreate(url, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https")) return null;
            string host = uri.Host.ToLowerInvariant(); if (host.StartsWith("www.")) host = host.Substring(4);
            if (domain != null && host != domain && !host.EndsWith("." + domain)) return null;
            string query = String.Join("&", uri.Query.TrimStart('?').Split(new[] { '&' }, StringSplitOptions.RemoveEmptyEntries).Where(p => !Tracking.IsMatch(Uri.UnescapeDataString(p.Split('=')[0]))));
            string start = uri.Scheme + "://" + uri.Host.ToLowerInvariant() + (uri.IsDefaultPort ? "" : ":" + uri.Port) + uri.AbsolutePath;
            string result = start + (query.Length > 0 ? "?" + query : "");
            if (result.Length > 500) result = start;
            return result.Length > 500 ? null : result;
        }

        private static bool IsNumber(object v) { return v is int || v is long || v is double || v is decimal || v is float; }
        private static double? Ms(object v) {
            if (!IsNumber(v)) return null; double d = Convert.ToDouble(v);
            return Double.IsNaN(d) || Double.IsInfinity(d) || d < 0 ? (double?)null : Math.Floor(d + 0.5);
        }
        private static Dictionary<string, object> Times(object map, Func<string, string> keyOf) {
            var result = new Dictionary<string, object>(); var m = map as Dictionary<string, object>; if (m == null) return result;
            foreach (var pair in m) { string name = keyOf(pair.Key); var t = Ms(pair.Value); if (name != null && t != null) result[name] = t.Value; }
            return result;
        }

        // A day from outside, as clean as one the tracker writes (or null when it isn't a day)
        public static Dictionary<string, object> CleanDay(object value) {
            var v = value as Dictionary<string, object>;
            if (v == null || !(Json.Get(v, "s") is Dictionary<string, object>) || !(Json.Get(v, "h") is IList) || ((IList)Json.Get(v, "h")).Count != 24) return null;
            var hs = new Dictionary<string, object>();
            foreach (var pair in Json.Map(Json.Get(v, "hs"))) {
                if (!HourKey.IsMatch(pair.Key)) continue;
                var clean = Times(pair.Value, SiteKey); if (clean.Count > 0) hs[pair.Key] = clean;
            }
            var ti = new Dictionary<string, object>();
            foreach (var pair in Json.Map(Json.Get(v, "ti"))) {
                if (pair.Key == "~private" || SiteKey(pair.Key) == null) continue;
                var clean = Times(pair.Value, TitleKey); if (clean.Count > 0) ti[pair.Key] = clean;
            }
            var tu = new Dictionary<string, object>();
            foreach (var pair in Json.Map(Json.Get(v, "tu"))) {
                var pages = Json.Map(Json.Get(ti, pair.Key)); var links = pair.Value as Dictionary<string, object>;
                if (!ti.ContainsKey(pair.Key) || links == null) continue;
                foreach (var link in links) {
                    string clean = TitleKey(link.Key) != null && pages.ContainsKey(link.Key) ? CleanUrl(link.Value, pair.Key) : null;
                    if (clean != null) { if (!tu.ContainsKey(pair.Key)) tu[pair.Key] = new Dictionary<string, object>(); ((Dictionary<string, object>)tu[pair.Key])[link.Key] = clean; }
                }
            }
            var th = new Dictionary<string, object>();
            foreach (var pair in Json.Map(Json.Get(v, "th"))) {
                var slot = pair.Value as Dictionary<string, object>;
                if (!HourKey.IsMatch(pair.Key) || slot == null) continue;
                foreach (var site in slot) {
                    if (!ti.ContainsKey(site.Key)) continue;
                    var pages = Json.Map(ti[site.Key]);
                    var clean = Times(site.Value, t => TitleKey(t) != null && pages.ContainsKey(t) ? t : null);
                    if (clean.Count > 0) { if (!th.ContainsKey(pair.Key)) th[pair.Key] = new Dictionary<string, object>(); ((Dictionary<string, object>)th[pair.Key])[site.Key] = clean; }
                }
            }
            var tp = Json.Array(Json.Get(v, "tp")).OfType<string>().Where(d => d != "~private" && SiteKey(d) != null).Distinct().Cast<object>().ToArray();
            var h = ((IList)Json.Get(v, "h")).Cast<object>().Select(x => (object)(Ms(x) ?? 0)).ToArray();
            return Json.Object("s", Times(Json.Get(v, "s"), SiteKey), "h", h, "hs", hs, "ti", ti, "th", th, "tu", tu, "tp", tp);
        }

        private static double Sum(object map) { return Json.Map(map).Values.Sum(x => Json.Number(x)); }
        private static double HourlyTotal(Dictionary<string, object> d) { return Json.Map(d["hs"]).Values.Sum(slot => Sum(slot)); }

        // Each minute once (core.js hourParts): this app files a browser's time twice, under the browser (an app,
        // with all its time) and under the site in front, as Memoir in a browser does. Whatever adds time up
        // counts it once: a browser keeps only the time its sites don't account for.
        public static readonly Regex BrowserApp = new Regex(@"^app:(chrome|msedge|firefox|brave|vivaldi|opera|thorium|chromium|zen|comet|arc|whale|browser|yandex|iridium|librewolf|waterfox|floorp)\.exe$", RegexOptions.IgnoreCase);
        public static bool IsBrowserApp(string d) { return d != null && BrowserApp.IsMatch(d); }
        public static Dictionary<string, double> HourParts(IDictionary<string, double> slot) {
            double browsers = 0, sites = 0;
            foreach (var pair in slot) { if (IsBrowserApp(pair.Key)) browsers += pair.Value; else if (!IsApp(pair.Key)) sites += pair.Value; }
            var parts = new Dictionary<string, double>();
            if (browsers == 0 || sites == 0) { foreach (var pair in slot) parts[pair.Key] = pair.Value; return parts; }
            double keep = Math.Max(0, browsers - sites) / browsers;
            // (JavaScript's Math.round, not .NET's banker's rounding: both sides must agree to the millisecond)
            foreach (var pair in slot) { double v = IsBrowserApp(pair.Key) ? Math.Floor(pair.Value * keep + 0.5) : pair.Value; if (v > 0) parts[pair.Key] = v; }
            return parts;
        }
        public static double HourTotal(IDictionary<string, double> slot) { return HourParts(slot).Values.Sum(); }
        private static Dictionary<string, double> Slot(object map) { var slot = new Dictionary<string, double>(); foreach (var pair in Json.Map(map)) slot[pair.Key] = Json.Number(pair.Value); return slot; }
        // a day's time, each minute once (a day kept without hours by older versions: its names' times)
        public static double DayTotal(Dictionary<string, object> d) {
            var hours = Json.Map(Json.Get(d, "hs"));
            return hours.Count == 0 ? Sum(Json.Get(d, "s")) : hours.Values.Sum(slot => HourTotal(Slot(slot)));
        }

        // A day in both (each normalized): the larger time for each name in each hour, never the sum; no hour
        // holds more than an hour (past that the two counted the same minutes under different names, so they
        // share it); titles the same way, hour by hour; the incoming (b) link wins; deleted-titles lists join.
        // A day kept without hourly detail by older versions: the fuller record wins whole.
        public static Dictionary<string, object> MergeDay(Dictionary<string, object> a, Dictionary<string, object> b) {
            if (Math.Abs(HourlyTotal(a) - Sum(a["s"])) > 1000 || Math.Abs(HourlyTotal(b) - Sum(b["s"])) > 1000) return Json.Clone(Sum(b["s"]) > Sum(a["s"]) ? b : a);
            var s = new Dictionary<string, object>(); var h = new double[24]; var hs = new Dictionary<string, object>();
            for (int hour = 0; hour < 24; hour++) {
                string key = hour.ToString();
                var slot = new Dictionary<string, double>();
                foreach (var from in new[] { a, b }) foreach (var pair in Json.Map(Json.Get(Json.Map(from["hs"]), key))) slot[pair.Key] = Math.Max(slot.ContainsKey(pair.Key) ? slot[pair.Key] : 0, Json.Number(pair.Value));
                if (slot.Count == 0) continue;
                // (a browser and its sites are the same minutes: the hour's time counts them once)
                double total = HourTotal(slot);
                if (total > HourMs) foreach (string name in slot.Keys.ToArray()) slot[name] = Math.Floor(slot[name] * HourMs / total);
                var stored = new Dictionary<string, object>();
                foreach (var pair in slot) { stored[pair.Key] = pair.Value; s[pair.Key] = Json.Number(Json.Get(s, pair.Key)) + pair.Value; }
                hs[key] = stored; h[hour] = HourTotal(slot);
            }
            var ti = new Dictionary<string, object>();
            foreach (var from in new[] { a, b }) foreach (var site in Json.Map(from["ti"])) {
                if (!ti.ContainsKey(site.Key)) ti[site.Key] = new Dictionary<string, object>();
                var into = (Dictionary<string, object>)ti[site.Key];
                foreach (var page in Json.Map(site.Value)) into[page.Key] = Math.Max(Json.Number(Json.Get(into, page.Key)), Json.Number(page.Value));
            }
            var th = new Dictionary<string, object>();
            foreach (var from in new[] { a, b }) foreach (var slot in Json.Map(from["th"])) foreach (var site in Json.Map(slot.Value)) {
                if (!th.ContainsKey(slot.Key)) th[slot.Key] = new Dictionary<string, object>();
                var hourSlot = (Dictionary<string, object>)th[slot.Key];
                if (!hourSlot.ContainsKey(site.Key)) hourSlot[site.Key] = new Dictionary<string, object>();
                var into = (Dictionary<string, object>)hourSlot[site.Key];
                foreach (var page in Json.Map(site.Value)) into[page.Key] = Math.Max(Json.Number(Json.Get(into, page.Key)), Json.Number(page.Value));
            }
            var tu = new Dictionary<string, object>();
            foreach (var from in new[] { a, b }) foreach (var site in Json.Map(from["tu"])) {
                if (!tu.ContainsKey(site.Key)) tu[site.Key] = new Dictionary<string, object>();
                var into = (Dictionary<string, object>)tu[site.Key];
                foreach (var link in Json.Map(site.Value)) into[link.Key] = link.Value;
            }
            var tp = Json.Array(a["tp"]).Concat(Json.Array(b["tp"])).OfType<string>().Distinct().Cast<object>().ToArray();
            return Json.Object("s", s, "h", h.Cast<object>().ToArray(), "hs", hs, "ti", ti, "th", th, "tu", tu, "tp", tp);
        }

        // Never track, on one (normalized) day: an excluded name's time becomes Private, its titles and links
        // go. In place; true when anything changed.
        public static bool AnonymizeDay(Dictionary<string, object> rec, object list) {
            bool changed = false;
            var s = Json.Map(rec["s"]);
            foreach (string d in s.Keys.ToArray()) { if (d == "~private" || !Engine.Excluded(d, list)) continue; s["~private"] = Json.Number(Json.Get(s, "~private")) + Json.Number(s[d]); s.Remove(d); changed = true; }
            foreach (object value in Json.Map(rec["hs"]).Values) {
                var slot = Json.Map(value);
                foreach (string d in slot.Keys.ToArray()) { if (d == "~private" || !Engine.Excluded(d, list)) continue; slot["~private"] = Json.Number(Json.Get(slot, "~private")) + Json.Number(slot[d]); slot.Remove(d); changed = true; }
            }
            foreach (string field in new[] { "ti", "tu" }) { var map = Json.Map(rec[field]); foreach (string d in map.Keys.ToArray()) if (Engine.Excluded(d, list)) { map.Remove(d); changed = true; } }
            foreach (object value in Json.Map(rec["th"]).Values) { var slot = Json.Map(value); foreach (string d in slot.Keys.ToArray()) if (Engine.Excluded(d, list)) { slot.Remove(d); changed = true; } }
            var tp = Json.Array(rec["tp"]);
            if (tp.Any(d => Engine.Excluded(Json.Text(d), list))) { rec["tp"] = tp.Where(d => !Engine.Excluded(Json.Text(d), list)).ToArray(); changed = true; }
            return changed;
        }

        // The same JSON whatever its key order or number types: for telling whether a merge changed anything
        public static string Canonical(object value) { return Json.Encode(Sorted(value)); }
        private static object Sorted(object value) {
            var map = value as IDictionary<string, object>;
            if (map != null) { var result = new SortedDictionary<string, object>(StringComparer.Ordinal); foreach (var pair in map) result[pair.Key] = Sorted(pair.Value); return result; }
            if (value is string || value == null || value is bool) return value;
            if (IsNumber(value)) return Convert.ToDouble(value);
            var list = value as IEnumerable; if (list != null) return list.Cast<object>().Select(Sorted).ToArray();
            return value;
        }
    }
}
