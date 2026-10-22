/*! Made with care and love by Mina Vian */
// A guided tour: the page dims, a spotlight glides from one feature to the next
// and a small card explains it. Keys: → / Enter next, ← back, Esc to leave. The
// arrows are the tour's wherever the focus is (a step can lend them to the page with
// `arrows(dir)`); only fields that type keep theirs.
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

// boxes as { l, t, r, b }
const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
const area = a => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const join = (a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
const apart = (a, b) => Math.hypot(Math.max(0, a.l - b.r, b.l - a.r), Math.max(0, a.t - b.b, b.t - a.b));

// The tour that's running, if any: the page tells it when what's lit is about to change.
let relightTour = null;

// relight(after): the page has just put what's lit in its new layout, before its own
// animation shows it. Growing, the light opens to the new size first and the page's
// animation waits the returned lead (ms); shrinking (or no change), the page goes first
// and the light follows once it's done, `after` ms from now. 0 with no tour running.
export function relight(after = 450) {
  return relightTour ? relightTour(after) : 0;
}

// handoff(card, { onMove, onLand }): called with the first card once it's placed, before
// it's seen, so a welcome screen can turn into it (the tour's dim then appears at once, no
// fade). It returns true if it does: the card then stays unseen and the light shut until
// the welcome's card sets off (onMove({ duration, easing }): the light opens on that clock)
// and lands as this one (onLand).
// avoid(): what's up on the page right now that the card must leave visible (popovers,
// menus a try opened). A step's follow() lists what its tries opened elsewhere (the
// trend graph, a day the highlights opened): it joins the light, so you see it, and the
// card moves off it. A step with `below` (true, or a function asked each time) has its
// card under the light when it fits; its
// alignTo() names what the card then lines up under (left edges), and its flip() says
// whether the buttons go to the card's top there (they do by default). A `live` step's
// light grows with what it lights as it moves under the hand (the gear pulled down,
// however far) and goes back with it, never smaller than where it rests: its rest() names
// what stays put (measured each time, so a new layout moves it too); the card stays put.
export function runTour(steps, { handoff = null, avoid = () => [] } = {}) {
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
    const head = root.querySelector('.tour-head');
    const body = root.querySelector('.tour-body');
    const foot = root.querySelector('.tour-foot');
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
    let shut = false; // the light waits for the welcome's card to set off
    let lastSpot = null; // where the light was last sent ({ l, t, r, b }), while it's open
    let holdUntil = 0; // the page is still animating what's lit: the light waits till then
    const RELIGHT_MS = 300;

    // what a step lights, padded: its target, and what its tries opened elsewhere
    function lit(step) {
      const els = step.target ? [].concat(step.target()).filter(Boolean) : [];
      if (els.length && step.follow) els.push(...[].concat(step.follow()).filter(Boolean));
      return padded(step, els.length ? unionRect(els) : null);
    }
    function padded(step, r) {
      if (!r) return null;
      const pad = step.pad != null ? step.pad : 8;
      return { l: r.left - pad, t: r.top - pad, r: r.left + r.width + pad, b: r.top + r.height + pad };
    }

    // the light on what a step lights (sp: lit(step))
    function light(step, sp) {
      // hands-on steps leave a hole in the blocker over the spotlight, so what's lit can be used
      const open = !shut && !!sp && !!((step.tasks && step.tasks.length) || step.interactive);
      if (open) {
        const x0 = Math.max(0, sp.l);
        const y0 = Math.max(0, sp.t);
        const x1 = Math.min(innerWidth, sp.r);
        const y1 = Math.min(innerHeight, sp.b);
        blocker.style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x0} ${y0}H${x1}V${y1}H${x0}Z")`;
      } else {
        blocker.style.clipPath = '';
      }
      if (sp && !shut) {
        const radius = step.radius != null ? step.radius : 18;
        Object.assign(spot.style, {
          left: `${sp.l}px`, top: `${sp.t}px`, width: `${sp.r - sp.l}px`, height: `${sp.b - sp.t}px`, borderRadius: `${radius}px`,
        });
        spot.classList.remove('none');
        lastSpot = sp;
      } else {
        // no light (or not yet): shut, at the middle of what it lights, so it opens from there
        const cx = sp ? (sp.l + sp.r) / 2 : innerWidth / 2;
        const cy = sp ? (sp.t + sp.b) / 2 : innerHeight / 2;
        Object.assign(spot.style, { left: `${cx}px`, top: `${cy}px`, width: '0px', height: '0px', borderRadius: '50%' });
        spot.classList.add('none');
        lastSpot = null;
      }
    }

    // spot and card move together, straight away, on one heavy ease
    let restSpot = null; // where a live step's light rests: it only grows from there
    function place(step, cardH = card.offsetHeight) {
      const sp = lit(step);
      restSpot = sp;
      light(step, sp);
      const cw = card.offsetWidth;
      const ch = cardH;
      const M = 14;
      let x;
      let y;
      if (!sp) {
        x = (innerWidth - cw) / 2;
        y = (innerHeight - ch) / 2;
      } else {
        const below = typeof step.below === 'function' ? step.below() : !!step.below;
        ({ x, y } = cardSpot(sp, cw, ch, below, step.alignTo ? step.alignTo() : null));
      }
      x = Math.max(M, Math.min(x, innerWidth - cw - M));
      y = Math.max(M, Math.min(y, innerHeight - ch - M));
      card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // under the light, the buttons go to the card's top: nearest the pointer
      setFlip(!!sp && y >= sp.b - 1 && (!step.flip || step.flip()));
    }

    // Under the light, Back and Next ride at the top of the card and the dots at its
    // foot. Each part glides to its new place on the card's own ease; the dots fade
    // across rather than pass over the words. Transform and opacity only.
    let flipped = false;
    function setFlip(on) {
      if (on === flipped) return;
      flipped = on;
      const parts = [head, body, foot];
      const seen = root.classList.contains('on') && !root.classList.contains('arriving') && !reducedMotion();
      const top = el => el.getBoundingClientRect().top - card.getBoundingClientRect().top;
      const before = seen ? parts.map(top) : null;
      parts.forEach(p => { if (p._flip) { p._flip.cancel(); p._flip = null; } });
      card.classList.toggle('flip', on);
      if (!seen) return;
      parts.forEach((p, i) => {
        const dy = before[i] - top(p);
        if (Math.abs(dy) < 0.5) return;
        const kf = p === head
          ? [{ transform: `translateY(${dy}px)`, opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 0.55 }, { transform: 'none', opacity: 1 }]
          : [{ transform: `translateY(${dy}px)` }, { transform: 'none' }];
        const a = p.animate(kf, { duration: 700, easing: HEAVY });
        p._flip = a;
        a.finished.then(() => { if (p._flip === a) p._flip = null; }, () => {});
      });
    }

    // one move of the light on another clock than its own (it goes back to its own after)
    let spotClockT = 0;
    function spotClock(duration, easing) {
      if (reducedMotion()) return;
      clearTimeout(spotClockT);
      spot.style.transition = `${['left', 'top', 'width', 'height', 'border-radius'].map(p => `${p} ${duration}ms ${easing}`).join(', ')}, opacity 0.4s var(--ease), box-shadow 0.9s var(--ease)`;
      spotClockT = setTimeout(() => { spot.style.transition = ''; }, duration + 50);
    }

    // a live step: the light follows what it lights at once (.live: no glide), every frame it's moved, taking in
    // its resting shape as well (what moves only adds to it: pulled down, the light grows down, its top stays).
    // Let go, as soon as what's lit starts back, the light goes home in one move on the spring the page's own
    // takes (pull-close.js), so the two bounce back together.
    const SPRING_MS = 550;
    const SPRING = 'cubic-bezier(0.32, 1.24, 0.5, 1)';
    let liveFrame = 0;
    let held = false; // a pointer is down: what's lit may be under the hand
    const hold = e => { held = e.type === 'pointerdown'; };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) addEventListener(type, hold, true);
    function liveLight(step) {
      cancelAnimationFrame(liveFrame);
      spot.classList.remove('live');
      if (!step.live) return;
      const moved = (a, b) => Math.abs(a.l - b.l) > 0.5 || Math.abs(a.t - b.t) > 0.5 || Math.abs(a.r - b.r) > 0.5 || Math.abs(a.b - b.b) > 0.5;
      // coming back (up from a pull down, or down from a pull up), not just a label's words getting shorter
      const back = (a, b) => a.b < b.b - 0.5 || a.t > b.t + 0.5;
      const rest = () => (step.rest ? padded(step, unionRect([].concat(step.rest()).filter(Boolean))) : restSpot);
      let homeAt = 0; // springing home till then
      const tick = () => {
        if (ended || steps[index] !== step) return;
        liveFrame = requestAnimationFrame(tick);
        const now = lit(step);
        const base = rest();
        const sp = now && base ? { l: Math.min(now.l, base.l), t: Math.min(now.t, base.t), r: Math.max(now.r, base.r), b: Math.max(now.b, base.b) } : now;
        if (!sp || !lastSpot || shut || !moved(sp, lastSpot)) return;
        if (!held && performance.now() < homeAt) return;
        if (!held && base && back(sp, lastSpot)) {
          homeAt = performance.now() + SPRING_MS;
          spot.classList.remove('live');
          spotClock(SPRING_MS, SPRING);
          light(step, base);
          return;
        }
        homeAt = 0;
        if (spot.style.transition) { clearTimeout(spotClockT); spot.style.transition = ''; }
        spot.classList.add('live');
        light(step, sp);
      };
      liveFrame = requestAnimationFrame(tick);
    }

    // Where the card goes: beside the light, never on it, and never on what's up on the
    // page (a popover, a menu). Each place beside the light (and beside the light with
    // those things) is scored: covering the light costs most, then covering what's up,
    // then being far away. Right, left, below, above, in that order, break ties (below
    // first, for a step that asks for it).
    function cardSpot(sp, cw, ch, below = false, align = null) {
      const gap = 16;
      const M = 14;
      const ups = [].concat(avoid()).filter(el => el && el.isConnected).map(box).filter(a => area(a) > 0 && overlap(a, sp) < area(a) * 0.9);
      const cands = [];
      const side = below ? { right: 1, left: 2, below: 0, above: 3 } : { right: 0, left: 1, below: 2, above: 3 };
      const around = (R, rank0) => {
        const midY = sp.t + (sp.b - sp.t - ch) / 2;
        const midX = sp.l + (sp.r - sp.l - cw) / 2;
        [sp.t, midY, sp.b - ch].forEach((y, k) => {
          cands.push({ x: R.r + gap, y, rank: rank0 + side.right + k * 0.1, near: R });
          cands.push({ x: R.l - gap - cw, y, rank: rank0 + side.left + k * 0.1, near: R });
        });
        [midX, sp.l, sp.r - cw].forEach((x, k) => {
          cands.push({ x, y: R.b + gap, rank: rank0 + side.below + k * 0.1, near: R });
          cands.push({ x, y: R.t - gap - ch, rank: rank0 + side.above + k * 0.1, near: R });
        });
      };
      around(sp, 0);
      // lined up under what the step names, ahead of the other places below
      if (below && align && align.isConnected) cands.push({ x: box(align).l, y: sp.b + gap, rank: side.below - 0.05 });
      // past what's up, on the same side, comes next: a card clearing a popover slides along
      // (its distance counted from the light and what's up together) rather than jumping
      // to another side of the light
      if (ups.length) around(ups.reduce(join, sp), 0.5);
      let best = null;
      for (const c of cands) {
        const x = Math.max(M, Math.min(c.x, innerWidth - cw - M));
        const y = Math.max(M, Math.min(c.y, innerHeight - ch - M));
        const k = { l: x, t: y, r: x + cw, b: y + ch };
        let score = overlap(k, sp) * 60 + c.rank * 400 + Math.max(gap, apart(k, c.near || sp)) * 40;
        for (const u of ups) score += overlap(k, u) * 30;
        if (!best || score < best.score) best = { x, y, score };
      }
      return best;
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
      content.innerHTML = `${step.kicker ? `<p class="tour-kicker">${step.kicker}</p>` : ''}<h3 class="tour-title display">${step.title}</h3>${step.text ? `<p class="tour-text">${step.text}</p>` : ''}${tasksHtml(step, i)}`;
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
    // (once the page has finished animating what's lit, if it said so with relight)
    function settle() {
      if (ended || index < 0) return;
      const left = holdUntil - performance.now();
      if (left > 1) { reflowTimers.push(setTimeout(settle, left)); return; }
      place(steps[index]);
    }
    function reflow() {
      reflowTimers.forEach(clearTimeout);
      reflowTimers = [450, 950].map(ms => setTimeout(settle, ms));
    }

    // what's lit is about to change (see relight() above)
    const relightThis = after => {
      if (ended || index < 0 || shut) return 0;
      const step = steps[index];
      const sp = lit(step);
      const was = lastSpot;
      const grows = !!sp && !!was && (sp.l < was.l - 0.5 || sp.t < was.t - 0.5 || sp.r > was.r + 0.5 || sp.b > was.b + 0.5);
      const lead = grows && !reducedMotion() ? RELIGHT_MS : 0;
      if (grows) {
        spotClock(RELIGHT_MS, HEAVY);
        place(step);
      }
      holdUntil = Math.max(holdUntil, performance.now() + lead + after);
      reflowTimers.push(setTimeout(settle, lead + after));
      return lead;
    };
    relightTour = relightThis;

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
        if (p >= 1) setTimeout(() => {
          if (ended || index !== i || progressOf(i) < 1) return;
          // steps marked autoNext move on by themselves the moment Next has filled up
          if (steps[i].autoNext && i < steps.length - 1) { go(i + 1, 1); return; }
          setFull(true);
        }, reducedMotion() ? 0 : 420);
      };
      if (reducedMotion() || !dot) { land(); return; }
      // from the tick, along an arc above both, to where the fill is about to reach. It
      // flies inside the card (card-relative), so it still lands on Next if the card moves;
      // both ends are read every frame, so it lands on Next even while Next is on its way
      // to the card's other end.
      const spark = document.createElement('span');
      spark.className = 'tour-spark';
      spark.style.opacity = '0';
      card.appendChild(spark);
      const t0 = performance.now() + SPARK_DELAY;
      const fly = now => {
        if (!spark.isConnected) return;
        const t = Math.min(1, Math.max(0, (now - t0) / SPARK_MS));
        const c = card.getBoundingClientRect();
        const a = dot.getBoundingClientRect();
        const b = next.getBoundingClientRect();
        const x0 = a.left + a.width / 2 - c.left;
        const y0 = a.top + a.height / 2 - c.top;
        const x1 = b.left + Math.max(14, Math.min(b.width - 14, b.width * progressOf(i))) - c.left;
        const y1 = b.top + b.height / 2 - c.top;
        const cx = (x0 + x1) / 2;
        const cy = Math.min(y0, y1) - 44;
        const u = easeInOut(t);
        const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1;
        const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
        const sc = t < 0.3 ? 0.45 + (t / 0.3) * 0.8 : 1.25 - ((t - 0.3) / 0.7) * 0.6;
        const op = t < 0.12 ? t / 0.12 : t > 0.86 ? (1 - t) / 0.14 : 1;
        spark.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
        spark.style.opacity = op.toFixed(3);
        if (t < 1) requestAnimationFrame(fly);
        else spark.remove();
      };
      requestAnimationFrame(fly);
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
      holdUntil = 0;
      liveLight(step);
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
      // every try watches again, done or not (a done one can't tick twice): some set the page up as they watch
      // (Pull to close arms the gear), so a step you come back to works as it did
      watchers = (step.tasks || []).map((t, k) => t.watch(() => complete(i, k))).filter(Boolean);
      if (!root.classList.contains('on')) {
        // very first step: put the card in place before it's ever seen
        card.classList.add('instant');
        spot.classList.add('instant');
        // from the welcome, its card turns into this one: till then this card stays unseen
        // and the light shut, so nothing shows twice
        if (handoff) {
          shut = true;
          root.classList.add('handoff', 'arriving');
        }
        place(step, finalH);
        void card.offsetWidth;
        card.classList.remove('instant');
        spot.classList.remove('instant');
        if (handoff) {
          // the card shows in the frame the welcome's lands, with no fade
          const show = () => {
            card.style.transition = 'none';
            root.classList.remove('arriving');
            void card.offsetWidth;
            card.style.transition = '';
          };
          // the light opens on the welcome card's own clock, so the two arrive together
          const opens = ({ duration = 0, easing = HEAVY } = {}) => {
            shut = false;
            if (ended || index < 0) return;
            if (duration) spotClock(duration, easing);
            place(steps[index]);
          };
          if (handoff(card, { onMove: opens, onLand: show }) !== true) { opens(); show(); }
          requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('handoff')));
        }
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
      if (relightTour === relightThis) relightTour = null;
      document.removeEventListener('click', onPageClick, true);
      removeEventListener('keydown', onArrow, true);
      removeEventListener('resize', onResize);
      for (const type of ['pointerdown', 'pointerup', 'pointercancel']) removeEventListener(type, hold, true);
      root.classList.remove('on');
      root.classList.add('leaving');
      setTimeout(() => { root.remove(); resolve(result); }, reducedMotion() ? 0 : 380);
    }

    const onResize = () => { if (index >= 0) place(steps[index]); };
    addEventListener('resize', onResize);
    // The arrows are the tour's, wherever the focus is: Next and Back (a step may lend
    // them to the page instead, with arrows(dir)). Only fields that type, and the
    // layers a try opens above the tour (the limit picker, its questions, menus), keep
    // theirs. Caught before anything on the page sees them.
    const onArrow = e => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"]), .menu, .pk-layer, .gx-layer')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ended || index < 0) return;
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const step = steps[index];
      if (step.arrows) step.arrows(dir);
      else if (dir > 0) next.click();
      else if (!back.disabled) back.click();
    };
    addEventListener('keydown', onArrow, true);
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
