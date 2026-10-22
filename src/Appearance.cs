// Made with care and love by Mina Vian
using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace Memoir {
    internal static class Appearance {
        public static Dictionary<string, object> Resolve(object saved) {
            var appearance = Json.Map(saved);
            string theme = Json.Text(Json.Get(appearance, "theme"), "light"), mode = Json.Text(Json.Get(appearance, "mode"), "auto");
            // Light or Dark; a Pink saved by 5.x follows Windows, as the interface now does (theme-boot.js)
            if (mode == "pink" || theme == "pink") mode = "auto";
            if (mode == "auto") {
                try { theme = Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1)) == 0 ? "dark" : "light"; } catch { theme = "light"; }
            }
            if (theme != "dark") theme = "light";
            if (theme == Json.Text(Json.Get(appearance, "theme")) && mode == Json.Text(Json.Get(appearance, "mode"), "auto") && Json.Map(Json.Get(appearance, "palette")).Count > 0) return Json.Clone(appearance);
            bool dark = theme == "dark";
            return Json.Object("theme", theme, "mode", mode, "palette", Json.Object(
                "surface", dark ? "#1c1c1e" : "#ffffff",
                "background", dark ? "#000000" : "#f5f5f7",
                "label", dark ? "#f5f5f7" : "#1d1d1f",
                "secondary", dark ? "#a1a1a6" : "#6e6e73",
                "hover", dark ? "rgba(120,120,128,0.18)" : "rgba(120,120,128,0.08)"));
        }
    }
}
