# Refonte des cartes — plan (v4.1)

Objectif : moins de bruit visuel, beaucoup plus de liberté. Trois apparences de nœud, du style à la main
(forme, couleur, typographie), des liens qu'on attrape et qu'on dessine, plus de peigne.

## 1. Trois apparences

| Apparence | Types |
|---|---|
| **Notion** (aplat sombre, coins larges) | chapitre, section, sous-section, paragraphe, leçon, notion |
| **Idée** (inchangée) | idée, définition, à retenir, méthode, étape, conseil, exercice, date, chiffre, formule |
| **Référence** (citation : serif italique, filet gauche) | étude, citation, personne, texte, jurisprudence, doctrine |

- `R.store.look(type)` → `notion | idee | ref`. Classes `look-*` sur le nœud ; les règles `.t-*` de forme disparaissent.
- Particularités gardées : le surtitre (kicker) du type, chiffres tabulaires (date, chiffre), préfixe numéroté.
- Le niveau (chapitre › section › sous-section › paragraphe) se lit par la **typographie**, plus par la forme.

## 2. Nouveau type `paragraphe`

Rang 4 sous la sous-section. Branché partout : TYPES/ordres/groupes, dossiers, couleurs, gabarits de rangement,
`organize` (STRUCT), enfant par défaut, placeholders, skill + compilateur JSON, tests.

## 3. Style par nœud (données)

Nœud : `color` (clé de palette), `w` 80–720, `h` 40–600, `r` 0–40 (arrondi), `font` (clé FONTS), `fs` 10–64,
`bold` (bool), `pre` (préfixe « Paragraphe I » : true/false, absent = réglage du niveau).
Carte : `typeColors{type: clé}` (« tous les <type> »), `calm` 0–1 (stabilisateur).
Réglages : `typo[niveau] = {font, size, bold, prefix}` pour chapitre, section, soussection, paragraphe, lecon,
notion, idee, ref, + `note {font, size}`.
Tout est validé dans `sanitize` (valeurs hors bornes → retirées) : les anciennes cartes s'ouvrent sans rien perdre.

## 4. Couleur

Palette partagée nœuds + liens : 12 teintes nommées (rouge… rose) + ardoise. Le nœud reçoit `--nh` (teinte) et
`.tinted` ; chaque apparence dérive ses aplats en OKLCH (clair/sombre, contraste ≥ 4.5). Portée au choix :
**ce nœud** (`n.color`) ou **tous les <type>** (`map.typeColors[type]`, efface les `n.color` de ce type).
La couleur par nœud prime sur celle du type, qui prime sur le réglage global « Couleurs ».

## 5. Typographie

~22 polices (sans, serif, display, mono, manuscrites), chargées à la demande (`R.fonts.ensure`) via Google Fonts ;
le sélecteur montre chaque police dans sa propre graphie. Défauts par niveau proches du rendu actuel.
Le nœud porte `--nf`, `--nfs`, `--nfw` ; le gabarit de rangement (`layout.estimate`) tient compte de la taille
et des dimensions manuelles. Préfixe en chiffres romains pour les niveaux de structure.

## 6. Liens

Lien : `style{c, w 1–8, dash solid|dash|dot, shape auto|curve|straight|elbow, arrow auto|none|end|both}`,
ancres `a1/a2 {s: t|r|b|l, t: 0–1}`, point de courbure `bend{x,y}` (décalage depuis le milieu des ancres),
libellé **80 caractères**.
- Un lien sélectionné montre trois poignées : départ, arrivée (aimantées au bord le plus proche), courbure.
- Un lien retouché sort de son faisceau et se dessine seul.
- Nouvelle fiche du lien : en-tête « de → vers », champ contouré avec compteur, mes libellés + suggestions,
  apparence (couleur, épaisseur, trait, forme, flèche, portée lien/fourche), ancres, « Réinitialiser le tracé ».
  Aperçu en direct, Annuler restaure, Valider = un seul pas d'annulation.

## 7. Peigne → stabilisateur

Supprimés : faisceaux implicites « c: », dents de peigne, empilement en mode vertical (`stacked`, `combTooth`,
`stackLeaves`). Gardés : fourches explicites (groupe) et ET/OU.
Stabilisateur (curseur dans « Disposition ») : 0 = courbes libres, 1 = coudes orthogonaux propres ; entre les deux,
interpolation par abscisse curviligne puis lissage Catmull-Rom.

## 8. Feuilles

- Note : la feuille du bas s'ouvre **en plein**.
- Fiche « Apparence » du nœud : type/niveau, couleur + portée, forme (largeur, hauteur, arrondi), police, taille,
  gras, préfixe ; poignée de redimensionnement sur le canevas.
- Réglages : section « Typographie des cartes ».

## 9. Motion (M3 Expressive + Illusion of Life)

Ressorts spatiaux pour feuilles et poignées (overshoot léger), effets courts pour couleurs (fondu 200 ms).
Poignées : anticipation (écrasement à la prise), follow-through (rebond au lâcher), arcs. `prefers-reduced-motion` respecté.

## 10. Autour

Skill + compilateur JSON (paragraphe, 80 car.), validateur, tests (peigne retiré), README/DESIGN, cache `pioneer-v4.1.0`,
graphify, déploiement sur la branche de travail.
