// Never track's apps (Memoir for Windows only; wired in recap.js, styled in app-picker.css): the field under "Never
// track these apps and websites" finds what you mean as you type. Under it (or over it, when there's no room under
// it), in the category menu's glass, grows a list of the apps on this computer (src/AppPicker.cs): with nothing typed,
// the ones used this week first, by their time, then the ones open now, then every other one, each with its own icon.
// Typing narrows it to the apps whose name or program file fits, best first, the letters that fit in bold; an address
// (youtube.com) or a program's file (spotify.exe) gets a row of its own at the top. The arrow keys or the pointer move
// one highlight that glides from row to row; Enter, a click or Add takes it, and its name flies down into its chip
// (recap.js exSubmit). "Choose an app…" at the foot opens Windows' own file dialog, for any other program or shortcut.
// The list is read when Settings opens, so it's there by the time you look, and read again after a minute; nothing
// about it is saved.
import { normalizeSite, isApp, escapeHtml, formatDuration } from './shared/core.js';
import { faviconTile, reducedMotion, animateHeight, makeScroller } from './shared/fx.js';

const FRESH_MS = 60_000;   // the list is read again once it's older than this
const GAP = 6;             // between the field and the list
const EDGE = 12;           // kept clear at the window's edges
const MAX_LIST = 300;      // the list's tallest; it scrolls past that
const MIN_ROOM = 190;      // less room than this under the field (and more over it): the list opens over it
const PAGE = 7;            // rows Page Up and Page Down move
const EXE = /^[^<>:"/\\|?*\x00-\x1f]+\.exe$/i;
const REFUSED = {
  memoir: 'That’s Memoir itself: its own time is always just Memoir',
  'store-host': 'That’s the window Windows runs Store apps in, not one app',
  'not-app': 'That isn’t an app',
};
const pretty = key => { const base = key.slice(4).replace(/\.exe$/i, ''); return base.charAt(0).toUpperCase() + base.slice(1); };

export function initAppPicker({ form, input, button, menu, excluded, weekTimes, choose, onNames, toast }) {
  const list = menu.querySelector('.xp-list');
  const browse = menu.querySelector('.xp-browse');
  const foot = menu.querySelector('.xp-foot');
  // Memoir's own slim slider and soft edges, as its other lists have, in place of Windows' scroll bar
  const scroller = makeScroller(list);
  // one highlight for every row, gliding between them (the foot's row lights by itself: it's outside the scroll)
  const hl = document.createElement('span');
  hl.className = 'xp-hl';
  hl.setAttribute('aria-hidden', 'true');
  const rows = new Map();   // kind|key -> its row, kept while Memoir runs, so the list never redraws a row it has
  const names = new Map();  // app key -> its name: from the list, and from what was chosen
  let apps = null;          // the list from Windows, or null until it's read
  let readAt = 0;
  let reading = null;
  let open = false;
  let shownOnce = false;    // rows that come in after the list first showed slide in
  let options = [];         // the rows that can be taken, in order; options.length stands for "Choose an app…"
  let active = -1;
  let seq = 0;

  // ----- the list, from Windows -----
  function read(force = false) {
    if (reading) return reading;
    if (apps && !force && performance.now() - readAt < FRESH_MS) return Promise.resolve(apps);
    reading = window.memoir.request('apps.list')
      .then(found => (Array.isArray(found) ? found.filter(a => a && isApp(a.key) && typeof a.name === 'string' && a.name.trim()) : []), () => apps || [])
      .then(found => {
        apps = found;
        readAt = performance.now();
        let renamed = false;
        for (const a of apps) if (names.get(a.key) !== a.name) { names.set(a.key, a.name); renamed = true; }
        if (renamed) onNames?.();
        if (open) render({ animate: true });
        return apps;
      })
      .finally(() => { reading = null; });
    return reading;
  }
  const nameOf = key => names.get(key) || window.memoir.apps?.[key]?.name || pretty(key);

  // ----- what fits what's typed -----
  function score(a, q, words) {
    const name = a.name.toLowerCase();
    const file = a.key.slice(4, -4);
    if (name === q || file === q) return 100;
    if (name.startsWith(q)) return 90;
    if (words.some(w => w.startsWith(q))) return 75;
    if (file.startsWith(q)) return 65;
    if (q.length >= 2 && words.map(w => w[0]).join('').startsWith(q)) return 55;   // initials: "vsc"
    if (name.includes(q)) return 40;
    if (file.includes(q)) return 30;
    return 0;
  }
  const wordsOf = name => name.toLowerCase().split(/[\s\-_.()&+]+/).filter(Boolean);
  // the letters that fit, in bold: at a word's start if they're there, else wherever they are
  function marked(name, q) {
    if (!q) return escapeHtml(name);
    const lower = name.toLowerCase();
    let i = -1;
    const word = new RegExp(`(^|[\\s\\-_.()&+])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(lower);
    if (word) i = word.index + word[1].length;
    else i = lower.indexOf(q);
    if (i < 0) return escapeHtml(name);
    return `${escapeHtml(name.slice(0, i))}<b>${escapeHtml(name.slice(i, i + q.length))}</b>${escapeHtml(name.slice(i + q.length))}`;
  }
  function timeMeta(ms) { return { meta: formatDuration(ms), metaKind: 'time' }; }
  function appOption(a, times) {
    const ms = times.get(a.key) || 0;
    return { kind: 'app', key: a.key, name: a.name, icon: a.icon, ...(ms ? timeMeta(ms) : a.open ? { meta: 'Open', metaKind: 'open' } : { meta: '', metaKind: '' }) };
  }
  // the list's entries, titles among them, for what's typed
  function build(typed) {
    const query = typed.trim();
    const q = query.toLowerCase();
    const hidden = new Set(excluded());
    const times = weekTimes();
    const pool = (apps || []).filter(a => !hidden.has(a.key));
    const out = [];
    if (!q) {
      const used = pool.filter(a => times.get(a.key) > 0).sort((a, b) => times.get(b.key) - times.get(a.key));
      const usedKeys = new Set(used.map(a => a.key));
      const openNow = pool.filter(a => a.open && !usedKeys.has(a.key));
      const rest = pool.filter(a => !usedKeys.has(a.key) && !a.open);
      const section = (title, group) => {
        if (!group.length) return;
        out.push({ kind: 'title', key: title, name: title });
        for (const a of group) out.push(appOption(a, times));
      };
      section('Used this week', used);
      section('Open now', openNow);
      section(used.length || openNow.length ? 'More apps' : 'Apps', rest);
      return out;
    }
    // an address, or a program's file, typed out
    const site = !EXE.test(query) && query.includes('.') ? normalizeSite(query) : null;
    if (site && !isApp(site)) out.push({ kind: 'site', key: site, name: site, meta: hidden.has(site) ? 'Already hidden' : 'Website', metaKind: '' });
    const rank = a => (times.get(a.key) ? 4 : 0) + (a.open ? 2 : 0) + (a.seen ? 1 : 0);
    const scored = [];
    for (const a of pool) { const s = score(a, q, wordsOf(a.name)); if (s) scored.push([a, s]); }
    scored.sort((x, y) => y[1] - x[1] || rank(y[0]) - rank(x[0]) || x[0].name.localeCompare(y[0].name));
    for (const [a] of scored) out.push(appOption(a, times));
    if (EXE.test(query)) {
      const key = `app:${q}`;
      if (!out.some(o => o.key === key)) out.push({ kind: 'exe', key, name: names.get(key) || pretty(key), meta: hidden.has(key) ? 'Already hidden' : query, metaKind: '' });
    }
    return out;
  }

  // ----- drawing it -----
  function iconFor(o) {
    // a website's own, an app's from Memoir's icons, or a letter; an app Windows gave a picture of, that picture
    if (o.kind === 'site' || !o.icon) return faviconTile(o.key);
    const tile = document.createElement('span');
    tile.className = 'favicon';
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => tile.replaceWith(faviconTile(o.key)), { once: true });
    img.src = o.icon;
    tile.append(img);
    return tile;
  }
  function rowFor(o, q) {
    const id = `${o.kind}|${o.key}`;
    let el = rows.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'menu-item xp-item';
      el.setAttribute('role', 'option');
      el.id = `xp-${++seq}`;
      const name = document.createElement('span');
      name.className = 'xp-name';
      const meta = document.createElement('span');
      meta.className = 'xp-meta';
      el.append(iconFor(o), name, meta);
      rows.set(id, el);
    }
    if (!el.isConnected && shownOnce && !reducedMotion()) {
      el.classList.remove('xp-new');
      void el.offsetWidth;
      el.classList.add('xp-new');
    }
    const html = marked(o.name, q);
    const name = el.querySelector('.xp-name');
    if (name.innerHTML !== html) name.innerHTML = html;
    const meta = el.querySelector('.xp-meta');
    meta.textContent = o.meta || '';
    meta.className = `xp-meta${o.metaKind ? ` is-${o.metaKind}` : ''}`;
    el.setAttribute('aria-label', o.kind === 'site' ? `Website ${o.name}` : o.name);
    return el;
  }
  function titleFor(text) {
    const p = document.createElement('p');
    p.className = 'menu-title xp-title';
    p.setAttribute('role', 'presentation');
    p.textContent = text;
    return p;
  }
  function skeleton() {
    return [0, 1, 2, 3].map(i => {
      const el = document.createElement('div');
      el.className = 'xp-skel';
      el.style.setProperty('--i', i);
      el.innerHTML = '<span class="xp-skel-icon"></span><span class="xp-skel-bar"></span>';
      return el;
    });
  }
  function emptyNote(query) {
    const p = document.createElement('p');
    p.className = 'xp-empty';
    p.innerHTML = query
      ? `No app called “${escapeHtml(query)}”.<br>A website goes in by its address, like youtube.com.`
      : 'No apps to show yet.<br>Choose one from its folder below.';
    return p;
  }
  function render({ animate = false } = {}) {
    const typed = input.value;
    const q = typed.trim().toLowerCase();
    const entries = apps ? build(typed) : null;
    const before = options[active]?.key ?? (active === options.length && active >= 0 ? 'browse' : null);
    const mutate = () => {
      const kids = !entries ? skeleton() : !entries.length ? [emptyNote(typed.trim())] : entries.map(e => (e.kind === 'title' ? titleFor(e.name) : rowFor(e, q)));
      list.replaceChildren(hl, ...kids);
      list.classList.toggle('loading', !entries);
      options = entries ? entries.filter(e => e.kind !== 'title') : [];
      options.forEach((o, i) => { rows.get(`${o.kind}|${o.key}`).dataset.i = i; });
    };
    if (animate && open && !reducedMotion()) animateHeight(list, mutate, { duration: 260 });
    else mutate();
    // the highlight stays on the same row if it's still there; else, with something typed, on the best fit
    let next = -1;
    if (before === 'browse') next = options.length;
    else if (before) next = options.findIndex(o => o.key === before);
    if (next < 0 && q) next = options.length ? 0 : -1;
    setActive(next, { glide: false });
    place();
  }

  // ----- the highlight -----
  const rowOf = o => rows.get(`${o.kind}|${o.key}`);
  function setActive(i, { glide = true, scroll = true } = {}) {
    const max = options.length;
    active = Math.max(-1, Math.min(i, max));
    const el = active < 0 ? null : active === max ? browse : rowOf(options[active]);
    for (const row of list.querySelectorAll('.xp-item[aria-selected="true"]')) if (row !== el) row.setAttribute('aria-selected', 'false');
    browse.setAttribute('aria-selected', String(el === browse));
    browse.classList.toggle('active', el === browse);
    if (el) el.setAttribute('aria-selected', 'true');
    if (el) input.setAttribute('aria-activedescendant', el.id);
    else input.removeAttribute('aria-activedescendant');
    if (!el || el === browse) { hl.classList.remove('on'); return; }
    const jump = !glide || !hl.classList.contains('on') || reducedMotion();
    if (jump) hl.style.transition = 'none';
    hl.style.transform = `translateY(${el.offsetTop}px)`;
    hl.style.height = `${el.offsetHeight}px`;
    hl.classList.add('on');
    if (jump) { void hl.offsetWidth; hl.style.transition = ''; }
    if (scroll) keepInView(el);
  }
  function keepInView(el) {
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    // a section's title stays in view with its first row
    const title = el.previousElementSibling?.classList.contains('xp-title') ? el.previousElementSibling : null;
    const from = title ? title.offsetTop : top;
    let to = null;
    if (from < list.scrollTop) to = from - 2;
    else if (bottom > list.scrollTop + list.clientHeight) to = bottom - list.clientHeight + 2;
    if (to != null) list.scrollTo({ top: Math.max(0, to), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // ----- where it shows: under the field, as wide as it, or over it when there's no room under it -----
  function place() {
    if (!open) return;
    const r = form.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 280), innerWidth - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left, innerWidth - width - EDGE));
    const below = innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < MIN_ROOM && above > below;
    const room = up ? above : below;
    const chrome = foot.offsetHeight + 16;   // the foot, and the glass's own padding
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    list.style.maxHeight = `${Math.max(96, Math.min(MAX_LIST, room - chrome))}px`;
    if (up) { menu.style.top = 'auto'; menu.style.bottom = `${innerHeight - r.top + GAP}px`; }
    else { menu.style.bottom = 'auto'; menu.style.top = `${r.bottom + GAP}px`; }
    menu.classList.toggle('up', up);
    menu.style.setProperty('--ox', `${Math.max(0, r.left + 24 - left)}px`);
    menu.style.setProperty('--oy', up ? '100%' : '0px');
  }

  // ----- showing and hiding -----
  function show() {
    if (open) return;
    open = true;
    menu.hidden = false;
    menu.classList.remove('closing');
    menu.style.animation = 'none';
    void menu.offsetWidth;
    menu.style.animation = '';
    input.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-expanded', 'true');
    render();
    shownOnce = true;
    scroller.reset();
    if (active >= 0) setActive(active, { glide: false });
    read();
  }
  function hide(instant = false) {
    if (!open) return;
    open = false;
    active = -1;
    hl.classList.remove('on');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    button.setAttribute('aria-expanded', 'false');
    if (instant || reducedMotion()) { menu.hidden = true; menu.classList.remove('closing'); return; }
    menu.classList.add('closing');
    menu.addEventListener('animationend', function done(e) {
      if (e.target !== menu) return;
      menu.removeEventListener('animationend', done);
      if (!open && menu.classList.contains('closing')) { menu.hidden = true; menu.classList.remove('closing'); }
    });
  }

  // ----- taking one -----
  // its name lifts off its row, the very words in the very place, and flies into its chip (recap.js flyIntoChip)
  function lift(from, text) {
    const r = from.getBoundingClientRect();
    const style = getComputedStyle(from);
    const bird = document.createElement('div');
    bird.className = 'ex-bird';
    bird.textContent = text;
    Object.assign(bird.style, { left: `${r.left}px`, top: `${r.top}px`, height: `${r.height}px`, fontSize: style.fontSize, fontWeight: style.fontWeight });
    document.body.append(bird);
    return bird;
  }
  function pick(o) {
    if (!o) return;
    const label = o.kind === 'site' ? o.key : o.name;
    if (isApp(o.key)) names.set(o.key, o.name);
    const el = open ? rowOf(o) : null;
    const fresh = !excluded().includes(o.key);
    const bird = fresh && el?.isConnected && !reducedMotion() ? lift(el.querySelector('.xp-name'), label) : null;
    if (bird) el.querySelector('.xp-name').style.visibility = 'hidden';
    hide();
    if (el) setTimeout(() => { el.querySelector('.xp-name').style.visibility = ''; }, 200);
    choose(o.key, { bird, label });
  }
  async function pickBrowse() {
    hide();
    let got;
    try { got = await window.memoir.request('apps.browse', {}, 0); } catch { toast('Windows couldn’t open its file dialog'); return; }
    input.focus({ preventScroll: true });
    if (!got) return;   // cancelled
    if (got.refused || !isApp(got.key)) { toast(REFUSED[got.refused] || REFUSED['not-app']); return; }
    names.set(got.key, got.name || pretty(got.key));
    onNames?.();
    // the next time the list shows, the program chosen is in it (until it's hidden, that is)
    if (apps && !apps.some(a => a.key === got.key)) apps = [...apps, { key: got.key, name: names.get(got.key), icon: got.icon || null, seen: false, open: false, installed: true }];
    choose(got.key, { bird: null, label: names.get(got.key) });
  }
  // Enter, or Add: the row that's lit; else the best fit for what's typed; else, as before, a website
  async function submit() {
    const query = input.value.trim();
    if (open && active >= 0) {
      if (active === options.length) pickBrowse();
      else pick(options[active]);
      return;
    }
    if (!query) { show(); return; }
    if (!apps) await read();
    const best = build(query).find(e => e.kind !== 'title');
    if (best) { pick(best); return; }
    const site = normalizeSite(query);
    if (site && !isApp(site)) { pick({ kind: 'site', key: site, name: site }); return; }
    form.classList.add('invalid');
    if (!reducedMotion()) form.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' });
    toast(`No app or website called “${query}”`);
  }

  // ----- wiring -----
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', menu.id);
  input.addEventListener('input', () => {
    if (!open) { if (input.value.trim()) show(); return; }
    render({ animate: true });
  });
  input.addEventListener('keydown', e => {
    if (e.isComposing) return;
    const max = options.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { show(); setActive(active < 0 ? 0 : active); return; }
      setActive(Math.min(active + 1, max));
    } else if (e.key === 'ArrowUp') {
      if (!open) return;
      e.preventDefault();
      setActive(active - 1);
    } else if ((e.key === 'PageDown' || e.key === 'PageUp') && open) {
      e.preventDefault();
      setActive(e.key === 'PageDown' ? Math.min(active + PAGE, max) : Math.max(active - PAGE, 0));
    } else if (e.key === 'Escape' && open) {
      // the list goes first; Settings stays (recap.js closes it on an Esc nobody took)
      e.preventDefault();
      hide();
    } else if (e.key === 'Tab' && open) hide();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (open && document.activeElement !== input && !menu.contains(document.activeElement)) hide(); }, 0);
  });
  // the field keeps the focus (and its caret) whatever's pressed in the list or on Apps
  menu.addEventListener('mousedown', e => e.preventDefault());
  button.addEventListener('mousedown', e => e.preventDefault());
  button.addEventListener('click', () => {
    if (open) { hide(); return; }
    input.focus({ preventScroll: true });
    show();
  });
  list.addEventListener('pointermove', e => {
    const el = e.target.closest('.xp-item');
    if (el && +el.dataset.i !== active) setActive(+el.dataset.i, { scroll: false });
  });
  list.addEventListener('click', e => {
    const el = e.target.closest('.xp-item');
    if (el) pick(options[+el.dataset.i]);
  });
  browse.addEventListener('pointermove', () => { if (active !== options.length) setActive(options.length, { scroll: false }); });
  browse.addEventListener('click', pickBrowse);
  // Settings scrolls, the window changes size: the list follows the field
  const follow = () => { if (open) place(); };
  addEventListener('resize', follow);
  form.closest('.morph-panel')?.addEventListener('scroll', follow, { passive: true });

  return {
    get isOpen() { return open; },
    prefetch: () => { read(); },
    close: hide,
    submit,
    nameOf,
  };
}
