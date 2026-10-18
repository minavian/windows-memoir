// Only tab metadata goes to Memoir on this computer. No page scripts or network calls.
let port = null, retryAfter = 0, generation = 0;
function connect() {
  if (port || Date.now() < retryAfter) return;
  try {
    port = chrome.runtime.connectNative('com.minavian.memoir');
    port.onMessage.addListener(message => {
      chrome.action.setBadgeText({ text: message.connected ? '' : 'OFF' });
      chrome.action.setTitle({ title: message.connected ? 'Memoir — browser connector active' : 'Open Memoir to resume browser tracking' });
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      port = null; retryAfter = Date.now() + 30000;
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setTitle({ title: 'Memoir connector is offline — register its native host, then open Memoir' });
    });
  } catch { port = null; retryAfter = Date.now() + 30000; }
}
async function send() {
  const current = ++generation;
  connect(); if (!port) return;
  try {
    const win = await chrome.windows.getLastFocused();
    const [tab] = win?.id != null ? await chrome.tabs.query({ active: true, windowId: win.id }) : [];
    if (current !== generation || !port) return;
    let url = ''; try { const parsed = new URL(tab?.url); if (/^https?:$/.test(parsed.protocol)) url = parsed.origin; } catch {}
    port.postMessage({ focused: !!win?.focused, incognito: !!tab?.incognito, url, title: tab?.incognito ? '' : (tab?.title || '').slice(0, 120), audible: !!tab?.audible, muted: !!tab?.mutedInfo?.muted });
  } catch { /* browser is closing */ }
}
chrome.tabs.onActivated.addListener(send);
chrome.tabs.onUpdated.addListener((id, change, tab) => { if (tab.active && ['url', 'title', 'audible', 'mutedInfo', 'status'].some(key => key in change)) send(); });
chrome.tabs.onRemoved.addListener(send);
chrome.windows.onFocusChanged.addListener(send);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'memoir-link') send(); });
chrome.alarms.create('memoir-link', { periodInMinutes: .5 });
send();
