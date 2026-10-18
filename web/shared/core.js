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

export const RETENTION_OPTIONS = [0, 365, 182, 91]; // 0 = forever
export const GOAL_MIN_MS = 60_000;
export const GOAL_MAX_MS = (23 * 60 + 59) * 60_000;
export const MAX_TITLES_PER_SITE = 30;

export const DEFAULT_SETTINGS = Object.freeze({
  paused: false,
  weeklyReminder: true,
  reminderDay: 0,            // 0 = Sunday … 6 = Saturday
  reminderMinutes: 19 * 60,  // minutes after midnight
  titles: false,             // false = domains only
  excluded: [],
  retention: 0,              // days; 0 = forever (nothing is deleted unless you choose)
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
  if (domain.startsWith('app:')) return window.memoir.apps[domain]?.category || 'other';
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

// Turns anything the user types ("https://www.YouTube.com/watch?v=…") into a domain.
export function normalizeSite(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (/^app:[^<>:"/\\|?*\x00-\x1f]+\.exe$/.test(s)) return s;
  if (!s || /\s/.test(s)) return null;
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
  return list.some(ex => domain === ex || (!domain.startsWith('app:') && domain.endsWith(`.${ex}`)));
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

// ---------- day records ----------
// A day: { s: {domain: ms}, h: [24 × ms], hs: {hour: {domain: ms}}, ti: {domain: {title: ms}} }

export function normalizeDay(rec) {
  const ok = rec && typeof rec === 'object';
  return {
    s: ok && rec.s && typeof rec.s === 'object' ? rec.s : {},
    h: ok && Array.isArray(rec.h) && rec.h.length === 24 ? rec.h : new Array(24).fill(0),
    hs: ok && rec.hs && typeof rec.hs === 'object' ? rec.hs : {},
    ti: ok && rec.ti && typeof rec.ti === 'object' ? rec.ti : {},
  };
}

export function cloneDay(d) {
  const hs = {};
  for (const [k, v] of Object.entries(d.hs)) hs[k] = { ...v };
  const ti = {};
  for (const [k, v] of Object.entries(d.ti)) ti[k] = { ...v };
  return { s: { ...d.s }, h: d.h.slice(), hs, ti };
}

export const dayTotal = d => Object.values(d.s).reduce((a, b) => a + b, 0);

// ---------- storage ----------

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!Array.isArray(merged.excluded)) merged.excluded = [];
  if (!RETENTION_OPTIONS.includes(merged.retention)) merged.retention = DEFAULT_SETTINGS.retention;
  return merged;
}

export async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
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

export async function getDays(keys) {
  const raw = await chrome.storage.local.get(keys.map(storageKeyForDay));
  const out = {};
  for (const k of keys) out[k] = normalizeDay(raw[storageKeyForDay(k)]);
  return out;
}

// All stored day keys ("YYYY-MM-DD"), oldest first.
export async function listDayKeys() {
  let keys;
  if (chrome.storage.local.getKeys) keys = await chrome.storage.local.getKeys();
  else keys = Object.keys(await chrome.storage.local.get(null));
  return keys.filter(k => /^day:\d{4}-\d{2}-\d{2}$/.test(k)).map(k => k.slice(4)).sort();
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
