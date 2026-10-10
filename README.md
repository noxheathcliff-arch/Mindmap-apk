# Ratio — cartes mentales pour le droit

Décompose tes cours de droit en cartes mentales **typées** (définition, conditions de fond et de forme, effets, exceptions, jurisprudence, textes), écris une note dans chaque nœud, range tout par **cours**, puis **révise** en rappel actif avec répétition espacée.

- Aucun compte, aucun serveur : les données restent sur l'appareil (stockage local) avec sauvegarde / import JSON.
- Fonctionne **hors-ligne** et s'**installe** comme une application (PWA) sur Android, iOS et desktop.
- Composition propre à chaque écran : barre basse et bottom sheet sur mobile, rail et feuille latérale sur tablette, panneau de note docké sur desktop.

Le raisonnement de conception (architecture de l'information, Material Design 3, 60/30/10, motion, lois de l'UX, Hooked, Lean UX) est détaillé dans [`DESIGN.md`](DESIGN.md).

## Lancer

Aucune compilation. Il suffit de servir le dossier en HTTP :

```bash
npx serve .          # ou : python3 -m http.server 8080
```

puis ouvrir `http://localhost:3000` (ou `:8080`). Ouvrir `index.html` directement fonctionne aussi, mais sans le mode hors-ligne.

### Mettre en ligne (GitHub Pages)

Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`. Il faut l'activer une fois : **Settings → Pages → Source : GitHub Actions**.

### Installer sur Android

Ouvrir le site dans Chrome → menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »). L'application s'ouvre alors en plein écran, avec son icône, et marche sans réseau.

## Utilisation

| Objet | Rôle |
|---|---|
| **Cours** | Le dossier d'un enseignement (ex. *Droit des obligations*). |
| **Carte** | Une notion ou un chapitre à décomposer. |
| **Nœud** | Un élément typé : Notion, Définition, Condition de fond, Condition de forme, Effet / Régime, Exception, Jurisprudence, Texte, Idée. |
| **Note** | Le bloc-notes de chaque nœud (Markdown), avec aperçu. |
| **Lien** | Hiérarchique (décomposition, trait plein) ou renvoi (« voir », « sauf », « implique »… en pointillé fléché). |
| **ET / OU** | Indique si les éléments rattachés sont cumulatifs ou alternatifs. Affiché sur les liens, dans le plan et en révision. |

### Dans une carte

| Geste / touche | Action |
|---|---|
| `Tab` · poignée **+** | Ajouter un enfant (décomposer) |
| `Entrée` | Ajouter un frère |
| `F2` · double-clic | Renommer |
| `Espace` | Ouvrir la note |
| Glisser la poignée **+** sur un nœud | Relier (renvoi) — dans le vide : crée un enfant à cet endroit |
| Glisser un nœud | Le déplacer avec sa branche (`Alt` : seul) |
| `Maj` + glisser dans le vide | Sélection multiple |
| Double-clic dans le vide | Nœud libre |
| `1` … `9` | Changer le type |
| `.` | Replier / déplier la branche |
| `R` · `F` | Ranger · Ajuster à l'écran |
| `H` | Mode masqué : tout est flouté, touche pour révéler (rappel actif) |
| `P` | Basculer Carte / **Plan** (fiche I. A. 1. a. imprimable) |
| `Ctrl/⌘ Z` · `Ctrl/⌘ ⇧ Z` | Annuler · Rétablir |
| `Ctrl/⌘ K` | Recherche plein texte |
| `?` | Tous les raccourcis |

Sur mobile : toucher pour sélectionner, la barre du bas devient contextuelle (Enfant, Note, Relier, Type, Plus) ; pincer pour zoomer ; appui long pour le menu.

### Notes (Markdown)

`**gras**`, `*italique*`, `==surligné==`, `- liste`, `1. liste`, `- [ ] case`, `> citation` (textes de loi), `## intertitre`, `[[Titre d'un autre nœud]]` (lien cliquable). Les références d'articles (« art. 1128 », « art. L. 132-1 ») sont repérées automatiquement.

### Révision

Chaque nœud qui a une note ou des éléments rattachés devient une carte de révision : la question (« Explique cette condition de fond — 3 éléments cumulatifs à retrouver »), puis la réponse. Tu notes **À revoir / Compris / Maîtrisé** (touches `1` `2` `3`, ou glisser la carte ← / → sur mobile) ; la répétition espacée (boîtes de Leitner : 1, 3, 7, 15, 30 jours) la représente au bon moment. La série de jours et la maîtrise par carte et par cours s'affichent sur l'accueil.

## Structure

```
index.html              coque de l'application
manifest.webmanifest    PWA (installation)
sw.js                   service worker (hors-ligne)
css/tokens.css          tokens Material Design 3 (couleurs, typo, forme, motion)
css/base.css            coque : rail, barre de navigation, pages, transitions
css/components.css      boutons, chips, segmentés, dialogues, menus, snackbar…
css/views.css           bibliothèque, cours, révision, recherche, plan
css/editor.css          canvas, nœuds, liens, panneau de note, barres d'outils
js/store.js             modèle de données, persistance, répétition espacée
js/layout.js            mise en page automatique (« Ranger »)
js/markdown.js          rendu des notes
js/ui.js                composants et moteur de motion
js/views/*.js           bibliothèque, cours, éditeur, plan, révision
js/search.js            recherche (Ctrl/⌘ K)
js/app.js               routeur, navigation, thème, réglages, onboarding
```
