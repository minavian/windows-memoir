using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Memoir {
    internal static class Json {
        public static JavaScriptSerializer Serializer() { return new JavaScriptSerializer { MaxJsonLength = 268435456, RecursionLimit = 120 }; }
        public static string Encode(object value) { return Serializer().Serialize(value); }
        public static object Decode(string value) { return Serializer().DeserializeObject(value); }
        public static Dictionary<string, object> Map(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        public static object[] Array(object value) { var a = value as IEnumerable; return a == null || value is string ? new object[0] : a.Cast<object>().ToArray(); }
        public static object Get(IDictionary<string, object> map, string key, object fallback = null) { object value; return map.TryGetValue(key, out value) ? value : fallback; }
        public static double Number(object value, double fallback = 0) { try { return value == null ? fallback : Convert.ToDouble(value, CultureInfo.InvariantCulture); } catch { return fallback; } }
        public static bool Bool(object value, bool fallback = false) { return value is bool ? (bool)value : fallback; }
        public static string Text(object value, string fallback = "") { return value as string ?? fallback; }
        public static Dictionary<string, object> Clone(Dictionary<string, object> value) { return Map(Decode(Encode(value))); }
        public static Dictionary<string, object> Object(params object[] pairs) { var result = new Dictionary<string, object>(); for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]); return result; }
    }

    internal sealed class Store {
        public readonly Dictionary<string, object> Data;
        public readonly string FilePath;
        public bool Dirty { get; private set; }
        public event Action<Dictionary<string, object>> Changed;
        public Action<Dictionary<string, object>> BackupFilter;
        // Serialized "key":value bytes per top-level entry, reused while Data still holds that same object.
        // Valid because values in Data are only ever replaced through Set/Remove, never mutated in place.
        private readonly Dictionary<string, KeyValuePair<object, byte[]>> encoded = new Dictionary<string, KeyValuePair<object, byte[]>>();
        public Store(string directory) {
            Directory.CreateDirectory(directory);
            FilePath = Path.Combine(directory, "history.json");
            if (!File.Exists(FilePath)) Data = new Dictionary<string, object>();
            else {
                try { Data = Load(FilePath); }
                catch {
                    string backup = FilePath + ".backup";
                    if (!File.Exists(backup)) throw new InvalidDataException("Memoir could not read its history. Your file has been preserved at " + FilePath);
                    Data = Load(backup);
                    File.Copy(FilePath, FilePath + ".damaged-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"), false);
                    Dirty = true;
                }
            }
        }
        private static Dictionary<string, object> Load(string path) {
            var data = Json.Decode(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
            if (data == null) throw new InvalidDataException("History is not a JSON object.");
            return data;
        }
        public Dictionary<string, object> Get(object keys) {
            if (keys == null) return Json.Clone(Data);
            var result = new Dictionary<string, object>();
            string single = keys as string;
            if (single != null) { if (Data.ContainsKey(single)) result[single] = Data[single]; }
            else if (keys is IDictionary<string, object>) {
                foreach (var pair in (IDictionary<string, object>)keys) result[pair.Key] = Json.Get(Data, pair.Key, pair.Value);
            } else foreach (object item in Json.Array(keys)) { string key = Json.Text(item); if (Data.ContainsKey(key)) result[key] = Data[key]; }
            return Json.Clone(result);
        }
        public void Set(Dictionary<string, object> patch) {
            var changes = new Dictionary<string, object>();
            foreach (var pair in patch) {
                object old = Json.Get(Data, pair.Key);
                if (Json.Encode(old) == Json.Encode(pair.Value)) continue;
                changes[pair.Key] = Json.Object("oldValue", old, "newValue", pair.Value);
                Data[pair.Key] = pair.Value;
            }
            if (changes.Count == 0) return;
            Dirty = true;
            if (Changed != null) Changed(changes);
        }
        public void Remove(object keys) {
            var changes = new Dictionary<string, object>();
            foreach (object item in keys is string ? new object[] { keys } : Json.Array(keys)) {
                string key = Json.Text(item);
                if (!Data.ContainsKey(key)) continue;
                changes[key] = Json.Object("oldValue", Data[key]); Data.Remove(key); encoded.Remove(key);
            }
            if (changes.Count == 0) return;
            Dirty = true;
            if (Changed != null) Changed(changes);
        }
        public void Save() {
            if (!Dirty) return;
            string temporary = FilePath + ".writing";
            Dictionary<string, object> previous = null;
            if (File.Exists(FilePath) && BackupFilter != null) {
                try { previous = Load(FilePath); } catch { previous = Json.Clone(Data); }
                BackupFilter(previous);
            }
            using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None)) { WriteData(stream); stream.Flush(true); }
            // Keep the last valid file until the replacement is durably written.
            if (previous != null) {
                WriteBackup(previous);
                File.Replace(temporary, FilePath, null, true);
            }
            else if (File.Exists(FilePath)) File.Replace(temporary, FilePath, FilePath + ".backup", true);
            else File.Move(temporary, FilePath);
            BackupFilter = null;
            Dirty = false;
        }
        // Saves run every 30 seconds; re-encoding all history each time grew with every day kept (~60 ms per year on the UI thread).
        private void WriteData(Stream stream) {
            var serializer = Json.Serializer(); var utf8 = new UTF8Encoding(false); bool first = true;
            stream.WriteByte((byte)'{');
            foreach (var pair in Data) {
                KeyValuePair<object, byte[]> entry;
                if (!encoded.TryGetValue(pair.Key, out entry) || !ReferenceEquals(entry.Key, pair.Value))
                    encoded[pair.Key] = entry = new KeyValuePair<object, byte[]>(pair.Value, utf8.GetBytes(serializer.Serialize(pair.Key) + ":" + serializer.Serialize(pair.Value)));
                if (!first) stream.WriteByte((byte)','); first = false;
                stream.Write(entry.Value, 0, entry.Value.Length);
            }
            stream.WriteByte((byte)'}');
        }
        public void ScrubBackup(Action<Dictionary<string, object>> filter) {
            string backup = FilePath + ".backup";
            if (!File.Exists(backup)) return;
            Dictionary<string, object> previous;
            try { previous = Load(backup); } catch { return; }
            string before = Json.Encode(previous); filter(previous);
            if (before != Json.Encode(previous)) WriteBackup(previous);
        }
        private void WriteBackup(Dictionary<string, object> data) {
            string backup = FilePath + ".backup", temporary = backup + ".writing";
            byte[] bytes = new UTF8Encoding(false).GetBytes(Json.Encode(data));
            using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None)) { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); }
            if (File.Exists(backup)) File.Replace(temporary, backup, null, true); else File.Move(temporary, backup);
        }
    }
}
