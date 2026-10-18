using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace Memoir {
    // While the page loads: the window in the page's own colour with Memoir's clock in the middle, over the web view,
    // so opening Memoir is never a blank or a flash of another colour (the web view's first frames follow Windows'
    // theme, not Memoir's). The clock comes in only if loading takes a moment, breathes while it waits, and fades out
    // as the page shows: the page says when it has painted (desktop-bridge.js: window.painted), and the report's own
    // cards then come in as always.
    internal sealed class Splash : Control {
        private const int Delay = 180, In = 280, Out = 140, Breath = 1800;
        private readonly Image logo;
        private readonly Timer timer = new Timer { Interval = 15 };
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private long fadeFrom = -1;
        private Action done;
        public Splash(Image logo, Color background) {
            this.logo = logo; BackColor = background; Dock = DockStyle.Fill;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            timer.Tick += delegate {
                long t = clock.ElapsedMilliseconds;
                if (done != null && (fadeFrom < Delay || t - fadeFrom >= Out)) { var then = done; done = null; timer.Stop(); then(); return; }
                if (t >= Delay - 20) Invalidate();
            };
            timer.Start();
        }
        // the page is there: the clock fades out (or, never shown yet, goes at once), then it's removed
        public void Finish(Action then) { if (done != null || fadeFrom >= 0) return; fadeFrom = clock.ElapsedMilliseconds; done = then; }
        private static double Ease(double k) { k = Math.Max(0, Math.Min(1, k)); return 1 - Math.Pow(1 - k, 3); }
        protected override void OnPaint(PaintEventArgs e) {
            var g = e.Graphics; g.Clear(BackColor);
            if (logo == null) return;
            long t = clock.ElapsedMilliseconds;
            double alpha = Ease((t - Delay) / (double)In), scale = 0.94 + 0.06 * alpha;
            // waiting: a slow breath, never a spinner or a bar
            if (t > Delay + In) alpha *= 0.86 + 0.14 * (0.5 + 0.5 * Math.Cos((t - Delay - In) * 2 * Math.PI / Breath));
            if (fadeFrom >= 0) { double k = Ease((t - fadeFrom) / (double)Out); alpha *= 1 - k; scale *= 1 + 0.03 * k; }
            if (alpha <= 0.002) return;
            float size = (float)(64 * g.DpiX / 96 * scale);
            var box = new RectangleF((Width - size) / 2, (Height - size) / 2 - g.DpiX / 96 * 12, size, size);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var attributes = new ImageAttributes()) {
                attributes.SetColorMatrix(new ColorMatrix { Matrix33 = (float)alpha });
                g.DrawImage(logo, new[] { box.Location, new PointF(box.Right, box.Top), new PointF(box.Left, box.Bottom) }, new RectangleF(0, 0, logo.Width, logo.Height), GraphicsUnit.Pixel, attributes);
            }
        }
        protected override void Dispose(bool disposing) { if (disposing) { timer.Stop(); timer.Dispose(); } base.Dispose(disposing); }
    }
}
