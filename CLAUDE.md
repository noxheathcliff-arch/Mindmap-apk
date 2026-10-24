# Mindmap-apk

## Graphify
Un graphe du code est dans `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`).
Avant de chercher dans les fichiers, interroger le graphe :
- `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`
- lire `graphify-out/GRAPH_REPORT.md` pour repérer les modules et les nœuds centraux
- après des modifications de code : `graphify update .` (local, sans LLM), puis recommiter `graphify-out/`

## Quota
Skill `quota-router` actif à chaque requête (hook `UserPromptSubmit`) : caveman, graphify d'abord, routage Haiku/Opus (low→max).
