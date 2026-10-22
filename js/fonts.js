/* Pioneer — polices des cartes : chargement à la demande (Google Fonts) et pile CSS d'une clé de R.store.FONTS */
(function (R) {
  'use strict';
  const asked = new Set();
  const waiters = new Set();

  /** Pile CSS de la police : nom, puis repli */
  function family(key) {
    const f = R.store.FONTS[key] || R.store.FONTS.jakarta;
    return `"${f.name}", ${f.fb}`;
  }

  /** Injecte la feuille de la police une seule fois ; prévient les abonnés quand les glyphes sont prêts (remesure) */
  function ensure(key) {
    const f = R.store.FONTS[key];
    if (!f || asked.has(key)) return;
    asked.add(key);
    if (f.spec) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${f.spec}&display=swap`;
      document.head.appendChild(link);
    }
    if (!document.fonts || !document.fonts.load) return;
    Promise.all([document.fonts.load(`400 16px "${f.name}"`), document.fonts.load(`700 16px "${f.name}"`)])
      .then(() => { for (const fn of waiters) fn(key); })
      .catch(() => {});
  }

  /** fn(key) appelée quand une police vient d'arriver ; renvoie de quoi se désabonner */
  function onLoad(fn) { waiters.add(fn); return () => waiters.delete(fn); }

  /** Charge toutes les polices (aperçu du sélecteur) */
  function ensureAll() { for (const k of Object.keys(R.store.FONTS)) ensure(k); }

  R.fonts = { family, ensure, ensureAll, onLoad };
})(window.R);
