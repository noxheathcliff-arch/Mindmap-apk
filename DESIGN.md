# Ratio — Dossier de conception

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
Tout ce qui sert ces 5 hypothèses, rien d'autre : pas de compte, pas de cloud, pas de collaboration. Les données restent **sur l'appareil** (localStorage) avec **sauvegarde/import JSON** et export Markdown. Application installable (PWA) sur Android et desktop, fonctionne hors-ligne.

---

## 2. Inventaire de contenu

| Objet | Attributs | Remarques |
|---|---|---|
| **Cours** | titre, description (ex. « M1 · S1 · Pr. X »), dates | Le « dossier unique » demandé. Un seul niveau : pas de sous-dossiers (loi de Tesler : on absorbe la complexité, l'utilisatrice n'a qu'un rangement à faire). |
| **Carte** | titre, cours, nœuds, liens, vue (zoom/position), dates | Une carte = une notion ou un chapitre. |
| **Nœud** | titre, **type**, note (Markdown), position, replié, **logique des enfants (ET/OU)**, état de révision | 9 types (voir §4.4). |
| **Lien** | source, cible, **nature** (hiérarchique / renvoi), libellé | Hiérarchique = décomposition (trait plein). Renvoi = « voir aussi », « sauf », « implique » (pointillé + flèche). |
| **Carte de révision** | dérivée d'un nœud qui a une note ou des enfants | Boîte de Leitner 0→5, échéance. |
| **Réglages** | thème, série de jours, journal de révision, onboarding | |

---

## 3. Architecture de l'information
*(Rosenfeld, Morville & Arango — Information Architecture for the Web and Beyond)*

### 3.1 Systèmes d'organisation
- **Schéma exact** : par cours (choisi par l'utilisatrice) puis par carte. Tri par date de modification (récent d'abord — c'est ce qu'on rouvre).
- **Schéma ambigu (par sujet/type)** : les types de nœuds (Définition, Fond, Forme…) forment une taxonomie transversale exploitée par la recherche et la révision.
- **Structure** : hiérarchie peu profonde (Bibliothèque → Cours → Carte → Nœud → Note) + **hypertexte** (liens de renvoi entre nœuds).

### 3.2 Système d'étiquetage
Vocabulaire du droit français, constant partout : *Cours, Carte, Notion, Définition, Condition de fond, Condition de forme, Effet / Régime, Exception, Jurisprudence, Texte, Idée*. Logique : *cumulatives (ET)* / *alternatives (OU)*. Révision : *À revoir, Compris, Maîtrisé*. Les libellés d'action sont des verbes (« Nouvelle carte », « Réviser », « Relier »).

### 3.3 Systèmes de navigation
| Type | Implémentation |
|---|---|
| Globale | Barre de navigation (mobile) / rail (tablette, desktop) : **Cours · Réviser · Rechercher** + Réglages |
| Locale | Fil d'Ariane *Cours › Carte* dans la barre supérieure ; bascule **Carte / Plan** |
| Contextuelle | Barre d'actions du nœud sélectionné ; liens `[[Titre]]` dans les notes ; liens de renvoi |
| Supplémentaire | Palette de recherche (Ctrl K) plein texte (titres + notes) ; vue Plan = « index » de la carte |

### 3.4 Système de recherche
Une seule entrée (Ctrl/⌘ K ou onglet Rechercher), insensible aux accents et à la casse, résultats **groupés** (Cours / Cartes / Notions) avec extrait de note et terme surligné. Ouvrir une notion → la carte s'ouvre centrée sur le nœud, panneau de note ouvert.

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

### 4.1 Couleur — règle 60 / 30 / 10, monochrome
| Part | Rôle M3 | Clair | Sombre | Usage |
|---|---|---|---|---|
| **60 %** | `surface`, `surface-container-*` | blancs cassés / gris très clairs | noirs profonds | fonds, canvas, cartes |
| **30 %** | `on-surface`, `inverse-surface`, `outline` | encre quasi noire, gris | blanc cassé, gris | texte, nœud « Notion » plein, traits, icônes |
| **10 %** | `primary` = **Surligneur** `#FFD60A` | | | sélection, action principale (FAB, bouton plein), surlignage `==texte==`, progression |

Le jaune est un **surligneur** : le geste même de l'étudiant en droit. Il n'est jamais utilisé pour du texte sur fond clair (contraste) — toujours en **fond** sous un texte encre (`on-primary` ≈ noir, contraste ≈ 15:1). Effet Von Restorff : la seule couleur de l'écran désigne la seule chose qui compte. Rôle `error` (rouge sourd) réservé à la suppression.

Les types de nœuds et les états de révision sont différenciés **sans couleur** : forme, bordure (pleine / pointillée / double), sur-titre typographique et pastilles de remplissage (○ ◔ ◑ ●) — accessible aux daltoniens et fidèle au monochrome.

### 4.2 Typographie — échelle M3 (taille / interlignage)
Deux familles comme le prévoit M3 (*brand* / *plain*) :
- **Brand** : *Source Serif 4* → Display & Headline (registre éditorial / juridique).
- **Plain** : *Inter* → Title, Body, Label (lisibilité UI).

| Rôle | L | M | S |
|---|---|---|---|
| Display | 57/64 | 45/52 | 36/44 |
| Headline | 32/40 | 28/36 | 24/32 |
| Title | 22/28 | 16/24 (500) | 14/20 (500) |
| Body | 16/24 | 14/20 | 12/16 |
| Label | 14/20 (500) | 12/16 (500) | 11/16 (500) |

### 4.3 Grille de base, espacement, forme, élévation
- **Grille 4 dp**, rythme vertical sur 8 dp ; tous les interlignages sont multiples de 4.
- Espacements : 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- Marges de fenêtre M3 : 16 dp (compact), 24 dp (medium / expanded+).
- Forme : none 0 · xs 4 · s 8 · m 12 · l 16 · xl 28 · full.
- Élévation 0–5 (0/1/3/6/8/12 dp) + couches d'état (hover 8 %, focus 10 %, pressed 10 %, drag 16 %).
- Cibles tactiles ≥ 48 × 48 dp.

### 4.4 Types de nœuds (différenciation monochrome)
| Type | Sur-titre | Traitement |
|---|---|---|
| Notion | — | plein inversé (encre), forme XL |
| Définition | DÉFINITION | bordure pleine 1.5 px |
| Condition de fond | FOND | bordure pleine, coin gauche marqué |
| Condition de forme | FORME | bordure double |
| Effet / Régime | EFFET | fond `surface-container-high` |
| Exception | EXCEPTION | bordure pointillée |
| Jurisprudence | JURISPRUDENCE | italique serif |
| Texte | TEXTE | chiffres en mono |
| Idée | — | discret, sans bordure |

### 4.5 Classes de fenêtre M3 → composition
compact < 600 · medium 600–839 · expanded 840–1199 · large 1200–1599 · extra-large ≥ 1600 (§6).

---

## 5. Motion design
*(Thomas & Johnston — The Illusion of Life ; Animator's kit ; tokens de mouvement M3)*

Courbes M3 : `standard (0.2,0,0,1)`, `emphasized-decelerate (0.05,0.7,0.1,1)`, `emphasized-accelerate (0.3,0,0.8,0.15)`. Durées : short 50–200 ms, medium 250–400 ms, long 450–600 ms. `prefers-reduced-motion` → transitions réduites à des fondus.

| Principe | Où dans Ratio |
|---|---|
| **Squash & stretch** | Boutons et FAB s'écrasent à l'appui (scale .96) ; un nouveau nœud naît en s'étirant légèrement puis se stabilise. |
| **Anticipation** | Un nœud supprimé se gonfle d'abord (1.06) avant de disparaître ; la carte de révision recule légèrement avant de se retourner. |
| **Mise en scène (staging)** | Une chose à la fois : voile (scrim) derrière les feuilles ; mode « Masquer » qui floute tout sauf le nœud révélé ; la sélection est la seule tache de couleur. |
| **Pose à pose** | « Ranger » : chaque nœud interpole de sa pose actuelle vers sa pose calculée (FLIP). |
| **Continuité & chevauchement** | Les listes entrent en cascade (stagger 30 ms) ; le contenu de la feuille arrive après son contenant. |
| **Ralenti début/fin** | Toutes les transitions utilisent les courbes M3, jamais `linear`. |
| **Arcs** | Pendant « Ranger », x et y ont des courbes différentes → les nœuds suivent des **arcs** et non des droites. |
| **Action secondaire** | Le trait de surligneur balaie le titre sélectionné ; la flamme de série vacille. |
| **Timing** | Petits objets = short (100–200 ms), panneaux = medium (300–400 ms), changements de page = long (450–500 ms). |
| **Exagération** | Moment « Maîtrisé » et fin de session : éclat de particules jaunes (pic-fin). |
| **Dessin solide** | Une seule source de lumière (ombres vers le bas), élévations cohérentes. |
| **Attrait** | Signature unique : le **trait de surligneur**, partout où quelque chose devient important. |
| **Lignes « tracées »** | Un nouveau lien se dessine (stroke-dashoffset) de la source à la cible. |

---

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
| Doherty | Réponse < 100 ms à chaque geste, indicateur « Enregistré ». |
| Zeigarnik / Goal-gradient | Barre de progression de maîtrise par carte/cours ; barre de session qui s'accélère vers la fin. |
| Pic-fin | Écran de fin de session soigné (bilan + série + éclat). |
| Proximité / région commune / similarité | Groupes visuels (cartes), nœuds d'un même type partagent un traitement. |
| Postel | Import JSON tolérant ; recherche insensible aux accents. |
| Esthétique-utilisabilité | Monochrome soigné, un seul accent. |
| Occam | Pas de dossiers imbriqués, pas de compte. |

## 8. Modèle Hooked (Nir Eyal)
1. **Déclencheur** — externe : carte « Aujourd'hui · N cartes à réviser » en tête de l'accueil ; interne : l'anxiété des partiels → l'app est le réflexe.
2. **Action** — un seul tap « Réviser » (rail, barre basse, carte Aujourd'hui).
3. **Récompense variable** — *de soi* : jauge de maîtrise, série de jours, éclat « Maîtrisé » ; *de la chasse* : ordre des cartes mélangé.
4. **Investissement** — chaque carte construite et chaque note écrite alimentent les futures révisions ; la fin de session annonce « prochaine révision : demain · N cartes » (charge le prochain déclencheur).
