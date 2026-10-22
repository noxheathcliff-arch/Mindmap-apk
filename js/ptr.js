/* Pioneer — tirer pour recharger (M3).
   Le défilement vit dans .page-scroll et l'app tourne en standalone : le geste natif n'existe pas, on le refait.
   Un disque surface-container-high descend avec le doigt (résistance élastique) ; l'arc se remplit et tourne
   avec la traction. Au seuil : petit pop + vibration. Relâché au-delà : l'arc tourne en continu, puis la page
   se recharge (l'écran d'ouverture prend le relais). Relâché avant : retour sur ressort. */
(function () {
  'use strict';
  const R = (window.R = window.R || {});
  const MAX = 128, TH = 80, REST = 64; // course maximale, seuil, position d'attente (px)
  let el, arc, st = null, busy = false;

  function build() {
    el = document.createElement('div');
    el.className = 'ptr'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24"><circle class="ptr-arc" cx="12" cy="12" r="8" pathLength="100"/></svg>';
    arc = el.querySelector('.ptr-arc');
    document.body.appendChild(el);
  }
  const reduced = () => document.documentElement.dataset.motion === 'reduce';
  // résistance : linéaire au début, s'aplatit vers MAX
  const rubber = (dy) => MAX * (1 - Math.exp(-dy / (MAX * 1.4)));
  function paint(d) {
    const p = Math.min(d / TH, 1);
    el.style.transform = `translate(-50%, ${d - 48}px) scale(${0.6 + 0.4 * Math.min(d / (TH * 0.6), 1)})`;
    el.style.opacity = Math.min(d / 32, 1);
    arc.style.strokeDasharray = `${4 + p * 76} 100`;
    arc.style.transform = reduced() ? '' : `rotate(${-90 + d * 2.4}deg)`;
    el.classList.toggle('armed', d >= TH);
  }
  function blocked(t) {
    return busy || document.getElementById('splash') ||
      document.querySelector('dialog[open], .scrim, .menu.open, .sheet.open') ||
      (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], .no-ptr'));
  }

  document.addEventListener('touchstart', (e) => {
    st = null;
    if (e.touches.length !== 1 || blocked(e.target)) return;
    const sc = e.target instanceof Element && e.target.closest('.page-scroll');
    if (!sc || sc.scrollTop > 0) return;
    st = { sc, x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, d: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.on) {
      if (dy < 0 || Math.abs(dx) > Math.abs(dy) || st.sc.scrollTop > 0) { st = null; return; }
      if (dy < 10) return;
      st.on = true; st.y += 10; // on part de zéro une fois le geste reconnu
      if (!el) build();
      el.getAnimations().forEach((a) => a.cancel());
      el.classList.remove('spin', 'armed');
    }
    if (e.cancelable) e.preventDefault();
    const d = rubber(Math.max(0, t.clientY - st.y));
    if (d >= TH && st.d < TH && navigator.vibrate) navigator.vibrate(8);
    st.d = d; paint(d);
  }, { passive: false });

  function end() {
    if (!st || !st.on) { st = null; return; }
    const d = st.d; st = null;
    const from = el.style.transform;
    if (d >= TH) {
      busy = true;
      const to = `translate(-50%, ${REST - 48}px) scale(1)`;
      el.style.transform = to; el.classList.remove('armed'); el.classList.add('spin');
      arc.style.transform = ''; arc.style.strokeDasharray = '';
      el.animate([{ transform: from }, { transform: to }], { duration: 360, easing: 'cubic-bezier(.3, 1.25, .5, 1)' });
      // le service worker vérifie s'il y a une nouvelle version pendant que l'arc tourne
      const upd = navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}) : Promise.resolve();
      Promise.all([upd, new Promise((r) => setTimeout(r, 650))]).then(() => location.reload());
    } else {
      const to = 'translate(-50%, -48px) scale(.6)';
      el.style.transform = to; el.style.opacity = 0;
      el.animate([{ transform: from, opacity: Math.min(d / 32, 1) }, { transform: to, opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.2, 0, 0, 1)' });
    }
  }
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  R.ptr = { MAX, TH };
})();
