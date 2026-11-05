# Graph Report - Mindmap-apk  (2026-11-05)

## Corpus Check
- 76 files · ~431,994 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: .css 8, (none) 2, .webmanifest 1)

## Summary
- 1089 nodes · 2608 edges · 65 communities (53 shown, 12 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 226 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1a2cdff5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- onUp
- changed
- layout.js
- organize.js
- ui
- app.js
- ref_fs
- colors.js
- mount
- eval.cjs
- skill-bench.cjs
- leitner.js
- metrics.cjs
- organize.test.cjs
- train.cjs
- Pioneer — Dossier de conception
- markdown.js
- unitsIn
- from_maps.cjs
- childrenOf
- relayout.test.cjs
- Utilisation
- folders.test.cjs
- checkvis.cjs
- U
- mutate
- binder.js
- 4. Système de design (Material Design 3)
- train_nn.py
- course.js
- exercises.test.cjs
- .dayKey
- sw.js
- Mindmap-apk
- carnet.js
- quota-router
- quota-router.sh
- .clamp
- .plural
- store.js
- mapsOf
- render
- onKey
- paneNode
- Editor
- skill-rules.cjs
- nodeMenu
- Pioneer — cartes mentales pour le droit
- 3. Architecture de l'information
- fonts.js
- 5. Motion design
- paint
- .clear
- mount
- mark.js
- 1. Le besoin (Lean UX)

## God Nodes (most connected - your core abstractions)
1. `Editor()` - 179 edges
2. `render()` - 39 edges
3. `mutate()` - 36 edges
4. `paneNode()` - 31 edges
5. `onKey()` - 30 edges
6. `renderBottomBar()` - 27 edges
7. `select()` - 26 edges
8. `U` - 24 edges
9. `mount()` - 24 edges
10. `size()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Éditeur, store` --references--> `sanitize()`  [INFERRED]
  docs/audit-organisation-3.md → js/store.js
- `2. Inventaire de contenu` --references--> `tree()`  [INFERRED]
  DESIGN.md → js/views/outline.js
- `4.4 Types de nœuds — trois apparences (v4.1)` --references--> `calm()`  [INFERRED]
  DESIGN.md → js/layout.js
- `3. Style par nœud (données)` --references--> `calm()`  [INFERRED]
  docs/plan-refonte-cartes.md → js/layout.js
- `3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut` --references--> `phraseRelations()`  [INFERRED]
  docs/audit-organisation-3.md → js/organize.js

## Import Cycles
- None detected.

## Communities (65 total, 12 thin omitted)

### Community 0 - "onUp"
Cohesion: 0.19
Nodes (17): auditNow(), autoOrganize(), flushEdit(), hintOrganize(), hitNode(), logicMenu(), onDown(), onTapBackground() (+9 more)

### Community 1 - "changed"
Cohesion: 0.15
Nodes (22): build(), addCourse(), addFolder(), addMap(), applyImport(), changed(), course(), deleteFolder() (+14 more)

### Community 2 - "layout.js"
Cohesion: 0.07
Nodes (71): Historique : différenciation monochrome par type (jusqu'à v4.0), Routage et libellés (`js/layout.js`, `js/views/editor.js`), aerate(), anchorPoint(), arrange(), bbox(), buildTree(), busDown() (+63 more)

### Community 3 - "organize.js"
Cohesion: 0.07
Nodes (49): A. Qualité des relations, Audit de l'organisation des cartes — deuxième génération, B. Organisation des sous-graphes, C. Décomposition modulaire, Constat principal, D. Révision, E. Contrôle, paramètres, mesure, Inventaire (+41 more)

### Community 4 - "ui"
Cohesion: 0.09
Nodes (20): add(), centerOn(), close(), dismiss(), filter(), get(), hideTip(), motion (+12 more)

### Community 5 - "app.js"
Cohesion: 0.16
Nodes (21): 4.x Marque Pioneer (logo), applyMotion(), applyNoteTypo(), applyTheme(), buildNav(), centerAction(), app, logo() (+13 more)

### Community 6 - "ref_fs"
Cohesion: 0.31
Nodes (6): dense(), fs, L(), N(), path, T()

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
Cohesion: 0.09
Nodes (18): applyAll(), ctx, edge(), files, fixesOf(), fs, path, root (+10 more)

### Community 14 - "train.cjs"
Cohesion: 0.06
Nodes (40): after, before, bySrc, clone(), corpus, ctr(), cur, degrade() (+32 more)

### Community 15 - "Pioneer — Dossier de conception"
Cohesion: 0.25
Nodes (8): 2. Inventaire de contenu, 6. Composition par écran, 7. Lois de l'UX appliquées, 8. Modèle Hooked (Nir Eyal), Desktop (large / extra-large), Mobile (compact, Android), Pioneer — Dossier de conception, Tablette (medium / expanded)

### Community 16 - "markdown.js"
Cohesion: 0.28
Nodes (8): cells(), inline(), legifrance(), parseList(), readTable(), render(), tableHtml(), tables()

### Community 17 - "unitsIn"
Cohesion: 0.40
Nodes (5): hasFolders(), planOf(), planSequence(), shiftUnit(), unitsIn()

### Community 18 - "from_maps.cjs"
Cohesion: 0.10
Nodes (15): ctx, files, fs, out, path, root, vm, win (+7 more)

### Community 20 - "childrenOf"
Cohesion: 0.12
Nodes (21): ancestors(), canTree(), childrenOf(), descendants(), hiddenSet(), isCentre(), isComponent(), isReviewable() (+13 more)

### Community 21 - "relayout.test.cjs"
Cohesion: 0.20
Nodes (6): fs, map(), n(), path, { S, win }, vm

### Community 22 - "Utilisation"
Cohesion: 0.18
Nodes (11): Apprendre un chapitre entier, Couleurs des nœuds (option), Dans une carte, Lecture seule, Notes (Markdown), Personnaliser une carte (v4.1), Ranger une carte (disposition), Révision (+3 more)

### Community 23 - "folders.test.cjs"
Cohesion: 0.29
Nodes (4): course(), node(), { S, win }, win

### Community 24 - "checkvis.cjs"
Cohesion: 0.16
Nodes (18): crosses(), ctx, files, fs, inRect(), measure(), ov(), overlapLen() (+10 more)

### Community 25 - "U"
Cohesion: 0.21
Nodes (7): U, autoLabel(), logicText(), markdown(), relations(), render(), tree()

### Community 26 - "mutate"
Cohesion: 0.15
Nodes (32): addBranches(), adopt(), chooseLayout(), connect(), convergeOnto(), createFork(), customLabels(), declineKeys() (+24 more)

### Community 27 - "binder.js"
Cohesion: 0.20
Nodes (14): binder(), defs(), divider(), el(), enter(), finish(), zoom(), norm() (+6 more)

### Community 29 - "4. Système de design (Material Design 3)"
Cohesion: 0.17
Nodes (12): 4.0 Règle permanente — pas de surlignage de contour, 4.1 Couleur — Material 3 Expressive, rôles tonals, 4.2 Typographie — échelle M3 Expressive, 4.3 bis Navigation et actions — rail, dock, barre contextuelle, 4.3 Grille, forme, mouvement des composants, 4.4 bis Couleurs des nœuds (option), 4.4 ter Relations d'abord, définitions modulaires, 4.5 Classes de fenêtre M3 → composition (+4 more)

### Community 30 - "train_nn.py"
Cohesion: 0.18
Nodes (3): depth(), desc(), pr()

### Community 32 - "course.js"
Cohesion: 0.23
Nodes (18): contentsText(), countUp(), folderBlock(), levelBlocks(), mapCard(), mount(), notFound(), numeral() (+10 more)

### Community 33 - "exercises.test.cjs"
Cohesion: 0.14
Nodes (5): course(), EX, node(), { S }, { S }

### Community 34 - ".dayKey"
Cohesion: 0.22
Nodes (8): exercisesFor(), node(), rate(), reviewedToday(), reviewItem(), streak(), syncCoverage(), unrate()

### Community 39 - "Mindmap-apk"
Cohesion: 0.40
Nodes (4): Graphify, Mindmap-apk, Quota, Rangement : version du moteur

### Community 40 - "carnet.js"
Cohesion: 0.07
Nodes (52): 4.4 Types de nœuds — trois apparences (v4.1), 10. Autour, 1. Trois apparences, 2. Nouveau type `paragraphe`, 3. Style par nœud (données), 4. Couleur, 5. Typographie, 6. Liens (+44 more)

### Community 41 - "quota-router"
Cohesion: 0.25
Nodes (7): 1. Toujours, 2. Paliers (indice Artificial Analysis · coût tokens), 3. Décider (dans cet ordre), 4. Délégation (Agent), 5. Hygiène du contexte, 6. Suivi hebdo, quota-router

### Community 45 - ".clamp"
Cohesion: 0.24
Nodes (16): addFreeCenter(), animateView(), applyView(), autoPan(), bbox(), buildBar(), buildVToolbar(), fit() (+8 more)

### Community 46 - ".plural"
Cohesion: 0.25
Nodes (11): 4.6 Cours — des dossiers (dans « Mes cours » seulement), courseCard(), foldGestures(), mount(), openCourse(), reviewBtn(), sessionHero(), streakChip() (+3 more)

### Community 47 - "store.js"
Cohesion: 0.11
Nodes (21): blank(), cleanEdgeStyle(), cleanJxy(), cleanNodeStyle(), courseActivity(), coursesSorted(), emit(), folderPath() (+13 more)

### Community 48 - "mapsOf"
Cohesion: 0.16
Nodes (20): branchStats(), courseStats(), deleteCourse(), dueCount(), exportCourse(), folderStats(), foldersUnder(), forecast() (+12 more)

### Community 49 - "render"
Cohesion: 0.20
Nodes (30): addChild(), addFree(), addSibling(), applyReadOnly(), convergeMenu(), convergeNew(), defaultChildType(), deleteNodes() (+22 more)

### Community 50 - "onKey"
Cohesion: 0.23
Nodes (15): applyPaneState(), centerOn(), closePane(), closePaneIfOverlay(), isPaneShown(), openNote(), openPane(), paneHeader() (+7 more)

### Community 51 - "paneNode"
Cohesion: 0.20
Nodes (14): addSource(), continueList(), dueLabel(), editTable(), fireInput(), fmtBtn(), indentLine(), paneNode() (+6 more)

### Community 52 - "Editor"
Cohesion: 0.11
Nodes (37): Editor(), anchorOf(), anchors(), applyStyle(), bez(), branchCurve(), bundleGeometry(), bundleLabel() (+29 more)

### Community 53 - "skill-rules.cjs"
Cohesion: 0.36
Nodes (8): compare(), dir, expected(), fs, path, skillFile(), validatorLine(), write()

### Community 54 - "nodeMenu"
Cohesion: 0.24
Nodes (15): ctxItems(), paint(), isolate(), nodeMenu(), reviewBranch(), rivals(), roItems(), setType() (+7 more)

### Community 55 - "Pioneer — cartes mentales pour le droit"
Cohesion: 0.29
Nodes (5): Installer sur Android, Lancer, Mettre en ligne (GitHub Pages), Pioneer — cartes mentales pour le droit, Structure

### Community 56 - "3. Architecture de l'information"
Cohesion: 0.29
Nodes (7): 3.1 Systèmes d'organisation, 3.2 Système d'étiquetage, 3.3 bis Vue Plan — lire un plan long sans perdre le fil, 3.3 Systèmes de navigation, 3.4 Système de recherche, 3.5 Plan du site (routes), 3. Architecture de l'information

### Community 58 - "5. Motion design"
Cohesion: 0.33
Nodes (6): 5.1 Diagnostic, 5.2 Tokens (un seul système, CSS et JS), 5.3 Spécification, 5.4 Performance, 5.5 Accessibilité, 5. Motion design

### Community 59 - "paint"
Cohesion: 0.27
Nodes (11): articleRef(), byMap(), highlight(), open(), finish(), group(), paint(), paintScopes() (+3 more)

### Community 61 - ".clear"
Cohesion: 0.29
Nodes (9): onboarding(), openImport(), analyse(), paint(), openSettings(), openTypo(), paint(), showShortcuts() (+1 more)

### Community 62 - "mount"
Cohesion: 0.44
Nodes (8): courseRow(), dayDeck(), forecastCard(), loyaltyCard(), masteryRing(), mount(), sessionHref(), weakList()

### Community 63 - "mark.js"
Cohesion: 0.43
Nodes (6): dot(), hueFor(), mark(), paper(), tint(), vars()

### Community 64 - "1. Le besoin (Lean UX)"
Cohesion: 0.50
Nodes (4): 1. Le besoin (Lean UX), Hypothèses (format Lean UX), MVP — ce qui est livré, Problème

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Editor()` connect `Editor` to `onUp`, `ui`, `app.js`, `.clamp`, `render`, `onKey`, `paneNode`, `nodeMenu`, `mutate`, `.clear`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Editor()` (e.g. with `onCancel()` and `onContext()`) actually correct?**
  _`Editor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `changed` be split into smaller, more focused modules?**
  _Cohesion score 0.14666666666666667 - nodes in this community are weakly interconnected._
- **Why does `t()` connect `from_maps.cjs` to `mapsOf`, `.plural`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `onKey()` (e.g. with `Editor()` and `.unmount()`) actually correct?**
  _`onKey()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `layout.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Why does `U` connect `U` to `changed`, `.dayKey`, `ui`, `app.js`, `mount`, `.clamp`, `.plural`, `markdown.js`, `mapsOf`, `paint`, `.clear`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._