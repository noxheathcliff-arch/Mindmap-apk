/* Pioneer — Vue Plan : la carte devient un plan juridique (I. A. 1. a.) imprimable */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;

  const NUM = [
    (i) => U.roman(i + 1) + '.',
    (i) => U.alpha(i, true) + '.',
    (i) => (i + 1) + '.',
    (i) => U.alpha(i) + ')',
    () => '–',
  ];
  const num = (level, i) => NUM[Math.min(level, NUM.length - 1)](i);

  /** Construit l'arbre ordonné de la carte (ignore les cycles) */
  function tree(map) {
    const seen = new Set();
    const build = (n) => {
      seen.add(n.id);
      return { node: n, children: S.childrenOf(map, n.id).filter((c) => !seen.has(c.id)).map(build) };
    };
    return S.roots(map).map(build);
  }

  /** Relations sortantes d'un nœud, une fourche = une seule relation vers plusieurs éléments.
      kind 'link' → renvois ; kind 'tree' → seulement les fourches de décomposition qui ont un libellé. */
  function relations(map, id, kind) {
    const out = [];
    const seen = new Map();
    for (const e of map.edges) {
      if (e.from !== id || e.kind !== kind) continue;
      if (kind === 'tree' && !(e.group && e.label)) continue;
      const to = S.node(map, e.to);
      if (!to) continue;
      if (e.group && seen.has(e.group)) { seen.get(e.group).targets.push(to); continue; }
      const r = { label: e.label, targets: [to] };
      if (e.group) seen.set(e.group, r);
      out.push(r);
    }
    for (const r of out) r.targets.sort(map.layout === 'down' || (map.layout === 'tree' && !S.parentEdge(map, id)) ? (a, b) => a.x - b.x || a.y - b.y : (a, b) => a.y - b.y || a.x - b.x);
    return out;
  }
  const names = (ts) => ts.map((t) => t.title || 'Sans titre');

  function logicText(n, count) {
    if (!n.logic || count < 2) return '';
    return n.logic === 'et' ? 'cumulatifs' : 'alternatifs';
  }

  function render(host, map, { onOpen } = {}) {
    U.clear(host);
    const c = S.course(map.courseId);
    const roots = tree(map);
    const single = roots.length === 1;
    const doc = h('article.plan');

    const printBtn = ui.btn('Imprimer / PDF', { icon: 'print', variant: 'tonal', onClick: () => window.print() });
    const mdBtn = ui.btn('Markdown', { icon: 'export', variant: 'text', onClick: () => U.download(`${U.slug(map.title)}.md`, markdown(map), 'text/markdown') });

    doc.appendChild(h('header.plan-head',
      h('p.overline', c ? c.title : 'Fiche'),
      h('h1.plan-title', map.title),
      h('p.plan-meta', `Fiche générée depuis la carte · ${U.plural(map.nodes.length, 'nœud')} · ${new Date(map.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`),
      // légende du point de maîtrise (une icône d'état sans légende est ambiguë)
      map.nodes.some((n) => n.review.rating) ? h('p.plan-legend.no-print', ['maitrise', 'compris', 'revoir'].map((k) => h('span', ui.mastery(k, 10), S.RATINGS[k].label))) : null,
      h('div.plan-actions.no-print', printBtn, mdBtn)));

    if (!map.nodes.length) {
      doc.appendChild(ui.emptyState({ icon: 'outline', title: 'Carte vide', text: 'Ajoute des nœuds pour générer le plan.' }));
      host.appendChild(doc);
      return;
    }

    const refsEl = (id) => {
      const rs = relations(map, id, 'link');
      if (!rs.length) return null;
      return h('p.plan-refs', rs.map((r, i) => [i ? ' · ' : '', '→ ', r.label ? h('em', r.label + ' ') : 'voir ',
        names(r.targets).map((t, k) => [k ? ', ' : '', h('b', t)])]));
    };
    const forksEl = (id) => relations(map, id, 'tree').map((r) =>
      h('p.plan-logic', h('span.chip-mini', r.label), ` ${names(r.targets).join(' · ')}`));

    const nums = S.structNumbers(map);
    const heads = []; // { el, label, trail } — pour le fil d'Ariane collant et le sommaire
    const logicLine = (n, count) => {
      const lt = logicText(n, count);
      return lt ? h('p.plan-logic', h('span.chip-mini', n.logic === 'et' ? 'ET' : 'OU'), ` Les ${count} éléments suivants sont ${lt}.`) : null;
    };
    const extras = (sec, n, count) => {
      if (n.note.trim()) sec.appendChild(h('div.plan-note.md', { html: R.md.render(n.note) }));
      const refs = refsEl(n.id);
      if (refs) sec.appendChild(refs);
      if (count) {
        const ll = logicLine(n, count);
        if (ll) sec.appendChild(ll);
        for (const f of forksEl(n.id)) sec.appendChild(f);
      }
    };
    /* Les enfants : la structure (Chapitre, Section, Sous-section) devient des intertitres ;
       sous chacun, la numérotation du contenu (I. A. 1. a.) repart de zéro. */
    const kids = (host, item, level, hb, trail = []) => {
      let i = 0, prev = false;
      // éléments cumulatifs / alternatifs : le lien est rappelé à chaque jointure (ET, OU)
      const join = item.node && item.node.logic && item.children.length > 1 ? (item.node.logic === 'et' ? 'ET' : 'OU') : null;
      for (const ch of item.children) {
        const struct = S.isStruct(ch.node.type), retenir = ch.node.type === 'retenir';
        if (join && prev && !struct && !retenir) host.appendChild(h('div.plan-join', { 'aria-hidden': 'true', class: 'lvl-' + Math.min(level, 4) }, h('span.chip-mini', join)));
        // « À retenir » : un encadré, hors numérotation du plan
        host.appendChild(struct ? structSection(ch, hb, trail) : section(ch, level, retenir ? -1 : i++, hb, trail));
        prev = !struct && !retenir;
      }
    };
    const openBtn = (n, ...inner) => h('button.plan-link', { type: 'button', onclick: () => onOpen && onOpen(n.id), title: 'Ouvrir dans la carte' }, ...inner);
    const structSection = (item, hb, trail = []) => {
      const n = item.node;
      const rank = S.TYPES[n.type].rank;
      const head = h('h' + Math.min(6, hb) + '.plan-struct.rank-' + rank,
        h('span.plan-struct-k', S.kickerOf(map, n, nums)),
        openBtn(n, h('span.plan-t', n.title || 'Sans titre')));
      const sec = h('section.plan-sec.plan-struct-sec', { class: 'rank-' + rank + ' t-' + n.type }, head);
      const me = { el: head, label: `${S.kickerOf(map, n, nums)} ${n.title || 'Sans titre'}`, top: !trail.length };
      me.trail = [...trail, me];
      heads.push(me);
      extras(sec, n, item.children.length);
      kids(sec, item, 0, hb + 1, me.trail);
      return sec;
    };
    const section = (item, level, idx, hb, trail = []) => {
      const n = item.node;
      const T = S.TYPES[n.type];
      const tag = 'h' + Math.min(6, hb);
      // le point de maîtrise suit le dernier mot du titre (proximité), avec son libellé en infobulle
      const head = h(tag + '.plan-h.lvl-' + Math.min(level, 4),
        h('span.plan-num', idx >= 0 ? num(level, idx) : ''),
        openBtn(n,
          T.kicker && n.type !== 'notion' ? h('span.plan-kicker', T.kicker) : null,
          h('span.plan-t', n.title || 'Sans titre'),
          n.review.rating ? h('span.plan-m', { title: S.RATINGS[n.review.rating].label }, ui.mastery(n.review.rating, 10)) : null));
      const sec = h('section.plan-sec', { class: 'lvl-' + Math.min(level, 4) + ' t-' + n.type }, head);
      const me = { el: head, label: `${idx >= 0 ? num(level, idx) + ' ' : ''}${n.title || 'Sans titre'}`, top: !trail.length };
      me.trail = [...trail, me];
      if (level <= 3) heads.push(me);
      extras(sec, n, item.children.length);
      if (item.children.length) kids(sec, item, level + 1, hb + 1, me.trail);
      return sec;
    };

    if (single) {
      const r0 = roots[0];
      const struct = S.isStruct(r0.node.type);
      if (r0.node.title && U.norm(r0.node.title) !== U.norm(map.title)) {
        doc.appendChild(h('h2.plan-root', struct ? h('span.plan-struct-k', S.kickerOf(map, r0.node, nums)) : null, h('span', r0.node.title)));
      }
      if (r0.node.note.trim()) doc.appendChild(h('div.plan-intro.md', { html: R.md.render(r0.node.note) }));
      const ll = logicLine(r0.node, r0.children.length);
      if (ll) doc.appendChild(ll);
      const rr = refsEl(r0.node.id);
      if (rr) doc.appendChild(rr);
      for (const f of forksEl(r0.node.id)) doc.appendChild(f);
      kids(doc, r0, 0, 2);
    } else {
      kids(doc, { children: roots }, 0, 2);
    }
    // sommaire (au moins 3 grandes parties) : repliable, juste après l'en-tête
    const tops = heads.filter((x) => x.top);
    const goTo = (x) => host.scrollTo({ top: x.el.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - 56, behavior: R.motion.reduced() ? 'auto' : 'smooth' });
    if (tops.length >= 3) {
      const toc = h('details.plan-toc', h('summary', h('span', 'Sommaire'), h('span.plan-toc-n', U.plural(tops.length, 'partie'))),
        h('ol', tops.map((x) => h('li', h('button.plan-toc-a', { type: 'button', onclick: () => goTo(x) }, x.label)))));
      doc.querySelector('.plan-head').after(toc);
    }
    // fil d'Ariane collant : où suis-je dans le plan (compact, apparaît une fois le 1er titre passé)
    const ctx = h('nav.plan-ctx.no-print', { 'aria-label': 'Position dans le plan' });
    doc.prepend(ctx);
    let shown = null;
    const update = () => {
      const limit = host.getBoundingClientRect().top + 64;
      let cur = null;
      for (const x of heads) { if (x.el.getBoundingClientRect().top <= limit) cur = x; else break; }
      if (cur === shown) return;
      shown = cur;
      ctx.classList.toggle('on', !!cur);
      if (!cur) return;
      U.clear(ctx);
      cur.trail.forEach((x, i) => {
        if (i) ctx.appendChild(R.icon('chevronRight', 14));
        ctx.appendChild(h('button.plan-ctx-a', { type: 'button', onclick: () => goTo(x) }, x.label));
      });
      ctx.scrollLeft = ctx.scrollWidth; // le niveau le plus profond reste visible
      ctx.classList.toggle('cut', ctx.scrollWidth > ctx.clientWidth + 1); // le début coupé s'efface en fondu
    };
    if (host._planScroll) host.removeEventListener('scroll', host._planScroll);
    let raf = 0;
    host._planScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    host.addEventListener('scroll', host._planScroll, { passive: true });

    host.appendChild(doc);
    if (R.motion.first('plan:' + map.id)) R.motion.stagger(U.$$(':scope > .plan-sec', doc));
    for (const a of U.$$('.md-wiki', doc)) {
      const t = map.nodes.find((x) => U.norm(x.title) === U.norm(a.dataset.wiki));
      a.addEventListener('click', (ev) => { ev.preventDefault(); if (t && onOpen) onOpen(t.id); });
    }
  }

  function markdown(map) {
    const c = S.course(map.courseId);
    const out = [`# ${map.title}`, ''];
    if (c) out.push(`*${c.title}*`, '');
    const roots = tree(map);
    const single = roots.length === 1;
    const nums = S.structNumbers(map);
    const extras = (n, count) => {
      if (n.note.trim()) out.push(n.note.trim(), '');
      for (const r of relations(map, n.id, 'link')) out.push(`→ ${r.label || 'voir'} : ${names(r.targets).map((t) => `**${t}**`).join(', ')}`, '');
      const lt = logicText(n, count);
      if (lt) out.push(`> Éléments ${lt} (${n.logic === 'et' ? 'ET' : 'OU'})`, '');
      for (const r of relations(map, n.id, 'tree')) out.push(`> ${r.label} : ${names(r.targets).join(', ')}`, '');
    };
    const kids = (item, level, hb) => {
      let i = 0;
      for (const ch of item.children) {
        if (S.isStruct(ch.node.type)) struct(ch, hb);
        else walk(ch, level, ch.node.type === 'retenir' ? -1 : i++, hb);
      }
    };
    const struct = (item, hb) => {
      const n = item.node;
      out.push(`${'#'.repeat(Math.min(6, hb))} ${S.kickerOf(map, n, nums)} — ${n.title || 'Sans titre'}`, '');
      extras(n, item.children.length);
      kids(item, 0, hb + 1);
    };
    const walk = (item, level, idx, hb) => {
      const n = item.node;
      const T = S.TYPES[n.type];
      const kicker = T.kicker && n.type !== 'notion' ? `*${T.kicker}* — ` : '';
      if (idx < 0) out.push(`> **${T.label}** — ${n.title || 'Sans titre'}`, '');
      else if (hb <= 6 && level < 4) out.push(`${'#'.repeat(hb)} ${num(level, idx)} ${kicker}${n.title || 'Sans titre'}`, '');
      else out.push(`${'  '.repeat(Math.max(0, level - 4))}- ${kicker}**${n.title || 'Sans titre'}**`, '');
      extras(n, item.children.length);
      kids(item, level + 1, hb + 1);
    };
    if (single) {
      const r0 = roots[0];
      if (r0.node.note.trim()) out.push(r0.node.note.trim(), '');
      kids(r0, 0, 2);
    } else kids({ children: roots }, 0, 2);
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  R.outline = { render, markdown, tree };
})(window.R);
