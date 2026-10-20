/* Mesure de l'audit d'organisation, AVANT / APRÈS : indicateurs calculés ici, indépendamment du
 * moteur mesuré (on ne se note pas soi-même).
 *
 *   node tests/metrics.cjs [cours.json …]
 *   RATIO_ORGANIZE=ancien/organize.js RATIO_STORE=ancien/store.js node tests/metrics.cjs cours.json
 *
 * Sans fichier : seulement les pièges (cartes adversariales) et l'exemple du skill.
 * Indicateurs (cours entier, après application des corrections « sûres », celles qu'un clic
 * applique sans relecture) :
 *  - pièges tombés : corrections sûres qui produisent une phrase fausse connue (doit valoir 0) ;
 *  - verbes depuis un intitulé : libellés causaux posés depuis une section / un chapitre / une question ;
 *  - libellés-noms : libellés qui redisent le sur-titre (conseil, définition, avantage…) ;
 *  - sens contraires : flèches qui contredisent le couple cause ↔ conséquence ;
 *  - intégrité : violations NOUVELLES (cycle, deux parents, branche d'un membre…) ;
 *  - idempotence : corrections sûres encore proposées au second audit ;
 *  - texte conservé : titres et notes d'origine inchangés ;
 *  - relations nommées : part des arêtes de contenu portant un libellé (hors intitulés et listes) ;
 *  - fiches : nœuds révisables (une définition décomposée ne doit pas se multiplier).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { S, O, makeMap } = require('./harness.cjs');

const STRUCT = new Set(['chapitre', 'lecon', 'section']);
const heading = (n) => !n || STRUCT.has(n.type) || /\?\s*$/.test(n.title);
const n0 = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VERB = /^(entraine|provoque|produit|a pour cause|resulte de|suppose|exige|permet|resolu par|pose|vise|se reconnait a|se caracterise par|comprend|appliqu|fonde sur)/;
const NOUN = /^(conseil|definition|avantage|inconvenient|attention :?)$/;
const sentences = (m) => m.edges.map((e) => `${(S.node(m, e.from) || {}).title} —${e.label}→ ${(S.node(m, e.to) || {}).title}`);

function applySure(m) {
  const fixes = O.audit(m).fixes;
  for (const f of fixes) if (f.certainty === 'sure') { try { f.apply(m); } catch (e) { /* mesuré par l'intégrité */ } }
  S.normalizeGroups(m.edges);
  return fixes;
}
function indicators(m) {
  const by = new Map(m.nodes.map((n) => [n.id, n]));
  let fromHeading = 0, nouns = 0, against = 0, content = 0, named = 0;
  for (const e of m.edges) {
    const a = by.get(e.from), b = by.get(e.to);
    if (!a || !b) continue;
    const l = n0(e.label).trim();
    if (l && !e.group && heading(a) && VERB.test(l)) fromHeading++;
    if (l && !e.group && NOUN.test(l)) nouns++;
    if ((/^(entraine|provoque|produit|permet)/.test(l) && ['consequence', 'effet'].includes(a.type) && b.type === 'cause')
      || (/^(a pour cause|resulte de)/.test(l) && a.type === 'cause' && ['consequence', 'effet'].includes(b.type))) against++;
    if (e.kind === 'tree' && !heading(a) && !STRUCT.has(b.type) && !a.logic) { content++; if (l) named++; }
  }
  return { fromHeading, nouns, against, content, named, cards: m.nodes.filter((n) => S.isReviewable(m, n)).length };
}
function measure(maps) {
  const t = { maps: maps.length, sure: 0, probable: 0, notes: 0, fromHeading: 0, nouns: 0, against: 0, integrityNew: 0, idem: 0, textLost: 0, content: 0, named: 0, cardsBefore: 0, cardsAfter: 0, ms: 0 };
  for (const src of maps) {
    const m = JSON.parse(JSON.stringify(src));
    const text = new Map(m.nodes.map((n) => [n.id, n.title + '\u0000' + n.note]));
    const before = new Set(O.check(m));
    t.cardsBefore += indicators(m).cards;
    const t0 = process.hrtime.bigint();
    const a = O.audit(m);
    t.ms += Number(process.hrtime.bigint() - t0) / 1e6;
    t.sure += a.fixes.filter((f) => f.certainty === 'sure').length;
    t.probable += a.fixes.filter((f) => f.certainty !== 'sure').length;
    t.notes += a.notes.length;
    applySure(m);
    const ind = indicators(m);
    for (const k of ['fromHeading', 'nouns', 'against', 'content', 'named']) t[k] += ind[k];
    t.cardsAfter += ind.cards;
    t.integrityNew += O.check(m).filter((v) => !before.has(v)).length;
    t.idem += O.audit(m).fixes.filter((f) => f.certainty === 'sure').length;
    for (const n of m.nodes) if (text.has(n.id) && text.get(n.id) !== n.title + '\u0000' + n.note) t.textLost++;
  }
  t.namedRate = t.content ? Math.round(100 * t.named / t.content) + ' %' : '—';
  t.ms = Math.round(t.ms) + ' ms';
  delete t.content; delete t.named;
  return t;
}

/* ---- Pièges : cartes où une correction « sûre » fausse est facile ; chaque phrase listée est fausse ---- */
const TRAPS = [
  { name: 'négation', map: () => makeMap([['r', 'chapitre', 'Le climat'], ['s', 'section', 'Débat', 'r'], ['c', 'idee', 'Activité solaire', 's', 'Variation du rayonnement.'], ['k', 'idee', 'Montée des océans', 's', 'Contrairement à une idée reçue, l’activité solaire n’entraîne pas la montée des océans.']]), bad: [/Activité solaire —entraîne→ Montée des océans/] },
  { name: 'problème → conséquence', map: () => makeMap([['r', 'chapitre', 'Travail'], ['s', 'section', 'Le surmenage', 'r'], ['p', 'idee', 'Surcharge de travail', 's', 'Trop de dossiers.'], ['k', 'idee', 'Épuisement', 's', 'La surcharge de travail mène à l’épuisement.']]), bad: [/—résolu par→ Épuisement/] },
  { name: 'cause → solution', map: () => makeMap([['r', 'chapitre', 'Dire non'], ['s', 'section', 'Sortir', 'r'], ['c', 'idee', 'Peur du rejet', 's', 'On craint l’abandon.'], ['so', 'idee', 'Exposition progressive', 's', 'Pour vaincre la peur du rejet, refuser de petites demandes.']]), bad: [/Peur du rejet —entraîne→ Exposition/] },
  { name: 'chaînes justes inversées', map: () => { const m = makeMap([['r', 'chapitre', 'X'], ['s', 'section', 'S', 'r'], ['so', 'idee', 'Apprendre à dire non', 's'], ['co', 'idee', 'Disposer de temps', 's'], ['p', 'idee', 'Dépendance affective', 's'], ['t', 'idee', 'Thérapie', 's']], [['so', 'co', 'permet'], ['p', 't', 'exige']]); return m; }, bad: [/Disposer de temps —permet→ Apprendre/, /Thérapie —exige→ Dépendance/] },
  { name: 'homonymie', map: () => makeMap([['r', 'chapitre', 'Procédure'], ['s1', 'section', 'Notions', 'r'], ['d', 'notion', 'Action', 's1', 'Pouvoir de saisir le juge.'], ['p', 'definition', 'Partie', 's1', 'Personne au procès.'], ['s2', 'section', 'Pratique', 'r'], ['i', 'idee', 'Hésiter', 's2', 'Il faut passer à l’action.'], ['k', 'idee', 'Négocier', 's2', 'On est en partie d’accord.']]), bad: [/—fait appel à→ (Action|Partie)/] },
  { name: 'troncature', map: () => makeMap([['r', 'chapitre', 'Éco'], ['s', 'section', 'Échanges', 'r'], ['a', 'idee', 'Importance de la communication', 's'], ['b', 'idee', 'Balance commerciale', 's'], ['x', 'idee', 'Cuba', 's', 'Importation de biens par un régime communiste.']]), bad: [/Importance de la communication —illustré par→ Cuba/] },
  { name: 'verbe depuis une section', map: () => makeMap([['r', 'chapitre', 'Chapitre 3'], ['s', 'section', 'Débat', 'r'], ['c', 'idee', 'Activité solaire', 's'], ['k', 'idee', 'Inflation', 'r']]), bad: [/^(Chapitre 3|Débat) —(a pour cause|entraîne|produit)→/] },
  { name: 'libellés-noms', map: () => makeMap([['r', 'chapitre', 'X'], ['n', 'notion', 'Assertivité', 'r'], ['a', 'conseil', 'Parler en je', 'n'], ['b', 'idee', 'Moins de stress', 'n'], ['d', 'definition', 'Assertivité saine', 'n', 'x']]), bad: [/—(conseil|avantage|définition)→/] },
  { name: 'raccourci transitif', map: () => makeMap([['r', 'chapitre', 'Colère'], ['n', 'notion', 'Accuser l’autre', 'r'], ['c', 'idee', 'Vouloir faire admettre sa douleur', 'n'], ['k', 'idee', 'L’accusé ne change pas', 'n', 'Vouloir faire admettre sa douleur échoue : l’accusé ne change pas.']]), bad: [/Vouloir faire admettre sa douleur —entraîne→/] },
  { name: 'cercle vicieux supprimé', map: () => makeMap([['r', 'chapitre', 'X'], ['a', 'idee', 'Épuisement moral', 'r'], ['b', 'idee', 'Dire oui à tout', 'r']], [['a', 'b', 'entraîne'], ['b', 'a', 'entraîne']]), bad: [], check: (m) => m.edges.filter((e) => e.kind === 'link').length < 2 },
  { name: '[[ ]] vague promu', map: () => makeMap([['r', 'chapitre', 'Colère'], ['s1', 'section', 'Comprendre', 'r'], ['a', 'notion', 'Frustration', 's1', 'Besoin non satisfait.'], ['s2', 'section', 'Agir', 'r'], ['b', 'methode', 'Faire STOP', 's2', 'Voir aussi [[Frustration]].']]), bad: [/Faire STOP —.*→ Frustration/] },
  { name: '[[ ]] ambigu', map: () => makeMap([['r', 'chapitre', 'X'], ['s1', 'section', 'P1', 'r'], ['c1', 'idee', 'Conclusion', 's1'], ['s2', 'section', 'P2', 'r'], ['c2', 'idee', 'Conclusion', 's2'], ['z', 'idee', 'Bilan', 's1', 'Contredit [[Conclusion]].']]), bad: [/Bilan —.*→ Conclusion/] },
  { name: 'mention négative', map: () => makeMap([['r', 'chapitre', 'Émotions'], ['s1', 'section', 'La colère', 'r'], ['n1', 'notion', 'Colère saine', 's1', 'x'], ['s2', 'section', 'La tristesse', 'r'], ['t', 'idee', 'Tristesse saine', 's2', 'Ne pas confondre avec la colère saine.']]), bad: [/Tristesse saine —.*→ Colère saine/] },
  { name: 'exemple de deux éléments', map: () => makeMap([['r', 'chapitre', 'Dire non'], ['s', 'section', 'Au travail', 'r'], ['a', 'conseil', 'Refuser une réunion inutile', 's'], ['b', 'conseil', 'Négocier les délais', 's'], ['x', 'idee', 'Paul', 's', 'Paul décide de refuser une réunion inutile et de négocier les délais.']]), bad: [/—illustré par→ Paul/] },
  { name: 'définition mal découpée', map: () => makeMap([['r', 'chapitre', 'Bio'], ['d', 'definition', 'Assertivité', 'r', 'L’assertivité est la capacité à exprimer ses opinions, ses besoins et ses émotions de manière directe et honnête, sans agresser autrui ni se soumettre.']]), bad: [/—et→/] },
];
function traps() {
  const fallen = [];
  for (const t of TRAPS) {
    const m = t.map();
    const orig = new Set(sentences(m));
    applySure(m);
    const s = sentences(m).filter((x) => !orig.has(x));
    if (t.bad.some((re) => s.some((x) => re.test(x))) || (t.check && t.check(m))) fallen.push(t.name);
  }
  return fallen;
}

const files = process.argv.slice(2);
const report = {};
const fall = traps();
report['pièges tombés'] = `${fall.length}/${TRAPS.length}${fall.length ? ' : ' + fall.join(', ') : ''}`;
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const maps = (d.maps || []).map((m) => {
    const mm = { ...m, layout: m.layout || 'right', nodes: m.nodes.map((n, i) => ({ x: 0, y: i * 50, collapsed: false, logic: null, ...n, note: n.note || '', review: n.review || { box: 0, due: 0, last: 0, rating: null } })), edges: m.edges.map((e) => ({ ...e, label: e.label || '' })) };
    return mm;
  });
  report[path.basename(f)] = measure(maps);
}
console.log(JSON.stringify(report, null, 2));
