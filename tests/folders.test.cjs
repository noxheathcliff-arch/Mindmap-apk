/* Tests du plan de cours en dossiers : lecture (sanitize), ordre du sommaire, chemin, bilan,
 * suppression sans perte, import en copie (identifiants et renvois remappés), révision d'un dossier.
 * Lancement : node tests/folders.test.cjs   (aucune dépendance)
 */
'use strict';
const { S, win } = require('./harness.cjs');

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n    ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

const node = (id, type, title, extra = {}) => ({ id, type, title, note: 'note', x: 0, y: 0, ...extra });
/** Cours de droit du travail : plan du cours, deux parties, chapitres, sections */
function course() {
  return {
    format: 'pioneer', version: 2, kind: 'course',
    courses: [{ id: 'c1', title: 'Droit du travail' }],
    folders: [
      { id: 'p1', courseId: 'c1', parentId: null, kind: 'partie', label: 'Partie I', title: 'Les relations individuelles', note: 'Le contrat d’abord', order: 1 },
      { id: 'p2', courseId: 'c1', parentId: null, kind: 'partie', label: 'Partie II', title: 'Les relations collectives', order: 2 },
      { id: 'ch1', courseId: 'c1', parentId: 'p1', kind: 'chapitre', label: 'Chapitre 1', title: 'La formation du contrat', order: 1 },
      { id: 'loop', courseId: 'c1', parentId: 'loop2', kind: 'titre', label: 'Titre X', title: 'Boucle', order: 9 },
      { id: 'loop2', courseId: 'c1', parentId: 'loop', kind: 'titre', label: 'Titre Y', title: 'Boucle 2', order: 10 },
    ],
    maps: [
      { id: 'plan', courseId: 'c1', folderId: null, role: 'plan', title: 'Plan du cours', order: 0,
        nodes: [node('r', 'chapitre', 'Droit du travail'), node('a', 'lecon', 'Individuelles', { ref: 'p1' }), node('b', 'lecon', 'Collectives', { ref: 'p2' }), node('z', 'idee', 'Fantôme', { ref: 'nulle-part' })],
        edges: [{ from: 'r', to: 'a', kind: 'tree' }, { from: 'r', to: 'b', kind: 'tree' }, { from: 'a', to: 'b', kind: 'link', label: 'prépare' }] },
      { id: 's2', courseId: 'c1', folderId: 'ch1', label: 'Section 2', title: 'La forme', order: 2, nodes: [node('x', 'section', 'La forme'), node('y', 'notion', 'Écrit')], edges: [{ from: 'x', to: 'y', kind: 'tree' }] },
      { id: 's1', courseId: 'c1', folderId: 'ch1', label: 'Section 1', title: 'Le fond', order: 1, nodes: [node('x', 'section', 'Le fond'), node('y', 'notion', 'Consentement')], edges: [{ from: 'x', to: 'y', kind: 'tree' }] },
      { id: 'g', courseId: 'c1', folderId: 'p2', title: 'Grève', order: 1, nodes: [node('x', 'notion', 'Grève'), node('y', 'notion', 'Licite')], edges: [{ from: 'x', to: 'y', kind: 'tree' }] },
      { id: 'lost', courseId: 'c1', folderId: 'absent', title: 'Égarée', nodes: [node('x', 'notion', 'Seule')], edges: [] },
    ],
  };
}
function load(data) { S.data = S.sanitize(JSON.parse(JSON.stringify(data))); S.save = Object.assign(() => {}, { flush() {} }); }

test('Lecture — dossiers, rang, numéro, rôle et renvois survivent ; le reste est réparé', () => {
  const rep = {};
  const d = S.sanitize(course(), rep);
  ok(d.folders.length === 5, 'dossiers : ' + d.folders.length);
  ok(d.folders.filter((f) => f.id.startsWith('loop')).some((f) => f.parentId === null), 'boucle de dossiers non coupée');
  const plan = d.maps.find((m) => m.id === 'plan');
  ok(plan.role === 'plan' && plan.order === 0, 'rôle/rang perdus');
  ok(plan.nodes.find((n) => n.id === 'a').ref === 'p1', 'renvoi perdu');
  ok(!plan.nodes.find((n) => n.id === 'z').ref, 'renvoi cassé gardé');
  ok(d.maps.find((m) => m.id === 's1').label === 'Section 1', 'numéro perdu');
  ok(d.maps.find((m) => m.id === 'lost').folderId === null, 'dossier absent gardé');
  ok(rep.brokenRefs === 1, 'renvoi cassé non signalé');
});

test('Sommaire — ordre du plan, carte du plan à part, cartes sans rang à la fin', () => {
  load(course());
  const root = S.unitsIn('c1', null);
  ok(root.plan && root.plan.id === 'plan', 'plan du cours absent');
  const ids = root.items.map((x) => (x.folder || x.map).id);
  ok(ids.slice(0, 2).join() === 'p1,p2', 'ordre racine : ' + ids);
  ok(ids[ids.length - 1] === 'lost', 'carte sans rang pas à la fin : ' + ids);
  ok(S.unitsIn('c1', 'ch1').items.map((x) => x.map.id).join() === 's1,s2', 'sections dans le désordre');
});

test('Chemin, numéros et bilan agrégé', () => {
  load(course());
  ok(S.locate(S.map('s1')).map((f) => f.label).join(' › ') === 'Partie I › Chapitre 1', 'chemin faux');
  const plan = S.map('plan');
  ok(S.kickerOf(plan, plan.nodes.find((n) => n.id === 'a')) === 'Partie I', 'sur-titre du renvoi');
  const st = S.folderStats('p1');
  ok(st.maps === 2 && st.reviewable > 0, 'bilan de partie : ' + JSON.stringify(st));
});

test('Révision d’un dossier : ses cartes seulement, dans l’ordre du plan', () => {
  load(course());
  const q = S.reviewQueue({ folderId: 'p1' }, { limit: 100 });
  ok(q.length && q.every((x) => ['s1', 's2'].includes(x.mapId)), 'hors dossier');
  ok(q[0].mapId === 's1', 'Section 1 pas en premier');
  const seq = S.planSequence(S.mapsOf('c1'));
  ok(seq.get('plan') === 0 && seq.get('s1') < seq.get('s2') && seq.get('s2') < seq.get('g'), 'séquence');
});

test('Supprimer un dossier : rien ne se perd, le contenu remonte, l’annulation le remet', () => {
  load(course());
  const snap = S.deleteFolder('ch1');
  ok(!S.folder('ch1') && S.map('s1').folderId === 'p1' && S.map('s2').folderId === 'p1', 'contenu pas remonté');
  S.restore(snap);
  ok(S.folder('ch1') && S.map('s1').folderId === 'ch1', 'annulation incomplète');
});

test('Supprimer un cours emporte ses dossiers ; l’annulation les rend', () => {
  load(course());
  const snap = S.deleteCourse('c1');
  ok(!S.data.folders.length, 'dossiers restés');
  S.restore(snap);
  ok(S.data.folders.length === 5 && S.map('s1').folderId === 'ch1', 'restauration');
});

test('Import en copie : identifiants neufs, rangement et renvois suivent', () => {
  load(course());
  const parsed = S.parseImport(JSON.stringify(course()));
  ok(parsed.stats.folders === 5 && parsed.collide.folders === 5, 'aperçu');
  S.applyImport(parsed, 'add');
  const copies = S.data.courses.filter((c) => c.id !== 'c1');
  ok(copies.length === 1, 'cours copié');
  const cid = copies[0].id;
  const fs = S.data.folders.filter((f) => f.courseId === cid);
  ok(fs.length === 5 && fs.every((f) => !['p1', 'p2', 'ch1'].includes(f.id)), 'dossiers non remappés');
  const ch = fs.find((f) => f.title === 'La formation du contrat');
  ok(fs.find((f) => f.id === ch.parentId).title === 'Les relations individuelles', 'parent non suivi');
  const plan = S.mapsOf(cid).find((m) => m.role === 'plan');
  const a = plan.nodes.find((n) => n.title === 'Individuelles');
  ok(S.folder(a.ref) && S.folder(a.ref).courseId === cid, 'renvoi non suivi');
  ok(S.mapsOf(cid).find((m) => m.title === 'Le fond').folderId === ch.id, 'carte pas dans son dossier');
});

test('Export d’un cours : ses dossiers voyagent avec lui', () => {
  load(course());
  const out = JSON.parse(S.exportCourse('c1'));
  ok(out.folders.length === 5, 'dossiers absents de l’export');
  const back = S.sanitize(out);
  ok(back.maps.find((m) => m.id === 's1').folderId === 'ch1', 'aller-retour');
});

test('Déplacer une carte dans un dossier ; nouvelle carte rangée à la fin du dossier', () => {
  load(course());
  S.moveMap('g', 'c1', 'ch1');
  ok(S.map('g').folderId === 'ch1' && S.unitsIn('c1', 'ch1').items.pop().map.id === 'g', 'déplacement');
  const m = S.addMap('c1', 'Section 3', { folderId: 'ch1' });
  ok(S.unitsIn('c1', 'ch1').items.pop().map.id === m.id, 'nouvelle carte pas à la fin');
  S.moveMap('s1', 'c1', 'nulle-part');
  ok(S.map('s1').folderId === null, 'dossier inconnu accepté');
});

test('Cours à plat (ancien) : rien ne change, les plus récentes d’abord', () => {
  load({ courses: [{ id: 'c' }], maps: [
    { id: 'a', courseId: 'c', title: 'A', updatedAt: 1, nodes: [node('x', 'notion', 'A')], edges: [] },
    { id: 'b', courseId: 'c', title: 'B', updatedAt: 2, nodes: [node('x', 'notion', 'B')], edges: [] }] });
  const u = S.unitsIn('c', null);
  ok(!u.plan && u.items.map((x) => x.map.id).join() === 'b,a', 'ordre à plat');
  ok(S.planSequence(S.mapsOf('c')).size === 0, 'séquence inventée');
});

// Bug corrigé : la sauvegarde oubliait les dossiers ; au retour sur le site, les cartes étaient éparpillées
(async () => {
  try {
    const mem = new Map();
    win.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    load(course());
    const before = S.data.folders.map((f) => f.id).sort().join();
    await S._save();
    S.data = null;
    await S.load();
    ok(S.data.folders.map((f) => f.id).sort().join() === before, 'dossiers perdus au rechargement');
    ok(S.map('s1').folderId === 'ch1' && S.map('g').folderId === 'p2', 'cartes sorties de leur dossier');
    ok(S.unitsIn('c1', null).items.every((x) => x.kind === 'folder' || x.map.id === 'lost'), 'racine éparpillée');
    passed++; console.log('✓ Sauvegarde puis rechargement : dossiers et rangement conservés');
  } catch (e) { failed++; console.log('✗ Sauvegarde puis rechargement\n    ' + e.message); }
  console.log(`\n${passed} réussi(s), ${failed} échec(s)`);
  process.exit(failed ? 1 : 0);
})();
