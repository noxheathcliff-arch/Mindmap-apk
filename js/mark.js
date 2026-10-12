/* Ratio — identité visuelle d'un cours : sa couleur (un schéma Material par teinte) et ses repères
 *
 * Hors de « Mes cours » (où le cours est un dossier, js/views/library.js), un cours se reconnaît
 * à sa couleur seule : une pastille (rail, bande de révision) ou un carré tonal à son conteneur
 * portant l'icône « cours » (recherche, révision par cours, choix d'un cours).
 */
(function (R) {
  'use strict';
  const { U, store: S } = R;

  /* ---- Aléa déterministe (FNV-1a) ---- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  const SIZES = { xs: 28, sm: 32, md: 40, lg: 56 };

  /** Carré tonal du cours (conteneur du cours, icône « cours ») — size : xs | sm | md | lg */
  function mark(course, { size = 'md', hero = false } = {}) {
    const px = SIZES[size] || SIZES.md;
    const el = U.h('span.cmark', { class: 'cmark-' + size, role: 'img', 'aria-label': 'Cours : ' + course.title },
      R.icon('library', Math.round(px * 0.55)));
    if (hero) el.dataset.hero = 'course:' + course.id + ':mono';
    tint(el, course);
    return el;
  }
  /** Pastille de la couleur du cours */
  function dot(course) {
    return tint(U.h('span.cdot', { 'aria-hidden': 'true' }), course);
  }

  /* ---- Couleur d'un cours : un schéma Material par teinte (8 teintes, jamais le jaune,
     réservé au surligneur). Attribution dans l'ordre de création : chaque cours prend sa teinte
     préférée (hachage de son identifiant) si elle est libre, sinon la libre la plus éloignée.
     Stable dans le temps ; les huit premiers cours ont tous une teinte différente.
     Les rôles viennent de material-color-utilities (schéma « content » de jour, tons HCT 30/92 de
     nuit), puis chaque contenu est ajusté jusqu'à WCAG 2.2 AA + APCA Lc 75 sur son conteneur.
     [conteneur, sur-conteneur, accent, sur-accent, conteneur doux, sur-conteneur doux] */
  const HUES = [28, 58, 150, 186, 214, 248, 284, 332];
  const SCHEMES = {
    28: { l: ['#c15146', '#fffbff', '#8a2921', '#ffffff', '#ffb8af', '#0f0000'], d: ['#7a2e27', '#ffe2de', '#ffc4bc', '#4b100d', '#563c38', '#f9dcd8'] },
    58: { l: ['#b25f00', '#fffbff', '#783e00', '#ffffff', '#ffc294', '#331700'], d: ['#6e3900', '#ffe3d0', '#ffc69b', '#3d1d00', '#533e2d', '#f7dece'] },
    150: { l: ['#03873e', '#f7fff3', '#005825', '#ffffff', '#c1eec4', '#274d2f'], d: ['#005323', '#dcedd9', '#90e49d', '#002d10', '#374638', '#dbe6d8'] },
    186: { l: ['#008378', '#f4fffc', '#00564e', '#ffffff', '#bce9e1', '#1d4843'], d: ['#005049', '#d6ede8', '#6ce5d6', '#002e29', '#314643', '#d7e6e2'] },
    214: { l: ['#007f9b', '#fafdff', '#005366', '#ffffff', '#c1e9f9', '#244b57'], d: ['#004e60', '#d8ebf4', '#7ddeff', '#002a35', '#33454c', '#d8e4ea'] },
    248: { l: ['#0079c5', '#fdfcff', '#004e82', '#ffffff', '#bddafe', '#173553'], d: ['#00497b', '#dee9fa', '#b7d7ff', '#002e50', '#384350', '#dde3ee'] },
    284: { l: ['#6f68cd', '#fffbff', '#453ca0', '#ffffff', '#d4cffe', '#2c294e'], d: ['#423d86', '#eae5fb', '#d1ccff', '#211b5c', '#424051', '#e4e0ef'] },
    332: { l: ['#ab54a1', '#fffbff', '#7b2975', '#ffffff', '#ffcef3', '#522f4d'], d: ['#6d2f66', '#fbe1f2', '#ffbdf1', '#420f40', '#4e3d4a', '#f0dde9'] },
  };
  const ROLE = ['pc', 'onpc', 'pri', 'onpri', 'sc', 'onsc'];
  const paperCache = new Map();
  let hueKey = '', hueOf = new Map();
  function hueFor(course) {
    const courses = S.data.courses.slice().sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    const key = courses.map((c) => c.id).join('|');
    if (key !== hueKey) {
      hueKey = key; hueOf = new Map();
      const used = [];
      const gap = (a, b) => { const d = Math.abs(HUES[a] - HUES[b]) % 360; return Math.min(d, 360 - d); };
      for (const c of courses) {
        const pref = hash(c.id) % HUES.length;
        let best = pref;
        if (used.length && used.length < HUES.length) {
          // la teinte libre la plus éloignée de celles déjà prises (égalité : ordre préféré)
          let bestD = -1;
          for (let k = 0; k < HUES.length; k++) {
            const i = (pref + k) % HUES.length;
            if (used.includes(i)) continue;
            const d = Math.min(...used.map((u) => gap(i, u)));
            if (d > bestD) { bestD = d; best = i; }
          }
        }
        used.push(best);
        hueOf.set(c.id, HUES[best]);
      }
    }
    return hueOf.get(course.id) ?? HUES[hash(course.id) % HUES.length];
  }
  /** Variables CSS du schéma du cours (clair et sombre ; le thème est résolu en CSS, classe .paper) */
  function paper(course) {
    const hue = hueFor(course);
    if (paperCache.has(hue)) return paperCache.get(hue);
    const sc = SCHEMES[hue];
    const style = {};
    ROLE.forEach((r, i) => { style[`--c-${r}-l`] = sc.l[i]; style[`--c-${r}-d`] = sc.d[i]; });
    paperCache.set(hue, style);
    return style;
  }
  /** Applique le schéma du cours à un élément (variables CSS, thème géré en CSS) */
  function tint(el, course) {
    for (const [k, v] of Object.entries(paper(course))) el.style.setProperty(k, v);
    el.classList.add('paper');
    return el;
  }
  /** Les mêmes rôles, prêts pour app.setActions({ style }) : la barre d'actions prend la couleur du cours */
  function vars(course) { return paper(course); }

  R.courseArt = { mark, dot, tint, paper, vars };
})(window.R);
