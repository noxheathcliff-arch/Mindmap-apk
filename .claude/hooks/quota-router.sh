#!/bin/sh
# Injecte à chaque requête un rappel court pour appliquer le skill quota-router.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"quota-router actif: appliquer .claude/skills/quota-router/SKILL.md (charger le skill au 1er tour). caveman ON; graphify query avant Read; trier T1 haiku-worker / T2 sonnet-worker (défaut) / T3 Opus avec raison; model explicite sur Agent; sorties filtrées; objectif = tenir la limite hebdo."}}
JSON
