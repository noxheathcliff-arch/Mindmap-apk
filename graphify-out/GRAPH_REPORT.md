# Graph Report - Mindmap-apk  (2026-10-20)

## Corpus Check
- 45 files · ~149,681 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 5, (none) 1, .webmanifest 1)

## Summary
- 708 nodes · 1618 edges · 40 communities (31 shown, 9 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d784a301`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Editor
- store.js
- layout.js
- organize.js
- ui
- app.js
- U
- colors.js
- mount
- eval.cjs
- skill-bench.cjs
- checkvis.cjs
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
- harness.cjs
- Ratio — Dossier de conception
- mark.js
- Ratio — cartes mentales pour le droit
- 3. Architecture de l'information
- library.js
- 5. Motion design
- render
- 1. Le besoin (Lean UX)
- course.js
- Ratio — Compilateur Livre → Cours (v3.1)
- sw.js
- Mindmap-apk

## God Nodes (most connected - your core abstractions)
1. `Editor()` - 153 edges
2. `render()` - 37 edges
3. `onKey()` - 28 edges
4. `mutate()` - 25 edges
5. `select()` - 25 edges
6. `paneNode()` - 25 edges
7. `U` - 24 edges
8. `renderBottomBar()` - 24 edges
9. `audit()` - 21 edges
10. `tidy()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Éditeur, store` --references--> `sanitize()`  [INFERRED]
  docs/audit-organisation-3.md → js/store.js
- `4.4 Types de nœuds (différenciation monochrome)` --references--> `separate()`  [INFERRED]
  DESIGN.md → js/layout.js
- `3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut` --references--> `phraseRelations()`  [INFERRED]
  docs/audit-organisation-3.md → js/organize.js
- `Moteur (`js/organize.js`)` --references--> `mergeNodes()`  [INFERRED]
  docs/audit-organisation-3.md → js/organize.js
- `4.4 ter Relations d'abord, définitions modulaires` --references--> `applyVerified()`  [INFERRED]
  DESIGN.md → js/organize.js

## Import Cycles
- None detected.

## Communities (40 total, 9 thin omitted)

### Community 0 - "Editor"
Cohesion: 0.05
Nodes (150): Editor(), addBranches(), addChild(), addFree(), addFreeCenter(), addSibling(), addSource(), anchorOf() (+142 more)

### Community 1 - "store.js"
Cohesion: 0.07
Nodes (59): addCourse(), addMap(), ancestors(), applyImport(), blank(), branchStats(), canTree(), changed() (+51 more)

### Community 2 - "layout.js"
Cohesion: 0.10
Nodes (48): Routage et libellés (`js/layout.js`, `js/views/editor.js`), arrange(), bbox(), buildTree(), busDown(), busySides(), childSlot(), columns() (+40 more)

### Community 3 - "organize.js"
Cohesion: 0.11
Nodes (38): 1. Défauts constatés (v3), 2. Agents et contributions, 3. Inventaire (≥ 25 pistes) — gain, coût, risque, statut, 4. Changements, 5. Tests et résultats, 6. Limites et reporté (honnêteté), Moteur (`js/organize.js`), Organisation V4 — intelligence structurelle et sémantique du graphe (+30 more)

### Community 4 - "ui"
Cohesion: 0.10
Nodes (10): add(), close(), dismiss(), get(), hideTip(), motion, ui, showTip() (+2 more)

### Community 5 - "app.js"
Cohesion: 0.17
Nodes (20): applyMotion(), applyTheme(), buildNav(), centerAction(), app, logo(), mountRoute(), nameHeroes() (+12 more)

### Community 7 - "colors.js"
Cohesion: 0.25
Nodes (19): apply(), closePairs(), contrast(), css(), currentTheme(), derive(), distance(), ensureContrast() (+11 more)

### Community 8 - "mount"
Cohesion: 0.25
Nodes (18): cardState(), hintFor(), mount(), current(), emTitle(), finish(), hint(), onEndKey() (+10 more)

### Community 9 - "eval.cjs"
Cohesion: 0.17
Nodes (17): applyPass(), asserts(), build(), clone(), FAM, fams(), GOLD, hasPrefix() (+9 more)

### Community 10 - "skill-bench.cjs"
Cohesion: 0.11
Nodes (11): dir, { execFileSync }, file, fs, os, path, raw, { S, O } (+3 more)

### Community 11 - "checkvis.cjs"
Cohesion: 0.16
Nodes (18): crosses(), ctx, files, fs, inRect(), measure(), ov(), overlapLen() (+10 more)

### Community 12 - "metrics.cjs"
Cohesion: 0.19
Nodes (14): applySure(), fall, files, fs, heading(), indicators(), measure(), n0() (+6 more)

### Community 13 - "organize.test.cjs"
Cohesion: 0.18
Nodes (9): applyAll(), fixesOf(), fs, path, { S, O, makeMap, fixesOf, applyAll, edge }, skill, skillPath, sure() (+1 more)

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
Cohesion: 0.17
Nodes (12): 4.0 Règle permanente — pas de surlignage de contour, 4.1 Couleur — Material 3 Expressive, rôles tonals, 4.2 Typographie — échelle M3 Expressive, 4.3 bis Navigation et actions — rail, dock, barre contextuelle, 4.3 Grille, forme, mouvement des composants, 4.4 bis Couleurs des nœuds (option), 4.4 ter Relations d'abord, définitions modulaires, 4.4 Types de nœuds (différenciation monochrome) (+4 more)

### Community 18 - "skill-rules.cjs"
Cohesion: 0.27
Nodes (8): compare(), dir, expected(), fs, path, skillFile(), validatorLine(), write()

### Community 19 - "organize-v4.test.cjs"
Cohesion: 0.18
Nodes (3): edge(), ABSTAIN, { S, O, makeMap, applyAll, edge }

### Community 20 - "gen.cjs"
Cohesion: 0.27
Nodes (7): Dans une carte, dense(), fs, L(), N(), path, T()

### Community 21 - "revhub.js"
Cohesion: 0.44
Nodes (8): courseRow(), dayDeck(), forecastCard(), loyaltyCard(), masteryRing(), mount(), sessionHref(), weakList()

### Community 22 - "Utilisation"
Cohesion: 0.22
Nodes (9): Apprendre un chapitre entier, Couleurs des nœuds (option), Lecture seule, Notes (Markdown), Ranger une carte (disposition), Révision, Sauvegarder, importer, partager, Transformer un livre en cours (skill pour IA) (+1 more)

### Community 23 - "harness.cjs"
Cohesion: 0.22
Nodes (7): ctx, files, fs, path, root, vm, win

### Community 24 - "Ratio — Dossier de conception"
Cohesion: 0.25
Nodes (8): 2. Inventaire de contenu, 6. Composition par écran, 7. Lois de l'UX appliquées, 8. Modèle Hooked (Nir Eyal), Desktop (large / extra-large), Mobile (compact, Android), Ratio — Dossier de conception, Tablette (medium / expanded)

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
Cohesion: 0.52
Nodes (6): courseCard(), mount(), reviewBtn(), sessionHero(), tipCard(), untilLabel()

### Community 29 - "5. Motion design"
Cohesion: 0.33
Nodes (6): 5.1 Diagnostic, 5.2 Tokens (un seul système, CSS et JS), 5.3 Spécification, 5.4 Performance, 5.5 Accessibilité, 5. Motion design

### Community 30 - "render"
Cohesion: 0.80
Nodes (5): logicText(), markdown(), relations(), render(), tree()

### Community 31 - "1. Le besoin (Lean UX)"
Cohesion: 0.50
Nodes (4): 1. Le besoin (Lean UX), Hypothèses (format Lean UX), MVP — ce qui est livré, Problème

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `onDown()` connect `Editor` to `ui`?**
  _High betweenness centrality (0.241) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Editor()` (e.g. with `onCancel()` and `onContext()`) actually correct?**
  _`Editor()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Editor` be split into smaller, more focused modules?**
  _Cohesion score 0.05136154168412233 - nodes in this community are weakly interconnected._
- **Why does `rate()` connect `store.js` to `ui`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `onKey()` (e.g. with `Editor()` and `.unmount()`) actually correct?**
  _`onKey()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `store.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06521739130434782 - nodes in this community are weakly interconnected._
- **Should `layout.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10204081632653061 - nodes in this community are weakly interconnected._