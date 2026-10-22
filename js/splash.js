/* Pioneer — écran d'ouverture.
   Acte 1 (CSS, base.css) : le mot-symbole se trace lettre à lettre puis s'encre.
   Acte 2 : anticipation — le p se tasse (squash) avant de partir ; les autres lettres s'effacent en décalé.
   Acte 3 : envol — le p monte en arc (X et Y sur deux courbes différentes), s'étire au départ (stretch),
   rapetisse jusqu'à la taille de l'icône, s'écrase à l'arrivée puis se pose (follow-through).
   La tuile primary pousse depuis le centre du p, cercle → carré arrondi, avec un léger rebond :
   le p devient le lettermark, à l'endroit exact de l'icône de la page. Le fond s'efface pendant le vol. */
(function () {
  'use strict';
  const el = document.getElementById('splash');
  const R = (window.R = window.R || {});
  let resolve;
  R.splash = { done: new Promise((r) => { resolve = r; }) };
  if (!el) { resolve(); return; }

  const root = document.documentElement;
  const letters = [...el.querySelectorAll('.sp-l')];
  const p = letters[0], rest = letters.slice(1);
  let fly = null;
  const finish = () => {
    root.classList.remove('splash-flying');
    el.remove(); if (fly) fly.remove();
    resolve();
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => { const m = root.dataset.motion; return m ? m === 'reduce' : matchMedia('(prefers-reduced-motion: reduce)').matches; };
  // l'app a rendu sa première page (body.ready), ou on n'attend pas plus de 3 s
  const appReady = () => new Promise((r) => {
    const t0 = performance.now();
    (function chk() { if (document.body.classList.contains('ready') || performance.now() - t0 > 3000) r(); else requestAnimationFrame(chk); })();
  });
  const tok = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const done = (anims) => Promise.all(anims.map((a) => a.finished));

  const EASE = {
    antic: 'cubic-bezier(.3, 0, .7, .2)',    // on prend son élan : départ doux, fin appuyée
    exit: 'cubic-bezier(.4, 0, 1, 1)',       // sorties : accélèrent et partent
    std: 'cubic-bezier(.2, 0, 0, 1)',        // M3 emphasized decelerate
    x: 'cubic-bezier(.5, 0, .15, 1)',        // l'horizontale démarre tard…
    y: 'cubic-bezier(.25, 0, 0, 1)',         // …la verticale tôt : la trajectoire décrit un arc
    pop: 'cubic-bezier(.3, 1.5, .5, 1)',     // ressort ζ≈.6 pour la pose
  };

  async function run() {
    await appReady();
    el.style.animation = 'none'; // le script prend la main : plus de filet de sécurité CSS
    if (!el.animate) return finish();
    if (reduced()) { // pas de trajet : le mot reste un instant, puis fondu
      await wait(260);
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished;
      return finish();
    }
    // fin de l'acte 1 (tracé + encre)
    await done(el.getAnimations({ subtree: true })).catch(() => {});
    await wait(80); // un temps de lecture

    const target = [...document.querySelectorAll('.topbar-brand .logo svg, .rail-brand .logo svg')].find((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(s).visibility !== 'hidden';
    });
    const h0 = p.getBoundingClientRect().height;

    // Acte 2 — anticipation : le p se tasse vers le sol avant de bondir
    el.style.pointerEvents = 'none';
    const antic = p.animate([{ transform: 'none' }, { transform: 'translateY(14px) scale(1.07, .88)' }],
      { duration: 150, easing: EASE.antic, fill: 'forwards' });
    const exits = rest.map((l, i) => l.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(26px) scale(.96)' }],
      { duration: 200, delay: 40 + i * 25, easing: EASE.exit, fill: 'forwards' }));
    await antic.finished;

    if (!target) { // aucune icône à l'écran : le p s'efface sur place avec le fond
      p.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px) scale(.96)' }], { duration: 220, easing: EASE.exit, fill: 'forwards' });
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: 80, easing: EASE.std, fill: 'forwards' }).finished;
      return finish();
    }

    // Acte 3 — envol : une copie de l'icône, posée à sa place finale, part de la position du p
    const r = target.getBoundingClientRect();
    const logo = target.cloneNode(true);
    logo.removeAttribute('width'); logo.removeAttribute('height');
    fly = document.createElement('div');
    fly.className = 'splash-fly';
    Object.assign(fly.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const mid = document.createElement('div'), inner = document.createElement('div');
    inner.appendChild(logo); mid.appendChild(inner); fly.appendChild(mid);
    document.body.appendChild(fly);
    const tile = logo.querySelector('rect'), fp = logo.querySelector('path');
    const a = p.getBoundingClientRect(), b = fp.getBoundingClientRect();
    const k = h0 / b.height;
    const ox = b.left + b.width / 2 - r.left, oy = b.top + b.height / 2 - r.top;
    const dx = a.left + a.width / 2 - (r.left + ox), dy = a.top + a.height / 2 - (r.top + oy);
    inner.style.transformOrigin = `${ox}px ${oy}px`;
    root.classList.add('splash-flying');
    p.style.visibility = 'hidden';

    const D = 620, kk = k + (1 - k) * 0.3;
    const anims = [
      fly.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: D, easing: EASE.x }),
      mid.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D, easing: EASE.y }),
      inner.animate([
        { transform: `scale(${k * 1.07}, ${k * 0.88})`, easing: 'cubic-bezier(.2, 0, .4, 1)' },        // sort du tassement…
        { transform: `scale(${kk * 0.9}, ${kk * 1.12})`, offset: 0.2, easing: 'cubic-bezier(.4, 0, .2, 1)' }, // …s'étire en s'élançant
        { transform: 'scale(1.08, .9)', offset: 0.8, easing: EASE.pop },                                  // s'écrase en se posant
        { transform: 'none' },
      ], { duration: D + 140 }),
      // l'encre passe de on-surface à on-primary quand la tuile arrive dessous
      fp.animate([{ fill: tok('--on-surface') }, { fill: tok('--on-primary') }], { duration: 220, delay: D * 0.5, easing: EASE.std, fill: 'backwards' }),
      // la tuile pousse depuis le centre du p : cercle → carré arrondi, petit rebond
      tile.animate([
        { transform: 'scale(0)', rx: '256px', easing: 'cubic-bezier(.3, 0, .2, 1)' },
        { transform: 'scale(1.06)', rx: '140px', offset: 0.62, easing: 'cubic-bezier(.4, 0, .4, 1)' },
        { transform: 'none', rx: '115px' },
      ], { duration: 460, delay: D * 0.42, fill: 'backwards' }),
      // le fond se lève pendant le vol : le p se pose sur la page vivante
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: D * 0.3, easing: EASE.std, fill: 'forwards' }),
    ];
    tile.style.transformOrigin = `${(ox / r.width) * 512}px ${(oy / r.height) * 512}px`;
    await done([...anims, ...exits]).catch(() => {});
    finish();
  }

  run().catch(finish);
})();
