// A guided tour: the page dims, a spotlight glides from one feature to the next
// and a small card explains it. Keys: → / Enter next, ← back, Esc to leave.
//
// Steps can be hands-on: what's in the light stays clickable (only for steps with
// `tasks` or `interactive`), and each task ("Try …") watches for the thing it asks
// for; its dot turns green when it's done. Next always works, done or not. A task
// with `advance` moves on to the next step by itself once it's done.

import { reducedMotion } from './shared/fx.js';

const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? 0 : ms));
const HEAVY = 'cubic-bezier(0.16, 1, 0.3, 1)';
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.8 8.4 6.6 11.2 12.2 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function unionRect(els) {
  const rs = els.filter(Boolean).map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!rs.length) return null;
  const left = Math.min(...rs.map(r => r.left));
  const top = Math.min(...rs.map(r => r.top));
  const right = Math.max(...rs.map(r => r.right));
  const bottom = Math.max(...rs.map(r => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export function runTour(steps) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Tour of Memoir');
    root.innerHTML = `
      <div class="tour-block"></div>
      <div class="tour-spot"></div>
      <div class="tour-card">
        <div class="tour-head">
          <span class="tour-dots">${steps.map(() => '<i></i>').join('')}</span>
          <button class="tour-link tour-skip" type="button">Skip tour</button>
        </div>
        <div class="tour-body"></div>
        <div class="tour-foot">
          <button class="btn btn-secondary btn-sm tour-back" type="button">Back</button>
          <button class="btn btn-primary btn-sm tour-next" type="button"><span class="tn-fill" aria-hidden="true"></span><span class="tn-label">Next</span><svg class="tn-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h8.5M8.5 4.2 12.3 8l-3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const spot = root.querySelector('.tour-spot');
    const blocker = root.querySelector('.tour-block');
    const card = root.querySelector('.tour-card');
    const body = root.querySelector('.tour-body');
    const dots = [...root.querySelectorAll('.tour-dots i')];
    const back = root.querySelector('.tour-back');
    const next = root.querySelector('.tour-next');
    const nextFill = next.querySelector('.tn-fill');
    let index = -1;
    let ended = false;
    let token = 0; // bumps on every step, so a step still settling knows it's been left
    const doneBy = steps.map(() => new Set()); // tasks done, per step (kept when going back)
    let watchers = [];
    let reflowTimers = [];


    // spot and card move together, straight away, on one heavy ease
    function place(step, cardH = card.offsetHeight) {
      const els = step.target ? [].concat(step.target()).filter(Boolean) : [];
      const r = els.length ? unionRect(els) : null;
      const pad = step.pad != null ? step.pad : 8;
      // hands-on steps leave a hole in the blocker over the spotlight, so what's lit can be used
      const open = !!r && !!((step.tasks && step.tasks.length) || step.interactive);
      if (open) {
        const x0 = Math.max(0, r.left - pad);
        const y0 = Math.max(0, r.top - pad);
        const x1 = Math.min(innerWidth, r.left + r.width + pad);
        const y1 = Math.min(innerHeight, r.top + r.height + pad);
        blocker.style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x0} ${y0}H${x1}V${y1}H${x0}Z")`;
      } else {
        blocker.style.clipPath = '';
      }
      if (r) {
        const radius = step.radius != null ? step.radius : 18;
        Object.assign(spot.style, {
          left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: `${radius}px`,
        });
        spot.classList.remove('none');
      } else {
        Object.assign(spot.style, { left: `${innerWidth / 2}px`, top: `${innerHeight / 2}px`, width: '0px', height: '0px', borderRadius: '50%' });
        spot.classList.add('none');
      }
      // beside the spotlight when there's room, otherwise below or above it
      const cw = card.offsetWidth;
      const ch = cardH;
      const gap = 16;
      const M = 14;
      let x;
      let y;
      if (!r) {
        x = (innerWidth - cw) / 2;
        y = (innerHeight - ch) / 2;
      } else {
        const sp = { left: r.left - pad, top: r.top - pad, right: r.left + r.width + pad, bottom: r.top + r.height + pad };
        if (sp.right + gap + cw <= innerWidth - M) { x = sp.right + gap; y = sp.top; }
        else if (sp.left - gap - cw >= M) { x = sp.left - gap - cw; y = sp.top; }
        else if (sp.bottom + gap + ch <= innerHeight - M) { x = sp.left + (sp.right - sp.left - cw) / 2; y = sp.bottom + gap; }
        else if (sp.top - gap - ch >= M) { x = sp.left + (sp.right - sp.left - cw) / 2; y = sp.top - gap - ch; }
        else {
          // no side fits it whole: take the roomiest one (it may overlap the light's
          // edge a little, never sit in the middle of what you're asked to click)
          const room = { right: innerWidth - sp.right, left: sp.left, below: innerHeight - sp.bottom, above: sp.top };
          const side = Object.keys(room).reduce((a, b) => (room[b] > room[a] ? b : a));
          if (side === 'right') { x = sp.right + gap; y = sp.top; }
          else if (side === 'left') { x = sp.left - gap - cw; y = sp.top; }
          else if (side === 'below') { x = sp.left + (sp.right - sp.left - cw) / 2; y = sp.bottom + gap; }
          else { x = sp.left + (sp.right - sp.left - cw) / 2; y = sp.top - gap - ch; }
        }
      }
      x = Math.max(M, Math.min(x, innerWidth - cw - M));
      y = Math.max(M, Math.min(y, innerHeight - ch - M));
      card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }

    // new words in (the old ones fade out on top), the card's height eases to fit
    function tasksHtml(step, i) {
      if (!step.tasks || !step.tasks.length) return '';
      return `<ul class="tour-tasks">${step.tasks.map((t, k) => `<li class="${doneBy[i].has(k) ? 'done' : ''}" data-k="${k}"><span class="tt-dot">${TICK}</span><span class="tt-text">${t.text}</span></li>`).join('')}</ul>`;
    }

    function swapContent(step, dir, i) {
      const h0 = body.getBoundingClientRect().height;
      body.getAnimations().forEach(a => a.cancel());
      for (const o of [...body.children]) {
        if (reducedMotion() || !o.isConnected || o.classList.contains('out')) { o.remove(); continue; }
        o.classList.add('out');
        o.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-12 * dir}px)` }], { duration: 180, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => o.remove(), () => o.remove());
      }
      const content = document.createElement('div');
      content.className = 'tour-content';
      content.innerHTML = `${step.kicker ? `<p class="tour-kicker">${step.kicker}</p>` : ''}<h3 class="tour-title display">${step.title}</h3><p class="tour-text">${step.text}</p>${tasksHtml(step, i)}`;
      body.appendChild(content);
      const h1 = content.getBoundingClientRect().height;
      const finalH = card.offsetHeight - body.getBoundingClientRect().height + h1;
      if (!reducedMotion()) {
        if (h0 > 0 && Math.abs(h1 - h0) > 0.5) body.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 520, easing: HEAVY });
        content.animate([{ opacity: 0, transform: `translateX(${14 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 90, easing: HEAVY, fill: 'backwards' });
      }
      body.style.height = `${h1}px`;
      return finalH;
    }

    function stopWatching() {
      for (const off of watchers) { try { off(); } catch { /* already gone */ } }
      watchers = [];
    }

    // the view under the light may change after a click: let the spotlight follow
    function reflow() {
      reflowTimers.forEach(clearTimeout);
      reflowTimers = [450, 950].map(ms => setTimeout(() => { if (!ended && index >= 0) place(steps[index]); }, ms));
    }

    function complete(i, k) {
      if (ended || doneBy[i].has(k)) return;
      doneBy[i].add(k);
      reflow();
      if (index !== i) return;
      const li = body.querySelector(`.tour-content:not(.out) .tour-tasks li[data-k="${k}"]`);
      // the dot grows into the green tick (CSS does it), then a spark flies into Next
      if (li) li.classList.add('done');
      chargeNext(i, li);
      // tasks that open the next step's view take you there, once the spark has landed
      if (steps[i].tasks[k].advance && i < steps.length - 1) {
        setTimeout(() => { if (!ended && index === i) go(i + 1, 1); }, reducedMotion() ? 0 : 1000);
      }
    }

    // ---- Next charges up as the tries get done ----
    // Each tick sends a spark along an arc into the button, which fills with green
    // from the left, one share per try. Full: the arrow slides in, then nudges now
    // and then. All transform and opacity;
    // the button itself never moves or changes size.
    const SPARK_DELAY = 140;   // the tick shows first
    const SPARK_MS = 600;
    const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const progressOf = i => (steps[i].tasks && steps[i].tasks.length ? doneBy[i].size / steps[i].tasks.length : 0);

    function setFill(p, instant = false) {
      const to = `translateX(${((Math.min(1, Math.max(0, p)) - 1) * 100).toFixed(3)}%)`;
      if (instant || reducedMotion()) {
        nextFill.style.transition = 'none';
        nextFill.style.transform = to;
        void nextFill.offsetWidth;
        nextFill.style.transition = '';
      } else {
        nextFill.style.transform = to;
      }
    }
    function setFull(on) {
      next.classList.toggle('full', on);
    }

    function chargeNext(i, li) {
      const dot = li && li.querySelector('.tt-dot');
      const land = () => {
        if (ended || index !== i) return;
        const p = progressOf(i);
        setFill(p);
        if (p >= 1) setTimeout(() => { if (!ended && index === i && progressOf(i) >= 1) setFull(true); }, reducedMotion() ? 0 : 420);
      };
      if (reducedMotion() || !dot) { land(); return; }
      // from the tick, along an arc above both, to where the fill is about to reach
      const a = dot.getBoundingClientRect();
      const b = next.getBoundingClientRect();
      const x0 = a.left + a.width / 2;
      const y0 = a.top + a.height / 2;
      const x1 = b.left + Math.max(14, Math.min(b.width - 14, b.width * progressOf(i)));
      const y1 = b.top + b.height / 2;
      const cx = (x0 + x1) / 2;
      const cy = Math.min(y0, y1) - 44;
      const spark = document.createElement('span');
      spark.className = 'tour-spark';
      root.appendChild(spark);
      const frames = [];
      const N = 30;
      for (let n = 0; n <= N; n++) {
        const t = n / N;
        const u = easeInOut(t);
        const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1;
        const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
        const sc = t < 0.3 ? 0.45 + (t / 0.3) * 0.8 : 1.25 - ((t - 0.3) / 0.7) * 0.6;
        const op = t < 0.12 ? t / 0.12 : t > 0.86 ? (1 - t) / 0.14 : 1;
        frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(3)})`, opacity: +op.toFixed(3), offset: t });
      }
      const anim = spark.animate(frames, { duration: SPARK_MS, delay: SPARK_DELAY, easing: 'linear', fill: 'backwards' });
      anim.finished.then(() => spark.remove(), () => spark.remove());
      // the fill starts just before the spark lands, so the two meet
      setTimeout(land, SPARK_DELAY + SPARK_MS * 0.8);
    }

    function setNextLabel(text) {
      const label = next.querySelector('.tn-label');
      if (label.textContent !== text) label.textContent = text;
    }

    // Next and Back always act at once: the card and spotlight head for the new
    // step straight away, even if the last step's view is still changing
    async function go(i, dir = 1) {
      if (ended || i < 0 || i >= steps.length) return;
      const mine = ++token;
      const live = () => !ended && token === mine;
      const step = steps[i];
      index = i;
      dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('past', k < i); });
      back.disabled = i === 0;
      back.classList.toggle('gone', i === 0);
      setNextLabel(step.next || (i === steps.length - 1 ? 'Finish' : 'Next'));
      // the new step's charge: drains (or refills) smoothly, straight away on the first step
      const charged = progressOf(i);
      setFill(charged, !root.classList.contains('on'));
      setFull(charged >= 1);
      root.querySelector('.tour-skip').classList.toggle('gone', i === steps.length - 1);
      stopWatching();
      const finalH = swapContent(step, dir, i);
      watchers = (step.tasks || []).map((t, k) => (doneBy[i].has(k) ? null : t.watch(() => complete(i, k)))).filter(Boolean);
      if (!root.classList.contains('on')) {
        // very first step: put the card in place before it's ever seen
        card.classList.add('instant');
        spot.classList.add('instant');
        place(step, finalH);
        void card.offsetWidth;
        card.classList.remove('instant');
        spot.classList.remove('instant');
        root.classList.add('on');
      } else {
        place(step, finalH);
      }
      next.focus({ preventScroll: true });
      if (step.before) {
        await step.before(live);
        await wait(step.settle != null ? step.settle : 650);
        // the view changed under the spotlight: settle onto its final shape
        if (live()) place(step);
      }
    }

    function end(result) {
      if (ended) return;
      ended = true;
      stopWatching();
      reflowTimers.forEach(clearTimeout);
      document.removeEventListener('click', onPageClick, true);
      removeEventListener('resize', onResize);
      root.classList.remove('on');
      root.classList.add('leaving');
      setTimeout(() => { root.remove(); resolve(result); }, reducedMotion() ? 0 : 380);
    }

    const onResize = () => { if (index >= 0) place(steps[index]); };
    addEventListener('resize', onResize);
    // a click on the page itself (through the hole) may open or close something
    const onPageClick = e => { if (!root.contains(e.target)) reflow(); };
    document.addEventListener('click', onPageClick, true);
    next.addEventListener('click', () => {
      if (index === steps.length - 1) end('done');
      else go(index + 1, 1);
    });
    back.addEventListener('click', () => { if (index > 0) go(index - 1, -1); });
    root.querySelector('.tour-skip').addEventListener('click', () => end('skipped'));
    root.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); end('skipped'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (!back.disabled) back.click(); }
      else if (e.key === 'Tab') {
        const list = [...card.querySelectorAll('button')].filter(b => !b.disabled && !b.classList.contains('gone'));
        const k = list.indexOf(document.activeElement);
        if (e.shiftKey && k <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && k === list.length - 1) { e.preventDefault(); list[0].focus(); }
      }
    });
    go(0);
  });
}
