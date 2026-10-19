import {
  CATEGORIES, CATEGORY_BY_ID, isPrivate, siteName, categorize, dayKey, addDays, getDays, normalizeDay,
  getSettings, updateSettings, getCategoryOverrides, getSession, unsavedMs, getOrigins,
  formatDuration, storageKeyForDay, dayTotal, dayParts,
  getGoalHistory, limitOn, limitLocked, commitLimit, removeLimit, setApps, recordDate,
} from './shared/core.js';
import {
  animateNumber, reveal, faviconTile, tween, slicePath, setOrigins, siteLinkHtml, replay, reducedMotion, POP, EASE_OUT, makeScroller, initSmoothScrolling, disableTitleTooltips, MorphPopover,
} from './shared/fx.js';
import { watchTheme } from './shared/theme.js';
import { createGoalRing, openPicker } from './shared/goal.js';
import { initCursor } from './shared/cursor.js';
import { initContextMenu } from './shared/context-menu.js';
import { playLogo } from './shared/logo.js';
import { playOverShow } from './shared/overshow.js';

const $ = id => document.getElementById(id);
const sumValues = o => Object.values(o).reduce((a, b) => a + b, 0);
const R_IN = 44;
const R_OUT = 56;
const TAU = Math.PI * 2;
const GAP = 3 / 50;


// The first open's soft ring, three times: it starts as the button's own pill (hidden by
// it: the same colour) and grows 12px past it as it fades, the way a spreading shadow would
function pulseWeek() {
  const btn = $('open-week');
  btn.classList.add('pulse');
  if (reducedMotion()) return;
  const w = btn.offsetWidth, h = btn.offsetHeight;
  btn.animate([{ scale: `${w / (w + 24)} ${h / (h + 24)}`, opacity: 1 }, { scale: '1', opacity: 0 }],
    { duration: 1600, delay: 900, iterations: 3, easing: EASE_OUT, fill: 'both', pseudoElement: '::after' });
}

const state = {
  todayKey: dayKey(new Date()),
  today: normalizeDay(null),
  overrides: {},
  session: null,
  paused: false,
  avg: 0,
  liveReady: false,
  goalHistory: [],
  goalKey: '',
  legendRows: 3,
};

let ring = null;

main();

async function main() {
  await window.memoir.ready;
  initSmoothScrolling();
  disableTitleTooltips();
  initCursor({ edge: true });
  watchTheme();
  $('today-label').textContent = `Today, ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;

  // Nudge the tracker to save; the popup adds unsaved seconds itself, so it never waits.
  chrome.runtime.sendMessage({ type: 'sync' }).catch(() => {});

  const pastKeys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), -(i + 1))));
  const [days, settings, overrides, session, origins, history, { popupIntroduced, apps, appIcons }] = await Promise.all([
    getDays([state.todayKey, ...pastKeys]),
    getSettings(),
    getCategoryOverrides(),
    getSession(),
    getOrigins(),
    getGoalHistory(),
    chrome.storage.local.get(['popupIntroduced', 'apps', 'appIcons']),
  ]);
  setApps(apps, appIcons); // Windows apps' names, categories and icons, from a linked Memoir for Windows
  state.today = days[state.todayKey];
  state.overrides = overrides;
  state.session = session;
  state.paused = settings.paused;
  state.goalHistory = history;
  setOrigins(origins);
  const past = pastKeys.map(k => dayTotal(days[k])).filter(v => v > 60_000);
  state.avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;

  ring = createGoalRing($('goal-mini'), { variant: 'mini' });
  // the first time it opens: a line and a soft pulse on the way to the week, once
  if (!popupIntroduced) {
    $('week-tip').hidden = false;
    pulseWeek();
    chrome.storage.local.set({ popupIntroduced: true }).catch(() => {});
  }
  render();
  // over the limit: the flame's moment, set going before anything is drawn
  overShow();
  wire();
  reveal();
  playLogo(document.querySelector('.top-mark'), { delay: 160, live: true });

  setTimeout(() => { state.liveReady = true; }, 1400);
  setInterval(tick, 1000);
  chrome.storage.onChanged.addListener(onStorage);
}

// Today's time per site, including the seconds the tracker hasn't saved yet (each minute once: with Memoir for
// Windows, a browser and its sites are the same minutes)
function liveSites() {
  const sites = { ...dayParts(state.today) };
  const s = state.session;
  if (s && !state.paused) {
    const extra = unsavedMs(s);
    if (extra > 0) sites[s.domain] = (sites[s.domain] || 0) + extra;
  }
  return sites;
}

// Private (never-tracked) sites count toward the total and the limit, but
// never appear by name or category.
function split(sites) {
  const visible = {};
  let priv = 0;
  for (const [d, ms] of Object.entries(sites)) {
    if (isPrivate(d)) priv += ms;
    else visible[d] = ms;
  }
  return { visible, priv, all: sumValues(visible) + priv };
}

function categoryTotals(visible) {
  const totals = {};
  for (const [domain, ms] of Object.entries(visible)) {
    const cat = categorize(domain, state.overrides);
    totals[cat] = (totals[cat] || 0) + ms;
  }
  return totals;
}

// ---------- rendering ----------

function render() {
  const { visible, priv, all } = split(liveSites());
  const total = sumValues(visible);
  const cats = categoryTotals(visible);

  animateNumber($('today-total'), total, { format: v => formatDuration(v), delay: 200, duration: 1100 });
  renderCompare(all, priv);
  drawRing(cats, total);
  // the private-sites line takes the third legend row's place
  state.legendRows = priv >= 60_000 ? 2 : 3;
  renderLegend(cats, total, state.legendRows);
  renderSites(visible);
  updateGoal(all, true);
}

function renderCompare(all, priv) {
  const el = $('compare');
  let text;
  if (state.avg > 0) {
    const diff = all - state.avg;
    text = diff >= 0
      ? `${formatDuration(diff)} above your daily average`
      : `${formatDuration(-diff)} below your daily average`;
  } else {
    text = 'Your daily average appears after a few days';
  }
  const privText = priv >= 60_000 ? `+ ${formatDuration(priv)} of private activity` : '';
  if (el.dataset.text === text && el.dataset.priv === privText) return;
  el.dataset.text = text;
  el.dataset.priv = privText;
  el.textContent = text;
  if (privText) {
    const p = document.createElement('span');
    p.className = 'priv';
    p.textContent = privText;
    el.appendChild(p);
  }
}

function drawRing(cats, total) {
  const g = $('ring-segs');
  g.textContent = '';
  if (!total) return;
  const segs = [];
  let acc = 0;
  for (const cat of CATEGORIES) {
    const ms = cats[cat.id];
    if (!ms) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'ring-seg');
    path.setAttribute('fill-rule', 'evenodd');
    path.style.fill = cat.color;
    path.dataset.cat = cat.id;
    g.appendChild(path);
    segs.push({ path, start: acc, frac: ms / total });
    acc += ms / total;
  }
  const single = segs.length === 1;
  // sweeps in clockwise, one category after another
  tween(1250, p => {
    for (const s of segs) {
      const shown = Math.max(0, Math.min(p - s.start, s.frac));
      let d = '';
      if (single && p >= 1) d = slicePath(60, 60, R_IN, R_OUT, 0, TAU, 4);
      else if (shown > 0) {
        d = slicePath(60, 60, R_IN, R_OUT, s.start * TAU + (single ? 0 : GAP / 2), (s.start + shown) * TAU - (single ? 0 : GAP / 2), 4);
      }
      s.path.setAttribute('d', d);
    }
  }, { delay: 220 });
  $('ring-label').textContent = `Today so far: ${formatDuration(total)}. ` +
    CATEGORIES.filter(c => cats[c.id]).map(c => `${c.label} ${formatDuration(cats[c.id])}`).join(', ');
}

// Every category of the day, most first; more than fit scroll. Rebuilt only when which
// categories there are changes (so a scroll isn't lost); the shares update in place.
function renderLegend(cats, total, rows = 3) {
  const ul = $('legend');
  const present = CATEGORIES.filter(c => cats[c.id]).sort((a, b) => cats[b.id] - cats[a.id]);
  const share = id => `${Math.round((cats[id] / total) * 100)}%`;
  const key = present.map(c => c.id).sort().join(',');
  if (ul.dataset.key === key && ul.dataset.rows === String(rows)) {
    for (const li of ul.querySelectorAll('[data-cat]')) li.querySelector('b').textContent = share(li.dataset.cat);
    return;
  }
  ul.dataset.key = key;
  ul.dataset.rows = String(rows);
  ul.textContent = '';
  if (!present.length) {
    ul.innerHTML = '<li class="none"><span class="name">No screen time yet today</span></li>';
  } else {
    for (const cat of present) {
      const li = document.createElement('li');
      li.dataset.cat = cat.id;
      li.title = cat.label;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-haspopup', 'dialog');
      li.setAttribute('aria-expanded', String(cat.id === popCat));
      li.classList.toggle('on', cat.id === hoverCat);
      li.innerHTML = `<span class="dot" style="--c:${cat.color}"></span><span class="name">${cat.short}</span><b>${share(cat.id)}</b>`;
      ul.appendChild(li);
    }
  }
  // as many rows as there's room for, the rest scroll
  const sc = makeScroller(ul);
  const first = ul.firstElementChild;
  const gap = parseFloat(getComputedStyle(ul).rowGap) || 0;
  ul.parentElement.style.maxHeight = first ? `${rows * (first.offsetHeight + gap) - gap}px` : '';
  sc.update();
}

// Only redraws when what's shown actually changes (the heartbeat updates the
// session every minute, which must not replay the animation).
function renderSites(visible) {
  const list = $('site-list');
  const entries = Object.entries(visible).filter(([, ms]) => ms >= 1000).sort((a, b) => b[1] - a[1]);
  $('site-count').textContent = entries.length ? `${entries.length} used` : '';
  list.textContent = '';
  $('sites-empty').hidden = entries.length > 0;
  list.hidden = entries.length === 0;

  makeScroller(list);
  // every site today; the list scrolls when there are more than fit
  const top = entries.slice(0, 40);
  const max = top.length ? top[0][1] : 1;
  top.forEach(([domain, ms], i) => {
    const cat = CATEGORY_BY_ID[categorize(domain, state.overrides)];
    const li = document.createElement('li');
    li.className = 'site-row';
    li.style.setProperty('--i', Math.min(i, 8));
    li.dataset.domain = domain;
    li.title = `${siteName(domain)} · ${cat.label}`;

    const main = document.createElement('div');
    main.className = 'site-main';
    const name = document.createElement('span');
    name.className = 'site-name';
    name.innerHTML = siteLinkHtml(domain);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.setProperty('--c', cat.color);
    fill.style.setProperty('--d', `${320 + Math.min(i, 8) * 50}ms`);
    bar.appendChild(fill);
    main.append(name, bar);

    const time = document.createElement('span');
    time.className = 'site-time';
    time.textContent = formatDuration(ms, { seconds: true });

    li.append(faviconTile(domain, cat.color), main, time);
    list.appendChild(li);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.setProperty('--w', `${Math.max(3, (ms / max) * 100).toFixed(2)}%`);
    }));
  });
}

// ---------- daily limit ----------

// Over the limit, the ring's flame takes the stage as the popup opens, then flies home.
function overShow() {
  const limit = limitOn(state.goalHistory, state.todayKey);
  const used = split(liveSites()).all;
  if (!limit || used <= limit) return;
  playOverShow({ flame: document.querySelector('#goal-mini .gr-flame'), overMs: used - limit, limitMs: limit });
}

function updateGoal(all, initial = false) {
  const limit = limitOn(state.goalHistory, state.todayKey);
  const locked = limitLocked(state.goalHistory, state.todayKey);
  const level = ring.update({ used: all, limit, locked });
  const row = $('goal-row');
  row.dataset.level = level;
  $('goal-action').dataset.locked = String(locked);
  const btn = $('goal-set');
  btn.textContent = limit ? 'Change' : 'Set limit';
  btn.tabIndex = locked ? -1 : 0;

  let main;
  let sub;
  if (!limit) {
    main = 'No daily limit';
    sub = 'Get a nudge when you reach it';
  } else if (level === 'over') {
    main = `${formatDuration(all - limit)} over`;
    sub = `your ${formatDuration(limit)} daily limit`;
  } else {
    main = `${formatDuration(limit - all)} left`;
    sub = `of your ${formatDuration(limit)} daily limit`;
  }
  const key = `${level}|${!!limit}|${locked}`;
  const text = $('goal-row').querySelector('.goal-text');
  if ($('goal-main').textContent !== main) $('goal-main').textContent = main;
  if ($('goal-sub').textContent !== sub) $('goal-sub').textContent = sub;
  // a new state (set, locked, over…) announces itself; ticking minutes don't
  if (!initial && state.goalKey && key !== state.goalKey) replay(text, 'swap');
  state.goalKey = key;
}

async function openGoal() {
  if (limitLocked(state.goalHistory, state.todayKey)) return;
  const limit = limitOn(state.goalHistory, state.todayKey);
  const result = await openPicker({
    fromEl: $('goal-set'),
    returnTo: ring.el,
    center: { x: innerWidth / 2, y: innerHeight / 2 },
    size: 300,
    initialMs: limit || 0,
    canRemove: !!limit,
    onCommit: async ms => {
      const saved = await commitLimit(ms);
      state.goalHistory = await getGoalHistory();
      updateGoal(split(liveSites()).all);
      return saved;
    },
    onRemove: async () => {
      await removeLimit();
      state.goalHistory = await getGoalHistory();
      updateGoal(split(liveSites()).all);
    },
  });
  // a small press-and-release on the row once the circle has shrunk back into it
  if ((result === 'commit' || result === 'remove') && !reducedMotion()) {
    $('goal-row').animate([{ transform: 'scale(0.97)' }, { transform: 'none' }], { duration: 600, easing: POP });
  }
}

// ---------- live ----------

function tick() {
  const nowKey = dayKey(new Date());
  if (nowKey !== state.todayKey) {
    // midnight: start the new day from zero
    state.todayKey = nowKey;
    state.today = normalizeDay(null);
    getDays([nowKey]).then(d => { state.today = d[nowKey]; render(); });
    return;
  }
  const { visible, priv, all } = split(liveSites());
  const total = sumValues(visible);
  const cats = categoryTotals(visible);
  if (state.liveReady) {
    const el = $('today-total');
    const id = hoverCat;
    const v = id ? cats[id] || 0 : total;
    el._value = v;
    const text = formatDuration(v);
    if (el.textContent !== text && !$('ring-center').classList.contains('swapping')) el.textContent = text;
  }
  renderCompare(all, priv);
  state.legendRows = priv >= 60_000 ? 2 : 3;
  renderLegend(cats, total, state.legendRows);
  updateGoal(all);
  const s = state.session;
  if (s && !state.paused) {
    if (!isPrivate(s.domain)) {
      const row = $('site-list').querySelector(`[data-domain="${CSS.escape(s.domain)}"] .site-time`);
      if (row) row.textContent = formatDuration(visible[s.domain] || 0, { seconds: true });
    }
  }
}

function onStorage(changes, area) {
  if (area === 'session' && changes.session) {
    state.session = changes.session.newValue || null;
  }
  if (area !== 'local') return;
  // today as shown: this side's own merged with a linked Memoir's
  if (Object.keys(changes).some(k => recordDate(k) === state.todayKey) || changes.linkPeers) getDays([state.todayKey]).then(d => { state.today = d[state.todayKey]; });
  if (changes.apps || changes.appIcons) chrome.storage.local.get(['apps', 'appIcons']).then(r => setApps(r.apps, r.appIcons));
  if (changes.categories) state.overrides = changes.categories.newValue || {};
  if (changes.origins) setOrigins(changes.origins.newValue || {});
  if (changes.goal) {
    getGoalHistory().then(h => { state.goalHistory = h; updateGoal(split(liveSites()).all); });
  }
  if (changes.settings) {
    const paused = !!(changes.settings.newValue && changes.settings.newValue.paused);
    if (paused !== state.paused) {
      state.paused = paused;
      showResume(paused);
    }
  }
}

// ---------- interactions ----------

let swapTimer = 0;
// under the pointer: the ring's middle shows it
let hoverCat = null;
let centred = null;
function setCenter(totalText, subText) {
  const c = $('ring-center');
  clearTimeout(swapTimer);
  c.classList.add('swapping');
  swapTimer = setTimeout(() => {
    const t = $('today-total');
    cancelAnimationFrame(t._raf);
    t.textContent = totalText;
    $('ring-sub').textContent = subText;
    c.classList.remove('swapping');
  }, 130);
}

function focusCat(id) {
  if (hoverCat === id) return;
  hoverCat = id;
  showCat();
}

// ---------- a category's sites: grows out of the word or slice you clicked (as in the report) ----------

const catPop = new MorphPopover($('cat-pop'), { radius: 16 });
let popCat = null;

function openCatPop(catId, anchor) {
  if (popCat === catId && catPop.isOpen) { closeCatPop(); return; }
  const cat = CATEGORY_BY_ID[catId];
  if (!cat) return;
  const { visible } = split(liveSites());
  const total = sumValues(visible);
  const sites = Object.entries(visible).filter(([d, ms]) => ms >= 1000 && categorize(d, state.overrides) === catId).sort((a, b) => b[1] - a[1]);
  const mine = sites.reduce((n, [, ms]) => n + ms, 0);
  const el = $('cat-pop');
  el.innerHTML = `<div class="pop-head"><span class="pop-title"><span class="dot" style="--c:${cat.color}"></span>${cat.label}</span><span class="pop-meta num">${formatDuration(mine)} · ${total ? Math.round((mine / total) * 100) : 0}%</span></div>`;
  const list = document.createElement('ol');
  list.className = 'rows';
  const max = sites.length ? sites[0][1] : 1;
  sites.slice(0, 80).forEach(([domain, ms], i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.style.setProperty('--i', Math.min(i, 12));
    const w = Math.max(2, (ms / max) * 100).toFixed(2);
    li.innerHTML = `<div class="row-main"><span class="row-name">${siteLinkHtml(domain)}</span><span class="row-cat"><span class="dot" style="--c:${cat.color}"></span>${cat.label}</span></div>
      <span class="row-time">${formatDuration(ms, { seconds: true })}</span>
      <div class="row-bar"><i style="--c:${cat.color};--d:${260 + Math.min(i, 12) * 45}ms" data-w="${w}"></i></div>`;
    li.prepend(faviconTile(domain, cat.color));
    list.appendChild(li);
  });
  el.appendChild(list);
  makeScroller(list);
  setExpanded(catId);
  const wasOpen = catPop.isOpen;
  popCat = catId;
  const go = () => catPop.open(anchor, { fromRadius: anchor instanceof SVGElement ? 12 : 6 }).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const i of el.querySelectorAll('.row-bar i[data-w]')) i.style.setProperty('--w', `${i.dataset.w}%`);
    }));
  });
  if (wasOpen) catPop.close({ instant: true }).then(go);
  else go();
}

function closeCatPop() {
  if (!catPop.isOpen) return;
  popCat = null;
  setExpanded(null);
  catPop.close();
}

function setExpanded(id) {
  for (const li of $('legend').querySelectorAll('[data-cat]')) li.setAttribute('aria-expanded', String(li.dataset.cat === id));
}

// the ring, the legend and the ring's middle show the category under the pointer (or the day)
function showCat() {
  const id = hoverCat;
  const ringSvg = document.querySelector('.ring');
  ringSvg.classList.toggle('focus', !!id);
  for (const seg of ringSvg.querySelectorAll('.ring-seg')) seg.classList.toggle('on', seg.dataset.cat === id);
  const legend = $('legend');
  legend.classList.toggle('focus', !!id);
  for (const li of legend.querySelectorAll('[data-cat]')) li.classList.toggle('on', li.dataset.cat === id);
  if (id === centred) return;
  centred = id;
  const { visible } = split(liveSites());
  const totals = categoryTotals(visible);
  if (id) setCenter(formatDuration(totals[id] || 0), CATEGORY_BY_ID[id].short);
  else setCenter(formatDuration(sumValues(visible)), 'today');
}

// Tracking can be paused only from Settings in the report. While it is, the header holds a
// Resume button (it pops in, and fades away once tracking is back on).
function showResume(on, instant = false) {
  const b = $('resume');
  if (on === (!b.hidden && !b._leaving)) return;
  b.getAnimations().forEach(a => a.cancel());
  b._leaving = false;
  if (on) {
    b.hidden = false;
    if (!instant && !reducedMotion()) b.animate([{ opacity: 0, scale: '0.85' }, { opacity: 1, scale: '1' }], { duration: 320, easing: POP });
    return;
  }
  if (instant || reducedMotion()) { b.hidden = true; return; }
  b._leaving = true;
  b.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.85' }], { duration: 200, easing: EASE_OUT, fill: 'forwards' }).finished.then(() => {
    if (!b._leaving) return;
    b._leaving = false;
    b.hidden = true;
    b.getAnimations().forEach(a => a.cancel());
  }, () => {});
}

function wire() {
  const resume = $('resume');
  initContextMenu({
    getItems: ({ target }) => target.closest('.pk-layer') ? [] : [
      { label: 'Weekly report', icon: 'report', action: () => $('open-week').click() },
      // no pausing here (only Settings in the report pauses); resuming is fine
      ...(state.paused ? [{ label: 'Resume tracking', icon: 'play', action: () => resume.click() }] : []),
    ],
  });
  showResume(state.paused, true);
  resume.addEventListener('click', async () => {
    if (!state.paused) return;
    state.paused = false;
    showResume(false);
    await updateSettings({ paused: false });
    try { await chrome.runtime.sendMessage({ type: 'sync' }); } catch { /* ignore */ }
    const [session, days] = await Promise.all([getSession(), getDays([state.todayKey])]);
    state.session = session;
    state.today = days[state.todayKey];
  });

  const hero = document.querySelector('.hero');
  hero.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-cat]');
    focusCat(el ? el.dataset.cat : null);
  });
  hero.addEventListener('pointerleave', () => focusCat(null));
  // a category (in the legend or on the ring) opens its sites; again, or anywhere else, closes
  hero.addEventListener('click', e => {
    const el = e.target.closest('[data-cat]');
    if (el) openCatPop(el.dataset.cat, el);
  });
  hero.addEventListener('keydown', e => {
    const el = e.target.closest('.legend [data-cat]');
    if (!el || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    openCatPop(el.dataset.cat, el);
  });
  document.addEventListener('pointerdown', e => {
    if (catPop.isOpen && !e.target.closest('#cat-pop') && !e.target.closest('.hero [data-cat]')) closeCatPop();
  });
  // (Windows: its sites' links open in the browser, and Today stays open: it's a window, not a popup)

  $('goal-set').addEventListener('click', openGoal);

  $('open-week').addEventListener('click', () => {
    setTimeout(async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'openRecap' });
      } catch {
        await chrome.tabs.create({ url: chrome.runtime.getURL('recap.html') });
      }
    }, 140);
  });

}
