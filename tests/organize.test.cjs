/* Tests de l'audit d'organisation (js/organize.js) — cas A à H.
 * Lancement : node tests/organize.test.cjs   (aucune dépendance : le vrai code de l'app est
 * chargé dans un contexte isolé, avec le vrai store pour childrenOf / parentEdge / newNode).
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
for (const f of ['js/util.js', 'js/store.js', 'js/organize.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const { store: S, organize: O } = win.R;

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

/** Carte de test : spec = [[id, type, title, parentId, note?]] — l'ordre donne l'ordre de lecture */
function makeMap(spec, links = []) {
  const map = { id: 'm', title: 'Carte de test', layout: 'right', nodes: [], edges: [] };
  spec.forEach(([id, type, title, parent, note], i) => {
    const n = S.newNode({ type, title, note: note || '', x: parent ? 300 : 0, y: i * 60 });
    n.id = id;
    map.nodes.push(n);
    if (parent) map.edges.push({ id: 'e' + id, from: parent, to: id, kind: 'tree', label: '' });
  });
  for (const [from, to, label] of links) map.edges.push({ id: 'l' + from + to, from, to, kind: 'link', label });
  return map;
}
const fixesOf = (map, kind) => O.audit(map).fixes.filter((f) => !kind || f.kind === kind);
const applyAll = (map, certainty) => { for (const f of O.audit(map).fixes) if (!certainty || f.certainty === certainty) f.apply(map); };
const edge = (map, from, to) => map.edges.find((e) => e.from === from && e.to === to);
const sentence = (map, e) => `${S.node(map, e.from).title} —${e.label}→ ${S.node(map, e.to).title}`;

/* A — Une cause et deux conséquences : les rapports causaux sont dits, pas trois nœuds sous la section */
test('A — cause et conséquences : liens causaux libellés dans le bon sens', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Le climat'],
    ['s', 'section', 'Le réchauffement climatique', 'r'],
    ['c', 'cause', 'Émissions de gaz à effet de serre', 's', 'Les émissions de gaz à effet de serre retiennent la chaleur.'],
    ['k1', 'consequence', 'Fonte de la banquise', 's', 'Les émissions de gaz à effet de serre réchauffent l’Arctique : la banquise fond.'],
    ['k2', 'consequence', 'Montée des océans', 's', 'Conséquence des émissions de gaz à effet de serre : les océans montent.'],
  ]);
  applyAll(map);
  for (const k of ['k1', 'k2']) {
    const e = edge(map, 'c', k);
    ok(e && e.kind === 'link' && e.label === 'entraîne', 'lien cause → ' + k + ' attendu, trouvé ' + JSON.stringify(e));
  }
  ok(!edge(map, 'k1', 'c') && !edge(map, 'k2', 'c'), 'aucun lien dans le sens effet → cause');
  ok(edge(map, 's', 'c').label === 'a pour cause', 'section —a pour cause→ cause');
  ok(O.check(map).length === 0, 'graphe intègre : ' + O.check(map));
});

/* B — Une condition rend possible un effet : « permet », sans confondre effet et condition */
test('B — condition → effet : « permet », condition à la source', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Le mariage'],
    ['s', 'section', 'Effets du mariage', 'r'],
    ['c', 'condition', 'Consentement des époux', 's', 'Sans consentement des époux, pas de mariage valable.'],
    ['f', 'effet', 'Devoir de fidélité', 's', 'Le consentement des époux fait naître le devoir de fidélité.'],
  ]);
  const f = fixesOf(map, 'causal');
  ok(f.length === 1 && f[0].certainty === 'sure', 'une proposition sûre (l’effet nomme la condition) : ' + JSON.stringify(f.map((x) => x.certainty)));
  f[0].apply(map);
  const e = edge(map, 'c', 'f');
  ok(e && e.label === 'permet', 'condition —permet→ effet, trouvé ' + JSON.stringify(e));
  ok(!edge(map, 'f', 'c'), 'pas d’effet → condition');
});

/* C — Définition modulaire de la succession */
test('C — définition de la succession : composantes reliées, mots exacts, relief, original récupérable', () => {
  const def = 'La succession est une notion juridique qui désigne la transmission du patrimoine d’une personne décédée à une ou plusieurs personnes appelées à lui succéder, notamment ses héritiers.';
  const map = makeMap([
    ['r', 'chapitre', 'Les successions'],
    ['d', 'definition', 'Succession', 'r', def],
  ]);
  const f = fixesOf(map, 'definition');
  ok(f.length === 1, 'une décomposition proposée');
  f[0].apply(map);
  const kids = map.nodes.filter((n) => n.type === 'idee');
  const by = (t) => kids.find((n) => n.title.toLowerCase() === t.toLowerCase());
  const qual = by('une notion juridique'), tr = by('la transmission du patrimoine'), who = by('une personne décédée');
  const to = by('une ou plusieurs personnes appelées à lui succéder'), heirs = by('ses héritiers');
  ok(qual && tr && who && to && heirs, 'composantes : ' + kids.map((k) => k.title).join(' | '));
  ok(edge(map, 'd', qual.id).label === 'c’est', 'Succession —c’est→ une notion juridique');
  ok(edge(map, 'd', tr.id).label === 'désigne', 'Succession —désigne→ la transmission');
  ok(edge(map, tr.id, who.id).label === 'de qui ?', 'transmission —de qui ?→ personne décédée');
  ok(edge(map, tr.id, to.id).label === 'à qui ?', 'transmission —à qui ?→ une ou plusieurs personnes');
  ok(edge(map, to.id, heirs.id).label === 'notamment', '« notamment ses héritiers » précise les destinataires sans les épuiser');
  ok(to.em && to.em.toLowerCase() === 'une ou plusieurs', '« une ou plusieurs » mis en relief');
  ok(!kids.some((k) => /^des héritiers$/i.test(k.title)), '« une ou plusieurs personnes » n’est pas réduit à « des héritiers »');
  const src = def.toLowerCase().replace(/’/g, "'");
  for (const k of kids) ok(src.includes(k.title.toLowerCase().replace(/’/g, "'")), 'mots exacts de la source : « ' + k.title + ' »');
  ok(S.node(map, 'd').note === def, 'la définition intégrale reste dans la note');
  ok(O.check(map).length === 0, 'graphe intègre');
});

/* D — Un exemple illustre une conséquence particulière ET une notion plus générale */
test('D — exemple : rattaché à la conséquence qu’il nomme, relié à la notion générale', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Dévolution'],
    ['n', 'notion', 'Indivision successorale', 'r', 'Situation de plusieurs héritiers propriétaires ensemble.'],
    ['s', 'section', 'Effets du décès', 'r'],
    ['k1', 'consequence', 'Ouverture de la succession', 's', 'Au jour du décès.'],
    ['k2', 'consequence', 'Saisine des héritiers', 's', 'Les héritiers reçoivent les biens de plein droit.'],
    ['x', 'exemple', 'Deux enfants héritent de leur père', 's', 'Par la saisine des héritiers, ils reçoivent la maison et se trouvent en indivision successorale.'],
  ]);
  applyAll(map, 'sure');
  const e = edge(map, 'k2', 'x');
  ok(e && e.kind === 'tree' && e.label === 'illustré par', 'Saisine —illustré par→ exemple, trouvé ' + JSON.stringify(map.edges.find((y) => y.to === 'x')));
  const l = edge(map, 'x', 'n');
  ok(l && l.kind === 'link' && l.label === 'illustre', 'exemple —illustre→ notion générale (renvoi), trouvé ' + JSON.stringify(l));
  ok(S.ancestors(map, 'x').some((a) => a.id === 's'), 'l’exemple reste dans sa section');
});

/* E — Relation transversale : un élément d'une section dépend d'une notion définie dans une autre */
test('E — renvoi entre sections sans toucher la hiérarchie', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Droit des contrats'],
    ['s1', 'section', 'Formation', 'r'],
    ['d', 'definition', 'Vice du consentement', 's1', 'Erreur, dol ou violence qui altère la volonté.'],
    ['s2', 'section', 'Sanctions', 'r'],
    ['a', 'idee', 'Nullité relative', 's2', 'Elle sanctionne un vice du consentement ; seule la partie protégée peut l’invoquer.'],
  ]);
  const parents = JSON.stringify(map.edges.filter((e) => e.kind === 'tree').map((e) => [e.from, e.to]));
  const f = fixesOf(map, 'cross');
  ok(f.length === 1 && f[0].certainty === 'sure', 'un renvoi transversal proposé');
  f[0].apply(map);
  const l = edge(map, 'a', 'd');
  ok(l && l.kind === 'link' && l.label === 'fait appel à', 'Nullité relative —fait appel à→ Vice du consentement');
  ok(JSON.stringify(map.edges.filter((e) => e.kind === 'tree').map((e) => [e.from, e.to])) === parents, 'hiérarchie inchangée');
});

/* F — Graphe insuffisamment organisé : tout est pendu à la section */
test('F — liste plate : défauts détectés, omissions établies corrigées, le reste signalé', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Responsabilité civile'],
    ['s', 'section', 'Responsabilité du fait personnel', 'r'],
    ['d', 'definition', 'Faute', 's', 'Manquement à une obligation préexistante.'],
    ['c', 'condition', 'Lien de causalité', 's', 'Le dommage doit résulter de la faute.'],
    ['k', 'consequence', 'Obligation de réparer', 's', 'Le lien de causalité établi, l’auteur doit réparer le dommage.'],
    ['x', 'exemple', 'Le cycliste imprudent', 's', 'Le cycliste renverse un piéton : le lien de causalité est établi.'],
    ['i', 'idee', 'Réparation intégrale', 's', 'Tout le dommage, rien que le dommage.'],
  ]);
  const before = O.audit(map);
  ok(before.notes.some((n) => n.kind === 'flat'), 'la liste plate est signalée');
  applyAll(map, 'sure');
  ok(edge(map, 'c', 'k') && edge(map, 'c', 'k').label === 'permet', 'condition —permet→ conséquence (la conséquence la nomme)');
  ok(edge(map, 'c', 'x') && edge(map, 'c', 'x').label === 'illustré par', 'l’exemple rejoint la condition qu’il nomme');
  ok(map.edges.filter((e) => e.from === 's' && e.kind === 'tree').every((e) => e.label || S.TYPES[S.node(map, e.to).type].label === 'Idée'), 'les relations typées sont libellées');
  ok(!O.audit(map).notes.some((n) => n.kind === 'flat'), 'plus de liste plate après correction');
  ok(O.check(map).length === 0, 'graphe intègre');
});

/* G — Relation ambiguë : le sens d'une causalité n'est pas établi → signalé, jamais inventé */
test('G — sens causal inconnu : aucun lien fabriqué, un signalement', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Économie'],
    ['s', 'section', 'Inflation et salaires', 'r'],
    ['a', 'idee', 'Hausse des salaires', 's', 'La hausse des salaires et l’inflation des prix vont de pair ; on discute laquelle cause l’autre.'],
    ['b', 'idee', 'Inflation des prix', 's', 'L’inflation des prix accompagne la hausse des salaires ; son origine est discutée (effet ou cause ?).'],
  ]);
  const { fixes, notes } = O.audit(map);
  ok(!fixes.some((f) => f.kind === 'causal' || f.kind === 'cross'), 'aucun lien causal proposé : ' + fixes.map((f) => f.title).join(' | '));
  ok(notes.some((n) => n.kind === 'ambiguous'), 'relation signalée comme incertaine');
  applyAll(map);
  ok(!map.edges.some((e) => e.kind === 'link'), 'aucun renvoi créé');
});

/* Sens inversé et doublon : corrigés quand les types l'établissent */
test('Sens inversé et renvoi doublon corrigés', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Climat'],
    ['c', 'cause', 'Déforestation', 'r', 'x'],
    ['k', 'consequence', 'Érosion des sols', 'r', 'y'],
    ['i', 'idee', 'Arbres', 'c', 'z'],
  ], [['k', 'c', 'entraîne'], ['c', 'i', 'voir']]);
  applyAll(map, 'sure');
  ok(edge(map, 'c', 'k') && edge(map, 'c', 'k').label === 'entraîne' && !edge(map, 'k', 'c'), 'cause —entraîne→ conséquence après inversion');
  ok(map.edges.filter((e) => (e.from === 'c' && e.to === 'i')).length === 1, 'le renvoi parallèle à l’arbre est fondu');
  ok(edge(map, 'c', 'i').label === 'voir', 'son libellé passe sur l’arête d’arbre');
});

/* H — Second rangement : rien de nouveau, rien de dupliqué */
test('H — idempotence : un second audit ne propose plus de correction sûre et ne duplique rien', () => {
  const def = 'La succession est une notion juridique qui désigne la transmission du patrimoine d’une personne décédée à une ou plusieurs personnes appelées à lui succéder, notamment ses héritiers.';
  const map = makeMap([
    ['r', 'chapitre', 'Successions'],
    ['d', 'definition', 'Succession', 'r', def],
    ['s', 'section', 'Effets du décès', 'r'],
    ['c', 'cause', 'Le décès', 's', 'Le décès ouvre la succession.'],
    ['k1', 'consequence', 'Ouverture de la succession', 's', 'Le décès ouvre la succession au dernier domicile.'],
    ['k2', 'consequence', 'Saisine des héritiers', 's', 'Conséquence du décès pour les héritiers.'],
    ['k3', 'consequence', 'Indivision', 's', 'Plusieurs héritiers.'],
    ['x', 'exemple', 'Deux enfants', 's', 'Saisine des héritiers : deux enfants héritent ensemble.'],
  ], [['k1', 'd', 'voir aussi']]);
  applyAll(map);
  const n1 = map.nodes.length, e1 = map.edges.length;
  const second = O.audit(map).fixes;
  ok(second.length === 0, 'second audit : ' + second.map((f) => f.title).join(' | '));
  applyAll(map); applyAll(map);
  ok(map.nodes.length === n1 && map.edges.length === e1, `pas de doublon (${n1}/${e1} → ${map.nodes.length}/${map.edges.length})`);
  const sig = map.edges.map((e) => [e.from, e.to, e.kind].join('|'));
  ok(new Set(sig).size === sig.length, 'aucune arête répétée');
  ok(O.check(map).length === 0, 'graphe intègre');
});

/* Garde-fous : rien n'est inventé sur une définition courte ou une liste nommée */
test('Garde-fous : définition courte intacte, liste nommée par son titre sans libellés répétés', () => {
  const map = makeMap([
    ['r', 'chapitre', 'Gentillesse'],
    ['d', 'definition', 'Assertivité', 'r', 'Dire ce que l’on pense, poliment.'],
    ['l', 'idee', 'Les 4 signes du trop gentil', 'r'],
    ['a', 'signe', 'Dire oui à tout', 'l', 'a'], ['b', 'signe', 'S’excuser sans cesse', 'l', 'b'],
    ['c', 'signe', 'Éviter le conflit', 'l', 'c'], ['e', 'signe', 'Taire ses besoins', 'l', 'e'],
  ]);
  const f = O.audit(map).fixes;
  ok(!f.some((x) => x.kind === 'definition'), 'définition courte non découpée');
  ok(!f.some((x) => x.kind === 'branch' || (x.kind === 'label' && x.preview.some((p) => p.includes('se reconnaît à')))), 'pas de branche ni de libellé redondant sous « Les 4 signes »');
});


/* Skill ↔ moteur : ce que le skill produit est jugé correct par l'audit */
const skill = JSON.parse(fs.readFileSync(path.join(root, 'skills/ratio-livre-vers-cours/ratio_book_to_course_compiler_v2.1.json'), 'utf8'));
function fromSkill(nodes, edges) {
  const map = { id: 'k', title: 'Exemple du skill', layout: 'right', nodes: [], edges: [] };
  nodes.forEach((n, i) => { const x = S.newNode({ type: n.type, title: n.title, note: n.note || '', em: n.em, y: i * 60 }); x.id = n.id; if (n.logic) x.logic = n.logic; map.nodes.push(x); });
  edges.forEach((e, i) => map.edges.push({ id: e.id || 'k' + i, from: e.from, to: e.to, kind: e.kind, label: e.label || '', ...(e.group ? { group: e.group } : {}) }));
  return map;
}
test('Skill — la définition modulaire du skill est jugée complète et révisée en chaîne', () => {
  const ex = skill.modular_definitions.example;
  const map = fromSkill(ex.nodes, ex.edges);
  const a = O.audit(map);
  ok(!a.fixes.some((f) => f.kind === 'definition'), 'pas de décomposition supplémentaire');
  ok(O.check(map).length === 0, 'graphe intègre');
  const prompt = S.promptFor(map, S.node(map, 'd1'));
  for (const l of ['c\'est', 'désigne', 'de qui ?', 'à qui ?', 'notamment']) ok(prompt.includes(l), 'consigne « ' + prompt + ' » contient ' + l);
});
test('Skill — exemple complet : audit idempotent et graphe intègre', () => {
  for (const m of skill.example.json.maps) {
    const map = fromSkill(m.nodes, m.edges);
    applyAll(map, 'sure');
    const n = map.edges.length;
    applyAll(map, 'sure');
    ok(map.edges.length === n && O.audit(map).fixes.filter((f) => f.certainty === 'sure').length === 0, 'idempotent');
    ok(O.check(map).length === 0, 'graphe intègre : ' + O.check(map));
  }
});

console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
