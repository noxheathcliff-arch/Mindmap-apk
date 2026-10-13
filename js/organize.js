/* Ratio — analyse d'organisation d'une carte
 *
 * Le rangement ne se contente pas de placer les nœuds : il relit la carte et propose de
 * meilleures relations. Principe (DESIGN.md §4.4 ter) : un lien qui porte un libellé se lit
 * comme une phrase (« Réchauffement —entraîne→ fonte de la banquise ») et s'apprend mieux
 * qu'une liste d'enfants typés pendus à une section. Chaque proposition est réversible
 * (Annuler) et n'est appliquée qu'avec l'accord de l'utilisateur — rien n'est réécrit en
 * silence, le texte des nœuds n'est jamais modifié.
 *
 * analyze(map) → [{ key, kind, title, detail, preview: [texte], apply(map) }]
 */
(function (R) {
  'use strict';
  const { store: S, U } = R;

  /* Vocabulaire des relations : le verbe d'un lien vers ce type (un enfant), le nom d'une
     branche qui en réunit plusieurs. Libellés courts (≤ 20 caractères). */
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
    critique:        { one: 'critiqué :', many: 'critiques' },
    argument:        { one: 'parce que', many: 'arguments' },
    nuance:          { one: 'nuancé par', many: 'nuances' },
    avantage:        { one: 'avantage', many: 'avantages' },
    inconvenient:    { one: 'inconvénient', many: 'inconvénients' },
    caracteristique: { one: 'se caractérise par', many: 'caractères' },
    signe:           { one: 'se reconnaît à', many: 'signes' },
    categorie:       { one: 'comprend', many: 'catégories' },
    solution:        { one: 'résolu par', many: 'solutions' },
    probleme:        { one: 'pose', many: 'problèmes' },
    definition:      { one: 'définition', many: null },
    piege:           { one: 'attention :', many: 'pièges' },
    conseil:         { one: 'conseil', many: 'conseils' },
    objectif:        { one: 'vise', many: 'objectifs' },
    citation:        { one: 'selon', many: 'citations' },
    etude:           { one: 'montré par', many: 'études' },
  };
  const STRUCT = new Set(['chapitre', 'lecon', 'section']);

  const STOP = new Set(['dans', 'pour', 'avec', 'sans', 'sous', 'entre', 'leur', 'leurs', 'cette', 'celle', 'celui', 'ainsi', 'comme',
    'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'être', 'avoir', 'fait', 'faire', 'droit', 'illustre', 'notamment', 'lorsque',
    'alors', 'aussi', 'donc', 'elle', 'elles', 'sont', 'était', 'peut', 'doit', 'chaque', 'autre', 'autres', 'quand', 'selon']);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = (t) => new Set((norm(t).match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 7)));
  const inter = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
  const short = (t, n = 38) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  function kidsOf(map, id) { return S.childrenOf(map, id); }
  function edgeTo(map, id) { return S.parentEdge(map, id); }
  const hasLink = (map, a, b) => map.edges.some((e) => e.kind === 'link' && ((e.from === a && e.to === b) || (e.from === b && e.to === a)));

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

  /* ---- 1. Branches : une famille de relations (≥ 2) réunie sous un libellé commun ---- */
  function branches(map, quiet) {
    const out = [];
    for (const p of map.nodes) {
      if (p.logic) continue; // ET / OU : la fourche implicite parle déjà
      const ks = kidsOf(map, p.id);
      if (ks.length < 3) continue;
      const fam = new Map();
      for (const k of ks) {
        const r = REL[k.type];
        const e = edgeTo(map, k.id);
        if (!r || !r.many || !e || e.group || e.label) continue;
        if (!fam.has(k.type)) fam.set(k.type, []);
        fam.get(k.type).push(k);
      }
      for (const [type, list] of fam) {
        if (list.length < 2) continue;
        if (named(p, type)) { for (const k of list) quiet.add(k.id); continue; }
        const label = REL[type].many;
        out.push({
          key: 'br:' + p.id + ':' + type, kind: 'branch',
          title: `Regrouper ${list.length} ${label} de « ${short(p.title, 30)} »`,
          detail: 'Une branche nommée dit d’un coup d’œil ce qu’elles sont pour leur parent, au lieu d’une liste à décoder.',
          preview: [`${short(p.title, 30)} —${label}→ ${list.map((k) => short(k.title, 22)).join(' · ')}`],
          ids: list.map((k) => k.id),
          apply(m) {
            const g = U.uid('g');
            const members = list.map((k) => edgeTo(m, k.id)).filter(Boolean);
            for (const e of members) { e.group = g; e.label = label; }
            // les branches d'une fourche se suivent dans l'ordre de lecture
            regroupOrder(m, p.id, new Set(list.map((k) => k.id)));
          },
        });
      }
    }
    return out;
  }
  /** Rend contigus, dans l'ordre de lecture, les enfants d'un même groupe (le rangement suit) */
  function regroupOrder(m, pid, ids) {
    const ks = S.childrenOf(m, pid);
    const firstIdx = ks.findIndex((k) => ids.has(k.id));
    const rest = ks.filter((k) => !ids.has(k.id));
    const grp = ks.filter((k) => ids.has(k.id));
    const order = [...rest.slice(0, firstIdx), ...grp, ...rest.slice(firstIdx)];
    const y0 = Math.min(...ks.map((k) => k.y));
    order.forEach((k, i) => { const dy = y0 + i * 40 - k.y; for (const id of [k.id, ...S.descendants(m, k.id)]) { const n = S.node(m, id); if (n) n.y += dy; } });
  }

  /* ---- 2. Libellés : chaque relation dit son verbe ---- */
  function labels(map, taken) {
    const list = [];
    for (const e of map.edges) {
      if (e.kind !== 'tree' || e.label || e.group) continue;
      const k = S.node(map, e.to), p = S.node(map, e.from);
      if (!k || !p || p.logic || taken.has(k.id)) continue;
      const r = REL[k.type];
      if (!r || STRUCT.has(k.type)) continue;
      if (p.type === 'methode' && k.type === 'etape') continue; // frise : la flèche suffit
      list.push({ e, k, p, label: r.one });
    }
    if (!list.length) return [];
    return [{
      key: 'lbl:' + list.map((x) => x.e.id).join(','), kind: 'label',
      title: `Nommer ${list.length} relation${list.length > 1 ? 's' : ''} par un libellé`,
      detail: 'Le lien se lit comme une phrase : la nature de la relation est comprise sans déchiffrer le type du nœud.',
      preview: list.slice(0, 4).map((x) => `${short(x.p.title, 24)} —${x.label}→ ${short(x.k.title, 24)}`).concat(list.length > 4 ? [`… et ${list.length - 4} autre${list.length - 4 > 1 ? 's' : ''}`] : []),
      apply(m) { for (const x of list) { const e = m.edges.find((y) => y.id === x.e.id); if (e && !e.label) e.label = x.label; } },
    }];
  }

  /* ---- 3. Exemples : sous l'élément qu'ils illustrent ---- */
  function examples(map) {
    const out = [];
    for (const p of map.nodes) {
      const ks = kidsOf(map, p.id);
      ks.forEach((k, i) => {
        if (k.type !== 'exemple' || i === 0) return;
        const ke = edgeTo(map, k.id);
        if (ke && ke.label) return; // relation déjà dite (« illustré par » posé par le skill ou l'utilisateur)
        const ex = words(k.title + ' ' + k.note);
        const pw = words(p.title);
        let best = null, bestN = 0;
        for (const s of ks) {
          if (s === k || s.type === 'exemple' || STRUCT.has(s.type)) continue;
          const n = inter(ex, new Set([...words(s.title)].filter((w) => !pw.has(w))));
          if (n > bestN) { best = s; bestN = n; }
        }
        if (!best) return;
        out.push({
          key: 'ex:' + k.id + '>' + best.id, kind: 'example',
          title: `Rattacher l’exemple « ${short(k.title, 28)} » à « ${short(best.title, 28)} »`,
          detail: 'L’exemple illustre cet élément précis, pas toute la partie : rattaché à lui, il s’apprend avec lui.',
          preview: [`${short(best.title, 28)} —illustré par→ ${short(k.title, 28)}`],
          apply(m) {
            const e = edgeTo(m, k.id);
            if (!e || !S.node(m, best.id) || best.id === k.id || S.descendants(m, k.id).includes(best.id)) return;
            e.from = best.id; e.label = 'illustré par'; delete e.group;
          },
        });
      });
    }
    return out;
  }

  /* ---- 4. Cause → effet entre frères ---- */
  const CAUSES = new Set(['cause', 'condition', 'fond', 'forme', 'probleme']);
  const EFFECTS = new Set(['effet', 'consequence', 'solution']);
  function causal(map) {
    const out = [];
    for (const p of map.nodes) {
      const ks = kidsOf(map, p.id);
      const cs = ks.filter((k) => CAUSES.has(k.type)), es = ks.filter((k) => EFFECTS.has(k.type));
      if (!cs.length || !es.length) continue;
      const pw = words(p.title);
      for (const e of es) {
        const ew = new Set([...words(e.title + ' ' + e.note)].filter((w) => !pw.has(w)));
        let best = null, bestN = 0;
        for (const c of cs) { const n = inter(ew, words(c.title + ' ' + c.note)); if (n > bestN) { best = c; bestN = n; } }
        if (!best || hasLink(map, best.id, e.id)) continue;
        const label = best.type === 'probleme' ? 'résolu par' : 'entraîne';
        out.push({
          key: 'ce:' + best.id + '>' + e.id, kind: 'causal',
          title: `Relier « ${short(best.title, 26)} » à « ${short(e.title, 26)} »`,
          detail: 'Ces deux éléments de la même partie parlent de la même chose : le lien dit lequel produit l’autre.',
          preview: [`${short(best.title, 28)} —${label}→ ${short(e.title, 28)}`],
          apply(m) { if (!hasLink(m, best.id, e.id)) m.edges.push({ id: U.uid('e'), from: best.id, to: e.id, kind: 'link', label }); },
        });
      }
    }
    return out.slice(0, 6);
  }

  /* ---- 5. Définition modulaire : la définition découpée en composantes liées ---- */
  const PERSON = /^(personnes?|individus?|epoux|heritiers?|defunt|auteur|creanciers?|debiteurs?|parties?|enfants?|parents?|conjoints?|ayants?|successeurs?|tiers|proprietaires?|acquereurs?|vendeurs?)/;
  // ce qu'un étudiant oublie en récitant : le nombre, l'exclusivité, la condition
  const EMPH = /\b(une? ou plusieurs|deux ou plusieurs|au moins (?:une?|deux|[\wéè]+)|seule?s?|uniquement|exclusivement|nécessairement|obligatoirement|toujours|jamais|tous|toutes|personnellement|à titre gratuit|à titre onéreux|de plein droit)\b/i;
  function splitDefinition(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    t = t.split(/(?<=[.;])\s/)[0].replace(/[.;]$/, '');
    // sujet : « X est une notion … qui désigne … » → on part du verbe qui porte le sens
    const m = t.match(/\b(désigne|consiste (?:à|en)|est (?:l['’]|la |le |un |une |ce )|permet)\b/i);
    if (m) t = t.slice(m.index);
    t = t.replace(/,\s*(notamment|mais|comme|sauf)\s+/gi, ' $1 ');
    // 1) virgules : une énumération courte (« créer, modifier, transmettre ») reste d'un bloc
    const chunks = [];
    let inEnum = false;
    for (const c of t.split(/,\s*/)) {
      const short = c.split(' ').length < 3;
      if (chunks.length && (short || (inEnum && /\s(ou|et)\s/.test(' ' + c + ' ')))) { chunks[chunks.length - 1] += ', ' + c; inEnum = short; }
      else { chunks.push(c); inEnum = false; }
    }
    // 2) articulations : chaque complément devient une composante
    const cut = /\s(?=d['’]une?\s|à une?\s|à des\s|aux\s|par\s|pour\s|afin de\s|en vue de\s|lorsque\s|sauf\s|notamment\s|mais\s|comme\s|destinée?s?\s+à\s|résultant\s)/i;
    const parts = chunks.flatMap((c) => c.split(cut)).map((x) => x.trim()).filter(Boolean);
    const merged = [];
    for (const p of parts) { if (merged.length && p.length < 8) merged[merged.length - 1] += ' ' + p; else merged.push(p); }
    const comps = merged.slice(0, 6).map((p, i) => {
      const lp = norm(p);
      let label, body = p;
      const take = (re) => { body = p.replace(re, '').trim(); };
      if (i === 0 && /^designe\b/.test(lp)) { label = 'désigne'; take(/^désigne\s+/i); }
      else if (i === 0 && /^consiste/.test(lp)) { label = 'consiste en'; take(/^consiste (?:à|en)\s+/i); }
      else if (i === 0 && /^permet/.test(lp)) { label = 'permet'; take(/^permet\s+/i); }
      else if (i === 0) { label = 'c’est'; take(/^est\s+/i); }
      else if (/^d['’]une? (maniere|facon|fa.on)\b/.test(lp)) { label = 'comment ?'; }
      else if (/^d['’]une?\s/.test(lp)) { take(/^d['’]/i); label = PERSON.test(norm(body.replace(/^une?\s+(?:ou plusieurs\s+)?/i, ''))) ? 'de qui ?' : 'de quoi ?'; }
      else if (/^(a une?|a des|aux)\s/.test(lp)) { take(/^(à|aux)\s+/i); label = PERSON.test(norm(body.replace(/^(?:une?|des)\s+(?:ou plusieurs\s+)?/i, ''))) || /^aux/.test(lp) ? 'à qui ?' : 'à quoi ?'; }
      else if (/^par\s/.test(lp)) { take(/^par\s+/i); label = 'par quoi ?'; }
      else if (/^(pour|afin de|en vue de)\s/.test(lp)) { label = 'dans quel but ?'; }
      else if (/^lorsque\s/.test(lp)) { take(/^lorsque\s+/i); label = 'quand ?'; }
      else if (/^sauf\s/.test(lp)) { take(/^sauf\s+/i); label = 'sauf'; }
      else if (/^notamment\s/.test(lp)) { take(/^notamment\s+/i); label = 'notamment'; }
      else if (/^mais\s/.test(lp)) { take(/^mais\s+/i); label = 'mais'; }
      else if (/^comme\s/.test(lp)) { take(/^comme\s+/i); label = 'comme'; }
      else if (/^destinee?s?\s+a\s/.test(lp)) { take(/^destinée?s?\s+à\s+/i); label = 'pour ?'; }
      else if (/^resultant\s/.test(lp)) { take(/^résultant\s+(?:de\s+|d['’])?/i); label = 'résulte de'; }
      else label = 'et';
      const title = body.charAt(0).toUpperCase() + body.slice(1);
      const em = (title.match(EMPH) || [])[0];
      return { label, title, ...(em ? { em } : {}) };
    }).filter((c) => c.title.length >= 4);
    return comps.length >= 2 ? comps : [];
  }
  function definitions(map) {
    const out = [];
    for (const n of map.nodes) {
      if (n.type !== 'definition' || kidsOf(map, n.id).length) continue;
      const src = (n.note && n.note.replace(/[#*=>`_[\]]/g, '').trim().length > n.title.length ? n.note.replace(/[#*=>`_[\]]/g, '') : n.title);
      if (src.length < 80) continue;
      const comps = splitDefinition(src);
      if (!comps.length) continue;
      out.push({
        key: 'def:' + n.id, kind: 'definition',
        title: `Décomposer la définition « ${short(n.title, 32)} »`,
        detail: 'Une définition récitée par cœur s’oublie ; découpée en composantes reliées (que désigne-t-elle ? de qui ? à qui ?), elle se comprend — et se retient.',
        preview: comps.map((c) => `—${c.label}→ ${short(c.title, 44)}${c.em ? `  (relief : « ${c.em} »)` : ''}`),
        apply(m) {
          const d = S.node(m, n.id);
          if (!d || S.childrenOf(m, d.id).length) return;
          comps.forEach((c, i) => {
            const k = S.newNode({ type: 'idee', title: c.title, em: c.em, x: d.x + 300, y: d.y + i * 60 });
            m.nodes.push(k);
            m.edges.push({ id: U.uid('e'), from: d.id, to: k.id, kind: 'tree', label: c.label });
          });
          // la définition complète reste dans la note (on la récite en entier à la fin)
          if (!d.note.trim()) d.note = src;
        },
      });
    }
    return out;
  }

  /* ---- 6. Renvois écrits dans les notes ([[Titre]]) qui ne sont pas encore des liens ---- */
  function wikiLinks(map) {
    const out = [];
    const byTitle = new Map(map.nodes.map((n) => [norm(n.title).trim(), n]));
    for (const n of map.nodes) {
      for (const [, t] of String(n.note || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
        const target = byTitle.get(norm(t).trim());
        if (!target || target.id === n.id || hasLink(map, n.id, target.id)) continue;
        const pe = edgeTo(map, target.id), ne = edgeTo(map, n.id);
        if ((pe && pe.from === n.id) || (ne && ne.from === target.id)) continue;
        out.push({
          key: 'wk:' + n.id + '>' + target.id, kind: 'link',
          title: `Relier « ${short(n.title, 26)} » à « ${short(target.title, 26)} »`,
          detail: 'La note y renvoie déjà : un lien visible rattache les deux idées, même d’une partie à l’autre.',
          preview: [`${short(n.title, 28)} —voir aussi→ ${short(target.title, 28)}`],
          apply(m) { if (!hasLink(m, n.id, target.id)) m.edges.push({ id: U.uid('e'), from: n.id, to: target.id, kind: 'link', label: 'voir aussi' }); },
        });
      }
    }
    return out.slice(0, 6);
  }

  function analyze(map) {
    if (!map || !map.nodes || !map.nodes.length) return [];
    const ex = examples(map);
    const quiet = new Set();
    const br = branches(map, quiet);
    const taken = new Set([...quiet, ...br.flatMap((b) => b.ids), ...ex.map((x) => x.key.split(':')[1].split('>')[0])]);
    return [...definitions(map), ...ex, ...br, ...causal(map), ...wikiLinks(map), ...labels(map, taken)];
  }

  R.organize = { analyze, splitDefinition, REL };
})(window.R);
