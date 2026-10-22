/* Mesure du routage des renvois et du placement des libellés sur le jeu visuel, avec le vrai js/layout.js.
 *   node tests/visual/checkvis.cjs            (PIONEER_LAYOUT=autre/layout.js pour comparer)
 * Reproduit l'ordre de l'éditeur (renvois tracés un par un, libellés placés au fur et à mesure),
 * sans navigateur : tailles par R.layout.estimate. Indicateurs par carte :
 *  hits  : nœuds (hors extrémités) traversés par un renvoi      cross : croisements entre renvois
  *  sup   : paires de renvois superposés sur > 30 px (traits confondus)
 *  ovN   : libellés qui chevauchent un nœud                      ovL   : libellés qui chevauchent un libellé
 *  dMax  : distance max (px) libellé → son trait                 far   : libellés à > 40 px de leur trait
 *  det   : rendu identique d'un appel à l'autre                  perm  : identique si l'ordre des arêtes est permuté
 *  ms    : temps de routage + libellés                           stab  : (V7) renvois inchangés dont rien n'a bougé
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const win = { R: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
  document: { addEventListener() {}, documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {} }) }, innerWidth: 1280, innerHeight: 800 };
win.window = win; win.self = win;
const ctx = vm.createContext(win);
for (const f of ['js/util.js', 'js/store.js', process.env.PIONEER_LAYOUT || 'js/layout.js']) vm.runInContext(fs.readFileSync(path.isAbsolute(f) ? f : path.join(root, f), 'utf8'), ctx, { filename: f });
const Ly = win.R.layout;

function inRect(p, r, pad = 0) { return p[0] > r.x - pad && p[0] < r.x + r.w + pad && p[1] > r.y - pad && p[1] < r.y + r.h + pad; }
function ov(a, b) { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0; }
function segX(a, b, c, d) { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
function crosses(P, Q) { for (let i = 1; i < P.length; i++) for (let j = 1; j < Q.length; j++) if (segX(P[i - 1], P[i], Q[j - 1], Q[j])) return 1; return 0; }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
/** longueur (px) du tracé A superposé (à < 3 px) au tracé B, hors 30 px autour des extrémités communes */
function overlapLen(P, Q) { let n = 0; for (let i = 1; i < P.length; i++) { const m = [(P[i][0] + P[i - 1][0]) / 2, (P[i][1] + P[i - 1][1]) / 2]; for (let j = 1; j < Q.length; j++) if (segDist(m, Q[j - 1], Q[j]) < 3) { n += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); break; } } return n; }
function segBox(a, b, r) {
  if ([a, b].some((p) => inRect(p, r))) return true;
  const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  for (let k = 0; k < 4; k++) if (segX(a, b, c[k], c[(k + 1) % 4])) return true;
  return false;
}
const samp = (cv) => Array.from({ length: 41 }, (_, i) => cv.at(i / 40));

let prevKeys = null;
function render(map, order) {
  const size = new Map(map.nodes.map((n) => [n.id, Ly.estimate(n)]));
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const rects = map.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...size.get(n.id) }));
  const links = map.edges.filter((e) => e.kind === 'link');
  // comme l'éditeur : renvois triés par identifiant (le rendu ne dépend pas de l'ordre du fichier)
  const seq = (order ? order(links.slice()) : links.slice()).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const placed = [], polys = [], res = new Map();
  for (const e of seq) {
    const a = byId.get(e.from), b = byId.get(e.to);
    const lsz = e.label ? Ly.labelSize(e.label) : null;
    const cv = Ly.route({ id: a.id, x: a.x, y: a.y }, size.get(a.id), { id: b.id, x: b.x, y: b.y }, size.get(b.id), { rects, polys, placed, label: lsz, id: e.id, prevRoute: prevKeys && prevKeys.get(e.id) });
    const pts = samp(cv);
    polys.push({ pts, ends: new Set([a.id, b.id]) });
    let spot = null;
    if (lsz) spot = Ly.placeLabel(cv, lsz, rects, placed, { segs: polys, ends: [a.id, b.id] });
    res.set(e.id, { e, pts, d: cv.d, cv, spot, lsz, rects, key: cv.key, style: cv.style || 'orth' });
  }
  // reprise des libellés en conflit, en connaissant tous les traits (comme l'éditeur)
  for (const r of res.values()) {
    if (!r.spot || !r.spot.clash) continue;
    const others = placed.filter((b) => b !== r.spot.box);
    const again = Ly.placeLabel(r.cv, r.lsz, rects, others, { segs: polys, ends: [r.e.from, r.e.to] });
    if (again.cost < r.spot.cost) { placed[placed.indexOf(r.spot.box)] = again.box; r.spot = again; }
  }
  return res;
}
function measure(map, res) {
  let hits = 0, cross = 0, sup = 0, ovN = 0, ovL = 0, dMax = 0, far = 0, cut = 0, clash = 0;
  const list = [...res.values()];
  const rects = list.length ? list[0].rects : [];
  for (const r of list) {
    hits += rects.filter((q) => q.id !== r.e.from && q.id !== r.e.to && r.pts.some((p) => inRect(p, q, -2))).length;
    if (r.spot) {
      const box = { x: r.spot.x - r.lsz.w / 2, y: r.spot.y - r.lsz.h / 2, w: r.lsz.w, h: r.lsz.h };
      if (rects.some((q) => ov(box, q))) ovN++;
      // libellé traversé par le trait d'un AUTRE renvoi
      if (list.some((o) => o !== r && o.pts.some((p, i) => i && segBox(o.pts[i - 1], p, box)))) cut++;
      if (r.spot.clash) clash++;
      const d = Math.min(...r.pts.map((p) => Math.hypot(p[0] - r.spot.x, p[1] - r.spot.y)));
      dMax = Math.max(dMax, d); if (d > 40) far++;
      r.box = box;
    }
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    if (A.box && B.box && ov(A.box, B.box)) ovL++;
    if (![A.e.from, A.e.to].some((x) => x === B.e.from || x === B.e.to)) { cross += crosses(A.pts, B.pts); if (overlapLen(A.pts, B.pts) > 30) sup++; }
  }
  return { hits, cross, sup, ovN, ovL, cut, clash, dMax: Math.round(dMax), far, courbes: list.filter((r) => r.style !== 'orth' && r.style !== 'grid').length + '/' + list.length };
}
const key = (res) => JSON.stringify([...res.values()].map((r) => [r.e.id, r.d, r.spot && [Math.round(r.spot.x), Math.round(r.spot.y)]]).sort());

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /^v\d.*\.json$/.test(f)).sort();
const rows = [];
let v6 = null;
for (const f of files) {
  const map = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const t0 = process.hrtime.bigint();
  // trajet retenu au rendu précédent (l'éditeur le garde par identifiant d'arête ; ici, V6 et V7 ont des identifiants distincts : par couple)
  if (f.startsWith('v7') && v6) {
    const k0 = new Map([...v6.res.values()].map((r) => [r.e.from + '>' + r.e.to, r.cv]));
    prevKeys = new Map(map.edges.map((e) => [e.id, k0.get(e.from + '>' + e.to)]));
  } else prevKeys = null;
  const res = render(map);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const m = measure(map, res);
  const det = key(render(map)) === key(res);
  const perm = key(render(map, (l) => l.reverse())) === key(res);
  const row = { carte: f.replace('.json', ''), nœuds: map.nodes.length, renvois: map.edges.filter((e) => e.kind === 'link').length, ...m, det: det ? 'oui' : 'NON', perm: perm ? 'oui' : 'NON', ms: Math.round(ms) };
  if (f.startsWith('v6')) v6 = { map, res };
  if (f.startsWith('v7') && v6) {
    // renvois dont ni les extrémités ni aucun nœud n'ont bougé à moins de 60 px du tracé : doivent être identiques
    const pos0 = new Map(v6.map.nodes.map((n) => [n.id, n.x + ',' + n.y]));
    const moved = map.nodes.filter((n) => pos0.get(n.id) !== n.x + ',' + n.y).map((n) => n.id);
    // stab : identiques / extrémités immobiles ; garde : identiques / trajets précédents encore nets (aucun nœud traversé)
    let same = 0, cand = 0, keepable = 0, kept = 0;
    const by0 = new Map([...v6.res.values()].map((r) => [r.e.from + '>' + r.e.to, r]));
    const rects7 = [...res.values()][0].rects;
    for (const r of res.values()) {
      const r0 = by0.get(r.e.from + '>' + r.e.to);
      if (!r0 || moved.includes(r.e.from) || moved.includes(r.e.to)) continue;
      cand++; if (r0.d === r.d) same++;
      if (!rects7.some((q) => q.id !== r.e.from && q.id !== r.e.to && r0.pts.some((p) => inRect(p, q, -2)))) { keepable++; if (r0.d === r.d) kept++; }
    }
    row.stab = `${same}/${cand} · garde ${kept}/${keepable}`;
  }
  rows.push(row);
}
console.table(rows);
