/* Tests des exercices de révision (QCM, vrai/faux, question-réponse) : lecture et nettoyage,
 * rapport d'import, file de révision, correction automatique, maîtrise des nœuds couverts, annulation.
 * Lancement : node tests/exercises.test.cjs   (aucune dépendance)
 */
'use strict';
const { S } = require('./harness.cjs');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

const node = (id, type, title, extra = {}) => ({ id, type, title, note: 'note', x: 0, y: 0, ...extra });
function course(exercises) {
  return {
    format: 'ratio', version: 2, kind: 'course',
    courses: [{ id: 'c1', title: 'Droit des obligations' }],
    maps: [
      { id: 'm1', courseId: 'c1', title: 'Le contrat', order: 1,
        nodes: [node('r', 'chapitre', 'Le contrat'), node('d', 'definition', 'Contrat'), node('v', 'notion', 'Vices du consentement')],
        edges: [{ from: 'r', to: 'd', kind: 'tree' }, { from: 'r', to: 'v', kind: 'tree' }],
        exercises },
      { id: 'm2', courseId: 'c1', title: 'Sans exercices', order: 2,
        nodes: [node('a', 'chapitre', 'Responsabilité'), node('b', 'notion', 'Faute')],
        edges: [{ from: 'a', to: 'b', kind: 'tree' }] },
    ],
  };
}
const EX = [
  { id: 'q1', kind: 'qa', q: 'Qu’est-ce qu’un contrat ?', a: 'Un accord de volontés destiné à créer des obligations.', nodeIds: ['d'] },
  { id: 'q2', kind: 'qcm', q: 'Lequel n’est pas un vice du consentement ?', choices: ['Erreur', 'Dol', 'Violence', 'Lésion'], answer: 3, explain: 'La lésion n’est pas un vice du consentement.', nodeIds: ['v'] },
  { id: 'q3', kind: 'vf', q: 'Le dol peut émaner d’un tiers sans conséquence.', answer: 'faux', nodeIds: ['v', 'fantome'] },
  { id: 'q4', kind: 'qcm', q: 'Vices du consentement (plusieurs réponses)', choices: ['Erreur', 'Dol', 'Cause'], answer: [1, 0], nodeIds: ['v'] },
  { id: 'bad1', kind: 'qcm', q: 'Sans choix', choices: ['Seul'], answer: 0 },
  { id: 'bad2', kind: 'vf', q: 'Ni vrai ni faux', answer: 'peut-être' },
  { id: 'bad3', kind: 'qa', q: 'Sans réponse' },
  { id: 'bad4', kind: 'essai', q: 'Type inconnu', a: 'x' },
  { id: 'q1', kind: 'vf', q: 'Identifiant en double', answer: true, nodeIds: ['d'] },
];
function load(data) { S.data = S.sanitize(JSON.parse(JSON.stringify(data))); S.save = Object.assign(() => {}, { flush() {} }); S.changed = () => {}; }

test('lecture : exercices valides gardés, incomplets écartés, réponses normalisées', () => {
  load(course(EX));
  const xs = S.map('m1').exercises;
  ok(xs.length === 5, 'attendu 5 exercices, obtenu ' + xs.length);
  ok(xs.find((x) => x.id === 'q3').answer === false, 'vf « faux » → false');
  ok(JSON.stringify(xs.find((x) => x.id === 'q4').answer) === '[0,1]', 'réponses multiples triées');
  ok(new Set(xs.map((x) => x.id)).size === 5, 'identifiants uniques');
  ok(xs.find((x) => x.id === 'q3').nodeIds.join() === 'v', 'renvoi vers un nœud absent retiré');
  ok(xs.every((x) => x.review && x.review.box === 0 && x.review.rating === null), 'état de révision vierge');
  ok(!('exercises' in S.map('m2')), 'carte sans exercices : pas de champ vide');
});

test('import : rapport (exercices, incomplets, renvois)', () => {
  load({ courses: [], maps: [] });
  const p = S.parseImport(JSON.stringify(course(EX)));
  ok(p.stats.exercises === 5, 'stats.exercises = ' + p.stats.exercises);
  ok(p.issues.some((t) => /4 exercices incomplets/.test(t)), 'incomplets signalés : ' + p.issues.join(' | '));
  ok(p.issues.some((t) => /renvoi d’exercice/.test(t)), 'renvoi signalé');
});

test('file : exercices à la place des fiches, fiches pour la carte sans exercices', () => {
  load(course(EX));
  const q = S.reviewQueue({ courseId: 'c1' }, { limit: 100 });
  const m1 = q.filter((x) => x.mapId === 'm1'), m2 = q.filter((x) => x.mapId === 'm2');
  ok(m1.length === 5 && m1.every((x) => x.exId && x.key === 'x:' + x.exId), 'carte 1 : 5 exercices');
  ok(m1.map((x) => x.exId).join() === EX.slice(0, 4).map((x) => x.id).join() + ',' + S.map('m1').exercises[4].id, 'ordre du fichier');
  ok(m2.length && m2.every((x) => !x.exId && x.key === x.nodeId), 'carte 2 : fiches');
  ok(m1.every((x) => x.fresh), 'nouvelles');
  const st = S.mapStats(S.map('m1'));
  ok(st.reviewable === 5 && st.due === 5 && st.exercises === 5, 'bilan de la carte');
});

test('portée branche : exercices qui couvrent la branche', () => {
  load(course(EX));
  const q = S.reviewQueue({ mapId: 'm1', nodeId: 'v' }, { limit: 100 });
  ok(q.length === 3 && q.every((x) => ['q2', 'q3', 'q4'].includes(x.exId)), 'branche v : ' + q.map((x) => x.exId));
});

test('correction : QCM (une ou plusieurs réponses) et vrai/faux', () => {
  load(course(EX));
  const xs = S.map('m1').exercises, by = (id) => xs.find((x) => x.id === id);
  ok(S.isCorrect(by('q2'), 3) && !S.isCorrect(by('q2'), 0), 'QCM simple');
  ok(S.isCorrect(by('q4'), [1, 0]) && !S.isCorrect(by('q4'), [0]) && !S.isCorrect(by('q4'), [0, 1, 2]), 'QCM multiple');
  ok(S.isCorrect(by('q3'), false) && !S.isCorrect(by('q3'), true), 'vrai/faux');
  const r = { box: 0, due: 0, last: 0, rating: null };
  ok(S.gradeFor(r, false) === 'revoir' && S.gradeFor(r, true) === 'compris', 'première fois');
  ok(S.gradeFor({ ...r, last: 1, rating: 'compris' }, true) === 'maitrise', 'juste deux fois → maîtrisé');
  ok(S.gradeFor({ ...r, last: 1, rating: 'revoir' }, true) === 'compris', 'juste après une erreur → compris');
});

test('note : échéance de l’exercice, maîtrise du nœud couvert, annulation', () => {
  load(course(EX));
  const m = S.map('m1'), ex = m.exercises.find((x) => x.id === 'q2');
  const before = { ...ex.review };
  S.rate(m, ex, 'compris');
  ok(ex.review.rating === 'compris' && ex.review.box === 1 && ex.review.due > Date.now(), 'exercice noté');
  ok(S.node(m, 'v').review.rating === 'compris', 'nœud couvert : compris');
  const q3 = m.exercises.find((x) => x.id === 'q3');
  S.rate(m, q3, 'revoir');
  ok(S.node(m, 'v').review.rating === 'revoir', 'nœud couvert : la moins bonne note');
  ok(S.reviewQueue({ mapId: 'm1' }, { limit: 100 }).length === 3, 'deux exercices notés ne sont plus dus');
  ok(S.weakCards().some((it) => it.ex && it.ex.id === 'q3'), 'à retravailler : l’exercice raté');
  S.unrate(m, q3, { box: 0, due: 0, last: 0, rating: null }, Object.keys(S.data.settings.reviewLog)[0]);
  ok(S.node(m, 'v').review.rating === 'compris', 'annulation : maîtrise recalculée');
  S.unrate(m, ex, before, Object.keys(S.data.settings.reviewLog)[0] || 'x');
  ok(S.node(m, 'v').review.rating === null, 'plus rien de fait : nœud vierge');
});

test('première carte imposée (start) par sa clé', () => {
  load(course(EX));
  const q = S.reviewQueue({ courseId: 'c1' }, { first: { mapId: 'm1', key: 'x:q3' } });
  ok(q[0].exId === 'q3', 'en tête : ' + q[0].key);
  const q2 = S.reviewQueue({ courseId: 'c1' }, { first: { mapId: 'm2', nodeId: 'b' } });
  ok(q2[0].nodeId === 'b', 'fiche en tête');
  const it = S.reviewItem(S.map('m1'), 'x:q2');
  ok(it && it.ex.id === 'q2' && it.node.id === 'v', 'élément par clé');
});

test('copie de carte : exercices aux nouveaux identifiants', () => {
  load(course(EX));
  const copy = S.duplicateMap('m1');
  ok(copy.exercises.length === 5 && copy.exercises.every((x) => x.nodeIds.every((i) => S.node(copy, i))), 'renvois suivis');
  ok(copy.exercises[0].id !== 'q1', 'identifiants neufs');
});

test('le plan d’un dossier ne se révise pas : la file commence par les exercices', () => {
  const ex = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../skills/ratio-livre-vers-cours/exemple-cours-en-dossiers.json'), 'utf8'));
  load(ex);
  const plans = S.data.maps.filter((m) => m.role === 'plan');
  ok(plans.length && plans.every((m) => S.reviewItems(m).length === 0 && S.mapStats(m).reviewable === 0), 'plan révisable');
  const cid = S.data.courses[0].id;
  const q = S.reviewQueue({ courseId: cid }, { limit: 20 });
  ok(q.length && q.every((c) => c.exId), 'file : ' + q.slice(0, 3).map((c) => c.key).join(', '));
});

console.log(`\n${passed} réussis, ${failed} échoués`);
process.exit(failed ? 1 : 0);
