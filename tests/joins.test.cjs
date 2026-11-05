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

test('sans op par défaut : la jonction reste sans op, le libellé libre est partagé', () => {
  const es = [E('1', 'a', 'r', { join: 'j' }), E('2', 'b', 'r', { join: 'j', label: 'conditions de validité' }), E('3', 'c', 'r', { join: 'j' })];
  S.normalizeGroups(es);
  ok(es.every((e) => !('op' in e)), 'op ajouté par défaut');
  ok(es.every((e) => e.label === 'conditions de validité'), 'libellé non partagé : ' + es.map((e) => e.label));
});

test('consigne : libellé libre en priorité, neutre sans op ni libellé', () => {
  const n = (id) => ({ id, type: 'notion', title: id, note: '', x: 0, y: 0 });
  const mk = (extra) => S.sanitize({ courses: [{ id: 'c' }], maps: [{ id: 'm', courseId: 'c', nodes: ['a', 'b', 'r'].map(n),
    edges: [{ from: 'a', to: 'r', kind: 'tree', join: 'J', ...extra }, { from: 'b', to: 'r', kind: 'link', join: 'J' }] }] }).maps[0];
  const m1 = mk({ label: 'conditions de validité', op: 'et' });
  ok(m1.edges.every((e) => e.label === 'conditions de validité'), 'libellé non normalisé');
  ok(/\(conditions de validité\)/.test(S.promptFor(m1, m1.nodes[2])), 'consigne sans libellé : ' + S.promptFor(m1, m1.nodes[2]));
  const m2 = mk({});
  ok(m2.edges.every((e) => !('op' in e)), 'op inventé');
  ok(/^Qu'est-ce qui mène à « r » \?/.test(S.promptFor(m2, m2.nodes[2])), 'consigne neutre : ' + S.promptFor(m2, m2.nodes[2]));
});

test('jxy : nettoyé, partagé, retiré hors jonction', () => {
  const n = (id) => ({ id, type: 'notion', title: id, note: '', x: 0, y: 0 });
  const d = S.sanitize({ courses: [{ id: 'c' }], maps: [{ id: 'm', courseId: 'c', nodes: ['a', 'b', 'x', 'r'].map(n),
    edges: [{ from: 'a', to: 'r', kind: 'tree', join: 'J', jxy: { x: 12.4, y: -9e9 } }, { from: 'b', to: 'r', kind: 'link', join: 'J', jxy: { x: 'bof', y: 3 } },
      { from: 'x', to: 'a', kind: 'link', jxy: { x: 5, y: 5 } }] }] });
  const m = d.maps[0];
  ok(m.edges[0].jxy && m.edges[0].jxy.x === 12 && m.edges[0].jxy.y === -4000, 'jxy mal borné : ' + JSON.stringify(m.edges[0].jxy));
  ok(JSON.stringify(m.edges[1].jxy) === JSON.stringify(m.edges[0].jxy), 'jxy non partagé');
  ok(m.edges[0].jxy !== m.edges[1].jxy, 'jxy partagé par référence');
  ok(!('jxy' in m.edges[2]), 'jxy hors jonction gardé');
  const es = [E('1', 'a', 'r', { join: 'j', jxy: { x: 0, y: 0 } }), E('2', 'b', 'r', { join: 'j' })];
  S.normalizeJoins(es);
  ok(es.every((e) => !('jxy' in e)), 'décalage nul gardé');
  const es2 = [E('1', 'a', 'r', { join: 'j', jxy: { x: 4, y: 4 } }), E('2', 'b', 'z', { join: 'j', jxy: { x: 4, y: 4 } })];
  S.normalizeJoins(es2);
  ok(es2.every((e) => !('jxy' in e)), 'jxy gardé après dissolution');
});

console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
