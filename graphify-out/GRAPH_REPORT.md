# Graph Report - Mindmap-apk  (2026-10-27)

## Corpus Check
- 62 files · ~287,199 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .css 8, (none) 1, .webmanifest 1)

## Summary
- 957 nodes · 2176 edges · 54 communities (42 shown, 12 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 195 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `567f945d`
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
- leitner.js
- metrics.cjs
- organize.test.cjs
- harness.cjs
- markdown.js
- paint
- 4. Système de design (Material Design 3)
- gen.cjs
- prefixOf
- revhub.js
- Utilisation
- folders.test.cjs
- checkvis.cjs
- mark.js
- Refonte des cartes — plan (v4.1)
- binder.js
- render
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
- skill-rules.cjs
- childrenOf
- fit
- fonts.js

## God Nodes (most connected - your core abstractions)
1. `Editor()` - 161 edges
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
- `3. Style par nœud (données)` --references--> `calm()`  [INFERRED]
  docs/plan-refonte-cartes.md → js/layout.js
- `3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut` --references--> `phraseRelations()`  [INFERRED]
  docs/audit-organisation-3.md → js/organize.js

## Import Cycles
- None detected.

## Communities (54 total, 12 thin omitted)

### Community 0 - "render"
Cohesion: 0.14
Nodes (39): addFree(), applyReadOnly(), auditNow(), autoOrganize(), declineKeys(), deleteSilently(), flushEdit(), hintOrganize() (+31 more)

### Community 1 - "changed"
Cohesion: 0.11
Nodes (27): addCourse(), addFolder(), addMap(), applyImport(), changed(), course(), deleteCourse(), deleteFolder() (+19 more)

### Community 2 - "layout.js"
Cohesion: 0.08
Nodes (61): 4.4 Types de nœuds — trois apparences (v4.1), Historique : différenciation monochrome par type (jusqu'à v4.0), Routage et libellés (`js/layout.js`, `js/views/editor.js`), aerate(), anchorPoint(), arrange(), bbox(), buildTree() (+53 more)

### Community 3 - "organize.js"
Cohesion: 0.07
Nodes (49): A. Qualité des relations, Audit de l'organisation des cartes — deuxième génération, B. Organisation des sous-graphes, C. Décomposition modulaire, Constat principal, D. Révision, E. Contrôle, paramètres, mesure, Inventaire (+41 more)

### Community 4 - "ui"
Cohesion: 0.09
Nodes (19): add(), centerOn(), close(), dismiss(), filter(), get(), hideTip(), motion (+11 more)

### Community 5 - "app.js"
Cohesion: 0.13
Nodes (29): 4.x Marque Pioneer (logo), applyMotion(), applyNoteTypo(), applyTheme(), buildNav(), centerAction(), app, logo() (+21 more)

### Community 7 - "colors.js"
Cohesion: 0.25
Nodes (19): apply(), closePairs(), contrast(), css(), currentTheme(), derive(), distance(), ensureContrast() (+11 more)

### Community 8 - "mount"
Cohesion: 0.18
Nodes (29): hintFor(), mount(), advance(), build(), choose(), commit(), correct(), current() (+21 more)

### Community 9 - "eval.cjs"
Cohesion: 0.17
Nodes (17): applyPass(), asserts(), build(), clone(), FAM, fams(), GOLD, hasPrefix() (+9 more)

### Community 10 - "skill-bench.cjs"
Cohesion: 0.10
Nodes (12): dir, { execFileSync }, file, folderText, fs, os, path, raw (+4 more)

### Community 11 - "leitner.js"
Cohesion: 0.14
Nodes (26): bounds(), center(), fold(), frame(), kick(), measure(), openReview(), orbitEnd() (+18 more)

### Community 12 - "metrics.cjs"
Cohesion: 0.19
Nodes (14): applySure(), fall, files, fs, heading(), indicators(), measure(), n0() (+6 more)

### Community 13 - "organize.test.cjs"
Cohesion: 0.18
Nodes (8): fixesOf(), fs, path, { S, O, makeMap, fixesOf, applyAll, edge }, skill, skillPath, sure(), test()

### Community 14 - "harness.cjs"
Cohesion: 0.12
Nodes (10): applyAll(), ctx, edge(), files, fs, path, root, vm (+2 more)

### Community 15 - "markdown.js"
Cohesion: 0.30
Nodes (8): cells(), inline(), legifrance(), parseList(), readTable(), render(), tableHtml(), tables()

### Community 16 - "paint"
Cohesion: 0.30
Nodes (11): articleRef(), byMap(), highlight(), open(), finish(), group(), paint(), paintScopes() (+3 more)

### Community 17 - "4. Système de design (Material Design 3)"
Cohesion: 0.11
Nodes (22): 4.0 Règle permanente — pas de surlignage de contour, 4.1 Couleur — Material 3 Expressive, rôles tonals, 4.2 Typographie — échelle M3 Expressive, 4.3 bis Navigation et actions — rail, dock, barre contextuelle, 4.3 Grille, forme, mouvement des composants, 4.4 bis Couleurs des nœuds (option), 4.4 ter Relations d'abord, définitions modulaires, 4.5 Classes de fenêtre M3 → composition (+14 more)

### Community 18 - "gen.cjs"
Cohesion: 0.31
Nodes (6): dense(), fs, L(), N(), path, T()

### Community 20 - "prefixOf"
Cohesion: 0.22
Nodes (9): isCentre(), kickerOf(), prefixOf(), roman(), roots(), structIndex(), structNumbers(), styleOf() (+1 more)

### Community 21 - "revhub.js"
Cohesion: 0.44
Nodes (8): courseRow(), dayDeck(), forecastCard(), loyaltyCard(), masteryRing(), mount(), sessionHref(), weakList()

### Community 22 - "Utilisation"
Cohesion: 0.05
Nodes (41): 1. Le besoin (Lean UX), 2. Inventaire de contenu, 3.1 Systèmes d'organisation, 3.2 Système d'étiquetage, 3.3 bis Vue Plan — lire un plan long sans perdre le fil, 3.3 Systèmes de navigation, 3.4 Système de recherche, 3.5 Plan du site (routes) (+33 more)

### Community 23 - "folders.test.cjs"
Cohesion: 0.29
Nodes (4): course(), node(), { S, win }, win

### Community 24 - "checkvis.cjs"
Cohesion: 0.16
Nodes (18): crosses(), ctx, files, fs, inRect(), measure(), ov(), overlapLen() (+10 more)

### Community 25 - "mark.js"
Cohesion: 0.43
Nodes (6): dot(), hueFor(), mark(), paper(), tint(), vars()

### Community 26 - "Refonte des cartes — plan (v4.1)"
Cohesion: 0.15
Nodes (12): 10. Autour, 1. Trois apparences, 2. Nouveau type `paragraphe`, 3. Style par nœud (données), 4. Couleur, 5. Typographie, 6. Liens, 7. Peigne → stabilisateur (+4 more)

### Community 27 - "binder.js"
Cohesion: 0.20
Nodes (14): binder(), defs(), divider(), el(), enter(), finish(), zoom(), norm() (+6 more)

### Community 29 - "render"
Cohesion: 0.80
Nodes (5): logicText(), markdown(), relations(), render(), tree()

### Community 32 - "course.js"
Cohesion: 0.21
Nodes (18): contentsText(), countUp(), folderBlock(), levelBlocks(), mapCard(), mount(), notFound(), numeral() (+10 more)

### Community 33 - "exercises.test.cjs"
Cohesion: 0.25
Nodes (4): course(), EX, node(), { S }

### Community 39 - "Mindmap-apk"
Cohesion: 0.50
Nodes (3): Graphify, Mindmap-apk, Quota

### Community 40 - "carnet.js"
Cohesion: 0.10
Nodes (38): Carnet(), carve(), close(), cutAt(), draw(), fit(), flag(), _flipCover() (+30 more)

### Community 41 - "quota-router"
Cohesion: 0.25
Nodes (7): 1. Toujours, 2. Paliers (indice Artificial Analysis · coût tokens), 3. Décider (dans cet ordre), 4. Délégation (Agent), 5. Hygiène du contexte, 6. Suivi hebdo, quota-router

### Community 46 - "Editor"
Cohesion: 0.11
Nodes (37): Editor(), anchorOf(), anchors(), applyStyle(), bez(), branchCurve(), bundleGeometry(), bundleLabel() (+29 more)

### Community 47 - "store.js"
Cohesion: 0.11
Nodes (17): blank(), cleanEdgeStyle(), cleanNodeStyle(), courseActivity(), coursesSorted(), emit(), folderPath(), load() (+9 more)

### Community 48 - "mapsOf"
Cohesion: 0.14
Nodes (23): branchStats(), canTree(), courseStats(), descendants(), dueCount(), folderStats(), foldersUnder(), forecast() (+15 more)

### Community 49 - "renderBottomBar"
Cohesion: 0.17
Nodes (24): addChild(), addSibling(), chooseLayout(), ctxItems(), defaultChildType(), deleteNodes(), duplicateBranch(), paint() (+16 more)

### Community 50 - "onKey"
Cohesion: 0.30
Nodes (13): applyPaneState(), centerOn(), closePane(), closePaneIfOverlay(), ensureVisible(), isPaneShown(), navigate(), onKey() (+5 more)

### Community 51 - "mutate"
Cohesion: 0.21
Nodes (19): addBranches(), connect(), createFork(), customLabels(), deleteEdge(), deleteFork(), detachBranch(), edgeItems() (+11 more)

### Community 52 - "paneNode"
Cohesion: 0.22
Nodes (13): addSource(), continueList(), dueLabel(), editTable(), fireInput(), fmtBtn(), indentLine(), paneNode() (+5 more)

### Community 53 - "skill-rules.cjs"
Cohesion: 0.36
Nodes (8): compare(), dir, expected(), fs, path, skillFile(), validatorLine(), write()

### Community 54 - "childrenOf"
Cohesion: 0.19
Nodes (13): ancestors(), childrenOf(), exercisesFor(), isComponent(), isReviewable(), node(), parentEdge(), parentOf() (+5 more)

### Community 56 - "fit"
Cohesion: 0.23
Nodes (16): addFreeCenter(), animateView(), applyView(), autoPan(), bbox(), buildBar(), buildVToolbar(), fit() (+8 more)

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `key()` connect `ui` to `checkvis.cjs`?**
  _High betweenness centrality (0.265) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Editor()` (e.g. with `onCancel()` and `onContext()`) actually correct?**
  _`Editor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `render` be split into smaller, more focused modules?**
  _Cohesion score 0.13765182186234817 - nodes in this community are weakly interconnected._
- **Why does `4. Système de design (Material Design 3)` connect `4. Système de design (Material Design 3)` to `layout.js`, `app.js`, `Utilisation`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `onKey()` (e.g. with `Editor()` and `.unmount()`) actually correct?**
  _`onKey()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `changed` be split into smaller, more focused modules?**
  _Cohesion score 0.11396011396011396 - nodes in this community are weakly interconnected._
- **Why does `4.4 Types de nœuds — trois apparences (v4.1)` connect `layout.js` to `carnet.js`, `4. Système de design (Material Design 3)`, `store.js`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._