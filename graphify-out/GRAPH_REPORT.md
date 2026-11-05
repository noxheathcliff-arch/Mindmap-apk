# Graph Report - Mindmap-apk  (2026-11-05)

## Corpus Check
- 76 files · ~430,261 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: .css 8, (none) 2, .webmanifest 1)

## Summary
- 1086 nodes · 2596 edges · 59 communities (47 shown, 12 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 225 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `655886f9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- render
- changed
- layout.js
- organize.js
- ui
- .clear
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
- 6. Composition par écran
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
- store.js
- mapsOf
- startEdit
- onKey
- paneNode
- Editor
- skill-rules.cjs
- Pioneer — cartes mentales pour le droit
- 3. Architecture de l'information
- fonts.js
- 5. Motion design
- prefixOf

## God Nodes (most connected - your core abstractions)
1. `Editor()` - 177 edges
2. `render()` - 39 edges
3. `mutate()` - 35 edges
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

## Communities (59 total, 12 thin omitted)

### Community 0 - "render"
Cohesion: 0.12
Nodes (37): addFree(), addFreeCenter(), applyReadOnly(), auditNow(), autoOrganize(), chooseLayout(), declineKeys(), deleteSilently() (+29 more)

### Community 1 - "changed"
Cohesion: 0.14
Nodes (23): addCourse(), addFolder(), addMap(), applyImport(), changed(), course(), deleteCourse(), deleteFolder() (+15 more)

### Community 2 - "layout.js"
Cohesion: 0.07
Nodes (71): Historique : différenciation monochrome par type (jusqu'à v4.0), Routage et libellés (`js/layout.js`, `js/views/editor.js`), aerate(), anchorPoint(), arrange(), bbox(), buildTree(), busDown() (+63 more)

### Community 3 - "organize.js"
Cohesion: 0.07
Nodes (49): A. Qualité des relations, Audit de l'organisation des cartes — deuxième génération, B. Organisation des sous-graphes, C. Décomposition modulaire, Constat principal, D. Révision, E. Contrôle, paramètres, mesure, Inventaire (+41 more)

### Community 4 - "ui"
Cohesion: 0.09
Nodes (19): add(), centerOn(), close(), dismiss(), filter(), get(), hideTip(), motion (+11 more)

### Community 5 - ".clear"
Cohesion: 0.08
Nodes (46): 4.7 Réviser — paquet du jour, session, relevé, 4.x Marque Pioneer (logo), applyMotion(), applyNoteTypo(), applyTheme(), buildNav(), centerAction(), app (+38 more)

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
Nodes (8): 1. Le besoin (Lean UX), 2. Inventaire de contenu, 7. Lois de l'UX appliquées, 8. Modèle Hooked (Nir Eyal), Hypothèses (format Lean UX), MVP — ce qui est livré, Pioneer — Dossier de conception, Problème

### Community 16 - "markdown.js"
Cohesion: 0.28
Nodes (8): cells(), inline(), legifrance(), parseList(), readTable(), render(), tableHtml(), tables()

### Community 17 - "unitsIn"
Cohesion: 0.67
Nodes (3): planOf(), shiftUnit(), unitsIn()

### Community 18 - "from_maps.cjs"
Cohesion: 0.11
Nodes (14): ctx, files, fs, out, path, root, vm, win (+6 more)

### Community 20 - "childrenOf"
Cohesion: 0.14
Nodes (18): ancestors(), canTree(), childrenOf(), descendants(), hiddenSet(), isComponent(), isReviewable(), joinInto() (+10 more)

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

### Community 25 - "6. Composition par écran"
Cohesion: 0.50
Nodes (4): 6. Composition par écran, Desktop (large / extra-large), Mobile (compact, Android), Tablette (medium / expanded)

### Community 26 - "mutate"
Cohesion: 0.16
Nodes (27): build(), addBranches(), adopt(), connect(), convergeOnto(), createFork(), customLabels(), deleteEdge() (+19 more)

### Community 27 - "binder.js"
Cohesion: 0.20
Nodes (14): binder(), defs(), divider(), el(), enter(), finish(), zoom(), norm() (+6 more)

### Community 29 - "4. Système de design (Material Design 3)"
Cohesion: 0.18
Nodes (11): 4.0 Règle permanente — pas de surlignage de contour, 4.1 Couleur — Material 3 Expressive, rôles tonals, 4.2 Typographie — échelle M3 Expressive, 4.3 bis Navigation et actions — rail, dock, barre contextuelle, 4.3 Grille, forme, mouvement des composants, 4.4 bis Couleurs des nœuds (option), 4.4 ter Relations d'abord, définitions modulaires, 4.5 Classes de fenêtre M3 → composition (+3 more)

### Community 30 - "train_nn.py"
Cohesion: 0.18
Nodes (3): depth(), desc(), pr()

### Community 32 - "course.js"
Cohesion: 0.06
Nodes (50): 4.6 Cours — des dossiers (dans « Mes cours » seulement), dot(), hueFor(), mark(), paper(), tint(), vars(), U (+42 more)

### Community 33 - "exercises.test.cjs"
Cohesion: 0.14
Nodes (5): course(), EX, node(), { S }, { S }

### Community 34 - ".dayKey"
Cohesion: 0.29
Nodes (6): exercisesFor(), rate(), reviewedToday(), streak(), syncCoverage(), unrate()

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
Cohesion: 0.31
Nodes (10): bbox(), buildBar(), buildVToolbar(), fit(), hideCoach(), initialView(), positionCtx(), showCoach() (+2 more)

### Community 47 - "store.js"
Cohesion: 0.11
Nodes (20): blank(), cleanEdgeStyle(), cleanNodeStyle(), courseActivity(), coursesSorted(), emit(), folderPath(), load() (+12 more)

### Community 48 - "mapsOf"
Cohesion: 0.15
Nodes (21): branchStats(), courseStats(), dueCount(), folderStats(), foldersUnder(), forecast(), hasFolders(), isDue() (+13 more)

### Community 49 - "startEdit"
Cohesion: 0.21
Nodes (25): addChild(), addSibling(), animateView(), centerOn(), convergeMenu(), convergeNew(), ctxItems(), defaultChildType() (+17 more)

### Community 50 - "onKey"
Cohesion: 0.36
Nodes (12): applyPaneState(), closePane(), closePaneIfOverlay(), ensureVisible(), isPaneShown(), navigate(), onKey(), openPane() (+4 more)

### Community 51 - "paneNode"
Cohesion: 0.13
Nodes (21): addSource(), continueList(), dueLabel(), editTable(), fireInput(), fmtBtn(), indentLine(), isolate() (+13 more)

### Community 52 - "Editor"
Cohesion: 0.11
Nodes (40): Editor(), anchorOf(), anchors(), applyStyle(), applyView(), autoPan(), bez(), branchCurve() (+32 more)

### Community 53 - "skill-rules.cjs"
Cohesion: 0.36
Nodes (8): compare(), dir, expected(), fs, path, skillFile(), validatorLine(), write()

### Community 55 - "Pioneer — cartes mentales pour le droit"
Cohesion: 0.29
Nodes (5): Installer sur Android, Lancer, Mettre en ligne (GitHub Pages), Pioneer — cartes mentales pour le droit, Structure

### Community 56 - "3. Architecture de l'information"
Cohesion: 0.29
Nodes (7): 3.1 Systèmes d'organisation, 3.2 Système d'étiquetage, 3.3 bis Vue Plan — lire un plan long sans perdre le fil, 3.3 Systèmes de navigation, 3.4 Système de recherche, 3.5 Plan du site (routes), 3. Architecture de l'information

### Community 58 - "5. Motion design"
Cohesion: 0.33
Nodes (6): 5.1 Diagnostic, 5.2 Tokens (un seul système, CSS et JS), 5.3 Spécification, 5.4 Performance, 5.5 Accessibilité, 5. Motion design

### Community 63 - "prefixOf"
Cohesion: 0.40
Nodes (5): isCentre(), prefixOf(), roman(), styleOf(), typoOf()

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Editor()` connect `Editor` to `render`, `.clear`, `.clamp`, `startEdit`, `onKey`, `paneNode`, `mutate`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Editor()` (e.g. with `onCancel()` and `onContext()`) actually correct?**
  _`Editor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `render` be split into smaller, more focused modules?**
  _Cohesion score 0.12375533428165007 - nodes in this community are weakly interconnected._
- **Why does `U` connect `course.js` to `.dayKey`, `ui`, `.clear`, `mount`, `.clamp`, `markdown.js`, `mapsOf`, `mutate`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `onKey()` (e.g. with `Editor()` and `.unmount()`) actually correct?**
  _`onKey()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `changed` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._
- **Why does `t()` connect `mapsOf` to `course.js`, `from_maps.cjs`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._