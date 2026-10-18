import { reducedMotion, EASE_OUT } from './fx.js';
import { siteName } from './core.js';

const ICONS = {
  open: '<path d="M7 3H5.5A2.5 2.5 0 0 0 3 5.5v5A2.5 2.5 0 0 0 5.5 13h5a2.5 2.5 0 0 0 2.5-2.5V9M9.5 2.5h4v4M13.5 2.5 8 8"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="2"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/>',
  cut: '<circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="m5.5 5.5 8 8m-8-3 8-8"/>',
  paste: '<path d="M5 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 12.5 3H11"/><rect x="5" y="1.5" width="6" height="3" rx="1"/><path d="M5 8h6M5 11h4"/>',
  select: '<path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4M5 6h6M5 9h6"/>',
  refresh: '<path d="M14 8a6 6 0 1 1-6-6c1.68 0 3.29.67 4.49 1.83L14 5.33M14 2v3.33h-3.33"/>',
  // the same gear as the report's Settings button (i-gear): six evenly rounded teeth
  settings: '<path d="M8 1.50L8.57 1.52L9.13 1.60L9.52 2.35L9.71 3.31L10.09 3.51L10.47 3.71L10.84 3.95L11.21 4.18L12.14 3.86L12.98 3.82L13.32 4.27L13.63 4.75L13.89 5.25L14.11 5.78L13.65 6.48L12.91 7.13L12.93 7.57L12.95 8L12.93 8.43L12.91 8.87L13.65 9.52L14.11 10.22L13.89 10.75L13.63 11.25L13.32 11.73L12.98 12.18L12.14 12.14L11.21 11.82L10.84 12.05L10.48 12.29L10.09 12.49L9.71 12.69L9.52 13.65L9.13 14.40L8.57 14.48L8 14.50L7.43 14.48L6.87 14.40L6.48 13.65L6.29 12.69L5.91 12.49L5.52 12.29L5.16 12.05L4.79 11.82L3.86 12.14L3.02 12.18L2.68 11.73L2.37 11.25L2.11 10.75L1.89 10.22L2.35 9.52L3.09 8.87L3.07 8.43L3.05 8L3.07 7.57L3.09 7.13L2.35 6.48L1.89 5.78L2.11 5.25L2.37 4.75L2.68 4.27L3.02 3.82L3.86 3.86L4.79 4.18L5.16 3.95L5.53 3.71L5.91 3.51L6.29 3.31L6.48 2.35L6.87 1.60L7.43 1.52Z"/><circle cx="8" cy="8" r="2.05"/>',
  report: '<rect x="2" y="2" width="12" height="12" rx="3"/><path d="M5 10V8m3 2V5m3 5V7"/>',
  pause: '<path d="M5.5 3v10M10.5 3v10"/>',
  play: '<path d="m5 2.5 8 5.5-8 5.5Z"/>',
  category: '<path d="M8.35 2.35A1.2 1.2 0 0 0 7.5 2H3.2A1.2 1.2 0 0 0 2 3.2v4.3a1.2 1.2 0 0 0 .35.85l5.22 5.22a1.46 1.46 0 0 0 2.06 0l3.94-3.94a1.46 1.46 0 0 0 0-2.06Z"/><circle cx="5.3" cy="5.3" r=".55"/>',
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

  // The rows a gliding menu is leaving: they ride along inside it while they fade.
  function ghostOf() {
    const ghost = document.createElement('div');
    ghost.className = 'context-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.top = `${6 - menu.scrollTop}px`;
    ghost.append(...[...menu.children].filter(child => !child.classList.contains('context-ghost')));
    return ghost;
  }

  function open(event) {
    event.preventDefault();
    if (menu.contains(event.target)) return;
    const current = ++token;
    // Already open: the same surface glides to the new spot instead of starting over.
    const glide = !menu.hidden && !menu.classList.contains('closing') && !reducedMotion();
    const from = glide ? menu.getBoundingClientRect() : null;
    const ghost = glide ? ghostOf() : null;
    const previousFocus = glide ? context?.previousFocus : null;
    context = contextFor(event);
    if (previousFocus) context.previousFocus = previousFocus;
    items = baseItems(context);
    beforeOpen(context);
    menu.getAnimations().forEach(a => a.cancel());
    menu.classList.remove('closing', 'gliding');
    menu.replaceChildren();
    const title = document.createElement('p');
    title.className = 'context-title';
    title.textContent = context.editable ? 'Edit text' : context.domain && context.domain !== '~private' ? siteName(context.domain) : context.text.trim() ? 'Selected text' : '';
    if (!title.textContent) title.innerHTML = '<span class="wordmark">Memoir</span>';
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
    if (glide) {
      // position and height travel together; the old rows fade as the new ones arrive
      menu.classList.add('gliding');
      menu.appendChild(ghost);
      const to = menu.getBoundingClientRect();
      const done = () => { if (current === token) menu.classList.remove('gliding'); ghost.remove(); };
      menu.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, height: `${from.height}px` },
        { transform: 'none', height: `${to.height}px` },
      ], { duration: 420, easing: EASE_OUT }).finished.then(done, done);
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      for (const el of menu.querySelectorAll(':scope > .context-title, :scope > .context-separator')) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 80, easing: 'ease-out', fill: 'backwards' });
      }
    } else if (!reducedMotion()) menu.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE_OUT });
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
