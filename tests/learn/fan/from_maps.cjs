/* Cartes rangées à la main dans Pioneer (cours « Atelier rangement » exporté) → exemples du réseau.
 *   node tests/learn/fan/from_maps.cjs export.json [autre.json…]   → écrit tests/learn/fan/hand.json
 *   puis : cd tests/learn/fan && python3 train_nn.py                 (prend xmind.json + hand.json)
 * Chaque carte devient { nodes: [{x0,y0,x1,y1}], parent: {i: j|null}, w } avec les tailles estimées
 * par le moteur (x, y = coin haut-gauche dans l'éditeur). Seules les arêtes d'arbre comptent. */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const win = { R: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
  document: { addEventListener() {}, documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {} }) }, innerWidth: 1280, innerHeight: 800 };
win.window = win; win.self = win;
const ctx = vm.createContext(win);
for (const f of ['js/util.js', 'js/store.js', 'js/layout.js']) vm.runInContext(read(f), ctx, { filename: f });
const R = win.R;
const files = process.argv.slice(2);
if (!files.length) { console.error('usage : node from_maps.cjs export.json…'); process.exit(1); }
const out = [];
for (const f of files) {
  let d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (typeof d === 'string') d = JSON.parse(d);
  for (const map of d.maps || []) {
    const idx = new Map(map.nodes.map((n, i) => [n.id, i]));
    const parent = {}; map.nodes.forEach((_, i) => { parent[i] = null; });
    for (const e of map.edges || []) if (e.kind === 'tree' && idx.has(e.from) && idx.has(e.to)) parent[idx.get(e.to)] = idx.get(e.from);
    const nodes = map.nodes.map((n) => { const s = R.layout.estimate(n, map); return { x0: n.x, y0: n.y, x1: n.x + s.w, y1: n.y + s.h, t: n.title }; });
    if (nodes.length >= 3) out.push({ title: map.title, nodes, parent, w: 3 }); // rangé à la main : pèse 3 fois une miniature
  }
}
fs.writeFileSync(path.join(__dirname, 'hand.json'), JSON.stringify(out));
console.log(out.length, 'cartes →', path.join(__dirname, 'hand.json'));
