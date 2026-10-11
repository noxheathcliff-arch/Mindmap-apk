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
Tout ce qui sert ces 5 hypothèses, rien d'autre : pas de compte, pas de cloud, pas de collaboration. Les données restent **sur l'appareil** avec **sauvegarde/import JSON** et export Markdown.

**Persistance.** IndexedDB est la base principale : une carte = un enregistrement, seules les cartes modifiées sont réécrites, dans une transaction atomique ; un magasin `media` est prêt pour les images et l'audio. Une **copie miroir** synchrone en localStorage (même format qu'avant, plus `savedAt`) est écrite à chaque sauvegarde tant qu'elle tient sous ~4,5 Mo : elle garantit l'enregistrement si la page est fermée en pleine écriture et reste lisible par les anciennes versions. Au chargement, la copie la plus récente gagne (`savedAt` ; un miroir sans `savedAt` vient d'une ancienne version, donc plus récent). Au-delà de la limite, le miroir est retiré plutôt que laissé périmé. Si IndexedDB est indisponible ou bloqué (délai de garde 2,5 s), l'app retombe sur localStorage seul, comme avant. Le stockage est demandé « persistant » (`navigator.storage.persist`). Une erreur n'est signalée que si aucune copie n'a pu être écrite. Application installable (PWA) sur Android et desktop, fonctionne hors-ligne.

---

## 2. Inventaire de contenu

| Objet | Attributs | Remarques |
|---|---|---|
| **Cours** | titre, description (ex. « M1 · S1 · Pr. X »), dates | Le « dossier unique » demandé. Un seul niveau : pas de sous-dossiers (loi de Tesler : on absorbe la complexité, l'utilisatrice n'a qu'un rangement à faire). |
| **Carte** | titre, cours, nœuds, liens, vue (zoom/position), dates | Une carte = une notion ou un chapitre. |
| **Nœud** | titre, **type**, note (Markdown), position, replié, **logique des enfants (ET/OU)**, état de révision | 15 types (voir §4.4), dont 3 de structure. |
| **Tableau, source** | vivent **dans la note** (Markdown : `| a | b |`, `[titre](https://…)`) | Aucun champ nouveau : export, import, plan, recherche et révision les reçoivent tels quels. Saisie en grille (Loi de Tesler : la syntaxe reste cachée) ; rubrique « Sources » = liens de la note extraits à l'affichage. |
| **Lien** | source, cible, **nature** (hiérarchique / renvoi), libellé, groupe | Hiérarchique = décomposition (trait plein). Renvoi = « voir aussi », « sauf », « implique » (pointillé + flèche). |
| **Fourche** | liens partageant un `group` (même source, même nature, un libellé) | Un tronc, un libellé posé sur le point de séparation, une branche par élément. Chaque branche reste un lien ordinaire : hiérarchie, révision, plan et import n'en dépendent pas. Les enfants d'un nœud ET/OU sont dessinés en fourche implicite (« ET » une seule fois). |
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
Vocabulaire du droit français, constant partout : *Cours, Carte, Notion, Définition, Condition de fond, Condition de forme, Effet / Régime, Exception, Jurisprudence, Texte, Doctrine, Exemple, À retenir, Idée* ; structure : *Chapitre, Leçon, Section*. Logique : *cumulatives (ET)* / *alternatives (OU)*. Révision : *À revoir, Compris, Maîtrisé*. Les libellés d'action sont des verbes (« Nouvelle carte », « Réviser », « Relier »).

### 3.3 Systèmes de navigation
| Type | Implémentation |
|---|---|
| Globale | Barre de navigation (mobile) / rail (tablette, desktop) : **Cours · Réviser · Rechercher** + Réglages |
| Locale | Fil d'Ariane *Cours › Carte* dans la barre supérieure ; bascule **Carte / Plan** |
| Contextuelle | Barre d'actions du nœud sélectionné ; liens `[[Titre]]` dans les notes ; liens de renvoi |
| Supplémentaire | Palette de recherche (Ctrl K) plein texte (titres + notes) ; vue Plan = « index » de la carte |

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

### 4.1 Couleur — règle 60 / 30 / 10, monochrome
| Part | Rôle M3 | Clair | Sombre | Usage |
|---|---|---|---|---|
| **60 %** | `surface`, `surface-container-*` | blancs cassés / gris très clairs | noirs profonds | fonds, canvas, cartes |
| **30 %** | `on-surface`, `inverse-surface`, `outline` | encre quasi noire, gris | blanc cassé, gris | texte, nœud « Notion » plein, traits, icônes |
| **10 %** | `primary` = **Surligneur** `#FFD60A` | | | sélection, action principale (FAB, bouton plein), surlignage `==texte==`, progression |

Le jaune est un **surligneur** : le geste même de l'étudiant en droit. Il n'est jamais utilisé pour du texte sur fond clair (contraste) — toujours en **fond** sous un texte encre (`on-primary` ≈ noir, contraste ≈ 15:1). Effet Von Restorff : la seule couleur de l'écran désigne la seule chose qui compte. Rôle `error` (rouge sourd) réservé à la suppression.

Les types de nœuds et les états de révision sont différenciés **sans couleur** : forme, bordure (pleine / pointillée / double), sur-titre typographique et pastilles de remplissage (○ ◔ ◑ ●) — accessible aux daltoniens et fidèle au monochrome.

**Thème clair — échelle des surfaces et contraste perceptuel** (mesures OKLCH + APCA, la méthode perceptuelle de la future WCAG 3 ; 0 défaut WCAG 2) :
- **Décollement des cartes** : la page passe de L 0,985 à 0,966 (`#f5f4ef`), les cartes et nœuds restent blancs. L'écart page/carte double (0,015 → 0,034) : les éléments se détachent sans ombre lourde ni bordure plus épaisse. Même teinte et même saturation que les gris d'origine : l'identité ne change pas.
- **Paliers réguliers** des conteneurs (~0,014 de luminance) : `#f0efea` · `#ecebe6` · `#e7e6e1` · `#e1e0db`. Les nœuds « Idée » (sans bordure) passent sur le palier `container` pour rester visibles sur le canevas.
- **Texte secondaire** `#3c3c39` : APCA Lc ≥ 80 jusque dans les dialogues (petits sur-titres 11–12 px), sans écraser la hiérarchie avec le texte principal (`#1b1b19`, Lc ≈ 99).
- **Rouge d'action destructrice** `#9e1f18` : Lc 72–74 sur fonds gris (était 67).
- **Sur le jaune**, aucun texte en transparence (il vire au brun-olive) : texte plein, graisse plus légère pour la hiérarchie.
- Les nœuds colorés en intensité douce ont un fond plus clair que la page (L 0,978) : ils restent « posés dessus ».

**Thème sombre — règles vérifiées** (audit automatisé de chaque texte, icône et contour de contrôle, 13 écrans × mobile/desktop × clair/sombre : 0 défaut WCAG restant) :
- **Élévation tonale** : en sombre, ce qui est posé dessus (cartes, nœuds, champs : `surface-container-lowest`) est *plus clair* que la page (`#1b1b19` sur `#121211`), puis les conteneurs montent (`#1f1f1d` → `#343432`). Jamais plus foncé : un élément plus sombre que son fond paraît creusé, et les ombres ne se voient pas la nuit.
- **Encre inversée adoucie** (`inverse-surface` `#cfcec8` au lieu de `#e5e4de`) : nœuds « Notion », infobulles, snackbar n'éblouissent plus.
- **Surligneur sous un titre** : en clair, bande large derrière le texte encre ; en sombre, **même jaune vif en trait fin sous la ligne de base** (`--hl-size` / `--hl-pos`). Un texte clair sur du jaune est illisible, et un jaune assombri ou translucide devient kaki.
- **États sélectionnés** (élément coché d'un menu, case active d'un tableau) : `primary-container` / `on-primary-container` (ambre profond + texte jaune pâle en sombre), jamais un jaune translucide.
- **Contours de contrôles** (chips) en `outline` ≥ 3:1 (WCAG 1.4.11).

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
| Condition de fond | FOND | bordure fine standard (le sur-titre suffit) |
| Condition de forme | FORME | bordure double |
| Effet / Régime | EFFET | fond `surface-container-high` |
| Exception | EXCEPTION | bordure pointillée |
| Jurisprudence | JURISPRUDENCE | italique serif |
| Texte | TEXTE | chiffres en mono |
| Idée | — | discret, sans bordure |
| Doctrine | DOCTRINE | serif droit, coins alternés |
| Exemple | EXEMPLE | bordure pointillée fine (points) |
| À retenir | À RETENIR | fond surligneur pâle (`primary-container`) — seul type « accent », car c'est littéralement ce qu'on surligne |

**Structure d'un cours** (`rank` 1 → 3) — la hiérarchie se lit au premier regard par la taille, la graisse et l'encre, toujours sans couleur :

| Type | Sur-titre | Traitement |
|---|---|---|
| Chapitre | CHAPITRE *n* (pastille surligneur) | plein inversé, serif 26 px, angles 10 px, élévation 2 |
| Leçon | LEÇON *n* | bordure encre 2,5 px, serif 21 px |
| Section | SECTION *n* | bordure 2 px, sans-serif 16 px semi-gras |

- **Numérotation automatique** : rang parmi les frères du même type (dans l'ordre vertical du plan) ; pas de numéro quand le type est seul à son niveau.
- **Jauge de branche** : maîtrise de tout ce qui descend du nœud (barre de 4 px, `scaleX`, 360 ms).
- **Liens « colonne vertébrale »** : les liens hiérarchiques issus d'un chapitre ou d'une leçon sont plus appuyés (2,4 px).
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

### 4.5 Classes de fenêtre M3 → composition
compact < 600 · medium 600–839 · expanded 840–1199 · large 1200–1599 · extra-large ≥ 1600 (§6).

### 4.7 Réviser — un bureau de révision, pas un tableau de bord
Chaque section reprend un objet de l'étudiant en droit, sans quitter le vocabulaire de la fiche :
- **Le paquet du jour** : la session à venir en vrai paquet ; feuilles dessous aux teintes des cours les plus chargés, épaisseur = taille de session (10 · 20 · toutes) ; la fiche bristol du dessus porte le compte au surligneur et le temps sur un petit tampon. Elle devient la première fiche de la session.
- **Carte de régularité** : 7 cases, un tampon encré (nombre de fiches, inclinaison propre au jour) par jour révisé ; aujourd'hui au surligneur.
- **Échéancier** : chaque jour est une pile de fiches vue de profil (une tranche tous les 4 px) ; aujourd'hui en jaune.
- **Par cours** : l'empreinte au centre de son anneau de maîtrise ; le nombre dû en tampon de la teinte du cours.
- **À retravailler** : des fiches cornées (le coin plié = « à reprendre »), en bande horizontale.
- **Session** : la fiche est un bristol (marge rouge, réponse posée sur une réglure de 28 px) ; noter au clavier ou au bouton fait frapper le tampon de la note avant le départ.
- **Fin** : un relevé de session (ticket perforé, points de conduite, total, tampon de la série).

### 4.6 Carte de cours — la fiche et l'empreinte
Une carte de cours n'est pas un dossier décoratif : c'est **la prochaine fiche à réviser**, posée sur la pile du cours.
- **Pile** : 0, 1 ou 2 feuilles dessous selon le nombre de cartes mentales (0, 1–2, 3 et plus). L'épaisseur dit la taille du cours sans un chiffre.
- **Bande papier** (en-tête) : teinte propre au cours, choisie parmi 8 teintes OKLCH (jamais le jaune, réservé au surligneur). Attribution dans l'ordre de création, chaque nouveau cours prend la teinte libre la plus éloignée des autres : les 8 premiers cours sont tous distincts, et la teinte ne change jamais. Encre ≥ 7:1, sous-titre ≥ 4,5:1, en clair comme en sombre.
- **Empreinte** (`js/mark.js`) : sceau génératif dessiné depuis la vraie structure : une branche par carte mentale (plus longue quand elle grossit), des points pour ses nœuds, et **au surligneur la branche qui a le plus de fiches dues**. La silhouette ne dépend que des identifiants : stable d'une visite à l'autre, elle se densifie avec le cours. SVG en `currentColor`, aucun asset. Tailles xs 28 / sm 32 / md 44 / lg 72 (recherche, déplacement, carte, en-tête du cours).
- **Corps réglé** (marge rouge pâle, lignes tous les 28 px) : la question de la prochaine fiche (`store.nextCard` : la plus en retard, sinon la première nouvelle de la plus ancienne carte). « Réviser » ouvre la révision **sur cette fiche-là** (`?start=carte.nœud`).
- **Quatre états** : *Prochaine fiche* (question + Réviser + nombre dû) · *À jour* (prochaine échéance, maîtrise) · *À compléter* (des cartes, aucune note) · *Fiche blanche* (aucune carte → Nouvelle carte).
- **En-tête du cours** : la bande papier seule, sans contour ni surligneur sur le titre (la teinte et l'empreinte suffisent à identifier le cours ; le jaune sur une teinte pastel brouillait la lecture).
- **Emplacement « Nouveau cours / Nouvelle carte »** : la place de la prochaine feuille, en pointillés, sans fond ; pastille + cerclée, libellé et une ligne d'aide. Mouvement : voir §5.3 (« Emplacement d'ajout »).
- **Accessibilité** : un seul lien (le titre, étiré sur toute la fiche) ; Options et Réviser restent au-dessus et atteignables au clavier ; anneau de focus sur la feuille.

---

## 5. Motion design
*(Thomas & Johnston — The Illusion of Life ; Richard Williams ; Willenskomer — UX in Motion ; Apple — Designing Fluid Interfaces ; Emil Kowalski ; Material 3 & IBM Carbon)*

### 5.1 Diagnostic
- **Régime** : *productif* à 90 % (sélectionner, créer, relier, écrire — des dizaines de fois par séance), *expressif* à 10 % (fin de session, « Maîtrisé », onboarding, première visite).
- **Personnalité** : *précis, studieux* — plutôt léger, précis, calme. Aucun rebond dans le travail ; un léger overshoot réservé aux moments expressifs.
- **Règle de fréquence** : plus une animation est vue souvent, plus elle est courte et discrète. Les actions clavier répétées ne s'animent pas (sélection au clavier sans balayage).

### 5.2 Tokens (un seul système, CSS et JS)
| Token | Valeur | Rôle |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` (out-quint) | entrées, réponses au geste |
| `--ease-in` | `cubic-bezier(0.55, 0.055, 0.675, 0.19)` (in-cubic) | sorties définitives |
| `--ease-in-out` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | déplacement visible (caméra, Ranger, indicateurs) |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | panneaux, feuilles, morphing de page |
| `--ease-pop` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | **expressif uniquement** (flamme, badge, révélation) |
| `--ease-settle` | ressort `linear()` ζ ≈ 0.85 | dépôt d'un nœud |
| `--dur-xs / sm / md / lg / xl` | 100 / 160 / 240 / 360 / 560 ms | press · hover/menus · composants · panneaux/pages · expressif |

Ressorts (JS, interruptibles, conservent la vélocité) : `ui` 400/40, `snappy` 500/36, `drawer` 380/38. Inertie : décroissance exponentielle (0.994/ms).

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
| Réviser : échéancier | chaque pile monte du sol (translateY dans sa piste, hauteur réelle : les tranches ne se déforment jamais) | 100 % → 0 | 360 (+220, 35 ms/jour) | out | value change sans distorsion |
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
| Sélection | trait de surligneur | 0 → 100 % | 200 (0 au clavier) | out | signature |
| Prise / dépôt d'un nœud | élévation (ombre du pseudo-élément), **taille fixe** | ombre 0 → 1 | 160 | out | les liens restent accrochés au bord (M3 : un élément déplacé s'élève, il ne grossit pas) |
| Ranger | x, y | pose → pose, +24 ms par niveau | 440 (+120) | x out, y in-out | **arcs**, overlap |
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
