---
name: quota-router
description: Routage économe en quota, actif à CHAQUE requête dans ce dépôt. Active caveman, interroge graphify avant de lire du code, choisit le modèle le moins cher suffisant (Haiku / Sonnet / Opus) via un tri rapide, et applique les bonnes pratiques pour ne pas épuiser la limite HEBDOMADAIRE avant la fin de la semaine.
---

# quota-router

But : tenir la semaine. On optimise la limite **hebdomadaire** (et le plafond Opus), pas la fenêtre de 5 h.
Règle d'or : le modèle le moins cher qui fait le travail correctement, le moins de contexte possible.

## 1. Caveman (toujours)
Invoquer `caveman:caveman` au premier tour de la session (une fois suffit, il reste actif).
Réponses courtes. Pas de récapitulatif de ce qui vient d'être fait si le diff le montre.

## 2. Graphify avant toute lecture de code
- Question sur le code → `graphify query "<question>"` (ou `path` / `explain`) **avant** Grep/Read.
- Lire ensuite seulement les lignes citées (`Read` avec `offset`/`limit`), jamais un gros fichier entier.
- Après modification de code : `graphify update .` (local, gratuit), recommiter `graphify-out/`.
- Ne jamais relancer `/graphify` complet (extraction sémantique = coûteuse) sauf demande explicite.

## 3. Routage du modèle (tri à chaque requête)
Classer la requête soi-même en une ligne (pas d'agent pour le tri si c'est évident). Si c'est ambigu, lancer
l'agent `quota-triage` (Haiku) qui renvoie un verdict d'une ligne.

| Niveau | Modèle | Exemples | Exécution |
|---|---|---|---|
| T1 trivial | **Haiku** | question factuelle, recherche web, lecture/synthèse de logs, renommage, typo, lancer tests, git, graphify query | agent `haiku-worker` |
| T2 standard | **Sonnet** | feature locale, bugfix ciblé, tests, refacto 1–3 fichiers, doc | agent `sonnet-worker` |
| T3 difficile | **Opus** | architecture, bug introuvable après 2 essais, refacto multi-modules, conception d'algorithme, revue de sécurité | session principale |

Règles :
- **Toute question de l'utilisateur → déléguer à `haiku-worker` (`model: haiku`)**, même sur le code. La session principale ne répond pas elle-même ; elle relaie la réponse. Exceptions : question purement conversationnelle triviale (oui/non sur la session) ou question T3 explicite (raison en une ligne).
- Par défaut T2. Monter en T3 seulement avec une raison écrite en une ligne.
- La session principale (Opus) ne fait qu'orchestrer pour T1/T2 : elle délègue avec `model` explicite et ne relit pas le travail ligne à ligne.
- Le paramètre `model` de l'outil Agent prime sur tout : toujours le passer (`haiku` / `sonnet`).
- Prompts aux agents : fichier, fonction, résultat attendu, sortie « résumé ≤ 15 lignes ». Jamais « explore le dépôt ».
- Si une tâche T1/T2 échoue deux fois → escalader d'un niveau, pas réessayer à l'identique.
- Conseiller à l'utilisateur `/model sonnet` (ou `opusplan`) comme modèle de session quand la semaine est entamée : la session principale coûte plus que les agents.

## 4. Effort et réflexion
- T1 : effort `low`. T2 : `medium`. T3 : `high` seulement si nécessaire. Ne jamais demander `max` de soi-même.
- Pas de longue réflexion pour une modif mécanique.

## 5. Hygiène du contexte
- Tâche sans rapport avec la précédente → suggérer `/clear` (gratuit) plutôt que continuer.
- Session longue → suggérer `/compact <focus>` une fois, à un point d'étape (le compact coûte lui-même un gros appel).
- Sorties volumineuses (tests, logs, builds, web) → dans un agent Haiku, ou filtrées (`| tail -30`, `grep -E 'FAIL|Error'`).
- Pas de relecture d'un fichier qu'on vient d'éditer. Pas de lecture « pour vérifier » ce qui est déjà en contexte.
- Appels d'outils indépendants en parallèle dans un seul message.
- Ne pas modifier CLAUDE.md / définitions d'outils en cours de session (casse le cache de prompt).

## 6. Garde-fous coûteux
- Pas de Workflow multi-agents ni d'équipe d'agents sans demande explicite. Max 3 agents en parallèle.
- Pas de `/loop`, `send_later` ou tâche planifiée courte sans demande : chaque réveil renvoie tout le contexte.
- Pas de `/graphify` complet, pas de `deep-research` sans demande.
- Plan mode seulement pour les changements T3 multi-fichiers.
- Toujours une vérification bon marché (test ciblé, build) pour finir en une passe.

## 7. Suivi hebdomadaire (rappels à l'utilisateur, une ligne max, rarement)
- `/usage` (touche `w` = vue 7 jours) pour voir la limite hebdo et l'attribution par skill/agent/MCP.
- `/mcp` : désactiver les serveurs inutiles (Vercel, Render… s'ils ne servent pas).
- `npx ccusage` pour l'historique local.
- Si l'utilisateur signale > 70 % de la semaine consommée : passer en mode strict = T3 interdit sans accord, tout en Haiku/Sonnet.
