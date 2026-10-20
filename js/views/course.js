/* Ratio — Cours et dossiers : le plan du cours devient une arborescence qu'on parcourt.
   Un cours rangé en dossiers (parties, titres, chapitres, sections) s'ouvre sur sa carte du plan
   et son sommaire ; chaque dossier a sa page, son plan, sa révision. Un cours à plat garde sa grille. */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;
  R.views = R.views || {};

  const KIND_ORDER = ['partie', 'titre', 'soustitre', 'chapitre', 'section'];
  const KIND_PLURAL = { partie: 'parties', titre: 'titres', soustitre: 'sous-titres', chapitre: 'chapitres', section: 'sections', autre: 'dossiers' };
  const KIND_OF = { partie: 'de la partie', titre: 'du titre', soustitre: 'du sous-titre', chapitre: 'du chapitre', section: 'de la section', autre: 'du dossier' };

  /** Numéro d'affichage : le dernier mot du numéro s'il en est un (« Partie II » → II), sinon le rang */
  function numeral(label, i) {
    const t = String(label || '').trim().split(/\s+/).pop().replace(/[.)]$/, '');
    const m = t.match(/^([IVXLCDM]+|\d+|[A-Z])(?:er|re)?$/);
    return m ? m[1] : String(i + 1);
  }
  const kindLabel = (f) => f.label || S.FOLDER_LABELS[f.kind];
  const plain = (s) => (R.md ? R.md.plain(s) : String(s || ''));
  const pct = (p) => Math.round(p * 100) + ' %';
  const dueText = (st) => (st.due && st.reviewable ? `${st.due} à réviser` : st.reviewable ? 'À jour' : 'Pas de fiche');

  /* ---- Mémoire du sommaire : parties dépliées (par cours, dans ce navigateur) ---- */
  const openKey = (cid) => 'ratio.sommaire.' + cid;
  function readOpen(cid) {
    try { const v = localStorage.getItem(openKey(cid)); return v == null ? null : new Set(JSON.parse(v)); } catch { return null; }
  }
  function writeOpen(cid, set) { try { localStorage.setItem(openKey(cid), JSON.stringify([...set])); } catch { /* stockage indisponible */ } }

  /* ------------------------------------------------------------------ */
  /* Actions sur les cartes                                             */
  /* ------------------------------------------------------------------ */
  R.actions.renameMap = async function (m) {
    const v = await ui.form({ title: 'Renommer la carte', icon: 'edit', ok: 'Enregistrer', fields: [{ key: 'title', label: 'Titre', value: m.title, required: true }] });
    if (v) S.updateMap(m.id, { title: v.title.trim() });
  };

  /** Ranger une carte : un cours ou l'un de ses dossiers, dans l'arbre du plan */
  R.actions.moveMap = async function (m) {
    const opts = [];
    for (const c of S.coursesSorted()) {
      opts.push({ courseId: c.id, folderId: null, depth: 0, c });
      const walk = (fid, d) => {
        for (const x of S.unitsIn(c.id, fid).items) if (x.folder) { opts.push({ courseId: c.id, folderId: x.folder.id, depth: d, f: x.folder }); if (d < 12) walk(x.folder.id, d + 1); }
      };
      walk(null, 1);
    }
    const here = (o) => o.courseId === m.courseId && o.folderId === (m.folderId || null);
    if (!opts.some((o) => !here(o))) { ui.snack('Crée d’abord un autre cours ou un dossier.'); return; }
    let chosen = opts.find((o) => !here(o));
    const list = h('div.choice-list.move-tree', { role: 'radiogroup' }, opts.map((o) => {
      const cur = here(o);
      const b = h('button.list-item.choice', { type: 'button', role: 'radio', disabled: cur, 'aria-checked': String(o === chosen), style: { '--d': o.depth } },
        o.f ? h('span.move-ic', R.icon('folder', 18)) : R.courseArt.mark(o.c, { size: 'sm' }),
        h('span.choice-l', o.f ? h('span', h('b', kindLabel(o.f)), o.f.label && o.f.title !== o.f.label ? ' · ' + o.f.title : '') : o.c.title,
          cur ? h('span.choice-sub', 'Emplacement actuel') : null),
        h('span.choice-check', R.icon('check', 20)));
      b.addEventListener('click', () => { chosen = o; U.$$('.choice', list).forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
      return b;
    }));
    const ok = await ui.dialog({ title: 'Ranger la carte dans…', icon: 'folder', body: list, actions: [{ label: 'Annuler', value: false }, { label: 'Ranger ici', value: true, variant: 'filled' }] });
    if (!ok) return;
    S.moveMap(m.id, chosen.courseId, chosen.folderId);
    const where = chosen.f ? `${kindLabel(chosen.f)} · ${chosen.f.title}` : S.course(chosen.courseId).title;
    ui.snack(`Carte rangée dans « ${where} »`, { action: 'Ouvrir', onAction: () => R.app.go(chosen.f ? '#/dossier/' + chosen.f.id : '#/cours/' + chosen.courseId) });
  };

  R.actions.deleteMap = async function (m, after) {
    const snap = S.deleteMap(m.id);
    if (after) after();
    ui.snack(`« ${m.title} » supprimée`, { action: 'Annuler', onAction: () => S.restore(snap), duration: 6000 });
  };

  /** Place d'une unité parmi ses voisines (pour Monter / Descendre) */
  function siblingIndex(courseId, folderId, id) {
    const { items } = S.unitsIn(courseId, folderId || null);
    return { i: items.findIndex((x) => (x.folder || x.map).id === id), n: items.length };
  }
  function shiftItems(courseId, parentId, id) {
    if (!S.hasFolders(courseId)) return [];
    const { i, n } = siblingIndex(courseId, parentId, id);
    return [
      i > 0 ? { label: 'Monter', icon: 'arrowUp', onClick: () => S.shiftUnit(courseId, parentId || null, id, -1) } : null,
      i >= 0 && i < n - 1 ? { label: 'Descendre', icon: 'chevronDown', onClick: () => S.shiftUnit(courseId, parentId || null, id, 1) } : null,
    ];
  }

  R.actions.mapMenu = function (anchor, m, after, { inEditor } = {}) {
    ui.menu(anchor, [
      { label: 'Renommer', icon: 'edit', onClick: () => R.actions.renameMap(m) },
      { label: 'Dupliquer', icon: 'copy', onClick: () => { const c = S.duplicateMap(m.id); ui.snack('Carte dupliquée', { action: 'Ouvrir', onAction: () => R.app.go('#/carte/' + c.id) }); } },
      { label: 'Ranger dans…', icon: 'folder', onClick: () => R.actions.moveMap(m) },
      ...(inEditor || m.role === 'plan' ? [] : shiftItems(m.courseId, m.folderId, m.id)),
      { label: 'Réviser cette carte', icon: 'cards', onClick: () => R.app.go('#/reviser/carte/' + m.id) },
      m.readOnly
        ? { label: 'Autoriser les modifications', icon: 'lockOpen', onClick: () => S.setReadOnly(m.id, false) }
        : { label: 'Lecture seule', icon: 'lock', onClick: () => { S.setReadOnly(m.id, true); ui.snack(`« ${m.title} » en lecture seule`, { action: 'Annuler', onAction: () => S.setReadOnly(m.id, false) }); } },
      { divider: true },
      { label: 'Exporter en Markdown', icon: 'download', onClick: () => U.download(`${U.slug(m.title)}.md`, R.outline.markdown(m), 'text/markdown') },
      { label: 'Exporter (JSON)', icon: 'download', onClick: () => U.download(`${U.slug(m.title)}.json`, JSON.stringify(m, null, 2)) },
      inEditor ? { label: 'Imprimer la fiche', icon: 'print', onClick: () => R.app.go('#/carte/' + m.id + '/plan?print=1') } : null,
      inEditor ? { divider: true } : null,
      inEditor && !m.readOnly && R.actions.chooseLayout ? { label: 'Disposition…', icon: 'tidy', onClick: () => R.actions.chooseLayout() } : null,
      inEditor && !m.readOnly && R.actions.organize ? { label: 'Améliorer l’organisation…', icon: 'tidy', onClick: () => R.actions.organize() } : null,
      inEditor ? { label: 'Couleurs des nœuds…', icon: 'palette', onClick: () => R.colors.openDialog() } : null,
      inEditor && (R.colors.settings().mode !== 'off' || R.colors.settings().last)
        ? { label: R.colors.settings().mode === 'off' ? 'Afficher les couleurs' : 'Masquer les couleurs', icon: R.colors.settings().mode === 'off' ? 'eye' : 'eyeOff', onClick: () => R.colors.toggle() } : null,
      { divider: true },
      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => R.actions.deleteMap(m, after) },
    ]);
  };

  /* ------------------------------------------------------------------ */
  /* Actions sur les dossiers                                           */
  /* ------------------------------------------------------------------ */
  /** Niveau proposé : celui des voisins, sinon le niveau sous le parent (Partie → Titre → … → Section) */
  function kindDefault(courseId, parentId) {
    const sib = S.unitsIn(courseId, parentId).items.find((x) => x.folder);
    if (sib) return sib.folder.kind;
    const p = S.folder(parentId);
    if (!p) return 'partie';
    const i = KIND_ORDER.indexOf(p.kind);
    return i >= 0 && i < KIND_ORDER.length - 1 ? KIND_ORDER[i + 1] : 'autre';
  }
  function autoLabel(courseId, parentId, kind) {
    if (kind === 'autre') return '';
    const n = S.unitsIn(courseId, parentId).items.filter((x) => x.folder && x.folder.kind === kind).length + 1;
    return S.FOLDER_LABELS[kind] + ' ' + (kind === 'partie' || kind === 'titre' ? U.roman(n) : n);
  }
  const KIND_CHOICES = S.FOLDER_KINDS.map((k) => ({ value: k, label: S.FOLDER_LABELS[k] }));

  R.actions.newFolder = async function (courseId, parentId = null, { from } = {}) {
    const kind = kindDefault(courseId, parentId);
    let auto = autoLabel(courseId, parentId, kind);
    const v = await ui.form({
      title: parentId ? 'Nouveau sous-dossier' : 'Nouvelle partie', icon: 'folder', ok: 'Créer', origin: from,
      fields: [
        { key: 'title', label: 'Intitulé', placeholder: 'Ex. Les relations individuelles de travail', required: true },
        { key: 'label', label: 'Numéro', value: auto, placeholder: 'Ex. Partie I, Chapitre 2' },
        { key: 'kind', label: 'Niveau dans le plan', value: kind, choices: KIND_CHOICES,
          onChange: (k, inputs) => { if (inputs.label.value === auto) { auto = autoLabel(courseId, parentId, k); inputs.label.value = auto; } } },
        { key: 'note', label: 'Pourquoi ici ? (facultatif)', multiline: true, maxlength: 600, placeholder: 'Ce que ce dossier apporte au cours, et pourquoi il vient à ce moment.' },
      ],
    });
    if (!v) return null;
    const f = S.addFolder(courseId, parentId, v);
    ui.snack(`« ${f.label || f.title} » créé`, { action: 'Ouvrir', onAction: () => R.app.go('#/dossier/' + f.id) });
    return f;
  };

  R.actions.editFolder = async function (f) {
    const v = await ui.form({
      title: 'Modifier le dossier', icon: 'edit', ok: 'Enregistrer',
      fields: [
        { key: 'title', label: 'Intitulé', value: f.title, required: true },
        { key: 'label', label: 'Numéro', value: f.label, placeholder: 'Ex. Partie I, Chapitre 2' },
        { key: 'kind', label: 'Niveau dans le plan', value: f.kind, choices: KIND_CHOICES },
        { key: 'note', label: 'Pourquoi ici ?', value: f.note || '', multiline: true, maxlength: 600 },
      ],
    });
    if (v) S.updateFolder(f.id, { title: v.title.trim(), label: v.label.trim(), kind: v.kind, note: v.note.trim() });
  };

  R.actions.folderMenu = function (anchor, f, { onDelete, inFolder } = {}) {
    ui.menu(anchor, [
      { label: 'Modifier', icon: 'edit', onClick: () => R.actions.editFolder(f) },
      { label: 'Nouvelle carte ici', icon: 'plus', onClick: () => R.actions.newMap(f.courseId, { folderId: f.id }) },
      { label: 'Nouveau sous-dossier', icon: 'folder', onClick: () => R.actions.newFolder(f.courseId, f.id) },
      inFolder ? null : { label: 'Réviser ce dossier', icon: 'cards', onClick: () => R.app.go('#/reviser/dossier/' + f.id) },
      { divider: true },
      ...shiftItems(f.courseId, f.parentId, f.id),
      { divider: true },
      { label: 'Supprimer le dossier', icon: 'trash', danger: true, onClick: () => {
        const snap = S.deleteFolder(f.id);
        if (onDelete) onDelete();
        ui.snack(`« ${f.label || f.title} » supprimé · son contenu remonte d’un niveau`, { action: 'Annuler', onAction: () => S.restore(snap), duration: 6000 });
      } },
    ]);
  };

  /* ------------------------------------------------------------------ */
  /* Sommaire : tout le plan d'un coup d'œil, et la recherche dedans    */
  /* ------------------------------------------------------------------ */
  R.actions.sommaire = function (courseId, { folderId = null, mapId = null, from } = {}) {
    const c = S.course(courseId);
    if (!c) return;
    const onPath = new Set();
    if (mapId) S.locate(S.map(mapId)).forEach((f) => onPath.add(f.id));
    if (folderId) S.folderPath(folderId).forEach((f) => onPath.add(f.id));
    let close = () => {};
    const go = (href) => (e) => { e.preventDefault(); close(); R.app.go(href); };

    const entry = (href, num, label, title, { cur, path, plan, meta } = {}) =>
      h('a.som-item', { href, onclick: go(href), class: (cur ? 'cur ' : '') + (path ? 'path ' : '') + (plan ? 'plan' : ''), 'aria-current': cur ? 'page' : null },
        h('span.som-num', plan ? R.icon('outline', 16) : num),
        h('span.som-txt', label ? h('span.som-label', label) : null, h('span.som-title', title)),
        meta || null);
    const walk = (fid, depth) => {
      const { items, plan } = S.unitsIn(courseId, fid);
      const ul = h('ul.som-list', { class: depth ? 'nested' : '' });
      if (plan) ul.appendChild(h('li', entry('#/carte/' + plan.id, '', fid ? 'Plan ' + KIND_OF[(S.folder(fid) || {}).kind || 'autre'] : 'Plan du cours', plan.title, { plan: true, cur: mapId === plan.id })));
      let nf = 0, nm = 0;
      for (const x of items) {
        if (x.folder) {
          const f = x.folder, st = S.folderStats(f.id);
          ul.appendChild(h('li.som-f', entry('#/dossier/' + f.id, numeral(f.label, nf++), kindLabel(f), f.title,
            { cur: folderId === f.id, path: onPath.has(f.id), meta: st.due ? h('span.som-due', String(st.due)) : null }), depth < 16 ? walk(f.id, depth + 1) : null));
        } else {
          const m = x.map, st = S.mapStats(m);
          ul.appendChild(h('li', entry('#/carte/' + m.id, numeral(m.label, nm++), m.label || null, m.title,
            { cur: mapId === m.id, meta: st.due && st.reviewable ? h('span.som-due', String(st.due)) : null })));
        }
      }
      return ul;
    };
    const tree = h('nav.som-tree', { 'aria-label': 'Plan du cours' }, walk(null, 0));
    const results = h('div.som-results', { hidden: true, role: 'list' });
    const q = h('input.som-q', { type: 'search', placeholder: 'Une partie, une carte, une notion…', 'aria-label': 'Chercher dans le cours', autocomplete: 'off' });

    const mark = (text, nq) => {
      const i = U.norm(text).indexOf(nq);
      return i < 0 ? text : [text.slice(0, i), h('mark', text.slice(i, i + nq.length)), text.slice(i + nq.length)];
    };
    const chips = (folders, extra) => h('span.som-path', [...folders.map((f) => kindLabel(f)), extra].filter(Boolean).map((t) => h('span.chip-path', t)));
    const search = () => {
      const nq = U.norm(q.value.trim());
      tree.hidden = !!nq;
      results.hidden = !nq;
      if (!nq) return;
      U.clear(results);
      const hits = [];
      for (const f of S.data.folders) if (f.courseId === courseId && U.norm(f.label + ' ' + f.title).includes(nq)) {
        hits.push({ rank: 0, el: h('a.som-hit', { href: '#/dossier/' + f.id, onclick: go('#/dossier/' + f.id), role: 'listitem' },
          h('span.som-hit-k', R.icon('folder', 16), kindLabel(f)), h('span.som-hit-t', mark(f.title, nq)), chips(S.folderPath(f.parentId))) });
      }
      for (const m of S.data.maps) {
        if (m.courseId !== courseId) continue;
        const where = S.locate(m);
        if (U.norm((m.label || '') + ' ' + m.title).includes(nq)) {
          hits.push({ rank: 1, el: h('a.som-hit', { href: '#/carte/' + m.id, onclick: go('#/carte/' + m.id), role: 'listitem' },
            h('span.som-hit-k', R.icon('map', 16), m.role === 'plan' ? 'Plan' : m.label || 'Carte'), h('span.som-hit-t', mark(m.title, nq)), chips(where)) });
        }
        for (const n of m.nodes) {
          if (hits.length > 60) break;
          if (!U.norm(n.title).includes(nq)) continue;
          const href = '#/carte/' + m.id + '?n=' + n.id;
          hits.push({ rank: 2, el: h('a.som-hit', { href, onclick: go(href), role: 'listitem' },
            h('span.som-hit-k', R.icon('dot', 16), S.TYPES[n.type] ? S.TYPES[n.type].label : 'Nœud'), h('span.som-hit-t', mark(n.title, nq)), chips(where, m.label || m.title)) });
        }
      }
      hits.sort((a, b) => a.rank - b.rank);
      if (!hits.length) results.appendChild(h('p.som-empty', 'Rien de tel dans ce cours.'));
      hits.slice(0, 40).forEach((x) => results.appendChild(x.el));
    };
    q.addEventListener('input', U.debounce(search, 80));

    const body = h('div.som',
      h('p.som-course', R.courseArt.mark(c, { size: 'sm' }), h('span', c.title)),
      h('label.som-search', R.icon('search', 20), q),
      tree, results);
    ui.dialog({
      title: 'Sommaire', body, cls: 'sommaire', origin: from,
      actions: [{ label: 'Fermer', value: undefined }],
      onOpen: (box, cl) => {
        close = () => cl(undefined);
        R.courseArt.tint(box, c);
        const cur = box.querySelector('.som-item.cur');
        if (cur) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
      },
    });
  };

  /* ------------------------------------------------------------------ */
  /* Briques                                                            */
  /* ------------------------------------------------------------------ */
  function mapCard(m, rerender) {
    const st = S.mapStats(m);
    const more = ui.iconBtn('more', { title: 'Options de la carte', cls: 'card-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.mapMenu(more, m, rerender); });
    return h('a.map-card.ripple', { href: '#/carte/' + m.id },
      h('div.mc-thumb', { dataset: { hero: 'map:' + m.id + ':thumb' } }, R.thumb(m)),
      h('div.mc-body',
        h('div.mc-head', h('h3.mc-title', h('span', { dataset: { hero: 'map:' + m.id + ':title' } }, m.title)), more),
        h('p.mc-meta', m.readOnly ? h('span.ro-badge', { title: 'Lecture seule' }, R.icon('lock', 14), 'Lecture seule') : null, `${U.plural(st.nodes, 'nœud')} · ${U.relTime(m.updatedAt)}`),
        h('div.mc-foot',
          ui.progress(st.progress, { label: 'Maîtrise de la carte' }),
          h('span.mc-due', dueText(st)))));
  }

  /** Ce que contient un dossier, en mots : « 3 chapitres · 12 cartes » */
  function contentsText(courseId, folderId) {
    const { items } = S.unitsIn(courseId, folderId);
    const kinds = {};
    let maps = 0;
    for (const x of items) { if (x.folder) kinds[x.folder.kind] = (kinds[x.folder.kind] || 0) + 1; else maps++; }
    const parts = Object.entries(kinds).map(([k, n]) => (n > 1 ? `${n} ${KIND_PLURAL[k]}` : `1 ${S.FOLDER_LABELS[k].toLowerCase()}`));
    if (maps) parts.push(U.plural(maps, 'carte'));
    return parts.join(' · ') || 'Vide';
  }

  /** Ligne d'unité dans un sommaire : un sous-dossier ou une carte, numérotée */
  function unitRow(x, num, rerender) {
    if (x.folder) {
      const f = x.folder, st = S.folderStats(f.id);
      return h('li', h('a.unit-row.is-folder.ripple', { href: '#/dossier/' + f.id },
        h('span.unit-num', num),
        h('span.unit-body',
          h('span.unit-label', kindLabel(f)),
          h('span.unit-title', f.title),
          h('span.unit-meta', contentsText(f.courseId, f.id), st.due ? h('span.due-dot', `${st.due} à réviser`) : null)),
        ui.ring(st.progress, { size: 32, stroke: 3.5, label: 'Maîtrise · ' + f.title }),
        h('span.unit-go', R.icon('chevronRight', 20))));
    }
    const m = x.map, st = S.mapStats(m);
    const more = ui.iconBtn('more', { title: 'Options de la carte', cls: 'unit-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.mapMenu(more, m, rerender); });
    return h('li', h('a.unit-row.is-map.ripple', { href: '#/carte/' + m.id },
      h('span.unit-thumb', { dataset: { hero: 'map:' + m.id + ':thumb' } }, R.thumb(m)),
      h('span.unit-body',
        h('span.unit-label', m.label ? m.label : h('span.unit-kind', 'Carte'), m.readOnly ? R.icon('lock', 12) : null),
        h('span.unit-title', h('span', { dataset: { hero: 'map:' + m.id + ':title' } }, m.title)),
        h('span.unit-meta', U.plural(st.nodes, 'nœud'), st.due && st.reviewable ? h('span.due-dot', `${st.due} à réviser`) : st.reviewable ? h('span.ok-dot', 'À jour') : null)),
      ui.ring(st.progress, { size: 32, stroke: 3.5, label: 'Maîtrise · ' + m.title }),
      more));
  }

  /** Liste numérotée du contenu d'un dossier (sous-dossiers et cartes, dans l'ordre du plan) */
  function unitList(courseId, folderId, rerender, cls = '') {
    const { items } = S.unitsIn(courseId, folderId);
    let nf = 0, nm = 0;
    return h('ol.unit-list', { class: cls }, items.map((x) => unitRow(x, x.folder ? numeral(x.folder.label, nf++) : numeral(x.map.label, nm++), rerender)));
  }

  /** Bloc d'une partie (ou d'un sous-dossier) : en-tête qui mène à sa page, contenu dépliable sur place */
  function folderBlock(f, i, ctx) {
    const st = S.folderStats(f.id);
    const open = ctx.open.has(f.id);
    const bodyId = 'pb-' + f.id;
    const toggle = ui.iconBtn('chevronDown', { title: open ? 'Replier' : 'Déplier', cls: 'part-toggle' });
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', bodyId);
    const more = ui.iconBtn('more', { title: 'Options du dossier', cls: 'part-more' });
    more.addEventListener('click', () => R.actions.folderMenu(more, f));
    const sec = h('section.part', { class: (open ? 'open ' : '') + (ctx.sub ? 'sub' : ''), style: { '--i': i } },
      h('div.part-head',
        h('a.part-link.ripple', { href: '#/dossier/' + f.id, dataset: { hero: 'folder:' + f.id + ':band' } },
          h('span.part-num', { 'aria-hidden': 'true' }, numeral(f.label, i)),
          h('span.part-id',
            h('span.part-label', kindLabel(f)),
            h('span.part-title', f.title),
            f.note ? h('span.part-note', plain(f.note)) : null,
            h('span.part-meta', contentsText(f.courseId, f.id), st.due ? h('span.due-chip', R.icon('cards', 14), String(st.due)) : null)),
          ui.ring(st.progress, { size: 48, stroke: 4, text: pct(st.progress), label: 'Maîtrise · ' + f.title })),
        h('div.part-tools', toggle, more)),
      h('div.part-body', { id: bodyId }, h('div.part-body-in', unitList(f.courseId, f.id, ctx.rerender))));
    toggle.addEventListener('click', () => {
      const now = !sec.classList.contains('open');
      sec.classList.toggle('open', now);
      toggle.setAttribute('aria-expanded', String(now));
      toggle.setAttribute('aria-label', now ? 'Replier' : 'Déplier');
      toggle.dataset.tip = now ? 'Replier' : 'Déplier';
      if (now) ctx.open.add(f.id); else ctx.open.delete(f.id);
      writeOpen(f.courseId, ctx.open);
      if (ctx.onToggle) ctx.onToggle();
    });
    return sec;
  }

  /** « Reprendre » : la prochaine fiche de la portée, avec son adresse dans le plan */
  function resumeCard(scope, startBase) {
    const nx = S.reviewQueue(scope, { limit: 1 })[0];
    if (!nx) {
      const info = scope.courseId && !scope.folderId ? S.nextDueInfo({ courseId: scope.courseId }).next : Infinity;
      const days = info < Infinity ? Math.max(1, Math.round((U.startOfDay(info) - U.startOfDay()) / U.DAY)) : 0;
      return h('div.resume.is-done',
        h('span.resume-ic', R.icon('check', 22)),
        h('span.resume-body', h('span.overline', 'Révision'), h('span.resume-q', 'Tout est à jour'),
          h('span.resume-sub', days ? `Prochaine révision ${days === 1 ? 'demain' : `dans ${days} jours`}` : 'Écris des notes : elles deviendront des fiches')));
    }
    const m = S.map(nx.mapId), n = S.node(m, nx.nodeId);
    const T = S.TYPES[n.type];
    const path = [...S.locate(m).map(kindLabel), m.label || m.title];
    return h('a.resume.ripple', { href: `${startBase}?start=${m.id}.${n.id}` },
      h('span.resume-body',
        h('span.overline', n.review.last ? 'Reprendre · en retard' : 'Reprendre · prochaine fiche'),
        h('span.resume-q', n.title),
        h('span.resume-path', path.map((t, k) => [k ? R.icon('chevronRight', 14) : null, h('span', t)]), T ? h('span.resume-type', m.role === 'plan' ? S.kickerOf(m, n) : T.label) : null)),
      h('span.resume-play', R.icon('play', 22)));
  }

  /** Carte du plan : un sommaire lisible (parties numérotées et leurs sous-parties), pas une miniature */
  function planCard(plan, title) {
    const root = S.roots(plan)[0];
    const why = root && root.note ? plain(root.note) : '';
    const links = plan.edges.filter((e) => e.kind === 'link' && e.label).length;
    const parts = root ? S.childrenOf(plan, root.id) : [];
    const MAX = 3;
    const part = (n, i) => {
      const kids = S.childrenOf(plan, n.id);
      return h('li.pc-part', { style: { '--i': i } },
        h('span.pc-num', String(i + 1).padStart(2, '0')),
        h('span.pc-pt', n.title),
        kids.length ? h('ul.pc-subs', kids.slice(0, MAX).map((k) => h('li', k.title)),
          kids.length > MAX ? h('li.pc-more', `+ ${kids.length - MAX} autre${kids.length - MAX > 1 ? 's' : ''}`) : null) : null);
    };
    return h('a.plan-card.ripple', { href: '#/carte/' + plan.id },
      h('span.pc-head',
        h('span.overline', R.icon('outline', 14), title),
        h('span.plan-title', h('span', { dataset: { hero: 'map:' + plan.id + ':title' } }, root ? root.title : plan.title)),
        why ? h('span.plan-why', why) : null),
      parts.length ? h('ol.pc-parts', parts.map(part)) : null,
      h('span.plan-foot',
        h('span', U.plural(parts.length, 'partie', 'parties')),
        links ? h('span', U.plural(links, 'lien expliqué', 'liens expliqués')) : null,
        h('span.plan-open', 'Ouvrir le plan', R.icon('chevronRight', 16))));
  }

  const stat = (n, l) => h('div.stat', h('span.stat-n', String(n)), h('span.stat-l', l));
  function statsRow(st, { maps = true } = {}) {
    return h('div.course-stats',
      maps ? stat(st.maps, st.maps > 1 ? 'cartes' : 'carte') : null,
      stat(st.nodes, st.nodes > 1 ? 'nœuds' : 'nœud'),
      stat(st.due, 'à réviser'),
      h('div.stat.stat-progress', h('span.stat-n', pct(st.progress)), h('span.stat-l', 'maîtrise'), ui.progress(st.progress)));
  }
  function countUp(el) {
    for (const n of U.$$('.course-stats .stat-n', el)) {
      const m = n.textContent.match(/^(\d+)( %)?$/);
      if (m) R.motion.countUp(n, +m[1], { duration: 800, format: (v) => v + (m[2] || '') });
    }
  }
  function notFound(el, what) {
    el.appendChild(h('div.page', h('div.page-scroll', ui.emptyState({
      icon: 'folder', title: what + ' introuvable', text: 'Il a peut-être été supprimé.',
      action: ui.btn('Retour aux cours', { variant: 'filled', onClick: () => R.app.go('#/') }),
    }))));
  }

  /** Contenu d'un niveau du plan : blocs pour les dossiers, lignes pour les cartes isolées */
  function levelBlocks(courseId, folderId, ctx) {
    const wrap = h('div.parts');
    const { items } = S.unitsIn(courseId, folderId);
    let loose = null, nf = 0, nm = 0;
    for (const x of items) {
      if (x.folder) { loose = null; wrap.appendChild(folderBlock(x.folder, nf++, ctx)); continue; }
      if (!loose) { loose = h('ol.unit-list.loose'); wrap.appendChild(loose); }
      loose.appendChild(unitRow(x, numeral(x.map.label, nm++), ctx.rerender));
    }
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Page d'un cours                                                    */
  /* ------------------------------------------------------------------ */
  R.views.course = {
    mount(el, route) {
      let intro = R.motion.first('course:' + route.id);
      const draw = () => {
        const course = S.course(route.id);
        U.clear(el);
        if (!course) { notFound(el, 'Cours'); return; }
        const st = S.courseStats(course.id);
        const { items, plan } = S.unitsIn(course.id, null);
        const planned = S.hasFolders(course.id) || !!plan;

        const more = ui.iconBtn('more', { title: 'Options du cours' });
        more.addEventListener('click', () => R.actions.courseMenu(more, course, () => R.app.go('#/', { replace: true }), { inCourse: true }));
        const som = planned ? ui.iconBtn('list', { title: 'Sommaire', onClick: (e) => R.actions.sommaire(course.id, { from: e.currentTarget }) }) : null;

        // barre haute à la couleur du cours : elle prolonge l'en-tête (une seule surface)
        const topbar = R.courseArt.tint(h('header.topbar.course-topbar',
          ui.iconBtn('back', { title: 'Cours', onClick: () => R.app.go('#/') }),
          h('div.topbar-title.crumbs', h('a.crumb', { href: '#/' }, 'Cours'), R.icon('chevronRight', 16), h('span.crumb.current', course.title)),
          h('div.topbar-actions', som, more)), course);

        // les grandes parties, en jalons cliquables sous le titre : l'architecture du cours d'un coup d'œil
        const roots = items.filter((x) => x.folder).map((x) => x.folder);
        const strip = roots.length > 1 ? h('nav.hero-parts', { 'aria-label': 'Parties du cours' },
          roots.map((f, i) => h('a.hero-part', { href: '#/dossier/' + f.id }, h('b', numeral(f.label, i)), h('span', f.title)))) : null;
        const hero = R.courseArt.tint(h('header.course-hero', { dataset: { hero: 'course:' + course.id + ':band' } },
          h('div.course-hero-in',
            h('p.overline', planned ? `Cours · ${contentsText(course.id, null)}` : 'Cours'),
            h('h1.course-title', h('span', { dataset: { hero: 'course:' + course.id + ':title' } }, course.title)),
            course.description ? h('p.course-desc', course.description) : null,
            strip)), course);

        const layout = h('div.course-layout.course-scope', h('div.course-head', statsRow(st)));
        const reviewBase = '#/reviser/cours/' + course.id;
        if (st.reviewable || plan) layout.appendChild(h('div.deck', { class: plan ? '' : 'solo' }, plan ? planCard(plan, 'Plan du cours') : null, st.reviewable ? resumeCard({ courseId: course.id }, reviewBase) : null));

        if (planned) {
          const stored = readOpen(course.id);
          const ctx = { open: stored || new Set(roots.map((f) => f.id)), rerender: draw };
          const allBtn = ui.btn('', { variant: 'text', cls: 'sec-toggle' });
          const syncAll = () => {
            const all = roots.length && roots.every((f) => ctx.open.has(f.id));
            allBtn.querySelector('.btn-label') ? (allBtn.querySelector('.btn-label').textContent = all ? 'Tout replier' : 'Tout déplier') : allBtn.appendChild(h('span.btn-label', all ? 'Tout replier' : 'Tout déplier'));
            allBtn.dataset.all = all ? '1' : '';
          };
          ctx.onToggle = syncAll;
          allBtn.addEventListener('click', () => {
            const close = allBtn.dataset.all === '1';
            ctx.open = close ? new Set() : new Set(roots.map((f) => f.id));
            writeOpen(course.id, ctx.open);
            draw();
          });
          syncAll();
          const blocks = levelBlocks(course.id, null, ctx);
          layout.appendChild(h('section.lib-sec.sommaire-sec',
            h('div.sec-head', h('h2.sec-title', 'Sommaire'), h('span.sec-count', String(st.maps)), h('span.sec-sp'), roots.length ? allBtn : null),
            blocks,
            h('div.add-row',
              ui.btn('Nouvelle partie', { icon: 'folder', variant: 'tonal', onClick: (e) => R.actions.newFolder(course.id, null, { from: e.currentTarget }) }),
              ui.btn('Nouvelle carte', { icon: 'plus', variant: 'text', onClick: (e) => R.actions.newMap(course.id, { from: e.currentTarget }) }))));
          if (intro) R.motion.stagger(Array.from(blocks.children), 1);
        } else {
          const maps = S.mapsOf(course.id);
          const grid = h('div.map-grid');
          maps.forEach((m) => grid.appendChild(mapCard(m, draw)));
          grid.appendChild(h('button.map-card.map-add.ripple', { type: 'button', onclick: (e) => R.actions.newMap(course.id, { from: e.currentTarget }) },
            h('span.add-ic', R.icon('plus', 20)), h('span.add-txt', h('span.add-l', 'Nouvelle carte'), h('span.add-s', 'Une notion ou un chapitre'))));
          if (intro) R.motion.stagger(Array.from(grid.children), 1);
          const organize = ui.btn('Ranger en parties', { icon: 'folder', variant: 'text', onClick: (e) => R.actions.newFolder(course.id, null, { from: e.currentTarget }) });
          layout.appendChild(maps.length
            ? h('section.lib-sec', h('div.sec-head', h('h2.sec-title', 'Cartes'), h('span.sec-count', String(maps.length)), h('span.sec-sp'), organize), grid)
            : h('section.lib-sec', ui.emptyState({
              icon: 'map', title: 'Aucune carte dans ce cours',
              text: 'Une carte = une notion à décomposer : sa définition, ses conditions, ses exceptions… Un long cours se range en parties et en chapitres.',
              action: h('div.empty-actions',
                ui.btn('Créer la première carte', { icon: 'plus', variant: 'filled', onClick: () => R.actions.newMap(course.id) }),
                ui.btn('Ranger en parties', { icon: 'folder', variant: 'text', onClick: () => R.actions.newFolder(course.id, null) })),
            })));
        }

        // la page du cours est la zone du cours : ses rôles Material s'y appliquent (boutons, progression)
        el.appendChild(h('div.page.page-course', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', hero, R.courseArt.tint(layout, course))));
        if (intro) {
          countUp(el); // value change : les chiffres du cours défilent à la première ouverture
          const pg = el.querySelector('.page-course');
          setTimeout(() => pg && pg.classList.remove('intro'), 1400);
        }
        intro = false;
      };
      /* barre d'actions du cours, à sa couleur (toolbar vibrante) : Réviser en forte emphase et
         Nouvelle carte. Le reste (modifier, exporter, supprimer) vit dans le menu ⋮ de la barre haute. */
      const actions = () => {
        const c = S.course(route.id);
        if (!c) { R.app.setActions(null); return; }
        const st = S.courseStats(c.id);
        const items = [];
        if (st.reviewable) items.push({ icon: 'play', label: 'Réviser', count: st.due || null, aria: st.due ? `Réviser · ${st.due} carte${st.due > 1 ? 's' : ''}` : null, primary: true, onClick: () => R.app.go('#/reviser/cours/' + c.id + (st.due ? '' : '?all=1')) });
        if (S.hasFolders(c.id)) items.push({ icon: 'list', label: 'Sommaire', cls: 'only-compact', onClick: (e, b) => R.actions.sommaire(c.id, { from: b }) });
        items.push({ icon: 'plus', label: 'Nouvelle carte', primary: !st.reviewable, cls: 'only-compact', onClick: (e, b) => R.actions.newMap(c.id, { from: b }) });
        R.app.setActions({ items, vibrant: true, course: c, replaceNav: true });
      };
      draw();
      actions();
      R.app.setFab({ icon: 'plus', label: 'Nouvelle carte', onClick: () => R.actions.newMap(route.id) });
      const off = S.on((t) => { if (t === 'change' || t === 'import' || t === 'review' || t === 'readonly') { draw(); actions(); } });
      return { unmount: off };
    },
  };

  /* ------------------------------------------------------------------ */
  /* Page d'un dossier (partie, titre, chapitre, section…)              */
  /* ------------------------------------------------------------------ */
  R.views.folder = {
    mount(el, route) {
      let intro = R.motion.first('folder:' + route.id);
      const upOf = (f) => (f.parentId && S.folder(f.parentId) ? '#/dossier/' + f.parentId : '#/cours/' + f.courseId);
      const draw = () => {
        const f = S.folder(route.id);
        const course = f && S.course(f.courseId);
        U.clear(el);
        if (!f || !course) { notFound(el, 'Dossier'); return; }
        const path = S.folderPath(f.id);
        const ancestors = path.slice(0, -1);
        const st = S.folderStats(f.id);
        const { items, plan } = S.unitsIn(course.id, f.id);
        const up = upOf(f);

        const more = ui.iconBtn('more', { title: 'Options du dossier' });
        more.addEventListener('click', () => R.actions.folderMenu(more, f, { inFolder: true, onDelete: () => R.app.go(up, { replace: true }) }));
        const som = ui.iconBtn('list', { title: 'Sommaire', onClick: (e) => R.actions.sommaire(course.id, { folderId: f.id, from: e.currentTarget }) });
        const crumbs = h('div.topbar-title.crumbs',
          h('a.crumb', { href: '#/cours/' + course.id }, course.title),
          ancestors.map((a, k) => [R.icon('chevronRight', 16), h('a.crumb', { href: '#/dossier/' + a.id, class: k < ancestors.length - 1 ? 'mid' : '' }, kindLabel(a))]),
          R.icon('chevronRight', 16), h('span.crumb.current', kindLabel(f)));
        const topbar = R.courseArt.tint(h('header.topbar.course-topbar',
          ui.iconBtn('back', { title: 'Remonter', onClick: () => R.app.go(up) }),
          crumbs, h('div.topbar-actions', som, more)), course);

        const siblings = S.unitsIn(course.id, f.parentId).items.filter((x) => x.folder).map((x) => x.folder);
        const at = siblings.indexOf(f);
        const hero = R.courseArt.tint(h('header.course-hero.folder-hero', { dataset: { hero: 'folder:' + f.id + ':band' } },
          h('div.course-hero-in',
            h('p.overline', [course.title, ...ancestors.map(kindLabel)].join(' · ')),
            h('div.folder-id',
              h('span.folder-num', { 'aria-hidden': 'true' }, numeral(f.label, Math.max(0, at))),
              h('div.folder-titles',
                h('p.folder-label', kindLabel(f)),
                h('h1.course-title', f.title))),
            f.note ? h('p.course-desc.folder-why', plain(f.note)) : null)), course);

        const ctx = { open: readOpen(course.id) || new Set(items.filter((x) => x.folder).map((x) => x.folder.id)), rerender: draw, sub: true };
        const layout = h('div.course-layout.course-scope', h('div.course-head', statsRow(st)));
        if (st.reviewable || plan) layout.appendChild(h('div.deck', { class: plan ? '' : 'solo' }, plan ? planCard(plan, 'Plan ' + KIND_OF[f.kind]) : null, st.reviewable ? resumeCard({ folderId: f.id }, '#/reviser/dossier/' + f.id) : null));

        const body = items.length
          ? (items.some((x) => x.folder) ? levelBlocks(course.id, f.id, ctx) : unitList(course.id, f.id, draw, 'roomy'))
          : ui.emptyState({ icon: 'folder', title: 'Dossier vide', text: 'Une carte par section garde chaque chapitre lisible.',
            action: h('div.empty-actions',
              ui.btn('Nouvelle carte', { icon: 'plus', variant: 'filled', onClick: () => R.actions.newMap(course.id, { folderId: f.id }) }),
              ui.btn('Sous-dossier', { icon: 'folder', variant: 'text', onClick: () => R.actions.newFolder(course.id, f.id) })) });
        layout.appendChild(h('section.lib-sec.sommaire-sec',
          h('div.sec-head', h('h2.sec-title', 'Contenu'), h('span.sec-count', String(st.maps))),
          body,
          items.length ? h('div.add-row',
            ui.btn('Nouvelle carte', { icon: 'plus', variant: 'tonal', onClick: (e) => R.actions.newMap(course.id, { folderId: f.id, from: e.currentTarget }) }),
            ui.btn('Sous-dossier', { icon: 'folder', variant: 'text', onClick: (e) => R.actions.newFolder(course.id, f.id, { from: e.currentTarget }) })) : null));

        // voisins : on passe d'un chapitre à l'autre sans remonter
        const prev = at > 0 ? siblings[at - 1] : null, next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;
        if (prev || next) {
          layout.appendChild(h('nav.pager', { 'aria-label': 'Dossiers voisins' },
            prev ? h('a.pager-l.ripple', { href: '#/dossier/' + prev.id }, R.icon('back', 20), h('span', h('span.pager-k', 'Précédent · ' + kindLabel(prev)), h('span.pager-t', prev.title))) : h('span'),
            next ? h('a.pager-r.ripple', { href: '#/dossier/' + next.id }, h('span', h('span.pager-k', 'Suivant · ' + kindLabel(next)), h('span.pager-t', next.title)), R.icon('chevronRight', 20)) : null));
        }

        el.appendChild(h('div.page.page-course.page-folder', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', hero, R.courseArt.tint(layout, course))));
        if (intro) {
          countUp(el);
          const list = layout.querySelector('.parts, .unit-list');
          if (list) R.motion.stagger(Array.from(list.children), 1);
          const pg = el.querySelector('.page-course');
          setTimeout(() => pg && pg.classList.remove('intro'), 1400);
        }
        intro = false;
      };
      const actions = () => {
        const f = S.folder(route.id);
        const c = f && S.course(f.courseId);
        if (!c) { R.app.setActions(null); return; }
        const st = S.folderStats(f.id);
        const items = [];
        if (st.reviewable) items.push({ icon: 'play', label: 'Réviser', count: st.due || null, aria: `Réviser ${kindLabel(f)}${st.due ? ` · ${st.due} carte${st.due > 1 ? 's' : ''}` : ''}`, primary: true, onClick: () => R.app.go('#/reviser/dossier/' + f.id + (st.due ? '' : '?all=1')) });
        items.push({ icon: 'list', label: 'Sommaire', cls: 'only-compact', onClick: (e, b) => R.actions.sommaire(c.id, { folderId: f.id, from: b }) });
        items.push({ icon: 'plus', label: 'Nouvelle carte', primary: !st.reviewable, cls: 'only-compact', onClick: (e, b) => R.actions.newMap(c.id, { folderId: f.id, from: b }) });
        R.app.setActions({ items, vibrant: true, course: c, replaceNav: true });
      };
      draw();
      actions();
      R.app.setFab({ icon: 'plus', label: 'Nouvelle carte', onClick: () => { const f = S.folder(route.id); if (f) R.actions.newMap(f.courseId, { folderId: f.id }); } });
      const off = S.on((t) => { if (t === 'change' || t === 'import' || t === 'review' || t === 'readonly') { draw(); actions(); } });
      return { unmount: off };
    },
  };
})(window.R);
