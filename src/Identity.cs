// Made with care and love by Mina Vian
using System;
using System.Security.Cryptography;
using System.Text;

namespace Memoir {
    internal static class Identity {
        public static string IconName(string value) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").Substring(0, 24).ToLowerInvariant() + ".png"; }
    }
}
