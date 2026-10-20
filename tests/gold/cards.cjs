/* Jeu sémantique « gold » V4 — écrit AVANT l'implémentation, indépendant des exemples des tests v3.
 *
 * Format d'une carte :
 *   spec  : [[id, type, title, parentId?, note?]]  (format makeMap du harnais)
 *   links : [[from, to, label]]                     (renvois existants)
 *   treeLabels : { childId: label }                 (libellé déjà posé sur l'arête d'arbre parent→enfant)
 *   expect :
 *     mustHave    : [{ from, to, fam, kind?, tier? }]  relation qui doit exister après rangement.
 *                   fam = famille de libellés (voir FAM dans evalgold.cjs) ou tableau de familles ;
 *                   la relation inverse équivalente est acceptée (A —entraîne→ B ≡ B —résulte de→ A).
 *                   kind = 'tree' | 'link' (absent : l'un ou l'autre).
 *                   tier = 'sure' (défaut : doit être appliquée sans relecture) | 'probable' (proposée suffit).
 *     mustNot     : [{ from, to, fam, soft? }]  relation qui ne doit PAS exister (fam 'any' = aucune arête
 *                   entre les deux, dans un sens comme dans l'autre, hors arête d'arbre déjà présente).
 *                   soft = ne compte qu'en mode « sûres » (une proposition à relire est tolérée).
 *     mustParent / mustNotParent : [[parent, child, tier?]]  arête d'arbre attendue / interdite.
 *     mustMerge / mustNotMerge   : [[a, b, tier?]]  doublon vrai (un seul nœud doit rester, notes conservées) / faux doublon.
 *     mustType    : [[id, type, tier?]]  type attendu (retypage).
 *     frozen      : 'all' (carte déjà juste : rien ne doit bouger) | [ids] (ni parent, ni type, ni texte ne changent).
 *     abstain     : true → en mode « sûres », aucune modification de la carte (la bonne réponse est de s'abstenir,
 *                   éventuellement avec un signalement). abstainIds : restreint ce contrôle à ces nœuds et aux arêtes entre eux.
 *   why : ce que la carte teste.
 */
'use strict';

module.exports = [
  /* ───────────── 1. Nœud à la fois effet et cause ───────────── */
  {
    name: 'G01 effet-et-cause (médecine)',
    why: 'Hyperglycémie est conséquence de la résistance ET cause des lésions ; pas de raccourci transitif.',
    spec: [
      ['r', 'chapitre', 'Endocrinologie'],
      ['s', 'section', 'Diabète de type 2', 'r'],
      ['a', 'idee', 'Résistance à l’insuline', 's', 'Les cellules répondent mal à l’hormone.'],
      ['b', 'idee', 'Hyperglycémie chronique', 's', 'La résistance à l’insuline provoque une hyperglycémie chronique.'],
      ['c', 'idee', 'Lésions des petits vaisseaux', 's', 'L’hyperglycémie chronique abîme la paroi des capillaires.'],
    ],
    expect: {
      mustHave: [{ from: 'a', to: 'b', fam: 'cause' }, { from: 'b', to: 'c', fam: 'cause' }],
      mustNot: [{ from: 'c', to: 'b', fam: 'cause' }, { from: 'a', to: 'c', fam: 'cause', soft: true }, { from: 'b', to: 'a', fam: 'cause' }],
      frozen: ['a', 'b', 'c'],
    },
  },
  {
    name: 'G02 effet-et-cause déjà tracé (énergie)',
    why: 'Conséquence → conséquence déjà libellée « entraîne » : juste, ne doit pas être inversée ni signalée comme contresens.',
    spec: [
      ['r', 'chapitre', 'Crises énergétiques'],
      ['s', 'section', 'Choc pétrolier de 1973', 's0'],
      ['s0', 'lecon', 'Économie mondiale', 'r'],
      ['g', 'idee', 'Embargo de l’OPEP', 's', 'Arrêt des livraisons aux pays alliés d’Israël.'],
      ['p', 'idee', 'Quadruplement du prix du baril', 's', 'L’embargo de l’OPEP provoque le quadruplement du prix du baril.'],
      ['i', 'idee', 'Inflation à deux chiffres', 's', 'Le quadruplement du prix du baril entraîne une inflation à deux chiffres.'],
    ],
    links: [['g', 'p', 'entraîne'], ['p', 'i', 'entraîne']],
    expect: { mustHave: [{ from: 'g', to: 'p', fam: 'cause' }, { from: 'p', to: 'i', fam: 'cause' }], frozen: 'all' },
  },

  /* ───────────── 2. Éléments d'une même section reliés entre eux ───────────── */
  {
    name: 'G03 séquence dans une section (cycle de l’eau)',
    why: 'Étapes successives nommées l’une par l’autre : chaîne, pas d’étoile ni de raccourci.',
    spec: [
      ['r', 'chapitre', 'Géosciences'],
      ['s', 'section', 'Le cycle de l’eau', 'r'],
      ['e', 'etape', 'Évaporation', 's', 'La chaleur du soleil transforme l’eau des océans en vapeur.'],
      ['c', 'etape', 'Condensation', 's', 'La vapeur issue de l’évaporation se refroidit en altitude et forme des nuages.'],
      ['p', 'etape', 'Précipitations', 's', 'Quand les gouttelettes de la condensation grossissent, elles tombent en pluie.'],
    ],
    expect: {
      mustHave: [{ from: 'e', to: 'c', fam: 'seq' }, { from: 'c', to: 'p', fam: 'seq' }],
      mustNot: [{ from: 'e', to: 'p', fam: 'any', soft: true }, { from: 'p', to: 'e', fam: 'seq' }],
    },
  },
  {
    name: 'G04 convergence de causes (santé publique)',
    why: 'Trois causes nommées dans la note de l’effet : trois liens, aucun entre causes. Contrôle positif.',
    spec: [
      ['r', 'chapitre', 'Santé publique'],
      ['s', 'section', 'Obésité', 'r'],
      ['a', 'idee', 'Sédentarité', 's', 'Moins de deux heures d’activité par semaine.'],
      ['b', 'idee', 'Alimentation ultra-transformée', 's', 'Produits riches en sucres ajoutés.'],
      ['g', 'idee', 'Prédisposition génétique', 's', 'Variants hérités.'],
      ['k', 'idee', 'Excès de masse grasse', 's', 'La sédentarité, l’alimentation ultra-transformée et une prédisposition génétique favorisent l’excès de masse grasse.'],
    ],
    expect: {
      mustHave: [{ from: 'a', to: 'k', fam: 'cause' }, { from: 'b', to: 'k', fam: 'cause' }, { from: 'g', to: 'k', fam: 'cause' }],
      mustNot: [{ from: 'a', to: 'b', fam: 'any' }, { from: 'a', to: 'g', fam: 'any' }, { from: 'b', to: 'g', fam: 'any' }],
    },
  },
  {
    name: 'G05 chaîne « ce qui » (politique monétaire)',
    why: 'Connecteur « ce qui » + verbe : taux → crédit → investissement ; pas de raccourci taux → investissement.',
    spec: [
      ['r', 'chapitre', 'Macroéconomie'],
      ['s', 'section', 'Transmission monétaire', 'r'],
      ['t', 'idee', 'Hausse des taux directeurs', 's', 'La banque centrale relève ses taux, ce qui provoque le renchérissement du crédit.'],
      ['c', 'idee', 'Renchérissement du crédit', 's', 'Les banques prêtent plus cher.'],
      ['i', 'idee', 'Recul de l’investissement', 's', 'Le renchérissement du crédit freine les projets : recul de l’investissement.'],
    ],
    expect: {
      mustHave: [{ from: 't', to: 'c', fam: 'cause' }, { from: 'c', to: 'i', fam: ['cause'] }],
      mustNot: [{ from: 't', to: 'i', fam: 'cause', soft: true }, { from: 'i', to: 'c', fam: 'cause' }],
    },
  },
  {
    name: 'G06 « parce que » inverse le sens de lecture (astronomie)',
    why: 'Le connecteur place la cause APRÈS : Inclinaison → Été. Le type idée ne donne aucun sens.',
    spec: [
      ['r', 'chapitre', 'La Terre dans le système solaire'],
      ['s', 'section', 'Les saisons', 'r'],
      ['e', 'idee', 'Été dans l’hémisphère nord', 's', 'Il fait chaud parce que l’inclinaison de l’axe terrestre expose davantage cet hémisphère au soleil.'],
      ['i', 'idee', 'Inclinaison de l’axe terrestre', 's', 'Environ 23 degrés.'],
    ],
    expect: { mustHave: [{ from: 'i', to: 'e', fam: 'cause' }], mustNot: [{ from: 'e', to: 'i', fam: 'cause' }] },
  },
  {
    name: 'G07 « car » contre des types mal posés (marées)',
    why: 'Types inversés par l’auteur : le texte (car) prime ; jamais de lien dans le sens des types.',
    spec: [
      ['r', 'chapitre', 'Océanographie'],
      ['s', 'section', 'Les marées', 'r'],
      ['a', 'idee', 'Attraction lunaire', 's', 'Force de gravité exercée par la Lune.'],
      ['m', 'idee', 'Marées hautes', 's', 'Les marées hautes se produisent car l’attraction lunaire soulève les océans.'],
    ],
    expect: {
      mustHave: [{ from: 'a', to: 'm', fam: 'cause', tier: 'probable' }],
      mustNot: [{ from: 'm', to: 'a', fam: 'cause' }],
      mustType: [['a', 'idee', 'probable'], ['m', 'idee', 'probable']],
    },
  },
  {
    name: 'G08 « donc » affirmatif (optique)',
    why: '« donc » entre deux nœuds nommés : relation causale (ou illustration) attendue.',
    spec: [
      ['r', 'chapitre', 'Optique'],
      ['s', 'section', 'Réfraction', 'r'],
      ['n', 'idee', 'Ralentissement de la lumière dans l’eau', 's', 'La lumière ralentit dans l’eau, donc le bâton brisé s’observe à la surface.'],
      ['b', 'idee', 'Bâton brisé', 's', 'Un bâton plongé semble cassé.'],
    ],
    expect: { mustHave: [{ from: 'n', to: 'b', fam: ['cause', 'example'] }], mustNot: [{ from: 'b', to: 'n', fam: 'cause' }] },
  },

  /* ───────────── 3. Exemple d'une conséquence particulière ───────────── */
  {
    name: 'G09 exemple → la conséquence qu’il nomme (hyperinflation)',
    why: 'L’exemple nomme « perte de pouvoir d’achat » : il illustre cette conséquence, pas l’autre.',
    spec: [
      ['r', 'chapitre', 'Monnaie'],
      ['s', 'section', 'Inflation', 'r'],
      ['c', 'idee', 'Création monétaire excessive', 's', 'La banque centrale imprime sans contrepartie.'],
      ['k1', 'idee', 'Perte de pouvoir d’achat', 's', 'Les salaires suivent mal les prix.'],
      ['k2', 'idee', 'Fuite vers les actifs réels', 's', 'On achète de l’or et de la terre.'],
      ['x', 'idee', 'Allemagne 1923', 's', 'Le salaire versé le matin n’achète plus de pain le soir : la perte de pouvoir d’achat est totale.'],
    ],
    expect: {
      mustHave: [{ from: 'k1', to: 'x', fam: 'example' }],
      mustNot: [{ from: 'k2', to: 'x', fam: 'example' }, { from: 'c', to: 'x', fam: 'example' }],
      frozen: ['c', 'k1', 'k2'],
    },
  },
  {
    name: 'G10 exemple ambigu par paraphrase (logement)',
    why: 'Aucun titre nommé, deux conséquences plausibles : s’abstenir.',
    spec: [
      ['r', 'chapitre', 'Ville'],
      ['s', 'section', 'Tension immobilière', 'r'],
      ['a', 'idee', 'Hausse des loyers', 's', 'Plus 40 % en dix ans.'],
      ['b', 'idee', 'Éviction des classes moyennes', 's', 'Elles partent en périphérie.'],
      ['x', 'idee', 'Une infirmière lyonnaise', 's', 'Son loyer a doublé, elle s’installe à 40 km de l’hôpital.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'a', to: 'x', fam: 'example', soft: true }, { from: 'b', to: 'x', fam: 'example', soft: true }] },
  },
  {
    name: 'G11 exemple d’une autre section (sécheresse)',
    why: 'L’exemple est rangé exprès dans « Études de cas » : un renvoi, pas un déménagement (la correction locale casserait la section).',
    spec: [
      ['r', 'chapitre', 'Climat et sociétés'],
      ['s1', 'section', 'Effets de la sécheresse', 'r'],
      ['k', 'idee', 'Pertes de récoltes', 's1', 'Rendements divisés par deux.'],
      ['k2', 'idee', 'Exode rural', 's1', 'Départ vers les villes.'],
      ['s2', 'section', 'Études de cas', 'r'],
      ['x', 'idee', 'Sahel 1984', 's2', 'Les pertes de récoltes provoquent une famine massive.'],
      ['y', 'idee', 'Dust Bowl', 's2', 'Tempêtes de poussière dans les Grandes Plaines.'],
    ],
    expect: {
      mustHave: [{ from: 'k', to: 'x', fam: 'example', kind: 'link', tier: 'probable' }],
      mustNotParent: [['k', 'x']],
      frozen: ['x', 'y', 'k', 'k2'],
    },
  },

  /* ───────────── 4. Condition reliée à la règle ───────────── */
  {
    name: 'G12 condition nécessaire vs condition d’un délai réduit (prescription)',
    why: 'La possession conditionne la règle ; la bonne foi ne conditionne qu’un délai abrégé : ne pas en faire une condition de la règle.',
    spec: [
      ['r', 'chapitre', 'Droit des biens'],
      ['s', 'section', 'Prescription acquisitive', 'r'],
      ['g', 'idee', 'Acquisition de la propriété', 's', 'Celui qui possède un bien pendant trente ans en devient propriétaire (art. 2272 du Code civil).'],
      ['p', 'idee', 'Possession continue et paisible', 's', 'La possession doit être continue, paisible, publique et non équivoque pour mener à l’acquisition de la propriété.'],
      ['f', 'idee', 'Bonne foi et juste titre', 's', 'Avec bonne foi et juste titre, le délai tombe à dix ans.'],
    ],
    expect: {
      mustHave: [{ from: 'p', to: 'g', fam: 'enable' }],
      mustNot: [{ from: 'f', to: 'g', fam: 'enable', soft: true }],
    },
  },
  {
    name: 'G13 condition déjà sous sa règle (vote)',
    why: 'Conditions déjà rattachées et libellées : rien à faire.',
    spec: [
      ['r', 'chapitre', 'Institutions'],
      ['n', 'notion', 'Droit de vote', 'r', 'Participer aux élections.'],
      ['c1', 'idee', 'Majorité civile', 'n', 'Avoir dix-huit ans.'],
      ['c2', 'idee', 'Nationalité française', 'n', 'Pour les scrutins nationaux.'],
      ['c3', 'idee', 'Inscription sur les listes', 'n', 'Démarche en mairie.'],
    ],
    treeLabels: { c1: 'suppose', c2: 'suppose', c3: 'suppose' },
    expect: { frozen: 'all' },
  },

  /* ───────────── 5. Exception qui limite un élément ───────────── */
  {
    name: 'G14 exceptions sœurs de la liberté qu’elles limitent',
    why: 'Exception posée à côté de la notion : doit la limiter (sauf / limité par), pas l’inverse.',
    spec: [
      ['r', 'chapitre', 'Libertés publiques'],
      ['s', 'section', 'Expression', 'r'],
      ['l', 'notion', 'Liberté d’expression', 's', 'Chacun peut dire et publier ses opinions.'],
      ['d', 'idee', 'Diffamation', 's', 'La diffamation limite la liberté d’expression : imputer un fait qui porte atteinte à l’honneur est puni.'],
      ['h', 'idee', 'Provocation à la haine', 's', 'Exception à la liberté d’expression prévue par la loi de 1881.'],
    ],
    expect: {
      mustHave: [{ from: 'l', to: 'd', fam: 'exception' }, { from: 'l', to: 'h', fam: 'exception' }],
      mustNot: [{ from: 'd', to: 'l', fam: ['cause', 'enable'] }, { from: 'd', to: 'h', fam: 'any' }],
    },
  },
  {
    name: 'G15 « sauf si » dans une note (période d’essai)',
    why: 'Connecteur « sauf si » + nœud nommé : relation d’exception, jamais une cause ni une condition.',
    spec: [
      ['r', 'chapitre', 'Droit du travail'],
      ['s', 'section', 'Contrat de travail', 'r'],
      ['p', 'idee', 'Renouvellement de la période d’essai', 's', 'La période d’essai peut être renouvelée une fois, sauf si la convention collective l’interdit.'],
      ['c', 'idee', 'Convention collective', 's', 'Accord de branche qui peut écarter la règle.'],
    ],
    expect: {
      mustHave: [{ from: 'p', to: 'c', fam: 'exception' }],
      mustNot: [{ from: 'c', to: 'p', fam: ['cause', 'enable'] }, { from: 'p', to: 'c', fam: ['cause', 'enable'] }],
    },
  },

  /* ───────────── 6. Relation transversale non évidente lexicalement ───────────── */
  {
    name: 'G16 transversale sans mot commun (entropie)',
    why: 'Relation réelle mais purement sémantique : au mieux proposée, jamais appliquée seule.',
    spec: [
      ['r', 'chapitre', 'Sciences du vivant'],
      ['s1', 'section', 'Thermodynamique', 'r'],
      ['e', 'notion', 'Entropie', 's1', 'Mesure du désordre d’un système isolé.'],
      ['s2', 'section', 'Biologie cellulaire', 'r'],
      ['c', 'idee', 'Maintien de l’ordre cellulaire', 's2', 'La cellule consomme de l’énergie pour lutter contre la tendance naturelle au désordre.'],
    ],
    expect: { abstain: true, mustHave: [{ from: 'c', to: 'e', fam: 'refer', kind: 'link', tier: 'probable' }] },
  },
  {
    name: 'G17 transversale par synonyme (Révolution)',
    why: '« prise de la Bastille » nommée sous une autre forme : la cible a un titre différent ; proposition au mieux.',
    spec: [
      ['r', 'chapitre', 'Révolution française'],
      ['s1', 'section', 'Été 1789', 'r'],
      ['b', 'date', '14 juillet 1789', 's1', 'Les Parisiens s’emparent de la forteresse royale.'],
      ['s2', 'section', 'Mémoire nationale', 'r'],
      ['f', 'idee', 'Fête nationale', 's2', 'Choisie en 1880 pour commémorer la prise de la Bastille.'],
    ],
    expect: { abstain: true, mustHave: [{ from: 'f', to: 'b', fam: 'refer', kind: 'link', tier: 'probable' }] },
  },

  /* ───────────── 7. Interprétations multiples plausibles ───────────── */
  {
    name: 'G18 note à deux relations (café)',
    why: '« compense » (inhibe) et « aggrave » (cause) dans une même phrase ; aucune relation entre les deux autres nœuds.',
    spec: [
      ['r', 'chapitre', 'Sommeil'],
      ['s', 'section', 'Sommeil et performance', 'r'],
      ['m', 'idee', 'Manque de sommeil', 's', 'Moins de six heures par nuit.'],
      ['b', 'idee', 'Baisse de concentration', 's', 'Erreurs d’attention.'],
      ['c', 'idee', 'Consommation de café', 's', 'Le café compense la baisse de concentration mais aggrave le manque de sommeil.'],
    ],
    expect: {
      mustHave: [{ from: 'c', to: 'm', fam: 'cause' }, { from: 'c', to: 'b', fam: 'inhibit', tier: 'probable' }],
      mustNot: [{ from: 'm', to: 'b', fam: 'cause', soft: true }, { from: 'c', to: 'b', fam: 'cause' }],
    },
  },
  {
    name: 'G19 deux lectures causales opposées (salaires-prix)',
    why: 'La carte dit qu’on ne sait pas qui cause qui : abstention, signalement.',
    spec: [
      ['r', 'chapitre', 'Inflation'],
      ['s', 'section', 'Boucle prix-salaires', 'r'],
      ['p', 'idee', 'Hausse des prix', 's', 'Selon les uns, la hausse des salaires précède la hausse des prix ; selon les autres, c’est l’inverse.'],
      ['w', 'idee', 'Hausse des salaires', 's', 'Négociée chaque année.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'w', to: 'p', fam: 'cause', soft: true }, { from: 'p', to: 'w', fam: 'cause' }] },
  },

  /* ───────────── 8. Graphes déjà corrects ───────────── */
  {
    name: 'G20 carte juste et complète (volcans)',
    why: 'Deux notions décomposées, libellées, opposées : aucune correction ne doit passer.',
    spec: [
      ['r', 'chapitre', 'Volcanisme'],
      ['a', 'notion', 'Éruption effusive', 'r', 'Lave qui s’écoule sans explosion.'],
      ['a1', 'idee', 'Magma fluide pauvre en silice', 'a', 'Les gaz s’échappent facilement.'],
      ['a2', 'idee', 'Coulées de lave', 'a', 'Elles parcourent des kilomètres.'],
      ['a3', 'idee', 'Kilauea', 'a', 'Hawaï, éruptions continues.'],
      ['b', 'notion', 'Éruption explosive', 'r', 'Projection violente de cendres.'],
      ['b1', 'idee', 'Magma visqueux riche en gaz', 'b', 'La pression monte jusqu’à la rupture.'],
      ['b2', 'idee', 'Nuées ardentes', 'b', 'Avalanches de gaz brûlants.'],
      ['b3', 'idee', 'Pinatubo 1991', 'b', 'Cendres jusqu’à 35 km d’altitude.'],
    ],
    treeLabels: { a1: 'a pour cause', a2: 'entraîne', a3: 'illustré par', b1: 'a pour cause', b2: 'entraîne', b3: 'illustré par' },
    links: [['a', 'b', 's’oppose à']],
    expect: { frozen: 'all' },
  },
  {
    name: 'G21 carte juste avec connecteurs vers l’extérieur (chômage)',
    why: '« parce que », « car » renvoient à des choses absentes de la carte : rien à relier.',
    spec: [
      ['r', 'chapitre', 'Marché du travail'],
      ['s', 'section', 'Formes de chômage', 'r'],
      ['f', 'notion', 'Chômage frictionnel', 's', 'Il existe parce que trouver un emploi prend du temps.'],
      ['t', 'notion', 'Chômage structurel', 's', 'Il apparaît car les compétences ne correspondent pas aux postes.'],
      ['c', 'notion', 'Chômage conjoncturel', 's', 'Il suit le ralentissement de l’activité.'],
    ],
    expect: { frozen: 'all' },
  },
  {
    name: 'G22 définition déjà décomposée correctement (usufruit)',
    why: 'Décomposition juste : ni redécoupage ni recâblage.',
    spec: [
      ['r', 'chapitre', 'Droit des biens'],
      ['d', 'definition', 'Usufruit', 'r', 'L’usufruit est le droit de jouir des choses dont un autre a la propriété, comme le propriétaire lui-même, à charge d’en conserver la substance.'],
      ['d1', 'idee', 'Le droit de jouir des choses', 'd'],
      ['d2', 'idee', 'Dont un autre a la propriété', 'd1'],
      ['d3', 'idee', 'À charge d’en conserver la substance', 'd1'],
    ],
    treeLabels: { d1: 'c’est', d2: 'à qui ?', d3: 'à condition que' },
    expect: { frozen: 'all' },
  },

  /* ───────────── 9. Boucles signifiantes ───────────── */
  {
    name: 'G23 boucle à créer (pauvreté)',
    why: 'Cercle vicieux dit par les notes : les trois arcs, aucun inversé ni supprimé pour « casser » le cycle.',
    spec: [
      ['r', 'chapitre', 'Inégalités'],
      ['s', 'section', 'Reproduction sociale', 'r'],
      ['p', 'idee', 'Pauvreté des familles', 's', 'Revenus sous le seuil.'],
      ['e', 'idee', 'Faible scolarisation', 's', 'La pauvreté des familles entraîne une faible scolarisation.'],
      ['w', 'idee', 'Revenus faibles à l’âge adulte', 's', 'Une faible scolarisation mène à des revenus faibles à l’âge adulte, ce qui entretient la pauvreté des familles.'],
    ],
    expect: { mustHave: [{ from: 'p', to: 'e', fam: 'cause' }, { from: 'e', to: 'w', fam: 'cause' }, { from: 'w', to: 'p', fam: 'cause' }], mustNot: [{ from: 'e', to: 'p', fam: 'cause' }, { from: 'w', to: 'e', fam: 'cause' }] },
  },
  {
    name: 'G24 boucle déjà tracée (anxiété)',
    why: 'Un cercle vicieux tracé est juste : signalement tolérable, aucune modification.',
    spec: [
      ['r', 'chapitre', 'Troubles anxieux'],
      ['s', 'section', 'Mécanisme d’entretien', 'r'],
      ['a', 'idee', 'Anxiété', 's', 'Peur anticipée.'],
      ['v', 'idee', 'Évitement', 's', 'On fuit la situation.'],
      ['f', 'idee', 'Renforcement de la peur', 's', 'Faute d’exposition, la peur ne s’éteint pas.'],
    ],
    links: [['a', 'v', 'entraîne'], ['v', 'f', 'entraîne'], ['f', 'a', 'entretient']],
    expect: { frozen: 'all' },
  },

  /* ───────────── 10. Correction locale qui casserait une autre branche ───────────── */
  {
    name: 'G25 rattacher un exemple qui a des enfants et un renvoi entrant (Milgram)',
    why: 'Le rattachement doit emporter le sous-arbre et garder le renvoi d’une autre section.',
    spec: [
      ['r', 'chapitre', 'Psychologie sociale'],
      ['s', 'section', 'Obéissance', 'r'],
      ['n', 'idee', 'Soumission à l’autorité', 's', 'On obéit à un ordre contraire à sa conscience.'],
      ['k', 'idee', 'Conformisme', 's', 'On s’aligne sur le groupe.'],
      ['x', 'idee', 'Expérience de Milgram', 's', 'Deux tiers des sujets vont jusqu’au choc maximal : la soumission à l’autorité l’emporte.'],
      ['x1', 'etape', 'Protocole', 'x', 'Un « élève » complice, des chocs fictifs.'],
      ['x2', 'chiffre', '65 % d’obéissance totale', 'x', 'Variante de base.'],
      ['s2', 'section', 'Biais cognitifs', 'r'],
      ['b', 'idee', 'Effet d’autorité', 's2', 'On surestime la parole d’un expert.'],
    ],
    links: [['b', 'x', 'illustré par']],
    expect: {
      mustHave: [{ from: 'n', to: 'x', fam: 'example' }, { from: 'b', to: 'x', fam: 'any', kind: 'link' }],
      mustParent: [['x', 'x1'], ['x', 'x2']],
      mustNot: [{ from: 'k', to: 'x', fam: 'any' }],
      frozen: ['x1', 'x2', 'b', 'k'],
    },
  },
  {
    name: 'G26 rattachement qui créerait un cycle (mondialisation)',
    why: 'Le parent nomme l’enfant ET l’enfant nomme le parent : ne jamais placer le parent sous son enfant.',
    spec: [
      ['r', 'chapitre', 'Économie internationale'],
      ['m', 'notion', 'Mondialisation', 'r', 'Elle s’accompagne de délocalisations industrielles.'],
      ['d', 'idee', 'Délocalisations industrielles', 'm', 'La mondialisation favorise les délocalisations industrielles.'],
      ['o', 'idee', 'Ouverture des marchés', 'm', 'Baisse des droits de douane.'],
    ],
    expect: {
      mustParent: [['m', 'd'], ['m', 'o']],
      mustNotParent: [['d', 'm']],
      mustHave: [{ from: 'm', to: 'd', fam: 'cause', kind: 'tree', tier: 'probable' }],
      frozen: ['m', 'd', 'o'],
    },
  },
  {
    name: 'G27 nœud partagé par deux règles (vices du consentement)',
    why: 'L’erreur est citée par deux sections ; la rattacher sous l’une retirerait l’autre : renvoi au plus.',
    spec: [
      ['r', 'chapitre', 'Contrats'],
      ['s1', 'section', 'Formation du contrat', 'r'],
      ['e', 'notion', 'Erreur sur les qualités essentielles', 's1', 'Fausse représentation de la réalité (art. 1132 du Code civil).'],
      ['s2', 'section', 'Nullité', 'r'],
      ['n', 'idee', 'Nullité relative', 's2', 'Sanctionne l’erreur sur les qualités essentielles.'],
      ['s3', 'section', 'Responsabilité précontractuelle', 'r'],
      ['q', 'idee', 'Obligation d’information', 's3', 'Son manquement provoque souvent une erreur sur les qualités essentielles.'],
    ],
    expect: {
      mustHave: [{ from: 'n', to: 'e', fam: 'refer', kind: 'link', tier: 'probable' }, { from: 'q', to: 'e', fam: ['cause', 'refer'], kind: 'link', tier: 'probable' }],
      mustNotParent: [['n', 'e'], ['q', 'e'], ['e', 'n'], ['e', 'q']],
      frozen: ['e', 'n', 'q'],
    },
  },

  /* ───────────── 11. Doublons vrais / faux doublons ───────────── */
  {
    name: 'G28 doublon vrai entre frères (photosynthèse)',
    why: 'Même titre, même type, même parent, notes complémentaires : fusion en gardant les deux notes.',
    spec: [
      ['r', 'chapitre', 'Botanique'],
      ['s', 'section', 'Nutrition des plantes', 'r'],
      ['a', 'notion', 'Photosynthèse', 's', 'Production de glucose à partir de CO2 et d’eau.'],
      ['b', 'notion', 'Photosynthèse', 's', 'Elle a lieu dans les chloroplastes, à la lumière.'],
      ['c', 'idee', 'Respiration végétale', 's', 'Consomme du glucose, jour et nuit.'],
    ],
    expect: { mustMerge: [['a', 'b']], mustNotMerge: [['a', 'c']], frozen: ['c'] },
  },
  {
    name: 'G29 doublon vrai dans deux sections (effet de serre)',
    why: 'Doublon réel mais rangé dans deux parties : fusion à proposer, pas à appliquer seule.',
    spec: [
      ['r', 'chapitre', 'Climat'],
      ['s1', 'section', 'Atmosphère', 'r'],
      ['a', 'notion', 'Effet de serre', 's1', 'Les gaz piègent le rayonnement infrarouge.'],
      ['s2', 'section', 'Réchauffement', 'r'],
      ['b', 'notion', 'Effet de serre', 's2', 'Renforcé par les émissions humaines.'],
      ['b1', 'idee', 'Émissions de méthane', 'b', 'Élevage et rizières.'],
    ],
    expect: { abstain: true, abstainIds: ['a', 'b', 's1', 's2'], mustMerge: [['a', 'b', 'probable']], mustParent: [['b', 'b1']] },
  },
  {
    name: 'G30 homonymes (Mercure)',
    why: 'Même titre, sens différents (planète / métal) : jamais fusionner, jamais relier.',
    spec: [
      ['r', 'chapitre', 'Sciences physiques'],
      ['s1', 'section', 'Astronomie', 'r'],
      ['a', 'notion', 'Mercure', 's1', 'Planète la plus proche du Soleil.'],
      ['s2', 'section', 'Chimie', 'r'],
      ['b', 'notion', 'Mercure', 's2', 'Métal liquide à température ambiante, toxique.'],
    ],
    expect: { mustNotMerge: [['a', 'b']], mustNot: [{ from: 'a', to: 'b', fam: 'any' }], frozen: 'all' },
  },
  {
    name: 'G31 quasi-homonymes (mitose / méiose)',
    why: 'Titres proches, notions distinctes : pas de fusion ; « se distingue de » toléré.',
    spec: [
      ['r', 'chapitre', 'Génétique'],
      ['s', 'section', 'Division cellulaire', 'r'],
      ['a', 'notion', 'Mitose', 's', 'Une cellule donne deux cellules identiques.'],
      ['b', 'notion', 'Méiose', 's', 'Une cellule donne quatre gamètes différents.'],
    ],
    expect: { mustNotMerge: [['a', 'b']], mustNot: [{ from: 'a', to: 'b', fam: ['cause', 'enable', 'example', 'precise'] }], frozen: ['a', 'b'] },
  },
  {
    name: 'G32 homonyme adjectival (capital)',
    why: '« un choix capital » ne renvoie pas à la notion de Capital.',
    spec: [
      ['r', 'chapitre', 'Orientation et économie'],
      ['s1', 'section', 'Facteurs de production', 'r'],
      ['k', 'notion', 'Capital', 's1', 'Ensemble des moyens de production durables.'],
      ['s2', 'section', 'Projet personnel', 'r'],
      ['o', 'idee', 'Choisir son orientation', 's2', 'C’est un choix capital pour l’avenir.'],
    ],
    expect: { mustNot: [{ from: 'o', to: 'k', fam: 'any' }], frozen: 'all' },
  },

  /* ───────────── 12. Connecteurs trompeurs ───────────── */
  {
    name: 'G33 « donc » dans une citation d’adversaire',
    why: 'Discours rapporté entre guillemets : la carte ne l’affirme pas.',
    spec: [
      ['r', 'chapitre', 'Commerce international'],
      ['s', 'section', 'Débat protectionniste', 'r'],
      ['l', 'idee', 'Libre-échange', 's', 'Suppression des barrières douanières.'],
      ['d', 'idee', 'Désindustrialisation', 's', 'Recul de la part de l’industrie.'],
      ['q', 'citation', 'Argument protectionniste', 's', 'Pour ses adversaires, « le libre-échange provoque la désindustrialisation, donc il faut des droits de douane ».'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'l', to: 'd', fam: 'cause', soft: true }] },
  },
  {
    name: 'G34 « car » dans une question',
    why: 'Une question n’affirme rien.',
    spec: [
      ['r', 'chapitre', 'Emploi'],
      ['s', 'section', 'Débats', 'r'],
      ['w', 'idee', 'Baisse des salaires', 's', 'Modération salariale.'],
      ['u', 'idee', 'Baisse du chômage', 's', 'Le chômage baisse-t-il car la baisse des salaires rend l’embauche rentable ?'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'w', to: 'u', fam: 'cause', soft: true }] },
  },
  {
    name: 'G35 hypothèse « si l’on croit »',
    why: 'Hypothèse d’école contestée dans la même phrase : abstention.',
    spec: [
      ['r', 'chapitre', 'Théories monétaires'],
      ['s', 'section', 'Neutralité de la monnaie', 'r'],
      ['c', 'idee', 'Création monétaire', 's', 'Émission de monnaie nouvelle.'],
      ['p', 'idee', 'Hausse de la production', 's', 'Si l’on croit les keynésiens, la création monétaire stimule la production ; les monétaristes le contestent.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'c', to: 'p', fam: 'cause', soft: true }] },
  },
  {
    name: 'G36 discours rapporté démenti',
    why: '« Selon certains… ; les études montrent le contraire » : la relation est niée.',
    spec: [
      ['r', 'chapitre', 'Mémoire'],
      ['s', 'section', 'Idées reçues', 'r'],
      ['c', 'idee', 'Caféine', 's', 'Stimulant.'],
      ['m', 'idee', 'Amélioration de la mémoire', 's', 'Selon certains élèves, la caféine provoque une amélioration de la mémoire ; les études montrent le contraire.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'c', to: 'm', fam: 'cause' }] },
  },
  {
    name: 'G37 négation sans « ne » (« loin de »)',
    why: '« Loin de provoquer la crise » : pas de cause ; l’inhibition peut être proposée.',
    spec: [
      ['r', 'chapitre', 'Finances publiques'],
      ['s', 'section', 'Crise de 2008', 'r'],
      ['d', 'idee', 'Dette publique', 's', 'Loin de provoquer la récession, la dette publique l’a amortie.'],
      ['k', 'idee', 'Récession', 's', 'Recul du PIB pendant deux trimestres.'],
    ],
    expect: { mustNot: [{ from: 'd', to: 'k', fam: 'cause' }], mustHave: [{ from: 'd', to: 'k', fam: 'inhibit', tier: 'probable' }] },
  },
  {
    name: 'G38 négation « ce n’est pas parce que »',
    why: 'Tournure qui nie la causalité tout en employant « parce que ».',
    spec: [
      ['r', 'chapitre', 'Conjoncture'],
      ['s', 'section', 'Croissance et emploi', 'r'],
      ['g', 'idee', 'Ralentissement de la croissance', 's', 'PIB en hausse de 0,5 %.'],
      ['u', 'idee', 'Hausse du chômage', 's', 'Ce n’est pas parce que le ralentissement de la croissance survient que la hausse du chômage suit.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'g', to: 'u', fam: 'cause' }] },
  },
  {
    name: 'G39 « aucun lien établi »',
    why: 'Négation par « aucun » : aucune relation causale.',
    spec: [
      ['r', 'chapitre', 'Santé'],
      ['s', 'section', 'Rumeurs', 'r'],
      ['v', 'idee', 'Vaccination infantile', 's', 'Calendrier obligatoire.'],
      ['a', 'idee', 'Autisme', 's', 'Aucun lien n’a été établi entre la vaccination infantile et l’autisme.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'v', to: 'a', fam: 'cause' }] },
  },
  {
    name: 'G40 « pour » non causal (pour cent, pour autant)',
    why: '« pour » quantitatif ou concessif : rien à relier.',
    spec: [
      ['r', 'chapitre', 'Ménages'],
      ['s', 'section', 'Épargne et consommation', 'r'],
      ['e', 'idee', 'Taux d’épargne', 's', 'Il atteint 17 pour cent ; pour autant, la consommation des ménages résiste.'],
      ['c', 'idee', 'Consommation des ménages', 's', 'Premier moteur de la croissance.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'e', to: 'c', fam: ['cause', 'enable', 'inhibit'] }] },
  },
  {
    name: 'G41 « pour » finalité vraie (glycolyse)',
    why: '« pour produire de l’ATP » : finalité / production ; proposition attendue, pas d’inversion.',
    spec: [
      ['r', 'chapitre', 'Métabolisme'],
      ['s', 'section', 'Respiration cellulaire', 'r'],
      ['g', 'etape', 'Glycolyse', 's', 'La cellule dégrade le glucose pour produire de l’ATP.'],
      ['a', 'idee', 'Production d’ATP', 's', 'Monnaie énergétique de la cellule.'],
    ],
    expect: { mustHave: [{ from: 'g', to: 'a', fam: ['cause', 'enable', 'goal'], tier: 'probable' }], mustNot: [{ from: 'a', to: 'g', fam: ['cause', 'enable'] }] },
  },

  /* ───────────── 13. Rattachement hiérarchique erroné vs juste ───────────── */
  {
    name: 'G42 parties posées à côté du tout (neurone)',
    why: 'Dendrites et axone précisent le neurone (« du neurone ») : sous lui. La synapse relie deux neurones : elle reste.',
    spec: [
      ['r', 'chapitre', 'Neurobiologie'],
      ['s', 'section', 'Le système nerveux', 'r'],
      ['n', 'notion', 'Neurone', 's', 'Cellule excitable qui transmet l’influx nerveux.'],
      ['d', 'idee', 'Dendrites', 's', 'Prolongements courts du neurone qui reçoivent le signal.'],
      ['a', 'idee', 'Axone', 's', 'Prolongement unique du neurone qui conduit l’influx.'],
      ['y', 'notion', 'Synapse', 's', 'Jonction entre deux neurones.'],
    ],
    expect: {
      mustParent: [['n', 'd'], ['n', 'a']],
      mustNotParent: [['n', 'y'], ['d', 'a'], ['a', 'd']],
      frozen: ['y', 'n'],
    },
  },
  {
    name: 'G43 mention n’est pas appartenance (vapeur)',
    why: 'Les usines utilisent la machine : relation transversale, pas une partie de la machine.',
    spec: [
      ['r', 'chapitre', 'Histoire économique'],
      ['s', 'section', 'Révolution industrielle', 'r'],
      ['v', 'idee', 'Machine à vapeur', 's', 'Elle fournit l’énergie mécanique.'],
      ['u', 'idee', 'Usines textiles', 's', 'Elles utilisent la machine à vapeur pour actionner les métiers à tisser.'],
    ],
    expect: { mustNotParent: [['v', 'u'], ['u', 'v']], mustHave: [{ from: 'v', to: 'u', fam: ['enable', 'cause', 'refer'], tier: 'probable' }], frozen: ['u', 'v'] },
  },
  {
    name: 'G44 renvoi qui devrait être hiérarchie (cellule)',
    why: 'Organite isolé au niveau du chapitre, relié par « comprend » : sa place est sous la cellule (renvoi → arbre).',
    spec: [
      ['r', 'chapitre', 'Biologie cellulaire'],
      ['s', 'section', 'Structure', 'r'],
      ['c', 'notion', 'Cellule eucaryote', 's', 'Cellule à noyau.'],
      ['c1', 'idee', 'Membrane plasmique', 'c', 'Frontière de la cellule.'],
      ['k', 'idee', 'Noyau', 'r', 'Contient l’ADN de la cellule eucaryote.'],
    ],
    links: [['c', 'k', 'comprend']],
    expect: { mustParent: [['c', 'k', 'probable']], mustNot: [{ from: 'r', to: 'k', fam: 'precise', soft: true }] },
  },

  /* ───────────── 14. Décomposition mal reliée ───────────── */
  {
    name: 'G45 décomposition mal câblée (contrat)',
    why: 'Composantes en escalier fautif : « deux personnes » et « obligations » précisent l’accord, pas l’une l’autre.',
    spec: [
      ['r', 'chapitre', 'Droit des obligations'],
      ['d', 'definition', 'Contrat', 'r', 'Le contrat est un accord de volontés entre deux ou plusieurs personnes destiné à créer, modifier, transmettre ou éteindre des obligations (art. 1101 du Code civil).'],
      ['a', 'idee', 'Un accord de volontés', 'd'],
      ['p', 'idee', 'Deux ou plusieurs personnes', 'd'],
      ['o', 'idee', 'Créer, modifier, transmettre ou éteindre des obligations', 'p'],
    ],
    treeLabels: { a: 'c’est', p: 'entre qui ?', o: 'pour ?' },
    expect: {
      mustParent: [['d', 'a'], ['a', 'p'], ['a', 'o']],
      mustNotParent: [['p', 'o']],
      frozen: ['d'],
    },
  },
  {
    name: 'G46 retypage : « Exemple : » sous un type idée (bulles)',
    why: 'Le titre déclare un exemple ; retyper puis rattacher à la notion qu’il illustre.',
    spec: [
      ['r', 'chapitre', 'Finance'],
      ['s', 'section', 'Bulles spéculatives', 'r'],
      ['b', 'notion', 'Bulle spéculative', 's', 'Prix déconnecté de la valeur fondamentale.'],
      ['k', 'notion', 'Krach', 's', 'Effondrement brutal des cours.'],
      ['x', 'idee', 'Exemple : la tulipomanie de 1637', 's', 'Un bulbe vaut une maison, puis plus rien : la bulle spéculative éclate.'],
    ],
    expect: { mustType: [['x', 'idee', 'probable']], mustHave: [{ from: 'b', to: 'x', fam: 'example', tier: 'probable' }] },
  },
  {
    name: 'G47 faux retypage (« cause célèbre »)',
    why: '« Cause célèbre » est une affaire, pas une cause : type et place inchangés.',
    spec: [
      ['r', 'chapitre', 'Troisième République'],
      ['s', 'section', 'Crises politiques', 'r'],
      ['d', 'idee', 'L’affaire Dreyfus, cause célèbre', 's', 'Un officier condamné à tort en 1894.'],
      ['z', 'idee', 'Loi de séparation de 1905', 's', 'Séparation des Églises et de l’État.'],
    ],
    expect: { frozen: 'all', mustNot: [{ from: 'd', to: 'z', fam: 'cause', soft: true }] },
  },
];
