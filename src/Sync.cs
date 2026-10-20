using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace Memoir {
    // The link with the Memoir extension (SYNC-PLAN.md in the extension's repository). Both keep tracking
    // into their own days (day:<date>); what arrives from a linked extension is kept as it came
    // (link:<device>:<date>), and what's shown is both merged (Engine.View, the extension's getDays): the
    // larger time per name per hour, so the same minutes measured on both sides never add up. Each extension
    // (one per browser profile) gets this app's own days merged with any other extension's, never its own
    // back. Settings, Never track, the limit's history and moved categories go to whichever side changed them
    // last; Clear all and Erase titles travel as markers. Icons go where they're missing: an extension asks for
    // the pictures of this app's apps it doesn't have, and this app asks a browser for its websites' icons
    // (kept in icons\sites, named in `favicons`). Runs on the UI thread, where the store lives.
    internal sealed class Sync {
        public const int Protocol = 1;
        private const int BatchBytes = 600 * 1024;   // well under the 1 MB a browser takes from its native host
        private const int IconBytes = 64 * 1024;     // one icon, at most (they're 32 to 40 px)
        private static readonly Regex IconFile = new Regex("^[a-f0-9]{24}\\.png$");
        private static readonly Regex OwnDay = new Regex("^day:(\\d{4}-\\d{2}-\\d{2})$");
        private static readonly Regex DeviceId = new Regex("^[a-z0-9-]{8,64}$");
        private static readonly Regex VersionText = new Regex(@"^\d{1,4}(\.\d{1,4}){1,3}$");
        private static readonly Regex DateKey = new Regex("^\\d{4}-\\d{2}-\\d{2}$");
        // (Appearance too: theme, rainbow, cursor and cursorSmooth are copies of the page's choices, web/shared/appearance.js)
        public static readonly string[] SettingsFields = { "paused", "titles", "retention", "weeklyReminder", "reminderDay", "reminderMinutes", "theme", "rainbow", "cursor", "cursorSmooth" };
        private readonly Control owner;
        private readonly Store store;
        private readonly Engine engine;
        private readonly string version;
        private readonly Action settingsApplied;
        private readonly Dictionary<string, Peer> live = new Dictionary<string, Peer>();          // device → its open connection
        private readonly Dictionary<string, string> deviceOf = new Dictionary<string, string>();  // connection → device
        private readonly Dictionary<string, Dictionary<long, string[]>> inflight = new Dictionary<string, Dictionary<long, string[]>>();
        private readonly HashSet<string> rulesDue = new HashSet<string>();
        private readonly Timer soon = new Timer { Interval = 1500 };
        private Dictionary<string, object> settingsSeen;
        private bool applying;
        private long sequence;
        public event Action<string> Linked;   // a browser linked here for the first time (MainForm: the link tour)
        private readonly List<Action> early = new List<Action>(); // what arrived before the window could take it
        private bool ready;
        private readonly string iconDirectory, siteIconDirectory;
        private readonly HashSet<string> siteSeen = new HashSet<string>();     // websites in days, to check for an icon
        private readonly HashSet<string> siteAsked = new HashSet<string>();    // icons asked for since the app started
        private bool sitesSeeded;

        public Sync(Control owner, Store store, Engine engine, BrowserLink link, string version, string iconDirectory, Action settingsApplied) {
            this.owner = owner; this.store = store; this.engine = engine; this.version = version; this.settingsApplied = settingsApplied;
            this.iconDirectory = iconDirectory; siteIconDirectory = Path.Combine(iconDirectory, "sites");
            try { Directory.CreateDirectory(siteIconDirectory); } catch { }
            PruneSiteIcons();
            settingsSeen = Json.Clone(engine.Settings);
            var record = Record();
            if (Json.Text(Json.Get(record, "device")).Length == 0) record["device"] = Guid.NewGuid().ToString("N");
            foreach (var peer in Peers(record).Values.OfType<Dictionary<string, object>>()) peer["connected"] = false; // nobody's connected yet
            Save(record);
            store.Changed += OnChanged;
            soon.Tick += delegate { soon.Stop(); foreach (string device in live.Keys.ToArray()) Send(device); };
            link.Message += delegate(Peer peer, Dictionary<string, object> message) { Post(delegate { OnMessage(peer, message); }); };
            link.Closed += delegate(Peer peer) { Post(delegate { OnClosed(peer); }); };
            owner.HandleCreated += delegate { lock (early) { foreach (var action in early) try { owner.BeginInvoke(action); } catch { } early.Clear(); ready = true; } };
            if (owner.IsHandleCreated) ready = true;
        }
        // The pipe opens while the app is still starting: a browser's hello can arrive before the window has a
        // handle (BeginInvoke throws then), so it waits for it, in order, instead of being lost.
        private void Post(Action action) {
            lock (early) { if (!ready) { early.Add(action); return; } }
            try { owner.BeginInvoke(action); } catch { }
        }

        // ---------- the sync record: { device, meta, peers: { device: { name, mode, since, pending (dates), lastSync… } } } ----------
        private Dictionary<string, object> Record() { return Json.Clone(Json.Map(Json.Get(store.Data, "sync"))); }
        private void Save(Dictionary<string, object> record) { bool was = applying; applying = true; try { store.Set(Json.Object("sync", record)); } finally { applying = was; } }
        private static Dictionary<string, object> Peers(Dictionary<string, object> record) { if (!(Json.Get(record, "peers") is Dictionary<string, object>)) record["peers"] = new Dictionary<string, object>(); return (Dictionary<string, object>)record["peers"]; }
        private static Dictionary<string, object> Meta(Dictionary<string, object> record) {
            if (!(Json.Get(record, "meta") is Dictionary<string, object>)) record["meta"] = new Dictionary<string, object>();
            var meta = (Dictionary<string, object>)record["meta"];
            foreach (string field in new[] { "settingsAt", "excluded", "categoriesAt" }) if (!(Json.Get(meta, field) is Dictionary<string, object>)) meta[field] = new Dictionary<string, object>();
            return meta;
        }
        private static HashSet<string> Pending(Dictionary<string, object> peer) { return new HashSet<string>(Json.Array(Json.Get(peer, "pending")).OfType<string>()); }
        private static void AddPending(Dictionary<string, object> peer, IEnumerable<string> dates) { var pending = Pending(peer); pending.UnionWith(dates); peer["pending"] = pending.ToArray(); }
        private string DateOf(long ms) { return Engine.Day(engine.Local(ms)); }
        private bool Wanted(Dictionary<string, object> peer, string date) {
            // "Start from today": only days from the day of linking go across
            return Json.Text(Json.Get(peer, "mode")) != "fresh" || String.CompareOrdinal(date, DateOf((long)Json.Number(Json.Get(peer, "since")))) >= 0;
        }
        private static string LinkKey(string device, string date) { return "link:" + device + ":" + date; }
        private string[] LinkPeers() { return Json.Array(Json.Get(store.Data, "linkPeers")).OfType<string>().ToArray(); }
        // this app's day merged with every linked extension's but one (what that one gets)
        private Dictionary<string, object> ViewWithout(string device, string date) {
            var view = Engine.Normalize(Json.Get(store.Data, "day:" + date));
            foreach (string peer in LinkPeers()) {
                if (peer == device) continue;
                object theirs = Json.Get(store.Data, LinkKey(peer, date));
                if (theirs != null) view = SyncData.MergeDay(view, Engine.Normalize(theirs));
            }
            return view;
        }

        // ---------- what changes here goes across ----------
        private void OnChanged(Dictionary<string, object> changes) {
            if (changes.ContainsKey("favicons")) PruneSiteIcons();
            if (applying) return;
            var record = Record(); var peers = Peers(record); var meta = Meta(record); long now = Engine.Now; bool rules = false;
            // this app's own days (sync only ever writes link:… records, and under `applying`)
            var dates = changes.Keys.Select(k => OwnDay.Match(k)).Where(m => m.Success && Json.Map(changes[m.Value]).ContainsKey("newValue")).Select(m => m.Groups[1].Value).ToArray();
            if (dates.Length > 0) foreach (var peer in peers.Values.OfType<Dictionary<string, object>>()) AddPending(peer, dates.Where(d => Wanted(peer, d)));
            if (changes.ContainsKey("settings")) {
                var settings = engine.Settings; var at = Json.Map(meta["settingsAt"]);
                foreach (string field in SettingsFields) if (Json.Encode(Json.Get(settings, field)) != Json.Encode(Json.Get(settingsSeen, field))) { at[field] = now; rules = true; }
                var before = new HashSet<string>(Json.Array(Json.Get(settingsSeen, "excluded")).OfType<string>()); var after = new HashSet<string>(Json.Array(Json.Get(settings, "excluded")).OfType<string>());
                var excluded = Json.Map(meta["excluded"]);
                foreach (string site in after.Except(before)) { excluded[site] = Json.Object("on", true, "at", now); rules = true; }
                foreach (string site in before.Except(after)) { excluded[site] = Json.Object("on", false, "at", now); rules = true; }
                settingsSeen = Json.Clone(settings);
            }
            if (changes.ContainsKey("goal")) { meta["goalAt"] = now; rules = true; }
            if (changes.ContainsKey("categories")) {
                var change = Json.Map(changes["categories"]); var before = Json.Map(Json.Get(change, "oldValue")); var after = Json.Map(Json.Get(change, "newValue")); var at = Json.Map(meta["categoriesAt"]);
                foreach (string site in before.Keys.Union(after.Keys)) if (Json.Text(Json.Get(before, site)) != Json.Text(Json.Get(after, site))) { at[site] = now; rules = true; }
            }
            foreach (string marker in new[] { "wipe", "titlesErased" }) if (changes.ContainsKey(marker)) { double value = Json.Number(Json.Get(store.Data, marker)); if (value > Json.Number(Json.Get(meta, marker))) { meta[marker] = value; rules = true; } }
            if (changes.ContainsKey("goalNotify") || changes.ContainsKey("apps") || changes.ContainsKey("origins")) rules = true;
            if (rules) foreach (string device in peers.Keys) rulesDue.Add(device);
            if (dates.Length > 0 || rules) { Save(record); soon.Stop(); soon.Start(); }
        }

        // ---------- the exchange ----------
        private void OnMessage(Peer peer, Dictionary<string, object> message) {
            string type = Json.Text(Json.Get(message, "type"));
            if (type == "hello") { Hello(peer, message); return; }
            string device; if (!deviceOf.TryGetValue(peer.Id, out device)) return;
            if (type == "rules") ApplyRules(message, device);
            else if (type == "days") ApplyDays(peer, device, message);
            else if (type == "ack") Acked(device, (long)Json.Number(Json.Get(message, "seq")));
            else if (type == "iconWants") SendIcons(peer, Json.Get(message, "apps"));
            else if (type == "icons") KeepSiteIcons(Json.Get(message, "sites"));
            else if (type == "unlink") { Drop(device); peer.Send(Json.Object("type", "unlinked")); }
        }
        private void Hello(Peer peer, Dictionary<string, object> message) {
            string device = Json.Text(Json.Get(message, "device"));
            peer.Send(Json.Object("type", "hello", "protocol", Protocol, "device", Json.Text(Json.Get(Record(), "device")), "kind", "windows", "name", "Memoir for Windows", "version", version));
            if (!DeviceId.IsMatch(device) || (int)Json.Number(Json.Get(message, "protocol")) != Protocol) return;
            var record = Record(); var peers = Peers(record); var linked = Json.Get(message, "linked") as Dictionary<string, object>;
            var known = Json.Get(peers, device) as Dictionary<string, object>;
            if (known == null && linked == null) return; // not linked: the extension only learns the app is here
            // unlinked here while it was away: it unlinks too, unless it has linked again since
            double unlinkedAt = Json.Number(Json.Get(Json.Map(Json.Get(record, "unlinked")), device));
            if (known == null && unlinkedAt > 0 && Json.Number(Json.Get(linked, "since")) <= unlinkedAt) { peer.Send(Json.Object("type", "unlink")); return; }
            bool first = known == null;
            if (known == null) {
                known = Json.Object("mode", Json.Text(Json.Get(linked, "mode")) == "fresh" ? "fresh" : "merge", "since", Json.Number(Json.Get(linked, "since"), Engine.Now), "linkedAt", Engine.Now, "lastSync", 0);
                peers[device] = known;
                // everything shown here so far (this app's days and other extensions'), by the chosen mode
                known["pending"] = store.Data.Keys.Select(Engine.RecordDate).Where(d => d != null).Distinct().Where(d => Wanted(known, d)).ToArray();
                // what this app already holds joins the shared rules (an older change loses to any real one)
                var meta = Meta(record); var excluded = Json.Map(meta["excluded"]); var categoriesAt = Json.Map(meta["categoriesAt"]);
                foreach (string site in Json.Array(Json.Get(engine.Settings, "excluded")).OfType<string>()) if (!excluded.ContainsKey(site)) excluded[site] = Json.Object("on", true, "at", 1);
                foreach (string site in Json.Map(Json.Get(store.Data, "categories")).Keys) if (!categoriesAt.ContainsKey(site)) categoriesAt[site] = 1;
                var linkPeers = LinkPeers().ToList(); if (!linkPeers.Contains(device)) { linkPeers.Add(device); bool was = applying; applying = true; try { store.Set(Json.Object("linkPeers", linkPeers.Cast<object>().ToArray())); } finally { applying = was; } }
            }
            string name = Json.Text(Json.Get(message, "name"), "Memoir extension"); known["name"] = name.Length > 80 ? name.Substring(0, 80) : name;
            known["version"] = Json.Text(Json.Get(message, "version")); known["browser"] = peer.Browser; known["connected"] = true;
            // the newest Memoir for Windows that browser's Memoir knows of (Settings says when it's newer than this one);
            // a Memoir from the Microsoft Store keeps none, so it never says so: the Store brings it its updates itself
            string latest = Json.Text(Json.Get(message, "windowsLatest")); if (!Native.FromStore && VersionText.IsMatch(latest)) known["windowsLatest"] = latest; else known.Remove("windowsLatest");
            Peer old; if (live.TryGetValue(device, out old) && old != peer) Requeue(device, record);
            live[device] = peer; deviceOf[peer.Id] = device; rulesDue.Add(device);
            Save(record); Send(device);
            if (first) { var handler = Linked; if (handler != null) handler(device); }
        }
        private void OnClosed(Peer peer) {
            string device; if (!deviceOf.TryGetValue(peer.Id, out device)) return;
            deviceOf.Remove(peer.Id);
            Peer current; if (!live.TryGetValue(device, out current) || current != peer) return;
            live.Remove(device);
            var record = Record(); Requeue(device, record);
            var known = Json.Get(Peers(record), device) as Dictionary<string, object>; if (known != null) known["connected"] = false;
            Save(record);
        }
        // days sent but not acknowledged go back on the list
        private void Requeue(string device, Dictionary<string, object> record) {
            Dictionary<long, string[]> waiting; if (!inflight.TryGetValue(device, out waiting) || waiting.Count == 0) return;
            var known = Json.Get(Peers(record), device) as Dictionary<string, object>;
            if (known != null) foreach (var dates in waiting.Values) AddPending(known, dates);
            waiting.Clear();
        }
        // Unlinked from here (Settings in this app): that extension unlinks too, now or when it next connects
        public void Unlink(string device) {
            if (!DeviceId.IsMatch(device ?? "")) return;
            Peer peer; if (live.TryGetValue(device, out peer)) peer.Send(Json.Object("type", "unlink"));
            Drop(device);
            var record = Record(); if (!(Json.Get(record, "unlinked") is Dictionary<string, object>)) record["unlinked"] = new Dictionary<string, object>();
            ((Dictionary<string, object>)record["unlinked"])[device] = Engine.Now; Save(record);
        }
        // Unlinked, both keep what they have: that extension's days fold into this app's own
        private void Drop(string device) {
            var patch = new Dictionary<string, object>(); var gone = new List<string>();
            foreach (string key in store.Data.Keys.Where(k => k.StartsWith("link:" + device + ":")).ToArray()) {
                string date = Engine.RecordDate(key); if (date == null) continue;
                patch["day:" + date] = SyncData.MergeDay(Engine.Normalize(Json.Get(store.Data, "day:" + date)), Engine.Normalize(store.Data[key])); gone.Add(key);
            }
            var record = Record(); Peers(record).Remove(device);
            patch["sync"] = record; patch["linkPeers"] = LinkPeers().Where(p => p != device).Cast<object>().ToArray();
            bool was = applying; applying = true;
            try { engine.Flush(Engine.Now); store.Set(patch); store.Remove(gone.ToArray()); } finally { applying = was; }
            store.Save();
            live.Remove(device); inflight.Remove(device); rulesDue.Remove(device);
        }
        private void Acked(string device, long seq) {
            Dictionary<long, string[]> waiting; if (inflight.TryGetValue(device, out waiting)) waiting.Remove(seq);
            var record = Record(); var known = Json.Get(Peers(record), device) as Dictionary<string, object>;
            if (known != null && Engine.Now - Json.Number(Json.Get(known, "lastSync")) > 5000) { known["lastSync"] = Engine.Now; Save(record); }
        }
        private void Send(string device) {
            Peer peer; if (!live.TryGetValue(device, out peer)) return;
            var record = Record(); var known = Json.Get(Peers(record), device) as Dictionary<string, object>; if (known == null) return;
            if (rulesDue.Remove(device)) peer.Send(Rules());
            AskSiteIcons(peer);
            var pending = Pending(known);
            if (pending.Count == 0) { if (Engine.Now - Json.Number(Json.Get(known, "lastSync")) > 30000) { known["lastSync"] = Engine.Now; Save(record); } return; }
            // newest days first, so this week shows up first; batches under 1 MB
            var batch = new Dictionary<string, object>(); int size = 0; var sent = new List<string>();
            Action flush = delegate {
                if (batch.Count == 0) return;
                long seq = ++sequence;
                if (!peer.Send(Json.Object("type", "days", "seq", seq, "days", batch))) return;
                if (!inflight.ContainsKey(device)) inflight[device] = new Dictionary<long, string[]>();
                var dates = batch.Keys.Select(k => k.Substring(4)).ToArray(); inflight[device][seq] = dates; sent.AddRange(dates);
                batch = new Dictionary<string, object>(); size = 0;
            };
            foreach (string date in pending.OrderByDescending(d => d, StringComparer.Ordinal)) {
                var view = ViewWithout(device, date);
                if (SyncData.DayTotal(view) <= 0 && Json.Map(view["ti"]).Count == 0) { sent.Add(date); continue; }
                int bytes = Encoding.UTF8.GetByteCount(Json.Encode(view));
                if (size + bytes > BatchBytes) flush();
                batch["day:" + date] = view; size += bytes;
            }
            flush();
            pending.ExceptWith(sent); known["pending"] = pending.ToArray(); Save(record);
        }

        // the rules as this app holds them
        private Dictionary<string, object> Rules() {
            var meta = Meta(Record()); var settings = engine.Settings;
            var shared = new Dictionary<string, object>(); foreach (string field in SettingsFields) if (settings.ContainsKey(field)) shared[field] = settings[field];
            return Json.Object("type", "rules", "settings", shared, "settingsAt", meta["settingsAt"], "excluded", meta["excluded"],
                "goal", Json.Object("history", Json.Get(Json.Map(Json.Get(store.Data, "goal")), "history", new object[0]), "at", Json.Number(Json.Get(meta, "goalAt"))),
                "categories", Json.Map(Json.Get(store.Data, "categories")), "categoriesAt", meta["categoriesAt"],
                "wipe", Json.Number(Json.Get(meta, "wipe")), "titlesErased", Json.Number(Json.Get(meta, "titlesErased")),
                "goalNotify", Json.Map(Json.Get(store.Data, "goalNotify")), "origins", Json.Map(Json.Get(store.Data, "origins")), "apps", Json.Map(Json.Get(store.Data, "apps")));
        }

        // ---------- what arrives ----------
        private void ApplyDays(Peer peer, string device, Dictionary<string, object> message) {
            var record = Record(); var peers = Peers(record); var known = Json.Get(peers, device) as Dictionary<string, object>; var meta = Meta(record);
            if (known == null) return;
            object excluded = Json.Get(engine.Settings, "excluded");
            var patch = new Dictionary<string, object>(); var changed = new List<string>();
            foreach (var pair in Json.Map(Json.Get(message, "days"))) {
                var m = OwnDay.Match(pair.Key); if (!m.Success) continue;
                string date = m.Groups[1].Value; if (!Wanted(known, date)) continue;
                var incoming = SyncData.CleanDay(pair.Value); if (incoming == null) continue;
                incoming = Engine.Normalize(incoming);
                if (!Trim(date, incoming, meta)) continue;
                SyncData.AnonymizeDay(incoming, excluded);
                NoteSites(incoming);
                string key = LinkKey(device, date);
                if (SyncData.Canonical(incoming) == SyncData.Canonical(Json.Get(store.Data, key) ?? new Dictionary<string, object>())) continue;
                patch[key] = incoming; changed.Add(date);
            }
            // the other extensions' view of those days changed
            foreach (var other in peers) if (other.Key != device) { var o = other.Value as Dictionary<string, object>; if (o != null) AddPending(o, changed.Where(d => Wanted(o, d))); }
            known["lastSync"] = Engine.Now;
            patch["sync"] = record;
            bool was = applying; applying = true;
            try { store.Set(patch); } finally { applying = was; }
            peer.Send(Json.Object("type", "ack", "seq", Json.Number(Json.Get(message, "seq"))));
            AskSiteIcons(peer);
            if (changed.Count > 0 && peers.Count > 1) { soon.Stop(); soon.Start(); }
        }

        // ---------- icons ----------
        // An extension asks for the pictures of this app's apps it's missing: the files, as data: URLs
        private void SendIcons(Peer peer, object wanted) {
            var batch = new Dictionary<string, object>(); int size = 0;
            foreach (string file in Json.Array(wanted).OfType<string>().Distinct().Take(500)) {
                if (!IconFile.IsMatch(file)) continue;
                byte[] bytes; try { bytes = File.ReadAllBytes(Path.Combine(iconDirectory, file)); } catch { continue; }
                if (bytes.Length > IconBytes) continue;
                string data = "data:image/png;base64," + Convert.ToBase64String(bytes);
                if (size + data.Length > BatchBytes && batch.Count > 0) { peer.Send(Json.Object("type", "icons", "apps", batch)); batch = new Dictionary<string, object>(); size = 0; }
                batch[file] = data; size += data.Length + file.Length;
            }
            if (batch.Count > 0) peer.Send(Json.Object("type", "icons", "apps", batch));
        }
        // The websites in days, to look for their icons (a real address: not Private, a page or an app)
        private void NoteSites(Dictionary<string, object> day) {
            foreach (string domain in Json.Map(Json.Get(day, "s")).Keys) if (!domain.StartsWith("~") && !SyncData.IsApp(domain)) siteSeen.Add(domain);
        }
        // A browser is asked for the icons of websites this app has none for, each once while the app runs (the
        // last three months' first, when it first connects; then what new days bring)
        private void AskSiteIcons(Peer peer) {
            if (!sitesSeeded) {
                sitesSeeded = true;
                string since = Engine.Day(engine.Local(Engine.Now).AddDays(-90));
                foreach (var pair in store.Data) { string date = Engine.RecordDate(pair.Key); if (date != null && String.CompareOrdinal(date, since) >= 0) NoteSites(Json.Map(pair.Value)); }
            }
            if (siteSeen.Count == 0) return;
            var have = Json.Map(Json.Get(store.Data, "favicons")); object excluded = Json.Get(engine.Settings, "excluded");
            var want = new List<string>();
            foreach (string domain in siteSeen.ToArray()) {
                if (want.Count >= 300) break;
                siteSeen.Remove(domain);
                if (!have.ContainsKey(domain) && !siteAsked.Contains(domain) && SyncData.SiteKey(domain) == domain && !Engine.Excluded(domain, excluded)) want.Add(domain);
            }
            if (want.Count == 0) return;
            siteAsked.UnionWith(want);
            peer.Send(Json.Object("type", "iconWants", "sites", want.Cast<object>().ToArray()));
        }
        // What the browser sent: each website's icon saved in icons\sites (null: the browser has none)
        private void KeepSiteIcons(object sites) {
            var favicons = Json.Clone(Json.Map(Json.Get(store.Data, "favicons"))); bool changed = false;
            object excluded = Json.Get(engine.Settings, "excluded");
            foreach (var pair in Json.Map(sites)) {
                string domain = pair.Key, data = pair.Value as string;
                if (data == null || !data.StartsWith("data:image/png;base64,", StringComparison.Ordinal)) continue;
                if (SyncData.SiteKey(domain) != domain || domain.StartsWith("~") || SyncData.IsApp(domain) || Engine.Excluded(domain, excluded)) continue;
                byte[] bytes; try { bytes = Convert.FromBase64String(data.Substring(22)); } catch { continue; }
                if (bytes.Length < 8 || bytes.Length > IconBytes || bytes[0] != 0x89 || bytes[1] != 0x50 || bytes[2] != 0x4E || bytes[3] != 0x47) continue;
                string file = Identity.IconName("site:" + domain);
                try { File.WriteAllBytes(Path.Combine(siteIconDirectory, file), bytes); } catch { continue; }
                if (Json.Text(Json.Get(favicons, domain)) != file) { favicons[domain] = file; changed = true; }
            }
            if (changed) { store.Set(Json.Object("favicons", favicons)); store.Save(); }
        }
        // A website's icon goes with its name (Never track, Clear all)
        private void PruneSiteIcons() {
            var kept = new HashSet<string>(Json.Map(Json.Get(store.Data, "favicons")).Values.OfType<string>());
            try { foreach (string path in Directory.GetFiles(siteIconDirectory, "*.png")) if (!kept.Contains(Path.GetFileName(path))) try { File.Delete(path); } catch { } } catch { }
        }
        // Clear all and Erase titles, from either side: nothing from before a marker comes back
        private bool Trim(string date, Dictionary<string, object> day, Dictionary<string, object> meta) {
            long wipe = (long)Json.Number(Json.Get(meta, "wipe")), erased = (long)Json.Number(Json.Get(meta, "titlesErased"));
            if (wipe > 0) {
                int cmp = String.CompareOrdinal(date, DateOf(wipe));
                if (cmp < 0) return false;
                if (cmp == 0) DropHours(day, engine.Local(wipe).Hour);
            }
            if (erased > 0 && String.CompareOrdinal(date, DateOf(erased)) <= 0) { day["ti"] = Json.Object(); day["th"] = Json.Object(); day["tu"] = Json.Object(); day["tp"] = new object[0]; }
            return SyncData.DayTotal(day) > 0 || Json.Map(day["ti"]).Count > 0;
        }
        private static void DropHours(Dictionary<string, object> day, int through) {
            var hs = Json.Map(day["hs"]); var th = Json.Map(day["th"]); var h = Json.Array(day["h"]).Select(x => (object)Json.Number(x)).ToArray();
            for (int hour = 0; hour <= through; hour++) { hs.Remove(hour.ToString()); th.Remove(hour.ToString()); h[hour] = 0.0; }
            var s = new Dictionary<string, object>();
            foreach (var slot in hs.Values) foreach (var pair in Json.Map(slot)) s[pair.Key] = Json.Number(Json.Get(s, pair.Key)) + Json.Number(pair.Value);
            day["s"] = s; day["h"] = h;
        }

        private void ApplyRules(Dictionary<string, object> remote, string sender) {
            string before = SyncData.Canonical(Rules());
            var record = Record(); var meta = Meta(record); var patch = new Dictionary<string, object>();
            var settings = Json.Clone(engine.Settings); bool settingsChanged = false, privacy = false;
            // settings: each field from whichever side changed it last
            var at = Json.Map(meta["settingsAt"]); var remoteAt = Json.Map(Json.Get(remote, "settingsAt")); var remoteSettings = Json.Map(Json.Get(remote, "settings"));
            foreach (string field in SettingsFields) {
                double theirs = Json.Number(Json.Get(remoteAt, field));
                if (theirs > Json.Number(Json.Get(at, field)) && remoteSettings.ContainsKey(field)) { settings[field] = remoteSettings[field]; at[field] = theirs; settingsChanged = true; }
            }
            // Never track: a set; each name on or off by its latest change
            var excluded = Json.Map(meta["excluded"]);
            foreach (var pair in Json.Map(Json.Get(remote, "excluded"))) {
                var theirs = Json.Map(pair.Value); if (SyncData.SiteKey(pair.Key) == null) continue;
                if (Json.Number(Json.Get(theirs, "at")) > Json.Number(Json.Get(Json.Map(Json.Get(excluded, pair.Key)), "at"))) excluded[pair.Key] = Json.Object("on", Json.Bool(Json.Get(theirs, "on")), "at", Json.Number(Json.Get(theirs, "at")));
            }
            var list = excluded.Where(p => Json.Bool(Json.Get(Json.Map(p.Value), "on"))).Select(p => p.Key).OrderBy(k => k, StringComparer.Ordinal).ToArray();
            var current = Json.Array(Json.Get(settings, "excluded")).OfType<string>().OrderBy(k => k, StringComparer.Ordinal).ToArray();
            if (!list.SequenceEqual(current)) { settings["excluded"] = list.Cast<object>().ToArray(); settingsChanged = privacy = true; }
            if (settingsChanged) patch["settings"] = settings;
            // the limit's history: every entry of both; the same day's entry from whichever side wrote last
            var remoteGoal = Json.Map(Json.Get(remote, "goal")); bool theirsNewer = Json.Number(Json.Get(remoteGoal, "at")) > Json.Number(Json.Get(meta, "goalAt"));
            var ownHistory = Json.Array(Json.Get(Json.Map(Json.Get(store.Data, "goal")), "history"));
            var entries = new SortedDictionary<string, object>(StringComparer.Ordinal);
            foreach (var e in ownHistory.OfType<Dictionary<string, object>>()) entries[Json.Text(Json.Get(e, "from"))] = e;
            foreach (var e in Json.Array(Json.Get(remoteGoal, "history")).OfType<Dictionary<string, object>>()) {
                string from = Json.Text(Json.Get(e, "from")); object limit = Json.Get(e, "limit");
                if (!DateKey.IsMatch(from) || (limit != null && Json.Number(limit, -1) < 0)) continue;
                if (!entries.ContainsKey(from) || theirsNewer) entries[from] = Json.Object("from", from, "limit", limit == null ? null : (object)Json.Number(limit));
            }
            var history = entries.Values.ToArray();
            if (SyncData.Canonical(history) != SyncData.Canonical(ownHistory)) patch["goal"] = Json.Object("history", history);
            if (theirsNewer) meta["goalAt"] = Json.Number(Json.Get(remoteGoal, "at"));
            // moved categories: each name's from whichever side moved it last
            var categories = Json.Clone(Json.Map(Json.Get(store.Data, "categories"))); var catAt = Json.Map(meta["categoriesAt"]); bool moved = false;
            var remoteCategories = Json.Map(Json.Get(remote, "categories"));
            foreach (var pair in Json.Map(Json.Get(remote, "categoriesAt"))) {
                if (Json.Number(pair.Value) <= Json.Number(Json.Get(catAt, pair.Key)) || SyncData.SiteKey(pair.Key) == null) continue;
                catAt[pair.Key] = Json.Number(pair.Value); string cat = Json.Text(Json.Get(remoteCategories, pair.Key));
                if (cat.Length > 0) categories[pair.Key] = cat; else categories.Remove(pair.Key);
                moved = true;
            }
            if (moved) patch["categories"] = categories;
            // site addresses this app doesn't have yet
            var origins = Json.Clone(Json.Map(Json.Get(store.Data, "origins"))); int originCount = origins.Count;
            foreach (var pair in Json.Map(Json.Get(remote, "origins"))) { string origin = Json.Text(pair.Value); if (!origins.ContainsKey(pair.Key) && SyncData.SiteKey(pair.Key) != null && Regex.IsMatch(origin, "^https?://[^/]+$")) origins[pair.Key] = origin; }
            if (origins.Count != originCount) patch["origins"] = origins;
            // the limit's notices: once shown on either side, never again that day
            var notify = Json.Map(Json.Get(store.Data, "goalNotify")); var theirsNotify = Json.Map(Json.Get(remote, "goalNotify"));
            string day = Json.Text(Json.Get(theirsNotify, "day"));
            if (DateKey.IsMatch(day) && String.CompareOrdinal(day, Json.Text(Json.Get(notify, "day"))) >= 0) {
                bool same = day == Json.Text(Json.Get(notify, "day"));
                var next = Json.Object("day", day, "n95", Json.Bool(Json.Get(theirsNotify, "n95")) || (same && Json.Bool(Json.Get(notify, "n95"))), "over", Json.Bool(Json.Get(theirsNotify, "over")) || (same && Json.Bool(Json.Get(notify, "over"))));
                if (SyncData.Canonical(next) != SyncData.Canonical(notify)) patch["goalNotify"] = next;
            }
            // markers: Clear all and Erase titles from the other side
            long wipe = (long)Json.Number(Json.Get(remote, "wipe")), erased = (long)Json.Number(Json.Get(remote, "titlesErased"));
            bool wiped = wipe > Json.Number(Json.Get(meta, "wipe")), titlesGone = erased > Json.Number(Json.Get(meta, "titlesErased"));
            if (wiped) meta["wipe"] = wipe;
            if (titlesGone) meta["titlesErased"] = erased;
            patch["sync"] = record;
            bool was = applying; applying = true;
            try {
                engine.Flush(Engine.Now);
                store.Set(patch);
                if (wiped) Wipe(wipe);
                if (titlesGone) engine.EraseTitles();
                if (settingsChanged) { settingsSeen = Json.Clone(engine.Settings); if (privacy) engine.EnforcePrivacy(); }
            } finally { applying = was; }
            if (settingsChanged) settingsApplied();
            store.Save();
            // one browser's change reaches the other browsers linked here too, while they're open
            if (SyncData.Canonical(Rules()) != before) { foreach (string device in live.Keys) if (device != sender) rulesDue.Add(device); soon.Stop(); soon.Start(); }
        }
        // Clear all on the other side: everything up to its hour goes here too
        private void Wipe(long at) {
            string wipeDate = DateOf(at); int hour = engine.Local(at).Hour;
            var keys = store.Data.Keys.Where(k => Engine.DayRecord.IsMatch(k)).ToArray();
            store.Remove(keys.Where(k => String.CompareOrdinal(Engine.RecordDate(k), wipeDate) < 0).ToArray());
            foreach (string key in keys.Where(k => Engine.RecordDate(k) == wipeDate)) {
                var rec = Engine.Normalize(store.Data[key]); DropHours(rec, hour);
                if (SyncData.DayTotal(rec) > 0) store.Set(Json.Object(key, rec)); else store.Remove(key);
            }
            store.Remove(new object[] { "categories", "origins", "apps", "favicons", "goalNotify" });
        }
    }
}
