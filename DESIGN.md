# Pioneer — Dossier de conception

> Cartes mentales pour décomposer le droit : définitions, conditions de fond et de forme, régimes, exceptions — puis les réviser.

Ce document trace le raisonnement **avant** le code : besoin → inventaire de contenu → architecture de l'information → système de design → motion → composition par écran. Chaque décision renvoie au principe qui la justifie.

---

## 1. Le besoin (Lean UX)

### Problème
En master de droit, une notion (ex. *le contrat*) se décompose en **définition**, **conditions de fond**, **conditions de forme**, **effets / régime**, **exceptions**, **jurisprudence**, **textes**. Les conditions sont soit **cumulatives (ET)**, soit **alternatives (OU)**. Une prise de notes linéaire masque cette structure ; une carte mentale générique (Miro, XMind) ne la connaît pas.

### Hypothèses (format Lean UX)
| # | Nous croyons que… | …permettra… | Nous le saurons quand… |
|---|---|---|---|
| H1 | Forcer la décomposition en nœuds **typés** (Définition, Fond, Forme…) | de mieux comprendre la structure d'une notion | l'étudiante crée ≥ 1 carte par séance de cours |
| H2 | Attacher une **note** à chaque nœud | de ne pas avoir à jongler entre carte et cahier | ≥ 50 % des nœuds ont une note |
| H3 | Ranger par **cours** | de retrouver une notion en < 10 s | la recherche / navigation suffit sans dossiers imbriqués |
| H4 | Transformer automatiquement la carte en **cartes de révision** (rappel actif + répétition espacée) | d'augmenter la rétention | une session par jour (série ≥ 3 jours) |
| H5 | Proposer la carte en **plan juridique** (I. A. 1. a.) | de produire directement des fiches | la vue Plan est imprimée / exportée |

### MVP — ce qui est livré
Tout ce qui sert ces 5 hypothèses, rien d'autre : pas de compte, pas de cloud, pas de collaboration. Les données restent **sur l'appareil** avec **sauvegarde/import JSON** et export Markdown.

**Persistance.** IndexedDB est la base principale : une carte = un enregistrement, seules les cartes modifiées sont réécrites, dans une transaction atomique ; un magasin `media` est prêt pour les images et l'audio. Une **copie miroir** synchrone en localStorage (même format qu'avant, plus `savedAt`) est écrite à chaque sauvegarde tant qu'elle tient sous ~4,5 Mo : elle garantit l'enregistrement si la page est fermée en pleine écriture et reste lisible par les anciennes versions. Au chargement, la copie la plus récente gagne (`savedAt` ; un miroir sans `savedAt` vient d'une ancienne version, donc plus récent). Au-delà de la limite, le miroir est retiré plutôt que laissé périmé. Si IndexedDB est indisponible ou bloqué (délai de garde 2,5 s), l'app retombe sur localStorage seul, comme avant. Le stockage est demandé « persistant » (`navigator.storage.persist`). Une erreur n'est signalée que si aucune copie n'a pu être écrite. Application installable (PWA) sur Android et desktop, fonctionne hors-ligne.

---

## 2. Inventaire de contenu

| Objet | Attributs | Remarques |
|---|---|---|
| **Cours** | titre, description (ex. « M1 · S1 · Pr. X »), dates | Le « dossier unique » demandé. Un seul niveau : pas de sous-dossiers (loi de Tesler : on absorbe la complexité, l'utilisatrice n'a qu'un rangement à faire). |
| **Carte** | titre, cours, nœuds, liens, vue (zoom/position), dates | Une carte = une notion ou un chapitre. |
| **Nœud** | titre, **type**, note (Markdown), position, replié, **logique des enfants (ET/OU)**, état de révision | 43 types (voir §4.4), dont 3 de structure. |
| **Tableau, source** | vivent **dans la note** (Markdown : `| a | b |`, `[titre](https://…)`) | Aucun champ nouveau : export, import, plan, recherche et révision les reçoivent tels quels. Saisie en grille (Loi de Tesler : la syntaxe reste cachée) ; rubrique « Sources » = liens de la note extraits à l'affichage. |
| **Lien** | source, cible, **nature** (hiérarchique / renvoi), libellé, groupe | Hiérarchique = décomposition (trait plein). Renvoi = « voir aussi », « sauf », « implique » (pointillé + flèche). |
| **Fourche** | liens partageant un `group` (même source, même nature, un libellé) | Un tronc, un libellé posé sur le point de séparation, une branche par élément. Chaque branche reste un lien ordinaire : hiérarchie, révision, plan et import n'en dépendent pas. Les enfants d'un nœud ET/OU sont dessinés en fourche implicite (« ET » une seule fois). |
| **Carte de révision** | dérivée d'un nœud qui a une note ou des enfants | Boîte de Leitner 0→5, échéance. |
| **Réglages** | thème, motion, couleurs, série de jours, journal de révision, date de dernière sauvegarde, onboarding | Regroupés en Apparence · Données · Aide · Zone sensible (une ligne = icône, intitulé + explication, contrôle). |

---

## 3. Architecture de l'information
*(Rosenfeld, Morville & Arango — Information Architecture for the Web and Beyond)*

### 3.1 Systèmes d'organisation
- **Schéma exact** : par cours (choisi par l'utilisatrice) puis par carte. Tri par date de modification (récent d'abord — c'est ce qu'on rouvre).
- **Schéma ambigu (par sujet/type)** : les types de nœuds (Définition, Fond, Forme…) forment une taxonomie transversale exploitée par la recherche et la révision.
- **Structure** : hiérarchie peu profonde (Bibliothèque → Cours → Carte → Nœud → Note) + **hypertexte** (liens de renvoi entre nœuds).

### 3.2 Système d'étiquetage
Vocabulaire du droit français, constant partout : *Cours, Carte, Notion, Définition, Condition de fond, Condition de forme, Effet / Régime, Exception, Jurisprudence, Texte, Doctrine, Exemple, À retenir, Idée* — et, au-delà du droit, *Question, Méthode, Comparaison, Piège, Citation, Personne, Date, Chiffre clé, Formule* ; structure : *Chapitre, Section, Sous-section* (et *Leçon*). Logique : *cumulatives (ET)* / *alternatives (OU)*. Révision : *À revoir, Compris, Maîtrisé*. Les libellés d'action sont des verbes (« Nouvelle carte », « Réviser », « Relier »).

### 3.3 Systèmes de navigation
| Type | Implémentation |
|---|---|
| Globale | Barre de navigation (mobile) / rail (tablette, desktop) : **Cours · Réviser · Rechercher** + Réglages |
| Locale | Fil d'Ariane *Cours › Carte* dans la barre supérieure ; bascule **Carte / Plan** |
| Contextuelle | Barre d'actions du nœud sélectionné ; liens `[[Titre]]` dans les notes ; liens de renvoi |
| Supplémentaire | Palette de recherche (Ctrl K) plein texte (titres + notes) ; vue Plan = « index » de la carte |

### 3.3 bis Vue Plan — lire un plan long sans perdre le fil
- **Où suis-je ?** Un fil d'Ariane collant (40 px, ≈ 1/20 de l'écran) apparaît une fois le premier titre passé : « II. Conditions de fond › A. Consentement… › 2. Intégrité… › b) Dol » ; chaque niveau ramène à son titre ; le plus profond reste visible (le début, coupé, s'efface en fondu).
- **Comment les éléments s'articulent ?** Un « ET » / « OU » à chaque jointure entre éléments cumulatifs / alternatifs, posé sur le filet de leur niveau (la phrase d'annonce reste).
- **Que veut dire ce point ?** Le point de maîtrise suit le dernier mot du titre (proximité), avec son libellé en infobulle et une légende sous l'en-tête (une icône d'état sans légende est ambiguë).
- **Vue d'ensemble** : sommaire repliable dès 3 grandes parties. Rythme : plus d'air entre les grandes parties ; sur petit écran, retrait réduit (12 px par niveau) pour garder la largeur du texte.

### 3.4 Système de recherche
Une seule entrée (Ctrl/⌘ K ou onglet Rechercher), insensible aux accents et à la casse. Présentation en **index** :
- résultats groupés (Cours / Cartes / Notions), et **filtres** dès que deux familles coexistent (Tout · Cours · Cartes · Notions, avec effectifs) ;
- les notions sont **rangées sous leur carte** (en retrait, comme les sous-entrées d'un index) : le contexte n'est plus répété à chaque ligne ;
- cours avec leur empreinte, cartes avec leur vignette ; le passage trouvé est souligné au **trait de surligneur** (pas d'aplat : le mot reste lisible) ;
- un numéro d'article (« 1128 », « art. L. 132-1 ») propose aussi **« Chercher sur Légifrance »** ;
- une seule ligne sélectionnée à la fois (fond teinté, souris et clavier), légende clavier sur grand écran, astuce dans l'état vide.
Ouvrir une notion → la carte s'ouvre centrée sur le nœud, panneau de note ouvert.

### 3.5 Plan du site (routes)
```
#/                      Bibliothèque  (Aujourd'hui + Mes cours + Récemment modifiées)
#/cours/:id             Cours         (cartes du cours, progression, Réviser ce cours)
#/carte/:id             Éditeur       (vue Carte)
#/carte/:id/plan        Éditeur       (vue Plan — fiche imprimable)
#/reviser[/cours|carte/:id]  Session de révision
(overlay) Recherche · Réglages · Guide de démarrage
```
Toute notion est à **≤ 3 interactions** de l'accueil.

---

## 4. Système de design (Material Design 3)

### 4.0 Règle permanente — pas de surlignage de contour
- **Aucun contour décoratif** (outline, bordure, liseré) autour des cartes, des sections, des groupes de réglages ni des composants « carte blanche ». Un contour n'embellit pas l'interface : il la charge.
- **Il n'est pas nécessaire pour rendre un élément visible** : le contraste tonal entre l'élément et son fond (paliers `surface-container-*`) suffit, et au besoin l'élévation (ombre douce en clair, palier plus clair en sombre).
- Les contours restent réservés à ce qui est fonctionnel : anneau de focus clavier, nœud de carte dont la forme encode le type, guides de niveau du Plan, grilles des tableaux. Les champs sont **remplis** (M3 *filled text field* : `surface-container-highest` + indicateur bas), les chips et filtres sont tonals.

### 4.1 Couleur — Material 3 Expressive, rôles tonals
Direction retenue : **« Contexte »** (n° 8 des dix pistes) — l'Expressif M3 avec la barre d'outils flottante, la bibliothèque rangée en dossiers.

**Schéma de l'application** : palettes *baseline* statiques Material : **Static Blue** (primaire T40 `#1157CE`, conteneur T90 `#D0E4FF`), **Static Blue variant** pour le tertiaire (`#006788`), secondaire bleu-gris (teinte HCT 262, chroma 14), neutres bleutés très peu saturés (chroma 7) et **fond blanc pur** `#ffffff` (l'ancien `#fdfaff` tirait sur le gris-violet). Les rôles « on-container » sont descendus de quelques tons HCT (teinte conservée) pour tenir **WCAG AA et APCA Lc ≥ 75**.

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `primary` / `on-primary` | `#1157ce` / `#fff` | `#a9c9ff` / `#001944` | action principale, valeur active |
| `primary-container` | `#d0e4ff` | `#04409f` | héros (session du jour, paquet), FAB, barre vibrante |
| `secondary-container` | `#dbe2f5` | `#3f4756` | état sélectionné (rail, groupes de boutons, menus) |
| `surface` → `surface-container-highest` | `#ffffff` → `#e1e2ea` | `#111319` → `#32353b` | fonds ; une surface posée est un palier plus haut |
| `error-container` | `#ffdad6` | `#93000a` | « À revoir », suppression |

- **Séparer par la tonalité, jamais par un filet** (§4.0) : rail `surface-container-low`, page `surface`, cartes `surface-container-lowest` (clair) ou `-high` (sombre), lignes de liste segmentée séparées par 2 dp de vide.
- **Couleur du cours, limitée aux zones du cours** : 8 teintes (`HUES` 28 · 58 · 150 · 186 · 214 · 248 · 284 · 332). Clair : *SchemeContent* ; sombre : tonalités HCT dédiées (conteneur T30 chroma ≤ 44, texte T92) — le *content* officiel éclaircissait les dossiers en pastel, le *vibrant* devenait fluo. Six rôles par teinte (`--c-pc/onpc/pri/onpri/sc/onsc`, `js/mark.js`) ; la classe `.course-scope` remappe `primary`, `primary-container` et `secondary-container` sur ceux du cours. Hors d'un cours, l'interface reste bleue.
- **Le surligneur devient un contenu** : `--hl-mark` (`#ffe171` / `#554600` en sombre) sert uniquement à `==texte==` dans les notes et aux passages trouvés par la recherche. Il ne décore plus aucun titre ni bouton.
- **États de révision et types de nœuds** restent lisibles sans couleur (forme, pastilles ○ ◔ ◑ ●).

### 4.2 Typographie — échelle M3 Expressive
- **Interface** : *Plus Jakarta Sans* (une seule famille, *brand* = *plain*) — Display / Headline 700 avec un approche de −0,02 em, Title 600, Label 600, Body 400.
- **Contenu juridique** : *Source Serif 4* (`--font-serif`) pour la jurisprudence, la doctrine, les citations, les études, les théories et les blocs cités : le registre éditorial reste là où il a un sens.
- **Code et articles** : *JetBrains Mono*.
- Sur-titres en casse de phrase, plus aucune capitale forcée (`text-transform: uppercase` retiré de toute l'interface).

| Rôle | L | M | S |
|---|---|---|---|
| Display | 57/64 | 45/52 | 36/44 |
| Headline | 32/40 | 28/36 | 24/32 |
| Title | 22/28 | 16/24 | 14/20 |
| Body | 16/24 | 14/20 | 12/16 |
| Label | 14/20 | 12/16 | 11/16 |

### 4.3 Grille, forme, mouvement des composants
- **Grille 4 dp**, espacements 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 ; marges 16 dp (compact) / 24 dp.
- **Formes** : xs 4 · s 8 · m 12 · l 16 · li 20 · xl 28 · xli 32 · xxl 48 · full. Bibliothèque de formes M3 (*cookie 9*, *cookie 12*) réservée aux **chiffres et illustrations** (nombre de fiches du jour, série, page d'accueil) — jamais à un conteneur de texte.
- **Morphose au toucher** : un bouton plein passe de `full` à `m` en ressort (`--spring-fast` 350 ms) ; l'option choisie d'un groupe de boutons connecté devient ronde.
- **Composants** : groupe de boutons connecté (2 dp, coins intérieurs 8) à la place des boutons segmentés · champs remplis · chips tonales · listes segmentées (2 dp, coins 16 / 4) · FAB `primary-container` · menus coins 16 · voile 32 %.
- Élévation 0–5 en clair ; en sombre, la profondeur se lit au palier tonal (une carte du dessous est plus sombre que celle du dessus).
- Cibles tactiles ≥ 48 × 48 dp.

### 4.3 bis Navigation et actions — rail, dock, barre contextuelle
- **≥ 1200 px** : rail étendu 260 dp — logo, Extended FAB (« Nouveau cours »), destinations (indicateur pilule `secondary-container`), **Mes cours** (pastille de couleur, nombre de fiches dues, cours courant surligné), Réglages en bas.
- **600–1199 px** : rail replié 80 dp, FAB en tête.
- **< 600 px** : le **dock** — une seule pilule flottante (élévation 2) : **Cours · action principale · Réviser**. Les destinations portent icône + libellé, l'active se remplit en `secondary-container` (ressort). Le **centre** reçoit le FAB de la page (« Nouveau cours ») ou son action unique (« ▶ Commencer » sur Réviser), en `primary`, 56 dp, coins 18 qui s'arrondissent à l'appui ; avec une action étendue, les destinations se réduisent à leur icône pour tenir sur 360 dp. La recherche n'y est pas : elle est dans la barre haute de chaque page principale (et `Ctrl/⌘ K`). Choix (skill de décision) : un objet flottant au lieu de trois, l'action sous le pouce au centre ; écartés : FAB séparé (deux objets), encoche de bottom app bar (abandonnée par M3). *Écart assumé* aux recommandations M3 (qui réservent la barre flottante aux actions) : elle libère la hauteur d'une barre de navigation et reste dans la zone du pouce. Elle s'efface au défilement vers le bas.
- **Barre contextuelle** (`app.setActions`) : les pages qui en ont besoin (cours, Réviser, éditeur) déclarent leurs actions ; l'onglet Cours n'en a pas (« Réviser » est dans le héros, « Nouveau cours » est le FAB) ; l'action principale est un bouton plein. Seule, elle flotte comme un FAB étendu (56 dp, coins 16). Sur un cours, la barre est **vibrante** et prend les couleurs du cours ; sur mobile elle remplace la navigation (`replaceNav`). À côté de la navigation, l'action garde un libellé court (« Commencer »).
- **Éditeur** : barre verticale flottante (grand écran) et barre vibrante flottante (mobile) ; panneau de note en *side sheet* tonal sans filet.

### 4.4 Types de nœuds — trois apparences (v4.1)
Une silhouette par type faisait du bruit. Depuis la v4.1, **trois apparences** seulement ; le type reste (sur-titre, question de révision, rangement), le niveau se lit par la **typographie**.

| Apparence | Types | Traitement |
|---|---|---|
| **Notion** | chapitre, section, sous-section, paragraphe, leçon, notion | aplat sombre (encre ou teinte), coins larges |
| **Idée** | idée, définition, à retenir, méthode, étape, conseil, exercice, date, chiffre, formule | inchangée : discrète, sans bordure |
| **Référence** | citation, texte, jurisprudence, doctrine, étude, personne | serif italique, filet gauche, fond `surface-container-low` |

- **Style par nœud** (`color`, `w` 80–720, `h` 40–600, `r` 0–40, `font`, `fs` 10–64, `bold`, `pre`) ; par carte `typeColors{type}` (« tous les … ») et `calm` 0–1 (stabilisateur). Valeurs hors bornes retirées par `sanitize` : les anciennes cartes s'ouvrent intactes.
- **Couleur** : 12 teintes nommées + ardoise, partagées nœuds et liens ; chaque apparence dérive ses aplats en OKLCH (clair/sombre, contraste ≥ 4,5:1). Ordre de priorité : nœud › type › réglage global « Couleurs ».
- **Typographie** : 23 polices Google Fonts chargées à la demande (`R.fonts.ensure`), défauts par niveau dans `S.TYPO_LEVELS` ; le sélecteur `ui.fontPicker` (champ « Aa » qui se déplie : familles avec pastille qui glisse, liste où chaque police s’écrit dans sa graphie avec le titre du nœud en aperçu, sélection qui suit par ressort, flèches et lettres au clavier, Échap replie ; polices chargées à l’approche par IntersectionObserver) ; `--nf`, `--nfs`, `--nfw` sur le nœud ; le gabarit de rangement tient compte de la taille et des dimensions manuelles.
- **Liens** : `style{c, w 1–8, dash, shape, arrow}`, ancres `a1/a2 {s: t|r|b|l, t: 0–1}`, courbure `bend{x,y}` ; libellé ≤ 80 caractères. Poignées : anticipation à la prise, rebond au lâcher (Illusion of Life), `prefers-reduced-motion` respecté.
- **Peigne supprimé** (faisceaux implicites, dents, empilement) ; fourches explicites et ET/OU gardées. **Stabilisateur** : 0 = courbes libres, 1 = coudes orthogonaux ; entre les deux, interpolation par abscisse curviligne puis lissage Catmull-Rom.

#### Historique : différenciation monochrome par type (jusqu'à v4.0)
| Type | Sur-titre | Traitement |
|---|---|---|
| Notion | — | plein inversé (encre), forme XL |
| Définition | DÉFINITION | bordure pleine 1.5 px |
| Condition de fond | FOND | bordure fine standard (le sur-titre suffit) |
| Condition de forme | FORME | bordure double |
| Effet / Régime | EFFET | fond `surface-container-high` |
| Exception | EXCEPTION | bordure pointillée |
| Jurisprudence | JURISPRUDENCE | italique serif |
| Texte | TEXTE | chiffres en mono |
| Idée | — | discret, sans bordure |
| Doctrine | DOCTRINE | serif droit, coins alternés |
| Exemple | EXEMPLE | bordure pointillée fine (points) |
| À retenir | À RETENIR | fond `primary-container` — seul type « accent », car c'est ce qu'on retient |
| Question | QUESTION | bulle (coin inférieur gauche cassé) |
| Méthode | MÉTHODE | filet épais à gauche ; ses étapes s'affichent en frise fléchée |
| Comparaison | COMPARAISON | doubles filets gauche et droite |
| Piège | PIÈGE | tirets encre + hachures légères |
| Citation | CITATION | italique serif, filet gauche, fond `surface-container-low` (annotation) |
| Personne | PERSONNE | pilule |
| Date | DATE | filet épais en haut, chiffres tabulaires ; 3–6 dates sœurs = frise chronologique |
| Chiffre clé | CHIFFRE | grand chiffre gras tabulaire |
| Formule | FORMULE | mono, fond `surface-container-low` |

| Cause / Conséquence | CAUSE / CONSÉQUENCE | coins arrondis côté sortie / côté entrée (la forme « pointe » dans le sens de la causalité) |
| Condition | CONDITION | filet gauche 4 px |
| Problème / Solution | PROBLÈME / SOLUTION | fond appuyé + filet tireté / bordure encre 2 px arrondie |
| Argument / Critique | ARGUMENT / CRITIQUE | filet à gauche / filet à droite (pour / contre) |
| Nuance | NUANCE | tirets clairs, titre en italique |
| Avantage / Inconvénient | AVANTAGE / INCONVÉNIENT | filet en haut / filet en bas |
| Caractéristique / Catégorie / Signe | … | bordure fine / cartes empilées / filet pointillé |
| Étape / Conseil / Exercice / Objectif | … | titre semi-gras / coins alternés sur fond doux / lignes de cahier / anneau de cible |
| Étude / Théorie | ÉTUDE / THÉORIE | serif italique (annotation) / serif, coins alternés |

Le menu *Type* range les 43 types en familles : **Structure**, **Notion**, **Cause et effet**, **Raisonner**, **Agir**, **Repères**, **Sources**, **Droit** (Condition de fond, Condition de forme, Effet / Régime, Exception — vocabulaire juridique, réservé aux cours de droit) et **Compléments**. Les types universels évitent de plaquer le vocabulaire juridique sur un cours d'histoire, de sciences ou de développement personnel.

**Structure d'un cours** (`rank` 1 → 3) — la hiérarchie se lit au premier regard par la taille, la graisse et l'encre, toujours sans couleur :

| Type | Sur-titre | Traitement |
|---|---|---|
| Chapitre | Chapitre *n* (pastille `secondary-container`) | plein inversé, serif 26 px, angles 10 px, élévation 2 |
| Section (et Leçon) | SECTION *n* | bordure encre 2,5 px, serif 21 px |
| Sous-section | SOUS-SECTION *n* | bordure 2 px, sans-serif 16 px semi-gras |
| Paragraphe (v4.1) | PARAGRAPHE *n* | apparence Notion, typographie du niveau |

- **Numérotation automatique** : rang parmi les frères du même type (dans l'ordre vertical du plan) ; pas de numéro quand le type est seul à son niveau.
- **Jauge de branche** : maîtrise de tout ce qui descend du nœud (barre de 4 px, `scaleX`, 360 ms).
- **Liens « colonne vertébrale »** : les liens hiérarchiques issus d'un chapitre ou d'une leçon sont plus appuyés (2,4 px) ; l'épaisseur décroît avec la profondeur (2,6 → 2 → 1,5 px).
- **Disposition « Libre » (préférée par défaut)** : rendu fait à la main, inspiré des cartes XMind. Base centrée **sans colonnes alignées ni peignes**, puis un léger désordre déterministe par nœud (±34 px en profondeur, ±14 px en hauteur, transmis à toute la sous-branche) et un **éventail** (les frères des extrémités se rapprochent du parent). Les liens partent étalés sur le flanc du parent et déjà orientés vers leur enfant (bouquet), chacun sa courbe. Garde-fous : écart parent → enfant ≥ 64 px (+7 px par enfant au-delà de 4, plafond 120), chevauchements écartés, et **l'amplitude baisse (100 → 55 → 25 → 0 %) tant qu'un lien traverse un nœud ou qu'un libellé masque un texte** — le désordre est permis, pas le fouillis. Banc d'essai (16 cartes réelles) : 0 nœud traversé, 0 croisement, 0 libellé masqué. Les dispositions droites (vers la droite, centrée, pyramide) restent au choix dans *Disposition*.
- **Distance de sécurité (toutes dispositions)** : deux nœuds gardent toujours ≥ 16 px entre eux (écarts : appuis 16, feuilles 20, groupes 26–28). Une passe finale `separate()` pousse le nœud trop proche avec toute sa sous-branche, le long de l'axe des frères. Un nœud a **la même taille sur tous les écrans** (plus de largeur réduite sur mobile), et à l'ouverture d'une carte les nœuds collés (ancienne version, autre police) sont écartés sans tout re-ranger. Banc d'essai : 16 cartes × 5 dispositions, écart minimal 16 px (avant : 6 px, 49 cas sous 16 px).
- **Constructions de lecture** (dispositions droites) : *frise* fléchée pour 3–6 étapes d'une méthode ou 3–6 dates ; *annotations* en retrait pour les appuis (exemple, arrêt, doctrine, texte, citation, personne) ; « À retenir » détaché par un espace.
- **Aides à la lecture** (activées par défaut, ⋮ → Disposition) : une teinte douce par branche principale sur les traits seulement (OKLCH, angle d'or entre branches, nœuds toujours monochromes) et des pastilles d'ordre 1, 2, 3… sur les branches principales qui ne sont pas déjà numérotées.
- **Zoom sémantique** : sous 45 %, le contenu s'estompe (opacité 0,5) et seuls les sur-titres de structure restent affichés.
- **Mini-fonctions** : « Réviser ce chapitre / cette leçon » (révision limitée à la branche, route `#/reviser/carte/:id/:nœud`), « Isoler » (replie les autres nœuds du même type, cadre la branche), sommaire dans le panneau, enfant par défaut qui suit le plan (Chapitre → Leçon), raccourcis `Alt 1–3`.
- **Plan** : la structure devient des intertitres et la numérotation I. A. 1. a) repart sous chacun ; « À retenir » est un encadré hors numérotation.

### 4.4 bis Couleurs des nœuds (option)
Monochrome par défaut (60/30/10 intact). L'option **Couleurs des nœuds** (Réglages, ou ⋮ dans une carte) **ajoute** une teinte par type sans retirer la forme : *teinte = famille, forme = type* — on repère d'un coup d'œil et la distinction survit au daltonisme et à l'impression.
- **Familles** : Structure bleue, Notion chaude, Sources vertes, Compléments violets (À retenir ambre, comme le surligneur) ; variations de teinte dans la famille, même luminance/chroma OKLCH.
- **Daltonisme** : palette d'Okabe & Ito (Wong, *Nature Methods* 2011) sur 7 types clés ; au-delà de ~8 couleurs on ne distingue plus de façon fiable, les autres types restent monochromes.
- **Perso** : 12 nuances harmonieuses (teintes à 30°, luminance et saturation perçues égales) ou n'importe quelle couleur ; partir d'un préréglage le copie, rien n'est perdu.
- **Intensité** : *douce* (fond pâle, bordure colorée, pour lire longtemps) ou *vive* (aplat de la couleur). Notion et Chapitre gardent un aplat soutenu : ce sont les ancres visuelles.
- **Lisibilité garantie** : chaque couleur est déclinée en OKLCH (fond, bordure, texte, sur-titre) pour le thème clair et le sombre ; le texte est poussé vers le noir ou le blanc jusqu'à un contraste WCAG ≥ 4,5:1 (vérifié sur toutes les palettes : pire cas 4,52). En Perso, les paires de types trop proches (écart OKLab < 0,05) sont signalées.
- **Légende** (panneau de la carte) et pastilles dans le menu Type ; bascule rapide Afficher/Masquer dans ⋮. Plan, impression et révision restent monochromes.

### 4.4 ter Relations d'abord, définitions modulaires

La mémoire fonctionne par association : une carte se lit comme une suite de phrases, pas comme une liste d'enfants typés pendus à une section.

- **Le libellé porte la relation, le type porte la question.** Une arête parent → enfant peut porter un libellé (« entraîne », « a pour cause », « illustré par », « sauf », « de qui ? ») ; la consigne de révision les reprend (« Donne la définition — désigne · de qui ? · à qui ? ») et la réponse les affiche en italique devant chaque élément.
- **Branches libellées** : ≥ 2 enfants de même relation sous un parent qui en a d'autres partagent un `group` et un libellé au pluriel (« conséquences ») écrit une fois sur le tronc. Pas de branche quand le titre du parent nomme déjà la liste (« Les 10 signes », « Pourquoi… ? »).
- **Chaînes** : l'effet sous la cause qui le produit, l'exemple sous l'élément précis qu'il illustre.
- **Définitions modulaires** : la note garde le texte intégral ; les composantes (`idee`) s'enchaînent selon la phrase (qualification « c'est », cœur « désigne », compléments sous le cœur, « notamment » sous ce qu'il précise) ; la révision déroule toute la chaîne ; le fragment qu'on oublie en récitant est mis en relief (`node.em`, `mark.node-em` : teinte tertiaire, sans contour).
- **Le rangement audite l'organisation** (`js/organize.js`, seconde ligne de contrôle après le skill d'import) : après « Ranger », un snackbar signale ce qu'il a trouvé ; Carte ⋮ › « Améliorer l'organisation… » ouvre la liste en trois groupes, avec en tête la part de relations nommées et le budget de renvois :
  - **Établi par la carte** (coché) : un élément NOMME l'autre dans une phrase affirmative, un `[[Titre]]` est précédé de son verbe (« contredit [[X]] »), le texte d'une définition de droit, le type posé par l'auteur sous une notion. Libellés manquants (un verbe par parent, une proposition par parent), libellé vague remplaçable, renvoi en double, exemple rattaché à l'élément qu'il nomme (un seul), branches quand le parent mêle plusieurs familles, cause → effet entre éléments d'une section (couples de types `CAUSAL_PAIRS`).
  - **Probable — à vérifier** (décoché) : mots rares partagés, mention dans une note (« fait appel à »), sens tiré des seuls types (inversion), définition hors droit.
  - **À corriger à la main** (signalé, jamais corrigé) : sens douteux, boucle (cercle vicieux possible) ou contradiction (« entraîne » et « empêche »), libellé vague sans indice, lien vers un intitulé, renvoi `[[ ]]` ambigu, liste plate, sens causal inconnu, prérequis défini plus loin dans le cours, définition écrite dans le titre.
- **Garde-fous** : jamais de verbe posé depuis un intitulé (section, chapitre, question) ni depuis une liste nommée ; jamais de libellé-nom (« conseil », « définition ») ; jamais de lien tiré d'une phrase négative (« n'entraîne pas », « ne pas confondre ») ; pas de raccourci transitif (sous une notion, ses causes et conséquences restent reliées à elle) ; budget de renvois (nœuds ÷ 5, entre 2 et 8, une fourche = un renvoi ; 3 au plus vers une même notion) ; découpage de définition abandonné au moindre doute (« soit… soit », relative, négation, morceau sans fonction, mot non repris tel quel) ; texte des nœuds jamais réécrit ; `check` (deux parents, cycle, nature inconnue, branche d'un seul membre, renvoi parallèle à l'arbre) comparé en ENSEMBLES avant/après — toute violation nouvelle annule l'application ; refus mémorisés pour la session ET connus du moteur (un élément refusé redevient disponible) ; second audit vide (idempotence).
- **Révision** : une définition décomposée est UNE fiche (ses composantes ne sont pas révisées seules) : consigne « Donne la définition — c'est · désigne · de qui ? · à qui ? (attention à la portée) », réponse = texte exact puis chaîne en retrait ; ailleurs, la consigne garde le nombre d'éléments à retrouver ; la réponse montre les renvois (« Relié à », 3 au plus) ; pour un exemple, une cause, une conséquence… le parent (qui EST la réponse) est masqué dans le fil d'Ariane jusqu'à la réponse ; les fiches nouvelles arrivent dans l'ordre du plan (carte la plus ancienne, ordre de lecture).
- **V4 — décider seul ce qui est établi** (`docs/audit-organisation-3.md`) : le moteur lit les **phrases des notes** (connecteur orienté + mention exacte d'un autre nœud + position sujet/objet ; contre-signaux : négation lue titre masqué, question, hypothèse, débat, citation, réserve) ; le **rôle** d'un nœud se lit par relation (un maillon de chaîne est l'effet de l'un et la cause du suivant ; un conseil sous un piège le « résout ») ; trois niveaux : **établi** (≥ 2 familles de preuves, aucun contre-signal) → appliqué au rangement, vérifié une correction à la fois (`applyVerified` : intégrité, effet réel, texte conservé ; ce qui casse est défait seul) et tracé (`map.organizeLog`) ; **plausible** → proposé décoché ; **incertain** → signalé, rien ne change. Ordre : identité (retypage « Exemple : », fusion de doublons frères) → structure (rattachements dits par le texte, cardinalité « les 4 paliers », séries annoncées, décomposition recâblée selon la phrase) → branches et libellés, sur la carte déjà corrigée. Refus gardés avec la carte (`map.organizeDeclined`) : *Annuler* après un rangement vaut refus. Jamais de suppression d'un lien parce qu'il ressemble à un doublon ou ferme une boucle.
- **Une seule source de règles** : `RULES`, `REL`, `LEX`, `CAUSAL_PAIRS` vivent dans `js/organize.js` ; `node tests/skill-rules.cjs --write` les recopie dans le skill (`normative_core`, ligne `RULES=` du validateur), et les tests échouent s'ils divergent.
- **Tests et mesure** : `node tests/organize.test.cjs` (cas A–H, 15 cas adversariaux, révision, accord skill) ; `node tests/metrics.cjs [cours.json]` (pièges, verbes depuis un intitulé, libellés-noms, sens contraires, intégrité, idempotence, texte conservé, relations nommées, fiches, durée), comparable à une version antérieure via `PIONEER_ORGANIZE=… PIONEER_STORE=…`.

### 4.5 Classes de fenêtre M3 → composition
compact < 600 · medium 600–839 · expanded 840–1199 · large 1200–1599 · extra-large ≥ 1600 (§6).

### 4.6 Cours — des dossiers (dans « Mes cours » seulement)
Dans « Mes cours », un cours est un **dossier fermé qui s'ouvre** ; partout ailleurs il se reconnaît à sa couleur seule (pastille dans le rail et la bande de révision, carré tonal à icône « cours » dans la recherche et la révision par cours), comme dans la maquette.
- **Dossier** (`.fiche`, `js/views/library.js`) : le dos (conteneur du cours assombri, intérieur plus sombre) avec son onglet à congé concave ; dedans, une **fiche bristol** (la prochaine fiche : filet d'en-tête à la couleur du cours, lignes pâles ; papier clair aussi en sombre) et, s'il y a plusieurs nœuds, une seconde feuille teintée ; devant, la façade (conteneur du cours, reflet en haut, encoche du pouce) porte le titre, l'avancement et « Réviser ». **Fermé au repos** : des feuilles on ne voit qu'un liseré et un bout par l'encoche. Ni contour ni icône.
- **Ouverture** : deux nombres animés par ressort (`@property --flap`, `--lift`) pilotent tous les calques, comme une timeline Lottie : la façade bascule vers soi autour de son pli (reflet qui balaie, haut qui s'assombrit), la feuille sort avec un léger dépassement et pivote, la seconde suit en éventail, l'ombre de la façade glisse sur la feuille. Fermeture : la feuille rentre d'abord, puis la façade se rabat. 1re visite : les premiers dossiers s'ouvrent l'un après l'autre puis se referment.
- **Interaction — on tire les feuilles** : le geste fait sortir le bout des feuilles du dossier ou les y repousse, avec trois détentes : **fermé** (0), **entrevu** (.45, façade à demi rabattue) et **ouvert** (1). Souris : survol ou focus = entrouvert (.3), appui = ouvert, appui **glissé** vers le haut/bas = on tire/on repousse. Tactile : doigt posé = entrevu (annulé si on défile) ; **appui long** (380 ms, vibration) = ouvert et tenu, puis glisser tire ou repousse sans faire défiler la page (`touch-action: none` sur `.is-held`) ; lâché fermé, on n'est plus tenu ; un toucher ailleurs ou un défilement range tout. Clavier : ↑ ↓ passent d'une détente à l'autre. Toucher la feuille lance la révision sur cette fiche ; le titre (lien étiré) ouvre le cours ; le clic qui suit un glisser ne navigue pas. Mouvement réduit : valeurs posées sans trajet.
- **Moteur (library.js `foldGestures`)** : un ressort par couche, image par image, sur des propriétés enregistrées (`--lift` fiche, `--lift2` seconde feuille, `--flap` façade, `--stretch`). Principes d'*Illusion of Life* et du *Survival Kit* appliqués : **manipulation directe** (la fiche suit le doigt 1:1) et **élastique** au-delà des bornes (c = .55) ; **projection** au lâcher (vitesse × .099 s, décélération « rapide » d = .99 d'Apple, WWDC18) qui choisit la détente ; **ressorts** ζ ≈ .8 (k 320, c 29 : léger dépassement, *follow-through*) ; **chevauchement / drag** : la seconde feuille, plus molle (k 210, ζ ≈ .72), arrive après, la façade (k 460) mène ; **étirement** selon la vitesse (*squash & stretch* : jusqu'à +7 %/−5 %, avec un léger pivot de la tête qui traîne) ; **anticipation** : à l'ouverture programmée la fiche part d'abord vers le bas ; **poids** : le dossier s'enfonce quand on repousse au-delà de fermé ; **action secondaire** : ombre portée et reflet suivent la façade ; un cran haptique à chaque détente franchie. Interruptible : un nouveau toucher reprend la feuille là où elle est, sans retour au départ.
- **États de la feuille** : *Prochaine fiche* · *À jour* (prochaine échéance) · *À compléter* · *Dossier vide* (→ Nouvelle carte).
- **Compact** : deux dossiers par ligne (titres 15 px, question sur 2 lignes, « Réviser » réduit à ▶ + nombre).
- **Page d'un cours** : en-tête de section pleine largeur au conteneur du cours, prolongé par la barre haute de la même couleur (« Cours », titre, description) ; les chiffres viennent dessous sur la surface. **Chaque action à un seul endroit** : la barre vibrante porte les deux actions fréquentes (« ▶ Réviser » en forte emphase, « + Nouvelle carte » — sur grand écran, c'est le FAB du rail) ; le menu ⋮ de la barre haute porte le reste (Modifier, Exporter, Supprimer).

### 4.6 bis Accueil — la boîte de Leitner (v4.2.0)
Le héros de l'accueil est une **boîte de Leitner en vraie 3D CSS** (`js/leitner.js`, `css/leitner.css`) : six compartiments (0 · 1 j · 3 j · 7 j · 15 j · 30 j), un intercalaire crème à onglet par boîte, les fiches en bristol ligné au filet de la couleur du cours (fanion tertiaire si à réviser), la plaque « N à réviser » sur la face avant. Les faces sont la couleur primary ombrée selon leur orientation (lumière en haut à gauche).
- **Caméra libre (v4.2.0)** : on fait tourner la boîte comme un vrai objet, qui suit le doigt (lacet et tangage, tous angles, même de dos). Souris : glisser. Doigt : glissé d'abord vertical (puis libre) ou deux doigts ; le glissé horizontal reste réservé au parcours des fiches. Élan à la relâche (la cible est le point où l'élan porte, ressort presque critique), butées élastiques en tangage (−88° / +6°). Trois vues prédéfinies au bouton cube (ou V) : trois quarts (défaut), face, dessus — par le plus court chemin. Clavier : ↑/↓ inclinent, Maj+←/→ tournent. Le cadrage se calcule à chaque image sur les 8 coins aux angles courants : l'échelle est celle des vues prédéfinies et ne baisse que si l'angle libre l'exige (pas de zoom en tournant). Le doigt désigne une fiche par projection sur l'axe de la boîte à l'écran (marche sous tous les angles). La scène est en `touch-action: none` : on fait défiler la page ailleurs.
- **Parcourir du doigt** : le doigt (ou la souris) écarte les fiches autour de lui ; chaque fiche franchie reçoit une chiquenaude dans le sens et à la vitesse du geste ; vibration légère à chaque intercalaire. La ligne sous la boîte dit ce qui est désigné.
- **Sortir une fiche** : toucher → elle s'enfonce (anticipation), monte, vient face à soi devant toute la boîte, le reste s'assombrit ; toucher la fiche lance la révision dessus ; toucher ailleurs ou Échap la range — elle retombe et ses voisines encaissent le choc. Toucher un intercalaire le soulève.
- **Principes d'animation** (Illusion of Life / Animator's Kit) : ressorts physiques partout (aucune durée fixe), anticipation, suivi et chevauchement (penchés amortis différemment fiches/intercalaires), écrasement-étirement de la boîte à l'arrivée, action secondaire (voisines), arcs (sortie en deux temps : monter puis venir), mise en scène (assombrissement), timing par raideur.
- Fiches dessinées en 2× puis réduites : texte net une fois sortie. `prefers-reduced-motion` : poses directes, sans ressort.
- Option écartée pour l'instant : **la pile de feuilles** vue de face qui s'ouvre en changeant d'angle — gardée en réserve.

### 4.6 ter Dans un cours — le classeur
Un cours ouvert est un **classeur à anneaux** : les niveaux de structure sont des **intercalaires à onglet**, les cartes des **feuilles blanches perforées** (`css/views.css` « Dans un cours : le classeur », `css/binder.css`, `js/binder.js`).
- **Intercalaire** (`.part`) : carte 160 g teintée (8 teintes pastel `Binder.TABS`, une par dossier, en boucle), grain papier, ombre de feuille et reflet intérieur ; **onglet** décalé en escalier (`--tab-at` = rang mod 5, pas de 17 %) qui porte le chiffre romain ; un trou de perforation à gauche de l'en-tête ; titre en serif, libellé en capitales. Un sous-dossier (`.unit-row.is-folder`) est un petit intercalaire à sa couleur.
- **Feuille** (`.unit-row.is-map`, `.map-card`) : 80 g **blanc uni** (`--blanc #fbfbf8`, grain SVG), sans réglure ni quadrillage ; trous perforés dessinés en dégradé (bord ombré + halo) ; survol : la feuille se soulève de 1 px, ombre plus large, pas de voile d'état.
- **Sombre** : le papier reste du papier — il garde ses encres de jour et n'est que légèrement assourdi (`--blanc #e9e8e2`), comme la fiche bristol (§4.6). Même règle pour le **carnet de révision** : feuilles blanches unies, encres de jour, en clair comme en sombre.

### 4.7 Réviser — paquet du jour, session, relevé
- **Paquet du jour** : héros `primary-container` (coins 48), le nombre de fiches dans un *cookie 12* `primary` ; taille de session en groupe de boutons connecté (choix en `primary`, lisible sur le conteneur). « Commencer » vit dans la barre contextuelle.
- **Carte de régularité, échéancier, par cours** : cartes tonales ; l'échéancier empile les fiches par couleur de cours ; chaque cours a sa marque dans un anneau de maîtrise.
- **Session** : la fiche est une carte tonale à bande de la couleur du cours (`--c-sc`), sans réglure ; les cartes restantes sont deux paliers dessous. Les notes forment une barre flottante en verre dépoli (flou 18 px, filet, ombre en trois couches) portant trois touches égales, chacune à son accent : *À revoir* `error`, *Compris* ambre (#a35f00 / sombre #ffb95c), *Maîtrisé* `primary` ; au repos une teinte à 9 % et l'icône de maîtrise dans un disque plein à l'accent. **Au toucher** : l'encre à l'accent se répand depuis le point d'appui (clip-path, 380 ms), la touche choisie se gonfle (×1,04, ressort) et son icône tourne, les deux autres reculent (×,94, opacité .32), vibration, puis la barre part 260 ms plus tard et le verdict s'écrit au stylo rouge. Plus de question « Tu la connaissais ? » visible (libellé d'accessibilité du groupe).
- **Fin** : série dans un *cookie 12*, relevé tonal.
- Contrastes vérifiés par audit automatisé (WCAG 2.2, 13 écrans × mobile / bureau × clair / sombre) : 0 défaut réel.

### 4.x Marque Pioneer (logo)

- **Idée** : le *p* minuscule est un fanion planté. Le fût est la hampe, enfoncée sous la ligne de base. La panse est un quart de disque R144 centré sur le coin haut-gauche du p, avec un contre-poinçon R110. Ce quart de disque fait écho à la forme M3 Expressive *Fan*.
- **Unités** :
  - hauteur d'x 144 ; fût 34 (≈ 144/φ³) ; horizontales 31 ; dépassement 3.
  - jambage 55 (144 : 55 ≈ φ²).
  - congés : 8 à l'extérieur, 5 à l'intérieur.
  - largeur du mot 966.
- **Fichiers** :
  - `brand/pioneer-logo.html` : construction, étapes, tests et exports.
  - `brand/logo*.svg`, `brand/icon-reverse.svg`, `brand/maskable.svg`.
  - `icons/icon.svg`, `favicon.svg`, les PNG 180/192/512 et la version maskable.
- **Dans l'app** :
  - `logo()` affiche la tuile `--primary` avec le p en `--on-primary`.
  - `wordmark()` affiche le mot-symbole en `currentColor`, haut de 24 px, dans le rail étendu.
- **Taille minimale** : 20 px pour le mot-symbole. En dessous, l'icône seule.

---

## 5. Motion design
*(Thomas & Johnston — The Illusion of Life ; Richard Williams ; Willenskomer — UX in Motion ; Apple — Designing Fluid Interfaces ; Emil Kowalski ; Material 3 & IBM Carbon)*

### 5.1 Diagnostic
- **Régime** : *productif* à 90 % (sélectionner, créer, relier, écrire — des dizaines de fois par séance), *expressif* à 10 % (fin de session, « Maîtrisé », onboarding, première visite).
- **Personnalité** : *précis, studieux* — plutôt léger, précis, calme. Aucun rebond dans le travail ; un léger overshoot réservé aux moments expressifs.
- **Règle de fréquence** : plus une animation est vue souvent, plus elle est courte et discrète. Les actions clavier répétées ne s'animent pas (sélection au clavier sans balayage).

### 5.2 Tokens (un seul système, CSS et JS)
**Personnalité** : précise et calme (≈ 90 % productif : 100–260 ms, aucun rebond visible), avec des accents expressifs M3 réservés aux formes et aux moments rares. Curseurs : plutôt léger · précis · calme.

| Token | Valeur | Rôle |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` (out-quint) | entrées, réponses au geste |
| `--ease-in` | `cubic-bezier(0.55, 0.055, 0.675, 0.19)` (in-cubic) | sorties définitives (≈ 70 % de l'entrée) |
| `--ease-in-out` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | déplacement visible (caméra, Ranger) |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | feuilles, container transform |
| `--ease-pop` | `cubic-bezier(0.34, 1.56, 0.64, 1)` (out-back) | **expressif uniquement** (badge, succès) |
| `--effects` | `cubic-bezier(0.34, 0.8, 0.34, 1)`, `--dur-effects` 200 ms | couleur, opacité (jamais de ressort) |
| `--dur-xs / sm / md / lg / xl` | 100 / 160 / 240 / 360 / 560 ms | appui · sorties, menus · composants · dialogues, pages · expressif |

**Ressorts M3 Expressive**, calculés par un solveur physique (masse 1) puis exportés en `linear()` ; chaque token a sa durée = temps d'établissement réel (repli Bézier sans `linear()`). JS les lit dans le CSS (`R.motion.springCss`) : une seule source.

| Ressort | ζ · raideur | Durée | Dépassement | Usage |
|---|---|---|---|---|
| `--spring-fast` | 0,6 · 800 | 400 ms | 9 % | morphose de forme (coins d'un bouton, FAB), pastille active |
| `--spring-default` | 0,8 · 380 | 460 ms | 1,4 % | relâchement d'un appui, FAB qui naît, feuille du dossier, cookie qui tourne |
| `--spring-std-fast` | 0,9 · 1400 | 200 ms | ≈ 0 | petits déplacements de layout |
| `--spring-std` | 0,9 · 700 | 260 ms | ≈ 0 | retour d'un geste (snackbar), cartes |
| `--spring-std-slow` | 0,9 · 300 | 390 ms | ≈ 0 | grandes surfaces |

Règle : **entrées en ease-out** (un ressort parti du repos démarre lentement, il paraît en retard sur une entrée) ; **ressorts pour les changements d'état et le retour d'un geste** (interruptibles, ils gardent la vélocité). Ressorts JS (geste) : `ui` 400/40, `snappy` 500/36, `drawer` 380/38 ; inertie : décroissance exponentielle.

**Chorégraphies ajoutées avec la DA « Contexte »** :
- **Appui** : enfoncement immédiat (scale .97, 100 ms out) et coins qui se resserrent ; au relâchement, retour au ressort par défaut, coins au ressort rapide (seul rebond de l'interface, sur la forme).
- **Dossiers (1re visite)** : chaque dossier monte fermé (12 px, 300 ms, décalage 40 ms), puis, décalé de 90 ms par dossier, **le volet du rabat bascule vers soi** autour de sa charnière (anticipation −6°, chute accélérée jusqu'à 90°, 360 ms), le rabat encaisse (dépassement 10° → −3° → 0, 460 ms out) et **la feuille sort** (translateY 34 → 0 et se met de biais, ressort par défaut) sans quitter le dossier : son bas reste sous le rabat. `data-motion="reduce"` : état final direct. Survol : on tire la feuille (−8 px, −2,5°).
- **Post-it de correction (carnet)** : la hauteur du carnet ne change jamais ; l'encre rouge qui ne tient pas est coupée au mot (« … suite ↓ ») et continue sur 1 à 3 post-it jaunes (au-delà, le dernier défile). Chaque post-it apparaît en l'air (280 ms out), s'écrit au stylo, puis se pose : anticipation, arc, étirement, écrasement au contact, coin décollé en suite, ombre qui se resserre (880 ms). Réduit : fondu seul ; « passer » termine tout.
- **Cookies** (session du jour, paquet, flamme de fin) : la forme grandit (scale .72 → 1, ressort) et tourne d'un lobe et demi (−45° → 0, 560 ms out) ; le chiffre, lui, reste droit (la rotation est portée par `::before`). Changer la taille de session fait tourner le cookie **d'un lobe (30°)** dans le sens de la variation : même silhouette, état lisible ; le compte défile.
- **Barre flottante** : elle monte en fondu quand elle apparaît (16 px, 240 ms) ; le FAB / « Commencer » naît de son centre (scale .8 → 1, ressort) ; une mise à jour de la même page ne rejoue pas l'entrée, seul le libellé « tique ».
- **Snackbar balayée** : la vitesse du doigt se prolonge (durée = distance restante / vitesse, 120–260 ms).
- **Transitions de page** : axe Z pour avant / arrière (scale ± 2–3 %, sortie 160 ms in, entrée 240 ms out +60 ms) ; **fade-through** entre destinations voisines (sortie 90 ms, entrée 210 ms, scale .96 → 1) ; container transform pour les éléments partagés (dossier → en-tête du cours, fiche → carte de révision).

### 5.3 Spécification
| Élément | Propriété | De → à | Durée | Courbe | Principe |
|---|---|---|---|---|---|
| Bouton (press / relâche) | scale | 1 → 0.97 → 1 | 100 / 160 | out | squash, feedback |
| Page (hiérarchie) | scale + opacité, axe Z | 0.97 → 1 / 1 → 1.02 | 240 (+60 délai) / 160 | out / in | sortie avant entrée, overlap |
| Fiche de cours → page du cours | container transform (View Transitions) : la bande papier devient l'en-tête, l'empreinte md → lg, le titre glisse | bande → en-tête | 360 (contenu : fondu 240, +120) | drawer / out | continuité spatiale, un seul héros |
| Fiche → révision | container transform : la feuille devient la carte de révision, la question devient son titre | fiche → carte | 360 | drawer | la promesse tenue : même question, même place |
| Vignette → canvas | élément partagé | vignette → canvas | 360 | drawer | continuité |
| Fiche (survol, pointeur fin) | feuilles dessous en éventail, feuille −2 px, ombre (opacité) | +2 px / +1,2° par couche | 240 | out | anticipation douce, lecture de l'épaisseur |
| Fiche (appui) / Réviser | scale | 1 → 0.985 / 0.97 | 100 | out | feedback |
| Emplacement d'ajout (survol / focus, pointeur fin) | les pointillés se referment en feuille pleine (feuille fantôme : opacité + scale .965 → 1), puis la pastille s'encre de jaune depuis son centre (.6 → 1) et le + tourne de 90° | — | 240, pastille +40 | out (retour 160 in) | staging : la feuille, puis l'action |
| Dossier → classeur (entrée dans un cours) | le classeur sort du dossier (ressort, anticipation vers le bas), la couverture s'ouvre sur sa charnière, la caméra se redresse de face (ressort k 190), puis on plonge dans l'intercalaire (zoom), la page change sans View Transition (`R.app.go(hash, {still:true})`), puis fondu de la scène | dossier → page du cours | ressorts, ≈ 1,9 s ; scène retirée < 3,2 s | ressort | anticipation, arcs, follow-through, staging, chevauchement ; réduit : page directe, sans scène |
| Emplacement d'ajout (appui) | feuille scale 1 → .985, pastille 1 → .9 (squash) ; au toucher, l'appui déclenche aussi l'encre | — | 100 | out | feedback, l'appui remplace le survol sur mobile |
| Emplacement → formulaire | le dialogue naît du centre de l'emplacement (transform-origin) et y retourne ; l'emplacement reste « prêt » tant qu'il est ouvert | scale .9 → 1 / → .94 | 280 / 180 | out / in | continuité spatiale (origine = destination) |
| Lecture seule (interrupteur) | le cadenas se referme (scale .8 → 1, −2 px → 0), la pastille s'assombrit, le libellé suit (opacité + 4 px) | — | 240, libellé +40 | out | changement d'état lisible ; les outils d'édition disparaissent |
| Lecture seule (action refusée) | la pastille oscille une fois (±3 px) + message « Carte en lecture seule · Modifier » (au plus une fois toutes les 2,5 s) | — | 320 | out | feedback sans bloquer ; l'information n'est pas portée par le seul mouvement |
| Révision : fiche suivante | **est** la première feuille du paquet : part de sa géométrie exacte (7 px, 96 % de large, sans ombre) et se pose ; son contenu suit en fondu (+80 ms) ; la feuille du fond remonte d'un cran puis s'efface | translateY 7 → 0, scaleX .96 → 1 | 240 | out | continuité spatiale, follow-through |
| Révision : actions | l'ancien jeu sort (−4 px, opacité) puis le nouveau entre (+6 px → 0) avec 50 % de chevauchement ; les notes gardent leur cascade de 30 ms | — | 100 in / 240 out (+50) | in / out | sortie avant entrée, un seul jeu lisible |
| Révision : noter (clavier / bouton) | le tampon de la note frappe la fiche (scale 1.5 → 1), la fiche accuse le coup (.99), puis part dans sa direction ; la suivante entre à 260 ms | — | 140 + 220 | out / in | feedback tactile, anticipation courte ; au glisser, pas de tampon (déjà visible) |
| Réviser : paquet du jour | survol : la fiche du dessus se soulève (−3 px, −1°), les feuilles suivent avec 20 ms de retard chacune ; 1re visite : elles s'ouvrent en cascade (40 ms) | — | 240 / 360 | out | affordance, follow-through |
| Réviser : taille de session | **sur place** : une feuille ajoutée glisse depuis sous la fiche jusqu'à sa place, une feuille retirée s'y range (ease-in) ; le compte défile de l'ancienne valeur à la nouvelle (interruptible : seule la dernière demande écrit) | — | 240 in / 160 out ; 320 | out / in ; expo | continuité, value change |
| Réviser : tampons | 1re visite : les tampons de la carte de régularité frappent dans l'ordre des jours (45 ms), aujourd'hui en dernier ; l'anneau de maîtrise se trace ; le tampon du nombre dû frappe après sa ligne | scale 1.5 → 1 | 240 (+320…) / 560 / 240 (+380) | out | récompense, lecture gauche → droite |
| Réviser : échéancier (1re visite) | les fiches se **posent** cours par cours, du bas vers le haut : chaque segment tombe de 10 px ; 35 ms d'écart par jour, 70 ms par cours ; le surligneur balaie « Auj. » | −10 px → 0 | 280 (+220…) / 560 (+300) | out | empilement lisible, hiérarchie temporelle |
| Réviser : légende ↔ données | survoler (souris), toucher (épingle) ou focaliser un cours de la légende garde ses segments nets et estompe les autres (opacité .22) ; survoler un segment éclaire sa légende | — | 160 | out | lien données ↔ légende, sans jamais rien déplacer |
| Réviser : répartition du paquet | le trait se trace de gauche à droite, un cours après l'autre (scaleX depuis la gauche) | 0 → 1 | 360 (+460, 60 ms/cours) | out | lecture gauche → droite |
| Réviser : tampons rouges « À revoir » | frappent après l'arrivée de leur fiche (même geste que les tampons bleus) | scale 1.5 → 1 | 240 (+420, 40 ms/fiche) | out | cohérence des encres |
| Fiche cornée / ligne « À retravailler » → carte | container transform : la fiche cliquée devient le nœud dans sa carte (la transition part de l'élément cliqué) | — | 360 | drawer | continuité |
| Fin : relevé | le ticket **s'imprime** (révélation de haut en bas + 10 px, le texte n'est jamais étiré) ; chaque ligne compte quand elle apparaît (90 ms d'écart) ; le tampon frappe en dernier | — | 520 (+200) / 560 / 240 (+900) | out | pic-fin, hiérarchie temporelle |
| Révision : compteur | « 3 / 10 » tique quand il change | 4 px, opacité .35 → 1 | 160 | out | value change |
| Révision : réponse longue (petit écran) | défilement doux jusqu'au début de la réponse si elle commence sous 55 % de la hauteur | — | natif (smooth) | — | l'œil suit la réponse |
| Réviser → session | container transform : « Commencer » → première fiche ; ligne d'un cours (ou en-tête du cours) → bande de la fiche, empreinte comprise ; retour symétrique | — | 360 | drawer | continuité ; la première fiche n'a pas d'entrée propre |
| Réviser : taille de session | mise à jour sur place : l'indicateur glisse, le bouton « Commencer · n » tique ; la page ne se reconstruit pas | — | 240 / 160 | in-out / out | ancrage visuel, défilement conservé |
| Révision : Annuler | la fiche revient du côté où elle était partie (← / → / ↑), réponse déjà ouverte ; la fiche courante redescend dans le paquet | ±70 %, 20 px, rotation → 0 | 300 (retour) / 160 (descente) | out / in | réversibilité visible |
| Révision : indice | la structure apparaît sous la consigne : opacité + 4 px | — | 240 | out | divulgation progressive |
| Réviser : prévisions | barres en scaleY depuis la base, cascade 30 ms, 1re visite seulement | 0 → valeur | 560 (+200) | out | value change ; aujourd'hui au surligneur |
| Recherche (ouverture) | le panneau naît de son déclencheur (onglet, icône ; transform-origin sur lui) : scale .94 → 1 + opacité ; scrim 240 ; sans déclencheur (Ctrl K), descend de 8 px | — | 240 (mobile plein écran : 360 drawer) | out | continuité spatiale ; l'onglet Rechercher s'allume tant que le panneau est ouvert |
| Recherche (contenu) | lignes : opacité + 6 px → 0, à l'ouverture seulement (pas pendant la frappe) | cascade 20 ms, 10 max | 240 (+60) | out | follow-through ; fréquence → aucune animation par frappe |
| Recherche (sélection) | la ligne active se teinte (couche d'état, opacité) ; pas de trait latéral | — | 160 | out | un seul état visible, la sélection suit le pointeur |
| Recherche → résultat | container transform : la ligne devient sa destination — cours → bande de l'en-tête (empreinte xs → lg, titre), carte → canvas (vignette), notion → le nœud dans la carte ; le panneau s'efface avec l'ancienne page | — | 360 | drawer | la promesse tenue : ce qu'on a choisi est ce qu'on retrouve |
| Recherche (fermeture) | retour vers le déclencheur : scale .97 + opacité | — | 160 | in | sortie plus courte que l'entrée |
| Empreinte (1re visite de la session) | centre, puis branches en tracé, puis feuilles | pop 160 · tracé 420, cascade 35 ms (max 6) · feuilles +330 | ≈ 0,7 s | out | staging, cascade bornée ; jamais rejoué ensuite |
| Dialogue | opacité, scale, y | 0.96, 8 px → 1 | 280 / 180 | out / in | staging (scrim 200 ms) |
| Menu | scale depuis le déclencheur | 0.96 → 1, items +12 ms | 160 / 100 | out / in | follow-through |
| Tooltip | opacité | 0 → 1 (400 ms de délai, 0 ensuite) | 120 | out | — |
| Snackbar | y depuis le bord | 100 % + 16 px → 0 | 360 / 200 | out / in | pause au survol, swipe |
| Nouveau nœud | translate court depuis le côté du parent + opacité (taille fixe) | 18 px → 0 | 240, cascade 20 ms | out | **clonage** : le lien se dessine depuis le parent et arrive pile sur son bord |
| Nouveau lien | stroke-dashoffset | 0 → longueur | 240 | out | tracé synchrone |
| Repli / dépli | translate + scale vers / depuis le parent | — | 200 / 240 | in / out | relation parent-enfant |
| Suppression | scale + opacité | 1 → 0.92 | 160 | in | pas d'anticipation (fréquent) |
| Sélection | trait `primary` sous le titre | 0 → 100 % | 200 (0 au clavier) | out | signature |
| Prise / dépôt d'un nœud | élévation (ombre du pseudo-élément), **taille fixe** | ombre 0 → 1 | 160 | out | les liens restent accrochés au bord (M3 : un élément déplacé s'élève, il ne grossit pas) |
| Ranger (et changement de disposition) | x, y | pose → pose, +24 ms par niveau | 440 (+120) | x out, y in-out | **arcs**, overlap |
| Caméra (ajuster, centrer) | transform | durée ∝ √distance | 200–480 | in-out | — |
| Pan relâché | transform | inertie | — | décroissance | momentum |
| Panneau docké | contenu translate + opacité | 24 px → 0 / → 32 px | 240 / 160 | out / in | interruptible (reverse) |
| Feuille latérale / bottom sheet | translateY / X | crans | 360–420 / 240–280 | drawer / in | ressort + vélocité, rubber band |
| Carte de révision | entrée / sortie | 24 px → 0 / arc ±8° | 300 / 220 | out / in | direction = note |
| Swipe de révision | x lié au doigt, tampons liés à x | — | ressort | snappy | parenting, momentum |
| Fin de session | flamme, titre, bilan, barres, compteurs | séquence 4 temps | ≈ 1 s | pop / out | pic-fin, value change |
| Thème | clip-path circulaire depuis le geste | 0 → rayon | 560 | in-out | masking |

**Règle : jamais de `scale` sur un nœud relié.** Les liens s'accrochent à la boîte réelle du nœud ; un nœud grossi (même 3 %) déborde et paraît détaché de ses liens. Appui = luminosité, cible / sélection multiple / liaison réussie = anneau surligneur (pseudo-élément ou `box-shadow`), prise = élévation. Seule la suppression garde un léger rétrécissement : ses liens disparaissent en même temps.

### 5.4 Performance
On n'anime que `transform` et `opacity`. Ombres portées par des pseudo-éléments dont seule l'opacité change ; grille de points sur son propre calque (translation modulo un pas) ; `will-change` posé seulement pendant le mouvement (le texte reste net après un zoom) ; panneau docké animé en `transform`, jamais en largeur ; barres de progression en `scaleX`.

### 5.5 Accessibilité
Réglage *Animations : Système / Réduites / Complètes*. En mode réduit, déplacements, zooms et boucles deviennent des fondus de 120–150 ms ; pas de View Transitions, pas de particules, pas d'inertie. Aucune information n'est portée par le seul mouvement (le shake d'erreur s'accompagne d'une bordure et d'un libellé rouges). Pas de boucle décorative infinie : la flamme vacille deux fois puis se pose ; seul l'anneau d'attente du mode « Relier » respire tant que l'action est en cours.

## 6. Composition par écran

### Mobile (compact, Android)
- **Bibliothèque** : barre supérieure (titre + réglages), carte « Aujourd'hui » en tête (déclencheur), cours en liste 1 colonne, **FAB** « Nouveau cours » au-dessus de la **barre de navigation basse** (zone du pouce — loi de Fitts).
- **Éditeur** : canvas plein écran ; barre d'outils **en bas** (Ajouter, Relier, Ranger, Ajuster, Masquer) ; quand un nœud est sélectionné, la barre bascule en **barre contextuelle** (Enfant, Note, Relier, Type, ET/OU, Supprimer) ; la note s'ouvre en **bottom sheet** à crans (mi-hauteur / plein écran). Pincer pour zoomer, glisser pour déplacer, appui long = menu contextuel.
- **Révision** : carte plein écran, boutons de notation en bas à portée du pouce, glisser la carte ← / → pour noter.

### Tablette (medium / expanded)
- **Rail de navigation** à gauche avec FAB intégré. Grille de cours 2–3 colonnes.
- **Éditeur** : barre d'outils flottante verticale ; la note s'ouvre en **feuille latérale modale** (droite).

### Desktop (large / extra-large)
- Rail + bibliothèque en grille ; colonne « Aujourd'hui » à droite (≥ 1200).
- **Éditeur** : disposition M3 **« supporting pane »** : canvas + panneau de note **docké** à droite (redimensionne le canvas), barre contextuelle flottante au-dessus du nœud, poignée « + » à glisser pour créer/relier, raccourcis clavier complets (Tab, Entrée, F2, Suppr, flèches, Ctrl Z/Y, Ctrl K…).

---

## 7. Lois de l'UX appliquées
| Loi | Application |
|---|---|
| Jakob | Conventions d'XMind / Miro : Tab = enfant, Entrée = frère, double-clic = éditer, Ctrl Z. |
| Fitts | Actions fréquentes en bas sur mobile, cibles 48 dp, poignée « + » collée au nœud. |
| Hick | Barre principale ≤ 5 actions ; le reste par divulgation progressive (barre contextuelle, menu ⋯). |
| Miller / chunking | La décomposition elle-même ; sessions de révision limitées à 20 cartes. |
| Tesler | « Ranger » calcule la mise en page ; la sauvegarde est automatique. |
| Lisibilité des diagrammes (Purchase 1997 ; Ware et al. 2002 ; Purchase et al. 2010) | Le moteur de rangement minimise d'abord les liens qui traversent un nœud et les libellés qui cachent un texte, puis les croisements et la longueur des renvois ; colonnes alignées par niveau ; l'ordre du cours n'est jamais permuté. Trois dispositions (droite · centrée · pyramide) notées sur l'écran réel, choix automatique ou imposé. |
| Similarité / continuité (Gestalt) | Hiérarchie = courbes pleines qui arrivent sur un côté ; renvois = pointillés fléchés (courbe, courbe déviée ou coudé selon ce qui est le plus net) qui arrivent par un autre côté : deux canaux visuels qu'on ne confond pas — le pointillé et la flèche distinguent, pas l'angle droit. |
| Doherty | Réponse < 100 ms à chaque geste, indicateur « Enregistré ». |
| Zeigarnik / Goal-gradient | Barre de progression de maîtrise par carte/cours ; barre de session qui s'accélère vers la fin. |
| Pic-fin | Écran de fin de session soigné (bilan + série + éclat). |
| Proximité / région commune / similarité | Groupes visuels (cartes), nœuds d'un même type partagent un traitement. |
| Postel | Import JSON tolérant (réponse d'IA collée, balises, virgules finales, guillemets typographiques, cartes orphelines, positions absentes) avec aperçu de ce qui a été corrigé ; recherche insensible aux accents. |
| Prévention des erreurs / réversibilité | Import « Ajouter en copie » par défaut (identifiants neufs en cas de collision, rien d'écrasé), « Compléter » pour la suite d'un cours, « Tout remplacer » confirmé, et *Annuler* après chaque import. |
| Esthétique-utilisabilité | Monochrome soigné, un seul accent. |
| Occam | Pas de dossiers imbriqués, pas de compte. |

## 8. Modèle Hooked (Nir Eyal)
1. **Déclencheur** — externe : carte « Aujourd'hui · N cartes à réviser » en tête de l'accueil ; interne : l'anxiété des partiels → l'app est le réflexe.
2. **Action** — un seul tap « Réviser » (rail, barre basse, carte Aujourd'hui).
3. **Récompense variable** — *de soi* : jauge de maîtrise, série de jours, éclat « Maîtrisé » ; *de la chasse* : ordre des cartes mélangé.
4. **Investissement** — chaque carte construite et chaque note écrite alimentent les futures révisions ; la fin de session annonce « prochaine révision : demain · N cartes » (charge le prochain déclencheur).
