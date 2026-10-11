# Ratio — cartes mentales pour le droit

Décompose tes cours de droit en cartes mentales **typées** (définition, conditions de fond et de forme, effets, exceptions, jurisprudence, textes), écris une note dans chaque nœud, range tout par **cours**, puis **révise** en rappel actif avec répétition espacée.

- Aucun compte, aucun serveur : les données restent sur l'appareil (base IndexedDB du navigateur, sans la limite de 5 Mo, avec une copie de secours) et s'exportent / s'importent en JSON.
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
| **Cours** | Le dossier d'un enseignement (ex. *Droit des obligations*). Sur l'accueil, chaque cours est une **fiche** à sa teinte, marquée d'une **empreinte** générée depuis ses cartes, qui montre la prochaine question à réviser. |
| **Carte** | Une notion à décomposer, ou un chapitre entier (choix à la création). |
| **Nœud** | Un élément typé : Notion, Définition, Condition de fond, Condition de forme, Effet / Régime, Exception, Jurisprudence, Texte, Doctrine, Exemple, À retenir, Idée. |
| **Structure** | **Chapitre › Leçon › Section** : des nœuds plus grands et numérotés automatiquement (« Leçon 2 »), avec la jauge de maîtrise de leur branche, un sommaire, « Réviser ce chapitre » et « Isoler ». |
| **Note** | Le bloc-notes de chaque nœud (Markdown), avec aperçu. |
| **Lien** | Hiérarchique (décomposition, trait plein) ou renvoi (« voir », « sauf », « implique »… en pointillé fléché). |
| **Fourche** | Un seul lien, avec un seul libellé, qui se sépare vers plusieurs éléments. Changer le libellé le change pour toutes les branches. |
| **ET / OU** | Indique si les éléments rattachés sont cumulatifs ou alternatifs. Affiché sur les liens, dans le plan et en révision. |

### Dans une carte

| Geste / touche | Action |
|---|---|
| `Tab` · poignée **+** | Ajouter un enfant (décomposer) |
| `Entrée` | Ajouter un frère |
| `F2` · double-clic | Renommer |
| `Espace` · toucher à nouveau le nœud sélectionné · toucher l'icône note | Ouvrir la note (en Aperçu si elle existe) |
| Glisser la poignée **+** sur un nœud | Relier (renvoi) — dans le vide : crée un enfant à cet endroit |
| `L` · **Relier**, puis toucher plusieurs nœuds, `Entrée` | Créer une **fourche** (un lien, un libellé, plusieurs branches) |
| Lien sélectionné → **Branche** | Ajouter une branche (même libellé) ; **⋯** : regrouper, détacher, séparer, supprimer la fourche |
| Glisser un nœud | Le déplacer avec sa branche (`Alt` : seul) |
| `Maj` + glisser dans le vide | Sélection multiple |
| Double-clic dans le vide | Nœud libre |
| `1` … `9` | Changer le type |
| `Alt 1` · `Alt 2` · `Alt 3` | Chapitre · Leçon · Section |
| `.` | Replier / déplier la branche |
| `R` · `F` | Ranger · Ajuster à l'écran |
| `H` | Mode masqué : tout est flouté, touche pour révéler (rappel actif) |
| `P` | Basculer Carte / **Plan** (fiche I. A. 1. a. imprimable) |
| `Ctrl/⌘ Z` · `Ctrl/⌘ ⇧ Z` | Annuler · Rétablir |
| `Ctrl/⌘ K` | Recherche plein texte (filtres Cours / Cartes / Notions, numéro d'article → Légifrance) |
| `?` | Tous les raccourcis |

Sur mobile : toucher pour sélectionner, la barre du bas devient contextuelle (Enfant, Note, Relier, Type, Plus) ; pincer pour zoomer ; appui long pour le menu.

### Apprendre un chapitre entier

Crée la carte en choisissant **Un chapitre de cours** : la racine est un Chapitre, `Tab` y ajoute des **Leçons**, puis les notions de chacune (une Section se pose avec `Alt 3`). Les leçons et sections sont numérotées toutes seules dans l'ordre du plan ; chacune affiche une jauge de maîtrise de sa branche. Sans rien sélectionner, le panneau affiche le **sommaire** du chapitre. Sur une leçon : **Réviser cette leçon** (seulement ses cartes) et **Isoler** (replie les autres leçons). En vue **Plan**, la structure devient des intertitres (*Leçon 1 — …*) et la numérotation I. A. 1. repart sous chacun ; « À retenir » devient un encadré. Au zoom éloigné, le détail s'estompe et la structure reste lisible.

### Lecture seule
Le cadenas de la barre (ou *Lecture seule* dans le menu ⋮ d'une carte) protège une carte terminée : on peut toujours la parcourir, ouvrir les notes, replier, isoler, passer en Plan, le mode masqué et la réviser, mais plus rien ne s'ajoute, ne se supprime ni ne se déplace (glisser un nœud fait défiler la carte, double-cliquer ouvre la note). Le réglage est mémorisé et la carte porte un badge *Lecture seule* ; une copie (*Dupliquer*) naît modifiable.

### Couleurs des nœuds (option)

Par défaut tout reste monochrome. **Réglages → Couleurs des nœuds** (ou ⋮ dans une carte) : *Familles*, *Daltonisme* ou *Perso* (une couleur par type), en intensité douce ou vive. Le texte s'ajuste tout seul pour rester lisible, la forme de chaque type est conservée, une légende apparaît dans le panneau de la carte. *Revenir au monochrome* ou *Masquer les couleurs* à tout moment (tes couleurs Perso sont gardées).

### Notes (Markdown)

`**gras**`, `*italique*`, `==surligné==`, `- liste`, `1. liste`, `- [ ] case`, `> citation` (textes de loi), `## intertitre`, `[[Titre d'un autre nœud]]` (lien cliquable), `| tableau |`. Les références d'articles (« art. 1128 », « art. L. 132-1 ») sont repérées automatiquement et ouvrent la recherche **Légifrance**.

- **Tableaux** : bouton *Tableau* de la barre de mise en forme → une grille à remplir (1re ligne = en-têtes, + / − lignes et colonnes, Entrée = case du dessous). Toucher un tableau dans l'Aperçu le rouvre dans la grille. Ils apparaissent dans le Plan, l'impression, la révision et la recherche.
- **Sources** : bouton *Source* → adresse + titre (ex. un arrêt sur Légifrance). Tous les liens de la note sont rassemblés dans la rubrique **Sources** du panneau.

### Révision

Chaque nœud qui a une note ou des éléments rattachés devient une carte de révision : la question (« Explique cette condition de fond — 3 éléments cumulatifs à retrouver »), puis la réponse. Tu notes **À revoir / Compris / Maîtrisé** (touches `1` `2` `3`, ou glisser la fiche ← / → sur mobile) ; la répétition espacée (boîtes de Leitner : 1, 3, 7, 15, 30 jours) la représente au bon moment.

- **Onglet Réviser** : combien de cartes sont dues et le temps estimé, la **taille de session** (10 · 20 · toutes, mémorisée), chaque cours avec ce qu'il a de dû, ta régularité, la **charge des 7 prochains jours** et les dernières cartes **à retravailler**.
- **Pendant la session** : chaque fiche porte la teinte et l'empreinte de son cours, son état (*Nouvelle*, ou vue il y a… avec sa boîte 1–5), et le paquet dessous dit ce qu'il reste. **Indice** (`H`) : la forme de la réponse sans la réponse (nombre d'éléments, leur nature, l'initiale). **Annuler** (`Z`) reprend la dernière note, même depuis l'écran de fin.
- **Fin de session** : le bilan, la série, et la liste des fiches restées « À revoir » avec un lien vers la carte.

### Sauvegarder, importer, partager

**Réglages → Données** : place utilisée, date de la dernière sauvegarde (rappel au-delà de 14 jours), **Exporter tout** (fichier `.json`) et **Importer…**. Un cours seul s'exporte depuis son menu ⋮ dans la bibliothèque.

L'import accepte un fichier (glisser-déposer ou choisir) **ou un texte collé**, par exemple la réponse d'une IA — balises ```` ```json ````, texte autour, virgules en trop et guillemets typographiques sont corrigés tout seuls. Avant d'importer, un aperçu montre ce que contient le fichier (cours, cartes, nœuds, notes, liens) et ce qui a été corrigé à la lecture (types inconnus, liens cassés, cartes sans cours, positions absentes → carte rangée automatiquement). Trois façons d'importer :

- **Ajouter en copie** (par défaut) : rien n'est jamais écrasé ;
- **Compléter « … »** : proposé quand le fichier est la suite d'un cours déjà présent (un livre livré en plusieurs parties) ;
- **Mettre à jour** / **Tout remplacer** (avec confirmation).

Un import s'annule depuis la barre qui suit (*Annuler*).

### Transformer un livre en cours (skill pour IA)

Le dossier [`skills/ratio-livre-vers-cours`](skills/ratio-livre-vers-cours) contient un skill portable qui apprend à n'importe quelle IA (Claude, ChatGPT, Gemini…) à transformer un livre ou un PDF de cours en **cours Ratio complet** : une carte par chapitre, nœuds typés, logique ET/OU, notes Markdown (surligné, tableaux, citations, exercices), renvois étiquetés et fourches, validé avant livraison. Joins le fichier `ratio_book_to_course_compiler_v1.1.json` et ton document, demande « Applique ce skill à ce livre », puis colle la réponse dans **Importer…**. Pour Claude, `SKILL.md` sert de point d'entrée.

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
js/store.js             modèle de données, persistance (IndexedDB + miroir), répétition espacée
js/layout.js            mise en page automatique (« Ranger »)
js/colors.js            couleurs des nœuds par type (OKLCH, contraste garanti)
js/mark.js              identité d'un cours : empreinte générative (SVG) + teinte papier
js/markdown.js          rendu des notes
js/ui.js                composants et moteur de motion
js/views/*.js           bibliothèque, cours, éditeur, plan, révision
js/search.js            recherche (Ctrl/⌘ K)
skills/                 skill « livre → cours Ratio » pour IA (JSON portable + SKILL.md)
js/app.js               routeur, navigation, thème, réglages, onboarding
```
