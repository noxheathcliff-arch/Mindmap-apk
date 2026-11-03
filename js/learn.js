/* Apprentissage du rangement « Vers le bas » — trois étages, tout en local, sans dépendance.
 *
 * 1. Une note apprise. Une disposition se résume en caractéristiques lisibles (nœuds trop
 *    proches, lien qui traverse un nœud, liens qui se croisent, longueur et régularité des liens,
 *    enfant posé dans le couloir de son parent, ordre de lecture qui ne tourne pas, parties
 *    toutes d'un côté de la racine, surface perdue, forme). La note est une somme pondérée ;
 *    les poids s'apprennent par préférences (modèle de Bradley–Terry : « A vaut mieux que B »
 *    → les poids bougent pour que note(A) < note(B)), rappelés vers leur valeur de départ et
 *    jamais négatifs (une gêne ne devient pas une qualité).
 * 2. Des règles implicites. Chaque fois qu'on corrige à la main une carte rangée, la position
 *    d'avant et celle d'après forment une préférence (étage 1), et l'écart que l'on donne aux
 *    liens est retenu (moyenne glissante) : le moteur l'adopte comme écart parent → enfant.
 * 3. Du méta-apprentissage. Chaque carte est décrite (taille, nombre de parties, profondeur,
 *    longueur des titres, part de feuilles, de libellés) ; les réglages qui ont le mieux réussi
 *    sont mémorisés avec cette description. Pour une nouvelle carte, les réglages des cartes
 *    les plus proches (k plus proches voisins) servent de points de départ à l'optimiseur,
 *    qui affine ensuite réglage par réglage avec la note apprise.
 * Le point de départ (poids, mémoire) vient de js/learn-prior.js, appris hors ligne par
 * tests/learn-train.cjs sur les cartes du dépôt et sur nos corrections successives.
 */
(function (R) {
  'use strict';
  const KEY = 'pioneer.learn.v1';
  const F = ['overlap', 'cut', 'cross', 'label', 'len', 'spread', 'long', 'back', 'order', 'balance', 'area', 'aspect'];
  const BASE = { overlap: 50, cut: 30, cross: 15, label: 10, len: 2, spread: 2, long: 4, back: 6, order: 4, balance: 8, area: 3, aspect: 2 };
  const prior = R.learnPrior || {};
  const PRIOR = { ...BASE, ...(prior.w || {}) };
  /** Réglages que l'optimiseur essaie (autour des valeurs par défaut de layout.js) */
  const TUNE = { molGap: [24, 34, 46], molSpread: [100, 125, 150], molStep: [24, 32, 40], molLight: [0.2, 0.34, 0.5] };
  const MEM = 300;
  const DEF_GAP = (R.layout && R.layout.P && R.layout.P.molGap) || 34;

  const fresh = () => ({ w: { ...PRIOR }, n: 0, gap: null, mem: (prior.mem || []).map((m) => ({ ...m, seed: true })) });
  let st = fresh();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const d = raw && JSON.parse(raw);
    if (d && d.w) st = { w: { ...PRIOR, ...d.w }, n: +d.n || 0, gap: d.gap == null ? null : +d.gap, mem: Array.isArray(d.mem) ? d.mem : st.mem };
  } catch (e) { /* stockage indisponible : on apprend pour la séance */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* plein ou bloqué */ } };

  /* ------------------------------------------------------------------ */
  /* Caractéristiques d'une disposition                                  */
  /* ------------------------------------------------------------------ */
  const segX = (a, b) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const A = [a[0], a[1]], B = [a[2], a[3]], C = [b[0], b[1]], D = [b[2], b[3]];
    return o(A, B, C) * o(A, B, D) < 0 && o(C, D, A) * o(C, D, B) < 0;
  };
  const segBox = (s, r) => { // Liang–Barsky
    const [ax, ay, bx, by] = s, dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dy, ay - r.y0], [dy, r.y1 - ay]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1;
  };
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

  /** pos : id → coin haut-gauche ; size(n) → { w, h }. Renvoie { nom: valeur } (plus haut = plus gênant) */
  function features(map, pos, size, vp = {}) {
    const S = R.store;
    const B = new Map();
    let area = 0;
    for (const n of map.nodes) {
      const p = pos[n.id]; if (!p) continue;
      const s = size(n);
      B.set(n.id, { id: n.id, x: p.x, y: p.y, w: s.w, h: s.h, cx: p.x + s.w / 2, cy: p.y + s.h / 2 });
      area += s.w * s.h;
    }
    const list = [...B.values()];
    const par = new Map(), lab = new Map();
    for (const e of map.edges) if (e.kind === 'tree' && B.has(e.from) && B.has(e.to)) { par.set(e.to, e.from); if (e.label) lab.set(e.to, e.label); }
    const f = Object.fromEntries(F.map((k) => [k, 0]));
    if (list.length < 2) return f;
    // liens : d'un bord à l'autre, dans l'axe des centres (comme les trace « Vers le bas »)
    const ray = (b, ux, uy) => Math.min(ux ? b.w / 2 / Math.abs(ux) : Infinity, uy ? b.h / 2 / Math.abs(uy) : Infinity);
    const segs = [], gaps = [], dir = new Map();
    for (const [c, p] of par) {
      const a = B.get(p), b = B.get(c);
      const dx = b.cx - a.cx, dy = b.cy - a.cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const t1 = ray(a, ux, uy), t2 = ray(b, ux, uy);
      gaps.push(Math.max(0, L - t1 - t2));
      segs.push({ p, c, s: [a.cx + ux * t1, a.cy + uy * t1, b.cx - ux * t2, b.cy - uy * t2] });
      dir.set(c, [ux, uy]);
    }
    // nœuds trop proches (moins de 8 px)
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)) < 8 && Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)) < 8) f.overlap++;
    }
    const box = (r, m = 0) => ({ x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m });
    for (const g of segs) for (const r of list) if (r.id !== g.p && r.id !== g.c && segBox(g.s, box(r, -2))) f.cut++;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a.p === b.p || a.c === b.p || a.p === b.c) continue;
      if (segX(a.s, b.s)) f.cross++;
    }
    const lsz = R.layout && R.layout.labelSize;
    if (lsz) for (const g of segs) {
      const L = lab.get(g.c); if (!L) continue;
      const z = lsz(L), mx = (g.s[0] + g.s[2]) / 2, my = (g.s[1] + g.s[3]) / 2;
      const t = { x0: mx - z.w / 2, y0: my - z.h / 2, x1: mx + z.w / 2, y1: my + z.h / 2 };
      for (const r of list) { const q = box(r); if (t.x0 < q.x1 && q.x0 < t.x1 && t.y0 < q.y1 && q.y0 < t.y1) { f.label++; break; } }
    }
    if (gaps.length) {
      const m = gaps.reduce((s, x) => s + x, 0) / gaps.length;
      f.len = m / 100;
      f.spread = Math.sqrt(gaps.reduce((s, x) => s + (x - m) * (x - m), 0) / gaps.length) / 100;
      f.long = gaps.reduce((s, x) => s + Math.max(0, x - 160), 0) / gaps.length / 100;
    }
    // enfant posé dans le couloir du lien qui arrive à son parent (il revient en arrière)
    for (const [c, p] of par) {
      const din = dir.get(p), d = dir.get(c);
      if (din && d && din[0] * d[0] + din[1] * d[1] < -0.5) f.back++;
    }
    if (segs.length) f.back /= segs.length;
    // ordre de lecture : les enfants tournent dans l'ordre du cours autour de leur parent
    let inv = 0, pairs = 0;
    const kids = new Map();
    for (const [c, p] of par) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); }
    const rank = new Map();
    for (const p of kids.keys()) (S && S.childrenOf ? S.childrenOf(map, p).map((n) => n.id) : kids.get(p)).forEach((id, i) => rank.set(id, i));
    for (const [p, cs] of kids) {
      if (cs.length < 3) continue;
      const a = B.get(p), din = dir.get(p);
      const ref = din ? Math.atan2(din[1], din[0]) : Math.PI / 2;
      // autour de la racine : on ne compte pas les parties posées au-dessus (elles se lisent à la fin)
      const ok = cs.filter((c) => din || B.get(c).cy >= a.cy - a.h / 2).sort((x, y) => rank.get(x) - rank.get(y));
      const phi = ok.map((c) => wrap(Math.atan2(B.get(c).cy - a.cy, B.get(c).cx - a.cx) - ref));
      for (let i = 0; i < phi.length; i++) for (let j = i + 1; j < phi.length; j++) { pairs++; if (phi[i] < phi[j]) inv++; }
    }
    f.order = pairs ? inv / pairs : 0;
    // équilibre autour de la racine : des parties toutes du même côté pèsent
    const root = list.find((r) => !par.has(r.id));
    const rk = root ? kids.get(root.id) || [] : [];
    if (rk.length >= 2) {
      let sx = 0, sy = 0;
      for (const c of rk) { const b = B.get(c), L = Math.hypot(b.cx - root.cx, b.cy - root.cy) || 1; sx += (b.cx - root.cx) / L; sy += (b.cy - root.cy) / L; }
      f.balance = Math.hypot(sx, sy) / rk.length;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const W = x1 - x0, H = y1 - y0;
    f.area = Math.log(Math.max(1, (W * H) / Math.max(1, area)));
    f.aspect = Math.abs(Math.log(W / Math.max(1, H) / ((vp.w || 1280) / (vp.h || 800))));
    return f;
  }

  const cost = (f, w = st.w) => F.reduce((s, k) => s + (w[k] || 0) * (f[k] || 0), 0);

  /** Préférence : la disposition de caractéristiques fb vaut mieux que fw. Un pas de Bradley–Terry,
      rappel vers le départ (λ), poids ≥ 0. Renvoie la probabilité que le modèle avait de bien classer. */
  function prefer(fb, fw, { rate = 0.05, lambda = 0.02, w = st.w, base = PRIOR } = {}) {
    const d = F.map((k) => (fw[k] || 0) - (fb[k] || 0));
    const m = F.reduce((s, k, i) => s + (w[k] || 0) * d[i], 0);
    const p = 1 / (1 + Math.exp(-m / 10));
    F.forEach((k, i) => {
      const step = Math.max(-base[k] * 0.25, Math.min(base[k] * 0.25, rate * (1 - p) * d[i] * 10));
      w[k] = Math.max(0, (w[k] || 0) + step - rate * lambda * ((w[k] || 0) - base[k]));
    });
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* Corrections à la main                                               */
  /* ------------------------------------------------------------------ */
  /** before/after : id → { x, y } ; moved : ids déplacés. Une correction « Vers le bas » = une préférence. */
  function observe(map, before, after, moved, size, vp) {
    if (!map || map.layout !== 'tree' || !moved || !moved.length || map.nodes.length > 300) return false;
    const far = moved.some((id) => before[id] && after[id] && Math.hypot(after[id].x - before[id].x, after[id].y - before[id].y) >= 12);
    if (!far) return false;
    const fa = features(map, after, size, vp), fb = features(map, before, size, vp);
    // une correction qui crée un chevauchement n'est pas une leçon (nœud posé en attendant)
    if (fa.overlap > fb.overlap || fa.cut > fb.cut) return false;
    prefer(fa, fb);
    // écart parent → enfant que l'on donne soi-même
    const par = new Map();
    for (const e of map.edges) if (e.kind === 'tree') par.set(e.to, e.from);
    const set = new Set(moved);
    for (const id of moved) {
      const p = par.get(id); if (!p || set.has(p) || !after[p]) continue;
      const n = map.nodes.find((x) => x.id === id), q = map.nodes.find((x) => x.id === p);
      if (!n || !q) continue;
      const a = size(q), b = size(n);
      const ca = [after[p].x + a.w / 2, after[p].y + a.h / 2], cb = [after[id].x + b.w / 2, after[id].y + b.h / 2];
      const dx = cb[0] - ca[0], dy = cb[1] - ca[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const e = (s) => Math.min(ux ? s.w / 2 / Math.abs(ux) : Infinity, uy ? s.h / 2 / Math.abs(uy) : Infinity);
      const gap = Math.max(16, Math.min(90, L - e(a) - e(b)));
      st.gap = (st.gap == null ? DEF_GAP : st.gap) * 0.85 + gap * 0.15; // part du défaut : une correction ne suffit pas
    }
    st.n++;
    save();
    return true;
  }

  /** Réglages appris à appliquer par défaut */
  const params = () => (st.gap == null || st.n < 3 ? {} : { molGap: Math.round(Math.max(18, Math.min(64, st.gap))) });

  /* ------------------------------------------------------------------ */
  /* Méta-apprentissage : quels réglages pour quelle carte               */
  /* ------------------------------------------------------------------ */
  function describe(map) {
    const S = R.store;
    const par = new Map(), kids = new Map();
    for (const e of map.edges) if (e.kind === 'tree') { par.set(e.to, e.from); if (!kids.has(e.from)) kids.set(e.from, []); kids.get(e.from).push(e.to); }
    const root = map.nodes.find((n) => !par.has(n.id));
    const depth = (id, d = 0, seen = new Set()) => { if (seen.has(id)) return d; seen.add(id); return Math.max(d, ...(kids.get(id) || []).map((c) => depth(c, d + 1, seen))); };
    const n = map.nodes.length || 1;
    const leaves = map.nodes.filter((x) => !kids.has(x.id)).length;
    const titles = map.nodes.reduce((s, x) => s + String(x.title || '').length, 0) / n;
    const tree = map.edges.filter((e) => e.kind === 'tree');
    const labels = tree.filter((e) => e.label).length / Math.max(1, tree.length);
    const parts = root ? (kids.get(root.id) || []).length : 0;
    void S;
    return [Math.log2(n) / 6, Math.min(1.5, parts / 8), (root ? depth(root.id) : 0) / 5, Math.min(1.5, titles / 60), leaves / n, labels];
  }
  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - (b[i] || 0)) ** 2, 0));
  /** Réglages des cartes les plus proches (du plus proche au plus lointain), sans doublon */
  function suggest(map, k = 3) {
    const d = describe(map);
    const near = st.mem.map((m) => ({ m, d: dist(d, m.d) })).filter((x) => x.d < 0.5).sort((a, b) => a.d - b.d);
    const out = [], seen = new Set();
    for (const { m } of near) {
      const key = JSON.stringify(m.p);
      if (seen.has(key)) continue;
      seen.add(key); out.push({ ...m.p });
      if (out.length >= k) break;
    }
    return out;
  }
  /** Mémorise les réglages retenus pour cette carte (une entrée par carte, la plus récente) */
  function remember(map, prm, gain = 0) {
    const p = {};
    for (const k of Object.keys(TUNE)) if (prm[k] != null) p[k] = prm[k];
    const e = { id: map.id || null, d: describe(map).map((x) => +x.toFixed(3)), p, g: +(+gain).toFixed(2) };
    st.mem = st.mem.filter((m) => !e.id || m.id !== e.id);
    st.mem.push(e);
    if (st.mem.length > MEM) st.mem = st.mem.filter((m) => !m.seed).slice(-MEM).concat(st.mem.filter((m) => m.seed)).slice(-MEM);
    save();
  }

  function reset() { st = fresh(); try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } }
  const stats = () => ({ corrections: st.n, gap: st.gap == null ? null : Math.round(st.gap), memory: st.mem.length, w: { ...st.w } });

  R.learn = { F, PRIOR, TUNE, features, cost, prefer, observe, params, describe, suggest, remember, reset, stats, dump: () => JSON.parse(JSON.stringify(st)), get w() { return st.w; } };
})(window.R);
