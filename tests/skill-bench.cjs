/* Banc du skill d'import (skills/pioneer-livre-vers-cours) : structure du pipeline, contradictions
 * connues, taille, exemple travaillé contrôlé par le vrai moteur (O.check, audit) et par le
 * validateur Python du skill (sur l'exemple, puis sur une version aplatie qui doit être signalée).
 *
 *   node tests/skill-bench.cjs        (aucune dépendance ; python3 pour le validateur)
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { S, O } = require('./harness.cjs');

const dir = path.join(__dirname, '../skills/pioneer-livre-vers-cours');
const file = path.join(dir, fs.readdirSync(dir).filter((f) => /^pioneer_book_to_course_compiler_v[\d.]+\.json$/.test(f)).sort().pop());
const raw = fs.readFileSync(file, 'utf8');
const skill = JSON.parse(raw);
const MAX_BYTES = 175 * 1000;

let passed = 0, failed = 0;
function check(name, fn) {
  try { const info = fn(); passed++; console.log('✓ ' + name + (info ? ' — ' + info : '')); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

/** carte Pioneer (comme à l'import) depuis une carte du skill */
function toMap(m) {
  const map = { id: m.id, title: m.title, layout: 'right', nodes: [], edges: [] };
  m.nodes.forEach((n, i) => { const x = S.newNode({ type: n.type, title: n.title, note: n.note || '', em: n.em, y: i * 60 }); x.id = n.id; if (n.logic) x.logic = n.logic; map.nodes.push(x); });
  m.edges.forEach((e, i) => map.edges.push({ id: e.id || 'k' + i, from: e.from, to: e.to, kind: e.kind, label: e.label || '', ...(e.group ? { group: e.group } : {}) }));
  return map;
}

/** exécute le validateur Python du skill sur un cours ; rend { code, out } */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-skill-'));
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

check('version 4 et fichier choisi par le tri', () => {
  ok(/^4\./.test(skill.version), 'version ' + skill.version);
  ok(path.basename(file) === 'pioneer_book_to_course_compiler_v4.4.json', path.basename(file));
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

check('taille ≤ 175 ko', () => {
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

/* cours en dossiers (v4.0) : plan réel, cartes du plan, renvois ref */
const folderText = fs.readFileSync(path.join(dir, 'exemple-cours-en-dossiers.json'), 'utf8');
const folderEx = () => JSON.parse(folderText);

check('cours en dossiers : spec (course_architecture, architecture_maps, envelope folders)', () => {
  ok(skill.course_architecture && skill.course_architecture.leaf_rule, 'course_architecture.leaf_rule');
  const am = JSON.stringify(skill.architecture_maps || {});
  ok(/prépare/.test(am) && /se distingue de/.test(am) && /peigne/.test(am) && /Pourquoi ici/.test(am), 'architecture_maps : vocabulaire fermé, peigne, « Pourquoi ici »');
  ok(/"folders":\[/.test(skill.target_format.envelope) && skill.target_format.folder, 'target_format sans folders');
});

check('cours en dossiers : validateur sans erreur ni avertissement (droit)', () => {
  const r = validate(folderEx(), 'dossiers');
  ok(r.code === 0 && /OK/.test(r.out), r.out.trim());
  ok(!warnings(r.out).length, warnings(r.out).join('\n    '));
  return r.out.trim().split('\n').pop();
});

check('cours en dossiers : import Pioneer sans remarque, renvois gardés', () => {
  const p = S.parseImport(folderText);
  ok(!p.issues.length, JSON.stringify(p.issues));
  ok(p.stats.folders === 3 && p.stats.maps === 9 && p.stats.exercises > 0, JSON.stringify(p.stats));
  const d = S.sanitize(folderEx());
  const refs = d.maps.filter((m) => m.role === 'plan').flatMap((m) => m.nodes.filter((n) => n.ref));
  ok(refs.length === folderEx().maps.filter((m) => m.role === 'plan').flatMap((m) => m.nodes.filter((n) => n.ref)).length, 'renvoi perdu');
  return `${p.stats.folders} dossiers, ${p.stats.maps} cartes, ${refs.length} renvois, ${p.stats.exercises} exercices`;
});

check('cours en dossiers : intègre pour le moteur (O.check), cartes de contenu sans correction établie', () => {
  const info = [];
  for (const m of folderEx().maps) {
    const map = toMap(m);
    const v = O.check(map);
    ok(!v.length, m.id + ' : ' + v.join(' | '));
    if (m.role === 'plan') continue;
    const sure = O.audit(map).fixes.filter((f) => f.certainty === 'sure');
    ok(!sure.length, m.id + ' : corrections établies ' + sure.map((f) => f.title).join(' | '));
    ok(map.nodes.length >= 8 && map.nodes.length <= 45, m.id + ' : ' + map.nodes.length + ' nœuds');
    info.push(m.id + ' ' + map.nodes.length);
  }
  return info.join(' · ');
});

/* exercices de révision (v4.2) : spec, exemples complets, erreurs du validateur */
check('exercices : spec (section exercises, P5b, G13, target_format.exercise)', () => {
  const ids = skill.pipeline.phases.map((p) => p.id);
  ok(ids.indexOf('P5b') === ids.indexOf('P5') + 1, 'P5b après P5 : ' + ids.join(' '));
  ok(skill.exercises && ['qa', 'qcm', 'vf'].every((k) => skill.exercises.kinds[k]) && skill.exercises.coverage, 'section exercises');
  ok(skill.quality_gates.some((g) => /^G13 Exercices/.test(g)), 'G13');
  ok(/nodeIds/.test(skill.target_format.exercise), 'target_format.exercise');
});

check('exercices : exemples couverts et lisibles par Pioneer (S.sanitize)', () => {
  const info = [];
  for (const d of [skill.example.json, folderEx()]) {
    const clean = S.sanitize(JSON.parse(JSON.stringify(d)));
    for (const m of d.maps) {
      if (m.role === 'plan') { ok(!m.exercises, m.id + ' : carte du plan avec exercices'); continue; }
      const kept = clean.maps.find((x) => x.id === m.id).exercises || [];
      ok(kept.length === m.exercises.length, m.id + ' : ' + kept.length + '/' + m.exercises.length + ' exercices gardés à l’import');
      ok(['qa', 'qcm', 'vf'].every((k) => m.exercises.some((x) => x.kind === k)), m.id + ' : genres mêlés');
      const cov = new Set(m.exercises.flatMap((x) => x.nodeIds));
      const miss = m.nodes.filter((n) => !['chapitre', 'lecon', 'section'].includes(n.type) && !cov.has(n.id));
      ok(!miss.length, m.id + ' : non couverts ' + miss.map((n) => n.title).join(' | '));
      info.push(m.id + ' ' + m.exercises.length);
    }
  }
  return info.join(', ');
});

check('validateur Python : exercices absents, nœud non couvert, mauvais rang, vf non booléen signalés', () => {
  const base = () => JSON.parse(JSON.stringify(skill.example.json));
  let d = base(); delete d.maps[0].exercises;
  let r = validate(d, 'sans-ex', ['--hors-droit']);
  ok(r.code === 1 && /exercises absent/.test(r.out), r.out.trim());
  ok(validate(d, 'sans-ex-ok', ['--hors-droit', '--sans-exercices']).code === 0, '--sans-exercices refusé');
  d = base(); const n = d.maps[0].exercises.find((x) => x.kind === 'qcm').nodeIds[0];
  d.maps[0].exercises = d.maps[0].exercises.filter((x) => !x.nodeIds.includes(n));
  r = validate(d, 'couverture', ['--hors-droit']);
  ok(r.code === 1 && /sans exercice \(couverture\)/.test(r.out), r.out.trim());
  d = base(); d.maps[0].exercises.find((x) => x.kind === 'qcm').answer = 9;
  r = validate(d, 'rang', ['--hors-droit']);
  ok(r.code === 1 && /answer = rang/.test(r.out), r.out.trim());
  d = base(); d.maps[0].exercises.find((x) => x.kind === 'vf').answer = 'vrai';
  r = validate(d, 'vf', ['--hors-droit']);
  ok(r.code === 1 && /booléen/.test(r.out), r.out.trim());
  d = base(); d.maps[0].exercises.filter((x) => x.kind === 'qcm' && !Array.isArray(x.answer)).forEach((x) => { x.choices.unshift(x.choices.splice(x.answer, 1)[0]); x.answer = 0; });
  d.maps[0].exercises.push(...[1, 2, 3].map((i) => ({ id: 'y' + i, kind: 'qcm', q: 'Q' + i, choices: ['a' + i, 'b' + i, 'c' + i], answer: 0, explain: 'e', nodeIds: [d.maps[0].nodes[1].id] })));
  r = validate(d, 'position', ['--hors-droit']);
  ok(r.code === 0 && warnings(r.out).some((l) => /position 1/.test(l)), r.out.trim());
});

check('validateur Python : plan absent, peigne, renvoi cassé et lien hors vocabulaire signalés', () => {
  const noPlan = folderEx(); noPlan.maps = noPlan.maps.filter((m) => m.id !== 'm-plan');
  let r = validate(noPlan, 'sans-plan');
  ok(r.code === 1 && /carte du plan absente/.test(r.out), 'plan absent : ' + r.out.trim());
  ok(validate(noPlan, 'partie', ['--partie']).code === 0, 'livraison en parties refusée');
  const comb = folderEx(); const pm = comb.maps.find((m) => m.id === 'm-plan');
  pm.edges = pm.edges.filter((e) => e.kind === 'tree');
  r = validate(comb, 'peigne');
  ok(warnings(r.out).some((l) => /peigne/.test(l)), 'peigne : ' + r.out.trim());
  const bad = folderEx(); const bp = bad.maps.find((m) => m.id === 'm-plan');
  bp.nodes.find((n) => n.ref).ref = 'nulle-part';
  bp.edges.find((e) => e.kind === 'link').label = 'voir aussi';
  r = validate(bad, 'renvoi');
  ok(r.code === 1 && /ref vers une unité absente/.test(r.out), 'renvoi cassé : ' + r.out.trim());
  ok(warnings(r.out).some((l) => /hors vocabulaire/.test(l)), 'lien hors vocabulaire : ' + r.out.trim());
});

check('v4.4 : type paragraphe et libellés jusqu’à 80 caractères (spec, validateur, Pioneer)', () => {
  ok(skill.node_types.types.some((t) => t.startsWith('paragraphe ·')), 'type paragraphe absent de node_types');
  ok(S.TYPES.paragraphe && S.FOLDER_KINDS.includes('paragraphe'), 'paragraphe inconnu de Pioneer');
  const base = () => JSON.parse(JSON.stringify(skill.example.json));
  const longE = (d) => d.maps[0].edges.find((e) => e.kind === 'tree' && e.label);
  let d = base(); longE(d).label = 'x'.repeat(60);
  let r = validate(d, 'lib60', ['--hors-droit']);
  ok(r.code === 0 && warnings(r.out).some((l) => /libellé long/.test(l)), '60 car. : ' + r.out.trim());
  d = base(); longE(d).label = 'x'.repeat(81);
  r = validate(d, 'lib81', ['--hors-droit']);
  ok(r.code === 1 && /plus de 80 caractères/.test(r.out), '81 car. : ' + r.out.trim());
  d = base(); const ch = d.maps[0].nodes.find((n) => n.type === 'idee');
  ch.type = 'paragraphe';
  r = validate(d, 'para', ['--hors-droit']);
  ok(!/type .*paragraphe|paragraphe.*inconnu|supprimé/.test(r.out), 'paragraphe refusé : ' + r.out.trim());
  return 'paragraphe accepté, 60 car. averti, 81 car. refusé';
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nBanc du skill : ${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
