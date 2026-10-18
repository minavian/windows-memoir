using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Windows.Automation;

namespace Memoir {
    internal sealed class BrowserProbe : IDisposable {
        private AutomationElement address;
        private AutomationPropertyChangedEventHandler changed;
        private IntPtr window;
        private string committed;
        public event Action<IntPtr, string> UrlChanged;
        public static bool IsBrowser(string name) { return Regex.IsMatch(name, @"^(chrome|msedge|firefox|brave|vivaldi|opera|thorium|chromium|zen|comet|arc)\.exe$", RegexOptions.IgnoreCase); }
        public string Read(IntPtr hwnd) {
            if (window != hwnd) { Detach(); window = hwnd; committed = null; }
            try { if (address != null) { if (!address.Current.HasKeyboardFocus) committed = Value(address); return committed; } } catch { Detach(); window = hwnd; }
            try {
                var root = AutomationElement.FromHandle(hwnd);
                var queue = new Queue<Tuple<AutomationElement, int>>(); queue.Enqueue(Tuple.Create(root, 0));
                var walker = TreeWalker.ControlViewWalker; int seen = 0;
                while (queue.Count > 0 && seen++ < 300) {
                    var item = queue.Dequeue(); var el = item.Item1;
                    if (el.Current.ControlType == ControlType.Document) continue; // Never inspect web page inputs.
                    if (el.Current.ControlType == ControlType.Edit) {
                        string name = el.Current.Name ?? "", id = el.Current.AutomationId ?? "";
                        if (Regex.IsMatch(name, @"address|enter.*(url|address)|search.*bar|location", RegexOptions.IgnoreCase) || Regex.IsMatch(id, @"urlbar|address|omnibox", RegexOptions.IgnoreCase)) {
                            string value = el.Current.HasKeyboardFocus ? null : Value(el);
                            if (value != null) {
                                address = el; committed = value;
                                changed = delegate(object sender, AutomationPropertyChangedEventArgs args) {
                                    try { var source = (AutomationElement)sender; if (source.Current.HasKeyboardFocus) return; committed = Value(source); var callback = UrlChanged; if (callback != null) callback(hwnd, committed); } catch { }
                                };
                                try { Automation.AddAutomationPropertyChangedEventHandler(address, TreeScope.Element, changed, ValuePattern.ValueProperty); } catch { }
                                return value;
                            }
                        }
                    }
                    if (item.Item2 >= 7) continue;
                    var child = walker.GetFirstChild(el);
                    while (child != null && queue.Count < 300) { queue.Enqueue(Tuple.Create(child, item.Item2 + 1)); child = walker.GetNextSibling(child); }
                }
            } catch { }
            return null;
        }
        private static string Value(AutomationElement el) { object value; return el.TryGetCurrentPattern(ValuePattern.Pattern, out value) ? ((ValuePattern)value).Current.Value : null; }
        private void Detach() { if (address != null && changed != null) { try { Automation.RemoveAutomationPropertyChangedEventHandler(address, changed); } catch { } } address = null; changed = null; }
        public void Dispose() { Detach(); }
        public static string Domain(string address) {
            if (String.IsNullOrWhiteSpace(address)) return null;
            Uri uri;
            string value = address.Trim();
            if (!value.Contains("://")) value = "https://" + value;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https")) return null;
            string host = uri.Host.ToLowerInvariant();
            if (host.StartsWith("www.")) host = host.Substring(4);
            if (host.Length == 0 || host == "__proto__" || host == "constructor" || host == "prototype" || (!host.Contains(".") && host != "localhost")) return null;
            return host;
        }
        public static string Origin(string address) { Uri uri; string value = address.Contains("://") ? address : "https://" + address; return Uri.TryCreate(value, UriKind.Absolute, out uri) ? uri.GetLeftPart(UriPartial.Authority) : null; }
    }
}
