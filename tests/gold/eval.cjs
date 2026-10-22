/* Évaluateur du jeu gold V4 — indépendant du moteur (familles de libellés et contrôles écrits ici).
 *
 *   node tests/gold/eval.cjs            → modes « sure » et « all », tableau par carte + synthèse
 *   node tests/gold/eval.cjs --json     → synthèse JSON (pour comparer deux versions)
 *   node tests/gold/eval.cjs --set heldout → jeu held-out (tests/gold/heldout.cjs) au lieu de cards.cjs
 *   PIONEER_ORGANIZE=… node tests/gold/eval.cjs   → mesurer une autre version du moteur (variable du harnais)
 *
 * Indicateurs (par mode, après UNE passe d'application) :
 *  - rappel      : mustHave / mustParent / mustMerge / mustType satisfaits ÷ attendus (tier pris en compte :
 *                  en mode « sure » seuls les attendus tier 'sure' comptent ; en « all », tous) ;
 *                  « acquis » = déjà vrais avant rangement (séparés : le rappel « gagné » exclut ces cas) ;
 *  - FP          : violations de mustNot / mustNotParent / mustNotMerge (soft ignorés en mode « all ») ;
 *  - gel         : cartes « frozen » modifiées (nœuds gelés déplacés, retypés, réécrits, supprimés ; ou carte entière) ;
 *  - abstention  : cartes abstain modifiées par les corrections sûres ;
 *  - stabilité   : la passe 2 modifie encore la carte (instable) ; la passe 3 revient à l'état de la passe 1 (oscillation) ;
 *  - intégrité   : violations O.check() nouvelles ; cycles d'arbre ; texte d'origine perdu.
 */
'use strict';
const { S, O, makeMap } = require('../harness.cjs');
const SET = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'cards';
const GOLD = require(SET === 'heldout' ? './heldout.cjs' : './cards.cjs');

const n0 = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/* Familles de libellés : [sens direct A→B, sens inverse équivalent B→A] */
const FAM = {
  cause:   [['entraine', 'provoque', 'produit', 'cause', 'engendre', 'mene a', 'aboutit a', 'favorise', 'contribue a', 'donc', 'nourrit',
             'entretient', 'aggrave', 'declenche', 'renforce', 'genere', 'conduit a', 'suscite', 'explique', 'ce qui', 'si bien que', 'freine', 'stimule'],
            ['a pour cause', 'resulte de', 'decoule de', 'nait de', 'provient de', 'est cause par', 'est du a', 'due a', 'du a', 'car', 'parce que', 'vient de', 's\'explique par']],
  enable:  [['permet', 'rend possible', 'conditionne', 'est requis pour', 'est necessaire a', 'ouvre droit a', 'fonde'],
            ['suppose', 'exige', 'necessite', 'depend de', 'seulement si', 'a condition que', 'requiert', 'conditionne par', 'si']],
  example: [['illustre par', 'exemple', 'exemples', 'par exemple', 'ex.'], ['illustre', 'exemple de', 'cas de']],
  exception: [['sauf', 'sauf si', 'excepte', 'exception', 'exceptions', 'limite par', 'limitee par', 'restreint par', 'hormis', 'sauf exception'],
              ['deroge a', 'fait exception a', 'limite', 'restreint', 'ecarte', 'exception a']],
  inhibit: [['empeche', 'evite', 'reduit', 'affaiblit', 'protege de', 'remedie a', 'resout', 'limite', 'freine', 'compense', 'attenue', 'amortit', 'combat', 'corrige'],
            ['resolu par', 'combattu par', 'attenue par', 'compense par', 'freine par', 'empeche par']],
  precise: [['precise', 'detaille', 'comprend', 'se caracterise par', 'notamment', 'de qui ?', 'a qui ?', 'de quoi ?', 'a quoi ?', 'compose de', 'partie', 'contient', 'se compose de'],
            ['precise', 'fait partie de', 'partie de', 'est une sorte de', 'releve de', 'appartient a', 'element de']],
  seq:     [['puis', 'precede', 'suivi de', 'ensuite', 'avant', 'mene a', 'entraine', 'produit', 'aboutit a', 'conduit a', 'donne'],
            ['suit', 'apres', 'resulte de', 'decoule de', 'vient apres', 'issu de']],
  goal:    [['vise', 'pour', 'afin de', 'sert a', 'dans quel but ?', 'a pour but'], ['but de', 'objectif de', 'finalite de']],
  oppose:  [['s\'oppose a', 'se distingue de', '≠', 'contraire de', 'versus', 'vs'], ['s\'oppose a', 'se distingue de', '≠', 'contraire de']],
  refer:   [['fait appel a', 'renvoie a', 'voir aussi', 'cf', 'evoque', 'commemore', 'rappelle', 'utilise', 'mobilise', 'se rapporte a', 'suppose', 'sanctionne', 'concerne', 'illustre', 'entraine', 'provoque'],
            ['fait appel a', 'renvoie a', 'voir aussi', 'utilise par', 'sanctionne par', 'evoque par']],
};
const hasPrefix = (label, list) => { const l = n0(label).replace(/\s*:$/, ''); return !!l && list.some((w) => l === w || l.startsWith(w + ' ')); };
/** l'arête e affirme-t-elle « from —fam→ to » ? (sens direct, ou sens inverse avec le libellé inverse) */
function asserts(e, from, to, fam) {
  if (fam === 'any') return (e.from === from && e.to === to) || (e.from === to && e.to === from);
  const [fwd, back] = FAM[fam];
  if (e.from === from && e.to === to && hasPrefix(e.label, fwd)) return true;
  if (e.from === to && e.to === from && hasPrefix(e.label, back)) return true;
  return false;
}
const fams = (f) => (Array.isArray(f) ? f : [f]);

/* ---------- construction ---------- */
function build(card) {
  const map = makeMap(card.spec, card.links || [], { layout: card.layout || 'right' });
  for (const [child, label] of Object.entries(card.treeLabels || {})) { const e = map.edges.find((x) => x.kind === 'tree' && x.to === child); if (e) e.label = label; }
  return map;
}
const clone = (m) => JSON.parse(JSON.stringify(m));
function sig(m, only) {
  if (only) { const keep = new Set(only); m = { nodes: m.nodes.filter((n) => keep.has(n.id)), edges: m.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) }; }
  const parent = new Map(m.edges.filter((e) => e.kind === 'tree').map((e) => [e.to, e.from]));
  const nodes = m.nodes.map((n) => [n.id, n.type, n.title, n.note || '', parent.get(n.id) || '']).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const edges = m.edges.map((e) => [e.from, e.to, e.kind, e.label || '', e.group || '']).map((x) => x.join('|')).sort();
  return JSON.stringify({ nodes, edges });
}
function applyPass(m, mode) {
  let fixes;
  try { fixes = O.audit(m).fixes; } catch (e) { return { n: 0, err: e.message }; }
  let n = 0;
  for (const f of fixes) if (mode === 'all' || f.certainty === 'sure') { try { f.apply(m); n++; } catch (e) { /* intégrité mesurée */ } }
  S.normalizeGroups(m.edges);
  return { n };
}
function treeCycle(m) {
  const parent = new Map();
  let multi = 0;
  for (const e of m.edges) if (e.kind === 'tree') { if (parent.has(e.to)) multi++; parent.set(e.to, e.from); }
  for (const id of parent.keys()) { const seen = new Set(); let x = id; while (parent.has(x)) { if (seen.has(x)) return true; seen.add(x); x = parent.get(x); } }
  return multi > 0;
}

/* ---------- jugement d'une carte ---------- */
function resolver(card, m) {
  const ids = new Set(m.nodes.map((n) => n.id));
  return (id) => {
    if (ids.has(id)) return id;
    for (const [a, b] of card.expect.mustMerge || []) { if (id === a && ids.has(b)) return b; if (id === b && ids.has(a)) return a; }
    return id;
  };
}
function judge(card, m, orig, mode) {
  const X = card.expect, R = resolver(card, m);
  const counts = (tier) => mode === 'all' || (tier || 'sure') === 'sure';
  const out = { need: 0, got: 0, already: 0, gainedNeed: 0, gained: 0, fp: 0, fpList: [], miss: [], frozenBroken: 0, abstainBroken: 0 };
  const has = (mm, rel) => mm.edges.some((e) => (!rel.kind || e.kind === rel.kind) && fams(rel.fam).some((f) => asserts(e, R(rel.from), R(rel.to), f)));
  const hasOrig = (rel) => orig.edges.some((e) => (!rel.kind || e.kind === rel.kind) && fams(rel.fam).some((f) => asserts(e, rel.from, rel.to, f)));
  const tree = (mm, p, c) => mm.edges.some((e) => e.kind === 'tree' && e.from === R(p) && e.to === R(c));
  const treeO = (p, c) => orig.edges.some((e) => e.kind === 'tree' && e.from === p && e.to === c);
  const nodeOf = (mm, id) => mm.nodes.find((n) => n.id === id);
  const check = (ok, before, label) => {
    out.need++; if (before) out.already++; else out.gainedNeed++;
    if (ok) { out.got++; if (!before) out.gained++; } else out.miss.push(label);
  };
  for (const rel of X.mustHave || []) if (counts(rel.tier)) check(has(m, rel), hasOrig(rel), `${rel.from}—${fams(rel.fam).join('/')}→${rel.to}`);
  for (const [p, c, tier] of X.mustParent || []) if (counts(tier)) check(tree(m, p, c), treeO(p, c), `arbre ${p}→${c}`);
  for (const [a, b, tier] of X.mustMerge || []) if (counts(tier)) {
    const one = !!nodeOf(m, a) !== !!nodeOf(m, b);
    const surv = nodeOf(m, a) || nodeOf(m, b);
    const notes = [a, b].map((id) => nodeOf(orig, id).note).every((t) => surv && (surv.note || '').includes(t));
    check(one && notes, false, `fusion ${a}+${b}`);
  }
  for (const [id, type, tier] of X.mustType || []) if (counts(tier)) check((nodeOf(m, id) || {}).type === type, nodeOf(orig, id).type === type, `type ${id}=${type}`);

  const fp = (label) => { out.fp++; out.fpList.push(label); };
  for (const rel of X.mustNot || []) {
    if (rel.soft && mode === 'all') continue;
    const bad = m.edges.some((e) => fams(rel.fam).some((f) => asserts(e, R(rel.from), R(rel.to), f))
      && !orig.edges.some((o) => o.from === e.from && o.to === e.to && o.kind === e.kind && (o.label || '') === (e.label || '')));
    if (bad) fp(`${rel.from}—${fams(rel.fam).join('/')}→${rel.to}`);
  }
  for (const [p, c] of X.mustNotParent || []) if (tree(m, p, c) && !treeO(p, c)) fp(`arbre ${p}→${c}`);
  for (const [a, b] of X.mustNotMerge || []) if (!nodeOf(m, a) || !nodeOf(m, b)) fp(`fusion ${a}+${b}`);

  if (X.frozen === 'all') { if (sig(m) !== sig(orig)) out.frozenBroken = 1; }
  else if (Array.isArray(X.frozen)) {
    const pm = (mm) => new Map(mm.edges.filter((e) => e.kind === 'tree').map((e) => [e.to, e.from]));
    const P = pm(m), P0 = pm(orig);
    for (const id of X.frozen) {
      const a = nodeOf(m, id), b = nodeOf(orig, id);
      if (!a || a.type !== b.type || a.title !== b.title || (a.note || '') !== (b.note || '') || P.get(id) !== P0.get(id)) { out.frozenBroken = 1; break; }
    }
  }
  if (X.abstain && mode === 'sure' && sig(m, X.abstainIds) !== sig(orig, X.abstainIds)) out.abstainBroken = 1;
  return out;
}

function run(mode) {
  const rows = [];
  for (const card of GOLD) {
    const orig = build(card);
    const before = new Set(O.check(orig));
    const m = clone(orig);
    const p1 = applyPass(m, mode); const s1 = sig(m);
    const j = judge(card, m, orig, mode);
    const integ = O.check(m).filter((v) => !before.has(v)).length + (treeCycle(m) ? 1 : 0);
    const texts = orig.nodes.flatMap((n) => [n.title, n.note || '']).filter(Boolean);
    const all = m.nodes.map((n) => n.title + '\n' + (n.note || '')).join('\n');
    const lost = texts.filter((t) => !all.includes(t)).length;
    applyPass(m, mode); const s2 = sig(m);
    applyPass(m, mode); const s3 = sig(m);
    rows.push({ name: card.name, applied: p1.n, err: p1.err, ...j, unstable: s1 !== s2 ? 1 : 0, osc: s2 !== s3 && s3 === s1 ? 1 : 0, integ, lost,
      frozenCard: !!card.expect.frozen, abstainCard: !!card.expect.abstain });
  }
  return rows;
}

function summary(rows) {
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  return {
    cartes: rows.length, rappel: `${sum('got')}/${sum('need')}`, rappelPct: +(100 * sum('got') / Math.max(1, sum('need'))).toFixed(1),
    rappelGagne: `${sum('gained')}/${sum('gainedNeed')}`, rappelGagnePct: +(100 * sum('gained') / Math.max(1, sum('gainedNeed'))).toFixed(1),
    fauxPositifs: sum('fp'), cartesGeleesModifiees: `${sum('frozenBroken')}/${rows.filter((r) => r.frozenCard).length}`,
    abstentionsViolees: `${sum('abstainBroken')}/${rows.filter((r) => r.abstainCard).length}`,
    instables: sum('unstable'), oscillations: sum('osc'), integrite: sum('integ'), textePerdu: sum('lost'), correctionsAppliquees: sum('applied'),
  };
}

const res = { sure: run('sure'), all: run('all') };
if (process.argv.includes('--json')) { console.log(JSON.stringify({ sure: summary(res.sure), all: summary(res.all) }, null, 2)); process.exit(0); }
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
for (const mode of ['sure', 'all']) {
  console.log(`\n=== Mode « ${mode} » ===`);
  console.log(pad('carte', 52) + pad('appl', 5) + pad('rappel', 8) + pad('FP', 4) + pad('gel', 4) + pad('abst', 5) + pad('inst', 5) + pad('integ', 6) + 'détails');
  for (const r of res[mode]) {
    const det = [r.miss.length ? 'manque: ' + r.miss.join(', ') : '', r.fpList.length ? 'FP: ' + r.fpList.join(', ') : '', r.err ? 'ERR ' + r.err : ''].filter(Boolean).join(' ; ');
    console.log(pad(r.name, 52) + pad(r.applied, 5) + pad(r.need ? `${r.got}/${r.need}` : '–', 8) + pad(r.fp, 4) + pad(r.frozenBroken ? 'X' : '', 4)
      + pad(r.abstainBroken ? 'X' : '', 5) + pad(r.unstable ? 'X' : '', 5) + pad(r.integ || '', 6) + det);
  }
  console.log('Synthèse :', JSON.stringify(summary(res[mode])));
}
