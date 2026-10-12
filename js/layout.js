/* Ratio — moteur de rangement (v2)
   Loi de Tesler : c'est l'application qui absorbe la complexité de la disposition.

   Ce que l'on optimise, dans l'ordre (études de lisibilité des diagrammes) :
   1. aucun lien ne traverse un nœud, aucun libellé ne masque un texte ;
   2. le moins de croisements possible (Purchase 1997 : l'esthétique qui pèse le plus sur la
      compréhension ; Ware et al. 2002 : croisements et continuité des chemins) ;
   3. un sens de lecture constant : l'ordre des frères = l'ordre du cours (jamais permuté),
      groupes séparés par l'espace (proximité, Gestalt), structure plus aérée ;
   4. une carte lisible d'un coup d'œil sur l'écran réel (échelle d'ajustement).

   Trois dispositions candidates, notées puis comparées :
   - « droite » : arbre horizontal (lecture gauche → droite, haut → bas) — la plus familière ;
   - « centrée » : racine au centre, branches de part et d'autre, ordre horaire (convention
     des cartes mentales), utile quand la racine a beaucoup de branches ;
   - « pyramide » : de haut en bas, pour les petites hiérarchies larges et peu profondes.
   Les frères sont empilés par contours (Reingold–Tilford, tailles variables, van der Ploeg
   2014) : un petit sous-arbre se glisse à côté d'un grand sans espace perdu. */
(function (R) {
  'use strict';

  /* Paramètres — valeurs réglées sur le banc d'essai (16 cartes réelles + cartes générées) */
  const P = {
    depthGap: 88,     // parent → enfants (droite / centrée) : place pour les libellés
    downGap: 60,      // pyramide : entre deux niveaux
    leafGap: 10,      // entre deux feuilles sœurs
    sibGap: 18,       // entre deux sœurs qui ont des enfants
    structGap: 34,    // entre deux branches de structure (leçons, sections)
    cousinGap: 24,    // entre deux groupes voisins, aux niveaux plus profonds
    downSibGap: 22,   // pyramide : entre deux sœurs
    rootGap: 72,      // entre deux arbres indépendants
    w: {              // poids de la note globale (plus bas = mieux)
      // échelle commune : 1 croisement ≈ 300 px de renvoi à suivre des yeux (Ware et al. 2002 :
      // longueur et croisements pèsent sur le suivi d'un chemin) ; 1 nœud traversé ≈ 5 croisements
      hit: 60,        // lien qui traverse un nœud (masque un texte)
      cross: 12,      // croisement entre un renvoi et un autre lien
      label: 25,      // libellé qui recouvre un nœud ou un autre libellé
      len: 4,         // longueur des renvois (par 100 px)
      fit: 50,        // -log(échelle d'ajustement) : passer de 50 % à 80 % vaut ~2 croisements
      amb: 4,         // voisins de colonne de groupes différents trop proches (proximité ambiguë)
      seq: 12,        // bonus par étape rangée en séquence (méthode, chronologie)
      reach: 1.5,     // arcs hiérarchiques très longs (par 100 px au-delà de 220 px)
      aspect: 6,      // écart de forme avec l'écran (|log| du rapport des proportions)
      mode: { right: 0, balanced: 15, down: 10 }, // familiarité : l'arbre horizontal d'abord
    },
  };
  // rôle de lecture de chaque type : structure, contenu, appui (exemple, source…), synthèse
  P.satIndent = 18;   // un appui (exemple, arrêt, citation…) se décale comme une annotation
  P.satGap = 6;       // deux appuis consécutifs se serrent (ils forment un bloc)
  P.summaryGap = 26;  // « À retenir » se détache de ce qui précède
  P.seq = 1;          // séquences (méthodes, chronologies) en ligne
  const SUPPORT = new Set(['exemple', 'juris', 'doctrine', 'texte', 'citation', 'personne', 'etude']);
  const role = (n) => (!n ? 'core' : R.store.TYPES[n.type] && R.store.TYPES[n.type].rank ? 'struct' : n.type === 'retenir' ? 'summary' : SUPPORT.has(n.type) ? 'support' : 'core');
  /** Espace de recherche de l'optimiseur : chaque disposition est affinée sur ces réglages */
  const SEARCH = {
    depthGap: [72, 88, 108],
    cousinGap: [18, 24, 34],
    leafGap: [8, 10, 14],
    structGap: [26, 34, 46],
    satIndent: [0, 18, 28],
    seq: [1, 0],
  };
  const GAP_X = P.depthGap, GAP_Y = 16, GAP_ROOT = P.rootGap; // compatibilité
  const STACK = { indent: 28, top: 18, gap: 8, spine: 14 }; // pyramide : feuilles en colonne sous le parent
  const SEQ = { gap: 34 }; // séquence : écart entre deux étapes (place pour la flèche)

  /** Gabarits typographiques par type (largeur moyenne d'un caractère, marges, interligne) —
      reflètent editor.css ; les nœuds de structure sont plus grands (hiérarchie visuelle). */
  const METRICS = {
    chapitre: { cw: 12.2, pad: 48, lh: 32, base: 36, min: 200, max: 340, bar: 10 },
    lecon:    { cw: 10.6, pad: 41, lh: 28, base: 31, min: 160, max: 320, bar: 10 },
    section:  { cw: 8.6,  pad: 35, lh: 22, base: 25, min: 120, max: 280, bar: 10 },
    notion:   { cw: 8.4,  pad: 43, lh: 24, base: 27, min: 64,  max: 260, bar: 0 },
    chiffre:  { cw: 9.6,  pad: 33, lh: 26, base: 22, min: 64,  max: 260, bar: 0 },
  };
  const BASE = { cw: 7.4, pad: 31, lh: 20, base: 22, min: 64, max: 260, bar: 0 };

  /** Estimation de taille hors DOM (seed, import, vignettes) */
  function estimate(n) {
    const M = METRICS[n.type] || BASE;
    const len = (n.title || 'Sans titre').length;
    const w = Math.min(M.max, Math.max(M.min, len * M.cw + M.pad));
    const perLine = Math.max(8, Math.floor((w - M.pad) / M.cw));
    const lines = Math.max(1, Math.ceil(len / perLine));
    const top = (R.store.TYPES[n.type].kicker || n.note || (n.review && n.review.rating)) ? 18 : 0;
    const h = M.base + top + lines * M.lh + M.bar;
    return { w, h };
  }
  const labelSize = (text) => ({ w: Math.round(String(text).length * 6.3 + 18), h: 19 });

  /* ------------------------------------------------------------------ */
  /* Géométrie des liens (partagée par l'éditeur, les vignettes et la note) */
  /* ------------------------------------------------------------------ */
  const DIRS = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] };
  function sidePoint(n, s, side) {
    if (side === 'r') return [n.x + s.w, n.y + s.h / 2];
    if (side === 'l') return [n.x, n.y + s.h / 2];
    if (side === 'b') return [n.x + s.w / 2, n.y + s.h];
    return [n.x + s.w / 2, n.y];
  }
  /** Cubique p1 → p2, tangentes d1 (sortie) et d2 (entrée), longueur des poignées c */
  function cubic(p1, d1, p2, d2, c) {
    const c1 = [p1[0] + d1[0] * c, p1[1] + d1[1] * c];
    const c2 = [p2[0] + d2[0] * c, p2[1] + d2[1] * c];
    const at = (t) => {
      const u = 1 - t;
      return [
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ];
    };
    return { p1, p2, d1, d2, c1, c2, at, d: `M${p1[0]},${p1[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}` };
  }
  const handle = (p1, p2) => Math.max(24, Math.min(140, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.45));
  function sample(cv, n = 16) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(cv.at(i / n));
    return pts;
  }
  const polyLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

  /** Pyramide : enfant rangé en colonne sous son parent (liste de feuilles) */
  const stacked = (a, sa, b) => b.y >= a.y + sa.h - 1 && b.x >= a.x + 4 && b.x <= a.x + STACK.indent + 20;
  /** Côtés d'attache d'un lien hiérarchique, selon la disposition */
  function treeSides(mode, a, sa, b, sb) {
    if (mode === 'down') return stacked(a, sa, b) ? ['b', 'l'] : b.y + sb.h / 2 >= a.y + sa.h / 2 ? ['b', 't'] : ['t', 'b'];
    const gap = 6;
    if (b.x >= a.x + sa.w + gap) return ['r', 'l'];
    if (b.x + sb.w <= a.x - gap) return ['l', 'r'];
    return b.y + sb.h / 2 > a.y + sa.h / 2 ? ['b', 't'] : ['t', 'b'];
  }
  /**
   * Polyligne à coins arrondis (connecteurs d'organigramme) : { d, at(t) } comme une courbe.
   * pts : sommets ; r : rayon des coins.
   */
  function elbow(pts, r = 10) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      if (rr < 0.5) { d += ` L${b[0]},${b[1]}`; continue; }
      const p = [b[0] - ((b[0] - a[0]) / l1) * rr, b[1] - ((b[1] - a[1]) / l1) * rr];
      const q = [b[0] + ((c[0] - b[0]) / l2) * rr, b[1] + ((c[1] - b[1]) / l2) * rr];
      d += ` L${p[0]},${p[1]} Q${b[0]},${b[1]} ${q[0]},${q[1]}`;
    }
    const z = pts[pts.length - 1];
    d += ` L${z[0]},${z[1]}`;
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
    const at = (t) => {
      let k = t * total;
      for (let i = 0; i < segs.length; i++) {
        if (k <= segs[i] || i === segs.length - 1) { const f = segs[i] ? Math.min(1, k / segs[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
        k -= segs[i];
      }
      return z;
    };
    return { d, at, p1: pts[0], p2: z };
  }
  /** Pyramide : parent → bus horizontal à mi-hauteur → enfant (bus partagé par les frères) */
  function busDown(p1, p2, busY) {
    if (Math.abs(p1[0] - p2[0]) < 1) return elbow([p1, p2]);
    return elbow([p1, [p1[0], busY], [p2[0], busY], p2]);
  }

  /**
   * Séquences repérées sur la carte (enfants alignés en ligne à droite du parent) :
   * enfant → frère précédent. at : id → {x, y, w, h}.
   */
  function sequencePrev(map, at, mode = map.layout) {
    const out = new Map();
    if (mode === 'down') return out;
    const kids = new Map();
    for (const e of map.edges) if (e.kind === 'tree') { if (!kids.has(e.from)) kids.set(e.from, []); kids.get(e.from).push(e.to); }
    for (const [pid, ids] of kids) {
      if (ids.length < 3) continue;
      const p = at.get(pid);
      const ks = ids.map((i) => at.get(i));
      if (!p || ks.some((k) => !k)) continue;
      if (ks.some((k) => Math.abs(k.y - ks[0].y) > 1 || k.x < p.x + p.w)) continue;
      ks.sort((a, b) => a.x - b.x);
      for (let i = 1; i < ks.length; i++) out.set(ks[i].id, ks[i - 1].id);
    }
    return out;
  }
  /** Dent de peigne : parent → épine (mi-chemin de la colonne des enfants) → enfant */
  function combTooth(a, kids, b) {
    const left = b.x < a.x;
    const col = left ? Math.max(...kids.map((k) => k.x + k.w)) : Math.min(...kids.map((k) => k.x));
    const p1 = [left ? a.x : a.x + a.w, a.y + a.h / 2];
    const x = left ? Math.min(p1[0] - 14, col + 30) : Math.max(p1[0] + 14, col - 30);
    const y = b.y + b.h / 2;
    const tx = left ? b.x + b.w : b.x;
    return elbow(Math.abs(y - p1[1]) < 1 ? [p1, [tx, y]] : [p1, [x, p1[1]], [x, y], [tx, y]], 12);
  }

  /** Courbe d'un lien hiérarchique (ou d'un lien sans contrainte) */
  function treeCurve(mode, a, sa, b, sb) {
    const [s1, s2] = treeSides(mode, a, sa, b, sb);
    if (mode === 'down') {
      if (stacked(a, sa, b)) {
        const x = a.x + STACK.spine, y = b.y + sb.h / 2;
        return elbow([[x, a.y + sa.h], [x, y], [b.x, y]], 8);
      }
      const p1 = sidePoint(a, sa, s1), p2 = sidePoint(b, sb, s2);
      return busDown(p1, p2, p1[1] + (p2[1] - p1[1]) / 2);
    }
    const p1 = sidePoint(a, sa, s1), p2 = sidePoint(b, sb, s2);
    return cubic(p1, DIRS[s1], p2, DIRS[s2], handle(p1, p2));
  }

  const inRect = (p, r, pad) => p[0] > r.x - pad && p[0] < r.x + r.w + pad && p[1] > r.y - pad && p[1] < r.y + r.h + pad;
  function segCross(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function polyCross(A, B) {
    let n = 0;
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) if (segCross(A[i], A[i + 1], B[j], B[j + 1])) n++;
    return n;
  }
  /** Nombre de nœuds (hors extrémités) traversés par une polyligne */
  function nodeHits(pts, rects, skip, pad = 5) {
    let n = 0;
    for (const r of rects) {
      if (skip.has(r.id)) continue;
      if (pts.some((p) => inRect(p, r, pad))) n++;
    }
    return n;
  }

  /**
   * Trajet d'un renvoi : 16 combinaisons de côtés d'attache (dont les arcs « par le côté »
   * qui contournent une colonne), notées sur les nœuds traversés, les croisements avec les
   * autres liens et la longueur. ctx : { rects:[{id,x,y,w,h}], polys:[{pts, ends:Set}], fast }
   */
  function route(a, sa, b, sb, ctx = {}) {
    const rects = ctx.rects || [];
    const skip = new Set([a.id, b.id]);
    const cands = [];
    const ca = [a.x + sa.w / 2, a.y + sa.h / 2], cb = [b.x + sb.w / 2, b.y + sb.h / 2];
    const busyAt = (id, side) => !!(ctx.busy && (ctx.busy.get(id) || '').includes(side));
    const add = (cv, pts, s1, s2, style) => {
      const hits = style === 'elbow' ? orthHits(cv.pts, rects, skip) : nodeHits(pts, rects, skip);
      const len = polyLen(pts);
      const vert = (s1 === 't' || s1 === 'b') + (s2 === 't' || s2 === 'b');
      // un renvoi n'arrive pas par le côté où arrive la hiérarchie : on ne le confond pas avec un parent
      const busy = (busyAt(a.id, s1) && !ctx.fromJ) + busyAt(b.id, s2);
      const bends = style === 'elbow' ? cv.pts.length - 2 : 0;
      // style : renvois orthogonaux à coins arrondis (distincts des courbes de la hiérarchie)
      cands.push({ cv, pts, hits, len, cost: hits * 10000 + len + vert * 10 + busy * 240 + bends * 18 + (style === 'curve' ? 120 : 0) });
    };
    for (const s1 of ctx.side || 'rlbt') for (const s2 of 'rlbt') {
      const p1 = sidePoint(a, sa, s1), p2 = sidePoint(b, sb, s2);
      const d1 = DIRS[s1], d2 = DIRS[s2];
      const h1 = s1 === 'r' || s1 === 'l', h2 = s2 === 'r' || s2 === 'l';
      // sortie et entrée dans le bon sens (pas de demi-tour contre son propre nœud)
      const out = (p, d, q) => (q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1];
      let pts = null;
      if (s1 === s2) {
        // crochet par le couloir libre le plus proche, du côté choisi
        const horiz = h1;
        const sgn = s1 === 'r' || s1 === 'b' ? 1 : -1;
        const base = sgn > 0 ? Math.max(p1[horiz ? 0 : 1], p2[horiz ? 0 : 1]) : Math.min(p1[horiz ? 0 : 1], p2[horiz ? 0 : 1]);
        const lo = Math.min(p1[horiz ? 1 : 0], p2[horiz ? 1 : 0]), hi = Math.max(p1[horiz ? 1 : 0], p2[horiz ? 1 : 0]);
        const X = corridor(base, sgn, lo, hi, rects, skip, horiz);
        pts = horiz ? [p1, [X, p1[1]], [X, p2[1]], p2] : [p1, [p1[0], X], [p2[0], X], p2];
      } else if (h1 === h2) {
        // côtés opposés : Z par le milieu, si l'on part vers la cible
        if (out(p1, d1, p2) < 24 || out(p2, d2, p1) < 24) continue;
        if (h1) { const X = (p1[0] + p2[0]) / 2; pts = [p1, [X, p1[1]], [X, p2[1]], p2]; }
        else { const Y = (p1[1] + p2[1]) / 2; pts = [p1, [p1[0], Y], [p2[0], Y], p2]; }
      } else {
        // côtés perpendiculaires : un seul coude
        const corner = h1 ? [p2[0], p1[1]] : [p1[0], p2[1]];
        if (out(p1, d1, corner) < 16 || out(p2, d2, corner) < 16) continue;
        pts = [p1, corner, p2];
      }
      const cv = elbow(pts, 12);
      cv.pts = pts;
      add(cv, sample(cv, 24), s1, s2, 'elbow');
    }
    // repli : courbes libres (si aucun tracé orthogonal n'est propre)
    for (const s1 of ctx.side || 'rlbt') for (const s2 of 'rlbt') {
      if (s1 === s2) continue;
      const p1 = sidePoint(a, sa, s1), p2 = sidePoint(b, sb, s2);
      const d1 = DIRS[s1], d2 = DIRS[s2];
      if (d1[0] * (cb[0] - ca[0]) + d1[1] * (cb[1] - ca[1]) < 0 || d2[0] * (ca[0] - cb[0]) + d2[1] * (ca[1] - cb[1]) < 0) continue;
      const cv = cubic(p1, d1, p2, d2, handle(p1, p2));
      add(cv, sample(cv, 24), s1, s2, 'curve');
    }
    if (!cands.length) { const cv = cubic(sidePoint(a, sa, 'r'), [1, 0], sidePoint(b, sb, 'l'), [-1, 0], 60); cands.push({ cv, pts: sample(cv), hits: 0, len: 0, cost: 0 }); }
    cands.sort((x, y) => x.cost - y.cost);
    let best = cands[0];
    if (!ctx.fast) {
      // départage des meilleurs trajets : croisements, et place pour le libellé
      for (const k of cands.slice(0, 10)) {
        let cross = 0;
        for (const P2 of ctx.polys || []) {
          if (P2.ends && (P2.ends.has(a.id) || P2.ends.has(b.id))) continue;
          cross += Math.min(1, polyCross(k.pts, P2.pts));
        }
        k.cross = cross;
        k.cost2 = k.cost + cross * 300; // 1 croisement ≈ 300 px de détour (même échelle que la note globale)
        if (ctx.label) {
          const spot = placeLabel(k.cv, ctx.label, rects, (ctx.placed || []).slice());
          if (spot.ov > 0) k.cost2 += 420; // un libellé qui cacherait un texte : autre trajet
        }
      }
      best = cands.slice(0, 10).sort((x, y) => x.cost2 - y.cost2)[0];
    }
    // dernier recours : aucun tracé candidat n'est propre → recherche de chemin orthogonal (A*)
    // sur une grille fine, nœuds interdits, coudes pénalisés : s'il existe un passage, on le trouve
    if (best.hits && !ctx.fast) {
      const g = gridRoute(a, sa, b, sb, rects, skip, ctx.busy);
      if (g) return { ...g.cv, pts: g.pts, hits: 0, len: g.len, cross: 0, cost: 0 };
    }
    // cost - len : pénalités seules (côtés de la hiérarchie, détours…)
    return { ...best.cv, pts: best.pts, hits: best.hits, len: best.len, cross: best.cross || 0, cost: best.cost - best.len };
  }

  /** Routage orthogonal par A* (cellules de 12 px, coût = longueur + 6 cellules par coude) */
  function gridRoute(a, sa, b, sb, rects, skip, busy) {
    const C = 12, M = 160;
    let x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x + sa.w, b.x + sb.w), y1 = Math.max(a.y + sa.h, b.y + sb.h);
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    x0 -= M; y0 -= M; x1 += M; y1 += M;
    const W = Math.ceil((x1 - x0) / C), H = Math.ceil((y1 - y0) / C);
    if (W * H > 250000) return null;
    const blocked = new Uint8Array(W * H);
    const block = (r, pad) => {
      const i0 = Math.max(0, Math.floor((r.x - pad - x0) / C)), i1 = Math.min(W - 1, Math.floor((r.x + r.w + pad - x0) / C));
      const j0 = Math.max(0, Math.floor((r.y - pad - y0) / C)), j1 = Math.min(H - 1, Math.floor((r.y + r.h + pad - y0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * W + i] = 1;
    };
    for (const r of rects) if (!skip.has(r.id)) block(r, 8);
    const cell = (p) => [Math.max(0, Math.min(W - 1, Math.floor((p[0] - x0) / C))), Math.max(0, Math.min(H - 1, Math.floor((p[1] - y0) / C)))];
    // départs / arrivées possibles : un point juste hors de chaque côté libre
    const ends = (n, s, id) => 'rlbt'.split('').filter((sd) => !(busy && (busy.get(id) || '').includes(sd))).map((sd) => {
      const p = sidePoint(n, s, sd), d = DIRS[sd];
      return { sd, p, q: [p[0] + d[0] * (C + 6), p[1] + d[1] * (C + 6)] };
    });
    const starts = ends(a, sa, a.id), goals = ends(b, sb, b.id);
    if (!starts.length || !goals.length) return null;
    const goalAt = new Map();
    for (const gl of goals) { const [i, j] = cell(gl.q); if (!blocked[j * W + i]) goalAt.set(j * W + i, gl); }
    if (!goalAt.size) return null;
    const dist = new Float64Array(W * H * 4).fill(Infinity);
    const prev = new Int32Array(W * H * 4).fill(-1);
    // tas binaire minimal
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const gs = [...goalAt.keys()].map((k) => [k % W, Math.floor(k / W)]);
    const hfun = (i, j) => Math.min(...gs.map(([gi, gj]) => Math.abs(gi - i) + Math.abs(gj - j)));
    const DV = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const startOf = new Map();
    for (const st of starts) {
      const [i, j] = cell(st.q);
      if (blocked[j * W + i]) continue;
      const dir = 'rlbt'.indexOf(st.sd);
      const k = (j * W + i) * 4 + dir;
      dist[k] = 0; startOf.set(k, st); push(k, hfun(i, j));
    }
    let found = -1, n = 0;
    while (heap.length && n++ < 200000) {
      const [, k] = pop();
      const c = k >> 2, dir = k & 3, i = c % W, j = Math.floor(c / W);
      if (goalAt.has(c)) { found = k; break; }
      for (let nd = 0; nd < 4; nd++) {
        const ni = i + DV[nd][0], nj = j + DV[nd][1];
        if (ni < 0 || nj < 0 || ni >= W || nj >= H || blocked[nj * W + ni]) continue;
        const nk = (nj * W + ni) * 4 + nd;
        const cost = dist[k] + 1 + (nd !== dir ? 6 : 0);
        if (cost < dist[nk]) { dist[nk] = cost; prev[nk] = k; push(nk, cost + hfun(ni, nj)); }
      }
    }
    if (found < 0) return null;
    // remonte le chemin, garde les coudes
    const cells = [];
    for (let k = found; k >= 0; k = prev[k]) { const c = k >> 2; cells.push([x0 + (c % W) * C + C / 2, y0 + Math.floor(c / W) * C + C / 2]); if (startOf.has(k)) break; }
    cells.reverse();
    let first = null;
    for (const [k, st] of startOf) { const c = k >> 2; if (Math.abs(x0 + (c % W) * C + C / 2 - cells[0][0]) < 1 && Math.abs(y0 + Math.floor(c / W) * C + C / 2 - cells[0][1]) < 1) first = st; }
    const gl = goalAt.get(cell(cells[cells.length - 1])[1] * W + cell(cells[cells.length - 1])[0]);
    if (!first || !gl) return null;
    // aligne le premier et le dernier segment sur les points d'attache
    const raw = [first.p, ...cells, gl.p];
    if (first.sd === 'r' || first.sd === 'l') raw[1] = [raw[1][0], first.p[1]]; else raw[1] = [first.p[0], raw[1][1]];
    const L = raw.length;
    if (gl.sd === 'r' || gl.sd === 'l') raw[L - 2] = [raw[L - 2][0], gl.p[1]]; else raw[L - 2] = [gl.p[0], raw[L - 2][1]];
    const pts = [raw[0]];
    for (let i = 1; i < raw.length - 1; i++) {
      const p = pts[pts.length - 1], q = raw[i], r = raw[i + 1];
      const colinear = (Math.abs(p[0] - q[0]) < 0.5 && Math.abs(q[0] - r[0]) < 0.5) || (Math.abs(p[1] - q[1]) < 0.5 && Math.abs(q[1] - r[1]) < 0.5);
      if (!colinear) pts.push(q);
    }
    pts.push(raw[L - 1]);
    // remet d'équerre (les points d'attache peuvent décaler d'une demi-cellule)
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      if (Math.abs(p[0] - q[0]) > 0.5 && Math.abs(p[1] - q[1]) > 0.5) pts.splice(i, 0, [q[0], p[1]]);
    }
    if (orthHits(pts, rects, skip, 2)) return null;
    const cv = elbow(pts, 10);
    cv.pts = pts;
    return { cv, pts: sample(cv, 24), len: polyLen(pts) };
  }
  /** Couloir libre : première ligne (verticale si horiz, sinon horizontale) au-delà de base, du
      côté sgn, qui ne coupe aucun nœud sur la bande [lo, hi] */
  function corridor(base, sgn, lo, hi, rects, skip, horiz) {
    let X = base + sgn * 22;
    for (let i = 0; i < 60; i++) {
      const blk = rects.find((r) => {
        if (skip.has(r.id)) return false;
        const a0 = horiz ? r.y : r.x, a1 = horiz ? r.y + r.h : r.x + r.w;
        if (a1 < lo - 6 || a0 > hi + 6) return false;
        const b0 = horiz ? r.x : r.y, b1 = horiz ? r.x + r.w : r.y + r.h;
        return X > b0 - 12 && X < b1 + 12;
      });
      if (!blk) return X;
      X = sgn > 0 ? (horiz ? blk.x + blk.w : blk.y + blk.h) + 22 : (horiz ? blk.x : blk.y) - 22;
    }
    return X;
  }
  /** Nœuds traversés par une polyligne orthogonale (test exact segment / rectangle) */
  function orthHits(pts, rects, skip, pad = 5) {
    let n = 0;
    for (const r of rects) {
      if (skip.has(r.id)) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const xa = Math.min(x1, x2), xb = Math.max(x1, x2), ya = Math.min(y1, y2), yb = Math.max(y1, y2);
        if (xb > r.x - pad && xa < r.x + r.w + pad && yb > r.y - pad && ya < r.y + r.h + pad) { n++; break; }
      }
    }
    return n;
  }

  /**
   * Place un libellé le long d'une courbe, là où il ne cache ni un nœud (extrémités comprises)
   * ni un autre libellé. obstacles : rectangles ; placed : libellés déjà posés (muté).
   */
  const TS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73, 0.2, 0.8];
  function overlapArea(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function placeLabel(cv, size, obstacles, placed, { prefer = 0.5 } = {}) {
    let best = null;
    const ts = prefer === 0.5 ? TS : [prefer, ...TS];
    // sur le trait d'abord ; à défaut, légèrement décalé de part et d'autre (perpendiculaire)
    for (const shift of [0, 1, -1]) {
      for (const t of ts) {
        const p = cv.at(t);
        let x = p[0], y = p[1];
        if (shift) {
          const q = cv.at(Math.min(1, t + 0.02)), o = cv.at(Math.max(0, t - 0.02));
          let nx = -(q[1] - o[1]), ny = q[0] - o[0];
          const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          const off = Math.abs(nx) > Math.abs(ny) ? size.w / 2 + 6 : size.h / 2 + 6;
          x += nx * off * shift; y += ny * off * shift;
        }
        const box = { x: x - size.w / 2 - 3, y: y - size.h / 2 - 3, w: size.w + 6, h: size.h + 6 };
        let ov = 0;
        for (const r of obstacles) ov += overlapArea(box, r);
        for (const r of placed) ov += overlapArea(box, r) * 1.5;
        const cost = ov + Math.abs(t - prefer) * 60 + (shift ? 90 : 0);
        if (!best || cost < best.cost) best = { x, y, cost, ov, box };
        if (ov === 0 && t === ts[0] && !shift) break;
      }
      if (best.ov === 0) break;
    }
    placed.push(best.box);
    return best;
  }

  /** Côtés occupés par la hiérarchie : id → 'rl…' (pos(id) → {x,y}, sz(id) → {w,h}) */
  function busySides(map, mode, at, szOf) {
    const busy = new Map();
    const add = (id, s) => busy.set(id, (busy.get(id) || '') + s);
    for (const e of map.edges) {
      if (e.kind !== 'tree') continue;
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      const [s1, s2] = treeSides(mode, a, szOf(a), b, szOf(b));
      add(e.from, s1); add(e.to, s2);
    }
    return busy;
  }

  /* ------------------------------------------------------------------ */
  /* Disposition                                                         */
  /* ------------------------------------------------------------------ */
  const isStruct = (n) => !!(R.store.TYPES[n.type] && R.store.TYPES[n.type].rank);

  /** Arbre courant : enfants dans l'ordre du cours (l'ordre de lecture actuel, jamais permuté) */
  function buildTree(map) {
    const S = R.store;
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    const kids = new Map();
    for (const n of map.nodes) kids.set(n.id, n.collapsed ? [] : S.childrenOf(map, n.id).map((c) => c.id));
    return { byId, kids, roots: S.roots(map).map((n) => n.id) };
  }

  /**
   * Empile des sous-arbres le long de l'axe « largeur » au plus serré, par contours :
   * chaque sous-arbre est décrit par ses niveaux { d0, d1 (profondeur), lo, hi (largeur) }.
   */
  function stack(subs, sepAt) {
    const offs = [];
    let acc = null;
    subs.forEach((s, i) => {
      if (!acc) { offs.push(0); acc = s.lv.map((l) => ({ ...l })); return; }
      let o = -Infinity;
      for (let la = 0; la < acc.length; la++) for (let lb = 0; lb < s.lv.length; lb++) {
        const A = acc[la], B = s.lv[lb];
        if (A.d1 <= B.d0 || B.d1 <= A.d0) continue; // pas de recouvrement en profondeur
        o = Math.max(o, A.hi + sepAt(i, la, lb) - B.lo);
      }
      if (o === -Infinity) o = offs[i - 1];
      offs.push(o);
      s.lv.forEach((l, k) => {
        const m = { d0: l.d0, d1: l.d1, lo: l.lo + o, hi: l.hi + o };
        if (acc[k]) { const A = acc[k]; A.d0 = Math.min(A.d0, m.d0); A.d1 = Math.max(A.d1, m.d1); A.lo = Math.min(A.lo, m.lo); A.hi = Math.max(A.hi, m.hi); }
        else acc[k] = m;
      });
    });
    return { offs, lv: acc || [] };
  }

  /**
   * Disposition d'un sous-arbre en coordonnées locales (d = profondeur depuis le bord du
   * nœud racine, b = largeur). dim(n) → { dl (taille en profondeur), bl (en largeur) }.
   */
  function subtree(id, T, dim, cfg, seen, level = 1) {
    const n = T.byId.get(id);
    const own = dim(n);
    seen.add(id);
    const ch = (T.kids.get(id) || []).filter((c) => !seen.has(c));
    if (!ch.length) {
      // feuille d'appui (exemple, source…) : décalée comme une annotation de la ligne au-dessus
      const ind = cfg.satIndent && role(n) === 'support' && level > 1 ? cfg.satIndent : 0;
      return { pos: new Map([[id, { d: ind, b: 0 }]]), lv: [{ d0: ind, d1: ind + own.dl, lo: 0, hi: own.bl }], c: own.bl / 2, leaf: true, struct: isStruct(n), role: role(n) };
    }
    return group(id, own, ch, T, dim, cfg, seen, level);
  }
  /**
   * Colonnes alignées (une colonne par niveau, comme une grille) : tous les nœuds d'un même
   * niveau commencent au même endroit — on lit la carte colonne par colonne (alignement,
   * Purchase et al. 2010), et un lien ne coupe jamais le coin d'un nœud plus large.
   * Renvoie le décalage de chaque niveau depuis le niveau 0.
   */
  function columns(rootIds, T, dim, gap, first = 0, indent = 0) {
    const maxD = [];
    const seen = new Set();
    let frontier = rootIds.map((id) => [id, first]);
    while (frontier.length) {
      const next = [];
      for (const [id, L] of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const nn = T.byId.get(id);
        const ind = indent && role(nn) === 'support' && !(T.kids.get(id) || []).length && L > 1 ? indent : 0;
        maxD[L] = Math.max(maxD[L] || 0, dim(nn).dl + ind);
        for (const c of T.kids.get(id) || []) next.push([c, L + 1]);
      }
      frontier = next;
    }
    const cols = [0];
    for (let L = 1; L < maxD.length + 1; L++) cols[L] = cols[L - 1] + (maxD[L - 1] || 0) + gap;
    return cols;
  }
  /** Écart entre deux frères : il dit s'ils vont ensemble (proximité, Gestalt) */
  function sepFor(cfg, a, b) {
    if (a.struct || b.struct) return cfg.structGap;
    if (b.role === 'summary') return cfg.summaryGap;
    if (a.leaf && b.leaf && a.role === 'support' && b.role === 'support') return cfg.satGap;
    if (a.leaf && b.leaf) return cfg.leafGap;
    return cfg.sibGap;
  }
  /**
   * Séquence : les étapes d'une méthode, une suite ET d'étapes, ou une chronologie (dates) se
   * rangent en LIGNE, reliées par des flèches — une frise se lit d'un trait, de gauche à droite.
   */
  function isSequence(id, ch, T) {
    const p = T.byId.get(id);
    if (!p || ch.length < 3 || ch.length > 6) return false;
    if (ch.some((c) => (T.kids.get(c) || []).length)) return false;
    const kids = ch.map((c) => T.byId.get(c));
    if (kids.some((k) => (k.title || '').length > 34)) return false;
    if (kids.every((k) => k.type === 'date')) return true;
    if (p.type === 'methode' && kids.every((k) => ['etape', 'forme', 'idee', 'methode'].includes(k.type))) return true;
    if (kids.every((k) => k.type === 'etape')) return true;
    return p.logic === 'et' && kids.every((k) => k.type === 'forme');
  }
  function group(id, own, ch, T, dim, cfg, seen, level = 0) {
    if (cfg.seq && isSequence(id, ch, T)) {
      const cd0 = cfg.cols && cfg.cols[level + 1] != null ? cfg.cols[level + 1] - cfg.cols[level] : own.dl + cfg.gap;
      const pos = new Map([[id, { d: 0, b: 0 }]]);
      const mid = own.bl / 2;
      // étapes alignées par le haut : même y, donc l'ordre de lecture (y puis x) reste celui du cours
      const top = mid - Math.max(...ch.map((c) => dim(T.byId.get(c)).bl)) / 2;
      let d = cd0, lo = Math.min(0, top), hi = own.bl;
      for (const c of ch) {
        seen.add(c);
        const s = dim(T.byId.get(c));
        pos.set(c, { d, b: top });
        hi = Math.max(hi, top + s.bl);
        d += s.dl + SEQ.gap;
      }
      const n = T.byId.get(id);
      return { pos, lv: [{ d0: 0, d1: own.dl, lo: 0, hi: own.bl }, { d0: cd0, d1: d - SEQ.gap, lo, hi }], c: mid, leaf: false, struct: !!(n && isStruct(n)), role: role(n) };
    }
    // pyramide : une liste de feuilles (≥ 3) se range en colonne sous son parent, comme un
    // sommaire — la pyramide reste étroite et la liste se lit de haut en bas
    if (cfg.stackLeaves && ch.length >= 3 && ch.every((c) => !(T.kids.get(c) || []).length)) {
      const pos = new Map([[id, { d: 0, b: 0 }]]);
      let d = own.dl + STACK.top, maxW = 0;
      for (const c of ch) {
        seen.add(c);
        const s = dim(T.byId.get(c));
        pos.set(c, { d, b: STACK.indent });
        d += s.dl + STACK.gap;
        maxW = Math.max(maxW, s.bl);
      }
      const n = T.byId.get(id);
      return { pos, lv: [{ d0: 0, d1: d, lo: 0, hi: Math.max(own.bl, STACK.indent + maxW) }], c: own.bl / 2, leaf: false, struct: !!(n && isStruct(n)), role: role(n) };
    }
    const subs = ch.map((c) => subtree(c, T, dim, cfg, seen, level + 1));
    // les enfants commencent après le parent — ou au début de la colonne suivante (colonnes alignées)
    const cd = cfg.cols && cfg.cols[level + 1] != null ? cfg.cols[level + 1] - cfg.cols[level] : own.dl + cfg.gap;
    for (const s of subs) for (const l of s.lv) { l.d0 += cd; l.d1 += cd; }
    const st = stack(subs, (i, la, lb) => (la === 0 && lb === 0 ? sepFor(cfg, subs[i - 1], subs[i]) : cfg.cousinGap));
    const first = st.offs[0] + subs[0].c, last = st.offs[subs.length - 1] + subs[subs.length - 1].c;
    const mid = (first + last) / 2;
    const pb = mid - own.bl / 2;
    const pos = new Map([[id, { d: 0, b: pb }]]);
    subs.forEach((s, i) => { for (const [k, v] of s.pos) pos.set(k, { d: v.d + cd, b: v.b + st.offs[i] }); });
    return { pos, lv: [{ d0: 0, d1: own.dl, lo: pb, hi: pb + own.bl }, ...st.lv], c: mid, leaf: false, struct: !!(T.byId.get(id) && isStruct(T.byId.get(id))), role: role(T.byId.get(id)) };
  }

  /** Une racine et sa descendance, selon la disposition → { id: {x, y} } relatifs (racine en 0,0) */
  function layoutTree(rootId, T, size, mode, split, prm = P) {
    const out = {};
    const root = T.byId.get(rootId);
    const rs = size(root);
    if (mode === 'down') {
      const cfg = { gap: prm.downGap, leafGap: prm.downSibGap, sibGap: prm.downSibGap, structGap: prm.downSibGap + 16, cousinGap: prm.downSibGap, satGap: prm.downSibGap, summaryGap: prm.downSibGap + 12, stackLeaves: true };
      const dimD = (n) => { const s = size(n); return { dl: s.h, bl: s.w }; };
      cfg.cols = columns([rootId], T, dimD, prm.downGap);
      const L = subtree(rootId, T, dimD, cfg, new Set(), 0);
      const r0 = L.pos.get(rootId);
      for (const [id, v] of L.pos) out[id] = { x: v.b - r0.b, y: v.d };
      return out;
    }
    const cfg = { gap: prm.depthGap, leafGap: prm.leafGap, sibGap: prm.sibGap, structGap: prm.structGap, cousinGap: prm.cousinGap, satGap: prm.satGap, summaryGap: prm.summaryGap, satIndent: prm.satIndent };
    const dim = (n) => { const s = size(n); return { dl: s.w, bl: s.h }; };
    const kids = (T.kids.get(rootId) || []);
    out[rootId] = { x: 0, y: 0 };
    if (!kids.length) return out;
    const sides = mode === 'balanced'
      ? [{ ids: kids.slice(0, split), dir: 1 }, { ids: kids.slice(split).reverse(), dir: -1 }]
      : [{ ids: kids, dir: 1 }];
    const seen = new Set([rootId]);
    for (const side of sides) {
      if (!side.ids.length) continue;
      // colonnes de ce côté : niveau 1 = enfants de la racine
      const cols = columns(side.ids, T, dim, prm.depthGap, 1, prm.satIndent);
      // séquences en ligne : seulement quand la lecture va vers la droite (sinon l'ordre s'inverserait)
      const scfg = { ...cfg, cols, seq: side.dir > 0 && prm.seq !== 0 };
      const subs = side.ids.map((c) => subtree(c, T, dim, scfg, seen, 1));
      const st = stack(subs, (i, la, lb) => (la === 0 && lb === 0 ? sepFor(cfg, subs[i - 1], subs[i]) : cfg.cousinGap));
      const first = st.offs[0] + subs[0].c, last = st.offs[subs.length - 1] + subs[subs.length - 1].c;
      const shift = rs.h / 2 - (first + last) / 2; // la racine au milieu de ses branches
      subs.forEach((s, i) => {
        for (const [id, v] of s.pos) {
          const w = size(T.byId.get(id)).w;
          const x = side.dir > 0 ? rs.w + prm.depthGap + v.d : -prm.depthGap - v.d - w;
          out[id] = { x, y: v.b + st.offs[i] + shift };
        }
      });
    }
    return out;
  }

  function bbox(pos, T, size, ids) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const p = pos[id]; if (!p) continue;
      const s = size(T.byId.get(id));
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + s.w); y1 = Math.max(y1, p.y + s.h);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  /** Disposition complète d'une carte pour un mode donné (positions absolues) */
  function place(map, T, size, mode, split, prm = P) {
    const out = {};
    let cursor = 0;
    const done = new Set();
    for (const r of T.roots) {
      const loc = layoutTree(r, T, size, mode, split && r === T.roots[0] ? split : Math.ceil((T.kids.get(r) || []).length / 2), prm);
      const ids = Object.keys(loc).filter((id) => !done.has(id));
      ids.forEach((id) => done.add(id));
      const bb = bbox(loc, T, size, ids);
      // arbres successifs : les uns sous les autres (pyramide : côte à côte)
      const dx = mode === 'down' ? cursor - bb.x0 : -bb.x0 + (loc[r] ? 0 : 0);
      const dy = mode === 'down' ? -bb.y0 : cursor - bb.y0;
      for (const id of ids) out[id] = { x: loc[id].x + dx, y: loc[id].y + dy };
      cursor += (mode === 'down' ? bb.w : bb.h) + prm.rootGap;
    }
    // la première racine ne bouge pas (pas de saut de caméra)
    const a = T.byId.get(T.roots[0]);
    if (a && out[a.id]) {
      const ddx = a.x - out[a.id].x, ddy = a.y - out[a.id].y;
      for (const id in out) { out[id].x = Math.round(out[id].x + ddx); out[id].y = Math.round(out[id].y + ddy); }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Note d'une disposition                                              */
  /* ------------------------------------------------------------------ */
  function evaluate(map, pos, size, mode, vp = {}, quick = false) {
    const S = R.store;
    const rects = [];
    const at = new Map();
    for (const n of map.nodes) {
      const p = pos[n.id]; if (!p) continue;
      const s = size(n);
      const r = { id: n.id, x: p.x, y: p.y, w: s.w, h: s.h };
      rects.push(r); at.set(n.id, r);
    }
    const polys = [];
    const treeLabels = [];
    const busy = busySides(map, mode, at, (r) => r);
    const seqPrev = sequencePrev(map, at, mode);
    // peignes (≥ 4 enfants d'un même côté) : même géométrie que l'éditeur
    const sideKids = new Map();
    for (const e of map.edges) {
      if (e.kind !== 'tree' || e.label || mode === 'down') continue;
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      if (seqPrev.has(e.to) || [...seqPrev.values()].includes(e.to)) continue;
      const k = e.from + (b.x < a.x ? 'L' : 'R');
      if (!sideKids.has(k)) sideKids.set(k, []);
      sideKids.get(k).push(b);
    }
    for (const e of map.edges) {
      if (e.kind !== 'tree') continue;
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      const kids = !e.label && mode !== 'down' ? sideKids.get(e.from + (b.x < a.x ? 'L' : 'R')) : null;
      let cv;
      const prev = seqPrev.get(e.to);
      if (prev) { const q = at.get(prev); cv = elbow([[q.x + q.w, q.y + q.h / 2], [b.x, b.y + b.h / 2]]); }
      else if (kids && kids.length >= 4) cv = combTooth(a, kids, b);
      else cv = treeCurve(mode, a, a, b, b);
      polys.push({ pts: sample(cv, 8), ends: new Set([e.from, e.to]) });
      if (e.label) treeLabels.push({ cv, label: e.label });
    }
    let hits = 0, cross = 0, len = 0, lblOv = 0;
    const placed = [];
    for (const t of treeLabels) { const p = placeLabel(t.cv, labelSize(t.label), rects, placed, { prefer: 0.5 }); if (p.ov > 0) lblOv++; }
    for (const e of map.edges) {
      if (e.kind !== 'link') continue;
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      const rt = route(a, a, b, b, { rects, polys, placed, busy, fast: quick, label: e.label ? labelSize(e.label) : null });
      hits += rt.hits; cross += rt.cross; len += rt.len;
      polys.push({ pts: rt.pts, ends: new Set([e.from, e.to]) });
      if (e.label) { const p = placeLabel(rt, labelSize(e.label), rects, placed); if (p.ov > 0) lblOv++; }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const W = x1 - x0, H = y1 - y0;
    const vw = vp.w || 1280, vh = vp.h || 800;
    const fit = Math.min(1.2, Math.min(vw / (W + 64), vh / (H + 64)));
    // proximité ambiguë (Gestalt) : deux voisins de colonne qui n'ont pas le même parent doivent
    // être nettement plus éloignés que deux frères — sinon l'œil les croit du même groupe
    const parentOf = new Map();
    for (const e of map.edges) if (e.kind === 'tree') parentOf.set(e.to, e.from);
    const horizontal = mode !== 'down';
    const cols = new Map();
    for (const r of rects) { const k = Math.round((horizontal ? r.x : r.y) / 12); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(r); }
    let amb = 0, sibGaps = [], cousinGaps = [];
    for (const list of cols.values()) {
      list.sort((a, b) => (horizontal ? a.y - b.y : a.x - b.x));
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        const g = horizontal ? b.y - (a.y + a.h) : b.x - (a.x + a.w);
        if (parentOf.get(a.id) === parentOf.get(b.id)) sibGaps.push(g); else cousinGaps.push(g);
      }
    }
    const medSib = sibGaps.length ? sibGaps.sort((a, b) => a - b)[Math.floor(sibGaps.length / 2)] : 10;
    for (const g of cousinGaps) if (g < medSib * 1.8) amb++;
    // longs arcs de la hiérarchie : un parent loin de ses enfants oblige à suivre une longue courbe
    let reach = 0;
    for (const e of map.edges) {
      if (e.kind !== 'tree') continue;
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      const d = horizontal ? Math.abs((b.y + b.h / 2) - (a.y + a.h / 2)) : Math.abs((b.x + b.w / 2) - (a.x + a.w / 2));
      reach += Math.max(0, d - 220) / 100;
    }
    // forme : une carte au format de l'écran se parcourt sans gymnastique
    const aspect = Math.abs(Math.log((W / Math.max(1, H)) / (vw / vh)));
    const w = P.w;
    const cost = w.hit * hits + w.cross * cross + w.label * lblOv + w.len * (len / 100) - w.fit * Math.log(Math.max(0.02, fit))
      + w.amb * amb + w.reach * reach + w.aspect * aspect + (w.mode[mode] || 0)
      - w.seq * new Set(seqPrev.values()).size / 2; // une frise lue d'un trait vaut un peu de largeur
    return { cost, hits, cross, lblOv, len: Math.round(len), fit: +fit.toFixed(3), amb, reach: +reach.toFixed(1), aspect: +aspect.toFixed(2), W: Math.round(W), H: Math.round(H) };
  }

  /**
   * Range la carte. opts.mode : 'auto' (défaut) | 'right' | 'balanced' | 'down'.
   * Renvoie { pos: {id: {x, y}}, mode, score, tried: [...] } sans muter la carte.
   */
  function arrange(map, size = estimate, opts = {}) {
    const T = buildTree(map);
    if (!T.roots.length) return { pos: {}, mode: 'right', score: null, tried: [] };
    const want = opts.mode && opts.mode !== 'auto' ? opts.mode : 'auto';
    const main = T.kids.get(T.roots[0]) || [];
    const cands = [];
    const push = (mode, split) => cands.push({ mode, split });
    if (want === 'auto' || want === 'right') push('right');
    // pyramide : seulement pour une petite hiérarchie peu profonde (sinon trop large pour être lue)
    const depthOf = (id, d = 0, seen = new Set()) => { if (seen.has(id)) return d; seen.add(id); return Math.max(d, ...(T.kids.get(id) || []).map((c) => depthOf(c, d + 1, seen))); };
    const small = map.nodes.length <= 24 && depthOf(T.roots[0]) <= 3;
    if (want === 'down' || (want === 'auto' && small)) push('down');
    if (want === 'balanced' || (want === 'auto' && main.length >= 4)) {
      // coupures candidates autour de l'équilibre des hauteurs (ordre horaire conservé)
      const n = main.length;
      if (n < 2) push('balanced', n);
      else {
        const hs = main.map((c) => { const L = subtree(c, T, (x) => { const s = size(x); return { dl: s.w, bl: s.h }; }, { gap: P.depthGap, leafGap: P.leafGap, sibGap: P.sibGap, structGap: P.structGap, cousinGap: P.cousinGap }, new Set([T.roots[0]])); const l = L.lv; let lo = Infinity, hi = -Infinity; for (const v of l) { lo = Math.min(lo, v.lo); hi = Math.max(hi, v.hi); } return hi - lo; });
        const total = hs.reduce((s, x) => s + x, 0);
        let acc = 0, k = 1;
        for (let i = 0; i < n; i++) { acc += hs[i]; if (acc >= total / 2) { k = i + 1; break; } }
        const ks = new Set([k, k - 1, k + 1, Math.ceil(n / 2)].filter((x) => x >= 1 && x < n));
        for (const s of ks) push('balanced', s);
      }
    }
    let best = null;
    const tried = [];
    const run = (c, prm, quick = false) => {
      const pos = place(map, T, size, c.mode, c.split, prm);
      const sc = evaluate(map, pos, size, c.mode, opts.viewport, quick);
      tried.push({ mode: c.mode, split: c.split, ...sc });
      return { pos, mode: c.mode, split: c.split, prm, score: sc };
    };
    // 1) chaque disposition avec les réglages par défaut
    const firsts = cands.map((c) => run(c, P)).sort((a, b) => a.score.cost - b.score.cost);
    best = firsts[0];
    // 2) l'optimiseur affine les deux meilleures (descente par coordonnées sur SEARCH) :
    //    écarts, colonnes, retraits — chaque réglage n'est gardé que s'il améliore la note
    const budget = opts.fast ? 0 : map.nodes.length > 80 ? 1 : 2;
    for (const start of firsts.slice(0, opts.fast ? 0 : 2)) {
      // affinage en évaluation rapide (sans départage des croisements), note complète à la fin
      let cur = run({ mode: start.mode, split: start.split }, start.prm, true);
      const base = cur;
      for (let round = 0; round < budget; round++) {
        let improved = false;
        for (const [k, vals] of Object.entries(SEARCH)) {
          if (cur.mode === 'down' && k !== 'structGap') continue;
          for (const v of vals) {
            if (cur.prm[k] === v) continue;
            const cand = run({ mode: cur.mode, split: cur.split }, { ...cur.prm, [k]: v }, true);
            if (cand.score.cost < cur.score.cost - 0.01) { cur = cand; improved = true; }
          }
        }
        if (!improved) break;
      }
      if (cur === base) continue;
      const full = run({ mode: cur.mode, split: cur.split }, cur.prm);
      if (full.score.cost < best.score.cost) best = full;
    }
    return { pos: best.pos, mode: best.mode, score: best.score, params: best.prm, tried };
  }

  /** Compatibilité : positions seules, dans la disposition actuelle (ou celle demandée) */
  function tidy(map, size = estimate, opts = {}) {
    return arrange(map, size, { mode: opts.mode || map.layout || 'right', viewport: opts.viewport }).pos;
  }

  /** Sens de croissance d'une branche : où poser un enfant, un frère */
  function flow(map, node) {
    if (map.layout === 'down') return { child: 'down', sib: 'x' };
    const S = R.store;
    const p = S.parentOf(map, node.id);
    // côté gauche d'une carte centrée : la branche pousse vers la gauche
    if (p && node.x + 1 < p.x) return { child: 'left', sib: 'y' };
    if (!p && map.layout === 'balanced') return { child: 'right', sib: 'y' };
    let a = p;
    while (a) { const pp = S.parentOf(map, a.id); if (!pp) break; if (a.x + 1 < pp.x) return { child: 'left', sib: 'y' }; a = pp; }
    return { child: 'right', sib: 'y' };
  }

  /** Position d'un nouvel enfant : après le dernier enfant existant, du bon côté */
  function childSlot(map, parent, size = estimate) {
    const S = R.store;
    const ch = S.childrenOf(map, parent.id);
    const ps = size(parent);
    const f = flow(map, parent);
    if (f.child === 'down') {
      if (!ch.length) return { x: parent.x + ps.w / 2 - 60, y: parent.y + ps.h + P.downGap };
      const last = ch[ch.length - 1];
      return { x: last.x + size(last).w + P.downSibGap, y: last.y };
    }
    // séquence en ligne (méthode, chronologie) : l'étape suivante se pose à droite de la dernière
    if (ch.length >= 2 && ch.every((c) => Math.abs(c.y - ch[0].y) <= 1) && ch[0].x > parent.x + ps.w) {
      const last = ch.reduce((m, c) => (c.x > m.x ? c : m), ch[0]);
      return { x: last.x + size(last).w + SEQ.gap, y: last.y };
    }
    const side = ch.filter((c) => (f.child === 'left' ? c.x < parent.x : c.x >= parent.x));
    if (!side.length) return f.child === 'left' ? { x: parent.x - P.depthGap - 160, y: parent.y + ps.h / 2 - 22 } : { x: parent.x + ps.w + P.depthGap, y: parent.y + ps.h / 2 - 22 };
    const last = side.reduce((m, c) => (c.y > m.y ? c : m), side[0]);
    return { x: last.x, y: last.y + size(last).h + GAP_Y };
  }

  R.layout = {
    P, SEARCH, role, GAP_X, GAP_Y, GAP_ROOT, STACK, stacked,
    estimate, labelSize,
    arrange, tidy, evaluate, childSlot, flow,
    treeSides, treeCurve, combTooth, sequencePrev, busySides, sidePoint, cubic, elbow, busDown, route, placeLabel, sample,
  };
})(window.R);
