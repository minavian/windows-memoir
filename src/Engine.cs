using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Memoir {
    internal sealed class Target {
        public string Domain, Origin, Title, Name, Category;
        public int ProcessId;
        public bool Audible;
        public Target Copy() { return (Target)MemberwiseClone(); }
    }
    internal sealed class Engine {
        public const long IdleLimit = 60000;
        private readonly Store store;
        private readonly TimeZoneInfo timezone;
        private Target current;
        private long start, since, lastPulse, lastSave, lastObserved;
        private bool suspended;
        private string prunedDay, enforcedExclusions;
        private DateTime nextReminder;
        public event Action<Dictionary<string, object>> SessionChanged;
        public event Action<string, string> Notification;
        public Engine(Store store, TimeZoneInfo timezone) {
            this.store = store; this.timezone = timezone; ScheduleReminder(Local(Now));
            EnforcePrivacy();
        }
        public static long Now { get { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); } }
        public Dictionary<string, object> Settings { get { return Json.Map(Json.Get(store.Data, "settings")); } }
        public bool Paused { get { return Json.Bool(Json.Get(Settings, "paused")); } }
        public static string Day(DateTime date) { return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture); }
        public DateTime Local(long ms) { return TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(ms), timezone).DateTime; }
        public static bool Excluded(string domain, object list) {
            foreach (object item in Json.Array(list)) {
                string ex = Json.Text(item).ToLowerInvariant();
                if (domain.Equals(ex, StringComparison.OrdinalIgnoreCase) || (!domain.StartsWith("app:") && domain.EndsWith("." + ex, StringComparison.OrdinalIgnoreCase))) return true;
            }
            return false;
        }
        private Target Sanitize(Target target) {
            if (target == null || Paused || suspended) return null;
            Target next = target.Copy();
            if (next.Domain == "~private" || Excluded(next.Domain, Json.Get(Settings, "excluded"))) { next.Domain = "~private"; next.Title = next.Origin = null; }
            if (!Json.Bool(Json.Get(Settings, "titles"))) next.Title = null;
            if (next.Title != null) {
                next.Title = Regex.Replace(Regex.Replace(next.Title, @"^\(\d+\+?\)\s*", ""), @"\s+", " ").Trim();
                if (next.Title.Length > 120) next.Title = next.Title.Substring(0, 119) + "…";
                if (next.Title.Length == 0 || next.Title == next.Domain) next.Title = null;
            }
            return next;
        }
        public void Observe(Target target, long now, long idleMs) {
            if (lastObserved > 0 && now - lastObserved > 30000) Stop(lastObserved);
            lastObserved = now;
            if (idleMs >= IdleLimit && (target == null || !target.Audible)) {
                Stop(Math.Max(start, now - (idleMs - IdleLimit))); return;
            }
            Target next = Sanitize(target);
            bool same = current != null && next != null && current.Domain == next.Domain && current.Title == next.Title;
            if (same) { current.Audible = next.Audible; return; }
            bool sameDomain = current != null && next != null && current.Domain == next.Domain;
            long continuedSince = sameDomain ? since : now;
            Flush(now);
            current = next; start = now; since = continuedSince;
            PublishSession();
        }
        public void Stop(long now) { Flush(now); if (current == null) return; current = null; PublishSession(); }
        public void Suspend(long now) { Stop(now); suspended = true; }
        public void Resume() { suspended = false; lastObserved = 0; }
        public void SettingsChanged(long now) { Stop(now); ScheduleReminder(Local(now)); Prune(Local(now)); }
        public void EnforcePrivacy() {
            object excluded = Json.Get(Settings, "excluded");
            if (Json.Array(excluded).Length == 0) { enforcedExclusions = null; return; }
            // The full pass re-serializes all history (~0.7 s per year of it) and runs after every interface write;
            // repeat it only when the list changes or an excluded name reappears (an import, for example).
            string exclusions = Json.Encode(excluded);
            if (exclusions == enforcedExclusions && !Identifies(store.Data, excluded)) return;
            store.BackupFilter = delegate(Dictionary<string, object> data) { Redact(data, Json.Get(Settings, "excluded"), false); };
            store.ScrubBackup(store.BackupFilter);
            var copy = Json.Clone(store.Data); Redact(copy, Json.Get(Settings, "excluded"), false); store.Set(copy);
            enforcedExclusions = exclusions;
        }
        public void EraseTitles() {
            store.BackupFilter = delegate(Dictionary<string, object> data) { Redact(data, Json.Get(Settings, "excluded"), true); };
            store.ScrubBackup(store.BackupFilter);
            var patch = new Dictionary<string, object>();
            foreach (var item in store.Data.Where(p => Regex.IsMatch(p.Key, @"^day:\d{4}-\d{2}-\d{2}$"))) {
                var rec = Normalize(item.Value); rec["ti"] = Json.Object(); patch[item.Key] = rec;
            }
            store.Set(patch);
        }
        private static bool Identifies(Dictionary<string, object> data, object excluded) {
            foreach (var pair in data) {
                if (Regex.IsMatch(pair.Key, @"^day:\d{4}-\d{2}-\d{2}$")) {
                    var rec = Json.Map(pair.Value);
                    if (Json.Map(Json.Get(rec, "s")).Keys.Any(d => Excluded(d, excluded)) || Json.Map(Json.Get(rec, "ti")).Keys.Any(d => Excluded(d, excluded))) return true;
                    foreach (object slot in Json.Map(Json.Get(rec, "hs")).Values) if (Json.Map(slot).Keys.Any(d => Excluded(d, excluded))) return true;
                } else if ((pair.Key == "apps" || pair.Key == "origins" || pair.Key == "categories") && Json.Map(pair.Value).Keys.Any(d => Excluded(d, excluded))) return true;
            }
            return false;
        }
        private static void Redact(Dictionary<string, object> data, object excluded, bool titles) {
            foreach (string key in data.Keys.ToArray()) {
                if (Regex.IsMatch(key, @"^day:\d{4}-\d{2}-\d{2}$")) {
                    var rec = Normalize(data[key]); var sites = Json.Map(rec["s"]);
                    foreach (string domain in sites.Keys.ToArray()) if (Excluded(domain, excluded)) { sites["~private"] = Json.Number(Json.Get(sites, "~private")) + Json.Number(sites[domain]); sites.Remove(domain); }
                    foreach (object value in Json.Map(rec["hs"]).Values) {
                        var slot = Json.Map(value);
                        foreach (string domain in slot.Keys.ToArray()) if (Excluded(domain, excluded)) { slot["~private"] = Json.Number(Json.Get(slot, "~private")) + Json.Number(slot[domain]); slot.Remove(domain); }
                    }
                    var pages = Json.Map(rec["ti"]);
                    foreach (string domain in pages.Keys.ToArray()) if (titles || Excluded(domain, excluded)) pages.Remove(domain);
                    data[key] = rec;
                } else if (key == "apps" || key == "origins" || key == "categories") {
                    var map = Json.Map(data[key]); foreach (string domain in map.Keys.ToArray()) if (Excluded(domain, excluded)) map.Remove(domain);
                }
            }
        }
        public void Flush(long now) {
            if (current != null && lastObserved > 0 && now - lastObserved > 30000) {
                if (lastObserved > start) Commit(current, start, lastObserved, Settings);
                current = null; start = now; PublishSession(); return;
            }
            if (current != null && now > start) Commit(current, start, now, Settings);
            start = now;
            if (current != null) PublishSession();
        }
        public Dictionary<string, object> Session {
            get { return current == null ? null : Json.Object("domain", current.Domain, "origin", current.Origin, "title", current.Title, "start", start, "since", since); }
        }
        private void PublishSession() { if (SessionChanged != null) SessionChanged(Session); }
        public void Pulse(long now) {
            if (now - lastPulse >= 30000) { Flush(now); lastPulse = now; }
            DateTime local = Local(now);
            if (prunedDay != Day(local)) { Prune(local); prunedDay = Day(local); }
            CheckGoal(now);
            if (local >= nextReminder) { WeeklyReminder(local); ScheduleReminder(local.AddMinutes(1)); }
            if (now - lastSave >= 30000) { store.Save(); lastSave = now; }
        }
        public void Commit(Target target, long from, long to, Dictionary<string, object> settings) {
            if (to <= from) return;
            bool priv = target.Domain == "~private" || Excluded(target.Domain, Json.Get(settings, "excluded"));
            string domain = priv ? "~private" : target.Domain;
            string title = !priv && Json.Bool(Json.Get(settings, "titles")) ? target.Title : null;
            var patch = new Dictionary<string, object>();
            while (from < to) {
                DateTime local = Local(from);
                string key = "day:" + Day(local);
                var rec = Normalize(Json.Get(patch, key, Json.Get(store.Data, key)));
                var sites = Json.Map(rec["s"]); var hours = Json.Array(rec["h"]); var slots = Json.Map(rec["hs"]);
                // Advance in real time; DST's repeated/missing hours keep correct totals.
                long remaining = 3600000 - (local.Minute * 60000 + local.Second * 1000 + local.Millisecond);
                long end = Math.Min(to, from + remaining); double ms = end - from;
                string hour = local.Hour.ToString(CultureInfo.InvariantCulture);
                var slot = Json.Map(Json.Get(slots, hour));
                sites[domain] = Json.Number(Json.Get(sites, domain)) + ms;
                hours[local.Hour] = Json.Number(hours[local.Hour]) + ms;
                slot[domain] = Json.Number(Json.Get(slot, domain)) + ms; slots[hour] = slot;
                rec["s"] = sites; rec["h"] = hours; rec["hs"] = slots;
                if (!String.IsNullOrEmpty(title)) {
                    var titles = Json.Map(rec["ti"]); var pages = Json.Map(Json.Get(titles, domain));
                    string name = pages.ContainsKey(title) || pages.Count < 30 ? title : "";
                    pages[name] = Json.Number(Json.Get(pages, name)) + ms; titles[domain] = pages; rec["ti"] = titles;
                }
                patch[key] = rec; from = end;
            }
            if (!priv && !String.IsNullOrEmpty(target.Origin)) { var origins = Json.Clone(Json.Map(Json.Get(store.Data, "origins"))); origins[domain] = target.Origin; patch["origins"] = origins; }
            store.Set(patch);
        }
        public static Dictionary<string, object> Normalize(object value) {
            var rec = Json.Map(value); object[] hours = Json.Array(Json.Get(rec, "h"));
            if (hours.Length != 24) hours = Enumerable.Repeat<object>(0, 24).ToArray();
            return Json.Object("s", Json.Clone(Json.Map(Json.Get(rec, "s"))), "h", hours.ToArray(), "hs", Json.Clone(Json.Map(Json.Get(rec, "hs"))), "ti", Json.Clone(Json.Map(Json.Get(rec, "ti"))));
        }
        // Runs every second while a limit is set, so it reads the stored record instead of cloning it.
        public double Total(string day) { return Json.Map(Json.Get(Json.Map(Json.Get(store.Data, "day:" + day)), "s")).Values.Sum(v => Json.Number(v)); }
        public double Limit(string day) {
            double result = 0; string latest = "";
            foreach (object entry in Json.Array(Json.Get(Json.Map(Json.Get(store.Data, "goal")), "history"))) {
                var map = Json.Map(entry); string from = Json.Text(Json.Get(map, "from"));
                if (String.CompareOrdinal(from, day) <= 0 && String.CompareOrdinal(from, latest) >= 0) { result = Json.Number(Json.Get(map, "limit")); latest = from; }
            }
            return result;
        }
        public void CheckGoal(long now) {
            string day = Day(Local(now)); double limit = Limit(day); if (limit <= 0) return;
            double total = Total(day);
            if (current != null) {
                long midnight = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(Local(now).Date, timezone)).ToUnixTimeMilliseconds();
                total += Math.Max(0, now - Math.Max(start, midnight));
            }
            var saved = Json.Map(Json.Get(store.Data, "goalNotify"));
            var flags = Json.Text(Json.Get(saved, "day")) == day ? Json.Clone(saved) : Json.Object("day", day, "n95", false, "over", false);
            string notificationTitle = null, notificationText = null;
            if (total > limit && !Json.Bool(Json.Get(flags, "over"))) {
                flags["over"] = flags["n95"] = true;
                notificationTitle = "You’ve gone over your daily limit"; notificationText = "Your " + Duration(limit) + " limit is used up — you’re " + Duration(total - limit) + " over.";
            } else if (total >= limit * .95 && total <= limit && !Json.Bool(Json.Get(flags, "n95"))) {
                flags["n95"] = true; notificationTitle = "Almost at your daily limit"; notificationText = Duration(limit - total) + " left of your " + Duration(limit) + " limit today.";
            }
            store.Set(Json.Object("goalNotify", flags));
            if (notificationTitle != null) { store.Save(); Emit(notificationTitle, notificationText); }
        }
        private void Emit(string title, string text) { if (Notification != null) Notification(title, text); }
        private static string Duration(double ms) { int minutes = (int)Math.Floor(ms / 60000); return minutes >= 60 ? (minutes / 60) + "h " + (minutes % 60) + "m" : Math.Max(1, minutes) + "m"; }
        public void Prune(DateTime now) {
            int days = (int)Json.Number(Json.Get(Settings, "retention")); if (days != 0 && days != 365 && days != 182 && days != 91) return; if (days == 0) return;
            string cutoff = "day:" + Day(now.Date.AddDays(-(days - 1)));
            store.Remove(store.Data.Keys.Where(k => Regex.IsMatch(k, @"^day:\d{4}-\d{2}-\d{2}$") && String.CompareOrdinal(k, cutoff) < 0).ToArray());
        }
        public void ScheduleReminder(DateTime from) {
            int weekday = (int)Json.Number(Json.Get(Settings, "reminderDay")), minutes = (int)Json.Number(Json.Get(Settings, "reminderMinutes"), 1140);
            if (weekday < 0 || weekday > 6) weekday = 0; if (minutes < 0 || minutes >= 1440) minutes = 1140;
            nextReminder = from.Date.AddMinutes(minutes).AddDays((weekday - (int)from.DayOfWeek + 7) % 7); if (nextReminder <= from) nextReminder = nextReminder.AddDays(7);
        }
        private void WeeklyReminder(DateTime now) {
            if (!Json.Bool(Json.Get(Settings, "weeklyReminder"), true)) return;
            DateTime monday = now.Date.AddDays(-((int)now.DayOfWeek + 6) % 7); if (now.DayOfWeek == DayOfWeek.Monday || now.DayOfWeek == DayOfWeek.Tuesday) monday = monday.AddDays(-7);
            string key = Day(monday); if (Json.Text(Json.Get(store.Data, "windowsWeeklyNotified")) == key) return;
            double total = Enumerable.Range(0, 7).Sum(i => Total(Day(monday.AddDays(i))));
            if (total > 300000) { store.Set(Json.Object("windowsWeeklyNotified", key)); store.Save(); Emit("Your week in Memoir", Duration(total) + " of screen time. Open Memoir to see where your time went."); }
        }
    }
}
