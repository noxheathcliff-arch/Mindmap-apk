/* Entraînement hors ligne de js/learn.js → écrit js/learn-prior.js.
 *   node tests/learn/train.cjs          (--dry : mesure sans écrire)
 * Données : les cartes du dépôt (cours + jeu visuel) rangées « Vers le bas ».
 *  - paires réelles : le moteur actuel vaut mieux que ses versions précédentes (historique git :
 *    liste en retrait → grappes → atomes → racine en atome), chaque étape ayant été une correction demandée ;
 *  - paires synthétiques : la disposition actuelle vaut mieux que la même abîmée comme on l'a vu
 *    abîmée (parties en rang, enfant dans le couloir du parent, frères inversés, branche étirée, tassement).
 * Une carte sur quatre est mise de côté : la précision annoncée est mesurée sur ces cartes-là seulement.
 * Puis le méta-apprentissage : l'optimiseur règle chaque carte avec la note apprise, et la mémoire
 * (description de la carte → meilleurs réglages) devient le point de départ livré avec l'application.
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const DRY = process.argv.includes('--dry');

function engine(layoutSrc, learn = true, prior = null) {
  const store = {};
  const win = { R: {}, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
    document: { addEventListener() {}, documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {} }) }, innerWidth: 1280, innerHeight: 800 };
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  vm.runInContext(read('js/util.js'), ctx); vm.runInContext(read('js/store.js'), ctx);
  vm.runInContext(layoutSrc, ctx, { filename: 'layout.js' });
  if (prior) win.R.learnPrior = prior;
  if (learn) vm.runInContext(read('js/learn.js'), ctx, { filename: 'learn.js' });
  return win.R;
}

// cartes : cours du dépôt + jeu visuel, en arbre d'au moins 4 nœuds
const maps = [];
for (const m of JSON.parse(read('cours/cours-droit-successions-liberalites.json')).maps) maps.push(m);
for (const f of fs.readdirSync(path.join(root, 'tests/visual')).filter((f) => f.endsWith('.json')).sort()) maps.push({ id: f, ...JSON.parse(read('tests/visual/' + f)) });
const corpus = maps.filter((m) => m.nodes.length >= 4 && m.nodes.length <= 120 && m.edges.filter((e) => e.kind === 'tree').length >= 3)
  .map((m) => { const c = { ...JSON.parse(JSON.stringify(m)), layout: 'tree' }; c.nodes.forEach((n, j) => { n.x = Number.isFinite(n.x) ? n.x : 0; n.y = Number.isFinite(n.y) ? n.y : j; }); return c; });
const held = (i) => i % 4 === 3;

const cur = engine(read('js/layout.js'));
const L = cur.learn, size = (m) => (n) => cur.layout.estimate(n, m);
const VP = { w: 1280, h: 800 };
const lay = (R, m) => R.layout.arrange(m, (n) => R.layout.estimate(n, m), { mode: 'tree', viewport: VP, learn: false }).pos;
const feat = (m, pos) => L.features(m, pos, size(m), VP);

// versions précédentes du moteur (historique git) : chacune a été corrigée parce qu'elle rangeait moins bien
const OLD = ['054c8df~1', '567f945', '567f945~1', 'bd71509'];
const olds = [];
for (const rev of OLD) { try { olds.push({ rev, R: engine(execSync(`git show ${rev}:js/layout.js`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(), false) }); } catch (e) { /* historique absent (clone superficiel) */ } }

// dégradations synthétiques
const kidsOf = (m) => { const k = new Map(); for (const e of m.edges) if (e.kind === 'tree') { if (!k.has(e.from)) k.set(e.from, []); k.get(e.from).push(e.to); } return k; };
const rootOf = (m) => { const c = new Set(m.edges.filter((e) => e.kind === 'tree').map((e) => e.to)), k = kidsOf(m); return m.nodes.filter((n) => !c.has(n.id)).sort((a, b) => sub(k, b.id).size - sub(k, a.id).size)[0].id; };
const sub = (k, id, out = new Set()) => { if (out.has(id)) return out; out.add(id); for (const c of k.get(id) || []) sub(k, c, out); return out; };
const clone = (pos) => Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { ...v }]));
const shift = (pos, ids, dx, dy) => { for (const i of ids) if (pos[i]) { pos[i].x += dx; pos[i].y += dy; } };
const ctr = (m, pos, id) => { const s = size(m)(m.nodes.find((n) => n.id === id)); return [pos[id].x + s.w / 2, pos[id].y + s.h / 2]; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function degrade(m, pos) {
  const k = kidsOf(m), r = rootOf(m), parts = k.get(r) || [], out = [];
  // parties en rang sous la racine (l'ancienne « liste »)
  if (parts.length >= 2) {
    const p = clone(pos), [rx, ry] = ctr(m, pos, r); let x = rx - parts.length * 160;
    for (const c of parts) { const [cx, cy] = ctr(m, pos, c); shift(p, sub(k, c), x - cx, ry + 140 - cy); x += 320; }
    out.push(['rang', p]);
  }
  const parOf = new Map(m.edges.filter((e) => e.kind === 'tree').map((e) => [e.to, e.from]));
  const inner = m.nodes.map((n) => n.id).filter((id) => parOf.has(id) && (k.get(id) || []).length);
  if (inner.length) {
    // un enfant reposé dans le couloir du lien qui arrive à son parent
    const id = inner[Math.floor(rnd() * inner.length)], par = parOf.get(id);
    const c = k.get(id)[Math.floor(rnd() * k.get(id).length)];
    const [px, py] = ctr(m, pos, par), [ix, iy] = ctr(m, pos, id), [cx, cy] = ctr(m, pos, c);
    const p = clone(pos); shift(p, sub(k, c), ix + (px - ix) * 0.55 - cx, iy + (py - iy) * 0.55 - cy);
    out.push(['couloir', p]);
  }
  const fam = [...k.entries()].filter(([, cs]) => cs.length >= 3);
  if (fam.length) {
    // deux frères échangés (l'ordre du cours ne tourne plus)
    const [, cs] = fam[Math.floor(rnd() * fam.length)], i = Math.floor(rnd() * (cs.length - 1)), a = cs[i], b = cs[cs.length - 1 - (i === cs.length - 1 ? 1 : 0)];
    if (a !== b) {
      const p = clone(pos), [ax, ay] = ctr(m, pos, a), [bx, by] = ctr(m, pos, b);
      shift(p, sub(k, a), bx - ax, by - ay); shift(p, sub(k, b), ax - bx, ay - by);
      out.push(['ordre', p]);
    }
  }
  if (parts.length) {
    // une branche éloignée de la racine (liens trop longs)
    const c = parts[Math.floor(rnd() * parts.length)], [rx, ry] = ctr(m, pos, r), [cx, cy] = ctr(m, pos, c);
    const p = clone(pos); shift(p, sub(k, c), (cx - rx) * 0.9, (cy - ry) * 0.9);
    out.push(['étirée', p]);
  }
  // tout tassé vers la racine (chevauchements)
  { const [rx, ry] = ctr(m, pos, r), p = clone(pos); for (const n of m.nodes) { const [x, y] = ctr(m, pos, n.id); shift(p, [n.id], (x - rx) * -0.35, (y - ry) * -0.35); } out.push(['tassée', p]); }
  return out;
}

// paires
const pairs = [];
corpus.forEach((m, i) => {
  const good = lay(cur, m), fg = feat(m, good);
  for (const o of olds) { try { pairs.push({ i, src: 'moteur ' + o.rev, b: fg, w: feat(m, lay(o.R, m)) }); } catch (e) { /* version incompatible */ } }
  for (const [name, p] of degrade(m, good)) pairs.push({ i, src: name, b: fg, w: feat(m, p) });
});
// une paire où les deux dispositions sont identiques n'apprend rien
const useful = pairs.filter((p) => L.F.some((k) => Math.abs(p.b[k] - p.w[k]) > 1e-9));
const train = useful.filter((p) => !held(p.i)), test = useful.filter((p) => held(p.i));
const acc = (set, w) => set.length ? set.filter((p) => L.cost(p.b, w) < L.cost(p.w, w)).length / set.length : 1;

const w0 = { ...L.PRIOR }, w = { ...L.PRIOR };
const before = acc(test, w0);
for (let ep = 0; ep < 40; ep++) for (const p of train) L.prefer(p.b, p.w, { w, base: w0, rate: 0.03, lambda: 0.05 });
const after = acc(test, w);
const bySrc = {};
for (const p of test) { const s = (bySrc[p.src] ||= { n: 0, a: 0, b: 0 }); s.n++; if (L.cost(p.b, w0) < L.cost(p.w, w0)) s.b++; if (L.cost(p.b, w) < L.cost(p.w, w)) s.a++; }
console.log(`paires utiles : ${useful.length} (apprentissage ${train.length}, mises de côté ${test.length}) · ${corpus.length} cartes · moteurs anciens : ${olds.map((o) => o.rev).join(', ') || 'aucun'}`);
console.log(`précision sur les cartes mises de côté : ${(before * 100).toFixed(1)} % avant → ${(after * 100).toFixed(1)} % après`);
for (const [s, v] of Object.entries(bySrc)) console.log(`  ${s.padEnd(16)} ${v.n.toString().padStart(3)} paires · ${(100 * v.b / v.n).toFixed(0)} % → ${(100 * v.a / v.n).toFixed(0)} %`);
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(2)]));
console.log('poids :', JSON.stringify(round(w)));

// méta-apprentissage : réglage de chaque carte avec la note apprise → mémoire de départ
const meta = engine(read('js/layout.js'), true, { w: round(w), mem: [] });
let gain = 0, tuned = 0;
corpus.forEach((m) => {
  const n0 = meta.learn.dump().mem.length;
  meta.layout.arrange(m, (n) => meta.layout.estimate(n, m), { mode: 'tree', viewport: VP });
  const mem = meta.learn.dump().mem;
  if (mem.length > n0 || mem.some((e) => e.id === m.id)) { const e = mem.find((x) => x.id === m.id); if (e) { tuned++; gain += e.g; } }
});
const all = meta.learn.dump().mem, heldIds = new Set(corpus.filter((_, i) => held(i)).map((m) => m.id));
const mem = all.map(({ d, p, g }) => ({ d, p, g }));
console.log(`méta : ${tuned}/${corpus.length} cartes mieux notées avec d'autres réglages (gain moyen ${(gain / Math.max(1, tuned)).toFixed(2)})`);

// effet sur les cartes mises de côté : moteur sans / avec apprentissage, note apprise et note du moteur
const ev = engine(read('js/layout.js'), true, { w: round(w), mem: all.filter((e) => !heldIds.has(e.id)).map(({ d, p, g }) => ({ d, p, g })) }); // sans les cartes mises de côté
let a0 = 0, a1 = 0, e0 = 0, e1 = 0, nh = 0;
corpus.forEach((m, i) => {
  if (!held(i)) return;
  const sz = (n) => ev.layout.estimate(n, m);
  const p0 = ev.layout.arrange(m, sz, { mode: 'tree', viewport: VP, learn: false }).pos;
  const p1 = ev.layout.arrange(m, sz, { mode: 'tree', viewport: VP }).pos;
  a0 += ev.learn.cost(ev.learn.features(m, p0, sz, VP)); a1 += ev.learn.cost(ev.learn.features(m, p1, sz, VP));
  e0 += ev.layout.evaluate(m, p0, sz, 'tree', VP).cost; e1 += ev.layout.evaluate(m, p1, sz, 'tree', VP).cost; nh++;
});
console.log(`cartes mises de côté (${nh}) : note apprise ${(a0 / nh).toFixed(1)} → ${(a1 / nh).toFixed(1)} · note du moteur ${(e0 / nh).toFixed(1)} → ${(e1 / nh).toFixed(1)}`);

if (!DRY) {
  const out = `/* Généré par tests/learn/train.cjs — ne pas modifier à la main.
 * Poids de la note apprise et mémoire de réglages (méta-apprentissage) appris sur ${corpus.length} cartes.
 * Précision sur les cartes mises de côté : ${(after * 100).toFixed(1)} % (${(before * 100).toFixed(1)} % avec les poids de départ). */
window.R = window.R || {};
R.learnPrior = ${JSON.stringify({ w: round(w), mem })};
`;
  fs.writeFileSync(path.join(root, 'js/learn-prior.js'), out);
  console.log('écrit js/learn-prior.js');
}
