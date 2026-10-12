/* Ratio — modèle de données & persistance locale */
(function (R) {
  'use strict';
  const { U } = R;

  const KEY = 'ratio.v1';          // copie miroir synchrone (localStorage)
  const THEME_KEY = 'ratio.theme'; // lu avant le premier rendu (index.html)

  /* ------------------------------------------------------------------ */
  /* Persistance : IndexedDB (principal) + miroir localStorage            */
  /* ------------------------------------------------------------------ */
  /*
   * - IndexedDB : sans la limite de ~5 Mo ; une carte = un enregistrement, seules les
   *   cartes modifiées sont réécrites, dans une transaction atomique. Magasin « media »
   *   prêt pour les images et l'audio.
   * - localStorage : copie miroir écrite de façon synchrone à chaque sauvegarde tant
   *   qu'elle tient. Elle garantit l'enregistrement quand la page est fermée en plein
   *   vol (pagehide) et garde la compatibilité avec les anciennes versions de l'app.
   * - Au chargement, la copie la plus récente gagne (horodatage `savedAt`).
   *   Une copie miroir sans horodatage a forcément été écrite par une ancienne version
   *   après la dernière sauvegarde de celle-ci : elle est donc la plus récente.
   */
  const DB_NAME = 'ratio';
  const MIRROR_MAX = 4500000; // caractères ; au-delà, le miroir est retiré (jamais de copie périmée)
  const idb = {
    db: null,
    ok: false,
    written: new Map(), // id de carte → JSON déjà écrit
    metaWritten: '',
    open(timeout = 2500) {
      return new Promise((resolve) => {
        if (!window.indexedDB) { resolve(null); return; }
        let done = false;
        const finish = (db) => { if (done) { if (db) db.close(); return; } done = true; resolve(db); };
        setTimeout(() => finish(null), timeout); // certains navigateurs bloquent l'ouverture (navigation privée)
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { finish(null); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps');
          if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); idb.db = null; idb.ok = false; };
          finish(db);
        };
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
      });
    },
    /** Lit tout : { root, maps: [json…] } | null */
    readAll() {
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(['meta', 'maps'], 'readonly');
          const out = { root: null, maps: [] };
          tx.objectStore('meta').get('root').onsuccess = (e) => { out.root = e.target.result || null; };
          const cur = tx.objectStore('maps').openCursor();
          cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.maps.push({ id: c.key, json: c.value }); c.continue(); } };
          tx.oncomplete = () => resolve(out);
          tx.onerror = tx.onabort = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    /** Écrit seulement ce qui a changé, en une transaction (tout ou rien) */
    write(meta, mapJson) {
      return new Promise((resolve) => {
        if (!this.db) { resolve(false); return; }
        const metaStr = JSON.stringify(meta);
        const puts = [], dels = [];
        for (const [id, json] of mapJson) if (this.written.get(id) !== json) puts.push([id, json]);
        for (const id of this.written.keys()) if (!mapJson.has(id)) dels.push(id);
        if (!puts.length && !dels.length && metaStr === this.metaWritten) { resolve(true); return; }
        try {
          const tx = this.db.transaction(['meta', 'maps'], 'readwrite');
          const ms = tx.objectStore('maps');
          for (const [id, json] of puts) ms.put(json, id);
          for (const id of dels) ms.delete(id);
          tx.objectStore('meta').put(meta, 'root');
          tx.oncomplete = () => {
            for (const [id, json] of puts) this.written.set(id, json);
            for (const id of dels) this.written.delete(id);
            this.metaWritten = metaStr;
            resolve(true);
          };
          tx.onerror = tx.onabort = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    },
  };

  /** Taxonomie des nœuds — différenciés sans couleur (cf. DESIGN.md §4.4).
      `rank` : nœuds de structure d'un cours (Chapitre › Leçon › Section), numérotés automatiquement. */
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
    chapitre:   { label: 'Chapitre',           kicker: 'Chapitre',      prompt: 'Retrouve le plan de ce chapitre', rank: 1 },
    lecon:      { label: 'Leçon',              kicker: 'Leçon',         prompt: 'Retrouve le plan de cette leçon', rank: 2 },
    section:    { label: 'Section',            kicker: 'Section',       prompt: 'Retrouve le plan de cette section', rank: 3 },
    doctrine:   { label: 'Doctrine',           kicker: 'Doctrine',      prompt: 'Quelle est cette position doctrinale ?' },
    exemple:    { label: 'Exemple',            kicker: 'Exemple',       prompt: 'Qu’illustre cet exemple ?' },
    retenir:    { label: 'À retenir',          kicker: 'À retenir',     prompt: 'Restitue l’essentiel' },
    // au-delà du droit : raisonner, se repérer, citer (cours d'histoire, de sciences, essais…)
    question:   { label: 'Question',           kicker: 'Question',      prompt: 'Réponds à cette question' },
    methode:    { label: 'Méthode',            kicker: 'Méthode',       prompt: 'Retrouve les étapes de cette méthode' },
    comparaison:{ label: 'Comparaison',        kicker: 'Comparaison',   prompt: 'Compare : points communs et différences' },
    piege:      { label: 'Piège',              kicker: 'Piège',         prompt: 'Quel est le piège à éviter ?' },
    citation:   { label: 'Citation',           kicker: 'Citation',      prompt: 'Que dit cette citation, et qu’en retenir ?' },
    personne:   { label: 'Personne',           kicker: 'Personne',      prompt: 'Qui est-ce et quel est son apport ?' },
    date:       { label: 'Date',               kicker: 'Date',          prompt: 'Que s’est-il passé, et pourquoi est-ce important ?' },
    chiffre:    { label: 'Chiffre clé',        kicker: 'Chiffre',       prompt: 'Que mesure ce chiffre et que montre-t-il ?' },
    formule:    { label: 'Formule',            kicker: 'Formule',       prompt: 'Restitue la formule et le sens de chaque terme' },
    // vocabulaire universel (toutes matières) : cause et effet, raisonnement, action, description
    cause:      { label: 'Cause',              kicker: 'Cause',         prompt: 'Explique cette cause : pourquoi produit-elle cet effet ?' },
    consequence:{ label: 'Conséquence',        kicker: 'Conséquence',   prompt: 'Quelle est cette conséquence, et d’où vient-elle ?' },
    condition:  { label: 'Condition',          kicker: 'Condition',     prompt: 'Quelle est cette condition, et pourquoi est-elle nécessaire ?' },
    probleme:   { label: 'Problème',           kicker: 'Problème',      prompt: 'Quel est ce problème, et qu’est-ce qui le rend difficile ?' },
    solution:   { label: 'Solution',           kicker: 'Solution',      prompt: 'Quelle est cette solution, et comment l’appliquer ?' },
    argument:   { label: 'Argument',           kicker: 'Argument',      prompt: 'Développe cet argument' },
    critique:   { label: 'Critique / Limite',  kicker: 'Critique',      prompt: 'Quelle est cette critique ou cette limite ?' },
    nuance:     { label: 'Nuance',             kicker: 'Nuance',        prompt: 'Quelle nuance faut-il apporter ?' },
    avantage:   { label: 'Avantage',           kicker: 'Avantage',      prompt: 'Quel est cet avantage ?' },
    inconvenient:{ label: 'Inconvénient',      kicker: 'Inconvénient',  prompt: 'Quel est cet inconvénient ?' },
    caracteristique:{ label: 'Caractéristique', kicker: 'Caractéristique', prompt: 'Décris cette caractéristique' },
    categorie:  { label: 'Catégorie',          kicker: 'Catégorie',     prompt: 'Que regroupe cette catégorie ?' },
    signe:      { label: 'Signe / Indice',     kicker: 'Signe',         prompt: 'À quoi le reconnaît-on ?' },
    etape:      { label: 'Étape',              kicker: 'Étape',         prompt: 'Que fait-on à cette étape ?' },
    conseil:    { label: 'Conseil',            kicker: 'Conseil',       prompt: 'Quel est ce conseil, et comment l’appliquer ?' },
    exercice:   { label: 'Exercice',           kicker: 'Exercice',      prompt: 'Fais l’exercice : que faut-il faire ?' },
    objectif:   { label: 'Objectif',           kicker: 'Objectif',      prompt: 'Quel est cet objectif, et comment l’atteindre ?' },
    etude:      { label: 'Étude / Expérience', kicker: 'Étude',         prompt: 'Que montre cette étude ?' },
    theorie:    { label: 'Théorie / Modèle',   kicker: 'Théorie',       prompt: 'Que dit cette théorie, et qu’explique-t-elle ?' },
  };
  /** Les 9 premiers gardent leurs raccourcis 1–9 ; la structure se pose avec Alt 1–3 */
  const TYPE_ORDER = ['notion', 'definition', 'fond', 'forme', 'effet', 'exception', 'juris', 'texte', 'idee', 'chapitre', 'lecon', 'section', 'doctrine', 'exemple', 'retenir',
    'question', 'methode', 'comparaison', 'piege', 'citation', 'personne', 'date', 'chiffre', 'formule',
    'cause', 'consequence', 'condition', 'probleme', 'solution', 'argument', 'critique', 'nuance', 'avantage', 'inconvenient',
    'caracteristique', 'categorie', 'signe', 'etape', 'conseil', 'exercice', 'objectif', 'etude', 'theorie'];
  const STRUCT_ORDER = ['chapitre', 'lecon', 'section'];
  /** Regroupement du menu « Type » (divulgation par familles) */
  const TYPE_GROUPS = [
    { label: 'Structure du cours', types: STRUCT_ORDER },
    { label: 'Notion', types: ['notion', 'definition', 'caracteristique', 'categorie', 'signe'] },
    { label: 'Cause et effet', types: ['cause', 'consequence', 'condition', 'probleme', 'solution'] },
    { label: 'Raisonner', types: ['question', 'theorie', 'argument', 'critique', 'nuance', 'comparaison', 'avantage', 'inconvenient'] },
    { label: 'Agir', types: ['methode', 'etape', 'conseil', 'exercice', 'objectif'] },
    { label: 'Repères', types: ['date', 'chiffre', 'formule'] },
    { label: 'Sources', types: ['etude', 'citation', 'personne', 'texte', 'juris', 'doctrine'] },
    { label: 'Droit', types: ['fond', 'forme', 'effet', 'exception'] },
    { label: 'Compléments', types: ['exemple', 'piege', 'retenir', 'idee'] },
  ];
  const isStruct = (type) => !!(TYPES[type] && TYPES[type].rank);
  /** Dispositions de carte : arbre vers la droite, centrée (branches des deux côtés), pyramide */
  const LAYOUTS = ['right', 'balanced', 'down', 'organic'];

  const RATINGS = {
    revoir:   { label: 'À revoir', fill: 1 },
    compris:  { label: 'Compris',  fill: 2 },
    maitrise: { label: 'Maîtrisé', fill: 3 },
  };
  const INTERVALS = [0, 1, 3, 7, 15, 30]; // jours, boîtes de Leitner 0→5

  const listeners = new Set();
  const branchCache = new WeakMap();

  function blank() {
    return {
      version: 1,
      courses: [],
      maps: [],
      settings: { theme: 'system', motion: 'system', onboarded: false, reviewLog: {}, paneOpen: true, sessionSize: 20 },
    };
  }

  /**
   * Fourches (liens groupés) : plusieurs liens qui partent du même nœud, de même nature,
   * et partagent un seul libellé. Chaque branche reste un lien ordinaire (from → to),
   * le champ `group` ne fait que les réunir. Invariants garantis ici :
   *  - même source et même nature dans un groupe (sinon la branche est détachée) ;
   *  - un seul libellé (le premier non vide) ;
   *  - au moins deux branches (sinon le groupe disparaît).
   */
  function normalizeGroups(edges) {
    const groups = new Map();
    for (const e of edges) {
      if (!e.group) continue;
      if (!groups.has(e.group)) groups.set(e.group, []);
      groups.get(e.group).push(e);
    }
    for (const members of groups.values()) {
      const base = members[0];
      const ok = members.filter((e) => e.from === base.from && e.kind === base.kind);
      for (const e of members) if (!ok.includes(e)) delete e.group;
      if (ok.length < 2) { for (const e of ok) delete e.group; continue; }
      const label = (ok.find((e) => e.label) || base).label || '';
      for (const e of ok) e.label = label;
    }
    return edges;
  }

  /* sanitize(d, rep) : rep (facultatif) compte ce qui a été corrigé pendant la normalisation,
     pour le rapport d'import (rien n'est perdu en silence). */
  function sanitize(d, rep = null) {
    const out = blank();
    if (!d || typeof d !== 'object') return out;
    const note = (k, n = 1) => { if (rep) rep[k] = (rep[k] || 0) + n; };
    out.courses = Array.isArray(d.courses) ? d.courses.filter((c) => c && c.id).map((c) => ({
      id: String(c.id), title: String(c.title || 'Sans titre'), description: String(c.description || ''),
      createdAt: +c.createdAt || Date.now(), updatedAt: +c.updatedAt || Date.now(),
    })) : [];
    const courseIds = new Set(out.courses.map((c) => c.id));
    out.maps = Array.isArray(d.maps) ? d.maps.filter((m) => m && m.id).map((m, mi) => {
      const rawNodes = Array.isArray(m.nodes) ? m.nodes : [];
      const seenIds = new Set();
      const nodes = rawNodes.filter((n) => {
        if (!n || n.id == null) { note('nodesWithoutId'); return false; }
        if (seenIds.has(String(n.id))) { note('duplicateNodes'); return false; }
        seenIds.add(String(n.id));
        return true;
      }).map((n) => ({
        id: String(n.id),
        type: TYPES[n.type] ? n.type : (note('unknownTypes'), 'idee'),
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
      }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = Array.isArray(m.edges) ? m.edges.filter((e) => {
        const ok = e && ids.has(String(e.from)) && ids.has(String(e.to)) && String(e.from) !== String(e.to);
        if (!ok) note('droppedEdges');
        return ok;
      }).map((e) => ({
          id: String(e.id || U.uid('e')), from: String(e.from), to: String(e.to), kind: e.kind === 'link' ? 'link' : 'tree', label: String(e.label || ''),
          ...(e.group ? { group: String(e.group) } : {}),
        })) : [];
      // une seule arête hiérarchique entrante par nœud
      const seen = new Set();
      for (const e of edges) {
        if (e.kind !== 'tree') continue;
        if (seen.has(e.to)) { e.kind = 'link'; note('extraParents'); } else seen.add(e.to);
      }
      // positions absentes (ou toutes identiques) : la carte sera rangée automatiquement à l'ouverture
      const placed = rawNodes.filter((n) => n && Number.isFinite(+n.x) && Number.isFinite(+n.y) && n.x !== null && n.y !== null);
      const stacked = nodes.length > 1 && (placed.length < nodes.length || nodes.every((n) => n.x === nodes[0].x && n.y === nodes[0].y));
      if (stacked && rep && !m.needsLayout) note('autoLayout'); // demandé explicitement : rien à signaler
      normalizeGroups(edges);
      return {
        id: String(m.id), courseId: String(m.courseId || ''), title: String(m.title || 'Sans titre'),
        // sans date (import d'IA) : l'ordre du fichier devient l'ordre d'affichage (le plus récent d'abord)
        createdAt: +m.createdAt || Date.now(), updatedAt: +m.updatedAt || Date.now() - mi,
        viewport: m.viewport && Number.isFinite(+m.viewport.k) ? { x: +m.viewport.x || 0, y: +m.viewport.y || 0, k: +m.viewport.k || 1 } : null,
        nodes, edges,
        ...(m.needsLayout || (rep && stacked) ? { needsLayout: true } : {}),
        ...(m.readOnly ? { readOnly: true } : {}),
        // disposition : celle en place (layout) et celle choisie par l'utilisateur (layoutPick, sinon automatique)
        ...(LAYOUTS.includes(m.layout) ? { layout: m.layout } : {}),
        ...(LAYOUTS.includes(m.layoutPick) ? { layoutPick: m.layoutPick } : {}),
      };
    }).filter((m) => {
      if (courseIds.has(m.courseId)) return true;
      // à l'import, une carte sans cours connu n'est pas perdue : elle rejoint un cours « Importé »
      if (rep) {
        let orphan = out.courses.find((c) => c._orphans);
        if (!orphan) { orphan = { id: U.uid('c'), title: 'Importé', description: 'Cartes sans cours dans le fichier importé', createdAt: Date.now(), updatedAt: Date.now(), _orphans: true }; out.courses.push(orphan); }
        m.courseId = orphan.id;
        note('orphanMaps');
        return true;
      }
      return false;
    }) : [];
    for (const c of out.courses) delete c._orphans;
    if (d.settings && typeof d.settings === 'object') {
      out.settings.theme = ['system', 'light', 'dark'].includes(d.settings.theme) ? d.settings.theme : 'system';
      out.settings.motion = ['system', 'reduce', 'full'].includes(d.settings.motion) ? d.settings.motion : 'system';
      out.settings.onboarded = !!d.settings.onboarded;
      out.settings.paneOpen = d.settings.paneOpen !== false;
      // couleurs des nœuds par type (option) : monochrome par défaut
      const c = d.settings.colors;
      if (c && typeof c === 'object') {
        const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
        const custom = {};
        if (c.custom && typeof c.custom === 'object') for (const t of TYPE_ORDER) { const v = hex(c.custom[t]); if (v) custom[t] = v; }
        const modes = ['off', 'familles', 'daltonisme', 'perso'];
        out.settings.colors = {
          mode: modes.includes(c.mode) ? c.mode : 'off',
          intensity: c.intensity === 'vif' ? 'vif' : 'doux',
          custom,
          ...(modes.includes(c.last) && c.last !== 'off' ? { last: c.last } : {}),
        };
      }
      out.settings.reviewLog = d.settings.reviewLog && typeof d.settings.reviewLog === 'object' ? { ...d.settings.reviewLog } : {};
      out.settings.sessionSize = [10, 20, 0].includes(+d.settings.sessionSize) ? +d.settings.sessionSize : 20; // 0 = toutes
      out.settings.lastExport = +d.settings.lastExport || 0;
      // aides à la lecture (fils teintés par branche, numéros d'ordre) : actives par défaut
      out.settings.readingAids = d.settings.readingAids !== false;
    }
    return out;
  }

  const store = {
    TYPES, TYPE_ORDER, STRUCT_ORDER, TYPE_GROUPS, RATINGS, INTERVALS,
    isStruct,
    normalizeGroups,
    /** Branches d'une fourche (liens du même groupe) — [] si le lien n'est pas groupé */
    groupOf(map, e) { return e && e.group ? map.edges.filter((x) => x.group === e.group) : []; },
    data: blank(),
    fresh: false,
    saveError: null,

    /** 'indexeddb' | 'localstorage' — où vivent les données */
    backend: 'localstorage',

    async load() {
      // 1. copie miroir (synchrone, toujours lisible)
      let ls = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const p = JSON.parse(raw); ls = { data: p, savedAt: +p.savedAt || 0, legacy: !p.savedAt }; }
      } catch (e) { ls = null; }
      // 2. base principale
      let db = null;
      idb.db = await idb.open();
      idb.ok = !!idb.db;
      if (idb.ok) {
        const all = await idb.readAll();
        if (all && all.root) {
          const maps = [];
          for (const m of all.maps) {
            try { maps.push(JSON.parse(m.json)); idb.written.set(m.id, m.json); } catch (e) { /* enregistrement illisible : ignoré */ }
          }
          db = { data: { ...all.root, maps }, savedAt: +all.root.savedAt || 0 };
          idb.metaWritten = JSON.stringify(all.root);
        } else if (!all) idb.ok = false;
      }
      this.backend = idb.ok ? 'indexeddb' : 'localstorage';
      // 3. la copie la plus récente gagne
      let pick = db || ls;
      if (db && ls && (ls.legacy || ls.savedAt > db.savedAt)) pick = ls;
      if (pick) {
        try { this.data = sanitize(pick.data); } catch (e) { this.data = blank(); }
        // cartes importées jamais ouvertes (positions empilées) : rangées tout de suite (vignettes justes)
        let laid = false;
        for (const m of this.data.maps) { try { laid = this.prelayout(m) || laid; } catch (e) { /* rangement impossible : l'éditeur s'en chargera */ } }
        if (laid) setTimeout(() => this.save(), 0);
        // migration (ou rattrapage) : la base principale reçoit tout de suite la bonne copie
        if (idb.ok && pick !== db) this._save();
      } else {
        this.data = blank();
        this.fresh = true;
      }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },

    /**
     * Sauvegarde : miroir synchrone d'abord (survit à une fermeture brutale), puis
     * IndexedDB (seulement les cartes modifiées). Erreur seulement si AUCUNE copie
     * n'a pu être écrite.
     */
    _save() {
      const savedAt = Date.now();
      const d = this.data;
      const mapJson = new Map();
      for (const m of d.maps) mapJson.set(m.id, JSON.stringify(m));
      const meta = { version: d.version, courses: d.courses, settings: d.settings, savedAt };
      // miroir : même format qu'avant (+ savedAt), lisible par les anciennes versions
      let mirrorOk = false;
      try {
        localStorage.setItem(THEME_KEY, d.settings.theme);
        const head = JSON.stringify({ version: d.version, courses: d.courses, settings: d.settings, savedAt });
        const json = head.slice(0, -1) + ',"maps":[' + [...mapJson.values()].join(',') + ']}';
        if (json.length < MIRROR_MAX || !idb.ok) { localStorage.setItem(KEY, json); mirrorOk = true; }
        else localStorage.removeItem(KEY);
      } catch (e) {
        // plein : on retire la copie plutôt que de laisser une version périmée
        try { if (idb.ok) localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
      }
      if (!idb.ok) {
        this.saveError = mirrorOk ? null : new Error('quota');
        this.emit('saved');
        return Promise.resolve(mirrorOk);
      }
      // écritures IndexedDB à la file (jamais deux transactions concurrentes)
      this._chain = (this._chain || Promise.resolve()).then(() => idb.write(meta, mapJson)).then((ok) => {
        this.saveError = ok || mirrorOk ? null : new Error('idb');
        this.emit('saved');
        return ok || mirrorOk;
      });
      return this._chain;
    },

    /** Place occupée (octets approximatifs) et quota du navigateur */
    async usage() {
      const bytes = JSON.stringify(this.data).length;
      let quota = 0;
      try { if (navigator.storage && navigator.storage.estimate) quota = (await navigator.storage.estimate()).quota || 0; } catch (e) { /* ignore */ }
      return { bytes, quota, backend: this.backend };
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
    addMap(courseId, title, { rootType = 'notion' } = {}) {
      const t = (title || '').trim() || 'Nouvelle carte';
      const root = this.newNode({ type: TYPES[rootType] ? rootType : 'notion', title: t, x: 0, y: 0 });
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
      delete copy.readOnly; // une copie sert à retravailler : elle naît modifiable
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
    /** Lecture seule : protège le contenu (nœuds, liens, notes) ; ne change pas la date de modification */
    setReadOnly(id, on) {
      const m = this.map(id);
      if (!m || !!m.readOnly === !!on) return;
      if (on) m.readOnly = true; else delete m.readOnly;
      this.changed('readonly', m);
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
    /** Enfants dans l'ordre de lecture, qui dépend de la disposition :
        droite → haut en bas ; pyramide → gauche à droite ; centrée → sens horaire autour de la
        racine (côté droit de haut en bas, puis côté gauche de bas en haut), haut en bas ensuite. */
    childrenOf(map, id) {
      const ids = new Set(map.edges.filter((e) => e.kind === 'tree' && e.from === id).map((e) => e.to));
      const list = map.nodes.filter((n) => ids.has(n.id));
      if (map.layout === 'down') return list.sort((a, b) => a.x - b.x || a.y - b.y);
      if (map.layout === 'balanced' || map.layout === 'organic') {
        const p = this.node(map, id);
        if (p && !this.parentEdge(map, id)) {
          const right = list.filter((n) => n.x >= p.x).sort((a, b) => a.y - b.y || a.x - b.x);
          const left = list.filter((n) => n.x < p.x).sort((a, b) => b.y - a.y || a.x - b.x);
          return right.concat(left);
        }
      }
      return list.sort((a, b) => a.y - b.y || a.x - b.x);
    },
    roots(map) {
      const has = new Set(map.edges.filter((e) => e.kind === 'tree').map((e) => e.to));
      const list = map.nodes.filter((n) => !has.has(n.id));
      return map.layout === 'down' ? list.sort((a, b) => a.x - b.x || a.y - b.y) : list.sort((a, b) => a.y - b.y || a.x - b.x);
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
    /** Numéro automatique des nœuds de structure : rang parmi les frères de même type
        (Leçon 1, Leçon 2… dans un chapitre). Pas de numéro quand le type est seul à ce niveau. */
    structNumbers(map) {
      const out = new Map();
      if (!map.nodes.some((n) => isStruct(n.type))) return out;
      // rang dans l'ordre de lecture (childrenOf), qui suit la disposition de la carte
      const parents = new Set();
      for (const e of map.edges) if (e.kind === 'tree') parents.add(e.from);
      const lists = [this.roots(map), ...[...parents].map((id) => this.childrenOf(map, id))];
      for (const sibs of lists) {
        const byType = new Map();
        for (const n of sibs) {
          if (!isStruct(n.type)) continue;
          if (!byType.has(n.type)) byType.set(n.type, []);
          byType.get(n.type).push(n);
        }
        for (const list of byType.values()) if (list.length > 1) list.forEach((n, i) => out.set(n.id, i + 1));
      }
      return out;
    },
    /** Sur-titre affiché : « Leçon 2 », « Définition »… */
    kickerOf(map, n, nums) {
      const k = TYPES[n.type].kicker;
      const num = isStruct(n.type) ? (nums || this.structNumbers(map)).get(n.id) : null;
      return num ? `${k} ${num}` : k;
    },
    /** Bilan d'une branche (le nœud et tout ce qui en descend) — mis en cache par état de la carte */
    branchStats(map, id) {
      const stamp = `${map.updatedAt}|${map.nodes.length}|${map.edges.length}`;
      let cache = branchCache.get(map);
      if (!cache || cache.stamp !== stamp) { cache = { stamp, by: new Map() }; branchCache.set(map, cache); }
      if (cache.by.has(id)) return cache.by.get(id);
      const ids = [id, ...this.descendants(map, id)];
      const now = Date.now();
      const s = { nodes: ids.length - 1, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 };
      for (const nid of ids) {
        const n = this.node(map, nid);
        if (!n || !this.isReviewable(map, n)) continue;
        s.reviewable++;
        if (n.review.rating === 'maitrise') s.mastered++;
        else if (n.review.rating === 'compris') s.understood++;
        if (this.isDue(n, now)) s.due++;
      }
      s.progress = s.reviewable ? (s.mastered + s.understood * 0.5) / s.reviewable : 0;
      cache.by.set(id, s);
      return s;
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
    /** Consigne de révision d'un nœud (partagée par la révision et la carte de cours) */
    promptFor(map, node) {
      const T = TYPES[node.type];
      const kids = this.childrenOf(map, node.id).length;
      if (!kids) return T.prompt;
      if (node.logic) return `${T.prompt} — ${kids} éléments ${node.logic === 'et' ? 'cumulatifs' : 'alternatifs'} à retrouver`;
      return `${T.prompt} — ${kids} élément${kids > 1 ? 's' : ''} à retrouver`;
    },
    /**
     * Prochaine fiche d'un cours, déterministe : d'abord la plus en retard parmi les fiches
     * déjà révisées, sinon la première fiche nouvelle (carte la plus ancienne, ordre du plan).
     * La révision lancée depuis la carte de cours commence par celle-ci (option `first`).
     */
    nextCard(courseId, now = Date.now()) {
      let late = null, fresh = null;
      const maps = this.mapsOf(courseId).slice().sort((a, b) => a.createdAt - b.createdAt);
      for (const m of maps) {
        for (const n of m.nodes) {
          if (!this.isReviewable(m, n) || !this.isDue(n, now)) continue;
          if (n.review.last) { if (!late || n.review.due < late.node.review.due) late = { map: m, node: n }; }
          else if (!fresh) fresh = { map: m, node: n };
          else if (fresh.map === m && (n.y < fresh.node.y || (n.y === fresh.node.y && n.x < fresh.node.x))) fresh = { map: m, node: n };
        }
      }
      return late || fresh;
    },
    /** Cartes de révision selon une portée : {all} | {courseId} | {mapId[, nodeId]} ; `first` = {mapId, nodeId} à placer en tête */
    reviewQueue(scope = {}, { all = false, limit = 20, first = null } = {}) {
      const maps = scope.mapId ? [this.map(scope.mapId)].filter(Boolean)
        : scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const now = Date.now();
      const due = [], fresh = [];
      // portée « branche » : un chapitre, une leçon… (le nœud et sa descendance)
      const branch = scope.mapId && scope.nodeId && maps[0] ? new Set([scope.nodeId, ...this.descendants(maps[0], scope.nodeId)]) : null;
      for (const m of maps) {
        for (const n of m.nodes) {
          if (branch && !branch.has(n.id)) continue;
          if (!this.isReviewable(m, n)) continue;
          if (all || this.isDue(n, now)) (n.review.last ? due : fresh).push({ mapId: m.id, nodeId: n.id, due: n.review.due });
        }
      }
      due.sort((a, b) => a.due - b.due);
      // récompense de la chasse : ordre mélangé parmi les nouvelles
      for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
      const queue = [...due, ...fresh];
      if (first) {
        const i = queue.findIndex((q) => q.mapId === first.mapId && q.nodeId === first.nodeId);
        if (i > 0) queue.unshift(...queue.splice(i, 1));
      }
      return queue.slice(0, limit);
    },
    dueCount(scope = {}) { return this.reviewQueue(scope, { limit: 1e9 }).length; },
    /** Annule une note (révision) : remet l'état d'avant et retire la carte du journal du jour */
    unrate(map, node, before, day) {
      node.review = { ...before };
      const log = this.data.settings.reviewLog;
      if (log[day] > 1) log[day]--; else delete log[day];
      this.changed('review');
    },
    /**
     * Charge à venir : nombre de cartes à réviser par jour, sur `days` jours à partir d'aujourd'hui
     * (aujourd'hui = cartes dues + cartes nouvelles ; les jours suivants = échéances qui tombent ce jour-là).
     */
    forecast(days = 7, scope = {}) {
      const maps = scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const t0 = U.startOfDay();
      // by : répartition par cours ({ courseId: n }), pour empiler les piles par cours
      const out = Array.from({ length: days }, (_, i) => ({ day: t0 + i * U.DAY, n: 0, by: {} }));
      const now = Date.now();
      const add = (i, m) => { out[i].n++; out[i].by[m.courseId] = (out[i].by[m.courseId] || 0) + 1; };
      for (const m of maps) for (const n of m.nodes) {
        if (!this.isReviewable(m, n)) continue;
        if (this.isDue(n, now)) { add(0, m); continue; }
        const i = Math.floor((U.startOfDay(n.review.due) - t0) / U.DAY);
        if (i > 0 && i < days) add(i, m);
      }
      return out;
    },
    /** Cartes dont la dernière note est « À revoir », les plus récentes d'abord */
    weakCards(limit = 6) {
      const list = [];
      for (const m of this.data.maps) for (const n of m.nodes) {
        if (n.review.rating === 'revoir' && this.isReviewable(m, n)) list.push({ map: m, node: n });
      }
      return list.sort((a, b) => b.node.review.last - a.node.review.last).slice(0, limit);
    },
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
    /* Format de fichier : { format: 'ratio', version: 2, kind: 'backup' | 'course', courses, maps[, settings] }.
       À l'import, on accepte aussi une carte seule ({ nodes, edges }) et { course, maps } (un cours). */
    exportAll() {
      this.data.settings.lastExport = Date.now();
      this.save();
      return JSON.stringify({ format: 'ratio', version: 2, kind: 'backup', exportedAt: new Date().toISOString(), ...this.data }, null, 2);
    },
    /** Un cours et ses cartes, sans les réglages ni l'historique de révision des autres cours */
    exportCourse(id) {
      const c = this.course(id);
      if (!c) return null;
      return JSON.stringify({ format: 'ratio', version: 2, kind: 'course', exportedAt: new Date().toISOString(), courses: [c], maps: this.mapsOf(id) }, null, 2);
    },

    /**
     * Lit un texte à importer, sans rien modifier. Tolérant (loi de Postel) : retire un BOM, les
     * balises ```json d'une réponse d'IA, le texte autour de l'objet, les virgules finales et les
     * guillemets typographiques. Renvoie l'aperçu, les corrections faites et les collisions
     * d'identifiants avec les données actuelles — ou lève une erreur lisible.
     */
    parseImport(text) {
      const fixes = [];
      let t = String(text || '').replace(/^﻿/, '').trim();
      if (!t) throw new Error('Le fichier ou le texte est vide.');
      const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) { t = fence[1].trim(); fixes.push('balises de code retirées'); }
      const start = t.search(/[[{]/);
      if (start > 0) { t = t.slice(start); fixes.push('texte avant le JSON ignoré'); }
      const endObj = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
      if (endObj >= 0 && endObj < t.length - 1) { t = t.slice(0, endObj + 1); fixes.push('texte après le JSON ignoré'); }
      let parsed;
      try { parsed = JSON.parse(t); } catch (e1) {
        const repaired = t.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1');
        try { parsed = JSON.parse(repaired); fixes.push('virgules en trop ou guillemets typographiques corrigés'); } catch (e2) {
          const m = String(e1.message).match(/position (\d+)/);
          let where = '';
          if (m) { const pos = +m[1]; const before = t.slice(0, pos); where = ` (ligne ${before.split('\n').length}, colonne ${pos - before.lastIndexOf('\n')})`; }
          throw new Error(`JSON invalide${where}. Vérifie qu'il est complet (accolades et crochets fermés).`);
        }
      }
      // reconnaître la forme
      let kind, raw;
      if (Array.isArray(parsed) && parsed.every((x) => x && x.nodes)) {
        kind = 'maps';
        const c = { id: U.uid('c'), title: 'Importé', description: '', createdAt: Date.now(), updatedAt: Date.now() };
        raw = { courses: [c], maps: parsed.map((m) => ({ ...m, courseId: c.id })) };
      } else if (parsed && Array.isArray(parsed.maps) && (Array.isArray(parsed.courses) || parsed.course)) {
        kind = parsed.kind === 'backup' || (parsed.settings && parsed.courses && parsed.courses.length > 1) ? 'backup' : 'course';
        raw = parsed.course ? { courses: [{ ...parsed.course, id: parsed.course.id || U.uid('c') }], maps: parsed.maps.map((m) => ({ ...m, courseId: m.courseId || parsed.course.id })) } : parsed;
        if (parsed.course && !parsed.course.id) for (const m of raw.maps) m.courseId = raw.courses[0].id;
      } else if (parsed && Array.isArray(parsed.nodes)) {
        kind = 'map';
        const c = { id: U.uid('c'), title: 'Importé', description: '', createdAt: Date.now(), updatedAt: Date.now() };
        raw = { courses: [c], maps: [{ ...parsed, id: parsed.id || U.uid('m'), courseId: c.id }] };
      } else throw new Error('Ce JSON ne ressemble pas à des données Ratio : il faut des cours et des cartes (« courses », « maps ») ou une carte (« nodes »).');
      const rep = {};
      const data = sanitize(raw, rep);
      if (parsed.settings) data.settings = { ...data.settings, ...sanitize({ settings: parsed.settings }).settings };
      // aperçu
      let nodes = 0, edges = 0, notes = 0, links = 0, labels = 0;
      for (const m of data.maps) {
        nodes += m.nodes.length; edges += m.edges.length;
        notes += m.nodes.filter((n) => n.note.trim()).length;
        links += m.edges.filter((e) => e.kind === 'link').length;
        labels += m.edges.filter((e) => e.label).length;
      }
      const collide = {
        courses: data.courses.filter((c) => this.course(c.id)).length,
        maps: data.maps.filter((m) => this.map(m.id)).length,
      };
      const issues = [];
      const say = (k, f) => { if (rep[k]) issues.push(f(rep[k])); };
      say('unknownTypes', (n) => `${U.plural(n, 'nœud')} au type inconnu → « Idée »`);
      say('droppedEdges', (n) => `${U.plural(n, 'lien')} vers un nœud absent, ignoré${n > 1 ? 's' : ''}`);
      say('extraParents', (n) => `${U.plural(n, 'second parent')} transformé${n > 1 ? 's' : ''} en renvoi`);
      say('duplicateNodes', (n) => `${U.plural(n, 'nœud')} en double, ignoré${n > 1 ? 's' : ''}`);
      say('nodesWithoutId', (n) => `${U.plural(n, 'nœud')} sans identifiant, ignoré${n > 1 ? 's' : ''}`);
      say('orphanMaps', (n) => `${U.plural(n, 'carte')} sans cours → rangée${n > 1 ? 's' : ''} dans « Importé »`);
      say('autoLayout', (n) => `${U.plural(n, 'carte')} sans positions → rangée${n > 1 ? 's' : ''} automatiquement à l’ouverture`);
      return { kind, data, fixes, issues, collide, stats: { courses: data.courses.length, maps: data.maps.length, nodes, edges, notes, links, labels } };
    },

    /**
     * Applique une analyse. mode : 'add' (ajouter en copie : identifiants neufs, rien n'est écrasé)
     * | 'update' (même identifiants : remplace les versions existantes) | 'complete' (ajoute les cartes
     * d'une suite à un cours déjà présent) | 'replace' (tout remplacer).
     * Renvoie un instantané pour annuler (restoreSnapshot).
     */
    applyImport(parsed, mode = 'add') {
      const snapshot = JSON.stringify(this.data);
      const inc = JSON.parse(JSON.stringify(parsed.data));
      if (mode === 'replace') {
        inc.settings = { ...this.data.settings, ...inc.settings, onboarded: true };
        this.data = inc;
      } else {
        if (mode === 'add') {
          // identifiants neufs pour les cours et les cartes déjà présents (les nœuds sont propres à leur carte) ;
          // les autres gardent les leurs, pour qu'une suite (partie 2 d'un livre) puisse ensuite compléter le même cours
          const cid = new Map();
          for (const c of inc.courses) { c.createdAt = c.updatedAt = Date.now(); if (this.course(c.id)) { const n = U.uid('c'); cid.set(c.id, n); c.id = n; } }
          for (const m of inc.maps) { if (this.map(m.id)) m.id = U.uid('m'); m.courseId = cid.get(m.courseId) || m.courseId; }
        }
        if (mode === 'complete') {
          // la suite se range après les cartes déjà présentes du cours, dans l'ordre du fichier
          for (const c of inc.courses) {
            const floor = Math.min(Date.now(), ...this.mapsOf(c.id).map((m) => m.updatedAt));
            inc.maps.filter((m) => m.courseId === c.id).forEach((m, i) => { m.updatedAt = floor - 1 - i; });
          }
        }
        for (const c of inc.courses) {
          const ex = this.course(c.id);
          // 'complete' : les cartes rejoignent le cours existant, qui garde son titre et sa description
          if (ex) { if (mode !== 'complete') Object.assign(ex, c); } else this.data.courses.push(c);
        }
        for (const m of inc.maps) {
          const i = this.data.maps.findIndex((x) => x.id === m.id);
          if (i >= 0) this.data.maps[i] = m; else this.data.maps.push(m);
        }
        const log = this.data.settings.reviewLog;
        for (const [k, v] of Object.entries(inc.settings.reviewLog || {})) log[k] = Math.max(log[k] || 0, v);
      }
      for (const m of this.data.maps) if (inc.maps.some((x) => x.id === m.id)) this.prelayout(m);
      this.changed('import');
      return { snapshot, courses: inc.courses.map((c) => c.id), maps: inc.maps.length };
    },
    /**
     * Carte à ranger (import d'IA, positions absentes) : on la range tout de suite avec des tailles
     * estimées — vignettes, plan et révision sont justes avant même la première ouverture. Le
     * drapeau needsLayout reste : l'éditeur affinera avec les tailles réelles, dans la même disposition.
     */
    prelayout(m, force = false) {
      if (!R.layout || !m.needsLayout || !m.nodes.length) return false;
      const stacked = m.nodes.every((n) => n.x === m.nodes[0].x && n.y === m.nodes[0].y);
      if (!stacked && !force) return false;
      const vp = typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight - 64 } : undefined;
      const r = R.layout.arrange(m, R.layout.estimate, { mode: m.layoutPick || m.layout || 'auto', viewport: vp, fast: true });
      for (const n of m.nodes) if (r.pos[n.id]) Object.assign(n, r.pos[n.id]);
      m.layout = r.mode;
      return true;
    },
    restoreSnapshot(snapshot) {
      this.data = sanitize(JSON.parse(snapshot));
      this.changed('import');
    },
    /** Compatibilité : ancien appel (fusion par identifiants) */
    importData(text, mode = 'merge') {
      const r = this.applyImport(this.parseImport(text), mode === 'replace' ? 'replace' : 'update');
      return { courses: r.courses.length, maps: r.maps };
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
