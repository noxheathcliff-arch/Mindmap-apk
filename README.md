# Pioneer — cartes mentales pour le droit

Décompose tes cours de droit en cartes mentales **typées** (définition, conditions de fond et de forme, effets, exceptions, jurisprudence, textes), écris une note dans chaque nœud, range tout par **cours**, puis **révise** en rappel actif avec répétition espacée.

- Aucun compte, aucun serveur : les données restent sur l'appareil (base IndexedDB du navigateur, sans la limite de 5 Mo, avec une copie de secours) et s'exportent / s'importent en JSON.
- Fonctionne **hors-ligne** et s'**installe** comme une application (PWA) sur Android, iOS et desktop.
- Composition propre à chaque écran : barre basse et bottom sheet sur mobile, rail et feuille latérale sur tablette, panneau de note docké sur desktop.

Le raisonnement de conception (architecture de l'information, Material 3 Expressive, cours en dossiers, barre d'outils flottante, motion, lois de l'UX, Hooked, Lean UX) est détaillé dans [`DESIGN.md`](DESIGN.md).

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
| **Nœud** | Un élément typé, parmi 43 types rangés en familles : **Notion** (Notion, Définition, Caractéristique, Catégorie, Signe), **Cause et effet** (Cause, Conséquence, Condition, Problème, Solution), **Raisonner** (Question, Théorie, Argument, Critique, Nuance, Comparaison, Avantage, Inconvénient), **Agir** (Méthode, Étape, Conseil, Exercice, Objectif), **Repères** (Date, Chiffre clé, Formule), **Sources** (Étude, Citation, Personne, Texte, Jurisprudence, Doctrine), **Droit** (Condition de fond, Condition de forme, Effet / Régime, Exception), **Compléments** (Exemple, Piège, À retenir, Idée). Chaque type a sa question de révision ; l'affichage se limite à **trois apparences** : **Notion** (structure et notion), **Idée** (le reste) et **Référence** (citation, texte, jurisprudence, doctrine, étude, personne). |
| **Structure** | **Chapitre › Section › Sous-section › Paragraphe** (Leçon reste disponible) : le niveau se lit par la **typographie** (police, taille, gras réglables), avec un préfixe numéroté facultatif (« Paragraphe I »), avec la jauge de maîtrise de leur branche, un sommaire, « Réviser ce chapitre » et « Isoler ». |
| **Note** | Le bloc-notes de chaque nœud (Markdown), avec aperçu. |
| **Lien** | Hiérarchique (décomposition, trait plein) ou renvoi (« voir », « sauf », « implique »… en pointillé fléché). Tout lien se sélectionne : couleur, épaisseur, trait, forme, flèche, points d'ancrage et courbure se règlent à la main ; libellé jusqu'à 80 caractères. |
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
| `Alt 1` … `Alt 5` | Chapitre · Section · Sous-section · Paragraphe · Leçon |
| `A` | Apparence du nœud (couleur, forme, police) |
| `.` | Replier / déplier la branche |
| `R` · `F` | Ranger · Ajuster à l'écran |
| `H` | Mode masqué : tout est flouté, touche pour révéler (rappel actif) |
| `P` | Basculer Carte / **Plan** (fiche I. A. 1. a. imprimable) |
| `Ctrl/⌘ Z` · `Ctrl/⌘ ⇧ Z` | Annuler · Rétablir |
| `Ctrl/⌘ K` | Recherche plein texte (filtres Cours / Cartes / Notions, numéro d'article → Légifrance) |
| `?` | Tous les raccourcis |

Sur mobile : toucher pour sélectionner, la barre du bas devient contextuelle (Enfant, Note, Relier, Type, Plus) ; pincer pour zoomer ; appui long pour le menu.

### Apprendre un chapitre entier

Crée la carte en choisissant **Un chapitre de cours** : la racine est un Chapitre, `Tab` y ajoute des **Sections**, puis sous chacune des **Sous-sections** (`Alt 3`) et des **Paragraphes** (`Alt 4`), puis les notions. Les sections, sous-sections et paragraphes sont numérotés toutes seules dans l'ordre du plan ; chacune affiche une jauge de maîtrise de sa branche. Sans rien sélectionner, le panneau affiche le **sommaire** du chapitre. Sur une section : **Réviser cette section** (seulement ses cartes) et **Isoler** (replie les autres sections). En vue **Plan**, la structure devient des intertitres (*Section 1 — …*) et la numérotation I. A. 1. repart sous chacun ; « À retenir » devient un encadré. Au zoom éloigné, le détail s'estompe et la structure reste lisible.

### Ranger une carte (disposition)

`R` (ou *Ranger*) range toute la carte en comparant trois dispositions et garde la plus lisible pour cette carte et cet écran : **vers la droite** (la plus familière), **centrée** (le sujet au milieu, les branches de chaque côté dans le sens des aiguilles d'une montre) ou **pyramide** (de haut en bas, les listes en colonne sous leur parent). On peut en imposer une : ⋮ → *Disposition…*. Elle propose aussi **vers le bas** : le sujet en haut, les grandes parties côte à côte (la première à gauche, lecture de gauche à droite) et, sous chaque partie, ses idées en atome : les sous-idées entourent leur idée de tous les côtés (sauf celui d'où vient son lien), les feuilles au plus près, et chaque sous-idée fait de même avec les siennes, reliées par des courbes souples plutôt que par des branches droites. On voit d'un coup d'œil en combien de parties la carte se divise. Le moteur garantit :

- l'ordre du cours n'est jamais permuté (numérotation des leçons et ordre de révision inchangés) ;
- les nœuds d'un même niveau sont alignés en colonnes, les groupes séparés par l'espace ;
- les **renvois** (pointillés) choisissent leur tracé parmi des courbes directes, des courbes déviées par un point de passage, des contournements et le tracé orthogonal, notés sur les mêmes critères mesurés (nœud traversé, croisements, traits superposés, frôlements, longueur et courbure, sortie du cadre) : ils ne traversent aucun nœud, n'arrivent jamais par le côté où arrive la hiérarchie, et gardent leur tracé tant qu'il reste net ;
- les **libellés** se posent là où ils ne cachent aucun texte ni ne sont barrés par un autre lien (marges, pointe de flèche et jonctions exclues) ; un libellé sans place nette est marqué en conflit, jamais caché ;
- une fourche dont les cibles sont trop éloignées est dessinée en renvois séparés.

Le moteur ne se contente pas de ranger : il **construit** la carte pour qu'elle se lise d'un coup d'œil.

- les étapes d'une **Méthode** et les **Dates** sœurs (3 à 6) deviennent une **frise fléchée** de gauche à droite ;
- exemples, arrêts, citations, personnes… se placent en **annotation**, en retrait sous l'idée qu'ils illustrent ;
- « À retenir » se détache ; les traits s'affinent avec la profondeur ;
- **aides à la lecture** (⋮ → Disposition, activées par défaut) : une teinte douce par branche principale et des pastilles d'ordre 1, 2, 3.

Pour chaque disposition, un optimiseur règle ensuite les écarts (colonnes, groupes, retraits, frises) en gardant ce qui améliore une note de lisibilité : liens qui traversent un nœud, libellés masqués, croisements, longueur des renvois, groupes ambigus, longs arcs, forme par rapport à l'écran.

### Personnaliser une carte (v4.1)

- **Apparence d'un nœud** (`A`, ou *Apparence* dans la barre d'actions) : type et niveau, **couleur** parmi 12 teintes avec la portée *Ce nœud* ou *Tous les « Notion »* (la couleur d'un nœud prime sur celle de son type), **forme** (largeur, hauteur, arrondi — ou la poignée de coin sur la carte), **police** (23 polices : sans, serif, display, mono, manuscrites), **taille**, **gras** et **préfixe numéroté**.
- **Typographie des cartes** (Réglages › Apparence) : une police, une taille et un gras par niveau (chapitre, section, sous-section, paragraphe, leçon, notion, idée, référence) et une police pour les notes.
- **Liens libres** : touche un lien (hiérarchique ou renvoi) pour le sélectionner ; trois poignées apparaissent — départ et arrivée (aimantées au bord le plus proche) et courbure. *Apparence* ouvre la fiche du lien : libellé (80 caractères, mes libellés et suggestions), couleur, épaisseur, trait, forme (auto, courbe, droit, coudé), flèche, portée (ce lien ou toute la fourche), *Réinitialiser le tracé*. Un lien retouché se dessine seul, hors de son faisceau.
- **Stabilisateur des liens** (⋮ → *Disposition…*) : un curseur de *Libre* (courbes) à *Coudes nets* (tracé orthogonal propre), sans déplacer aucun nœud. Il remplace les peignes, supprimés.
- La **note** s'ouvre en feuille pleine hauteur sur mobile.

Une carte importée sans positions est rangée dès l'import (vignettes justes avant même la première ouverture), puis affinée avec les tailles réelles à l'ouverture.

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

Le dossier [`skills/pioneer-livre-vers-cours`](skills/pioneer-livre-vers-cours) contient un skill portable qui apprend à n'importe quelle IA (Claude, ChatGPT, Gemini…) à transformer un livre ou un PDF de cours en **cours Pioneer complet** : la hiérarchie d'abord et peu de renvois, libellés-phrases (« parent + libellé + enfant » se lit comme une phrase, jusqu'à 80 caractères), « À retenir » qui synthétise toute la carte, racine « Introduction » en notion ; relations du texte relevées d'abord (carte de compréhension : chaque connecteur encodé ou abstention justifiée), cours rangé en dossiers selon son vrai plan (Partie › Titre › Chapitre, une carte par section), cartes du plan pyramidales qui expliquent pourquoi le cours est découpé ainsi (liens libellés « prépare », « complète »…), nœuds typés, logique ET/OU, notes Markdown (surligné, tableaux, citations, exercices), liens libellés qui se lisent comme des phrases (« entraîne », « illustré par », « de qui ? »), branches libellées, définitions décomposées en composantes, renvois entre sections, et pour chaque carte des **exercices de révision** (questions-réponses, QCM, vrai ou faux) qui couvrent tous ses nœuds et que Pioneer propose en révision, validé avant livraison. Joins le fichier `pioneer_book_to_course_compiler_v4.5.json` et ton document, demande « Applique ce skill à ce livre », puis colle la réponse dans **Importer…**. Pour Claude, `SKILL.md` sert de point d'entrée.

Si l'IA a mal organisé une carte, **Ranger** la relit et applique de lui-même les corrections **établies** (relations dites par les notes — « car », « sauf si », « ce qui entretient… » —, exception rangée sous sa règle, exemple sous ce qu'il illustre, doublon fusionné…), chacune vérifiée puis tracée dans le journal de la carte ; *Annuler* juste après les refuse pour de bon. Carte ⋮ › *Améliorer l'organisation…* montre ce journal, les relations probables (à cocher soi-même) et ce qui reste à trancher à la main. (Désactivable : ⋮ › *Disposition…* › *Corriger l'organisation en rangeant*.) Tests du moteur : `node tests/organize.test.cjs` et `node tests/organize-v4.test.cjs` ; jeu de référence et jeu de contrôle indépendant : `node tests/gold/eval.cjs [--set heldout]` ; routage et libellés : `node tests/visual/checkvis.cjs` ; mesure avant/après : `node tests/metrics.cjs [cours.json]` ; accord skill ↔ moteur : `node tests/skill-rules.cjs` ; banc du skill (pipeline, contradictions, taille, exemple contrôlé par le moteur et le validateur) : `node tests/skill-bench.cjs`.

## Structure

```
index.html              coque de l'application
manifest.webmanifest    PWA (installation)
sw.js                   service worker (hors-ligne)
css/tokens.css          tokens Material Design 3 (couleurs, typo, forme, motion)
css/base.css            coque : rail 80/260, dock flottant, barre contextuelle, pages, transitions
css/components.css      boutons, chips, segmentés, dialogues, menus, snackbar…
css/views.css           bibliothèque, cours, révision, recherche, plan
css/editor.css          canvas, nœuds, liens, panneau de note, barres d'outils
js/store.js             modèle de données, persistance (IndexedDB + miroir), répétition espacée
js/layout.js            moteur de rangement : dispositions, contours, trajets des renvois, libellés, note de lisibilité
js/colors.js            couleurs des nœuds par type (OKLCH, contraste garanti)
js/mark.js              identité d'un cours : dossier + empreinte générative (SVG), rôles de couleur M3 par teinte
js/markdown.js          rendu des notes
js/ui.js                composants et moteur de motion
js/views/*.js           bibliothèque, cours, éditeur, plan, révision
js/search.js            recherche (Ctrl/⌘ K)
skills/                 skill « livre → cours Pioneer » pour IA (JSON portable + SKILL.md)
js/app.js               routeur, navigation, thème, réglages, onboarding
```
