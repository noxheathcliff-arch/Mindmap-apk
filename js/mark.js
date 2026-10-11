/* Ratio — identité visuelle d'un cours : empreinte générative + teinte « papier »
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
   * Empreinte d'un cours → <span class="cmark"> contenant un SVG.
   * size : xs | sm | md | lg ; draw : jouer le tracé (première apparition seulement)
   */
  function mark(course, { size = 'md', draw = false, hero = false } = {}) {
    const g = geometry(course);
    const px = SIZES[size] || SIZES.md;
    const small = px <= 32;
    const w = small ? 2.6 : 1.8, wHot = small ? 3.4 : 3;
    const parts = [];
    if (!g.branches.length) {
      parts.push('<circle class="mk-ring" cx="50" cy="50" r="44" pathLength="1"/>');
    } else {
      // le sceau : un cadre discret, même silhouette pour tous les cours, quelle que soit leur taille
      parts.push(`<circle class="mk-frame" cx="50" cy="50" r="46" stroke-width="${small ? 2.4 : 1.4}"/>`);
      g.branches.forEach((b, i) => {
        const hot = i === g.hot;
        const cls = hot ? ' mk-hot' : '';
        // branche à réviser : un trait de surligneur passe sous l'encre (signature de l'appli)
        if (hot) parts.push(`<path class="mk-hl" d="${b.d}" pathLength="1" stroke-width="${small ? 11 : 9}" style="--k:${i}"/>`);
        parts.push(`<path class="mk-b${cls}" d="${b.d}" pathLength="1" stroke-width="${hot ? wHot : w}" style="--k:${i}"/>`);
        if (!small) for (const l of b.leaves) parts.push(`<circle class="mk-l${cls}" cx="${l.x.toFixed(1)}" cy="${l.y.toFixed(1)}" r="${l.r.toFixed(1)}" style="--k:${i}"/>`);
        parts.push(`<circle class="mk-e${cls}" cx="${b.ex.toFixed(1)}" cy="${b.ey.toFixed(1)}" r="${small ? 4.5 : 3.2}" style="--k:${i}"/>`);
      });
    }
    parts.push(`<circle class="mk-c" cx="50" cy="50" r="${small ? 9 : 7}"/>`);
    const label = g.branches.length
      ? `Empreinte du cours : ${U.plural(g.branches.length + g.more, 'carte')}`
      : 'Empreinte du cours : aucune carte';
    const el = U.h('span.cmark', { class: 'cmark-' + size + (draw ? ' draw' : ''), role: 'img', 'aria-label': label });
    if (hero) el.dataset.hero = 'course:' + course.id + ':mono';
    el.innerHTML = `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">${parts.join('')}</svg>`;
    return el;
  }

  /* ---- Teinte « papier » du cours : 8 teintes, jamais le jaune (réservé au surligneur) ----
     Attribution dans l'ordre de création : chaque cours prend sa teinte préférée (hachage de
     son identifiant) si elle est libre, sinon la suivante. Stable dans le temps, et les huit
     premiers cours ont tous une teinte différente. */
  const HUES = [28, 58, 150, 186, 214, 248, 284, 332];
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
  function paper(course) {
    const hue = hueFor(course);
    if (paperCache.has(hue)) return paperCache.get(hue);
    const C = R.colors;
    const mk = (L, c) => C.oklchToHex({ L, C: c, h: hue });
    const light = { bg: mk(0.952, 0.032), line: mk(0.86, 0.045) };
    light.ink = C.ensureContrast(mk(0.34, 0.075), light.bg, 7).hex;
    light.sub = C.ensureContrast(mk(0.46, 0.06), light.bg, 4.5).hex;
    const dark = { bg: mk(0.275, 0.03), line: mk(0.37, 0.04) };
    dark.ink = C.ensureContrast(mk(0.9, 0.05), dark.bg, 7).hex;
    dark.sub = C.ensureContrast(mk(0.78, 0.05), dark.bg, 4.5).hex;
    const style = {
      '--paper-l': light.bg, '--paper-line-l': light.line, '--paper-ink-l': light.ink, '--paper-sub-l': light.sub,
      '--paper-d': dark.bg, '--paper-line-d': dark.line, '--paper-ink-d': dark.ink, '--paper-sub-d': dark.sub,
    };
    paperCache.set(hue, style);
    return style;
  }
  /** Applique la teinte papier à un élément (variables CSS, thème géré en CSS) */
  function tint(el, course) {
    for (const [k, v] of Object.entries(paper(course))) el.style.setProperty(k, v);
    el.classList.add('paper');
    return el;
  }

  R.courseArt = { mark, tint, paper };
})(window.R);
