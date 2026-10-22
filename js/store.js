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
      `rank` : nœuds de structure d'un cours (Chapitre › Section › Sous-section › Paragraphe ; Leçon gardée pour les anciennes cartes), numérotés automatiquement. */
  const TYPES = {
    notion:     { label: 'Notion',             kicker: '',              prompt: 'Décompose cette notion' },
    definition: { label: 'Définition',         kicker: 'Définition',    prompt: 'Donne la définition' },
    juris:      { label: 'Jurisprudence',      kicker: 'Jurisprudence', prompt: 'Que retient cette décision ?' },
    texte:      { label: 'Texte',              kicker: 'Texte',         prompt: 'Que prévoit ce texte ?' },
    idee:       { label: 'Idée',               kicker: '',              prompt: 'Développe cette idée' },
    chapitre:   { label: 'Chapitre',           kicker: 'Chapitre',      prompt: 'Retrouve le plan de ce chapitre', rank: 1 },
    section:    { label: 'Section',            kicker: 'Section',       prompt: 'Retrouve le plan de cette section', rank: 2 },
    soussection: { label: 'Sous-section',      kicker: 'Sous-section',  prompt: 'Retrouve le plan de cette sous-section', rank: 3 },
    paragraphe: { label: 'Paragraphe',         kicker: 'Paragraphe',    prompt: 'Retrouve le plan de ce paragraphe', rank: 4 },
    lecon:      { label: 'Leçon',              kicker: 'Leçon',         prompt: 'Retrouve le plan de cette leçon', rank: 2 },
    doctrine:   { label: 'Doctrine',           kicker: 'Doctrine',      prompt: 'Quelle est cette position doctrinale ?' },
    retenir:    { label: 'À retenir',          kicker: 'À retenir',     prompt: 'Restitue l’essentiel' },
    // au-delà du droit : raisonner, se repérer, citer (cours d'histoire, de sciences, essais…)
    methode:    { label: 'Méthode',            kicker: 'Méthode',       prompt: 'Retrouve les étapes de cette méthode' },
    citation:   { label: 'Citation',           kicker: 'Citation',      prompt: 'Que dit cette citation, et qu’en retenir ?' },
    personne:   { label: 'Personne',           kicker: 'Personne',      prompt: 'Qui est-ce et quel est son apport ?' },
    date:       { label: 'Date',               kicker: 'Date',          prompt: 'Que s’est-il passé, et pourquoi est-ce important ?' },
    chiffre:    { label: 'Chiffre clé',        kicker: 'Chiffre',       prompt: 'Que mesure ce chiffre et que montre-t-il ?' },
    formule:    { label: 'Formule',            kicker: 'Formule',       prompt: 'Restitue la formule et le sens de chaque terme' },
    // vocabulaire universel (toutes matières) : cause et effet, raisonnement, action, description
    etape:      { label: 'Étape',              kicker: 'Étape',         prompt: 'Que fait-on à cette étape ?' },
    conseil:    { label: 'Conseil',            kicker: 'Conseil',       prompt: 'Quel est ce conseil, et comment l’appliquer ?' },
    exercice:   { label: 'Exercice',           kicker: 'Exercice',      prompt: 'Fais l’exercice : que faut-il faire ?' },
    etude:      { label: 'Étude / Expérience', kicker: 'Étude',         prompt: 'Que montre cette étude ?' },
  };
  /** Les 9 premiers gardent leurs raccourcis 1–9 ; la structure se pose avec Alt 1–5 */
  const TYPE_ORDER = ['notion', 'definition', 'idee', 'texte', 'juris', 'doctrine', 'retenir', 'methode', 'etape', 'chapitre', 'section', 'soussection', 'paragraphe', 'lecon',
    'conseil', 'exercice', 'date', 'chiffre', 'formule', 'etude', 'citation', 'personne'];
  const STRUCT_ORDER = ['chapitre', 'section', 'soussection', 'paragraphe', 'lecon'];
  /** Regroupement du menu « Type » (divulgation par familles) */
  const TYPE_GROUPS = [
    { label: 'Structure du cours', types: STRUCT_ORDER },
    { label: 'Notion', types: ['notion', 'definition', 'idee', 'retenir'] },
    { label: 'Agir', types: ['methode', 'etape', 'conseil', 'exercice'] },
    { label: 'Repères', types: ['date', 'chiffre', 'formule'] },
    { label: 'Sources', types: ['etude', 'citation', 'personne', 'texte', 'juris', 'doctrine'] },
  ];
  /** Types supprimés : leur sens est porté par le libellé du lien (« sauf », « par exemple », « entraîne »…).
      Les cartes déjà enregistrées sont migrées à la lecture (sanitize), titre et note intacts. */
  const REMOVED_TYPES = {
    exception: 'idee', condition: 'idee', fond: 'idee', forme: 'idee', effet: 'idee', cause: 'idee', consequence: 'idee',
    probleme: 'idee', solution: 'idee', argument: 'idee', critique: 'idee', nuance: 'idee', avantage: 'idee',
    inconvenient: 'idee', caracteristique: 'idee', signe: 'idee', exemple: 'idee', piege: 'idee', comparaison: 'idee',
    objectif: 'idee', question: 'idee', categorie: 'notion', theorie: 'notion',
  };
  const isStruct = (type) => !!(TYPES[type] && TYPES[type].rank);

  /* ---------------- Apparences, palette, polices (refonte des cartes, DESIGN §4.4) ---------------- */
  /** Trois apparences seulement : le type ne change plus la silhouette, juste un détail (sur-titre, chiffres…) */
  const LOOK_REF = new Set(['etude', 'citation', 'personne', 'texte', 'juris', 'doctrine']);
  const LOOK_NOTION = new Set(['chapitre', 'section', 'soussection', 'paragraphe', 'lecon', 'notion', 'definition', 'retenir']);
  const look = (type) => (LOOK_REF.has(type) ? 'ref' : LOOK_NOTION.has(type) ? 'notion' : 'idee');
  const LOOKS = { notion: 'Notion', idee: 'Idée', ref: 'Référence' };
  /** Palette partagée par les nœuds et les liens : teinte OKLCH (h) et chroma (c) ; les aplats sont dérivés par thème */
  const HUES = {
    rouge: { label: 'Rouge', h: 25, c: 0.16 }, orange: { label: 'Orange', h: 55, c: 0.15 }, ambre: { label: 'Ambre', h: 85, c: 0.14 },
    olive: { label: 'Olive', h: 115, c: 0.12 }, vert: { label: 'Vert', h: 150, c: 0.14 }, menthe: { label: 'Menthe', h: 175, c: 0.12 },
    sarcelle: { label: 'Sarcelle', h: 200, c: 0.11 }, ciel: { label: 'Ciel', h: 230, c: 0.12 }, bleu: { label: 'Bleu', h: 260, c: 0.15 },
    indigo: { label: 'Indigo', h: 285, c: 0.15 }, violet: { label: 'Violet', h: 310, c: 0.15 }, rose: { label: 'Rose', h: 345, c: 0.15 },
    ardoise: { label: 'Ardoise', h: 250, c: 0.03 },
  };
  /** Polices proposées (chargées à la demande, cf. R.fonts) — cw : chasse moyenne / corps, pour estimer la taille hors DOM.
      spec null : déjà chargée par index.html. */
  const FONTS = {
    jakarta:      { name: 'Plus Jakarta Sans', cat: 'Sans', cw: 0.54, spec: null, fb: 'system-ui, sans-serif' },
    inter:        { name: 'Inter', cat: 'Sans', cw: 0.53, spec: 'Inter:ital,wght@0,400;0,700;1,400', fb: 'system-ui, sans-serif' },
    dmsans:       { name: 'DM Sans', cat: 'Sans', cw: 0.52, spec: 'DM+Sans:ital,wght@0,400;0,700;1,400', fb: 'system-ui, sans-serif' },
    figtree:      { name: 'Figtree', cat: 'Sans', cw: 0.51, spec: 'Figtree:ital,wght@0,400;0,700;1,400', fb: 'system-ui, sans-serif' },
    manrope:      { name: 'Manrope', cat: 'Sans', cw: 0.55, spec: 'Manrope:wght@400;700', fb: 'system-ui, sans-serif' },
    outfit:       { name: 'Outfit', cat: 'Sans', cw: 0.5, spec: 'Outfit:wght@400;700', fb: 'system-ui, sans-serif' },
    atkinson:     { name: 'Atkinson Hyperlegible', cat: 'Sans', cw: 0.55, spec: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400', fb: 'system-ui, sans-serif' },
    spacegrotesk: { name: 'Space Grotesk', cat: 'Caractère', cw: 0.55, spec: 'Space+Grotesk:wght@400;700', fb: 'system-ui, sans-serif' },
    bricolage:    { name: 'Bricolage Grotesque', cat: 'Caractère', cw: 0.52, spec: 'Bricolage+Grotesque:wght@400;700', fb: 'system-ui, sans-serif' },
    sora:         { name: 'Sora', cat: 'Caractère', cw: 0.58, spec: 'Sora:wght@400;700', fb: 'system-ui, sans-serif' },
    serif4:       { name: 'Source Serif 4', cat: 'Serif', cw: 0.5, spec: null, fb: 'Georgia, serif' },
    literata:     { name: 'Literata', cat: 'Serif', cw: 0.53, spec: 'Literata:ital,wght@0,400;0,700;1,400', fb: 'Georgia, serif' },
    lora:         { name: 'Lora', cat: 'Serif', cw: 0.52, spec: 'Lora:ital,wght@0,400;0,700;1,400', fb: 'Georgia, serif' },
    garamond:     { name: 'EB Garamond', cat: 'Serif', cw: 0.45, spec: 'EB+Garamond:ital,wght@0,400;0,700;1,400', fb: 'Garamond, Georgia, serif' },
    baskerville:  { name: 'Libre Baskerville', cat: 'Serif', cw: 0.58, spec: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400', fb: 'Baskerville, Georgia, serif' },
    fraunces:     { name: 'Fraunces', cat: 'Titrage', cw: 0.53, spec: 'Fraunces:ital,wght@0,400;0,700;1,400', fb: 'Georgia, serif' },
    playfair:     { name: 'Playfair Display', cat: 'Titrage', cw: 0.5, spec: 'Playfair+Display:ital,wght@0,400;0,700;1,400', fb: 'Georgia, serif' },
    cormorant:    { name: 'Cormorant Garamond', cat: 'Titrage', cw: 0.42, spec: 'Cormorant+Garamond:ital,wght@0,400;0,700;1,400', fb: 'Garamond, Georgia, serif' },
    dmserif:      { name: 'DM Serif Display', cat: 'Titrage', cw: 0.5, spec: 'DM+Serif+Display:ital@0;1', fb: 'Georgia, serif' },
    zilla:        { name: 'Zilla Slab', cat: 'Titrage', cw: 0.48, spec: 'Zilla+Slab:ital,wght@0,400;0,700;1,400', fb: 'Rockwell, Georgia, serif' },
    mono:         { name: 'JetBrains Mono', cat: 'Mono & main', cw: 0.6, spec: null, fb: 'ui-monospace, monospace' },
    caveat:       { name: 'Caveat', cat: 'Mono & main', cw: 0.4, spec: null, fb: 'cursive' },
    kalam:        { name: 'Kalam', cat: 'Mono & main', cw: 0.5, spec: null, fb: 'cursive' },
  };
  /** Niveaux typographiques réglables (Réglages › Typographie des cartes) et leurs défauts, proches du rendu d'origine */
  const TYPO_LEVELS = {
    chapitre:    { label: 'Chapitre',     font: 'jakarta', size: 26, bold: false, prefix: false },
    section:     { label: 'Section',      font: 'jakarta', size: 21, bold: false, prefix: false },
    soussection: { label: 'Sous-section', font: 'jakarta', size: 17, bold: true,  prefix: false },
    paragraphe:  { label: 'Paragraphe',   font: 'jakarta', size: 15, bold: true,  prefix: false },
    lecon:       { label: 'Leçon',        font: 'jakarta', size: 21, bold: false, prefix: false },
    notion:      { label: 'Notion',       font: 'jakarta', size: 16, bold: true },
    idee:        { label: 'Idée',         font: 'jakarta', size: 14, bold: false },
    ref:         { label: 'Référence',    font: 'serif4',  size: 15, bold: false },
    note:        { label: 'Notes',        font: 'jakarta', size: 15, bold: false },
  };
  /** Niveau typographique d'un nœud : la structure garde le sien, le reste suit son apparence */
  const levelOf = (type) => (TYPO_LEVELS[type] && TYPES[type] && TYPES[type].rank ? type : look(type));
  const SIZE = { fs: [10, 64], w: [80, 720], h: [40, 600], r: [0, 40] };
  const inRange = (v, [a, b]) => Number.isFinite(+v) && v !== null && v !== '' && +v >= a && +v <= b;
  /** Champs de style d'un nœud, validés (une valeur hors bornes est retirée : le défaut reprend) */
  function cleanNodeStyle(n) {
    const o = {};
    if (n.color && HUES[n.color]) o.color = n.color;
    for (const k of ['w', 'h', 'r', 'fs']) if (inRange(n[k], SIZE[k])) o[k] = Math.round(+n[k]);
    if (n.font && FONTS[n.font]) o.font = n.font;
    if (typeof n.bold === 'boolean') o.bold = n.bold;
    if (typeof n.pre === 'boolean') o.pre = n.pre;
    return o;
  }
  const EDGE_DASH = ['solid', 'dash', 'dot'], EDGE_SHAPE = ['auto', 'curve', 'straight', 'elbow'], EDGE_ARROW = ['auto', 'none', 'end', 'both'];
  const SIDES = ['t', 'r', 'b', 'l'];
  /** Apparence et tracé d'un lien, validés : style, ancres (côté + position 0–1), point de courbure */
  function cleanEdgeStyle(e) {
    const o = {};
    if (e.style && typeof e.style === 'object') {
      const s = {};
      if (e.style.c && HUES[e.style.c]) s.c = e.style.c;
      if (inRange(e.style.w, [1, 8])) s.w = Math.round(+e.style.w * 2) / 2;
      if (EDGE_DASH.includes(e.style.dash) && e.style.dash !== 'solid') s.dash = e.style.dash;
      if (EDGE_SHAPE.includes(e.style.shape) && e.style.shape !== 'auto') s.shape = e.style.shape;
      if (EDGE_ARROW.includes(e.style.arrow) && e.style.arrow !== 'auto') s.arrow = e.style.arrow;
      if (Object.keys(s).length) o.style = s;
    }
    for (const k of ['a1', 'a2']) {
      const a = e[k];
      if (a && SIDES.includes(a.s)) o[k] = { s: a.s, t: inRange(a.t, [0, 1]) ? Math.round(+a.t * 1000) / 1000 : 0.5 };
    }
    if (e.bend && Number.isFinite(+e.bend.x) && Number.isFinite(+e.bend.y) && e.bend.x !== null && e.bend.y !== null) {
      o.bend = { x: U.clamp(Math.round(+e.bend.x), -4000, 4000), y: U.clamp(Math.round(+e.bend.y), -4000, 4000) };
    }
    return o;
  }
  /** Chiffres romains (préfixe « Paragraphe II ») */
  function roman(n) {
    let s = '', v = Math.max(1, Math.min(3999, n | 0));
    for (const [k, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
      while (v >= k) { s += r; v -= k; }
    }
    return s;
  }
  /** Libellé de lien : 80 caractères (double de l'ancienne limite) */
  const LABEL_MAX = 80;
  /** Dispositions de carte : arbre vers la droite, centrée (branches des deux côtés), pyramide */
  const LAYOUTS = ['right', 'balanced', 'down', 'organic'];
  /** Dossiers du plan d'un cours : le niveau (pour l'affichage) ; le numéro exact est dans `label` */
  const FOLDER_KINDS = ['partie', 'titre', 'soustitre', 'chapitre', 'section', 'soussection', 'paragraphe', 'autre'];
  const FOLDER_LABELS = { partie: 'Partie', titre: 'Titre', soustitre: 'Sous-titre', chapitre: 'Chapitre', section: 'Section', soussection: 'Sous-section', paragraphe: 'Paragraphe', autre: 'Dossier' };

  const RATINGS = {
    revoir:   { label: 'À revoir', fill: 1 },
    compris:  { label: 'Compris',  fill: 2 },
    maitrise: { label: 'Maîtrisé', fill: 3 },
  };
  const INTERVALS = [0, 1, 3, 7, 15, 30]; // jours, boîtes de Leitner 0→5
  /** Exercices d'une carte (révision) : question-réponse (auto-évaluée), QCM et vrai/faux (corrigés par l'app) */
  const EXERCISE_KINDS = {
    qa:  { label: 'Question', short: 'Question' },
    qcm: { label: 'QCM', short: 'QCM' },
    vf:  { label: 'Vrai ou faux', short: 'Vrai / faux' },
  };
  const blankReview = () => ({ box: 0, due: 0, last: 0, rating: null });
  const cleanReview = (r) => (r && typeof r === 'object' ? {
    box: U.clamp(+r.box || 0, 0, 5), due: +r.due || 0, last: +r.last || 0,
    rating: RATINGS[r.rating] ? r.rating : null,
  } : blankReview());
  /** Vrai / faux écrit à la main ou par une IA : true, "vrai", "V", "true", 1… */
  const truthOf = (v) => {
    if (typeof v === 'boolean') return v;
    const t = String(v ?? '').trim().toLowerCase();
    if (['vrai', 'v', 'true', '1', 'oui'].includes(t)) return true;
    if (['faux', 'f', 'false', '0', 'non'].includes(t)) return false;
    return null;
  };
  /** Exercices d'une carte, nettoyés : identifiants uniques, choix et réponses valides, couverture limitée aux nœuds présents */
  function sanitizeExercises(list, ids, note) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const x of list) {
      if (!x || typeof x !== 'object') { note('badExercises'); continue; }
      const kind = EXERCISE_KINDS[x.kind] ? x.kind : x.kind === 'vrai-faux' || x.kind === 'tf' ? 'vf' : x.kind === 'mcq' ? 'qcm' : null;
      const q = String(x.q ?? x.question ?? '').trim();
      if (!kind || !q) { note('badExercises'); continue; }
      let id = x.id != null && String(x.id) ? String(x.id) : U.uid('x');
      if (seen.has(id)) id = U.uid('x');
      seen.add(id);
      const ex = { id, kind, q };
      if (kind === 'qa') {
        const a = String(x.a ?? x.answer ?? '').trim();
        if (!a) { note('badExercises'); continue; }
        ex.a = a;
      } else if (kind === 'qcm') {
        const choices = Array.isArray(x.choices) ? x.choices.map((c) => String(c ?? '').trim()) : [];
        // réponse(s) : un rang (0, 1…) ou une liste de rangs (plusieurs bonnes réponses)
        const raw = Array.isArray(x.answer) ? x.answer : [x.answer];
        const good = [...new Set(raw.map((i) => +i).filter((i) => Number.isInteger(i) && i >= 0 && i < choices.length && choices[i]))];
        if (choices.length < 2 || choices.length > 8 || choices.some((c) => !c) || !good.length || good.length === choices.length) { note('badExercises'); continue; }
        ex.choices = choices;
        ex.answer = good.length === 1 ? good[0] : good.sort((a, b) => a - b);
      } else {
        const v = truthOf(x.answer);
        if (v === null) { note('badExercises'); continue; }
        ex.answer = v;
      }
      if (x.explain != null && String(x.explain).trim()) ex.explain = String(x.explain).trim();
      // nœuds couverts : la notion révisée (contexte, lien « Ouvrir dans la carte », maîtrise affichée sur le nœud)
      const listed = Array.isArray(x.nodeIds) ? x.nodeIds : x.nodeId != null ? [x.nodeId] : [];
      const cover = [...new Set(listed.map(String))];
      ex.nodeIds = cover.filter((i) => ids.has(i));
      if (ex.nodeIds.length < cover.length) note('exerciseRefs', cover.length - ex.nodeIds.length);
      ex.review = cleanReview(x.review);
      out.push(ex);
    }
    return out;
  }

  const listeners = new Set();
  const branchCache = new WeakMap();

  function blank() {
    return {
      version: 1,
      courses: [],
      folders: [],
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
    // dossiers : le plan du cours (Partie › Titre › Chapitre…), une arborescence par cours
    out.folders = Array.isArray(d.folders) ? d.folders.filter((f) => f && f.id && courseIds.has(String(f.courseId))).map((f, i) => ({
      id: String(f.id), courseId: String(f.courseId), parentId: f.parentId == null || f.parentId === '' ? null : String(f.parentId),
      kind: FOLDER_KINDS.includes(f.kind) ? f.kind : 'autre',
      label: String(f.label || '').slice(0, 60), title: String(f.title || f.label || 'Sans titre'), note: String(f.note || ''),
      order: Number.isFinite(+f.order) ? +f.order : i,
      createdAt: +f.createdAt || Date.now(), updatedAt: +f.updatedAt || Date.now(),
    })) : [];
    {
      const byId = new Map(out.folders.map((f) => [f.id, f]));
      for (const f of out.folders) {
        const p = f.parentId && byId.get(f.parentId);
        if (f.parentId && (!p || p.courseId !== f.courseId)) { f.parentId = null; note('folderParents'); continue; }
        // pas de boucle : le dossier qui la fermerait remonte à la racine du cours
        let j = p, guard = 0;
        while (j && guard++ <= out.folders.length) { if (j.id === f.id) { f.parentId = null; note('folderParents'); break; } j = j.parentId && byId.get(j.parentId); }
      }
    }
    const folderOf = new Map(out.folders.map((f) => [f.id, f.courseId]));
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
        type: TYPES[n.type] ? n.type : (note('unknownTypes'), REMOVED_TYPES[n.type] || 'idee'),
        title: String(n.title ?? ''),
        note: String(n.note ?? ''),
        x: Number.isFinite(+n.x) ? +n.x : 0,
        y: Number.isFinite(+n.y) ? +n.y : 0,
        collapsed: !!n.collapsed,
        logic: n.logic === 'et' || n.logic === 'ou' ? n.logic : null,
        // renvoi vers une unité du cours (dossier ou carte) : nœud d'une carte du plan
        ...(n.ref ? { ref: String(n.ref) } : {}),
        // mise en relief : un fragment du titre à retenir (« une ou plusieurs »)
        ...(n.em && String(n.title ?? '').toLowerCase().includes(String(n.em).toLowerCase()) ? { em: String(n.em).slice(0, 60) } : {}),
        // apparence propre au nœud : couleur, dimensions, arrondi, police, corps, gras, préfixe numéroté
        ...cleanNodeStyle(n),
        review: cleanReview(n.review),
      }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = Array.isArray(m.edges) ? m.edges.filter((e) => {
        const ok = e && ids.has(String(e.from)) && ids.has(String(e.to)) && String(e.from) !== String(e.to);
        if (!ok) note('droppedEdges');
        return ok;
      }).map((e) => ({
          id: String(e.id || U.uid('e')), from: String(e.from), to: String(e.to), kind: e.kind === 'link' ? 'link' : 'tree', label: String(e.label || '').slice(0, LABEL_MAX),
          ...(e.group ? { group: String(e.group) } : {}),
          // apparence et tracé libres (couleur, trait, forme, flèche, ancres, courbure)
          ...cleanEdgeStyle(e),
        })) : [];
      // une seule arête hiérarchique entrante par nœud, et pas de cycle (l'arête qui le fermerait
      // devient un renvoi : rien n'est perdu, la carte reste rangeable)
      const seen = new Set();
      const up = new Map();
      for (const e of edges) {
        if (e.kind !== 'tree') continue;
        if (seen.has(e.to)) { e.kind = 'link'; note('extraParents'); continue; }
        let j = e.from, loop = false;
        for (let guard = 0; j != null && guard <= edges.length; guard++) { if (j === e.to) { loop = true; break; } j = up.get(j); }
        if (loop) { e.kind = 'link'; note('treeCycles'); continue; }
        seen.add(e.to); up.set(e.to, e.from);
      }
      // positions absentes (ou toutes identiques) : la carte sera rangée automatiquement à l'ouverture
      const placed = rawNodes.filter((n) => n && Number.isFinite(+n.x) && Number.isFinite(+n.y) && n.x !== null && n.y !== null);
      const stacked = nodes.length > 1 && (placed.length < nodes.length || nodes.every((n) => n.x === nodes[0].x && n.y === nodes[0].y));
      if (stacked && rep && !m.needsLayout) note('autoLayout'); // demandé explicitement : rien à signaler
      normalizeGroups(edges);
      const exercises = sanitizeExercises(m.exercises, ids, note);
      return {
        id: String(m.id), courseId: String(m.courseId || ''), title: String(m.title || 'Sans titre'),
        // sans date (import d'IA) : l'ordre du fichier devient l'ordre d'affichage (le plus récent d'abord)
        createdAt: +m.createdAt || Date.now(), updatedAt: +m.updatedAt || Date.now() - mi,
        viewport: m.viewport && Number.isFinite(+m.viewport.k) ? { x: +m.viewport.x || 0, y: +m.viewport.y || 0, k: +m.viewport.k || 1 } : null,
        nodes, edges,
        // exercices de révision (QCM, vrai/faux, questions) : ils remplacent les fiches de la carte en révision
        ...(exercises.length ? { exercises } : {}),
        // place dans le plan du cours : dossier (null = racine du cours), rang, numéro (« Section 1 »), rôle
        folderId: m.folderId != null && folderOf.get(String(m.folderId)) === String(m.courseId || '') ? String(m.folderId) : null,
        ...(Number.isFinite(+m.order) && m.order !== null && m.order !== '' ? { order: +m.order } : {}),
        ...(m.label ? { label: String(m.label).slice(0, 60) } : {}),
        ...(m.role === 'plan' ? { role: 'plan' } : {}),
        ...(m.needsLayout || (rep && stacked) ? { needsLayout: true } : {}),
        ...(m.readOnly ? { readOnly: true } : {}),
        // disposition : celle en place (layout) et celle choisie par l'utilisateur (layoutPick, sinon automatique)
        ...(LAYOUTS.includes(m.layout) ? { layout: m.layout } : {}),
        ...(LAYOUTS.includes(m.layoutPick) ? { layoutPick: m.layoutPick } : {}),
        // couleur par type propre à la carte (« tous les <type> ») et stabilisateur des liens (0 libre → 1 orthogonal)
        ...(m.typeColors && typeof m.typeColors === 'object' && Object.keys(m.typeColors).some((t) => TYPES[t] && HUES[m.typeColors[t]])
          ? { typeColors: Object.fromEntries(Object.entries(m.typeColors).filter(([t, c]) => TYPES[t] && HUES[c])) } : {}),
        ...(inRange(m.calm, [0, 1]) && +m.calm > 0 ? { calm: Math.round(+m.calm * 100) / 100 } : {}),
        // rangement : journal des corrections appliquées et corrections refusées (elles ne reviennent pas)
        ...(Array.isArray(m.organizeLog) && m.organizeLog.length ? { organizeLog: m.organizeLog.filter((x) => x && x.key && x.title).slice(-60).map((x) => ({
          at: +x.at || 0, key: String(x.key), kind: String(x.kind || ''), title: String(x.title), detail: String(x.detail || '').slice(0, 240),
          preview: Array.isArray(x.preview) ? x.preview.slice(0, 3).map(String) : [] })) } : {}),
        ...(Array.isArray(m.organizeDeclined) && m.organizeDeclined.length ? { organizeDeclined: [...new Set(m.organizeDeclined.map(String))].slice(-200) } : {}),
      };
    }).filter((m) => {
      if (courseIds.has(m.courseId)) return true;
      // à l'import, une carte sans cours connu n'est pas perdue : elle rejoint un cours « Importé »
      if (rep) {
        let orphan = out.courses.find((c) => c._orphans);
        if (!orphan) { orphan = { id: U.uid('c'), title: 'Importé', description: 'Cartes sans cours dans le fichier importé', createdAt: Date.now(), updatedAt: Date.now(), _orphans: true }; out.courses.push(orphan); }
        m.courseId = orphan.id;
        m.folderId = null;
        note('orphanMaps');
        return true;
      }
      return false;
    }) : [];
    for (const c of out.courses) delete c._orphans;
    {
      const units = new Set([...out.folders.map((f) => f.id), ...out.maps.map((m) => m.id)]);
      for (const m of out.maps) for (const n of m.nodes) if (n.ref && !units.has(n.ref)) { delete n.ref; note('brokenRefs'); }
    }
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
      // Ranger applique de lui-même les corrections d'organisation établies (vérifiées, annulables)
      out.settings.autoOrganize = d.settings.autoOrganize !== false;
      // typographie des cartes par niveau (chapitre, section… notes) : seules les valeurs valides sont gardées
      const ty = d.settings.typo;
      if (ty && typeof ty === 'object') {
        const typo = {};
        for (const lv of Object.keys(TYPO_LEVELS)) {
          const v = ty[lv];
          if (!v || typeof v !== 'object') continue;
          const o = {};
          if (v.font && FONTS[v.font]) o.font = v.font;
          if (inRange(v.size, SIZE.fs)) o.size = Math.round(+v.size);
          if (typeof v.bold === 'boolean') o.bold = v.bold;
          if (typeof v.prefix === 'boolean' && 'prefix' in TYPO_LEVELS[lv]) o.prefix = v.prefix;
          if (v.num === '1' || v.num === 'I') o.num = v.num;
          if (Object.keys(o).length) typo[lv] = o;
        }
        if (Object.keys(typo).length) out.settings.typo = typo;
      }
    }
    return out;
  }

  const store = {
    TYPES, TYPE_ORDER, STRUCT_ORDER, TYPE_GROUPS, REMOVED_TYPES, RATINGS, INTERVALS, EXERCISE_KINDS, FOLDER_KINDS, FOLDER_LABELS,
    LOOKS, HUES, FONTS, TYPO_LEVELS, SIZE, LABEL_MAX, EDGE_DASH, EDGE_SHAPE, EDGE_ARROW, SIDES,
    isStruct, look, levelOf, roman, cleanNodeStyle, cleanEdgeStyle,
    /** Typographie effective d'un niveau (réglages par-dessus les défauts) */
    typoOf(level) {
      const base = TYPO_LEVELS[level] || TYPO_LEVELS.idee;
      const mine = (this.data.settings.typo || {})[level] || {};
      return { ...base, ...mine };
    },
    /** Style résolu d'un nœud : apparence, police, corps, gras, préfixe, couleur (nœud › type dans la carte › rien) */
    styleOf(n, map) {
      const level = levelOf(n.type);
      const t = this.typoOf(level);
      const fontKey = n.font || t.font;
      const color = n.color || (map && map.typeColors && map.typeColors[n.type]) || null;
      return {
        look: look(n.type), level, fontKey, font: FONTS[fontKey] || FONTS.jakarta,
        fs: n.fs || t.size, bold: typeof n.bold === 'boolean' ? n.bold : !!t.bold,
        prefix: !!TYPES[n.type].rank && (typeof n.pre === 'boolean' ? n.pre : !!t.prefix), num: t.num || 'I',
        color, w: n.w || 0, h: n.h || 0, r: Number.isFinite(n.r) ? n.r : null,
      };
    },
    /** Préfixe numéroté écrit devant le titre (« Paragraphe II ») — rang parmi les frères du même type, 1 s'il est seul */
    prefixOf(map, n, idx) {
      const T = TYPES[n.type];
      if (!T.rank) return '';
      const st = this.styleOf(n, map);
      const i = (idx || this.structIndex(map)).get(n.id) || 1;
      return `${T.kicker} ${st.num === '1' ? i : roman(i)}`;
    },
    /** Rang de chaque nœud de structure parmi ses frères du même type (toujours numéroté, même seul) */
    structIndex(map) {
      const out = new Map();
      const parents = new Set();
      for (const e of map.edges) if (e.kind === 'tree') parents.add(e.from);
      const lists = [this.roots(map), ...[...parents].map((id) => this.childrenOf(map, id))];
      for (const sibs of lists) {
        const k = new Map();
        for (const n of sibs) if (isStruct(n.type)) { k.set(n.type, (k.get(n.type) || 0) + 1); out.set(n.id, k.get(n.type)); }
      }
      return out;
    },
    normalizeGroups,
    sanitize, // exposé pour les tests (journal et refus du rangement survivent à l’export)
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
        // plan rangé autrement qu'en pyramide (anciennes versions) : rangé à nouveau
        for (const m of this.data.maps) if (m.role === 'plan' && m.layout !== 'down' && m.nodes.length) { m.needsLayout = true; try { laid = this.prelayout(m, true) || laid; } catch (e) { /* idem */ } }
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
      const meta = { version: d.version, courses: d.courses, folders: d.folders, settings: d.settings, savedAt };
      // miroir : même format qu'avant (+ savedAt), lisible par les anciennes versions
      let mirrorOk = false;
      try {
        localStorage.setItem(THEME_KEY, d.settings.theme);
        const head = JSON.stringify({ version: d.version, courses: d.courses, folders: d.folders, settings: d.settings, savedAt });
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
      const snap = { courses: this.data.courses.filter((c) => c.id === id), maps: this.mapsOf(id), folders: this.data.folders.filter((f) => f.courseId === id) };
      this.data.courses = this.data.courses.filter((c) => c.id !== id);
      this.data.maps = this.data.maps.filter((m) => m.courseId !== id);
      this.data.folders = this.data.folders.filter((f) => f.courseId !== id);
      this.changed();
      return snap;
    },
    restore(snap) {
      for (const c of snap.courses || []) if (!this.course(c.id)) this.data.courses.push(c);
      for (const f of snap.folders || []) if (!this.folder(f.id)) this.data.folders.push(f);
      for (const m of snap.maps || []) if (!this.map(m.id)) this.data.maps.push(m);
      // dossier supprimé : ses enfants y retournent
      for (const [id, folderId] of Object.entries(snap.homes || {})) { const x = this.map(id) || this.folder(id); if (x) x[x.nodes ? 'folderId' : 'parentId'] = folderId; }
      for (const id of snap.plans || []) { const m = this.map(id); if (m) m.role = 'plan'; }
      this.changed();
    },

    /* ---------------- Dossiers (plan du cours) ---------------- */
    folder(id) { return id ? this.data.folders.find((f) => f.id === id) : null; },
    /** Unités rangées directement dans un dossier (null = racine du cours), dans l'ordre du plan :
        dossiers et cartes mêlés par `order` ; les cartes sans rang (cours à plat) suivent, les plus récentes d'abord.
        La carte du plan (role 'plan') est à part : elle présente le dossier, elle n'en fait pas partie. */
    unitsIn(courseId, folderId = null) {
      const fid = folderId || null;
      const folders = this.data.folders.filter((f) => f.courseId === courseId && f.parentId === fid).map((f) => ({ kind: 'folder', folder: f, order: f.order, at: f.updatedAt }));
      const all = this.data.maps.filter((m) => m.courseId === courseId && (m.folderId || null) === fid);
      const maps = all.filter((m) => m.role !== 'plan').map((m) => ({ kind: 'map', map: m, order: m.order, at: m.updatedAt }));
      const items = folders.concat(maps).sort((a, b) => {
        const ha = Number.isFinite(a.order), hb = Number.isFinite(b.order);
        if (ha && hb) return a.order - b.order || a.at - b.at;
        if (ha !== hb) return ha ? -1 : 1;
        return b.at - a.at;
      });
      return { items, plan: all.find((m) => m.role === 'plan') || null };
    },
    planOf(courseId, folderId = null) { return this.unitsIn(courseId, folderId).plan; },
    hasFolders(courseId) { return this.data.folders.some((f) => f.courseId === courseId); },
    /** Chemin d'un dossier, de la racine du cours jusqu'à lui */
    folderPath(folderId) {
      const out = [];
      let f = this.folder(folderId), guard = 0;
      while (f && guard++ < 64) { out.unshift(f); f = this.folder(f.parentId); }
      return out;
    },
    /** Tous les dossiers sous un dossier (lui exclu) */
    foldersUnder(folderId) {
      const out = [];
      const stack = [folderId];
      while (stack.length) {
        const cur = stack.pop();
        for (const f of this.data.folders) if (f.parentId === cur && !out.includes(f)) { out.push(f); stack.push(f.id); }
      }
      return out;
    },
    /** Cartes d'un dossier et de ses sous-dossiers (carte du plan comprise) */
    mapsUnder(folderId) {
      const ids = new Set([folderId, ...this.foldersUnder(folderId).map((f) => f.id)]);
      return this.data.maps.filter((m) => m.folderId && ids.has(m.folderId));
    },
    folderStats(folderId) {
      const s = { maps: 0, nodes: 0, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 };
      for (const m of this.mapsUnder(folderId)) {
        const ms = this.mapStats(m);
        if (m.role !== 'plan') s.maps++;
        s.nodes += ms.nodes; s.reviewable += ms.reviewable; s.mastered += ms.mastered; s.understood += ms.understood; s.due += ms.due;
      }
      s.progress = s.reviewable ? (s.mastered + s.understood * 0.5) / s.reviewable : 0;
      return s;
    },
    nextOrder(courseId, folderId = null) {
      const { items, plan } = this.unitsIn(courseId, folderId);
      return Math.max(-1, ...items.map((x) => (Number.isFinite(x.order) ? x.order : -1)), plan && Number.isFinite(plan.order) ? plan.order : -1) + 1;
    },
    addFolder(courseId, parentId = null, { kind = 'autre', label = '', title = '', note = '' } = {}) {
      const f = { id: U.uid('f'), courseId, parentId: parentId || null, kind: FOLDER_KINDS.includes(kind) ? kind : 'autre',
        label: label.trim(), title: title.trim() || label.trim() || 'Nouveau dossier', note: note.trim(),
        order: this.nextOrder(courseId, parentId), createdAt: Date.now(), updatedAt: Date.now() };
      this.data.folders.push(f);
      const c = this.course(courseId);
      if (c) c.updatedAt = Date.now();
      this.changed();
      return f;
    },
    updateFolder(id, patch) {
      const f = this.folder(id);
      if (!f) return;
      Object.assign(f, patch, { updatedAt: Date.now() });
      this.changed();
    },
    /** Supprime un dossier sans rien perdre : son contenu remonte d'un niveau, à sa place. Renvoie de quoi annuler. */
    deleteFolder(id) {
      const f = this.folder(id);
      if (!f) return null;
      const homes = {}, plans = [];
      for (const g of this.data.folders) if (g.parentId === id) { homes[g.id] = id; g.parentId = f.parentId; g.order = f.order + (g.order || 0) / 1000; }
      for (const m of this.data.maps) if (m.folderId === id) {
        homes[m.id] = id;
        if (m.role === 'plan') { delete m.role; plans.push(m.id); } // le plan d'un dossier disparu redevient une carte
        m.folderId = f.parentId; m.order = f.order + (Number.isFinite(m.order) ? m.order : 0) / 1000;
      }
      this.data.folders = this.data.folders.filter((x) => x.id !== id);
      this.changed();
      return { folders: [f], homes, plans };
    },
    /** Ordre manuel : déplace une unité (dossier ou carte) d'un cran parmi ses voisins */
    shiftUnit(courseId, folderId, unitId, delta) {
      const { items } = this.unitsIn(courseId, folderId);
      const i = items.findIndex((x) => (x.folder || x.map).id === unitId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= items.length) return false;
      items.splice(j, 0, items.splice(i, 1)[0]);
      items.forEach((x, k) => { (x.folder || x.map).order = k; });
      this.changed();
      return true;
    },
    /** Ordre du plan d'un cours rangé en dossiers : rang de chaque carte dans le parcours du sommaire
        (carte du plan d'abord, puis les unités dans l'ordre). Vide si les cartes ne sont pas d'un même cours en dossiers. */
    planSequence(maps) {
      const out = new Map();
      const cid = maps.length && maps[0].courseId;
      if (!cid || !this.hasFolders(cid) || maps.some((m) => m.courseId !== cid)) return out;
      const walk = (fid, guard) => {
        const { items, plan } = this.unitsIn(cid, fid);
        if (plan) out.set(plan.id, out.size);
        for (const x of items) {
          if (x.map) out.set(x.map.id, out.size);
          else if (guard < 32) walk(x.folder.id, guard + 1);
        }
      };
      walk(null, 0);
      return out;
    },
    /** Où se trouve une carte : « Partie I › Chapitre 2 » (dossiers), puis la carte elle-même */
    locate(m) { return m ? this.folderPath(m.folderId) : []; },

    /* ---------------- Cartes ---------------- */
    map(id) { return this.data.maps.find((m) => m.id === id); },
    mapsOf(courseId) {
      return this.data.maps.filter((m) => m.courseId === courseId).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    recentMaps(n = 6) { return [...this.data.maps].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, n); },
    addMap(courseId, title, { rootType = 'notion', folderId = null } = {}) {
      const t = (title || '').trim() || 'Nouvelle carte';
      const root = this.newNode({ type: TYPES[rootType] ? rootType : 'notion', title: t, x: 0, y: 0 });
      const fid = folderId && this.folder(folderId) ? folderId : null;
      const m = { id: U.uid('m'), courseId, title: t, createdAt: Date.now(), updatedAt: Date.now(), viewport: null, nodes: [root], edges: [],
        folderId: fid, order: this.nextOrder(courseId, fid) };
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
      delete copy.role; // une seule carte du plan par dossier
      if (Number.isFinite(src.order)) copy.order = src.order + 0.5;
      for (const n of copy.nodes) { const nid = U.uid('n'); idMap[n.id] = nid; n.id = nid; }
      for (const e of copy.edges) { e.id = U.uid('e'); e.from = idMap[e.from]; e.to = idMap[e.to]; }
      for (const x of copy.exercises || []) { x.id = U.uid('x'); x.nodeIds = x.nodeIds.map((i) => idMap[i]).filter(Boolean); }
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
    moveMap(id, courseId, folderId = null) {
      const m = this.map(id);
      if (!m) return;
      const fid = folderId && this.folder(folderId) && this.folder(folderId).courseId === courseId ? folderId : null;
      const patch = { courseId, folderId: fid, order: this.nextOrder(courseId, fid) };
      if (m.role === 'plan') delete m.role; // le plan déplacé n'est plus le plan de son ancien dossier
      // les renvois du plan restent valables dans le même cours ; ailleurs ils n'ont plus de sens
      if (courseId !== m.courseId) for (const n of m.nodes) delete n.ref;
      this.updateMap(id, patch);
    },

    /* ---------------- Nœuds / graphe ---------------- */
    newNode(p = {}) {
      return {
        id: U.uid('n'), type: p.type || 'idee', title: p.title ?? '', note: p.note || '',
        x: p.x || 0, y: p.y || 0, collapsed: false, logic: p.logic || null, ...(p.em ? { em: p.em } : {}),
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
      // nœud d'une carte du plan qui renvoie à une unité du cours : son vrai numéro (« Partie I », « Section 2 »)
      if (n.ref) {
        const f = this.folder(n.ref);
        if (f) return f.label || FOLDER_LABELS[f.kind];
        const m = this.map(n.ref);
        if (m) return m.label || 'Carte';
      }
      // racine d'une carte du plan : le cours entier, ou le dossier qu'elle explique
      if (map.role === 'plan' && !map.edges.some((e) => e.kind === 'tree' && e.to === n.id)) {
        const f = this.folder(map.folderId);
        return f ? f.label || FOLDER_LABELS[f.kind] : 'Cours';
      }
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
      const s = { nodes: ids.length - 1, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 };
      this.tally(s, this.reviewItems(map, new Set(ids)));
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
      return !!(n.title.trim() && (n.note.trim() || this.childrenOf(map, n.id).length)) && !this.isComponent(map, n);
    },
    /** Composante d'une définition décomposée (idee sous la définition, directement ou en chaîne) :
        elle se révise avec la définition, jamais seule et hors contexte. */
    isComponent(map, n) {
      if (n.type !== 'idee') return false;
      let p = this.parentOf(map, n.id), guard = 0;
      while (p && p.type === 'idee' && guard++ < 50) p = this.parentOf(map, p.id);
      return !!(p && p.type === 'definition');
    },
    isDue(n, now = Date.now()) { return !n.review.last || n.review.due <= now; },
    /**
     * Ce qui se révise dans une carte : ses exercices (QCM, vrai/faux, questions) quand elle en a,
     * sinon ses fiches (nœuds révisables, posés comme des questions). `branch` : ensemble d'identifiants
     * de nœuds (une branche) — un exercice en fait partie s'il couvre l'un d'eux.
     * Le plan d'un dossier sert à naviguer : il ne se révise pas.
     * Élément : { map, key, review, ex? (exercice), node (nœud couvert ou fiche, contexte), nodes (couverts) }
     */
    reviewItems(map, branch = null) {
      const out = [];
      if (map.role === 'plan') return out;
      if (map.exercises && map.exercises.length) {
        for (const ex of map.exercises) {
          const nodes = ex.nodeIds.map((i) => this.node(map, i)).filter(Boolean);
          if (branch && !nodes.some((n) => branch.has(n.id))) continue;
          out.push({ map, key: 'x:' + ex.id, review: ex.review, ex, node: nodes[0] || null, nodes });
        }
        return out;
      }
      for (const n of map.nodes) {
        if (branch && !branch.has(n.id)) continue;
        if (this.isReviewable(map, n)) out.push({ map, key: n.id, review: n.review, node: n, nodes: [n] });
      }
      return out;
    },
    /** Élément de révision désigné par sa clé (identifiant de nœud, ou « x: » + identifiant d'exercice) */
    reviewItem(map, key) {
      if (!map || key == null) return null;
      key = String(key);
      if (key.startsWith('x:')) {
        const ex = (map.exercises || []).find((x) => x.id === key.slice(2));
        if (!ex) return null;
        const nodes = ex.nodeIds.map((i) => this.node(map, i)).filter(Boolean);
        return { map, key, review: ex.review, ex, node: nodes[0] || null, nodes };
      }
      const n = this.node(map, key);
      return n ? { map, key, review: n.review, node: n, nodes: [n] } : null;
    },
    /** Exercices qui couvrent un nœud (révision : la maîtrise du nœud en découle) */
    exercisesFor(map, nodeId) { return (map.exercises || []).filter((x) => x.nodeIds.includes(nodeId)); },
    tally(s, items, now = Date.now()) {
      for (const it of items) {
        s.reviewable++;
        if (it.review.rating === 'maitrise') s.mastered++;
        else if (it.review.rating === 'compris') s.understood++;
        if (this.isDue(it, now)) s.due++;
      }
      s.progress = s.reviewable ? (s.mastered + s.understood * 0.5) / s.reviewable : 0;
      return s;
    },
    mapStats(m) {
      return this.tally({ nodes: m.nodes.length, exercises: (m.exercises || []).length, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 }, this.reviewItems(m));
    },
    courseStats(id) {
      const s = { maps: 0, nodes: 0, reviewable: 0, mastered: 0, understood: 0, due: 0, progress: 0 };
      for (const m of this.mapsOf(id)) {
        const ms = this.mapStats(m);
        if (m.role !== 'plan') s.maps++; // la carte du plan présente le cours, elle n'en est pas une unité
        s.nodes += ms.nodes; s.reviewable += ms.reviewable; s.mastered += ms.mastered;
        s.understood += ms.understood; s.due += ms.due;
      }
      s.progress = s.reviewable ? (s.mastered + s.understood * 0.5) / s.reviewable : 0;
      return s;
    },
    /** Consigne de révision d'un nœud (partagée par la révision et la carte de cours) */
    promptFor(map, node) {
      const T = TYPES[node.type];
      const kids = this.childrenOf(map, node.id);
      if (!kids.length) return T.prompt;
      if (node.logic) return `${T.prompt} — ${kids.length} éléments ${node.logic === 'et' ? 'cumulatifs' : 'alternatifs'} à retrouver`;
      // définition décomposée : la consigne pose les questions de la chaîne (c'est · désigne · de qui ? · à qui ?)
      if (node.type === 'definition' && kids.some((k) => k.type === 'idee')) {
        const labels = [];
        let scope = false;
        const walk = (id) => {
          for (const k of this.childrenOf(map, id)) {
            if (k.type !== 'idee') continue;
            const l = (this.parentEdge(map, k.id) || {}).label;
            if (l && !labels.includes(l)) labels.push(l);
            if (k.em) scope = true;
            walk(k.id);
          }
        };
        walk(node.id);
        if (labels.length) return `${T.prompt} — ${labels.slice(0, 6).join(' · ')}${labels.length > 6 ? ' …' : ''}${scope ? ' (attention à la portée)' : ''}`;
      }
      // ailleurs, le nombre d'éléments à retrouver reste la consigne (les libellés sont dans la réponse)
      return `${T.prompt} — ${kids.length} élément${kids.length > 1 ? 's' : ''} à retrouver`;
    },
    /** Ordre du plan : rang de chaque nœud dans le parcours en profondeur de la carte */
    readingOrder(map) {
      const rank = new Map();
      const visit = (n) => { if (rank.has(n.id)) return; rank.set(n.id, rank.size); for (const k of this.childrenOf(map, n.id)) visit(k); };
      for (const r of this.roots(map)) visit(r);
      for (const n of map.nodes) if (!rank.has(n.id)) rank.set(n.id, rank.size);
      return rank;
    },
    /**
     * Prochaine fiche d'un cours, déterministe : d'abord la plus en retard parmi les fiches
     * déjà révisées, sinon la première fiche nouvelle (carte la plus ancienne, ordre du plan).
     * La révision lancée depuis la carte de cours commence par celle-ci (option `first`).
     */
    nextCard(courseId, now = Date.now()) {
      let late = null, fresh = null;
      const seq = this.planSequence(this.mapsOf(courseId));
      const maps = this.mapsOf(courseId).slice().sort((a, b) => (seq.size ? seq.get(a.id) - seq.get(b.id) : a.createdAt - b.createdAt));
      for (const m of maps) {
        const rank = this.readingOrder(m);
        for (const it of this.reviewItems(m)) {
          if (!this.isDue(it, now)) continue;
          if (it.review.last) { if (!late || it.review.due < late.review.due) late = it; }
          else if (!fresh) fresh = it;
          // fiches : la première dans l'ordre du plan ; exercices : l'ordre du fichier
          else if (fresh.map === m && !it.ex && rank.get(it.node.id) < rank.get(fresh.node.id)) fresh = it;
        }
      }
      return late || fresh;
    },
    /** Cartes de révision selon une portée : {all} | {courseId} | {mapId[, nodeId]} ; `first` = {mapId, nodeId} à placer en tête */
    reviewQueue(scope = {}, { all = false, limit = 20, first = null } = {}) {
      const maps = scope.mapId ? [this.map(scope.mapId)].filter(Boolean)
        : scope.folderId ? this.mapsUnder(scope.folderId)
        : scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const now = Date.now();
      const due = [], fresh = [];
      // portée « branche » : un chapitre, une leçon… (le nœud et sa descendance)
      const branch = scope.mapId && scope.nodeId && maps[0] ? new Set([scope.nodeId, ...this.descendants(maps[0], scope.nodeId)]) : null;
      const order = new Map();
      for (const m of maps) {
        const rank = this.readingOrder(m);
        this.reviewItems(m, branch).forEach((it, i) => {
          if (!(all || this.isDue(it, now))) return;
          // ordre de découverte : celui du plan pour les fiches, celui du fichier pour les exercices
          order.set(m.id + '|' + it.key, it.ex ? i : rank.get(it.node.id));
          (it.review.last ? due : fresh).push({ mapId: m.id, key: it.key, nodeId: it.node ? it.node.id : null, exId: it.ex ? it.ex.id : null, due: it.review.due, fresh: !it.review.last });
        });
      }
      due.sort((a, b) => a.due - b.due);
      // nouvelles : dans l'ordre du plan (carte la plus ancienne, puis ordre de lecture) — on
      // découvre une notion avant ses conséquences, une cause avant ses effets
      const age = new Map();
      const seq = this.planSequence(maps);
      for (const m of maps) age.set(m.id, seq.has(m.id) ? seq.get(m.id) : m.createdAt || 0);
      fresh.sort((a, b) => (age.get(a.mapId) - age.get(b.mapId)) || (order.get(a.mapId + '|' + a.key) - order.get(b.mapId + '|' + b.key)));
      const queue = [...due, ...fresh];
      if (first) {
        const k = first.key != null ? String(first.key) : first.nodeId;
        const i = queue.findIndex((q) => q.mapId === first.mapId && (q.key === k || (!q.exId && q.nodeId === k)));
        if (i > 0) queue.unshift(...queue.splice(i, 1));
      }
      return queue.slice(0, limit);
    },
    dueCount(scope = {}) { return this.reviewQueue(scope, { limit: 1e9 }).length; },
    /** Annule une note (révision) : remet l'état d'avant et retire la carte du journal du jour */
    unrate(map, target, before, day) {
      target.review = { ...before };
      if (target.nodeIds) this.syncCoverage(map, target.nodeIds);
      const log = this.data.settings.reviewLog;
      if (log[day] > 1) log[day]--; else delete log[day];
      this.changed('review');
    },
    /**
     * Charge à venir : nombre de cartes à réviser par jour, sur `days` jours à partir d'aujourd'hui
     * (aujourd'hui = cartes dues + cartes nouvelles ; les jours suivants = échéances qui tombent ce jour-là).
     */
    forecast(days = 7, scope = {}) {
      const maps = scope.folderId ? this.mapsUnder(scope.folderId) : scope.courseId ? this.mapsOf(scope.courseId) : this.data.maps;
      const t0 = U.startOfDay();
      // by : répartition par cours ({ courseId: n }), pour empiler les piles par cours
      const out = Array.from({ length: days }, (_, i) => ({ day: t0 + i * U.DAY, n: 0, by: {} }));
      const now = Date.now();
      const add = (i, m) => { out[i].n++; out[i].by[m.courseId] = (out[i].by[m.courseId] || 0) + 1; };
      for (const m of maps) for (const it of this.reviewItems(m)) {
        if (this.isDue(it, now)) { add(0, m); continue; }
        const i = Math.floor((U.startOfDay(it.review.due) - t0) / U.DAY);
        if (i > 0 && i < days) add(i, m);
      }
      return out;
    },
    /** Cartes dont la dernière note est « À revoir », les plus récentes d'abord */
    weakCards(limit = 6) {
      const list = [];
      for (const m of this.data.maps) for (const it of this.reviewItems(m)) if (it.review.rating === 'revoir') list.push(it);
      return list.sort((a, b) => b.review.last - a.review.last).slice(0, limit);
    },
    /** Note d'un exercice corrigé par l'app (QCM, vrai/faux) : faux → à revoir ; juste → compris,
        puis maîtrisé quand c'était déjà juste la fois d'avant */
    gradeFor(review, correct) {
      if (!correct) return 'revoir';
      return review.last && (review.rating === 'compris' || review.rating === 'maitrise') ? 'maitrise' : 'compris';
    },
    /** Bonne réponse ? `pick` : rang choisi (QCM), liste de rangs (QCM à plusieurs réponses), booléen (vrai/faux) */
    isCorrect(ex, pick) {
      if (ex.kind === 'vf') return pick === ex.answer;
      if (ex.kind !== 'qcm') return false;
      const good = Array.isArray(ex.answer) ? ex.answer : [ex.answer];
      const got = [...new Set(Array.isArray(pick) ? pick : [pick])];
      return got.length === good.length && got.every((i) => good.includes(i));
    },
    /** Maîtrise d'un nœud couvert par des exercices : la moins bonne de ses exercices déjà faits
        (le nœud affiche ainsi ce qui reste à travailler), échéance la plus proche */
    syncCoverage(map, ids) {
      const worst = { revoir: 0, compris: 1, maitrise: 2 };
      for (const id of ids) {
        const n = this.node(map, id);
        if (!n) continue;
        const done = this.exercisesFor(map, id).filter((x) => x.review.last);
        if (!done.length) { n.review = blankReview(); continue; }
        const r = done.reduce((a, x) => (worst[x.review.rating] < worst[a.review.rating] ? x : a)).review;
        n.review = { box: Math.min(...done.map((x) => x.review.box)), due: Math.min(...done.map((x) => x.review.due)), last: Math.max(...done.map((x) => x.review.last)), rating: r.rating };
      }
    },
    /** Note une fiche (nœud) ou un exercice */
    rate(map, target, rating) {
      const r = target.review;
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
      if (target.nodeIds) this.syncCoverage(map, target.nodeIds);
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
      for (const m of maps) for (const it of this.reviewItems(m)) {
        if (!it.review.last) continue;
        if (it.review.due <= tomorrow) count++;
        if (it.review.due > Date.now()) next = Math.min(next, it.review.due);
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
      return JSON.stringify({ format: 'ratio', version: 2, kind: 'course', exportedAt: new Date().toISOString(), courses: [c], folders: this.data.folders.filter((f) => f.courseId === id), maps: this.mapsOf(id) }, null, 2);
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
        raw = parsed.course ? { courses: [{ ...parsed.course, id: parsed.course.id || U.uid('c') }], maps: parsed.maps.map((m) => ({ ...m, courseId: m.courseId || parsed.course.id })),
          folders: (Array.isArray(parsed.folders) ? parsed.folders : []).map((f) => ({ ...f, courseId: f && f.courseId || parsed.course.id })) } : parsed;
        if (parsed.course && !parsed.course.id) for (const x of [...raw.maps, ...raw.folders]) x.courseId = raw.courses[0].id;
        // un seul cours dans le fichier : dossiers et cartes sans cours lui reviennent
        if (raw.courses && raw.courses.length === 1) for (const x of [...(raw.maps || []), ...(Array.isArray(raw.folders) ? raw.folders : [])]) if (x && !x.courseId) x.courseId = raw.courses[0].id;
      } else if (parsed && Array.isArray(parsed.nodes)) {
        kind = 'map';
        const c = { id: U.uid('c'), title: 'Importé', description: '', createdAt: Date.now(), updatedAt: Date.now() };
        raw = { courses: [c], maps: [{ ...parsed, id: parsed.id || U.uid('m'), courseId: c.id }] };
      } else throw new Error('Ce JSON ne ressemble pas à des données Ratio : il faut des cours et des cartes (« courses », « maps ») ou une carte (« nodes »).');
      const rep = {};
      const data = sanitize(raw, rep);
      if (parsed.settings) data.settings = { ...data.settings, ...sanitize({ settings: parsed.settings }).settings };
      // aperçu
      let nodes = 0, edges = 0, notes = 0, links = 0, labels = 0, exercises = 0;
      for (const m of data.maps) {
        nodes += m.nodes.length; edges += m.edges.length; exercises += (m.exercises || []).length;
        notes += m.nodes.filter((n) => n.note.trim()).length;
        links += m.edges.filter((e) => e.kind === 'link').length;
        labels += m.edges.filter((e) => e.label).length;
      }
      const collide = {
        courses: data.courses.filter((c) => this.course(c.id)).length,
        maps: data.maps.filter((m) => this.map(m.id)).length,
        folders: data.folders.filter((f) => this.folder(f.id)).length,
      };
      const issues = [];
      const say = (k, f) => { if (rep[k]) issues.push(f(rep[k])); };
      say('unknownTypes', (n) => `${U.plural(n, 'nœud')} au type inconnu → « Idée »`);
      say('droppedEdges', (n) => `${U.plural(n, 'lien')} vers un nœud absent, ignoré${n > 1 ? 's' : ''}`);
      say('extraParents', (n) => `${U.plural(n, 'second parent')} transformé${n > 1 ? 's' : ''} en renvoi`);
      say('treeCycles', (n) => `${U.plural(n, 'boucle')} de hiérarchie transformée${n > 1 ? 's' : ''} en renvoi`);
      say('duplicateNodes', (n) => `${U.plural(n, 'nœud')} en double, ignoré${n > 1 ? 's' : ''}`);
      say('nodesWithoutId', (n) => `${U.plural(n, 'nœud')} sans identifiant, ignoré${n > 1 ? 's' : ''}`);
      say('orphanMaps', (n) => `${U.plural(n, 'carte')} sans cours → rangée${n > 1 ? 's' : ''} dans « Importé »`);
      say('folderParents', (n) => `${U.plural(n, 'dossier')} au parent introuvable → à la racine du cours`);
      say('brokenRefs', (n) => `${U.plural(n, 'renvoi')} du plan vers une unité absente, retiré${n > 1 ? 's' : ''}`);
      say('badExercises', (n) => `${U.plural(n, 'exercice')} incomplet${n > 1 ? 's' : ''} (question, choix ou réponse manquants), ignoré${n > 1 ? 's' : ''}`);
      say('exerciseRefs', (n) => `${U.plural(n, 'renvoi')} d’exercice vers un nœud absent, retiré${n > 1 ? 's' : ''}`);
      say('autoLayout', (n) => `${U.plural(n, 'carte')} sans positions → rangée${n > 1 ? 's' : ''} automatiquement à l’ouverture`);
      return { kind, data, fixes, issues, collide, stats: { courses: data.courses.length, folders: data.folders.length, maps: data.maps.length, nodes, edges, notes, links, labels, exercises } };
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
          const cid = new Map(), uid = new Map();
          for (const c of inc.courses) { c.createdAt = c.updatedAt = Date.now(); if (this.course(c.id)) { const n = U.uid('c'); cid.set(c.id, n); c.id = n; } }
          for (const f of inc.folders) { if (this.folder(f.id)) { const n = U.uid('f'); uid.set(f.id, n); f.id = n; } f.courseId = cid.get(f.courseId) || f.courseId; }
          for (const f of inc.folders) if (f.parentId) f.parentId = uid.get(f.parentId) || f.parentId;
          for (const m of inc.maps) {
            if (this.map(m.id)) { const n = U.uid('m'); uid.set(m.id, n); m.id = n; }
            m.courseId = cid.get(m.courseId) || m.courseId;
            if (m.folderId) m.folderId = uid.get(m.folderId) || m.folderId;
          }
          // les renvois du plan suivent les nouveaux identifiants
          for (const m of inc.maps) for (const n of m.nodes) if (n.ref && uid.has(n.ref)) n.ref = uid.get(n.ref);
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
        for (const f of inc.folders || []) {
          const i = this.data.folders.findIndex((x) => x.id === f.id);
          if (i >= 0) this.data.folders[i] = f; else this.data.folders.push(f);
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
