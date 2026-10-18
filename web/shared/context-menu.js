import { reducedMotion, EASE_OUT } from './fx.js';

const ICONS = {
  open: '<path d="M6 3H3v10h10v-3M9 2h5v5M7 9l7-7"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="2"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/>',
  cut: '<circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="m5.5 5.5 8 8m-8-3 8-8"/>',
  paste: '<path d="M5 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 12.5 3H11"/><rect x="5" y="1.5" width="6" height="3" rx="1"/><path d="M5 8h6M5 11h4"/>',
  select: '<path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4M5 6h6M5 9h6"/>',
  refresh: '<path d="M13.5 7a5.5 5.5 0 1 0-1.3 4.6M14 2v4h-4"/>',
  settings: '<path d="m6.5 2-.5 1.5-1.5.8-1.6-.3L1.5 6.5l1.1 1v1l-1.1 1L2.9 12l1.6-.3 1.5.8.5 1.5h3l.5-1.5 1.5-.8 1.6.3 1.4-2.5-1.1-1v-1l1.1-1L13.1 4l-1.6.3-1.5-.8L9.5 2Z"/><circle cx="8" cy="8" r="2"/>',
  report: '<rect x="2" y="2" width="12" height="12" rx="3"/><path d="M5 10V8m3 2V5m3 5V7"/>',
  pause: '<path d="M5.5 3v10M10.5 3v10"/>',
  play: '<path d="m5 2.5 8 5.5-8 5.5Z"/>',
  category: '<path d="M2 2h5l7 7-5 5-7-7Z"/><circle cx="5" cy="5" r=".7"/>',
};
const glyph = name => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.copy}</svg>`;
const shortcut = key => /Mac/.test(navigator.platform) ? `⌘${key}` : `Ctrl+${key}`;

function contextFor(event) {
  const target = event.target instanceof Element ? event.target : document.body;
  const row = target.closest('.site[data-domain], .row[data-domain], li[data-domain]') || target.closest('[data-domain]');
  const link = target.closest('a[href]') || row?.querySelector('a.site-link');
  const candidate = target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  const field = candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement;
  const editable = candidate && (candidate.isContentEditable || (field && candidate.selectionStart !== null)) ? candidate : null;
  const selection = getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  if (editable && !field && (!range || !editable.contains(range.commonAncestorContainer))) {
    range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
  }
  const start = editable && field ? editable.selectionStart : null;
  const end = editable && field ? editable.selectionEnd : null;
  const text = editable ? (field ? editable.value.slice(start, end) : range.toString()) : selection?.toString() || '';
  return {
    target, link, domain: row?.dataset.domain, editable, field, range, start, end, text,
    value: editable ? (field ? editable.value : editable.textContent) : null,
    previousFocus: document.activeElement,
  };
}

function restore(context) {
  const el = context.editable || context.previousFocus;
  if (el?.isConnected) el.focus({ preventScroll: true });
  if (context.editable && context.field) {
    context.editable.setSelectionRange(context.start, context.end);
  } else if (context.range?.startContainer.isConnected && context.range?.endContainer.isConnected) {
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(context.range);
  }
}

function insert(context, text) {
  const el = context.editable;
  if (!el?.isConnected || (context.field ? el.value : el.textContent) !== context.value) return;
  restore(context);
  // Preserve the field's undo history; use a plain-text fallback if necessary.
  if (document.execCommand('insertText', false, text)) return;
  if (context.field) el.setRangeText(text, context.start, context.end, 'end');
  else if (context.range) {
    context.range.deleteContents();
    const node = document.createTextNode(text);
    context.range.insertNode(node);
    context.range.setStartAfter(node);
    context.range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(context.range);
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

export function initContextMenu({ getItems = () => [], beforeOpen = () => {}, onMessage = null, refreshLabel = 'Refresh' } = {}) {
  if (document.querySelector('.context-menu')) return;
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Memoir actions');
  menu.hidden = true;
  document.body.appendChild(menu);
  let context = null;
  let items = [];
  let token = 0;
  let notice = null;
  let noticeTimer = 0;

  const message = text => {
    if (onMessage) { onMessage(text); return; }
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'context-notice';
      notice.setAttribute('role', 'status');
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    notice.classList.add('on');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('on'), 2400);
  };

  function close({ instant = false, restoreFocus = false } = {}) {
    if (menu.hidden || menu.classList.contains('closing')) return;
    const current = ++token;
    const style = getComputedStyle(menu);
    const from = { opacity: style.opacity, transform: style.transform };
    menu.getAnimations().forEach(a => a.cancel());
    menu.classList.add('closing');
    if (restoreFocus && context) restore(context);
    const done = () => { if (current === token) { menu.hidden = true; menu.classList.remove('closing'); } };
    if (instant || reducedMotion()) { done(); return; }
    menu.animate([from, { opacity: 0, transform: 'translateY(3px) scale(0.97)' }], { duration: 150, easing: EASE_OUT, fill: 'forwards' }).finished.then(done, done);
  }

  function baseItems(ctx) {
    const copy = async text => {
      await navigator.clipboard.writeText(text);
      message('Copied');
    };
    if (ctx.editable) {
      const writable = !ctx.editable.readOnly && !ctx.editable.disabled;
      const password = ctx.editable.type === 'password';
      return [
        { label: 'Cut', icon: 'cut', hint: shortcut('X'), disabled: !ctx.text || !writable || password, action: async () => { await copy(ctx.text); insert(ctx, ''); } },
        { label: 'Copy', icon: 'copy', hint: shortcut('C'), disabled: !ctx.text || password, action: () => copy(ctx.text) },
        { label: 'Paste', icon: 'paste', hint: shortcut('V'), disabled: !writable, action: async () => {
          try { insert(ctx, await navigator.clipboard.readText()); }
          catch { message(`Press ${shortcut('V')} to paste`); }
        } },
        { separator: true },
        { label: 'Select all', icon: 'select', hint: shortcut('A'), action: () => {
          restore(ctx);
          if (ctx.field) ctx.editable.select();
          else { const range = document.createRange(); range.selectNodeContents(ctx.editable); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }
        } },
      ];
    }
    const result = [];
    if (ctx.link && /^(https?:|chrome-extension:)$/.test(ctx.link.protocol)) {
      result.push({ label: ctx.link.classList.contains('site-link') ? 'Open site in new tab' : 'Open link in new tab', icon: 'open', href: ctx.link.href });
      result.push({ label: 'Copy link address', icon: 'copy', action: () => copy(ctx.link.href) });
    }
    if (ctx.text.trim()) result.push({ label: 'Copy selected text', icon: 'copy', hint: shortcut('C'), action: () => copy(ctx.text) });
    const extra = getItems(ctx);
    if (result.length && extra.length) result.push({ separator: true });
    result.push(...extra);
    if (result.length) result.push({ separator: true });
    result.push({ label: refreshLabel, icon: 'refresh', hint: shortcut('R'), action: () => location.reload() });
    return result;
  }

  function open(event) {
    event.preventDefault();
    if (menu.contains(event.target)) return;
    ++token;
    context = contextFor(event);
    items = baseItems(context);
    beforeOpen(context);
    menu.getAnimations().forEach(a => a.cancel());
    menu.classList.remove('closing');
    menu.replaceChildren();
    const title = document.createElement('p');
    title.className = 'context-title';
    title.textContent = context.editable ? 'Edit text' : context.domain && context.domain !== '~private' ? context.domain.startsWith('app:') ? window.memoir.appName(context.domain) : context.domain : context.text.trim() ? 'Selected text' : 'Memoir';
    menu.appendChild(title);
    items.forEach((item, index) => {
      const el = document.createElement(item.separator ? 'div' : item.href ? 'a' : 'button');
      if (item.separator) { el.className = 'context-separator'; el.setAttribute('role', 'separator'); }
      else {
        el.className = 'context-item';
        el.setAttribute('role', 'menuitem');
        el.tabIndex = -1;
        el.dataset.index = index;
        el.style.setProperty('--cm-delay', `${25 + index * 18}ms`);
        if (item.href) { el.href = item.href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
        else { el.type = 'button'; el.disabled = !!item.disabled; }
        el.innerHTML = glyph(item.icon);
        const label = document.createElement('span'); label.textContent = item.label; el.appendChild(label);
        if (item.hint) { const hint = document.createElement('span'); hint.className = 'context-hint'; hint.setAttribute('aria-hidden', 'true'); hint.textContent = item.hint; el.appendChild(hint); }
      }
      menu.appendChild(el);
    });
    menu.hidden = false;
    menu.scrollTo({ top: 0, behavior: 'instant' });
    const rect = context.target.getBoundingClientRect();
    const x = event.clientX || (event.clientY ? 0 : rect.left + 12);
    const y = event.clientY || (event.clientX ? 0 : rect.bottom + 4);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = Math.max(10, Math.min(x + 4, innerWidth - w - 10));
    const top = Math.max(10, Math.min(y + 4, innerHeight - h - 10));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.transformOrigin = `${Math.max(0, Math.min(w, x - left))}px ${Math.max(0, Math.min(h, y - top))}px`;
    menu.querySelector('.context-item:not(:disabled)')?.focus({ preventScroll: true });
    if (!reducedMotion()) menu.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE_OUT });
  }

  document.addEventListener('contextmenu', open, true);
  document.addEventListener('pointerdown', e => {
    if (menu.hidden) return;
    if (menu.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
    else if (e.button !== 2) close();
  }, true);
  menu.addEventListener('click', e => {
    const itemEl = e.target.closest('.context-item');
    if (!itemEl || itemEl.disabled) return;
    e.stopPropagation();
    const item = items[+itemEl.dataset.index];
    close({ restoreFocus: true });
    if (item.action) {
      try { Promise.resolve(item.action()).catch(() => message('That action could not be completed. Please try again.')); }
      catch { message('That action could not be completed. Please try again.'); }
    }
  });
  document.addEventListener('keydown', e => {
    if (menu.hidden || menu.classList.contains('closing')) return;
    e.stopPropagation();
    const buttons = [...menu.querySelectorAll('.context-item:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      close({ instant: e.key === 'Tab', restoreFocus: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      buttons[index]?.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ordered = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)];
      ordered.find(button => items[+button.dataset.index].label.toLowerCase().startsWith(e.key.toLowerCase()))?.focus({ preventScroll: true });
    }
  }, true);
  document.addEventListener('scroll', e => { if (!menu.contains(e.target)) close({ instant: true }); }, true);
  addEventListener('resize', () => close({ instant: true }));
  addEventListener('blur', () => close({ instant: true }));
}
