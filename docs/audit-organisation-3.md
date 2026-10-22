# Organisation V4 — intelligence structurelle et sémantique du graphe

Audit multi-agent, inventaire, décisions, mesures avant/après. Version de l'app : 3.7.0.
Ce document distingue ce qui est **implémenté et mesuré** de ce qui est **hypothèse ou reporté**.

## 1. Défauts constatés (v3)

| # | Défaut | Preuve |
|---|---|---|
| D1 | Le moteur ne lisait pas les **phrases** des notes : une relation dite (« car », « sauf si », « ce qui entretient… ») restait invisible | jeu gold, mode sûr : rappel gagné **5/26 (19 %)** ; jeu de contrôle indépendant : **2/18 (11 %)** |
| D2 | Négation trop large : « non », « sans » nus faisaient passer 23 % des phrases pour négatives et bloquaient 50 titres (« Ne pas savoir dire non ») | agent B, sur le cours réel |
| D3 | Rôle d'un nœud figé par son type : un maillon de chaîne (effet de l'un, cause du suivant) déclenchait un « conflit de types » | G23 (cercle vicieux) |
| D4 | Libellés posés AVANT les rattachements : un libellé figeait une mauvaise place | agent A |
| D5 | Exemples, séries d'étapes, exceptions, conditions laissés sous la section au lieu de l'élément qu'ils servent (« les 4 paliers ») | agent A : ~27 défauts réparables sur le cours réel, ~12 décidables |
| D6 | Personne citée jamais reliée ; doublons frères jamais fusionnés ; « Exemple : … » jamais retypé ; décomposition mal câblée jamais recâblée | gold G28, G45, G46, agent A |
| D7 | Rien n'était appliqué sans clic, même l'établi ; refus perdus d'une session à l'autre | v3 : tout passait par le dialogue |
| D8 | Skill : 40 relations textuelles sur 3 chapitres → 7,5 % codées, 75 % absentes ou aplaties ; validateur « OK » à 0 libellé ; 173 Ko, contradictions (budget 0–4 / 2–6 / n/5, racine 3–6 / 3–7) | agent C |
| D9 | Renvois 100 % orthogonaux (« \|___ ») : pénalité courbe +120, test de collision courbe sur 24 points | agent D |
| D10 | Libellés barrés par d'autres liens (11/13 et 9/12 sur les cartes denses), marges 3 px, libellé de fourche posé sur la jonction (sur le nœud source) | agent E |
| D11 | Rendu dépendant de l'ordre des arêtes dans le fichier | agent F (`perm` NON sur 5 cartes) |

## 2. Agents et contributions

| Agent | Rôle | Apport principal |
|---|---|---|
| A — structure | audit du cours réel « Arrêtez d'être gentil » | 27 défauts réparables, familles de preuves STRUCT / TEXTE / VERBE / RÔLE / RÉSUMÉ, veto, égalité → suspension, structure avant libellés, journal et refus au niveau carte |
| B — sémantique | relations dans les notes | 85 % des relations non exprimées dans les notes ; faille de la négation ; marqueurs explicites 10/10 justes ; rôle par arête |
| C — skill | 3 chapitres, validateur | 7,5 % de relations codées ; proposition P3 « carte de compréhension », P3c, P6a, ordre rôle → place → type → note → libellé, gabarits |
| D — routage | prototype multi-stratégies | béziers à point de passage, test exact, pénalité orthogonale, hystérésis, départage déterministe |
| E — libellés | détecteur navigateur `__labelAudit` | segments étrangers comme obstacles, marges en em, zones d'exclusion, jonction ≥ w/2 + 0,5 em, conflits signalés |
| F — tests | jeu gold (47 cartes) + jeu visuel (8 cartes) | indicateurs : rappel, rappel gagné, faux positifs, cartes gelées, abstentions, stabilité, oscillation, intégrité, texte |
| G — contrôle | 30 cartes inédites (H01–H30) écrites **sans lire le moteur** | mesure honnête de la généralisation |
| H — skill v3 | réécriture du skill | v3.0, banc `tests/skill-bench.cjs` |

## 3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut

Gain / coût / risque : faible · moyen · fort. Statut : **fait** (implémenté et testé), **partiel**, **reporté**, **écarté**.

| # | Piste | Gain | Coût | Risque | Statut |
|---|---|---|---|---|---|
| 1 | Lecture des phrases : connecteur orienté + mention exacte + position sujet/objet (`phraseRelations`) | fort | moyen | moyen | **fait** |
| 2 | Négation lue titre masqué ; « non », « sans » nus retirés | fort | faible | faible | **fait** |
| 3 | Contre-signaux : question, hypothèse (« si l'on croit », idée reçue), débat (signalé), citation (`>` et « … »), réserve (→ probable) | fort | faible | faible | **fait** |
| 4 | Énumération de sujets (« A, B et C favorisent X ») | moyen | faible | faible | **fait** |
| 5 | Relative « ce qui… » : sujet = objet de la proposition précédente | moyen | faible | faible | **fait** |
| 6 | Rôle par relation : maillon de chaîne sans conflit de types ; conseil sous un piège → « résolu par » | moyen | faible | faible | **fait** |
| 7 | Audit en phases : identité → structure → branches et libellés sur la carte corrigée | fort | moyen | moyen | **fait** |
| 8 | Rattachements dits par le texte (exemple → ce qu'il illustre ; exception → règle ; condition → ce qu'elle permet ; parties « du neurone ») | fort | moyen | moyen | **fait** |
| 9 | Cardinalité : exemple « les 4 paliers » → l'élément qui en annonce et en compte 4 | moyen | faible | faible | **fait** |
| 10 | Série annoncée posée à côté (« en 3 étapes » + 3 étapes contiguës) → sous la méthode | moyen | faible | moyen | **fait** (sûr seulement si le nom concorde) |
| 11 | Retypage déclaré par le titre (« Exemple : … ») | faible | faible | faible | **fait** |
| 12 | Fusion de doublons frères (même titre, type, parent) ; ailleurs : signalement | moyen | moyen | moyen | **fait** |
| 13 | Recâblage d'une décomposition selon la phrase source | moyen | faible | faible | **fait** |
| 14 | Personne citée (« selon Freud ») reliée | faible | faible | faible | **fait** |
| 15 | Renvoi « comprend » vers un élément du plan → hiérarchie (probable) | faible | faible | moyen | **fait** |
| 16 | Application automatique des corrections établies au rangement, une à une, vérifiées (intégrité, effet, texte), journal `organizeLog`, refus persistants `organizeDeclined`, Annuler = refus | fort | moyen | moyen | **fait** |
| 17 | Budget de renvois : relation explicite jusqu'au double du budget | moyen | faible | faible | **fait** |
| 18 | Skill v3 : carte de compréhension, P3c, P6a, ordre fixe, gabarits règle/mécanisme/raisonnement/distinction, exemple hors droit, validateur d'aplatissement | fort | moyen | faible | **fait** (agent H) |
| 19 | Routeur : courbes, courbes à point de passage, contournement, orthogonal, notés sur les mêmes critères mesurés | fort | moyen | moyen | **fait** |
| 20 | Test de collision exact (segment / rectangle, Liang–Barsky) + index spatial des nœuds | moyen | faible | faible | **fait** |
| 21 | Chevauchement de traits (grille de points) et croisements (grille de segments) | moyen | moyen | faible | **fait** |
| 22 | Stabilité : le tracé précédent concourt tel quel (bonus 450), rendu indépendant de l'ordre des arêtes, cache quand la géométrie n'a pas bougé | moyen | faible | faible | **fait** |
| 23 | Libellés : segments étrangers comme obstacles, marges (6 / 5 / 4 px), pointe de flèche et jonctions exclues, reprise des conflits en fin de rendu, `.clash` | fort | moyen | faible | **fait** |
| 24 | Jonction de fourche à ≥ demi-largeur du libellé + 0,5 em de la source | faible | faible | faible | **fait** |
| 25 | Mesure DOM du libellé avant le choix du trajet ; estimation recalibrée (5,6 px/car + 18) | faible | faible | faible | **fait** |
| 26 | Doublons et contraires entre cartes d'un même cours (signalement) | moyen | moyen | moyen | **reporté** |
| 27 | Similarité sémantique (synonymes, paraphrase : « Révolution » / « 1789 ») | moyen | fort | fort | **reporté** (G16, G17 manqués) |
| 28 | Placement des libellés en lot « le plus contraint d'abord » | faible | moyen | faible | **partiel** (reprise des conflits seulement) |
| 29 | Routage de la note de disposition avec le nouveau routeur | faible | fort | moyen | **écarté** : la disposition est comparée avec le routeur orthogonal (rapide, prévisible), le tracé définitif est choisi au rendu |
| 30 | Fusion automatique entre sections ; scores continus | — | — | fort | **écarté** (homonymes ; scores non fondés) |

## 4. Changements

### Moteur (`js/organize.js`)
- Chaîne de décision : détecter → contexte → candidats → comparer (familles de preuves, contre-signaux) → choisir (sûr / probable / signalé) → appliquer (éditeur) → vérifier (`applyVerified`) → tracer (`organizeLog`).
- `phraseRelations` / `phrases` (connecteurs : cause, inhibition, limite, condition, exception, exemple, opposition, source, usage, succession), `persons`, `retypes`, `merges` + `mergeNodes`, `rewire`, `linkToTree`, `applications`, cardinalité dans `examples`, rôle « résolu par » dans `labels`, exemple sous une définition indécomposable.
- `audit()` en trois phases ; décisions d'identité appliquées sur une copie avant la structure ; branches et libellés sur la carte après la structure sûre.
- Jamais : supprimer un lien parce qu'il ressemble à un doublon ou ferme une boucle ; réécrire un texte ; trancher un débat.

### Éditeur, store
- Ranger applique les corrections établies (réglage *Corriger l'organisation en rangeant*, actif par défaut), une étape d'annulation avec le rangement, snackbar « Rangé · N corrections » → *Voir* ; dialogue : section « Déjà appliqué au rangement ».
- `map.organizeLog` (≤ 60) et `map.organizeDeclined` (≤ 200) conservés par `sanitize` (import / export).

### Skill v3.0 (`skills/pioneer-livre-vers-cours`)
Voir le rapport de l'agent H résumé dans le README : carte de compréhension obligatoire (U / R / A / X), passe transversale, ordre fixe, gabarits, notes lisibles par le moteur, audit interne compté, validateur (relation aplatie, taux de relations, 0 libellé = erreur), 108,7 Ko (contre 173).

*v3.1 : fichier renommé `pioneer_book_to_course_compiler_v3.1.json` ; 20 types de nœuds, les 23 types supprimés deviennent idee/notion + libellé (`node_types.relations_as_labels`), arête relationnelle sans libellé signalée.*

*v4.0 : fichier renommé `pioneer_book_to_course_compiler_v4.0.json` ; le cours suit son plan réel (dossiers partie/titre/sous-titre/chapitre, une carte par section) et chaque niveau a sa carte du plan (`role: "plan"`, liens hiérarchiques et de renvoi libellés, nœuds `ref` vers dossiers et cartes). Exemple : `exemple-cours-en-dossiers.json`.*

### Routage et libellés (`js/layout.js`, `js/views/editor.js`)
- `route()` : candidats courbes / déviées / contournement / orthogonal ; élagage (note grossière de tous, note exacte des 10 meilleurs + précédent + orthogonal) ; A* seulement si un nœud est traversé ou deux croisements subsistent.
- `placeLabel()` : marges, segments étrangers, exclusions, `clash` ; l'éditeur reprend les conflits en fin de rendu et les marque.

## 5. Tests et résultats

| Mesure | v3 | V4 |
|---|---|---|
| Gold (47 cartes), mode sûr : rappel gagné | 5/26 (19 %) | **26/26 (100 %)** — *jeu vu pendant la mise au point* |
| Gold : faux positifs / cartes gelées modifiées / abstentions violées | 3 / 0 / 2 | **0 / 0 / 0** |
| **Contrôle indépendant** (30 cartes jamais vues), mode sûr : rappel | 2/18 (11 %) | **14/18 (78 %) à la première mesure**, 15/18 (83 %) après deux corrections génériques (infinitifs, nom de famille) |
| Contrôle : faux positifs / gelées / abstentions violées | 0 / 0 / 0 | **0 / 0 / 0** |
| Pièges (`tests/metrics.cjs`) | 0/16 | 0/16 |
| Tests unitaires | 33 | 33 + **26 V4** (`tests/organize-v4.test.cjs`) |
| Banc du skill | — | 11/11 |
| Audit d'une carte de 1 001 nœuds | — | ≈ 0,3 s |
| Navigateur V4 (`v4ui`, bureau + mobile) | — | 21/21 : car appliqué, exception rangée, négation ignorée, journal, Annuler = refus persistant, aucun libellé caché, 0 erreur console |

Jeu visuel (`tests/visual/checkvis.cjs`, même ordre de rendu que l'éditeur) :

| Carte | croisements | traits superposés | libellés barrés | libellés sur nœud | courbes |
|---|---|---|---|---|---|
| v2 renvois proches | 5 → 4 | 0 → 0 | 3 → 2 | 0 → 0 | 0/7 → 5/7 |
| v3 libellés variés | 0 → 0 | 0 → 0 | 2 → 0 | 0 → 0 | 0/8 → 8/8 |
| v6 zone dense | 22 → 17 | 8 → 11 | 9 → 3 | 1 → 0 | 0/12 → 1/12 |
| v7 zone dense déplacée | 25 → 19 | 6 → 9 | 7 → 5 | 0 → 0 | 0/12 → 2/12 |
| v8 grande carte (169 nœuds, renvois de 7 000 px) | 0 → 22 | 87 → 33 | 20 → 12 | 0 → 0 | 0/20 → 12/20 |

Stabilité v6 → v7 : tracés précédents encore nets gardés **4/4**. Détecteur navigateur (agent E, 6 cartes) : libellés barrés 21 → 13, trop proches 2 → 0, sur un nœud 3 → 4 (le nouveau : un libellé « sauf » touche son nœud d'1 px sur un renvoi de 28 px, marqué en conflit).

## 6. Limites et reporté (honnêteté)
- Le jeu gold a servi à la mise au point : son 100 % n'est **pas** une mesure de généralisation ; c'est le jeu de contrôle qui l'est (78 % puis 83 %). H02 (dernier élément d'une énumération « à cause de ») et H06 (« de l'œil » : titre de 3 lettres) restent manqués.
- 85 % des relations du cours réel ne sont pas écrites dans les notes : le moteur ne les invente pas ; c'est au skill v3 de les écrire.
- Routage : moins de traits superposés et de libellés barrés, mais **plus de croisements sur v8** (22 contre 0 : l'orthogonal évitait les croisements en superposant 87 paires de traits) et rendu plus lent (≈ 0,55 s contre 0,35 s pour 20 renvois de 7 000 px ; mis en cache tant que rien ne bouge). Le rangement de v8 reste lent (≈ 80 s, 107 s en v3) : défaut antérieur de l'optimiseur de disposition.
- Similarité sémantique, doublons entre cartes, placement en lot : reportés.
