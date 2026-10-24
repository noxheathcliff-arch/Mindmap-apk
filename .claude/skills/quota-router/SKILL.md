---
name: quota-router
description: Routage économe en tokens, actif à CHAQUE requête dans ce dépôt. Caveman, graphify avant lecture de code, puis choix du palier le moins cher qui réussit — Haiku low ou Opus low/medium/high/xhigh/max (Sonnet JAMAIS) — avec model + effort explicites sur chaque Agent. But : dépenser le moins de tokens possible en restant efficace.
---

# quota-router

But unique : **coût total minimal pour un résultat correct**. Coût total = tokens du palier × nb d'itérations (+ corrections). Pas « le moins intelligent », mais « le moins cher qui finit le travail ».

## 1. Toujours
- Caveman ON (réponses courtes, sans préambule).
- `graphify query/path/explain` avant tout Read ; lire seulement les lignes utiles.
- Sorties filtrées (`| head`, `grep`, `tail`) ; jamais de dump complet.

## 2. Paliers (indice Artificial Analysis · coût tokens)

| Palier | Indice | Coût relatif | Pour |
|---|---|---|---|
| **Haiku low** | 29 | très bas | reformuler, classer, extraire des champs d'un doc court, fonction simple à spec claire, erreur évidente, résumé sans analyse contradictoire, recherche/grep/git/tests |
| **Opus low** (DÉFAUT) | 42 | bas | comparer des solutions, consignes imbriquées, bug local à cause non évidente, modif de feature limitée, synthèse de plusieurs sources, livrable pro bien borné |
| **Opus medium** | 51 | ≈ low + 16k | plusieurs modules dépendants, enquête dans un repo inconnu, plan technique multi-étapes, analyse de long corpus, recoupement de sources, ensemble cohérent de livrables |
| **Opus high** | — | ≈ 36k | refacto transversal, debug d'interactions entre composants, longues séquences d'outils, recherche profonde à sources contradictoires, livrable pro à nombreuses vérifs |
| **Opus xhigh** | — | ≈ 66k | idem high quand high a échoué ; rarement mieux que high → préférer high |
| **Opus max** | — | ≈ 119k | quasi jamais : problème très dur, recherche spécialisée, long agentique à essais multiples, synthèse décisionnelle complexe |

**Sonnet : JAMAIS.** Opus low (42) bat Sonnet medium (41) pour bien moins de tokens.

## 3. Décider (dans cet ordre)
1. **Haiku suffit ?** Tâche mécanique / spec claire → Haiku low. Sinon Opus low.
2. **Faut-il juste du 1er coup ?** (push, migration, livrable envoyé, action irréversible) → monter d'un cran plutôt que risquer un aller-retour coûteux.
3. **Itérer en bas coûte moins ?** Si 1–2 itérations d'un palier inférieur atteignent le même niveau → rester bas.
4. **Itérer en bas coûte plus ?** Si le palier bas devra boucler (≥3 essais, contexte relu à chaque fois) → monter : un coup en medium < trois en low.
5. **Medium et au-delà : justifier.** Écrire en 1 ligne pourquoi low ne suffit pas (ex. « 4 modules couplés »). Pas de justification → low.
6. **Descendre pour corriger.** Si un palier haut a produit un travail presque juste, les retouches légères vont au palier bas (medium écrit, low corrige ; Opus code, Haiku lance tests/lint).
7. **Escalade** : 2 échecs au même palier → palier suivant, jamais deux crans d'un coup sauf blocage évident.

## 4. Délégation (Agent)
- **Toujours** passer `model` (`haiku`|`opus`) **et** `effort` explicites. Haiku → `effort: low`.
- Agents : `haiku-worker` (Haiku low), `opus-worker` (Opus, effort choisi par appel), `quota-triage` (tri si doute).
- Déléguer seulement si ça économise : une tâche courte que la session principale sait déjà faire reste en local (un agent repart à froid et relit le contexte).
- **Un agent capable** quand la tâche est cohérente et liée (le découpage ferait relire le même contexte N fois).
- **Plusieurs agents** quand les parties sont indépendantes ou de niveaux différents :
  - Haiku low collecte (grep, lecture, logs, sources) → Opus low/medium synthétise / décide.
  - Opus medium écrit → Haiku low teste → Opus low corrige.
- Prompt d'agent : but, fichiers/nœuds graphify précis, critère de fin, format de sortie court (≤15 lignes). Pas de contexte superflu.
- Max 3 agents parallèles ; pas de boucles d'agents ; pas de re-vérification redondante.

## 5. Hygiène du contexte
- Ne pas relire un fichier déjà vu ; ne pas rédiger de récap inutile.
- `/compact` quand le contexte gonfle ; `/clear` entre tâches sans lien.
- Résumés d'agents filtrés, pas recopiés.

## 6. Suivi hebdo
- `/usage` (ou `ccusage`) en début de session. > 70 % : mode strict — Haiku partout où possible, Opus low max sauf blocage, aucun medium+ sans accord.
