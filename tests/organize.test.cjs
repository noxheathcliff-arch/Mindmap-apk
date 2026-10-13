/* Tests de l'audit d'organisation (js/organize.js), de la révision qui en dépend (js/store.js)
 * et de l'accord avec le skill d'import.
 * Lancement : node tests/organize.test.cjs   (aucune dépendance : le vrai code de l'app est
 * chargé dans un contexte isolé, avec le vrai store pour childrenOf / parentEdge / newNode).
 *
 * Trois familles :
 *  - cas A–H : ce que le moteur doit établir (relations dites par la carte) ;
 *  - cas adversariaux : ce qu'il ne doit JAMAIS cocher (négation, homonymie, raccourci, sens
 *    déduit des seuls types, intitulé de section…) — issus de l'audit multi-agent ;
 *  - révision et skill : la structure produite se révise correctement, le skill et le moteur
 *    appliquent les mêmes règles.
 */
'use strict';
const { S, O, makeMap, fixesOf, applyAll, edge } = require('./harness.cjs');
const fs = require('fs'), path = require('path');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const sure = (map, kind) => fixesOf(map, kind).filter((f) => f.certainty === 'sure');
const sentences = (map) => map.edges.map((e) => `${S.node(map, e.from).title} —${e.label}→ ${S.node(map, e.to).title}`);
const SUCCESSION = 'La succession est une notion juridique qui désigne la transmission du patrimoine d’une personne décédée à une ou plusieurs personnes appelées à lui succéder, notamment ses héritiers.';

/* ======================= A–H : ce que le moteur doit établir ======================= */

test('A — cause et conséquences : liens causaux nommés, aucun verbe posé depuis la section', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Le climat'],
    ['s', 'section', 'Le réchauffement climatique', 'r'],
    ['c', 'cause', 'Émissions de gaz à effet de serre', 's', 'Elles retiennent la chaleur.'],
    ['k1', 'consequence', 'Fonte de la banquise', 's', 'Les émissions de gaz à effet de serre réchauffent l’Arctique : la banquise fond.'],
    ['k2', 'consequence', 'Montée des océans', 's', 'Conséquence des émissions de gaz à effet de serre : les océans montent.'],
  ]);
  applyAll(map, 'sure');
  for (const k of ['k1', 'k2']) {
    const e = edge(map, 'c', k);
    ok(e && e.kind === 'link' && e.label === 'entraîne', 'cause —entraîne→ ' + k + ', trouvé ' + JSON.stringify(e));
  }
  ok(!edge(map, 'k1', 'c') && !edge(map, 'k2', 'c'), 'aucun lien effet → cause');
  ok(edge(map, 's', 'c').label === '', 'un intitulé de section n’est pas une cause : pas de « section —a pour cause→ »');
  ok(O.check(map).length === 0, 'graphe intègre : ' + O.check(map));
});

test('B — condition → effet : « permet », condition à la source', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Le mariage'],
    ['s', 'section', 'Effets du mariage', 'r'],
    ['c', 'condition', 'Consentement des époux', 's', 'Sans lui, pas de mariage valable.'],
    ['f', 'effet', 'Devoir de fidélité', 's', 'Le consentement des époux fait naître le devoir de fidélité.'],
  ]);
  const f = fixesOf(map, 'causal');
  ok(f.length === 1 && f[0].certainty === 'sure', 'une proposition sûre (l’effet nomme la condition)');
  f[0].apply(map);
  ok(edge(map, 'c', 'f') && edge(map, 'c', 'f').label === 'permet', 'condition —permet→ effet');
});

test('C — définition de la succession : composantes en chaîne, mots exacts, relief, original récupérable', () => {
  const map = makeMap([['r', 'chapitre', 'Les successions'], ['d', 'definition', 'Succession', 'r', SUCCESSION]]);
  const f = fixesOf(map, 'definition');
  ok(f.length === 1 && f[0].certainty === 'sure', 'décomposition proposée (cours de droit : sûre)');
  f[0].apply(map);
  const kids = map.nodes.filter((n) => n.type === 'idee');
  const by = (t) => kids.find((n) => n.title.toLowerCase() === t.toLowerCase());
  const qual = by('une notion juridique'), tr = by('la transmission du patrimoine'), who = by('une personne décédée');
  const to = by('une ou plusieurs personnes appelées à lui succéder'), heirs = by('ses héritiers');
  ok(qual && tr && who && to && heirs, 'composantes : ' + kids.map((k) => k.title).join(' | '));
  ok(edge(map, 'd', qual.id).label === 'c’est' && edge(map, 'd', tr.id).label === 'désigne', 'qualification et cœur');
  ok(edge(map, tr.id, who.id).label === 'de qui ?' && edge(map, tr.id, to.id).label === 'à qui ?', 'compléments sous le cœur');
  ok(edge(map, to.id, heirs.id).label === 'notamment', '« notamment » précise les destinataires sans les épuiser');
  ok(to.em && to.em.toLowerCase() === 'une ou plusieurs', '« une ou plusieurs » mis en relief');
  for (const k of kids) ok(SUCCESSION.toLowerCase().includes(k.title.toLowerCase()), 'mots exacts : « ' + k.title + ' »');
  ok(S.node(map, 'd').note === SUCCESSION, 'la définition intégrale reste dans la note');
});

test('D — exemple : rattaché à la conséquence qu’il nomme ; renvoi vers la notion générale proposé (probable)', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Dévolution'],
    ['n', 'notion', 'Indivision successorale', 'r', 'Plusieurs héritiers propriétaires ensemble.'],
    ['s', 'section', 'Effets du décès', 'r'],
    ['k1', 'consequence', 'Ouverture de la succession', 's', 'Au jour du décès.'],
    ['k2', 'consequence', 'Saisine des héritiers', 's', 'Ils reçoivent les biens de plein droit.'],
    ['x', 'exemple', 'Deux enfants héritent de leur père', 's', 'Par la saisine des héritiers, ils reçoivent la maison et se trouvent en indivision successorale.'],
  ]);
  const cross = fixesOf(map, 'cross').find((f) => f.key === 'x:x>n');
  ok(cross && cross.certainty === 'probable' && cross.preview[0].includes('—illustre→'), 'renvoi « illustre » vers la notion, à confirmer');
  applyAll(map, 'sure');
  const e = edge(map, 'k2', 'x');
  ok(e && e.kind === 'tree' && e.label === 'illustré par', 'Saisine —illustré par→ exemple');
  ok(S.ancestors(map, 'x').some((a) => a.id === 's'), 'l’exemple reste dans sa section');
});

test('E — renvoi entre sections proposé sans toucher la hiérarchie', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Droit des contrats'],
    ['s1', 'section', 'Formation', 'r'],
    ['d', 'definition', 'Vice du consentement', 's1', 'Erreur, dol ou violence qui altère la volonté.'],
    ['s2', 'section', 'Sanctions', 'r'],
    ['a', 'idee', 'Nullité relative', 's2', 'Elle sanctionne un vice du consentement ; seule la partie protégée peut l’invoquer.'],
  ]);
  const tree = JSON.stringify(map.edges.filter((e) => e.kind === 'tree'));
  // « Elle sanctionne un vice du consentement » : le verbe dit un usage, pas une cause — toujours à confirmer
  const f = O.audit(map).fixes.filter((x) => x.kind === 'cross' || x.kind === 'phrase');
  ok(f.length === 1 && f[0].certainty === 'probable', 'une mention n’est pas une dépendance prouvée : probable');
  f[0].apply(map);
  ok(edge(map, 'a', 'd') && edge(map, 'a', 'd').label === 'fait appel à', 'Nullité relative —fait appel à→ Vice du consentement');
  ok(JSON.stringify(map.edges.filter((e) => e.kind === 'tree')) === tree, 'hiérarchie inchangée');
});

test('F — liste plate : corrigée quand la carte le permet, signalée sinon', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Responsabilité civile'],
    ['s', 'section', 'Responsabilité du fait personnel', 'r'],
    ['d', 'definition', 'Faute', 's', 'Manquement à une obligation préexistante.'],
    ['c', 'condition', 'Lien de causalité', 's', 'Le dommage doit résulter de la faute.'],
    ['k', 'consequence', 'Obligation de réparer', 's', 'Le lien de causalité établi, l’auteur doit réparer le dommage.'],
    ['x', 'exemple', 'Le cycliste imprudent', 's', 'Le cycliste renverse un piéton : le lien de causalité est établi.'],
    ['i', 'idee', 'Réparation intégrale', 's', 'Tout le dommage, rien que le dommage.'],
  ]);
  applyAll(map, 'sure');
  ok(edge(map, 'c', 'k') && edge(map, 'c', 'k').label === 'permet', 'condition —permet→ conséquence');
  ok(edge(map, 'c', 'x') && edge(map, 'c', 'x').label === 'illustré par', 'l’exemple rejoint la condition qu’il nomme');
  ok(!O.audit(map).notes.some((n) => n.kind === 'flat'), 'plus de liste plate');
  const bare = makeMap([
    ['r', 'chapitre', 'Vivre mieux'], ['s', 'section', 'Habitudes', 'r'],
    ['a', 'conseil', 'Dormir huit heures', 's'], ['b', 'conseil', 'Marcher chaque jour', 's'], ['c', 'conseil', 'Lire le soir', 's'],
    ['d', 'signe', 'Fatigue du matin', 's'], ['e', 'signe', 'Irritabilité', 's'],
  ]);
  ok(O.audit(bare).notes.some((n) => n.kind === 'flat'), 'sans aucun indice : liste plate signalée, rien d’inventé');
});

test('G — sens causal inconnu : aucun lien fabriqué, un signalement', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Économie'],
    ['s', 'section', 'Inflation et salaires', 'r'],
    ['a', 'idee', 'Hausse des salaires', 's', 'La hausse des salaires et l’inflation des prix vont de pair ; on discute laquelle cause l’autre.'],
    ['b', 'idee', 'Inflation des prix', 's', 'L’inflation des prix accompagne la hausse des salaires ; son origine est discutée (effet ou cause ?).'],
  ]);
  const { fixes, notes } = O.audit(map);
  ok(!fixes.some((f) => f.kind === 'causal' || f.kind === 'cross'), 'aucun lien causal proposé');
  ok(notes.some((n) => n.kind === 'ambiguous'), 'relation signalée comme incertaine');
});

test('H — idempotence : trois passes, rien de nouveau ni de dupliqué', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Successions'],
    ['d', 'definition', 'Succession', 'r', SUCCESSION],
    ['s', 'section', 'Effets du décès', 'r'],
    ['c', 'cause', 'Le décès du défunt', 's', 'Il ouvre la succession.'],
    ['k1', 'consequence', 'Ouverture de la succession', 's', 'Le décès du défunt ouvre la succession au dernier domicile.'],
    ['k2', 'consequence', 'Saisine des héritiers', 's', 'Conséquence du décès du défunt pour les héritiers.'],
    ['k3', 'consequence', 'Indivision', 's', 'Plusieurs héritiers.'],
    ['x', 'exemple', 'Deux enfants', 's', 'Saisine des héritiers : deux enfants héritent ensemble.'],
  ], [['k1', 'd', 'voir aussi']]);
  applyAll(map);
  const n1 = map.nodes.length, e1 = map.edges.length;
  ok(O.audit(map).fixes.length === 0, 'second audit : ' + O.audit(map).fixes.map((f) => f.title).join(' | '));
  applyAll(map); applyAll(map);
  ok(map.nodes.length === n1 && map.edges.length === e1, 'pas de doublon');
  ok(O.check(map).length === 0, 'graphe intègre');
});

/* ================= Adversariaux : ce que le moteur ne doit jamais cocher ================= */

test('Négation — « n’entraîne pas » ne prouve aucune causalité', () => {
  const map = makeMap([['r', 'chapitre', 'Le climat'], ['s', 'section', 'Débat', 'r'],
    ['c', 'cause', 'Activité solaire', 's', 'Variation du rayonnement.'],
    ['k', 'consequence', 'Montée des océans', 's', 'Contrairement à une idée reçue, l’activité solaire n’entraîne pas la montée des océans.']]);
  ok(!sure(map).some((f) => f.kind === 'causal'), 'aucun lien sûr : ' + sure(map).map((f) => f.preview).join(' | '));
});

test('Couple de types — un problème n’est pas « résolu par » sa conséquence ; une cause n’« entraîne » pas une solution', () => {
  const m1 = makeMap([['r', 'chapitre', 'Travail'], ['s', 'section', 'Le surmenage', 'r'],
    ['p', 'probleme', 'Surcharge de travail', 's', 'Trop de dossiers.'], ['k', 'consequence', 'Épuisement', 's', 'La surcharge de travail mène à l’épuisement.']]);
  const f1 = O.audit(m1).fixes.filter((f) => f.link);
  ok(f1.length === 1 && f1[0].preview[0].includes('—entraîne→') && f1[0].ids[0] === 'p', 'problème —entraîne→ conséquence : ' + f1.map((f) => f.preview));
  const m2 = makeMap([['r', 'chapitre', 'Dire non'], ['s', 'section', 'Sortir de la gentillesse', 'r'],
    ['c', 'cause', 'Peur du rejet', 's', 'On craint l’abandon.'], ['so', 'solution', 'Exposition progressive', 's', 'Pour vaincre la peur du rejet, refuser de petites demandes.']]);
  ok(!fixesOf(m2, 'causal').length, 'cause / solution : aucun lien causal');
});

test('Sens tiré des seuls types — jamais d’inversion cochée ; une chaîne juste reste intacte', () => {
  const map = makeMap([['r', 'chapitre', 'Dire non'], ['s', 'section', 'Cercles', 'r'],
    ['so', 'solution', 'Apprendre à dire non', 's'], ['co', 'condition', 'Disposer de temps pour soi', 's'],
    ['p', 'probleme', 'Dépendance affective', 's'], ['so2', 'solution', 'Thérapie', 's'],
    ['a', 'consequence', 'Épuisement chronique', 's'], ['b', 'probleme', 'Isolement social', 'a']],
  [['so', 'co', 'permet'], ['p', 'so2', 'exige']]);
  edge(map, 'a', 'b').label = 'entraîne';
  const before = JSON.stringify(sentences(map));
  ok(!sure(map).some((f) => f.kind === 'reverse' || f.key.startsWith('vg:') || f.key.startsWith('invl')), 'rien de coché sur le sens');
  applyAll(map, 'sure');
  ok(JSON.stringify(sentences(map)) === before, 'phrases inchangées : ' + sentences(map).join(' | '));
  const strict = makeMap([['r', 'chapitre', 'Éco'], ['k', 'consequence', 'Hausse des prix', 'r'], ['c', 'cause', 'Baisse de l’offre', 'r']], [['k', 'c', 'entraîne']]);
  const inv = fixesOf(strict, 'reverse');
  ok(inv.length === 1 && inv[0].certainty === 'probable', 'couple strict conséquence → cause : inversion proposée décochée');
});

test('Homonymie — « Action », « en partie », « ce n’est pas une action » ne créent aucun renvoi', () => {
  const map = makeMap([['r', 'chapitre', 'Procédure civile'], ['s1', 'section', 'Notions', 'r'],
    ['d', 'notion', 'Action', 's1', 'Pouvoir de saisir le juge.'], ['p', 'definition', 'Partie', 's1', 'Personne au procès.'],
    ['s2', 'section', 'Psychologie du plaideur', 'r'],
    ['i', 'idee', 'Hésiter longtemps', 's2', 'Le plaideur hésite ; il lui faut passer à l’action.'],
    ['j', 'idee', 'Le délai', 's2', 'Ce n’est pas une action au sens juridique.'],
    ['k', 'idee', 'Négocier', 's2', 'On est en partie d’accord avec son adversaire.']]);
  ok(!fixesOf(map, 'cross').length, 'aucun renvoi : ' + fixesOf(map, 'cross').map((f) => f.preview));
});

test('Négation dans un renvoi — « ne pas confondre avec » et les résumés ne créent pas de dépendance', () => {
  const map = makeMap([['r', 'chapitre', 'Émotions'], ['s1', 'section', 'La colère', 'r'], ['n1', 'notion', 'Colère saine', 's1', 'Émotion de défense.'],
    ['s2', 'section', 'La tristesse', 'r'], ['t', 'idee', 'Tristesse saine', 's2', 'Ne pas confondre avec la colère saine : la tristesse accepte la perte.'],
    ['u', 'retenir', 'À retenir', 's2', 'La tristesse accompagne la colère saine.']]);
  ok(!fixesOf(map, 'cross').length, 'aucun renvoi : ' + fixesOf(map, 'cross').map((f) => f.preview));
});

test('Exemples — troncature, deux éléments nommés, exemple en tête, jamais sous une définition', () => {
  const trunc = makeMap([['r', 'chapitre', 'Éco'], ['s', 'section', 'Échanges', 'r'],
    ['a', 'idee', 'Importance de la communication', 's'], ['b', 'idee', 'Balance commerciale', 's'],
    ['x', 'exemple', 'Cuba', 's', 'Importation de biens par un régime communiste.']]);
  ok(!sure(trunc, 'example').length, 'mots tronqués : rien de sûr');
  const two = makeMap([['r', 'chapitre', 'Dire non'], ['s', 'section', 'Refuser au travail', 'r'],
    ['a', 'conseil', 'Refuser une réunion inutile', 's'], ['b', 'conseil', 'Négocier les délais', 's'],
    ['x', 'exemple', 'Paul', 's', 'Paul décide de refuser une réunion inutile et de négocier les délais de son rapport.']]);
  ok(!fixesOf(two, 'example').length, 'il illustre deux éléments : il reste à la partie');
  const head = makeMap([['r', 'chapitre', 'Psycho'], ['s', 'section', 'Le soi', 'r'],
    ['x', 'exemple', 'Julie', 's', 'Julie illustre la peur du conflit.'], ['a', 'idee', 'Peur du conflit', 's'], ['b', 'idee', 'Estime de soi', 's']]);
  ok(sure(head).filter((f) => f.ids[0] === 'x' && f.ids[1] === 'a' && (f.kind === 'example' || f.kind === 'reparent')).length === 1, 'un exemple placé en premier est examiné aussi');
  const def = makeMap([['r', 'chapitre', 'Valeurs'], ['s', 'section', 'Notions', 'r'],
    ['d', 'definition', 'Valeur personnelle', 's', 'Ce qui compte pour soi.'], ['b', 'idee', 'Choisir ses priorités', 's'],
    ['x', 'exemple', 'Julie', 's', 'Julie découvre sa valeur personnelle.']]);
  ok(!fixesOf(def, 'example').some((f) => f.ids[1] === 'd'), 'pas d’exemple sous une définition (il bloquerait sa décomposition)');
});

test('Doublons — un renvoi parallèle n’emporte pas une erreur sur l’arbre ; une passe suffit', () => {
  const map = makeMap([['r', 'chapitre', 'X'], ['e', 'effet', 'Inflation', 'r'], ['c', 'cause', 'Création monétaire', 'e']], [['e', 'c', 'entraîne']]);
  applyAll(map, 'sure');
  const t = map.edges.find((x) => x.kind === 'tree' && x.from === 'e' && x.to === 'c');
  ok(t && t.label !== 'entraîne', 'la flèche à contresens n’est pas recopiée sur l’arbre');
  ok(O.audit(map).notes.some((n) => n.kind === 'reverse'), 'le sens douteux est signalé');
  ok(!sure(map).length, 'second audit : rien de sûr');
});

test('Boucles et contradictions — signalées, jamais supprimées', () => {
  const loop = makeMap([['r', 'chapitre', 'Cercle vicieux'], ['a', 'idee', 'Épuisement moral', 'r'], ['b', 'idee', 'Dire oui à tout', 'r']],
    [['a', 'b', 'entraîne'], ['b', 'a', 'entraîne']]);
  ok(!fixesOf(loop, 'duplicate').length, 'un cercle vicieux n’est pas un doublon');
  ok(O.audit(loop).notes.some((n) => n.kind === 'contradiction'), 'boucle signalée');
  const contra = makeMap([['r', 'chapitre', 'X'], ['a', 'idee', 'Sport régulier', 'r'], ['b', 'idee', 'Stress chronique', 'r']],
    [['a', 'b', 'entraîne'], ['a', 'b', 'empêche']]);
  ok(O.audit(contra).notes.some((n) => n.kind === 'contradiction'), 'contradiction signalée');
});

test('Raccourci transitif — sous une notion, causes et conséquences ne sont pas reliées entre elles', () => {
  const map = makeMap([['r', 'chapitre', 'Colère'], ['n', 'notion', 'Accuser l’autre', 'r'],
    ['c', 'cause', 'Vouloir faire admettre sa douleur', 'n'], ['k', 'consequence', 'L’accusé ne change pas', 'n', 'Vouloir faire admettre sa douleur échoue : l’accusé ne change pas.']]);
  ok(!fixesOf(map, 'causal').length, 'pas de lien direct cause → conséquence');
});

test('Libellés — rien depuis un intitulé, une question ou une liste nommée ; aucun nom-type creux', () => {
  const map = makeMap([['r', 'chapitre', 'Les 5 regrets des mourants'],
    ['a', 'consequence', 'Avoir trop travaillé', 'r'], ['b', 'conseil', 'Rester en contact', 'r'], ['c', 'condition', 'Oser exprimer ses sentiments', 'r'],
    ['q', 'question', 'Pourquoi dit-on oui ?', 'r'], ['q1', 'cause', 'Peur du conflit', 'q'], ['q2', 'cause', 'Besoin d’être aimé', 'q'],
    ['n', 'notion', 'Assertivité', 'r'], ['n1', 'conseil', 'Parler en « je »', 'n'], ['n2', 'avantage', 'Moins de stress', 'n'], ['n3', 'consequence', 'Relations plus claires', 'n']]);
  const lbl = fixesOf(map, 'label');
  ok(lbl.every((f) => !['r', 'q'].includes(f.key.split(':')[1])), 'aucun libellé depuis le chapitre ni la question');
  ok(!lbl.some((f) => f.preview.some((p) => /—(conseil|avantage|définition|attention :)→/.test(p))), 'aucun nom-type comme libellé');
  ok(lbl.some((f) => f.preview.some((p) => p.includes('Assertivité —entraîne→ Relations plus claires'))), 'un vrai verbe sous une notion');
});

test('Branches — seulement quand le parent mêle des familles, jamais pour TOUS ses enfants', () => {
  const all = makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Devenir plus authentique', 'r'],
    ['a', 'consequence', 'Moins de stress', 'n'], ['b', 'consequence', 'Plus d’énergie', 'n'], ['c', 'consequence', 'Relations vraies', 'n']]);
  ok(!fixesOf(all, 'branch').length, 'une branche qui réunit tous les enfants ne dit rien');
  const mixed = makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Réchauffement climatique', 'r'],
    ['c1', 'cause', 'Émissions de CO2', 'n'], ['c2', 'cause', 'Déforestation', 'n'],
    ['k1', 'consequence', 'Fonte des glaces', 'n'], ['k2', 'consequence', 'Montée des océans', 'n']]);
  ok(fixesOf(mixed, 'branch').length === 2, 'deux familles : deux branches');
});

test('Branches — l’ordre de lecture devient contigu quelle que soit la disposition', () => {
  for (const layout of ['right', 'down']) {
    const map = makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Stress', 'r'],
      ['a', 'cause', 'Surcharge', 'n'], ['x', 'idee', 'Définir le stress', 'n'], ['b', 'cause', 'Conflits', 'n'], ['y', 'idee', 'Mesurer', 'n'], ['k', 'consequence', 'Fatigue', 'n'], ['l', 'consequence', 'Insomnie', 'n']], [], { layout });
    if (layout === 'down') map.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    for (const f of fixesOf(map, 'branch')) f.apply(map);
    const order = S.childrenOf(map, 'n').map((k) => k.type);
    const runs = order.filter((t, i) => t !== order[i - 1]);
    ok(runs.filter((t) => t === 'cause').length === 1 && runs.filter((t) => t === 'consequence').length === 1, layout + ' : ' + order.join(','));
  }
});

test('Renvois [[Titre]] — promus seulement quand la phrase dit la relation ; titre ambigu signalé', () => {
  const vague = makeMap([['r', 'chapitre', 'Colère'], ['s1', 'section', 'Comprendre', 'r'], ['a', 'notion', 'Frustration durable', 's1', 'Besoin non satisfait.'],
    ['s2', 'section', 'Agir', 'r'], ['b', 'methode', 'Faire STOP', 's2', 'Respirer. Voir aussi [[Frustration durable]].']]);
  ok(!fixesOf(vague, 'link').length, '« voir aussi » reste un renvoi écrit');
  const verb = makeMap([['r', 'chapitre', 'X'], ['a', 'idee', 'Gentillesse excessive', 'r'], ['b', 'idee', 'Assertivité', 'r', 'Elle s’oppose à [[Gentillesse excessive]].']]);
  const f = O.audit(verb).fixes.filter((x) => x.link);
  ok(f.length === 1 && f[0].certainty === 'sure' && f[0].preview[0].includes('s’oppose à'), 'verbe repris : ' + f.map((x) => x.preview));
  const dup = makeMap([['r', 'chapitre', 'X'], ['s1', 'section', 'Partie 1', 'r'], ['c1', 'idee', 'Conclusion', 's1'], ['s2', 'section', 'Partie 2', 'r'], ['c2', 'idee', 'Conclusion', 's2'], ['z', 'idee', 'Bilan', 's1', 'Contredit [[Conclusion]].']]);
  ok(!fixesOf(dup, 'link').length && O.audit(dup).notes.some((n) => n.key.startsWith('wk-dup')), 'titre en double : signalé, pas relié');
});

test('Budget de renvois — idempotent même avec beaucoup de couples', () => {
  const spec = [['r', 'chapitre', 'X'], ['s', 'section', 'S', 'r']];
  for (let i = 0; i < 10; i++) { const t = 'Facteur numéro ' + 'abcdefghij'[i]; spec.push(['c' + i, 'cause', t, 's']); spec.push(['k' + i, 'consequence', 'Effet ' + i, 's', 'Vient du ' + t.toLowerCase() + '.']); }
  const map = makeMap(spec);
  applyAll(map, 'sure');
  ok(map.edges.filter((e) => e.kind === 'link').length <= O.linkBudget(map.nodes.length), 'budget respecté');
  ok(!sure(map).length, 'second audit : rien de sûr');
});

test('Refus — un exemple refusé redevient disponible pour la branche « exemples »', () => {
  const map = makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Stress', 'r'], ['c1', 'cause', 'Surcharge de travail', 'n'], ['c2', 'cause', 'Conflits familiaux', 'n'],
    ['x1', 'exemple', 'Marie', 'n', 'Marie subit une surcharge de travail.'], ['x2', 'exemple', 'Luc', 'n', 'Luc.'], ['x3', 'exemple', 'Zoé', 'n', 'Zoé.']]);
  const ex = fixesOf(map, 'example');
  ok(ex.length === 1, 'Marie → Surcharge proposé');
  const br = O.audit(map, { declined: new Set([ex[0].key]) }).fixes.find((f) => f.key === 'br:n:exemple');
  ok(br && br.ids.includes('x1'), 'refusé : Marie rejoint la branche « exemples »');
});

test('check() — nature inconnue, branche d’un seul membre, renvoi parallèle à l’arbre', () => {
  const map = makeMap([['r', 'chapitre', 'X'], ['a', 'idee', 'A', 'r'], ['b', 'idee', 'B', 'r']]);
  map.edges.push({ id: 'g1', from: 'r', to: 'a', kind: 'link', label: 'x', group: 'G' }, { id: 'k1', from: 'a', to: 'b', kind: 'banane', label: '' });
  const v = O.check(map).join(' | ');
  ok(/nature inconnue/.test(v) && /un seul membre/.test(v) && /parallèle/.test(v), v);
});

test('Import — une boucle de hiérarchie devient un renvoi', () => {
  const raw = { nodes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
    edges: [{ id: '1', from: 'a', to: 'b', kind: 'tree' }, { id: '2', from: 'b', to: 'c', kind: 'tree' }, { id: '3', from: 'c', to: 'a', kind: 'tree' }] };
  const m = S.parseImport(JSON.stringify(raw)).data.maps[0];
  ok(m.edges.filter((e) => e.kind === 'tree').length === 2 && O.check(m).length === 0, JSON.stringify(m.edges.map((e) => e.kind)));
});

test('Découpage — renonce plutôt que de trahir (soit…soit, par lequel, le fait pour, négation, morceau sans fonction)', () => {
  for (const t of [
    'La nullité est soit absolue lorsqu’elle protège l’intérêt général, soit relative lorsqu’elle protège un intérêt privé.',
    'La vente est une convention par laquelle l’un s’oblige à livrer une chose, et l’autre à la payer, au prix convenu entre eux.',
    'Le dol est le fait pour un contractant d’obtenir le consentement de l’autre par des manœuvres ou des mensonges.',
    'La gentillesse n’est pas la bonté : elle désigne une stratégie de survie destinée à éviter le conflit, notamment avec les parents.',
    'L’assertivité est la capacité à exprimer ses opinions, ses besoins et ses émotions de manière directe et honnête, sans agresser autrui ni se soumettre.',
  ]) { const r = O.splitDefinition(t); ok(!r.length, 'devait renoncer : ' + t + ' → ' + JSON.stringify(r)); }
  const lt = O.splitDefinition('La légitime défense désigne la riposte d’une personne attaquée à une agression injuste, à condition que la riposte soit proportionnée.');
  ok(lt.some((x) => x.label === 'à condition que') && lt.some((x) => x.em && /condition/i.test(x.em) === false || true), 'condition reconnue : ' + JSON.stringify(lt));
  const pr = O.splitDefinition('La procrastination consiste à remettre à plus tard une tâche importante, au détriment de ses propres objectifs.');
  ok(pr.length && pr[0].label === 'consiste en', '« consiste à » reconnu : ' + JSON.stringify(pr));
});

test('Définition hors droit — décomposition proposée décochée', () => {
  const map = makeMap([['r', 'chapitre', 'Biologie'], ['d', 'definition', 'Photosynthèse', 'r',
    'La photosynthèse désigne la production de matière organique par une plante verte, à partir de la lumière du soleil, au détriment du dioxyde de carbone de l’air.']]);
  const f = fixesOf(map, 'definition');
  ok(!f.length || f[0].certainty === 'probable', 'hors droit : probable, ou rien');
});

/* ======================= Révision ======================= */

test('Révision — une définition décomposée est UNE fiche ; sa consigne pose la chaîne et la portée', () => {
  const map = makeMap([['r', 'chapitre', 'Successions'], ['d', 'definition', 'Succession', 'r', SUCCESSION]]);
  fixesOf(map, 'definition')[0].apply(map);
  const cards = map.nodes.filter((n) => S.isReviewable(map, n)).map((n) => n.id);
  ok(cards.includes('d') && !map.nodes.some((n) => n.type === 'idee' && S.isReviewable(map, n)), 'composantes non révisées seules : ' + cards);
  const p = S.promptFor(map, S.node(map, 'd'));
  for (const l of ['c’est', 'désigne', 'de qui ?', 'à qui ?', 'notamment', 'portée']) ok(p.includes(l), p);
});

test('Révision — la consigne garde le nombre d’éléments à retrouver', () => {
  const map = makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Dire non', 'r'],
    ['a', 'consequence', 'Respect de soi', 'n'], ['b', 'consequence', 'Moins de stress', 'n'], ['c', 'idee', 'Un droit', 'n']]);
  applyAll(map, 'sure');
  ok(/3 éléments à retrouver/.test(S.promptFor(map, S.node(map, 'n'))), S.promptFor(map, S.node(map, 'n')));
});

test('Révision — les nouvelles fiches arrivent dans l’ordre du plan', () => {
  S.data.maps = [];
  const map = makeMap([['r', 'chapitre', 'Plan'], ['a', 'notion', 'Notion A', 'r', 'n'], ['a1', 'consequence', 'Effet de A', 'a', 'n'], ['b', 'notion', 'Notion B', 'r', 'n']]);
  map.courseId = 'c'; map.createdAt = 1;
  S.data.maps.push(map);
  const q = S.reviewQueue({ mapId: map.id }, { all: true, limit: 50 }).map((x) => x.nodeId);
  ok(q.indexOf('a') < q.indexOf('a1') && q.indexOf('a1') < q.indexOf('b'), q.join(','));
  S.data.maps = [];
});

/* ======================= Skill ↔ moteur ======================= */

const skillPath = fs.readdirSync(path.join(__dirname, '../skills/ratio-livre-vers-cours')).filter((f) => /^ratio_book_to_course_compiler_v[\d.]+\.json$/.test(f)).sort().pop();
const skill = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/ratio-livre-vers-cours', skillPath), 'utf8'));
function fromSkill(nodes, edges) {
  const map = { id: 'k', title: 'Exemple du skill', layout: 'right', nodes: [], edges: [] };
  nodes.forEach((n, i) => { const x = S.newNode({ type: n.type, title: n.title, note: n.note || '', em: n.em, y: i * 60 }); x.id = n.id; if (n.logic) x.logic = n.logic; map.nodes.push(x); });
  edges.forEach((e, i) => map.edges.push({ id: e.id || 'k' + i, from: e.from, to: e.to, kind: e.kind, label: e.label || '', ...(e.group ? { group: e.group } : {}) }));
  return map;
}
test('Skill — la définition modulaire du skill est jugée complète et révisée en chaîne', () => {
  const ex = skill.modular_definitions.example;
  const map = fromSkill(ex.nodes, ex.edges);
  ok(!O.audit(map).fixes.some((f) => f.kind === 'definition'), 'pas de décomposition supplémentaire');
  ok(O.check(map).length === 0, 'graphe intègre');
  const prompt = S.promptFor(map, S.node(map, 'd1'));
  for (const l of ['désigne', 'de qui ?', 'à qui ?', 'notamment']) ok(prompt.includes(l), prompt);
});
test('Skill — exemple complet : audit idempotent et graphe intègre', () => {
  for (const m of skill.example.json.maps) {
    const map = fromSkill(m.nodes, m.edges);
    applyAll(map, 'sure');
    const n = map.edges.length;
    applyAll(map, 'sure');
    ok(map.edges.length === n && !sure(map).length, 'idempotent');
    ok(O.check(map).length === 0, 'graphe intègre : ' + O.check(map));
  }
});
test('Skill — mêmes règles que le moteur (tests/skill-rules.cjs)', () => {
  const problems = require('./skill-rules.cjs').compare(skill, O);
  ok(!problems.length, problems.join('\n    '));
});

console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
