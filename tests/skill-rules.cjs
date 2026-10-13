/* Accord skill ↔ moteur : les règles chiffrées, le vocabulaire des relations et les sens de
 * lecture n'existent qu'à UN endroit (js/organize.js : RULES, REL, LEX, CAUSAL_PAIRS) et sont
 * recopiés dans le skill (normative_core) et dans son validateur Python (ligne RULES = …).
 *
 *   node tests/skill-rules.cjs          vérifie l'accord (code de sortie 1 si désaccord)
 *   node tests/skill-rules.cjs --write  recopie les règles du moteur dans le skill
 */
'use strict';
const fs = require('fs'), path = require('path');

const dir = path.join(__dirname, '../skills/ratio-livre-vers-cours');
const skillFile = () => path.join(dir, fs.readdirSync(dir).filter((f) => /^ratio_book_to_course_compiler_v[\d.]+\.json$/.test(f)).sort().pop());

/** Ce que le skill doit contenir, calculé depuis le moteur */
function expected(O) {
  const rel = Object.fromEntries(Object.entries(O.REL).map(([t, r]) => [t, { one: r.one, many: r.many }]));
  return {
    rules: { ...O.RULES },
    relation_by_type: rel,
    lexicon_by_direction: JSON.parse(JSON.stringify(O.LEX)),
    causal_pairs: { ...O.CAUSAL_PAIRS },
  };
}
const validatorLine = (exp) => 'RULES=' + JSON.stringify({ rules: exp.rules, lex: exp.lexicon_by_direction }, null, 0);

function compare(skill, O) {
  const exp = expected(O), out = [];
  const core = skill.normative_core || {};
  for (const k of Object.keys(exp)) if (JSON.stringify(core[k]) !== JSON.stringify(exp[k])) out.push(`normative_core.${k} diffère du moteur (node tests/skill-rules.cjs --write)`);
  const v = (skill.self_check || {}).validator_python || '';
  if (!v.split('\n').includes(validatorLine(exp))) out.push('validateur Python : ligne RULES= absente ou périmée (node tests/skill-rules.cjs --write)');
  return out;
}

function write(O) {
  const file = skillFile();
  const skill = JSON.parse(fs.readFileSync(file, 'utf8'));
  const exp = expected(O);
  skill.normative_core = { ...(skill.normative_core || {}), ...exp };
  const lines = skill.self_check.validator_python.split('\n').filter((l) => !l.startsWith('RULES='));
  const at = lines.findIndex((l) => l.startsWith('import json'));
  lines.splice(at + 1, 0, validatorLine(exp));
  skill.self_check.validator_python = lines.join('\n');
  fs.writeFileSync(file, JSON.stringify(skill, null, 2) + '\n');
  return file;
}

if (require.main === module) {
  const { O } = require('./harness.cjs');
  if (process.argv.includes('--write')) console.log('écrit : ' + write(O));
  const problems = compare(JSON.parse(fs.readFileSync(skillFile(), 'utf8')), O);
  console.log(problems.length ? problems.join('\n') : 'skill et moteur d’accord');
  process.exit(problems.length ? 1 : 0);
}
module.exports = { compare, expected, write };
