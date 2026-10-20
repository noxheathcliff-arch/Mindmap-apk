/* Banc du skill d'import (skills/ratio-livre-vers-cours) : structure du pipeline, contradictions
 * connues, taille, exemple travaillé contrôlé par le vrai moteur (O.check, audit) et par le
 * validateur Python du skill (sur l'exemple, puis sur une version aplatie qui doit être signalée).
 *
 *   node tests/skill-bench.cjs        (aucune dépendance ; python3 pour le validateur)
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { S, O } = require('./harness.cjs');

const dir = path.join(__dirname, '../skills/ratio-livre-vers-cours');
const file = path.join(dir, fs.readdirSync(dir).filter((f) => /^ratio_book_to_course_compiler_v[\d.]+\.json$/.test(f)).sort().pop());
const raw = fs.readFileSync(file, 'utf8');
const skill = JSON.parse(raw);
const MAX_BYTES = 110 * 1000;

let passed = 0, failed = 0;
function check(name, fn) {
  try { const info = fn(); passed++; console.log('✓ ' + name + (info ? ' — ' + info : '')); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

/** carte Ratio (comme à l'import) depuis une carte du skill */
function toMap(m) {
  const map = { id: m.id, title: m.title, layout: 'right', nodes: [], edges: [] };
  m.nodes.forEach((n, i) => { const x = S.newNode({ type: n.type, title: n.title, note: n.note || '', em: n.em, y: i * 60 }); x.id = n.id; if (n.logic) x.logic = n.logic; map.nodes.push(x); });
  m.edges.forEach((e, i) => map.edges.push({ id: e.id || 'k' + i, from: e.from, to: e.to, kind: e.kind, label: e.label || '', ...(e.group ? { group: e.group } : {}) }));
  return map;
}

/** exécute le validateur Python du skill sur un cours ; rend { code, out } */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ratio-skill-'));
const validator = path.join(tmp, 'validateur.py');
fs.writeFileSync(validator, skill.self_check.validator_python);
function validate(course, name, args = []) {
  const f = path.join(tmp, name + '.json');
  fs.writeFileSync(f, JSON.stringify(course));
  try { return { code: 0, out: execFileSync('python3', ['-I', validator, f, ...args], { encoding: 'utf8' }) }; }
  catch (e) { if (e.code === 'ENOENT') throw new Error('python3 introuvable'); return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
const warnings = (out) => out.split('\n').filter((l) => l.startsWith('⚠'));

console.log('Skill : ' + path.basename(file) + ' (version ' + skill.version + ')\n');

check('version 3 et fichier choisi par le tri', () => {
  ok(/^3\./.test(skill.version), 'version ' + skill.version);
  ok(path.basename(file) === 'ratio_book_to_course_compiler_v3.1.json', path.basename(file));
});

check('pipeline : P3 (carte de compréhension), P3c, P6a présents et ordonnés', () => {
  const ids = skill.pipeline.phases.map((p) => p.id);
  for (const id of ['P0', 'P1', 'P2', 'P3', 'P3c', 'P4', 'P5', 'P6a', 'P6b', 'P7']) ok(ids.includes(id), 'phase absente : ' + id);
  ok(ids.indexOf('P3') < ids.indexOf('P3c') && ids.indexOf('P3c') < ids.indexOf('P4') && ids.indexOf('P6a') < ids.indexOf('P7'), ids.join(' '));
  const p3 = JSON.stringify(skill.pipeline.phases.find((p) => p.id === 'P3'));
  ok(/compréhension/i.test(p3) && /avant tout nœud/i.test(p3), 'P3 doit être la carte de compréhension, avant tout nœud');
  const fmt = skill.comprehension_map && skill.comprehension_map.format;
  ok(fmt && ['U', 'R', 'A', 'X'].every((k) => fmt[k]), 'comprehension_map.format U/R/A/X');
  const p6a = JSON.stringify(skill.pipeline.phases.find((p) => p.id === 'P6a'));
  ok(/encodées/.test(p6a) && /abstentions/.test(p6a), 'P6a doit compter relations encodées et abstentions');
  return ids.join(' → ');
});

check('ordre de construction fixe : rôle → place → type → note → libellé', () => {
  const order = skill.construction.order.map((s) => s.split('—')[0].replace(/^\d+\.\s*/, '').trim().toLowerCase());
  ok(JSON.stringify(order) === JSON.stringify(['rôle', 'place', 'type', 'note', 'libellé']), order.join(' → '));
});

check('gabarits de décomposition : règle, mécanisme, raisonnement, distinction', () => {
  const names = skill.modular_decomposition.templates.map((t) => t.name);
  for (const n of ['règle', 'mécanisme', 'raisonnement', 'distinction']) ok(names.includes(n), 'gabarit absent : ' + n);
});

check('contradictions connues absentes', () => {
  const bad = [
    [/0\s*[–-]\s*4/, 'budget « 0–4 »'], [/\b0 à 4 (renvois|par carte)/, 'budget « 0 à 4 »'],
    [/2\s*[–-]\s*6/, '« 2–6 » (renvois)'], [/\b2 à 6 renvois/, '« 2 à 6 renvois »'],
    [/3\s*[–-]\s*6/, '« 3–6 » (racine)'], [/3 à 6 (branches|enfants)/, 'racine « 3 à 6 »'],
    [/\bA\s*[–-]\s*H\b/, 'cas « A–H »'], [/\bA\s*[–-]\s*M\b/, 'cas « A–M »'],
    [/« voir »\s*\.?"/, 'préconisation « voir »'],
  ];
  const hits = bad.filter(([re]) => re.test(raw)).map(([, why]) => why);
  ok(!hits.length, hits.join(', '));
  const presets = skill.edge_rules.labels.presets.map((x) => x.toLowerCase());
  ok(!presets.includes('voir') && !presets.includes('cf.'), 'préréglage « voir » / « cf. »');
  ok(/voir/.test(skill.edge_rules.labels.forbidden), '« voir » doit être interdit');
  const core = skill.normative_core.decisions.join(' ');
  ok(/n ÷ rules\.linkBudgetPerNodes/.test(core) && /double/.test(core) && /fourche compte pour UN/.test(core), 'budget de renvois unique dans normative_core');
  ok(/3 à 7 enfants/.test(core), 'racine à 3 à 7 enfants dans normative_core');
  const cases = skill.validation_cases.cases.map((c) => c[0]).join('');
  ok(cases === 'ABCDEFGHIJKLMNOP', 'cas ' + cases);
});

check('taille ≤ 110 ko', () => {
  const n = Buffer.byteLength(raw);
  ok(n <= MAX_BYTES, n + ' octets');
  return (n / 1000).toFixed(1) + ' ko';
});

check('exemple travaillé hors droit : source, carte de compréhension, JSON', () => {
  const ex = skill.example;
  ok(ex.source && ex.comprehension_map && ex.json, 'source / comprehension_map / json');
  ok(!ex.json.maps.some((m) => m.nodes.some((n) => ['juris', 'doctrine', 'fond', 'forme', 'effet', 'exception', 'exemple', 'question', 'comparaison', 'piege', 'cause', 'consequence', 'condition', 'probleme', 'solution', 'argument', 'critique', 'nuance', 'avantage', 'inconvenient', 'caracteristique', 'categorie', 'signe', 'objectif', 'theorie'].includes(n.type))), 'type de droit ou supprimé dans l’exemple hors droit');
  const cm = ex.comprehension_map;
  ok(cm.R.length >= 5 && cm.A.length >= 1 && cm.X.length >= 1, 'lignes R, A, X');
  // chaque ligne R annonce un encodage, et la carte a au moins autant d'arêtes libellées
  const labelled = ex.json.maps.reduce((k, m) => k + m.edges.filter((e) => e.label).length, 0);
  ok(labelled >= cm.R.length, `${labelled} arêtes libellées pour ${cm.R.length} lignes R`);
  return `${cm.R.length} R · ${cm.A.length} A · ${cm.X.length} X · ${labelled} arêtes libellées`;
});

check('exemple travaillé : intègre pour le moteur (O.check) et sans correction établie', () => {
  const info = [];
  for (const m of skill.example.json.maps) {
    const map = toMap(m);
    const v = O.check(map);
    ok(!v.length, m.id + ' : ' + v.join(' | '));
    const a = O.audit(map);
    const sure = a.fixes.filter((f) => f.certainty === 'sure');
    ok(!sure.length, m.id + ' : corrections établies ' + sure.map((f) => f.title).join(' | '));
    const st = O.metrics(map);
    ok(st.relationRate >= O.RULES.labelledTarget, 'taux de relations ' + st.relationRate);
    ok(st.links <= O.linkBudget(map.nodes.length), st.links + ' renvois pour un budget de ' + O.linkBudget(map.nodes.length));
    info.push(`${m.id} : ${map.nodes.length} nœuds, ${st.links} renvois, taux ${Math.round(st.relationRate * 100)} %, ${a.fixes.length} proposition(s)`);
  }
  return info.join(' ; ');
});

check('validateur Python : exemple travaillé sans erreur ni avertissement', () => {
  const r = validate(skill.example.json, 'exemple', ['--hors-droit']);
  ok(r.code === 0 && /OK/.test(r.out), r.out.trim());
  ok(!warnings(r.out).length, warnings(r.out).join('\n    '));
  return r.out.trim().split('\n').pop();
});

check('validateur Python : carte aplatie signalée (erreur 0 libellé, taux, relations aplaties)', () => {
  const flat = JSON.parse(JSON.stringify(skill.example.json));
  for (const m of flat.maps) m.edges = m.edges.filter((e) => e.kind === 'tree').map((e) => ({ ...e, label: '' }));
  const r = validate(flat, 'aplatie', ['--hors-droit']);
  const w = warnings(r.out);
  ok(r.code === 1 && /aucune relation libellée/.test(r.out), 'erreur attendue : ' + r.out.trim());
  ok(w.some((l) => /taux de relations/.test(l)), 'avertissement de taux attendu');
  const flatW = w.filter((l) => /relation aplatie/.test(l));
  ok(flatW.length >= 2, 'avertissements « relation aplatie » attendus :\n    ' + w.join('\n    '));
  return `${w.length} avertissement(s) dont ${flatW.length} « relation aplatie », code ${r.code}`;
});

check('validateur Python : aplatissement partiel (un seul libellé retiré) signalé', () => {
  const part = JSON.parse(JSON.stringify(skill.example.json));
  const m = part.maps[0];
  // la hausse de la glycémie perd sa relation libellée : sa note dit « ce qui stimule… »
  const e = m.edges.find((x) => x.kind === 'tree' && x.label === 'entraîne' && m.nodes.find((n) => n.id === x.from).note.includes('ce qui'));
  ok(e, 'arête « entraîne » depuis une note en « ce qui »');
  e.label = '';
  const r = validate(part, 'partielle', ['--hors-droit']);
  ok(r.code === 0, r.out.trim());
  ok(warnings(r.out).some((l) => /relation aplatie/.test(l)), 'avertissement attendu :\n' + r.out);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nBanc du skill : ${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
