using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Memoir Setup")]
[assembly: AssemblyDescription("Installs Memoir, local screen time for Windows apps and websites")]
[assembly: AssemblyCompany("Mina Vian")]
[assembly: AssemblyProduct("Memoir")]
[assembly: AssemblyCopyright("Made by Mina Vian")]
[assembly: AssemblyVersion("6.0.0.0")]
[assembly: AssemblyFileVersion("6.0.0.0")]

namespace MemoirSetup {
    // Memoir Setup.exe: all of Memoir in one file (payload.zip, made by release.ps1). It unpacks Memoir into a temporary
    // folder and hands over to Memoir.exe --install there (src/Setup.cs), which shows the installer and puts Memoir in
    // its place; then the temporary folder goes.
    internal static class Bootstrap {
        [STAThread] private static int Main() {
            string root = Path.Combine(Path.GetTempPath(), "Memoir Setup " + Guid.NewGuid().ToString("N").Substring(0, 8));
            try {
                string app = Path.Combine(root, "app");
                using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                using (var zip = new ZipArchive(stream, ZipArchiveMode.Read)) zip.ExtractToDirectory(app);
                using (var setup = Process.Start(new ProcessStartInfo(Path.Combine(app, "Memoir.exe"), "--install") { UseShellExecute = false, WorkingDirectory = root })) {
                    setup.WaitForExit();
                    return setup.ExitCode;
                }
            } catch (Exception error) {
                MessageBox.Show("Memoir couldn't be installed.\n\n" + error.Message, "Memoir Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            } finally { Clean(root); }
        }
        // the installer's web view may hold its files a moment after it closes
        private static void Clean(string root) {
            for (int attempt = 0; attempt < 20 && Directory.Exists(root); attempt++) {
                try { Directory.Delete(root, true); } catch { System.Threading.Thread.Sleep(250); }
            }
        }
    }
}
