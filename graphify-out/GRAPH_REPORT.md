# Graph Report - Mindmap-apk  (2026-10-22)

## Corpus Check
- 58 files · ~256,648 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: .css 6, (none) 1, .webmanifest 1)

## Summary
- 884 nodes · 2021 edges · 56 communities (45 shown, 11 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 169 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `220af020`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- render
- changed
- layout.js
- organize.js
- ui
- app.js
- U
- colors.js
- mount
- eval.cjs
- skill-bench.cjs
- syncCoverage
- metrics.cjs
- organize.test.cjs
- Inventaire
- markdown.js
- paint
- 4. Système de design (Material Design 3)
- skill-rules.cjs
- organize-v4.test.cjs
- gen.cjs
- revhub.js
- Utilisation
- folders.test.cjs
- Ratio — Dossier de conception
- mark.js
- Ratio — cartes mentales pour le droit
- 3. Architecture de l'information
- library.js
- 5. Motion design
- render
- 6. Composition par écran
- course.js
- exercises.test.cjs
- sw.js
- Mindmap-apk
- carnet.js
- quota-router
- quota-router.sh
- Editor
- store.js
- mapsOf
- renderBottomBar
- onKey
- mutate
- paneNode
- childrenOf
- fit
- fonts.js

## God Nodes (most connected - your core abstractions)
1. `Editor()` - 159 edges
2. `render()` - 38 edges
3. `mutate()` - 29 edges
4. `onKey()` - 29 edges
5. `paneNode()` - 27 edges
6. `select()` - 25 edges
7. `renderBottomBar()` - 25 edges
8. `U` - 24 edges
9. `mount()` - 24 edges
10. `audit()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Éditeur, store` --references--> `sanitize()`  [INFERRED]
  docs/audit-organisation-3.md → js/store.js
- `4.4 Types de nœuds — trois apparences (v4.1)` --references--> `h()`  [INFERRED]
  DESIGN.md → js/carnet.js
- `3. Style par nœud (données)` --references--> `h()`  [INFERRED]
  docs/plan-refonte-cartes.md → js/carnet.js
- `Routage et libellés (`js/layout.js`, `js/views/editor.js`)` --references--> `route()`  [INFERRED]
  docs/audit-organisation-3.md → js/layout.js
- `Routage et libellés (`js/layout.js`, `js/views/editor.js`)` --references--> `placeLabel()`  [INFERRED]
  docs/audit-organisation-3.md → js/layout.js

## Import Cycles
- None detected.

## Communities (56 total, 11 thin omitted)

### Community 0 - "render"
Cohesion: 0.12
Nodes (37): addFree(), applyReadOnly(), auditNow(), autoOrganize(), chooseLayout(), customLabels(), declineKeys(), deleteSilently() (+29 more)

### Community 1 - "changed"
Cohesion: 0.13
Nodes (25): addCourse(), addFolder(), addMap(), applyImport(), changed(), course(), deleteFolder(), deleteMap() (+17 more)

### Community 2 - "layout.js"
Cohesion: 0.06
Nodes (67): 4.4 Types de nœuds — trois apparences (v4.1), Historique : différenciation monochrome par type (jusqu'à v4.0), 10. Autour, 1. Trois apparences, 2. Nouveau type `paragraphe`, 3. Style par nœud (données), 4. Couleur, 5. Typographie (+59 more)

### Community 3 - "organize.js"
Cohesion: 0.11
Nodes (39): 1. Défauts constatés (v3), 2. Agents et contributions, 3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut, 4. Changements, 5. Tests et résultats, 6. Limites et reporté (honnêteté), Moteur (`js/organize.js`), Organisation V4 — intelligence structurelle et sémantique du graphe (+31 more)

### Community 4 - "ui"
Cohesion: 0.06
Nodes (37): add(), centerOn(), close(), dismiss(), filter(), get(), hideTip(), motion (+29 more)

### Community 5 - "app.js"
Cohesion: 0.14
Nodes (27): applyMotion(), applyNoteTypo(), applyTheme(), buildNav(), centerAction(), app, logo(), luxCount() (+19 more)

### Community 7 - "colors.js"
Cohesion: 0.25
Nodes (19): apply(), closePairs(), contrast(), css(), currentTheme(), derive(), distance(), ensureContrast() (+11 more)

### Community 8 - "mount"
Cohesion: 0.20
Nodes (26): hintFor(), mount(), advance(), build(), choose(), commit(), correct(), current() (+18 more)

### Community 9 - "eval.cjs"
Cohesion: 0.17
Nodes (17): applyPass(), asserts(), build(), clone(), FAM, fams(), GOLD, hasPrefix() (+9 more)

### Community 10 - "skill-bench.cjs"
Cohesion: 0.10
Nodes (12): dir, { execFileSync }, file, folderText, fs, os, path, raw (+4 more)

### Community 11 - "syncCoverage"
Cohesion: 0.40
Nodes (4): exercisesFor(), rate(), syncCoverage(), unrate()

### Community 12 - "metrics.cjs"
Cohesion: 0.19
Nodes (14): applySure(), fall, files, fs, heading(), indicators(), measure(), n0() (+6 more)

### Community 13 - "organize.test.cjs"
Cohesion: 0.12
Nodes (15): applyAll(), ctx, files, fixesOf(), fs, path, root, vm (+7 more)

### Community 14 - "Inventaire"
Cohesion: 0.17
Nodes (11): A. Qualité des relations, Audit de l'organisation des cartes — deuxième génération, B. Organisation des sous-graphes, C. Décomposition modulaire, Constat principal, D. Révision, E. Contrôle, paramètres, mesure, Inventaire (+3 more)

### Community 15 - "markdown.js"
Cohesion: 0.30
Nodes (8): cells(), inline(), legifrance(), parseList(), readTable(), render(), tableHtml(), tables()

### Community 16 - "paint"
Cohesion: 0.30
Nodes (11): articleRef(), byMap(), highlight(), open(), finish(), group(), paint(), paintScopes() (+3 more)

### Community 17 - "4. Système de design (Material Design 3)"
Cohesion: 0.18
Nodes (11): 4.0 Règle permanente — pas de surlignage de contour, 4.1 Couleur — Material 3 Expressive, rôles tonals, 4.2 Typographie — échelle M3 Expressive, 4.3 bis Navigation et actions — rail, dock, barre contextuelle, 4.3 Grille, forme, mouvement des composants, 4.4 bis Couleurs des nœuds (option), 4.4 ter Relations d'abord, définitions modulaires, 4.5 Classes de fenêtre M3 → composition (+3 more)

### Community 18 - "skill-rules.cjs"
Cohesion: 0.36
Nodes (8): compare(), dir, expected(), fs, path, skillFile(), validatorLine(), write()

### Community 19 - "organize-v4.test.cjs"
Cohesion: 0.20
Nodes (3): edge(), ABSTAIN, { S, O, makeMap, applyAll, edge }

### Community 20 - "gen.cjs"
Cohesion: 0.27
Nodes (7): Dans une carte, dense(), fs, L(), N(), path, T()

### Community 21 - "revhub.js"
Cohesion: 0.44
Nodes (8): courseRow(), dayDeck(), forecastCard(), loyaltyCard(), masteryRing(), mount(), sessionHref(), weakList()

### Community 22 - "Utilisation"
Cohesion: 0.20
Nodes (10): Apprendre un chapitre entier, Couleurs des nœuds (option), Lecture seule, Notes (Markdown), Personnaliser une carte (v4.1), Ranger une carte (disposition), Révision, Sauvegarder, importer, partager (+2 more)

### Community 23 - "folders.test.cjs"
Cohesion: 0.29
Nodes (4): course(), node(), { S, win }, win

### Community 24 - "Ratio — Dossier de conception"
Cohesion: 0.25
Nodes (8): 1. Le besoin (Lean UX), 2. Inventaire de contenu, 7. Lois de l'UX appliquées, 8. Modèle Hooked (Nir Eyal), Hypothèses (format Lean UX), MVP — ce qui est livré, Problème, Ratio — Dossier de conception

### Community 25 - "mark.js"
Cohesion: 0.43
Nodes (6): dot(), hueFor(), mark(), paper(), tint(), vars()

### Community 26 - "Ratio — cartes mentales pour le droit"
Cohesion: 0.29
Nodes (5): Installer sur Android, Lancer, Mettre en ligne (GitHub Pages), Ratio — cartes mentales pour le droit, Structure

### Community 27 - "3. Architecture de l'information"
Cohesion: 0.29
Nodes (7): 3.1 Systèmes d'organisation, 3.2 Système d'étiquetage, 3.3 bis Vue Plan — lire un plan long sans perdre le fil, 3.3 Systèmes de navigation, 3.4 Système de recherche, 3.5 Plan du site (routes), 3. Architecture de l'information

### Community 28 - "library.js"
Cohesion: 0.46
Nodes (7): courseCard(), foldGestures(), mount(), reviewBtn(), sessionHero(), tipCard(), untilLabel()

### Community 29 - "5. Motion design"
Cohesion: 0.33
Nodes (6): 5.1 Diagnostic, 5.2 Tokens (un seul système, CSS et JS), 5.3 Spécification, 5.4 Performance, 5.5 Accessibilité, 5. Motion design

### Community 30 - "render"
Cohesion: 0.80
Nodes (5): logicText(), markdown(), relations(), render(), tree()

### Community 31 - "6. Composition par écran"
Cohesion: 0.50
Nodes (4): 6. Composition par écran, Desktop (large / extra-large), Mobile (compact, Android), Tablette (medium / expanded)

### Community 32 - "course.js"
Cohesion: 0.22
Nodes (17): contentsText(), countUp(), folderBlock(), levelBlocks(), mapCard(), mount(), notFound(), numeral() (+9 more)

### Community 33 - "exercises.test.cjs"
Cohesion: 0.25
Nodes (4): course(), EX, node(), { S }

### Community 39 - "Mindmap-apk"
Cohesion: 0.50
Nodes (3): Graphify, Mindmap-apk, Quota

### Community 40 - "carnet.js"
Cohesion: 0.11
Nodes (34): Carnet(), carve(), close(), cutAt(), draw(), fit(), flag(), _flipCover() (+26 more)

### Community 41 - "quota-router"
Cohesion: 0.22
Nodes (8): 1. Caveman (toujours), 2. Graphify avant toute lecture de code, 3. Routage du modèle (tri à chaque requête), 4. Effort et réflexion, 5. Hygiène du contexte, 6. Garde-fous coûteux, 7. Suivi hebdomadaire (rappels à l'utilisateur, une ligne max, rarement), quota-router

### Community 46 - "Editor"
Cohesion: 0.10
Nodes (38): Editor(), anchorOf(), anchors(), applyStyle(), bez(), branchCurve(), bundleGeometry(), bundleLabel() (+30 more)

### Community 47 - "store.js"
Cohesion: 0.11
Nodes (17): blank(), cleanEdgeStyle(), cleanNodeStyle(), courseActivity(), coursesSorted(), emit(), folderPath(), load() (+9 more)

### Community 48 - "mapsOf"
Cohesion: 0.13
Nodes (23): branchStats(), canTree(), courseStats(), deleteCourse(), descendants(), dueCount(), exportCourse(), folderStats() (+15 more)

### Community 49 - "renderBottomBar"
Cohesion: 0.24
Nodes (22): addChild(), addSibling(), ctxItems(), deleteNodes(), duplicateBranch(), paint(), guard(), logicMenu() (+14 more)

### Community 50 - "onKey"
Cohesion: 0.25
Nodes (18): addFreeCenter(), applyPaneState(), buildVToolbar(), centerOn(), closePane(), closePaneIfOverlay(), ensureVisible(), isPaneShown() (+10 more)

### Community 51 - "mutate"
Cohesion: 0.25
Nodes (17): addBranches(), connect(), createFork(), deleteEdge(), deleteFork(), detachBranch(), edgeItems(), edgeMenuItems() (+9 more)

### Community 52 - "paneNode"
Cohesion: 0.20
Nodes (14): addSource(), continueList(), dueLabel(), editTable(), fireInput(), fmtBtn(), indentLine(), paneNode() (+6 more)

### Community 54 - "childrenOf"
Cohesion: 0.14
Nodes (18): ancestors(), childrenOf(), isComponent(), isReviewable(), kickerOf(), node(), parentEdge(), parentOf() (+10 more)

### Community 56 - "fit"
Cohesion: 0.27
Nodes (13): animateView(), applyView(), autoPan(), bbox(), buildBar(), fit(), initialView(), onDragStart() (+5 more)

## Knowledge Gaps
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `onDown()` connect `render` to `ui`, `Editor`, `renderBottomBar`, `mutate`, `fit`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Editor()` (e.g. with `onCancel()` and `onContext()`) actually correct?**
  _`Editor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `render` be split into smaller, more focused modules?**
  _Cohesion score 0.11740890688259109 - nodes in this community are weakly interconnected._
- **Why does `sample()` connect `layout.js` to `ui`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `onKey()` (e.g. with `Editor()` and `.unmount()`) actually correct?**
  _`onKey()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `changed` be split into smaller, more focused modules?**
  _Cohesion score 0.12666666666666668 - nodes in this community are weakly interconnected._
- **Should `layout.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06418219461697723 - nodes in this community are weakly interconnected._