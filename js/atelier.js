/* Pioneer — « Atelier rangement » : cartes simples à ranger à la main.
 * L'auteur range chaque carte comme il l'aime, exporte le cours, et ses positions servent
 * d'exemples d'entraînement au réseau qui place les éventails (tests/learn/fan/from_maps.py).
 * Les formes vont de la plus simple (2 feuilles) à la plus touffue (≈ 30 nœuds), pour couvrir
 * les cas : nombre d'enfants, profondeur, déséquilibre, titres longs, libellés, ET/OU, renvoi. */
(function (R) {
  'use strict';
  const VERSION = 1;
  // n(titre, enfants, libellé du lien qui y mène, extra)
  const n = (t, children = [], label = '', x = {}) => ({ t, children, label, ...x });
  const leaves = (...ts) => ts.map((t) => n(t));

  const MAPS = [
    ['01 · Deux feuilles', n('Le feu', leaves('Prométhée le vole', 'Zeus le punit'))],
    ['02 · Trois feuilles', n('Les Moires', leaves('Clotho', 'Lachésis', 'Atropos'))],
    ['03 · Quatre feuilles', n('Les saisons', leaves('Printemps', 'Été', 'Automne', 'Hiver'))],
    ['04 · Cinq feuilles', n('Les fleuves des Enfers', leaves('Styx', 'Achéron', 'Léthé', 'Cocyte', 'Phlégéthon'))],
    ['05 · Six feuilles', n('Les Titans (1)', leaves('Océan', 'Céos', 'Crios', 'Hypérion', 'Japet', 'Cronos'))],
    ['06 · Huit feuilles', n('Les Muses (1)', leaves('Clio', 'Euterpe', 'Thalie', 'Melpomène', 'Terpsichore', 'Érato', 'Polymnie', 'Uranie'))],
    ['07 · Deux branches de deux', n('Les jumeaux', [n('Apollon', leaves('Soleil', 'Musique')), n('Artémis', leaves('Lune', 'Chasse'))])],
    ['08 · Trois branches de trois', n('Les trois frères', [
      n('Zeus', leaves('Le ciel', 'La foudre', 'L’aigle')),
      n('Poséidon', leaves('La mer', 'Le trident', 'Le cheval')),
      n('Hadès', leaves('Les Enfers', 'Le casque', 'Cerbère'))])],
    ['09 · Déséquilibrée', n('Héraclès', [
      n('Les travaux', leaves('Le lion de Némée', 'L’hydre de Lerne', 'La biche de Cérynie', 'Le sanglier d’Érymanthe', 'Les écuries d’Augias')),
      n('Sa naissance'), n('Sa mort')])],
    ['10 · Chaîne profonde', n('Chaos', [n('Gaïa', [n('Ouranos', [n('Cronos', [n('Zeus', leaves('Athéna'))])])])])],
    ['11 · Liens libellés', n('La boîte de Pandore', [
      n('La curiosité de Pandore', [], 'à cause de'),
      n('Les maux se répandent', [n('Maladie'), n('Vieillesse'), n('Guerre')], 'entraîne'),
      n('L’espérance reste au fond', [], 'sauf')])],
    ['12 · Titres longs', n('Le mythe d’Orphée et Eurydice', leaves(
      'Orphée charme les dieux des Enfers par sa musique',
      'Il ne doit pas se retourner avant la sortie',
      'Il se retourne et perd Eurydice pour toujours'))],
    ['13 · ET / OU', n('Devenir un héros', [
      n('Conditions', leaves('Une naissance divine', 'Une épreuve', 'Une victoire'), '', { logic: 'et' }),
      n('Récompenses', leaves('L’immortalité', 'Une constellation'), '', { logic: 'ou' })])],
    ['14 · Avec un renvoi', n('La guerre de Troie', [
      n('Les causes', [n('La pomme de discorde', [], '', { key: 'pomme' }), n('L’enlèvement d’Hélène', [], '', { key: 'helene' })]),
      n('Les héros', leaves('Achille', 'Hector', 'Ulysse')),
      n('La fin', [n('Le cheval de bois')])]), [['pomme', 'helene', 'mène à']]],
    ['15 · Moyenne (≈ 20)', n('Les Olympiens', [
      n('Les dieux', leaves('Zeus', 'Poséidon', 'Arès', 'Héphaïstos', 'Hermès', 'Apollon')),
      n('Les déesses', leaves('Héra', 'Athéna', 'Aphrodite', 'Artémis', 'Déméter')),
      n('Hors de l’Olympe', [n('Hadès', leaves('Perséphone')), n('Dionysos')]),
      n('Le lieu', leaves('Le mont Olympe'))])],
    ['16 · Grande (≈ 30)', n('Les Titans et les Olympiens', [
      n('Les Titans', [n('Les fils', leaves('Océan', 'Cronos', 'Japet')), n('Les filles', leaves('Rhéa', 'Thémis', 'Mnémosyne'))]),
      n('La guerre', [n('La Titanomachie', leaves('Dix ans de combats', 'Les Cyclopes forgent la foudre')), n('L’issue', leaves('Les Titans au Tartare'))], 'puis'),
      n('Les vainqueurs', [n('Le partage', leaves('Le ciel à Zeus', 'La mer à Poséidon', 'Les Enfers à Hadès')), n('Le règne', leaves('Zeus roi des dieux'))]),
      n('Les exceptions', leaves('Prométhée aide les hommes', 'Atlas porte le ciel'), 'sauf')])],
  ];

  R.seedAtelier = function () {
    const S = R.store, U = R.U;
    const course = { id: U.uid('c'), title: 'Atelier rangement', description: 'Range chaque carte à ta façon, puis exporte ce cours : tes positions entraînent le rangement automatique.', createdAt: Date.now(), updatedAt: Date.now() };
    S.data.courses.push(course);
    for (const [title, spec, links] of MAPS) {
      const m = R.seedBuild(course.id, title, spec, links || []);
      m.layout = 'tree';
      m.keepPos = true; // positions faites à la main : jamais rangées automatiquement
      S.data.maps.push(m);
    }
    S.data.settings.atelier = VERSION;
    S.changed();
    return course;
  };
  R.seedAtelier.VERSION = VERSION;
})(window.R);
