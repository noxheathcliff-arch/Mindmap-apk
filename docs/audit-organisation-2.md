# Audit de l'organisation des cartes — deuxième génération

Audit mené par six agents indépendants, en lecture seule, chacun avec un périmètre distinct :

- **A** : architecture du graphe et du moteur.
- **B** : sémantique des relations.
- **C** : pédagogie et révision.
- **D** : qualité et cas adversariaux, démontrés par exécution.
- **E** : seuils et paramètres, mesurés sur données réelles.
- **F** : contradicteur.

Les rapports ont été confrontés, puis arbitrés par le code, les tests et la mesure.

**Données.**
- Un cours réel : 16 cartes, 414 nœuds, développement personnel, produit avec le skill v1.x. Il n'est pas versionné (contenu d'un livre).
- Les exemples juridiques du skill.
- Seize cartes-pièges synthétiques (`tests/metrics.cjs`).

Aucun cours de droit réel n'était disponible : les résultats en droit reposent sur des cas synthétiques.

## Constat principal

Le moteur v2.1 cochait par défaut des corrections « sûres » fausses. Ces erreurs n'apparaissaient pas sur les données réelles, mais sur des cas que n'importe quel cours contient :

- **Négations.** « n'entraîne pas » devenait « entraîne ».
- **Couples de types.** Un problème était « résolu par » sa conséquence ; une cause « entraînait » une solution.
- **Chaînes justes inversées.** Le sens était tiré des seuls types, or un élément peut être l'effet d'une chose et la cause d'une autre.
- **Verbes posés depuis un intitulé.** Exemple : « Chapitre 3 —entraîne→ … ». Cela concernait 53 % des libellés automatiques sur le cours réel.
- **Libellés-noms.** « conseil », « définition » ne font que redire le sur-titre (42 sur le cours réel).
- **Homonymie.** La notion « Partie » était reliée à « en partie d'accord ».
- **Doublons.** Un cercle vicieux réel était supprimé comme doublon.
- **Découpages de définition infidèles.** Des composantes étaient libellées « et », le « soit… soit » et le « par lequel » étaient mal coupés.

Le dispositif de mesure le montre : **16 pièges sur 16 tombaient avec la v2.1, 0 sur 16 avec la v3**.

Côté révision, quatre défauts réduisaient l'intérêt des relations :

- les renvois n'apparaissaient jamais ;
- le parent révélait la réponse ;
- les composantes d'une définition devenaient des fiches isolées ;
- la consigne perdait le nombre d'éléments à retrouver.

## Inventaire

Statuts :
- **fait** : implémenté et vérifié par un test ou une mesure.
- **fait, partiel** : implémenté, vérification partielle.
- **expérimental** : non intégré, bénéfice incertain.
- **reporté** : utile, mais prérequis ou coût non justifié maintenant.
- **écarté** : redondant, peu fiable ou contraire aux principes.

### A. Qualité des relations

| # | Piste (agent) | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 1 | Libellé causal choisi selon le couple de types (D2, D3 ; B2) | supprime « résolu par → conséquence » | faible | **fait** (`CAUSAL_PAIRS`) |
| 2 | Garde de négation (« n'entraîne pas », « ne pas confondre », « sans ») (D1, D5 ; F5) | plus de liens tirés d'une phrase négative | faible | **fait** |
| 3 | Plus d'inversion « sûre » tirée des seuls types ; couple strict cause ↔ conséquence seulement, décoché (D4 ; F1) | ne casse plus les chaînes justes | faible | **fait** |
| 4 | Pas de raccourci transitif : lien cause → effet seulement sous un intitulé (B3) | ne court-circuite plus la notion | faible | **fait** |
| 5 | Dédoublonnage orienté ; boucle et contradiction signalées, jamais supprimées (B1, B6) | un cercle vicieux survit | faible | **fait** |
| 6 | Lexique par sens de lecture (forward / backward / inhibit / symmetric / vague) partagé avec le skill (B8 ; E, F12) | même lecture des flèches partout | moyen | **fait** (`LEX`) |
| 7 | Corrélation ≠ causalité ; « est associé à » retiré des libellés vagues (B4) | études honnêtes | faible | **fait** (skill + lexique) |
| 8 | Condition nécessaire / suffisante / facteur (B5) | précision des conditions | faible | **fait, skill seulement** (le moteur ne peut pas trancher) |
| 9 | Exception (« sauf », qui écarte) ≠ nuance (qui module) ; titre qui ne recommence pas par « Sauf » (B7) | exceptions lisibles | faible | **fait, skill seulement** |
| 10 | `[[Titre]]` promu en lien seulement si la phrase dit le verbe ; titre ambigu signalé (A4, D11 ; F8) | respecte la règle du skill, garde le sens | faible | **fait** |
| 11 | Lien vers un intitulé ou une question signalé (B14) | relations rattachées à des idées | faible | **fait** |
| 12 | Statut « probable » persistant sur un lien accepté (pointillés, confirmation) (A3) | l'incertitude survit à l'acceptation | moyen (schéma, rendu, skill) | **reporté** : nouveau champ de schéma, à décider |
| 13 | Contrôle d'orientation par les libellés déjà posés, pas seulement par les types (B12) | couvre les nœuds à double rôle | moyen | **reporté** |
| 14 | Transitivité inférée (A→B→C ⇒ A→C) (B) | — | — | **écarté** : fabrique des relations |

### B. Organisation des sous-graphes

| # | Piste | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 15 | Aucun verbe depuis un intitulé, une question ou une liste nommée (D, E ; F3) | 38 verbes faux en moins sur le cours réel | faible | **fait** |
| 16 | Branche seulement si le parent mêle au moins deux familles, jamais pour tous ses enfants (F14) | moins de bruit visuel | faible | **fait** |
| 17 | `regroupOrder` correct dans toutes les dispositions (échange d'emplacements) (A-B1) | branches contiguës en pyramide et en centrée | faible | **fait** |
| 18 | Liste plate jugée sur la carte supposée corrigée ; une branche libellée ne suffit plus à la faire taire (E P2-a ; D8) | signalements cohérents avec les propositions | faible | **fait** |
| 19 | Prérequis défini plus loin dans le cours, signalé (C6) | « Estime de soi » employée 4 cartes avant d'être définie : détecté | moyen | **fait** |
| 20 | Budget de renvois par carte, renvois existants compris ; une fourche compte pour un (E P1-b ; D10) | idempotence, densité maîtrisée | faible | **fait** |
| 21 | Au plus 3 renvois vers une même notion (E P2-e) | pas d'étoile illisible | faible | **fait** (existait, unifié dans `RULES`) |
| 22 | Chaîne présente dans les notes de frères (« ce qui… », « donc ») signalée (B11) | relations cachées dans la prose | moyen | **expérimental** : risque de bruit |
| 23 | Notion définie mais jamais réutilisée (C7) | savoirs inertes | faible | **reporté** : bruit sur les livres de conseils |
| 24 | Ordre de lecture explicite (`rank`) au lieu de la géométrie (A5) | ordre stable si on déplace un nœud | moyen + migration | **reporté** |
| 25 | Liens entre cartes (A) | relations d'un chapitre à l'autre | élevé | **reporté** : limite architecturale (une carte = un graphe) |

### C. Décomposition modulaire

| # | Piste | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 26 | Bogue `\b` après « à » (« consiste à », « à condition que », « à titre gratuit ») (B15) | composantes et relief reconnus | faible | **fait** |
| 27 | Renoncer plutôt que trahir : soit…soit, « par lequel », « le fait pour », négation, morceau sans fonction (B ; D ; F7) | plus de composantes « et » ni de coupes absurdes | faible | **fait** |
| 28 | Fidélité vérifiée : chaque composante est une sous-chaîne exacte de la source, au moins 2 mots (D) | « mots exacts » garanti | faible | **fait** |
| 29 | Hors droit, décomposition décochée (F7) | moins de fragmentation hors droit | faible | **fait** |
| 30 | Pas d'exemple rattaché sous une définition (il bloquait la décomposition) (A-B2) | corrections commutatives | faible | **fait** |
| 31 | Gabarits règle complète, mécanisme et cercle vicieux, distinctions (B10 ; C10) | raisonnements structurés dès l'import | faible (skill) | **fait, skill seulement** |
| 32 | Découpage des règles (conditions ET, exceptions) par le moteur | — | élevé, peu fiable | **écarté** : à faire par le skill, pas par des expressions régulières |

### D. Révision

| # | Piste | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 33 | Composantes de définition non révisées seules : une définition = une fiche (C4 ; F7) | 1 fiche au lieu de 3 | faible | **fait** |
| 34 | La consigne garde le nombre d'éléments ; la chaîne de libellés seulement pour une définition, plus « attention à la portée » (F4 ; C8, C9) | consignes non cryptiques | faible | **fait** |
| 35 | Renvois dans la réponse (« Relié à », 3 au plus) (C1 ; A6) | les relations transversales sont révisées | faible | **fait** |
| 36 | Parent masqué pour un exemple, une cause, une conséquence… jusqu'à la réponse (C2) | rappel au lieu de reconnaissance | faible | **fait** |
| 37 | Fiches nouvelles dans l'ordre du plan (C3) | cause avant effet, notion avant composante | faible | **fait** (remplace le mélange aléatoire) |
| 38 | Fiche dérivée « Distingue A et B » (C10) | apprentissage par contraste | moyen | **reporté** : fiche sans état de répétition propre |
| 39 | Propager un échec aux fiches dépendantes (C11) | consolide les prérequis | moyen | **expérimental** : risque d'inflation de la charge |

### E. Contrôle, paramètres, mesure

| # | Piste | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 40 | Source unique des règles : moteur → skill (`normative_core`, ligne `RULES=` du validateur), test d'accord (E P1-a) | fin des 8 incohérences skill ↔ moteur | moyen | **fait** (`tests/skill-rules.cjs`) |
| 41 | Rareté des mots + pluriels (« votre », besoin/besoins) (E P1-d) | moins de faux indices | faible | **fait** |
| 42 | `check()` étendu ; comparaison par ensembles ; groupes renormalisés avant contrôle (A-B4, A8 ; D) | aucune violation masquée | faible | **fait** |
| 43 | Refus connus du moteur (un élément refusé redevient disponible) (A-B5 ; D13) | plus de blocage collant | faible | **fait** |
| 44 | Boucles de hiérarchie cassées à l'import (A-B3) | carte importée toujours rangeable | faible | **fait** |
| 45 | Performances : index des mots, cache de normalisation, paires précalculées (A7) | 2 000 nœuds : 3,6 s → 0,36 s | moyen | **fait** |
| 46 | Une proposition de libellés par parent (A2 ; E P2-b) | refus fin | faible | **fait** |
| 47 | Dispositif de mesure avant/après, indépendant du moteur (D §3) | progrès vérifiable | moyen | **fait** (`tests/metrics.cjs`) |
| 48 | Score de confiance continu (noisy-OR, IDF) remplaçant les règles sûr / probable (E P1-c) | calibrage fin | élevé, à calibrer sur un jeu annoté | **expérimental** : les règles discrètes suffisent tant qu'on n'a pas de jeu annoté |
| 49 | Profil « droit / hors droit » configurable (E P2-c) | — | — | **fait, détection automatique** (types et marqueurs juridiques), sans réglage exposé |
| 50 | Exposer les seuils lexicaux à l'utilisateur ; rendre réglables les poids de `layout.js` ; noter la confiance par une IA (E) | — | — | **écarté** : sans sens pour un élève, ou non déterministe |
| 51 | Relever le seuil de libellés ou le rendre bloquant (F) | — | — | **écarté** : pousse au remplissage creux |

## Mesures

| Mesure (`tests/metrics.cjs`) | v2.1 | v3 |
|---|---|---|
| Pièges tombés (corrections sûres fausses) | 16/16 | **0/16** |
| Cours réel : verbes posés depuis un intitulé | 38 | **0** |
| Cours réel : libellés-noms | 42 | **0** |
| Cours réel : corrections sûres / probables / signalements | 35 / 5 / 7 | 36 / 1 / 6* |
| Cours réel : violations d'intégrité nouvelles, second audit, texte modifié | 0 / 0 / 0 | 0 / 0 / 0 |
| Cours réel : relations de contenu nommées après correction | 50 % | 37 % |
| Audit d'une carte de 2 000 nœuds | 3,6 s | **0,36 s** |

\* Signalements avec le contexte du cours (comme dans l'éditeur) : 4 prérequis définis plus loin, 1 libellé vague (« concerne »), 1 lien vers un intitulé. Sans ce contexte (`tests/metrics.cjs`) : 2.

Lecture honnête du taux de relations nommées :
- **Il baisse.** Les verbes faux posés depuis les intitulés ne sont plus comptés comme des relations, et les libellés-noms ont disparu.
- **Le taux restant est fait de verbes vrais.** Relu à la main sur le cours réel : aucune des 36 corrections sûres n'est fausse, quelques-unes sont discutables (par exemple « résolu par » quand la note parle plutôt d'une manière de réagir). Ce jugement manuel couvre un seul cours, hors droit.

## Limites

- Le moteur ne lit que la carte, jamais la source : il ne découvre pas une relation que la carte ne contient pas.
- L'analyse du texte est lexicale. La garde de négation et l'homonymie sont gérées par motifs, pas par compréhension.
- Les résultats en droit reposent sur des cas synthétiques : il faudrait un cours de droit réel produit avec le skill v2.2 pour les confirmer.
- Le schéma n'a ni statut d'incertitude sur un lien, ni lien entre cartes, ni ordre explicite. Voir les pistes 12, 24 et 25.
