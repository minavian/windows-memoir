// Memoir: Browser Screen Time — shared data layer.
// Everything here runs locally; nothing ever leaves the browser.

export const APP_NAME = 'Memoir';

export const IDLE_SECONDS = 60;          // no input for this long = idle (unless audio is playing)
export const HEARTBEAT_MINUTES = 1;      // how often the tracker saves progress
export const MAX_GAP_MS = 3 * 60_000;    // a longer silence means the computer slept
export const SLEEP_CREDIT_MS = 60_000;   // time credited before an unexplained gap

// Time on excluded sites is still counted, but filed under this key — no site name.
export const PRIVATE_KEY = '~private';
export const isPrivate = d => d === PRIVATE_KEY;

// Tabs that aren't websites count too, each kind under one name, kept (like Private) under
// a key no website can have: Memoir itself, the New Tab page, the browser's own pages
// (settings, history, downloads…), other extensions' pages, and files on the computer.
export const PAGE_NAMES = Object.freeze({
  '~memoir': 'Memoir', '~newtab': 'New Tab', '~browser': 'Browser pages', '~extensions': 'Extensions', '~files': 'Files',
});
export const isPage = d => Object.hasOwn(PAGE_NAMES, d);
// Windows apps (from Memoir for Windows: its own, or the extension's once linked), app:name.exe, each with
// a name, a category and an icon: the `apps` record, or Windows' own list (window.memoir). The icon is a file
// name in Memoir for Windows' icons folder; a linked extension keeps the pictures it sent (`appIcons`, as data:
// URLs, by file name: link.js).
export const APP_KEY = /^app:[^<>:"/\\|?*\x00-\x1f]+\.exe$/;
export const ICON_FILE = /^[a-f0-9]{24}\.png$/;
export const isApp = d => typeof d === 'string' && APP_KEY.test(d);
let appList = {};
let appPictures = {};
export const setApps = (map, icons) => {
  appList = map && typeof map === 'object' ? map : {};
  if (icons !== undefined) appPictures = icons && typeof icons === 'object' ? icons : {};
};
const appInfo = d => (globalThis.memoir?.apps || appList)[d];
export const appName = d => appInfo(d)?.name || d.slice(4).replace(/\.exe$/i, '');
// an app's icon in the extension (a data: URL), or null: its first letter instead
export const appIcon = d => { const file = appInfo(d)?.icon; return (ICON_FILE.test(file || '') && appPictures[file]) || null; };
// what a site is called on screen
export const siteName = d => PAGE_NAMES[d] || (isApp(d) ? appName(d) : d);

export const RETENTION_OPTIONS = [0, 365, 182, 91]; // 0 = forever
export const GOAL_MIN_MS = 60_000;
export const GOAL_MAX_MS = (23 * 60 + 59) * 60_000;
export const MAX_TITLES_PER_SITE = 30;
// The version of the export file. 1 (no number): before page links were saved.
export const EXPORT_FORMAT = 2;

export const DEFAULT_SETTINGS = Object.freeze({
  paused: false,
  weeklyReminder: true,
  reminderDay: 0,            // 0 = Sunday … 6 = Saturday
  reminderMinutes: 19 * 60,  // minutes after midnight
  titles: false,             // false = domains only
  excluded: [],
  retention: 0,              // days; 0 = forever (nothing is deleted unless you choose); page titles go with their day
  rainbow: false,            // Rainbow clock (Appearance): the toolbar icon in rainbow colours
});

// Category colours are a colour-blind-checked set with light and dark steps
// (see --cat-* in theme.css). The fixed order is also the stacking order.
export const CATEGORIES = [
  { id: 'social',   label: 'Social',            short: 'Social',   color: 'var(--cat-social)' },
  { id: 'video',    label: 'Video & Streaming', short: 'Video',    color: 'var(--cat-video)' },
  { id: 'games',    label: 'Games',             short: 'Games',    color: 'var(--cat-games)' },
  { id: 'work',     label: 'Productivity',      short: 'Work',     color: 'var(--cat-work)' },
  { id: 'shopping', label: 'Shopping',          short: 'Shopping', color: 'var(--cat-shopping)' },
  { id: 'learning', label: 'Education',         short: 'Learning', color: 'var(--cat-learning)' },
  { id: 'news',     label: 'News & Reading',    short: 'News',     color: 'var(--cat-news)' },
  { id: 'other',    label: 'Other',             short: 'Other',    color: 'var(--cat-other)' },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const SITE_CATEGORIES = {
  social: [
    'facebook.com', 'messenger.com', 'instagram.com', 'x.com', 'twitter.com', 'reddit.com',
    'threads.net', 'threads.com', 'tiktok.com', 'discord.com', 'pinterest.com', 'tumblr.com',
    'snapchat.com', 'linkedin.com', 'zalo.me', 'chat.zalo.me', 'web.whatsapp.com', 'whatsapp.com',
    'telegram.org', 'web.telegram.org', 'bsky.app', 'mastodon.social', 'quora.com', 'weibo.com',
    'line.me', 'vk.com', 'lemon8-app.com',
  ],
  video: [
    'youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv', 'disneyplus.com', 'primevideo.com',
    'vimeo.com', 'bilibili.com', 'bilibili.tv', 'hulu.com', 'max.com', 'hbomax.com',
    'spotify.com', 'soundcloud.com', 'music.apple.com', 'tv.apple.com', 'crunchyroll.com',
    'dailymotion.com', 'fptplay.vn', 'vieon.vn', 'tv360.vn', 'zingmp3.vn', 'nhaccuatui.com',
    'kick.com', 'deezer.com', 'iq.com', 'wetv.vip', 'viu.com',
  ],
  games: [
    'roblox.com', 'store.steampowered.com', 'steampowered.com', 'steamcommunity.com',
    'epicgames.com', 'chess.com', 'lichess.org', 'poki.com', 'crazygames.com', 'itch.io',
    'miniclip.com', 'coolmathgames.com', 'y8.com', 'armorgames.com', 'kongregate.com',
    'playstation.com', 'xbox.com', 'nintendo.com', 'minecraft.net', 'geoguessr.com',
    'wordle.org', 'agar.io', 'slither.io', 'krunker.io',
  ],
  work: [
    'mail.google.com', 'docs.google.com', 'drive.google.com', 'calendar.google.com',
    'meet.google.com', 'sheets.google.com', 'slides.google.com', 'keep.google.com',
    'google.com', 'bing.com', 'duckduckgo.com', 'notion.so', 'notion.site', 'figma.com',
    'github.com', 'gitlab.com', 'bitbucket.org', 'slack.com', 'trello.com', 'asana.com',
    'atlassian.net', 'atlassian.com', 'linear.app', 'canva.com', 'office.com',
    'outlook.live.com', 'outlook.office.com', 'teams.microsoft.com', 'zoom.us', 'miro.com',
    'chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai', 'vercel.com',
    'netlify.com', 'dropbox.com', 'airtable.com', 'clickup.com', 'monday.com', 'onedrive.live.com',
    'icloud.com', 'stackoverflow.com', 'codepen.io', 'replit.com', 'codesandbox.io',
    'console.cloud.google.com', 'aws.amazon.com', 'portal.azure.com', 'cloudflare.com',
    'localhost', '127.0.0.1', 'grammarly.com', 'deepl.com', 'translate.google.com',
    'calendly.com', 'webflow.com', 'framer.com', 'excalidraw.com', 'overleaf.com',
  ],
  shopping: [
    'shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn', 'ebay.com', 'etsy.com', 'aliexpress.com',
    'temu.com', 'walmart.com', 'target.com', 'taobao.com', 'tmall.com', 'ikea.com',
    'bestbuy.com', 'shein.com', 'uniqlo.com', 'zara.com', 'hm.com', 'nike.com', 'adidas.com',
    'sephora.com', 'thegioididong.com', 'cellphones.com.vn', 'fptshop.com.vn', 'dienmayxanh.com',
    'costco.com', 'rakuten.co.jp', 'mercari.com', 'wish.com', 'zalora.com',
  ],
  learning: [
    'wikipedia.org', 'coursera.org', 'udemy.com', 'khanacademy.org', 'duolingo.com', 'edx.org',
    'w3schools.com', 'developer.mozilla.org', 'scholar.google.com', 'quizlet.com',
    'brilliant.org', 'leetcode.com', 'freecodecamp.org', 'codecademy.com', 'skillshare.com',
    'classroom.google.com', 'canvas.instructure.com', 'moodle.org', 'arxiv.org',
    'researchgate.net', 'wolframalpha.com', 'desmos.com', 'geeksforgeeks.org',
    'britannica.com', 'dictionary.cambridge.org', 'merriam-webster.com', 'ted.com',
    'masterclass.com', 'hocmai.vn', 'vuihoc.vn', 'studocu.com',
  ],
  news: [
    'vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'znews.vn', 'zingnews.vn',
    'kenh14.vn', 'vietnamnet.vn', 'laodong.vn', 'bbc.com', 'bbc.co.uk', 'cnn.com',
    'nytimes.com', 'theguardian.com', 'reuters.com', 'apnews.com', 'bloomberg.com',
    'washingtonpost.com', 'news.ycombinator.com', 'substack.com', 'medium.com', 'theverge.com',
    'techcrunch.com', 'news.google.com', 'wsj.com', 'economist.com', 'forbes.com',
    'businessinsider.com', 'npr.org', 'aljazeera.com', 'time.com', 'wired.com',
    'arstechnica.com', 'engadget.com', 'buzzfeed.com', 'vox.com', 'axios.com',
    'wattpad.com', 'goodreads.com', 'archiveofourown.org', 'webtoons.com', 'mangadex.org',
  ],
};

const BRAND_CATEGORIES = {
  amazon: 'shopping', shopee: 'shopping', lazada: 'shopping', ebay: 'shopping', aliexpress: 'shopping',
  temu: 'shopping', shein: 'shopping', ikea: 'shopping', etsy: 'shopping', zalando: 'shopping',
  netflix: 'video', youtube: 'video', twitch: 'video', spotify: 'video', primevideo: 'video',
  facebook: 'social', instagram: 'social', reddit: 'social', tiktok: 'social', twitter: 'social',
  wikipedia: 'learning', wiktionary: 'learning', duolingo: 'learning',
};

const SITE_LOOKUP = (() => {
  const m = new Map();
  for (const [cat, list] of Object.entries(SITE_CATEGORIES)) for (const d of list) m.set(d, cat);
  return m;
})();

const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

function brandOf(domain) {
  const parts = domain.split('.');
  if (parts.length < 2) return domain;
  const sld = parts[parts.length - 2];
  if (parts.length >= 3 && SECOND_LEVEL.has(sld)) return parts[parts.length - 3];
  return sld;
}

export function categorize(domain, overrides = {}) {
  if (!domain) return 'other';
  if (overrides[domain] && CATEGORY_BY_ID[overrides[domain]]) return overrides[domain];
  if (isApp(domain)) return CATEGORY_BY_ID[appInfo(domain)?.category] ? appInfo(domain).category : 'other';
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const hit = SITE_LOOKUP.get(parts.slice(i).join('.'));
    if (hit) return hit;
  }
  const brand = BRAND_CATEGORIES[brandOf(domain)];
  if (brand) return brand;
  if (/\.edu(\.|$)|\.ac\.[a-z]{2}$/.test(domain)) return 'learning';
  if (/(^|\.)(news|tin|bao)|times|daily|post|press|tribune|journal|herald|gazette/.test(domain)) return 'news';
  if (/shop|store|mart|deal|buy|cart/.test(domain)) return 'shopping';
  if (/learn|course|academy|school|tutor|wiki|study|lesson/.test(domain)) return 'learning';
  if (/game|games|play|arcade|puzzle/.test(domain)) return 'games';
  if (/(^|\.)(mail|docs|drive|admin|dashboard|console|app|portal|jira|confluence)\./.test(domain)) return 'work';
  return 'other';
}

// ---------- URLs & sites ----------

// Names that would collide with built-in object keys are never used as keys.
const RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof', 'isprototypeof', 'propertyisenumerable', 'tolocalestring']);
export const safeKey = k => (typeof k === 'string' && !RESERVED.has(k.toLowerCase()) ? k : null);

export function domainFromUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = u.hostname.toLowerCase();
  if (!host) return null;
  if (host.startsWith('www.')) host = host.slice(4);
  return safeKey(host);
}

// What a tab counts as: a website's domain, or one of the pages above. ownId is Memoir's
// own extension id. Null only for an address that can't be read.
export function siteFromUrl(url, ownId = null) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const domain = domainFromUrl(url);
  // the New Tab page some browsers load from the web (Edge's from MSN, Chrome's from Google)
  if (domain === 'ntp.msn.com' || (domain === 'google.com' && u.pathname.startsWith('/_/chrome/newtab'))) return '~newtab';
  if (domain) return domain;
  const scheme = u.protocol.slice(0, -1);
  // a file a website made (a PDF, a picture) belongs to that website
  if (scheme === 'blob') return domainFromUrl(u.pathname) || '~browser';
  if (/^(chrome-)?extension$|^moz-extension$/.test(scheme)) return u.host === ownId ? '~memoir' : '~extensions';
  if (scheme === 'file') return '~files';
  if (scheme === 'chrome-search' || /^(newtab|new-tab-page)$/.test(u.host) || (scheme === 'about' && u.pathname === 'newtab')) return '~newtab';
  return '~browser';
}

// Turns anything the user types ("https://www.YouTube.com/watch?v=…") into a domain.
export function normalizeSite(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (/^app:[^<>:"/\\|?*\x00-\x1f]+\.exe$/.test(s)) return s;
  if (!s || /\s/.test(s)) return null;
  if (isApp(s)) return s; // a Windows app, as its key
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s.replace(/^\*\./, '')}`;
  let host;
  try { host = new URL(s).hostname; } catch { return null; }
  host = host.replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!safeKey(host)) return null;
  if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  if (!/^([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/.test(host)) return null;
  return host;
}

export function isExcluded(domain, list) {
  if (!domain || isPrivate(domain) || !Array.isArray(list)) return false;
  // a website's subdomains go with it; an app is only ever itself
  return list.some(ex => domain === ex || (!isApp(domain) && domain.endsWith(`.${ex}`)));
}

// ---------- dates ----------

const pad = n => String(n).padStart(2, '0');

export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const storageKeyForDay = key => `day:${key}`;

export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Weeks run Monday → Sunday.
export function startOfWeek(date) {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

export function weekDayKeys(weekStart) {
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
}

export function retentionCutoffKey(days, now = new Date()) {
  return days > 0 ? dayKey(addDays(now, -days)) : null;
}

// ---------- formatting ----------

export function formatDuration(ms, { seconds = false } = {}) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  if (seconds) return `${s}s`;
  return total > 0 ? '<1m' : '0m';
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
export function hourLabel(h) {
  return hourFmt.format(new Date(2020, 0, 1, h));
}
export function hourRange(h) {
  return `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`;
}

export function uses24h() {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h23' || hc === 'h24';
  } catch {
    return false;
  }
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export function formatTimeOfDay(minutes) {
  return timeFmt.format(new Date(2020, 0, 1, Math.floor(minutes / 60), minutes % 60));
}

export function formatBytes(b) {
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  const mb = b / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Page titles: drop notification counters like "(3) Inbox", trim and cap length.
export function cleanTitle(title, domain) {
  if (typeof title !== 'string') return null;
  let t = title.replace(/^\(\d+\+?\)\s*/, '').replace(/\s+/g, ' ').trim();
  if (!t || t === domain || /^https?:\/\//i.test(t)) return null;
  // while a page loads (or when it has no title) Chrome shows its address instead
  if (!/\s/.test(t) && domain) {
    const host = t.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./i, '').toLowerCase();
    if (host === domain || host.endsWith(`.${domain}`)) return null;
  }
  if (t.length > 120) t = `${t.slice(0, 119)}…`;
  return safeKey(t);
}

// The address a page title links to: a web page only, without any login, the part
// after #, or the usual tracking tags; very long addresses lose their query, and
// anything still too long isn't kept.
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|igsh|yclid|_hsenc|_hsmi|ref_src|si)$/i;
export function cleanUrl(url, domain = null) {
  if (typeof url !== 'string' || url.length > 4000) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (domain) {
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== domain && !host.endsWith(`.${domain}`)) return null;
  }
  u.username = '';
  u.password = '';
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let out = u.href;
  if (out.length > 500) { u.search = ''; out = u.href; }
  return out.length > 500 ? null : out;
}

// ---------- day records ----------
// A day: { s: {domain: ms}, h: [24 × ms], hs: {hour: {domain: ms}}, ti: {domain: {title: ms}},
//          th: {hour: {domain: {title: ms}}} (the same page times, hour by hour),
//          tu: {domain: {title: url}} (the latest address of each page title),
//          tp: [domain] (sites whose titles and links were deleted as they got old, by older versions) }

export function normalizeDay(rec) {
  const ok = rec && typeof rec === 'object';
  return {
    s: ok && rec.s && typeof rec.s === 'object' ? rec.s : {},
    h: ok && Array.isArray(rec.h) && rec.h.length === 24 ? rec.h : new Array(24).fill(0),
    hs: ok && rec.hs && typeof rec.hs === 'object' ? rec.hs : {},
    ti: ok && rec.ti && typeof rec.ti === 'object' ? rec.ti : {},
    th: ok && rec.th && typeof rec.th === 'object' ? rec.th : {},
    tu: ok && rec.tu && typeof rec.tu === 'object' ? rec.tu : {},
    tp: ok && Array.isArray(rec.tp) ? rec.tp : [],
  };
}

export function cloneDay(d) {
  const hs = {};
  for (const [k, v] of Object.entries(d.hs)) hs[k] = { ...v };
  const ti = {};
  for (const [k, v] of Object.entries(d.ti)) ti[k] = { ...v };
  const th = {};
  for (const [h, slot] of Object.entries(d.th || {})) {
    th[h] = {};
    for (const [k, v] of Object.entries(slot)) th[h][k] = { ...v };
  }
  const tu = {};
  for (const [k, v] of Object.entries(d.tu || {})) tu[k] = { ...v };
  return { s: { ...d.s }, h: d.h.slice(), hs, ti, th, tu, tp: (d.tp || []).slice() };
}

// ---------- each minute once: Windows apps, and the sites in browsers ----------
// Memoir for Windows files a browser's time twice: under the browser (an app, with all its time) and under the
// site in front, as Memoir in a browser does. So the report can list apps and sites apart, and the two can
// merge site by site. Everything that adds time up (totals, the limit, categories, hours) counts it once: a
// browser keeps only the time its sites don't account for. Memoir for Windows has the same (SyncData.cs).
export const BROWSER_APP = /^app:(chrome|msedge|firefox|brave|vivaldi|opera|thorium|chromium|zen|comet|arc|whale|browser|yandex|iridium|librewolf|waterfox|floorp)\.exe$/i;
export const isBrowserApp = d => typeof d === 'string' && BROWSER_APP.test(d);
const sumOf = m => Object.values(m || {}).reduce((a, b) => a + b, 0);
// what an hour went to, each minute once
export function hourParts(slot) {
  if (!slot) return {};
  let browsers = 0, sites = 0;
  for (const [d, ms] of Object.entries(slot)) { if (isBrowserApp(d)) browsers += ms; else if (!isApp(d)) sites += ms; }
  if (!browsers || !sites) return slot;
  const keep = Math.max(0, browsers - sites) / browsers;
  const out = {};
  for (const [d, ms] of Object.entries(slot)) { const v = isBrowserApp(d) ? Math.round(ms * keep) : ms; if (v > 0) out[d] = v; }
  return out;
}
export const hourTotal = slot => sumOf(hourParts(slot));
// a day's names, each minute once (a day kept without hours by older versions: its names as they are)
export function dayParts(d) {
  const hours = Object.values(d.hs || {});
  if (!hours.length) return d.s;
  const out = {};
  for (const slot of hours) for (const [k, ms] of Object.entries(hourParts(slot))) out[k] = (out[k] || 0) + ms;
  return out;
}
export const dayTotal = d => sumOf(dayParts(d));

// ---------- days from outside: an import, or Memoir for Windows once linked ----------
// One set of rules for both, and Memoir for Windows has the same in C# (src/Sync.cs): the merge
// cases in tests/merge-cases run on both sides, so the two always agree.

const HOUR_MS = 3_600_000;
// a name the tracker could have written: a website, Private, a kind of page or a Windows app
export const siteKey = d => (typeof d === 'string' && (d === PRIVATE_KEY || isPage(d) || isApp(d) || domainFromUrl(`http://${d}`) === d) ? d : null);
export const titleKey = t => (typeof t === 'string' && t.length <= 256 && safeKey(t) !== null ? t : null);
const msOf = v => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
function timesOf(m, keyOf) {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) {
    const name = keyOf(k);
    const t = msOf(v);
    if (name !== null && t !== null) out[name] = t;
  }
  return out;
}
const HOUR = /^([0-9]|1[0-9]|2[0-3])$/;

// A day from outside, as clean as one the tracker writes (or null when it isn't a day)
export function cleanDay(v) {
  if (!v || typeof v !== 'object' || !v.s || typeof v.s !== 'object' || !Array.isArray(v.h) || v.h.length !== 24) return null;
  const hs = {};
  for (const [h, slot] of Object.entries(v.hs && typeof v.hs === 'object' ? v.hs : {})) {
    if (!HOUR.test(h)) continue;
    const clean = timesOf(slot, siteKey);
    if (Object.keys(clean).length) hs[h] = clean;
  }
  const ti = {};
  for (const [d, pages] of Object.entries(v.ti && typeof v.ti === 'object' ? v.ti : {})) {
    if (isPrivate(d) || siteKey(d) === null) continue;
    const clean = timesOf(pages, titleKey);
    if (Object.keys(clean).length) ti[d] = clean;
  }
  // a page's link only for a title that's there, and only to a web page on that site
  const tu = {};
  for (const [d, links] of Object.entries(v.tu && typeof v.tu === 'object' ? v.tu : {})) {
    if (!ti[d] || !links || typeof links !== 'object') continue;
    for (const [t, url] of Object.entries(links)) {
      const clean = titleKey(t) !== null && Object.hasOwn(ti[d], t) ? cleanUrl(url, d) : null;
      if (clean) (tu[d] || (tu[d] = {}))[t] = clean;
    }
  }
  const th = {};
  for (const [h, slot] of Object.entries(v.th && typeof v.th === 'object' ? v.th : {})) {
    if (!HOUR.test(h) || !slot || typeof slot !== 'object') continue;
    for (const [d, pages] of Object.entries(slot)) {
      if (!ti[d]) continue;
      const clean = timesOf(pages, t => (titleKey(t) !== null && Object.hasOwn(ti[d], t) ? t : null));
      if (Object.keys(clean).length) (th[h] || (th[h] = {}))[d] = clean;
    }
  }
  const tp = Array.isArray(v.tp) ? [...new Set(v.tp.filter(d => typeof d === 'string' && !isPrivate(d) && siteKey(d) !== null))] : [];
  return { s: timesOf(v.s, siteKey), h: v.h.map(x => msOf(x) ?? 0), hs, ti, th, tu, tp };
}

// A day in both: the larger time for each site in each hour, so nothing is ever counted twice (the same
// file imported again, or the same minutes from both apps, change nothing). No hour holds more than an
// hour: past that, the two counted the same minutes under different names, so they share the hour.
// Days kept without per-hour detail by older versions keep whichever record holds more.
const hourlyTotal = d => Object.values(d.hs).reduce((t, slot) => t + Object.values(slot).reduce((x, y) => x + y, 0), 0);
export function mergeDay(a, b) {
  if (Math.abs(hourlyTotal(a) - sumOf(a.s)) > 1000 || Math.abs(hourlyTotal(b) - sumOf(b.s)) > 1000) return sumOf(b.s) > sumOf(a.s) ? b : a;
  const out = { s: {}, h: new Array(24).fill(0), hs: {}, ti: {}, th: {}, tu: {}, tp: [...new Set([...(a.tp || []), ...(b.tp || [])])] };
  for (let h = 0; h < 24; h++) {
    const slot = {};
    for (const from of [a.hs[h], b.hs[h]]) for (const [d, ms] of Object.entries(from || {})) slot[d] = Math.max(slot[d] || 0, ms);
    if (!Object.keys(slot).length) continue;
    // (a browser and its sites are the same minutes: the hour's time counts them once)
    const total = hourTotal(slot);
    if (total > HOUR_MS) for (const d of Object.keys(slot)) slot[d] = Math.floor(slot[d] * HOUR_MS / total);
    out.hs[h] = slot;
    for (const [d, ms] of Object.entries(slot)) out.s[d] = (out.s[d] || 0) + ms;
    out.h[h] = hourTotal(slot);
  }
  for (const from of [a.ti, b.ti]) {
    for (const [d, pages] of Object.entries(from)) {
      const into = out.ti[d] || (out.ti[d] = {});
      for (const [t, ms] of Object.entries(pages)) into[t] = Math.max(into[t] || 0, ms);
    }
  }
  for (const from of [a.th || {}, b.th || {}]) {
    for (const [h, slot] of Object.entries(from)) {
      for (const [d, pages] of Object.entries(slot)) {
        const into = (out.th[h] || (out.th[h] = {}))[d] || (out.th[h][d] = {});
        for (const [t, ms] of Object.entries(pages)) into[t] = Math.max(into[t] || 0, ms);
      }
    }
  }
  // the incoming link for a page wins (it's the one being brought in)
  for (const from of [a.tu || {}, b.tu || {}]) {
    for (const [d, links] of Object.entries(from)) Object.assign(out.tu[d] || (out.tu[d] = {}), links);
  }
  return out;
}

// Never track, on one day: an excluded name's time becomes Private, its titles and links go (in place;
// true when anything changed)
export function anonymizeDay(rec, list) {
  let changed = false;
  for (const dom of Object.keys(rec.s)) {
    if (!isExcluded(dom, list)) continue;
    rec.s[PRIVATE_KEY] = (rec.s[PRIVATE_KEY] || 0) + rec.s[dom];
    delete rec.s[dom];
    changed = true;
  }
  for (const slot of Object.values(rec.hs)) {
    for (const dom of Object.keys(slot)) {
      if (!isExcluded(dom, list)) continue;
      slot[PRIVATE_KEY] = (slot[PRIVATE_KEY] || 0) + slot[dom];
      delete slot[dom];
      changed = true;
    }
  }
  for (const dom of Object.keys(rec.ti)) if (isExcluded(dom, list)) { delete rec.ti[dom]; changed = true; }
  for (const dom of Object.keys(rec.tu)) if (isExcluded(dom, list)) { delete rec.tu[dom]; changed = true; }
  for (const slot of Object.values(rec.th)) for (const dom of Object.keys(slot)) if (isExcluded(dom, list)) { delete slot[dom]; changed = true; }
  if (rec.tp.some(d => isExcluded(d, list))) { rec.tp = rec.tp.filter(d => !isExcluded(d, list)); changed = true; }
  return changed;
}

// ---------- storage ----------

// Every read-then-write of tracked data holds this lock, in the tracker and in the
// pages alike, so one save can never land between another's read and its write.
export const withData = fn => navigator.locks.request('memoir-data', fn);

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!Array.isArray(merged.excluded)) merged.excluded = [];
  if (!RETENTION_OPTIONS.includes(merged.retention)) merged.retention = DEFAULT_SETTINGS.retention;
  delete merged.titleWeeks; // page titles once had their own time to keep; now they go with their day
  return merged;
}

// one change after another: two at once (two switches flipped quickly) would each write the settings they read
// before the other's, and the second would undo the first
let settingsWrites = Promise.resolve();
export function updateSettings(patch) {
  const write = settingsWrites.then(async () => {
    const next = { ...(await getSettings()), ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  });
  settingsWrites = write.catch(() => {});
  return write;
}

export async function getCategoryOverrides() {
  const { categories } = await chrome.storage.local.get('categories');
  return categories || {};
}

export async function setCategoryOverride(domain, catId) {
  const cats = await getCategoryOverrides();
  cats[domain] = catId;
  await chrome.storage.local.set({ categories: cats });
  return cats;
}

export async function getOrigins() {
  const { origins } = await chrome.storage.local.get('origins');
  return origins || {};
}

// ---------- linked days ----------
// This side's own days are day:<date> (its tracker writes only these); each linked side's days (Memoir for
// Windows, or on Windows each extension) are link:<peer>:<date>, exactly as that side measured them. What's
// shown is both merged (mergeDay: the larger time per name per hour), so two independent measurements of
// the same minutes never add up; a tracker adding onto a merged day would count them twice.
export const linkKey = (peer, date) => `link:${peer}:${date}`;
const DAY_RECORD = /^(day|link:[a-z0-9-]+):(\d{4}-\d{2}-\d{2})$/;
export const isDayRecord = key => DAY_RECORD.test(key);
export const recordDate = key => (DAY_RECORD.exec(key) || [])[2] || null;
async function storageKeys() {
  if (chrome.storage.local.getKeys) return chrome.storage.local.getKeys();
  return Object.keys(await chrome.storage.local.get(null));
}
export async function linkPeers() {
  const { linkPeers: peers } = await chrome.storage.local.get('linkPeers');
  return Array.isArray(peers) ? peers.filter(p => typeof p === 'string' && /^[a-z0-9-]+$/.test(p)) : [];
}
// every stored day record, this side's and its linked sides' (privacy changes, Keep history, Clear all)
export async function listDayRecordKeys() { return (await storageKeys()).filter(isDayRecord); }

// days as shown: this side's own, merged with each linked side's
export async function getDays(keys) {
  const peers = await linkPeers();
  const raw = await chrome.storage.local.get([...keys.map(storageKeyForDay), ...peers.flatMap(p => keys.map(k => linkKey(p, k)))]);
  const out = {};
  for (const k of keys) {
    let d = normalizeDay(raw[storageKeyForDay(k)]);
    for (const p of peers) if (raw[linkKey(p, k)]) d = mergeDay(d, normalizeDay(raw[linkKey(p, k)]));
    out[k] = d;
  }
  return out;
}

// The dates that have a day ("YYYY-MM-DD"), on this side or a linked one, oldest first.
export async function listDayKeys() {
  return [...new Set((await storageKeys()).map(recordDate).filter(Boolean))].sort();
}

export async function getSession() {
  const { session } = await chrome.storage.session.get('session');
  return session || null;
}

export function unsavedMs(session, now = Date.now()) {
  if (!session) return 0;
  const gap = now - session.start;
  if (gap < 0) return 0;
  return gap > MAX_GAP_MS ? SLEEP_CREDIT_MS : gap;
}

// ---------- daily limit ----------
// history: [{ from: 'YYYY-MM-DD', limit: ms | null }], oldest first. The entry in
// effect on a day is the latest one that starts on or before it.

export async function getGoalHistory() {
  const { goal } = await chrome.storage.local.get('goal');
  const h = goal && Array.isArray(goal.history) ? goal.history : [];
  return h
    .filter(e => e && typeof e.from === 'string' && (e.limit === null || Number.isFinite(e.limit)))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

export function limitOn(history, key) {
  let limit = null;
  for (const e of history) {
    if (e.from <= key) limit = e.limit;
    else break;
  }
  return limit;
}

// A committed limit stays locked, today and every day after. It doesn't open
// up again overnight: the only way out is the questions in Settings.
export function limitLocked(history, todayKey) {
  return limitOn(history, todayKey) != null;
}

function withEntry(history, entry) {
  const next = history.filter(e => e.from !== entry.from);
  next.push(entry);
  next.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return next.slice(-400);
}

export async function commitLimit(limitMs, now = new Date()) {
  const ms = Math.round(Math.min(GOAL_MAX_MS, Math.max(GOAL_MIN_MS, limitMs)));
  const today = dayKey(now);
  const history = await getGoalHistory();
  if (limitLocked(history, today)) throw new Error('locked');
  await chrome.storage.local.set({
    goal: { history: withEntry(history, { from: today, limit: ms }) },
    goalNotify: { day: today, n95: false, over: false },
  });
  return ms;
}

export async function removeLimit(now = new Date()) {
  const today = dayKey(now);
  const history = await getGoalHistory();
  if (limitLocked(history, today)) throw new Error('locked');
  await chrome.storage.local.set({ goal: { history: withEntry(history, { from: today, limit: null }) } });
}

// none · ok (green) · warn 75% (yellow) · high 90% (orange) · critical 95% (red) · over
export function goalLevel(used, limit) {
  if (!limit) return 'none';
  if (used > limit) return 'over';
  const f = used / limit;
  if (f >= 0.95) return 'critical';
  if (f >= 0.9) return 'high';
  if (f >= 0.75) return 'warn';
  return 'ok';
}

// The way out of a committed limit (Settings, after a lot of questions):
// from today there's no limit, so a new one can be set. Past days keep theirs.
export async function resetLimit(now = new Date()) {
  const today = dayKey(now);
  const history = await getGoalHistory();
  await chrome.storage.local.set({
    goal: { history: withEntry(history, { from: today, limit: null }) },
    goalNotify: { day: today, n95: false, over: false },
  });
}
