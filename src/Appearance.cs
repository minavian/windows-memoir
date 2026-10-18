using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace Memoir {
    internal static class Appearance {
        public static Dictionary<string, object> Resolve(object saved) {
            var appearance = Json.Map(saved);
            string theme = Json.Text(Json.Get(appearance, "theme"), "light");
            if (Json.Text(Json.Get(appearance, "mode"), "auto") == "auto") {
                try { theme = Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1)) == 0 ? "dark" : "light"; } catch { theme = "light"; }
            }
            if (theme != "dark" && theme != "pink") theme = "light";
            if (theme == Json.Text(Json.Get(appearance, "theme")) && Json.Map(Json.Get(appearance, "palette")).Count > 0) return Json.Clone(appearance);
            bool dark = theme == "dark", pink = theme == "pink";
            return Json.Object("theme", theme, "mode", Json.Text(Json.Get(appearance, "mode"), "auto"), "palette", Json.Object(
                "surface", pink ? "#3a2331" : dark ? "#1c1c1e" : "#ffffff",
                "label", pink ? "#fbe7f0" : dark ? "#f5f5f7" : "#1d1d1f",
                "secondary", pink ? "#e0b3c7" : dark ? "#a1a1a6" : "#6e6e73",
                "hover", pink ? "rgba(255,143,184,0.09)" : dark ? "rgba(120,120,128,0.18)" : "rgba(120,120,128,0.08)"));
        }
    }
}
