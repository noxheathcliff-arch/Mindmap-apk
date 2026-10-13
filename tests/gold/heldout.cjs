/* Jeu « held-out » — 30 cartes écrites SANS lire le moteur, même format que cards.cjs.
 * Usage : node tests/gold/eval.cjs --set heldout
 * H01–H12 : relations affirmées (positifs) ; H13–H25 : pièges / abstentions ; H26–H30 : cartes justes gelées.
 */
'use strict';

module.exports = [
  /* ───────────── Positifs ───────────── */
  {
    name: 'H01 chaîne entraîne → provoque (déforestation)',
    why: 'Déforestation → érosion → coulées de boue, chaque maillon dit dans la note de l’effet ; pas de raccourci.',
    spec: [
      ['r', 'chapitre', 'Dégradation des milieux'],
      ['s', 'section', 'Forêts tropicales', 'r'],
      ['d', 'cause', 'Déforestation', 's', 'Abattage massif des arbres en Amazonie.'],
      ['e', 'consequence', 'Érosion des sols', 's', 'La déforestation entraîne l’érosion des sols, que les racines ne retiennent plus.'],
      ['g', 'consequence', 'Coulées de boue', 's', 'L’érosion des sols provoque des coulées de boue lors des pluies violentes.'],
    ],
    expect: {
      mustHave: [{ from: 'd', to: 'e', fam: 'cause' }, { from: 'e', to: 'g', fam: 'cause' }],
      mustNot: [{ from: 'g', to: 'e', fam: 'cause' }, { from: 'e', to: 'd', fam: 'cause' }, { from: 'd', to: 'g', fam: 'cause', soft: true }],
      frozen: ['d', 'e', 'g'],
    },
  },
  {
    name: 'H02 énumération « à cause de » (fin de Rome)',
    why: 'Trois causes énumérées après « à cause de » dans la note de l’effet : trois liens vers l’effet, aucun entre causes.',
    spec: [
      ['r', 'chapitre', 'Antiquité tardive'],
      ['s', 'section', 'Fin de l’Occident romain', 'r'],
      ['a', 'cause', 'Crise économique', 's', 'Inflation et pression fiscale au IIIe siècle.'],
      ['b', 'cause', 'Invasions germaniques', 's', 'Wisigoths, Vandales, Ostrogoths.'],
      ['c', 'cause', 'Division de l’Empire', 's', 'Partage de 395 entre Orient et Occident.'],
      ['k', 'consequence', 'Chute de Rome en 476', 's', 'L’Empire d’Occident s’effondre à cause de la crise économique, des invasions germaniques et de la division de l’Empire.'],
    ],
    expect: {
      mustHave: [{ from: 'a', to: 'k', fam: 'cause' }, { from: 'b', to: 'k', fam: 'cause' }, { from: 'c', to: 'k', fam: 'cause' }],
      mustNot: [{ from: 'a', to: 'b', fam: 'any' }, { from: 'a', to: 'c', fam: 'any' }, { from: 'b', to: 'c', fam: 'any' }, { from: 'k', to: 'a', fam: 'cause' }],
    },
  },
  {
    name: 'H03 relative « ce qui entraîne » (dévaluation)',
    why: '« ce qui entraîne » relie la dévaluation à la hausse des exportations ; l’autre conséquence n’est pas nommée.',
    spec: [
      ['r', 'chapitre', 'Commerce extérieur'],
      ['s', 'section', 'Politique de change', 'r'],
      ['v', 'idee', 'Dévaluation de la monnaie', 's', 'L’État abaisse la valeur de sa devise, ce qui entraîne une hausse des exportations.'],
      ['x', 'consequence', 'Hausse des exportations', 's', 'Les produits nationaux deviennent moins chers à l’étranger.'],
      ['m', 'consequence', 'Renchérissement des importations', 's', 'Les biens étrangers coûtent plus cher.'],
    ],
    expect: {
      mustHave: [{ from: 'v', to: 'x', fam: 'cause' }],
      mustNot: [{ from: 'x', to: 'v', fam: 'cause' }, { from: 'v', to: 'm', fam: 'cause', soft: true }, { from: 'x', to: 'm', fam: 'any' }],
    },
  },
  {
    name: 'H04 « sauf si » (force majeure)',
    why: 'La force majeure est l’exception à la responsabilité du gardien : exception, ni cause ni condition.',
    spec: [
      ['r', 'chapitre', 'Responsabilité civile'],
      ['s', 'section', 'Fait des choses', 'r'],
      ['g', 'idee', 'Responsabilité du gardien', 's', 'Le gardien répond du dommage produit par la chose, sauf si la force majeure est prouvée.'],
      ['f', 'exception', 'Force majeure', 's', 'Événement imprévisible, irrésistible et extérieur.'],
    ],
    expect: {
      mustHave: [{ from: 'g', to: 'f', fam: 'exception' }],
      mustNot: [{ from: 'f', to: 'g', fam: ['cause', 'enable'] }, { from: 'g', to: 'f', fam: ['cause', 'enable'] }],
    },
  },
  {
    name: 'H05 exemple qui nomme la notion illustrée (lichen)',
    why: '« le lichen illustre le mutualisme » : exemple du mutualisme, pas du parasitisme.',
    spec: [
      ['r', 'chapitre', 'Écologie'],
      ['s', 'section', 'Relations entre espèces', 'r'],
      ['m', 'notion', 'Mutualisme', 's', 'Association où les deux partenaires gagnent.'],
      ['p', 'notion', 'Parasitisme', 's', 'Un organisme vit aux dépens d’un autre.'],
      ['x', 'exemple', 'Lichen', 's', 'Une algue et un champignon échangent sucres et eau : le lichen illustre le mutualisme.'],
    ],
    expect: {
      mustHave: [{ from: 'm', to: 'x', fam: 'example' }],
      mustNot: [{ from: 'p', to: 'x', fam: 'example' }, { from: 'm', to: 'p', fam: 'any' }],
      frozen: ['m', 'p'],
    },
  },
  {
    name: 'H06 parties « de l’œil » posées à côté (vision)',
    why: 'Rétine et cristallin sont des parties de l’œil (« de l’œil ») : sous lui. La myopie n’en est pas une partie.',
    spec: [
      ['r', 'chapitre', 'Physiologie'],
      ['s', 'section', 'La vision', 'r'],
      ['o', 'notion', 'Œil', 's', 'Organe de la vision.'],
      ['t', 'caracteristique', 'Rétine', 's', 'Membrane du fond de l’œil qui capte la lumière.'],
      ['c', 'caracteristique', 'Cristallin', 's', 'Lentille souple de l’œil qui fait converger les rayons.'],
      ['l', 'notion', 'Myopie', 's', 'Défaut de vision : les objets lointains paraissent flous.'],
    ],
    expect: {
      mustParent: [['o', 't'], ['o', 'c']],
      mustNotParent: [['o', 'l'], ['t', 'c'], ['c', 't']],
      frozen: ['o', 'l'],
    },
  },
  {
    name: 'H07 étapes en séquence (procédure législative)',
    why: '« Après le dépôt… », « Une fois la navette achevée… » : chaîne dépôt → navette → promulgation, sans raccourci ni inversion.',
    spec: [
      ['r', 'chapitre', 'Institutions'],
      ['s', 'section', 'Procédure législative', 'r'],
      ['d', 'etape', 'Dépôt du projet de loi', 's', 'Le gouvernement transmet le texte au bureau d’une assemblée.'],
      ['n', 'etape', 'Navette parlementaire', 's', 'Après le dépôt du projet de loi, le texte circule entre l’Assemblée nationale et le Sénat.'],
      ['p', 'etape', 'Promulgation', 's', 'Une fois la navette parlementaire achevée, le président de la République promulgue la loi.'],
    ],
    expect: {
      mustHave: [{ from: 'd', to: 'n', fam: 'seq' }, { from: 'n', to: 'p', fam: 'seq' }],
      mustNot: [{ from: 'p', to: 'n', fam: 'seq' }, { from: 'n', to: 'd', fam: 'seq' }, { from: 'd', to: 'p', fam: 'any', soft: true }],
    },
  },
  {
    name: 'H08 auteur cité « selon Freud » (refoulement)',
    why: 'Le refoulement est attribué à Freud (nœud personne « Sigmund Freud ») : un lien attendu, jamais causal ; la sublimation ne le cite pas.',
    spec: [
      ['r', 'chapitre', 'Psychanalyse'],
      ['s', 'section', 'Mécanismes de défense', 'r'],
      ['f', 'personne', 'Sigmund Freud', 's', 'Médecin viennois, 1856-1939.'],
      ['rf', 'notion', 'Refoulement', 's', 'Selon Freud, le refoulement maintient hors de la conscience les désirs inacceptables.'],
      ['sb', 'notion', 'Sublimation', 's', 'Les pulsions sont détournées vers des activités socialement valorisées.'],
    ],
    expect: {
      mustHave: [{ from: 'rf', to: 'f', fam: 'any' }],
      mustNot: [
        { from: 'rf', to: 'f', fam: ['cause', 'enable', 'example', 'exception'] },
        { from: 'f', to: 'rf', fam: ['cause', 'enable', 'example', 'exception'] },
        { from: 'sb', to: 'f', fam: 'any' },
        { from: 'sb', to: 'rf', fam: 'any' },
      ],
    },
  },
  {
    name: 'H09 doublon vrai (impératif catégorique)',
    why: 'Même titre, même type, même parent, notes complémentaires : fusion ; l’impératif hypothétique est distinct.',
    spec: [
      ['r', 'chapitre', 'Philosophie morale'],
      ['s', 'section', 'Morale kantienne', 'r'],
      ['a', 'notion', 'Impératif catégorique', 's', 'Commandement inconditionnel de la raison.'],
      ['b', 'notion', 'Impératif catégorique', 's', 'Formule : agis seulement d’après la maxime dont tu peux vouloir qu’elle devienne une loi universelle.'],
      ['c', 'notion', 'Impératif hypothétique', 's', 'Commande un moyen en vue d’une fin particulière.'],
    ],
    expect: { mustMerge: [['a', 'b']], mustNotMerge: [['a', 'c']], frozen: ['c'] },
  },
  {
    name: 'H10 « permet » (hémoglobine)',
    why: 'L’hémoglobine permet le transport de l’oxygène : relation de possibilité, dans ce sens ; les plaquettes ne sont pas concernées.',
    spec: [
      ['r', 'chapitre', 'Physiologie humaine'],
      ['s', 'section', 'Le sang', 'r'],
      ['h', 'notion', 'Hémoglobine', 's', 'Protéine des globules rouges ; l’hémoglobine permet le transport de l’oxygène vers les tissus.'],
      ['t', 'idee', 'Transport de l’oxygène', 's', 'Des poumons jusqu’aux organes.'],
      ['p', 'notion', 'Plaquettes', 's', 'Elles interviennent dans la coagulation.'],
    ],
    expect: {
      mustHave: [{ from: 'h', to: 't', fam: 'enable' }],
      mustNot: [{ from: 't', to: 'h', fam: ['enable', 'cause'] }, { from: 'p', to: 't', fam: 'any' }, { from: 'p', to: 'h', fam: 'any' }],
    },
  },
  {
    name: 'H11 « à condition que » et « suppose » (rupture du contrat)',
    why: 'Deux conditions, chacune rattachée à sa propre règle ; pas de croisement.',
    spec: [
      ['r', 'chapitre', 'Droit du travail'],
      ['s', 'section', 'Rupture du contrat', 'r'],
      ['rc', 'notion', 'Rupture conventionnelle', 's', 'Elle met fin au CDI d’un commun accord, à condition que l’homologation par l’administration soit obtenue.'],
      ['hm', 'condition', 'Homologation par l’administration', 's', 'L’administration dispose de quinze jours pour se prononcer.'],
      ['li', 'notion', 'Licenciement', 's', 'Rupture à l’initiative de l’employeur ; il suppose une cause réelle et sérieuse.'],
      ['cr', 'condition', 'Cause réelle et sérieuse', 's', 'Motif objectif, exact et suffisamment grave.'],
    ],
    expect: {
      mustHave: [{ from: 'hm', to: 'rc', fam: 'enable' }, { from: 'cr', to: 'li', fam: 'enable' }],
      mustNot: [{ from: 'hm', to: 'li', fam: 'any' }, { from: 'cr', to: 'rc', fam: 'any' }, { from: 'hm', to: 'rc', fam: 'cause' }, { from: 'cr', to: 'li', fam: 'cause' }],
    },
  },
  {
    name: 'H12 « réduit » (bouclier tarifaire)',
    why: 'Le bouclier réduit la hausse des factures : inhibition, pas cause ; le déficit n’est pas relié par le texte.',
    spec: [
      ['r', 'chapitre', 'Politique énergétique'],
      ['s', 'section', 'Mesures de 2022', 'r'],
      ['b', 'idee', 'Bouclier tarifaire', 's', 'Le bouclier tarifaire réduit la hausse des factures d’électricité des ménages.'],
      ['f', 'consequence', 'Hausse des factures d’électricité', 's', 'Les prix de gros ont triplé.'],
      ['d', 'idee', 'Déficit public', 's', 'Il atteint 4,8 % du PIB.'],
    ],
    expect: {
      mustHave: [{ from: 'b', to: 'f', fam: 'inhibit' }],
      mustNot: [{ from: 'f', to: 'b', fam: 'cause' }, { from: 'b', to: 'd', fam: 'any', soft: true }, { from: 'f', to: 'd', fam: 'any' }],
    },
  },

  /* ───────────── Pièges / abstentions ───────────── */
  {
    name: 'H13 « n’entraîne pas » (salaire minimum)',
    why: 'Négation explicite d’un lien causal.',
    spec: [
      ['r', 'chapitre', 'Marché du travail'],
      ['s', 'section', 'Salaire minimum', 'r'],
      ['m', 'idee', 'Hausse du salaire minimum', 's', 'Selon l’étude de Card et Krueger, la hausse du salaire minimum n’entraîne pas de destructions d’emplois.'],
      ['d', 'consequence', 'Destructions d’emplois', 's', 'Suppressions nettes de postes.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'm', to: 'd', fam: 'cause' }, { from: 'd', to: 'm', fam: 'cause' }] },
  },
  {
    name: 'H14 « ni… ni » et « aucun lien » (croyances populaires)',
    why: 'Deux négations (ni… ni ; aucun lien démontré) : aucune relation causale.',
    spec: [
      ['r', 'chapitre', 'Esprit critique'],
      ['s', 'section', 'Croyances populaires', 'r'],
      ['pl', 'idee', 'Pleine lune', 's', 'La pleine lune ne provoque ni les insomnies ni la hausse des naissances.'],
      ['in', 'idee', 'Insomnies', 's', 'Difficultés à s’endormir.'],
      ['na', 'idee', 'Hausse des naissances', 's', 'Pic supposé dans les maternités.'],
      ['as', 'idee', 'Signe astrologique', 's', 'Position du Soleil à la naissance.'],
      ['pe', 'idee', 'Traits de personnalité', 's', 'Aucun lien n’a été démontré entre le signe astrologique et les traits de personnalité.'],
    ],
    expect: {
      abstain: true,
      mustNot: [
        { from: 'pl', to: 'in', fam: 'cause' }, { from: 'pl', to: 'na', fam: 'cause' },
        { from: 'as', to: 'pe', fam: 'cause' }, { from: 'pe', to: 'as', fam: 'cause' },
        { from: 'in', to: 'na', fam: 'any' },
      ],
    },
  },
  {
    name: 'H15 question (crise de 1929)',
    why: 'Une question n’affirme pas de causalité.',
    spec: [
      ['r', 'chapitre', 'Entre-deux-guerres'],
      ['s', 'section', 'Allemagne de Weimar', 'r'],
      ['c', 'idee', 'Crise de 1929', 's', 'Krach de Wall Street et chômage de masse.'],
      ['h', 'idee', 'Arrivée d’Hitler au pouvoir', 's', 'Janvier 1933. La crise de 1929 a-t-elle provoqué l’arrivée d’Hitler au pouvoir ?'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'c', to: 'h', fam: 'cause', soft: true }, { from: 'h', to: 'c', fam: 'cause' }] },
  },
  {
    name: 'H16 « selon une idée reçue » démentie (sucre)',
    why: 'Croyance rapportée puis infirmée : aucune causalité.',
    spec: [
      ['r', 'chapitre', 'Nutrition et comportement'],
      ['s', 'section', 'Idées reçues', 'r'],
      ['su', 'idee', 'Consommation de sucre', 's', 'Sodas, bonbons, desserts.'],
      ['hy', 'idee', 'Hyperactivité des enfants', 's', 'Selon une idée reçue, la consommation de sucre provoque l’hyperactivité des enfants ; les essais en double aveugle ne le confirment pas.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'su', to: 'hy', fam: 'cause' }] },
  },
  {
    name: 'H17 débat « selon les uns… selon les autres » (démographie)',
    why: 'Deux thèses opposées (stimule / freine) : la carte ne tranche pas.',
    spec: [
      ['r', 'chapitre', 'Démographie'],
      ['s', 'section', 'Population et développement', 'r'],
      ['cd', 'idee', 'Croissance démographique', 's', 'Selon les uns, la croissance démographique stimule le développement économique ; selon les autres, elle le freine.'],
      ['dv', 'idee', 'Développement économique', 's', 'Hausse durable du niveau de vie.'],
    ],
    expect: {
      abstain: true,
      mustNot: [{ from: 'cd', to: 'dv', fam: 'cause', soft: true }, { from: 'cd', to: 'dv', fam: 'inhibit', soft: true }, { from: 'dv', to: 'cd', fam: 'cause' }],
    },
  },
  {
    name: 'H18 discours rapporté entre guillemets (peine de mort)',
    why: 'La causalité est dans la bouche des partisans, entre « … » : la carte ne l’assume pas.',
    spec: [
      ['r', 'chapitre', 'Philosophie du droit'],
      ['s', 'section', 'Débat sur la peine capitale', 'r'],
      ['pm', 'idee', 'Peine de mort', 's', 'Abolie en France en 1981.'],
      ['bc', 'idee', 'Baisse de la criminalité', 's', 'Mesurée par les statistiques policières.'],
      ['q', 'citation', 'Argument des partisans', 's', 'Les partisans répétaient : « la peine de mort entraîne la baisse de la criminalité ».'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'pm', to: 'bc', fam: 'cause', soft: true }] },
  },
  {
    name: 'H19 note en bloc de citation « > » (Lamarck)',
    why: 'Note-citation d’une thèse historique (réfutée) : pas une affirmation de la carte.',
    spec: [
      ['r', 'chapitre', 'Évolution'],
      ['s', 'section', 'Théories historiques', 'r'],
      ['u', 'idee', 'Usage des organes', 's', 'Exercice répété d’une fonction.'],
      ['a', 'idee', 'Allongement du cou de la girafe', 's', 'Trait observé chez les girafes actuelles.'],
      ['q', 'citation', 'Thèse de Lamarck', 's', '> L’usage des organes entraîne l’allongement du cou de la girafe.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'u', to: 'a', fam: 'cause', soft: true }] },
  },
  {
    name: 'H20 modalisation « peut parfois favoriser » (écrans)',
    why: 'Relation seulement possible : proposition acceptable, application sûre interdite.',
    spec: [
      ['r', 'chapitre', 'Psychologie du sommeil'],
      ['s', 'section', 'Hygiène de vie', 'r'],
      ['e', 'idee', 'Usage des écrans le soir', 's', 'L’usage des écrans le soir peut parfois favoriser des troubles du sommeil.'],
      ['t', 'consequence', 'Troubles du sommeil', 's', 'Endormissement retardé, réveils nocturnes.'],
    ],
    expect: {
      abstain: true,
      mustHave: [{ from: 'e', to: 't', fam: 'cause', tier: 'probable' }],
      mustNot: [{ from: 'e', to: 't', fam: 'cause', soft: true }, { from: 't', to: 'e', fam: 'cause' }],
    },
  },
  {
    name: 'H21 homonymes (révolution)',
    why: 'Révolution astronomique / politique : jamais fusionner, jamais relier.',
    spec: [
      ['r', 'chapitre', 'Culture générale'],
      ['s1', 'section', 'Astronomie', 'r'],
      ['a', 'notion', 'Révolution', 's1', 'Mouvement d’un astre autour d’un autre : la Terre accomplit une révolution en 365 jours.'],
      ['s2', 'section', 'Histoire politique', 'r'],
      ['b', 'notion', 'Révolution', 's2', 'Renversement brutal d’un régime politique, comme en 1789.'],
    ],
    expect: { mustNotMerge: [['a', 'b']], mustNot: [{ from: 'a', to: 'b', fam: 'any' }], frozen: 'all' },
  },
  {
    name: 'H22 simple mention sans connecteur (inflation / chômage)',
    why: 'Les deux titres cohabitent dans une phrase sans verbe de relation : rien d’établi.',
    spec: [
      ['r', 'chapitre', 'Conjoncture'],
      ['s', 'section', 'Indicateurs', 'r'],
      ['i', 'notion', 'Inflation', 's', 'Hausse générale et durable des prix.'],
      ['c', 'notion', 'Chômage', 's', 'Chômage et inflation : deux indicateurs suivis de près par la banque centrale.'],
    ],
    expect: {
      abstain: true,
      mustNot: [
        { from: 'i', to: 'c', fam: ['cause', 'enable', 'inhibit', 'example', 'precise'] },
        { from: 'c', to: 'i', fam: ['cause', 'enable', 'inhibit', 'example', 'precise'] },
        { from: 'i', to: 'c', fam: 'any', soft: true },
      ],
      mustNotParent: [['i', 'c'], ['c', 'i']],
    },
  },
  {
    name: 'H23 « pour » non finalisé (gaz parfaits)',
    why: '« Pour mémoire », « pour la pression » : simple thème, ni but ni cause.',
    spec: [
      ['r', 'chapitre', 'Thermodynamique'],
      ['s', 'section', 'Grandeurs d’état', 'r'],
      ['p', 'notion', 'Pression', 's', 'Force exercée par unité de surface.'],
      ['t', 'notion', 'Température', 's', 'Pour mémoire, elle s’exprime en kelvins ; pour la pression, l’unité est le pascal.'],
    ],
    expect: {
      abstain: true,
      mustNot: [{ from: 't', to: 'p', fam: ['goal', 'cause', 'enable'] }, { from: 'p', to: 't', fam: ['goal', 'cause', 'enable'] }],
      mustNotParent: [['p', 't'], ['t', 'p']],
    },
  },
  {
    name: 'H24 titre employé dans un autre sens (crédit)',
    why: '« accorder peu de crédit » (confiance) ne renvoie pas au crédit bancaire.',
    spec: [
      ['r', 'chapitre', 'Notions transversales'],
      ['s1', 'section', 'Banque', 'r'],
      ['k', 'notion', 'Crédit', 's1', 'Prêt d’argent consenti par une banque.'],
      ['s2', 'section', 'Procès pénal', 'r'],
      ['t', 'idee', 'Témoignage', 's2', 'Les jurés accordent peu de crédit à ce témoignage contradictoire.'],
    ],
    expect: { mustNot: [{ from: 't', to: 'k', fam: 'any' }, { from: 'k', to: 't', fam: 'any' }], frozen: 'all' },
  },
  {
    name: 'H25 « loin de » (traité de Versailles)',
    why: '« Loin de garantir une paix durable » : le traité ne permet pas la paix ; rien à relier positivement.',
    spec: [
      ['r', 'chapitre', 'Après 1918'],
      ['s', 'section', 'Les traités de paix', 'r'],
      ['tv', 'idee', 'Traité de Versailles', 's', 'Loin de garantir une paix durable, le traité de Versailles a nourri le ressentiment allemand.'],
      ['pd', 'idee', 'Paix durable', 's', 'Objectif proclamé de la Société des Nations.'],
    ],
    expect: { abstain: true, mustNot: [{ from: 'tv', to: 'pd', fam: ['cause', 'enable'] }, { from: 'pd', to: 'tv', fam: ['cause', 'enable'] }] },
  },

  /* ───────────── Cartes justes gelées ───────────── */
  {
    name: 'H26 carte juste (doute cartésien)',
    why: 'Étapes du doute sous la notion, enchaînées, aboutissant au cogito, auteur renvoyé : rien à corriger.',
    spec: [
      ['r', 'chapitre', 'Philosophie moderne'],
      ['s', 'section', 'Méthode cartésienne', 'r'],
      ['dc', 'personne', 'René Descartes', 's', 'Philosophe français, 1596-1650.'],
      ['dm', 'notion', 'Doute méthodique', 's', 'Rejeter comme faux tout ce qui n’est pas absolument certain.'],
      ['e1', 'etape', 'Doute sur les sens', 'dm', 'Les sens nous trompent parfois.'],
      ['e2', 'etape', 'Argument du rêve', 'dm', 'Rien ne distingue sûrement la veille du sommeil.'],
      ['e3', 'etape', 'Hypothèse du malin génie', 'dm', 'Un trompeur tout-puissant pourrait m’abuser.'],
      ['cg', 'idee', 'Cogito', 's', 'Je pense, donc je suis : seule certitude qui résiste à l’épreuve.'],
    ],
    treeLabels: { e1: 'comprend', e2: 'comprend', e3: 'comprend' },
    links: [['e1', 'e2', 'puis'], ['e2', 'e3', 'puis'], ['dm', 'cg', 'aboutit à'], ['dm', 'dc', 'renvoie à']],
    expect: { frozen: 'all' },
  },
  {
    name: 'H27 carte juste (responsabilité pour faute)',
    why: 'Conditions sous la règle (« suppose »), exception « sauf » ; « cause » dans l’article est un verbe de la loi, pas un lien à créer.',
    spec: [
      ['r', 'chapitre', 'Responsabilité délictuelle'],
      ['n', 'notion', 'Responsabilité pour faute', 'r', 'Art. 1240 du Code civil : tout fait de l’homme qui cause à autrui un dommage oblige à le réparer.'],
      ['f', 'condition', 'Faute', 'n', 'Comportement illicite ou imprudent.'],
      ['d', 'condition', 'Dommage', 'n', 'Préjudice certain et personnel.'],
      ['l', 'condition', 'Lien de causalité', 'n', 'Rapport direct entre le fait et le préjudice.'],
      ['x', 'exception', 'Légitime défense', 'n', 'Riposte nécessaire et proportionnée à une agression.'],
    ],
    treeLabels: { f: 'suppose', d: 'suppose', l: 'suppose', x: 'sauf' },
    expect: { frozen: 'all' },
  },
  {
    name: 'H28 carte juste (loi d’Ohm)',
    why: 'Précision et exemple déjà libellés, renvoi transversal vers l’effet Joule ; « Pour 230 V » n’est pas un but.',
    spec: [
      ['r', 'chapitre', 'Électricité'],
      ['s', 'section', 'Circuits', 'r'],
      ['o', 'notion', 'Loi d’Ohm', 's', 'U = R × I pour un conducteur ohmique.'],
      ['c', 'caracteristique', 'Proportionnalité tension-intensité', 'o', 'Le graphe U(I) est une droite passant par l’origine.'],
      ['x', 'exemple', 'Résistance d’un grille-pain', 'o', 'Pour 230 V et 10 A, R vaut 23 ohms.'],
      ['j', 'notion', 'Effet Joule', 's', 'Dégagement de chaleur dans un conducteur parcouru par un courant.'],
    ],
    treeLabels: { c: 'précise', x: 'illustré par' },
    links: [['j', 'x', 'illustré par']],
    expect: { frozen: 'all' },
  },
  {
    name: 'H29 carte juste (réponse immunitaire)',
    why: 'Étapes enchaînées par « puis », conséquence et exemple libellés : rien à corriger.',
    spec: [
      ['r', 'chapitre', 'Immunologie'],
      ['n', 'notion', 'Réponse immunitaire adaptative', 'r', 'Défense spécifique contre un antigène.'],
      ['e1', 'etape', 'Reconnaissance de l’antigène', 'n', 'Les lymphocytes repèrent l’intrus.'],
      ['e2', 'etape', 'Prolifération des lymphocytes', 'n', 'Multiplication des clones sélectionnés.'],
      ['e3', 'etape', 'Production d’anticorps', 'n', 'Les plasmocytes sécrètent des anticorps.'],
      ['m', 'consequence', 'Mémoire immunitaire', 'n', 'Réponse plus rapide lors d’un second contact.'],
      ['v', 'exemple', 'Rappel vaccinal', 'm', 'Une seconde injection renforce la protection.'],
    ],
    treeLabels: { e1: 'comprend', e2: 'comprend', e3: 'comprend', m: 'entraîne', v: 'illustré par' },
    links: [['e1', 'e2', 'puis'], ['e2', 'e3', 'puis']],
    expect: { frozen: 'all' },
  },
  {
    name: 'H30 carte juste (stades de Piaget)',
    why: 'Quatre stades en séquence sous la théorie, auteur renvoyé : rien à corriger.',
    spec: [
      ['r', 'chapitre', 'Développement de l’enfant'],
      ['p', 'personne', 'Jean Piaget', 'r', 'Psychologue suisse, 1896-1980.'],
      ['t', 'notion', 'Stades du développement cognitif', 'r', 'Théorie de Jean Piaget.'],
      ['s1', 'etape', 'Stade sensori-moteur', 't', 'De 0 à 2 ans.'],
      ['s2', 'etape', 'Stade préopératoire', 't', 'De 2 à 7 ans.'],
      ['s3', 'etape', 'Stade des opérations concrètes', 't', 'De 7 à 11 ans.'],
      ['s4', 'etape', 'Stade des opérations formelles', 't', 'À partir de 11 ans.'],
    ],
    treeLabels: { s1: 'comprend', s2: 'comprend', s3: 'comprend', s4: 'comprend' },
    links: [['t', 'p', 'renvoie à'], ['s1', 's2', 'puis'], ['s2', 's3', 'puis'], ['s3', 's4', 'puis']],
    expect: { frozen: 'all' },
  },
];
