/* Tests de la remise en page automatique quand le moteur de rangement change de version.
 * Lancement : node tests/relayout.test.cjs   (aucune dépendance)
 */
'use strict';
const { S, win } = require('./harness.cjs');
const vm = require('vm'), fs = require('fs'), path = require('path');
Object.assign(win, { setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 800 });
// moteur de rangement (non chargé par le harnais commun)
for (const f of ['js/fan-net.js', 'js/layout.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), vm.createContext(win), { filename: f });
S.save = Object.assign(() => {}, { flush() {} });
const R = win.R;

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

const n = (id, title, x, y) => ({ id, type: 'notion', title, note: '', x, y });
const map = (id, extra = {}) => ({ id, courseId: 'c1', title: id, layout: 'right',
  nodes: [n('r', 'Racine', 0, 0), n('a', 'Enfant A', 5, 5), n('b', 'Enfant B', 10, 10)],
  edges: [{ from: 'r', to: 'a', kind: 'tree', label: 'mène à' }, { from: 'r', to: 'b', kind: 'tree' }], ...extra });
function load(maps, courses = [{ id: 'c1', title: 'Droit' }]) {
  S.data = S.sanitize(JSON.parse(JSON.stringify({ format: 'pioneer', version: 2, courses, maps })));
}

test('carte d’un ancien moteur : rangée à nouveau, positions d’avant gardées, disposition conservée', () => {
  load([map('old')]);
  ok(S.relayoutOutdated(), 'aucune carte rangée');
  const m = S.map('old');
  ok(m.layoutVer === R.layout.ENGINE, 'version non posée');
  ok(m.relaid && m.relaid.pos.a[0] === 5, 'positions d’avant perdues');
  ok(m.layout === 'right' && m.layoutPick === 'right', 'disposition changée : ' + m.layout + '/' + m.layoutPick);
  ok(!(m.nodes[1].x === 5 && m.nodes[1].y === 5), 'positions inchangées');
  ok(m.needsLayout, 'l’éditeur doit affiner avec les tailles réelles');
});

test('carte déjà à jour, carte de l’atelier, carte keepPos : intactes', () => {
  load([map('ok', { layoutVer: R.layout.ENGINE }), map('keep', { keepPos: true }), map('at', { courseId: 'c2' })],
    [{ id: 'c1', title: 'Droit' }, { id: 'c2', title: 'Atelier rangement' }]);
  ok(!S.relayoutOutdated(), 'une carte a bougé');
  for (const id of ['ok', 'keep', 'at']) ok(S.map(id).nodes[1].x === 5 && !S.map(id).relaid, id + ' a bougé');
});

test('les champs survivent à la sauvegarde (sanitize)', () => {
  load([map('old')]);
  S.relayoutOutdated();
  const again = S.sanitize(JSON.parse(JSON.stringify(S.data)));
  const m = again.maps.find((x) => x.id === 'old');
  ok(m.layoutVer === R.layout.ENGINE && m.relaid && m.relaid.pos.b, 'champs perdus');
  load([map('k', { keepPos: true })]);
  ok(S.sanitize(JSON.parse(JSON.stringify(S.data))).maps[0].keepPos, 'keepPos perdu');
});

test('nouvelle carte : déjà à la version courante', () => {
  load([]);
  const m = S.addMap('c1', 'Neuve');
  ok(m.layoutVer === R.layout.ENGINE, 'version absente');
});

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed ? 1 : 0);
