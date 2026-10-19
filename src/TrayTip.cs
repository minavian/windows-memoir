using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Memoir {
    // The clock's tooltip, in Memoir's own look instead of Windows' plain one: the clock, "Memoir", and today so far
    // (or that tracking is paused). A small rounded card above the icon, in the theme's colours; it never takes
    // the focus or the mouse. The shell says when (TrayIcon's PopupOpen and PopupClose).
    internal sealed class TrayTip : Form {
        private Image logo; private string title = "Memoir", line = "";
        private Color surface = Color.White, label = Color.FromArgb(29, 29, 31), secondary = Color.FromArgb(110, 110, 115);
        private Font titleFont, lineFont; private float scale = 1;

        public TrayTip() {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; TopMost = true;
            DoubleBuffered = true; AutoScaleMode = AutoScaleMode.None; Text = "Memoir tooltip";
        }
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams {
            get {
                var p = base.CreateParams;
                p.ExStyle |= 0x80 | 0x8 | 0x08000000 | 0x20;   // a tool window, topmost, never activated, the mouse passes through
                p.ClassStyle |= 0x20000;                       // a shadow
                return p;
            }
        }

        // what: the card's lines; at: the icon's rectangle (or the point the shell gave); colours from the theme
        public void ShowAt(Rectangle icon, Image clock, string text, bool dark, Color background, Color foreground, Color muted) {
            logo = clock; line = text; surface = background; label = foreground; secondary = muted;
            using (var screen = Graphics.FromHwnd(IntPtr.Zero)) scale = screen.DpiX / 96f;
            if (titleFont == null) { titleFont = new Font(Family(), 9.75f, FontStyle.Bold); lineFont = new Font(Family(), 9f); }
            BackColor = surface;
            Size titleSize = TextRenderer.MeasureText(title, titleFont, Size.Empty, TextFormatFlags.NoPadding), lineSize = TextRenderer.MeasureText(line, lineFont, Size.Empty, TextFormatFlags.NoPadding);
            int pad = S(12), mark = S(28), gap = S(10);
            int width = pad + mark + gap + Math.Max(titleSize.Width, lineSize.Width) + pad + S(2);
            int height = Math.Max(mark, titleSize.Height + S(2) + lineSize.Height) + S(10) * 2;
            var area = Screen.FromRectangle(icon).WorkingArea;
            int x = icon.Left + icon.Width / 2 - width / 2, y;
            if (icon.Bottom > area.Bottom - 2 || icon.Top >= area.Bottom) y = Math.Min(icon.Top, area.Bottom) - height - S(10);   // the taskbar below (or the hidden icons)
            else if (icon.Top < area.Top + 2) y = Math.Max(icon.Bottom, area.Top) + S(10);                                      // above
            else y = icon.Top - height - S(10);
            x = Math.Max(area.Left + S(8), Math.Min(x, area.Right - width - S(8)));
            y = Math.Max(area.Top + S(8), Math.Min(y, area.Bottom - height - S(8)));
            Bounds = new Rectangle(x, y, width, height);
            Round(dark);
            if (!Visible) Show(); else Invalidate();
        }
        private int S(int value) { return (int)Math.Round(value * scale); }
        private static string Family() {
            foreach (string name in new[] { "Segoe UI Variable Text", "Segoe UI" }) try { using (var family = new FontFamily(name)) return name; } catch { }
            return SystemFonts.MessageBoxFont.Name;
        }
        // Windows 11: rounded, with a hairline border in the theme's tone (Windows 10 keeps square corners)
        private void Round(bool dark) {
            try {
                int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4);
                Color edge = dark ? Color.FromArgb(58, 58, 60) : Color.FromArgb(222, 222, 226);
                int border = edge.R | (edge.G << 8) | (edge.B << 16); DwmSetWindowAttribute(Handle, 34, ref border, 4);
            } catch { }
        }
        protected override void OnPaint(PaintEventArgs e) {
            var g = e.Graphics; g.Clear(surface);
            g.SmoothingMode = SmoothingMode.AntiAlias; g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            int pad = S(12), mark = S(28), gap = S(10);
            if (logo != null) g.DrawImage(logo, new Rectangle(pad, (Height - mark) / 2, mark, mark));
            Size titleSize = TextRenderer.MeasureText(g, title, titleFont, Size.Empty, TextFormatFlags.NoPadding), lineSize = TextRenderer.MeasureText(g, line, lineFont, Size.Empty, TextFormatFlags.NoPadding);
            int top = (Height - (titleSize.Height + S(2) + lineSize.Height)) / 2, left = pad + mark + gap;
            TextRenderer.DrawText(g, title, titleFont, new Point(left, top), label, surface, TextFormatFlags.NoPadding);
            TextRenderer.DrawText(g, line, lineFont, new Point(left, top + titleSize.Height + S(2)), secondary, surface, TextFormatFlags.NoPadding);
        }
        protected override void Dispose(bool disposing) { if (disposing) { if (titleFont != null) titleFont.Dispose(); if (lineFont != null) lineFont.Dispose(); } base.Dispose(disposing); }
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    }
}
