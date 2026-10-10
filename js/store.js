/* Ratio — modèle de données & persistance locale */
(function (R) {
  'use strict';
  const { U } = R;

  const KEY = 'ratio.v1';

  /** Taxonomie des nœuds — différenciés sans couleur (cf. DESIGN.md §4.4) */
  const TYPES = {
    notion:     { label: 'Notion',             kicker: '',              prompt: 'Décompose cette notion' },
    definition: { label: 'Définition',         kicker: 'Définition',    prompt: 'Donne la définition' },
    fond:       { label: 'Condition de fond',  kicker: 'Fond',          prompt: 'Explique cette condition de fond' },
    forme:      { label: 'Condition de forme', kicker: 'Forme',         prompt: 'Explique cette condition de forme' },
    effet:      { label: 'Effet / Régime',     kicker: 'Effet',         prompt: 'Quels sont les effets ?' },
    exception:  { label: 'Exception',          kicker: 'Exception',     prompt: 'Explique cette exception' },
    juris:      { label: 'Jurisprudence',      kicker: 'Jurisprudence', prompt: 'Que retient cette décision ?' },
    texte:      { label: 'Texte',              kicker: 'Texte',         prompt: 'Que prévoit ce texte ?' },
    idee:       { label: 'Idée',               kicker: '',              prompt: 'Développe cette idée' },
  };
  const TYPE_ORDER = ['notion', 'definition', 'fond', 'forme', 'effet', 'exception', 'juris', 'texte', 'idee'];

  const RATINGS = {
    revoir:   { label: 'À revoir', fill: 1 },
    compris:  { label: 'Compris',  fill: 2 },
    maitrise: { label: 'Maîtrisé', fill: 3 },
  };
  const INTERVALS = [0, 1, 3, 7, 15, 30]; // jours, boîtes de Leitner 0→5

  const listeners = new Set();

  function blank() {
    return {
      version: 1,
      courses: [],
      maps: [],
      settings: { theme: 'system', motion: 'system', onboarded: false, reviewLog: {}, paneOpen: true },
    };
  }

  function sanitize(d) {
    const out = blank();
    if (!d || typeof d !== 'object') return out;
    out.courses = Array.isArray(d.courses) ? d.courses.filter((c) => c && c.id).map((c) => ({
      id: String(c.id), title: String(c.title || 'Sans titre'), description: String(c.description || ''),
      createdAt: +c.createdAt || Date.now(), updatedAt: +c.updatedAt || Date.now(),
    })) : [];
    const courseIds = new Set(out.courses.map((c) => c.id));
    out.maps = Array.isArray(d.maps) ? d.maps.filter((m) => m && m.id).map((m) => {
      const nodes = Array.isArray(m.nodes) ? m.nodes.filter((n) => n && n.id).map((n) => ({
        id: String(n.id),
        type: TYPES[n.type] ? n.type : 'idee',
        title: String(n.title ?? ''),
        note: String(n.note ?? ''),
        x: Number.isFinite(+n.x) ? +n.x : 0,
        y: Number.isFinite(+n.y) ? +n.y : 0,
        collapsed: !!n.collapsed,
        logic: n.logic === 'et' || n.logic === 'ou' ? n.logic : null,
        review: n.review && typeof n.review === 'object' ? {
          box: U.clamp(+n.review.box || 0, 0, 5), due: +n.review.due || 0, last: +n.review.last || 0,
          rating: RATINGS[n.review.rating] ? n.review.rating : null,
        } : { box: 0, due: 0, last: 0, rating: null },
      })) : [];
      const ids = new Set(nodes.map((n) => n.id));
      const edges = Array.isArray(m.edges) ? m.edges.filter((e) => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
        .map((e) => ({ id: String(e.id || U.uid('e')), from: e.from, to: e.to, kind: e.kind === 'link' ? 'link' : 'tree', label: String(e.label || '') })) : [];
      // une seule arête hiérarchique entrante par nœud
      const seen = new Set();
      for (const e of edges) {
        if (e.kind !== 'tree') continue;
        if (seen.has(e.to)) e.kind = 'link'; else seen.add(e.to);
      }
      return {
        id: String(m.id), courseId: String(m.courseId || ''), title: String(m.title || 'Sans titre'),
        createdAt: +m.createdAt || Date.now(), updatedAt: +m.updatedAt || Date.now(),
        viewport: m.viewport && Number.isFinite(+m.viewport.k) ? { x: +m.viewport.x || 0, y: +m.viewport.y || 0, k: +m.viewport.k || 1 } : null,
        nodes, edges,
        ...(m.needsLayout ? { needsLayout: true } : {}),
      };
    }).filter((m) => courseIds.has(m.courseId)) : [];
    if (d.settings && typeof d.settings === 'object') {
      out.settings.theme = ['system', 'light', 'dark'].includes(d.settings.theme) ? d.settings.theme : 'system';
      out.settings.motion = ['system', 'reduce', 'full'].includes(d.settings.motion) ? d.settings.motion : 'system';
      out.settings.onboarded = !!d.settings.onboarded;
      out.settings.paneOpen = d.settings.paneOpen !== false;
      out.settings.reviewLog = d.settings.reviewLog && typeof d.settings.reviewLog === 'object' ? { ...d.settings.reviewLog } : {};
    }
    return out;
  }

  const store = {
    TYPES, TYPE_ORDER, RATINGS, INTERVALS,
    data: blank(),
    fresh: false,
    saveError: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible */ }
      if (raw) {
        try { this.data = sanitize(JSON.parse(raw)); } catch (e) { this.data = blank(); }
      } else {
        this.data = blank();
        this.fresh = true;
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },

    _save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        this.saveError = null;
      } catch (e) {
        this.saveError = e;
      }
      this.emit('saved');
    },

    save: null, // défini plus bas (debounce)

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(type, payload) { for (const fn of listeners) fn(type, payload); },
    changed(type = 'change', payload) { this.save(); this.emit(type, payload); },

    /* ---------------- Cours ---------------- */
    course(id) { return this.data.courses.find((c) => c.id === id); },
    coursesSorted() {
      return [...this.data.courses].sort((a, b) => this.courseActivity(b) - this.courseActivity(a));
    },
    courseActivity(c) {
      return Math.max(c.updatedAt, ...this.mapsOf(c.id).map((m) => m.updatedAt));
    },
    addCourse({ title, description = '' }) {
      const c = { id: U.uid('c'), title: title.trim() || 'Nouveau cours', description: description.trim(), createdAt: Date.now(), updatedAt: Date.now() };
      this.data.courses.push(c);
      this.changed();
      return c;
    },
    updateCourse(id, patch) {
      const c = this.course(id);
      if (!c) return;
      Object.assign(c, patch, { updatedAt: Date.now() });
      this.changed();
    },
    deleteCourse(id) {
      const snap = { courses: this.data.courses.filter((c) => c.id === id), maps: this.mapsOf(id) };
      this.data.courses = this.data.courses.filter((c) => c.id !== id);
      this.data.maps = this.data.maps.filter((m) => m.courseId !== id);
      this.changed();
      return snap;
    },
    restore(snap) {
      for (const c of snap.courses || []) if (!this.course(c.id)) this.data.courses.push(c);
      for (const m of snap.maps || []) if (!this.map(m.id)) this.data.maps.push(m);
      this.changed();
    },

    /* ---------------- Cartes ---------------- */
    map(id) { return this.data.maps.find((m) => m.id === id); },
    mapsOf(courseId) {
      return this.data.maps.filter((m) => m.courseId === courseId).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    recentMaps(n = 6) { return [...this.data.maps].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, n); },
    addMap(courseId, title) {
      const t = (title || '').trim() || 'Nouvelle carte';
      const root = this.newNode({ type: 'notion', title: t, x: 0, y: 0 });
      const m = { id: U.uid('m'), courseId, title: t, createdAt: Date.now(), updatedAt: Date.now(), viewport: null, nodes: [root], edges: [] };
      this.data.maps.push(m);
      const c = this.course(courseId);
      if (c) c.updatedAt = Date.now();
      this.changed();
      return m;
    },
    duplicateMap(id) {
      const src = this.map(id);
      if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      const idMap = {};
      copy.id = U.uid('m');
      copy.title = src.title + ' (copie)';
      copy.createdAt = copy.updatedAt = Date.now();
      for (const n of copy.nodes) { const nid = U.uid('n'); idMap[n.id] = nid; n.id = nid; }
      for (const e of copy.edges) { e.id = U.uid('e'); e.from = idMap[e.from]; e.to = idMap[e.to]; }
      this.data.maps.push(copy);
      this.changed();
      return copy;
    },
    updateMap(id, patch) {
      const m = this.map(id);
      if (!m) return;
      Object.assign(m, patch, { updatedAt: Date.now() });
      this.changed();
    },
    touchMap(m, type = 'change') {
      m.updatedAt = Date.now();
      this.changed(type, m);
    },
    deleteMap(id) {
      const snap = { maps: this.data.maps.filter((m) => m.id === id) };
      this.data.maps = this.data.maps.filter((m) => m.id !== id);
      this.changed();
      return snap;
    },
    moveMap(id, courseId) { this.updateMap(id, { courseId }); },

    /* ---------------- Nœuds / graphe ---------------- */
    newNode(p = {}) {
      return {
        id: U.uid('n'), type: p.type || 'idee', title: p.title ?? '', note: p.note || '',
        x: p.x || 0, y: p.y || 0, collapsed: false, logic: p.logic || null,
        review: { box: 0, due: 0, last: 0, rating: null },
      };
    },
    node(map, id) { return map.nodes.find((n) => n.id === id); },
    parentEdge(map, id) { return map.edges.find((e) => e.kind === 'tree' && e.to === id); },
    parentOf(map, id) { const e = this.parentEdge(map, id); return e ? this.node(map, e.from) : null; },
    childrenOf(map, id) {
      const ids = map.edges.filter((e) => e.kind === 'tree' && e.from === id).map((e) => e.to);
      return map.nodes.filter((n) => ids.includes(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    },
    roots(map) {
      const has = new Set(map.edges.filter((e) => e.kind === 'tree').map((e) => e.to));
      return map.nodes.filter((n) => !has.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    },
    descendants(map, id) {
      const out = [];
      const stack = [id];
      const seen = new Set([id]);
      while (stack.length) {
        const cur = stack.pop();
        for (const e of map.edges) {
          if (e.kind === 'tree' && e.from === cur && !seen.has(e.to)) {
            seen.add(e.to); out.push(e.to); stack.push(e.to);
          }
        }
      }
      return out;
    },
    ancestors(map, id) {
      const out = [];
      let p = this.parentOf(map, id);
      const seen = new Set();
      while (p && !seen.has(p.id)) { out.unshift(p); seen.add(p.id); p = this.parentOf(map, p.id); }
      return out;
    },
    /** Peut-on rattacher `to` comme enfant de `from` ? */
    canTree(map, from, to) {
      if (from === to) return false;
      if (this.parentEdge(map, to)) return false;
      return !this.descendants(map, to).includes(from);
    },
    hiddenSet(map) {
      const hidden = new Set();
      for (const n of map.nodes) if (n.collapsed) for (const d of this.descendants(map, n.id)) hidden.add(d);
      return hidden;
    },

    /* ---------------- Révision ---------------- */
    isReviewable(map, n) {
      return !!(n.title.trim() && (n.note.trim() || this.childrenOf(map, n.id).length));
    },
    isDue(n, now = Date.now()) { return !n.review.last || n.review.due <= now; },
    mapStats(m) {
      let reviewable = 0, mastered = 0, due = 0, understood = 0;
      const now = Date.now();
      for (const n of m.nodes) {
        if (!this.isReviewable(m, n)) continue;
        reviewable++;
        if (n.review.rating === 'maitrise') mastered++;
        else if (n.review.rating === 'compris') understood++;
        if (this.isDue(n, now)) due++;
      }
      return { nodes: m.nodes.length, reviewable, mastered, understood, due,
        progress: reviewable ? (mastered + understood * 0.5) / reviewable : 0 };
    },
    courseStats(id) {
      const s = { maps: 0, nodes: 0, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 };
      for (const m of this.mapsOf(id)) {
        const ms = this.mapStats(m);
        s.maps++; s.nodes += ms.nodes; s.reviewable += ms.reviewable; s.mastered += ms.mastered;
        s.understood += ms.understood; s.due += ms.due;
      }
      s.progress = s.reviewable ? (s.mastered + s.understood * 0.5) / s.reviewable : 0;
      return s;
    },
    /** Cartes de révision selon une portée : {all} | {courseId} | {mapId} */
    reviewQueue(scope = {}, { all = false, limit = 20 } = {}) {
      const maps = scope.mapId ? [this.map(scope.mapId)].filter(Boolean)
        : scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const now = Date.now();
      const due = [], fresh = [];
      for (const m of maps) {
        for (const n of m.nodes) {
          if (!this.isReviewable(m, n)) continue;
          if (all || this.isDue(n, now)) (n.review.last ? due : fresh).push({ mapId: m.id, nodeId: n.id, due: n.review.due });
        }
      }
      due.sort((a, b) => a.due - b.due);
      // récompense de la chasse : ordre mélangé parmi les nouvelles
      for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
      return [...due, ...fresh].slice(0, limit);
    },
    dueCount(scope = {}) { return this.reviewQueue(scope, { limit: 1e9 }).length; },
    rate(map, node, rating) {
      const r = node.review;
      const now = Date.now();
      if (rating === 'revoir') r.box = 1;
      else if (rating === 'compris') r.box = Math.min(5, Math.max(1, r.box + 1));
      else r.box = Math.min(5, Math.max(2, r.box + 2));
      r.rating = rating;
      r.last = now;
      r.due = rating === 'revoir' ? U.startOfDay(now) + U.DAY : U.startOfDay(now) + INTERVALS[r.box] * U.DAY;
      const log = this.data.settings.reviewLog;
      const k = U.dayKey();
      log[k] = (log[k] || 0) + 1;
      map.updatedAt = now;
      this.changed('review');
    },
    streak() {
      const log = this.data.settings.reviewLog;
      let d = new Date();
      let n = 0;
      if (!log[U.dayKey(d)]) d.setDate(d.getDate() - 1); // la série tient jusqu'à ce soir
      while (log[U.dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    reviewedToday() { return this.data.settings.reviewLog[U.dayKey()] || 0; },
    nextDueInfo(scope = {}) {
      const maps = scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const tomorrow = U.startOfDay() + U.DAY;
      let count = 0, next = Infinity;
      for (const m of maps) for (const n of m.nodes) {
        if (!this.isReviewable(m, n) || !n.review.last) continue;
        if (n.review.due <= tomorrow) count++;
        if (n.review.due > Date.now()) next = Math.min(next, n.review.due);
      }
      return { tomorrow: count, next };
    },

    /* ---------------- Import / export ---------------- */
    exportAll() {
      return JSON.stringify({ app: 'ratio', exportedAt: new Date().toISOString(), ...this.data }, null, 2);
    },
    importData(text, mode = 'merge') {
      const parsed = JSON.parse(text);
      // tolérant : accepte une sauvegarde complète, une carte seule, ou un cours exporté
      let incoming;
      if (parsed && parsed.maps && parsed.courses) incoming = sanitize(parsed);
      else if (parsed && parsed.nodes) {
        const c = { id: U.uid('c'), title: 'Importé', description: '', createdAt: Date.now(), updatedAt: Date.now() };
        incoming = sanitize({ courses: [c], maps: [{ ...parsed, courseId: c.id }] });
      } else throw new Error('Format non reconnu');
      if (mode === 'replace') {
        incoming.settings = { ...this.data.settings, ...incoming.settings, onboarded: true };
        this.data = incoming;
      } else {
        for (const c of incoming.courses) {
          const ex = this.course(c.id);
          if (ex) Object.assign(ex, c); else this.data.courses.push(c);
        }
        for (const m of incoming.maps) {
          const i = this.data.maps.findIndex((x) => x.id === m.id);
          if (i >= 0) this.data.maps[i] = m; else this.data.maps.push(m);
        }
        const log = this.data.settings.reviewLog;
        for (const [k, v] of Object.entries(incoming.settings.reviewLog || {})) log[k] = Math.max(log[k] || 0, v);
      }
      this.changed('import');
      return { courses: incoming.courses.length, maps: incoming.maps.length };
    },
    reset() {
      const theme = this.data.settings.theme;
      this.data = blank();
      this.data.settings.theme = theme;
      this.changed('import');
    },
  };

  store.save = U.debounce(() => store._save(), 250);
  const flush = () => store.save.flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  R.store = store;
})(window.R);
