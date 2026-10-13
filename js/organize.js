/* Ratio — audit d'organisation d'une carte (seconde ligne de contrôle après le skill d'import)
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
    cause:           { one: 'a pour cause', many: 'causes' },
    consequence:     { one: 'entraîne', many: 'conséquences' },
    effet:           { one: 'produit', many: 'effets' },
    condition:       { one: 'suppose', many: 'conditions' },
    fond:            { one: 'suppose', many: 'conditions de fond' },
    forme:           { one: 'exige', many: 'conditions de forme' },
    exception:       { one: 'sauf', many: 'exceptions' },
    exemple:         { one: 'illustré par', many: 'exemples' },
    juris:           { one: 'appliqué par', many: 'jurisprudence' },
    texte:           { one: 'fondé sur', many: 'textes' },
    doctrine:        { one: 'selon', many: 'doctrine' },
    critique:        { one: 'critiqué par', many: 'critiques' },
    argument:        { one: 'justifié par', many: 'arguments' },
    nuance:          { one: 'nuancé par', many: 'nuances' },
    caracteristique: { one: 'se caractérise par', many: 'caractères' },
    signe:           { one: 'se reconnaît à', many: 'signes' },
    categorie:       { one: 'comprend', many: 'catégories' },
    solution:        { one: 'résolu par', many: 'solutions' },
    probleme:        { one: 'pose', many: 'problèmes' },
    objectif:        { one: 'vise', many: 'objectifs' },
    citation:        { one: 'selon', many: 'citations' },
    etude:           { one: 'montré par', many: 'études' },
    avantage:        { one: null, many: 'avantages' },
    inconvenient:    { one: null, many: 'inconvénients' },
    conseil:         { one: null, many: 'conseils' },
    piege:           { one: null, many: 'pièges' },
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
  const STRUCT = new Set(['chapitre', 'lecon', 'section']);
  const LAW_TYPES = new Set(['texte', 'juris', 'doctrine', 'fond', 'forme', 'effet']);
  /* Couples (type source → type cible) pour lesquels les types disent la relation ; tout autre
     couple ne reçoit aucun lien causal (un problème n'est pas « résolu par » sa conséquence). */
  const CAUSAL_PAIRS = {
    'cause>consequence': 'entraîne', 'cause>effet': 'entraîne',
    'condition>consequence': 'permet', 'condition>effet': 'permet',
    'fond>effet': 'permet', 'forme>effet': 'permet', 'fond>consequence': 'permet', 'forme>consequence': 'permet',
    'probleme>solution': 'résolu par', 'probleme>consequence': 'entraîne',
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

  /** la flèche contredit le couple strict cause ↔ conséquence posé par l'auteur */
  const againstTypes = (a, b, label) => {
    const pol = polarity(label);
    return (pol === 'fwd' && (a.type === 'consequence' || a.type === 'effet') && b.type === 'cause')
      || (pol === 'back' && a.type === 'cause' && (b.type === 'consequence' || b.type === 'effet') && !/^(suppose|exige|depend|necessite)/.test(norm(label)));
  };

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
  // une phrase qui nie ou écarte : « n'entraîne pas », « ne pas confondre avec », « contrairement à »
  const NEG = /\b(ne|n')\b[^.;:!?]{0,60}\b(pas|jamais|plus|aucun|aucune|guere|nullement)\b|\bcontrairement\b|\bconfondre\b|\bsans\b|\bnon\b|\bni\b|\bau lieu de\b|\bplutot que\b/;

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
    const law = map.nodes.some((n) => LAW_TYPES.has(n.type) && n.type !== 'effet')
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
      if (!parts) { parts = txt.split(/[.;!?\n]+/).map((x) => [x, NEG.test(x)]); splitCache.set(txt, parts); }
      for (const [sentence, neg] of parts) if (!neg && re.test(sentence)) return true;
      return false;
    };
    return { map, opts, byId, kids, parent, desc, text, titleN, rare, law, linked, names, termRe, candidates, parentEdgeOf: (id) => parentEdge.get(id), declined: opts.declined || new Set() };
  }
  const lineage = (c, a, b) => c.desc(a).has(b) || c.desc(b).has(a);
  /** intitulé de partie : chapitre, leçon, section — ou nœud dont le titre est une question */
  const heading = (n) => !n || STRUCT.has(n.type) || /\?\s*$/.test(n.title);

  /* Le titre du parent nomme déjà la famille (« Les 10 signes », « Pourquoi… », « 5 conseils
     pour… ») : une branche ou un libellé répété n'ajouterait que du bruit. */
  const NAMED = {
    cause: /pourquoi|d.ou vient|causes?\b|origines?|raisons?|facteurs?/,
    consequence: /consequences?|effets?|couts?|produit|risques?|suites?/,
    effet: /effets?|consequences?|produit/,
    signe: /signes?|comportements?|symptomes?|reconna|indices?/,
    conseil: /conseils?|astuces?|techniques?|etapes?|comment|facons?|moyens?|cles?\b|regles?|habitudes?/,
    solution: /solutions?|armes?|remedes?|comment|moyens?|outils?|techniques?/,
    condition: /conditions?/, fond: /conditions?|fond/, forme: /conditions?|forme/,
    exception: /exceptions?|limites?/, exemple: /exemples?|illustr/,
    categorie: /categories?|types?|formes?|especes?|resultats?|profils?/,
    caracteristique: /caracter|traits?|aspects?/, avantage: /avantages?|atouts?|benefices?/,
    inconvenient: /inconvenients?|limites?|defauts?/, juris: /jurisprudence|arrets?/, texte: /textes?|articles?/,
    critique: /critiques?/, argument: /arguments?/, nuance: /nuances?/, objectif: /objectifs?|buts?|a quoi sert/,
    probleme: /problemes?|difficultes?|pieges?/, piege: /pieges?|erreurs?/, etude: /etudes?|recherches?/,
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
      if (k.type === 'exemple' && p.type === 'definition') continue;
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

  /* ---- Exemples : sous l'élément précis qu'ils illustrent ---- */
  function examples(c) {
    const out = [];
    for (const p of c.map.nodes) {
      const ks = c.kids(p.id);
      if (ks.length < 2) continue;
      const cands = ks.filter((s) => s.type !== 'exemple' && !STRUCT.has(s.type) && s.type !== 'definition');
      for (const k of ks) {
        if (k.type !== 'exemple') continue;
        const ke = c.parentEdgeOf(k.id);
        if (ke && (ke.label || ke.group)) continue; // relation déjà dite par l'auteur
        const txt = c.text.get(k.id);
        // l'exemple nomme-t-il un élément, et un seul ? (deux : il illustre la partie entière)
        const hits = cands.filter((s) => wordsIn(s.title) >= 2 && c.names(txt, s.title));
        let best = null, certainty = null, why = '';
        if (hits.length === 1) { best = hits[0]; certainty = 'sure'; why = 'L’exemple nomme cet élément : il l’illustre lui, pas toute la partie.'; }
        else if (!hits.length) {
          const ex = c.rare(k.title + ' ' + plain(k.note)), pw = c.rare(p.title);
          let bestN = 0, second = 0;
          for (const s of cands) {
            let n = 0; for (const w of c.rare(s.title)) if (ex.has(w) && !pw.has(w)) n++;
            if (n > bestN) { second = bestN; bestN = n; best = s; } else if (n > second) second = n;
          }
          if (best && bestN >= 2 && bestN > second) { certainty = 'probable'; why = 'L’exemple reprend des mots rares de cet élément : il l’illustre sans doute lui — à vérifier.'; }
          else best = null;
        }
        if (!best) continue;
        out.push({
          key: 'ex:' + k.id + '>' + best.id, kind: 'example', certainty, gain: 3,
          title: `Rattacher l’exemple « ${short(k.title, 28)} » à « ${short(best.title, 28)} »`,
          detail: why,
          preview: [`${short(best.title, 28)} —illustré par→ ${short(k.title, 28)}`],
          ids: [k.id, best.id],
          apply(m) {
            const e = S.parentEdge(m, k.id);
            if (!e || e.label || e.group || !S.node(m, best.id) || S.descendants(m, k.id).includes(best.id)) return;
            e.from = best.id; e.label = 'illustré par';
          },
        });
      }
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
        if (pa && pb && pa === pb && !heading(pa) && a.type !== 'exemple') continue; // frères sous une même idée
        const label = a.type === 'exemple' ? 'illustre' : 'fait appel à';
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
     suivante) : une inversion n'est proposée que pour le couple strict cause ↔ conséquence, et
     décochée. */
  function labelAudit(c, notes) {
    const out = [];
    for (const e of c.map.edges) {
      if (!e.label) continue;
      const a = c.byId.get(e.from), b = c.byId.get(e.to);
      if (!a || !b) continue;
      const pol = polarity(e.label);
      if (againstTypes(a, b, e.label)) {
        const parallel = c.map.edges.some((t) => t !== e && t.kind === 'tree' && ((t.from === a.id && t.to === b.id) || (t.from === b.id && t.to === a.id)));
        if (e.kind === 'link' && !parallel) {
          out.push({
            key: 'inv:' + e.id, kind: 'reverse', certainty: 'probable', gain: 5, ids: [a.id, b.id],
            title: `Inverser « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} » ?`,
            detail: `« ${short(a.title, 30)} » est noté ${S.TYPES[a.type].label.toLowerCase()} et « ${short(b.title, 30)} » ${S.TYPES[b.type].label.toLowerCase()} : la flèche semble partir dans le mauvais sens — à vérifier, un élément peut être l’effet d’une chose et la cause d’une autre.`,
            preview: [`${short(b.title, 28)} —${e.label}→ ${short(a.title, 28)}`],
            apply(m) {
              const x = m.edges.find((y) => y.id === e.id);
              if (!x || x.from !== a.id || m.edges.some((y) => y !== x && ((y.from === b.id && y.to === a.id) || (y.from === a.id && y.to === b.id)))) return;
              x.from = b.id; x.to = a.id; delete x.group;
            },
          });
        } else notes.push(note('inv-n:' + e.id, 'reverse', `Sens douteux : « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          'Les types disent l’inverse de la flèche : relisez la phrase, et corrigez le libellé ou les types à la main.', [a.id, b.id]));
        continue;
      }
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
        // un libellé qui contredit les types ne passe pas sur l'arbre : le sens est à trancher à la main
        if (e.label && againstTypes(a, b, e.label)) continue; // labelAudit le signale
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
      const ks = c.kids(p.id).filter((k) => !STRUCT.has(k.type) && !['exemple', 'comparaison', 'definition', 'notion', 'question'].includes(k.type) && !/\?\s*$/.test(k.title));
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
    let dir = 0;
    for (const e of map.edges) {
      const a = c.byId.get(e.from), b = c.byId.get(e.to), pol = polarity(e.label);
      if (a && b && ((pol === 'fwd' && (a.type === 'consequence' || a.type === 'effet') && b.type === 'cause') || (pol === 'back' && a.type === 'cause' && (b.type === 'consequence' || b.type === 'effet')))) dir++;
    }
    const fromHeading = map.edges.filter((e) => e.label && !e.group && heading(c.byId.get(e.from)) && polarity(e.label) && polarity(e.label) !== 'sym').length;
    const notes = [];
    flatLists(c, notes);
    return {
      nodes: map.nodes.length,
      links: linkCount(map),
      relationRate: content.length ? verbs.length / content.length : 1,  // relations nommées par un verbe
      vague: map.edges.filter((e) => polarity(e.label) === 'vague').length,
      wrongDirection: dir,                                                  // flèche contraire au couple cause ↔ conséquence
      verbFromHeading: fromHeading,                                         // verbe causal posé depuis un intitulé
      flat: notes.length,
      integrity: check(map).length,
    };
  }

  function audit(map, opts = {}) {
    if (!map || !map.nodes || !map.nodes.length) return { fixes: [], notes: [], stats: null };
    const c = context(map, opts);
    const notes = [];
    const live = (list) => list.filter((f) => !c.declined.has(f.key));
    const ex = live(examples(c));
    const exIds = new Set(ex.map((x) => x.ids[0]));
    const quiet = new Set();
    const br = live(branches(c, quiet, exIds));
    const taken = new Set([...quiet, ...br.flatMap((b) => b.ids), ...exIds]);
    const fixed = [...live(definitions(c, notes)), ...live(duplicates(c, notes)), ...live(labelAudit(c, notes)), ...ex, ...br, ...live(labels(c, taken))];
    // renvois : un couple ne reçoit qu'une proposition, et la carte a un budget (renvois existants compris)
    const planned = new Set(ex.map((x) => x.key.slice(3)));
    const linksNow = linkCount(map);
    let room = Math.max(0, linkBudget(map.nodes.length) - linksNow);
    const pairs = new Set();
    const linkFixes = live([...wikiLinks(c, notes), ...causal(c), ...crossRefs(c, planned)])
      .sort((a, b) => (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1) || b.gain - a.gain)
      .filter((f) => {
        const k = f.ids.slice().sort().join('|');
        if (pairs.has(k)) return false;
        pairs.add(k);
        if (room <= 0) return false;
        room--; return true;
      });
    const fixes = [...fixed, ...linkFixes].sort((a, b) => (a.certainty === 'sure' ? 0 : 1) - (b.certainty === 'sure' ? 0 : 1) || b.gain - a.gain);
    // signalements calculés sur la carte telle qu'elle serait après les corrections sûres
    // (une liste qu'une correction proposée relie déjà n'est pas « plate »)
    const after = JSON.parse(JSON.stringify({ id: map.id, title: map.title, layout: map.layout, nodes: map.nodes, edges: map.edges }));
    for (const f of fixes) if (f.certainty === 'sure') { try { f.apply(after); } catch (e) { /* aperçu seulement */ } }
    const ca = context(after, opts);
    flatLists(ca, notes);
    ambiguous(c, notes);
    prerequisites(c, notes);
    const seenNotes = new Set();
    return { fixes, notes: notes.filter((n) => !seenNotes.has(n.key) && seenNotes.add(n.key)), stats: metrics(map) };
  }
  const analyze = (map, opts) => audit(map, opts).fixes;

  R.organize = { audit, analyze, check, metrics, splitDefinition, polarity, linkBudget, linkCount, RULES, REL, LEX, CAUSAL_PAIRS };
})(window.R);
