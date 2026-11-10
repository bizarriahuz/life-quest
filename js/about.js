// About page: theme swatches (from the app's own list) and the GSAP motion.
// Motion is one moment: the example day's XP ticks in line by line and fills the level bar.
// The only other motion is the stat bars filling once, when you scroll to them.
// With "reduce motion" on, or if GSAP doesn't load, everything is simply shown as it ends.
import { THEMES } from './theme.js';

const sw = document.getElementById('swatches');
if (sw) sw.innerHTML = THEMES.map((t) => `<div class="sw${t.id === 'obsidian' ? ' here' : ''}" style="--b:${t.swatch[0]};--a:${t.swatch[2]};--t:${t.swatch[3]}"><div class="chip"><i></i><i></i></div><span>${t.label}</span></div>`).join('');

const { gsap, ScrollTrigger } = window;
if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const rows = gsap.utils.toArray('.ledger li');
    const xpOut = document.querySelector('.lv-xp');
    const lvNum = document.querySelector('.lv-num');
    const lvUp = document.querySelector('.levelup');
    const bar = document.querySelector('.lv-bar');
    let xp = 0;
    lvNum.textContent = '6';
    xpOut.textContent = '0 XP today';

    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from(['.brand', '.h-title', '.h-tag', '.h-lede', '.h-ctas'], { y: 16, autoAlpha: 0, duration: 0.6, stagger: 0.07 });
    gsap.set(bar, { scaleX: 0.55 });
    gsap.set(lvUp, { autoAlpha: 0 });
    // The day plays when the card is on screen: straight away on a laptop, on scroll on a phone.
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: '.ledger', start: 'top 85%', once: true } });
    tl.from('.ledger', { y: 24, autoAlpha: 0, duration: 0.7 }, 0.15)
      .from(rows, { autoAlpha: 0, x: -10, duration: 0.35, stagger: 0.28 }, 0.6);
    rows.forEach((li, i) => {
      const add = Number(li.querySelector('.xp').dataset.xp) || 0;
      tl.add(() => { xp += add; xpOut.textContent = `${xp} XP today`; }, 0.7 + i * 0.28);
      tl.to(bar, { scaleX: 0.55 + (0.45 * (i + 1)) / rows.length, duration: 0.3, ease: 'power2.out' }, 0.7 + i * 0.28);
    });
    const end = 0.6 + rows.length * 0.28 + 0.25;
    tl.add(() => { lvNum.textContent = '7'; }, end)
      .fromTo('.lvl-row b', { scale: 1 }, { scale: 1.06, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out', transformOrigin: 'left center' }, end)
      .to(lvUp, { autoAlpha: 1, duration: 0.3 }, end + 0.05);

    gsap.from('.stats .bar i', {
      scaleX: 0, duration: 0.8, ease: 'power2.out', stagger: 0.06,
      scrollTrigger: { trigger: '.stats', start: 'top 80%', once: true },
    });
    // Back to the true numbers if the person leaves mid-way (or the media query flips).
    return () => { lvNum.textContent = '7'; xpOut.textContent = '111 XP today'; };
  });
}
