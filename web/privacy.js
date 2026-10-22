/*! Made with care and love by Mina Vian */
// The privacy page and How Memoir works: the report's cursor and scrolling, the live clock
// beside the name, the text popping on, and (privacy) the address to copy, the same popover
// as the report's "Made by".

import { initCursor } from './shared/cursor.js';
import { initSmoothScrolling } from './shared/scroll.js';
import { playLogo } from './shared/logo.js';
import { mailPop } from './shared/mail-pop.js';

initSmoothScrolling();
initCursor();
playLogo(document.querySelector('.brand .logo'), { delay: 160, live: true });
// How Memoir works: the big clock under "The clock is real" sweeps in to the time once it's seen
const big = document.querySelector('.hw-clock .logo');
if (big) {
  if (!('IntersectionObserver' in window)) playLogo(big, { live: true });
  else {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      playLogo(big, { delay: 120, live: true });
    }, { threshold: 0.4 });
    io.observe(big);
  }
}
const mail = document.getElementById('mail');
if (mail) mailPop(mail, document.getElementById('mail-pop'), { address: 'iamminavian@gmail.com', dismiss: true });

// The text pops on: the headline word by word, then each heading, paragraph and point as
// it comes into view; those that come into view together go one after another
// (the page starts hidden for it: <html class="pv-pop">)
if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
  document.documentElement.classList.remove('pv-pop');
} else {
  // (from here the script reveals each part: the fallback that shows everything is off)
  document.documentElement.classList.add('armed');
  const h1 = document.querySelector('h1');
  h1.innerHTML = h1.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
  h1.classList.add('split');
  const parts = [...document.querySelectorAll('.brand, .kicker, h1 .w, .lead, .when, h2, main > p, li')];
  const seen = new IntersectionObserver(entries => {
    const now = entries.filter(e => e.isIntersecting).map(e => e.target).sort((a, b) => parts.indexOf(a) - parts.indexOf(b));
    now.forEach((el, i) => {
      el.style.setProperty('--d', `${Math.min(i, 14) * 55}ms`);
      el.classList.add('on');
      seen.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  for (const el of parts) seen.observe(el);
}
