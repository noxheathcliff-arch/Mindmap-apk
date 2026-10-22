/* Ratio — Éditeur de carte
   Canvas infini (pan / zoom / pincement), nœuds typés, liens hiérarchiques et renvois,
   panneau de note (docké / latéral / bottom sheet), annuler/rétablir, mode masqué. */
(function (R) {
  'use strict';
  const { U, ui, store: S, motion } = R;
  const { h } = U;
  R.views = R.views || {};

  const MIN_K = 0.2, MAX_K = 2.5;
  const EDGE_PRESETS = ['ET', 'OU', 'sauf', 'implique', 'voir', 'car', 'donc'];

  R.views.editor = {
    mount(el, route) {
      const map = S.map(route.id);
      if (!map) {
        el.appendChild(h('div.page', h('div.page-scroll', ui.emptyState({
          icon: 'map', title: 'Carte introuvable', text: 'Elle a peut-être été supprimée.',
          action: ui.btn('Retour aux cours', { variant: 'filled', onClick: () => R.app.go('#/') }),
        }))));
        return {};
      }
      return new Editor(el, map, route);
    },
  };

  /* ==================================================================== */
  function Editor(root, map, route) {
    const ed = this;
    const course = () => S.course(map.courseId);

    const st = {
      view: { x: 0, y: 0, k: 1 },
      sel: new Set(),
      primary: null,
      selEdge: null,
      els: new Map(),        // id → élément nœud
      sizes: new Map(),      // id → {w,h}
      edgeEls: new Map(),    // id → {g, path, hit, label}
      bundleEls: new Map(),  // fourche → {g, trunk, hit, label}
      editing: null,
      linking: null,
      masked: false,
      revealed: new Set(),
      undo: [], redo: [],
      coalesce: null, coalesceAt: 0,
      mode: route.mode || 'map',
      paneOpen: false,
      sheet: 'closed',
      paneFor: undefined,
      noteTab: null,
      fresh: new Set(),      // nœuds nés (animation)
      origin: new Map(),     // id → parent d'où le nœud émerge (clonage)
      retract: new Map(),    // id → parent dans lequel le nœud se range (repli)
      lastTap: null,
      destroyed: false,
    };
    ed.st = st;

    /* ------------------------------------------------------------------ */
    /* DOM                                                                */
    /* ------------------------------------------------------------------ */
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'edges');
    svg.innerHTML = '<defs>' +
      '<marker id="arw" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1.5 L9,5 L1,8.5 z" style="fill:var(--outline)"/></marker>' +
      '<marker id="arw-sel" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1.5 L9,5 L1,8.5 z" style="fill:var(--on-surface)"/></marker>' +
      '</defs><g class="edges-g"></g><path class="temp-edge" d=""/>';
    const edgesG = svg.querySelector('.edges-g');
    const tempEdge = svg.querySelector('.temp-edge');

    const nodesLayer = h('div.nodes');
    const labelsLayer = h('div.edge-labels');
    // étiquettes de fourche au-dessus des nœuds : le libellé commun ne doit jamais être masqué
    const junctionLayer = h('div.edge-labels.junctions');
    // libellés au-dessus des nœuds : un libellé masqué par un nœud est une information perdue
    const world = h('div.world', svg, nodesLayer, labelsLayer, junctionLayer);
    const marquee = h('div.marquee', { hidden: true });
    const grid = h('div.grid', { 'aria-hidden': 'true' });
    const canvas = h('div.canvas', { tabindex: '0', role: 'application', 'aria-label': 'Carte mentale — ' + map.title, dataset: { hero: 'map:' + map.id + ':thumb' } }, grid, world, marquee);

    const ctxBar = h('div.ctx-bar', { role: 'toolbar', 'aria-label': 'Actions du nœud' });
    const banner = h('div.ed-banner', { hidden: true, role: 'status' });
    const zoomLabel = h('button.zoom-label', { type: 'button', 'data-tip': 'Zoom 100 %', onclick: () => zoomTo(1) }, '100 %');
    const vtool = buildVToolbar();
    const coach = h('div.coach', { hidden: true });
    const planHost = h('div.plan-host', { hidden: true });
    const stage = h('div.ed-stage', canvas, vtool, ctxBar, banner, coach, planHost);

    const pane = h('aside.pane', { 'aria-label': 'Note du nœud' });
    const paneHandle = h('div.sheet-handle', { 'aria-hidden': 'true' }, h('span'));
    const paneInner = h('div.pane-inner');
    pane.append(paneHandle, paneInner);

    const bottomBar = h('div.bottombar', { role: 'toolbar' });
    const saveState = h('span.save-state', { 'aria-live': 'polite' }, R.icon('check', 16), h('span', 'Enregistré'));
    const titleBtn = h('button.ed-title', { type: 'button', 'data-tip': 'Renommer la carte', onclick: () => { if (!guard()) R.actions.renameMap(map); }, dataset: { hero: 'map:' + map.id + ':title' } });
    const crumbCourse = h('a.crumb', { href: '#/cours/' + map.courseId });
    // dossiers du plan entre le cours et la carte : « Partie I › Chapitre 1 »
    const crumbPath = h('span.ed-path');
    const undoBtn = ui.iconBtn('undo', { title: 'Annuler', onClick: () => undo() });
    const redoBtn = ui.iconBtn('redo', { title: 'Rétablir', onClick: () => redo() });
    undoBtn.dataset.kbd = `${U.mod} Z`; redoBtn.dataset.kbd = `${U.mod} ⇧ Z`;
    const paneBtn = ui.iconBtn('panel', { title: 'Panneau de note', cls: 'only-docked', onClick: () => togglePane() });
    /* Lecture seule : un interrupteur dans la barre ; allumé, il affiche son libellé */
    const lockBtn = h('button.ed-lock', { type: 'button' }, h('span.ed-lock-ic'), h('span.ed-lock-l', 'Lecture seule'));
    lockBtn.addEventListener('click', () => toggleReadOnly());
    const moreBtn = ui.iconBtn('more', { title: 'Options de la carte' });
    moreBtn.addEventListener('click', () => R.actions.mapMenu(moreBtn, map, () => R.app.go('#/cours/' + map.courseId, { replace: true }), { inEditor: true }));
    const modeSeg = h('div.segmented.seg-sm.mode-seg', { role: 'tablist', 'aria-label': 'Affichage' },
      segBtn('map', 'Carte', 'map'), segBtn('plan', 'Plan', 'outline'));

    function segBtn(mode, label, icon) {
      const b = h('button.seg-btn', { type: 'button', role: 'tab', dataset: { mode }, 'data-tip': label + ' (P)' }, R.icon(icon, 18), h('span.seg-l', label));
      b.addEventListener('click', () => setMode(mode));
      return b;
    }
    ui.segIndicator(modeSeg, 'editor-mode');

    const topbar = h('header.topbar.ed-topbar',
      ui.iconBtn('back', { title: 'Retour', onClick: () => { flushEdit(); R.app.go(S.folder(map.folderId) ? '#/dossier/' + map.folderId : '#/cours/' + map.courseId); } }),
      h('div.ed-crumbs', crumbCourse, crumbPath, h('span.crumb-sep', R.icon('chevronRight', 16)), titleBtn),
      modeSeg,
      h('div.topbar-actions', lockBtn, saveState, h('span.only-wide-ed.ed-history', undoBtn, redoBtn),
        ui.iconBtn('search', { title: 'Rechercher', cls: 'ed-search', onClick: (e) => R.search.open('', { from: e.currentTarget }) }), paneBtn, moreBtn));

    const body = h('div.ed-body', stage, pane);
    const page = h('div.page.page-editor', topbar, body, bottomBar);
    root.appendChild(page);

    /* ------------------------------------------------------------------ */
    /* Lecture seule                                                      */
    /* ------------------------------------------------------------------ */
    /* La carte se lit, se parcourt et se révise (sélection, notes, replier, isoler, masqué,
       Plan) ; tout ce qui change son contenu est refusé ici et, par sécurité, dans mutate. */
    const ro = () => !!map.readOnly;
    let roNudgeAt = 0;
    /** true si l'action doit être refusée (et le signale, sans répéter le message) */
    function guard() {
      if (!ro()) return false;
      const now = Date.now();
      if (now - roNudgeAt > 2500) {
        roNudgeAt = now;
        ui.snack('Carte en lecture seule', { action: 'Modifier', onAction: () => S.setReadOnly(map.id, false) });
      }
      // l'interrupteur se signale : petit balancement, une fois
      lockBtn.classList.remove('nudge'); void lockBtn.offsetWidth; lockBtn.classList.add('nudge');
      return true;
    }
    function toggleReadOnly() {
      const on = !ro();
      S.setReadOnly(map.id, on);
      if (on) ui.snack('Lecture seule : la carte ne peut plus être modifiée', { action: 'Annuler', onAction: () => S.setReadOnly(map.id, false), duration: 3000 });
    }
    function applyReadOnly(first) {
      const on = ro();
      page.classList.toggle('is-ro', on);
      lockBtn.setAttribute('aria-pressed', String(on));
      lockBtn.setAttribute('aria-label', on ? 'Lecture seule activée — autoriser les modifications' : 'Passer en lecture seule');
      lockBtn.dataset.tip = on ? 'Autoriser les modifications' : 'Lecture seule';
      const ic = lockBtn.querySelector('.ed-lock-ic');
      U.clear(ic); ic.appendChild(R.icon(on ? 'lock' : 'lockOpen', 20));
      if (first) return;
      if (on) { flushEdit(); if (st.linking) stopLinking(); if (st.selEdge) select(null); st.noteTab = 'read'; }
      ic.classList.remove('swap'); void ic.offsetWidth; ic.classList.add('swap');
      ctxKey = ''; bbKey = '';
      render(); renderPane(true); positionCtx(); renderBottomBar(); updateBanner();
    }

    /* ------------------------------------------------------------------ */
    /* Historique                                                         */
    /* ------------------------------------------------------------------ */
    const snapshot = () => JSON.stringify({ nodes: map.nodes, edges: map.edges, layout: map.layout || null, layoutPick: map.layoutPick || null });
    /* view : changement d'affichage (replier, isoler), permis en lecture seule */
    function mutate(fn, { coalesce, pane: refreshPane = true, type = 'edit', view = false } = {}) {
      if (!view && guard()) return undefined;
      const now = Date.now();
      if (!(coalesce && st.coalesce === coalesce && now - st.coalesceAt < 1500)) {
        st.undo.push(snapshot());
        if (st.undo.length > 150) st.undo.shift();
        st.redo = [];
      }
      st.coalesce = coalesce || null;
      st.coalesceAt = now;
      const r = fn();
      // les fourches restent cohérentes après toute modification (suppression, nature…)
      S.normalizeGroups(map.edges);
      S.touchMap(map, type);
      render();
      if (refreshPane) renderPane(true);
      updateHistoryBtns();
      return r;
    }
    function restoreSnap(s) {
      const d = JSON.parse(s);
      map.nodes = d.nodes; map.edges = d.edges;
      // la disposition fait partie de l'état (elle fixe l'ordre de lecture)
      if ('layout' in d) { if (d.layout) map.layout = d.layout; else delete map.layout; }
      if ('layoutPick' in d) { if (d.layoutPick) map.layoutPick = d.layoutPick; else delete map.layoutPick; }
      for (const id of [...st.sel]) if (!S.node(map, id)) st.sel.delete(id);
      if (st.primary && !S.node(map, st.primary)) st.primary = [...st.sel][0] || null;
      if (st.selEdge && !map.edges.find((e) => e.id === st.selEdge)) st.selEdge = null;
      st.coalesce = null;
      S.touchMap(map, 'edit');
      render();
      renderPane(true);
      updateHistoryBtns();
    }
    function undo() {
      if (!st.undo.length || ro()) return;
      flushEdit();
      st.redo.push(snapshot());
      const s = st.undo.pop();
      // annuler un rangement qui a corrigé l'organisation : ces corrections sont refusées, elles ne reviennent pas
      if (st.autoSnap && st.autoSnap.snap === s) { declineKeys(st.autoSnap.keys); st.autoSnap = null; }
      restoreSnap(s);
      ui.snack('Annulé', { duration: 1200 });
    }
    function redo() { if (!st.redo.length || ro()) return; flushEdit(); st.undo.push(snapshot()); restoreSnap(st.redo.pop()); ui.snack('Rétabli', { duration: 1200 }); }
    function updateHistoryBtns() {
      for (const b of U.$$('[data-act="undo"]', page).concat(undoBtn)) b.disabled = !st.undo.length;
      for (const b of U.$$('[data-act="redo"]', page).concat(redoBtn)) b.disabled = !st.redo.length;
    }

    /* ------------------------------------------------------------------ */
    /* Vue / caméra                                                       */
    /* ------------------------------------------------------------------ */
    const saveViewport = U.debounce(() => { map.viewport = { ...st.view }; S.save(); }, 400);
    /* will-change seulement pendant le mouvement : au repos le navigateur re-rastérise
       le texte à la bonne échelle (sinon flou après un zoom) */
    const stillSoon = U.debounce(() => canvas.classList.remove('moving'), 160);
    let lastGrid = 0;
    function applyView() {
      const { x, y, k } = st.view;
      world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      const g = 24 * k;
      if (g !== lastGrid) { grid.style.backgroundSize = `${g}px ${g}px`; lastGrid = g; }
      // la grille ne bouge que modulo un pas : translation composite, pas de repeinte
      grid.style.transform = `translate(${(((x + 48) % g) + g) % g}px, ${(((y + 48) % g) + g) % g}px)`;
      canvas.classList.add('moving');
      stillSoon();
      canvas.classList.toggle('far', k < 0.45);
      zoomLabel.textContent = Math.round(k * 100) + ' %';
      positionCtx();
      saveViewport();
    }
    function zoomAt(cx, cy, factor) {
      const r = canvas.getBoundingClientRect();
      const px = cx - r.left, py = cy - r.top;
      const k = U.clamp(st.view.k * factor, MIN_K, MAX_K);
      const f = k / st.view.k;
      st.view.x = px - (px - st.view.x) * f;
      st.view.y = py - (py - st.view.y) * f;
      st.view.k = k;
      applyView();
    }
    let camStop = null;
    /** Caméra : déplacement visible du début à la fin → ease-in-out ;
        durée proportionnée à la distance (racine), interruptible. */
    function animateView(target, duration) {
      if (camStop) camStop();
      const from = { ...st.view };
      if (duration == null) {
        const r = canvas.getBoundingClientRect();
        const dist = Math.hypot(target.x - from.x, target.y - from.y) + Math.abs(Math.log(target.k / from.k)) * Math.min(r.width, r.height);
        duration = motion.durationFor(dist, { min: 200, max: 480 });
      }
      camStop = motion.tween({
        duration, ease: motion.ease.inOut,
        onUpdate: (p, e) => {
          const t = e(p);
          st.view.x = from.x + (target.x - from.x) * t;
          st.view.y = from.y + (target.y - from.y) * t;
          st.view.k = from.k + (target.k - from.k) * t;
          applyView();
        },
        onDone: () => { camStop = null; },
      });
    }
    function zoomTo(k) {
      const r = visibleRect();
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const wx = (cx - st.view.x) / st.view.k, wy = (cy - st.view.y) / st.view.k;
      k = U.clamp(k, MIN_K, MAX_K);
      animateView({ k, x: cx - wx * k, y: cy - wy * k }, 240);
    }
    /** Zone du canvas non masquée par le panneau / la feuille (coordonnées canvas) */
    function visibleRect() {
      const r = canvas.getBoundingClientRect();
      let w = r.width, hgt = r.height;
      const mode = paneMode();
      if (st.mode === 'map' && isPaneShown()) {
        if (mode === 'side') w -= pane.getBoundingClientRect().width;
        if (mode === 'bottom') hgt = Math.max(160, pane.getBoundingClientRect().top - r.top);
      }
      if (U.isCompact()) hgt -= 8;
      return { x: 0, y: 0, w, h: hgt };
    }
    function bbox(ids) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of map.nodes) {
        if (ids && !ids.has(n.id)) continue;
        if (!st.els.has(n.id)) continue;
        const s = size(n);
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h);
      }
      return x0 === Infinity ? null : { x0, y0, x1, y1 };
    }
    function fit(animate = true, maxK = 1.1, ids) {
      const b = bbox(ids);
      if (!b) return;
      const r = visibleRect();
      const pad = U.isCompact() ? 32 : 72;
      const k = U.clamp(Math.min((r.w - pad * 2) / (b.x1 - b.x0), (r.h - pad * 2) / (b.y1 - b.y0)), MIN_K, maxK);
      const target = { k, x: r.x + r.w / 2 - ((b.x0 + b.x1) / 2) * k, y: r.y + r.h / 2 - ((b.y0 + b.y1) / 2) * k };
      if (animate) animateView(target); else { Object.assign(st.view, target); applyView(); }
    }
    /** Cadrage d'ouverture : vue d'ensemble si elle reste lisible, sinon la racine à 85 % */
    function initialView() {
      const b = bbox();
      if (!b) return;
      const r = visibleRect();
      const pad = U.isCompact() ? 32 : 72;
      const k = Math.min((r.w - pad * 2) / (b.x1 - b.x0), (r.h - pad * 2) / (b.y1 - b.y0));
      // carte du plan : la pyramide entière compte plus que la taille du texte
      if (k >= (map.role === 'plan' ? 0.35 : 0.7)) { fit(false, 1); return; }
      const root = S.roots(map)[0];
      // vue d'ensemble d'abord (Shneiderman) : la racine et ses branches principales lisibles d'un coup
      const first = new Set([root.id, ...S.childrenOf(map, root.id).map((c) => c.id)]);
      const fb = bbox(first);
      if (fb) {
        const kf = Math.min((r.w - pad * 2) / (fb.x1 - fb.x0), (r.h - pad * 2) / (fb.y1 - fb.y0));
        if (kf >= 0.55) {
          // cadrée à gauche (droite) / au centre (centrée) : la suite de la lecture reste en vue
          const kk2 = Math.min(0.95, kf);
          const x = map.layout === 'balanced' || map.layout === 'organic' ? r.x + r.w / 2 - ((fb.x0 + fb.x1) / 2) * kk2 : r.x + pad - fb.x0 * kk2;
          Object.assign(st.view, { k: kk2, x, y: r.y + r.h / 2 - ((fb.y0 + fb.y1) / 2) * kk2 });
          applyView();
          return;
        }
      }
      const s = size(root);
      const kk = U.isCompact() ? 0.8 : 0.85;
      const left = U.isCompact() ? 24 : 112;
      // on ouvre sur la racine, là où commence la lecture : à gauche (droite), au centre (centrée), en haut (pyramide)
      if (map.layout === 'balanced' || map.layout === 'organic') Object.assign(st.view, { k: kk, x: r.x + r.w / 2 - (root.x + s.w / 2) * kk, y: r.y + r.h / 2 - (root.y + s.h / 2) * kk });
      else if (map.layout === 'down') Object.assign(st.view, { k: kk, x: r.x + r.w / 2 - (root.x + s.w / 2) * kk, y: r.y + 24 - root.y * kk });
      else Object.assign(st.view, { k: kk, x: left - root.x * kk, y: r.h / 2 - (root.y + s.h / 2) * kk });
      applyView();
    }
    function centerOn(id, { minK, animate = true } = {}) {
      const n = S.node(map, id);
      if (!n) return;
      const s = size(n);
      const r = visibleRect();
      const k = minK ? Math.max(st.view.k, minK) : st.view.k;
      const target = { k, x: r.x + r.w / 2 - (n.x + s.w / 2) * k, y: r.y + r.h / 2 - (n.y + s.h / 2) * k };
      if (animate) animateView(target); else { Object.assign(st.view, target); applyView(); }
    }
    function ensureVisible(id) {
      const n = S.node(map, id);
      if (!n) return;
      const s = size(n);
      const r = visibleRect();
      const k = st.view.k;
      const sx = n.x * k + st.view.x, sy = n.y * k + st.view.y;
      const m = 48;
      if (sx < r.x + m || sy < r.y + m || sx + s.w * k > r.x + r.w - m || sy + s.h * k > r.y + r.h - m) centerOn(id);
    }
    function toWorld(cx, cy) {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - st.view.x) / st.view.k, y: (cy - r.top - st.view.y) / st.view.k };
    }

    /* ------------------------------------------------------------------ */
    /* Rendu des nœuds                                                    */
    /* ------------------------------------------------------------------ */
    function size(n) {
      return st.sizes.get(n.id) || R.layout.estimate(n);
    }
    const sizeFn = (n) => size(n);

    function nodeEl(n) {
      const el = h('div.node', { dataset: { id: n.id }, role: 'treeitem', tabindex: '-1' });
      el.innerHTML = '<span class="node-top"><span class="node-kicker"></span><span class="node-meta"></span></span><span class="node-title"><span class="hl"></span></span>' +
        '<span class="node-meter" aria-hidden="true"><i></i></span><span class="node-order" aria-hidden="true"></span>' +
        '<button type="button" class="node-collapse" tabindex="-1" aria-label="Replier"></button>' +
        '<span class="node-handle" data-handle="1" aria-hidden="true" title="Glisser pour relier · cliquer pour ajouter un enfant"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></span>';
      return el;
    }

    /** Nœud d'une carte du plan qui renvoie à un dossier ou une carte du cours : son adresse */
    function refTarget(n) {
      if (!n.ref) return null;
      const f = S.folder(n.ref);
      if (f) return { href: '#/dossier/' + f.id, label: 'Ouvrir ' + (f.label || 'le dossier') };
      const m = S.map(n.ref);
      return m ? { href: '#/carte/' + m.id, label: 'Ouvrir ' + (m.label || 'la carte') } : null;
    }

    function paintNode(el, n, ctx) {
      const T = S.TYPES[n.type];
      const bs = ctx.stats;
      const sig = [n.type, n.title, n.em, !!n.note.trim(), n.review.rating, n.collapsed, ctx.childCount, n.logic, ctx.kicker, n.ref || '',
        bs ? `${bs.reviewable}/${Math.round(bs.progress * 100)}` : ''].join('|');
      if (el._type !== n.type) {
        if (el._type) el.classList.remove('t-' + el._type, 'rank-' + (S.TYPES[el._type].rank || 0));
        el.classList.add('t-' + n.type);
        el.classList.toggle('struct', !!T.rank);
        if (T.rank) el.classList.add('rank-' + T.rank);
        el._type = n.type;
      }
      if (el._sig !== sig) {
        el._sig = sig;
        el.querySelector('.node-kicker').textContent = ctx.kicker;
        // structure : jauge de maîtrise de toute la branche (chapitre, leçon, section)
        const meter = el.querySelector('.node-meter');
        el.classList.toggle('has-meter', !!(bs && bs.reviewable));
        if (bs && bs.reviewable) meter.style.setProperty('--p', String(bs.progress));
        const hl = el.querySelector('.hl');
        if (st.editing !== n.id) titleInto(hl, n);
        el.classList.toggle('untitled', !n.title);
        const meta = el.querySelector('.node-meta');
        U.clear(meta);
        if (n.note.trim()) meta.appendChild(R.icon('note', 14, 'node-has-note'));
        if (n.review.rating) meta.appendChild(ui.mastery(n.review.rating, 10));
        const ref = refTarget(n);
        if (ref) meta.appendChild(h('span.node-go', { title: ref.label }, R.icon('chevronRight', 14)));
        el.classList.toggle('is-ref', !!ref);
        el.classList.toggle('has-top', !!(T.kicker || n.note.trim() || n.review.rating || ref));
        const col = el.querySelector('.node-collapse');
        col.textContent = n.collapsed ? '+' + ctx.descCount : '';
        col.setAttribute('aria-label', n.collapsed ? `Déplier (${ctx.descCount})` : 'Replier');
        el.dataset.sized = '';
      }
      el.classList.toggle('untitled', !n.title);
      const ord = el.querySelector('.node-order');
      if (ord.textContent !== (ctx.order || '')) ord.textContent = ctx.order || '';
      el.classList.toggle('has-kids', ctx.childCount > 0);
      el.classList.toggle('collapsed', n.collapsed);
      el.classList.toggle('selected', st.sel.has(n.id));
      el.classList.toggle('primary', st.primary === n.id);
      el.classList.toggle('editing', st.editing === n.id);
      el.classList.toggle('link-source', !!st.linking && st.linking.from === n.id);
      el.classList.toggle('link-pick', !!st.linking && st.linking.picked.includes(n.id));
      const masked = st.masked && ctx.isRoot === false && !st.revealed.has(n.id);
      el.classList.toggle('masked', masked);
      el.setAttribute('aria-selected', String(st.sel.has(n.id)));
      el.setAttribute('aria-label', `${ctx.kicker && T.rank ? ctx.kicker : T.label} : ${n.title || 'Sans titre'}`);
      el.style.transform = `translate(${n.x}px, ${n.y}px)`;
    }

    function render() {
      if (st.destroyed) return;
      const hidden = S.hiddenSet(map);
      const parents = new Set(map.edges.filter((e) => e.kind === 'tree').map((e) => e.to));
      const childCount = {};
      for (const e of map.edges) if (e.kind === 'tree') childCount[e.from] = (childCount[e.from] || 0) + 1;
      const alive = new Set();
      const emerging = [];
      const nums = S.structNumbers(map);
      // ordre de lecture des branches principales : 1, 2, 3… (sauf leçons/sections, déjà numérotées)
      const order = new Map();
      for (const r of S.roots(map)) {
        const kids = S.childrenOf(map, r.id);
        if (kids.filter((k) => !S.isStruct(k.type)).length >= 3) kids.forEach((k, i) => { if (!S.isStruct(k.type)) order.set(k.id, String(i + 1)); });
      }
      for (const n of map.nodes) {
        if (hidden.has(n.id)) continue;
        alive.add(n.id);
        let el = st.els.get(n.id);
        if (!el || el.classList.contains('dying')) {
          if (el) el.remove();
          el = nodeEl(n);
          st.els.set(n.id, el);
          nodesLayer.appendChild(el);
          if (st.ready) {
            const from = st.origin.get(n.id);
            if (from && S.node(map, from)) emerging.push({ n, el, from });
            else { el.classList.add('born'); setTimeout(() => el.classList.remove('born'), 300); }
          }
        }
        paintNode(el, n, {
          childCount: childCount[n.id] || 0,
          descCount: n.collapsed ? S.descendants(map, n.id).length : 0,
          isRoot: !parents.has(n.id),
          kicker: S.kickerOf(map, n, nums),
          order: order.get(n.id) || '',
          stats: S.isStruct(n.type) ? S.branchStats(map, n.id) : null,
        });
      }
      st.fresh.clear();
      const leaving = [];
      for (const [id, el] of st.els) {
        if (alive.has(id)) continue;
        st.els.delete(id);
        st.sizes.delete(id);
        el.classList.remove('selected', 'primary');
        const to = st.retract.get(id);
        if (to && alive.has(to) && !motion.reduced()) leaving.push({ id, el, to });
        else {
          el.classList.add('dying');
          setTimeout(() => el.remove(), motion.reduced() ? 0 : 170);
        }
      }
      measure();
      playEmerge(emerging);
      playRetract(leaving);
      renderEdges(hidden);
      positionCtx();
      renderBottomBar();
      updateBanner();
      paintLinkPreview();
      canvas.classList.toggle('is-masked', st.masked);
      canvas.classList.toggle('is-linking', !!st.linking);
    }

    /* Clonage (UX in Motion) : un nouvel élément naît de son parent — son lien se dessine
       depuis la poignée du parent pendant qu'il glisse en place. 240 ms ease-out, cascade 20 ms. */
    function anchorOf(id) {
      const p = S.node(map, id);
      const s = size(p);
      const f = R.layout.flow(map, p);
      if (f.child === 'down') return { x: p.x + s.w / 2, y: p.y + s.h };
      return { x: f.child === 'left' ? p.x : p.x + s.w, y: p.y + s.h / 2 };
    }
    function playEmerge(list) {
      if (!list.length) return;
      list.sort((a, b) => a.n.y - b.n.y);
      list.forEach(({ n, el, from }, i) => {
        st.origin.delete(n.id);
        if (motion.reduced() || !el.animate) return;
        const a = anchorOf(from);
        const s = size(n);
        const dx = a.x - (n.x + s.w / 2), dy = a.y - (n.y + s.h / 2);
        // court glissement depuis le côté du parent, sans changer de taille : le lien qui se
        // dessine depuis le parent (drawBorn, même durée) arrive pile sur le bord du nœud
        const k = Math.min(1, 18 / (Math.hypot(dx, dy) || 1));
        el.animate([
          { translate: `${dx * k}px ${dy * k}px`, opacity: 0 },
          { translate: '0px 0px', opacity: 1 },
        ], { duration: motion.dur.md, delay: Math.min(i, 8) * 20, easing: motion.css.out, fill: 'backwards' });
      });
    }
    /* Repli : les enfants rentrent dans leur parent (sortie, ease-in, 200 ms) */
    function playRetract(list) {
      if (!list.length) return;
      list.forEach(({ id, el, to }, i) => {
        st.retract.delete(id);
        const n = S.node(map, id);
        const a = anchorOf(to);
        const w = el.offsetWidth, hh = el.offsetHeight;
        const nx = n ? n.x : 0, ny = n ? n.y : 0;
        const dx = a.x - (nx + w / 2), dy = a.y - (ny + hh / 2);
        el.style.pointerEvents = 'none';
        const anim = el.animate([
          { translate: '0px 0px', scale: 1, opacity: 1 },
          { translate: `${dx}px ${dy}px`, scale: 0.6, opacity: 0 },
        ], { duration: 200, delay: Math.min(i, 6) * 12, easing: motion.css.in, fill: 'forwards' });
        anim.finished.then(() => el.remove(), () => el.remove());
      });
    }

    function measure() {
      for (const [id, el] of st.els) {
        if (el.classList.contains('dying')) continue;
        if (el.dataset.sized === '1' && st.sizes.has(id)) continue;
        st.sizes.set(id, { w: el.offsetWidth, h: el.offsetHeight });
        el.dataset.sized = '1';
      }
    }

    /* ------------------------------------------------------------------ */
    /* Rendu des liens                                                    */
    /* ------------------------------------------------------------------ */
    function anchors(a, sa, b, sb) {
      const gap = 6;
      let p1, p2, d1, d2;
      if (b.x >= a.x + sa.w + gap) { p1 = [a.x + sa.w, a.y + sa.h / 2]; p2 = [b.x, b.y + sb.h / 2]; d1 = [1, 0]; d2 = [-1, 0]; }
      else if (b.x + sb.w <= a.x - gap) { p1 = [a.x, a.y + sa.h / 2]; p2 = [b.x + sb.w, b.y + sb.h / 2]; d1 = [-1, 0]; d2 = [1, 0]; }
      else if (b.y + sb.h / 2 > a.y + sa.h / 2) { p1 = [a.x + sa.w / 2, a.y + sa.h]; p2 = [b.x + sb.w / 2, b.y]; d1 = [0, 1]; d2 = [0, -1]; }
      else { p1 = [a.x + sa.w / 2, a.y]; p2 = [b.x + sb.w / 2, b.y + sb.h]; d1 = [0, -1]; d2 = [0, 1]; }
      return { p1, p2, d1, d2 };
    }
    function curve(p1, d1, p2, d2, t = 0.5) {
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const c = Math.max(24, Math.min(140, dist * 0.45));
      const c1 = [p1[0] + d1[0] * c, p1[1] + d1[1] * c];
      const c2 = [p2[0] + d2[0] * c, p2[1] + d2[1] * c];
      const u = 1 - t;
      const b = (i) => u * u * u * p1[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p2[i];
      return { d: `M${p1[0]},${p1[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`, mid: [b(0), b(1)] };
    }
    /** Point d'une courbe « M… C… » produite par curve() (pour échantillonner les branches) */
    function bez(c, t) {
      const n = c.d.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
      const u = 1 - t;
      const f = (i) => u * u * u * n[i] + 3 * u * u * t * n[i + 2] + 3 * u * t * t * n[i + 4] + t * t * t * n[i + 6];
      return [f(0), f(1)];
    }
    function edgeLabel(e) {
      if (e.label) return e.label;
      if (e.kind === 'tree') {
        const p = S.node(map, e.from);
        if (p && p.logic) return p.logic === 'et' ? 'ET' : 'OU';
      }
      return '';
    }

    /* ---- Fourches ---------------------------------------------------------
       Une fourche = un tronc depuis la source, un point de séparation, puis une
       branche par élément. Deux origines :
        - explicite : liens partageant un `group` (libellé commun, choisi par l'utilisateur) ;
        - implicite : enfants d'un nœud ET/OU sans libellé propre → « ET » affiché une fois. */
    /** Séquences en ligne (méthode, chronologie) : enfant → étape précédente */
    function seqMap(visible) {
      const at = new Map();
      for (const n of map.nodes) { const s2 = size(n); at.set(n.id, { id: n.id, x: n.x, y: n.y, w: s2.w, h: s2.h }); }
      return R.layout.sequencePrev({ edges: visible }, at, map.layout);
    }
    function computeBundles(visible, seq = new Map()) {
      const seqIds = new Set([...seq.keys(), ...seq.values()]);
      const bundles = new Map();
      const add = (key, e, explicit) => {
        if (!bundles.has(key)) bundles.set(key, { key, explicit, from: e.from, kind: e.kind, edges: [] });
        bundles.get(key).edges.push(e);
      };
      for (const e of visible) {
        if (e.group) add('g:' + e.group, e, true);
        else if (e.kind === 'tree' && !e.label && !seqIds.has(e.to)) {
          const p = S.node(map, e.from);
          if (!p) continue;
          // un faisceau par côté (carte centrée : la racine a des enfants des deux côtés)
          const c = S.node(map, e.to);
          const side = map.layout === 'down' ? '' : c && c.x < p.x ? ':L' : ':R';
          add((p.logic ? 'l:' : 'c:') + e.from + side, e, false);
        }
      }
      // ET / OU : dès deux branches ; liste simple : peigne à partir de quatre enfants
      // (une épine et des dents droites se lisent comme une liste, sans écheveau de courbes)
      // disposition libre : pas de peigne, chaque enfant a sa propre courbe (rendu fait à la main)
      const straight = map.layout === 'down' || map.layout === 'organic';
      for (const [k, b] of bundles) if (b.edges.length < (k.startsWith('c:') ? (straight ? 99 : 4) : 2)) bundles.delete(k);
      for (const b of bundles.values()) b.comb = b.kind === 'tree' && !straight && b.edges.length >= 4;
      return bundles;
    }
    function bundleLabel(b) {
      const e = b.edges[0];
      if (e.label) return e.label;
      if (b.kind === 'tree') { const p = S.node(map, b.from); if (p && p.logic) return p.logic === 'et' ? 'ET' : 'OU'; }
      return '';
    }
    /** Géométrie : côté de sortie vers le barycentre des cibles, jonction à ~42 % de l'écart */
    function bundleGeometry(b, byId, rects, busy = new Map()) {
      const a = byId.get(b.from);
      const sa = size(a);
      if (b.comb) {
        // peigne : épine verticale à mi-chemin entre le parent et la colonne de ses enfants
        const kids = b.edges.map((e) => byId.get(e.to));
        const left = kids[0].x < a.x;
        const col = left ? Math.max(...kids.map((k) => k.x + size(k).w)) : Math.min(...kids.map((k) => k.x));
        const p1 = [left ? a.x : a.x + sa.w, a.y + sa.h / 2];
        // épine dans le couloir libre juste avant la colonne des enfants (un frère plus large du
        // parent peut occuper la moitié du couloir : on se cale sur la colonne, pas sur le parent)
        const x = left ? Math.min(p1[0] - 14, col + 30) : Math.max(p1[0] + 14, col - 30);
        if (b.explicit) {
          // branche libellée : plusieurs branches d'un même parent ne partagent pas le même tronc
          const ys = kids.map((k) => k.y + size(k).h / 2), cy = ys.reduce((s2, y) => s2 + y, 0) / ys.length;
          p1[1] += U.clamp((cy - p1[1]) * 0.25, -sa.h / 2 + 6, sa.h / 2 - 6);
          return { p1, d1: [left ? -1 : 1, 0], J: [x, U.clamp(p1[1] + (cy - p1[1]) * 0.5, Math.min(...ys), Math.max(...ys))], comb: true };
        }
        return { p1, d1: [left ? -1 : 1, 0], J: [x, p1[1]], comb: true };
      }
      if (b.kind === 'link' && rects && !st.fastEdges) {
        // fourche de renvois : le côté de sortie dont le tronc et les branches ne traversent aucun nœud
        let best = null;
        for (const side of 'rlbt') {
          const d1 = R.layout.sidePoint ? ({ r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] })[side] : null;
          const p1 = R.layout.sidePoint(a, sa, side);
          // la jonction porte le libellé : assez loin de la source pour qu'il ne la recouvre pas (demi-largeur + 0,5 em)
          const ls = R.layout.labelSize(bundleLabel(b) || '');
          const reachJ = Math.max(40, (d1[0] ? ls.w / 2 : ls.h / 2) + 6 + 6);
          const J = [p1[0] + d1[0] * reachJ, p1[1] + d1[1] * reachJ];
          const trunk = [p1, [(p1[0] + J[0]) / 2, (p1[1] + J[1]) / 2], J];
          let flaws = rects.some((r) => r.id !== a.id && trunk.some((p) => p[0] > r.x - 4 && p[0] < r.x + r.w + 4 && p[1] > r.y - 4 && p[1] < r.y + r.h + 4)) ? 1 : 0;
          if ((busy.get(a.id) || '').includes(side)) flaws++;
          let cost = 0;
          for (const e of b.edges) {
            const t = byId.get(e.to);
            const rt = R.layout.route({ id: a.id, x: J[0], y: J[1] }, { w: 0, h: 0 }, { id: t.id, x: t.x, y: t.y }, size(t), { rects, fast: true, side, busy, fromJ: true });
            flaws += rt.hits + (rt.cost >= 240 ? 1 : 0);
            cost += rt.len;
          }
          cost += flaws * 1000;
          if (!best || cost < best.cost) best = { cost, flaws, p1, d1, J };
        }
        // propre = ni nœud traversé, ni sortie ou arrivée par le côté de la hiérarchie
        best.bad = best.flaws > 0;
        return best;
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const e of b.edges) {
        const t = byId.get(e.to), st2 = size(t);
        x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + st2.w); y1 = Math.max(y1, t.y + st2.h);
      }
      // côté de sortie : direction dominante entre le centre de la source et celui des cibles
      const dx = (x0 + x1) / 2 - (a.x + sa.w / 2), dy = (y0 + y1) / 2 - (a.y + sa.h / 2);
      let p1, d1;
      if (b.kind === 'tree' && map.layout === 'down' && b.edges.every((e) => R.layout.stacked(a, sa, byId.get(e.to)))) {
        // pyramide, liste en colonne : la jonction est en haut de l'épine
        const x = a.x + R.layout.STACK.spine;
        return { p1: [x, a.y + sa.h], d1: [0, 1], J: [x, a.y + sa.h + 9], stack: true };
      }
      if (b.kind === 'tree' && map.layout === 'down') {
        // pyramide : la jonction est sur le bus, à mi-chemin entre le parent et ses enfants
        d1 = [0, Math.sign(dy) || 1];
        p1 = [a.x + sa.w / 2, d1[1] > 0 ? a.y + sa.h : a.y];
        const gapY = d1[1] > 0 ? y0 - p1[1] : p1[1] - y1;
        return { p1, d1, J: [p1[0], p1[1] + d1[1] * Math.max(12, gapY / 2)] };
      } else if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
        d1 = [Math.sign(dx) || 1, 0];
        p1 = [d1[0] > 0 ? a.x + sa.w : a.x, a.y + sa.h / 2];
      } else {
        d1 = [0, Math.sign(dy) || 1];
        p1 = [a.x + sa.w / 2, d1[1] > 0 ? a.y + sa.h : a.y];
      }
      // écart entre la source et la cible la plus proche, mesuré dans la direction de sortie
      let gap;
      if (d1[0] > 0) gap = x0 - p1[0]; else if (d1[0] < 0) gap = p1[0] - x1;
      else if (d1[1] > 0) gap = y0 - p1[1]; else gap = p1[1] - y1;
      const reach = U.clamp(gap * 0.42, 24, 120);
      const J = [p1[0] + d1[0] * reach, p1[1] + d1[1] * reach];
      if (b.explicit && b.kind === 'tree') {
        // branche libellée : le tronc part vers ses propres cibles (deux branches d'un même
        // parent — « causes », « conséquences » — ont chacune leur tronc et leur libellé)
        const ax = d1[0] ? 1 : 0, c = ax ? (y0 + y1) / 2 : (x0 + x1) / 2, half = (ax ? sa.h : sa.w) / 2 - 6;
        p1[ax] += U.clamp((c - p1[ax]) * 0.25, -half, half);
        J[ax] = p1[ax] + U.clamp((c - p1[ax]) * 0.5, -90, 90);
      }
      return { p1, d1, J };
    }
    function branchCurve(J, d1, t, kind) {
      const pt = { x: J[0], y: J[1] };
      if (kind === 'tree' && map.layout === 'down' && t.x <= J[0] + R.layout.STACK.indent + 8 && t.x > J[0] - R.layout.STACK.spine) {
        const st2 = size(t), y = t.y + st2.h / 2;
        return R.layout.elbow([J, [J[0], y], [t.x, y]], 8);
      }
      if (kind === 'tree' && map.layout === 'down') {
        const st2 = size(t), below = d1[1] >= 0;
        return R.layout.busDown(J, [t.x + st2.w / 2, below ? t.y : t.y + st2.h], J[1]);
      }
      const { p2, d2 } = anchors(pt, { w: 0, h: 0 }, t, size(t));
      return curve(J, d1, p2, d2);
    }
    function drawBorn(rec, e) {
      if (!rec.born) return;
      rec.born = false;
      if (U.reducedMotion()) return;
      if (e.kind === 'tree') {
        const len = rec.path.getTotalLength();
        rec.path.style.strokeDasharray = len;
        rec.path.style.strokeDashoffset = len;
        rec.path.getBoundingClientRect();
        rec.path.style.transition = 'stroke-dashoffset 240ms var(--ease-out)';
        rec.path.style.strokeDashoffset = '0';
        setTimeout(() => { rec.path.style.strokeDasharray = ''; rec.path.style.strokeDashoffset = ''; rec.path.style.transition = ''; }, 300);
      } else rec.g.classList.add('fade-in');
    }
    function setLabel(el, text, { sel, logic }) {
      if (el.textContent !== text && text && el._ready && !motion.reduced()) {
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      }
      el._ready = true;
      el.textContent = text;
      el.hidden = !text;
      el.classList.toggle('sel', !!sel);
      el.classList.toggle('logic', !!logic);
    }

    function renderEdges(hidden = S.hiddenSet(map)) {
      const alive = new Set();
      const byId = new Map(map.nodes.map((n) => [n.id, n]));
      const visible = map.edges.filter((e) => {
        const a = byId.get(e.from), b = byId.get(e.to);
        return a && b && !hidden.has(a.id) && !hidden.has(b.id);
      });
      const seq = seqMap(visible);
      const bundles = computeBundles(visible, seq);
      // colonne vertébrale du cours : les liens hiérarchiques issus d'un chapitre ou d'une leçon sont plus appuyés
      const spine = (from, kind) => {
        const r = kind === 'tree' && S.TYPES[byId.get(from).type].rank;
        return r && r < 3 ? ' spine' : '';
      };
      // aides à la lecture : profondeur (traits plus fins en s'éloignant de la racine) et
      // branche de premier niveau (une teinte par branche : on suit une idée d'un bout à l'autre)
      const lvl = new Map(), branch = new Map();
      {
        const roots = S.roots(map);
        const q = roots.map((r) => [r.id, 0, -1]);
        while (q.length) {
          const [id, d, b] = q.shift();
          if (lvl.has(id)) continue;
          lvl.set(id, d); branch.set(id, b);
          S.childrenOf(map, id).forEach((c, i) => q.push([c.id, d + 1, d === 0 ? i : b]));
        }
      }
      const aids = S.data.settings.readingAids !== false;
      const BH = (i) => Math.round((25 + i * 137.508) % 360); // angle d'or : deux branches voisines ne se ressemblent jamais
      const deco = (from, to, kind) => {
        if (kind !== 'tree') return '';
        const d = Math.min(3, (lvl.get(from) || 0) + 1);
        return ` lv-${d}${aids && branch.get(to) >= 0 ? ' tint' : ''}`;
      };
      const hueOf = (to) => (branch.get(to) >= 0 ? BH(branch.get(to)) : null);
      canvas.classList.toggle('reading-aids', aids);
      const selEdgeObj = st.selEdge ? map.edges.find((x) => x.id === st.selEdge) : null;
      const selGroup = selEdgeObj && selEdgeObj.group;

      const rects = [];
      for (const n of map.nodes) if (!hidden.has(n.id)) { const s2 = size(n); rects.push({ id: n.id, x: n.x, y: n.y, w: s2.w, h: s2.h }); }
      const rectAt = new Map(rects.map((r) => [r.id, r]));
      // signature de la géométrie : si rien n'a bougé ni changé (sélection, survol…), les renvois gardent leur tracé sans recalcul
      const geoSig = rects.map((r) => `${r.id}:${Math.round(r.x)},${Math.round(r.y)},${r.w},${r.h}`).join('|') + '#' + visible.map((e) => e.id + e.kind + e.label + (e.group || '')).join('|') + '#' + map.layout;
      const sameGeo = st.geoSig === geoSig;
      if (!st.fastEdges) st.geoSig = geoSig;
      if (!st.routePrev) st.routePrev = new Map();
      const busy = R.layout.busySides({ edges: visible }, map.layout, rectAt, (r) => r);
      // fourche de renvois sans tracé propre (cibles trop éloignées) : on la dessine en renvois
      // séparés plutôt qu'un tronc qui traverserait la carte — elle reste une fourche dans les données
      const geoPre = new Map();
      for (const [k, b] of bundles) {
        const gm = bundleGeometry(b, byId, rects, busy);
        if (gm.bad && !st.fastEdges) bundles.delete(k); else geoPre.set(k, gm);
      }
      const bundleOf = new Map();
      for (const b of bundles.values()) for (const e of b.edges) bundleOf.set(e.id, b);
      // 1) troncs + étiquette unique des fourches
      const aliveB = new Set();
      const geo = new Map();
      for (const b of bundles.values()) {
        aliveB.add(b.key);
        let br = st.bundleEls.get(b.key);
        if (!br) {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          trunk.setAttribute('class', 'edge trunk');
          hit.setAttribute('class', 'edge-hit');
          g.append(hit, trunk);
          edgesG.appendChild(g);
          const label = h('button.edge-label.junction', { type: 'button', tabindex: '-1' });
          junctionLayer.appendChild(label);
          br = { g, trunk, hit, label };
          st.bundleEls.set(b.key, br);
          if (st.ready && b.edges.some((e) => ed._newEdges.has(e.id) || st.origin.has(e.to))) g.classList.add('fade-in');
        }
        const gm = geoPre.get(b.key) || bundleGeometry(b, byId, rects, busy);
        geo.set(b.key, gm);
        let d = `M${gm.p1[0]},${gm.p1[1]} L${gm.J[0]},${gm.J[1]}`;
        if (gm.comb) {
          // l'épine fait partie du tronc (neutre) ; chaque dent part de l'épine vers son enfant
          const ys = b.edges.map((e) => { const t = byId.get(e.to); return t.y + size(t).h / 2; });
          const y0 = Math.min(gm.J[1], ...ys) + 0, y1 = Math.max(gm.J[1], ...ys);
          d += ` M${gm.J[0]},${y0 + 12} L${gm.J[0]},${y1 - 12}`;
        }
        br.trunk.setAttribute('d', d);
        br.hit.setAttribute('d', d);
        // tronc d'une fourche explicite : cliquable (sélectionne la fourche) ; implicite : non
        if (b.explicit) { br.hit.dataset.edge = b.edges[0].id; br.hit.style.pointerEvents = ''; }
        else { delete br.hit.dataset.edge; br.hit.style.pointerEvents = 'none'; }
        const sel = b.explicit && selGroup && b.edges[0].group === selGroup;
        const related = st.sel.has(b.from) || b.edges.some((e) => st.sel.has(e.to));
        br.trunk.setAttribute('class', `edge trunk k-${b.kind}${spine(b.from, b.kind)}${deco(b.from, b.edges[0].to, b.kind)}${sel ? ' sel' : ''}${related ? ' rel' : ''}`);
        { const hh = b.kind === 'tree' && !gm.comb && (lvl.get(b.from) || 0) > 0 ? hueOf(b.edges[0].to) : null; if (hh != null) br.trunk.style.setProperty('--bh', hh); else br.trunk.classList.remove('tint'); }
        const lbl = bundleLabel(b);
        setLabel(br.label, lbl, { sel, logic: !b.edges[0].label && !!lbl });
        if (b.explicit) { br.label.dataset.edge = b.edges[0].id; delete br.label.dataset.logicFrom; }
        else { br.label.dataset.logicFrom = b.from; delete br.label.dataset.edge; }
        br.label.setAttribute('aria-label', b.explicit ? `Fourche « ${lbl || 'sans libellé'} » (${b.edges.length} branches)` : `Logique ${lbl} — changer`);
        br.label.style.transform = `translate(${gm.J[0]}px, ${gm.J[1]}px) translate(-50%, -50%)`;
        if (lbl) { const w = br.label.offsetWidth || 28, hh = br.label.offsetHeight || 19; br.label._box = { x: gm.J[0] - w / 2, y: gm.J[1] - hh / 2, w, h: hh }; }
        else br.label._box = null;
      }
      for (const [k, br] of st.bundleEls) {
        if (aliveB.has(k)) continue;
        br.g.remove(); br.label.remove();
        st.bundleEls.delete(k);
      }

      // 2) liens : simples, ou branches d'une fourche (depuis la jonction).
      //    L'arbre d'abord, puis les renvois : chacun choisit le trajet qui ne traverse aucun
      //    nœud et croise le moins de liens ; les libellés se posent là où ils ne cachent rien.
      const polys = [];
      const placed = [];
      for (const br of st.bundleEls.values()) if (!br.label.hidden && br.label._box) placed.push(br.label._box);
      // renvois dans un ordre stable (par identifiant) : le rendu ne dépend pas de l'ordre du fichier
      const ordered = visible.filter((e) => e.kind === 'tree').concat(visible.filter((e) => e.kind !== 'tree').sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)));
      // zones d'exclusion des libellés : les jonctions de fourche
      const zones = [];
      for (const gm of geo.values()) if (gm && gm.J) zones.push({ x: gm.J[0] - 10, y: gm.J[1] - 10, w: 20, h: 20 });
      const lblRecs = [];
      if (!st.routeKey) st.routeKey = new Map();
      for (const e of ordered) {
        const a = byId.get(e.from), b = byId.get(e.to);
        alive.add(e.id);
        let rec = st.edgeEls.get(e.id);
        if (!rec) {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('class', 'edge');
          hit.setAttribute('class', 'edge-hit');
          hit.dataset.edge = e.id;
          // zone de clic avant le trait visible : .edge-hit:hover + .edge (survol)
          g.append(hit, path);
          edgesG.appendChild(g);
          const label = h('button.edge-label', { type: 'button', tabindex: '-1', dataset: { edge: e.id } });
          labelsLayer.appendChild(label);
          rec = { g, path, hit, label, born: ed._newEdges?.has(e.id) || (st.ready && st.origin.has(e.to)) };
          st.edgeEls.set(e.id, rec);
        }
        const bundle = bundleOf.get(e.id);
        rec.seq = false;
        const sel = st.selEdge === e.id || (selGroup && e.group === selGroup);
        const related = st.sel.has(e.from) || st.sel.has(e.to);
        let c;
        if (bundle) {
          const gm = geo.get(bundle.key);
          if (e.kind === 'link') {
            // branche de fourche : depuis la jonction, trajet qui évite les nœuds (sortie dans l'axe du tronc)
            const side = gm.d1[0] > 0 ? 'r' : gm.d1[0] < 0 ? 'l' : gm.d1[1] > 0 ? 'b' : 't';
            const cv = R.layout.route({ id: bundle.from, x: gm.J[0], y: gm.J[1] }, { w: 0, h: 0 }, { id: b.id, x: b.x, y: b.y }, size(b), { rects, polys, busy, fromJ: true, fast: !!st.fastEdges, side });
            c = { d: cv.d, at: cv.at };
            polys.push({ pts: R.layout.sample(cv, 12), ends: new Set([e.from, e.to]) });
          } else if (gm.comb) {
            // dent du peigne : descend l'épine puis rejoint l'enfant à l'horizontale
            const sb = size(b), y = b.y + sb.h / 2;
            const tx = gm.d1[0] > 0 ? b.x : b.x + sb.w;
            const dy = y - gm.J[1];
            const from = Math.abs(dy) < 1 ? gm.J : [gm.J[0], y - Math.sign(dy) * 12];
            const el = R.layout.elbow(Math.abs(dy) < 1 ? [gm.J, [tx, y]] : [from, [gm.J[0], y], [tx, y]], 12);
            c = { d: el.d, at: el.at };
          } else c = branchCurve(gm.J, gm.d1, b, e.kind);
          rec.mid = gm.J;
          setLabel(rec.label, '', {});
          if (e.kind === 'tree') polys.push({ pts: R.layout.sample(c.at ? c : { at: (t) => bez(c, t) }, 6), ends: new Set([e.from, e.to]) });
        } else {
          let cv;
          const prevStep = e.kind === 'tree' && seq.get(e.to) ? byId.get(seq.get(e.to)) : null;
          if (prevStep) {
            // étape suivante d'une séquence : flèche depuis l'étape précédente (« puis »)
            const sp = size(prevStep), sb = size(b);
            cv = R.layout.elbow([[prevStep.x + sp.w, b.y + Math.min(sp.h, sb.h) / 2], [b.x, b.y + Math.min(sp.h, sb.h) / 2]]);
          } else if (e.kind === 'tree') {
            cv = R.layout.treeCurve(map.layout, a, size(a), b, size(b));
          } else {
            const sa = size(a), sb = size(b);
            const lb = edgeLabel(e);
            // le libellé est mesuré AVANT le trajet (sa vraie taille guide le choix du trajet)
            if (lb && rec.label.textContent !== lb) setLabel(rec.label, lb, { sel });
            const prevR = st.routePrev.get(e.id);
            if (sameGeo && prevR && !st.fastEdges) cv = prevR;
            else {
              cv = R.layout.route({ id: a.id, x: a.x, y: a.y }, sa, { id: b.id, x: b.x, y: b.y }, sb, { rects, polys, placed, busy, fast: !!st.fastEdges, id: e.id, prev: st.routeKey.get(e.id), prevRoute: prevR,
                label: lb ? { w: rec.label.offsetWidth || R.layout.labelSize(lb).w, h: rec.label.offsetHeight || 19 } : null });
              if (!st.fastEdges) { if (cv.key) st.routeKey.set(e.id, cv.key); st.routePrev.set(e.id, cv); }
            }
          }
          c = { d: cv.d };
          polys.push({ pts: R.layout.sample(cv, e.kind === 'tree' ? 6 : 14), ends: new Set([e.from, e.to]) });
          const lbl = prevStep ? '' : edgeLabel(e);
          setLabel(rec.label, lbl, { sel, logic: !e.label && !!lbl });
          rec.seq = !!prevStep;
          if (lbl) {
            // ET / OU sur un lien isolé : près de l'enfant ; libellé : là où il ne cache rien
            const sz = { w: rec.label.offsetWidth || R.layout.labelSize(lbl).w, h: rec.label.offsetHeight || 19 };
            const prefer = !e.label && e.kind === 'tree' ? 0.78 : 0.5;
            const spot = R.layout.placeLabel(cv, sz, rects, placed, { prefer, segs: polys, ends: [e.from, e.to], zones });
            rec.mid = [spot.x, spot.y];
            rec.label.style.transform = `translate(${spot.x}px, ${spot.y}px) translate(-50%, -50%)`;
            lblRecs.push({ rec, cv, sz, prefer, spot, ends: [e.from, e.to] });
          } else { rec.mid = cv.at(0.5); rec.label.classList.remove('clash'); }
        }
        rec.path.setAttribute('d', c.d);
        rec.hit.setAttribute('d', c.d);
        rec.path.setAttribute('class', `edge k-${e.kind}${spine(e.from, e.kind)}${deco(e.from, e.to, e.kind)}${bundle ? ' branch' : ''}${sel ? ' sel' : ''}${related ? ' rel' : ''}`);
        if (e.kind === 'tree' && hueOf(e.to) != null) rec.path.style.setProperty('--bh', hueOf(e.to));
        if (e.kind === 'link' || rec.seq) rec.path.setAttribute('marker-end', sel ? 'url(#arw-sel)' : 'url(#arw)');
        else rec.path.removeAttribute('marker-end');
        rec.path.classList.toggle('seq', !!rec.seq);
        drawBorn(rec, e);
      }
      // reprise : un libellé posé tôt ne connaissait pas les traits tracés après lui — on le
      // replace en connaissant tout ; un conflit qui reste est marqué (.clash), jamais caché
      let clashes = 0;
      if (!st.fastEdges) for (const x of lblRecs) {
        if (x.spot.clash) {
          const others = placed.filter((bx) => bx !== x.spot.box);
          const again = R.layout.placeLabel(x.cv, x.sz, rects, others, { prefer: x.prefer, segs: polys, ends: x.ends, zones });
          if (again.cost < x.spot.cost) {
            placed[placed.indexOf(x.spot.box)] = again.box;
            x.spot = again;
            x.rec.mid = [again.x, again.y];
            x.rec.label.style.transform = `translate(${again.x}px, ${again.y}px) translate(-50%, -50%)`;
          }
        }
        x.rec.label.classList.toggle('clash', !!x.spot.clash);
        if (x.spot.clash) clashes++;
      }
      ed.labelClashes = clashes;
      if (ed._newEdges) ed._newEdges.clear();
      for (const [id, rec] of st.edgeEls) {
        if (alive.has(id)) continue;
        rec.g.remove(); rec.label.remove();
        st.edgeEls.delete(id);
      }
    }
    ed._newEdges = new Set();

    /* ------------------------------------------------------------------ */
    /* Sélection                                                          */
    /* ------------------------------------------------------------------ */
    function select(id, { add = false, toggle = false, keepEdge = false } = {}) {
      if (!keepEdge) st.selEdge = null;
      if (!id) { st.sel.clear(); st.primary = null; }
      else if (toggle) {
        if (st.sel.has(id)) { st.sel.delete(id); if (st.primary === id) st.primary = [...st.sel][0] || null; }
        else { st.sel.add(id); st.primary = id; }
      } else {
        if (!add) st.sel.clear();
        st.sel.add(id); st.primary = id;
      }
      render();
      renderPane();
    }
    function selectEdge(id) {
      st.sel.clear(); st.primary = null; st.selEdge = id;
      render();
      renderPane();
    }
    const primaryNode = () => (st.primary ? S.node(map, st.primary) : null);

    /* ------------------------------------------------------------------ */
    /* Opérations                                                         */
    /* ------------------------------------------------------------------ */
    function hideCoach() {
      if (coach.hidden) return;
      coach.classList.remove('in');
      setTimeout(() => (coach.hidden = true), 200);
    }
    function addChild(parentId, { edit = true, title = '', type, at } = {}) {
      if (guard()) return null;
      const p = S.node(map, parentId);
      if (!p) return null;
      hideCoach();
      if (p.collapsed) p.collapsed = false;
      const slot = at || R.layout.childSlot(map, p, sizeFn);
      const n = S.newNode({ type: type || defaultChildType(p), title, x: slot.x, y: slot.y });
      mutate(() => {
        map.nodes.push(n);
        const e = { id: U.uid('e'), from: p.id, to: n.id, kind: 'tree', label: '' };
        map.edges.push(e);
        st.origin.set(n.id, p.id);
        ed._newEdges.add(e.id);
        nudgeOverlaps(n);
      }, { pane: false });
      st.sel = new Set([n.id]); st.primary = n.id; st.selEdge = null;
      render();
      renderPane(true);
      ensureVisible(n.id);
      if (edit) startEdit(n.id, true);
      return n;
    }
    function addSibling(id) {
      if (guard()) return;
      const p = S.parentOf(map, id);
      if (!p) {
        const n0 = S.node(map, id);
        const s0 = size(n0);
        return addFree({ x: n0.x, y: n0.y + s0.h + 40 }, n0.type === 'notion' ? 'notion' : n0.type);
      }
      const cur = S.node(map, id);
      const cs = size(cur);
      const sibs = S.childrenOf(map, p.id);
      const idx = sibs.findIndex((s) => s.id === id);
      const next = sibs[idx + 1];
      const across = map.layout === 'down'; // pyramide : les frères se suivent de gauche à droite
      let at = across ? { x: cur.x + cs.w + R.layout.P.downSibGap, y: cur.y } : { x: cur.x, y: cur.y + cs.h + R.layout.GAP_Y };
      const n = addChild(p.id, { type: cur.type, at, edit: true });
      if (n && next) { // pousse les frères suivants
        const shift = across ? size(n).w + R.layout.P.downSibGap : size(n).h + R.layout.GAP_Y;
        for (const s of sibs.slice(idx + 1)) { if (across) moveBranch(s.id, shift, 0); else moveBranch(s.id, 0, shift); }
        render();
      }
      return n;
    }
    function addFree(at, type = 'notion') {
      if (guard()) return;
      const n = S.newNode({ type, title: '', x: at.x, y: at.y });
      mutate(() => { map.nodes.push(n); st.fresh.add(n.id); }, { pane: false });
      st.sel = new Set([n.id]); st.primary = n.id; st.selEdge = null;
      render();
      renderPane(true);
      startEdit(n.id, true);
      return n;
    }
    function defaultChildType(p) {
      // structure : on poursuit le plan (Chapitre → Section → Sous-section), ou on imite les frères déjà posés
      if (S.isStruct(p.type)) {
        const ch = S.childrenOf(map, p.id);
        if (ch.length) return ch[ch.length - 1].type;
        return p.type === 'chapitre' ? 'section' : p.type === 'section' ? 'soussection' : 'notion';
      }
      if (p.type === 'notion') return 'idee';
      return 'idee';
    }
    /** Évite qu'un nouveau nœud recouvre un nœud existant */
    function nudgeOverlaps(n) {
      const s = size(n);
      for (let i = 0; i < 30; i++) {
        const hit = map.nodes.find((o) => o.id !== n.id && !(n.x + s.w < o.x || o.x + size(o).w < n.x || n.y + s.h < o.y || o.y + size(o).h < n.y));
        if (!hit) return;
        n.y = hit.y + size(hit).h + R.layout.GAP_Y;
      }
    }
    function moveBranch(id, dx, dy) {
      const ids = [id, ...S.descendants(map, id)];
      for (const i of ids) { const n = S.node(map, i); n.x += dx; n.y += dy; }
    }
    function deleteNodes(ids) {
      if (guard()) return;
      ids = [...ids].filter((id) => S.node(map, id));
      if (!ids.length) return;
      const all = new Set();
      for (const id of ids) { all.add(id); for (const d of S.descendants(map, id)) all.add(d); }
      const prevParent = S.parentOf(map, ids[0]);
      // sortie courte (160 ms ease-in) : pas d'anticipation sur une action fréquente
      mutate(() => {
        map.nodes = map.nodes.filter((n) => !all.has(n.id));
        map.edges = map.edges.filter((e) => !all.has(e.from) && !all.has(e.to));
        st.sel.clear(); st.primary = null; st.selEdge = null;
      });
      if (prevParent && S.node(map, prevParent.id)) select(prevParent.id);
      ui.snack(all.size > 1 ? `${all.size} nœuds supprimés` : 'Nœud supprimé', { action: 'Annuler', onAction: undo });
    }
    function deleteEdge(id) {
      if (guard()) return;
      mutate(() => { map.edges = map.edges.filter((e) => e.id !== id); st.selEdge = null; });
      ui.snack('Lien supprimé', { action: 'Annuler', onAction: undo });
    }
    function connect(from, to) {
      if (guard()) return;
      if (from === to) return;
      if (map.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
        ui.snack('Ces deux nœuds sont déjà reliés');
        return;
      }
      const tree = S.canTree(map, from, to);
      const e = { id: U.uid('e'), from, to, kind: tree ? 'tree' : 'link', label: '' };
      mutate(() => { map.edges.push(e); ed._newEdges.add(e.id); });
      const tel = st.els.get(to);
      if (tel && !motion.reduced()) { tel.classList.remove('linked'); void tel.offsetWidth; tel.classList.add('linked'); setTimeout(() => tel.classList.remove('linked'), 300); }
      motion.haptic(10);
      ui.snack(tree ? 'Rattaché comme sous-élément' : 'Renvoi créé', { action: 'Modifier', onAction: () => selectEdge(e.id) });
    }
    function setType(ids, type) {
      if (guard()) return;
      mutate(() => { for (const id of ids) { const n = S.node(map, id); if (n) n.type = type; } });
    }
    function setLogic(id, logic) {
      if (guard()) return;
      mutate(() => { const n = S.node(map, id); if (n) n.logic = logic; });
    }
    /* Nœuds de structure (Chapitre, Section, Sous-section, Leçon) */
    const STRUCT_THIS = { chapitre: 'ce chapitre', lecon: 'cette leçon', section: 'cette section', soussection: 'cette sous-section' };
    function reviewBranch(n) { R.app.go(`#/reviser/carte/${map.id}/${n.id}`); }
    /** Rivaux repliables : les autres nœuds du même type qui ont une descendance */
    function rivals(n) { return map.nodes.filter((o) => o.type === n.type && o.id !== n.id && S.childrenOf(map, o.id).length); }
    /** Isoler : replie les autres chapitres (ou leçons…), déplie celui-ci, puis le cadre avec sa branche */
    function isolate(n) {
      const others = rivals(n).filter((o) => !o.collapsed);
      const visibleBefore = new Set(st.els.keys());
      for (const o of others) for (const d of S.descendants(map, o.id)) if (visibleBefore.has(d)) st.retract.set(d, o.id);
      mutate(() => {
        for (const o of others) o.collapsed = true;
        for (const a of [...S.ancestors(map, n.id), n]) a.collapsed = false;
      }, { view: true });
      const ids = new Set([n.id, ...S.descendants(map, n.id)]);
      setTimeout(() => fit(true, 1, ids), 60);
    }
    function structMenuItems(n) {
      if (!S.isStruct(n.type)) return [];
      const bs = S.branchStats(map, n.id);
      return [
        bs.reviewable ? { label: `Réviser ${STRUCT_THIS[n.type]}`, icon: 'cards', onClick: () => reviewBranch(n) } : null,
        rivals(n).length ? { label: `Isoler ${STRUCT_THIS[n.type]}`, icon: 'target', onClick: () => isolate(n) } : null,
      ].filter(Boolean);
    }
    function toggleCollapse(id) {
      const n = S.node(map, id);
      if (!n || !S.childrenOf(map, id).length) return;
      const visibleBefore = new Set(st.els.keys());
      if (!n.collapsed) for (const d of S.descendants(map, id)) { if (visibleBefore.has(d)) st.retract.set(d, id); }
      mutate(() => {
        n.collapsed = !n.collapsed;
        if (!n.collapsed) {
          const hidden = S.hiddenSet(map);
          for (const d of S.descendants(map, id)) if (!hidden.has(d)) st.origin.set(d, id);
        }
      }, { view: true });
    }
    function duplicateBranch(id) {
      if (guard()) return;
      const ids = [id, ...S.descendants(map, id)];
      const idMap = {};
      const b = bbox(new Set(ids));
      const dy = b ? b.y1 - b.y0 + 32 : 80;
      mutate(() => {
        for (const i of ids) {
          const n = S.node(map, i);
          const c = JSON.parse(JSON.stringify(n));
          c.id = U.uid('n'); idMap[i] = c.id; c.y += dy; c.review = { box: 0, due: 0, last: 0, rating: null };
          map.nodes.push(c); st.origin.set(c.id, i);
        }
        const groupMap = {};
        for (const e of map.edges.filter((x) => ids.includes(x.from) && ids.includes(x.to))) {
          const copy = { ...e, id: U.uid('e'), from: idMap[e.from], to: idMap[e.to] };
          // une fourche dupliquée devient une fourche indépendante
          if (e.group) copy.group = groupMap[e.group] || (groupMap[e.group] = U.uid('g'));
          map.edges.push(copy);
        }
        const pe = S.parentEdge(map, id);
        if (pe) map.edges.push({ id: U.uid('e'), from: pe.from, to: idMap[id], kind: 'tree', label: '' });
      });
      select(idMap[id]);
      ensureVisible(idMap[id]);
    }

    /** Disposition : automatique (le moteur compare et garde la plus lisible) ou imposée */
    const LAYOUT_CHOICES = [
      ['auto', 'Automatique (conseillé)', 'Ratio compare les dispositions et garde la plus lisible pour cette carte et cet écran.',
        '<rect x="2.5" y="9.5" width="7" height="5" rx="1.2"/><path d="M9.5 12h3"/><path d="M17 3.5l1.1 2.6 2.6 1.1-2.6 1.1L17 10.9l-1.1-2.6-2.6-1.1 2.6-1.1z"/><path d="M17.5 14.5v5M15 17h5"/>'],
      ['right', 'Vers la droite', 'La lecture la plus familière : de gauche à droite, de haut en bas.',
        '<rect x="2" y="9.5" width="6" height="5" rx="1.2"/><rect x="15" y="3.5" width="7" height="4" rx="1.2"/><rect x="15" y="10" width="7" height="4" rx="1.2"/><rect x="15" y="16.5" width="7" height="4" rx="1.2"/><path d="M8 12h3.5M11.5 5.5v13M11.5 5.5H15M11.5 12H15M11.5 18.5H15"/>'],
      ['organic', 'Libre', 'Les branches s’ouvrent en éventail, un peu en désordre, comme à la main — sans qu’aucun lien ne traverse un nœud.',
        '<rect x="9" y="10" width="6" height="4.5" rx="1.2"/><rect x="2" y="3.5" width="5" height="4" rx="1.2"/><rect x="3.5" y="17" width="5" height="4" rx="1.2"/><rect x="17" y="2.5" width="5" height="4" rx="1.2"/><rect x="16" y="16.5" width="5.5" height="4" rx="1.2"/><path d="M9 11.5C7 10 6.5 8.5 6 7.5M9.5 14.5C8.5 16 7.5 16.5 7 17M15 11c1.2-1.5 2-3 2.5-4.5M14.5 14.5c1 1 1.8 1.6 2.3 2"/>'],
      ['balanced', 'Centrée', 'Le sujet au centre, les branches de chaque côté, dans le sens des aiguilles d’une montre.',
        '<rect x="9" y="9.5" width="6" height="5" rx="1.2"/><rect x="1.5" y="4" width="5" height="4" rx="1.2"/><rect x="1.5" y="16" width="5" height="4" rx="1.2"/><rect x="17.5" y="4" width="5" height="4" rx="1.2"/><rect x="17.5" y="16" width="5" height="4" rx="1.2"/><path d="M9 12H6.5M6.5 6v12M15 12h2.5M17.5 6v12"/>'],
      ['down', 'Pyramide', 'De haut en bas : pour une petite hiérarchie large et peu profonde.',
        '<rect x="9" y="2.5" width="6" height="5" rx="1.2"/><rect x="2" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="17" y="16" width="5" height="5" rx="1.2"/><path d="M12 7.5v4.5M4.5 12h15M4.5 12v4M12 12v4M19.5 12v4"/>'],
    ];
    function chooseLayout() {
      if (guard()) return;
      const cur = map.layoutPick || 'auto';
      let closeFn = null;
      const list = h('div.choice-list.form-choice.layout-choices', { role: 'radiogroup', 'aria-label': 'Disposition de la carte' },
        LAYOUT_CHOICES.map(([v, title, text, icon]) => {
          const b = h('button.list-item.choice', { type: 'button', role: 'radio', 'aria-checked': String(v === cur) },
            h('span.layout-ic', { html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>` }),
            h('span.choice-l', h('b', title), h('span.choice-sub', v === 'auto' && map.layout ? `${text} Actuellement : ${LAYOUT_CHOICES.find((c) => c[0] === map.layout)[1].toLowerCase()}.` : text)),
            h('span.choice-check', R.icon('check', 20)));
          b.addEventListener('click', () => { closeFn && closeFn(); setTimeout(() => tidy(v), 160); });
          return b;
        }));
      // aides à la lecture : un interrupteur pour toutes les cartes
      const aidsOn = () => S.data.settings.readingAids !== false;
      const aids = h('button.list-item.choice.layout-aids', { type: 'button', role: 'switch', 'aria-checked': String(aidsOn()) },
        h('span.layout-ic', { html: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h7" stroke="oklch(.6 .12 25)"/><path d="M4 12h11" stroke="oklch(.6 .12 162)"/><path d="M4 17h8" stroke="oklch(.6 .12 300)"/><circle cx="19" cy="7" r="2.6" fill="currentColor" stroke="none"/></svg>' }),
        h('span.choice-l', h('b', 'Aides à la lecture'), h('span.choice-sub', 'Une teinte douce par branche principale et les numéros d’ordre de lecture (1, 2, 3…). Pour toutes les cartes.')),
        h('span.choice-check', R.icon('check', 20)));
      aids.addEventListener('click', () => {
        S.data.settings.readingAids = !aidsOn();
        aids.setAttribute('aria-checked', String(aidsOn()));
        S.save(); render();
      });
      const autoOn = () => S.data.settings.autoOrganize !== false;
      const autoOrg = h('button.list-item.choice.layout-aids', { type: 'button', role: 'switch', 'aria-checked': String(autoOn()) },
        h('span.layout-ic', R.icon('sparkle', 24)),
        h('span.choice-l', h('b', 'Corriger l’organisation en rangeant'), h('span.choice-sub', 'Ranger applique les corrections établies par la carte (libellés, rattachements dits par les notes…), vérifiées et annulables. Les probables restent des propositions.')),
        h('span.choice-check', R.icon('check', 20)));
      autoOrg.addEventListener('click', () => {
        S.data.settings.autoOrganize = !autoOn();
        autoOrg.setAttribute('aria-checked', String(autoOn()));
        S.save();
      });
      const body = h('div', list, h('p.overline.layout-sep', 'Affichage'), h('div.choice-list.form-choice.layout-choices', aids, autoOrg));
      ui.dialog({ title: 'Disposition', icon: 'tidy', body, cls: 'dialog-layout', onOpen: (_, close) => { closeFn = close; } });
    }
    R.actions.chooseLayout = chooseLayout;

    /** Titre d'un nœud, avec son fragment mis en relief (n.em) quand il y en a un */
    function titleInto(el, n) {
      const t = n.title || 'Sans titre';
      const i = n.em ? t.toLowerCase().indexOf(n.em.toLowerCase()) : -1;
      if (i < 0) { el.textContent = t; return; }
      U.clear(el);
      el.append(t.slice(0, i), h('mark.node-em', t.slice(i, i + n.em.length)), t.slice(i + n.em.length));
    }
    /* Organisation : le rangement relit aussi les relations (js/organize.js) et propose
       des liens libellés, des branches, des définitions décomposées. Rien n'est appliqué
       sans accord ; tout s'annule d'un geste. */
    // refus : gardés avec la carte (une correction refusée ne revient pas au rangement suivant)
    const declined = st.declined || (st.declined = new Set(map.organizeDeclined || []));
    function declineKeys(keys) {
      for (const k of keys) declined.add(k);
      map.organizeDeclined = [...declined].slice(-200);
      S.save();
    }
    function auditNow() {
      if (!R.organize || ro()) return { fixes: [], notes: [], stats: null };
      try {
        // les refus de la session sont connus du moteur : un élément refusé redevient disponible pour les autres corrections
        return R.organize.audit(map, { declined, course: map.courseId ? S.mapsOf(map.courseId) : null });
      } catch (e) { console.warn(e); return { fixes: [], notes: [], stats: null }; }
    }
    const suggestions = () => auditNow().fixes;
    function openOrganize() {
      if (guard()) return;
      flushEdit();
      const { fixes: list, notes, stats } = auditNow();
      const log = (map.organizeLog || []).slice(-8).reverse();
      if (!list.length && !notes.length && !log.length) { ui.snack('Organisation : rien à améliorer', { duration: 2000 }); return; }
      // sûr : coché ; probable : décoché, à vérifier ; signalé : à corriger à la main
      const on = new Set(list.filter((x) => x.certainty !== 'probable').map((x) => x.key));
      let okBtn = null, closeFn = null;
      const count = () => {
        if (!okBtn) return;
        okBtn.querySelector('.btn-label').textContent = on.size ? `Appliquer (${on.size})` : 'Appliquer';
        okBtn.disabled = !on.size;
      };
      const item = (x) => {
        const b = h('button.list-item.choice.org-item', { type: 'button', role: 'checkbox', 'aria-checked': String(on.has(x.key)), 'data-kind': x.kind },
          h('span.choice-l', h('b', x.title), x.detail ? h('span.choice-sub', x.detail) : null,
            x.preview && x.preview.length ? h('span.org-preview', x.preview.slice(0, 7).map((t) => h('span', t))) : null),
          h('span.choice-check', R.icon('check', 20)));
        b.addEventListener('click', () => {
          if (on.has(x.key)) on.delete(x.key); else on.add(x.key);
          b.setAttribute('aria-checked', String(on.has(x.key)));
          count();
        });
        return b;
      };
      const sure = list.filter((x) => x.certainty !== 'probable'), maybe = list.filter((x) => x.certainty === 'probable');
      const group = (title, sub, els) => els.length ? [h('p.overline.org-group', title), sub ? h('p.org-group-sub', sub) : null,
        h('div.choice-list.form-choice.org-list', { role: 'group', 'aria-label': title }, els)] : [];
      const noteEls = notes.map((x) => {
        const b = h('button.list-item.org-note', { type: 'button', 'data-kind': x.kind },
          h('span.choice-l', h('b', x.title), h('span.choice-sub', x.detail)), R.icon('target', 18));
        b.addEventListener('click', () => { closeFn && closeFn(false); setTimeout(() => { select(x.ids[0]); centerOn(x.ids[0]); }, 200); });
        return b;
      });
      const body = h('div.org-body',
        h('p.dialog-text', 'Des liens libellés se lisent comme des phrases et s’apprennent mieux qu’une liste. Rien n’est réécrit : seules les relations changent.'),
        stats ? h('p.org-stat', `Relations nommées : ${Math.round(stats.relationRate * 100)} % (visé : ${Math.round(R.organize.RULES.labelledTarget * 100)} %) · renvois : ${stats.links}/${R.organize.linkBudget(stats.nodes)}`) : null,
        ...group('Établi par la carte', null, sure.map(item)),
        ...group('Probable — à vérifier', 'Indice seulement (mots partagés) : cochez si le cours le dit.', maybe.map(item)),
        ...group('À corriger à la main', 'La carte ne permet pas de trancher sans inventer.', noteEls),
        ...group('Déjà appliqué au rangement', 'Établi par la carte, vérifié après coup ; Annuler juste après le rangement le refuse pour de bon.',
          log.map((x) => h('div.list-item.org-done', { 'data-kind': x.kind },
            h('span.choice-l', h('b', x.title), h('span.choice-sub', `${U.relTime(x.at)} · ${x.detail}`),
              x.preview && x.preview.length ? h('span.org-preview', x.preview.map((t) => h('span', t))) : null)))));
      ui.dialog({
        title: 'Améliorer l’organisation', icon: 'tidy', body, cls: 'dialog-layout dialog-org',
        actions: [{ label: 'Plus tard', value: false }, { label: on.size ? `Appliquer (${on.size})` : 'Appliquer', value: true, variant: 'filled', primary: true }],
        onOpen: (box, close) => { closeFn = close; okBtn = box.querySelector('.dialog-actions .btn:last-child'); count(); },
      }).then((ok) => {
        if (!ok) return;
        declineKeys(list.filter((x) => !on.has(x.key)).map((x) => x.key));
        const pick = list.filter((x) => on.has(x.key));
        if (!pick.length) return;
        const snap = snapshot();
        const before = new Set(R.organize.check(map));
        let n = 0;
        for (const x of pick) { try { x.apply(map); n++; } catch (e) { console.warn(e); } }
        S.normalizeGroups(map.edges);
        // contrôle après correction : toute violation NOUVELLE rend la carte telle qu'elle était
        const broken = R.organize.check(map).filter((v) => !before.has(v));
        if (broken.length) {
          console.warn('organisation annulée', broken);
          restoreSnap(snap);
          ui.snack('Organisation annulée : la carte serait devenue incohérente', { duration: 3500 });
          return;
        }
        st.undo.push(snap); st.redo = []; st.coalesce = null;
        S.touchMap(map, 'edit');
        render(); updateHistoryBtns();
        // la structure a changé : on range dans la foulée (une seule étape d'annulation)
        setTimeout(() => tidy(null, { quiet: true, noUndo: true }), 60);
        ui.snack(n > 1 ? `${n} améliorations appliquées` : 'Amélioration appliquée', { action: 'Annuler', onAction: undo, duration: 4000 });
      });
    }
    R.actions.organize = openOrganize;
    /** Rangement : les corrections ÉTABLIES (sûres) sont appliquées d'elles-mêmes, une à une, chacune
        vérifiée (intégrité, effet, texte conservé) puis tracée dans le journal de la carte. Les
        probables restent des propositions ; les doutes, des signalements. Rend le nombre appliqué. */
    function autoOrganize() {
      if (!R.organize || ro() || S.data.settings.autoOrganize === false) return { done: [], undone: [] };
      let res = { done: [], undone: [] };
      try {
        const sure = auditNow().fixes.filter((x) => x.certainty === 'sure');
        if (!sure.length) return res;
        res = R.organize.applyVerified(map, sure);
      } catch (e) { console.warn(e); return res; }
      if (res.undone.length) console.warn('organisation : corrections défaites', res.undone.map((x) => x.fix.key + ' — ' + x.why));
      if (res.done.length) {
        const at = Date.now();
        map.organizeLog = [...(map.organizeLog || []), ...res.done.map((f) => R.organize.logEntry(f, at))].slice(-60);
      }
      return res;
    }
    let lastHint = '';
    function hintOrganize() {
      const { fixes, notes } = auditNow();
      const list = fixes.filter((x) => x.certainty !== 'probable');
      const sig = list.map((x) => x.key).concat(notes.map((x) => x.key)).join('|');
      const n = list.length;
      if (sig === lastHint) return; // pas de rappel identique à chaque rangement
      lastHint = sig;
      if (n) ui.snack(n > 1 ? `Organisation : ${n} améliorations possibles` : 'Organisation : 1 amélioration possible', { action: 'Voir', onAction: openOrganize, duration: 5000 });
      else if (notes.length) ui.snack(notes.length > 1 ? `Organisation : ${notes.length} points à vérifier` : 'Organisation : 1 point à vérifier', { action: 'Voir', onAction: openOrganize, duration: 5000 });
    }

    /** Ranger : pose à pose, trajectoires en arc. mode : disposition choisie (sinon celle de
        l'utilisateur, sinon automatique — le moteur compare droite, centrée et pyramide). */
    let tidyStop = null;
    function viewportSize() { const r = canvas.getBoundingClientRect(); return { w: r.width || innerWidth, h: r.height || innerHeight }; }
    function tidy(mode, opts = {}) {
      const userTidy = !opts.quiet; // l'application des suggestions range sans relancer l'analyse
      if (typeof mode !== 'string') mode = null; // appelé depuis un bouton : l'argument est l'élément
      if (guard()) return;
      flushEdit();
      measure();
      // corrections établies d'abord (la structure change la disposition), dans la même étape d'annulation
      let auto = null;
      if (userTidy) {
        const snap = snapshot();
        auto = autoOrganize();
        if (auto.done.length) {
          st.undo.push(snap); st.redo = []; st.coalesce = null;
          st.autoSnap = { snap, keys: auto.done.map((f) => f.key) };
          opts = { ...opts, noUndo: true };
          S.touchMap(map, 'edit');
          render(); measure(); updateHistoryBtns();
        } else auto = null;
      }
      const announce = () => {
        if (!auto) return false;
        const n = auto.done.length;
        ui.snack(`Rangé · ${n > 1 ? n + ' corrections d’organisation appliquées' : '1 correction d’organisation appliquée'}`, { action: 'Voir', onAction: openOrganize, duration: 5000 });
        return true;
      };
      const pick = mode ? (mode === 'auto' ? null : mode) : map.layoutPick || null;
      const res = R.layout.arrange(map, sizeFn, { mode: pick || 'auto', viewport: viewportSize() });
      const target = res.pos;
      const modeChanged = res.mode !== (map.layout || 'right');
      const from = {};
      for (const n of map.nodes) from[n.id] = { x: n.x, y: n.y };
      const moved = map.nodes.some((n) => target[n.id] && (Math.abs(target[n.id].x - n.x) > 1 || Math.abs(target[n.id].y - n.y) > 1));
      const pickChanged = (pick || null) !== (map.layoutPick || null);
      if (!moved && !modeChanged && !pickChanged) { fit(); if (userTidy && !announce()) setTimeout(hintOrganize, 500); return; }
      if (!opts.noUndo) { st.undo.push(snapshot()); st.redo = []; st.coalesce = null; }
      // l'ordre de lecture suit la disposition : on la fixe avant l'animation (rien ne se renumérote en route)
      map.layout = res.mode;
      if (pick) map.layoutPick = pick; else delete map.layoutPick;
      if (!moved) { S.touchMap(map, 'edit'); render(); fit(); announce(); return; }
      if (tidyStop) tidyStop();
      /* Overlapping action : chaque niveau de profondeur démarre 24 ms après son
         parent (plafond 120 ms). Arcs : x et y suivent des courbes différentes. */
      const depth = {};
      for (const n of map.nodes) depth[n.id] = Math.min(5, S.ancestors(map, n.id).length);
      const D = 440, LAG = 24, TOTAL = D + 5 * LAG;
      tidyStop = motion.tween({
        duration: TOTAL, ease: (p) => p,
        onUpdate: (p) => {
          const t = p * TOTAL;
          for (const n of map.nodes) {
            const tg = target[n.id];
            if (!tg) continue;
            const q = U.clamp((t - depth[n.id] * LAG) / D, 0, 1);
            const ex = motion.ease.out(q), ey = motion.ease.inOut(q);
            n.x = from[n.id].x + (tg.x - from[n.id].x) * ex;
            n.y = from[n.id].y + (tg.y - from[n.id].y) * ey;
            const el = st.els.get(n.id);
            if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
          }
          st.fastEdges = true; renderEdges(); st.fastEdges = false;
          positionCtx();
        },
        onDone: () => {
          for (const n of map.nodes) if (target[n.id]) { n.x = target[n.id].x; n.y = target[n.id].y; }
          tidyStop = null;
          S.touchMap(map, 'edit');
          render();
          updateHistoryBtns();
          fit(true);
          if (userTidy && !announce()) setTimeout(hintOrganize, 700);
        },
      });
    }

    /* ------------------------------------------------------------------ */
    /* Édition du titre en place                                          */
    /* ------------------------------------------------------------------ */
    function startEdit(id, isNew = false) {
      if (guard()) return;
      if (st.masked) return;
      flushEdit();
      const n = S.node(map, id);
      const el = st.els.get(id);
      if (!n || !el) return;
      st.editing = id;
      el.classList.add('editing');
      const hl = el.querySelector('.hl');
      hl.textContent = n.title;
      try { hl.contentEditable = 'plaintext-only'; } catch (e) { hl.contentEditable = 'true'; }
      if (hl.contentEditable !== 'plaintext-only') hl.contentEditable = 'true';
      hl.spellcheck = true;
      hl.dataset.placeholder = isNew ? placeholderFor(n) : 'Sans titre';
      hl.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(hl);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      if (U.isCompact()) centerOn(id, { minK: 1 });
      positionCtx();
      const original = n.title;
      const onInput = () => {
        el.dataset.sized = '';
        st.sizes.delete(id);
        measure();
        renderEdges();
        positionCtx();
      };
      const finish = (commit) => {
        if (st.editing !== id) return;
        st.editing = null;
        hl.removeEventListener('keydown', onKey);
        hl.removeEventListener('input', onInput);
        hl.removeEventListener('blur', onBlur);
        hl.contentEditable = 'false';
        el.classList.remove('editing');
        const text = hl.textContent.replace(/\s+/g, ' ').trim();
        if (!commit && isNew && !original) { deleteSilently(id); renderPane(true); return; }
        if (commit && text !== original) {
          mutate(() => { n.title = text; if (n.em && !text.toLowerCase().includes(n.em.toLowerCase())) delete n.em; });
        } else {
          hl.textContent = original || 'Sans titre';
          el._sig = null;
          render();
        }
        renderPane(true);
      };
      const onKey = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); canvas.focus({ preventScroll: true }); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(isNew && hl.textContent.trim() ? true : false); canvas.focus({ preventScroll: true }); }
        else if (e.key === 'Tab') { e.preventDefault(); finish(true); if (e.shiftKey) { const p = S.parentOf(map, id); if (p) addSibling(p.id); } else addChild(id); }
      };
      const onBlur = () => setTimeout(() => finish(true), 0);
      hl.addEventListener('keydown', onKey);
      hl.addEventListener('input', onInput);
      hl.addEventListener('blur', onBlur);
      ed._finishEdit = finish;
    }
    function flushEdit() { if (st.editing && ed._finishEdit) ed._finishEdit(true); }
    function deleteSilently(id) {
      // nœud créé puis abandonné (Échap) : on annule purement sa création
      const parent = S.parentOf(map, id);
      const top = st.undo[st.undo.length - 1];
      if (top && !top.includes('"' + id + '"')) {
        restoreSnap(st.undo.pop());
        if (parent && S.node(map, parent.id)) select(parent.id);
        return;
      }
      map.nodes = map.nodes.filter((n) => n.id !== id);
      map.edges = map.edges.filter((e) => e.from !== id && e.to !== id);
      S.normalizeGroups(map.edges);
      st.sel.delete(id);
      if (st.primary === id) st.primary = null;
      S.touchMap(map, 'edit');
      if (parent) select(parent.id); else render();
    }
    function placeholderFor(n) {
      return {
        notion: 'Notion…', definition: 'Définition…', juris: 'Cass. civ. …', texte: 'Art. …', idee: 'Idée…',
        chapitre: 'Titre du chapitre…', lecon: 'Titre de la leçon…', section: 'Titre de la section…', soussection: 'Titre de la sous-section…',
        doctrine: 'Auteur, position…', retenir: 'À retenir…', methode: 'Méthode…',
        citation: '« … »', personne: 'Nom…', date: '1789…', chiffre: '42 %…', formule: 'E = mc²…',
        etape: 'Étape…', conseil: 'Conseil…', exercice: 'Exercice…', etude: 'Auteur, année — objet…',
      }[n.type];
    }

    /* ------------------------------------------------------------------ */
    /* Barre contextuelle (flottante ≥ 600 px)                            */
    /* ------------------------------------------------------------------ */
    function ctxItems() {
      const n = primaryNode();
      if (st.selEdge) return ro() ? null : edgeItems();
      if (!n) return null;
      if (ro()) return roItems(n);
      if (st.sel.size > 1) {
        return [
          { label: `${st.sel.size} sélectionnés`, text: true },
          { icon: 'type', label: 'Type', act: (b) => typeMenu(b, [...st.sel]) },
          { icon: 'tidy', label: 'Ranger', act: tidy },
          { icon: 'trash', label: 'Supprimer', act: () => deleteNodes(st.sel), danger: true },
        ];
      }
      const kids = S.childrenOf(map, n.id).length;
      return [
        { chip: true, label: S.TYPES[n.type].label, act: (b) => typeMenu(b, [n.id]), tip: 'Type du nœud (1–9, Alt 1–4 : structure)' },
        { icon: 'child', label: 'Enfant', act: () => addChild(n.id), tip: 'Décomposer', kbd: 'Tab' },
        { icon: 'note', label: 'Note', act: () => openPane(true), tip: 'Écrire la note', kbd: 'Espace', on: !!n.note.trim() },
        { icon: 'link', label: 'Relier', act: () => startLinking(n.id), tip: 'Relier à un ou plusieurs nœuds', kbd: 'L' },
        S.isStruct(n.type)
          ? (S.branchStats(map, n.id).reviewable ? { icon: 'cards', label: 'Réviser', act: () => reviewBranch(n), tip: `Réviser ${STRUCT_THIS[n.type]}` } : null)
          : { icon: 'logic', label: n.logic ? (n.logic === 'et' ? 'ET' : 'OU') : 'ET/OU', act: (b) => logicMenu(b, n), tip: 'Conditions cumulatives ou alternatives', on: !!n.logic },
        kids ? { icon: n.collapsed ? 'expand' : 'collapse', label: n.collapsed ? 'Déplier' : 'Replier', act: () => toggleCollapse(n.id), tip: n.collapsed ? 'Déplier la branche' : 'Replier la branche', kbd: '.' } : null,
        { icon: 'more', label: 'Plus', act: (b) => nodeMenu(b, n) },
      ].filter(Boolean);
    }
    /** Lecture seule : lire, réviser, replier, centrer — rien qui modifie la carte */
    function roItems(n) {
      if (st.sel.size > 1) return [{ label: `${st.sel.size} sélectionnés`, text: true }];
      const kids = S.childrenOf(map, n.id).length;
      return [
        { icon: 'note', label: 'Note', act: () => openPane(false), tip: 'Lire la note', kbd: 'Espace', on: !!n.note.trim() },
        S.isStruct(n.type) && S.branchStats(map, n.id).reviewable ? { icon: 'cards', label: 'Réviser', act: () => reviewBranch(n), tip: `Réviser ${STRUCT_THIS[n.type]}` } : null,
        kids ? { icon: n.collapsed ? 'expand' : 'collapse', label: n.collapsed ? 'Déplier' : 'Replier', act: () => toggleCollapse(n.id), tip: n.collapsed ? 'Déplier la branche' : 'Replier la branche', kbd: '.' } : null,
        { icon: 'target', label: 'Centrer', act: () => centerOn(n.id), tip: 'Centrer sur ce nœud' },
        { icon: 'more', label: 'Plus', act: (b) => nodeMenu(b, n) },
      ].filter(Boolean);
    }
    function edgeItems() {
      const e = map.edges.find((x) => x.id === st.selEdge);
      if (!e) return null;
      const id = e.id;
      // la barre est mise en cache : chaque action retrouve le lien courant (annuler remplace les objets)
      const cur = () => map.edges.find((x) => x.id === id);
      const run = (fn) => (b) => { const x = cur(); if (x) fn(x, b); };
      const grp = S.groupOf(map, e);
      const menu = edgeMenuItems(e);
      return [
        { chip: true, label: e.label || 'Libellé', act: run((x, b) => edgeLabelMenu(b, x)), tip: grp.length ? `Libellé commun aux ${grp.length} branches` : 'Libellé du lien', v: `${e.group || ''}|${grp.length}` },
        { icon: 'fork', label: 'Branche', act: run((x) => startLinking(x.from, { extend: x.id })), tip: grp.length ? 'Ajouter une branche à la fourche' : 'Ajouter une branche (même libellé)' },
        { icon: 'swap', label: e.kind === 'tree' ? 'Hiérarchie' : 'Renvoi', act: run((x) => toggleEdgeKind(x)), tip: e.kind === 'tree' ? 'Transformer en renvoi (pointillé)' : 'Transformer en lien hiérarchique' },
        menu.length ? { icon: 'more', label: 'Plus', act: run((x, b) => ui.menu(b, edgeMenuItems(x))), v: menu.map((m) => m.label).join('/') } : null,
        { icon: 'trash', label: 'Supprimer', act: run((x) => deleteEdge(x.id)), danger: true, kbd: 'Suppr', tip: grp.length ? 'Supprimer cette branche' : 'Supprimer le lien' },
      ].filter(Boolean);
    }
    /** Options secondaires d'un lien (divulgation progressive) */
    function edgeMenuItems(e) {
      const grp = S.groupOf(map, e);
      const src = S.node(map, e.from);
      const siblings = map.edges.filter((x) => x.from === e.from && x.kind === e.kind && x.id !== e.id && (!e.group || x.group !== e.group));
      const items = [];
      if (siblings.length) items.push({ label: `Regrouper les liens de « ${(src && src.title) || 'Sans titre'} »`, icon: 'fork', onClick: () => regroup(e) });
      if (grp.length) {
        items.push({ label: 'Détacher cette branche', icon: 'link', onClick: () => detachBranch(e) });
        items.push({ label: 'Séparer la fourche', icon: 'swap', onClick: () => ungroup(e) });
        items.push({ divider: true });
        items.push({ label: `Supprimer toute la fourche (${grp.length})`, icon: 'trash', danger: true, onClick: () => deleteFork(e) });
      }
      return items;
    }
    function buildBar(host, items, { labels = false } = {}) {
      U.clear(host);
      for (const it of items) {
        if (it.text) { host.appendChild(h('span.ctx-text', it.label)); continue; }
        let b;
        if (it.chip) {
          b = h('button.chip.chip-assist', { type: 'button', 'data-tip': it.tip }, h('span', it.label), R.icon('chevronDown', 16));
        } else {
          b = h('button.ctx-btn', { type: 'button', 'aria-label': it.label, 'data-tip': labels ? null : (it.tip || it.label), 'data-kbd': labels ? null : it.kbd, class: (it.danger ? 'danger ' : '') + (it.on ? 'on' : '') },
            R.icon(it.icon, 20), labels ? h('span.ctx-l', it.label) : null);
        }
        if (it.act) b.addEventListener('click', (e) => {
          e.stopPropagation();
          it.act(b);
          // rend la main au canvas pour enchaîner au clavier (Tab, Entrée…)
          setTimeout(() => { if (document.activeElement === b || document.activeElement === document.body) canvas.focus({ preventScroll: true }); }, 0);
        });
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        host.appendChild(b);
      }
    }
    let ctxKey = '';
    function positionCtx() {
      if (U.isCompact() || st.mode !== 'map' || st.masked || st.linking || gesture?.moved || st.editing) { ctxBar.classList.remove('in'); return; }
      const items = ctxItems();
      if (!items) { ctxBar.classList.remove('in'); ctxKey = ''; return; }
      const key = JSON.stringify([st.selEdge, items.map((i) => [i.label, i.on, i.icon, i.v, i.tip])]);
      if (key !== ctxKey) { buildBar(ctxBar, items); ctxKey = key; }
      let ax, ay, ah;
      if (st.selEdge) {
        const rec = st.edgeEls.get(st.selEdge);
        if (!rec || !rec.mid) { ctxBar.classList.remove('in'); return; }
        ax = rec.mid[0]; ay = rec.mid[1]; ah = 0;
      } else {
        const b = bbox(st.sel);
        if (!b) { ctxBar.classList.remove('in'); return; }
        ax = (b.x0 + b.x1) / 2; ay = b.y0; ah = b.y1 - b.y0;
      }
      const k = st.view.k;
      const sx = ax * k + st.view.x, sy = ay * k + st.view.y;
      const cw = ctxBar.offsetWidth || 320, chh = ctxBar.offsetHeight || 48;
      const r = visibleRect();
      let top = sy - chh - 14;
      if (top < 8) top = sy + ah * k + 14 + (st.selEdge ? 10 : 0);
      const left = U.clamp(sx - cw / 2, 8, r.w - cw - 8);
      ctxBar.style.transform = `translate(${left}px, ${top}px)`;
      ctxBar.classList.add('in');
    }

    function typeMenu(anchor, ids) {
      const cur = S.node(map, ids[0])?.type;
      const hint = (t) => {
        const i = S.TYPE_ORDER.indexOf(t);
        if (i >= 0 && i < 9) return String(i + 1);
        const j = S.STRUCT_ORDER.indexOf(t);
        return j >= 0 && !U.isCompact() ? 'Alt ' + (j + 1) : null;
      };
      const items = [];
      for (const g of S.TYPE_GROUPS) {
        items.push({ header: g.label });
        for (const t of g.types) items.push({ label: S.TYPES[t].label, checked: t === cur, hint: hint(t), swatch: R.colors.swatch(t), onClick: () => setType(ids, t) });
      }
      ui.menu(anchor, items, { align: 'start', focusChecked: true });
    }
    function logicMenu(anchor, n) {
      ui.menu(anchor, [
        { header: 'Les éléments rattachés sont…' },
        { label: 'Sans précision', checked: !n.logic, onClick: () => setLogic(n.id, null) },
        { label: 'Cumulatifs (ET)', checked: n.logic === 'et', onClick: () => setLogic(n.id, 'et') },
        { label: 'Alternatifs (OU)', checked: n.logic === 'ou', onClick: () => setLogic(n.id, 'ou') },
      ], { align: 'start' });
    }
    function nodeMenu(anchor, n) {
      const kids = S.childrenOf(map, n.id).length;
      if (ro()) {
        ui.menu(anchor, [
          { label: 'Lire la note', icon: 'note', onClick: () => openPane(false) },
          { label: 'Centrer', icon: 'target', onClick: () => centerOn(n.id) },
          ...structMenuItems(n),
          kids ? { label: n.collapsed ? 'Déplier' : 'Replier', icon: n.collapsed ? 'expand' : 'collapse', onClick: () => toggleCollapse(n.id) } : null,
          { label: 'Réviser cette carte', icon: 'cards', onClick: () => R.app.go('#/reviser/carte/' + map.id) },
          { divider: true },
          { label: 'Autoriser les modifications', icon: 'lockOpen', onClick: () => S.setReadOnly(map.id, false) },
        ].filter(Boolean));
        return;
      }
      ui.menu(anchor, [
        { label: 'Renommer', icon: 'edit', hint: 'F2', onClick: () => startEdit(n.id) },
        { label: 'Ajouter un frère', icon: 'sibling', hint: 'Entrée', onClick: () => addSibling(n.id) },
        { label: 'Dupliquer la branche', icon: 'copy', onClick: () => duplicateBranch(n.id) },
        { label: 'Centrer', icon: 'target', onClick: () => centerOn(n.id) },
        ...structMenuItems(n),
        { label: 'Réviser cette carte', icon: 'cards', onClick: () => R.app.go('#/reviser/carte/' + map.id) },
        { divider: true },
        { label: kids ? 'Supprimer la branche' : 'Supprimer', icon: 'trash', danger: true, hint: 'Suppr', onClick: () => deleteNodes([n.id]) },
      ]);
    }
    /** Libellés personnels déjà utilisés dans toutes les cartes, du plus fréquent au moins fréquent */
    function customLabels() {
      const count = new Map();
      for (const m of S.data.maps) for (const x of m.edges) {
        const l = (x.label || '').trim();
        if (l && !EDGE_PRESETS.includes(l)) count.set(l, (count.get(l) || 0) + 1);
      }
      return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);
    }
    function edgeLabelMenu(anchor, e) {
      const mine = customLabels();
      const grp = S.groupOf(map, e);
      ui.menu(anchor, [
        grp.length ? { header: `Libellé commun · ${grp.length} branches` } : null,
        { label: 'Écrire un libellé…', icon: 'edit', onClick: async () => {
          const v = await ui.form({
            title: 'Libellé du lien', icon: 'link', ok: 'Valider',
            fields: [{ key: 'l', label: 'Libellé (40 caractères max.)', value: e.label, maxlength: 40, placeholder: 'Ex. sauf si, à défaut, renvoie à…' }],
          });
          if (v) setEdgeLabel(e, v.l.trim().slice(0, 40));
        } },
        { label: 'Aucun', checked: !e.label, onClick: () => setEdgeLabel(e, '') },
        mine.length ? { header: 'Mes libellés' } : null,
        ...mine.map((l) => ({ label: l, checked: e.label === l, onClick: () => setEdgeLabel(e, l) })),
        { header: 'Suggestions' },
        ...EDGE_PRESETS.map((p) => ({ label: p, checked: e.label === p, onClick: () => setEdgeLabel(e, p) })),
      ], { align: 'start' });
    }
    function setEdgeLabel(e, l) {
      const members = S.groupOf(map, e);
      mutate(() => { for (const x of (members.length ? members : [e])) x.label = l; });
    }
    /** La nature (hiérarchie / renvoi) s'applique à toute la fourche */
    function toggleEdgeKind(e) {
      const members = S.groupOf(map, e).length ? S.groupOf(map, e) : [e];
      if (e.kind === 'link') {
        const blocked = members.filter((x) => S.parentEdge(map, x.to) || S.descendants(map, x.to).includes(x.from));
        if (blocked.length) {
          ui.snack(members.length > 1
            ? `Impossible : ${blocked.length > 1 ? 'des éléments ont' : 'un élément a'} déjà un parent (ou cela créerait une boucle).`
            : 'Impossible : ce nœud a déjà un parent (ou cela créerait une boucle).');
          return;
        }
        mutate(() => { for (const x of members) x.kind = 'tree'; });
      } else mutate(() => { for (const x of members) x.kind = 'link'; });
    }
    /** Créer une fourche : un lien unique qui se sépare vers plusieurs éléments */
    function createFork(from, targets) {
      targets = targets.filter((t) => t !== from && !map.edges.some((x) => (x.from === from && x.to === t) || (x.from === t && x.to === from)));
      if (!targets.length) { ui.snack('Ces éléments sont déjà reliés'); return null; }
      if (targets.length === 1) { connect(from, targets[0]); return null; }
      // décomposition si tous les éléments peuvent devenir enfants, sinon renvoi
      const tree = targets.every((t) => S.canTree(map, from, t));
      const group = U.uid('g');
      const made = targets.map((t) => ({ id: U.uid('e'), from, to: t, kind: tree ? 'tree' : 'link', label: '', group }));
      mutate(() => { for (const x of made) { map.edges.push(x); ed._newEdges.add(x.id); } });
      for (const t of targets) {
        const tel = st.els.get(t);
        if (tel && !motion.reduced()) { tel.classList.remove('linked'); void tel.offsetWidth; tel.classList.add('linked'); setTimeout(() => tel.classList.remove('linked'), 300); }
      }
      motion.haptic(10);
      selectEdge(made[0].id);
      ui.snack(`Fourche créée vers ${targets.length} éléments${tree ? '' : ' (renvoi)'}`, { action: 'Libellé', onAction: () => openForkLabel(made[0]) });
      return made[0];
    }
    /** Ajouter des branches à un lien (il devient une fourche) — même nature, même libellé */
    function addBranches(e, targets) {
      targets = targets.filter((t) => t !== e.from && !map.edges.some((x) => (x.from === e.from && x.to === t) || (x.from === t && x.to === e.from)));
      if (!targets.length) { ui.snack('Ces éléments sont déjà reliés'); return; }
      const ok = e.kind === 'tree' ? targets.filter((t) => S.canTree(map, e.from, t)) : targets;
      const skipped = targets.length - ok.length;
      if (!ok.length) { ui.snack('Impossible : ces éléments ont déjà un parent (ou cela créerait une boucle).'); return; }
      const group = e.group || U.uid('g');
      mutate(() => {
        e.group = group;
        for (const t of ok) { const x = { id: U.uid('e'), from: e.from, to: t, kind: e.kind, label: e.label, group }; map.edges.push(x); ed._newEdges.add(x.id); }
      });
      motion.haptic(10);
      selectEdge(e.id);
      ui.snack(`${ok.length > 1 ? ok.length + ' branches ajoutées' : 'Branche ajoutée'}${skipped ? ` · ${skipped} ignorée${skipped > 1 ? 's' : ''} (déjà rattachée)` : ''}`);
    }
    /** Regrouper tous les liens de même nature qui partent de la même source */
    async function regroup(e) {
      const members = map.edges.filter((x) => x.from === e.from && x.kind === e.kind);
      if (members.length < 2) return;
      const others = [...new Set(members.map((x) => x.label).filter((l) => l && l !== e.label))];
      if (others.length) {
        const ok = await ui.confirm('Regrouper ces liens ?', `Ils partageront le libellé « ${e.label || 'aucun'} ». ${others.length > 1 ? 'Les libellés' : 'Le libellé'} « ${others.join(' », « ')} » ${others.length > 1 ? 'seront remplacés' : 'sera remplacé'}.`, { ok: 'Regrouper', icon: 'fork' });
        if (!ok) return;
      }
      const group = e.group || U.uid('g');
      mutate(() => { for (const x of members) { x.group = group; x.label = e.label; } });
      selectEdge(e.id);
      ui.snack(`Fourche de ${members.length} branches`, { action: 'Annuler', onAction: undo });
    }
    function detachBranch(e) {
      mutate(() => { delete e.group; });
      selectEdge(e.id);
      ui.snack('Branche détachée (elle garde son libellé)', { action: 'Annuler', onAction: undo });
    }
    function ungroup(e) {
      const members = S.groupOf(map, e);
      mutate(() => { for (const x of members) delete x.group; });
      selectEdge(e.id);
      ui.snack(`Fourche séparée en ${members.length} liens`, { action: 'Annuler', onAction: undo });
    }
    function deleteFork(e) {
      const ids = new Set(S.groupOf(map, e).map((x) => x.id));
      mutate(() => { map.edges = map.edges.filter((x) => !ids.has(x.id)); st.selEdge = null; });
      ui.snack(`Fourche supprimée (${ids.size} branches)`, { action: 'Annuler', onAction: undo });
    }
    /** Ouvre le menu de libellé sur l'élément visible le plus proche (barre flottante ou barre basse) */
    function openForkLabel(e) {
      if (!map.edges.includes(e)) return;
      if (st.selEdge !== e.id) selectEdge(e.id);
      requestAnimationFrame(() => {
        const anchor = (!U.isCompact() && ctxBar.querySelector('.chip')) || bottomBar.querySelector('.ctx-btn') || (st.edgeEls.get(e.id) || {}).label;
        if (anchor) edgeLabelMenu(anchor, e);
      });
    }

    /* ------------------------------------------------------------------ */
    /* Barre d'outils verticale (≥ 600 px) & barre basse (mobile)         */
    /* ------------------------------------------------------------------ */
    function buildVToolbar() {
      const t = h('div.vtoolbar', { role: 'toolbar', 'aria-label': 'Outils de la carte', 'aria-orientation': 'vertical' });
      const add = (icon, tip, act, kbd, cls) => {
        const b = h('button.vt-btn', { type: 'button', 'aria-label': tip, 'data-tip': tip, 'data-kbd': kbd, class: cls || '' }, R.icon(icon, 22));
        b.addEventListener('click', act);
        t.appendChild(b);
        return b;
      };
      add('plus', 'Nouveau nœud libre', () => addFreeCenter(), 'double-clic', 'vt-primary vt-edit');
      add('tidy', 'Ranger la carte', () => tidy(), 'R', 'vt-edit');
      add('fit', 'Ajuster à l’écran', () => fit(), 'F');
      ed._maskBtn = add('eyeOff', 'Mode masqué (révision)', () => toggleMask(), 'H');
      t.appendChild(h('div.vt-sep'));
      add('zoomIn', 'Zoom avant', () => zoomTo(st.view.k * 1.25), '+');
      t.appendChild(zoomLabel);
      add('zoomOut', 'Zoom arrière', () => zoomTo(st.view.k / 1.25), '−');
      return t;
    }
    function addFreeCenter() {
      const r = visibleRect();
      const c = canvas.getBoundingClientRect();
      const p = toWorld(c.left + r.w / 2, c.top + r.h / 2);
      addFree({ x: p.x - 60, y: p.y - 20 });
    }

    let bbKey = '';
    function renderBottomBar() {
      let items;
      const n = primaryNode();
      if (st.mode === 'plan') items = [];
      else if (st.linking) items = [
        { icon: 'close', label: 'Annuler', act: stopLinking },
        { icon: 'check', label: st.linking.picked.length ? `Terminer (${st.linking.picked.length})` : 'Terminer', act: finishLinking, on: !!st.linking.picked.length },
      ];
      else if (st.masked) items = [
        { icon: 'eye', label: 'Tout révéler', act: revealAll },
        { icon: 'fit', label: 'Ajuster', act: () => fit() },
        { icon: 'close', label: 'Quitter', act: toggleMask },
      ];
      else if (ro()) {
        const kids = n && st.sel.size === 1 ? S.childrenOf(map, n.id).length : 0;
        items = n && st.sel.size === 1 ? [
          { icon: 'note', label: 'Note', act: () => openPane(false), on: !!n.note.trim() },
          kids ? { icon: n.collapsed ? 'expand' : 'collapse', label: n.collapsed ? 'Déplier' : 'Replier', act: () => toggleCollapse(n.id) } : null,
          { icon: 'target', label: 'Centrer', act: () => centerOn(n.id) },
          { icon: 'more', label: 'Plus', act: (b) => nodeMenu(b, n) },
        ].filter(Boolean) : st.sel.size > 1 ? [
          { icon: 'close', label: 'Désélect.', act: () => select(null) },
        ] : [
          { icon: 'fit', label: 'Ajuster', act: () => fit() },
          { icon: 'eyeOff', label: 'Masquer', act: toggleMask },
          { icon: 'lockOpen', label: 'Modifier', act: () => S.setReadOnly(map.id, false), tip: 'Autoriser les modifications' },
        ];
      }
      else if (st.selEdge) items = edgeItems() || [];
      else if (n && st.sel.size === 1) {
        items = [
          { icon: 'child', label: 'Enfant', act: () => addChild(n.id) },
          { icon: 'note', label: 'Note', act: () => openPane(true), on: !!n.note.trim() },
          { icon: 'link', label: 'Relier', act: () => startLinking(n.id) },
          { icon: 'type', label: 'Type', act: (b) => typeMenu(b, [n.id]) },
          { icon: 'more', label: 'Plus', act: (b) => mobileNodeMenu(b, n) },
        ];
      } else if (st.sel.size > 1) {
        items = [
          { icon: 'type', label: 'Type', act: (b) => typeMenu(b, [...st.sel]) },
          { icon: 'trash', label: 'Supprimer', act: () => deleteNodes(st.sel), danger: true },
          { icon: 'close', label: 'Désélect.', act: () => select(null) },
        ];
      } else {
        items = [
          { icon: 'plus', label: 'Nœud', act: addFreeCenter },
          { icon: 'tidy', label: 'Ranger', act: tidy },
          { icon: 'fit', label: 'Ajuster', act: () => fit() },
          { icon: 'eyeOff', label: 'Masquer', act: toggleMask },
          { icon: 'undo', label: 'Annuler', act: undo, id: 'undo' },
        ];
      }
      const key = JSON.stringify([st.selEdge, items.map((i) => [i.label, i.on, i.icon, i.v, i.tip])]);
      if (key === bbKey) return;
      bbKey = key;
      U.clear(bottomBar);
      items = items.map((i) => (i.chip ? { ...i, icon: 'edit', chip: false } : i));
      buildBar(bottomBar, items, { labels: true });
      U.$$('.ctx-btn', bottomBar).forEach((b, i) => { if (items[i] && items[i].id) b.dataset.act = items[i].id; });
      bottomBar.classList.remove('swap'); void bottomBar.offsetWidth; bottomBar.classList.add('swap');
      updateHistoryBtns();
    }
    function mobileNodeMenu(anchor, n) {
      const kids = S.childrenOf(map, n.id).length;
      if (ro()) { nodeMenu(anchor, n); return; }
      ui.menu(anchor, [
        { label: 'Renommer', icon: 'edit', onClick: () => startEdit(n.id) },
        { label: 'Ajouter un frère', icon: 'sibling', onClick: () => addSibling(n.id) },
        ...structMenuItems(n),
        S.isStruct(n.type) ? null : { label: n.logic === 'et' ? 'Cumulatifs (ET) ✓' : n.logic === 'ou' ? 'Alternatifs (OU) ✓' : 'Cumulatifs / alternatifs…', icon: 'logic', onClick: () => setTimeout(() => logicMenu(anchor, n), 160) },
        kids ? { label: n.collapsed ? 'Déplier' : 'Replier', icon: n.collapsed ? 'expand' : 'collapse', onClick: () => toggleCollapse(n.id) } : null,
        { label: 'Dupliquer la branche', icon: 'copy', onClick: () => duplicateBranch(n.id) },
        { label: 'Annuler', icon: 'undo', onClick: undo },
        { divider: true },
        { label: kids ? 'Supprimer la branche' : 'Supprimer', icon: 'trash', danger: true, onClick: () => deleteNodes([n.id]) },
      ], { placement: 'top' });
    }

    /* ------------------------------------------------------------------ */
    /* Bandeau (liaison, mode masqué)                                     */
    /* ------------------------------------------------------------------ */
    function updateBanner() {
      let content = null;
      if (st.linking) {
        const L = st.linking;
        const n = S.node(map, L.from);
        const k = L.picked.length;
        const ext = L.extend && map.edges.find((x) => x.id === L.extend);
        const what = ext ? 'Ajoute des branches' + (ext.label ? ` « ${ext.label} »` : '') + ' : touche les éléments' : 'Relier « ';
        content = [R.icon(ext ? 'fork' : 'link', 18),
          ext ? h('span', what, k ? [' · ', h('b', String(k))] : null)
            : h('span', what, h('b', (n && n.title) || 'Sans titre'), ' » à : ', k ? h('b', `${k} élément${k > 1 ? 's' : ''}`) : 'touche un ou plusieurs éléments'),
          ui.btn('Annuler', { variant: 'text', onClick: stopLinking }),
          ui.btn(k > 1 && !ext ? 'Créer la fourche' : 'Terminer', { variant: 'text', cls: 'banner-done', disabled: !k, onClick: finishLinking })];
      } else if (st.masked) {
        const total = map.nodes.length - S.roots(map).length;
        const shown = [...st.revealed].filter((id) => S.node(map, id)).length;
        content = [R.icon('eyeOff', 18), h('span', 'Récite, puis touche pour révéler · ', h('b', `${shown}/${total}`)),
          ui.btn('Tout révéler', { variant: 'text', onClick: revealAll }), ui.btn('Quitter', { variant: 'text', onClick: toggleMask })];
      }
      if (!content) { banner.classList.remove('in'); banner.hidden = true; return; }
      U.clear(banner);
      U.append(banner, content);
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add('in'));
    }
    /* Relier : on touche un ou plusieurs éléments, puis « Terminer ».
       1 élément → lien simple (comme avant) ; plusieurs → fourche ;
       extend → les éléments deviennent de nouvelles branches du lien sélectionné. */
    function startLinking(id, { extend = null } = {}) {
      if (guard()) return;
      flushEdit();
      st.linking = { from: id, picked: [], extend };
      select(null);
      render();
    }
    function stopLinking() { st.linking = null; tempEdge.setAttribute('d', ''); render(); }
    function togglePick(id) {
      const L = st.linking;
      if (!L || id === L.from) return;
      const i = L.picked.indexOf(id);
      if (i >= 0) L.picked.splice(i, 1); else { L.picked.push(id); motion.haptic(6); }
      render();
    }
    function finishLinking() {
      const L = st.linking;
      if (!L) return;
      stopLinking();
      if (!L.picked.length) return;
      if (L.extend) {
        const e = map.edges.find((x) => x.id === L.extend);
        if (e) addBranches(e, L.picked);
        return;
      }
      if (L.picked.length === 1) { connect(L.from, L.picked[0]); select(L.picked[0]); return; }
      createFork(L.from, L.picked);
    }
    /** Aperçu en pointillé des liens à créer pendant la sélection des cibles */
    function paintLinkPreview() {
      const L = st.linking;
      if (!L || !L.picked.length) { if (!gesture || gesture.type !== 'connect') tempEdge.setAttribute('d', ''); return; }
      const src = S.node(map, L.from);
      if (!src) return;
      const targets = L.picked.map((t) => S.node(map, t)).filter(Boolean);
      const byId = new Map(map.nodes.map((n) => [n.id, n]));
      let d = '';
      if (targets.length > 1) {
        const gm = bundleGeometry({ from: L.from, edges: targets.map((t) => ({ to: t.id })) }, byId);
        d = `M${gm.p1[0]},${gm.p1[1]} L${gm.J[0]},${gm.J[1]} ` + targets.map((t) => branchCurve(gm.J, gm.d1, t).d).join(' ');
      } else {
        const t = targets[0];
        const { p1, p2, d1, d2 } = anchors(src, size(src), t, size(t));
        d = curve(p1, d1, p2, d2).d;
      }
      tempEdge.setAttribute('d', d);
    }
    function toggleMask() {
      flushEdit();
      st.masked = !st.masked;
      st.revealed.clear();
      if (st.masked) { select(null); closePaneIfOverlay(); }
      ed._maskBtn.classList.toggle('on', st.masked);
      render();
    }
    function revealAll() {
      const ids = map.nodes.map((n) => n.id).filter((id) => !st.revealed.has(id));
      ids.forEach((id, i) => setTimeout(() => { st.revealed.add(id); if (st.masked) render(); }, i * 35));
    }
    function reveal(id) {
      if (st.revealed.has(id)) { select(id); return; }
      st.revealed.add(id);
      render();
      const el = st.els.get(id);
      if (el) { el.classList.add('revealing'); setTimeout(() => el.classList.remove('revealing'), 500); }
      const total = map.nodes.length - S.roots(map).length;
      if ([...st.revealed].filter((x) => S.node(map, x)).length >= total && el) {
        const r = el.getBoundingClientRect();
        motion.burst(r.left + r.width / 2, r.top + r.height / 2);
        ui.snack('Toute la carte est révélée. Bien joué !');
      }
    }

    /* ------------------------------------------------------------------ */
    /* Gestes (souris, tactile, stylet)                                   */
    /* ------------------------------------------------------------------ */
    const pointers = new Map();
    const panVel = motion.velocity();
    let flingStop = null;
    let gesture = null;
    let longPress = null;

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) onCancel(e); });
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', (e) => e.preventDefault());

    function hitNode(t) { const el = t.closest && t.closest('.node'); return el && !el.classList.contains('dying') ? el.dataset.id : null; }

    function onDown(e) {
      if (st.editing && e.target.closest('.node.editing .hl')) return; // laisse le curseur de texte
      if (e.button === 2) return;
      if (e.button === 1) e.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.classList.remove('kbd');
      // tout geste interrompt la caméra, l'inertie et « Ranger » (interruptible, sans saut)
      if (camStop) { camStop(); camStop = null; }
      if (flingStop) { flingStop(); flingStop = null; }
      if (tidyStop) { tidyStop(); tidyStop = null; S.touchMap(map, 'edit'); render(); }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      panVel.reset(); panVel.add(e.clientX, e.clientY);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

      if (pointers.size === 2) { startPinch(); return; }
      if (pointers.size > 2) return;
      flushEdit();

      const nodeId = hitNode(e.target);
      const handle = e.target.closest('[data-handle]');
      const collapseBtn = e.target.closest('.node-collapse');
      const edgeId = e.target.dataset?.edge || e.target.closest('.edge-label')?.dataset.edge;
      const logicFrom = e.target.closest('.edge-label')?.dataset.logicFrom;
      if (logicFrom && !nodeId) {
        gesture = { type: 'logic', from: logicFrom, anchor: e.target.closest('.edge-label'), start: { x: e.clientX, y: e.clientY }, id: e.pointerId };
        return;
      }
      const start = { x: e.clientX, y: e.clientY };

      if (handle && nodeId) {
        gesture = { type: 'connect', from: nodeId, start, moved: false, id: e.pointerId };
        return;
      }
      if (collapseBtn && nodeId) {
        gesture = { type: 'tap-collapse', id: e.pointerId, nodeId, start };
        return;
      }
      if (nodeId && e.target.closest('.node-go') && !st.linking && !(e.shiftKey || e.metaKey || e.ctrlKey)) {
        gesture = { type: 'tap-ref', id: e.pointerId, nodeId, start };
        return;
      }
      if (nodeId && e.target.closest('.node-has-note') && !st.linking && !st.masked && !(e.shiftKey || e.metaKey || e.ctrlKey)) {
        gesture = { type: 'tap-note', id: e.pointerId, nodeId, start };
        return;
      }
      if (nodeId) {
        const n = S.node(map, nodeId);
        gesture = { type: 'node', nodeId, start, moved: false, id: e.pointerId, shift: e.shiftKey || e.metaKey || e.ctrlKey, alt: e.altKey, pointerType: e.pointerType };
        if (e.pointerType !== 'mouse') {
          longPress = setTimeout(() => {
            if (!gesture || gesture.moved || gesture.nodeId !== nodeId) return;
            gesture.type = 'none';
            if (navigator.vibrate) navigator.vibrate(12);
            if (!st.sel.has(nodeId)) select(nodeId);
            const el = st.els.get(nodeId);
            if (el) nodeMenu(el, n);
          }, 480);
        }
        return;
      }
      if (edgeId) {
        gesture = { type: 'edge', edgeId, start, id: e.pointerId };
        return;
      }
      // fond
      const shiftMarquee = e.shiftKey && e.pointerType === 'mouse';
      gesture = shiftMarquee
        ? { type: 'marquee', start, id: e.pointerId, moved: false }
        : { type: 'pan', start, view: { ...st.view }, id: e.pointerId, moved: false, pointerType: e.pointerType };
      if (!shiftMarquee && e.pointerType !== 'mouse') {
        longPress = setTimeout(() => {
          if (!gesture || gesture.moved || gesture.type !== 'pan') return;
          gesture.type = 'none';
          if (navigator.vibrate) navigator.vibrate(12);
          const p = toWorld(start.x, start.y);
          const anchor = h('span', { style: { position: 'fixed', left: start.x + 'px', top: start.y + 'px', width: '1px', height: '1px' } });
          document.body.appendChild(anchor);
          ui.menu(anchor, [
            ro() ? null : { label: 'Nouveau nœud ici', icon: 'plus', onClick: () => addFree({ x: p.x - 60, y: p.y - 20 }) },
            ro() ? null : { label: 'Ranger la carte', icon: 'tidy', onClick: tidy },
            { label: 'Ajuster à l’écran', icon: 'fit', onClick: () => fit() },
          ].filter(Boolean), { align: 'start' });
          setTimeout(() => anchor.remove(), 300);
        }, 520);
      }
    }

    function onMove(e) {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') canvas.classList.remove('kbd');
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture && gesture.type === 'pinch') { updatePinch(); return; }
      if (!gesture || gesture.id !== e.pointerId) return;
      const dx = e.clientX - gesture.start.x, dy = e.clientY - gesture.start.y;
      const thresh = e.pointerType === 'mouse' ? 3 : 8;
      if (!gesture.moved && Math.hypot(dx, dy) > thresh) {
        gesture.moved = true;
        clearTimeout(longPress);
        onDragStart(e);
      }
      if (!gesture.moved) return;

      if (gesture.type === 'pan') {
        // suivi 1:1 du doigt, aucun easing pendant le geste
        st.view.x = gesture.view.x + dx;
        st.view.y = gesture.view.y + dy;
        panVel.add(e.clientX, e.clientY);
        applyView();
      } else if (gesture.type === 'node') {
        const k = st.view.k;
        const ddx = (e.clientX - gesture.last.x) / k, ddy = (e.clientY - gesture.last.y) / k;
        gesture.last = { x: e.clientX, y: e.clientY };
        for (const id of gesture.moving) {
          const n = S.node(map, id);
          n.x += ddx; n.y += ddy;
          const el = st.els.get(id);
          if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
        }
        st.fastEdges = true; renderEdges(); st.fastEdges = false;
        autoPan(e);
      } else if (gesture.type === 'connect') {
        const from = S.node(map, gesture.from);
        const s = size(from);
        const p = toWorld(e.clientX, e.clientY);
        const p1 = p.x >= from.x + s.w / 2 ? [from.x + s.w, from.y + s.h / 2] : [from.x, from.y + s.h / 2];
        const d1 = p.x >= from.x + s.w / 2 ? [1, 0] : [-1, 0];
        tempEdge.setAttribute('d', curve(p1, d1, [p.x, p.y], [-d1[0], 0]).d);
        const over = hitNode(document.elementFromPoint(e.clientX, e.clientY) || canvas);
        for (const [id, el] of st.els) el.classList.toggle('drop-target', id === over && id !== gesture.from);
        if (over && over !== gesture.from && over !== gesture.over) motion.haptic(6); // seuil franchi
        gesture.over = over;
        autoPan(e);
      } else if (gesture.type === 'marquee') {
        const r = canvas.getBoundingClientRect();
        const x0 = Math.min(gesture.start.x, e.clientX) - r.left, y0 = Math.min(gesture.start.y, e.clientY) - r.top;
        Object.assign(marquee.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
        marquee.hidden = false;
        const a = toWorld(Math.min(gesture.start.x, e.clientX), Math.min(gesture.start.y, e.clientY));
        const b = toWorld(Math.max(gesture.start.x, e.clientX), Math.max(gesture.start.y, e.clientY));
        st.sel.clear();
        for (const n of map.nodes) {
          if (!st.els.has(n.id)) continue;
          const s = size(n);
          if (n.x < b.x && n.x + s.w > a.x && n.y < b.y && n.y + s.h > a.y) st.sel.add(n.id);
        }
        st.primary = [...st.sel][0] || null;
        for (const [id, el] of st.els) el.classList.toggle('selected', st.sel.has(id));
      }
    }

    function onDragStart(e) {
      // glisser depuis l'icône de note déplace le nœud, comme ailleurs sur le nœud
      if (gesture.type === 'tap-note' || gesture.type === 'tap-ref') Object.assign(gesture, { type: 'node', shift: false, alt: e.altKey, pointerType: e.pointerType });
      if ((gesture.type === 'node' || gesture.type === 'connect') && ro()) {
        // lecture seule : on ne déplace pas le nœud, on fait glisser la carte
        Object.assign(gesture, { type: 'pan', view: { ...st.view } });
        canvas.classList.add('is-panning');
        return;
      }
      if (gesture.type === 'node') {
        if (st.masked || st.linking) { gesture.type = 'none'; return; }
        const id = gesture.nodeId;
        if (!st.sel.has(id)) { st.sel = new Set([id]); st.primary = id; st.selEdge = null; render(); renderPane(); }
        st.undo.push(snapshot()); st.redo = []; st.coalesce = null;
        const moving = new Set();
        for (const s of st.sel) { moving.add(s); if (!gesture.alt) for (const d of S.descendants(map, s)) moving.add(d); }
        gesture.moving = [...moving].filter((i) => st.els.has(i) || S.node(map, i));
        gesture.last = { x: e.clientX, y: e.clientY };
        for (const i of gesture.moving) { const el = st.els.get(i); if (el) el.classList.add('dragging'); }
        canvas.classList.add('is-dragging');
        positionCtx();
      } else if (gesture.type === 'pan') {
        canvas.classList.add('is-panning');
      }
    }

    let panRaf = null;
    function autoPan(e) {
      const r = canvas.getBoundingClientRect();
      const m = 40;
      let vx = 0, vy = 0;
      if (e.clientX < r.left + m) vx = 10; else if (e.clientX > r.right - m) vx = -10;
      if (e.clientY < r.top + m) vy = 10; else if (e.clientY > r.bottom - m) vy = -10;
      cancelAnimationFrame(panRaf);
      if (!vx && !vy) return;
      const step = () => {
        if (!gesture || !gesture.moved) return;
        st.view.x += vx; st.view.y += vy;
        if (gesture.type === 'node') {
          for (const id of gesture.moving) {
            const n = S.node(map, id); n.x -= vx / st.view.k; n.y -= vy / st.view.k;
            const el = st.els.get(id); if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
          }
          renderEdges();
        }
        applyView();
        panRaf = requestAnimationFrame(step);
      };
      panRaf = requestAnimationFrame(step);
    }

    function onUp(e) {
      clearTimeout(longPress);
      cancelAnimationFrame(panRaf);
      const g = gesture;
      pointers.delete(e.pointerId);
      if (g && g.type === 'pinch') {
        if (pointers.size < 2) { gesture = null; canvas.classList.remove('is-panning'); }
        return;
      }
      if (!g || g.id !== e.pointerId) return;
      gesture = null;
      canvas.classList.remove('is-dragging', 'is-panning');

      if (g.type === 'pan') {
        if (!g.moved) onTapBackground(e);
        else {
          // conservation du momentum : la carte continue sur sa lancée puis ralentit
          const v = panVel.get();
          flingStop = motion.decay({
            velocity: v, rate: 0.994,
            onUpdate: (dx, dy) => { st.view.x += dx; st.view.y += dy; applyView(); },
            onDone: () => { flingStop = null; },
          });
        }
      } else if (g.type === 'node') {
        if (g.moved) {
          // dépôt : le nœud redescend avec un ressort amorti (transition CSS --ease-settle)
          for (const i of g.moving) { const el = st.els.get(i); if (el) el.classList.remove('dragging'); }
          // dépôt sur un autre nœud ? (Maj) → rattacher
          for (const id of g.moving) { const n = S.node(map, id); n.x = Math.round(n.x); n.y = Math.round(n.y); }
          S.touchMap(map, 'edit');
          updateHistoryBtns();
          render();
        } else onTapNode(g.nodeId, e, g);
      } else if (g.type === 'connect') {
        if (ro()) { onTapNode(g.from, e, { shift: false }); return; }
        tempEdge.setAttribute('d', '');
        for (const el of st.els.values()) el.classList.remove('drop-target');
        if (!g.moved) addChild(g.from);
        else if (g.over && g.over !== g.from) connect(g.from, g.over);
        else {
          const p = toWorld(e.clientX, e.clientY);
          const from = S.node(map, g.from);
          addChild(g.from, { at: { x: Math.round(p.x - (p.x < from.x ? 140 : 0)), y: Math.round(p.y - 20) } });
        }
      } else if (g.type === 'tap-collapse') {
        toggleCollapse(g.nodeId);
      } else if (g.type === 'tap-ref') {
        const ref = refTarget(S.node(map, g.nodeId) || {});
        if (ref && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 10) { flushEdit(); R.app.go(ref.href); }
      } else if (g.type === 'tap-note') {
        clearTimeout(st.noteTimer);
        if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 10) openNote(g.nodeId);
      } else if (g.type === 'edge') {
        if (st.linking || st.masked || ro()) return;
        selectEdge(g.edgeId);
      } else if (g.type === 'logic') {
        if (st.linking || st.masked || ro()) return;
        const p = S.node(map, g.from);
        if (p) { select(p.id); logicMenu(g.anchor, p); }
      } else if (g.type === 'marquee') {
        marquee.hidden = true;
        render(); renderPane();
      }
    }
    function onCancel(e) {
      clearTimeout(longPress);
      pointers.delete(e.pointerId);
      if (gesture && gesture.type === 'node' && gesture.moved) {
        for (const i of gesture.moving) { const el = st.els.get(i); if (el) el.classList.remove('dragging'); }
        S.touchMap(map, 'edit');
      }
      tempEdge.setAttribute('d', '');
      marquee.hidden = true;
      if (pointers.size === 0) gesture = null;
      canvas.classList.remove('is-dragging', 'is-panning');
      render();
    }

    function startPinch() {
      clearTimeout(longPress);
      if (gesture && gesture.type === 'node' && gesture.moved) {
        for (const i of gesture.moving) { const el = st.els.get(i); if (el) el.classList.remove('dragging'); }
        S.touchMap(map, 'edit');
      }
      tempEdge.setAttribute('d', '');
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...st.view }, moved: true };
      canvas.classList.add('is-panning');
    }
    function updatePinch() {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture;
      const r = canvas.getBoundingClientRect();
      const k = U.clamp(g.view.k * (d / g.d0), MIN_K, MAX_K);
      const wx = (g.c0.x - r.left - g.view.x) / g.view.k, wy = (g.c0.y - r.top - g.view.y) / g.view.k;
      st.view.k = k;
      st.view.x = c.x - r.left - wx * k;
      st.view.y = c.y - r.top - wy * k;
      applyView();
    }

    function onWheel(e) {
      e.preventDefault();
      if (camStop) { camStop(); camStop = null; }
      if (flingStop) { flingStop(); flingStop = null; }
      const isMouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) && !e.shiftKey);
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey && !isMouseWheel ? 0.01 : 0.0018)));
      } else {
        st.view.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        st.view.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        applyView();
      }
    }

    function onTapNode(id, e, g) {
      const now = Date.now();
      const dbl = st.lastTap && st.lastTap.id === id && now - st.lastTap.t < 350;
      st.lastTap = { id, t: now };
      if (st.masked) { reveal(id); return; }
      if (st.linking) { togglePick(id); return; }
      if (g.shift) { select(id, { toggle: true }); return; }
      clearTimeout(st.noteTimer);
      if (dbl) { st.lastTap = null; select(id); if (ro()) openNote(id); else startEdit(id); return; }
      // 2e toucher sur le nœud déjà sélectionné → sa note (après la fenêtre du double-toucher)
      const again = st.sel.size === 1 && st.sel.has(id) && !st.selEdge;
      select(id);
      if (again) st.noteTimer = setTimeout(() => { if (!st.destroyed && !st.editing && st.sel.has(id)) openNote(id); }, 360);
    }
    function onTapBackground(e) {
      const now = Date.now();
      const dbl = st.lastTap && st.lastTap.id === '__bg' && now - st.lastTap.t < 350 && Math.hypot(e.clientX - st.lastTap.x, e.clientY - st.lastTap.y) < 30;
      st.lastTap = { id: '__bg', t: now, x: e.clientX, y: e.clientY };
      if (st.linking) return; // en sélection multiple, un toucher dans le vide n'annule pas
      if (dbl && !st.masked && !ro()) {
        st.lastTap = null;
        const p = toWorld(e.clientX, e.clientY);
        addFree({ x: Math.round(p.x - 60), y: Math.round(p.y - 20) }, map.nodes.length ? 'idee' : 'notion');
        return;
      }
      if (st.sel.size || st.selEdge) select(null);
    }
    function onContext(e) {
      e.preventDefault();
      const id = hitNode(e.target);
      if (id) {
        if (!st.sel.has(id)) select(id);
        const anchor = h('span', { style: { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '1px', height: '1px' } });
        document.body.appendChild(anchor);
        nodeMenu(anchor, S.node(map, id));
        setTimeout(() => anchor.remove(), 300);
      } else if (e.pointerType === 'mouse' || !e.pointerType) {
        const p = toWorld(e.clientX, e.clientY);
        const anchor = h('span', { style: { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '1px', height: '1px' } });
        document.body.appendChild(anchor);
        ui.menu(anchor, [
          ro() ? null : { label: 'Nouveau nœud ici', icon: 'plus', onClick: () => addFree({ x: p.x - 60, y: p.y - 20 }) },
          ro() ? null : { label: 'Ranger la carte', icon: 'tidy', hint: 'R', onClick: tidy },
          { label: 'Ajuster à l’écran', icon: 'fit', hint: 'F', onClick: () => fit() },
          { label: st.masked ? 'Quitter le mode masqué' : 'Mode masqué', icon: 'eyeOff', hint: 'H', onClick: toggleMask },
          ro() ? { divider: true } : null,
          ro() ? { label: 'Autoriser les modifications', icon: 'lockOpen', onClick: () => S.setReadOnly(map.id, false) } : null,
        ].filter(Boolean), { align: 'start' });
        setTimeout(() => anchor.remove(), 300);
      }
    }

    /* ------------------------------------------------------------------ */
    /* Clavier                                                            */
    /* ------------------------------------------------------------------ */
    function onKey(e) {
      if (st.destroyed || U.$('.dialog') || U.$('.menu.in') || U.$('.search')) return;
      if (U.isTyping()) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k.startsWith('Arrow') || k === 'Tab' || k === 'Enter') canvas.classList.add('kbd');
      if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (ro()) return; e.shiftKey ? redo() : undo(); return; }
      if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k.toLowerCase() === 'a' && st.mode === 'map') { e.preventDefault(); st.sel = new Set([...st.els.keys()]); st.primary = [...st.sel][0] || null; render(); renderPane(); return; }
      if (e.altKey && !mod && /^Digit[1-4]$/.test(e.code) && st.mode === 'map' && !st.masked && primaryNode()) {
        // Alt 1–4 : Chapitre, Section, Sous-section, Leçon (les chiffres seuls restent aux 9 types historiques)
        e.preventDefault();
        setType(st.sel.size ? [...st.sel] : [primaryNode().id], S.STRUCT_ORDER[+e.code.slice(5) - 1]);
        return;
      }
      if (mod || e.altKey) return;
      const a = document.activeElement;
      const inCanvas = !a || a === document.body || a.id === 'view' || a === canvas || canvas.contains(a);
      if (!inCanvas && (k === 'Tab' || k === 'Enter' || k === ' ' || k.startsWith('Arrow'))) return;
      if (k === 'p' || k === 'P') { e.preventDefault(); setMode(st.mode === 'map' ? 'plan' : 'map'); return; }
      if (st.mode !== 'map') return;
      if (st.linking && k === 'Enter') { e.preventDefault(); finishLinking(); return; }
      if (k === 'Escape') {
        if (st.linking) stopLinking();
        else if (st.masked) toggleMask();
        else if (isPaneShown() && paneMode() !== 'docked') closePane();
        else select(null);
        return;
      }
      if (k === 'h' || k === 'H') { e.preventDefault(); toggleMask(); return; }
      if (k === 'f' || k === 'F') { e.preventDefault(); fit(); return; }
      if (k === 'r' || k === 'R') { e.preventDefault(); tidy(); return; }
      if (k === '+' || k === '=') { e.preventDefault(); zoomTo(st.view.k * 1.25); return; }
      if (k === '-' || k === '_') { e.preventDefault(); zoomTo(st.view.k / 1.25); return; }
      if (k === '0') { e.preventDefault(); zoomTo(1); return; }
      if (st.masked) return;
      const n = primaryNode();
      if (st.selEdge && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); deleteEdge(st.selEdge); return; }
      if (!n) {
        if (k === 'Tab' || k === 'Enter' || k.startsWith('Arrow')) {
          e.preventDefault();
          const r = S.roots(map)[0];
          if (r) { select(r.id); ensureVisible(r.id); }
        }
        return;
      }
      // lecture seule : Entrée / Espace lisent la note ; les touches d'édition sont refusées (gardes)
      if (ro() && (k === 'Enter' || k === ' ')) { e.preventDefault(); openPane(false); return; }
      if (k === 'Tab') { e.preventDefault(); if (e.shiftKey) { const p = S.parentOf(map, n.id); if (p) addSibling(p.id); } else addChild(n.id); return; }
      if (k === 'Enter') { e.preventDefault(); addSibling(n.id); return; }
      if (k === 'F2') { e.preventDefault(); startEdit(n.id); return; }
      if (k === ' ') { e.preventDefault(); openPane(true); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteNodes(st.sel.size ? st.sel : [n.id]); return; }
      if (k === 'l' || k === 'L') { e.preventDefault(); startLinking(n.id); return; }
      if (k === '.') { e.preventDefault(); toggleCollapse(n.id); return; }
      if (/^[1-9]$/.test(k)) { e.preventDefault(); setType(st.sel.size ? [...st.sel] : [n.id], S.TYPE_ORDER[+k - 1]); return; }
      if (k.startsWith('Arrow')) { e.preventDefault(); navigate(n, k); return; }
    }
    document.addEventListener('keydown', onKey);

    function navigate(n, key) {
      const s = size(n);
      const cx = n.x + s.w / 2, cy = n.y + s.h / 2;
      // hiérarchique d'abord (←/→), spatial ensuite
      if (key === 'ArrowLeft') { const p = S.parentOf(map, n.id); if (p && p.x < n.x) { select(p.id); ensureVisible(p.id); return; } }
      if (key === 'ArrowRight' && !n.collapsed) {
        const ch = S.childrenOf(map, n.id);
        if (ch.length && ch[0].x > n.x) {
          const best = ch.reduce((a, b) => (Math.abs(b.y - n.y) < Math.abs(a.y - n.y) ? b : a));
          select(best.id); ensureVisible(best.id); return;
        }
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
      let best = null, bestScore = Infinity;
      for (const o of map.nodes) {
        if (o.id === n.id || !st.els.has(o.id)) continue;
        const os = size(o);
        const dx = o.x + os.w / 2 - cx, dy = o.y + os.h / 2 - cy;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 4) continue;
        const across = Math.abs(dx * dir[1] + dy * dir[0]);
        const score = along + across * 2.5;
        if (score < bestScore) { bestScore = score; best = o; }
      }
      if (best) { select(best.id); ensureVisible(best.id); }
    }

    /* ------------------------------------------------------------------ */
    /* Panneau de note (inspecteur)                                       */
    /* ------------------------------------------------------------------ */
    function paneMode() {
      const w = window.innerWidth;
      return w >= 1200 ? 'docked' : w >= 600 ? 'side' : 'bottom';
    }
    function isPaneShown() {
      const m = paneMode();
      return m === 'docked' ? S.data.settings.paneOpen : st.paneOpen;
    }
    function applyPaneState(animate = true) {
      const m = paneMode();
      page.dataset.pane = m;
      const shown = isPaneShown() && st.mode === 'map';
      pane.classList.toggle('open', shown);
      page.classList.toggle('pane-open', shown);
      paneBtn.setAttribute('aria-pressed', String(shown));
      if (m === 'bottom') {
        pane.dataset.sheet = shown ? (st.sheet === 'closed' ? 'half' : st.sheet) : 'closed';
      } else pane.dataset.sheet = '';
      pane.style.transform = '';
      if (!animate) { pane.classList.add('no-anim'); requestAnimationFrame(() => pane.classList.remove('no-anim')); }
      positionCtx();
    }
    function openPane(focusNote) {
      const m = paneMode();
      const wasShown = isPaneShown();
      if (m === 'docked') { S.data.settings.paneOpen = true; S.save(); }
      else { st.paneOpen = true; if (m === 'bottom' && st.sheet === 'closed') st.sheet = 'half'; }
      if (m === 'docked' && closeAnim) {
        // interruption : la fermeture repart en arrière depuis sa position actuelle (aucun saut)
        closeAnim.reverse();
        closeAnim.reversing = true;
      }
      applyPaneState();
      if (m === 'docked' && !wasShown && !closeAnim && !motion.reduced()) {
        // la colonne s'ouvre d'un coup (layout), son contenu glisse : 240 ms ease-out
        paneInner.animate([{ translate: '24px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: motion.dur.md, easing: motion.css.out });
      }
      renderPane(true);
      const n = primaryNode();
      if (n) setTimeout(() => ensureVisible(n.id), 320);
      if (focusNote && !ro()) {
        st.noteTab = 'write';
        renderPane(true);
        setTimeout(() => { const ta = pane.querySelector('.note-input'); if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } }, m === 'docked' ? 50 : 360);
      }
    }
    /** Ouvrir la note d'un nœud : Aperçu si elle existe (sans clavier), Écrire si elle est vide */
    function openNote(id) {
      const n = S.node(map, id);
      if (!n) return;
      if (!(st.sel.size === 1 && st.sel.has(id))) select(id);
      const empty = !n.note.trim();
      st.noteTab = empty && !ro() ? 'write' : 'read';
      openPane(empty && !ro());
      requestAnimationFrame(() => {
        const sec = pane.querySelector('.pane-note');
        if (!sec) return;
        const top = sec.getBoundingClientRect().top - paneInner.getBoundingClientRect().top - 8;
        paneInner.scrollTo({ top: paneInner.scrollTop + top, behavior: motion.reduced() ? 'auto' : 'smooth' });
      });
    }
    let closeAnim = null;
    function closePane() {
      const m = paneMode();
      if (document.activeElement && pane.contains(document.activeElement)) canvas.focus({ preventScroll: true });
      if (m === 'docked') {
        const apply = () => { S.data.settings.paneOpen = false; S.save(); applyPaneState(); };
        if (closeAnim) { if (closeAnim.reversing) { closeAnim.reverse(); closeAnim.reversing = false; } return; }
        if (motion.reduced() || !isPaneShown()) { apply(); return; }
        // sortie : 160 ms ease-in, puis la colonne se referme
        const a = paneInner.animate([{ translate: '0 0', opacity: 1 }, { translate: '32px 0', opacity: 0 }], { duration: motion.dur.sm, easing: motion.css.in });
        closeAnim = a;
        a.onfinish = () => { const reopened = a.reversing; closeAnim = null; if (!reopened) apply(); };
        return;
      }
      st.paneOpen = false; st.sheet = 'closed';
      applyPaneState();
    }
    function closePaneIfOverlay() { if (paneMode() !== 'docked' && st.paneOpen) closePane(); }
    function togglePane() {
      if (closeAnim) { closeAnim.reversing ? closePane() : openPane(false); return; }
      isPaneShown() ? closePane() : openPane(false);
    }

    function renderPane(force) {
      const n = primaryNode();
      const key = n ? n.id : st.selEdge ? 'e:' + st.selEdge : st.sel.size > 1 ? 'multi' : null;
      if (!force && key === st.paneFor) return;
      const changed = st.paneFor !== key;
      if (changed) st.noteTab = null;
      st.paneFor = key;
      const active = document.activeElement;
      if (active && pane.contains(active) && !force) return;
      const scroll = paneInner.scrollTop;
      U.clear(paneInner);
      // la cascade ne se joue qu'en changeant de nœud ; une mise à jour sur place reste immobile
      paneInner.classList.remove('swap');
      if (changed) { void paneInner.offsetWidth; paneInner.classList.add('swap'); }
      else requestAnimationFrame(() => { paneInner.scrollTop = scroll; });
      if (!n) { paneInner.appendChild(paneSummary()); return; }
      paneInner.appendChild(paneNode(n));
    }

    /** Légende des couleurs : seulement les types présents dans la carte (option Couleurs) */
    function paneLegend() {
      if (R.colors.settings().mode === 'off') return null;
      const present = S.TYPE_ORDER.filter((t) => map.nodes.some((n) => n.type === t));
      const rows = present.map((t) => ({ t, sw: R.colors.swatch(t), n: map.nodes.filter((x) => x.type === t).length })).filter((r) => r.sw);
      if (!rows.length) return null;
      return h('section.pane-legend',
        h('div.pane-legend-head', h('p.overline', 'Légende'),
          ui.btn('Modifier', { icon: 'palette', variant: 'text', cls: 'btn-sm', onClick: () => R.colors.openDialog() })),
        h('ul.legend-list', rows.map((r) => h('li.legend-item',
          h('span.legend-dot', { style: { background: r.sw.bg, borderColor: r.sw.line } }),
          h('span.legend-l', S.TYPES[r.t].label), h('span.legend-n', String(r.n))))));
    }

    /** Sommaire : les chapitres, leçons et sections de la carte, dans l'ordre du plan */
    function paneToc() {
      if (!map.nodes.some((n) => S.isStruct(n.type))) return null;
      const nums = S.structNumbers(map);
      const rows = [];
      const seen = new Set();
      const walk = (n, depth) => {
        if (seen.has(n.id)) return;
        seen.add(n.id);
        const struct = S.isStruct(n.type);
        if (struct) {
          const bs = S.branchStats(map, n.id);
          rows.push(h('li', { style: { '--d': depth } },
            h('button.toc-item', { type: 'button', class: 'rank-' + S.TYPES[n.type].rank, onclick: () => {
              if (S.hiddenSet(map).has(n.id)) isolate(n); else { select(n.id); centerOn(n.id); }
            } },
              h('span.toc-k', S.kickerOf(map, n, nums)),
              h('span.toc-t', n.title || 'Sans titre'),
              bs.reviewable ? h('span.toc-p', { title: 'Maîtrise de la branche' }, Math.round(bs.progress * 100) + ' %') : null)));
        }
        for (const c of S.childrenOf(map, n.id)) walk(c, depth + (struct ? 1 : 0));
      };
      for (const r of S.roots(map)) walk(r, 0);
      return rows.length ? h('section.pane-toc', h('p.overline', 'Sommaire'), h('ol.toc-list', rows)) : null;
    }

    function paneHeader(titleText, extra) {
      return h('div.pane-head',
        h('span.pane-overline', titleText),
        h('div.pane-head-actions', extra || null, ui.iconBtn('close', { title: 'Fermer le panneau', onClick: closePane })));
    }

    function paneSummary() {
      const ms = S.mapStats(map);
      const c = course();
      return h('div.pane-body',
        paneHeader('Carte'),
        h('h2.pane-map-title', map.title),
        c ? h('a.pane-course', { href: '#/cours/' + c.id }, R.icon('folder', 16), c.title) : null,
        h('div.pane-stats',
          h('div.stat', h('span.stat-n', String(ms.nodes)), h('span.stat-l', ms.nodes > 1 ? 'nœuds' : 'nœud')),
          h('div.stat', h('span.stat-n', String(ms.reviewable)), h('span.stat-l', 'à réviser')),
          h('div.stat', h('span.stat-n', Math.round(ms.progress * 100) + ' %'), h('span.stat-l', 'maîtrise'))),
        ui.progress(ms.progress),
        ms.reviewable ? ui.btn('Réviser cette carte', { icon: 'cards', variant: 'tonal', cls: 'pane-cta', onClick: () => R.app.go('#/reviser/carte/' + map.id) }) : null,
        paneToc(),
        paneLegend(),
        h('div.pane-help',
          h('p.overline', 'Pour bien démarrer'),
          h('ul.help-list',
            h('li', h('b', 'Sélectionne'), ' un nœud pour écrire sa note.'),
            h('li', h('kbd', 'Tab'), ' ou ', h('b', '+'), ' pour décomposer, ', h('kbd', 'Entrée'), ' pour un frère.'),
            h('li', h('b', 'Glisse la poignée +'), ' vers un autre nœud pour les relier.'),
            h('li', h('b', 'Double-clic'), ' dans le vide : nouveau nœud libre.'),
            h('li', h('kbd', 'H'), ' : mode masqué pour te tester.'))));
    }

    function paneNode(n) {
      const T = S.TYPES[n.type];
      const anc = S.ancestors(map, n.id);
      const kids = S.childrenOf(map, n.id);

      // titre
      const locked = ro();
      const titleIn = h('textarea.pane-title-input', { rows: 1, placeholder: placeholderFor(n), 'aria-label': 'Titre du nœud', spellcheck: 'true', readOnly: locked });
      titleIn.value = n.title;
      const autosize = () => { titleIn.style.height = 'auto'; titleIn.style.height = titleIn.scrollHeight + 'px'; };
      titleIn.addEventListener('input', () => {
        const v = titleIn.value.replace(/\n/g, ' ');
        if (v !== titleIn.value) titleIn.value = v;
        autosize();
        mutate(() => { n.title = v; }, { coalesce: 'title:' + n.id, pane: false });
      });
      titleIn.addEventListener('blur', () => { if (n.title !== n.title.trim()) { n.title = n.title.trim(); S.touchMap(map, 'edit'); render(); } });
      titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); noteIn.focus(); } if (e.key === 'Escape') { e.stopPropagation(); titleIn.blur(); canvas.focus(); } });
      requestAnimationFrame(autosize);

      // fil d'ariane
      const crumbs = anc.length ? h('nav.pane-crumbs', { 'aria-label': 'Ascendance' }, anc.map((a, i) => [
        i ? R.icon('chevronRight', 14) : null,
        h('button.pane-crumb', { type: 'button', onclick: () => { select(a.id); ensureVisible(a.id); } }, a.title || 'Sans titre'),
      ])) : null;

      // type & logique
      const typeChip = h('button.chip.chip-filter', { type: 'button', 'aria-label': 'Type : ' + T.label, disabled: locked }, h('span', T.label), locked ? null : R.icon('chevronDown', 16));
      typeChip.addEventListener('click', () => typeMenu(typeChip, [n.id]));
      const logicSeg = h('div.segmented.seg-xs', { role: 'radiogroup', 'aria-label': 'Logique des éléments rattachés' },
        [[null, '—', 'Sans précision'], ['et', 'ET', 'Cumulatifs'], ['ou', 'OU', 'Alternatifs']].map(([v, l, t]) => {
          const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(n.logic === v), 'data-tip': t, disabled: locked }, l);
          b.addEventListener('click', () => setLogic(n.id, v));
          return b;
        }));
      ui.segIndicator(logicSeg, 'logic:' + n.id);

      // note
      const hasNote = !!n.note.trim();
      const tab = locked ? 'read' : st.noteTab || (hasNote ? 'read' : 'write');
      const noteIn = h('textarea.note-input', {
        placeholder: 'Écris ta note… (Markdown : **gras**, *italique*, ==surligné==, - liste, > citation, [[autre nœud]])',
        'aria-label': 'Note', spellcheck: 'true',
      });
      noteIn.value = n.note;
      // la rubrique « Sources » suit la note pendant l'écriture (sans reconstruire le panneau)
      const srcSlot = h('div.src-slot', sourcesSec(n, noteIn));
      const refreshSources = U.debounce(() => { if (srcSlot.isConnected) { U.clear(srcSlot); const sec = sourcesSec(n, noteIn); if (sec) srcSlot.appendChild(sec); } }, 300);
      noteIn.addEventListener('input', () => {
        mutate(() => { n.note = noteIn.value; }, { coalesce: 'note:' + n.id, pane: false });
        refreshSources();
      });
      noteIn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); noteIn.blur(); canvas.focus({ preventScroll: true }); }
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSel(noteIn, '**', '**'); }
        if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSel(noteIn, '*', '*'); }
        if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); wrapSel(noteIn, '==', '=='); }
        if (e.key === 'Enter' && !e.shiftKey) continueList(e, noteIn);
        if (e.key === 'Tab') { e.preventDefault(); indentLine(noteIn, e.shiftKey); }
      });
      const preview = h('div.note-preview.md');
      const paintPreview = () => {
        preview.innerHTML = n.note.trim() ? R.md.render(n.note) : `<p class="muted">${locked ? 'Aucune note.' : 'Aucune note pour l’instant. Passe en mode Écrire.'}</p>`;
        // toucher un tableau le rouvre dans la grille (les liens qu'il contient restent cliquables)
        if (!locked) for (const t of U.$$('.md-table[data-table]', preview)) {
          t.title = 'Toucher pour modifier le tableau';
          t.addEventListener('click', (ev) => { if (!ev.target.closest('a')) editTable(n, noteIn, +t.dataset.table); });
        }
        for (const a of U.$$('.md-wiki', preview)) {
          const target = map.nodes.find((x) => U.norm(x.title) === U.norm(a.dataset.wiki));
          if (!target) { a.classList.add('missing'); a.title = 'Aucun nœud de ce nom dans la carte'; }
          a.addEventListener('click', (ev) => { ev.preventDefault(); if (target) { select(target.id); centerOn(target.id); } });
        }
      };
      const fmt = h('div.note-fmt', { role: 'toolbar', 'aria-label': 'Mise en forme' },
        fmtBtn('bold', 'Gras (Ctrl B)', () => wrapSel(noteIn, '**', '**')),
        fmtBtn('italic', 'Italique (Ctrl I)', () => wrapSel(noteIn, '*', '*')),
        fmtBtn('highlight', 'Surligner (Ctrl E)', () => wrapSel(noteIn, '==', '==')),
        fmtBtn('heading', 'Intertitre', () => prefixLine(noteIn, '## ')),
        fmtBtn('bullet', 'Liste', () => prefixLine(noteIn, '- ')),
        fmtBtn('quote', 'Citation (texte de loi)', () => prefixLine(noteIn, '> ')),
        fmtBtn('link', 'Lien vers un nœud [[…]]', () => wrapSel(noteIn, '[[', ']]')),
        fmtBtn('table', 'Tableau', () => tableAtCaret(n, noteIn)),
        fmtBtn('globe', 'Source (lien web)', () => addSource(n, noteIn, true)));
      const noteTabs = h('div.segmented.seg-sm', { role: 'tablist' },
        noteTabBtn('write', 'Écrire', 'edit'), noteTabBtn('read', 'Aperçu', 'eye'));
      ui.segIndicator(noteTabs, 'note-tab');
      const writeBody = h('div.note-write', fmt, noteIn);
      /* Écrire ↔ Aperçu : bascule sur place (fondu 160 ms), l'indicateur glisse */
      const switchTab = (v, focus) => {
        if (st.noteTab === v && noteBody.isConnected) return;
        st.noteTab = v;
        U.$$('.seg-btn', noteTabs).forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === v)));
        noteTabs._place();
        if (v === 'read') paintPreview();
        const next = v === 'read' ? preview : writeBody;
        noteBody.replaceWith(next);
        noteBody = next;
        next.classList.remove('note-swap'); void next.offsetWidth; next.classList.add('note-swap');
        if (focus && v === 'write') noteIn.focus();
      };
      function noteTabBtn(v, l, ic) {
        const b = h('button.seg-btn', { type: 'button', role: 'tab', 'aria-selected': String(tab === v), dataset: { tab: v } }, R.icon(ic, 16), h('span', l));
        b.addEventListener('click', () => switchTab(v, true));
        return b;
      }
      let noteBody;
      if (!locked) preview.addEventListener('dblclick', () => switchTab('write', true));
      if (tab === 'read') { paintPreview(); noteBody = preview; }
      else noteBody = writeBody;

      // décomposition
      const addIn = h('input.decomp-input', { type: 'text', placeholder: kids.length ? 'Ajouter un élément…' : 'Décomposer : ajouter un élément…', 'aria-label': 'Ajouter un élément rattaché' });
      addIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && addIn.value.trim()) {
          e.preventDefault();
          const t = addIn.value.trim();
          addChild(n.id, { title: t, edit: false });
          select(n.id);
          st.noteTab = tab;
          renderPane(true);
          setTimeout(() => { const i = pane.querySelector('.decomp-input'); if (i) i.focus(); }, 20);
        }
        if (e.key === 'Escape') { e.stopPropagation(); addIn.blur(); }
      });
      const struct = S.isStruct(n.type);
      const nums = S.structNumbers(map);
      const decomp = h('section.pane-sec',
        h('div.pane-sec-head', h('h3.pane-sec-title', struct ? 'Plan' : 'Décomposition'), kids.length > 1 && !struct ? logicSeg : null),
        kids.length ? h('ol.decomp-list', kids.map((c) => h('li',
          h('button.decomp-item', { type: 'button', onclick: () => { select(c.id); ensureVisible(c.id); } },
            n.logic ? h('span.decomp-logic', n.logic === 'et' ? 'ET' : 'OU') : null,
            S.TYPES[c.type].kicker ? h('span.decomp-kicker', S.kickerOf(map, c, nums)) : null,
            h('span.decomp-t', c.title || 'Sans titre'),
            c.note.trim() ? R.icon('note', 14) : null)))) : null,
        locked ? null : h('label.decomp-add', R.icon('plus', 18), addIn));

      // liens
      const links = map.edges.filter((e) => e.kind === 'link' && (e.from === n.id || e.to === n.id));
      const linksSec = links.length ? h('section.pane-sec',
        h('h3.pane-sec-title', 'Renvois'),
        h('ul.link-list', links.map((e) => {
          const other = S.node(map, e.from === n.id ? e.to : e.from);
          return h('li', h('button.link-item', { type: 'button', onclick: () => { select(other.id); centerOn(other.id); } },
            h('span.link-dir', e.from === n.id ? '→' : '←'),
            e.label ? h('span.link-label', e.label) : null,
            h('span', other.title || 'Sans titre')),
          locked ? null : ui.iconBtn('close', { title: 'Supprimer le renvoi', cls: 'icon-btn-sm', onClick: () => deleteEdge(e.id) }));
        }))) : null;

      // révision
      const r = n.review;
      // carte avec exercices : le nœud se révise par les questions qui le couvrent
      const exs = map.exercises && map.exercises.length ? S.exercisesFor(map, n.id) : null;
      const reviewable = exs ? exs.length > 0 : S.isReviewable(map, n);
      const exLine = exs && exs.length ? `${U.plural(exs.length, 'exercice')} · ` : '';
      const revSec = h('section.pane-sec.pane-review',
        h('h3.pane-sec-title', 'Révision'),
        h('p.pane-review-line', ui.mastery(r.rating, 12),
          reviewable
            ? exLine + (r.rating ? `${S.RATINGS[r.rating].label} · ${r.due > Date.now() ? 'prochaine révision ' + dueLabel(r.due) : 'à réviser maintenant'}` : (exs ? 'jamais faits' : 'Jamais révisé — sera proposé en révision'))
            : exs ? 'Aucun exercice ne porte sur ce nœud.' : 'Ajoute une note ou des éléments rattachés pour en faire une carte de révision.'));

      const typeRow = h('div.pane-type-row', typeChip,
        kids.length <= 1 && !struct ? h('span.pane-hint', n.logic ? (n.logic === 'et' ? 'Cumulatifs (ET)' : 'Alternatifs (OU)') : '') : null);

      // structure : bilan de toute la branche + raccourcis (réviser, isoler)
      let branchSec = null;
      if (struct) {
        const bs = S.branchStats(map, n.id);
        const acts = structMenuItems(n);
        branchSec = h('section.pane-sec.pane-branch',
          h('div.pane-stats',
            h('div.stat', h('span.stat-n', String(bs.nodes)), h('span.stat-l', bs.nodes > 1 ? 'éléments' : 'élément')),
            h('div.stat', h('span.stat-n', String(bs.due)), h('span.stat-l', 'à réviser')),
            h('div.stat', h('span.stat-n', Math.round(bs.progress * 100) + ' %'), h('span.stat-l', 'maîtrise'))),
          ui.progress(bs.progress),
          acts.length ? h('div.pane-branch-actions', acts.map((a, i) => ui.btn(a.label, { icon: a.icon, variant: i ? 'text' : 'tonal', onClick: a.onClick }))) : null);
      }

      const ref = refTarget(n);
      return h('div.pane-body',
        paneHeader(struct ? S.kickerOf(map, n, nums) : T.label, ui.iconBtn('target', { title: 'Centrer sur la carte', onClick: () => centerOn(n.id) })),
        crumbs,
        titleIn,
        ref ? ui.btn(ref.label, { icon: 'chevronRight', variant: 'tonal', cls: 'pane-cta pane-ref', onClick: () => { flushEdit(); R.app.go(ref.href); } }) : null,
        typeRow,
        branchSec,
        h('section.pane-sec.pane-note',
          h('div.pane-sec-head', h('h3.pane-sec-title', 'Note'), locked ? h('span.pane-ro', R.icon('lock', 14), 'Lecture seule') : noteTabs),
          noteBody),
        srcSlot,
        decomp,
        linksSec,
        revSec);
    }
    function fmtBtn(icon, tip, act) {
      const b = h('button.fmt-btn', { type: 'button', 'aria-label': tip, 'data-tip': tip }, R.icon(icon, 18));
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', act);
      return b;
    }
    function dueLabel(t) {
      const d = Math.round((U.startOfDay(t) - U.startOfDay()) / U.DAY);
      return d <= 0 ? "aujourd'hui" : d === 1 ? 'demain' : `dans ${d} j`;
    }
    function fireInput(ta) { ta.dispatchEvent(new Event('input')); }

    /* ---- Tableaux & sources : on écrit dans la note (Markdown), via le champ de note
       pour garder un seul chemin d'écriture (annuler, sauvegarde, aperçu). ---- */
    /** Remplace la note et rafraîchit le panneau (aperçu compris) */
    function setNote(n, ta, value, caret) {
      ta.value = value;
      fireInput(ta);
      if (st.noteTab === 'write' && ta.isConnected) {
        ta.focus({ preventScroll: true });
        if (caret != null) ta.setSelectionRange(caret, caret);
      } else renderPane(true);
    }
    /** Le curseur est-il dans un tableau ? → le modifier ; sinon en créer un au curseur */
    function tableAtCaret(n, ta) {
      const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
      const i = R.md.tables(ta.value).findIndex((t) => line >= t.start && line < t.end);
      editTable(n, ta, i >= 0 ? i : null);
    }
    async function editTable(n, ta, idx) {
      const list = R.md.tables(n.note);
      const t = idx != null ? list[idx] : null;
      const caret = ta.isConnected && st.noteTab === 'write' ? ta.selectionStart : n.note.length;
      const res = await ui.tableEditor(t ? { rows: t.rows, align: t.align, isNew: false } : {});
      if (!res || !S.node(map, n.id)) return;
      const v = n.note;
      if (t) {
        const lines = v.replace(/\r\n?/g, '\n').split('\n');
        const md = res.remove ? [] : R.md.tableToMd(res.rows, res.align).split('\n');
        lines.splice(t.start, t.end - t.start, ...md);
        setNote(n, ta, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
        ui.snack(res.remove ? 'Tableau supprimé' : 'Tableau mis à jour', { duration: 1600 });
        return;
      }
      // nouveau tableau : sur ses propres lignes, séparé du texte par une ligne vide
      const before = v.slice(0, caret), after = v.slice(caret);
      const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      const post = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
      const block = pre + R.md.tableToMd(res.rows, res.align) + post;
      setNote(n, ta, before + block + after, before.length + block.length);
    }
    /** Ajoute une source : titre + adresse → [titre](adresse) */
    async function addSource(n, ta, atCaret) {
      const inWrite = atCaret && ta.isConnected && st.noteTab === 'write';
      const s0 = inWrite ? ta.selectionStart : n.note.length, e0 = inWrite ? ta.selectionEnd : n.note.length;
      const picked = n.note.slice(s0, e0).trim();
      const v = await ui.form({
        title: 'Ajouter une source', icon: 'globe', ok: 'Ajouter',
        fields: [
          { key: 'url', label: 'Adresse', placeholder: 'https://www.legifrance.gouv.fr/…', required: true },
          { key: 'title', label: 'Titre (facultatif)', value: picked, placeholder: 'Ex. Cass. civ. 1re, 3 mai 2000' },
        ],
      });
      if (!v || !S.node(map, n.id)) return;
      let url = v.url.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
      let host;
      try { host = new URL(url).hostname; if (!host.includes('.')) throw new Error(); } catch (_) { ui.snack('Adresse invalide — vérifie le lien.'); return; }
      const title = (v.title.trim() || host.replace(/^www\./, '')).replace(/[[\]]/g, '');
      const link = `[${title}](${url.replace(/\)/g, '%29').replace(/\s/g, '%20')})`;
      const val = n.note;
      if (inWrite) {
        setNote(n, ta, val.slice(0, s0) + link + val.slice(e0), s0 + link.length);
      } else {
        const sep = !val.trim() ? '' : val.endsWith('\n') ? '' : '\n';
        setNote(n, ta, (val.trim() ? val : '') + sep + link);
      }
      ui.snack('Source ajoutée', { duration: 1600 });
    }
    /** Rubrique « Sources » : tous les liens web de la note, au même endroit */
    function sourcesSec(n, ta) {
      const list = R.md.links(n.note);
      if (!list.length) return null;
      return h('section.pane-sec.pane-sources',
        h('div.pane-sec-head', h('h3.pane-sec-title', 'Sources'),
          ui.btn('Ajouter', { icon: 'plus', variant: 'text', cls: 'btn-sm', onClick: () => addSource(n, ta, false) })),
        h('ul.src-list', list.map((l) => h('li', h('a.src-item', { href: l.url, target: '_blank', rel: 'noopener' },
          R.icon('globe', 18),
          h('span.src-body', h('span.src-t', l.title), h('span.src-h', l.host)),
          R.icon('external', 16))))));
    }
    function wrapSel(ta, a, b) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const v = ta.value;
      const sel = v.slice(s, e) || '';
      ta.value = v.slice(0, s) + a + sel + b + v.slice(e);
      ta.focus();
      ta.setSelectionRange(s + a.length, s + a.length + sel.length);
      fireInput(ta);
    }
    function prefixLine(ta, p) {
      const s = ta.selectionStart;
      const v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (v.slice(ls, ls + p.length) === p) ta.value = v.slice(0, ls) + v.slice(ls + p.length);
      else ta.value = v.slice(0, ls) + p + v.slice(ls);
      ta.focus();
      const np = s + (ta.value.length - v.length);
      ta.setSelectionRange(np, np);
      fireInput(ta);
    }
    function continueList(e, ta) {
      const s = ta.selectionStart;
      const v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const line = v.slice(ls, s);
      const m = line.match(/^(\s*)([-*•]|\d+[.)]|>)\s+(\[[ xX]\]\s+)?/);
      if (!m) return;
      e.preventDefault();
      if (line.trim() === m[0].trim()) { // ligne vide → fin de liste
        ta.value = v.slice(0, ls) + v.slice(s);
        ta.setSelectionRange(ls, ls);
      } else {
        let bullet = m[2];
        if (/\d/.test(bullet)) bullet = (parseInt(bullet, 10) + 1) + bullet.slice(-1);
        const ins = '\n' + m[1] + bullet + ' ' + (m[3] ? '[ ] ' : '');
        ta.value = v.slice(0, s) + ins + v.slice(ta.selectionEnd);
        ta.setSelectionRange(s + ins.length, s + ins.length);
      }
      fireInput(ta);
    }
    function indentLine(ta, out) {
      const s = ta.selectionStart;
      const v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (out) {
        const m = v.slice(ls).match(/^ {1,2}/);
        if (!m) return;
        ta.value = v.slice(0, ls) + v.slice(ls + m[0].length);
        ta.setSelectionRange(s - m[0].length, s - m[0].length);
      } else {
        ta.value = v.slice(0, ls) + '  ' + v.slice(ls);
        ta.setSelectionRange(s + 2, s + 2);
      }
      fireInput(ta);
    }

    /* Bottom sheet : glisser la poignée (mobile) */
    /* Bottom sheet : manipulation directe (Apple Fluid Interfaces)
       — suivi 1:1, butée nette au plein écran (ne décolle jamais du bas),
       — au relâchement, projection de la position avec la vitesse du doigt,
       — ressort vers le cran le plus proche (plein / mi-hauteur / fermé). */
    (function sheetDrag() {
      let startY = 0, y0 = 0, y = 0, dragging = false, moved = false, springStop = null;
      const vt = motion.velocity();
      const snaps = () => {
        const H = pane.offsetHeight;
        return { full: 0, half: Math.max(0, H - window.innerHeight * 0.52), closed: H };
      };
      const currentY = () => pane.getBoundingClientRect().top - (window.innerHeight - pane.offsetHeight);
      const onDownH = (e) => {
        if (paneMode() !== 'bottom') return;
        if (springStop) { springStop(); springStop = null; }
        dragging = true; moved = false;
        startY = e.clientY;
        y0 = y = currentY();
        vt.reset(); vt.add(0, e.clientY);
        pane.classList.add('no-anim');
        pane.style.transform = `translateY(${y}px)`;
        paneHandle.setPointerCapture(e.pointerId);
      };
      const onMoveH = (e) => {
        if (!dragging) return;
        const raw = y0 + e.clientY - startY;
        if (Math.abs(e.clientY - startY) > 4) moved = true;
        y = Math.max(0, raw); // butée nette en plein écran
        vt.add(0, e.clientY);
        pane.style.transform = `translateY(${y}px)`;
      };
      const onUpH = () => {
        if (!dragging) return;
        dragging = false;
        if (!moved) {
          // simple toucher : bascule mi-hauteur ↔ plein écran (transition CSS)
          pane.classList.remove('no-anim');
          pane.style.transform = '';
          st.sheet = st.sheet === 'full' ? 'half' : 'full';
          applyPaneState();
          return;
        }
        const v = vt.get().y; // px/ms
        const S2 = snaps();
        const projected = y + v * 99; // decelerationRate 0.99
        const v0 = y <= 0 && v < 0 ? 0 : v; // déjà en butée : pas d'élan vers le haut
        let target = 'full', best = Infinity;
        for (const [k, val] of Object.entries(S2)) { const d = Math.abs(projected - val); if (d < best) { best = d; target = k; } }
        springStop = motion.spring({
          from: y, to: S2[target], velocity: v0, ...motion.springs.drawer,
          onUpdate: (val) => { pane.style.transform = `translateY(${Math.max(0, val)}px)`; },
          onDone: () => {
            springStop = null;
            if (target === 'closed') { st.paneOpen = false; st.sheet = 'closed'; if (pane.contains(document.activeElement)) canvas.focus({ preventScroll: true }); }
            else st.sheet = target;
            applyPaneState(false);
            pane.classList.remove('no-anim');
          },
        });
      };
      paneHandle.addEventListener('pointerdown', onDownH);
      paneHandle.addEventListener('pointermove', onMoveH);
      paneHandle.addEventListener('pointerup', onUpH);
      paneHandle.addEventListener('pointercancel', onUpH);
    })();

    /* ------------------------------------------------------------------ */
    /* Mode Carte / Plan                                                  */
    /* ------------------------------------------------------------------ */
    function setMode(mode, replace) {
      if (mode === st.mode && !replace) return;
      flushEdit();
      st.mode = mode;
      const hash = '#/carte/' + map.id + (mode === 'plan' ? '/plan' : '');
      if (location.hash.split('?')[0] !== hash) history.replaceState(null, '', hash);
      R.app.route = { ...R.app.route, mode };
      page.dataset.mode = mode;
      for (const b of U.$$('.mode-seg .seg-btn', page)) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
      if (modeSeg._place) modeSeg._place();
      if (mode === 'plan') planHost.hidden = false;
      if (mode === 'plan') {
        R.outline.render(planHost, map, {
          onOpen: (id) => { setMode('map'); select(id); setTimeout(() => { centerOn(id); openPane(false); }, 60); },
        });
        planHost.scrollTop = 0;
      } else {
        // retour à la carte : le plan sort (120 ms ease-in) au lieu de disparaître d'un coup
        const done = () => { if (st.mode !== 'plan') { planHost.hidden = true; U.clear(planHost); } };
        if (!planHost.hidden && !replace && !motion.reduced()) {
          planHost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 120, easing: motion.css.in })
            .finished.then(done, done);
        } else done();
        canvas.focus({ preventScroll: true });
      }
      applyPaneState();
      render();
    }

    /* ------------------------------------------------------------------ */
    /* Coach (nouvelle carte)                                             */
    /* ------------------------------------------------------------------ */
    function showCoach() {
      const r0 = S.roots(map)[0];
      if (!r0) return;
      U.clear(coach);
      coach.append(
        h('p.coach-t', 'Décompose cette notion'),
        h('p.coach-d', U.isCompact() ? 'Touche « Enfant » pour ajouter une définition, une condition…' : 'Appuie sur Tab (ou la poignée +) pour ajouter une définition, une condition… Entrée ajoute un frère.'),
        ui.btn('Compris', { variant: 'text', onClick: hideCoach }));
      coach.hidden = false;
      requestAnimationFrame(() => coach.classList.add('in'));
      setTimeout(hideCoach, 9000);
    }

    /* ------------------------------------------------------------------ */
    /* Initialisation                                                     */
    /* ------------------------------------------------------------------ */
    applyReadOnly(true);
    const updateHeader = () => {
      titleBtn.textContent = map.title;
      const c = course();
      crumbCourse.textContent = c ? c.title : 'Cours';
      crumbCourse.href = '#/cours/' + map.courseId;
      U.clear(crumbPath);
      for (const f of S.locate(map)) crumbPath.append(h('span.crumb-sep', R.icon('chevronRight', 16)), h('a.crumb', { href: '#/dossier/' + f.id, title: f.title }, f.label || f.title));
    };
    updateHeader();

    let pendingTimer = null;
    const offStore = S.on((type) => {
      if (type === 'saved') {
        // un indicateur d'attente n'apparaît pas pour une sauvegarde < 400 ms (pas de clignotement)
        clearTimeout(pendingTimer);
        saveState.classList.toggle('error', !!S.saveError);
        saveState.querySelector('span:last-child').textContent = S.saveError ? 'Non enregistré' : 'Enregistré';
        saveState.classList.remove('pending');
        return;
      }
      if (type === 'settings') { if (!st.sel.size && !st.selEdge) renderPane(true); return; } // légende des couleurs
      if (type === 'readonly') { applyReadOnly(); return; }
      if (type === 'edit') {
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => { saveState.classList.add('pending'); saveState.querySelector('span:last-child').textContent = 'Enregistrement…'; }, 400);
        return;
      }
      if (type === 'change' || type === 'import') {
        if (!S.map(map.id)) { st.destroyed = true; return; }
        updateHeader();
      }
    });

    const onResize = U.debounce(() => { applyPaneState(false); bbKey = ''; render(); }, 120);
    window.addEventListener('resize', onResize);

    page.dataset.mode = st.mode;
    applyPaneState(false);
    render();
    st.ready = true;
    renderPane(true);
    // mesure et cadrage synchrones : la transition de page (View Transitions)
    // capture ainsi la carte déjà cadrée, sans saut à la frame suivante
    (() => {
      if (st.destroyed) return;
      if (!U.$('.dialog') && st.mode === 'map') canvas.focus({ preventScroll: true });
      measure();
      let laidOut = false;
      if (map.needsLayout) {
        // première ouverture d'une carte importée : rangement avec les tailles réelles
        const res = R.layout.arrange(map, sizeFn, { mode: map.layoutPick || 'auto', viewport: viewportSize() });
        for (const n of map.nodes) if (res.pos[n.id]) Object.assign(n, res.pos[n.id]);
        map.layout = res.mode;
        delete map.needsLayout;
        laidOut = true;
        S.save();
        render();
      }
      // distance de sécurité avec les tailles réelles : une carte rangée ailleurs (autre écran,
      // autre police, ancienne version) peut avoir des nœuds collés — on les écarte sans tout ranger
      const keepApart = () => {
        if (st.destroyed || st.mode !== 'map' || map.readOnly) return false;
        const pos = {};
        for (const n of map.nodes) pos[n.id] = { x: n.x, y: n.y };
        // tolérance : on ne touche à rien tant que tout est à plus de 8 px
        const probe = {}; for (const id in pos) probe[id] = { ...pos[id] };
        if (!R.layout.separate(map, probe, sizeFn, map.layout, 8)) return false;
        R.layout.separate(map, pos, sizeFn, map.layout);
        for (const n of map.nodes) Object.assign(n, pos[n.id]);
        S.save();
        render();
        return true;
      };
      if (!laidOut) keepApart();
      // polices pas encore chargées : les tailles mesurées sont provisoires — on remesure
      // (et on range à nouveau, dans la même disposition, si la carte vient d'être rangée)
      if (document.fonts && document.fonts.status !== 'loaded') {
        document.fonts.ready.then(() => {
          if (st.destroyed) return;
          for (const el of st.els.values()) el.dataset.sized = '';
          st.sizes.clear();
          measure();
          if (laidOut) {
            const res = R.layout.arrange(map, sizeFn, { mode: map.layout, viewport: viewportSize() });
            for (const n of map.nodes) if (res.pos[n.id]) Object.assign(n, res.pos[n.id]);
            S.save();
            render();
            initialView();
          } else if (!keepApart()) renderEdges();
        });
      }
      renderEdges();
      if (map.viewport && !route.q.n) { Object.assign(st.view, map.viewport); applyView(); }
      else initialView();
      if (route.q.n && S.node(map, route.q.n)) {
        select(route.q.n);
        centerOn(route.q.n, { animate: false, minK: 0.9 });
        openPane(false);
        // héros de la transition : la ligne de recherche choisie devient ce nœud. Le routeur le
        // nomme dans la foulée ; l'attribut est retiré ensuite pour ne pas servir au retour.
        const el = st.els.get(route.q.n);
        if (el) { el.dataset.hero = 'map:' + map.id + ':node'; requestAnimationFrame(() => { delete el.dataset.hero; }); }
      }
      if (route.q.new) {
        const r0 = S.roots(map)[0];
        if (r0) { select(r0.id); centerOn(r0.id, { animate: false, minK: 1 }); }
        showCoach();
      }
      if (route.q.print && st.mode === 'plan') setTimeout(() => window.print(), 300);
      if (route.q.n || route.q.new || route.q.print) history.replaceState(null, '', '#/carte/' + map.id + (st.mode === 'plan' ? '/plan' : ''));
    })();
    setMode(st.mode, true);
    updateHistoryBtns();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (st.destroyed) return; for (const el of st.els.values()) el.dataset.sized = ''; measure(); renderEdges(); positionCtx(); });

    /* API pour le routeur */
    this.update = (r) => {
      if (r.mode !== st.mode) setMode(r.mode);
      if (r.q && r.q.n && S.node(map, r.q.n)) { if (st.mode !== 'map') setMode('map'); select(r.q.n); centerOn(r.q.n, { minK: 0.9 }); openPane(false); }
      if (r.q && r.q.print) setTimeout(() => window.print(), 300);
    };
    this.unmount = () => {
      flushEdit();
      st.destroyed = true;
      if (R.actions.chooseLayout === chooseLayout) R.actions.chooseLayout = null;
      if (R.actions.organize === openOrganize) R.actions.organize = null;
      offStore();
      saveViewport.flush();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (camStop) camStop();
      if (tidyStop) tidyStop();
      if (flingStop) flingStop();
    };
  }
})(window.R);
