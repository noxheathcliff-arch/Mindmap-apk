/* Tests V4 du rangement : lecture des notes (phrases), décisions à trois niveaux, application
 * vérifiée une à une, journal et refus persistants, abstentions.
 * Lancement : node tests/organize-v4.test.cjs   (aucune dépendance)
 *
 * Trois exigences :
 *  - ce que le texte établit est appliqué (sûr) ou proposé (probable) avec sa phrase en preuve ;
 *  - ce qu'il n'établit pas (négation, question, hypothèse, débat, citation, réserve) ne change rien ;
 *  - toute application est vérifiée : une correction qui casserait la carte est défaite seule.
 */
'use strict';
const { S, O, makeMap, applyAll, edge } = require('./harness.cjs');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const sure = (map) => O.audit(map).fixes.filter((f) => f.certainty === 'sure');
const state = (map) => JSON.stringify({ n: map.nodes, e: map.edges });
const sec = (title, kids) => [['r', 'chapitre', 'Chapitre'], ['s', 'section', title, 'r'], ...kids.map((k) => [k[0], k[1], k[2], 's', k[3]])];

/* ================= Le texte établit ================= */

test('Phrase — « car » lit la relation dans le bon sens, quel que soit l’ordre des mots', () => {
  const map = makeMap(sec('Marées', [['m', 'idee', 'Marées hautes', 'Les marées hautes se produisent car l’attraction lunaire soulève les océans.'], ['a', 'idee', 'Attraction lunaire', 'Force de la Lune.']]));
  applyAll(map, 'sure');
  const e = map.edges.find((x) => x.kind === 'link');
  ok(e && e.from === 'a' && e.to === 'm' && e.label === 'entraîne', 'Attraction lunaire —entraîne→ Marées hautes : ' + JSON.stringify(e));
});

test('Phrase — une énumération de causes donne un lien par cause, aucun entre elles', () => {
  const map = makeMap(sec('Obésité', [['a', 'idee', 'Sédentarité', 'Peu d’activité.'], ['b', 'idee', 'Sucres ajoutés', 'Boissons sucrées.'], ['g', 'idee', 'Prédisposition génétique', 'Variants.'],
    ['k', 'idee', 'Excès de masse grasse', 'La sédentarité, les sucres ajoutés et une prédisposition génétique favorisent l’excès de masse grasse.']]));
  applyAll(map, 'sure');
  for (const x of ['a', 'b', 'g']) ok(edge(map, x, 'k') && edge(map, x, 'k').label === 'favorise', x + ' —favorise→ k');
  ok(!edge(map, 'a', 'b') && !edge(map, 'a', 'g') && !edge(map, 'b', 'g'), 'aucun lien entre causes');
});

test('Phrase — « ce qui » prend pour sujet ce que la proposition précédente produit (cercle vicieux gardé)', () => {
  const map = makeMap(sec('Pauvreté', [['p', 'idee', 'Pauvreté des familles', 'Revenus bas.'], ['e', 'idee', 'Faible scolarisation', 'La pauvreté des familles entraîne une faible scolarisation.'],
    ['w', 'idee', 'Revenus faibles adultes', 'Une faible scolarisation mène à des revenus faibles adultes, ce qui entretient la pauvreté des familles.']]));
  applyAll(map, 'sure');
  ok(edge(map, 'p', 'e') && edge(map, 'e', 'w') && edge(map, 'w', 'p'), 'les trois arcs : ' + map.edges.filter((x) => x.kind === 'link').map((x) => x.from + '>' + x.to).join(' '));
  ok(O.audit(map).notes.every((n) => n.kind !== 'reverse'), 'un maillon de chaîne n’est pas un conflit de types');
});

test('Rattachement — « sauf si » range l’exception sous la règle qu’elle limite (libellé « sauf »)', () => {
  const map = makeMap(sec('Contrat de travail', [['p', 'idee', 'Renouvellement de l’essai', 'L’essai peut être renouvelé une fois, sauf si la convention collective l’interdit.'], ['c', 'idee', 'Convention collective', 'Accord de branche.']]));
  applyAll(map, 'sure');
  const t = S.parentEdge(map, 'c');
  ok(t.from === 'p' && t.label === 'sauf', 'Renouvellement —sauf→ Convention collective : ' + JSON.stringify(t));
});

test('Rattachement — une série annoncée (« en 3 étapes ») et posée à côté rejoint ce qu’elle détaille', () => {
  const map = makeMap(sec('Méthode', [['m', 'methode', 'Critiquer en 3 étapes', 'Trois étapes pour une critique constructive.'],
    ['a', 'etape', 'Dire ce qu’on ressent', 'Nommer son émotion.'], ['b', 'etape', 'S’en tenir aux faits', 'Un fait précis.'], ['c', 'etape', 'Dire ce qu’on attend', 'Une demande claire.'],
    ['p', 'idee', 'Généraliser', 'Éviter « toujours ».']]));
  applyAll(map, 'sure');
  ok(['a', 'b', 'c'].every((x) => S.parentEdge(map, x).from === 'm'), 'les 3 étapes sous la méthode');
  ok(S.parentEdge(map, 'p').from === 's', 'le piège reste à la partie');
});

test('Identité — un titre « Exemple : … » n’est plus retypé ; une passe suffit, la seconde ne change rien', () => {
  const map = makeMap(sec('Bulles', [['b', 'notion', 'Bulle spéculative', 'Prix déconnecté.'], ['k', 'notion', 'Krach', 'Effondrement.'], ['x', 'idee', 'Exemple : la tulipomanie', 'Un bulbe vaut une maison, puis la bulle spéculative éclate.']]));
  applyAll(map, 'sure');
  ok(S.node(map, 'x').type === 'idee', 'type inchangé');
  const once = state(map);
  applyAll(map, 'sure');
  ok(state(map) === once, 'seconde passe : rien ne bouge');
});

test('Fusion — deux frères au même titre et au même type ne font qu’un ; ailleurs, seulement signalés', () => {
  const map = makeMap(sec('Photosynthèse', [['a', 'notion', 'Chlorophylle', 'Pigment vert.'], ['b', 'notion', 'Chlorophylle', 'Capte la lumière.'], ['x', 'idee', 'Feuille', 'Riche en chlorophylle.']]));
  applyAll(map, 'sure');
  const ch = map.nodes.filter((n) => n.title === 'Chlorophylle');
  ok(ch.length === 1 && /Pigment vert/.test(ch[0].note) && /Capte la lumière/.test(ch[0].note), 'une seule, les deux notes gardées');
  const two = makeMap([['r', 'chapitre', 'Planètes et métaux'], ['s1', 'section', 'Astronomie', 'r'], ['a', 'notion', 'Mercure', 's1', 'Planète.'], ['s2', 'section', 'Chimie', 'r'], ['b', 'notion', 'Mercure', 's2', 'Métal liquide.']]);
  ok(!O.audit(two).fixes.some((f) => f.kind === 'merge' || f.ids.includes('a') && f.ids.includes('b')), 'homonymes de deux sections : rien de proposé');
  ok(O.audit(two).notes.some((n) => n.kind === 'duplicate'), 'mais signalés');
});

test('Décomposition — une décomposition mal câblée suit la phrase source', () => {
  const map = makeMap([['r', 'chapitre', 'Obligations'], ['d', 'definition', 'Contrat', 'r', 'Le contrat est un accord de volontés entre deux ou plusieurs personnes destiné à créer, modifier, transmettre ou éteindre des obligations.'],
    ['a', 'idee', 'Un accord de volontés', 'd'], ['p', 'idee', 'Deux ou plusieurs personnes', 'd'], ['o', 'idee', 'Créer, modifier, transmettre ou éteindre des obligations', 'p']]);
  edge(map, 'd', 'a').label = 'c’est'; edge(map, 'd', 'p').label = 'entre qui ?'; edge(map, 'p', 'o').label = 'pour ?';
  applyAll(map, 'sure');
  ok(S.parentEdge(map, 'p').from === 'a' && S.parentEdge(map, 'o').from === 'a', 'p et o précisent l’accord');
  ok(S.parentEdge(map, 'o').label === 'pour ?', 'le libellé suit la composante');
});

test('Budget — une relation dite explicitement peut dépasser le budget, jusqu’au double', () => {
  const spec = [['r', 'chapitre', 'X'], ['s', 'section', 'S', 'r']];
  const causes = ['Hausse des taux', 'Baisse du crédit', 'Recul de l’investissement', 'Montée du chômage', 'Chute de la demande'];
  causes.forEach((t, i) => spec.push(['c' + i, 'idee', t, 's', i < causes.length - 1 ? `La ${t.toLowerCase()} entraîne la ${causes[i + 1].toLowerCase()}.`.replace('La hausse', 'La hausse').replace(/la (baisse|montée|chute|hausse)/g, '$1').replace(/^La (.)/, (m, x) => 'La ' + x) : 'Fin.']));
  const map = makeMap(spec);
  const budget = O.linkBudget(map.nodes.length);
  applyAll(map, 'sure');
  const n = O.linkCount(map);
  ok(n <= 2 * budget, `au plus 2 × ${budget} : ${n}`);
});

/* ================= Le texte n'établit pas : abstention ================= */

const ABSTAIN = [
  ['négation', 'L’activité solaire n’entraîne pas la montée des océans.'],
  ['négation sans « ne »', 'Loin de provoquer la montée des océans, l’activité solaire varie peu.'],
  ['aucun lien', 'Aucun lien établi : l’activité solaire et la montée des océans évoluent séparément.'],
  ['question', 'L’activité solaire entraîne-t-elle la montée des océans ?'],
  ['hypothèse', 'Si l’on croit que l’activité solaire entraîne la montée des océans, on se trompe de cible.'],
  ['idée reçue', 'Selon une idée reçue, l’activité solaire provoque la montée des océans.'],
  ['citation', '> L’activité solaire provoque la montée des océans, disait un climatosceptique.'],
  ['guillemets', 'Le slogan « l’activité solaire provoque la montée des océans » est faux.'],
];
for (const [name, txt] of ABSTAIN) {
  test('Abstention — ' + name + ' : rien de sûr, la carte ne change pas', () => {
    const map = makeMap(sec('Climat', [['c', 'idee', 'Activité solaire', 'Variation du rayonnement.'], ['k', 'idee', 'Montée des océans', txt]]));
    const before = state(map);
    applyAll(map, 'sure');
    ok(state(map) === before, 'modifiée : ' + map.edges.filter((e) => e.kind === 'link').map((e) => e.label));
  });
}
test('Abstention — un débat rapporté est signalé, jamais tranché', () => {
  const map = makeMap(sec('Inflation', [['w', 'idee', 'Hausse des salaires', 'Revendications.'], ['p', 'idee', 'Hausse des prix', 'Selon les uns, la hausse des salaires entraîne la hausse des prix ; selon les autres, c’est l’inverse.']]));
  ok(!O.audit(map).fixes.some((f) => f.link), 'aucun lien');
  ok(O.audit(map).notes.some((n) => n.key.startsWith('deb:')), 'débat signalé');
});
test('Réserve — « peut favoriser » est proposé décoché, pas appliqué', () => {
  const map = makeMap(sec('Sommeil', [['e', 'idee', 'Écrans le soir', 'Lumière bleue.'], ['i', 'idee', 'Insomnie', 'Les écrans le soir peuvent favoriser l’insomnie.']]));
  const f = O.audit(map).fixes.filter((x) => x.link);
  ok(f.length === 1 && f[0].certainty === 'probable', 'probable : ' + f.map((x) => x.certainty));
});
test('Faux ami — « Partie » n’est pas la partie d’« Identifier les parties »', () => {
  const map = makeMap([['r', 'chapitre', 'Conflits'], ['s1', 'section', 'Notions', 'r'], ['n', 'notion', 'Partie', 's1', 'Personne au procès.'], ['s2', 'section', 'Méthode', 'r'],
    ['m', 'etape', 'Identifier les parties', 's2', 'Repérer la partie qui déclenche le comportement.']]);
  ok(!O.audit(map).fixes.some((f) => f.ids.includes('n') && f.ids.includes('m')), 'rien entre eux');
});

/* ================= Application vérifiée, journal, refus ================= */

test('Application vérifiée — une correction qui casserait la carte est défaite seule', () => {
  const map = makeMap(sec('S', [['a', 'idee', 'Alpha'], ['b', 'idee', 'Bêta', '']]));
  const good = { key: 'g', apply(m) { m.edges.find((e) => e.to === 'a').label = 'précise'; } };
  const cycle = { key: 'c', apply(m) { S.parentEdge(m, 's').from = 'a'; } };              // s sous a, a sous s : cycle
  const lose = { key: 'l', apply(m) { m.nodes.find((n) => n.id === 'b').title = 'X'; } };   // texte d'origine perdu
  const noop = { key: 'n', apply() {} };
  const { done, undone } = O.applyVerified(map, [good, cycle, lose, noop]);
  ok(done.map((f) => f.key).join() === 'g', 'appliquée : ' + done.map((f) => f.key));
  ok(undone.map((x) => x.fix.key).join() === 'c,l', 'défaites : ' + undone.map((x) => x.fix.key + ' ' + x.why));
  ok(!O.check(map).length && S.node(map, 'b').title === 'Bêta' && edge(map, 'r', 's'), 'carte intègre, texte intact');
});

test('Refus persistants — une correction refusée ne revient pas ; journal et refus survivent à l’export', () => {
  const map = makeMap(sec('Marées', [['m', 'idee', 'Marées hautes', 'Les marées hautes se produisent car l’attraction lunaire soulève les océans.'], ['a', 'idee', 'Attraction lunaire', 'Force.']]));
  const f = sure(map)[0];
  ok(f, 'une correction sûre');
  ok(!O.audit(map, { declined: new Set([f.key]) }).fixes.some((x) => x.key === f.key), 'refusée : absente');
  map.organizeLog = [O.logEntry(f, 1)];
  map.organizeDeclined = [f.key];
  const d = S.sanitize({ courses: [{ id: 'c1', title: 'C' }], maps: [{ ...map, courseId: 'c1' }] });
  ok(d.maps[0].organizeLog.length === 1 && d.maps[0].organizeLog[0].key === f.key, 'journal gardé');
  ok(d.maps[0].organizeDeclined[0] === f.key, 'refus gardés');
});

test('Stabilité — une passe suffit sur une carte riche ; la seconde ne change rien', () => {
  const map = makeMap(sec('Chaîne', [['p', 'idee', 'Pauvreté des familles', 'Revenus bas.'], ['e', 'idee', 'Faible scolarisation', 'La pauvreté des familles entraîne une faible scolarisation.'],
    ['x', 'idee', 'Exemple : Zola', 'Germinal montre la faible scolarisation des enfants de mineurs.'], ['c', 'idee', 'Bourses', 'Sauf si les bourses compensent la pauvreté des familles.']]));
  applyAll(map, 'sure');
  const once = state(map);
  applyAll(map, 'sure');
  ok(state(map) === once, 'seconde passe identique');
  ok(!O.check(map).length, 'intègre');
});

test('Performance — audit d’une carte de 1 000 nœuds en moins de 1,5 s', () => {
  const spec = [['r', 'chapitre', 'Grand cours']];
  for (let s = 0; s < 20; s++) {
    spec.push(['s' + s, 'section', 'Partie ' + s, 'r']);
    for (let i = 0; i < 49; i++) spec.push([`n${s}_${i}`, ['idee', 'idee', 'consequence', 'exemple', 'notion'][i % 5], `Élément ${s} ${i} terme${(s * 7 + i) % 90}`, 's' + s,
      `Le terme${(s * 7 + i + 1) % 90} entraîne le terme${(s * 7 + i + 2) % 90}, sauf si le terme${(s + i) % 90} intervient.`]);
  }
  const map = makeMap(spec);
  const t0 = Date.now();
  O.audit(map);
  const ms = Date.now() - t0;
  ok(ms < 1500, ms + ' ms');
  console.log('    (' + map.nodes.length + ' nœuds : ' + ms + ' ms)');
});

console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
