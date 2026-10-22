using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Memoir {
    // Only queries level/state metadata. No microphone access or audio recording.
    internal static class AudioProbe {
        public static bool Audible(int processId, string executable) {
            object devices = null, device = null, manager = null, enumerator = null;
            try {
                devices = new DeviceEnumerator(); IDevice endpoint;
                ((IDeviceEnumerator)devices).GetDefaultAudioEndpoint(0, 1, out endpoint); device = endpoint;
                Guid iid = typeof(ISessionManager).GUID; object sessions;
                endpoint.Activate(ref iid, 23, IntPtr.Zero, out sessions); manager = sessions;
                ISessionEnumerator list; ((ISessionManager)sessions).GetSessionEnumerator(out list); enumerator = list;
                int count; list.GetCount(out count);
                for (int i = 0; i < count; i++) {
                    object session = null;
                    try {
                        list.GetSession(i, out session); var control = (ISessionControl)session;
                        uint pid; int state; control.GetProcessId(out pid); control.GetState(out state);
                        if (state != 1 || pid == 0) continue;
                        bool matches = pid == processId;
                        if (!matches) matches = (Native.ProcessName((int)pid) + ".exe").Equals(executable, StringComparison.OrdinalIgnoreCase);
                        if (!matches) continue;
                        float peak; ((IMeter)session).GetPeakValue(out peak); if (peak > 0.0001f) return true;
                    } catch { }
                    finally { Release(session); }
                }
            } catch { }
            finally { Release(enumerator); Release(manager); Release(device); Release(devices); }
            return false;
        }
        private static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] private class DeviceEnumerator { }
        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IDeviceEnumerator {
            void EnumAudioEndpoints(int flow, uint mask, out IntPtr devices);
            void GetDefaultAudioEndpoint(int flow, int role, out IDevice endpoint);
        }
        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IDevice {
            void Activate(ref Guid iid, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value);
        }
        [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface ISessionManager {
            void GetAudioSessionControl(IntPtr guid, uint flags, out IntPtr control);
            void GetSimpleAudioVolume(IntPtr guid, uint flags, out IntPtr volume);
            void GetSessionEnumerator(out ISessionEnumerator list);
        }
        [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface ISessionEnumerator {
            void GetCount(out int count);
            void GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object control);
        }
        [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface ISessionControl {
            void GetState(out int state);
            void GetDisplayName(out IntPtr name);
            void SetDisplayName(IntPtr value, IntPtr context);
            void GetIconPath(out IntPtr name);
            void SetIconPath(IntPtr value, IntPtr context);
            void GetGroupingParam(out Guid guid);
            void SetGroupingParam(IntPtr guid, IntPtr context);
            void RegisterAudioSessionNotification(IntPtr notification);
            void UnregisterAudioSessionNotification(IntPtr notification);
            void GetSessionIdentifier(out IntPtr id);
            void GetSessionInstanceIdentifier(out IntPtr id);
            void GetProcessId(out uint id);
        }
        [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IMeter { void GetPeakValue(out float value); }
    }
}
