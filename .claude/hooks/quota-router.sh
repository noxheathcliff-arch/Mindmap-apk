#!/bin/sh
# Injecte à chaque requête un rappel court pour appliquer le skill quota-router.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"quota-router actif: appliquer .claude/skills/quota-router/SKILL.md (charger le skill au 1er tour). caveman ON; graphify query avant Read; paliers haiku-worker (Haiku low) / opus-worker (Opus low défaut, medium+ justifié, max quasi jamais); Sonnet JAMAIS; model + effort explicites sur chaque Agent; descendre de palier pour les retouches; but = coût total en tokens minimal."}}
JSON
