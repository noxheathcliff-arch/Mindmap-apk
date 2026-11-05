/* Tests des jonctions (convergences) : plusieurs liens → un seul résultat, ET / OU.
 * Lancement : node tests/joins.test.cjs   (aucune dépendance)
 */
'use strict';
const { S } = require('./harness.cjs');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const E = (id, from, to, extra = {}) => ({ id, from, to, kind: 'link', label: '', ...extra });

test('jonction valide : gardée, op et libellé communs, pas de fourche', () => {
  const es = [E('1', 'a', 'r', { kind: 'tree', join: 'j', group: 'g' }), E('2', 'b', 'r', { join: 'j', op: 'ou', label: 'mènent à' }), E('3', 'c', 'r', { join: 'j', op: 'et' })];
  S.normalizeGroups(es);
  ok(es.every((e) => e.join === 'j'), 'jonction perdue');
  ok(es.every((e) => e.op === 'ou'), 'op incohérent : ' + es.map((e) => e.op));
  ok(es.every((e) => e.label === 'mènent à'), 'libellé non partagé');
  ok(!es[0].group, 'une branche de jonction garde sa fourche');
});

test('moins de deux branches : join et op retirés', () => {
  const es = [E('1', 'a', 'r', { join: 'j', op: 'et' }), E('2', 'b', 'x', { op: 'ou' })];
  S.normalizeJoins(es);
  ok(!es[0].join && !es[0].op, 'jonction d’une seule branche gardée');
  ok(!('op' in es[1]), 'op sans jonction gardé');
});

test('cibles différentes : la branche hors cible majoritaire est détachée', () => {
  const es = [E('1', 'a', 'r', { join: 'j', op: 'et' }), E('2', 'b', 'r', { join: 'j' }), E('3', 'c', 'z', { join: 'j' })];
  S.normalizeJoins(es);
  ok(es[0].join === 'j' && es[1].join === 'j', 'branches valides perdues');
  ok(!es[2].join && !es[2].op, 'branche vers une autre cible gardée');
  ok(es[1].op === 'et', 'op non propagé');
});

test('cibles mêlées sans majorité suffisante : tout est retiré', () => {
  const es = [E('1', 'a', 'r', { join: 'j' }), E('2', 'b', 'z', { join: 'j' })];
  S.normalizeJoins(es);
  ok(es.every((e) => !e.join), 'jonction vers deux cibles gardée');
});

test('deux branches depuis la même source : une seule compte', () => {
  const es = [E('1', 'a', 'r', { join: 'j' }), E('2', 'a', 'r', { join: 'j' })];
  S.normalizeJoins(es);
  ok(es.every((e) => !e.join), 'jonction d’une seule source gardée');
});

test('sanitize : join/op importés, op invalide ignoré, suppression d’un nœud → jonction défaite', () => {
  const n = (id) => ({ id, type: 'notion', title: id, note: '', x: 0, y: 0 });
  const d = S.sanitize({ courses: [{ id: 'c' }], maps: [{ id: 'm', courseId: 'c', nodes: ['a', 'b', 'c', 'r'].map(n),
    edges: [{ id: 'e1', from: 'b', to: 'r', kind: 'tree', join: 'J', op: 'et' }, { id: 'e2', from: 'a', to: 'r', kind: 'link', join: 'J', op: 'bof' }, { id: 'e3', from: 'c', to: 'r', kind: 'link', join: 'J' }] }] });
  const m = d.maps[0];
  ok(m.edges.every((e) => e.join === 'J' && e.op === 'et'), 'jonction mal importée : ' + JSON.stringify(m.edges));
  ok(S.joinInto(m, 'r').length === 3, 'joinInto');
  ok(S.joinOf(m, m.edges[1]).length === 3, 'joinOf');
  // la révision pose la question ET
  ok(/cumulatives/.test(S.promptFor(m, m.nodes[3])), 'consigne ET absente : ' + S.promptFor(m, m.nodes[3]));
  ok(S.isReviewable(m, m.nodes[3]), 'résultat non révisable');
  // suppression de deux sources : il n'en reste qu'une
  m.edges = m.edges.filter((e) => e.from !== 'a' && e.from !== 'c');
  S.normalizeGroups(m.edges);
  ok(!m.edges[0].join && !m.edges[0].op, 'jonction d’une branche survit à la suppression');
});

test('consigne OU', () => {
  const n = (id) => ({ id, type: 'notion', title: id, note: '', x: 0, y: 0 });
  const d = S.sanitize({ courses: [{ id: 'c' }], maps: [{ id: 'm', courseId: 'c', nodes: ['a', 'b', 'r'].map(n),
    edges: [{ from: 'a', to: 'r', kind: 'tree', join: 'J', op: 'ou' }, { from: 'b', to: 'r', kind: 'link', join: 'J' }] }] });
  ok(/Une seule suffit/.test(S.promptFor(d.maps[0], d.maps[0].nodes[2])), 'consigne OU absente');
});

test('copie de carte : la jonction copiée reste une jonction (ids d’arêtes neufs)', () => {
  const n = (id) => ({ id, type: 'notion', title: id, note: '', x: 0, y: 0 });
  S.data = S.sanitize({ courses: [{ id: 'c' }], maps: [{ id: 'm', courseId: 'c', nodes: ['a', 'b', 'r'].map(n),
    edges: [{ from: 'a', to: 'r', kind: 'tree', join: 'J', op: 'et' }, { from: 'b', to: 'r', kind: 'link', join: 'J', op: 'et' }] }] });
  S.save = Object.assign(() => {}, { flush() {} });
  const fn = Object.keys(S).find((k) => /^(duplicateMap|copyMap|cloneMap)$/.test(k));
  if (!fn) { console.log('  (pas de copie de carte exposée : ignoré)'); return; }
  const c = S[fn]('m');
  ok(c && c.edges.length === 2 && c.edges.every((e) => e.join && e.op === 'et'), 'jonction perdue à la copie');
});

console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
