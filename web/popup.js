import {
  CATEGORIES, CATEGORY_BY_ID, isPrivate, categorize, dayKey, addDays, getDays, normalizeDay,
  getSettings, updateSettings, getCategoryOverrides, getSession, unsavedMs, getOrigins,
  formatDuration, formatClock, storageKeyForDay, dayTotal,
  getGoalHistory, limitOn, limitLocked, commitLimit, removeLimit,
} from './shared/core.js';
import {
  animateNumber, reveal, faviconTile, tween, slicePath, initPetals, setOrigins, siteLinkHtml, replay, reducedMotion, POP, makeScroller, initSmoothScrolling,
} from './shared/fx.js';
import { watchTheme } from './shared/theme.js';
import { createGoalRing, openPicker } from './shared/goal.js';
import { initCursor } from './shared/cursor.js';
import { initContextMenu } from './shared/context-menu.js';

const $ = id => document.getElementById(id);
const sumValues = o => Object.values(o).reduce((a, b) => a + b, 0);
const R_IN = 44;
const R_OUT = 56;
const TAU = Math.PI * 2;
const GAP = 3 / 50;

const GLYPH_PAUSE = '<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const GLYPH_IDLE = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const state = {
  todayKey: dayKey(new Date()),
  today: normalizeDay(null),
  overrides: {},
  session: null,
  paused: false,
  avg: 0,
  liveReady: false,
  nowMode: '',
  goalHistory: [],
  goalKey: '',
  legendRows: 3,
};

let ring = null;

main();

async function main() {
  await window.memoir.ready;
  initSmoothScrolling();
  initCursor({ edge: true });
  watchTheme();
  initPetals(6, [8, 13]);
  $('today-label').textContent = `Today, ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;

  // Nudge the tracker to save; the popup adds unsaved seconds itself, so it never waits.
  chrome.runtime.sendMessage({ type: 'sync' }).catch(() => {});

  const pastKeys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), -(i + 1))));
  const [days, settings, overrides, session, origins, history] = await Promise.all([
    getDays([state.todayKey, ...pastKeys]),
    getSettings(),
    getCategoryOverrides(),
    getSession(),
    getOrigins(),
    getGoalHistory(),
  ]);
  state.today = days[state.todayKey];
  state.overrides = overrides;
  state.session = session;
  state.paused = settings.paused;
  state.goalHistory = history;
  setOrigins(origins);
  const past = pastKeys.map(k => dayTotal(days[k])).filter(v => v > 60_000);
  state.avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;

  ring = createGoalRing($('goal-mini'), { variant: 'mini' });
  render();
  wire();
  reveal();

  setTimeout(() => { state.liveReady = true; }, 1400);
  setInterval(tick, 1000);
  chrome.storage.onChanged.addListener(onStorage);
}

// Today's time per site, including the seconds the tracker hasn't saved yet.
function liveSites() {
  const sites = { ...state.today.s };
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
  renderNow(false);
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
  const privText = priv >= 60_000 ? `+ ${formatDuration(priv)} on private sites` : '';
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

function renderLegend(cats, total, rows = 3) {
  const ul = $('legend');
  ul.textContent = '';
  const top = CATEGORIES.filter(c => cats[c.id]).sort((a, b) => cats[b.id] - cats[a.id]).slice(0, rows);
  if (!top.length) { ul.innerHTML = '<li class="none"><span class="name">No browsing yet today</span></li>'; return; }
  for (const cat of top) {
    const li = document.createElement('li');
    li.dataset.cat = cat.id;
    li.title = cat.label;
    if (cat.id === hoverCat) li.classList.add('on');
    li.innerHTML = `<span class="dot" style="--c:${cat.color}"></span><span class="name">${cat.short}</span><b>${Math.round((cats[cat.id] / total) * 100)}%</b>`;
    ul.appendChild(li);
  }
}

// Only redraws when what's shown actually changes (the heartbeat updates the
// session every minute, which must not replay the animation).
function renderNow(animate) {
  const s = state.session;
  const mode = state.paused ? 'paused' : s ? `live:${s.domain}` : 'idle';
  if (mode === state.nowMode) return;
  if (!state.nowMode) animate = false;
  state.nowMode = mode;

  const icon = $('now-icon');
  icon.textContent = '';
  icon.classList.toggle('live', mode.startsWith('live'));
  if (mode === 'paused') {
    icon.innerHTML = `<span class="now-glyph">${GLYPH_PAUSE}</span>`;
    $('now-eyebrow').textContent = 'Paused';
    $('now-domain').textContent = 'Tracking is off';
    $('now-timer').textContent = '';
  } else if (s) {
    const priv = isPrivate(s.domain);
    const cat = CATEGORY_BY_ID[categorize(s.domain, state.overrides)];
    icon.appendChild(faviconTile(s.domain, cat.color));
    $('now-eyebrow').textContent = 'Now';
    $('now-domain').textContent = priv ? 'Private activity' : s.domain.startsWith('app:') ? window.memoir.appName(s.domain) : s.domain;
    $('now-timer').textContent = formatClock(Date.now() - s.since);
  } else {
    icon.innerHTML = `<span class="now-glyph">${GLYPH_IDLE}</span>`;
    $('now-eyebrow').textContent = 'Now';
    $('now-domain').textContent = 'No active app or website';
    $('now-timer').textContent = '';
  }
  if (animate) {
    for (const el of [icon, $('now-eyebrow').parentElement, $('now-timer')]) replay(el, 'swap-in');
  }
}

function renderSites(visible) {
  const list = $('site-list');
  const entries = Object.entries(visible).filter(([, ms]) => ms >= 1000).sort((a, b) => b[1] - a[1]);
  $('site-count').textContent = entries.length ? `${entries.length} site${entries.length === 1 ? '' : 's'}` : '';
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
    li.title = `${domain} · ${cat.label}`;

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
  if (state.liveReady && !hoverCat) {
    const el = $('today-total');
    el._value = total;
    const text = formatDuration(total);
    if (el.textContent !== text) el.textContent = text;
  }
  renderCompare(all, priv);
  const rows = priv >= 60_000 ? 2 : 3;
  if (rows !== state.legendRows) {
    state.legendRows = rows;
    renderLegend(categoryTotals(visible), total, rows);
  }
  updateGoal(all);
  const s = state.session;
  if (s && !state.paused) {
    $('now-timer').textContent = formatClock(Date.now() - s.since);
    if (!isPrivate(s.domain)) {
      const row = $('site-list').querySelector(`[data-domain="${CSS.escape(s.domain)}"] .site-time`);
      if (row) row.textContent = formatDuration(visible[s.domain] || 0, { seconds: true });
    }
  }
}

function onStorage(changes, area) {
  if (area === 'session' && changes.session) {
    state.session = changes.session.newValue || null;
    renderNow(true);
  }
  if (area !== 'local') return;
  const key = storageKeyForDay(state.todayKey);
  if (changes[key]) state.today = normalizeDay(changes[key].newValue);
  if (changes.categories) state.overrides = changes.categories.newValue || {};
  if (changes.origins) setOrigins(changes.origins.newValue || {});
  if (changes.goal) {
    getGoalHistory().then(h => { state.goalHistory = h; updateGoal(split(liveSites()).all); });
  }
  if (changes.settings) {
    const paused = !!(changes.settings.newValue && changes.settings.newValue.paused);
    if (paused !== state.paused) {
      state.paused = paused;
      $('track-toggle').checked = !paused;
      $('switch-wrap').title = paused ? 'Tracking is paused' : 'Tracking is on';
      renderNow(true);
    }
  }
}

// ---------- interactions ----------

let swapTimer = 0;
let hoverCat = null;
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
  const ringSvg = document.querySelector('.ring');
  ringSvg.classList.toggle('focus', !!id);
  for (const seg of ringSvg.querySelectorAll('.ring-seg')) seg.classList.toggle('on', seg.dataset.cat === id);
  const legend = $('legend');
  legend.classList.toggle('focus', !!id);
  for (const li of legend.children) li.classList.toggle('on', li.dataset.cat === id);
  const { visible } = split(liveSites());
  const totals = categoryTotals(visible);
  if (id) setCenter(formatDuration(totals[id] || 0), CATEGORY_BY_ID[id].short);
  else setCenter(formatDuration(sumValues(visible)), 'today');
}

function wire() {
  const toggle = $('track-toggle');
  initContextMenu({
    getItems: ({ target }) => target.closest('.pk-layer') ? [] : [
      { label: 'Weekly report', icon: 'report', action: () => $('open-week').click() },
      { label: state.paused ? 'Resume tracking' : 'Pause tracking', icon: state.paused ? 'play' : 'pause', action: () => toggle.click() },
    ],
  });
  toggle.checked = !state.paused;
  $('switch-wrap').title = state.paused ? 'Tracking is paused' : 'Tracking is on';
  toggle.addEventListener('change', async () => {
    const on = toggle.checked;
    state.paused = !on;
    $('switch-wrap').title = on ? 'Tracking is on' : 'Tracking is paused';
    if (!on) renderNow(true);
    await updateSettings({ paused: !on });
    try { await chrome.runtime.sendMessage({ type: 'sync' }); } catch { /* ignore */ }
    const [session, days] = await Promise.all([getSession(), getDays([state.todayKey])]);
    state.session = session;
    state.today = days[state.todayKey];
    renderNow(true);
  });

  const hero = document.querySelector('.hero');
  hero.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-cat]');
    focusCat(el ? el.dataset.cat : null);
  });
  hero.addEventListener('pointerleave', () => focusCat(null));

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
