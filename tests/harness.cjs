/* Harnais commun des tests et de la mesure : charge le vrai code de l'app (util, store,
 * organize) dans un contexte Node isolé, sans navigateur ni dépendance.
 * Variables d'environnement (mesure avant/après) : PIONEER_ORGANIZE, PIONEER_STORE = autre fichier.
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const win = {
  R: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
  document: { addEventListener() {}, documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {} }) },
};
win.window = win; win.self = win;
const ctx = vm.createContext(win);
const files = {
  'js/util.js': path.join(root, 'js/util.js'),
  'js/store.js': process.env.PIONEER_STORE || path.join(root, 'js/store.js'),
  'js/organize.js': process.env.PIONEER_ORGANIZE || path.join(root, 'js/organize.js'),
};
for (const [name, f] of Object.entries(files)) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: name });
const { store: S, organize: O } = win.R;

/** Carte de test : spec = [[id, type, title, parentId, note?]] — l'ordre donne l'ordre de lecture ;
    links = [[from, to, label]] (renvois) */
function makeMap(spec, links = [], { layout = 'right' } = {}) {
  const map = { id: 'm', title: 'Carte de test', layout, nodes: [], edges: [] };
  spec.forEach(([id, type, title, parent, note], i) => {
    const n = S.newNode({ type, title, note: note || '', x: parent ? 300 : 0, y: i * 60 });
    n.id = id;
    map.nodes.push(n);
    if (parent) map.edges.push({ id: 'e' + id, from: parent, to: id, kind: 'tree', label: '' });
  });
  links.forEach(([from, to, label], i) => map.edges.push({ id: 'l' + i + from + to, from, to, kind: 'link', label }));
  return map;
}
const fixesOf = (map, kind, opts) => O.audit(map, opts).fixes.filter((f) => !kind || f.kind === kind);
const applyAll = (map, certainty) => { for (const f of O.audit(map).fixes) if (!certainty || f.certainty === certainty) f.apply(map); S.normalizeGroups(map.edges); };
const edge = (map, from, to) => map.edges.find((e) => e.from === from && e.to === to);

module.exports = { S, O, win, makeMap, fixesOf, applyAll, edge };
