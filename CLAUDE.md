# Mindmap-apk

## Graphify
Un graphe du code est dans `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`).
Avant de chercher dans les fichiers, interroger le graphe :
- `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`
- lire `graphify-out/GRAPH_REPORT.md` pour repérer les modules et les nœuds centraux
- après des modifications de code : `graphify update .` (local, sans LLM), puis recommiter `graphify-out/`

## Quota
Skill `quota-router` actif à chaque requête (hook `UserPromptSubmit`) : caveman, graphify d'abord, routage Haiku/Opus (low→max).

## Rangement : version du moteur
Tout changement de disposition/rangement (`js/layout.js`, tailles, libellés, ordre) → incrémenter `ENGINE` dans `js/layout.js`.
Au chargement, les cartes rangées par une version antérieure sont rangées à nouveau (`S.relayoutOutdated`), avec « Annuler » à l'ouverture. Cartes `keepPos` / cours « Atelier rangement » : jamais touchées.
