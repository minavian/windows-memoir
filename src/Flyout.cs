using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Memoir {
    // Today, from the clock in the notification area: the popup the browser shows from its toolbar (popup.html), in a
    // small window of its own above the taskbar, beside the clock. It never shows in the taskbar or Alt+Tab, and a
    // click anywhere else closes it (Dismissed). MainForm gives it its page (a WebView2 sharing the window's).
    internal sealed class Flyout : Form {
        public event Action Dismissed;
        public DateTime HiddenAt { get; private set; }
        public bool Dark { get; set; }
        private float scale = 1;

        public Flyout(Color background) {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; TopMost = true;
            AutoScaleMode = AutoScaleMode.None; BackColor = background; Text = "Memoir — Today";
            Deactivate += delegate { if (Visible) { HideNow(); if (Dismissed != null) Dismissed(); } };
        }
        protected override CreateParams CreateParams {
            get {
                var p = base.CreateParams;
                p.ExStyle |= 0x80;          // a tool window: not in the taskbar or Alt+Tab
                p.ClassStyle |= 0x20000;    // a shadow
                return p;
            }
        }
        // The browser's popup is 380 × 600 (CSS pixels, scaled with the display); beside the clock, inside the screen:
        // above a taskbar at the bottom, below one at the top, beside one on a side
        public void ShowNear(Rectangle icon, Point fallback) {
            using (var screen = Graphics.FromHwnd(IntPtr.Zero)) scale = screen.DpiX / 96f;
            if (icon.IsEmpty) icon = new Rectangle(fallback.X - 1, fallback.Y - 1, 2, 2);
            var screenArea = Screen.FromRectangle(icon); var area = screenArea.WorkingArea; var bounds = screenArea.Bounds;
            int margin = S(12), width = Math.Min(S(380), area.Width - margin * 2), height = Math.Min(S(600), area.Height - margin * 2);
            int x = icon.Left + icon.Width / 2 - width / 2, y = area.Bottom - height - margin;
            if (area.Top > bounds.Top && icon.Top < area.Top) y = area.Top + margin;                                   // the taskbar at the top
            else if (area.Left > bounds.Left && icon.Right <= area.Left + 2) { x = area.Left + margin; y = icon.Top + icon.Height / 2 - height / 2; }   // on the left
            else if (area.Right < bounds.Right && icon.Left >= area.Right - 2) { x = area.Right - width - margin; y = icon.Top + icon.Height / 2 - height / 2; } // on the right
            x = Math.Max(area.Left + margin, Math.Min(x, area.Right - width - margin));
            y = Math.Max(area.Top + margin, Math.Min(y, area.Bottom - height - margin));
            Bounds = new Rectangle(x, y, width, height);
            Round();
            Show(); Activate(); Native.ToFront(Handle);
        }
        public void HideNow() { if (!Visible) return; HiddenAt = DateTime.UtcNow; Hide(); }
        private int S(int value) { return (int)Math.Round(value * scale); }
        // Windows 11: rounded like its own flyouts, with a hairline border in the theme's tone
        private void Round() {
            try {
                int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4);
                Color edge = Dark ? Color.FromArgb(58, 58, 60) : Color.FromArgb(222, 222, 226);
                int border = edge.R | (edge.G << 8) | (edge.B << 16); DwmSetWindowAttribute(Handle, 34, ref border, 4);
            } catch { }
        }
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    }
}
