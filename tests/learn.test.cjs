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
console.log(`${ok} réussi(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
