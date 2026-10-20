---
name: ratio-livre-vers-cours
description: Transforme un livre, un PDF de cours, un polycopié ou des notes en un cours complet pour l'application Ratio (JSON importable avec cartes mentales typées, notes Markdown, relations libellées). À utiliser quand l'utilisateur fournit un document et demande des cartes, des fiches ou un cours Ratio.
---

# Ratio — Compilateur Livre → Cours (v3.1)

La spécification complète est dans `ratio_book_to_course_compiler_v3.1.json` (même dossier). **Lis-la en entier avant de commencer** (ordre conseillé : `how_to_read`), puis applique son `pipeline` P0 → P7 sans sauter de phase. Les `annexes` étalonnent le jugement ; elles ne priment jamais sur le reste.

## L'essentiel

- **`normative_core` l'emporte** sur tout autre passage : une seule valeur par règle. Ses tables (`rules`, `relation_by_type`, `lexicon_by_direction`) sont recopiées du moteur d'audit de Ratio : ton cours sera contrôlé avec exactement ces règles.
- **20 types seulement (v3.1)** : chapitre, lecon, section, notion, definition, methode, etape, conseil, exercice, date, chiffre, formule, etude, citation, personne, texte, juris, doctrine, retenir, idee. Les 23 anciens types (cause, consequence, condition, exception, exemple, nuance, piege, fond, forme…) sont **supprimés** : la relation passe dans le **libellé** de l'arête (`node_types.relations_as_labels`) — cause → idee sous l'effet « a pour cause », exception → idee « sauf », exemple → idee « illustré par », condition → idee « suppose »… Préfère les libellés que le moteur reconnaît. **Toute arête d'arbre relationnelle porte un libellé** ; le validateur refuse un type supprimé (erreur) et signale une arête relationnelle sans libellé.
- **Comprendre avant de construire (P3, obligatoire).** Pour chaque carte, AVANT de créer un nœud, écris la **carte de compréhension** (`comprehension_map`, table de travail hors JSON) :
  - **U** : les unités (idées, concepts, définitions, règles, exceptions, exemples, étapes) avec le **wording exact** de la source ;
  - **R** : chaque relation lue dans le texte, avec le **connecteur cité**, le sens vérifié et sa famille (cause, permet, suppose, sauf, illustre, s'oppose à, fait partie de, puis, selon, remédie à, corrélation) ;
  - **A** : chaque relation apparente à ne pas tracer (débat, négation, hypothèse, croyance rapportée, corrélation, une seule preuve) et le motif ;
  - **X** : les renvois transversaux.
  Chaque connecteur explicite de la source donne une ligne R ou une ligne A.
- **Rôle par relation** : un élément peut être l'effet d'une relation et la cause d'une autre ; le type ne dit que la relation au parent. Gère ET/OU (`logic`), les chaînes (« ce qui » enchaîne sur le résultat de la proposition précédente, jamais de raccourci A→C), les causes multiples (une relation par cause), « sauf si » (libellé « sauf ») ≠ « ne… que si » (libellé « suppose »), l'implicite seulement avec deux preuves concordantes, et les faux amis (« pour », « la cause de », « en partie », « donc » rhétorique).
- **P3c Passe transversale** : relations entre sections ou entre cartes → arbre, renvoi ou `[[Titre]]` avec son verbe. Budget de renvois : **n ÷ 5, borné à [2, 8]**, une fourche compte pour un ; une relation **explicite** du texte peut aller jusqu'au double.
- **Ordre fixe de construction (P4)** : **rôle → place → type → note → libellé**. Gabarits de décomposition (`modular_decomposition`) : définition (`modular_definitions`), règle (conditions → effet, sauf exceptions), mécanisme (chaîne de causes, boucle « entretient »), raisonnement (prémisses → conclusion), distinction (A se distingue de B par C), toujours avec les mots exacts de la source.
- **Notes lisibles par le moteur** (`note_rules.engine_readable`) : une relation par proposition, l'autre nœud nommé par son **titre exact**, des connecteurs que Ratio lit (« entraîne », « parce que », « favorise », « permet », « suppose », « sauf si », « illustre », « empêche », « réduit », « selon », « ce qui… »), pas de réserve inventée quand la source est catégorique. Le moteur ignore négations, questions, hypothèses, débats, passages entre « … » et toute note qui contient une ligne `>`.
- **Libellés** : des verbes ou des questions (≤ 20 caractères), dans le sens de la flèche ; jamais sous un intitulé, une liste nommée ou un nœud ET/OU ; jamais un nom-type ni « voir », « cf. », « lien ».
- **P6a Audit interne avant le JSON final** : relis la carte de compréhension ; chaque ligne R est encodée (arête libellée, renvoi, logic, rattachement, phrase de note) et juste, ou justifiée par une ligne A. Reporte au rapport : relations **lues / encodées / abstentions justifiées / non encodées (0)**. Pas de quota de renvois.
- **Valider (P6b)** avec `self_check.validator_python` (`--hors-droit` hors droit) jusqu'à zéro erreur — il signale aussi les **relations aplaties** (connecteur en note sans relation libellée) et refuse une carte de 8 nœuds ou plus sans aucun libellé — sinon `self_check.manual_checklist` ; relis les cas `validation_cases` A à P.
- **Sortie** : un bloc ```json `{"format":"ratio","version":2,"kind":"course","courses":[…1 cours…],"maps":[…]}` puis un court rapport en français (`report_template`). Une carte = un chapitre, racine `chapitre` dont la note dit la thèse ; racine à 3 à 7 enfants ; 15 à 35 nœuds ; `needsLayout: true` ; pas de `x`, `y`, `review`, `viewport`.
- **Fidélité** : rien d'inventé ; complément marqué *(complément)*, déduction à deux preuves *(déduit : …)*, relation non tranchée « Relation discutée : … ».
- **Exemple** : `example` déroule un chapitre hors droit (SVT) de l'extrait à la carte de compréhension puis au JSON ; l'exemple de droit est en annexe.
- **Livre long** : livrer en parties, même id de cours ; l'utilisateur importe les suites avec « Compléter le cours ».
