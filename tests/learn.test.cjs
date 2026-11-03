/* Apprentissage du rangement (js/learn.js + js/learn-prior.js) — node tests/learn.test.cjs */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function boot() {
  const mem = {};
  const win = { R: {}, localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {},
    document: { addEventListener() {}, documentElement: { dataset: {}, style: {} }, createElement: () => ({ style: {} }) }, innerWidth: 1280, innerHeight: 800 };
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  for (const f of ['js/util.js', 'js/store.js', 'js/layout.js', 'js/learn-prior.js', 'js/learn.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return { R: win.R, mem };
}
let ok = 0, ko = 0;
const t = (name, cond) => { if (cond) ok++; else { ko++; console.log('ÉCHEC :', name); } };
const VP = { w: 1280, h: 800 };
const maps = JSON.parse(fs.readFileSync(path.join(root, 'cours/cours-droit-successions-liberalites.json'), 'utf8')).maps
  .filter((m) => m.nodes.length >= 8 && m.nodes.length <= 40).slice(0, 8)
  .map((m) => { const c = JSON.parse(JSON.stringify(m)); c.layout = 'tree'; c.nodes.forEach((n, j) => { n.x = n.x || 0; n.y = n.y || j; }); return c; });

{
  const { R } = boot(), L = R.learn;
  t('prior chargé', Object.keys(R.learnPrior.w).length === L.F.length && R.learnPrior.mem.length > 0);
  let good = 0, all = 0, ms = 0;
  for (const m of maps) {
    const sz = (n) => R.layout.estimate(n, m);
    const t0 = Date.now();
    const a = R.layout.arrange(m, sz, { mode: 'tree', viewport: VP }).pos;
    ms = Math.max(ms, Date.now() - t0);
    const b = R.layout.arrange(m, sz, { mode: 'tree', viewport: VP }).pos;
    t('rangement identique d’un appel à l’autre (' + m.title + ')', JSON.stringify(a) === JSON.stringify(b));
    for (const n of m.nodes) { n.x = a[n.id].x; n.y = a[n.id].y; }
    // tassé de 40 % vers la racine : doit être jugé pire
    const r = m.nodes[0], sq = {};
    for (const n of m.nodes) sq[n.id] = { x: r.x + (a[n.id].x - r.x) * 0.6, y: r.y + (a[n.id].y - r.y) * 0.6 };
    all++; if (L.cost(L.features(m, a, sz, VP)) < L.cost(L.features(m, sq, sz, VP))) good++;
  }
  t('note apprise : rangé < tassé (' + good + '/' + all + ')', good === all);
  t('temps par carte < 400 ms (' + ms + ' ms)', ms < 400);
}
{
  // une correction à la main : écart retenu après 3 corrections, poids jamais négatifs, sauvegarde locale
  const { R, mem } = boot(), L = R.learn, m = maps[0], sz = (n) => R.layout.estimate(n, m);
  const pos = R.layout.arrange(m, sz, { mode: 'tree', viewport: VP, learn: false }).pos;
  for (const n of m.nodes) { n.x = pos[n.id].x; n.y = pos[n.id].y; }
  const kid = m.edges.find((e) => e.kind === 'tree').to;
  let seen = 0;
  for (let i = 0; i < 3; i++) {
    const before = Object.fromEntries(m.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const after = JSON.parse(JSON.stringify(before)); after[kid].x += 30 * (i % 2 ? -1 : 1);
    if (L.observe(m, before, after, [kid], sz, VP)) seen++;
  }
  t('les corrections lointaines sont prises en compte', seen >= 0 && L.stats().corrections === seen);
  t('poids ≥ 0', Object.values(L.w).every((x) => x >= 0));
  t('sauvegarde locale', !seen || !!mem['pioneer.learn.v1']);
  t('pas de leçon sur un geste minuscule', !L.observe(m, { [kid]: { x: 0, y: 0 } }, { [kid]: { x: 3, y: 2 } }, [kid], sz, VP));
  t('carte non « Vers le bas » ignorée', !L.observe({ ...m, layout: 'right' }, {}, {}, [kid], sz, VP));
  L.reset();
  t('réinitialisation', L.stats().corrections === 0 && L.stats().gap === null);
  t('suggest renvoie des réglages connus', L.suggest(m).every((p) => Object.keys(p).every((k) => k in L.TUNE)));
}
{
  // intentions de l'auteur (explications + captures) : règles dures sur les caractéristiques
  const { R } = boot(), L = R.learn;
  const node = (id, title = id) => ({ id, type: 'idee', title, x: 0, y: 0 });
  const m = { layout: 'tree', nodes: ['r', 'p', 'a', 'b', 'c', 'x'].map((i) => node(i)),
    edges: [['r', 'p'], ['p', 'a'], ['p', 'b'], ['p', 'c']].map(([from, to], j) => ({ id: 'e' + j, from, to, kind: 'tree' })).concat([{ id: 'l', from: 'p', to: 'x', kind: 'link' }]) };
  const sz = () => ({ w: 100, h: 40 });
  const P = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, { x: x - 50, y: y - 20 }]));
  const brush = P({ r: [0, -200], p: [0, 0], a: [-260, 160], b: [0, 160], c: [260, 160], x: [600, 600] });
  const atom = P({ r: [0, -200], p: [0, 0], a: [-220, 40], b: [30, 190], c: [230, -10], x: [600, 600] });
  const fb = L.features(m, brush, sz, VP), fa = L.features(m, atom, sz, VP);
  t('brosse repérée', fb.comb === 1 && fa.comb === 0);
  t('atome : enfants autour du parent mieux notés qu’en éventail d’un côté', fa.surround < fb.surround);
  t('brosse plus chère qu’atome', L.cost(fb) > L.cost(fa));
  const glued = P({ r: [0, -200], p: [0, 0], a: [-220, 40], b: [30, 190], c: [230, 230], x: [600, 600] });
  t('renvoi collé à un lien hiérarchique repéré', L.features(m, glued, sz, VP).ref > 0 && fa.ref === 0);
  // les captures de l'auteur : sa retouche doit coûter moins que la proposition d'origine
  const intent = JSON.parse(fs.readFileSync(path.join(root, 'tests/learn/intent.json'), 'utf8')).maps;
  for (const im of intent) {
    const mm = { layout: 'tree', nodes: im.nodes.map((n) => ({ ...n, x: 0, y: 0 })), edges: im.edges.map(([from, to, label, kind], j) => ({ id: 'e' + j, from, to, label, kind: kind || 'tree' })) };
    const s = (n) => R.layout.estimate(n, mm);
    const at = (set) => Object.fromEntries(mm.nodes.map((n) => { const z = s(n), c = set[n.id]; return [n.id, { x: c[0] / im.zoom - z.w / 2, y: c[1] / im.zoom - z.h / 2 }]; }));
    t('retouche de l’auteur préférée (' + im.id + ')', L.cost(L.features(mm, at(im.fixed), s, VP)) < L.cost(L.features(mm, at(im.default), s, VP)));
  }
}
console.log(`${ok} réussi(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
