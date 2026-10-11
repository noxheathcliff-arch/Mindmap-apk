---
name: ratio-livre-vers-cours
description: Transforme un livre, un PDF de cours, un polycopié ou des notes en un cours complet pour l'application Ratio (JSON importable avec cartes mentales typées, notes Markdown, liens étiquetés). À utiliser quand l'utilisateur fournit un document et demande des cartes, des fiches ou un cours Ratio.
---

# Ratio — Compilateur Livre → Cours

La spécification complète est dans `ratio_book_to_course_compiler_v1.2.json` (même dossier). **Lis-la en entier avant de commencer**, puis applique son `pipeline` (P0 → P7) sans sauter de phase, avec ses `modeling_patterns` (énumérations, exemples, questionnaires, méthodes, sources défectueuses).

## L'essentiel

- **Sortie** : un bloc ```json au format `{"format":"ratio","version":2,"kind":"course","courses":[…1 cours…],"maps":[…]}`, suivi d'un court rapport en français.
- **Une carte = un chapitre** (ou une unité de révision). Racine de type `chapitre` dont la note dit la thèse.
- **Un nœud = une idée rappelable.** Le titre est l'indice ; la note et les enfants sont la réponse. Le type choisit la question posée en révision (`node_types`).
- **Énumérations du livre → nœuds enfants**, avec le cardinal exact, et `logic: "et"` (cumulatifs) ou `"ou"` (alternatifs).
- **Notes** : réponse d'abord, 2–10 lignes, une seule idée en `==surligné==`, `**gras**` pour 2–5 mots-clés, `>` pour les citations exactes, tableaux pour les comparaisons, `- [ ]` pour les exercices, `[[Titre]]` pour renvoyer à un nœud de la même carte.
- **Renvois** : 0–4 liens `kind:"link"` par carte (6 max au-delà de 30 nœuds), entre parties voisines, toujours étiquetés (`implique`, `s'oppose à`, `remédie à`, `sauf`, `voir`…), fourches avec `group`.
- **Omettre** `x`, `y`, `review`, `viewport` ; mettre `"needsLayout": true` sur chaque carte ; nœuds dans l'ordre de lecture.
- **Fidélité** : rien d'inventé ; un complément indispensable est marqué *(complément)*.
- **Valider** avec `self_check.validator_python` si tu peux exécuter du code, sinon avec `self_check.manual_checklist`, jusqu'à zéro erreur.
- **Lisibilité (readability_rules)** : racine à 3–6 branches homogènes, exemples et arrêts dans la partie qu'ils illustrent (jamais sous un nœud ET/OU), « À retenir » en dernier, 0–4 renvois par carte et seulement entre parties voisines (relation lointaine → `[[Titre]]` dans la note), titres de 15–40 caractères, 15–35 nœuds par carte. Ne fournis pas x/y : Ratio range la carte (facultatif : `layoutPick`).
- **Livre long** : livrer en parties, même id de cours ; l'utilisateur importera les suites avec « Compléter le cours ».
