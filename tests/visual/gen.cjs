/* Génère les cartes du jeu visuel (routage des renvois, placement des libellés) : node gen.cjs
 * Chaque fichier est une carte au format JSON Ratio ({ title, layout, nodes, edges }) importable telle quelle,
 * avec un champ « _verifier » : ce qu'il faut regarder (et que checkvis.cjs mesure). */
'use strict';
const fs = require('fs'), path = require('path');
const out = (name, map) => fs.writeFileSync(path.join(__dirname, name + '.json'), JSON.stringify(map, null, 1));
let eid = 0;
const N = (id, title, x, y, type = 'idee', note = '') => ({ id, type, title, note, x, y });
const T = (from, to, label = '') => ({ id: 't' + (++eid), from, to, kind: 'tree', label });
const L = (from, to, label) => ({ id: 'l' + (++eid), from, to, kind: 'link', label });

/* V1 — peu de nœuds */
out('v1-peu-de-noeuds', {
  title: 'V1 peu de nœuds', layout: 'right',
  nodes: [N('r', 'Photosynthèse', 0, 0, 'notion'), N('a', 'Lumière', 260, -80, 'condition'), N('b', 'Glucose', 260, 80, 'consequence'), N('c', 'Respiration', 520, 0, 'notion')],
  edges: [T('r', 'a', 'suppose'), T('r', 'b', 'produit'), L('b', 'c', 'consommé par'), L('a', 'c', 's’oppose à')],
  _verifier: ['tracé le plus court sans traverser de nœud', 'libellés centrés sur leur trait (distance au trait < 12 px)', 'aucun libellé sur un nœud', 'aucune flèche sur le côté où arrive la hiérarchie'],
});

/* V2 — renvois proches et parallèles */
{
  const nodes = [], edges = [];
  for (let i = 0; i < 5; i++) { nodes.push(N('a' + i, 'Source ' + (i + 1), 0, i * 62)); nodes.push(N('b' + i, 'Cible ' + (i + 1), 420, i * 62 + 10)); }
  ['entraîne', 'se distingue de', '≠', 'résulte de la combinaison de', 'permet'].forEach((l, i) => edges.push(L('a' + i, 'b' + i, l)));
  edges.push(L('a0', 'b4', 'fait appel à'), L('a4', 'b0', 'illustre'));
  out('v2-renvois-proches', { title: 'V2 renvois proches', layout: 'right', nodes, edges,
    _verifier: ['5 traits parallèles à 62 px : libellés en escalier sans se chevaucher', 'les 2 diagonales se croisent au plus une fois', 'chaque libellé reste à < 40 px de SON trait (pas repoussé près du voisin)', 'ordre des libellés = ordre des traits (pas d’inversion visuelle)'] });
}

/* V3 — libellés de longueurs variées */
{
  const labels = ['≠', 'si', 'sauf', 'entraîne', 'a pour cause', 'se caractérise par', 'à condition que la riposte soit proportionnée', 'est sanctionné, sauf exception légale expresse, par la nullité relative du contrat'];
  const nodes = [N('h', 'Notion pivot', 300, 240, 'notion')], edges = [];
  labels.forEach((l, i) => { const ang = (i / labels.length) * 2 * Math.PI; nodes.push(N('n' + i, 'Élément ' + (i + 1), Math.round(300 + 330 * Math.cos(ang)), Math.round(240 + 220 * Math.sin(ang)))); edges.push(L('h', 'n' + i, l)); });
  out('v3-libelles-varies', { title: 'V3 libellés variés', layout: 'centre', nodes, edges,
    _verifier: ['libellés de 1 à 80 caractères : jamais tronqués sans infobulle', 'les longs libellés ne recouvrent ni nœud ni autre libellé', 'les très courts (≠, si) restent lisibles sur le trait', 'aucun libellé à plus de 40 px de son trait'] });
}

/* V4 — convergence vers un nœud */
{
  const nodes = [N('k', 'Excès de masse grasse', 400, 300, 'consequence')], edges = [];
  const src = [['Sédentarité', 0, 0], ['Alimentation', 0, 300], ['Génétique', 0, 600], ['Sommeil court', 800, 0], ['Stress', 800, 300], ['Médicaments', 800, 600], ['Pauvreté', 400, 0]];
  src.forEach(([t, x, y], i) => { nodes.push(N('c' + i, t, x, y, 'cause')); edges.push(L('c' + i, 'k', i % 2 ? 'favorise' : 'entraîne')); });
  out('v4-convergence', { title: 'V4 convergence', layout: 'right', nodes, edges,
    _verifier: ['7 flèches convergent : points d’arrivée répartis sur les 4 côtés, pas empilés au même pixel', 'libellés identiques (« entraîne ») non superposés près de la cible', 'option : faisceau (fourche) si même libellé — compté comme un renvoi', 'pointes de flèche visibles (non masquées par un libellé)'] });
}

/* V5 — contournement obligé */
{
  const nodes = [N('a', 'Départ', 0, 200), N('b', 'Arrivée', 700, 200)], edges = [L('a', 'b', 'mène à')];
  for (let i = 0; i < 7; i++) nodes.push(N('w' + i, 'Mur ' + (i + 1), 340, i * 64, 'idee'));
  nodes.push(N('z', 'Hors du mur', 340, 520));
  edges.push(L('z', 'b', 'contourne'));
  out('v5-contournement', { title: 'V5 contournement', layout: 'right', nodes, edges,
    _verifier: ['le renvoi Départ→Arrivée ne traverse AUCUN des 7 nœuds du mur (hits = 0)', 'détour raisonnable : longueur < 2,2 × distance à vol d’oiseau', 'libellé dans une zone libre, pas dans le mur', 'les points de passage (V4) restent hors des nœuds après un léger déplacement'] });
}

/* V6 — zone dense, et V7 — la même avec des nœuds déplacés */
function dense(shift) {
  const nodes = [], edges = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const id = 'g' + r + c;
    const moved = shift && (r + c) % 4 === 0;
    nodes.push(N(id, 'Idée ' + r + '.' + c, c * 190 + (moved ? 45 : 0), r * 78 + (moved ? 30 : 0)));
  }
  const pairs = [['g00', 'g44', 'entraîne'], ['g04', 'g40', 'empêche'], ['g02', 'g42', 'suppose'], ['g20', 'g24', 'se distingue de'], ['g11', 'g33', 'illustre'], ['g13', 'g31', 'résulte de'],
    ['g01', 'g21', 'précise'], ['g03', 'g23', 'sauf'], ['g10', 'g12', 'permet'], ['g32', 'g34', 'nuancé par'], ['g41', 'g43', 'fait appel à'], ['g14', 'g30', 'contredit']];
  for (const [a, b, l] of pairs) edges.push(L(a, b, l));
  for (let r = 0; r < 5; r++) for (let c = 1; c < 5; c++) edges.push(T('g' + r + '0', 'g' + r + c));
  return { nodes, edges };
}
out('v6-zone-dense', { title: 'V6 zone dense', layout: 'right', ...dense(false),
  _verifier: ['12 renvois dans une grille 5×5 serrée : nœuds traversés = 0 si un passage existe', 'croisements ≤ référence v3 (mesurés par checkvis)', 'chevauchements libellé/nœud et libellé/libellé = 0', 'temps de routage < 150 ms'] });
out('v7-zone-dense-deplacee', { title: 'V7 zone dense déplacée', layout: 'right', ...dense(true),
  _verifier: ['même carte que V6, 7 nœuds déplacés de (45, 30) px', 'les renvois dont aucune extrémité ni obstacle n’a bougé gardent EXACTEMENT leur tracé', 'les libellés suivent leur trait (distance au trait inchangée à ± 4 px)', 'deux rendus successifs identiques (déterminisme), y compris si l’ordre des arêtes est permuté'] });

/* V8 — grande carte (≈ 170 nœuds) */
{
  const nodes = [N('r', 'Cours complet', 0, 0, 'chapitre')], edges = [];
  let y = 0;
  for (let s = 0; s < 8; s++) {
    const sid = 's' + s; nodes.push(N(sid, 'Section ' + (s + 1), 300, y, 'section')); edges.push(T('r', sid));
    for (let n = 0; n < 4; n++) {
      const nid = sid + 'n' + n; nodes.push(N(nid, 'Notion ' + (s + 1) + '.' + (n + 1), 560, y, 'notion')); edges.push(T(sid, nid));
      for (let k = 0; k < 4; k++) { const kid = nid + 'k' + k; nodes.push(N(kid, ['Cause', 'Conséquence', 'Exemple', 'Condition'][k] + ' ' + (s + 1) + '.' + (n + 1), 820, y, ['cause', 'consequence', 'exemple', 'condition'][k])); edges.push(T(nid, kid, ['a pour cause', 'entraîne', 'illustré par', 'suppose'][k])); y += 70; }
      y += 20;
    }
    y += 60;
  }
  const lbl = ['fait appel à', 'entraîne', 's’oppose à', 'illustre', 'résulte de', 'sauf', 'suppose', 'se distingue de'];
  for (let i = 0; i < 20; i++) { const a = 's' + (i % 8) + 'n' + (i % 4) + 'k' + (i % 4), b = 's' + ((i * 3 + 5) % 8) + 'n' + ((i + 2) % 4); edges.push(L(a, b, lbl[i % 8])); }
  out('v8-grande-carte', { title: 'V8 grande carte', layout: 'right', nodes, edges,
    _verifier: [nodes.length + ' nœuds, 20 renvois longs (souvent entre sections éloignées)', 'nœuds traversés par les renvois : 0 ou proche de 0', 'temps total de routage + libellés < 1 s (rendu interactif < 50 ms par renvoi)', 'libellés à < 40 px de leur trait ; aucun libellé hors de la boîte englobante de la carte', 'déterminisme entre deux ouvertures'] });
}
console.log('cartes visuelles écrites dans', __dirname);
