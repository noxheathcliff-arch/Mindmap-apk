/* Ratio — identité visuelle d'un cours : dossier (forme), empreinte générative, schéma de couleur Material
 *
 * L'empreinte est dessinée à partir de la vraie structure du cours : un centre, une branche
 * par carte (plus longue quand la carte grossit), des points pour ses nœuds, et en surligneur
 * la branche qui a le plus de fiches à réviser. La silhouette (orientation, écarts) ne dépend
 * que des identifiants : elle reste reconnaissable d'une visite à l'autre et se densifie
 * à mesure que le cours grandit. Aucun asset : du SVG généré, qui suit le thème (currentColor).
 */
(function (R) {
  'use strict';
  const { U, store: S } = R;

  /* ---- Aléa déterministe (FNV-1a + xorshift) ---- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function rng(seed) {
    let x = hash(seed) || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
  }

  const SIZES = { xs: 28, sm: 32, md: 44, lg: 72 };
  const MAX_BRANCHES = 12;

  /** Géométrie de l'empreinte (indépendante de la taille d'affichage) */
  function geometry(course) {
    const maps = S.mapsOf(course.id).slice().sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    const r = rng(course.id);
    const offset = r() * Math.PI * 2;
    const list = maps.slice(0, MAX_BRANCHES);
    let hot = -1, hotDue = 0;
    const branches = list.map((m, i) => {
      const rb = rng(m.id);
      const st = S.mapStats(m);
      if (st.due > hotDue && st.reviewable) { hotDue = st.due; hot = i; }
      const a = offset + (i / list.length) * Math.PI * 2 + (rb() - 0.5) * (list.length > 2 ? 0.32 : 0.8);
      // longueur : grandit avec le contenu (log), bornée pour rester dans le sceau (r 46)
      const len = 22 + Math.min(10, Math.log2(st.nodes + 1) * 2.4) + rb() * 2;
      const bend = (rb() - 0.5) * 14;
      const ex = 50 + Math.cos(a) * len, ey = 50 + Math.sin(a) * len;
      const mx = 50 + Math.cos(a) * len * 0.5 + Math.cos(a + Math.PI / 2) * bend;
      const my = 50 + Math.sin(a) * len * 0.5 + Math.sin(a + Math.PI / 2) * bend;
      const leaves = [];
      const count = Math.max(0, Math.min(5, Math.round(Math.log2(st.nodes + 1)) - 1));
      for (let k = 0; k < count; k++) {
        const la = a + (rb() - 0.5) * 1.3, ll = len + 3 + rb() * 7;
        leaves.push({ x: 50 + Math.cos(la) * ll, y: 50 + Math.sin(la) * ll, r: 1.3 + rb() * 1.2 });
      }
      return { d: `M50 50Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, ex, ey, leaves };
    });
    return { branches, hot, more: Math.max(0, maps.length - list.length) };
  }

  /**
   * Dossier d'un cours → <span class="cmark"> contenant un SVG (direction « Barre contextuelle »).
   * L'onglet prend l'accent du cours, le rabat son conteneur ; sur les grandes tailles (md, lg),
   * l'empreinte du cours (une branche par carte) est tracée dans le rabat, à l'encre du conteneur.
   * size : xs | sm | md | lg ; draw : jouer le tracé (première apparition seulement)
   */
  const FOLDER_BACK = 'M6 24a9 9 0 0 1 9-9h19.5c2.5 0 4.8 1 6.5 2.8l4.2 4.4c1 1 2.3 1.6 3.7 1.6H85a9 9 0 0 1 9 9v44a9 9 0 0 1-9 9H15a9 9 0 0 1-9-9z';
  const FOLDER_FRONT = 'M6 39a9 9 0 0 1 9-9h70a9 9 0 0 1 9 9v38a9 9 0 0 1-9 9H15a9 9 0 0 1-9-9z';
  function mark(course, { size = 'md', draw = false, hero = false } = {}) {
    const px = SIZES[size] || SIZES.md;
    const big = px >= 44;
    const parts = [`<path class="mk-back" d="${FOLDER_BACK}"/>`, `<path class="mk-front" d="${FOLDER_FRONT}"/>`];
    const g = geometry(course);
    if (big && g.branches.length) {
      // l'empreinte, réduite et centrée dans le rabat (centre 50,58 ; rayon utile ≈ 22)
      parts.push('<g class="mk-print" transform="translate(50 58) scale(.4) translate(-50 -50)">');
      g.branches.forEach((b, i) => {
        const hot = i === g.hot;
        parts.push(`<path class="mk-b${hot ? ' mk-hot' : ''}" d="${b.d}" pathLength="1" stroke-width="${hot ? 6 : 4.2}" style="--k:${i}"/>`);
        parts.push(`<circle class="mk-e${hot ? ' mk-hot' : ''}" cx="${b.ex.toFixed(1)}" cy="${b.ey.toFixed(1)}" r="${hot ? 7 : 5.5}" style="--k:${i}"/>`);
      });
      parts.push('<circle class="mk-c" cx="50" cy="50" r="10"/></g>');
    }
    const label = g.branches.length ? `Dossier du cours : ${U.plural(g.branches.length + g.more, 'carte')}` : 'Dossier du cours : aucune carte';
    const el = U.h('span.cmark', { class: 'cmark-' + size + (draw ? ' draw' : ''), role: 'img', 'aria-label': label });
    if (hero) el.dataset.hero = 'course:' + course.id + ':mono';
    el.innerHTML = `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">${parts.join('')}</svg>`;
    tint(el, course);
    return el;
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

  R.courseArt = { mark, tint, paper, vars };
})(window.R);
