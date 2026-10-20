import {
  CATEGORIES, CATEGORY_BY_ID, PRIVATE_KEY, isPrivate, isPage, siteName, categorize, dayKey, dateFromKey, addDays, startOfWeek,
  weekDayKeys, getDays, getSession, unsavedMs, getSettings, updateSettings, getCategoryOverrides,
  setCategoryOverride, getOrigins, formatDuration, formatBytes, formatTimeOfDay, hourLabel, hourRange, escapeHtml,
  storageKeyForDay, normalizeDay, cloneDay, dayTotal, dayParts, listDayKeys, normalizeSite, isExcluded, uses24h,
  getGoalHistory, limitOn, limitLocked, commitLimit, removeLimit, goalLevel, retentionCutoffKey, resetLimit,
  withData, domainFromUrl, safeKey, cleanUrl, EXPORT_FORMAT, GOAL_MIN_MS, GOAL_MAX_MS,
  isApp, siteKey, cleanDay, mergeDay, anonymizeDay, setApps, listDayRecordKeys, recordDate,
} from './shared/core.js';
import {
  animateNumber, tween, reveal, createTooltip, faviconTile, reducedMotion, syncSegmented, slicePath,
  setOrigins, siteLinkHtml, morph, MorphPopover, replay, EASE_OUT, animateHeight, makeScroller, initSmoothScrolling, disableTitleTooltips,
  ARROW_SVG, POP,
} from './shared/fx.js';
import { getThemePref, setThemePref, watchTheme, THEME_SWITCH_MS, rainbowOn, setRainbow } from './shared/theme.js';
import { createGoalRing, openPicker } from './shared/goal.js';
import { TrendChart } from './trend.js';
import { runGauntlet } from './gauntlet.js';
import { runTour, relight } from './tour.js';
import { createWelcome } from './welcome.js';
import { playLogo } from './shared/logo.js';
import { initCursor, setCursorPref, cursorEnabled, cursorSmooth, setCursorSmooth } from './shared/cursor.js';
import { syncAppearance, adoptAppearance, saveAppearance } from './shared/appearance.js';
import { createDust } from './shared/dust.js';
import { initContextMenu } from './shared/context-menu.js';
import { mailPop } from './shared/mail-pop.js';
import { playOverShow } from './shared/overshow.js';

const $ = id => document.getElementById(id);
const sum = arr => arr.reduce((a, b) => a + b, 0);
const fmt = formatDuration;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const shortDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const dateOnly = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' });
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const SEG_GAP = 2;
const D_IN = 66;
const D_OUT = 90;
const D_GAP = 3.5 / 78;
const D_CORNER = 7;
const TAU = Math.PI * 2;

const icon = id => `<svg><use href="#${id}"/></svg>`;

const state = {
  weekStart: startOfWeek(new Date()),
  demo: false,
  overrides: {},
  demoOverrides: {},
  settings: null,
  summary: null,
  firstRender: true,
  queue: false,       // this render's entrances wait for their cards (see introWait)
  refreshTimer: 0,
  goalHistory: [],
  todayKey: dayKey(new Date()),
  todayRec: normalizeDay(null),
  session: null,
  view: { type: 'week' },
  scope: 'day',       // Categories and Most used start on the current day.
  viewStack: [],
  earliestKey: null,
  stats: null,
  trendWeeks: 12,
  trendCache: null,
};

const tip = createTooltip();
const catPop = new MorphPopover($('cat-pop'), { radius: 16 });
// A site's pages, as a second page of the Most used card (see openPagePop)
const pages = {
  state: 'closed', // opening · open · closing · closed
  mode: null,      // 'drop': grown out of its row in the card · 'fade': cross-faded in
  anim: null,      // the surface (drop)
  tint: null,      // its row highlight (drop)
  head: null,      // the title riding between the row and its place (drop)
  fade: null,      // the surface letting the row through as it lands (drop, closing)
  get isOpen() { return this.state === 'opening' || this.state === 'open'; },
};
const importPop = new MorphPopover($('import-pop'), { radius: 16 });
const linkPop = new MorphPopover($('link-pop'), { radius: 16 });
const guidePop = new MorphPopover($('guide-pop'), { radius: 16 });
// the author's name in Settings: where bug reports go, and my website; the wordmark beside it: Memoir's
// website (shared/mail-pop.js)
const author = mailPop($('author'), $('author-pop'), {
  address: 'iamminavian@gmail.com',
  mailto: `mailto:iamminavian@gmail.com?subject=${encodeURIComponent(`Memoir ${chrome.runtime.getManifest().version} bug report`)}`,
  onCopyFail: address => toast(`Couldn’t copy. The address is ${address}`),
});
const memoirSite = mailPop($('memoir-site'), $('site-pop'));
// and "Your data never leaves this computer": the privacy policy
const privacyLink = mailPop($('privacy-link'), $('privacy-pop'));
const footPops = [[author, 'author', 'author-pop'], [memoirSite, 'memoir-site', 'site-pop'], [privacyLink, 'privacy-link', 'privacy-pop']];
const footOpen = () => footPops.find(([p]) => p.popover.isOpen);

// On the first load (and when the board switches between an empty week and a
// full one) the cards come in 110 ms apart (see the end of recap.css) and what's
// inside a card waits until that card has arrived, so the board fills in card by
// card: each part's own delay counts from its card's arrival.
const INTRO_GAP = 110;
function introWait(sel) {
  if (!state.queue || !document.body.classList.contains('intro')) return 0;
  const card = document.querySelector(sel);
  return (parseInt(card && card.style.getPropertyValue('--i'), 10) || 0) * INTRO_GAP;
}
let queueTimer = 0;
function startQueue() {
  state.queue = true;
  document.body.classList.add('intro');
  clearTimeout(queueTimer);
  queueTimer = setTimeout(() => document.body.classList.remove('intro'), 2600);
}
let goalRing = null;

init();

async function init() {
  await window.memoir.ready;
  initSmoothScrolling();
  disableTitleTooltips();
  initCursor();
  document.fonts.load('600 14px "Memoir Inter"').then(() => document.fonts.load('900 14px "Memoir Inter"')).then(measureSure, measureSure);
  const m = location.hash.match(/week=(\d{4}-\d{2}-\d{2})/);
  if (m) state.weekStart = startOfWeek(dateFromKey(m[1]));
  if (state.weekStart > startOfWeek(new Date())) state.weekStart = startOfWeek(new Date());

  const [settings, overrides, origins, history, keys, session, today, { onboarded, goalTrial, apps, appIcons }] = await Promise.all([
    getSettings(), getCategoryOverrides(), getOrigins(), getGoalHistory(), listDayKeys(), getSession(),
    getDays([state.todayKey]), chrome.storage.local.get(['onboarded', 'goalTrial', 'apps', 'appIcons']),
  ]);
  setApps(apps, appIcons); // Windows apps' names, categories and icons, from a linked Memoir for Windows
  // first visit: the welcome covers the page while it gets ready
  const welcome = onboarded ? null : createWelcome();
  state.settings = settings;
  showPaused();
  renderUpdate({ announce: true });
  // Appearance lives in this place's storage (first paint), with a copy in settings that a linked Memoir
  // shares: changed there while this page was closed, it comes here now (shared/appearance.js)
  syncAppearance().then(changed => { if (changed) updateAppearanceUI(); });
  state.overrides = overrides;
  state.goalHistory = history;
  state.goalTrial = goalTrial || null;
  state.earliestKey = keys[0] || null;
  state.session = session;
  state.todayRec = today[state.todayKey];
  setOrigins(origins);

  goalRing = createGoalRing($('goal-ring'), { onSet: btn => openGoalPicker(btn) });
  wire();
  // the header's clock (it tells the time) plays its entrance with the page, or (first
  // visit) as the welcome's clock flies into it
  const headMark = document.querySelector('.head .mark');
  if (welcome) headMark.classList.add('hold');
  // the first render starts every entrance, so it happens right when the page is
  // shown: straight away, or (first visit) behind the welcome. On a first visit the
  // board is the tour's sample week (a new week is empty): the tour walks it, and Skip
  // goes from it to your own week, as the tour's end does.
  const show = async () => {
    if (welcome) useTourWeek();
    startQueue();
    await render({});
    updateGoal();
    boardShown = true;
    // opened from the over-the-limit notification: the flame's moment, before it's drawn
    if (overPending) { overPending = false; overShow(false); }
    reveal();
    if (!welcome) playLogo(headMark, { delay: 160, live: true });
  };
  // the board's first render happens once, whichever moment asks for it first
  let shown = null;
  const showOnce = () => shown || (shown = show());
  if (welcome) {
    // The board fills in behind the welcome's dim as the welcome plays in (or as it
    // leaves, if a choice comes first). Heading for the tour, the welcome card
    // becomes the tour's first card (handoff); the sample week is drawn once it has
    // landed, so no render ever competes with that animation.
    welcome.play({
      markTarget: headMark,
      // behind the opening: the week drawn, then the tour's sample weeks made
      load: [{ weight: 5, run: showOnce }, { weight: 3, run: warmSamples }],
      onLeave: () => showOnce(),
      // the board already shows the tour's week
      onHanded: () => showOnce(),
    }).then(async ({ choice, handoff }) => {
      if (choice === 'tour') { startTour({ prepared: true, handoff }); return; }
      chrome.storage.local.set({ onboarded: true });
      // Skip: from the sample week to your own, the way the tour's end goes there
      await showOnce();
      state.demo = false;
      state.demoOverrides = {};
      state.weekStart = startOfWeek(new Date());
      resetView({ instant: true });
      await render({});
    });
  } else {
    await show();
    maybeLinkTour();
  }

  // back from the restart that finishes a Link (link.js restartForLink): Settings, at Memoir for Windows
  if (location.hash === '#link') {
    window.history.replaceState(null, '', location.pathname); // (init has its own history: the limit's)
    openSettings();
    setTimeout(() => $('link-row').scrollIntoView({ block: 'center', behavior: 'smooth' }), 700);
  }
  watchTheme(updateAppearanceUI);
  chrome.storage.onChanged.addListener(onStorageChanged);
  document.addEventListener('visibilitychange', applyHiddenChanges);
  setInterval(() => {
    if (isCurrentWeek() && !state.demo && !document.hidden) render({ soft: true });
  }, 60_000);
  setInterval(goalTick, 5000);
  window.addEventListener('hashchange', () => {
    // the over-the-limit notification, with the report already open: the flame rises out of its ring
    if (takeOverHash()) {
      if (!boardShown) { overPending = true; return; }
      const was = goalRing.el.dataset.level === 'over';
      updateGoal();
      overShow(was);
      return;
    }
    const mm = location.hash.match(/week=(\d{4}-\d{2}-\d{2})/);
    if (!mm) return;
    const ws = startOfWeek(dateFromKey(mm[1]));
    if (+ws !== +state.weekStart) goToWeek(ws);
  });

  // Everything sizes to the window: re-lay the charts, highlights and lists on resize.
  let raf = 0;
  let size = '';
  new ResizeObserver(entries => {
    const r = entries[0].contentRect;
    const next = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (!size || next === size) { size = next; return; }
    size = next;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!state.summary || state.firstRender) return;
      renderSummary(state.summary, true);
      if (state.summary.total < 60_000) return;
      renderChart(state.summary, true);
      renderSites(state.summary, true);
      if (state.view.type !== 'week') renderDetail({ soft: true });
      placeHeatFrame({ instant: true });
    });
  }).observe($('board'));
}

// ---------- data ----------

function isCurrentWeek() {
  return +state.weekStart === +startOfWeek(new Date());
}

function activeOverrides() {
  return state.demo ? state.demoOverrides : state.overrides;
}

function mergeSession(day, session, now = new Date()) {
  const extra = unsavedMs(session, now.getTime());
  if (extra <= 0) return;
  const h = now.getHours();
  day.s[session.domain] = (day.s[session.domain] || 0) + extra;
  day.h[h] += extra;
  const slot = day.hs[h] || (day.hs[h] = {});
  slot[session.domain] = (slot[session.domain] || 0) + extra;
  // (Memoir for Windows: a site in front is filed under its browser too, counted once like the rest)
  if (session.browser && session.browser !== session.domain) {
    day.s[session.browser] = (day.s[session.browser] || 0) + extra;
    slot[session.browser] = (slot[session.browser] || 0) + extra;
  }
}

async function loadWeek(weekStart) {
  const keys = weekDayKeys(weekStart);
  const prevKeys = weekDayKeys(addDays(weekStart, -7));
  if (state.demo) return { keys, days: keys.map(sampleDay), prevDays: prevKeys.map(sampleDay) };
  const all = await getDays([...keys, ...prevKeys]);
  const days = keys.map(k => cloneDay(all[k]));
  const session = await getSession();
  const todayIdx = keys.indexOf(dayKey(new Date()));
  if (session && !state.settings.paused && todayIdx >= 0) mergeSession(days[todayIdx], session);
  return { keys, days, prevDays: prevKeys.map(k => all[k]) };
}

// The sample week uses your real limit (or none), so the chart, the highlights
// and the Today's limit card always agree.
function limitsFor(keys) {
  return keys.map(k => limitOn(state.goalHistory, k));
}

function summarize({ keys, days, prevDays }) {
  const overrides = activeOverrides();
  const today = dayKey(new Date());
  const todayIdx = state.demo ? -1 : keys.indexOf(today);
  const isCurrent = todayIdx >= 0;
  const now = new Date();

  const dayTotals = days.map(dayTotal);
  // what each day went to, each minute once (a browser and its sites counted once: core.js hourParts)
  const parts = days.map(dayParts);
  const dayPrivate = parts.map(p => p[PRIVATE_KEY] || 0);
  const total = sum(dayTotals);
  const privateTotal = sum(dayPrivate);
  const totalVisible = total - privateTotal;
  // (private time is Other: core.js categorize)
  const dayCats = parts.map(p => {
    const c = {};
    for (const [dom, ms] of Object.entries(p)) {
      const cat = categorize(dom, overrides);
      c[cat] = (c[cat] || 0) + ms;
    }
    return c;
  });

  const sites = {};
  for (const p of parts) for (const [dom, ms] of Object.entries(p)) if (!isPrivate(dom)) sites[dom] = (sites[dom] || 0) + ms;
  const siteList = Object.entries(sites).filter(([, ms]) => ms >= 1000).sort((a, b) => b[1] - a[1]);
  // Most used: every app and site with all its own time (a browser with all of it), shown apart (Apps | Browsers)
  const nameList = namesOf(days);

  const cats = {};
  for (const c of dayCats) for (const [id, ms] of Object.entries(c)) cats[id] = (cats[id] || 0) + ms;

  const active = dayTotals.map((v, i) => ({ v, i })).filter(d => d.v >= 60_000);
  const activeDays = active.length;
  const avg = activeDays ? total / activeDays : 0;
  const busiest = active.length ? active.reduce((a, b) => (b.v > a.v ? b : a)).i : -1;
  const calmPool = active.filter(d => d.i !== todayIdx);
  const calmest = calmPool.length >= 2 ? calmPool.reduce((a, b) => (b.v < a.v ? b : a)).i : -1;

  const hourTotals = new Array(24).fill(0);
  for (const d of days) d.h.forEach((v, h) => { hourTotals[h] += v; });
  const peakHour = total > 0 ? hourTotals.indexOf(Math.max(...hourTotals)) : -1;

  const prevTotal = isCurrent
    ? sum(prevDays.slice(0, todayIdx + 1).map((d, i) => (i < todayIdx ? dayTotal(d) : sum(d.h.slice(0, now.getHours() + 1)))))
    : sum(prevDays.map(dayTotal));

  let acc = 0;
  let halfCount = 0;
  for (const [, ms] of siteList) {
    acc += ms;
    halfCount++;
    if (acc >= totalVisible / 2) break;
  }

  const limits = limitsFor(keys);
  const future = keys.map(k => !state.demo && k > today);
  const evaluated = keys.map((k, i) => !!limits[i] && !future[i]);
  const over = keys.map((k, i) => evaluated[i] && dayTotals[i] > limits[i]);

  return {
    keys, days, dayTotals, dayPrivate, dayCats, total, totalVisible, privateTotal, siteList, nameList, cats,
    activeDays, avg, busiest, calmest, hourTotals, peakHour, prevTotal, halfCount, todayIdx, isCurrent,
    limits, future, evaluated, over,
  };
}

// ---------- highlights ----------

const dayName = (s, i) => longDay.format(dateFromKey(s.keys[i]));
const hlDay = (s, i) => `<button class="hl" type="button" data-act="day" data-i="${i}">${dayName(s, i)}</button>`;
const hlHour = h => `<button class="hl" type="button" data-act="hour" data-h="${h}">${hourLabel(h)}</button>`;
const hlCat = id => `<button class="hl" type="button" data-act="cat" data-cat="${id}">${CATEGORY_BY_ID[id].label}</button>`;

function joinList(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// The limit line follows whatever the chart is showing: the week, or one day.
function goalLine(s, view) {
  const dayIdx = view.type === 'day' ? view.day : view.type === 'hour' && view.day != null ? view.day : null;
  if (dayIdx != null) {
    const lim = s.limits[dayIdx];
    if (!lim || s.future[dayIdx]) return null;
    const used = s.dayTotals[dayIdx];
    const isToday = s.keys[dayIdx] === dayKey(new Date()) && !state.demo;
    const who = isToday ? 'Today' : hlDay(s, dayIdx);
    if (used > lim) {
      const p = Math.max(1, Math.round(((used - lim) / lim) * 100));
      return { icon: 'i-flame', tone: 'bad', html: `${who} went <strong>${p}% over</strong> your ${fmt(lim)} limit.` };
    }
    const p = pct(used, lim);
    if (isToday) return { icon: 'i-limit', tone: 'mid', level: goalLevel(used, lim), html: `Today, <strong>${p}%</strong> of your ${fmt(lim)} limit is used so far.` };
    return {
      icon: 'i-check', tone: 'good',
      html: p >= 100 ? `${who} stayed <strong>just under</strong> your ${fmt(lim)} limit.`
        : `${who} stayed <strong>${100 - p}% below</strong> your ${fmt(lim)} limit.`,
    };
  }
  const idx = s.keys.map((_, i) => i).filter(i => s.evaluated[i]);
  if (!idx.length) return null;
  const overIdx = idx.filter(i => s.over[i]);
  if (overIdx.length) {
    const n = overIdx.length;
    const days = n <= 3 ? `: ${joinList(overIdx.map(i => hlDay(s, i)))}` : '';
    return { icon: 'i-flame', tone: 'bad', html: `You went over your daily limit on <strong>${n} day${n === 1 ? '' : 's'}</strong>${days}.` };
  }
  if (idx.length === 1 && idx[0] === s.todayIdx) {
    const i = idx[0];
    const p = pct(s.dayTotals[i], s.limits[i]);
    return { icon: 'i-limit', tone: 'mid', level: goalLevel(s.dayTotals[i], s.limits[i]), html: `Today, <strong>${p}%</strong> of your ${fmt(s.limits[i])} limit is used so far.` };
  }
  const avgUse = Math.round(sum(idx.map(i => s.dayTotals[i] / s.limits[i])) / idx.length * 100);
  const complete = state.demo || !s.isCurrent;
  if (complete) {
    return { icon: 'i-check', tone: 'good', html: `No days over your limit this week — <strong>well done!</strong> You used about ${avgUse}% of it a day.` };
  }
  return { icon: 'i-limit', tone: 'mid', level: goalLevel(avgUse, 100), html: `You’re under your limit every day so far, using about <strong>${avgUse}%</strong> of it a day.` };
}

function storyLines(s) {
  const lines = [];
  const b = t => `<strong>${t}</strong>`;
  const pv = ms => pct(ms, s.total);

  // the total is already in the facts above; say it here only when they're hidden
  const facts = document.querySelector('.facts');
  if (!facts || getComputedStyle(facts).display === 'none') {
    const span = s.isCurrent ? `across ${s.activeDays} day${s.activeDays === 1 ? '' : 's'} so far` : 'this week';
    lines.push({ icon: 'i-clock', html: `You spent ${b(fmt(s.total))} using apps and websites ${span}, about ${b(fmt(s.avg))} a day.` });
  }

  const catList = CATEGORIES.filter(c => s.cats[c.id]).sort((a, c) => s.cats[c.id] - s.cats[a.id]);
  const topSite = s.siteList[0];
  if (catList.length && topSite) {
    const top = catList[0];
    // the site name ends the sentence, so its ↗ never sits on other words
    const link = siteLinkHtml(topSite[0]);
    const t = b(fmt(topSite[1]));
    lines.push({
      icon: 'i-grid',
      html: top.id === 'other' ? `${t} went to your top app or website, ${link}.`
        : `Most of it went to ${hlCat(top.id)} (${pv(s.cats[top.id])}%), and ${t} to your top app or website, ${link}.`,
    });
  }

  if (s.peakHour >= 0) {
    const h = s.peakHour;
    let note = '.';
    if (h >= 22 || h < 4) note = ' — late nights are your time.';
    else if (h >= 5 && h < 9) note = ' — an early start.';
    else if (h >= 11 && h < 14) note = ' — mostly around lunch.';
    else if (h >= 18 && h < 22) note = ' — mostly in the evening.';
    lines.push({ icon: 'i-hour', html: `You were most active around ${hlHour(h)}${note}` });
  }

  if (s.busiest >= 0 && s.activeDays >= 2) {
    let line = `${hlDay(s, s.busiest)} was your busiest day at ${fmt(s.dayTotals[s.busiest])}`;
    if (s.calmest >= 0 && s.calmest !== s.busiest) line += `; ${hlDay(s, s.calmest)} was the lightest at ${fmt(s.dayTotals[s.calmest])}.`;
    else line += '.';
    lines.push({ icon: 'i-cal', html: line });
  }

  const focus = (s.cats.work || 0) + (s.cats.learning || 0);
  const fun = (s.cats.social || 0) + (s.cats.video || 0) + (s.cats.games || 0);
  if (focus > 0 && pv(focus) >= 45) lines.push({ icon: 'i-focus', html: `Productivity and education took ${b(fmt(focus))}, or ${pv(focus)}% of your time.` });
  else if (fun > 0 && pv(fun) >= 50) lines.push({ icon: 'i-focus', html: `Social, video and games took ${b(fmt(fun))}, or ${pv(fun)}% of your time.` });
  else if (focus > 0) lines.push({ icon: 'i-focus', html: `Productivity and education took ${b(fmt(focus))} (${pv(focus)}%).` });

  // (the change from last week is already under the big number)
  if (s.privateTotal >= 60_000) {
    lines.push({ icon: 'i-private', html: `${b(fmt(s.privateTotal))} of private activity counts as Other, without its apps or sites.` });
  }
  if (s.siteList.length >= 6) {
    lines.push({ icon: 'i-globe', html: `${b(`${s.siteList.length} apps and websites`)} used; ${s.halfCount} of them made up half your time.` });
  }
  return lines;
}

function lineHtml(line, i, extra = '') {
  const tone = line.tone ? ` ${line.tone}` : '';
  const lvl = line.level ? ` data-level="${line.level}"` : '';
  return `<li class="${extra}" style="--i:${i}"><span class="s-icon${tone}"${lvl}>${icon(line.icon)}</span><span>${line.html}</span></li>`;
}

function niceStep(max) {
  const mins = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720];
  for (const m of mins) if (max / (m * 60_000) <= 4) return m * 60_000;
  return 1440 * 60_000;
}

// ---------- render ----------

let renderSeq = 0;
async function render({ direction = null, soft = false } = {}) {
  const seq = ++renderSeq;
  state.trendCache = null;
  const data = await loadWeek(state.weekStart);
  if (seq !== renderSeq) return;
  const s = summarize(data);
  state.summary = s;

  const empty = s.total < 60_000;
  if (empty && state.view.type !== 'week') resetView({ instant: true });
  // an empty week becoming a full one (or back) changes the whole board, so it
  // comes in card by card, like the first load
  if (!state.firstRender && !soft && empty !== $('board').classList.contains('is-empty')) startQueue();
  renderNav(direction);
  renderSummary(s, soft);
  toggleEmpty(empty);
  // the hour grid is drawn even for an empty week: it holds the layout's bottom row
  renderHeat(s);
  if (!empty) {
    renderChart(s, soft);
    renderDonut(s, soft);
    renderSites(s, soft);
    if (state.view.type !== 'week') renderDetail({ soft: true });
    updateHeatSelection();
  }
  // the other cards have their final sizes now, so the highlights may have less room
  fitStory();
  state.firstRender = false;
  state.queue = false;
}

// how long ago the week was (its dates are beside it, in the arrows' range)
const weeksAgo = start => Math.round((startOfWeek(new Date()) - start) / (7 * 86_400_000));
const agoTitle = n => (n <= 0 ? 'This week' : n === 1 ? 'Last week' : `${n} weeks ago`);
function weekTitle() {
  return state.demo ? 'Sample week' : agoTitle(weeksAgo(state.weekStart));
}

function swapText(el, text, asHtml = false) {
  if (asHtml ? el.innerHTML === text : el.textContent === text) return;
  if (asHtml) el.innerHTML = text;
  else el.textContent = text;
  replay(el, 'swap');
}

function renderNav(direction) {
  const start = state.weekStart;
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const el = $('week-range');
  el.textContent = `${monthDay.format(start)} – ${sameMonth ? end.getDate() : monthDay.format(end)}`;
  if (direction) {
    el.classList.remove('from-left', 'from-right');
    void el.offsetWidth;
    el.classList.add(direction === 'next' ? 'from-right' : 'from-left');
  }
  swapText($('hero-title'), weekTitle());
  $('next-week').disabled = !state.demo && isCurrentWeek();
  const floor = state.earliestKey ? startOfWeek(dateFromKey(state.earliestKey)) : startOfWeek(new Date());
  $('prev-week').disabled = !state.demo && start <= floor;
}

function renderSummary(s, soft) {
  const delay = state.queue ? 220 + introWait('.summary') : 0;
  animateNumber($('stat-avg'), s.avg, { format: v => fmt(v), delay, duration: 1000 });
  animateNumber($('stat-total'), s.total, { format: v => fmt(v), delay: delay + 60, duration: 1000 });

  const trend = $('trend');
  $('trend-btn').disabled = s.total < 60_000;
  if (s.total < 60_000) trend.textContent = 'No activity recorded';
  else if (s.prevTotal > 5 * 60_000) {
    const diff = Math.round(((s.total - s.prevTotal) / s.prevTotal) * 100);
    const when = s.isCurrent ? 'this time last week' : 'last week';
    trend.innerHTML = Math.abs(diff) < 3 ? `About the same as ${when}` : `${icon(diff < 0 ? 'i-down' : 'i-up')}${Math.abs(diff)}% from ${when}`;
  } else trend.textContent = 'No earlier week to compare';

  swapText($('stat-busy'), s.busiest >= 0 ? hlDay(s, s.busiest) : '—', true);
  const top = s.siteList[0];
  swapText($('stat-top'), top ? siteLinkHtml(top[0]) : '—', true);

  // a new week cascades in; anything else (a category moved, a day opened…) is an
  // update: only what changed moves
  setStory(storyItems(s), { update: soft });
}

// Only the limit line changes when you move between the week, a day or an hour.
function refreshGoalLine() {
  const s = state.summary;
  if (!s || s.total < 60_000) return;
  setStory(storyItems(s), { update: true });
}

// ----- highlights, as keyed lines -----
// Each line has a key (the limit line, or its kind of fact), so an update can
// tell what stayed, what changed, what's new and what's gone.
function storyItems(s) {
  const lines = s.total < 60_000 ? [{ icon: 'i-clock', html: 'Nothing has been tracked for this week yet.' }] : storyLines(s);
  const g = s.total < 60_000 ? null : goalLine(s, state.view);
  const seen = {};
  const items = g ? [{ key: 'goal', html: lineHtml(g, 0, 'goal-line') }] : [];
  lines.forEach((l, i) => {
    seen[l.icon] = (seen[l.icon] || 0) + 1;
    items.push({ key: `${l.icon}:${seen[l.icon]}`, html: lineHtml(l, i + (g ? 1 : 0)) });
  });
  return items;
}

const STORY_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
function toLi(item) {
  const t = document.createElement('template');
  t.innerHTML = item.html.trim();
  const li = t.content.firstElementChild;
  li.dataset.key = item.key;
  return li;
}

// a line on its way out: lifted out of the flow right where it is, so nothing
// else jumps, then it fades in place
function storyLeave(ul, li, top, left, width) {
  li.classList.add('leaving');
  Object.assign(li.style, { position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${width}px`, margin: '0', pointerEvents: 'none' });
  if (!li.parentNode) ul.appendChild(li);
  const from = +getComputedStyle(li).opacity;
  li.getAnimations().forEach(a => a.cancel());
  li.animate([{ opacity: Number.isFinite(from) ? from : 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' })
    .finished.then(() => { if (li.classList.contains('leaving')) li.remove(); }, () => {});
}

// a line that comes back while it's still fading out: it turns round, from where it is
function storyRevive(li) {
  const opacity = +getComputedStyle(li).opacity;
  li.getAnimations().forEach(a => a.cancel());
  li.classList.remove('leaving');
  for (const k of ['position', 'top', 'left', 'width', 'margin', 'pointerEvents']) li.style[k] = '';
  return Number.isFinite(opacity) ? opacity : 0;
}

function setStory(items, { update = false } = {}) {
  const ul = $('story');
  const current = [...ul.children].filter(li => !li.classList.contains('leaving'));
  // a fresh list (a new week, the first render): the usual cascade
  if (!update || reducedMotion() || !current.length || current.some(li => !li.dataset.key)) {
    ul.classList.remove('no-anim');
    ul.innerHTML = items.map(x => x.html).join('');
    [...ul.children].forEach((li, i) => { li.dataset.key = items[i].key; });
    fitStory();
    return;
  }
  ul.classList.add('no-anim');
  // FLIP: where everything is now
  const was = new Map(current.map(li => [li.dataset.key, { li, top: li.offsetTop, left: li.offsetLeft, width: li.offsetWidth }]));
  const keys = new Set(items.map(x => x.key));
  for (const [key, w] of was) if (!keys.has(key)) storyLeave(ul, w.li, w.top, w.left, w.width);
  // lines still fading out from an earlier update, by key (copies of old words have none)
  const fading = new Map([...ul.children].filter(li => li.classList.contains('leaving') && li.dataset.key && !was.has(li.dataset.key) && keys.has(li.dataset.key)).map(li => [li.dataset.key, li]));

  // the new order: kept lines move into place, changed ones swap their words, new ones join
  const placed = [];
  for (const item of items) {
    const w = was.get(item.key);
    const fresh = toLi(item);
    if (!w && fading.has(item.key)) {
      // back before it had gone: the same line turns round (no second copy)
      const li = fading.get(item.key);
      const top = li.offsetTop;
      const opacity = storyRevive(li);
      if (li.innerHTML !== fresh.innerHTML) { li.innerHTML = fresh.innerHTML; li.className = fresh.className; }
      ul.appendChild(li);
      placed.push({ li, kind: 'revived', top, opacity });
      continue;
    }
    if (!w) { ul.appendChild(fresh); placed.push({ li: fresh, kind: 'new' }); continue; }
    const changed = w.li.innerHTML !== fresh.innerHTML;
    if (changed) {
      // the old words stay where they were and fade, while the new ones come in
      const old = w.li.cloneNode(true);
      old.removeAttribute('data-key');
      storyLeave(ul, old, w.top, w.left, w.width);
      w.li.innerHTML = fresh.innerHTML;
      w.li.className = fresh.className;
    }
    ul.appendChild(w.li);
    placed.push({ li: w.li, kind: changed ? 'changed' : 'kept', top: w.top });
  }
  // leaving lines (absolute) go last, out of the way
  for (const li of [...ul.children]) if (li.classList.contains('leaving')) ul.appendChild(li);

  // never a scrollbar: lines that no longer fit leave too (new ones just don't join)
  const room = ul.clientHeight;
  for (let i = placed.length - 1; i > 0; i--) {
    const p = placed[i];
    if (p.li.offsetTop + p.li.offsetHeight <= room + 1) break;
    if (p.kind === 'new') p.li.remove();
    else storyLeave(ul, p.li, p.li.offsetTop, p.li.offsetLeft, p.li.offsetWidth);
    placed.splice(i, 1);
  }

  // FLIP: glide from where they were; new and changed words rise in
  let k = 0;
  for (const p of placed) {
    if (p.kind === 'revived') {
      const dy = p.top - p.li.offsetTop;
      p.li.animate([{ opacity: p.opacity, transform: `translateY(${dy.toFixed(1)}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: STORY_EASE });
      continue;
    }
    if (p.kind === 'new' || p.kind === 'changed') {
      const dy = p.kind === 'changed' ? p.top - p.li.offsetTop : 0;
      p.li.animate([
        { opacity: 0, transform: `translateY(${(dy + 6).toFixed(1)}px)` },
        { opacity: 1, transform: 'none' },
      ], { duration: 460, delay: 90 + k * 40, easing: STORY_EASE, fill: 'backwards' });
      k++;
    } else {
      const dy = p.top - p.li.offsetTop;
      if (Math.abs(dy) > 0.5) p.li.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: 460, easing: STORY_EASE });
    }
  }
}

// Drops the last highlights until the list fits its card — never a scrollbar.
// Measured in layout terms, so the lines' entrance slide doesn't count (and lines
// already on their way out don't either).
function fitStory() {
  const ul = $('story');
  const room = ul.clientHeight;
  const lines = () => [...ul.children].filter(li => !li.classList.contains('leaving'));
  while (lines().length > 1) {
    const last = lines().pop();
    if (last.offsetTop + last.offsetHeight <= room + 1) break;
    last.remove();
  }
}

function toggleEmpty(empty) {
  const board = $('board');
  const card = $('empty');
  if (empty) {
    const fresh = isCurrentWeek();
    $('empty-title').textContent = fresh ? 'No activity yet' : 'Nothing this week';
    $('empty-text').textContent = fresh
      ? 'Use your computer as usual and your week will appear here. Nothing ever leaves this computer.'
      : 'No screen time was recorded this week. Try another week, or preview a sample.';
  }
  // paused: the reason it's empty, said instead (Resume is at the top)
  if (empty && isCurrentWeek() && state.settings.paused && !state.demo) {
    $('empty-title').textContent = 'Tracking is paused';
    $('empty-text').textContent = 'Nothing is counted while it’s paused. Press Resume at the top to start again.';
  }
  const wasEmpty = board.classList.contains('is-empty');
  if (wasEmpty === empty && card.hidden === !empty) return;
  const token = ++emptyToken;
  const cards = () => [...board.querySelectorAll(':scope > .card[data-anim]:not(.summary):not(.goal-card):not(.empty)')];
  const clearLeave = els => els.forEach(el => el.getAnimations().forEach(a => { if (a.id === 'leave') a.cancel(); }));
  const still = !state.firstRender && !reducedMotion() && document.body.classList.contains('ready');
  const leave = (el, i) => {
    const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.98)' }],
      { duration: 260, delay: i * 45, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });
    a.id = 'leave';
    return a.finished.catch(() => {});
  };
  if (empty) {
    // the week's cards step aside one by one, then the empty card comes in
    // (cards replay their entrance when they're shown again, so nothing is reset by hand)
    const show = () => {
      if (token !== emptyToken) return;
      board.classList.add('is-empty');
      clearLeave([card]);
      card.hidden = false;
      clearLeave(cards());
      // the clock sets itself to the time as the card comes in (on the first render, once
      // the page shows), then keeps it, the knob going round once a minute
      const logo = card.querySelector('.logo');
      logo.getAnimations({ subtree: true }).forEach(a => a.cancel());
      playLogo(logo, { delay: still ? 300 : 600, live: true });
    };
    if (!still || wasEmpty) { show(); return; }
    Promise.all(cards().map(leave)).then(show);
  } else {
    // the cards are needed right away (they're measured as they render), so they
    // come back at once and enter in turn while the empty card fades away on top
    board.classList.remove('is-empty');
    clearLeave(cards());
    // the hour grid was only out of sight (it kept its place), so it enters by hand,
    // in its turn with the others (which replay their entrance as they reappear)
    const heat = $('heat-card');
    if (still && heat) {
      const i = parseInt(heat.style.getPropertyValue('--i'), 10) || 0;
      heat.animate([{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 700, delay: i * 110 + 30, easing: EASE_OUT, fill: 'backwards' });
    }
    if (!still || card.hidden) { card.hidden = true; return; }
    leave(card, 0).then(() => {
      if (token !== emptyToken) return;
      card.hidden = true;
      clearLeave([card]);
    });
  }
}
let emptyToken = 0;

// ----- stacked daily chart -----

let cols = [];
let avgLine = null;
let limitLine = null;
function buildChart() {
  const plot = $('plot');
  plot.textContent = '';
  cols = [];
  for (let i = 0; i < 7; i++) {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.i = i;
    const stack = document.createElement('div');
    stack.className = 'stack';
    const segs = {};
    for (const cat of CATEGORIES) {
      const seg = document.createElement('i');
      seg.className = 'seg';
      seg.dataset.cat = cat.id;
      seg.style.setProperty('--c', cat.color);
      stack.appendChild(seg);
      segs[cat.id] = seg;
    }
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'day-btn';
    label.dataset.i = i;
    col.append(stack, label);
    plot.appendChild(col);
    cols.push({ col, stack, segs, label });
  }
  avgLine = document.createElement('div');
  avgLine.className = 'avg';
  avgLine.innerHTML = '<span>avg</span>';
  limitLine = document.createElement('div');
  limitLine.className = 'limit-line';
  limitLine.innerHTML = '<span>limit</span>';
  $('chart').append(avgLine, limitLine);

  const show = (col, x, y) => {
    const s = state.summary;
    const i = +col.dataset.i;
    const future = s.future[i];
    const rows = CATEGORIES.filter(c => s.dayCats[i][c.id]).sort((a, b) => s.dayCats[i][b.id] - s.dayCats[i][a.id])
      .map(c => `<div class="tip-row"><span><span class="dot" style="--c:${c.color}"></span>${c.label}</span><b>${fmt(s.dayCats[i][c.id])}</b></div>`).join('');
    let lim = '';
    if (s.evaluated[i]) {
      const L = s.limits[i];
      lim = s.over[i] ? `<div class="tip-sub">${fmt(s.dayTotals[i] - L)} over your ${fmt(L)} limit</div>`
        : `<div class="tip-sub">${pct(s.dayTotals[i], L)}% of your ${fmt(L)} limit</div>`;
    }
    tip.show(`<div class="tip-title">${fullDate.format(dateFromKey(s.keys[i]))}</div>
      <div class="tip-row"><span>${future ? 'Upcoming' : 'Total'}</span><b>${future ? '—' : fmt(s.dayTotals[i])}</b></div>${rows}${lim}`, x, y);
  };
  plot.addEventListener('pointerover', e => {
    const col = e.target.closest('.col');
    if (!col) return;
    plot.classList.add('hovering');
    show(col, e.clientX, e.clientY);
  });
  plot.addEventListener('pointermove', e => tip.move(e.clientX, e.clientY));
  plot.addEventListener('pointerleave', () => { plot.classList.remove('hovering'); tip.hide(); });
  plot.addEventListener('focusin', e => {
    const col = e.target.closest('.col');
    if (!col) return;
    const r = col.getBoundingClientRect();
    show(col, r.left + r.width / 2, r.top + 30);
  });
  plot.addEventListener('focusout', () => tip.hide());
  plot.addEventListener('click', e => {
    const col = e.target.closest('.col');
    if (!col) return;
    const i = +col.dataset.i;
    if (state.summary.future[i]) return;
    tip.hide();
    const btn = cols[i].label;
    const stackR = cols[i].stack.getBoundingClientRect();
    const src = e.target.closest('.day-btn') || stackR.height < 8 ? btn : cols[i].stack;
    openView({ type: 'day', day: i, origin: { kind: 'col', i } }, src);
  });
}

function renderChart(s, soft) {
  if (!cols.length) buildChart();
  const chart = $('chart');
  const plotH = Math.max(40, $('plot').clientHeight);
  const max = Math.max(...s.dayTotals, 1);
  const lastLimit = [...s.limits].reverse().find((l, j) => l && !s.future[6 - j]) || null;
  const showLimit = !!lastLimit && lastLimit <= max * 1.6;
  const top = showLimit ? Math.max(max, lastLimit) : max;
  const step = niceStep(top);
  const scaleMax = Math.max(step, Math.ceil(top / step) * step);
  const px = ms => (ms / scaleMax) * plotH;

  for (const g of chart.querySelectorAll('.gline')) g.remove();
  for (let v = 0; v <= scaleMax + 1; v += step) {
    const g = document.createElement('div');
    g.className = v === 0 ? 'gline base' : 'gline';
    g.style.setProperty('--y', `${px(v).toFixed(1)}px`);
    if (!soft) g.style.animation = `fade-in 0.5s var(--ease) ${state.queue ? introWait('#chart-card') + 120 : 0}ms both`;
    g.innerHTML = `<span>${fmt(v)}</span>`;
    const near = y => Math.abs(px(v) - y) < 13;
    if ((s.avg > 0 && near(px(s.avg))) || (showLimit && near(px(lastLimit)))) g.querySelector('span').style.visibility = 'hidden';
    chart.prepend(g);
  }
  avgLine.style.setProperty('--y', `${px(s.avg).toFixed(1)}px`);
  avgLine.style.opacity = s.avg > 0 ? '1' : '0';
  limitLine.style.setProperty('--y', `${px(lastLimit || 0).toFixed(1)}px`);
  limitLine.style.setProperty('--from', String(Math.max(0, s.limits.findIndex(l => !!l))));
  limitLine.style.opacity = showLimit ? '1' : '0';
  const clash = showLimit && Math.abs(px(lastLimit) - px(s.avg)) < 13;
  avgLine.querySelector('span').style.opacity = clash ? '0' : '1';

  cols.forEach(({ col, stack, segs, label }, i) => {
    const date = dateFromKey(s.keys[i]);
    const future = s.future[i];
    col.classList.toggle('future', future);
    col.classList.toggle('today', !state.demo && s.keys[i] === dayKey(new Date()));
    label.innerHTML = `${shortDay.format(date)}${s.over[i] ? '<span class="over-dot" aria-hidden="true"></span>' : ''}`;
    label.disabled = future;
    label.setAttribute('aria-label', `${fullDate.format(date)}: ${future ? 'upcoming' : fmt(s.dayTotals[i])}${s.over[i] ? ', over your limit' : ''}. Open this day.`);
    const delay = state.queue ? 260 + i * 45 + introWait('#chart-card') : soft ? 0 : i * 22;
    stack.style.setProperty('--d', `${delay}ms`);
    const nonzero = CATEGORIES.filter(c => s.dayCats[i][c.id] > 0);
    const apply = () => {
      let y = 0;
      for (const cat of CATEGORIES) {
        const seg = segs[cat.id];
        seg.style.setProperty('--d', `${delay}ms`);
        const ms = s.dayCats[i][cat.id] || 0;
        if (!ms) {
          seg.style.setProperty('--h', '0px');
          seg.style.setProperty('--y', `${y.toFixed(1)}px`);
          continue;
        }
        const share = px(ms);
        const isTop = nonzero[nonzero.length - 1] === cat;
        seg.style.setProperty('--h', `${Math.max(0.5, share - (isTop ? 0 : SEG_GAP)).toFixed(1)}px`);
        seg.style.setProperty('--y', `${y.toFixed(1)}px`);
        y += share;
      }
      const th = `${(s.dayTotals[i] > 0 ? Math.max(3, px(s.dayTotals[i])) : 0).toFixed(1)}px`;
      stack.dataset.th = th;
      stack.style.setProperty('--th', th);
    };
    if (state.queue) requestAnimationFrame(() => requestAnimationFrame(apply));
    else apply();
  });
  // another week: its average a day fades in for the last one's (the first paint and the minute's updates just set it)
  if (state.view.type === 'week') setChartHeader(!soft && !state.firstRender && !state.queue);
}

// ----- detail views: a day, an hour on a day, or an hour across the week -----

const sameView = (a, b) => a.type === b.type && a.day === b.day && a.hour === b.hour;

function viewTitle(v) {
  const s = state.summary;
  if (v.type === 'week') return 'Daily activity';
  if (v.type === 'trend') return 'Trend over time';
  if (v.type === 'day') return `${dayName(s, v.day)} activity`;
  if (v.day != null) return `${dayName(s, v.day)}, ${hourLabel(v.hour)}`;
  return `${hourLabel(v.hour)} activity`;
}

function backLabel(v) {
  if (v.type === 'week') return 'Back to daily activity';
  if (v.type === 'trend') return 'Back to trend';
  if (v.type === 'day') return `Back to ${dayName(state.summary, v.day)}`;
  if (v.day != null) return `Back to ${shortDay.format(dateFromKey(state.summary.keys[v.day]))}, ${hourLabel(v.hour)}`;
  return `Back to ${hourLabel(v.hour)}`;
}

function captionFor(v) {
  const s = state.summary;
  if (v.type === 'week') return `Average ${fmt(s.avg)} a day`;
  if (v.type === 'trend') return 'Daily average, week by week';
  if (v.type === 'day') return dateOnly.format(dateFromKey(s.keys[v.day]));
  if (v.day != null) return hourRange(v.hour);
  return `${hourRange(v.hour)} · each day`;
}

// Text that rolls like an odometer: up for "next", down for "previous", a soft fade otherwise.
function rollInto(box, text, dir) {
  const cur = [...box.children].filter(c => !c.dataset.leaving);
  if (cur.length === 1 && cur[0].textContent === text) return;
  const span = document.createElement('span');
  span.textContent = text;
  if (!dir || reducedMotion() || !cur.length) {
    box.textContent = '';
    box.appendChild(span);
    return;
  }
  box.appendChild(span);
  const up = dir === 'next' ? -1 : 1;
  for (const old of cur) {
    old.dataset.leaving = '1';
    const kf = dir === 'fade'
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${up * 105}%)`, opacity: 0, filter: 'blur(1.5px)' }];
    old.animate(kf, { duration: dir === 'fade' ? 160 : 320, easing: EASE_OUT, fill: 'forwards' })
      .finished.then(() => old.remove(), () => old.remove());
  }
  const kf = dir === 'fade'
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ transform: `translateY(${-up * 105}%)`, opacity: 0, filter: 'blur(1.5px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }];
  span.animate(kf, { duration: dir === 'fade' ? 260 : 420, delay: dir === 'fade' ? 60 : 30, easing: EASE_OUT, fill: 'backwards' });
}

function setChartHeader(animate = true, dir = null) {
  const v = state.view;
  const title = $('chart-title');
  const text = viewTitle(v);
  if (!animate) title.textContent = text;
  else if (dir === 'next' || dir === 'prev') {
    if (title.textContent !== text) {
      title.textContent = text;
      if (!reducedMotion()) {
        title.animate([
          { transform: `translateX(${dir === 'next' ? 10 : -10}px)`, opacity: 0, filter: 'blur(2px)' },
          { transform: 'none', opacity: 1, filter: 'blur(0)' },
        ], { duration: 380, easing: EASE_OUT });
      }
    }
  } else swapText(title, text);

  const card = $('chart-card');
  const detail = v.type !== 'week';
  const deep = detail && state.viewStack.length >= 2;
  const stepping = v.type === 'day' || v.type === 'hour';
  card.classList.toggle('detail', detail);
  card.classList.toggle('deep', deep);
  card.classList.toggle('stepping', stepping);

  const back = $('chart-back');
  back.setAttribute('aria-hidden', String(!detail));
  back.tabIndex = detail ? 0 : -1;
  const home = $('chart-home');
  home.setAttribute('aria-hidden', String(!deep));
  home.tabIndex = deep ? 0 : -1;
  if (detail) {
    const prev = state.viewStack[state.viewStack.length - 1] || { type: 'week' };
    const lbl = $('back-label');
    if (lbl.textContent !== backLabel(prev)) {
      lbl.textContent = backLabel(prev);
      if (animate) replay(lbl, 'swap');
    }
  }

  const unit = v.type === 'day' ? 'day' : 'hour';
  for (const [id, d] of [['step-prev', -1], ['step-next', 1]]) {
    const b = $(id);
    b.disabled = !stepping || !stepTarget(v, d);
    b.tabIndex = stepping ? 0 : -1;
    b.setAttribute('aria-label', `${d < 0 ? 'Previous' : 'Next'} ${unit}`);
    b.title = `${d < 0 ? 'Previous' : 'Next'} ${unit}`;
  }
  rollInto($('chart-caption'), captionFor(v), animate ? (dir || 'fade') : null);
  $('trend-btn').classList.toggle('on', v.type === 'trend');
}

function isFutureHour(i, h) {
  const s = state.summary;
  if (state.demo) return false;
  if (s.future[i]) return true;
  return s.keys[i] === dayKey(new Date()) && h > new Date().getHours();
}

// Where ‹ and › lead from a view (null at the edges of the week, or of what has happened yet).
function stepTarget(v, delta) {
  const s = state.summary;
  if (!s) return null;
  if (v.type === 'day') {
    const i = v.day + delta;
    return i >= 0 && i <= 6 && !s.future[i] ? { ...v, day: i } : null;
  }
  if (v.type !== 'hour') return null;
  if (v.day == null) {
    const h = v.hour + delta;
    return h >= 0 && h <= 23 ? { ...v, hour: h } : null;
  }
  let day = v.day;
  let h = v.hour + delta;
  if (h > 23) { day += 1; h = 0; }
  if (h < 0) { day -= 1; h = 23; }
  if (day < 0 || day > 6 || isFutureHour(day, h)) return null;
  return { ...v, day, hour: h };
}

// Keeps "Back" pointed at the matching place after a sideways step.
function retarget(o, v) {
  if (!o) return o;
  if (o.kind === 'col' && v.type === 'day') return { kind: 'col', i: v.day };
  if (o.kind === 'heat-day' && v.type === 'day') return { kind: 'heat-day', r: v.day };
  if (o.kind === 'cell' && v.type === 'hour' && v.day != null) return { kind: 'cell', r: v.day, c: v.hour };
  if (o.kind === 'dcol' && v.day != null) return { kind: 'dcol', i: v.day };
  if (o.kind === 'hcol' && v.type === 'hour') return { kind: 'hcol', h: v.hour };
  return o;
}

function originElement(o) {
  if (!o) return null;
  if (o.kind === 'col') return cols[o.i] ? cols[o.i].label : null;
  if (o.kind === 'cell') return heatCells[o.r] ? heatCells[o.r][o.c] : null;
  if (o.kind === 'heat-day') return heatDays[o.r] || null;
  if (o.kind === 'trend') return $('trend-btn');
  if (o.kind === 'hcol') return $('detail-view').querySelector(`.dv:not(.leaving) .hcol[data-h="${o.h}"]`);
  if (o.kind === 'dcol') return $('detail-view').querySelector(`.dv:not(.leaving) .dcol[data-i="${o.i}"]`);
  return null;
}

// A tinted surface flies from what you clicked into the chart, then fades.
// Moved with transform only, so the flight never makes the page re-lay itself out.
// One at a time: a new one sends the last on its way quickly, so clicking (or
// pressing Back) several times in a row never stacks them up.
const VIEW_OPEN_MS = 600;   // opening a day or an hour
const VIEW_BACK_MS = 680;   // going back: slower, so it's easy to follow
let ghostShell = null;
function ghost(fromEl, toEl, { reverse = false } = {}) {
  if (ghostShell) {
    const old = ghostShell;
    ghostShell = null;
    old.animate([{ opacity: +getComputedStyle(old).opacity || 0 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' })
      .finished.then(() => old.remove(), () => old.remove());
  }
  if (reducedMotion() || !fromEl || !toEl || !fromEl.isConnected) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  if (!a.width || !b.width || !a.height || !b.height) return;
  let bg = getComputedStyle(fromEl).backgroundColor;
  // a square of the hour grid has its own colour; other things get a neutral tint
  const solid = !(!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent');
  if (!solid) bg = 'var(--fill-2)';
  const src = reverse ? b : a;
  const dst = reverse ? a : b;
  const shell = document.createElement('div');
  shell.className = 'ghost';
  Object.assign(shell.style, {
    left: `${dst.left}px`, top: `${dst.top}px`, width: `${dst.width}px`, height: `${dst.height}px`,
    background: bg, borderRadius: `${reverse ? parseFloat(getComputedStyle(fromEl).borderRadius) || 6 : 14}px`,
  });
  document.body.appendChild(shell);
  ghostShell = shell;
  const from = `translate(${(src.left - dst.left).toFixed(1)}px, ${(src.top - dst.top).toFixed(1)}px) scale(${(src.width / dst.width).toFixed(4)}, ${(src.height / dst.height).toFixed(4)})`;
  const end = () => { if (ghostShell === shell) ghostShell = null; shell.remove(); };
  if (!reverse) {
    shell.animate([{ transform: from, opacity: 0.9 }, { transform: 'none', opacity: 0 }], { duration: VIEW_OPEN_MS, easing: EASE_OUT })
      .finished.then(end, end);
    return;
  }
  // Going back is the opening's mirror: it starts out faint while it's big (never a solid
  // block over the chart), gathers as it shrinks, and settles into what opened it; on a
  // square of its own colour it lands solid and simply becomes the square, otherwise it fades.
  shell.animate([{ transform: from }, { transform: 'none' }], { duration: VIEW_BACK_MS, easing: EASE_OUT });
  shell.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: solid ? 0.9 : 0 }], { duration: VIEW_BACK_MS, easing: 'linear', fill: 'forwards' })
    .finished.then(end, end);
}

function openView(next, sourceEl = null) {
  if (!state.summary || state.summary.total < 60_000) return;
  if (sameView(next, state.view)) { goBack(); return; }
  closeCatPop(true);
  tip.hide();
  if (next.type === 'week') { goHome(); return; }
  state.viewStack.push(state.view);
  if (state.viewStack.length > 8) state.viewStack.splice(0, state.viewStack.length - 8);
  state.view = next;
  ghost(sourceEl, $('chart-card').querySelector('.views'));
  showDetail();
}

// ‹ / › : the previous or next hour (or day), sliding the way you're going.
function stepView(delta) {
  const next = stepTarget(state.view, delta);
  if (!next) return;
  next.origin = retarget(state.view.origin, next);
  // stepping an hour past midnight lands in the next day, so Back leads to that day
  const parent = state.viewStack[state.viewStack.length - 1];
  if (parent && parent.type === 'day' && next.type === 'hour' && next.day != null && next.day !== state.view.day) {
    state.viewStack[state.viewStack.length - 1] = { ...parent, day: next.day, origin: retarget(parent.origin, { type: 'day', day: next.day }) };
  }
  state.view = next;
  tip.hide();
  closeCatPop(true);
  replay($(delta > 0 ? 'step-next' : 'step-prev'), 'go');
  showDetail(null, delta > 0 ? 'next' : 'prev');
}

// Same hour, another day: a sideways step, so Back still leads where you came from.
function switchDay(i) {
  const v = state.view;
  if (v.type !== 'hour' || v.day == null || i === v.day) return;
  const next = { ...v, day: i };
  next.origin = retarget(v.origin, next);
  state.view = next;
  tip.hide();
  showDetail(null, i > v.day ? 'next' : 'prev');
}

function goBack() {
  if (state.view.type === 'week') return;
  tip.hide();
  closeCatPop(true);
  const leaving = state.view;
  const prev = state.viewStack.pop() || { type: 'week' };
  state.view = prev;
  // shrink back into what opened it, once that is on screen again
  const shrinkBack = () => {
    const target = originElement(leaving.origin);
    if (target) ghost(target, $('chart-card').querySelector('.views'), { reverse: true });
  };
  if (prev.type === 'week') {
    returnToWeek();
    shrinkBack();
  } else {
    showDetail(shrinkBack, null, { back: true });
  }
}

// The round button: straight back to the daily chart from however deep you are.
function goHome() {
  if (state.view.type === 'week') return;
  tip.hide();
  closeCatPop(true);
  const root = state.viewStack.find(v => v.type !== 'week') || state.view;
  state.view = { type: 'week' };
  returnToWeek();
  const target = originElement(root.origin);
  if (target && root.origin && ['col', 'cell', 'heat-day', 'trend'].includes(root.origin.kind)) {
    ghost(target, $('chart-card').querySelector('.views'), { reverse: true });
  }
}

function returnToWeek() {
  state.view = { type: 'week' };
  state.viewStack = [];
  detailSeq++;
  $('week-view').classList.add('is-active');
  $('detail-view').classList.remove('is-active');
  setChartHeader(true);
  replayWeekChart();
  updateHeatSelection();
  refreshGoalLine();
  followDay();
}

function resetView({ instant = false } = {}) {
  const wasDetail = state.view.type !== 'week';
  state.view = { type: 'week' };
  state.viewStack = [];
  detailSeq++;
  $('week-view').classList.add('is-active');
  $('detail-view').classList.remove('is-active');
  if (instant) $('detail-view').textContent = '';
  if (state.summary && state.summary.total >= 60_000) {
    setChartHeader(!instant);
    if (wasDetail && !instant) replayWeekChart();
  }
  updateHeatSelection();
  refreshGoalLine();
  followDay();
}

// Coming back to the week: the bars rise again and the lines settle in.
function replayWeekChart() {
  if (reducedMotion() || !cols.length) return;
  for (const { stack } of cols) {
    stack.style.transition = 'none';
    stack.style.setProperty('--th', '0px');
  }
  void $('plot').offsetWidth;
  cols.forEach(({ stack }, i) => {
    stack.style.transition = '';
    stack.style.setProperty('--d', `${180 + i * 55}ms`);
    stack.style.setProperty('--th', stack.dataset.th || '0px');
  });
  for (const line of [avgLine, limitLine]) {
    const to = line.style.opacity || '1';
    if (to !== '0') line.animate({ opacity: [0, to], transform: [`translateY(calc(-1 * var(--y, 0px) + 6px))`, `translateY(calc(-1 * var(--y, 0px)))`] }, { duration: 680, delay: 460, easing: EASE_OUT, fill: 'backwards' });
  }
}

function showDetail(after = null, dir = null, { back = false } = {}) {
  const dv = $('detail-view');
  const cur = dv.classList.contains('is-active') ? dv.querySelector('.dv:not(.leaving)') : null;
  $('week-view').classList.remove('is-active');
  dv.classList.add('is-active');
  setChartHeader(true, dir);
  updateHeatSelection();
  refreshGoalLine();
  followDay();
  if (cur && dir && !reducedMotion()) {
    slideDetail(cur, dir);
    if (after) after();
    return;
  }
  if (cur && !reducedMotion()) {
    cur.style.pointerEvents = 'none';
    cur.classList.add('leaving');
    const seq = ++detailSeq;
    const go = () => {
      if (seq !== detailSeq) return;
      renderDetail({ soft: false });
      if (after) after();
    };
    // the old content steps aside (gently, and slower going back); a newer click
    // simply skips the render this one was waiting for (detailSeq)
    cur.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: back ? 260 : 170, easing: 'ease-out', fill: 'forwards' })
      .finished.then(go, go);
  } else {
    ++detailSeq;
    renderDetail({ soft: false });
    if (after) after();
  }
}

let detailSeq = 0;
function buildDetailWrap(soft) {
  if (pages.isOpen && popAnchor && popAnchor.closest('#detail-view')) closePagePop();
  const v = state.view;
  const wrap = document.createElement('div');
  wrap.className = `dv dv-${v.type}${soft ? ' soft' : ''}`;
  if (v.type === 'day') buildDayView(wrap, v.day, soft);
  else if (v.type === 'hour') buildHourView(wrap, v.day, v.hour, soft);
  else if (v.type === 'trend') buildTrendView(wrap, soft);
  return wrap;
}

function mountDetail(wrap, { animatePill = false } = {}) {
  for (const ol of wrap.querySelectorAll('ol.rows')) makeScroller(ol);
  const strip = wrap.querySelector('.dstrip');
  if (strip) placePill(strip, animatePill);
}

function renderDetail({ soft = false } = {}) {
  const v = state.view;
  const s = state.summary;
  if (!s || v.type === 'week') return;
  const dv = $('detail-view');
  const wrap = buildDetailWrap(soft);
  dv.textContent = '';
  dv.appendChild(wrap);
  mountDetail(wrap);
  if (!soft) growBars(wrap);
}

// Sideways step: the day or hour strip stays and re-shapes, the rest slides through.
function slideDetail(cur, dir) {
  const dv = $('detail-view');
  ++detailSeq;
  for (const el of dv.querySelectorAll('.dv.leaving')) el.remove();
  const wrap = buildDetailWrap(true);
  const kept = reuseStrip(cur, wrap);
  countTotal(cur, wrap);
  // the header row stays put: its number counts over instead of sliding
  const oldTop = cur.querySelector('.dv-top');
  if (oldTop) oldTop.style.visibility = 'hidden';
  cur.classList.add('leaving');
  cur.style.pointerEvents = 'none';
  cur.style.position = 'absolute';
  cur.style.inset = '0';
  dv.appendChild(wrap);
  mountDetail(wrap, { animatePill: true });
  const dx = dir === 'next' ? 1 : -1;
  cur.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-34 * dx}px)` }], { duration: 240, easing: EASE_OUT, fill: 'forwards' })
    .finished.then(() => cur.remove(), () => cur.remove());
  let k = 0;
  for (const el of wrap.children) {
    if (el === kept) continue;
    if (el.classList.contains('dv-top')) {
      for (const bit of el.querySelectorAll('.dv-meta, .goal-pill')) bit.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 80, easing: 'ease-out', fill: 'backwards' });
      continue;
    }
    el.animate([{ opacity: 0, transform: `translateX(${38 * dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 70 + k * 45, easing: EASE_OUT, fill: 'backwards' });
    k++;
  }
}

// Moves the old strip into the new view and eases every bar to its new height.
function reuseStrip(cur, wrap) {
  for (const sel of ['.dstrip', '.hstrip']) {
    const old = cur.querySelector(sel);
    const next = wrap.querySelector(sel);
    if (!old || !next) continue;
    const oldCols = old.querySelectorAll(sel === '.dstrip' ? '.dcol' : '.hcol');
    const newCols = next.querySelectorAll(sel === '.dstrip' ? '.dcol' : '.hcol');
    if (oldCols.length !== newCols.length) continue;
    oldCols.forEach((o, i) => {
      const n = newCols[i];
      o.className = n.className;
      o.disabled = n.disabled;
      o.setAttribute('aria-label', n.getAttribute('aria-label'));
      if (n.hasAttribute('aria-current')) o.setAttribute('aria-current', 'true');
      else o.removeAttribute('aria-current');
      const ob = o.querySelector('.dbar, .hbar');
      const nb = n.querySelector('.dbar, .hbar');
      if (sel === '.hstrip') {
        const before = [...ob.children].filter(c => c.tagName === 'I').map(c => c.outerHTML).join('');
        ob.innerHTML = nb.innerHTML;
        // the colours cross-fade too: the old stack rides on top (scaled with the bar) and fades away
        if (before && before !== ob.innerHTML && !reducedMotion()) {
          const ghost = document.createElement('span');
          ghost.className = 'hbar-old';
          ghost.innerHTML = before;
          ob.appendChild(ghost);
          ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: i * 12, easing: 'ease-in-out', fill: 'both' })
            .finished.then(() => ghost.remove(), () => ghost.remove());
        }
      }
      morphBar(ob, parseFloat(ob.dataset.hh) || 0, parseFloat(nb.dataset.hh) || 0, i);
      ob.dataset.hh = nb.dataset.hh;
      const ot = o.querySelector('.dt');
      const nt = n.querySelector('.dt');
      if (ot && nt && ot.textContent !== nt.textContent) {
        ot.textContent = nt.textContent;
        if (!reducedMotion()) ot.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: i * 25, easing: EASE_OUT, fill: 'backwards' });
      }
    });
    // leave a same-sized gap behind so the old view doesn't jump while it fades
    const ph = document.createElement('div');
    ph.style.height = `${old.offsetHeight}px`;
    ph.style.flex = 'none';
    old.replaceWith(ph);
    next.replaceWith(old);
    return old;
  }
  return null;
}

// A bar changes height by scaling (a compositor-only animation), then settles at its new size.
function morphBar(bar, oldPct, newPct, i) {
  bar.getAnimations().forEach(a => a.cancel());
  bar.classList.add('grown');
  if (reducedMotion() || oldPct === newPct) { bar.style.height = `${newPct}%`; return; }
  const opts = { duration: 560, delay: i * 12, easing: EASE_OUT, fill: 'backwards' };
  if (newPct > 0) {
    bar.style.height = `${newPct}%`;
    bar.animate([{ transform: `scaleY(${(oldPct / newPct).toFixed(4)})` }, { transform: 'none' }], opts);
  } else {
    const a = bar.animate([{ transform: 'none' }, { transform: 'scaleY(0)' }], { ...opts, fill: 'forwards' });
    a.finished.then(() => { bar.style.height = '0%'; a.cancel(); }, () => {});
  }
}

// The big number counts from the old value to the new one.
function countTotal(cur, wrap) {
  const a = cur.querySelector('.dv-total');
  const b = wrap.querySelector('.dv-total');
  if (!a || !b || typeof a._ms !== 'number' || typeof b._ms !== 'number') return;
  b._value = a._ms;
  animateNumber(b, b._ms, { format: b._fmt || (v => fmt(v)), duration: 650 });
}

// The pill behind the open day in a strip glides to the new day.
function placePill(strip, animate) {
  const pill = strip.querySelector('.dpill');
  if (!pill) return;
  const on = strip.querySelector('.dcol.on');
  if (!on) { pill.classList.remove('show'); return; }
  const set = () => {
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  };
  if (!animate || !pill.classList.contains('show') || reducedMotion()) {
    pill.classList.add('instant');
    set();
    void pill.offsetWidth;
    pill.classList.remove('instant');
    pill.classList.add('show');
  } else set();
}

function goalPill(used, lim) {
  const level = goalLevel(used, lim);
  const text = level === 'over' ? `${fmt(used - lim)} over limit` : `${pct(used, lim)}% of ${fmt(lim)} limit`;
  return `<span class="goal-pill" data-level="${level}">${icon(level === 'over' ? 'i-flame' : 'i-limit')}${text}</span>`;
}

function buildDayView(wrap, i, soft) {
  const s = state.summary;
  const d = s.days[i];
  const total = s.dayTotals[i];
  const nowH = new Date().getHours();
  const isToday = !state.demo && s.keys[i] === dayKey(new Date());
  const top = document.createElement('div');
  top.className = 'dv-top';
  top.style.setProperty('--i', 0);
  top.innerHTML = `<span class="dv-total num">${fmt(total)}</span><span class="dv-meta">${pct(total, s.total)}% of the week</span>${s.evaluated[i] ? goalPill(total, s.limits[i]) : ''}`;
  const tot = top.querySelector('.dv-total');
  tot._ms = total;
  tot._value = total;
  tot._fmt = v => fmt(v);

  const strip = document.createElement('div');
  strip.className = 'hstrip';
  strip.style.setProperty('--i', 1);
  const maxH = Math.max(...d.h, 1);
  for (let h = 0; h < 24; h++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hcol';
    b.dataset.h = h;
    const future = s.future[i] || (isToday && h > nowH);
    b.disabled = future || d.h[h] <= 0;
    b.setAttribute('aria-label', `${hourRange(h)}: ${d.h[h] > 0 ? fmt(d.h[h], { seconds: true }) : 'no activity'}`);
    const bar = document.createElement('span');
    bar.className = 'hbar';
    const cats = hourCats(d, h);
    let known = 0;
    for (const c of CATEGORIES) {
      if (!cats[c.id]) continue;
      known += cats[c.id];
      const seg = document.createElement('i');
      seg.style.setProperty('--c', c.color);
      seg.style.setProperty('--f', (cats[c.id] / Math.max(1, d.h[h])).toFixed(4));
      bar.appendChild(seg);
    }
    const unknown = d.h[h] - known;
    if (unknown > 1000) {
      const seg = document.createElement('i');
      seg.className = 'unknown';
      seg.style.setProperty('--f', (unknown / Math.max(1, d.h[h])).toFixed(4));
      bar.appendChild(seg);
    }
    const hh = d.h[h] > 0 ? Math.max(4, (d.h[h] / maxH) * 100) : 0;
    bar.dataset.hh = hh.toFixed(2);
    bar.style.setProperty('--d', `${h * 14}ms`);
    bar.style.height = `${hh.toFixed(2)}%`;
    if (soft) bar.classList.add('grown');
    b.appendChild(bar);
    strip.appendChild(b);
  }
  for (const h of [0, 6, 12, 18]) {
    const l = document.createElement('span');
    l.className = 'hlab';
    l.style.gridColumn = `${h + 1} / span 6`;
    l.textContent = hourLabel(h);
    strip.appendChild(l);
  }

  const list = siteRows(ofKind(Object.entries(d.s).filter(([dom]) => !isPrivate(dom))), soft, [i], { hour: null });
  list.style.setProperty('--i', 2);
  wrap.append(top, strip, list);
  if (!list.children.length) wrap.appendChild(emptyNote(total > 0 ? 'Only private activity on this day.' : 'No screen time on this day.'));
  if (s.dayPrivate[i] >= 60_000) wrap.appendChild(privateNote(s.dayPrivate[i]));
}

function hourCats(d, h) {
  const out = {};
  const slot = d.hs[h] || {};
  for (const [dom, ms] of Object.entries(slot)) {
    const c = categorize(dom, activeOverrides());
    out[c] = (out[c] || 0) + ms;
  }
  return out;
}

function buildHourView(wrap, dayIdx, h, soft) {
  const s = state.summary;
  const idxs = dayIdx != null ? [dayIdx] : s.keys.map((_, i) => i);
  const agg = {};
  let total = 0;
  let known = 0;
  let priv = 0;
  for (const i of idxs) {
    total += s.days[i].h[h];
    const slot = s.days[i].hs[h] || {};
    for (const [dom, ms] of Object.entries(slot)) {
      known += ms;
      if (isPrivate(dom)) { priv += ms; continue; }
      agg[dom] = (agg[dom] || 0) + ms;
    }
  }
  const top = document.createElement('div');
  top.className = 'dv-top';
  top.style.setProperty('--i', 0);
  const meta = dayIdx != null ? `${fullDate.format(dateFromKey(s.keys[dayIdx]))}` : `${hourRange(h)} on each day`;
  top.innerHTML = `<span class="dv-total num">${fmt(total, { seconds: true })}</span><span class="dv-meta">${meta}</span>`;
  const tot = top.querySelector('.dv-total');
  tot._ms = total;
  tot._value = total;
  tot._fmt = v => fmt(v, { seconds: true });
  wrap.appendChild(top);

  // the same hour on every day of the week, for comparison (the open day is marked)
  {
    const strip = document.createElement('div');
    strip.className = 'dstrip';
    strip.innerHTML = '<span class="dpill" aria-hidden="true"></span>';
    strip.style.setProperty('--i', 1);
    const vals = s.keys.map((_, i) => s.days[i].h[h]);
    const max = Math.max(...vals, 1);
    s.keys.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === dayIdx ? 'dcol on' : 'dcol';
      b.dataset.i = i;
      b.disabled = i !== dayIdx && (s.future[i] || vals[i] <= 0);
      if (i === dayIdx) b.setAttribute('aria-current', 'true');
      b.setAttribute('aria-label', `${fullDate.format(dateFromKey(k))}, ${hourRange(h)}: ${vals[i] > 0 ? fmt(vals[i], { seconds: true }) : 'no activity'}`);
      const hh = vals[i] > 0 ? Math.max(6, (vals[i] / max) * 100) : 0;
      b.innerHTML = `<span class="dbar-wrap"><span class="dbar${soft ? ' grown' : ''}" data-hh="${hh.toFixed(2)}" style="--d:${i * 40}ms;height:${hh.toFixed(2)}%"></span></span><span class="dt num">${vals[i] > 0 ? fmt(vals[i]) : '—'}</span><span class="dl">${shortDay.format(dateFromKey(k))}</span>`;
      strip.appendChild(b);
    });
    wrap.appendChild(strip);
  }

  const list = siteRows(Object.entries(agg), soft, idxs, { hour: h });
  list.style.setProperty('--i', 2);
  wrap.appendChild(list);
  if (!list.children.length) {
    let msg = 'No screen time in this hour.';
    if (total > 0 && priv >= total - 1000) msg = 'This hour was private activity.';
    else if (total > 0) msg = 'Site details weren’t recorded for this hour — it was tracked before this update.';
    wrap.appendChild(emptyNote(msg));
  } else if (total - known > 60_000) {
    wrap.appendChild(emptyNote(`${fmt(total - known)} of this was tracked before app and website details were saved.`, true));
  }
  if (priv >= 60_000 && list.children.length) wrap.appendChild(privateNote(priv));
}

// ----- trend over time -----

const TREND_RANGES = [[4, '4 weeks'], [12, '12 weeks'], [24, '24 weeks'], [52, '1 year']];
const trendRangeName = n => (n === 52 ? 'year' : `${n}-week`);

async function loadTrend(weeks) {
  const starts = [];
  for (let k = weeks - 1; k >= 0; k--) starts.push(addDays(state.weekStart, -7 * k));
  const keysByWeek = starts.map(st => weekDayKeys(st));
  const today = dayKey(new Date());
  let days;
  if (state.demo) {
    days = Object.fromEntries(keysByWeek.flat().map(k => [k, sampleDay(k)]));
  } else {
    days = await getDays(keysByWeek.flat());
    if (days[today] && state.session && !state.settings.paused) {
      const d = cloneDay(days[today]);
      mergeSession(d, state.session);
      days[today] = d;
    }
  }
  return keysByWeek.map((keys, w) => {
    const focus = w === keysByWeek.length - 1;
    // weeks before anything was tracked aren't drawn at all
    if (!state.demo && (!state.earliestKey || keys[6] < state.earliestKey)) return { start: starts[w], avg: null, total: 0, days: 0, focus };
    const totals = keys.filter(k => state.demo || k <= today).map(k => dayTotal(days[k]));
    const active = totals.filter(t => t >= 60_000).length;
    const total = sum(totals);
    return { start: starts[w], avg: active ? total / active : 0, total, days: active, focus };
  });
}

function buildTrendView(wrap, soft) {
  const top = document.createElement('div');
  top.className = 'dv-top tr-top';
  top.style.setProperty('--i', 0);
  top.innerHTML = `<span class="dv-total num">—</span><span class="dv-meta tr-meta">&nbsp;</span>
    <div class="segmented tr-range" role="group" aria-label="How far back"><span class="thumb"></span>${TREND_RANGES.map(([n, l]) => `<button type="button" data-weeks="${n}" aria-pressed="${n === state.trendWeeks}">${l}</button>`).join('')}</div>`;
  const host = document.createElement('div');
  host.className = 'tr-chart';
  host.style.setProperty('--i', 1);
  wrap.append(top, host);
  const range = top.querySelector('.tr-range');
  const chart = new TrendChart(host, {
    onHover: (d, x, y) => {
      if (!d) { tip.move(x, y); return; }
      const end = addDays(d.start, 6);
      const span = `${monthDay.format(d.start)} – ${d.start.getMonth() === end.getMonth() ? end.getDate() : monthDay.format(end)}`;
      const who = d.focus ? (state.demo ? 'Sample week' : isCurrentWeek() ? 'This week' : 'The week you’re viewing') : 'Click to open this week';
      tip.show(`<div class="tip-title">${span}</div>
        <div class="tip-row"><span>Daily average</span><b>${fmt(d.avg)}</b></div>
        <div class="tip-row"><span>Total</span><b>${fmt(d.total)}</b></div>
        <div class="tip-row"><span>Days used</span><b>${d.days}</b></div>
        <div class="tip-note">${who}</div>`, x, y);
    },
    onLeave: () => tip.hide(),
    onPick: d => {
      if (d.focus) return;
      tip.hide();
      goToWeek(d.start);
    },
  });
  wrap._trend = chart;
  requestAnimationFrame(() => syncSegmented(range, false));
  range.addEventListener('click', e => {
    const b = e.target.closest('button[data-weeks]');
    if (!b) return;
    const n = +b.dataset.weeks;
    if (n === state.trendWeeks) return;
    state.trendWeeks = n;
    for (const x of range.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    syncSegmented(range);
    refreshTrend(wrap, true);
  });
  refreshTrend(wrap, !soft);
}

let trendSeq = 0;
async function refreshTrend(wrap, animate) {
  const seq = ++trendSeq;
  const key = `${state.demo}|${dayKey(state.weekStart)}|${state.trendWeeks}`;
  let data = state.trendCache && state.trendCache.key === key ? state.trendCache.data : null;
  if (!data) {
    data = await loadTrend(state.trendWeeks);
    if (seq !== trendSeq) return;
    state.trendCache = { key, data };
  }
  if (!wrap.isConnected || !wrap._trend) return;
  const limit = limitOn(state.goalHistory, dayKey(new Date())) || null;
  const shown = data.filter(d => d.avg != null);
  let note = wrap.querySelector('.tr-note');
  if (shown.length < 2) {
    if (!note) {
      note = document.createElement('p');
      note.className = 'tr-note';
      note.textContent = 'A trend needs at least two weeks of screen time. Check back next week.';
      wrap.querySelector('.tr-chart').appendChild(note);
    }
  } else if (note) note.remove();
  wrap._trend.setData(data, { limit, animate });

  const focus = data[data.length - 1];
  const others = data.slice(0, -1).filter(d => d.avg != null && d.days > 0);
  const avgOthers = others.length ? sum(others.map(d => d.avg)) / others.length : null;
  const tot = wrap.querySelector('.tr-top .dv-total');
  if (typeof tot._value !== 'number') tot._value = 0;
  animateNumber(tot, focus.avg || 0, { format: v => fmt(v), duration: animate ? 900 : 1 });
  const whose = state.demo ? 'this sample week' : isCurrentWeek() ? 'a day this week' : 'a day that week';
  let meta = whose;
  if (avgOthers && focus.avg) {
    const diff = Math.round(((focus.avg - avgOthers) / avgOthers) * 100);
    meta += Math.abs(diff) < 3 ? ` · about your ${trendRangeName(state.trendWeeks)} average`
      : ` · <strong>${Math.abs(diff)}% ${diff < 0 ? 'below' : 'above'}</strong> your ${trendRangeName(state.trendWeeks)} average`;
  }
  const metaEl = wrap.querySelector('.tr-meta');
  if (metaEl.innerHTML !== meta) {
    metaEl.innerHTML = meta;
    if (animate) replay(metaEl, 'swap');
  }
}

function emptyNote(text, small = false) {
  const p = document.createElement('p');
  p.className = small ? 'dv-note' : 'dv-empty';
  p.style.setProperty('--i', 3);
  p.textContent = text;
  return p;
}

function privateNote(ms) {
  const p = document.createElement('p');
  p.className = 'dv-note';
  p.style.setProperty('--i', 3);
  p.innerHTML = `${icon('i-private')}<span>+ ${fmt(ms)} of private activity</span>`;
  return p;
}

// Horizontal bars, one per site; the list scrolls when there are many.
// pages: { hour } when a click on a row shows its pages (the day and hour views)
function siteRows(entries, soft, dayIdxs, pages = null) {
  const ol = document.createElement('ol');
  ol.className = `rows${soft ? ' soft' : ''}`;
  ol._days = dayIdxs;
  ol._hour = pages ? pages.hour : null;
  const list = entries.filter(([dom, ms]) => !isPrivate(dom) && ms >= 1000).sort((a, b) => b[1] - a[1]).slice(0, 80);
  const max = list.length ? list[0][1] : 1;
  list.forEach(([domain, ms], i) => {
    const li = siteRow(domain, ms, max, i, soft);
    if (pages && hasPages(domain, dayIdxs, pages.hour)) {
      li.classList.add('has-pages');
      const time = li.querySelector('.row-time');
      time.tabIndex = 0;
      time.setAttribute('role', 'button');
      time.setAttribute('aria-label', `${time.textContent}. See each page’s time on ${siteName(domain)}`);
    }
    ol.appendChild(li);
  });
  return ol;
}

function siteRow(domain, ms, max, i, soft) {
  const cat = CATEGORY_BY_ID[categorize(domain, activeOverrides())];
  const li = document.createElement('li');
  li.className = 'row';
  li.dataset.domain = domain;
  li.style.setProperty('--i', Math.min(i, 12));
  li.innerHTML = `<div class="row-main"><span class="row-name">${siteLinkHtml(domain)}</span><span class="row-cat"><span class="dot" style="--c:${cat.color}"></span>${cat.label}</span></div>
    <span class="row-time">${fmt(ms, { seconds: true })}</span>
    <div class="row-bar"><i style="--c:${cat.color};--d:${260 + Math.min(i, 12) * 45}ms${soft ? `;--w:${Math.max(2, (ms / max) * 100).toFixed(2)}%` : ''}" data-w="${Math.max(2, (ms / max) * 100).toFixed(2)}"></i></div>`;
  li.prepend(faviconTile(domain, cat.color));
  return li;
}

function growBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const i of root.querySelectorAll('.row-bar i[data-w]')) i.style.setProperty('--w', `${i.dataset.w}%`);
    for (const b of root.querySelectorAll('.hbar[data-hh], .dbar[data-hh]')) b.classList.add('grown');
  }));
}

function titlesFor(domain, dayIdxs) {
  const s = state.summary;
  const agg = {};
  for (const i of dayIdxs || s.keys.map((_, j) => j)) {
    const t = s.days[i].ti[domain];
    if (t) for (const [k, v] of Object.entries(t)) agg[k] = (agg[k] || 0) + v;
  }
  return Object.entries(agg).sort((a, b) => b[1] - a[1]);
}

function titlesTip(domain, dayIdxs) {
  const list = titlesFor(domain, dayIdxs);
  if (!list.length) return null;
  const named = list.filter(([t]) => t);
  const other = list.find(([t]) => !t);
  const rows = named.slice(0, 3).map(([t, ms]) => `<div class="tip-page"><span>${escapeHtml(t)}</span><b>${fmt(ms)}</b></div>`).join('');
  const more = named.length > 3 || other ? `<div class="tip-note">+ ${named.length > 3 ? `${named.length - 3} more page${named.length - 3 === 1 ? '' : 's'}` : 'other pages'}</div>` : '';
  return `<div class="tip-title">Top pages · ${escapeHtml(siteName(domain))}</div>${rows}${more}`;
}

// ----- category donut -----

let donutSegs = null;
const donutNow = {};
let donutCancel = null;
let focusCat = null;

function buildDonut() {
  const g = $('donut-segs');
  donutSegs = {};
  for (const cat of CATEGORIES) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', 'donut-seg');
    p.setAttribute('fill-rule', 'evenodd');
    p.style.fill = cat.color;
    p.dataset.cat = cat.id;
    g.appendChild(p);
    donutSegs[cat.id] = p;
    donutNow[cat.id] = { start: 0, frac: 0 };
  }
  const svg = document.querySelector('.donut');
  svg.addEventListener('pointerover', e => {
    const seg = e.target.closest && e.target.closest('.donut-seg');
    if (seg) setFocusCat(seg.dataset.cat);
  });
  svg.addEventListener('pointerleave', () => setFocusCat(null));
  svg.addEventListener('click', e => {
    const seg = e.target.closest && e.target.closest('.donut-seg');
    if (seg) openCatPop(seg.dataset.cat, seg);
  });
  const legend = $('cat-legend');
  legend.addEventListener('pointerover', e => {
    const li = e.target.closest('li[data-cat]');
    if (li) setFocusCat(li.dataset.cat);
  });
  legend.addEventListener('pointerleave', () => setFocusCat(null));
  legend.addEventListener('click', e => {
    const b = e.target.closest('button[data-cat]');
    if (b) openCatPop(b.dataset.cat, b);
  });
}

function drawSeg(p, start, frac, single) {
  if (frac < 0.0008) { p.setAttribute('d', ''); return; }
  p.setAttribute('d', single && frac > 0.9995
    ? slicePath(100, 100, D_IN, D_OUT, 0, TAU, D_CORNER)
    : slicePath(100, 100, D_IN, D_OUT, start * TAU + D_GAP / 2, (start + frac) * TAU - D_GAP / 2, D_CORNER));
}

// ----- Week / Day: Categories and Most used show the whole week (default) or one day -----

// the day shown: the one open in Daily activity, else today, else the week's last day with activity
function scopeDay(s) {
  const v = state.view;
  if (v.type !== 'week' && v.day != null) return v.day;
  const t = s.keys.indexOf(dayKey(new Date()));
  if (t >= 0) return t;
  for (let i = 6; i >= 0; i--) if (s.dayTotals[i] > 0) return i;
  return 6;
}
function scoped(s = state.summary) {
  if (state.scope !== 'day') {
    const sub = state.demo ? 'sample week' : 'this week';
    return { day: null, cats: s.cats, siteList: s.siteList, nameList: s.nameList, total: s.total, priv: s.privateTotal, sub, of: 'of the week', when: 'this week' };
  }
  const i = scopeDay(s);
  const siteList = Object.entries(dayParts(s.days[i])).filter(([d, ms]) => !isPrivate(d) && ms >= 1000).sort((a, b) => b[1] - a[1]);
  const nameList = namesOf([s.days[i]]);
  const today = s.keys[i] === dayKey(new Date());
  const name = today ? 'today' : longDay.format(dateFromKey(s.keys[i]));
  return { day: i, cats: s.dayCats[i], siteList, nameList, total: s.dayTotals[i], priv: s.dayPrivate[i], sub: name, of: `of ${name}`, when: today ? 'today' : `on ${name}` };
}
let scopeShownDay = null;
let scopeTried = false; // visited Week before returning to Day (for the tour)
function setScope(scope) {
  if (state.scope === scope) return;
  state.scope = scope;
  if (scope === 'week') scopeTried = true;
  const seg = $('scope');
  seg.style.setProperty('--k', scope === 'day' ? 1 : 0);
  for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.scope === scope));
  renderScoped();
}
function renderScoped() {
  const s = state.summary;
  if (!s || s.total < 60_000) return;
  closeCatPop(true);
  if (focusCat) setFocusCat(null);
  renderDonut(s, false);
  renderSites(s, false);
}
// on Day, the shown day follows the one opened in Daily activity
function followDay() {
  setTimeout(() => {
    const s = state.summary;
    if (state.scope !== 'day' || !s || s.total < 60_000) return;
    if (scopeDay(s) !== scopeShownDay) renderScoped();
  });
}

function renderDonut(s, soft) {
  if (!donutSegs) buildDonut();
  const sc = scoped(s);
  scopeShownDay = sc.day;
  const target = {};
  let acc = 0;
  for (const cat of CATEGORIES) {
    const frac = sc.total ? (sc.cats[cat.id] || 0) / sc.total : 0;
    target[cat.id] = { start: acc, frac };
    acc += frac;
  }
  const from = {};
  for (const id in donutNow) from[id] = { ...donutNow[id] };
  const single = CATEGORIES.filter(c => target[c.id].frac > 0).length === 1;
  if (donutCancel) donutCancel();
  donutCancel = tween(state.queue ? 1300 : soft ? 500 : 850, p => {
    for (const cat of CATEGORIES) {
      const a = from[cat.id];
      const b = target[cat.id];
      const cur = { start: a.start + (b.start - a.start) * p, frac: a.frac + (b.frac - a.frac) * p };
      donutNow[cat.id] = cur;
      drawSeg(donutSegs[cat.id], cur.start, cur.frac, single && p >= 1);
    }
  }, { delay: state.queue ? 320 + introWait('.donut-card') : 0 });

  if (!focusCat) {
    animateNumber($('donut-total'), sc.total, { format: v => fmt(v), delay: state.queue ? 320 + introWait('.donut-card') : 0, duration: 1000 });
    $('donut-sub').textContent = sc.sub;
  }

  // a legend with more or fewer rows changes the card's height: it glides there, and
  // Most used below it follows, instead of both jumping (on short windows the legend
  // decides the card's height)
  const buildLegend = () => {
    const ul = $('cat-legend');
    ul.classList.toggle('soft', soft);
    ul.textContent = '';
    CATEGORIES.filter(c => sc.cats[c.id]).sort((a, b) => sc.cats[b.id] - sc.cats[a.id]).forEach((c, i) => {
      const li = document.createElement('li');
      li.dataset.cat = c.id;
      li.style.setProperty('--i', i);
      if (c.id === focusCat) li.classList.add('on');
      li.innerHTML = `<button type="button" data-cat="${c.id}" title="${c.label} — see its apps and websites"><span class="dot" style="--c:${c.color}"></span><span class="name">${c.short}</span><span class="time">${fmt(sc.cats[c.id])}</span></button>`;
      ul.appendChild(li);
    });
  };
  if (state.queue) buildLegend();
  else animateHeight(document.querySelector('.donut-card'), () => (soft ? regroup($('cat-legend'), 'cat', buildLegend) : buildLegend()), { duration: 520 });
}

let centerTimer = 0;
function setDonutCenter(total, sub) {
  const c = $('donut-center');
  clearTimeout(centerTimer);
  c.classList.add('swapping');
  centerTimer = setTimeout(() => {
    const t = $('donut-total');
    cancelAnimationFrame(t._raf);
    t.textContent = total;
    $('donut-sub').textContent = sub;
    c.classList.remove('swapping');
  }, 130);
}

function setFocusCat(id) {
  if (focusCat === id) return;
  focusCat = id;
  document.querySelector('.donut').classList.toggle('focus', !!id);
  for (const seg of Object.values(donutSegs)) seg.classList.toggle('on', seg.dataset.cat === id);
  const legend = $('cat-legend');
  legend.classList.toggle('focus', !!id);
  for (const li of legend.children) li.classList.toggle('on', li.dataset.cat === id);
  const plot = $('plot');
  plot.classList.toggle('cat-focus', !!id);
  for (const c of cols) for (const [cid, seg] of Object.entries(c.segs)) seg.classList.toggle('on', cid === id);
  const sc = scoped();
  if (id) {
    const cat = CATEGORY_BY_ID[id];
    setDonutCenter(fmt(sc.cats[id] || 0), `${cat.label} · ${pct(sc.cats[id] || 0, sc.total)}%`);
  } else {
    $('donut-total')._value = sc.total;
    setDonutCenter(fmt(sc.total), sc.sub);
  }
}

// ----- category popover: grows out of the word or slice you clicked -----

let popCat = null;
function openCatPop(catId, anchor) {
  const s = state.summary;
  if (!s || !CATEGORY_BY_ID[catId]) return;
  if (popCat === catId && catPop.isOpen) { closeCatPop(); return; }
  tip.hide();
  closeCatMenu(true);
  const cat = CATEGORY_BY_ID[catId];
  // from the donut it follows Week / Day; from a highlight it's always the week
  const sc = anchor.closest && anchor.closest('.donut-card') ? scoped(s) : { cats: s.cats, siteList: s.siteList, total: s.total, priv: s.privateTotal, when: 'this week' };
  const entries = sc.siteList.filter(([d]) => categorize(d, activeOverrides()) === catId);
  const el = $('cat-pop');
  el.innerHTML = `<div class="pop-head"><span class="pop-title"><span class="dot" style="--c:${cat.color}"></span>${cat.label}</span><span class="pop-meta num">${fmt(sc.cats[catId] || 0)} · ${pct(sc.cats[catId] || 0, sc.total)}%</span></div>`;
  const list = siteRows(entries, false, null);
  el.appendChild(list);
  makeScroller(list);
  const priv = catId === 'other' && sc.priv >= 60_000 ? sc.priv : 0;
  if (!entries.length && !priv) el.appendChild(emptyNote(`No apps or websites in this category ${sc.when}.`));
  if (priv) el.appendChild(privateNote(priv));
  for (const b of document.querySelectorAll('.hl.active')) b.classList.remove('active');
  if (anchor.classList && anchor.classList.contains('hl')) anchor.classList.add('active');
  const wasOpen = catPop.isOpen;
  popCat = catId;
  const go = () => catPop.open(anchor, { fromRadius: anchor instanceof SVGElement ? 12 : 6 }).then(() => growBars(el));
  if (wasOpen) catPop.close({ instant: true }).then(go);
  else go();
}

function closeCatPop(instant = false) {
  if (!catPop.isOpen && $('cat-pop').hidden) return;
  popCat = null;
  for (const b of document.querySelectorAll('.hl.active')) b.classList.remove('active');
  catPop.close({ instant });
}

// ----- a site's pages: grows out of its row in Most used -----

// Its pages over the days given (all of the week when none), or over one hour of
// them, with each page's latest link, and the newest of those days whose titles were
// deleted as they got old. An hour from before pages were kept hour by hour shows its
// whole day's pages instead (wholeDay), and says so.
function pagesFor(domain, dayIdxs, hour = null) {
  const s = state.summary;
  const idxs = dayIdxs || s.keys.map((_, j) => j);
  const agg = {};
  const links = {};
  let gone = null;
  let dayOnly = false;
  const add = t => { for (const [k, v] of Object.entries(t)) agg[k] = (agg[k] || 0) + v; };
  for (const i of idxs) {
    const d = s.days[i];
    const u = d.tu && d.tu[domain];
    if (u) Object.assign(links, u);
    if (d.tp && d.tp.includes(domain)) gone = s.keys[i];
    if (hour == null) { if (d.ti[domain]) add(d.ti[domain]); continue; }
    const byHour = d.th && d.th[hour] && d.th[hour][domain];
    if (byHour) add(byHour);
    else if (d.ti[domain] && (d.hs[hour] || {})[domain]) dayOnly = true;
  }
  if (hour != null && !Object.keys(agg).length && dayOnly) {
    // only whole days to go on: those days' pages (the days this site was on in this hour)
    const days = idxs.filter(i => s.days[i].ti[domain] && (s.days[i].hs[hour] || {})[domain]);
    return { ...pagesFor(domain, days), wholeDay: true };
  }
  // the share of "other pages" goes last, whatever its time
  const list = Object.entries(agg).filter(([, ms]) => ms >= 1000).sort((a, b) => (!a[0]) - (!b[0]) || b[1] - a[1]);
  return { list, links, gone, wholeDay: false };
}
function hasPages(domain, dayIdxs, hour = null) {
  if (isPrivate(domain)) return false;
  const p = pagesFor(domain, dayIdxs, hour);
  return p.list.length > 0 || !!p.gone;
}
// "today", "on Monday", "this week"; with an hour, "9 – 10 PM on Monday"
function pagesWhen(dayIdxs, hour = null) {
  const s = state.summary;
  const one = dayIdxs && dayIdxs.length === 1 ? dayIdxs[0] : null;
  const day = one == null ? null : !state.demo && s.keys[one] === dayKey(new Date()) ? 'today' : `on ${longDay.format(dateFromKey(s.keys[one]))}`;
  if (hour == null) return day || 'this week';
  return `${hourRange(hour)} ${day || 'on each day this week'}`;
}
// the time a site had in that scope
function timeIn(domain, dayIdxs, hour = null) {
  const s = state.summary;
  let t = 0;
  for (const i of dayIdxs || s.keys.map((_, j) => j)) t += hour == null ? s.days[i].s[domain] || 0 : (s.days[i].hs[hour] || {})[domain] || 0;
  return t;
}
const shortUrl = url => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}${u.search}`; } catch { return url; } };

let popSite = null;
let popAnchor = null;
// scope: { days, hour } for a row in the day or hour view; Most used's Week / Day otherwise.
// From a row of Most used the row grows down into the whole card (the same timing and
// spring as every popover); from the day or hour view the card cross-fades to the pages
// the way Daily activity changes views. Another site while they're up cross-fades the
// same way. Everything reverses from wherever it has got to.
function openPagePop(domain, anchor, scope = null) {
  const s = state.summary;
  if (!s) return;
  if (popAnchor === anchor && pages.isOpen) { closePagePop(); return; }
  tip.hide(true);
  resetPageTip();
  closeCatMenu(true);
  closeCatPop(true);
  let days = scope ? scope.days : null;
  const hour = scope ? scope.hour : null;
  if (!scope) { const sc = scoped(s); days = sc.day == null ? null : [sc.day]; }
  const layer = $('page-pop');
  const card = layer.parentElement;
  const body = buildPages(domain, days, hour);
  for (const r of document.querySelectorAll('.site.active, .row.active')) r.classList.remove('active');
  anchor.classList.add('active');
  popSite = domain;
  popAnchor = anchor;
  ++pageSwap;
  setCardInert(card, true);
  layer.classList.remove('closing');

  // up already: the new site's pages cross-fade over the old ones
  if (pages.isOpen) {
    for (const b of layer.querySelectorAll('.sp-body.leaving')) b.remove();
    for (const b of layer.querySelectorAll('.sp-body')) {
      b.classList.add('leaving');
      b.inert = true;
      setTimeout(() => b.remove(), 600);
    }
    body.classList.add('entering');
    layer.appendChild(body);
    getComputedStyle(body).opacity;
    body.classList.remove('entering');
    growBars(body);
    return;
  }

  const drop = card.contains(anchor) && !reducedMotion();
  const was = pages.state;
  const wasMode = pages.mode;
  // reopened while folding back into its row: the title carries on from where it is
  const headNow = was === 'closing' && wasMode === 'drop' ? headPose(layer) : null;
  stopHead();
  layer.textContent = '';
  layer.appendChild(body);
  layer.hidden = false;
  pages.state = 'opening';
  pages.mode = drop ? 'drop' : 'fade';
  const done = () => { if (pages.state === 'opening') pages.state = 'open'; };

  if (drop) {
    // The row's own rectangle, in the card, grows to fill it. The row's name rides up
    // to become the pages' title while the rest of the list fades away, and the pages'
    // rows come in under it; so the row is what turns into the pages.
    const R = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 20;
    const row = insetsOf(card, anchor);
    let from = row;
    let opacity = 1;
    if (was === 'closing' && wasMode === 'drop' && pages.anim) {
      // reopened on its way back in: from where it is now
      from = parseInsets(getComputedStyle(layer).clipPath) || row;
      opacity = +getComputedStyle(layer).opacity;
    }
    if (pages.anim) pages.anim.cancel();
    if (pages.fade) { pages.fade.cancel(); pages.fade = null; }
    layer.style.clipPath = '';
    card.classList.add('paged', 'drop', 'lifted');
    const left = Math.min(1, sum(from) / Math.max(1, sum(row)));
    const D = 200 + 400 * left;
    const D2 = Math.max(260, 560 * left);
    const { frames, T } = dropFrames(from, R, D, D2);
    frames.forEach(f => { f.opacity = +(opacity + (1 - opacity) * Math.min(1, f.offset * 2)).toFixed(3); });
    pages.anim = layer.animate(frames, { duration: T, easing: 'linear', fill: 'forwards' });
    // the surface starts as the row's highlight and loses it as it grows
    const tint = was === 'closing' && pages.tint ? tintNow(layer) : 1;
    if (pages.tint) pages.tint.cancel();
    pages.tint = layer.animate([{ opacity: tint }, { opacity: 0 }], { duration: D * 0.4, easing: 'linear', pseudoElement: '::before', fill: 'forwards' });
    const at = headOffset(body, anchor, card);
    const start = headNow || at;
    pages.head = [
      body.querySelector('.sp-head').animate([{ transform: `translate(${start.x}px, ${start.y}px)` }, { transform: 'none' }], { duration: D2, easing: EASE_OUT, fill: 'backwards' }),
      body.querySelector('.sp-name').animate([{ scale: start.k }, { scale: 1 }], { duration: D2, easing: EASE_OUT, fill: 'backwards' }),
    ];
    // the title's surroundings (back, colour, time) arrive once it's on its way
    for (const el of body.querySelectorAll('.pp-back, .sp-title .dot, .sp-meta')) {
      pages.head.push(el.animate([{ opacity: headNow ? headNow.chrome : 0 }, { opacity: 1 }], { duration: 260, delay: headNow ? 0 : 110 * left, easing: 'ease-out', fill: 'backwards' }));
    }
    body.classList.add('unfold');
    growBars(body);
    pages.anim.finished.then(done, () => {});
    return;
  }

  // cross-fading in (CSS, like Daily activity's views): from wherever it is
  if (pages.anim) { pages.anim.cancel(); pages.anim = null; }
  if (pages.tint) { pages.tint.cancel(); pages.tint = null; }
  if (pages.fade) { pages.fade.cancel(); pages.fade = null; }
  card.classList.remove('lifted');
  if (card.classList.contains('drop')) {
    // it was growing or shrinking from a row: carry on from its look now, as a fade
    card.classList.remove('drop');
  }
  getComputedStyle(layer).opacity;
  card.classList.add('paged');
  // where Most used is below the window (narrow layouts), it comes into view first
  const r = card.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  growBars(body);
  setTimeout(done, reducedMotion() ? 0 : 700);
}
let pageSwap = 0;

// the card's own content (header, list) can't be reached while the pages are over it
function setCardInert(card, on) {
  for (const c of card.children) if (c.id !== 'page-pop') c.inert = on;
}
// a row's place in the card, as clip-path insets: [top, right, bottom, left]
function insetsOf(card, row) {
  const c = card.getBoundingClientRect();
  const a = row.getBoundingClientRect();
  const clamp = v => Math.max(0, Math.round(v));
  return [clamp(a.top - c.top), clamp(c.right - a.right), clamp(c.bottom - a.bottom), clamp(a.left - c.left)];
}
const insetCss = (v, r) => `inset(${v.map(n => `${n}px`).join(' ')} round ${r}px)`;
// Where the pages' title has to be to sit on a row's name (as a translate from its own
// place, kept inside the card) and how big the row's name is next to it.
function headOffset(body, anchor, card) {
  const name = body.querySelector('.sp-name');
  const head = body.querySelector('.sp-head');
  const src = anchor.querySelector('.site-domain .sl-text') || anchor.querySelector('.site-domain') || anchor;
  const a = src.getBoundingClientRect();
  const n = name.getBoundingClientRect();
  const h = head.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  // the same words in two fonts: scaled so they're as wide as the row's
  const wa = textWidth(src);
  const wn = textWidth(name);
  const k = wa > 0 && wn > 0 ? wa / wn : (parseFloat(getComputedStyle(src).fontSize) || 13.5) / (parseFloat(getComputedStyle(name).fontSize) || 15);
  // baselines meet (the two fonts sit differently in their boxes), so the words land
  // exactly on each other
  let y = a.top + a.height / 2 + baselineDrop(src) - (n.top + n.height / 2 + k * baselineDrop(name));
  y = Math.max(c.top - h.top, Math.min(y, c.bottom - h.bottom));
  return { x: +(a.left - n.left).toFixed(1), y: +y.toFixed(1), k: +k.toFixed(4) };
}
// the laid-out width of an element's words (all of them, even where an ellipsis cuts them)
function textWidth(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width;
}
// how far below the middle of its line an element's text sits on its baseline
let metricsCtx = null;
function baselineDrop(el) {
  metricsCtx = metricsCtx || document.createElement('canvas').getContext('2d');
  const cs = getComputedStyle(el);
  metricsCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = metricsCtx.measureText('x');
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  return Number.isFinite(asc) && Number.isFinite(desc) ? (asc - desc) / 2 : 0;
}
// A cubic-bezier easing as a function (for keyframes sampled by hand).
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      const v = at(x1, x2, t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return at(y1, y2, t);
  };
}
const easeOutFn = bezier(0.22, 1, 0.36, 1);
const popFn = bezier(0.32, 1.24, 0.5, 1);
// The surface growing from a row: its sides and bottom spring out like a popover, while
// its top edge keeps pace with the title riding up just under it (so the title is
// never clipped). Sampled, since one clip-path can't ease each edge its own way.
function dropFrames(from, R, D, D2) {
  const T = Math.max(D, D2);
  const frames = [];
  const N = 30;
  for (let n = 0; n <= N; n++) {
    const ms = (n / N) * T;
    const p = popFn(Math.min(1, ms / D));
    const q = easeOutFn(Math.min(1, ms / D2));
    const v = [from[0] * (1 - q), from[1] * (1 - p), from[2] * (1 - p), from[3] * (1 - p)];
    frames.push({ clipPath: insetCss(v.map(x => +x.toFixed(2)), +(12 + (R - 12) * Math.min(1, p)).toFixed(2)), offset: n / N });
  }
  return { frames, T };
}
// the title as it is right now (mid-flight), to carry on from
function headPose(layer) {
  const head = layer.querySelector('.sp-body:not(.leaving) .sp-head');
  const name = head && head.querySelector('.sp-name');
  if (!head || !name) return null;
  const m = new DOMMatrixReadOnly(getComputedStyle(head).transform === 'none' ? undefined : getComputedStyle(head).transform);
  const k = parseFloat(getComputedStyle(name).scale);
  const back = head.querySelector('.pp-back');
  return { x: +m.e.toFixed(1), y: +m.f.toFixed(1), k: Number.isFinite(k) ? k : 1, chrome: back ? +getComputedStyle(back).opacity : 1 };
}
function stopHead() {
  if (pages.head) for (const a of pages.head) a.cancel();
  pages.head = null;
}
const tintNow = layer => +getComputedStyle(layer, '::before').opacity || 0;
function parseInsets(clip) {
  const m = /inset\(([^)]*?)(?: round [^)]*)?\)/.exec(clip || '');
  if (!m) return null;
  const n = m[1].trim().split(/\s+/).map(parseFloat);
  if (n.some(x => !Number.isFinite(x))) return null;
  return n.length === 1 ? [n[0], n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0], n[1]] : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n.slice(0, 4);
}

// What the pages show: the site, its time and when, then each page (or why there are none).
function buildPages(domain, days, hour) {
  const { list, links, gone, wholeDay } = pagesFor(domain, days, hour);
  const cat = CATEGORY_BY_ID[categorize(domain, activeOverrides())];
  const total = timeIn(domain, days, hour);
  const body = document.createElement('div');
  body.className = 'sp-body';
  body.innerHTML = `<header class="panel-head sp-head"><h2 class="section-title sp-title"><button class="pp-back" type="button" aria-label="Back to Most used"><svg><use href="#i-chev-l"/></svg></button><span class="dot" style="--c:${cat.color}"></span><span class="sp-name">${escapeHtml(siteName(domain))}</span></h2><span class="caption sp-meta num">${fmt(total, { seconds: hour != null })} · ${pagesWhen(days, hour)}</span></header>`;
  if (list.length) {
    const ol = document.createElement('ol');
    ol.className = 'rows page-rows';
    const max = Math.max(...list.map(([, ms]) => ms));
    list.forEach(([t, ms], i) => {
      const li = document.createElement('li');
      li.className = `row page-row${t ? '' : ' other'}`;
      li.style.setProperty('--i', Math.min(i, 12));
      const url = t && links[t];
      const w = Math.max(2, (ms / max) * 100).toFixed(2);
      const name = !t ? 'Other pages'
        : url ? `<a class="site-link page-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="sl-text">${escapeHtml(t)}</span>${ARROW_SVG}</a>`
        : `<span class="sl-text">${escapeHtml(t)}</span>`;
      if (url) li.dataset.url = url;
      li.innerHTML = `<div class="row-main"><span class="row-name">${name}</span></div><span class="row-time">${fmt(ms, { seconds: true })}</span><div class="row-bar"><i style="--c:${cat.color};--d:${260 + Math.min(i, 12) * 45}ms" data-w="${w}"></i></div>`;
      ol.appendChild(li);
    });
    body.appendChild(ol);
    makeScroller(ol);
    if (wholeDay) body.insertAdjacentHTML('beforeend', `<p class="pp-foot">Pages for the whole ${days && days.length > 1 ? 'days' : 'day'}: this hour was saved before pages were kept hour by hour.</p>`);
    else if (gone) body.insertAdjacentHTML('beforeend', '<p class="pp-foot">Pages from earlier days were deleted as they got old.</p>');
  } else {
    // its titles were deleted (by a version that kept them only a few weeks): say so
    body.insertAdjacentHTML('beforeend', '<div class="pp-gone-box"><p class="pp-gone">The titles saved for it were deleted.</p></div>');
  }
  return body;
}

// Back to Most used: into the row it grew from (when that row is in the card), or a
// cross-fade back to the list.
function closePagePop(instant = false) {
  const layer = $('page-pop');
  if (layer.hidden || (pages.state === 'closing' && !instant)) return;
  const card = layer.parentElement;
  const anchor = popAnchor;
  ++pageSwap;
  popSite = null;
  if (pageTipShown) tip.hide();
  resetPageTip();
  if (anchor) anchor.classList.remove('active');
  popAnchor = null;
  setCardInert(card, false);
  pages.state = 'closing';
  layer.classList.add('closing');
  const token = pageSwap;
  const finish = () => {
    if (token !== pageSwap || pages.state !== 'closing') return;
    if (pages.anim) { pages.anim.cancel(); pages.anim = null; }
    if (pages.tint) { pages.tint.cancel(); pages.tint = null; }
    if (pages.fade) { pages.fade.cancel(); pages.fade = null; }
    stopHead();
    card.classList.remove('paged', 'drop', 'lifted');
    layer.classList.remove('closing');
    layer.hidden = true;
    layer.textContent = '';
    pages.state = 'closed';
    pages.mode = null;
  };
  if (instant || reducedMotion()) { finish(); return; }
  const intoRow = pages.mode === 'drop' && anchor && anchor.isConnected && card.contains(anchor) && card.classList.contains('drop');
  if (intoRow) {
    // the opening, backwards: the pages' rows go first, the title rides back down onto
    // the row's name as the surface folds into the row (turning back into its
    // highlight) and the list returns around it; then the surface lets the row show
    const row = insetsOf(card, anchor);
    const now = parseInsets(getComputedStyle(layer).clipPath) || [0, 0, 0, 0];
    const opacity = +getComputedStyle(layer).opacity;
    const tint = tintNow(layer);
    const body = layer.querySelector('.sp-body:not(.leaving)');
    const pose = headPose(layer) || { x: 0, y: 0, k: 1, chrome: 1 };
    stopHead();
    if (pages.anim) pages.anim.cancel();
    if (pages.tint) pages.tint.cancel();
    if (pages.fade) pages.fade.cancel();
    const left = Math.min(1, row.reduce((t, v, i) => t + Math.abs(v - now[i]), 0) / Math.max(1, sum(row)));
    const D = 160 + 340 * left;
    const SHEET = 'cubic-bezier(0.45, 0, 0.15, 1)';
    // it lets the row through as it lands (the title is then right on the row's name)
    pages.anim = layer.animate([
      { clipPath: insetCss(now, 12), easing: SHEET },
      { clipPath: insetCss(row, 12) },
    ], { duration: D, fill: 'forwards' });
    pages.fade = layer.animate([{ opacity }, { opacity, offset: 0.74, easing: 'ease-in' }, { opacity: 0 }], { duration: D, fill: 'forwards' });
    pages.tint = layer.animate([{ opacity: tint }, { opacity: 1 }], { duration: D * 0.8, easing: 'ease-in', pseudoElement: '::before', fill: 'forwards' });
    card.classList.remove('lifted');
    for (const b of layer.querySelectorAll('.sp-body')) {
      for (const el of b.children) if (!(b === body && el.classList.contains('sp-head'))) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' });
    }
    if (body) {
      const to = headOffset(body, anchor, card);
      pages.head = [
        body.querySelector('.sp-head').animate([{ transform: `translate(${pose.x}px, ${pose.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }], { duration: D, easing: SHEET, fill: 'forwards' }),
        body.querySelector('.sp-name').animate([{ scale: pose.k }, { scale: to.k }], { duration: D, easing: SHEET, fill: 'forwards' }),
      ];
      for (const el of body.querySelectorAll('.pp-back, .sp-title .dot, .sp-meta')) {
        pages.head.push(el.animate([{ opacity: pose.chrome }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' }));
      }
    }
    pages.anim.finished.then(finish, () => {});
    return;
  }
  // a fade back (also for pages that grew from a row now gone, or now from elsewhere)
  if (pages.anim) { pages.anim.cancel(); pages.anim = null; }
  if (pages.tint) { pages.tint.cancel(); pages.tint = null; }
  if (pages.fade) { pages.fade.cancel(); pages.fade = null; }
  stopHead();
  card.classList.remove('lifted');
  if (card.classList.contains('drop')) { card.classList.remove('drop'); getComputedStyle(layer).opacity; }
  card.classList.remove('paged');
  setTimeout(finish, 600);
}

// over a page: its arrow shows; resting on it a second says where it goes
let pageTipTimer = 0;
let pageTipRow = null;
let pageTipShown = false;
function resetPageTip() {
  clearTimeout(pageTipTimer);
  pageTipShown = false;
  pageTipRow = null;
}
function wirePagePop() {
  const pop = $('page-pop');
  const hideTip = () => { clearTimeout(pageTipTimer); if (pageTipShown) tip.hide(); pageTipShown = false; };
  const tipFor = row => `<div class="tip-title">Open URL</div><div class="tip-note">${escapeHtml(shortUrl(row.dataset.url))}</div>`;
  // The first time, it waits for a second's rest on a page. Once it's up it behaves like
  // every other tip: it morphs from page to page and stays up between two rows; a row
  // without a link, or leaving the list, puts it away.
  pop.addEventListener('pointermove', e => {
    const row = e.target.closest('.page-row');
    const link = row && row.dataset.url ? row : null;
    if (pageTipShown) {
      if (link && link !== pageTipRow) { pageTipRow = link; tip.show(tipFor(link), e.clientX, e.clientY); return; }
      if (link || (!row && e.target.closest('.page-rows'))) { tip.move(e.clientX, e.clientY); return; }
      hideTip();
      pageTipRow = null;
      return;
    }
    clearTimeout(pageTipTimer);
    pageTipRow = link;
    if (!link) return;
    const x = e.clientX;
    const y = e.clientY;
    pageTipTimer = setTimeout(() => {
      if (!link.isConnected || pages.state !== 'open') return;
      pageTipShown = true;
      tip.show(tipFor(link), x, y);
    }, 1000);
  });
  pop.addEventListener('pointerleave', () => { hideTip(); pageTipRow = null; });
  pop.addEventListener('click', e => {
    if (e.target.closest('.pp-back')) {
      const back = popAnchor;
      closePagePop();
      back?.querySelector('[role="button"]')?.focus({ preventScroll: true });
      return;
    }
    const row = e.target.closest('.page-row[data-url]');
    if (!row) return;
    hideTip();
    // the link itself opens the page; anywhere else on the row does the same
    if (!e.target.closest('a')) row.querySelector('a').click();
  });
}

// A list redrawn with new numbers (the report refreshing as time comes in): rows that
// stay glide from where they were to their new place, so a re-sort is seen, and their
// bars grow or shrink from the old length; new rows fade in. Nothing jumps.
function regroup(list, key, build) {
  if (reducedMotion() || !list.isConnected) { build(); return; }
  const was = new Map();
  for (const el of list.children) {
    if (!el.dataset[key]) continue;
    was.set(el.dataset[key], { r: el.getBoundingClientRect(), w: el.querySelector('.site-bar i')?.style.getPropertyValue('--w') });
  }
  build();
  if (!was.size) return;
  const bars = [];
  for (const el of list.children) {
    const old = el.dataset[key] && was.get(el.dataset[key]);
    if (!old) {
      if (el.dataset[key]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 180, easing: 'ease-out', fill: 'backwards' });
      continue;
    }
    const r = el.getBoundingClientRect();
    const dx = old.r.left - r.left;
    const dy = old.r.top - r.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      el.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: 560, easing: EASE_OUT });
    }
    const fill = el.querySelector('.site-bar i');
    const w = fill && fill.style.getPropertyValue('--w');
    if (fill && old.w && w && w !== old.w) { fill.style.setProperty('--w', old.w); bars.push([fill, w]); }
  }
  if (bars.length) requestAnimationFrame(() => requestAnimationFrame(() => { for (const [f, w] of bars) f.style.setProperty('--w', w); }));
}

// ----- most used -----

// Apps (Memoir for Windows' apps, browsers among them with all their time) or Browsers (the sites and pages in
// them): two lists of the same minutes, so each is whole on its own and they're never added together. With only
// one kind (the extension on its own), there's no switch.
const isAppName = d => isApp(d) || (!!window.memoir?.windows && d === '~memoir');   // (here, Memoir's own window)
function namesOf(days) {
  const names = {};
  for (const d of days) for (const [dom, ms] of Object.entries(d.s)) if (!isPrivate(dom)) names[dom] = (names[dom] || 0) + ms;
  return Object.entries(names).filter(([, ms]) => ms >= 1000).sort((a, b) => b[1] - a[1]);
}
const KIND_KEY = 'memoir-kind';
function shownKind() {
  let kind = null;
  try { kind = localStorage.getItem(KIND_KEY); } catch { /* not kept */ }
  return kind === 'apps' || kind === 'sites' ? kind : window.memoir?.windows ? 'apps' : 'sites';
}
// the list for the kind shown (the switch follows what there is: both kinds, or none to choose from)
function ofKind(list, showSwitch = false) {
  const apps = list.filter(([d]) => isAppName(d)), sites = list.filter(([d]) => !isAppName(d));
  const both = apps.length > 0 && sites.length > 0;
  if (showSwitch) setKindSwitch(both);
  if (!both) return list;
  return shownKind() === 'apps' ? apps : sites;
}
function setKindSwitch(on) {
  const seg = $('kind');
  const kind = shownKind();
  $('sites-card').classList.toggle('kinds', on);
  if (seg.hidden === !on && seg.dataset.kind === kind) return;
  seg.hidden = !on;
  seg.dataset.kind = kind;
  seg.style.setProperty('--k', kind === 'sites' ? 1 : 0);
  for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
}
function setKind(kind) {
  if (kind === shownKind() && $('kind').dataset.kind === kind) return;
  try { localStorage.setItem(KIND_KEY, kind); } catch { /* this visit only */ }
  if (!state.summary) return;
  renderSites(state.summary, true);
  if (state.view.type === 'day') renderDetail({ soft: true });
}

function renderSites(s, soft) {
  // the rows are about to be rebuilt: a site's pages close back into their row first
  if (pages.isOpen) closePagePop();
  const ol = $('sites');
  if (soft) regroup(ol, 'domain', () => buildSites(s, soft));
  else buildSites(s, soft);
}

function buildSites(s, soft) {
  const ol = $('sites');
  ol.classList.toggle('soft', soft);
  ol.textContent = '';
  const scroller = makeScroller(ol);
  if (!soft) scroller.reset();
  // every site (of the week, or of the day on Day), in a list that scrolls
  const sc = scoped(s);
  const cap = `${sc.sub.charAt(0).toUpperCase()}${sc.sub.slice(1)} · click a category to change it`;
  if ($('sites-cap').textContent !== cap) swapText($('sites-cap'), cap);
  const top = ofKind(sc.nameList, true).slice(0, 60);
  const max = top.length ? top[0][1] : 1;
  const idxs = sc.day == null ? null : [sc.day];
  // only the rows you can see make an entrance; the rest are simply there
  const onScreen = Math.ceil((ol.clientHeight || 600) / 50) + 1;
  const grow = [];
  top.forEach(([domain, ms], i) => {
    const cat = CATEGORY_BY_ID[categorize(domain, activeOverrides())];
    const li = document.createElement('li');
    li.className = 'site';
    li.dataset.domain = domain;
    li.style.setProperty('--i', Math.min(i, 10));
    const main = document.createElement('div');
    main.className = 'site-main';
    const name = document.createElement('span');
    name.className = 'site-domain';
    name.innerHTML = siteLinkHtml(domain);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn';
    btn.dataset.domain = domain;
    btn.setAttribute('aria-haspopup', 'menu');
    setCatBtn(btn, cat, domain);
    main.append(name, btn);
    const time = document.createElement('span');
    time.className = 'site-time';
    time.textContent = fmt(ms);
    time.title = `${pct(ms, sc.total)}% ${sc.of}`;
    // a site with page titles (or titles that were deleted): the row opens its pages
    if (hasPages(domain, idxs)) {
      li.classList.add('has-pages');
      time.tabIndex = 0;
      time.setAttribute('role', 'button');
      time.setAttribute('aria-label', `${fmt(ms)}. See each page’s time on ${siteName(domain)}`);
    }
    const bar = document.createElement('div');
    bar.className = 'site-bar';
    const fill = document.createElement('i');
    fill.style.setProperty('--c', cat.color);
    bar.appendChild(fill);
    const w = `${Math.max(2, (ms / max) * 100).toFixed(2)}%`;
    if (soft || i >= onScreen) {
      if (!soft) li.classList.add('still');
      fill.style.setProperty('--w', w);
    } else {
      fill.style.setProperty('--d', `${(state.queue ? 420 + introWait('.sites-card') : 100) + Math.min(i, 10) * 40}ms`);
      grow.push([fill, w]);
    }
    li.append(faviconTile(domain, cat.color), main, time, bar);
    ol.appendChild(li);
  });
  if (!top.length) ol.appendChild(Object.assign(emptyNote(`Nothing ${sc.when}.`), { className: 'dv-empty sites-none' }));
  // every bar that grows starts from one frame, not a pair of frames each
  if (grow.length) requestAnimationFrame(() => requestAnimationFrame(() => { for (const [f, w] of grow) f.style.setProperty('--w', w); }));
}

function setCatBtn(btn, cat, domain) {
  btn.innerHTML = `<span class="dot" style="--c:${cat.color}"></span>${cat.label}<svg><use href="#i-chev-d"/></svg>`;
  btn.setAttribute('aria-label', `Category: ${cat.label}. Change category for ${siteName(domain)}`);
}

// ----- hour grid -----

let heatCells = [];
let heatDays = [];
let heatFocus = { r: 0, c: 0 };
function buildHeat() {
  const wrap = $('heat');
  wrap.textContent = '';
  heatCells = [];
  heatDays = [];
  for (let r = 0; r < 7; r++) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'heat-day';
    label.dataset.r = r;
    wrap.appendChild(label);
    heatDays.push(label);
    const row = [];
    for (let c = 0; c < 24; c++) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = -1;
      cell.style.setProperty('--d', `${(r + c) * 10}ms`);
      wrap.appendChild(cell);
      row.push(cell);
    }
    heatCells.push(row);
  }
  wrap.appendChild(document.createElement('span'));
  for (let h = 0; h < 24; h += 3) {
    const lab = document.createElement('span');
    lab.className = 'heat-hour';
    lab.style.gridColumn = 'span 3';
    lab.textContent = hourLabel(h);
    wrap.appendChild(lab);
  }
  // the cells' entrance (recap.css .heat-veil): one sliding veil, not a fade per cell
  const veil = document.createElement('div');
  veil.className = 'heat-veil';
  veil.setAttribute('aria-hidden', 'true');
  veil.appendChild(document.createElement('i'));
  wrap.appendChild(veil);
  heatCells[0][0].tabIndex = 0;

  const showCell = (cell, x, y) => {
    const s = state.summary;
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    const d = s.days[r];
    const ms = d.h[c];
    const future = cell.classList.contains('future');
    const value = future ? 'Upcoming' : ms > 0 ? fmt(ms, { seconds: true }) : 'No activity';
    const slot = Object.entries(d.hs[c] || {}).filter(([dom]) => !isPrivate(dom)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const sites = slot.map(([dom, v]) => {
      const cat = CATEGORY_BY_ID[categorize(dom, activeOverrides())];
      return `<div class="tip-row"><span><span class="dot" style="--c:${cat.color}"></span>${escapeHtml(siteName(dom))}</span><b>${fmt(v, { seconds: true })}</b></div>`;
    }).join('');
    const hint = !future && ms > 0 ? '<div class="tip-note">Click to see this hour</div>' : '';
    tip.show(`<div class="tip-title">${longDay.format(dateFromKey(s.keys[r]))}, ${hourRange(c)}</div><div class="tip-row"><span>Screen time</span><b>${value}</b></div>${sites}${hint}`, x, y);
  };
  wrap.addEventListener('pointerover', e => {
    const cell = e.target.closest('.cell');
    if (cell) showCell(cell, e.clientX, e.clientY);
    else if (e.target.closest('.heat-day')) tip.hide();
  });
  wrap.addEventListener('pointermove', e => tip.move(e.clientX, e.clientY));
  wrap.addEventListener('pointerleave', () => tip.hide());
  wrap.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (cell) { openCell(+cell.dataset.r, +cell.dataset.c); return; }
    const day = e.target.closest('.heat-day');
    if (day) openView({ type: 'day', day: +day.dataset.r, origin: { kind: 'heat-day', r: +day.dataset.r } }, day);
  });
  wrap.addEventListener('focusin', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    heatFocus = { r: +cell.dataset.r, c: +cell.dataset.c };
    const r = cell.getBoundingClientRect();
    showCell(cell, r.left + r.width / 2, r.top);
  });
  wrap.addEventListener('focusout', () => tip.hide());
  wrap.addEventListener('keydown', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    let { r, c } = heatFocus;
    if (e.key === 'ArrowRight') c = Math.min(23, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') r = Math.min(6, r + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCell(r, c); return; }
    else return;
    e.preventDefault();
    e.stopPropagation();
    heatCells[heatFocus.r][heatFocus.c].tabIndex = -1;
    heatFocus = { r, c };
    heatCells[r][c].tabIndex = 0;
    heatCells[r][c].focus();
  });
}

function openCell(r, c) {
  const s = state.summary;
  const cell = heatCells[r][c];
  if (cell.classList.contains('future') || !s) return;
  tip.hide();
  openView({ type: 'hour', day: r, hour: c, origin: { kind: 'cell', r, c } }, cell);
}

function renderHeat(s) {
  if (!heatCells.length) buildHeat();
  let max = 0;
  for (const d of s.days) for (const v of d.h) if (v > max) max = v;
  const now = new Date();
  const today = dayKey(now);
  for (let r = 0; r < 7; r++) {
    const key = s.keys[r];
    heatDays[r].textContent = shortDay.format(dateFromKey(key));
    heatDays[r].classList.toggle('today', !state.demo && key === today);
    heatDays[r].disabled = s.future[r];
    heatDays[r].setAttribute('aria-label', `${fullDate.format(dateFromKey(key))}. Open this day.`);
    for (let c = 0; c < 24; c++) {
      const cell = heatCells[r][c];
      const v = s.days[r].h[c];
      const future = !state.demo && (key > today || (key === today && c > now.getHours()));
      cell.classList.toggle('future', future);
      const level = v <= 0 || max <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
      cell.style.setProperty('--c', `var(--g${level})`);
      cell.setAttribute('aria-label', `${shortDay.format(dateFromKey(key))} ${hourRange(c)}: ${future ? 'upcoming' : v > 0 ? fmt(v, { seconds: true }) : 'no activity'}`);
      cell.style.setProperty('--d', `${c * 8 + r * 5}ms`);
    }
  }
}

function updateHeatSelection() {
  if (!heatCells.length) return;
  const v = state.view;
  const heat = $('heat');
  let any = false;
  for (let r = 0; r < 7; r++) {
    const rowSel = v.type === 'day' && v.day === r;
    heatDays[r].classList.toggle('sel', rowSel || (v.type === 'hour' && v.day === r));
    for (let c = 0; c < 24; c++) {
      const sel = rowSel || (v.type === 'hour' && v.hour === c && (v.day == null || v.day === r));
      heatCells[r][c].classList.toggle('sel', sel);
      any = any || sel;
    }
  }
  heat.classList.toggle('has-sel', any);
  placeHeatFrame();
}

// One outline around the open day (a row), hour (a square) or hour-of-the-week (a
// column), with everything else softly dimmed. Built from twelve small pieces —
// four dimming bands, four straight edges and four corners — that only ever move
// by transform. The browser's compositor runs those glides on its own thread, so
// the outline stays smooth at any refresh rate even while the detail view builds.
const heatSel = { cur: null, shown: false, r: 0, outer: null, parts: null };
const HS_T = 2;         // outline thickness (whole pixels, so it lands crisp)
const HS_BASE = 64;     // the pieces' own size, scaled to fit
const HS_MS = 600;
const HS_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function heatParts() {
  if (heatSel.parts) return heatSel.parts;
  const svg = $('heat-sel');
  const pick = (cls, k) => svg.querySelector(`.${cls}[data-k="${k}"]`);
  heatSel.parts = {
    dim: svg.querySelector('.hs-dim'),
    b: { l: pick('hs-b', 'l'), r: pick('hs-b', 'r'), t: pick('hs-b', 't'), b: pick('hs-b', 'b') },
    e: { t: pick('hs-e', 't'), b: pick('hs-e', 'b'), l: pick('hs-e', 'l'), r: pick('hs-e', 'r') },
    c: { tl: pick('hs-c', 'tl'), tr: pick('hs-c', 'tr'), bl: pick('hs-c', 'bl'), br: pick('hs-c', 'br') },
  };
  return heatSel.parts;
}

// transform for every piece, for a box {x, y, w, h} in the grid's coordinates
function heatTransforms(g) {
  const o = heatSel.outer;
  const r = heatSel.r;
  const h2 = HS_T / 2;
  const S = HS_BASE;
  const px = v => `${v.toFixed(2)}px`;
  const tr = (x, y, sx = 1, sy = 1) => `translate(${px(x)}, ${px(y)}) scale(${(sx).toFixed(4)}, ${(sy).toFixed(4)})`;
  // bands live inside the dim box (origin at the grid's corner); sides run full
  // height, top and bottom tuck 1px under them so no seam can open up
  const x = g.x - o.x;
  const y = g.y - o.y;
  const clamp0 = v => Math.max(0, v);
  return {
    'b.l': tr(0, 0, clamp0(x) / S, o.h / S),
    'b.r': tr(x + g.w, 0, clamp0(o.w - x - g.w) / S, o.h / S),
    'b.t': tr(x - 1, 0, (g.w + 2) / S, clamp0(y) / S),
    'b.b': tr(x - 1, y + g.h, (g.w + 2) / S, clamp0(o.h - y - g.h) / S),
    'e.t': tr(g.x + r, g.y - h2, clamp0(g.w - 2 * r) / S, 1),
    'e.b': tr(g.x + r, g.y + g.h - h2, clamp0(g.w - 2 * r) / S, 1),
    'e.l': tr(g.x - h2, g.y + r, 1, clamp0(g.h - 2 * r) / S),
    'e.r': tr(g.x + g.w - h2, g.y + r, 1, clamp0(g.h - 2 * r) / S),
    'c.tl': tr(g.x - h2, g.y - h2),
    'c.tr': tr(g.x + g.w - r, g.y - h2),
    'c.bl': tr(g.x - h2, g.y + g.h - r),
    'c.br': tr(g.x + g.w - r, g.y + g.h - r),
  };
}

function eachPart(fn) {
  const P = heatParts();
  for (const grp of ['b', 'e', 'c']) for (const k of Object.keys(P[grp])) fn(P[grp][k], `${grp}.${k}`);
}

// where the outline is on screen right now, even halfway through a glide
function heatNow() {
  const P = heatParts();
  const top = new DOMMatrix(getComputedStyle(P.e.t).transform);
  const left = new DOMMatrix(getComputedStyle(P.e.l).transform);
  const r = heatSel.r;
  return { x: top.e - r, y: left.f - r, w: top.a * HS_BASE + 2 * r, h: left.d * HS_BASE + 2 * r };
}

function setHeatBox(g, animate) {
  const from = animate ? heatTransforms(heatNow()) : null;
  const to = heatTransforms(g);
  eachPart((el, key) => {
    el.getAnimations().forEach(a => a.cancel());
    el.style.transform = to[key];
    if (from && from[key] !== to[key]) el.animate([{ transform: from[key] }, { transform: to[key] }], { duration: HS_MS, easing: HS_EASE });
  });
  heatSel.cur = g;
}

function placeHeatFrame({ instant = false } = {}) {
  const svg = $('heat-sel');
  const box = $('heat-wrap');
  if (!svg || !heatCells.length) return;
  const v = state.view;
  let pair = null;
  if (v.type === 'day') pair = [heatCells[v.day][0], heatCells[v.day][23]];
  else if (v.type === 'hour' && v.day != null) pair = [heatCells[v.day][v.hour], heatCells[v.day][v.hour]];
  else if (v.type === 'hour') pair = [heatCells[0][v.hour], heatCells[6][v.hour]];
  if (!pair || !box.offsetWidth) {
    svg.classList.remove('on');
    heatSel.shown = false;
    return;
  }
  const W = box.getBoundingClientRect();
  const first = heatCells[0][0].getBoundingClientRect();
  const next = heatCells[0][1].getBoundingClientRect();
  const last = heatCells[6][23].getBoundingClientRect();
  const outer = { x: first.left - W.left - 1, y: first.top - W.top - 1, w: last.right - first.left + 2, h: last.bottom - first.top + 2 };
  const P = heatParts();
  const moved = !heatSel.outer || ['x', 'y', 'w', 'h'].some(k => Math.abs(heatSel.outer[k] - outer[k]) > 0.5);
  heatSel.outer = outer;
  if (moved) Object.assign(P.dim.style, { left: `${outer.x}px`, top: `${outer.y}px`, width: `${outer.w}px`, height: `${outer.h}px` });
  const a = pair[0].getBoundingClientRect();
  const b = pair[1].getBoundingClientRect();
  const gap = Math.max(1, next.left - first.right);
  // the outline sits in the gap around the squares, so the dimming's square
  // corners only ever fall on empty space
  const pad = Math.max(1.5, Math.min(4, a.width * 0.12, gap * 0.85));
  // snapped to whole screen pixels, so the resting outline is sharp
  const L = Math.round(a.left - pad);
  const T = Math.round(a.top - pad);
  const R = Math.round(b.right + pad);
  const B = Math.round(b.bottom + pad);
  const target = { x: L - W.left, y: T - W.top, w: R - L, h: B - T };
  const r = Math.round(Math.max(2, Math.min(9, a.width * 0.26 + pad + 1, (a.width + pad * 2) / 2 - 1)));
  if (Math.abs(r - heatSel.r) > 0.01) {
    heatSel.r = r;
    if (heatSel.shown) instant = true; // the corners change size: jump rather than glide
  }
  svg.style.setProperty('--cr', `${(heatSel.r + HS_T / 2).toFixed(2)}px`);
  svg.style.setProperty('--t', `${HS_T}px`);
  const calm = reducedMotion();
  if (!heatSel.shown) {
    // appear in place, settling in from a touch larger
    const fresh = !instant && !calm;
    setHeatBox(fresh ? { x: target.x - 5, y: target.y - 5, w: target.w + 10, h: target.h + 10 } : target, false);
    svg.classList.add('on');
    heatSel.shown = true;
    if (!fresh) return;
    void svg.offsetWidth;
    setHeatBox(target, true);
    return;
  }
  // glide from wherever it is now (even mid-glide) to the new place
  setHeatBox(target, !(instant || calm || moved));
}

// ---------- today's limit ----------

// From the over-the-limit notification (recap.html#over): the ring's flame takes the stage,
// then flies home (shared/overshow.js). lifted: the ring is already on screen.
function takeOverHash() {
  if (location.hash !== '#over') return false;
  window.history.replaceState(null, '', location.pathname);
  return true;
}
let overPending = takeOverHash();
let boardShown = false;
function overShow(lifted) {
  const limit = goalLimit();
  const used = usedToday();
  if (!limit || used <= limit) return;
  playOverShow({ flame: document.querySelector('#goal-ring .gr-flame'), overMs: used - limit, limitMs: limit, lifted });
}

function goalLimit() {
  return limitOn(state.goalHistory, state.todayKey);
}

function usedToday() {
  const d = cloneDay(state.todayRec);
  if (state.session && !state.settings.paused) mergeSession(d, state.session);
  return dayTotal(d);
}

function updateGoal() {
  if (!goalRing) return;
  const limit = goalLimit();
  const locked = limitLocked(state.goalHistory, state.todayKey);
  const used = usedToday();
  goalRing.update({ used, limit, locked });
}

function goalTick() {
  if (document.hidden) return; // caught up when the tab is shown again
  const nowKey = dayKey(new Date());
  if (nowKey !== state.todayKey) {
    state.todayKey = nowKey;
    getDays([nowKey]).then(d => { state.todayRec = d[nowKey]; updateGoal(); });
    if (isCurrentWeek() || +state.weekStart === +startOfWeek(addDays(new Date(), -1))) render({ soft: true });
    return;
  }
  if (!document.hidden) updateGoal();
}

async function openGoalPicker(btn) {
  if (limitLocked(state.goalHistory, state.todayKey)) return;
  closeCatPop(true);
  tip.hide();
  const ringEl = goalRing.el;
  const r = ringEl.getBoundingClientRect();
  const limit = limitOn(state.goalHistory, state.todayKey);
  const size = Math.round(Math.min(380, Math.max(310, r.width * 1.35)));
  // in the tour, the tour (dim and card) fades out while the picker is up, so its
  // scrim is the only layer: never two dims or blurs stacked. On the way back, in turn:
  // the tour's dim takes over from the picker's as the clock closes, the card comes
  // back once the clock has landed in the ring, then the outline around it
  const body = document.body;
  body.classList.add('picking');
  let result = null;
  try { result = await openPicker({
    onClosing: () => { body.classList.add('tour-return', 'tour-return-ring'); body.classList.remove('picking'); },
    // the keys (← →) belong to the tour again: focus goes back to its card, not the page
    focusBack: () => (touring && document.querySelector('.tour.on .tour-next')) || btn,
    fromEl: btn,
    returnTo: ringEl,
    center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    size,
    initialMs: limit || 0,
    canRemove: !!limit,
    onCommit: async ms => {
      const saved = await commitLimit(ms);
      // tried in the tour: Settings can undo it in one click for a day
      if (touring) {
        state.goalTrial = { from: dayKey(new Date()), until: Date.now() + 24 * 3600_000 };
        await chrome.storage.local.set({ goalTrial: state.goalTrial });
      }
      state.goalHistory = await getGoalHistory();
      updateGoal();
      return saved;
    },
    onRemove: async () => {
      await removeLimit();
      state.goalHistory = await getGoalHistory();
      updateGoal();
    },
  }); } finally {
    body.classList.remove('picking');
    if (body.classList.contains('tour-return')) {
      requestAnimationFrame(() => body.classList.remove('tour-return'));
      setTimeout(() => body.classList.remove('tour-return-ring'), 300);
    }
  }
  if (result === 'commit') {
    toast(touring
      ? `Daily limit set: ${fmt(limitOn(state.goalHistory, state.todayKey))}. Settings can undo it in one click until tomorrow.`
      : `Daily limit set: ${fmt(limitOn(state.goalHistory, state.todayKey))}. It’s locked in.`);
    render({ soft: true });
  } else if (result === 'remove') {
    toast('Daily limit removed');
    render({ soft: true });
  }
}

// ---------- category menu ----------

let menuFor = null;
function openCatMenu(btn) {
  const menu = $('cat-menu');
  if (menuFor === btn) { closeCatMenu(); return; }
  if (!menu.hidden) closeCatMenu(true);
  closeCatPop(true);
  menuFor = btn;
  const domain = btn.dataset.domain;
  const current = categorize(domain, activeOverrides());
  menu.innerHTML = `<p class="menu-title">${escapeHtml(siteName(domain))}</p>` + CATEGORIES.map(c => `
    <button class="menu-item" role="menuitemradio" aria-checked="${c.id === current}" data-cat="${c.id}">
      <span class="dot" style="--c:${c.color}"></span>${c.label}${c.id === current ? '<svg><use href="#i-check"/></svg>' : ''}
    </button>`).join('') + (state.demo || isPage(domain) ? '' : `<div class="menu-sep"></div>
    <button class="menu-item danger" role="menuitem" data-exclude="1"><svg><use href="#i-private"/></svg>Never track it</button>`);
  menu.hidden = false;
  menu.classList.remove('closing');
  const r = btn.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(12, Math.min(r.left - 5, innerWidth - mw - 12));
  let top = r.bottom + 6;
  let oy = '0px';
  if (top + mh > innerHeight - 12) { top = Math.max(12, r.top - mh - 6); oy = `${mh}px`; }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.setProperty('--ox', `${Math.max(0, r.left + 12 - left)}px`);
  menu.style.setProperty('--oy', oy);
  menu.style.animation = 'none';
  void menu.offsetWidth;
  menu.style.animation = '';
  (menu.querySelector('[aria-checked="true"]') || menu.querySelector('.menu-item')).focus({ preventScroll: true });
}

function closeCatMenu(instant = false) {
  const menu = $('cat-menu');
  if (menu.hidden) return;
  const btn = menuFor;
  menuFor = null;
  const hadFocus = menu.contains(document.activeElement);
  if (instant || reducedMotion()) menu.hidden = true;
  else {
    menu.classList.add('closing');
    menu.addEventListener('animationend', function done(e) {
      if (e.target !== menu) return;
      menu.removeEventListener('animationend', done);
      if (menu.classList.contains('closing')) { menu.hidden = true; menu.classList.remove('closing'); }
    });
  }
  if (btn && hadFocus && btn.isConnected) btn.focus({ preventScroll: true });
}

async function applyCategory(domain, catId) {
  if (state.demo) state.demoOverrides[domain] = catId;
  else state.overrides = await setCategoryOverride(domain, catId);
  const prevTotal = state.summary.prevTotal;
  const s = summarize({ keys: state.summary.keys, days: state.summary.days, prevDays: [] });
  s.prevTotal = prevTotal;
  state.summary = s;
  renderChart(s, true);
  renderDonut(s, true);
  renderSummary(s, true);
  if (state.view.type !== 'week') renderDetail({ soft: true });
  const cat = CATEGORY_BY_ID[catId];
  const btn = document.querySelector(`.cat-btn[data-domain="${CSS.escape(domain)}"]`);
  if (btn) {
    setCatBtn(btn, cat, domain);
    replay(btn, 'changed');
    btn.closest('.site').querySelector('.site-bar i').style.setProperty('--c', cat.color);
  }
  toast(`${siteName(domain)} moved to ${cat.label}`);
}

// ---------- privacy helpers ----------

// Moves every trace of these sites into anonymous Private time.
async function anonymizeSites(list) {
  if (!list.length) return 0;
  // every day record: this side's own and a linked Memoir's
  const keys = await listDayRecordKeys();
  const raw = await chrome.storage.local.get([...keys, 'origins', 'categories', 'apps', 'favicons']);
  const patch = {};
  let touched = 0;
  for (const k of keys) {
    if (!raw[k]) continue;
    const rec = normalizeDay(raw[k]);
    if (anonymizeDay(rec, list)) { patch[k] = rec; touched++; }
  }
  const origins = raw.origins || {};
  const cats = raw.categories || {};
  const apps = raw.apps || {};
  const o2 = Object.fromEntries(Object.entries(origins).filter(([d]) => !isExcluded(d, list)));
  const c2 = Object.fromEntries(Object.entries(cats).filter(([d]) => !isExcluded(d, list)));
  const a2 = Object.fromEntries(Object.entries(apps).filter(([d]) => !isExcluded(d, list)));
  if (Object.keys(o2).length !== Object.keys(origins).length) patch.origins = o2;
  if (Object.keys(c2).length !== Object.keys(cats).length) { patch.categories = c2; state.overrides = c2; }
  if (Object.keys(a2).length !== Object.keys(apps).length) patch.apps = a2;
  // (Memoir for Windows: the websites' icons a linked browser sent)
  const icons = raw.favicons || {};
  const f2 = Object.fromEntries(Object.entries(icons).filter(([d]) => !isExcluded(d, list)));
  if (Object.keys(f2).length !== Object.keys(icons).length) patch.favicons = f2;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  return touched;
}

async function eraseTitles() {
  await window.memoir.request('privacy.titles'); // (Windows: the native side erases them from its backup too)
  const keys = await listDayRecordKeys();
  const raw = await chrome.storage.local.get(keys);
  const patch = {};
  for (const k of keys) {
    const r = raw[k];
    const has = o => o && typeof o === 'object' && Object.keys(o).length;
    if (r && (has(r.ti) || has(r.th) || has(r.tu) || has(r.tp))) patch[k] = { ...r, ti: {}, th: {}, tu: {}, tp: [] };
  }
  // a linked Memoir erases its titles from before now too (the marker travels; shared/link.js)
  await chrome.storage.local.set({ ...patch, titlesErased: Date.now() });
  return Object.keys(patch).length;
}

async function hasTitles() {
  const keys = await listDayRecordKeys();
  const raw = await chrome.storage.local.get(keys);
  return Object.values(raw).some(r => r && r.ti && Object.keys(r.ti).length);
}

// ---------- settings: the gear morphs into a panel ----------

function openSettings() {
  const m = $('settings');
  if (m.classList.contains('open')) return;
  closeCatMenu(true);
  closeCatPop(true);
  m.classList.add('open');
  $('settings-scrim').classList.add('on');
  document.querySelector('.head').classList.add('dimmed');
  $('settings-btn').setAttribute('aria-expanded', 'true');
  $('settings-btn').setAttribute('aria-label', 'Close settings');
  renderSettings();
  clearTimeout(dustNap);
  dust.pause(false);
  requestAnimationFrame(() => {
    for (const seg of ['appearance', 'detail', 'retention']) syncSegmented($(seg), false);
  });
  refreshStats();
}

function closeSettings(focusTrigger = false) {
  const m = $('settings');
  if (!m.classList.contains('open')) return;
  m.classList.remove('open');
  $('settings-scrim').classList.remove('on');
  document.querySelector('.head').classList.remove('dimmed');
  setNukeStep(0);
  setReveal('detail-confirm', false);
  setReveal('ret-confirm', false);
  pendingRetention = null;
  askPause(false);
  $('ex-form').classList.remove('invalid');
  tip.hide();
  // the sites under Never track hide again as you leave; the dust rests once the panel is shut
  for (const li of $('ex-list').querySelectorAll('.ex-chip')) concealChip(li);
  clearTimeout(dustNap);
  dustNap = setTimeout(() => dust.pause(true), 900);
  answerImport(null, true);
  closeLink(true);
  closeGuide(true);
  closeFootPops(true);
  $('settings-btn').setAttribute('aria-expanded', 'false');
  $('settings-btn').setAttribute('aria-label', 'Settings');
  if (focusTrigger) $('settings-btn').focus({ preventScroll: true });
}

function setReveal(id, open) {
  const el = $(id);
  el.inert = !open;
  if (el._revealT) {
    if (el._revealWant === open) return; // already waiting for the light to make room
    clearTimeout(el._revealT);
    el._revealT = 0;
  }
  if (el.classList.contains('open') === open) return;
  // In the tour, what's lit grows only once the light has made room for it: the open
  // layout is measured first (with no transition), then it opens from where it was.
  if (open && touring && !reducedMotion()) {
    el.style.transition = 'none';
    el.classList.add('open');
    void el.offsetHeight;
    const lead = relight(450);
    el.classList.remove('open');
    void el.offsetHeight;
    el.style.transition = '';
    if (lead) {
      el._revealWant = open;
      el._revealT = setTimeout(() => { el._revealT = 0; el.classList.add('open'); }, lead);
      return;
    }
  }
  el.classList.toggle('open', open);
  // closing, it goes first and the light follows
  if (!open && touring) relight(450);
}

function setPressed(groupId, match) {
  for (const b of $(groupId).querySelectorAll('button')) b.setAttribute('aria-pressed', String(match(b)));
  syncSegmented($(groupId));
}

// The line under Appearance fills as the theme change runs (transform only), then fades.
function themeProgress() {
  const fill = document.querySelector('.tp-fill');
  if (!fill) return;
  // a change that replaces one still running carries on from where the line had got to
  const shown = +getComputedStyle(fill).opacity > 0.05 ? new DOMMatrix(getComputedStyle(fill).transform).a : 0;
  fill.getAnimations().forEach(a => a.cancel());
  // a strong ease in and out: it starts softly, travels, and settles softly
  fill.animate([
    { transform: `scaleX(${shown.toFixed(4)})`, opacity: 1, easing: 'cubic-bezier(0.83, 0, 0.17, 1)' },
    { transform: 'scaleX(1)', opacity: 1, offset: 0.82, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    { transform: 'scaleX(1)', opacity: 0 },
  ], { duration: THEME_SWITCH_MS + 390, easing: 'linear' });
}

function updateAppearanceUI() {
  setPressed('appearance', b => b.dataset.pref === getThemePref());
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const dayLetter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const dayLong = d => longDay.format(new Date(2024, 0, 7 + d)); // 2024-01-07 was a Sunday

// Smooth cursor only means something with the custom cursor on: otherwise its row
// fades and the switch stays put (a press just nudges it)
function lockSmooth() {
  const locked = !$('set-cursor').checked;
  $('smooth-row').classList.toggle('locked', locked);
  if (locked) $('set-smooth').setAttribute('aria-disabled', 'true');
  else $('set-smooth').removeAttribute('aria-disabled');
}

function renderSettings() {
  const st = state.settings;
  $('set-tracking').checked = !st.paused;
  $('set-reminder').checked = !!st.weeklyReminder;
  setReveal('rem-more', !!st.weeklyReminder);
  updateAppearanceUI();
  setPressed('detail', b => (b.dataset.val === 'titles') === !!st.titles);
  setPressed('retention', b => +b.dataset.days === st.retention);
  const desc = st.titles
    ? 'Saves page and window titles, like a video you watched on YouTube or a document you had open. They’re kept as long as your history.'
    : 'Only app and website names are saved, not titles, like Word or youtube.com.';
  const dd = $('detail-desc');
  if (dd.textContent !== desc) animateHeight(dd, () => swapText(dd, desc));
  $('set-cursor').checked = cursorEnabled();
  $('set-rainbow').checked = rainbowOn();
  $('set-smooth').checked = cursorSmooth();
  lockSmooth();
  $('set-demo').checked = state.demo;
  renderLimitRow();
  renderExcluded();
  renderReminder();
  loadLink();
  loadStartup();
}

let exPrimed = false;   // the first fill of the list (when Settings opens) doesn't animate
const exFlights = new Map(); // site -> its typed words, on their way from the field to its chip

// Newest first: a site you add lands right under the field, the others make room.
function renderExcluded(added = null) {
  const ul = $('ex-list');
  const list = state.settings.excluded;
  // chips on their way out don't count: a site re-added mid-fade gets a new chip
  const existing = new Map([...ul.children].filter(li => !li.classList.contains('leaving')).map(li => [li.dataset.site, li]));
  const stale = [...existing].filter(([site]) => !list.includes(site));
  const fresh = list.filter(site => !existing.has(site));
  if (!stale.length && !fresh.length) { exPrimed = true; return; }
  const animate = exPrimed && !reducedMotion();
  const made = [];
  const stay = [...existing.values()].filter(li => list.includes(li.dataset.site));
  const first = animate ? new Map(stay.map(li => [li, li.getBoundingClientRect()])) : null;
  // in the tour the light makes room first, and all of this waits for it
  let lead = 0;
  // the list (and everything under it) rolls open instead of jumping
  const build = () => {
    for (const [, li] of stale) { dropChip(li); li.remove(); }
    for (const li of stay) if (li._flip) { li._flip.cancel(); li._flip = null; }
    for (const site of fresh) {
      const li = document.createElement('li');
      li.className = 'ex-chip';
      li.dataset.site = site;
      li.innerHTML = `<canvas class="ex-dust" aria-hidden="true"></canvas><button class="ex-name" type="button" aria-label="${HIDDEN_SITE}"><span class="ex-text">${escapeHtml(site)}</span></button><button class="x" type="button" aria-label="Track this site again"><svg><use href="#i-x"/></svg></button>`;
      ul.prepend(li);
      made.push(li);
    }
    if (animate) lead = relight(450);
  };
  if (animate) animateHeight($('ex-wrap'), build, { duration: 420, delay: () => lead });
  else build();
  exPrimed = true;
  // the others glide to their new places (even across rows)
  if (first) {
    for (const li of stay) {
      const a = first.get(li);
      const b = li.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const anim = li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, delay: lead, easing: EASE_OUT, fill: 'backwards' });
      li._flip = anim;
      anim.finished.then(() => { if (li._flip === anim) li._flip = null; }, () => {});
    }
  }
  // the new ones pop in (one you typed is flown into instead)
  for (const li of made) {
    if (!animate || exFlights.has(li.dataset.site)) continue;
    if (lead) li.style.animationDelay = `${lead}ms`;
    li.classList.add('adding');
  }
  for (const li of made) {
    // a site you just typed: its words fly from the field into the new chip, still
    // readable, and turn to dust once they've landed; every other one is dust from the start
    const bird = animate ? exFlights.get(li.dataset.site) : null;
    if (bird) li.classList.add('shown', 'landing');
    dust.attach(chipDust(li), { shown: !!bird });
    if (!bird) continue;
    exFlights.delete(li.dataset.site);
    flyIntoChip(bird, li, lead);
  }
  void added;
}

// ----- never-track sites are hidden under dust; two clicks show one -----
// The first click stirs the dust and asks for a second; the second, within a moment,
// blows the dust away from where it landed while the name clears up from there. A click
// on a shown name (or closing Settings) hides it again.
const HIDDEN_SITE = 'Hidden. Press twice to show it';
const REVEAL_GUARD_MS = 500; // after showing a site, its remove button (and hiding it) wait this long
const dust = createDust();
let dustNap = 0;
const ARM_MS = 2600;
let armedChip = null;
function chipDust(li) { return li.querySelector('.ex-dust'); }
function disarmChip(li) {
  if (!li || !li._armTimer) return;
  clearTimeout(li._armTimer);
  li._armTimer = 0;
  li.classList.remove('armed');
  if (armedChip === li) { armedChip = null; tip.hide(); }
  dust.heat(chipDust(li), li.matches(':hover') ? 1.4 : 1);
  if (!li.classList.contains('shown')) li.querySelector('.ex-name').setAttribute('aria-label', HIDDEN_SITE);
}
function armChip(li, e) {
  if (armedChip && armedChip !== li) disarmChip(armedChip);
  armedChip = li;
  li.classList.add('armed');
  li._armTimer = setTimeout(() => disarmChip(li), ARM_MS);
  dust.poke(chipDust(li), e, 2.3);
  li.querySelector('.ex-name').setAttribute('aria-label', 'Press again to show it');
  if (e && e.detail) tip.show('<div class="tip-row"><span>Click again to show it</span></div>', e.clientX, e.clientY);
}
function revealChip(li, e) {
  disarmChip(li);
  li.classList.remove('hiding', 'landing');
  li.classList.add('shown');
  li._shownAt = performance.now();
  li.querySelector('.ex-name').setAttribute('aria-label', `${li.dataset.site}. Press to hide it again`);
  dust.reveal(chipDust(li), e);
  if (reducedMotion()) return;
  // the name clears up from where the click landed, as the dust blows away from there
  const text = li.querySelector('.ex-text');
  const c = dust.at(chipDust(li), e);
  const cr = chipDust(li).getBoundingClientRect();
  const tr = text.getBoundingClientRect();
  const x = c.x + cr.left - tr.left;
  const y = c.y + cr.top - tr.top;
  const R = Math.hypot(Math.max(x, tr.width - x), Math.max(y, tr.height - y)) + 6;
  text.getAnimations().forEach(a => a.cancel());
  text.animate([
    { clipPath: `circle(0px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`, filter: 'blur(3px)', opacity: 0.5 },
    { clipPath: `circle(${R.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`, filter: 'blur(0)', opacity: 1 },
  ], { duration: 620, easing: EASE_OUT });
}
function concealChip(li, { instant = false } = {}) {
  disarmChip(li);
  if (!li.classList.contains('shown')) return;
  li.classList.remove('shown', 'landing');
  li.querySelector('.ex-name').setAttribute('aria-label', HIDDEN_SITE);
  const fast = instant || reducedMotion();
  dust.conceal(chipDust(li), fast);
  if (fast) return;
  // the name blurs away as fresh dust settles over it
  const text = li.querySelector('.ex-text');
  li.classList.add('hiding');
  text.getAnimations().forEach(a => a.cancel());
  text.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(3px)' }], { duration: 340, easing: 'ease-in' })
    .finished.then(() => li.classList.remove('hiding'), () => {});
}
function dropChip(li) {
  disarmChip(li);
  dust.detach(chipDust(li));
}

// A removed chip fades out where it is while the others glide straight to their
// new places (even across rows) and the list eases to its new height, together.
function foldChip(li) {
  const ul = $('ex-list');
  const others = [...ul.children].filter(c => c !== li && !c.classList.contains('leaving'));
  const first = new Map(others.map(c => [c, c.getBoundingClientRect()]));
  const lr = li.getBoundingClientRect();
  const ur = ul.getBoundingClientRect();
  animateHeight($('ex-wrap'), () => {
    for (const c of others) if (c._flip) { c._flip.cancel(); c._flip = null; }
    Object.assign(li.style, { position: 'absolute', left: `${lr.left - ur.left}px`, top: `${lr.top - ur.top}px`, width: `${lr.width}px`, margin: '0' });
  }, { duration: 420 });
  for (const c of others) {
    const a = first.get(c);
    const b = c.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const anim = c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE_OUT });
    c._flip = anim;
    anim.finished.then(() => { if (c._flip === anim) c._flip = null; }, () => {});
  }
  const out = li.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.6)' }], { duration: 240, easing: EASE_OUT, fill: 'forwards' });
  const gone = () => { dropChip(li); li.remove(); };
  out.finished.then(gone, gone);
}

// The words you typed, lifted off the field the moment you add them (the field empties
// under them in the same frame, so they're never there twice): same place, size and
// weight as the typed text.
function liftTyped(site) {
  const r = $('ex-input').getBoundingClientRect();
  const bird = document.createElement('div');
  bird.className = 'ex-bird';
  bird.textContent = site;
  Object.assign(bird.style, { left: `${r.left}px`, top: `${r.top}px`, height: `${r.height}px` });
  document.body.appendChild(bird);
  return bird;
}

// The words glide down into the new chip (right under the field) and settle exactly on
// its name, easing to its size on the way, while the pill grows in under them. Then a
// beat to read it, and it turns to dust like the others.
function flyIntoChip(bird, li, delay = 0) {
  const text = li.querySelector('.ex-text');
  const to = text.getBoundingClientRect();
  const b = bird.getBoundingClientRect();
  if (!to.width || !b.width) { bird.remove(); return; }
  const k = (parseFloat(getComputedStyle(text).fontSize) || 12) / (parseFloat(getComputedStyle(bird).fontSize) || 12.5);
  const dx = to.left - b.left;
  const dy = to.top + to.height / 2 - (b.top + b.height / 2);
  li.classList.add('awaiting');
  li.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: delay + 90, easing: EASE_OUT, fill: 'backwards' });
  const a = bird.animate([
    { transform: 'none' },
    { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(4)})` },
  ], { duration: 460, delay, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' });
  const land = () => {
    bird.remove();
    li.classList.remove('awaiting');
    setTimeout(() => { if (li.isConnected && !li.classList.contains('leaving')) concealChip(li); }, 650);
  };
  a.finished.then(land, land);
}

// A limit set during the tour can be undone in one click for 24 hours; after that
// the access is gone and the usual questions apply.
function trialActive() {
  const t = state.goalTrial;
  if (!t) return false;
  const today = dayKey(new Date());
  const current = state.goalHistory.filter(e => e.from <= today).at(-1);
  if (Date.now() < t.until && current && current.from === t.from && current.limit != null) return true;
  state.goalTrial = null;
  chrome.storage.local.remove('goalTrial');
  return false;
}

async function openResetGauntlet(btn) {
  if (!limitLocked(state.goalHistory, dayKey(new Date()))) return;
  tip.hide();
  if (trialActive()) {
    await resetLimit();
    state.goalTrial = null;
    await chrome.storage.local.remove('goalTrial');
    state.goalHistory = await getGoalHistory();
    updateGoal();
    renderLimitRow();
    render({ soft: true });
    toast('Limit undone. Set one for real from Today’s limit.');
    return;
  }
  const ok = await runGauntlet({
    fromEl: btn,
    onReset: async () => {
      await resetLimit();
      state.goalHistory = await getGoalHistory();
      updateGoal();
      renderLimitRow();
      render({ soft: true });
    },
  });
  toast(ok ? 'Unlocked. Set a new limit from Today’s limit.' : 'Good call. Your limit stays.');
}

function renderLimitRow() {
  const today = dayKey(new Date());
  const limit = limitOn(state.goalHistory, today);
  const locked = limitLocked(state.goalHistory, today);
  const trial = locked && trialActive();
  const text = !locked ? 'No limit set' : trial ? `${fmt(limit)} a day · set in the tour` : `${fmt(limit)} a day · locked`;
  const d = $('limit-desc');
  if (d.textContent !== text) swapText(d, text);
  const b = $('limit-reset');
  b.disabled = !locked;
  swapText(b, trial ? 'Undo' : 'Reset…');
  b.title = trial
    ? `Set during the tour, so it can be undone in one click until ${new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(state.goalTrial.until)}`
    : locked ? 'Unlock your limit (if you really must)' : 'There’s no limit to reset';
}

function renderReminder() {
  const st = state.settings;
  const chips = $('rem-days');
  if (!chips.children.length) {
    for (const d of DAY_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day-chip';
      b.dataset.d = d;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', dayLong(d));
      b.textContent = dayLetter.format(new Date(2024, 0, 7 + d));
      chips.appendChild(b);
    }
  }
  for (const b of chips.children) {
    const on = +b.dataset.d === st.reminderDay;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  const mins = st.reminderMinutes;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const pill = $('rem-time');
  const twentyFour = uses24h();
  pill.classList.toggle('h24', twentyFour);
  const hIn = $('rem-h');
  const mIn = $('rem-m');
  if (document.activeElement !== hIn) hIn.value = twentyFour ? String(h24).padStart(2, '0') : String(((h24 + 11) % 12) + 1);
  if (document.activeElement !== mIn) mIn.value = String(m).padStart(2, '0');
  $('rem-ampm').dataset.pm = String(h24 >= 12);
  $('rem-desc').textContent = st.weeklyReminder ? `${dayLong(st.reminderDay)}s at ${formatTimeOfDay(mins)}` : 'Off';
}

async function saveReminder(patch, note = true) {
  state.settings = await updateSettings(patch);
  renderReminder();
  if (note) {
    const d = $('rem-desc');
    replay(d, 'swap');
  }
}

// ----- storage estimates for "Keep history" -----

let statsRun = 0;
async function refreshStats() {
  const run = ++statsRun;
  const [keys, records] = await Promise.all([listDayKeys(), listDayRecordKeys()]);
  const dayBytes = records.length ? await chrome.storage.local.getBytesInUse(records) : 0;
  const all = await chrome.storage.local.getBytesInUse(null);
  state.stats = { keys, days: keys.length, dayBytes, all };
  state.earliestKey = keys[0] || null;
  if (!keys.length) { showUsed('Nothing saved yet.'); return; }
  // how much of it is page titles and their links (they're saved inside each day); the
  // line waits for that, and nothing else does
  titleBytesIn(records).then(titles => {
    if (run !== statsRun) return; // a newer count is on its way
    showUsed(titles ? `Used ${formatBytes(all)} so far, ${formatBytes(titles)} of it page titles.` : `Used ${formatBytes(all)} so far.`);
  });
}
function showUsed(text) {
  const d = $('ret-desc');
  if (d.textContent !== text) swapText(d, text);
}
// read a month of days at a time, so a long history never holds up Settings
const utf8 = new TextEncoder();
async function titleBytesIn(keys) {
  let bytes = 0;
  for (let i = 0; i < keys.length; i += 31) {
    const raw = await chrome.storage.local.get(keys.slice(i, i + 31));
    for (const r of Object.values(raw)) {
      for (const f of ['ti', 'th', 'tu']) if (r && r[f] && Object.keys(r[f]).length) bytes += utf8.encode(JSON.stringify(r[f])).length;
    }
  }
  return bytes;
}

function estimateFor(days) {
  const st = state.stats;
  const perDay = st && st.days >= 3 ? st.dayBytes / st.days : state.settings.titles ? 9000 : 3500;
  if (days === 0) return `Grows about ${formatBytes(perDay * 365)} a year`;
  const label = days === 365 ? 'a year' : days === 182 ? '6 months' : '3 months';
  return `About ${formatBytes(perDay * days)} for ${label} of history`;
}

let pendingRetention = null;
let retDoomed = 0;
let retTimer = 0;
function armRetention(on) {
  const btn = $('ret-remove');
  const msg = $('ret-msg');
  clearTimeout(retTimer);
  const was = btn.dataset.armed === '1';
  btn.dataset.armed = on ? '1' : '0';
  const text = on ? 'Delete forever' : 'Remove';
  const note = on
    ? `Sure? ${retDoomed} day${retDoomed === 1 ? '' : 's'} of history will be gone for good. Press again to delete.`
    : msg.dataset.first || '';
  if (btn.textContent !== text) animateHeight(btn.closest('.reveal-inner'), () => { btn.textContent = text; msg.textContent = note; }, { duration: 300 });
  else msg.textContent = note;
  btn.setAttribute('aria-label', on ? 'Press again to delete these days forever' : 'Remove older history');
  if (on) {
    retTimer = setTimeout(() => armRetention(false), 9000);
    if (!was && !reducedMotion()) btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 420, easing: EASE_OUT });
  }
}
async function chooseRetention(days) {
  if (days === state.settings.retention) { setReveal('ret-confirm', false); pendingRetention = null; return; }
  const cutoff = retentionCutoffKey(days);
  const keys = await listDayKeys();
  const doomed = cutoff ? keys.filter(k => k < cutoff) : [];
  if (doomed.length) {
    pendingRetention = days;
    setPressed('retention', b => +b.dataset.days === days);
    retDoomed = doomed.length;
    const first = `This removes ${doomed.length} older day${doomed.length === 1 ? '' : 's'} of history (before ${dateOnly.format(dateFromKey(cutoff))}).`;
    $('ret-msg').dataset.first = first;
    armRetention(false);
    $('ret-msg').textContent = first;
    setReveal('ret-confirm', true);
    return;
  }
  await applyRetention(days);
}

// ----- Pausing tracking: only from the switch in Settings, and only on a second press: the
// switch turns into a "Sure?" button (recap.css .pause-switch). Left alone for a few seconds
// (or Esc, a press elsewhere, Settings closing), it turns back into the switch, still on. -----

let pauseAsk = 0;
const pauseAsking = () => $('set-tracking').closest('.switch').classList.contains('sure');
function askPause(on) {
  clearTimeout(pauseAsk);
  $('set-tracking').closest('.switch').classList.toggle('sure', on);
  $('set-tracking').setAttribute('aria-label', on ? 'Sure? Press again to pause tracking' : 'Track screen time');
  if (on) pauseAsk = setTimeout(() => askPause(false), 4000);
}

async function applyRetention(days) {
  pendingRetention = null;
  clearTimeout(retTimer);
  setReveal('ret-confirm', false);
  const cutoff = retentionCutoffKey(days);
  if (cutoff) {
    const doomed = (await listDayRecordKeys()).filter(k => recordDate(k) < cutoff);
    if (doomed.length) await chrome.storage.local.remove(doomed);
  }
  state.settings = await updateSettings({ retention: days });
  setPressed('retention', b => +b.dataset.days === days);
  await refreshStats();
  renderNav(null);
  toast(days === 0 ? 'History is kept forever' : `History is kept for ${days === 365 ? 'a year' : days === 182 ? '6 months' : '3 months'}`);
}

// ----- Clear all: small red → big red "Are you sure?" → "Are you absolutely SURE?" -----

let nukeTimer = 0;
// The two widths the "sure → SURE" word moves between, measured in the real font.
function measureSure() {
  const box = document.querySelector('.nk-sure');
  if (!box) return;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-family:"Memoir Inter",var(--font);font-size:100px';
  probe.innerHTML = '<span style="font-weight:600">sure</span><span style="font-weight:900;letter-spacing:0.015em">SURE</span>';
  document.body.appendChild(probe);
  const [lo, up] = probe.children;
  box.style.setProperty('--w-lo', `${(lo.getBoundingClientRect().width / 100).toFixed(3)}em`);
  box.style.setProperty('--w-up', `${(up.getBoundingClientRect().width / 100 + 0.02).toFixed(3)}em`);
  probe.remove();
}

// ----- Start with Windows (Memoir for Windows only: src/Startup.cs keeps it in Windows' startup list) -----
const STARTUP_TEXT = { on: 'Opens in the notification area when you sign in', off: 'Starts only when you open it' };
async function loadStartup() {
  if (!window.memoir?.windows) return;
  const s = await window.memoir.request('startup.get').catch(() => null);
  $('startup-row').hidden = !(s && s.available);
  if (s && s.available) showStartup(!!s.on);
}
function showStartup(on) {
  $('set-startup').checked = on;
  swapText($('startup-desc'), on ? STARTUP_TEXT.on : STARTUP_TEXT.off);
}

// ----- Memoir for Windows (Settings > Your data): link, see it's in sync, unlink -----
// The extension links (it starts Memoir.exe as its native host; link.js); Memoir for Windows' own Settings
// show the browsers linked with it and can unlink them.
// (each on one line, so the row never changes height)
const LINK_TEXT = {
  off: ['Link', 'Syncs on this computer, never online'],
  connecting: ['Linking…', 'Looking for the app…'],
  insync: ['In sync', ''],
  offline: ['Linked', 'Syncs when the app is open'],
  notfound: ['Linked', 'Not on this computer yet'],
  denied: ['Link', 'Needs your permission first'],
  update: ['Linked', 'Update the app to sync again'],
};
const linkUi = { linked: false, live: null, peers: [], armed: '', timer: 0, tick: 0 };
function syncedText(at) {
  if (!at) return 'Syncing…';
  if (Date.now() - at < 60_000) return 'Synced just now';
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? `Synced at ${timeOnly.format(d)}` : `Synced ${monthDay.format(d)}, ${timeOnly.format(d)}`;
}
// Memoir for Windows: a "Memoir in browser" row for every browser linked with it, any that runs Chrome extensions,
// one per browser profile, in the order they were linked. The description names the browser: what its extension
// said, or the program that started its host when it couldn't tell (Arc, Comet, Vivaldi… only say Chromium);
// a second profile of the same browser gets a number.
const BROWSER_NAMES = { 'chrome.exe': 'Chrome', 'msedge.exe': 'Edge', 'brave.exe': 'Brave', 'vivaldi.exe': 'Vivaldi', 'opera.exe': 'Opera', 'arc.exe': 'Arc', 'comet.exe': 'Comet', 'thorium.exe': 'Thorium', 'chromium.exe': 'Chromium' };
const andList = new Intl.ListFormat(undefined, { type: 'conjunction' });
function namePeers(peers) {
  const count = {};
  for (const p of peers) {
    const exe = BROWSER_NAMES[String(p.browser || '').toLowerCase()];
    const said = p.name && p.name !== 'Memoir extension' ? p.name : '';
    const program = String(p.browser || '').toLowerCase().replace(/\.exe$/, '');
    const fromProgram = exe || (program && program !== 'browser' ? program[0].toUpperCase() + program.slice(1) : '');
    p.browserName = (!said || said === 'Chrome') && fromProgram ? fromProgram : said || 'your browser';
    count[p.browserName] = (count[p.browserName] || 0) + 1;
    p.label = `${p.browserName[0].toUpperCase()}${p.browserName.slice(1)}${count[p.browserName] > 1 ? ` (${count[p.browserName]})` : ''}`;
  }
  return peers;
}
async function loadLink() {
  if (window.memoir?.windows) {
    const { sync } = await chrome.storage.local.get('sync');
    const peers = Object.entries((sync && sync.peers) || {}).map(([device, p]) => ({ device, ...p }));
    peers.sort((a, b) => ((a.linkedAt || 0) - (b.linkedAt || 0)) || a.device.localeCompare(b.device));
    linkUi.peers = namePeers(peers);
    linkUi.linked = peers.length > 0;
    if (linkUi.armed && !peers.some(p => p.device === linkUi.armed)) linkUi.armed = '';
  } else {
    const [{ link }, session] = await Promise.all([chrome.storage.local.get('link'), chrome.storage.session.get('linkLive').catch(() => ({}))]);
    linkUi.linked = !!(link && link.linked);
    linkUi.live = session.linkLive || null;
  }
  renderLink();
}
function renderLink() {
  let rows;
  if (window.memoir?.windows) {
    const peers = linkUi.peers;
    rows = peers.length
      ? peers.map(p => ({ key: p.device, name: p.label, title: 'Memoir in browser', state: p.connected ? 'insync' : 'offline', label: p.connected ? 'In sync' : 'Linked', desc: `${p.label} · ${p.connected ? syncedText(p.lastSync) : 'syncs when it’s open'}` }))
      : [{ key: '', title: 'Memoir in browser', state: 'guide', label: 'Guide', desc: 'Not linked yet' }];
    // a browser linked or unlinked: its row comes or goes, and the block makes room
    const box = $('link-rows');
    const fit = () => {
      while (box.children.length < rows.length) box.append(copyLinkRow());
      while (box.children.length > rows.length) box.lastElementChild.remove();
    };
    if (box.children.length !== rows.length) animateHeight(box, fit);
    else fit();
    if (peers.length) $('nuke-also').textContent = `Memoir in ${andList.format([...new Set(peers.map(p => p.browserName))])} is cleared too.`;
    $('link-more').hidden = !peers.length;
  } else {
    const live = linkUi.live && linkUi.live.state;
    const state = !linkUi.linked ? (live === 'denied' ? 'denied' : 'off') : live && live !== 'off' ? live : 'connecting';
    const [label, text] = LINK_TEXT[state] || LINK_TEXT.connecting;
    rows = [{ key: 'app', title: 'Memoir for Windows', state, label, desc: state === 'insync' ? syncedText(linkUi.live.lastSync) : text }];
  }
  rows.forEach((row, i) => paintLinkRow($('link-rows').children[i], row));
  // "Synced just now" turns into "Synced at 12:04" in a minute, while Settings are open
  clearTimeout(linkUi.tick);
  if (rows.some(r => r.state === 'insync') && $('settings').classList.contains('open')) linkUi.tick = setTimeout(renderLink, 30_000);
}
function paintLinkRow(el, { key, name, title, state, label, desc }) {
  const btn = el.querySelector('.link-btn');
  const armed = !!key && linkUi.armed === key;
  // (which browser it is stays in sight while it asks)
  if (armed) { label = 'Unlink?'; desc = name ? `${name} · both keep what they have` : 'Both keep what they have so far'; }
  el.dataset.key = key;
  swapText(el.querySelector('.link-title'), title);
  btn.hidden = state === 'none';
  btn.dataset.state = state;
  btn.dataset.arm = armed ? '1' : '';
  btn.setAttribute('aria-label', state === 'guide' ? 'How to connect a browser' : armed ? `Press again to unlink ${name || title}` : `${label}: ${name ? `${title}, ${name}` : title}`);
  if (label) relabel(btn, label);
  swapText(el.querySelector('.link-desc'), desc);
}
// another row like the first, for one more linked browser
let linkRowSeq = 0;
function copyLinkRow() {
  const el = $('link-row').cloneNode(true);
  for (const node of [el, ...el.querySelectorAll('[id]')]) node.removeAttribute('id');
  const desc = el.querySelector('.link-desc');
  desc.id = `link-desc-${++linkRowSeq}`;
  el.querySelector('.link-btn').setAttribute('aria-describedby', desc.id);
  return el;
}
// a button's label swaps, and its width follows
function relabel(btn, text) {
  const el = btn.querySelector('.link-label');
  if (el.textContent === text) return;
  const from = btn.getBoundingClientRect().width;
  el.textContent = text;
  replay(el, 'swap');
  const to = btn.getBoundingClientRect().width;
  if (from && Math.abs(to - from) > 1 && !reducedMotion()) btn.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 320, easing: EASE_OUT });
}
// key: 'app' in the extension; in Memoir for Windows, the device of the browser whose row it is (none: the guide)
async function pressLink(key, btn) {
  if (!key) { if (window.memoir?.windows) openGuide(btn); return; }
  if (!linkUi.linked && !window.memoir?.windows) { askLink(); return; }
  if (linkUi.armed !== key) {
    linkUi.armed = key;
    renderLink();
    clearTimeout(linkUi.timer);
    linkUi.timer = setTimeout(() => { linkUi.armed = ''; renderLink(); }, 5000);
    return;
  }
  linkUi.armed = '';
  clearTimeout(linkUi.timer);
  if (window.memoir?.windows) await window.memoir.request('link.unlink', { device: key }).catch(() => {});
  else await chrome.runtime.sendMessage({ type: 'unlink' }).catch(() => {});
  toast('Unlinked. Both keep what they have');
  loadLink();
}

// Before linking: both histories (merge), or only the days from today on (fresh). A popover that grows out of
// Link, like Import's; its answer links (link.js link(mode)), and Memoir for Windows takes the same mode.
function askLink() {
  linkPop.open($('link-btn'));
  $('link-pop').querySelector('[data-mode="merge"]').focus({ preventScroll: true });
}
function closeLink(instant = false) { if (!$('link-pop').hidden) linkPop.close({ instant }); }

// Memoir for Windows: how to connect a browser, from the row's Guide (nothing linked) or Connect another browser
let guideFrom = null;
function openGuide(from) {
  guideFrom = from;
  guidePop.open(from);
  $('guide-pop').querySelector('[data-close]').focus({ preventScroll: true });
}
function closeGuide(instant = false) { if (!$('guide-pop').hidden) guidePop.close({ instant }); }
async function linkWith(mode) {
  closeLink();
  // the permission has to be asked for in this very click (the answer's)
  let granted = false;
  try { granted = await chrome.permissions.request({ permissions: ['nativeMessaging'] }); } catch { /* refused */ }
  if (!granted) { linkUi.live = { state: 'denied' }; renderLink(); return; }
  linkUi.linked = true; linkUi.live = { state: 'connecting' };
  renderLink();
  await chrome.runtime.sendMessage({ type: 'link', mode }).catch(() => {});
}

// ---------- a newer Memoir for Windows ----------
// Memoir for Windows never looks online. A linked browser's Memoir, which its store keeps up to date, says which is
// the newest Memoir for Windows (windowsLatest, link.js); an older one here says so in Settings until it's put off
// for that version (Not now), and once in a toast.
const versionOf = v => String(v || '').split(/[^0-9.]/)[0].split('.').map(n => parseInt(n, 10) || 0);
function isNewer(a, b) {
  const x = versionOf(a), y = versionOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
let updateShown = null;
async function renderUpdate({ announce = false } = {}) {
  if (!window.memoir?.windows) return;
  const { sync, updateDismissed, updateAnnounced } = await chrome.storage.local.get(['sync', 'updateDismissed', 'updateAnnounced']);
  const manifest = chrome.runtime.getManifest();
  const here = manifest.version_name || manifest.version;
  let latest = null;
  for (const peer of Object.values((sync && sync.peers) || {})) {
    const v = peer && peer.windowsLatest;
    if (/^\d{1,4}(\.\d{1,4}){1,3}$/.test(v || '') && isNewer(v, here) && (!latest || isNewer(v, latest))) latest = v;
  }
  const show = latest && updateDismissed !== latest ? latest : null;
  if (show === updateShown) return;
  updateShown = show;
  const row = $('update-row');
  if (show) $('update-version').textContent = show;
  // the block makes room for it (or closes up) rather than jumping
  animateHeight(row.parentElement, () => { row.hidden = !show; });
  if (show && !row.hidden && !reducedMotion()) row.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 80, easing: EASE_OUT, fill: 'backwards' });
  if (show && announce && updateAnnounced !== show) {
    toast(`Memoir for Windows ${show} is out: Settings has it`);
    chrome.storage.local.set({ updateAnnounced: show }).catch(() => {});
  }
}

// Tracking paused, from anywhere (Settings, Today, the tray, a linked Memoir): the header says so, with Resume, so
// a still or empty week never looks like Memoir stopped working. Not over the sample week.
function showPaused() {
  const on = !!state.settings.paused && !state.demo;
  const pill = $('paused-pill');
  const leaving = pill.classList.contains('leaving');
  if (on ? !pill.hidden && !leaving : pill.hidden || leaving) return;
  pill.getAnimations().forEach(a => a.cancel());
  pill.classList.remove('leaving');
  if (on) pill.hidden = false;
  // resumed: it shrinks away as it popped in, rather than vanishing under the pointer
  else if (reducedMotion()) pill.hidden = true;
  else {
    pill.classList.add('leaving');
    pill.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }], { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished
      .then(() => { if (pill.classList.contains('leaving')) { pill.classList.remove('leaving'); pill.hidden = true; pill.getAnimations().forEach(a => a.cancel()); } }, () => {});
  }
  if ($('board').classList.contains('is-empty')) render({ soft: true });
}

function setNukeStep(n) {
  const row = $('data-row');
  const prev = +row.dataset.step;
  row.dataset.step = String(n);
  clearTimeout(nukeTimer);
  $('nuke-cancel').tabIndex = n === 1 || n === 2 ? 0 : -1;
  $('nuke-also').classList.toggle('on', linkUi.linked);
  const nuke = $('nuke');
  const label = ['Clear all data', 'Are you sure? Press again to continue', 'Are you absolutely sure? Press again to delete everything', 'Cleared'][n];
  nuke.setAttribute('aria-label', label);
  if (n === 1 || n === 2) nukeTimer = setTimeout(() => setNukeStep(0), 9000);
  if (n > prev && n <= 2 && !reducedMotion()) {
    nuke.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: 420, easing: EASE_OUT });
  }
}

async function clearAllData() {
  await withData(async () => {
    const keys = await listDayRecordKeys();
    await chrome.storage.local.remove([...keys, 'categories', 'origins', 'apps', 'appIcons', 'favicons', 'goalNotify']);
    await chrome.storage.session.remove('session');
    // a linked Memoir clears everything from before now too (the marker travels; shared/link.js)
    await chrome.storage.local.set({ wipe: Date.now() });
  });
  state.overrides = {};
  state.earliestKey = null;
  state.todayRec = normalizeDay(null);
  setOrigins({});
  if (state.demo) exitDemo(false);
  resetView({ instant: true });
  await render({});
  updateGoal();
  await refreshStats();
}

// ---------- navigation & wiring ----------

async function goToWeek(weekStart, direction) {
  if (!direction) direction = weekStart > state.weekStart ? 'next' : 'prev';
  state.weekStart = weekStart;
  history.replaceState(null, '', `#week=${dayKey(weekStart)}`);
  tip.hide();
  closeCatMenu(true);
  closeCatPop(true);
  if (state.view.type !== 'week') resetView({ instant: true });
  await render({ direction });
}

function wire() {
  initContextMenu({
    refreshLabel: 'Refresh report',
    onMessage: toast,
    beforeOpen: () => { tip.hide(); closeCatMenu(true); },
    getItems: ({ target }) => {
      if (target.closest('.pk-layer, .gx-layer, .tour, .wel')) return [];
      const category = target.closest('.site')?.querySelector('.cat-btn');
      return [
        ...(category ? [{ label: 'Change category', icon: 'category', action: () => openCatMenu(category) }, { separator: true }] : []),
        { label: $('settings').classList.contains('open') ? 'Close settings' : 'Settings', icon: 'settings', action: () => $('settings-btn').click() },
        // tracking can be paused only from Settings; this menu can only resume it
        ...(state.settings.paused ? [{ label: 'Resume tracking', icon: 'play', action: () => { $('set-tracking').checked = false; $('set-tracking').click(); } }] : []),
      ];
    },
  });
  $('prev-week').addEventListener('click', () => goToWeek(addDays(state.weekStart, -7), 'prev'));
  $('scope').addEventListener('click', e => {
    const b = e.target.closest('button[data-scope]');
    if (b) setScope(b.dataset.scope);
  });
  $('kind').addEventListener('click', e => {
    const b = e.target.closest('button[data-kind]');
    if (b) setKind(b.dataset.kind);
  });
  $('next-week').addEventListener('click', () => {
    const next = addDays(state.weekStart, 7);
    if (!state.demo && next > startOfWeek(new Date())) return;
    goToWeek(next, 'next');
  });

  // The mouse's Back button steps back inside the report, the way Esc does: the tour's
  // previous step, or whatever is open, or out of a day or hour. Only with nothing to
  // step back from does the browser's own Back happen. The press is taken before any
  // other handler sees it (window, capture), so exactly one step happens, on release.
  let backPlan = null;
  const backTarget = () => {
    if (document.querySelector('.wel')) return null;
    const tourBack = document.querySelector('.tour.on .tour-back');
    if (tourBack) return () => { if (!tourBack.disabled && !tourBack.classList.contains('gone')) tourBack.click(); };
    const open = document.querySelector('.pk-layer, .gx-layer, .context-menu:not([hidden])') || !$('cat-menu').hidden || catPop.isOpen || pages.isOpen
      || importAnswer || footOpen() || $('settings').classList.contains('open') || state.view.type !== 'week';
    return open ? () => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) : null;
  };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick']) {
    addEventListener(type, e => {
      if (e.button !== 3) return;
      if (type === 'pointerdown') backPlan = backTarget();
      if (!backPlan) return;
      e.preventDefault();
      e.stopPropagation();
      // cancelling the press also cancels its mouseup, so the step happens on pointerup
      if (type === 'pointerup') { const go = backPlan; backPlan = null; go(); }
    }, true);
  }

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (!$('cat-menu').hidden) closeCatMenu();
      else if (catPop.isOpen) closeCatPop();
      else if (pages.isOpen) { const back = popAnchor; closePagePop(); back?.querySelector('[role="button"]')?.focus({ preventScroll: true }); }
      else if (importAnswer) { answerImport(null); $('import').focus({ preventScroll: true }); }
      else if (linkPop.isOpen) { closeLink(); $('link-btn').focus({ preventScroll: true }); }
      else if (guidePop.isOpen) { closeGuide(); guideFrom?.focus({ preventScroll: true }); }
      else if (footOpen()) { const [p] = footOpen(); p.close(); p.focusTrigger(); }
      else if ($('settings').classList.contains('open')) {
        if ($('data-row').dataset.step !== '0') setNukeStep(0);
        else if (pauseAsking()) askPause(false);
        else closeSettings(true);
      } else if (state.view.type !== 'week') goBack();
      return;
    }
    const inside = e.target instanceof HTMLElement && e.target.closest('input, .menu, .morph, .segmented, .heat, .pop, .pk-layer, .gx-layer, .tour');
    if (inside || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // in a day or hour, the arrows step through it; otherwise they change the week
    if (state.view.type === 'day' || state.view.type === 'hour') {
      e.preventDefault();
      stepView(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key === 'ArrowLeft' && !$('prev-week').disabled) $('prev-week').click();
    if (e.key === 'ArrowRight' && !$('next-week').disabled) $('next-week').click();
  });

  // highlights & facts: category, day and hour words
  const onAct = e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'cat') openCatPop(el.dataset.cat, el);
    else if (act === 'day') {
      const i = +el.dataset.i;
      openView({ type: 'day', day: i, origin: { kind: 'col', i } }, el);
    } else if (act === 'hour') {
      openView({ type: 'hour', day: null, hour: +el.dataset.h, origin: null }, el);
    }
  };
  document.querySelector('.summary').addEventListener('click', onAct);
  $('chart-back').addEventListener('click', goBack);
  $('chart-home').addEventListener('click', goHome);
  $('step-prev').addEventListener('click', () => stepView(-1));
  $('step-next').addEventListener('click', () => stepView(1));
  $('trend-btn').addEventListener('click', () => openView({ type: 'trend', origin: { kind: 'trend' } }, $('trend-btn')));

  // detail views: hours in a day, days in an hour
  $('detail-view').addEventListener('click', e => {
    const hcol = e.target.closest('.hcol');
    if (hcol && !hcol.disabled && state.view.type === 'day') {
      openView({ type: 'hour', day: state.view.day, hour: +hcol.dataset.h, origin: { kind: 'hcol', h: +hcol.dataset.h } }, hcol);
      return;
    }
    const dcol = e.target.closest('.dcol');
    if (dcol && !dcol.disabled && state.view.type === 'hour') {
      const i = +dcol.dataset.i;
      if (state.view.day == null) openView({ type: 'hour', day: i, hour: state.view.hour, origin: { kind: 'dcol', i } }, dcol);
      else if (i !== state.view.day) switchDay(i);
    }
  });
  $('detail-view').addEventListener('pointerover', e => {
    const hcol = e.target.closest('.hcol');
    if (hcol && state.view.type === 'day') {
      const d = state.summary.days[state.view.day];
      const h = +hcol.dataset.h;
      const slot = Object.entries(d.hs[h] || {}).filter(([dom]) => !isPrivate(dom)).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const rows = slot.map(([dom, v]) => `<div class="tip-row"><span>${escapeHtml(siteName(dom))}</span><b>${fmt(v, { seconds: true })}</b></div>`).join('');
      tip.show(`<div class="tip-title">${hourRange(h)}</div><div class="tip-row"><span>Screen time</span><b>${d.h[h] > 0 ? fmt(d.h[h], { seconds: true }) : 'No activity'}</b></div>${rows}`, e.clientX, e.clientY);
      return;
    }
    // the gaps between columns and their hour labels: the tip stays, so moving from one
    // column to the next morphs it (as on the week chart) instead of closing and reopening
    if (e.target.closest('.hstrip')) return;
    rowTip(e);
  });
  $('detail-view').addEventListener('pointermove', e => tip.move(e.clientX, e.clientY));
  $('detail-view').addEventListener('pointerout', e => {
    if (!e.relatedTarget || !$('detail-view').contains(e.relatedTarget)) tip.hide();
    else if (!e.relatedTarget.closest('.hstrip, .rows')) tip.hide();
  });

  // page titles on hover (only when titles are recorded)
  function rowTip(e) {
    const row = e.target.closest('.row, .site');
    // between two rows of a list the tip stays, so it morphs from one row to the next
    if (!row && e.target.closest('.rows, .sites')) return;
    if (!row || !row.dataset.domain || e.target.closest('.cat-btn')) { tip.hide(); return; }
    // Most used, and the day and hour views: a click on the row shows each page's time
    // (the name itself opens the site)
    const inDetail = !!row.closest('#detail-view');
    if (row.classList.contains('site') || inDetail) {
      if (!row.classList.contains('has-pages') || e.target.closest('.site-link') || (pages.isOpen && popAnchor === row)) { tip.hide(); return; }
      const ol = row.parentElement;
      const when = inDetail ? pagesWhen(ol._days, ol._hour) : scoped().when;
      tip.show(`<div class="tip-row"><span>Click to see each page’s time ${when}</span></div>`, e.clientX, e.clientY);
      return;
    }
    const scope = row.parentElement && row.parentElement._days;
    const html = titlesTip(row.dataset.domain, scope || null);
    if (html) tip.show(html, e.clientX, e.clientY);
    else tip.hide();
  }
  // a row with pages (not its name or its category) opens them
  const openRowPages = row => { tip.hide(true); openPagePop(row.dataset.domain, row); };
  $('sites').addEventListener('click', e => {
    if (e.target.closest('.site-link, .cat-btn')) return;
    const row = e.target.closest('.site.has-pages');
    if (row) openRowPages(row);
  });
  $('sites').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const time = e.target.closest('.site-time[role="button"]');
    if (!time) return;
    e.preventDefault();
    openRowPages(time.closest('.site'));
  });
  // the same from a row in the day or hour view, for that day or hour
  const detailPages = row => { tip.hide(true); openPagePop(row.dataset.domain, row, { days: row.parentElement._days, hour: row.parentElement._hour }); };
  $('detail-view').addEventListener('click', e => {
    if (e.target.closest('.site-link')) return;
    const row = e.target.closest('.row.has-pages');
    if (row && !row.closest('.leaving')) detailPages(row);
  });
  $('detail-view').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const time = e.target.closest('.row-time[role="button"]');
    if (!time) return;
    e.preventDefault();
    detailPages(time.closest('.row'));
  });
  wirePagePop();
  for (const id of ['sites', 'cat-pop']) {
    $(id).addEventListener('pointerover', rowTip);
    $(id).addEventListener('pointermove', e => tip.move(e.clientX, e.clientY));
    $(id).addEventListener('pointerleave', () => tip.hide());
  }

  // settings morph
  $('settings-btn').addEventListener('click', () => {
    if ($('settings').classList.contains('open')) closeSettings();
    else openSettings();
  });
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.pk-layer, .gx-layer, .tour')) return;
    if ($('settings').classList.contains('open') && !e.target.closest('#settings, #import-pop, #link-pop, #guide-pop, #author-pop, #site-pop, #privacy-pop')) closeSettings();
    if (importAnswer && !e.target.closest('#import-pop')) answerImport(null);
    if (linkPop.isOpen && !e.target.closest('#link-pop, #link-btn')) closeLink();
    if (guidePop.isOpen && !e.target.closest('#guide-pop, .link-btn, #link-more')) closeGuide();
    for (const [p, id, popId] of footPops) if (p.popover.isOpen && !e.target.closest(`#${id}, #${popId}`)) p.close();
    if (!$('cat-menu').hidden && !e.target.closest('#cat-menu') && !e.target.closest('.cat-btn')) closeCatMenu();
    if (catPop.isOpen && !e.target.closest('#cat-pop') && !e.target.closest('[data-act="cat"]') && !e.target.closest('.cat-legend') && !e.target.closest('.donut-seg')) closeCatPop();
    // another row with pages opens its own (the click does that); anywhere else closes it
    if (pages.isOpen && !e.target.closest('#page-pop') && !(e.target.closest('.site.has-pages, #detail-view .row.has-pages') && !e.target.closest('.site-link, .cat-btn'))) closePagePop();
  });

  // appearance
  $('appearance').addEventListener('click', e => {
    const b = e.target.closest('button[data-pref]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const t = setThemePref(b.dataset.pref, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, {
      // the Settings panel and, in the tour, its card fill in with one circle from the button
      panels: [
        { el: $('settings').classList.contains('open') ? $('settings-panel') : null, parts: [document.querySelector('#settings-panel .panel-inner')] },
        { el: document.querySelector('.tour.on .tour-card'), parts: [document.querySelector('.tour.on .tour-card')] },
      ],
      parts: [...document.querySelectorAll('.board > .card, .head-left, .demo-pill, .morph-trigger')],
      // the tour's dim fades to the new theme's as the sweep passes it
      fades: [document.querySelector('.tour.on .tour-spot')],
      cards: [...document.querySelectorAll('.board > .card')],
    });
    updateAppearanceUI();
    saveAppearance({ theme: b.dataset.pref }).then(s => { state.settings = s; });
    if (t) t.ready.then(themeProgress, () => {});
  });

  // category menu
  $('sites').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (btn) openCatMenu(btn);
  });
  $('cat-menu').addEventListener('click', e => {
    const item = e.target.closest('.menu-item');
    if (!item || !menuFor) return;
    const domain = menuFor.dataset.domain;
    closeCatMenu();
    if (item.dataset.exclude) addExcluded(domain);
    else applyCategory(domain, item.dataset.cat);
  });
  $('cat-menu').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...$('cat-menu').querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  });
  window.addEventListener('resize', () => { closeCatMenu(true); closeCatPop(true); closePagePop(true); tip.hide(); });

  // tracking
  // turning it on is one click; turning it off, the first press turns it into "Sure?" and
  // the press on that pauses
  $('set-tracking').addEventListener('click', e => {
    if (e.target.checked || pauseAsking()) return;
    e.preventDefault();
    askPause(true);
  });
  $('set-tracking').addEventListener('change', async e => {
    const fromSure = pauseAsking();
    askPause(false);
    state.settings = await updateSettings({ paused: !e.target.checked });
    showPaused();
    // paused from "Sure?": the toast waits until it has turned back into the switch, so the
    // two don't share frames (and says nothing if tracking was turned back on meanwhile)
    if (fromSure && !reducedMotion()) setTimeout(() => { if (!$('set-tracking').checked) toast('Tracking paused'); }, 380);
    else toast(e.target.checked ? 'Tracking resumed' : 'Tracking paused');
  });
  $('set-tracking').addEventListener('blur', () => askPause(false));
  // a newer Memoir for Windows: Not now puts it off until the next one (renderUpdate)
  $('update-x').addEventListener('click', () => { if (updateShown) chrome.storage.local.set({ updateDismissed: updateShown }).catch(() => {}); });
  $('resume').addEventListener('click', async () => {
    state.settings = await updateSettings({ paused: false });
    $('set-tracking').checked = true;
    showPaused();
    toast('Tracking resumed');
    try { await chrome.runtime.sendMessage({ type: 'sync' }); } catch { /* ignore */ }
  });
  // a press anywhere else takes the question back
  document.addEventListener('pointerdown', e => {
    if (pauseAsking() && !e.target.closest('.pause-switch')) askPause(false);
  }, true);

  // tracking detail
  $('detail').addEventListener('click', async e => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    const titles = b.dataset.val === 'titles';
    if (titles === !!state.settings.titles) return;
    state.settings = await updateSettings({ titles });
    renderSettings();
    if (titles) {
      setReveal('detail-confirm', false);
      toast('Page titles will be saved from now on');
    } else if (await hasTitles()) {
      setReveal('detail-confirm', true);
    } else {
      toast('Only app and website names are saved now');
    }
  });
  $('detail-keep').addEventListener('click', () => { setReveal('detail-confirm', false); toast('Saved titles kept; new ones won’t be saved'); });
  $('detail-erase').addEventListener('click', async () => {
    setReveal('detail-confirm', false);
    const n = await withData(eraseTitles);
    toast(n ? 'Saved page titles erased' : 'No page titles to erase');
    render({ soft: true });
    refreshStats();
  });

  // never track
  const exForm = $('ex-form');
  const exInput = $('ex-input');
  exInput.addEventListener('input', () => {
    exForm.classList.toggle('has-text', exInput.value.trim().length > 0);
    exForm.classList.remove('invalid');
  });
  exForm.addEventListener('submit', async e => {
    e.preventDefault();
    const site = normalizeSite(exInput.value);
    if (!site) {
      exForm.classList.add('invalid');
      toast('That doesn’t look like a website');
      return;
    }
    // a new site: the typed words lift off at once (the field empties under them) and
    // fly into the chip once it's made
    if (!state.settings.excluded.includes(site) && !reducedMotion()) {
      exFlights.set(site, liftTyped(site));
      exInput.value = '';
      exForm.classList.remove('has-text');
      exForm.classList.add('sent');
      setTimeout(() => exForm.classList.remove('sent'), 420);
    }
    if (await addExcluded(site)) {
      exInput.value = '';
      exForm.classList.remove('has-text');
    }
    // words that found no chip to land in just fade
    const stray = exFlights.get(site);
    exFlights.delete(site);
    if (stray) stray.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => stray.remove(), () => stray.remove());
  });
  $('ex-list').addEventListener('click', async e => {
    const name = e.target.closest('.ex-name');
    if (name) {
      const li = name.closest('.ex-chip');
      if (li.classList.contains('leaving')) return;
      if (li.classList.contains('shown')) {
        // a third tap straight after showing it doesn't hide it again
        if (performance.now() - (li._shownAt || 0) >= REVEAL_GUARD_MS) concealChip(li);
      } else if (li._armTimer) revealChip(li, e);
      else armChip(li, e);
      return;
    }
    // The remove button is under the dust with the name: it's there only once the site is
    // shown, and only half a second after that (CSS), so a tap too many can't remove it.
    const x = e.target.closest('.x');
    if (!x) return;
    const li = x.closest('.ex-chip');
    if (li.classList.contains('leaving') || !li.classList.contains('shown') || li.classList.contains('landing')) return;
    if (performance.now() - (li._shownAt || 0) < REVEAL_GUARD_MS) return;
    const site = li.dataset.site;
    li.classList.add('leaving');
    disarmChip(li);
    if (reducedMotion()) { dropChip(li); li.remove(); }
    else foldChip(li);
    state.settings = await updateSettings({ excluded: state.settings.excluded.filter(s => s !== site) });
    toast(`${site} will be tracked again`);
  });
  // pointing at a hidden site stirs its dust a little; leaving lets it settle (and the
  // "click again" hint goes with the pointer)
  $('ex-list').addEventListener('pointerover', e => {
    const name = e.target.closest('.ex-name');
    if (!name || (e.relatedTarget && name.contains(e.relatedTarget))) return;
    const li = name.closest('.ex-chip');
    if (!li._armTimer) dust.heat(chipDust(li), 1.4);
  });
  $('ex-list').addEventListener('pointerout', e => {
    const name = e.target.closest('.ex-name');
    if (!name || (e.relatedTarget && name.contains(e.relatedTarget))) return;
    const li = name.closest('.ex-chip');
    if (armedChip === li) tip.hide();
    if (!li._armTimer) dust.heat(chipDust(li), 1);
  });
  $('ex-list').addEventListener('pointermove', e => { if (armedChip && e.target.closest('.ex-name') && tip.visible) tip.move(e.clientX, e.clientY); });

  // weekly reminder
  $('set-reminder').addEventListener('change', async e => {
    state.settings = await updateSettings({ weeklyReminder: e.target.checked });
    setReveal('rem-more', e.target.checked);
    renderReminder();
  });
  $('rem-days').addEventListener('click', e => {
    const b = e.target.closest('.day-chip');
    if (b) saveReminder({ reminderDay: +b.dataset.d });
  });
  $('rem-days').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const idx = DAY_ORDER.indexOf(state.settings.reminderDay);
    const next = DAY_ORDER[(idx + (e.key === 'ArrowRight' ? 1 : 6)) % 7];
    saveReminder({ reminderDay: next }).then(() => $('rem-days').querySelector(`[data-d="${next}"]`).focus());
  });
  const timeFromInputs = () => {
    const tf = uses24h();
    let h = parseInt($('rem-h').value, 10);
    let m = parseInt($('rem-m').value, 10);
    if (!Number.isFinite(m)) m = 0;
    m = Math.max(0, Math.min(59, m));
    const cur = Math.floor(state.settings.reminderMinutes / 60);
    if (!Number.isFinite(h)) h = tf ? cur : ((cur + 11) % 12) + 1;
    if (tf) h = Math.max(0, Math.min(23, h));
    else {
      h = Math.max(1, Math.min(12, h));
      const pm = cur >= 12;
      h = (h % 12) + (pm ? 12 : 0);
    }
    return h * 60 + m;
  };
  for (const id of ['rem-h', 'rem-m']) {
    const input = $(id);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); });
    input.addEventListener('change', () => saveReminder({ reminderMinutes: timeFromInputs() }));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = id === 'rem-h' ? 60 : 5;
        const next = (state.settings.reminderMinutes + (e.key === 'ArrowUp' ? step : -step) + 1440) % 1440;
        saveReminder({ reminderMinutes: next }, false).then(() => input.select());
      }
    });
  }
  $('rem-ampm').addEventListener('click', () => saveReminder({ reminderMinutes: (state.settings.reminderMinutes + 720) % 1440 }));

  // keep history
  const ret = $('retention');
  ret.addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (b) chooseRetention(+b.dataset.days);
  });
  ret.addEventListener('pointerover', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    tip.show(`<div class="tip-row"><span>${estimateFor(+b.dataset.days)}</span></div>`, r.left + r.width / 2, r.top);
  });
  ret.addEventListener('pointerleave', () => tip.hide());
  $('ret-keep').addEventListener('click', () => {
    pendingRetention = null;
    setReveal('ret-confirm', false);
    setPressed('retention', b => +b.dataset.days === state.settings.retention);
  });
  // two presses, like Clear all: the first arms it, the second deletes
  $('ret-remove').addEventListener('click', () => {
    if (pendingRetention == null) return;
    const btn = $('ret-remove');
    if (btn.dataset.armed !== '1') { armRetention(true); return; }
    applyRetention(pendingRetention);
  });

  // your data
  $('export').addEventListener('click', async () => {
    // days as shown (this side's own merged with a linked Memoir's), as plain days; the link's own
    // records stay here
    const all = await chrome.storage.local.get(null);
    const dates = await listDayKeys();
    Object.assign(all, Object.fromEntries(Object.entries(await getDays(dates)).map(([k, d]) => [storageKeyForDay(k), d])));
    for (const k of Object.keys(all)) if (k.startsWith('link:') || k === 'link' || k === 'linkPeers' || k === 'sync') delete all[k];
    const blob = new Blob([JSON.stringify({ app: 'Memoir: Browser Screen Time', format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), data: all }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `memoir-screen-time-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Export downloaded');
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const parsed = await readImport(file);
    if (!parsed) { toast('That file isn’t a Memoir export'); return; }
    // an export from before page links: say so, while it's brought up to date
    if (parsed.old) {
      toast('This export is from an older version of Memoir. Updating it to the new format…', 4000);
      await new Promise(r => setTimeout(r, reducedMotion() ? 0 : 1500));
    }
    // days that already hold time here: ask before touching them
    const here = await chrome.storage.local.get(Object.keys(parsed.days));
    const overlap = Object.keys(parsed.days).filter(k => here[k] && dayTotal(normalizeDay(here[k])) > 0).length;
    const mode = overlap ? await askImportMode(overlap) : 'replace';
    if (!mode) return;
    let n = 0, limits = false;
    try { ({ days: n, limits } = await withData(() => writeImport(parsed, mode))); }
    catch { toast('The import couldn’t be completed. Nothing was changed.'); return; }
    if (n > 0) {
      if (state.demo) exitDemo(false);
      const keys = await listDayKeys();
      state.earliestKey = keys[0] || null;
      const [origins, today] = await Promise.all([getOrigins(), getDays([state.todayKey])]);
      setOrigins(origins);
      state.todayRec = today[state.todayKey];
      await render({});
      updateGoal();
      refreshStats();
      const days = `${parsed.old ? 'Updated and imported' : 'Imported'} ${n} day${n === 1 ? '' : 's'}${limits ? ' and your limits' : ''}`;
      toast(overlap ? `${days} · ${overlap} ${mode === 'merge' ? 'merged' : 'replaced'}` : days);
    }
  });
  $('import-pop').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) { answerImport(b.dataset.mode || null); $('import').focus({ preventScroll: true }); }
  });
  // the panel scrolls under its popovers: keep them on what they came from
  $('settings-panel').addEventListener('scroll', () => {
    if (!$('import-pop').hidden) importPop.place($('import').getBoundingClientRect());
    if (!$('link-pop').hidden) linkPop.place($('link-btn').getBoundingClientRect());
    if (!$('guide-pop').hidden && guideFrom) guidePop.place(guideFrom.getBoundingClientRect());
    for (const [p, id, popId] of footPops) if (!$(popId).hidden) p.popover.place($(id).getBoundingClientRect());
  }, { passive: true });
  $('nuke').addEventListener('click', async () => {
    const step = +$('data-row').dataset.step;
    if (step === 0) setNukeStep(1);
    else if (step === 1) setNukeStep(2);
    else if (step === 2) {
      setNukeStep(3);
      await clearAllData();
      toast('All tracked time was deleted');
      setTimeout(() => { if ($('data-row').dataset.step === '3') setNukeStep(0); }, 1500);
    }
  });
  $('nuke-cancel').addEventListener('click', () => { setNukeStep(0); $('nuke').focus({ preventScroll: true }); });
  $('set-startup').addEventListener('change', async e => {
    const want = e.target.checked;
    const s = await window.memoir?.request('startup.set', { on: want }).catch(() => null);
    showStartup(s ? !!s.on : !want);
    if (s) toast(s.on ? 'Memoir starts with Windows' : 'Memoir won’t start with Windows');
  });
  $('link-rows').addEventListener('click', e => {
    const btn = e.target.closest('.link-btn');
    if (!btn) return;
    if (linkPop.isOpen) closeLink();
    else pressLink(btn.closest('.link-row').dataset.key, btn);
  });
  $('link-more').addEventListener('click', e => (guidePop.isOpen ? closeGuide() : openGuide(e.currentTarget)));
  $('guide-pop').addEventListener('click', e => { if (e.target.closest('[data-close]')) { closeGuide(); guideFrom?.focus({ preventScroll: true }); } });
  $('link-pop').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    $('link-btn').focus({ preventScroll: true });
    if (b.dataset.mode) linkWith(b.dataset.mode);
    else closeLink();
  });

  $('try-demo').addEventListener('click', () => enterDemo());
  $('exit-demo').addEventListener('click', () => exitDemo(true));

  // settings: cursor, sample week, tutorial, and the way out of a locked limit
  $('set-rainbow').addEventListener('change', async e => {
    const on = e.target.checked;
    setRainbow(on);
    toast(on ? 'Rainbow clock on' : 'Rainbow clock off');
    state.settings = await saveAppearance({ rainbow: on }); // the toolbar icon and a linked Memoir follow
  });
  $('set-cursor').addEventListener('change', e => {
    setCursorPref(e.target.checked);
    saveAppearance({ cursor: e.target.checked }).then(s => { state.settings = s; });
    lockSmooth();
    toast(e.target.checked ? 'Custom cursor on' : 'Using your system cursor');
  });
  // locked: the switch doesn't move, it shakes its head (only the switch, not the row)
  $('set-smooth').addEventListener('click', e => {
    if (e.target.getAttribute('aria-disabled') !== 'true') return;
    e.preventDefault();
    const sw = e.target.closest('.switch');
    if (reducedMotion() || sw._nudge?.playState === 'running') return;
    sw._nudge = sw.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(1.5px)' }, { transform: 'translateX(0)' },
    ], { duration: 420, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' });
  });
  $('set-smooth').addEventListener('change', e => {
    setCursorSmooth(e.target.checked);
    saveAppearance({ cursorSmooth: e.target.checked }).then(s => { state.settings = s; });
    toast(e.target.checked ? 'Smooth cursor on' : 'Smooth cursor off');
  });
  $('set-demo').addEventListener('change', e => {
    if (e.target.checked) enterDemo();
    else exitDemo(true);
  });
  $('replay-tour').addEventListener('click', () => {
    closeSettings();
    setTimeout(() => startTour(), reducedMotion() ? 0 : 380);
  });
  $('limit-reset').addEventListener('click', e => openResetGauntlet(e.currentTarget));
}

async function addExcluded(site) {
  const list = state.settings.excluded;
  if (list.includes(site)) { toast(`${site} is already private`); return true; }
  state.settings = await updateSettings({ excluded: [...list, site] });
  renderExcluded(site);
  const n = await withData(() => anonymizeSites([site]));
  toast(n ? `${site} won’t be tracked; its past time is now Private` : `${site} won’t be tracked`);
  // repaint the report once the chip has landed, not while it's still moving
  setTimeout(() => render({ soft: true }), reducedMotion() ? 0 : 600);
  return true;
}

// Toast text, with the name set in its face (as everywhere in Settings, where toasts come from).
function brand(el, text) {
  el.replaceChildren(...text.split(/(Memoir)/).map(part => {
    if (part !== 'Memoir') return part;
    const name = document.createElement('span');
    name.className = 'wordmark-plain';
    name.textContent = part;
    return name;
  }));
}

// A message at the bottom. It rises in, and sinks away after a while. A new one while it's
// up (or on its way out) doesn't blink: the pill morphs to the new words' size while the
// old words fade up and away and the new ones fade in. Every move starts from wherever the
// last one had got to (read off the running animations), so clicks as fast as you like
// never make it jump. The words only wrap where the finished pill would (CSS), never
// because the pill is still growing.
let toastTimer = 0;
const TOAST_UP = { opacity: 1, transform: 'translateY(0px) scale(1)' };
const TOAST_DOWN = { opacity: 0, transform: 'translateY(14px) scale(0.96)' };
const TOAST_POP = 'cubic-bezier(0.32, 1.24, 0.5, 1)'; // --pop

function toast(text, hold = 2600) {
  const t = $('toast');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, hold);
  const words = document.createElement('span');
  words.className = 'toast-words';
  brand(words, text);
  if (reducedMotion()) {
    t.getAnimations({ subtree: true }).forEach(a => a.cancel());
    t.replaceChildren(words);
    Object.assign(t.style, TOAST_UP);
    t._up = true;
    return;
  }
  const cs = getComputedStyle(t);
  const now = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'translateY(0px) scale(1)' : cs.transform };
  const from = { width: cs.width, height: cs.height };
  const old = t.querySelector('.toast-words:not(.out)');
  t._size?.cancel();
  t._size = null;
  if (old && +now.opacity > 0.02) {
    // the old words stay where they are, as they wrap now, and fade up and away
    const ws = getComputedStyle(old);
    old.style.width = ws.width; // exactly, not rounded: a hair narrower and its last word would wrap
    old.classList.add('out');
    old.setAttribute('aria-hidden', 'true');
    old.getAnimations().forEach(a => a.cancel());
    old.animate([{ opacity: ws.opacity, transform: ws.transform === 'none' ? 'translateY(0px)' : ws.transform }, { opacity: 0, transform: 'translateY(-6px)' }],
      { duration: 180, easing: EASE_OUT, fill: 'forwards' }).finished.then(() => old.remove(), () => {});
    // at high speed, only the newest of the leaving words are kept
    const gone = [...t.querySelectorAll('.toast-words.out')];
    gone.slice(0, -2).forEach(el => el.remove());
    t.appendChild(words);
    const to = { width: cs.width, height: cs.height };
    if (from.width !== to.width || from.height !== to.height) {
      t._size = t.animate([from, to], { duration: 380, easing: EASE_OUT });
    }
    words.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 300, delay: 60, easing: EASE_OUT, fill: 'backwards' });
  } else {
    // nothing showing (or all but gone): just the new words, at their own size
    t.replaceChildren(words);
  }
  if (!t._up || +now.opacity < 1) {
    t._move?.cancel();
    t._move = t.animate([now, TOAST_UP], { duration: 420, easing: TOAST_POP, fill: 'forwards' });
  }
  t._up = true;
}

function hideToast() {
  const t = $('toast');
  if (!t._up) return;
  t._up = false;
  if (reducedMotion()) {
    t.replaceChildren();
    Object.assign(t.style, TOAST_DOWN);
    return;
  }
  const cs = getComputedStyle(t);
  const now = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'translateY(0px) scale(1)' : cs.transform };
  t._move?.cancel();
  const a = t.animate([now, TOAST_DOWN], { duration: 300, easing: EASE_OUT, fill: 'forwards' });
  t._move = a;
  // once it's gone, so is what it said (a new one then starts afresh)
  a.finished.then(() => { if (t._move === a) t.replaceChildren(); }, () => {});
}

// Accepts an export from any version of Browser Screen Time or Memoir, the Windows app's included.
// Names from a file must look exactly like the ones the tracker writes: no built-in object names,
// no markup, nothing a page address couldn't produce (cleanDay and siteKey, shared/core.js).
// Reads an export into clean records, or null when the file isn't one.
async function readImport(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { return null; }
  const data = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? json.data : json;
  if (!data || typeof data !== 'object') return null;
  const days = {};
  const categories = {};
  const origins = {};
  const apps = {};
  const limits = new Map(); // the limit history: from (a day) → limit (ms, or null: none from that day)
  const today = dayKey(new Date());
  for (const [k, v] of Object.entries(data)) {
    if (/^day:\d{4}-\d{2}-\d{2}$/.test(k)) {
      const day = cleanDay(v);
      if (day) days[k] = day;
    } else if (k === 'categories' && v && typeof v === 'object') {
      for (const [d, cat] of Object.entries(v)) if (CATEGORY_BY_ID[cat] && !isPrivate(d) && siteKey(d) !== null) categories[d] = cat;
    } else if (k === 'origins' && v && typeof v === 'object') {
      for (const [d, origin] of Object.entries(v)) if (typeof origin === 'string' && /^https?:\/\/[^/]+$/.test(origin) && !isPrivate(d) && siteKey(d) !== null) origins[d] = origin;
    } else if (k === 'apps' && v && typeof v === 'object') {
      // Windows apps: a name, a category and the file name of an icon Memoir for Windows saved
      for (const [d, app] of Object.entries(v)) {
        if (!isApp(d) || !app || typeof app.name !== 'string') continue;
        apps[d] = { name: app.name.slice(0, 160), category: CATEGORY_BY_ID[app.category] ? app.category : 'other', icon: /^[a-f0-9]{24}\.png$/.test(app.icon || '') ? app.icon : null };
      }
    } else if (k === 'goal' && v && Array.isArray(v.history)) {
      // past and current limits: a real day (none still to come), and a limit Memoir could have set
      for (const e of v.history) {
        if (!e || typeof e.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.from) || e.from > today) continue;
        if (e.limit === null) limits.set(e.from, null);
        else if (Number.isFinite(e.limit)) limits.set(e.from, Math.round(Math.min(GOAL_MAX_MS, Math.max(GOAL_MIN_MS, e.limit))));
      }
    }
  }
  if (!Object.keys(days).length) return null;
  const goal = [...limits].map(([from, limit]) => ({ from, limit })).sort((a, b) => (a.from < b.from ? -1 : 1));
  // files from before page links were saved (no format number) are brought up to date
  const format = json && Number.isInteger(json.format) ? json.format : 1;
  return { days, categories, origins, apps, goal, old: format < EXPORT_FORMAT };
}

// Runs under the data lock, so the tracker can't save in between.
async function writeImport({ days, categories, origins, apps = {}, goal = [] }, mode) {
  const keys = Object.keys(days);
  const raw = await chrome.storage.local.get([...keys, 'categories', 'origins', 'apps']);
  const patch = {};
  for (const k of keys) patch[k] = mode === 'merge' && raw[k] ? mergeDay(normalizeDay(raw[k]), days[k]) : days[k];
  if (Object.keys(categories).length) patch.categories = { ...(raw.categories || {}), ...categories };
  if (Object.keys(origins).length) patch.origins = { ...(raw.origins || {}), ...origins };
  if (Object.keys(apps).length) patch.apps = { ...(raw.apps || {}), ...apps };
  // Limits: with none here yet, the file's whole history comes back, its current limit too (committed, so
  // locked as usual). With a history here, the file only fills the days before it begins: an import can
  // never change today's limit, so it's no way around a locked one.
  const here = await getGoalHistory();
  const earlier = here.length ? goal.filter(e => e.from < here[0].from) : goal;
  if (earlier.length) patch.goal = { history: [...earlier, ...here] };
  await chrome.storage.local.set(patch);
  if (patch.categories) state.overrides = patch.categories;
  if (state.settings.excluded.length) await anonymizeSites(state.settings.excluded);
  return { days: keys.length, limits: !!patch.goal };
}

// Merge or replace: a popover that grows out of the Import button.
let importAnswer = null;
function askImportMode(count) {
  answerImport(null, true);
  $('ip-text').innerHTML = `<b>${count} day${count === 1 ? '' : 's'}</b> in this file also ${count === 1 ? 'has' : 'have'} time in <span class="wordmark-plain">Memoir</span>. Every other day is added either way.`;
  return new Promise(resolve => {
    importAnswer = resolve;
    importPop.open($('import'));
    $('import-pop').querySelector('[data-mode="merge"]').focus({ preventScroll: true });
  });
}
function answerImport(mode, instant = false) {
  const resolve = importAnswer;
  importAnswer = null;
  if (!$('import-pop').hidden) importPop.close({ instant });
  if (resolve) resolve(mode);
}

// ----- the author's name and the wordmark in Settings (their popovers: shared/mail-pop.js) -----

function closeFootPops(instant = false) { for (const [p] of footPops) p.close(instant); }

async function enterDemo() {
  if (state.demo) return;
  state.demo = true;
  state.demoOverrides = {};
  $('demo-banner').hidden = false;
  showPaused();
  $('set-demo').checked = true;
  if (state.view.type !== 'week') resetView({ instant: true });
  await render({ direction: 'next' });
}

// ---------- tour ----------

let touring = false;
// the week the tour walks through: this week, on sample data (sample mode stays off)
function useTourWeek() {
  state.demo = true;
  state.demoOverrides = {};
  state.weekStart = startOfWeek(new Date());
  showPaused();
}

// prepared: the board already shows the tour's week (first visit, from the welcome)
// link: Memoir for Windows' own short tour, for the first browser linked with it (its device), on your own week
async function startTour({ prepared = false, handoff = null, link = null } = {}) {
  if (touring) return;
  touring = true;
  closeSettings();
  closeCatPop(true);
  closeCatMenu(true);
  tip.hide();
  const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? 0 : ms));
  // afterwards, back to exactly how things were (from the welcome: the real week)
  const before = prepared
    ? { demo: false, weekStart: startOfWeek(new Date()), demoOverrides: {} }
    : { demo: state.demo, weekStart: state.weekStart, demoOverrides: state.demoOverrides };
  // menus and popovers opened from the tour sit above it
  document.body.classList.add('touring');
  const popZ = catPop.z;
  catPop.z = 5190;
  if (link) {
    // your own week, this week: what the link brought in is in it
    state.demo = false;
    state.demoOverrides = {};
    state.weekStart = startOfWeek(new Date());
    resetView({ instant: true });
    await render({});
  } else if (!prepared) {
    const wasEmpty = $('board').classList.contains('is-empty');
    useTourWeek();
    resetView({ instant: true });
    await render({});
    // from an empty week the board fills in card by card first
    if (wasEmpty) await wait(900);
  }

  const q = sel => document.querySelector(sel);
  const row = sel => q(sel) && q(sel).closest('.p-row');
  const block = sel => q(sel) && q(sel).closest('.p-block');
  const chart = () => q('#chart-card');

  // "Try…" items: each watches for the thing it asks for and calls done()
  const listen = (type, test) => done => {
    const h = e => { if (e.target instanceof Element && test(e)) done(); };
    document.addEventListener(type, h, true);
    return () => document.removeEventListener(type, h, true);
  };
  // a click on sel; ok() is checked a moment later, once the click has done its thing
  const onClick = (sel, ok = () => true) => done => {
    const h = e => {
      if (e.target instanceof Element && e.target.closest(sel)) setTimeout(() => { if (ok()) done(); }, 80);
    };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  };
  const onHover = sel => listen('pointerover', e => !!e.target.closest(sel));
  // the Settings button pulled down and let go (pull-close.js). While this watches, a pull springs back instead of
  // closing, and the button shows how once the light is on it.
  const onPulled = done => {
    const hint = on => document.dispatchEvent(new CustomEvent('memoir:pull-hint', { detail: on }));
    document.documentElement.dataset.pullTour = '';
    const shown = setTimeout(() => hint(true), reducedMotion() ? 0 : 700);
    const h = () => done();
    document.addEventListener('memoir:pulled', h);
    return () => { clearTimeout(shown); document.removeEventListener('memoir:pulled', h); delete document.documentElement.dataset.pullTour; hint(false); };
  };
  const onScroll = sel => listen('scroll', e => !!e.target.closest(sel));
  const onChange = sel => listen('change', e => !!e.target.closest(sel));
  // any of several
  const either = (...watches) => done => {
    const offs = watches.map(w => w(done));
    return () => offs.forEach(off => off());
  };
  // a site added to Never track (one that wasn't there when the step began)
  const onNewSite = done => {
    const had = new Set(state.settings.excluded);
    const mo = new MutationObserver(() => { if (state.settings.excluded.some(s => !had.has(s))) done(); });
    mo.observe($('ex-list'), { childList: true });
    return () => mo.disconnect();
  };

  const toWeek = async () => { if (state.view.type !== 'week') goHome(); };
  const thisWeek = async () => {
    const ws = startOfWeek(new Date());
    if (+state.weekStart !== +ws) await goToWeek(ws, 'next');
  };
  // the day and hour steps show whatever the person opened themselves; only if
  // nothing is open does the tour pick one (Wednesday, then its busiest hour)
  const toDay = async () => {
    if (state.view.type === 'day') return;
    const d = state.view.day != null ? state.view.day : 2;
    resetView({ instant: true });
    openView({ type: 'day', day: d, origin: { kind: 'col', i: d } }, cols[d] && cols[d].label);
  };
  const busiestHour = d => {
    const h = state.summary && state.summary.days[d] ? state.summary.days[d].h : [];
    let best = 21;
    for (let i = 0; i < h.length; i++) if (h[i] > (h[best] || 0)) best = i;
    return best;
  };
  const toHour = async (live = () => true) => {
    if (state.view.type === 'hour') return;
    await toDay();
    await new Promise(r => setTimeout(r, reducedMotion() ? 0 : 450));
    if (!live()) return; // already moved on to another step
    const d = state.view.day;
    const h = busiestHour(d);
    openView({ type: 'hour', day: d, hour: h, origin: { kind: 'hcol', h } }, q(`#detail-view .dv:not(.leaving) .hcol[data-h="${h}"]`));
  };
  const tidy = () => { closeCatPop(true); closePagePop(true); closeCatMenu(true); tip.hide(); };
  // a part of Settings: open the panel and bring that part into view
  const toSettings = sel => async () => {
    tidy();
    if (!$('settings').classList.contains('open')) {
      openSettings();
      await wait(450);
    }
    const t = q(sel);
    if (t) t.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const noSettings = async () => { tidy(); closeSettings(); };
  // a day, an hour or the trend that a try opened in Daily activity: lit too, so it's seen
  const chartOpen = () => (state.view.type !== 'week' ? chart() : null);
  // a limit can be tried in the tour only when none is locked in already
  const canTryLimit = !limitLocked(state.goalHistory, dayKey(new Date()));
  // Most used's Apps | Browsers, when there are both (Memoir for Windows, or linked with it)
  const kinds = !$('kind').hidden;
  const kindsText = kinds ? ' <b>Apps</b> and <b>Browsers</b> are the same minutes seen two ways: your apps, a browser among them with all its time, or the websites in it.' : '';
  // with the switch, in the order the list allows: Browsers first (its websites have pages to open), then back
  const withKinds = (category, row) => (kinds ? [
    { text: 'Switch to <b>Browsers</b>', watch: onClick('#kind [data-kind="sites"]') },
    { ...row, text: 'Click a website’s row to see the time on each of its pages' },
    category,
    { text: 'Then back to <b>Apps</b>', watch: onClick('#kind [data-kind="apps"]') },
  ] : [category, row]);

  const steps = [
    { title: 'Your weeks', text: 'Click <b>‹</b> or <b>›</b> to step back through your weeks, or forward again once you’ve stepped back. The <b>←</b> and <b>→</b> keys work too. This is a <b>sample week</b>, so nothing is saved.', target: () => [q('.week-nav'), q('.week-range-wrap')], before: toWeek, settle: 0, radius: 12,
      // here the arrow keys change the week, as they do on the page; from the next step on they're the tour's
      arrows: dir => { const b = q(dir < 0 ? '#prev-week' : '#next-week'); if (b && !b.disabled) b.click(); },
      tasks: [
      { text: 'Click <b>‹</b> to see the week before', watch: onClick('#prev-week') },
      { text: 'Then <b>›</b> to come back', watch: onClick('#next-week') },
    ] },
    { title: 'Daily average', text: 'Your average screen time, compared with last week’s.', target: () => [q('.summary .caption'), q('#stat-avg'), q('#trend-btn')], follow: () => (state.view.type === 'trend' ? chart() : null), before: thisWeek, radius: 14, below: true,
      // the buttons go to the top, and the card under the trend's left edge, only once it's open
      flip: () => state.view.type === 'trend', alignTo: () => (state.view.type === 'trend' ? chart() : null), tasks: [
      { text: 'Click <b>the change from last week</b> to open Trend over time', watch: onClick('#trend-btn', () => state.view.type === 'trend') },
    ] },
    { title: 'Highlights', text: 'What your week looked like, in words. <b>Bold words are buttons.</b>', target: () => q('#story'), follow: chartOpen, before: async () => { tidy(); await toWeek(); }, settle: 0, radius: 14,
      // beside the words, so a category's sites can drop down under them; under the light
      // only once a bold day or hour has opened in the chart
      below: () => state.view.type !== 'week', tasks: [
      { text: 'Try a bold <b>day</b> or <b>hour</b> to open it', watch: onClick('#story [data-act="day"], #story [data-act="hour"]') },
      { text: 'Try a bold <b>category</b> to see what’s in it', watch: onClick('#story [data-act="cat"]') },
    ] },
    { title: 'Today’s limit', text: 'Set a limit and you’ll have to commit to it. You’ll get a notification before you hit it.', target: () => q('#goal-card'), before: tidy, settle: 0, tasks: canTryLimit ? [
      { text: 'Tap <b>Set limit</b> to try it out (you don’t have to set one; just tap the button)', watch: onClick('#goal-card .gr-set') },
    ] : undefined },
    { title: 'Daily activity', text: 'Each day, stacked by category, with your average and limit lines.', target: chart, before: toWeek, tasks: [
      { text: 'Click a day to open it', watch: onClick('#chart-card', () => state.view.type === 'day'), advance: true },
    ] },
    { title: 'A day up close', text: 'Every hour of the day and every app and website in it. <b>Back</b> returns to the week.', target: chart, before: toDay, settle: 800, tasks: [
      { text: 'Step to another day with <b>‹ ›</b>', watch: onClick('#step-prev, #step-next') },
      { text: 'Click an hour to open it', watch: onClick('#detail-view', () => state.view.type === 'hour'), advance: true },
    ] },
    { title: 'An hour up close', text: 'Which apps and websites filled the hour, and the same hour on the other days. <b>Back</b> goes one step; the round <b>«</b> goes all the way home.', target: chart, before: toHour, settle: 900, autoNext: true, tasks: [
      { text: 'Walk hour by hour with <b>‹ ›</b>', watch: onClick('#step-prev, #step-next', () => state.view.type === 'hour') },
      { text: 'Press <b>«</b> to go all the way home', watch: onClick('#chart-home') },
    ] },
    { title: 'Activity by hour', text: 'When you use your computer, square by square. The outline shows what’s open right now.', target: () => q('#heat-card'), follow: chartOpen, before: tidy, settle: 0, tasks: [
      { text: 'Click any square to open that hour', watch: onClick('#heat-card .cell') },
      { text: 'Click a day’s name for the whole day', watch: onClick('#heat-card .heat-day') },
    ] },
    { title: 'Categories', text: 'Where the time went, by kind of app or website. <b>Week</b> shows the whole week; <b>Day</b> shows one day: today, or the day you’ve opened in Daily activity.', target: () => q('.donut-card'), before: toWeek, settle: 500, tasks: [
      { text: 'Hover over a slice to light it up across the page', watch: onHover('.donut-card .donut-seg, .donut-card .cat-legend button') },
      { text: 'Click it to see what’s in it', watch: onClick('.donut-card .donut-seg, .donut-card .cat-legend button') },
      { text: 'Switch to <b>Week</b>, then back to <b>Day</b>', watch: onClick('#scope [data-scope="day"]', () => state.scope === 'day' && scopeTried) },
    ] },
    { title: 'Most used', text: 'Every app and website you used is listed here, with page and window titles too if you turn them on later in Settings.' + kindsText, target: () => q('.sites-card'), before: noSettings, settle: 0, tasks: withKinds(
      { text: 'Click a category to move that app or website (or never track it)', watch: onClick('.sites-card .cat-btn') },
      { text: 'Click a row to see the time on each page or window', watch: onClick('.sites-card .site.has-pages', () => pages.isOpen) },
    ) },
    { title: 'Settings', text: '', target: () => ($('settings').classList.contains('open') ? q('#settings-panel') : q('#settings-btn')), before: noSettings, settle: 0, radius: 22, pad: 6, tasks: [
      { text: 'Click the gear to open Settings', watch: onClick('#settings-btn', () => $('settings').classList.contains('open')) },
    ] },
    { title: 'Appearance', text: '<b>System</b> picks your theme automatically, or pick Light or Dark. <b>Rainbow clock</b> puts the clock in rainbow colours, in support of the LGBTQ+ community.', target: () => block('#appearance'), before: toSettings('#appearance'), settle: 350, radius: 14, tasks: [
      { text: 'Try another theme', watch: onClick('#appearance button') },
    ] },
    { title: 'Cursor', text: 'Turning it on gives you <span class="wordmark wm-in">Memoir</span>’s custom, modern-looking cursor. <b>Smooth cursor</b> makes your cursor move smoothly.', target: () => block('#set-cursor'), before: toSettings('#set-smooth'), settle: 350, radius: 14, tasks: [
      { text: 'Switch <b>Custom cursor</b> off, then on again, to compare', watch: onChange('#set-cursor') },
      { text: 'Try <b>Smooth cursor</b>', watch: onChange('#set-smooth') },
    ] },
    { title: 'What gets tracked', text: '<b>Page titles</b> also keeps window titles, so you can see which pages and windows took the time. Turning off <b>Track screen time</b> pauses tracking, and <b>Start with Windows</b> opens Memoir quietly when you sign in. Type a website into <b>Never track</b> and it will never be tracked, unless you remove it.', target: () => [block('#detail'), block('#ex-form')], before: toSettings('#ex-form'), settle: 350, radius: 14, tasks: [
      { text: 'Switch <b>Tracking detail</b>', watch: onClick('#detail button[aria-pressed="false"]') },
      { text: 'Add a website to <b>Never track</b>', watch: onNewSite },
    ] },
    { title: 'Weekly recap', text: 'A reminder on the day and at the time you choose, with your week ready to look at.', target: () => block('#set-reminder'), before: toSettings('#set-reminder'), settle: 350, radius: 14, tasks: [
      ...(state.settings.weeklyReminder ? [] : [{ text: 'Switch the reminder on', watch: onChange('#set-reminder') }]),
      { text: 'Pick another day', watch: onClick('#rem-days .day-chip[aria-checked="false"]') },
      { text: 'Change the time', watch: either(onChange('#rem-h, #rem-m'), onClick('#rem-ampm'), listen('keydown', e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !!e.target.closest('#rem-h, #rem-m'))) },
    ] },
    { title: 'Your limit and history', text: 'A committed limit can only be undone here. <b>Keep history</b> sets how long days are kept.', target: () => [row('#limit-reset'), block('#retention')], before: toSettings('#retention'), settle: 350, radius: 14 },
    { title: 'Sample week, tour and data', text: 'Look around with made-up data, replay this tour, read <b>how Memoir works</b>, link <b>Memoir in your browsers</b> (its <b>Guide</b> shows how), and <b>Export</b> or <b>Import</b> your history. The <b>Clear all</b> button asks twice before deleting your data.', target: () => [block('#set-demo'), block('#data-row')], before: toSettings('#data-row'), settle: 350, radius: 14 },
    { title: 'Pull to close', text: 'Memoir has no title bar. Pull the gear down and let go to close it (or press Alt+F4): it keeps counting in the notification area. Pull it up for full screen (or press F11). Leave the mouse by the gear for a moment and it shows you how. (Here in the tour, closing springs back.)', target: () => [q('#settings-btn'), q('.pull-label'), q('.pull-track')], live: true, rest: () => [q('#settings'), q('.pull-track')], before: noSettings, settle: 0, radius: 22, pad: 6, tasks: [
      { text: 'Pull the gear down and let go', watch: onPulled },
    ] },
    { kicker: 'All set', title: 'That’s the tour', text: 'Your own week fills in as you use your computer. Click the clock in the notification area for today at a glance, or double-click it to come back to Memoir.', before: async () => { await noSettings(); await toWeek(); }, settle: 300 },
  ];
  await runTour(link ? await linkSteps() : steps, {
    handoff,
    // popovers and menus a try opened stay in sight
    avoid: () => [...document.querySelectorAll('.pop:not([hidden]), .menu:not([hidden])')].filter(el => el.dataset.state !== 'closing'),
  });
  if (link) chrome.storage.local.set({ linkTour: { shown: Date.now() } });
  else chrome.storage.local.set({ onboarded: true });
  document.body.classList.remove('touring');
  catPop.z = popZ;
  closeSettings();
  tidy();
  // back to exactly how things were
  state.demo = before.demo;
  state.weekStart = before.weekStart;
  state.demoOverrides = before.demoOverrides;
  showPaused();
  resetView({ instant: true });
  await render({});
  touring = false;
  maybeLinkTour();

  // Memoir for Windows, the first browser linked with it: what linking does, on your own week
  async function linkSteps() {
    const { sync } = await chrome.storage.local.get('sync');
    const p = sync && sync.peers && sync.peers[link];
    const name = p ? namePeers([{ device: link, ...p }])[0].label : 'your browser';
    const inBrowser = p ? `Memoir in ${name}` : 'Memoir in your browser';
    return [
      { kicker: 'Linked', title: `${inBrowser} is linked`, text: `This app and ${inBrowser} now share one week, on this computer only: its websites come in here, and your apps go there. It shows here in <b>Your data</b>.`, target: () => q('#link-rows'), before: toSettings('#link-rows'), settle: 450, radius: 14 },
      { title: 'Apps and Browsers', text: `<b>Apps</b> lists your apps, ${name} among them with all its time. <b>Browsers</b> lists the websites you used in it. They’re the same minutes seen two ways, so they’re never added together.`, target: () => q('.sites-card'), before: noSettings, settle: 300,
        tasks: !$('kind').hidden ? [
          { text: 'Switch to <b>Browsers</b>', watch: onClick('#kind [data-kind="sites"]') },
          { text: 'And back to <b>Apps</b>', watch: onClick('#kind [data-kind="apps"]') },
        ] : undefined },
      { title: 'Each minute once', text: `Your daily average, your limit, the categories and every hour count the time in ${name} once, whichever side saw it.`, target: () => [q('.summary .caption'), q('#stat-avg')], before: toWeek, settle: 0, radius: 14, below: true },
      { title: 'One set of rules', text: 'Never track, page titles, Keep history, your limit, the weekly reminder, categories and Appearance follow whichever side changed them last. <b>Clear all</b> on either side clears both; <b>Unlink</b> leaves both what they have.', target: () => q('#link-rows') && q('#link-rows').closest('.p-block'), before: toSettings('#data-row'), settle: 350, radius: 14 },
      { kicker: 'All set', title: 'You’re linked', text: 'Using another browser too? Add Memoir to it and press <b>Link</b> there. <b>Connect another browser</b>, under the rows here, shows how.', before: async () => { await noSettings(); await toWeek(); }, settle: 300 },
    ];
  }
}

// Memoir for Windows: the first browser linked with it brings a short tour of what linking does (the app comes to the
// front for it: src/MainForm.cs). After the welcome and any other tour, and only once.
async function maybeLinkTour() {
  if (!window.memoir?.windows || touring || document.querySelector('.wel')) return;
  const { linkTour, onboarded } = await chrome.storage.local.get(['linkTour', 'onboarded']);
  if (!onboarded || !linkTour || !linkTour.pending || linkTour.shown) return;
  setTimeout(() => { if (!touring) startTour({ link: linkTour.pending }); }, reducedMotion() ? 0 : 700);
}

// Leaving the sample week: the pill melts into the gear like a drop of liquid
// glass. The drop is two round caps and a middle, so the capsule never distorts:
// its right end reaches the gear first, the rest follows, thinning as it's
// pulled, flowing in underneath the gear. The gear moves on the same clock: it
// swells as the drop pours in, bulges a little while filling, turns once (a full
// turn, so it ends exactly as it began) and settles. Only transforms run (the compositor's), so the re-render
// happening alongside can't make it stutter.
function meltPill() {
  const pill = $('demo-banner');
  const gear = $('settings-btn');
  if (reducedMotion() || pill.hidden || $('settings').classList.contains('open')) return false;
  const a = pill.getBoundingClientRect();
  const g = gear.getBoundingClientRect();
  if (!a.width || !g.width) return false;

  const layer = document.createElement('div');
  layer.className = 'melt';
  layer.setAttribute('aria-hidden', 'true');
  // the words stay where they were and fade, slipping toward the gear
  const words = pill.cloneNode(true);
  words.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  words.removeAttribute('id');
  words.hidden = false;
  words.classList.add('melt-words');
  Object.assign(words.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  const capL = document.createElement('i');
  const mid = document.createElement('i');
  const capR = document.createElement('i');
  capL.className = capR.className = 'melt-cap';
  mid.className = 'melt-mid';
  // the pill's soft shadow, which fades as the drop sets off (the gear has none)
  const shade = document.createElement('i');
  shade.className = 'melt-shade';
  Object.assign(shade.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  layer.append(shade, mid, capL, capR, words);
  // inside the header, just under the gear, so the drop pours in beneath it
  document.querySelector('.head').appendChild(layer);

  const B = 40; // the caps' and middle's drawn size; scaled to the drop's height
  const L0 = a.left, R0 = a.right, Lg = g.left, Rg = g.right;
  const cy0 = a.top + a.height / 2, cy1 = g.top + g.height / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fL = [], fM = [], fR = [];
  const N = 36;
  for (let n = 0; n <= N; n++) {
    const t = n / N;
    const xR = R0 + (Rg - R0) * easeOut(Math.min(1, t / 0.5));
    const xL = L0 + (Lg - L0) * easeInOut(t);
    const D = (a.height + (g.height - a.height) * t) * (1 - 0.14 * Math.sin(Math.PI * t));
    const cy = cy0 + (cy1 - cy0) * t;
    const y = (cy - D / 2).toFixed(2);
    const k = (D / B).toFixed(4);
    fL.push({ transform: `translate(${xL.toFixed(2)}px, ${y}px) scale(${k})`, offset: t });
    fR.push({ transform: `translate(${Math.max(xL, xR - D).toFixed(2)}px, ${y}px) scale(${k})`, offset: t });
    fM.push({ transform: `translate(${(xL + D / 2).toFixed(2)}px, ${y}px) scale(${(Math.max(0, xR - xL - D) / 100).toFixed(4)}, ${k})`, offset: t });
  }
  const MELT = 640;
  const timing = { duration: MELT, easing: 'linear', fill: 'forwards' };
  const drop = [capL.animate(fL, timing), mid.animate(fM, timing), capR.animate(fR, timing)];

  // the gear, on the same clock: it swells with what has poured in (the drop's
  // left end is how far the pour has got), bulges while filling, then settles
  const TOTAL = 1000;
  const fG = [];
  const fI = [];
  const M = 50;
  for (let n = 0; n <= M; n++) {
    const tau = (n / M) * TOTAL;
    const t = Math.min(1, tau / MELT);
    const poured = easeInOut(t);
    const swell = tau <= MELT ? 0.13 * poured : 0.13 * (1 - easeInOut((tau - MELT) / (TOTAL - MELT)));
    const bulge = tau <= MELT ? Math.sin(Math.PI * t) : 0;
    const sx = 1 + swell + 0.035 * bulge;
    const sy = 1 + swell - 0.03 * bulge;
    fG.push({ scale: `${sx.toFixed(4)} ${sy.toFixed(4)}`, offset: n / M });
    // one full turn, driven by the pour: starts with it and coasts to a stop just after
    fI.push({ rotate: `${(360 * easeInOut(Math.min(1, tau / 880))).toFixed(2)}deg`, offset: n / M });
  }
  gear.animate(fG, { duration: TOTAL, easing: 'linear' });
  const icon = gear.querySelector('.g-gear');
  if (icon) icon.animate(fI, { duration: TOTAL, easing: 'linear' });
  words.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(14px) scale(0.92)' }],
    { duration: 220, easing: EASE_OUT, fill: 'forwards' });
  shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  // all poured in (and hidden under the swollen gear): the drop goes
  drop[0].finished.then(() => layer.remove(), () => layer.remove());
  return true;
}

function exitDemo(rerender) {
  const melting = meltPill();
  state.demo = false;
  $('demo-banner').hidden = true;
  showPaused();
  $('set-demo').checked = false;
  state.weekStart = startOfWeek(new Date());
  history.replaceState(null, '', location.pathname);
  if (state.view.type !== 'week') resetView({ instant: true });
  if (!rerender) return;
  // the melt gets going first (it runs on the compositor from then on), then the
  // heavier re-render, so the drop never waits on it
  if (melting) requestAnimationFrame(() => requestAnimationFrame(() => { if (!state.demo) render({ direction: 'prev' }); }));
  else render({ direction: 'prev' });
}

// In a background tab nothing is drawn: every tab switch the tracker records is
// folded into one set of changes, applied once when the report is looked at again.
const hiddenChanges = { local: null, session: null };
function applyHiddenChanges() {
  if (document.hidden) return;
  goalTick();
  for (const area of ['session', 'local']) {
    const changes = hiddenChanges[area];
    hiddenChanges[area] = null;
    if (changes) onStorageChanged(changes, area);
  }
}

function onStorageChanged(changes, area) {
  if (document.hidden && area in hiddenChanges) {
    const into = hiddenChanges[area] || (hiddenChanges[area] = {});
    for (const [k, c] of Object.entries(changes)) into[k] = { oldValue: k in into ? into[k].oldValue : c.oldValue, newValue: c.newValue };
    return;
  }
  if (area === 'session') {
    if (changes.linkLive) { linkUi.live = changes.linkLive.newValue || null; renderLink(); }
    if (changes.session) { state.session = changes.session.newValue || null; updateGoal(); }
    return;
  }
  if (area !== 'local') return;
  if (changes.link || changes.sync) loadLink();
  if (changes.sync || changes.updateDismissed) renderUpdate();
  if (changes.linkTour) maybeLinkTour();
  if (changes.settings) {
    state.settings = { ...state.settings, ...(changes.settings.newValue || {}) };
    // Appearance changed in a linked Memoir
    if (adoptAppearance(changes.settings.newValue)) updateAppearanceUI();
    showPaused();
    if ($('settings').classList.contains('open')) renderSettings();
    else $('set-tracking').checked = !state.settings.paused;
  }
  if (changes.goal) getGoalHistory().then(h => { state.goalHistory = h; updateGoal(); renderLimitRow(); if (!state.demo) render({ soft: true }); });
  if (changes.goalTrial) { state.goalTrial = changes.goalTrial.newValue || null; renderLimitRow(); }
  if (changes.origins) setOrigins(changes.origins.newValue || {});
  // a day as shown is this side's own merged with a linked Memoir's: either changing redraws it
  const dates = new Set(Object.keys(changes).map(recordDate).filter(Boolean));
  if (dates.has(state.todayKey) || changes.linkPeers) getDays([state.todayKey]).then(d => { state.todayRec = d[state.todayKey]; updateGoal(); });
  if (changes.apps || changes.appIcons) chrome.storage.local.get(['apps', 'appIcons']).then(r => { setApps(r.apps, r.appIcons); if (!state.demo) refreshSoon(); });
  if (state.demo) return;
  if (changes.linkPeers || changes.favicons || weekDayKeys(state.weekStart).some(k => dates.has(k))) refreshSoon();
}

// New time saved for the week shown: redraw in a moment, but never under a menu or a
// popover (shown, or still on its way in or out), which it would rebuild from under
// them; it waits until they've gone instead.
function refreshSoon(ms = 1500) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    if (document.hidden) return;
    if (!$('cat-menu').hidden || !$('cat-pop').hidden || !$('page-pop').hidden) { refreshSoon(1000); return; }
    render({ soft: true });
  }, ms);
}

// ---------- sample week ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const SAMPLE_SITES = [
  ['youtube.com', 'video', 1.0], ['instagram.com', 'social', 0.7], ['github.com', 'work', 0.75],
  ['docs.google.com', 'work', 0.6], ['mail.google.com', 'work', 0.35], ['reddit.com', 'social', 0.45],
  ['netflix.com', 'video', 0.4], ['chatgpt.com', 'work', 0.45], ['figma.com', 'work', 0.4],
  ['shopee.vn', 'shopping', 0.3], ['vnexpress.net', 'news', 0.3], ['duolingo.com', 'learning', 0.2],
  ['wikipedia.org', 'learning', 0.25], ['pinterest.com', 'social', 0.22], ['spotify.com', 'video', 0.15],
  ['chess.com', 'games', 0.22], ['notion.so', 'work', 0.3], ['facebook.com', 'social', 0.4],
];
// Memoir for Windows' sample week has apps too (named here, as the app would have them), and its websites in Chrome
const SAMPLE_BROWSER = 'app:chrome.exe';
const SAMPLE_APPS = [
  ['app:code.exe', 'work', 1.0, 'Visual Studio Code'], ['app:winword.exe', 'work', 0.6, 'Microsoft Word'], ['app:spotify.exe', 'video', 0.5, 'Spotify'],
  ['app:photoshop.exe', 'work', 0.35, 'Adobe Photoshop'], ['app:discord.exe', 'social', 0.45, 'Discord'], ['app:explorer.exe', 'other', 0.3, 'File Explorer'],
  ['app:steam.exe', 'games', 0.3, 'Steam'],
];
if (window.memoir?.windows) {
  // under the app's own: desktop-bridge.js keeps them there each time it reads the apps, so a fresh install
  // (no apps of its own yet) still names them
  const sample = {};
  for (const [key, category, , name] of [...SAMPLE_APPS, [SAMPLE_BROWSER, 'other', 0, 'Google Chrome']]) sample[key] = { name, category, icon: null };
  window.memoir.sampleApps = sample;
  window.memoir.apps = { ...sample, ...window.memoir.apps };
}
const SAMPLE_TITLES = {
  'youtube.com': ['Lo-fi beats to study to', 'How pasta is made', 'Tiny desk concert', 'A day in Kyoto'],
  'github.com': ['Pull request #128 · memoir', 'Issues · memoir', 'README.md'],
  'docs.google.com': ['Weekly plan', 'Essay draft', 'Budget 2026'],
  'reddit.com': ['r/webdev', 'r/cats', 'r/chrome_extensions'],
  'chatgpt.com': ['Recipe ideas', 'Explain CSS grid', 'Trip planning'],
  'netflix.com': ['Home', 'Watching: a mystery series'],
  'wikipedia.org': ['Hourglass', 'Cherry blossom', 'Memoir'],
};
// where a sample page title leads: a search for it, an article, or the site itself
function sampleUrl(domain, title) {
  const q = encodeURIComponent(title);
  if (domain === 'youtube.com') return `https://www.youtube.com/results?search_query=${q}`;
  if (domain === 'wikipedia.org') return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  if (domain === 'reddit.com' && title.startsWith('r/')) return `https://www.reddit.com/${title}/`;
  return `https://${domain}/`;
}
const WEEKDAY_HOURS = [0.15, 0.05, 0, 0, 0, 0, 0.05, 0.3, 0.6, 0.9, 1, 0.9, 0.6, 0.8, 0.9, 0.85, 0.7, 0.5, 0.45, 0.7, 0.95, 1, 0.8, 0.4];
const WEEKEND_HOURS = [0.4, 0.2, 0.05, 0, 0, 0, 0, 0.05, 0.2, 0.5, 0.8, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5, 0.5, 0.6, 0.9, 1, 1, 0.9, 0.6];
function boost(cat, hour, weekend) {
  const work = !weekend && hour >= 9 && hour < 18;
  const night = hour >= 20 || hour < 2;
  switch (cat) {
    case 'work': return work ? 3 : weekend ? 0.25 : 0.6;
    case 'learning': return work ? 1.2 : 0.8;
    case 'video': return night ? 2.6 : work ? 0.35 : 1.2;
    case 'social': return night ? 1.6 : work ? 0.5 : 1.3;
    case 'games': return night ? 1.4 : 0.4;
    case 'shopping': return weekend ? 1.6 : 0.7;
    default: return 1;
  }
}
// A sample day is the same every time for its date, so each is made once and kept.
const samples = new Map();
function sampleDay(key) {
  let day = samples.get(key);
  if (!day) samples.set(key, (day = makeSampleDay(key)));
  return day;
}

// The tour's sample weeks, made ahead (behind the welcome): this week, last week and
// the trend's range, a fortnight at a time so the page keeps breathing.
async function warmSamples(report = () => {}) {
  const start = startOfWeek(new Date());
  const keys = [];
  for (let w = 0; w <= state.trendWeeks; w++) keys.push(...weekDayKeys(addDays(start, -7 * w)));
  for (let i = 0; i < keys.length; i += 14) {
    keys.slice(i, i + 14).forEach(sampleDay);
    report(Math.min(1, (i + 14) / keys.length));
    await new Promise(r => setTimeout(r, 0));
  }
}

function makeSampleDay(key) {
  const rnd = mulberry32(hashStr(`bloom:${key}`));
  const date = dateFromKey(key);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const totalMin = weekend ? 190 + rnd() * 150 : 140 + rnd() * 140;
  const weights = (weekend ? WEEKEND_HOURS : WEEKDAY_HOURS).map(p => p * (0.55 + rnd() * 0.9));
  const wsum = sum(weights);
  const day = { s: {}, h: new Array(24).fill(0), hs: {}, ti: {}, th: {}, tu: {}, tp: [] };
  weights.forEach((w, hour) => {
    const minutes = (totalMin * w) / wsum;
    if (minutes < 1) return;
    const ms = Math.round(minutes * 60_000);
    const pool = SAMPLE_SITES.map(([d, c, base]) => ({ d, w: base * boost(c, hour, weekend) * (0.5 + rnd()) }));
    const n = 1 + Math.floor(rnd() * 3);
    const picks = [];
    for (let k = 0; k < n && pool.length; k++) {
      const total = sum(pool.map(p => p.w));
      let x = rnd() * total;
      let idx = 0;
      while (idx < pool.length - 1 && x > pool[idx].w) { x -= pool[idx].w; idx++; }
      picks.push(pool.splice(idx, 1)[0].d);
    }
    // Memoir for Windows: part of the hour in apps, the rest in the browser, its sites filed under it too
    let browsing = ms;
    if (window.memoir?.windows) {
      const appMs = Math.round(ms * (hour >= 9 && hour < 18 && !weekend ? 0.55 : 0.35) * (0.7 + rnd() * 0.6));
      browsing = ms - appMs;
      const pool = SAMPLE_APPS.map(([d, c, base]) => ({ d, w: base * boost(c, hour, weekend) * (0.5 + rnd()) }));
      const total = sum(pool.map(p => p.w));
      let x = rnd() * total, idx = 0;
      while (idx < pool.length - 1 && x > pool[idx].w) { x -= pool[idx].w; idx++; }
      const app = pool[idx].d;
      (day.hs[hour] || (day.hs[hour] = {}))[app] = appMs;
      day.s[app] = (day.s[app] || 0) + appMs;
      day.hs[hour][SAMPLE_BROWSER] = browsing;
      day.s[SAMPLE_BROWSER] = (day.s[SAMPLE_BROWSER] || 0) + browsing;
    }
    const shares = picks.map(() => 0.4 + rnd());
    const ssum = sum(shares);
    let used = 0;
    const slot = day.hs[hour] || (day.hs[hour] = {});
    picks.forEach((d, i) => {
      const part = i === picks.length - 1 ? browsing - used : Math.round((browsing * shares[i]) / ssum);
      used += part;
      day.s[d] = (day.s[d] || 0) + part;
      slot[d] = (slot[d] || 0) + part;
      const titles = SAMPLE_TITLES[d];
      if (titles) {
        const t = titles[Math.floor(rnd() * titles.length)];
        const pages = day.ti[d] || (day.ti[d] = {});
        pages[t] = (pages[t] || 0) + part;
        (day.tu[d] || (day.tu[d] = {}))[t] = sampleUrl(d, t);
        const byHour = (day.th[hour] || (day.th[hour] = {}))[d] || (day.th[hour][d] = {});
        byHour[t] = (byHour[t] || 0) + part;
      }
    });
    day.h[hour] = ms;
  });
  return day;
}
