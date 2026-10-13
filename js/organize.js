/* Ratio — audit d'organisation d'une carte (seconde ligne de contrôle après le skill d'import)
 *
 * Le rangement ne se contente pas de placer les nœuds : il relit la carte comme un graphe de
 * connaissances et cherche ce qui empêche de suivre le raisonnement. Principe (DESIGN.md §4.4 ter) :
 * un lien libellé se lit comme une phrase (« Réchauffement —entraîne→ Fonte de la banquise ») et
 * s'apprend mieux qu'une liste d'enfants typés pendus à une section.
 *
 * Trois niveaux, selon ce que la carte permet d'établir :
 *  - correction SÛRE : la relation est déjà dite par la carte (types posés par l'auteur, mot exact
 *    repris d'un nœud à l'autre, renvoi [[Titre]] écrit dans une note, texte de la définition) ;
 *  - correction PROBABLE : indice seulement (mots partagés) — proposée décochée, à vérifier ;
 *  - SIGNALEMENT : défaut visible mais dont la correction demanderait d'inventer un sens (sens
 *    d'une causalité inconnu, libellé vague sans indice, liste plate) — montré, jamais corrigé.
 * Rien n'est appliqué sans accord, le texte des nœuds n'est jamais réécrit (les composantes d'une
 * définition reprennent ses mots exacts), et l'audit d'une carte déjà corrigée ne propose plus rien
 * (idempotence, tests/organize.test.cjs).
 *
 * audit(map) → { fixes: [{ key, kind, certainty, title, detail, preview, apply(map) }],
 *                notes: [{ key, kind, title, detail, ids }] }
 * analyze(map) → audit(map).fixes            check(map) → [violation] (intégrité du graphe)
 */
(function (R) {
  'use strict';
  const { store: S, U } = R;

  /* Vocabulaire des relations : le verbe d'un lien parent → enfant de ce type, le nom d'une
     branche qui en réunit plusieurs. Indicatif : l'auteur (ou le skill) peut écrire mieux. */
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
    argument:        { one: 'justifié par', many: 'arguments' },
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
  const CAUSES = new Set(['cause', 'condition', 'fond', 'forme', 'probleme']);
  const EFFECTS = new Set(['effet', 'consequence', 'solution']);
  // libellés qui n'apprennent rien sur la relation
  const VAGUE = new Set(['lie a', 'lien', 'rapport', 'relation', 'en lien avec', 'associe a', 'concerne', 'cf', 'cf.', '?', '-', '→']);
  // libellés causaux : la flèche va de la cause vers l'effet…
  const FORWARD = /^(entraine|provoque|produit|cause|aboutit a|mene a|permet|implique|donc|rend possible)\b/;
  // … ou de l'effet vers la cause
  const BACKWARD = /^(a pour cause|resulte de|decoule de|nait de|provient de|est cause par|suppose|exige|depend de)\b/;
  const CAUSAL_WORDS = /\b(entraine|provoque|cause|consequence|effet|resulte|decoule|produit|aboutit|origine)/;

  const STOP = new Set(['dans', 'pour', 'avec', 'sans', 'sous', 'entre', 'leur', 'leurs', 'cette', 'celle', 'celui', 'ainsi', 'comme',
    'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'etre', 'avoir', 'fait', 'faire', 'droit', 'illustre', 'notamment', 'lorsque',
    'alors', 'aussi', 'donc', 'elle', 'elles', 'sont', 'etait', 'peut', 'doit', 'chaque', 'autre', 'autres', 'quand', 'selon']);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
  const words = (t) => new Set((norm(t).match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 7)));
  const inter = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
  const short = (t, n = 38) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const plain = (t) => String(t || '').replace(/[#*=>`_[\]]/g, '');
  const textOf = (n) => n.title + ' ' + plain(n.note);
  /** le texte contient-il ce terme comme mots entiers (accents et casse ignorés) ? */
  const mentions = (text, term) => {
    const t = norm(term).trim();
    if (t.length < 5) return false;
    return new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(norm(text));
  };

  const kidsOf = (map, id) => S.childrenOf(map, id);
  const edgeTo = (map, id) => S.parentEdge(map, id);
  const linked = (map, a, b) => map.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const lineage = (map, a, b) => S.descendants(map, a).includes(b) || S.descendants(map, b).includes(a);

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

  /* ---- Branches : une famille de relations (≥ 2) réunie sous un libellé commun ---- */
  function branches(map, quiet, moved = new Set()) {
    const out = [];
    for (const p of map.nodes) {
      if (p.logic) continue; // ET / OU : la fourche implicite parle déjà
      const ks = kidsOf(map, p.id);
      if (ks.length < 3) continue;
      const fam = new Map();
      for (const k of ks) {
        const r = REL[k.type];
        const e = edgeTo(map, k.id);
        if (!r || !r.many || !e || e.group || e.label || moved.has(k.id)) continue;
        if (!fam.has(k.type)) fam.set(k.type, []);
        fam.get(k.type).push(k);
      }
      for (const [type, list] of fam) {
        if (list.length < 2) continue;
        if (named(p, type)) { for (const k of list) quiet.add(k.id); continue; }
        const label = REL[type].many;
        out.push({
          key: 'br:' + p.id + ':' + type, kind: 'branch', certainty: 'sure',
          title: `Regrouper ${list.length} ${label} de « ${short(p.title, 30)} »`,
          detail: 'Une branche nommée dit d’un coup d’œil ce qu’ils sont pour leur parent, au lieu d’une liste à décoder.',
          preview: [`${short(p.title, 30)} —${label}→ ${list.map((k) => short(k.title, 22)).join(' · ')}`],
          ids: list.map((k) => k.id),
          apply(m) {
            const g = U.uid('g');
            const members = list.map((k) => edgeTo(m, k.id)).filter((e) => e && e.from === p.id && !e.group && !e.label);
            if (members.length < 2) return;
            for (const e of members) { e.group = g; e.label = label; }
            // les branches d'une fourche se suivent dans l'ordre de lecture
            regroupOrder(m, p.id, new Set(members.map((e) => e.to)));
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

  /* ---- Libellés : chaque relation dit son verbe (le type posé par l'auteur le donne) ---- */
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
      key: 'lbl:' + list.map((x) => x.e.id).join(','), kind: 'label', certainty: 'sure',
      title: `Nommer ${list.length} relation${list.length > 1 ? 's' : ''} par un libellé`,
      detail: 'Le lien se lit comme une phrase : la relation est comprise sans déchiffrer le sur-titre du nœud.',
      preview: list.slice(0, 4).map((x) => `${short(x.p.title, 24)} —${x.label}→ ${short(x.k.title, 24)}`).concat(list.length > 4 ? [`… et ${list.length - 4} autre${list.length - 4 > 1 ? 's' : ''}`] : []),
      apply(m) { for (const x of list) { const e = m.edges.find((y) => y.id === x.e.id); if (e && !e.label && !e.group) e.label = x.label; } },
    }];
  }

  /* ---- Exemples : sous l'élément qu'ils illustrent ---- */
  function examples(map) {
    const out = [];
    for (const p of map.nodes) {
      const ks = kidsOf(map, p.id);
      ks.forEach((k, i) => {
        if (k.type !== 'exemple' || i === 0) return;
        const ke = edgeTo(map, k.id);
        if (ke && ke.label) return; // relation déjà dite (« illustré par » posé par le skill ou l'utilisateur)
        const ex = words(textOf(k));
        const pw = words(p.title);
        let best = null, bestN = 0, exact = false;
        for (const s of ks) {
          if (s === k || s.type === 'exemple' || STRUCT.has(s.type)) continue;
          const hit = mentions(textOf(k), s.title);
          const n = inter(ex, new Set([...words(s.title)].filter((w) => !pw.has(w)))) + (hit ? 10 : 0);
          if (n > bestN) { best = s; bestN = n; exact = hit; }
        }
        if (!best) return;
        out.push({
          key: 'ex:' + k.id + '>' + best.id, kind: 'example', certainty: exact || bestN >= 2 ? 'sure' : 'probable',
          title: `Rattacher l’exemple « ${short(k.title, 28)} » à « ${short(best.title, 28)} »`,
          detail: exact ? 'L’exemple nomme cet élément : il l’illustre lui, pas toute la partie.'
            : 'L’exemple reprend les mots de cet élément : il l’illustre sans doute lui, pas toute la partie.',
          preview: [`${short(best.title, 28)} —illustré par→ ${short(k.title, 28)}`],
          apply(m) {
            const e = edgeTo(m, k.id);
            if (!e || e.label || !S.node(m, best.id) || S.descendants(m, k.id).includes(best.id)) return;
            e.from = best.id; e.label = 'illustré par'; delete e.group;
          },
        });
      });
    }
    return out;
  }

  /* ---- Cause → effet entre frères : le sens vient des types, le couple des mots partagés ---- */
  function causal(map) {
    const out = [];
    for (const p of map.nodes) {
      const ks = kidsOf(map, p.id);
      const cs = ks.filter((k) => CAUSES.has(k.type)), es = ks.filter((k) => EFFECTS.has(k.type));
      if (!cs.length || !es.length) continue;
      const pw = words(p.title);
      for (const e of es) {
        const ew = new Set([...words(textOf(e))].filter((w) => !pw.has(w)));
        let best = null, bestN = 0, exact = false;
        for (const c of cs) {
          const hit = mentions(textOf(e), c.title) || mentions(textOf(c), e.title);
          const n = inter(ew, words(textOf(c))) + (hit ? 10 : 0);
          if (n > bestN) { best = c; bestN = n; exact = hit; }
        }
        if (!best || linked(map, best.id, e.id)) continue;
        const label = best.type === 'probleme' ? 'résolu par' : CAUSES.has(best.type) && best.type !== 'cause' ? 'permet' : 'entraîne';
        out.push({
          key: 'ce:' + best.id + '>' + e.id, kind: 'causal', certainty: exact ? 'sure' : 'probable',
          title: `Relier « ${short(best.title, 26)} » à « ${short(e.title, 26)} »`,
          detail: exact ? 'L’un nomme l’autre ; les types disent lequel produit l’autre.'
            : 'Ils parlent de la même chose et les types donnent le sens — à confirmer : la carte ne dit pas que l’un produit l’autre.',
          preview: [`${short(best.title, 28)} —${label}→ ${short(e.title, 28)}`],
          apply(m) { if (!linked(m, best.id, e.id)) m.edges.push({ id: U.uid('e'), from: best.id, to: e.id, kind: 'link', label }); },
        });
      }
    }
    return out.slice(0, 8);
  }

  /* ---- Relations transversales : un élément qui NOMME une notion définie ailleurs ---- */
  function crossRefs(map, planned = new Set()) {
    const out = [];
    const root = map.nodes.find((n) => !edgeTo(map, n.id));
    const targets = map.nodes.filter((n) => (n.type === 'definition' || n.type === 'notion') && n !== root && n.title.trim().length >= 5
      && !mentions(map.title, n.title) && !(root && mentions(root.title, n.title)));
    for (const b of targets) {
      // un terme repris partout (le sujet de la carte) n'apprend rien : on l'ignore
      const users = map.nodes.filter((a) => a !== b && mentions(textOf(a), b.title));
      if (users.length > Math.max(3, map.nodes.length * 0.3)) continue;
      // au plus 3 renvois vers une même notion, en comptant ceux déjà tracés (idempotence)
      let per = map.edges.filter((e) => e.kind === 'link' && e.to === b.id).length;
      users.sort((x, y) => mentions(y.title, b.title) - mentions(x.title, b.title));
      for (const a of users) {
        if (per >= 3) break;
        if (STRUCT.has(a.type) || a === root || linked(map, a.id, b.id) || lineage(map, a.id, b.id) || planned.has(a.id + '>' + b.id)) continue;
        const pa = edgeTo(map, a.id), pb = edgeTo(map, b.id);
        if (pa && pb && pa.from === pb.from && !STRUCT.has((S.node(map, pa.from) || {}).type) && a.type !== 'exemple') continue; // frères sous une même idée : déjà proches
        const label = a.type === 'exemple' ? 'illustre' : 'fait appel à';
        const inTitle = mentions(a.title, b.title);
        per++;
        out.push({
          key: 'x:' + a.id + '>' + b.id, kind: 'cross', certainty: 'sure',
          title: `Relier « ${short(a.title, 26)} » à la notion « ${short(b.title, 26)} »`,
          detail: `${inTitle ? 'Son titre' : 'Sa note'} nomme cette notion, définie ailleurs : le renvoi rend la dépendance visible sans toucher au plan.`,
          preview: [`${short(a.title, 28)} —${label}→ ${short(b.title, 28)}`],
          apply(m) { if (!linked(m, a.id, b.id)) m.edges.push({ id: U.uid('e'), from: a.id, to: b.id, kind: 'link', label }); },
        });
      }
    }
    return out.slice(0, 8);
  }

  /* ---- Renvois écrits dans les notes ([[Titre]]) qui ne sont pas encore des liens ---- */
  function wikiLinks(map) {
    const out = [];
    const byTitle = new Map(map.nodes.map((n) => [norm(n.title).trim(), n]));
    for (const n of map.nodes) {
      for (const [, t] of String(n.note || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
        const target = byTitle.get(norm(t).trim());
        if (!target || target.id === n.id || linked(map, n.id, target.id)) continue;
        out.push({
          key: 'wk:' + n.id + '>' + target.id, kind: 'link', certainty: 'sure',
          title: `Relier « ${short(n.title, 26)} » à « ${short(target.title, 26)} »`,
          detail: 'La note y renvoie déjà : un lien visible rattache les deux idées, même d’une partie à l’autre.',
          preview: [`${short(n.title, 28)} —voir aussi→ ${short(target.title, 28)}`],
          apply(m) { if (!linked(m, n.id, target.id)) m.edges.push({ id: U.uid('e'), from: n.id, to: target.id, kind: 'link', label: 'voir aussi' }); },
        });
      }
    }
    return out.slice(0, 6);
  }

  /* ---- Libellés : sens inversé, libellé vague ---- */
  function labelAudit(map, notes) {
    const out = [];
    for (const e of map.edges) {
      if (!e.label) continue;
      const a = S.node(map, e.from), b = S.node(map, e.to);
      if (!a || !b) continue;
      const l = norm(e.label).trim();
      const aC = CAUSES.has(a.type), aE = EFFECTS.has(a.type), bC = CAUSES.has(b.type), bE = EFFECTS.has(b.type);
      const fwd = FORWARD.test(l), back = BACKWARD.test(l);
      // les types posés par l'auteur contredisent le sens de la flèche
      if ((fwd && aE && bC) || (back && aC && bE)) {
        if (e.kind === 'link') {
          out.push({
            key: 'inv:' + e.id, kind: 'reverse', certainty: 'sure',
            title: `Inverser le lien « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
            detail: `« ${short(a.title, 30)} » est noté ${S.TYPES[a.type].label.toLowerCase()} et « ${short(b.title, 30)} » ${S.TYPES[b.type].label.toLowerCase()} : la flèche part dans le mauvais sens.`,
            preview: [`${short(b.title, 28)} —${e.label}→ ${short(a.title, 28)}`],
            apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x && x.from === a.id) { x.from = b.id; x.to = a.id; delete x.group; } },
          });
        } else if (!e.group && REL[b.type]) {
          // arête d'arbre : la hiérarchie reste, le verbe se retourne
          const label = REL[b.type].one;
          out.push({
            key: 'invl:' + e.id, kind: 'reverse', certainty: 'sure',
            title: `Corriger le libellé « ${e.label} » vers « ${short(b.title, 26)} »`,
            detail: `« ${short(b.title, 30)} » est noté ${S.TYPES[b.type].label.toLowerCase()} : lu dans ce sens, « ${e.label} » dit le contraire.`,
            preview: [`${short(a.title, 28)} —${label}→ ${short(b.title, 28)}`],
            apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x && x.label === e.label) x.label = label; },
          });
        } else notes.push(note('inv-n:' + e.id, 'reverse', `Sens douteux : « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          'Les types disent l’inverse de la flèche, mais le lien appartient à une branche : à corriger à la main.', [a.id, b.id]));
        continue;
      }
      if (VAGUE.has(l)) {
        if (e.kind === 'tree' && !e.group && REL[b.type] && !STRUCT.has(b.type)) {
          const label = REL[b.type].one;
          out.push({
            key: 'vg:' + e.id, kind: 'label', certainty: 'sure',
            title: `Préciser « ${e.label} » vers « ${short(b.title, 26)} »`,
            detail: `Le type de l’élément (${S.TYPES[b.type].label.toLowerCase()}) dit la relation mieux que « ${e.label} ».`,
            preview: [`${short(a.title, 28)} —${label}→ ${short(b.title, 28)}`],
            apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x && x.label === e.label) x.label = label; },
          });
        } else notes.push(note('vg-n:' + e.id, 'label', `Libellé vague : « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          'Rien dans la carte ne dit quelle est la relation exacte : à préciser à la main (entraîne, suppose, sauf, s’oppose à…).', [a.id, b.id]));
      }
    }
    return out;
  }

  /* ---- Doublons : renvoi parallèle à une arête d'arbre, renvois répétés ---- */
  function duplicates(map) {
    const out = [];
    const seen = new Map();
    for (const e of map.edges) {
      if (e.kind !== 'link') continue;
      const t = map.edges.find((x) => x.kind === 'tree' && ((x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from)));
      const a = S.node(map, e.from), b = S.node(map, e.to);
      if (!a || !b) continue;
      if (t) {
        const keep = e.label && !t.label && !t.group && t.from === e.from;
        out.push({
          key: 'dup:' + e.id, kind: 'duplicate', certainty: 'sure',
          title: `Fondre le renvoi « ${short(a.title, 22)} → ${short(b.title, 22)} » dans la hiérarchie`,
          detail: keep ? 'Ils sont déjà parent et enfant : le libellé du renvoi passe sur l’arête de l’arbre.' : 'Ils sont déjà parent et enfant : le renvoi double le trait.',
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
      const k = [e.from, e.to].sort().join('|') + '|' + norm(e.label);
      if (seen.has(k)) {
        out.push({
          key: 'dup:' + e.id, kind: 'duplicate', certainty: 'sure',
          title: `Supprimer le renvoi répété « ${short(a.title, 22)} —${e.label}→ ${short(b.title, 22)} »`,
          detail: 'La même relation est déjà tracée entre ces deux éléments.',
          preview: [`− ${short(a.title, 24)} —${e.label}→ ${short(b.title, 24)}`],
          apply(m) { const x = m.edges.find((y) => y.id === e.id); if (x) m.edges.splice(m.edges.indexOf(x), 1); },
        });
      } else seen.set(k, e);
    }
    return out;
  }

  /* ---- Définition modulaire : la définition découpée en composantes reliées ----
     Les composantes reprennent les mots EXACTS de la source (seule la première lettre passe en
     capitale) ; elles s'enchaînent selon la logique de la phrase : la notion est qualifiée (c'est),
     ce qu'elle désigne est le cœur, les compléments (de qui ? à qui ?…) précisent le cœur, et
     « notamment » / « comme » précisent la composante qui les précède. La définition intégrale
     reste dans la note : on peut toujours la reconstituer. */
  const PERSON = /^(personnes?|individus?|epoux|heritiers?|defunt|auteur|creanciers?|debiteurs?|parties?|enfants?|parents?|conjoints?|ayants?|successeurs?|tiers|proprietaires?|acquereurs?|vendeurs?)/;
  // ce qu'un étudiant oublie en récitant : le nombre, l'exclusivité, la condition
  const EMPH = /\b(une? ou plusieurs|deux ou plusieurs|au moins (?:une?|deux|[\wéè]+)|seule?s?|uniquement|exclusivement|nécessairement|obligatoirement|toujours|jamais|tous|toutes|personnellement|à titre gratuit|à titre onéreux|de plein droit|à condition que|sous réserve)\b/i;
  const HEADS = new Set(['désigne', 'consiste en', 'permet', 'c’est']);
  function splitDefinition(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    t = t.split(/(?<=[.;])\s/)[0].replace(/[.;]$/, '');
    // qualification : « X est une notion juridique qui désigne … »
    let qual = null;
    const q = t.match(/\best\s+((?:une?|la|le|l['’])\s*[^,]{3,60}?)\s+qui\s+(désigne|consiste|permet)\b/i);
    if (q) { qual = q[1].trim(); t = t.slice(q.index + q[0].length - q[2].length); }
    else {
      const m = t.match(/\b(désigne|consiste (?:à|en)|est (?:l['’]|la |le |un |une |ce )|permet)\b/i);
      if (m) t = t.slice(m.index);
    }
    t = t.replace(/,\s*(notamment|mais|comme|sauf)\s+/gi, ' $1 ');
    // 1) virgules : une énumération courte (« créer, modifier, transmettre ») reste d'un bloc
    const chunks = [];
    let inEnum = false;
    for (const c of t.split(/,\s*/)) {
      const tiny = c.split(' ').length < 3;
      if (chunks.length && (tiny || (inEnum && /\s(ou|et)\s/.test(' ' + c + ' ')))) { chunks[chunks.length - 1] += ', ' + c; inEnum = tiny; }
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
      else if (/^d'une? (maniere|facon)\b/.test(lp)) { label = 'comment ?'; }
      else if (/^d'une?\s/.test(lp)) { take(/^d['’]/i); label = PERSON.test(norm(body.replace(/^une?\s+(?:ou plusieurs\s+)?/i, ''))) ? 'de qui ?' : 'de quoi ?'; }
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
      return { label, title: body };
    });
    if (qual) comps.unshift({ label: 'c’est', title: qual, qual: true });
    const out = comps.map((c) => {
      const title = c.title.charAt(0).toUpperCase() + c.title.slice(1);
      const em = (title.match(EMPH) || [])[0];
      return { label: c.label, title, ...(em ? { em } : {}), qual: !!c.qual };
    });
    // enchaînement : -1 = la définition elle-même
    const head = out.findIndex((c) => !c.qual && HEADS.has(c.label));
    out.forEach((c, i) => {
      if (c.qual || i === head) c.parent = -1;
      else if ((c.label === 'notamment' || c.label === 'comme') && i > 0 && !out[i - 1].qual) c.parent = i - 1;
      else c.parent = head >= 0 ? head : -1;
      delete c.qual;
    });
    const kept = out.filter((c) => c.title.length >= 4);
    return kept.length >= 2 && kept.length === out.length ? out : [];
  }
  function definitions(map, notes) {
    const out = [];
    for (const n of map.nodes) {
      if (n.type !== 'definition' || kidsOf(map, n.id).length) continue;
      const fromNote = plain(n.note).trim().length > n.title.length;
      const src = fromNote ? plain(n.note).trim() : n.title;
      if (src.length < 80) continue;
      if (!fromNote) { // la définition entière est dans le titre : on ne sait pas quel terme elle définit
        notes.push(note('def-t:' + n.id, 'definition', `Définition dans le titre : « ${short(n.title, 32)} »`,
          'Mettez le terme défini en titre et la définition dans la note : elle pourra alors être décomposée.', [n.id]));
        continue;
      }
      const comps = splitDefinition(src);
      if (comps.length < 3) continue; // découpage trop pauvre : la définition reste d'un bloc
      out.push({
        key: 'def:' + n.id, kind: 'definition', certainty: 'sure',
        title: `Décomposer la définition « ${short(n.title, 32)} »`,
        detail: 'Une définition récitée d’un bloc s’oublie ; découpée en composantes reliées (que désigne-t-elle ? de qui ? à qui ?), elle se comprend et se retient. Mots exacts de la source ; la définition complète reste dans la note.',
        preview: comps.map((c) => `${c.parent >= 0 ? '   ' : ''}—${c.label}→ ${short(c.title, 44)}${c.em ? `  (en relief : « ${c.em} »)` : ''}`),
        apply(m) {
          const d = S.node(m, n.id);
          if (!d || S.childrenOf(m, d.id).length) return;
          const made = [];
          comps.forEach((c, i) => {
            const k = S.newNode({ type: 'idee', title: c.title, em: c.em, x: d.x + 300, y: d.y + i * 60 });
            m.nodes.push(k);
            made.push(k);
            const from = c.parent >= 0 ? made[c.parent].id : d.id;
            m.edges.push({ id: U.uid('e'), from, to: k.id, kind: 'tree', label: c.label });
          });
        },
      });
    }
    return out;
  }

  /* ---- Signalements : ce que l'on voit sans pouvoir le corriger sans inventer ---- */
  function note(key, kind, title, detail, ids) { return { key, kind, title, detail, ids }; }
  function flatLists(map, notes) {
    for (const p of map.nodes) {
      if (!STRUCT.has(p.type)) continue;
      const es = map.edges.filter((e) => e.kind === 'tree' && e.from === p.id);
      const ks = es.map((e) => S.node(map, e.to)).filter((k) => k && !STRUCT.has(k.type));
      if (ks.length < 5) continue;
      const ids = new Set(ks.map((k) => k.id));
      const related = es.some((e) => e.label || e.group) || ks.some((k) => kidsOf(map, k.id).length)
        || map.edges.some((e) => e.kind === 'link' && ids.has(e.from) && ids.has(e.to));
      if (related || named(p, ks[0].type)) continue;
      notes.push(note('flat:' + p.id, 'flat', `Liste plate : « ${short(p.title, 32)} »`,
        `${ks.length} éléments rattachés à la partie, sans aucune relation entre eux. Si le cours dit lequel produit, suppose ou illustre l’autre, reliez-les (glissez un élément sous un autre, ou tracez un renvoi libellé).`, [...ids]));
    }
  }
  function ambiguous(map, notes) {
    let n = 0;
    for (const p of map.nodes) {
      const ks = kidsOf(map, p.id).filter((k) => !STRUCT.has(k.type) && k.type !== 'exemple');
      const pw = words(p.title);
      for (let i = 0; i < ks.length && n < 4; i++) for (let j = i + 1; j < ks.length && n < 4; j++) {
        const a = ks[i], b = ks[j];
        // le sens est donné par les types : ce n'est pas ambigu (causal() s'en charge)
        if ((CAUSES.has(a.type) && EFFECTS.has(b.type)) || (CAUSES.has(b.type) && EFFECTS.has(a.type))) continue;
        if (linked(map, a.id, b.id)) continue;
        const ta = textOf(a), tb = textOf(b);
        if (!CAUSAL_WORDS.test(norm(ta)) || !CAUSAL_WORDS.test(norm(tb))) continue;
        const sh = inter(new Set([...words(ta)].filter((w) => !pw.has(w))), words(tb));
        if (sh < 2) continue;
        n++;
        notes.push(note('amb:' + a.id + '|' + b.id, 'ambiguous', `Relation causale possible, sens inconnu : « ${short(a.title, 22)} » / « ${short(b.title, 22)} »`,
          'Les deux parlent de cause et d’effet sur le même sujet, mais rien ne dit lequel produit l’autre : à relier à la main si le cours le précise.', [a.id, b.id]));
      }
    }
  }

  /** Intégrité du graphe : à vérifier après toute correction */
  function check(map) {
    const v = [];
    const ids = new Set(map.nodes.map((n) => n.id));
    const parent = new Map();
    const eids = new Set();
    for (const e of map.edges) {
      if (eids.has(e.id)) v.push('arête en double ' + e.id);
      eids.add(e.id);
      if (!ids.has(e.from) || !ids.has(e.to)) v.push('extrémité absente ' + e.id);
      if (e.from === e.to) v.push('boucle ' + e.id);
      if (e.kind === 'tree') { if (parent.has(e.to)) v.push('deux parents ' + e.to); parent.set(e.to, e.from); }
    }
    for (const id of ids) {
      const seen = new Set(); let j = id;
      while (parent.has(j)) { if (seen.has(j)) { v.push('cycle ' + id); break; } seen.add(j); j = parent.get(j); }
    }
    const groups = new Map();
    for (const e of map.edges) if (e.group) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
    for (const [g, es] of groups) if (new Set(es.map((e) => e.from + '|' + e.kind + '|' + e.label)).size > 1) v.push('branche incohérente ' + g);
    return v;
  }

  function audit(map) {
    if (!map || !map.nodes || !map.nodes.length) return { fixes: [], notes: [] };
    const notes = [];
    const ex = examples(map);
    const exIds = new Set(ex.map((x) => x.key.split(':')[1].split('>')[0]));
    const quiet = new Set();
    const br = branches(map, quiet, exIds);
    const lab = labelAudit(map, notes);
    const dup = duplicates(map);
    const taken = new Set([...quiet, ...br.flatMap((b) => b.ids), ...exIds]);
    const fixes = [...definitions(map, notes), ...dup, ...lab, ...ex, ...br, ...causal(map), ...crossRefs(map, new Set(ex.map((x) => x.key.slice(3)))), ...wikiLinks(map), ...labels(map, taken)];
    // un même couple ne reçoit qu'une proposition de renvoi (la plus sûre, la première)
    const pairs = new Set();
    const uniq = fixes.filter((f) => {
      const m = /^(ex|ce|x|wk):(.+)>(.+)$/.exec(f.key);
      if (!m) return true;
      const k = [m[2], m[3]].sort().join('|');
      if (pairs.has(k)) return false;
      pairs.add(k); return true;
    });
    flatLists(map, notes);
    ambiguous(map, notes);
    return { fixes: uniq, notes };
  }
  const analyze = (map) => audit(map).fixes;

  R.organize = { audit, analyze, check, splitDefinition, REL };
})(window.R);
