/* Pioneer — audit d'organisation d'une carte (seconde ligne de contrôle après le skill d'import)
 *
 * Le rangement relit la carte comme un graphe de connaissances et cherche ce qui oblige encore
 * l'étudiant à reconstruire lui-même la logique du cours. Principe (DESIGN.md §4.4 ter) : un lien
 * libellé se lit comme une phrase vraie (« Réchauffement —entraîne→ Fonte de la banquise »).
 *
 * Échelle de preuve (la même que le skill, relation_evidence) :
 *  - SÛR : la carte dit déjà la relation — un élément NOMME l'autre dans une phrase affirmative,
 *    un renvoi [[Titre]] précédé d'un verbe, le texte d'une définition (cours de droit), le type
 *    posé par l'auteur quand le parent est une notion (pas un intitulé de section) ;
 *  - PROBABLE : indice seulement (mots rares partagés, mention dans une note, sens déduit des
 *    seuls types) — proposé décoché ;
 *  - SIGNALEMENT : défaut visible dont la correction demanderait d'inventer (sens causal inconnu,
 *    boucle ou contradiction, libellé vague, liste plate, renvoi ambigu, prérequis défini plus loin).
 * Garde-fous : jamais de verbe posé depuis un intitulé de section, jamais de lien tiré d'une
 * phrase négative (« n'entraîne pas », « ne pas confondre »), jamais de raccourci transitif ; le
 * texte des nœuds n'est jamais réécrit ; un budget de renvois par carte ; un second audit ne
 * propose plus rien (idempotence) ; check() vérifie l'intégrité après correction.
 *
 * audit(map, { declined, course }) → { fixes, notes, stats }
 *   fixes : [{ key, kind, certainty, gain, title, detail, preview, ids, apply(map) }]
 *   notes : [{ key, kind, title, detail, ids }]
 *   stats : indicateurs de la carte (metrics)
 * metrics(map) · check(map) · splitDefinition(text) · RULES · REL · LEX
 * Tests : tests/organize.test.cjs — mesure : tests/metrics.cjs
 */
(function (R) {
  'use strict';
  const { store: S, U } = R;

  /* ---- Règles : source unique, recopiée dans le skill (tests/skill-rules.cjs vérifie l'accord) ---- */
  const RULES = {
    labelledTarget: 0.6,   // part visée de relations nommées (hors structure et listes nommées)
    flatMin: 5,            // une partie de ≥ 5 éléments sans aucune relation entre eux = liste plate
    defMinChars: 80,       // définition assez longue pour être décomposée…
    defMinParts: 3,        // … en au moins 3 composantes réelles
    linkBudgetPerNodes: 5, // budget de renvois d'une carte : n / 5, borné à [2, 8] (une fourche = un renvoi)
    linkBudgetMin: 2,
    linkBudgetMax: 8,
    linksPerNodeMax: 3,    // au plus 3 renvois proposés vers une même notion
    commonWordShare: 0.15, // un mot présent dans > 15 % des nœuds ne compte plus comme indice
  };
  /** renvois d'une carte : une fourche (même group) compte pour un seul renvoi */
  const linkCount = (map) => { const g = new Set(); let n = 0; for (const e of map.edges) if (e.kind === 'link') { if (!e.group) n++; else if (!g.has(e.group)) { g.add(e.group); n++; } } return n; };
  const linkBudget = (n) => Math.max(RULES.linkBudgetMin, Math.min(RULES.linkBudgetMax, Math.round(n / RULES.linkBudgetPerNodes)));

  /* Vocabulaire parent → enfant : verbe d'un lien vers ce type (null = le type n'est pas une
     relation, aucun libellé automatique : « conseil », « définition » ne feraient que redire le
     sur-titre) et nom d'une branche qui en réunit plusieurs. */
  const REL = {
    juris:           { one: 'appliqué par', many: 'jurisprudence' },
    texte:           { one: 'fondé sur', many: 'textes' },
    doctrine:        { one: 'selon', many: 'doctrine' },
    citation:        { one: 'selon', many: 'citations' },
    etude:           { one: 'montré par', many: 'études' },
    conseil:         { one: null, many: 'conseils' },
    definition:      { one: null, many: null },
  };
  /* Libellés selon le sens de lecture (même table que le skill : edge_rules.labels.lexicon) */
  const LEX = {
    forward:  ['entraîne', 'provoque', 'produit', 'cause', 'engendre', 'aboutit à', 'mène à', 'rend possible', 'permet', 'implique', 'donc', 'favorise', 'contribue à', 'suffit à', 'nourrit', 'entretient', 'aggrave'],
    backward: ['a pour cause', 'résulte de', 'découle de', 'naît de', 'provient de', 'est causé par', 'suppose', 'exige', 'dépend de', 'nécessite', 'seulement si'],
    inhibit:  ['empêche', 'évite', 'réduit', 'affaiblit', 'protège de', 'remédie à', 'résout', 'limite', 'exclut'],
    symmetric: ['s’oppose à', 'se distingue de', '≠', 'ressemble à', 'contraire de', 'va de pair avec', 'est associé à', 'corrélé à', 'voir aussi'],
    vague:    ['lié à', 'lien', 'rapport', 'relation', 'en lien avec', 'concerne', 'cf', 'cf.', '?', '-', '→'],
  };
  const STRUCT = new Set(['chapitre', 'lecon', 'section', 'soussection', 'paragraphe']);
  const LAW_TYPES = new Set(['texte', 'juris', 'doctrine']);
  /* Couples (type source → type cible) pour lesquels les types disent la relation ; tout autre
     couple ne reçoit aucun lien causal (un problème n'est pas « résolu par » sa conséquence). */
  const CAUSAL_PAIRS = {  // couples de types qui disent la relation : plus aucun (le sens est porté par les libellés de liens)
  };

  const normCache = new Map();
  const norm = (t) => {
    t = String(t || '');
    let v = normCache.get(t);
    if (v === undefined) {
      if (normCache.size > 20000) normCache.clear();
      v = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ');
      normCache.set(t, v);
    }
    return v;
  };
  const lex = (list) => new Set(list.map((x) => norm(x).trim()));
  const FWD = lex(LEX.forward), BACK = lex(LEX.backward), INH = lex(LEX.inhibit), SYM = lex(LEX.symmetric), VAGUE = lex(LEX.vague);
  /** polarité d'un libellé : 'fwd' | 'back' | 'inh' | 'sym' | 'vague' | null */
  function polarity(label) {
    const l = norm(label).trim().replace(/\s*:$/, '');
    if (!l) return null;
    if (VAGUE.has(l)) return 'vague';
    for (const [set, p] of [[BACK, 'back'], [INH, 'inh'], [SYM, 'sym'], [FWD, 'fwd']]) for (const w of set) if (l === w || l.startsWith(w + ' ')) return p;
    return null;
  }


  const STOP = new Set(['dans', 'pour', 'avec', 'sans', 'sous', 'entre', 'leur', 'leurs', 'cette', 'celle', 'celui', 'ainsi', 'comme',
    'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'etre', 'avoir', 'fait', 'faire', 'droit', 'illustre', 'notamment', 'lorsque',
    'alors', 'aussi', 'donc', 'elle', 'elles', 'sont', 'etait', 'peut', 'doit', 'chaque', 'autre', 'autres', 'quand', 'selon',
    'votre', 'vous', 'notre', 'nous', 'leurs', 'quelque', 'avant', 'apres', 'depuis', 'parce', 'meme', 'encore', 'toujours', 'jamais']);
  // racine grossière : pluriel retiré puis 7 lettres (« besoins » = « besoin »)
  const stem = (w) => (w.length > 5 ? w.replace(/(aux|s|x)$/, '') : w).slice(0, 7);
  const tokens = (t) => (norm(t).match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)).map(stem);
  const short = (t, n = 38) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const plain = (t) => String(t || '').replace(/[#*=>`_[\]]/g, '');
  const wordsIn = (t) => norm(t).trim().split(/\s+/).filter(Boolean).length;
  /* Contre-signaux, testés sur la PROPOSITION une fois les titres mentionnés masqués (le « non »
     de « Dire non » est un sujet, pas une négation) :
     - NEG : la relation est niée (« n'entraîne pas », « aucun lien », « loin de », « ne pas confondre ») ;
     - DEBATE : la source rapporte un débat (« selon les uns… selon les autres », « le contraire ») ;
     - HYPO : hypothèse, croyance ou discours d'autrui (« si l'on croit », « idée reçue », « selon certains ») ;
     - HEDGE : réserve (« souvent », « peut », « tend à ») : la relation reste à confirmer. */
  const NEG = /\b(ne|n')\b[^.;:!?]{0,60}\b(pas|jamais|plus|aucun|aucune|guere|nullement|point)\b|\baucune?\b|\bnullement\b|\bconfondre\b|\bni\b|\bau lieu de\b|\bplutot que\b|\bloin de\b|\bsans (lien|rapport)\b/;
  const DEBATE = /\bselon les (uns|autres)\b|\bselon d'autres\b|\bc'est l'inverse\b|\ble contraire\b|\bon discute\b|\bdebat|\bcontrovers|\breste discute|\bon ignore si\b|\bsens (causal )?(inconnu|discute)/;
  const HYPO = /^\s*(si (l'on|on)\b|imaginons|supposons)|\bsi l'on croit\b|\bselon (certains|ses adversaires|ses detracteurs|une idee recue)\b|\bidee recue\b|\bon pense a tort\b|\b(croire|croit|croient|croyait) que\b|\bmythe\b|\bsoi-disant\b/;
  const HEDGE = /\b(souvent|parfois|peut|peuvent|pourrait|pourraient|tend a|tendent a|generalement|probablement|semble|semblent|en partie)\b/;

  /* ---- Contexte d'audit : tout ce qui se recalcule souvent, une seule fois (cartes de 1 000 nœuds) ---- */
  function context(map, opts = {}) {
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    const parentEdge = new Map(), kidsIds = new Map();
    for (const e of map.edges) if (e.kind === 'tree') { parentEdge.set(e.to, e); if (!kidsIds.has(e.from)) kidsIds.set(e.from, []); kidsIds.get(e.from).push(e.to); }
    const kidsCache = new Map();
    const kids = (id) => { if (!kidsCache.has(id)) kidsCache.set(id, kidsIds.has(id) ? S.childrenOf(map, id) : []); return kidsCache.get(id); };
    const parent = (id) => { const e = parentEdge.get(id); return e ? byId.get(e.from) : null; };
    const descCache = new Map();
    const desc = (id) => {
      if (descCache.has(id)) return descCache.get(id);
      const out = new Set(), stack = [...(kidsIds.get(id) || [])];
      while (stack.length) { const x = stack.pop(); if (out.has(x)) continue; out.add(x); stack.push(...(kidsIds.get(x) || [])); }
      descCache.set(id, out); return out;
    };
    const text = new Map(map.nodes.map((n) => [n.id, norm(n.title + ' ' + plain(n.note))]));
    const titleN = new Map(map.nodes.map((n) => [n.id, norm(n.title)]));
    // rareté : un mot présent dans trop de nœuds n'est pas un indice (« besoin », « gentil »…)
    const df = new Map();
    for (const n of map.nodes) for (const w of new Set(tokens(n.title + ' ' + plain(n.note)))) df.set(w, (df.get(w) || 0) + 1);
    const maxDf = Math.max(3, map.nodes.length * RULES.commonWordShare);
    const rare = (t) => new Set(tokens(t).filter((w) => (df.get(w) || 0) <= maxDf));
    const law = map.nodes.some((n) => LAW_TYPES.has(n.type))
      || map.nodes.some((n) => /\bart(icle)?\.?\s*l?\.?\s*\d|code (civil|penal|pénal|du travail|de commerce)|cour de cassation|\bcass\.|jurisprudence|juridique|\ben droit\b|\bau sens juridique\b/i.test(n.title + ' ' + n.note));
    const pairSet = new Set();
    for (const e of map.edges) { pairSet.add(e.from + '|' + e.to); pairSet.add(e.to + '|' + e.from); }
    const linked = (a, b) => pairSet.has(a + '|' + b);
    // index inversé racine → nœuds : ne tester une mention que sur les nœuds qui contiennent ses mots
    const index = new Map();
    for (const n of map.nodes) for (const w of new Set(tokens(n.title + ' ' + plain(n.note)))) { if (!index.has(w)) index.set(w, new Set()); index.get(w).add(n.id); }
    const candidates = (term) => {
      const ws = [...new Set(tokens(term))];
      if (!ws.length) return map.nodes;
      let best = null;
      for (const w of ws) { const set = index.get(w); if (!set) return []; if (!best || set.size < best.size) best = set; }
      return [...best].map((id) => byId.get(id));
    };
    const reCache = new Map();
    const termRe = (term) => {
      const t = norm(term).trim();
      if (!reCache.has(t)) reCache.set(t, t.length < 4 ? null : new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])'));
      return reCache.get(t);
    };
    /** le texte NOMME le terme dans une phrase affirmative ? (une phrase négative ne prouve rien) */
    const splitCache = new Map();
    const names = (txt, term) => {
      const re = termRe(term);
      if (!re || !re.test(txt)) return false;
      let parts = splitCache.get(txt);
      if (!parts) {
        // les deux-points séparent deux affirmations (« … n’achète plus de pain : la perte est totale ») ;
        // mais une négation courte qui annonce la suite (« Ne pas confondre : … ») vaut pour elle
        parts = [];
        for (const x of txt.split(/[.;!?\n]+/)) {
          const off = DEBATE.test(x) || HYPO.test(x);
          let carry = false;
          for (const seg of x.split(':')) { parts.push([seg, off, carry]); if (NEG.test(seg) && wordsIn(seg) <= 5) carry = true; }
        }
        splitCache.set(txt, parts);
      }
      // la négation se lit une fois le terme masqué : « Ne pas savoir dire non » n'est pas nié par son propre titre
      for (const [sentence, off, carry] of parts) if (!off && !carry && re.test(sentence) && !NEG.test(sentence.replace(re, ' § '))) return true;
      return false;
    };
    // titres en double : un titre partagé ne désigne personne en particulier
    const titleCount = new Map();
    for (const n of map.nodes) titleCount.set(norm(n.title).trim(), (titleCount.get(norm(n.title).trim()) || 0) + 1);
    return { map, opts, byId, kids, parent, desc, text, titleN, rare, law, linked, names, termRe, candidates, index, titleCount, parentEdgeOf: (id) => parentEdge.get(id), declined: opts.declined || new Set() };
  }
  const lineage = (c, a, b) => c.desc(a).has(b) || c.desc(b).has(a);
  /** intitulé de partie : chapitre, leçon, section — ou nœud dont le titre est une question */
  const heading = (n) => !n || STRUCT.has(n.type) || /\?\s*$/.test(n.title);

  /* Le titre du parent nomme déjà la famille (« Les 10 signes », « Pourquoi… », « 5 conseils
     pour… ») : une branche ou un libellé répété n'ajouterait que du bruit. */
  const NAMED = {
    conseil: /conseils?|astuces?|techniques?|etapes?|comment|facons?|moyens?|cles?\b|regles?|habitudes?/,
    juris: /jurisprudence|arrets?/, texte: /textes?|articles?/, etude: /etudes?|recherches?/,
  };
  const named = (p, type) => /(^|\s)\d+\s/.test(' ' + norm(p.title)) || (NAMED[type] && NAMED[type].test(norm(p.title)));

  /* ---- Branches : une famille de relations (≥ 2) réunie sous un libellé commun ----
     Seulement quand le parent mêle plusieurs familles (option B du skill) : une branche qui
     réunit TOUS les enfants ne dit rien de plus que le parent. */
  function branches(c, quiet, busy) {
    const out = [];
    for (const p of c.map.nodes) {
      if (p.logic || heading(p)) continue;
      const ks = c.kids(p.id);
      if (ks.length < 3) continue;
      const fam = new Map();
      for (const k of ks) {
        const r = REL[k.type];
        const e = c.parentEdgeOf(k.id);
        if (!r || !r.many || !e || e.group || e.label || busy.has(k.id)) continue;
        if (!fam.has(k.type)) fam.set(k.type, []);
        fam.get(k.type).push(k);
      }
      for (const [type, list] of fam) {
        if (list.length < 2) continue;
        if (named(p, type) || list.length === ks.length) { for (const k of list) quiet.add(k.id); continue; }
        const label = REL[type].many;
        out.push({
          key: 'br:' + p.id + ':' + type, kind: 'branch', certainty: 'sure', gain: 2,
          title: `Regrouper ${list.length} ${label} de « ${short(p.title, 30)} »`,
          detail: `« ${short(p.title, 30)} » mêle plusieurs familles : une branche nommée dit d’un coup d’œil ce que sont ces éléments pour lui.`,
          preview: [`${short(p.title, 30)} —${label}→ ${list.map((k) => short(k.title, 22)).join(' · ')}`],
          ids: list.map((k) => k.id),
          apply(m) {
            const g = U.uid('g');
            const members = list.map((k) => S.parentEdge(m, k.id)).filter((e) => e && e.from === p.id && !e.group && !e.label);
            if (members.length < 2) return;
            for (const e of members) { e.group = g; e.label = label; }
            regroupOrder(m, p.id, new Set(members.map((e) => e.to)));
          },
        });
      }
    }
    return out;
  }
  /** Rend contigus, dans l'ordre de lecture, les enfants d'un même groupe : les enfants échangent
      leurs emplacements (quel que soit l'axe de lecture de la disposition), sous-branches comprises. */
  function regroupOrder(m, pid, ids) {
    const ks = S.childrenOf(m, pid);
    const firstIdx = ks.findIndex((k) => ids.has(k.id));
    if (firstIdx < 0) return;
    const rest = ks.filter((k) => !ids.has(k.id)), grp = ks.filter((k) => ids.has(k.id));
    const order = [...rest.slice(0, firstIdx), ...grp, ...rest.slice(firstIdx)];
    const slots = ks.map((k) => ({ x: k.x, y: k.y }));
    const moves = order.map((k, i) => ({ k, dx: slots[i].x - k.x, dy: slots[i].y - k.y }));
    for (const { k, dx, dy } of moves) for (const id of [k.id, ...S.descendants(m, k.id)]) { const n = S.node(m, id); if (n) { n.x += dx; n.y += dy; } }
  }

  /* ---- Libellés : le verbe de chaque relation, une proposition par parent ----
     Jamais depuis un intitulé (section, chapitre, question) : « Chapitre 3 —entraîne→ Inflation »
     serait faux ; jamais quand le titre du parent nomme déjà la liste. */
  function labels(c, taken) {
    const byParent = new Map();
    for (const e of c.map.edges) {
      if (e.kind !== 'tree' || e.label || e.group) continue;
      const k = c.byId.get(e.to), p = c.byId.get(e.from);
      if (!k || !p || p.logic || heading(p) || taken.has(k.id)) continue;
      const r = REL[k.type];
      if (!r || !r.one || STRUCT.has(k.type) || named(p, k.type)) continue;
      if (p.type === 'methode' && k.type === 'etape') continue; // frise : la flèche suffit
      // sous une définition, un exemple bloquerait sa décomposition — sauf si elle ne se décompose pas
      if (!byParent.has(p.id)) byParent.set(p.id, { p, list: [] });
      byParent.get(p.id).list.push({ e, k, label: r.one });
    }
    return [...byParent.values()].map(({ p, list }) => ({
      key: 'lbl:' + p.id + ':' + list.map((x) => x.e.id).join(','), kind: 'label', certainty: 'sure', gain: 1,
      title: `Nommer ${list.length > 1 ? list.length + ' relations' : 'la relation'} de « ${short(p.title, 30)} »`,
      detail: 'Le type posé par l’auteur dit la relation : écrite sur le lien, elle se lit comme une phrase.',
      preview: list.map((x) => `${short(p.title, 24)} —${x.label}→ ${short(x.k.title, 26)}`),
      ids: list.map((x) => x.k.id),
      apply(m) { for (const x of list) { const e = m.edges.find((y) => y.id === x.e.id); if (e && !e.label && !e.group) e.label = x.label; } },
    }));
  }

  /* ---- Éléments d'application posés à côté de ce qu'ils servent ----
     « Le refus en 4 paliers » suivi, dans la même partie, de 4 étapes : elles détaillent la méthode.
     Preuves : CARDINALITÉ (le nombre annoncé = la série), CONTIGUÏTÉ (la série suit l'annonce, même
     type, rien d'intercalé), NOM (le mot annoncé reprend le type ou les titres de la série).
     Trois preuves : sûr ; deux : probable ; série ambiguë (deux annonces pour une série) : rien. */
  const NUMS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
  const countsOf = (t) => [...String(t || '').matchAll(/\b(\d|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+([a-z]{4,})/g)]
    .map((m) => ({ n: NUMS[m[1]] || +m[1], noun: stem(m[2]), raw: m[0] })).filter((x) => x.n >= 2 && x.n <= 10);
  const countOf = (t) => countsOf(t)[0] || null;
  function applications(c) {
    const out = [], claims = new Map();
    for (const h of c.map.nodes) {
      if (!heading(h)) continue;
      const ks = c.kids(h.id);
      ks.forEach((p, i) => {
        if (STRUCT.has(p.type) || p.type === 'retenir') return;
        const m = (c.titleN.get(p.id) + ' ' + norm(plain(p.note)).slice(0, 160)).match(/\b(\d|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+([a-z]{4,})/);
        if (!m) return;
        const n = NUMS[m[1]] || +m[1];
        if (n < 2 || n > 10) return;
        const run = [];
        for (let j = i + 1; j < ks.length && run.length <= n; j++) { if (run.length && ks[j].type !== run[0].type) break; run.push(ks[j]); }
        if (run.length !== n || STRUCT.has(run[0].type) || run[0].type === p.type || c.kids(p.id).some((k) => k.type === run[0].type)) return;
        if (run.some((k) => { const e = c.parentEdgeOf(k.id); return !e || e.label || e.group; })) return;
        const noun = stem(m[2]);
        const typeWord = norm(S.TYPES[run[0].type].label);
        const nameProof = typeWord.startsWith(noun.slice(0, 5)) || run.filter((k) => tokens(k.title + ' ' + plain(k.note)).includes(noun)).length * 2 >= n;
        const key = run.map((k) => k.id).join(',');
        if (claims.has(key)) { claims.set(key, null); return; }
        claims.set(key, { p, run, certainty: nameProof ? 'sure' : 'probable', noun: m[0] });
      });
    }
    for (const x of claims.values()) {
      if (!x) continue;
      const { p, run, certainty } = x;
      const label = p.type === 'methode' && run[0].type === 'etape' ? '' : (REL[run[0].type] && REL[run[0].type].one) || '';
      out.push({
        key: 'ap:' + p.id + '>' + run.map((k) => k.id).join(','), kind: 'reparent', certainty, gain: 5, ids: [run[0].id, p.id, ...run.slice(1).map((k) => k.id)], structural: true,
        title: `Ranger ${run.length} ${S.TYPES[run[0].type].label.toLowerCase()}s sous « ${short(p.title, 28)} »`,
        detail: `« ${short(p.title, 28)} » annonce « ${x.noun} » et la série qui suit en compte exactement ${run.length}` + (certainty === 'sure' ? ', du même nom : ce sont ses éléments.' : ' — à confirmer : le nom ne la désigne pas.'),
        preview: run.map((k) => `${short(p.title, 24)} —${label || '→'}→ ${short(k.title, 28)}`),
        apply(mm) {
          const es = run.map((k) => S.parentEdge(mm, k.id));
          if (!S.node(mm, p.id) || es.some((e, i) => !e || e.from !== c.parentEdgeOf(run[i].id).from || e.label || e.group)) return;
          for (const e of es) { e.from = p.id; if (label) e.label = label; }
        },
      });
    }
    return out;
  }

  /* ---- Cause → effet entre éléments d'une même partie ----
     Seulement sous un intitulé (section) : sous une notion, ses causes et ses conséquences sont
     reliées À ELLE, les relier entre elles court-circuiterait la notion. Le libellé dépend du
     couple de types (CAUSAL_PAIRS) ; la preuve, d'une mention affirmative. */
  function causal(c) {
    const out = [];
    for (const p of c.map.nodes) {
      if (!heading(p)) continue;
      const ks = c.kids(p.id);
      for (const a of ks) for (const b of ks) {
        const label = CAUSAL_PAIRS[a.type + '>' + b.type];
        if (!label || a === b || c.linked(a.id, b.id)) continue;
        const said = c.names(c.text.get(b.id), a.title) || c.names(c.text.get(a.id), b.title);
        let certainty = said ? 'sure' : null;
        if (!certainty) {
          const pw = c.rare(p.title);
          let n = 0; const aw = c.rare(a.title + ' ' + plain(a.note));
          for (const w of c.rare(b.title + ' ' + plain(b.note))) if (aw.has(w) && !pw.has(w)) n++;
          if (n >= 2 && !NEG.test(c.text.get(b.id))) certainty = 'probable';
        }
        if (!certainty) continue;
        out.push({
          key: 'ce:' + a.id + '>' + b.id, kind: 'causal', certainty, gain: 4, link: true,
          title: `Relier « ${short(a.title, 26)} » à « ${short(b.title, 26)} »`,
          detail: certainty === 'sure' ? 'L’un nomme l’autre ; leurs types disent lequel produit l’autre.'
            : 'Ils parlent de la même chose et leurs types donnent le sens — à confirmer : la carte ne dit pas que l’un produit l’autre.',
          preview: [`${short(a.title, 28)} —${label}→ ${short(b.title, 28)}`],
          ids: [a.id, b.id],
          apply(m) { if (!S.node(m, a.id) || !S.node(m, b.id) || m.edges.some((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id))) return; m.edges.push({ id: U.uid('e'), from: a.id, to: b.id, kind: 'link', label }); },
        });
      }
    }
    return out;
  }

  /* ---- Relations transversales : un élément qui nomme une notion définie ailleurs ----
     Une mention n'est pas une dépendance : toujours « probable ». */
  function crossRefs(c, planned) {
    const out = [];
    const map = c.map;
    const root = map.nodes.find((n) => !c.parentEdgeOf(n.id));
    const targets = map.nodes.filter((n) => (n.type === 'definition' || n.type === 'notion') && n !== root && n.title.trim().length >= 4
      && !c.names(norm(map.title), n.title) && !(root && c.names(c.titleN.get(root.id), n.title)));
    for (const b of targets) {
      if (c.titleCount.get(norm(b.title).trim()) > 1) continue; // homonymes : le titre ne désigne personne
      const single = wordsIn(b.title) < 2;
      // un mot seul ne compte que dans un titre (« Partie » dans « en partie d'accord » n'est pas la notion)
      const users = c.candidates(b.title).filter((a) => a !== b && c.names(single ? c.titleN.get(a.id) : c.text.get(a.id), b.title));
      if (users.length > Math.max(3, map.nodes.length * 0.25)) continue; // le sujet de la carte : partout
      let per = map.edges.filter((e) => e.kind === 'link' && e.to === b.id).length;
      users.sort((x, y) => c.names(c.titleN.get(y.id), b.title) - c.names(c.titleN.get(x.id), b.title));
      for (const a of users) {
        if (per >= RULES.linksPerNodeMax) break;
        if (STRUCT.has(a.type) || a.type === 'retenir' || a === root || c.linked(a.id, b.id) || lineage(c, a.id, b.id) || planned.has(a.id + '>' + b.id)) continue;
        const pa = c.parent(a.id), pb = c.parent(b.id);
        if (pa && pb && pa === pb && !heading(pa)) continue; // frères sous une même idée
        const label = 'fait appel à';
        per++;
        out.push({
          key: 'x:' + a.id + '>' + b.id, kind: 'cross', certainty: 'probable', gain: 2, link: true,
          title: `Relier « ${short(a.title, 26)} » à la notion « ${short(b.title, 26)} »`,
          detail: `${c.names(c.titleN.get(a.id), b.title) ? 'Son titre' : 'Sa note'} nomme cette notion, définie ailleurs — à confirmer : une mention ne dit pas toujours une dépendance.`,
          preview: [`${short(a.title, 28)} —${label}→ ${short(b.title, 28)}`],
          ids: [a.id, b.id],
          apply(m) { if (!S.node(m, a.id) || !S.node(m, b.id) || m.edges.some((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id))) return; m.edges.push({ id: U.uid('e'), from: a.id, to: b.id, kind: 'link', label }); },
        });
      }
    }
    return out;
  }

  /* =====================================================================================
     Lecture des notes : les relations que le TEXTE affirme entre deux nœuds
     -------------------------------------------------------------------------------------
     Une relation n'est retenue que si plusieurs familles de preuves indépendantes concordent :
       MENTION    — l'autre nœud est nommé (titre exact et unique ; ou ≥ 2 racines rares de son titre) ;
       CONNECTEUR — un verbe ou une locution orientée relie les deux dans la même proposition
                    (« provoque », « parce que », « sauf si », « pour vaincre », « illustre »…) ;
       POSITION   — qui est sujet, qui est objet (avant / après le connecteur ; à défaut, le nœud
                    qui porte la note est le sujet implicite) ;
     et qu'aucun contre-signal ne s'y oppose (négation, débat, hypothèse, question, citation).
     Le RÔLE d'un nœud n'est pas déduit de son type : il est lu pour CETTE relation. Le type ne sert
     qu'à contrôler la cohérence (un texte qui contredit les types → décision rétrogradée et
     retypage proposé, jamais l'inverse).
     Décision : « sûre » (appliquée par le rangement) quand mention exacte + connecteur explicite +
     pas de réserve ni de conflit de types ; « probable » (proposée) sinon ; contre-signal → rien,
     et un signalement quand la source rapporte un débat.
     ===================================================================================== */
  const CONNECTORS = [
    // famille, sens ('fwd' : sujet → mention qui suit ; 'back' : la mention qui suit → sujet), verbe affiché
    { re: /\b(parce que|parce qu'|car|a cause de|a cause d'|du fait de|du fait d'|en raison de|decoulen?t? de|resulten?t? de|vien(?:nen)?t de|provien(?:nen)?t de|issue?s? de|issue?s? d'|est due? a|sont dus a|sous l'effet de|nai(?:ssen)?t de)\b/, fam: 'cause', dir: 'back', verb: 'entraîne' },
    { re: /\b(favoris(?:e|ent|er))\b/, fam: 'cause', dir: 'fwd', verb: 'favorise' },
    { re: /\b(entretien(?:nen)?t)\b/, fam: 'cause', dir: 'fwd', verb: 'entretient' },
    { re: /\b(aggrav(?:e|ent|er))\b/, fam: 'cause', dir: 'fwd', verb: 'aggrave' },
    { re: /\b(entrain(?:e|ent|er)|provoqu(?:e|ent|er)|causen?t? (?=l'|la |le |les |un |une |des |d')|engendr(?:e|ent|er)|mene(?:nt)? a|conduisen?t? a|conduit a|aboutit a|aboutissent a|debouche sur|declench(?:e|ent|er)|creen?t?|suscite(?:nt)?|generen?t?|nourri(?:ssen)?t|renforcen?t?|stimulen?t?|accroi(?:ssen)?t|augmenten?t?|abimen?t?|endommagen?t?|detrui(?:sen)?t|alteren?t?|pousse(?:nt)? a|est (?:la|une) source de|si bien que|c'est pourquoi|de sorte que|donc)\b/, fam: 'cause', dir: 'fwd', verb: 'entraîne' },
    { re: /\b(pour vaincre|pour sortir de|pour lutter contre|pour surmonter|pour corriger|remede a|reponse a|repond a|vient a bout de|lutte contre|remedie a)\b/, fam: 'inhibit', dir: 'fwd', verb: 'remédie à' },
    { re: /\b(empech(?:e|ent|er)|evit(?:e|ent|er)|reduisen?t?|redui(?:t|re)|attenuen?t?|amorti(?:ssen)?t|compensen?t?|freinen?t?|ralenti(?:ssen)?t|combat(?:tent)?|corrigen?t?|protegen?t? de|apaisen?t?)\b/, fam: 'inhibit', dir: 'fwd', verb: null },
    { re: /\b(limiten?t?|restreignen?t?|restreint)\b/, fam: 'limit', dir: 'fwd', verb: 'limite' },
    { re: /\b(pour mener a|pour obtenir|pour aboutir a|necessaire a|necessaire pour|requise? pour|permet(?:tent|tre)?|rend possible|ouvre droit a|conditionnen?t?)\b/, fam: 'enable', dir: 'fwd', verb: 'permet' },
    { re: /\b(seulement si|que si|a condition que|a condition qu'|a condition de|supposen?t?|necessiten?t?|exigen?t?|requiert|requierent|dependen?t? de)\b/, fam: 'require', dir: 'fwd', verb: 'suppose' },
    { re: /\b(sauf si|sauf|excepte|hormis|a moins que|a moins qu')\b/, fam: 'exception', dir: 'fwd', verb: 'sauf' },
    { re: /\b(fait exception a|exception a|deroge a|derogation a)\b/, fam: 'exceptionOf', dir: 'fwd', verb: 'fait exception à' },
    { re: /\b(illustren?t?|est un exemple de|exemple de|en est un exemple)\b/, fam: 'example', dir: 'fwd', verb: 'illustre' },
    { re: /\b(se distinguen?t? de|a la difference de)\b/, fam: 'oppose', dir: 'fwd', verb: 'se distingue de' },
    { re: /\b(a l'inverse de|contrairement a|s'opposen?t? a|oppose a)\b/, fam: 'oppose', dir: 'fwd', verb: 's’oppose à' },
    { re: /\b(selon|d'apres)\b/, fam: 'source', dir: 'fwd', verb: 'selon' },
    // succession (étapes seulement) : « Quand les gouttelettes de la condensation grossissent… » — l'étape nommée précède
    { re: /^(quand|lorsque|une fois|des que|apres)\b/, fam: 'seq', dir: 'back', verb: 'puis' },
    { re: /\b(sanctionnen?t?|utilisen?t?|s'appuien?t? sur|mobilisen?t?|met(?:tent)? en oeuvre|appliquen?t?)\b/, fam: 'refer', dir: 'fwd', verb: 'fait appel à' },
  ];
  const INHIBIT_VERB = [[/empech/, 'empêche'], [/evit/, 'évite'], [/redui|reduis/, 'réduit'], [/attenu|amorti/, 'atténue'], [/compens/, 'compense'], [/frein|ralenti/, 'freine'], [/combat|corrig|apais|protege/, 'remédie à']];
  // verbe inverse quand la relation se lit depuis l'autre bout (parent → enfant)
  const INVERSE = { cause: 'a pour cause', inhibit: 'combattu par', limit: 'limité par', enable: 'suppose', require: 'permet', exceptionOf: 'sauf', example: 'illustré par', oppose: null, part: 'comprend', seq: null, source: null, refer: null };

  /** Phrases d'une note, débarrassées des citations, avec leurs drapeaux */
  function sentencesOf(note) {
    let t = norm(plain(note)).replace(/«[^»]*»/g, ' ').replace(/"[^"]*"/g, ' ');
    return String(note || '').split('\n').some((l) => /^\s*>/.test(l)) ? [] // une note-citation rapporte les mots d'un autre
      : t.split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 3)
        .map((x) => ({ text: x, question: /\?/.test(x), hypo: HYPO.test(x), debate: DEBATE.test(x), hedge: HEDGE.test(x) }));
  }

  function phraseRelations(c, notes) {
    const rels = [];
    const nodes = c.map.nodes;
    const usable = (n) => n && !STRUCT.has(n.type) && n.type !== 'retenir' && n.title.trim().length >= 3;
    // une fois par audit : ce qui peut être mentionné, et par quel mot on le cherche (sa racine la plus rare)
    const info = new Map(), keyIndex = new Map(), loose = [];
    const dfOf = (w) => (c.index.get(w) || { size: 0 }).size;
    const surnames = new Map();
    for (const n of nodes) if (n.type === 'personne' && wordsIn(n.title) >= 2) { const last = norm(n.title).trim().split(/\s+/).pop(); if (last.length >= 4) surnames.set(last, surnames.has(last) ? null : n); }
    for (const n of nodes) {
      if (!usable(n)) continue;
      const tn = norm(n.title).trim(), words = wordsIn(n.title);
      // mention forte : titre exact, unique, assez distinctif ; moyenne : ≥ 2 racines rares du titre
      const strong = (c.titleCount.get(tn) || 0) === 1 && (words >= 2 || tn.length >= 6 || n.type === 'notion' && tn.length >= 4);
      const alias = n.type === 'personne' && surnames.get(tn.split(/\s+/).pop()) === n ? c.termRe(tn.split(/\s+/).pop()) : null;
      const x = { n, strong, re: c.termRe(n.title), alias, roots: [...c.rare(n.title)], single: words < 2 ? stem((tn.match(/[a-z]{5,}/) || [''])[0]) : null };
      info.set(n.id, x);
      const ts = tokens(n.title);
      if (!ts.length) { loose.push(x); continue; }
      const key = ts.reduce((m, w) => (dfOf(w) < dfOf(m) ? w : m));
      if (!keyIndex.has(key)) keyIndex.set(key, []);
      keyIndex.get(key).push(x);
      if (alias) { const k2 = tokens(tn.split(/\s+/).pop())[0]; if (k2 && k2 !== key) { if (!keyIndex.has(k2)) keyIndex.set(k2, []); keyIndex.get(k2).push(x); } }
    }
    function mentionsIn(clause, owner) {
      const out = [];
      const ownRoots = new Set(tokens(owner.title));
      const seen = new Set();
      const toks = new Set(tokens(clause));
      const cands = [...loose];
      for (const w of toks) for (const x of keyIndex.get(w) || []) cands.push(x);
      for (const x of cands) {
        const n = x.n;
        if (seen.has(n.id) || n.id === owner.id) continue;
        seen.add(n.id);
        // un titre d'un seul mot repris par le titre du porteur (« Partie » / « Identifier les parties ») : le mot, pas la notion
        if (x.single && ownRoots.has(x.single)) continue;
        const m = x.strong && x.re ? x.re.exec(clause) : null;
        if (m) { out.push({ n, pos: m.index + m[1].length, end: m.index + m[0].length, strong: true }); continue; }
        const ma = x.alias ? x.alias.exec(clause) : null; // « selon Freud » nomme « Sigmund Freud » (seule personne de ce nom)
        if (ma) { out.push({ n, pos: ma.index + ma[1].length, end: ma.index + ma[0].length, strong: true }); continue; }
        if (x.roots.length >= 2 && x.roots.every((r) => toks.has(r))) {
          const first = Math.min(...x.roots.map((r) => { const i = clause.search(new RegExp('\\b' + r)); return i < 0 ? 1e9 : i; }));
          out.push({ n, pos: first, end: first + 1, strong: false });
        }
      }
      // un titre contenu dans un autre (« Crédit » dans « Renchérissement du crédit ») : on garde le plus long
      return out.filter((a) => !out.some((b) => b !== a && b.strong && b.pos <= a.pos && b.end >= a.end && b.end - b.pos > a.end - a.pos)).sort((a, b) => a.pos - b.pos);
    }
    const mask = (clause, ms) => { let t = clause; for (const m of ms.slice().sort((a, b) => b.pos - a.pos)) t = t.slice(0, m.pos) + ' § ' + t.slice(m.end); return t; };
    for (const owner of nodes) {
      if (!usable(owner) || owner.type === 'citation' || !owner.note.trim()) continue;
      const sents = sentencesOf(owner.note);
      sents.forEach((sent, si) => {
        const clauses = sent.text.split(/[,:;—()]|\s(?=mais\s)|\s(?=puis\s)/).map((x) => x.trim()).filter(Boolean);
        let pending = [], lastObj = null;
        for (const clause of clauses) {
          const ms = mentionsIn(clause, owner);
          let conn = null;
          for (const k of CONNECTORS) { const m = k.re.exec(clause); if (m && (!conn || m.index < conn.pos)) conn = { k, pos: m.index, end: m.index + m[0].length, word: m[0] }; }
          if (!conn) {
            // énumération (« La sédentarité, l’alimentation… et la génétique favorisent… ») : les sujets attendent leur verbe
            pending = ms.length && wordsIn(clause) <= 6 ? [...pending, ...ms] : [];
            if (!ms.length) lastObj = null;
            continue;
          }
          if (sent.question || sent.hypo || NEG.test(mask(clause, ms))) { pending = []; lastObj = null; continue; }
          if (sent.debate) {
            if (conn.k.fam === 'cause' && ms.length) notes.push(note('deb:' + owner.id + ':' + ms.map((x) => x.n.id).join(','), 'ambiguous', `Relation discutée : « ${short(owner.title, 24)} » / « ${short(ms[0].n.title, 24)} »`,
              'La note rapporte un débat sur le sens de la relation : rien n’est tracé tant que le cours ne tranche pas.', [owner.id, ...ms.map((x) => x.n.id)]));
            pending = []; continue;
          }
          const { fam, dir } = conn.k;
          if (fam === 'seq' && !(owner.type === 'etape')) { pending = []; continue; }
          const hedge = HEDGE.test(clause);
          let before = ms.filter((x) => x.end <= conn.pos);
          const after = ms.filter((x) => x.pos >= conn.end);
          if (pending.length && before.length + pending.length <= 6) before = [...pending, ...before];
          // « …, ce qui entretient X » : le sujet est ce que la proposition précédente vient de produire
          if (!before.length && lastObj && /^(ce qui|ce que|qui|ce dernier|cela|celle-ci|celui-ci)\b/.test(clause)) before = [lastObj];
          pending = [];
          if (!ms.length && !before.length) { lastObj = null; continue; }
          let verb = conn.k.verb;
          if (fam === 'inhibit' && !verb) verb = (INHIBIT_VERB.find(([re]) => re.test(conn.word)) || [0, 'remédie à'])[1];
          const ownerM = { n: owner, strong: true, owner: true };
          const push = (x, y) => {
            if (!x || !y || x.n === y.n) return;
            rels.push({ a: x.n, b: y.n, fam, verb, strong: x.strong && y.strong, hedge, owner, sentence: clause });
          };
          if (fam === 'source') { for (const y of after) if (y.n.type === 'personne' || y.n.type === 'etude' || y.n.type === 'doctrine') push(before[before.length - 1] || ownerM, y); continue; }
          if (dir === 'back') {
            // « S … parce que M » : M produit S (S = mention avant le connecteur, à défaut la note)
            const subj = before.length ? before[before.length - 1] : ownerM;
            for (const y of after) push(y, subj);
            lastObj = subj;
          } else {
            const subjects = before.length ? before : [ownerM];
            const objects = after.length ? after : before.length ? [ownerM] : [];
            for (const x of subjects) for (const y of objects) push(x, y);
            lastObj = objects[objects.length - 1] || null;
          }
        }
        // partie d'un tout : « Prolongements courts du neurone », « Frontière de la cellule »
        if (si === 0 && ['idee', 'notion'].includes(owner.type)) {
          const head = sent.text.split(/[,:;—()]/)[0];
          for (const m of mentionsIn(head, owner)) {
            if (!m.strong || !['notion', 'definition', 'idee'].includes(m.n.type)) continue;
            const pre = head.slice(Math.max(0, m.pos - 7), m.pos);
            if (!/\b(du|de la|de l'|des)\s*$/.test(pre) || head.slice(0, m.pos).split(/\s+/).length > 7 || NEG.test(head)) continue;
            rels.push({ a: owner, b: m.n, fam: 'part', verb: 'fait partie de', strong: true, hedge: false, owner, sentence: head });
          }
        }
      });
    }
    return rels;
  }

  /** Les relations lues dans les notes deviennent des corrections : libellé d'une arête existante,
      rattachement sous l'élément précisé (exemple, exception, condition, partie), ou renvoi. */
  function phrases(c, notes) {
    const rels = phraseRelations(c, notes);
    // une partie rattachée par ≥ 2 éléments au même tout : structure confirmée (deux preuves)
    const partCount = new Map();
    for (const r of rels) if (r.fam === 'part') partCount.set(r.b.id, (partCount.get(r.b.id) || 0) + 1);
    const best = new Map();
    for (const r of rels) {
      if (r.fam === 'limit') { r.fam = 'inhibit'; }
      if (r.fam === 'seq' && !(r.a.type === 'etape' && r.b.type === 'etape')) continue;
      const k = [r.a.id, r.b.id].sort().join('|');
      const score = (r.strong ? 2 : 0) + (r.hedge ? 0 : 1);
      if (!best.has(k) || score > best.get(k).score) best.set(k, { ...r, score });
    }
    // un nœud produit par un autre ET qui en produit un troisième est un maillon de chaîne : son type
    const out = [];
    for (const r of best.values()) {
      const { a, b, fam } = r;
      if (c.desc(a.id).has(b.id) && c.parentEdgeOf(b.id) && c.parentEdgeOf(b.id).from !== a.id) continue; // relation à travers plusieurs niveaux : on ne court-circuite pas
      // le texte contredit-il les types posés par l'auteur ? (cause ↔ conséquence inversées)
      let certainty = r.strong && !r.hedge && fam !== 'refer' ? 'sure' : 'probable';
      if (fam === 'part' && partCount.get(b.id) < 2) certainty = 'probable';
      const why = `La note de « ${short(r.owner.title, 26)} » le dit : « ${short(r.sentence, 70)} »`;
      const tree = c.parentEdgeOf(b.id) && c.parentEdgeOf(b.id).from === a.id ? c.parentEdgeOf(b.id)
        : c.parentEdgeOf(a.id) && c.parentEdgeOf(a.id).from === b.id ? c.parentEdgeOf(a.id) : null;
      if (tree) {
        if (tree.label || tree.group || heading(c.byId.get(tree.from))) continue;
        const label = tree.from === a.id ? (fam === 'part' ? null : r.verb) : INVERSE[fam];
        if (!label) continue;
        const parentN = c.byId.get(tree.from), childN = c.byId.get(tree.to);
        out.push({
          key: 'pl:' + tree.id, kind: 'label', certainty, gain: 4, ids: [childN.id, parentN.id], edgeId: tree.id,
          title: `Nommer la relation « ${short(parentN.title, 24)} » → « ${short(childN.title, 24)} »`,
          detail: why + '.',
          preview: [`${short(parentN.title, 26)} —${label}→ ${short(childN.title, 26)}`],
          apply(m) { const e = m.edges.find((y) => y.id === tree.id); if (e && !e.label && !e.group && e.from === parentN.id) e.label = label; },
        });
        continue;
      }
      if (c.linked(a.id, b.id)) continue;
      // rattachement : l'élément dépendant passe SOUS l'élément qu'il précise, s'ils sont frères sous un intitulé
      let dep = null, host = null, hostLabel = null;
      if (fam === 'example') { dep = a; host = b; hostLabel = 'illustré par'; }
      else if (fam === 'exception') { dep = b; host = a; hostLabel = 'sauf'; }
      else if (fam === 'exceptionOf') { dep = a; host = b; hostLabel = 'sauf'; }
      else if (fam === 'part') { dep = a; host = b; hostLabel = 'comprend'; }
      const pd = dep && c.parentEdgeOf(dep.id), ph = host && c.parentEdgeOf(host.id);
      if (dep && pd && ph && pd.from === ph.from && heading(c.byId.get(pd.from)) && !pd.label && !pd.group && !c.desc(dep.id).has(host.id) && host.type !== 'definition') {
        out.push({
          key: 'rp:' + dep.id + '>' + host.id, kind: 'reparent', certainty, gain: 5, ids: [dep.id, host.id], structural: true,
          title: `Rattacher « ${short(dep.title, 26)} » sous « ${short(host.title, 26)} »`,
          detail: `${why}. Rangé sous l’élément qu’il précise, il se révise avec lui (le reste de la partie ne bouge pas).`,
          preview: [`${short(host.title, 26)} —${hostLabel}→ ${short(dep.title, 26)}`],
          apply(m) {
            const e = S.parentEdge(m, dep.id);
            if (!e || e.label || e.group || !S.node(m, host.id) || S.descendants(m, dep.id).includes(host.id) || e.from !== pd.from) return;
            e.from = host.id; e.label = hostLabel;
          },
        });
        continue;
      }
      if (fam === 'part') continue; // une partie hors de sa fratrie : pas de renvoi « fait partie de »
      out.push({
        key: 'ph:' + a.id + '>' + b.id, kind: 'phrase', certainty, gain: 6, link: true, explicit: certainty === 'sure', ids: [a.id, b.id],
        title: `Relier « ${short(a.title, 26)} » à « ${short(b.title, 26)} »`,
        detail: why + (r.hedge ? ' — avec une réserve : à confirmer.' : '.'),
        preview: [`${short(a.title, 28)} —${r.verb}→ ${short(b.title, 28)}`],
        apply(m) { if (!S.node(m, a.id) || !S.node(m, b.id) || m.edges.some((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id))) return; m.edges.push({ id: U.uid('e'), from: a.id, to: b.id, kind: 'link', label: r.verb }); },
      });
    }
    return out;
  }

  /* ---- Personnes : l'élément qui nomme une personne s'y rattache (« selon ») ---- */
  function persons(c) {
    const out = [];
    for (const p of c.map.nodes) {
      if (p.type !== 'personne' || wordsIn(p.title) < 2) continue;
      const user = c.map.nodes.find((n) => n !== p && !STRUCT.has(n.type) && n.type !== 'retenir' && c.names(c.titleN.get(n.id), p.title) && !c.linked(n.id, p.id));
      if (!user || lineage(c, user.id, p.id)) continue;
      out.push({
        key: 'pe:' + user.id + '>' + p.id, kind: 'phrase', certainty: 'sure', gain: 3, link: true, explicit: true, ids: [user.id, p.id],
        title: `Relier « ${short(user.title, 26)} » à « ${short(p.title, 26)} »`,
        detail: 'Son titre nomme cette personne : le lien dit d’où vient l’idée.',
        preview: [`${short(user.title, 28)} —selon→ ${short(p.title, 28)}`],
        apply(m) { if (!S.node(m, user.id) || !S.node(m, p.id) || m.edges.some((e) => (e.from === user.id && e.to === p.id) || (e.from === p.id && e.to === user.id))) return; m.edges.push({ id: U.uid('e'), from: user.id, to: p.id, kind: 'link', label: 'selon' }); },
      });
    }
    return out;
  }

  /* ---- Doublons : deux frères au même titre et au même type sont une seule notion ---- */
  function merges(c, notes) {
    const out = [];
    const groups = new Map();
    for (const n of c.map.nodes) {
      if (STRUCT.has(n.type) || !n.title.trim()) continue;
      const k = norm(n.title).trim();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const [a, b] = list;
      const pa = c.parentEdgeOf(a.id), pb = c.parentEdgeOf(b.id);
      if (a.type === b.type && pa && pb && pa.from === pb.from && list.length === 2) {
        out.push({
          key: 'mg:' + a.id + '+' + b.id, kind: 'merge', certainty: 'sure', gain: 4, ids: [a.id, b.id], structural: true,
          title: `Fusionner les deux « ${short(a.title, 30)} »`,
          detail: 'Même titre, même type, même parent : c’est une seule notion. Les deux notes sont gardées, les liens et les sous-éléments rejoignent le nœud conservé.',
          preview: [`${short(a.title, 30)} ← ${short(b.note || b.title, 40)}`],
          apply(m) { mergeNodes(m, a.id, b.id); },
        });
      } else {
        notes.push(note('dup-t:' + list.map((x) => x.id).join(','), 'duplicate', `Même titre à deux endroits : « ${short(a.title, 30)} »`,
          'Même notion rangée deux fois, ou deux sens différents (homonymes) ? Fusionnez-les à la main seulement si c’est la même idée.', list.map((x) => x.id)));
      }
    }
    return out;
  }
  function mergeNodes(m, keepId, dropId) {
    const keep = S.node(m, keepId), drop = S.node(m, dropId);
    if (!keep || !drop) return;
    if (drop.note.trim() && drop.note.trim() !== keep.note.trim()) keep.note = keep.note.trim() ? keep.note.trim() + '\n\n' + drop.note.trim() : drop.note;
    if (!keep.em && drop.em) keep.em = drop.em;
    if ((drop.review && drop.review.box || 0) > (keep.review && keep.review.box || 0)) keep.review = { ...drop.review };
    m.edges = m.edges.filter((e) => !(e.kind === 'tree' && e.to === dropId));
    for (const e of m.edges) { if (e.from === dropId) e.from = keepId; if (e.to === dropId) e.to = keepId; }
    const seen = new Set();
    m.edges = m.edges.filter((e) => { if (e.from === e.to) return false; const k = e.kind === 'link' ? [e.from, e.to].sort().join('|') + '|' + e.label : e.id; if (seen.has(k)) return false; seen.add(k); return true; });
    m.nodes = m.nodes.filter((n) => n.id !== dropId);
    for (const x of m.exercises || []) if (x.nodeIds.includes(dropId)) x.nodeIds = [...new Set(x.nodeIds.map((i) => (i === dropId ? keepId : i)))];
  }

  /* ---- Décomposition mal reliée : les composantes suivent l'ordre de la phrase source ----
     Seulement pour une décomposition sans libellés (celles du rangement sont libellées et justes) :
     la première composante est le cœur ; une relative (dont, qui…) ou « notamment / comme » précise
     la composante qui la précède ; toute autre composante précise le cœur. */
  const COMPONENT_LABEL = /\?$|^(c'est|designe|consiste en|permet|notamment|comme|sauf|mais|ou|a condition que|resulte de|entraine|au detriment de)$/;
  function rewire(c) {
    const out = [];
    for (const d of c.map.nodes) {
      if (d.type !== 'definition' || !d.note.trim()) continue;
      const comps = [...c.desc(d.id)].map((id) => c.byId.get(id)).filter((n) => n && n.type === 'idee');
      if (comps.length < 2) continue;
      const edges = comps.map((n) => c.parentEdgeOf(n.id));
      // libellés de composante seulement (« c’est », « de qui ? »…) : ils suivent la composante qu'ils qualifient
      if (edges.some((e) => !e || e.group || (e.label && !COMPONENT_LABEL.test(norm(e.label).trim())))) continue;
      const src = norm(plain(d.note));
      const located = comps.map((n) => ({ n, pos: src.indexOf(norm(n.title).trim()) }));
      if (located.some((x) => x.pos < 0)) continue;
      located.sort((x, y) => x.pos - y.pos);
      const want = new Map();
      // le découpage du moteur fait foi quand il retrouve exactement ces composantes
      const split = splitDefinition(plain(d.note));
      const byTitle = new Map(located.map((x) => [norm(x.n.title).trim(), x.n]));
      if (split.length === located.length && split.every((ch) => byTitle.has(norm(ch.title).trim()))) {
        split.forEach((ch) => want.set(byTitle.get(norm(ch.title).trim()).id, ch.parent >= 0 ? byTitle.get(norm(split[ch.parent].title).trim()).id : d.id));
      } else {
        const lab = (x) => norm(c.parentEdgeOf(x.n.id).label || '').trim();
        const qual = (x) => lab(x) === "c'est" && located.some((y) => /^(designe|consiste en|permet)$/.test(lab(y)));
        const head = located.find((x) => !qual(x));
        located.forEach((x, i) => {
          const t = norm(x.n.title).trim();
          if (x === head || qual(x)) want.set(x.n.id, d.id);
          else if (i > 0 && (/^(dont|qui|que|lequel|laquelle|lesquels|notamment|comme)\b/.test(t) || /^(notamment|comme)$/.test(lab(x)))) want.set(x.n.id, located[i - 1].n.id);
          else want.set(x.n.id, head.n.id);
        });
      }
      for (const x of located) {
        const e = c.parentEdgeOf(x.n.id), to = want.get(x.n.id);
        if (e.from === to) continue;
        const target = c.byId.get(to);
        out.push({
          key: 'rw:' + x.n.id + '>' + to, kind: 'reparent', certainty: 'sure', gain: 4, ids: [x.n.id, to], structural: true,
          title: `Relier « ${short(x.n.title, 26)} » à « ${short(target.title, 26)} »`,
          detail: 'Dans la définition, cette composante précise celle-là : la décomposition suit la phrase source.',
          preview: [`${short(target.title, 28)} → ${short(x.n.title, 28)}`],
          apply(m) {
            const ee = S.parentEdge(m, x.n.id);
            if (!ee || ee.group || ee.from !== e.from || !S.node(m, to) || S.descendants(m, x.n.id).includes(to)) return;
            ee.from = to;
          },
        });
      }
    }
    return out;
  }

  /* ---- Renvoi « comprend » vers un élément posé au niveau du plan : sa place est dans l'arbre ---- */
  function linkToTree(c) {
    const out = [];
    for (const e of c.map.edges) {
      if (e.kind !== 'link' || e.group || !/^(comprend|contient|se compose de|inclut|est compose de)\b/.test(norm(e.label).trim())) continue;
      const a = c.byId.get(e.from), b = c.byId.get(e.to), pb = c.parentEdgeOf(e.to);
      if (!a || !b || heading(a) || !pb || !heading(c.byId.get(pb.from)) || pb.label || c.desc(b.id).has(a.id)) continue;
      out.push({
        key: 'lt:' + e.id, kind: 'reparent', certainty: 'probable', gain: 3, ids: [b.id, a.id], structural: true,
        title: `Ranger « ${short(b.title, 26)} » sous « ${short(a.title, 26)} »`,
        detail: 'Un renvoi « comprend » vers un élément rangé directement dans le plan : c’est une partie, sa place est sous le tout.',
        preview: [`${short(a.title, 28)} —${e.label}→ ${short(b.title, 28)} (dans l’arbre)`],
        apply(m) {
          const x = m.edges.find((y) => y.id === e.id), t = S.parentEdge(m, b.id);
          if (!x || !t || t.from !== pb.from || S.descendants(m, b.id).includes(a.id)) return;
          t.from = a.id; t.label = x.label; m.edges.splice(m.edges.indexOf(x), 1);
        },
      });
    }
    return out;
  }

  /* ---- Renvois [[Titre]] écrits dans les notes ----
     Le skill réserve [[Titre]] aux renvois sans relation précise : on ne les transforme en lien
     que si la phrase dit la relation (« contredit [[X]] », « remède : [[X]] »). */
  const WIKI_VERBS = [
    [/contredi|a l'inverse|s'oppose|contre\b|contraire/, 's’oppose à'],
    [/se distingue|different de|ne pas confondre/, 'se distingue de'],
    [/remede|repons|resou|solution/, 'résout'],
    [/entraine|provoque|cause\b|produit/, 'entraîne'],
    [/decoule|resulte|vient de|nait de/, 'résulte de'],
    [/illustr|exemple/, 'illustre'],
    [/suppose|necessite|exige|depend/, 'suppose'],
  ];
  function wikiLinks(c, notes) {
    const out = [];
    const byTitle = new Map();
    for (const n of c.map.nodes) { const t = norm(n.title).trim(); if (!byTitle.has(t)) byTitle.set(t, []); byTitle.get(t).push(n); }
    for (const n of c.map.nodes) {
      for (const m of String(n.note || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
        const hits = byTitle.get(norm(m[1]).trim()) || [];
        if (hits.length > 1) { notes.push(note('wk-dup:' + n.id + ':' + norm(m[1]), 'link', `Renvoi ambigu : [[${short(m[1], 30)}]]`, `${hits.length} éléments portent ce titre : renommez-les pour que le renvoi désigne le bon.`, [n.id, ...hits.map((h) => h.id)])); continue; }
        const target = hits[0];
        if (!target || target.id === n.id || c.linked(n.id, target.id)) continue;
        const before = norm(String(n.note).slice(Math.max(0, m.index - 40), m.index));
        const verb = WIKI_VERBS.find(([re]) => re.test(before));
        if (!verb || NEG.test(before.split(/[.;!?]/).pop())) continue;
        out.push({
          key: 'wk:' + n.id + '>' + target.id, kind: 'link', certainty: 'sure', gain: 3, link: true,
          title: `Relier « ${short(n.title, 26)} » à « ${short(target.title, 26)} »`,
          detail: 'La note dit déjà la relation avant le renvoi : le lien la rend visible, même d’une partie à l’autre.',
          preview: [`${short(n.title, 28)} —${verb[1]}→ ${short(target.title, 28)}`],
          ids: [n.id, target.id],
          apply(mm) { if (!S.node(mm, n.id) || !S.node(mm, target.id) || mm.edges.some((e) => (e.from === n.id && e.to === target.id) || (e.from === target.id && e.to === n.id))) return; mm.edges.push({ id: U.uid('e'), from: n.id, to: target.id, kind: 'link', label: verb[1] }); },
        });
      }
    }
    return out;
  }

  /* ---- Libellés posés : sens douteux, libellé vague, cible incohérente ----
     Les types seuls ne prouvent pas un sens (un même élément est effet d'une chose et cause de la
     suivante) : aucune inversion n'est déduite des types. */
  function labelAudit(c, notes) {
    const out = [];
    for (const e of c.map.edges) {
      if (!e.label) continue;
      const a = c.byId.get(e.from), b = c.byId.get(e.to);
      if (!a || !b) continue;
      const pol = polarity(e.label);
      if (pol === 'vague') {
        const r = REL[b.type];
        if (e.kind === 'tree' && !e.group && r && r.one && !heading(a)) {
          out.push({
            key: 'vg:' + e.id, kind: 'label', certainty: 'sure', gain: 2, ids: [a.id, b.id],
            title: `Préciser « ${e.label} » vers « ${short(b.title, 26)} »`,
            detail: `Le type de l’élément (${S.TYPES[b.type].label.toLowerCase()}) dit la relation mieux que « ${e.label} ».`,
            preview: [`${short(a.title, 28)} —${r.one}→ ${short(b.title, 28)}`],
            apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x && x.label === e.label) x.label = r.one; },
          });
        } else notes.push(note('vg-n:' + e.id, 'label', `Libellé vague : « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          'Rien dans la carte ne dit la relation exacte : à préciser à la main (entraîne, suppose, sauf, s’oppose à…).', [a.id, b.id]));
        continue;
      }
      // un remède ou une cause qui vise un intitulé ou une question : la relation pointe vers le plan, pas vers une idée
      if ((pol === 'inh' || pol === 'fwd') && e.kind === 'link' && heading(b)) {
        notes.push(note('tgt:' + e.id, 'label', `Lien vers un intitulé : « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          'Une cause ou un remède vise une idée précise, pas une question ou une partie : rattachez le lien à l’élément concerné.', [a.id, b.id]));
      }
    }
    return out;
  }

  /* ---- Doublons, boucles, contradictions entre renvois ---- */
  function duplicates(c, notes) {
    const out = [];
    const seen = new Map(), pairs = new Map();
    for (const e of c.map.edges) {
      if (e.kind !== 'link') continue;
      const a = c.byId.get(e.from), b = c.byId.get(e.to);
      if (!a || !b) continue;
      const pol = polarity(e.label);
      const t = c.parentEdgeOf(e.to) && c.parentEdgeOf(e.to).from === e.from ? c.parentEdgeOf(e.to) : c.parentEdgeOf(e.from) && c.parentEdgeOf(e.from).from === e.to ? c.parentEdgeOf(e.from) : null;
      if (t) {
        // le libellé ne passe sur l'arbre que s'il va dans le même sens
        const keep = e.label && !t.label && !t.group && t.from === e.from && pol !== 'sym';
        out.push({
          key: 'dup:' + e.id, kind: 'duplicate', certainty: 'sure', gain: 4, ids: [a.id, b.id],
          title: `Fondre le renvoi « ${short(a.title, 22)} → ${short(b.title, 22)} » dans la hiérarchie`,
          detail: keep ? 'Ils sont déjà parent et enfant : le libellé du renvoi passe sur l’arête de l’arbre.' : 'Ils sont déjà parent et enfant : le renvoi double le trait (son libellé reste visible dans l’aperçu).',
          preview: [keep ? `${short(a.title, 28)} —${e.label}→ ${short(b.title, 28)}` : `− ${short(a.title, 24)} —${e.label || '…'}→ ${short(b.title, 24)}`],
          apply(m) {
            const x = m.edges.find((y) => y.id === e.id), tt = m.edges.find((y) => y.id === t.id);
            if (!x) return;
            if (keep && tt && !tt.label) tt.label = x.label;
            m.edges.splice(m.edges.indexOf(x), 1);
          },
        });
        continue;
      }
      // même relation tracée deux fois (symétrique : dans un sens ou dans l'autre)
      const k = (pol === 'sym' ? [e.from, e.to].sort().join('|') : e.from + '>' + e.to) + '|' + norm(e.label);
      if (seen.has(k)) {
        out.push({
          key: 'dup:' + e.id, kind: 'duplicate', certainty: 'sure', gain: 4, ids: [a.id, b.id],
          title: `Supprimer le renvoi répété « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          detail: 'La même relation est déjà tracée entre ces deux éléments.',
          preview: [`− ${short(a.title, 24)} —${e.label}→ ${short(b.title, 24)}`],
          apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x) m.edges.splice(m.edges.indexOf(x), 1); },
        });
        continue;
      }
      seen.set(k, e);
      const pk = [e.from, e.to].sort().join('|');
      if (!pairs.has(pk)) pairs.set(pk, []);
      pairs.get(pk).push({ e, pol, a, b });
    }
    // A —entraîne→ B et B —entraîne→ A : boucle réelle (cercle vicieux) ou erreur — à trancher à la main
    // A —entraîne→ B et A —empêche→ B : contradiction
    for (const list of pairs.values()) {
      if (list.length < 2) continue;
      const loop = list.some((x) => list.some((y) => x !== y && x.e.from === y.e.to && x.pol === y.pol && (x.pol === 'fwd' || x.pol === 'back')));
      const contra = list.some((x) => list.some((y) => x !== y && x.e.from === y.e.from && ((x.pol === 'fwd' && y.pol === 'inh') || (x.pol === 'inh' && y.pol === 'fwd'))));
      if (!loop && !contra) continue;
      const { a, b } = list[0];
      notes.push(note((loop ? 'loop:' : 'contra:') + [a.id, b.id].sort().join('|'), 'contradiction',
        loop ? `Boucle : « ${short(a.title, 22)} » et « ${short(b.title, 22)} » se produisent l’un l’autre` : `Contradiction : « ${short(a.title, 22)} » produit et empêche « ${short(b.title, 22)} »`,
        loop ? 'Un cercle vicieux est possible (gardez les deux liens) ; sinon supprimez celui qui va dans le mauvais sens.' : 'Les deux liens disent l’inverse : gardez celui que dit le cours.', [a.id, b.id]));
    }
    return out;
  }

  /* ---- Définition modulaire : la définition découpée en composantes reliées ----
     Les composantes reprennent les mots EXACTS de la source (seule la première lettre passe en
     capitale ; une composante qui ne serait pas une sous-chaîne exacte annule tout). La
     qualification (c'est), le cœur (désigne), les compléments du cœur (de qui ? à qui ?…) et
     « notamment » / « comme » sous la composante qu'ils précisent. Au moindre doute (« et »
     sans fonction, « soit… soit », relative « par lequel », négation), on renonce : la
     définition reste d'un bloc plutôt que d'être mal découpée. */
  const PERSON = /^(personnes?|individus?|epoux|heritiers?|defunt|auteur|creanciers?|debiteurs?|parties?|enfants?|parents?|conjoints?|ayants?|successeurs?|tiers|proprietaires?|acquereurs?|vendeurs?|autrui|salaries?|employeurs?|contractants?|victimes?)/;
  // ce qu'un étudiant oublie en récitant : le nombre, l'exclusivité, la condition (limites de mots explicites : « à » n'est pas un caractère \w)
  const EMPH = /(?<![\p{L}])(une? ou plusieurs|deux ou plusieurs|au moins (?:une?|deux)|seule?s?|uniquement|exclusivement|nécessairement|obligatoirement|personnellement|à titre gratuit|à titre onéreux|de plein droit|à condition que|sous réserve)(?![\p{L}])/iu;
  const HEADS = new Set(['désigne', 'consiste en', 'permet', 'c’est']);
  const B = '(?=[\\s,.;:]|$)'; // fin de mot qui marche après une lettre accentuée
  function splitDefinition(text) {
    const src = String(text || '').replace(/\s+/g, ' ').trim();
    let t = src.split(/(?<=[.;])\s/)[0].replace(/[.;]$/, '');
    const lt = norm(t);
    // structures qu'un découpage mécanique trahirait
    if (/\bsoit\b.*\bsoit\b/.test(lt) || /\b(par|dans|pour|sur) (lequel|laquelle|lesquels|lesquelles)\b/.test(lt) || /\ble fait pour\b/.test(lt)
      || /\b(n'est|ne sont) pas\b/.test(lt) || /^(il y a|on parle de)\b/.test(lt)) return [];
    let qual = null;
    const q = t.match(new RegExp('(?:^|\\s)est\\s+((?:une?|la|le|l[\'’])\\s*[^,]{3,60}?)\\s+qui\\s+(désigne|consiste|permet)' + B, 'i'));
    if (q) { qual = q[1].trim(); t = t.slice(q.index + q[0].length - q[2].length); }
    else {
      const m = t.match(new RegExp('(?:^|\\s)(désigne|consiste (?:à|en)|est (?:l[\'’]|la |le |un |une |ce )|permet)' + B, 'i'));
      if (!m) return [];
      t = t.slice(m.index + (m[0].startsWith(' ') ? 1 : 0));
    }
    t = t.replace(/,\s*(notamment|mais|comme|sauf|ou)\s+/gi, ' $1 ');
    // 1) virgules : une énumération courte (« créer, modifier, transmettre ») reste d'un bloc
    const chunks = [];
    let inEnum = false;
    for (const ch of t.split(/,\s*/)) {
      const tiny = ch.split(' ').length < 3;
      if (chunks.length && (tiny || (inEnum && /\s(ou|et)\s/.test(' ' + ch + ' ')))) { chunks[chunks.length - 1] += ', ' + ch; inEnum = tiny; }
      else { chunks.push(ch); inEnum = false; }
    }
    // 2) articulations : chaque complément devient une composante
    const cut = /\s(?=d['’]une?\s|à une?\s|à des\s|aux\s|par\s(?!lequel|laquelle)|pour\s|afin de\s|en vue de\s|lorsque\s|à condition que\s|sauf\s|notamment\s|mais\s|comme\s|ou\s(?:à|de|par)\s|destinée?s?\s+à\s|résultant\s|qui entraîne\s|qui provoque\s|au détriment de\s)/i;
    const parts = chunks.flatMap((ch) => ch.split(cut)).map((x) => x.trim()).filter(Boolean);
    const merged = [];
    for (const p of parts) { if (merged.length && p.length < 8) merged[merged.length - 1] += ' ' + p; else merged.push(p); }
    if (merged.length > 6) return []; // trop de morceaux : découpage douteux
    const comps = [];
    for (let i = 0; i < merged.length; i++) {
      const p = merged[i], lp = norm(p);
      let label, body = p;
      const take = (re) => { body = p.replace(re, '').trim(); };
      if (i === 0 && /^designe\b/.test(lp)) { label = 'désigne'; take(/^désigne\s+/i); }
      else if (i === 0 && /^consiste/.test(lp)) { label = 'consiste en'; take(/^consiste (?:à|en)\s+/i); }
      else if (i === 0 && /^permet\b/.test(lp)) { label = 'permet'; take(/^permet\s+/i); }
      else if (i === 0 && /^est\b/.test(lp)) { label = 'c’est'; take(/^est\s+/i); }
      else if (/^d'une? (maniere|facon)\b/.test(lp)) { label = 'comment ?'; }
      else if (/^d'une?\s/.test(lp)) { take(/^d['’]/i); label = PERSON.test(norm(body.replace(/^une?\s+(?:ou plusieurs\s+)?/i, ''))) ? 'de qui ?' : 'de quoi ?'; }
      else if (/^(a une?|a des|aux)\s/.test(lp)) { take(/^(à|aux)\s+/i); label = PERSON.test(norm(body.replace(/^(?:une?|des|un autre|une autre)\s+(?:ou plusieurs\s+)?/i, ''))) || /^aux/.test(lp) ? 'à qui ?' : 'à quoi ?'; }
      else if (/^par\s/.test(lp)) { take(/^par\s+/i); label = 'par quoi ?'; }
      else if (/^(pour|afin de|en vue de)\s/.test(lp)) { label = 'dans quel but ?'; }
      else if (/^lorsque\s/.test(lp)) { take(/^lorsque\s+/i); label = 'quand ?'; }
      else if (/^a condition que\s/.test(lp)) { take(/^à condition que\s+/i); label = 'à condition que'; }
      else if (/^sauf\s/.test(lp)) { take(/^sauf\s+/i); label = 'sauf'; }
      else if (/^notamment\s/.test(lp)) { take(/^notamment\s+/i); label = 'notamment'; }
      else if (/^mais\s/.test(lp)) { take(/^mais\s+/i); label = 'mais'; }
      else if (/^comme\s/.test(lp)) { take(/^comme\s+/i); label = 'comme'; }
      else if (/^ou\s/.test(lp)) { take(/^ou\s+/i); label = 'ou'; }
      else if (/^destinee?s?\s+a\s/.test(lp)) { take(/^destinée?s?\s+à\s+/i); label = 'pour ?'; }
      else if (/^resultant\s/.test(lp)) { take(/^résultant\s+(?:de\s+|d['’])?/i); label = 'résulte de'; }
      else if (/^qui (entraine|provoque)\s/.test(lp)) { take(/^qui (?:entraîne|provoque)\s+/i); label = 'entraîne'; }
      else if (/^au detriment de\s/.test(lp)) { take(/^au détriment de\s+/i); label = 'au détriment de'; }
      else return []; // un morceau sans fonction : mieux vaut ne pas découper
      comps.push({ label, title: body });
    }
    if (qual) comps.unshift({ label: 'c’est', title: qual, qual: true });
    const out = comps.map((ch) => {
      const title = ch.title.charAt(0).toUpperCase() + ch.title.slice(1);
      const em = (title.match(EMPH) || [])[0];
      return { label: ch.label, title, ...(em ? { em } : {}), qual: !!ch.qual };
    });
    const head = out.findIndex((ch) => !ch.qual && HEADS.has(ch.label));
    out.forEach((ch, i) => {
      if (ch.qual || i === head) ch.parent = -1;
      else if ((ch.label === 'notamment' || ch.label === 'comme') && i > 0 && !out[i - 1].qual) ch.parent = i - 1;
      else ch.parent = head >= 0 ? head : -1;
      delete ch.qual;
    });
    // fidélité : chaque composante est une sous-chaîne exacte de la source, et compte au moins 2 mots
    const ls = src.toLowerCase().replace(/[’]/g, "'");
    if (out.some((ch) => !ls.includes(ch.title.toLowerCase().replace(/[’]/g, "'")) || ch.title.trim().split(/\s+/).length < 2)) return [];
    return out.length >= 2 ? out : [];
  }
  function definitions(c, notes) {
    const out = [];
    for (const n of c.map.nodes) {
      if (n.type !== 'definition') continue;
      if (c.kids(n.id).some((k) => k.type === 'idee')) continue; // déjà décomposée
      const fromNote = plain(n.note).trim().length > n.title.length;
      const src = fromNote ? plain(n.note).trim() : n.title;
      if (src.length < RULES.defMinChars) continue;
      if (!fromNote) {
        notes.push(note('def-t:' + n.id, 'definition', `Définition dans le titre : « ${short(n.title, 32)} »`,
          'Mettez le terme défini en titre et la définition dans la note : elle pourra alors être décomposée.', [n.id]));
        continue;
      }
      const comps = splitDefinition(src);
      if (comps.length < RULES.defMinParts) continue;
      out.push({
        key: 'def:' + n.id, kind: 'definition', certainty: c.law ? 'sure' : 'probable', gain: 5, ids: [n.id],
        title: `Décomposer la définition « ${short(n.title, 32)} »`,
        detail: (c.law ? '' : 'Hors droit, vérifiez que chaque morceau a un sens. ')
          + 'Découpée en composantes reliées (que désigne-t-elle ? de qui ? à qui ?), une définition se comprend et se retient. Mots exacts de la source ; la définition complète reste dans la note et se révise d’un seul tenant.',
        preview: comps.map((ch) => `${ch.parent >= 0 ? '   ' : ''}—${ch.label}→ ${short(ch.title, 44)}${ch.em ? `  (en relief : « ${ch.em} »)` : ''}`),
        apply(m) {
          const d = S.node(m, n.id);
          if (!d || S.childrenOf(m, d.id).some((k) => k.type === 'idee')) return;
          const made = [];
          comps.forEach((ch, i) => {
            const k = S.newNode({ type: 'idee', title: ch.title, em: ch.em, x: d.x + 300, y: d.y + i * 60 });
            m.nodes.push(k);
            made.push(k);
            const from = ch.parent >= 0 ? made[ch.parent].id : d.id;
            m.edges.push({ id: U.uid('e'), from, to: k.id, kind: 'tree', label: ch.label });
          });
        },
      });
    }
    return out;
  }

  /* ---- Signalements ---- */
  function note(key, kind, title, detail, ids) { return { key, kind, title, detail, ids }; }
  /** Liste plate : des éléments juxtaposés sous une partie, sans aucune relation ENTRE eux
      (une branche libellée depuis la partie ne dit rien de leurs rapports mutuels). */
  function flatLists(c, notes) {
    for (const p of c.map.nodes) {
      if (!STRUCT.has(p.type)) continue;
      const es = c.map.edges.filter((e) => e.kind === 'tree' && e.from === p.id);
      const ks = es.map((e) => c.byId.get(e.to)).filter((k) => k && !STRUCT.has(k.type));
      if (ks.length < RULES.flatMin) continue;
      const ids = new Set(ks.map((k) => k.id));
      const related = ks.some((k) => c.kids(k.id).length) || c.map.edges.some((e) => e.kind === 'link' && (ids.has(e.from) || ids.has(e.to)));
      const types = new Set(ks.map((k) => k.type));
      // une liste homogène que le titre nomme (« Les 10 signes ») est plate par nature
      if (related || (types.size === 1 && named(p, ks[0].type))) continue;
      notes.push(note('flat:' + p.id, 'flat', `Liste plate : « ${short(p.title, 32)} »`,
        `${ks.length} éléments rattachés à la partie, sans aucune relation entre eux. Si le cours dit lequel produit, suppose ou illustre l’autre, reliez-les (glissez un élément sous un autre, ou tracez un renvoi libellé).`, [...ids]));
    }
  }
  // verbes causaux (« cause » seulement suivi d'un déterminant : « cause l'autre », pas « à cause de ») ou alternative explicite
  const CAUSAL_VERBS = /\b(entraine|entrainent|provoque|provoquent|engendre|resulte|resultent|decoule|decoulent|aboutit|mene a|est cause par|a pour cause|a pour effet|causent?\s+(l'|la |le |les |un |une |des )|effet ou cause|cause ou effet|laquelle cause|lequel cause)/;
  function ambiguous(c, notes) {
    let n = 0;
    for (const p of c.map.nodes) {
      const ks = c.kids(p.id).filter((k) => !STRUCT.has(k.type) && !['definition', 'notion'].includes(k.type) && !/\?\s*$/.test(k.title));
      const pw = c.rare(p.title);
      for (let i = 0; i < ks.length && n < 4; i++) for (let j = i + 1; j < ks.length && n < 4; j++) {
        const a = ks[i], b = ks[j];
        if (CAUSAL_PAIRS[a.type + '>' + b.type] || CAUSAL_PAIRS[b.type + '>' + a.type]) continue; // causal() s'en charge
        if (c.linked(a.id, b.id)) continue;
        const ta = c.text.get(a.id), tb = c.text.get(b.id);
        if (!CAUSAL_VERBS.test(ta) || !CAUSAL_VERBS.test(tb)) continue;
        let sh = 0; const aw = c.rare(a.title + ' ' + plain(a.note));
        for (const w of c.rare(b.title + ' ' + plain(b.note))) if (aw.has(w) && !pw.has(w)) sh++;
        if (sh < 2) continue;
        n++;
        notes.push(note('amb:' + a.id + '|' + b.id, 'ambiguous', `Relation causale possible, sens inconnu : « ${short(a.title, 22)} » / « ${short(b.title, 22)} »`,
          'Les deux parlent de cause et d’effet sur le même sujet, mais rien ne dit lequel produit l’autre : à relier à la main si le cours le précise.', [a.id, b.id]));
      }
    }
  }
  /** Prérequis : une notion définie dans une carte PLUS LOIN du cours, utilisée avant */
  function prerequisites(c, notes) {
    const course = c.opts.course;
    if (!course || course.length < 2) return;
    const order = course.slice().sort((a, b) => a.createdAt - b.createdAt);
    const idx = order.findIndex((m) => m.id === c.map.id);
    if (idx < 0) return;
    let n = 0;
    for (const later of order.slice(idx + 1)) {
      for (const d of later.nodes) {
        if (d.type !== 'definition' || wordsIn(d.title) < 2 && d.title.trim().length < 8) continue;
        const user = c.map.nodes.find((a) => !STRUCT.has(a.type) && c.names(c.text.get(a.id), d.title));
        if (!user || n >= 3) continue;
        n++;
        notes.push(note('pre:' + user.id + '>' + d.id, 'prereq', `Prérequis défini plus loin : « ${short(d.title, 30)} »`,
          `« ${short(user.title, 30)} » l’emploie, mais sa définition n’arrive que dans « ${short(later.title, 30)} ». Définissez-le ici ou rappelez sa définition dans la note.`, [user.id]));
      }
    }
  }

  /** Intégrité du graphe : à vérifier après toute correction (ensembles comparables avant/après) */
  function check(map) {
    const v = [];
    const ids = new Set(map.nodes.map((n) => n.id));
    const parent = new Map();
    const eids = new Set();
    for (const e of map.edges) {
      if (eids.has(e.id)) v.push('arête en double ' + e.id);
      eids.add(e.id);
      if (e.kind !== 'tree' && e.kind !== 'link') v.push('nature inconnue ' + e.id);
      if (!ids.has(e.from) || !ids.has(e.to)) v.push('extrémité absente ' + e.id);
      if (e.from === e.to) v.push('boucle ' + e.id);
      if (e.kind === 'tree') { if (parent.has(e.to)) v.push('deux parents ' + e.to); parent.set(e.to, e.from); }
    }
    for (const id of ids) {
      const seen = new Set(); let j = id;
      while (parent.has(j)) { if (seen.has(j)) { v.push('cycle ' + id); break; } seen.add(j); j = parent.get(j); }
    }
    const treePairs = new Set();
    for (const t of map.edges) if (t.kind === 'tree') { treePairs.add(t.from + '|' + t.to); treePairs.add(t.to + '|' + t.from); }
    for (const e of map.edges) if (e.kind === 'link' && treePairs.has(e.from + '|' + e.to)) v.push('renvoi parallèle à l’arbre ' + e.id);
    const groups = new Map();
    for (const e of map.edges) if (e.group) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
    for (const [g, es] of groups) {
      if (es.length < 2) v.push('branche d’un seul membre ' + g);
      if (new Set(es.map((e) => e.from + '|' + e.kind + '|' + e.label)).size > 1) v.push('branche incohérente ' + g);
    }
    return v;
  }

  /** Indicateurs d'une carte (mesure avant/après, tests/metrics.cjs) */
  function metrics(map) {
    const c = context(map);
    const tree = map.edges.filter((e) => e.kind === 'tree');
    const content = tree.filter((e) => { const a = c.byId.get(e.from), b = c.byId.get(e.to); return a && b && !STRUCT.has(b.type) && !heading(a) && !a.logic && !(named(a, b.type)) && !(a.type === 'methode' && b.type === 'etape'); });
    const verbs = content.filter((e) => e.label && polarity(e.label) !== 'vague');
    const fromHeading = map.edges.filter((e) => e.label && !e.group && heading(c.byId.get(e.from)) && polarity(e.label) && polarity(e.label) !== 'sym').length;
    const notes = [];
    flatLists(c, notes);
    return {
      nodes: map.nodes.length,
      links: linkCount(map),
      relationRate: content.length ? verbs.length / content.length : 1,  // relations nommées par un verbe
      vague: map.edges.filter((e) => polarity(e.label) === 'vague').length,
      verbFromHeading: fromHeading,                                         // verbe causal posé depuis un intitulé
      flat: notes.length,
      integrity: check(map).length,
    };
  }

  /** Application vérifiée, une correction à la fois : intégrité (check), effet réel, texte d'origine
      conservé. Une correction qui casse quelque chose est défaite seule ; les autres restent.
      Rend { done, undone } — le journal de la carte (map.organizeLog) est tenu par l'appelant. */
  function applyVerified(map, fixes) {
    const done = [], undone = [];
    const state = () => JSON.stringify({ n: map.nodes, e: map.edges });
    for (const f of fixes) {
      const before = state();
      const prior = new Set(check(map));
      const titles = map.nodes.map((n) => n.title), noteTexts = map.nodes.map((n) => n.note.trim()).filter(Boolean);
      const restore = (why) => { const d = JSON.parse(before); map.nodes = d.n; map.edges = d.e; undone.push({ fix: f, why }); };
      try { f.apply(map); S.normalizeGroups(map.edges); } catch (e) { restore('erreur : ' + e.message); continue; }
      if (state() === before) continue; // déjà fait, ou une garde a refusé : rien à tracer
      const broken = check(map).filter((v) => !prior.has(v));
      if (broken.length) { restore(broken[0]); continue; }
      const allTitles = new Set(map.nodes.map((n) => n.title)), allNotes = map.nodes.map((n) => n.note).join('\n');
      if (titles.some((t) => !allTitles.has(t)) || noteTexts.some((t) => !allNotes.includes(t))) { restore('texte perdu'); continue; }
      done.push(f);
    }
    return { done, undone };
  }
  /** Entrée du journal d'une carte : ce qui a été fait, et pourquoi */
  const logEntry = (f, at = Date.now()) => ({ at, key: f.key, kind: f.kind, title: f.title, detail: String(f.detail || '').slice(0, 240), preview: (f.preview || []).slice(0, 3) });

  const clone = (map) => JSON.parse(JSON.stringify({ id: map.id, title: map.title, layout: map.layout, nodes: map.nodes, edges: map.edges }));
  const pairKey = (f) => f.ids.slice(0, 2).sort().join('|');

  /* Chaîne de décision : détecter → contexte → candidats → comparer → choisir → (appliquer → vérifier,
     dans l'éditeur) → tracer. Deux phases : la STRUCTURE d'abord (retypages, fusions, décompositions,
     rattachements), puis, sur la carte telle qu'elle serait après les corrections structurelles sûres,
     les BRANCHES et les LIBELLÉS — un libellé posé avant un rattachement figerait une mauvaise place. */
  function audit(map, opts = {}) {
    if (!map || !map.nodes || !map.nodes.length) return { fixes: [], notes: [], stats: null };
    const c0 = context(map, opts);
    const notes = [];
    const declined = c0.declined;
    const live = (list) => list.filter((f) => !declined.has(f.key));
    // ---- phase 0 : identité des nœuds (type déclaré par le titre, doublons) — le reste se lit sur la carte corrigée ----
    const identity = [...live(merges(c0, notes))];
    let c = c0;
    if (identity.some((f) => f.certainty === 'sure')) {
      const m0 = clone(map);
      for (const f of identity) if (f.certainty === 'sure') { try { f.apply(m0); } catch (e) { /* aperçu seulement */ } }
      c = context(m0, opts);
      c.declined = declined;
    }
    // ---- phase 1 : structure ----
    const ph = live([...phrases(c, notes), ...persons(c)]);
    // un élément ne bouge qu'une fois : la relation dite par le texte passe avant la ressemblance de mots
    const moved = new Set();
    const moves = [...ph.filter((f) => f.kind === 'reparent'), ...live(applications(c)), ...live(linkToTree(c)), ...live(rewire(c))]
      .sort((a, b) => (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1) || b.gain - a.gain)
      .filter((f) => !moved.has(f.ids[0]) && moved.add(f.ids[0]));
    const structure = [...identity, ...live(definitions(c, notes)), ...live(duplicates(c, notes)), ...live(labelAudit(c, notes)),
      ...ph.filter((f) => f.kind === 'retype' || f.kind === 'label'), ...moves];
    // ---- phase 2 : branches et libellés, sur la carte après la structure sûre ----
    const mid = clone(c.map);
    for (const f of structure.filter((x) => !identity.includes(x))) if (f.certainty === 'sure') { try { f.apply(mid); } catch (e) { /* aperçu seulement */ } }
    const c2 = context(mid, opts);
    c2.declined = c.declined;
    const busy = new Set([...moved, ...ph.filter((f) => f.kind === 'label').map((f) => f.ids[0])]);
    const quiet = new Set();
    const br = live(branches(c2, quiet, busy));
    const taken = new Set([...quiet, ...br.flatMap((b) => b.ids), ...busy]);
    const fixed = [...structure, ...br, ...live(labels(c2, taken))];
    // ---- renvois : un couple ne reçoit qu'une proposition ; la carte a un budget (renvois existants compris) ----
    // une relation que le texte dit explicitement peut dépasser le budget, jusqu'au double
    const planned = new Set(moves.map((x) => x.ids.join('>')));
    const linksNow = linkCount(map);
    const budget = linkBudget(map.nodes.length);
    let room = Math.max(0, budget - linksNow), extra = Math.max(0, 2 * budget - Math.max(linksNow, budget));
    const pairs = new Set(fixed.filter((f) => f.ids.length >= 2).map(pairKey));
    // un débat rapporté par une note : aucune relation causale tracée entre ces éléments
    const debated = new Set(notes.filter((n) => n.key.startsWith('deb:')).flatMap((n) => n.ids.slice(1).map((id) => [n.ids[0], id].sort().join('|'))));
    const linkFixes = live([...ph.filter((f) => f.link), ...wikiLinks(c, notes), ...causal(c), ...crossRefs(c, planned)])
      .sort((a, b) => (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1) || b.gain - a.gain)
      .filter((f) => {
        const k = pairKey(f);
        if (pairs.has(k) || (f.kind === 'causal' && debated.has(k))) return false;
        pairs.add(k);
        if (room > 0) { room--; return true; }
        if (f.explicit && extra > 0) { extra--; return true; }
        return false;
      });
    const fixes = [...fixed, ...linkFixes].sort((a, b) => (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1) || (b.structural ? 1 : 0) - (a.structural ? 1 : 0) || b.gain - a.gain);
    // signalements calculés sur la carte telle qu'elle serait après les corrections sûres
    // (une liste qu'une correction proposée relie déjà n'est pas « plate »)
    const after = clone(map);
    for (const f of fixes) if (f.certainty === 'sure') { try { f.apply(after); } catch (e) { /* aperçu seulement */ } }
    const ca = context(after, opts);
    flatLists(ca, notes);
    ambiguous(c, notes);
    prerequisites(c, notes);
    const seenNotes = new Set();
    return { fixes, notes: notes.filter((n) => !seenNotes.has(n.key) && seenNotes.add(n.key)), stats: metrics(map) };
  }
  const analyze = (map, opts) => audit(map, opts).fixes;

  R.organize = { audit, analyze, applyVerified, logEntry, check, metrics, splitDefinition, phraseRelations: (map) => phraseRelations(context(map), []), mergeNodes, polarity, linkBudget, linkCount, RULES, REL, LEX, CAUSAL_PAIRS };
})(window.R);
