/* Ratio — Vue Plan : la carte devient un plan juridique (I. A. 1. a.) imprimable */
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
    const mdBtn = ui.btn('Markdown', { icon: 'download', variant: 'text', onClick: () => U.download(`${U.slug(map.title)}.md`, markdown(map), 'text/markdown') });

    doc.appendChild(h('header.plan-head',
      h('p.overline', c ? c.title : 'Fiche'),
      h('h1.plan-title', map.title),
      h('p.plan-meta', `Fiche générée depuis la carte · ${U.plural(map.nodes.length, 'nœud')} · ${new Date(map.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`),
      h('div.plan-actions.no-print', printBtn, mdBtn)));

    if (!map.nodes.length) {
      doc.appendChild(ui.emptyState({ icon: 'outline', title: 'Carte vide', text: 'Ajoute des nœuds pour générer le plan.' }));
      host.appendChild(doc);
      return;
    }

    const linksOf = (id) => map.edges.filter((e) => e.kind === 'link' && e.from === id).map((e) => ({ e, to: S.node(map, e.to) })).filter((x) => x.to);

    const section = (item, level, idx) => {
      const n = item.node;
      const T = S.TYPES[n.type];
      const lt = logicText(n, item.children.length);
      const tag = 'h' + Math.min(6, level + 2);
      const head = h(tag + '.plan-h.lvl-' + Math.min(level, 4),
        h('span.plan-num', num(level, idx)),
        h('button.plan-link', { type: 'button', onclick: () => onOpen && onOpen(n.id), title: 'Ouvrir dans la carte' },
          T.kicker && n.type !== 'notion' ? h('span.plan-kicker', T.kicker) : null,
          h('span.plan-t', n.title || 'Sans titre')),
        n.review.rating ? ui.mastery(n.review.rating, 10) : null);
      const sec = h('section.plan-sec', { class: 'lvl-' + Math.min(level, 4) }, head);
      if (n.note.trim()) sec.appendChild(h('div.plan-note.md', { html: R.md.render(n.note) }));
      const ls = linksOf(n.id);
      if (ls.length) sec.appendChild(h('p.plan-refs', ls.map((x, i) => [i ? ' · ' : '', '→ ', x.e.label ? h('em', x.e.label + ' ') : 'voir ', h('b', x.to.title || 'Sans titre')])));
      if (item.children.length) {
        if (lt) sec.appendChild(h('p.plan-logic', h('span.chip-mini', n.logic === 'et' ? 'ET' : 'OU'), ` Les ${item.children.length} éléments suivants sont ${lt}.`));
        item.children.forEach((ch, i) => sec.appendChild(section(ch, level + 1, i)));
      }
      return sec;
    };

    if (single) {
      const r0 = roots[0];
      if (r0.node.title && U.norm(r0.node.title) !== U.norm(map.title)) doc.appendChild(h('h2.plan-root', r0.node.title));
      if (r0.node.note.trim()) doc.appendChild(h('div.plan-intro.md', { html: R.md.render(r0.node.note) }));
      const lt = logicText(r0.node, r0.children.length);
      if (lt) doc.appendChild(h('p.plan-logic', h('span.chip-mini', r0.node.logic === 'et' ? 'ET' : 'OU'), ` Les ${r0.children.length} éléments suivants sont ${lt}.`));
      r0.children.forEach((ch, i) => doc.appendChild(section(ch, 0, i)));
    } else {
      roots.forEach((r, i) => doc.appendChild(section(r, 0, i)));
    }
    host.appendChild(doc);
    R.motion.stagger(U.$$('.plan-sec.lvl-0', doc));
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
    const walk = (item, level, idx) => {
      const n = item.node;
      const T = S.TYPES[n.type];
      const hashes = '#'.repeat(Math.min(6, level + 2));
      const kicker = T.kicker && n.type !== 'notion' ? `*${T.kicker}* — ` : '';
      if (level < 4) out.push(`${hashes} ${num(level, idx)} ${kicker}${n.title || 'Sans titre'}`, '');
      else out.push(`${'  '.repeat(level - 4)}- ${kicker}**${n.title || 'Sans titre'}**`, '');
      if (n.note.trim()) out.push(n.note.trim(), '');
      for (const e of map.edges.filter((x) => x.kind === 'link' && x.from === n.id)) {
        const t = S.node(map, e.to);
        if (t) out.push(`→ ${e.label || 'voir'} : **${t.title}**`, '');
      }
      const lt = logicText(n, item.children.length);
      if (lt) out.push(`> Éléments ${lt} (${n.logic === 'et' ? 'ET' : 'OU'})`, '');
      item.children.forEach((ch, i) => walk(ch, level + 1, i));
    };
    if (single) {
      const r0 = roots[0];
      if (r0.node.note.trim()) out.push(r0.node.note.trim(), '');
      r0.children.forEach((ch, i) => walk(ch, 0, i));
    } else roots.forEach((r, i) => walk(r, 0, i));
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  R.outline = { render, markdown, tree };
})(window.R);
