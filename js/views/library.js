/* Ratio — Bibliothèque : Aujourd'hui (déclencheur) · Mes cours · Récemment modifiées */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;
  R.views = R.views || {};

  /* ---------------- Vignette de carte (aperçu SVG) ------------------ */
  R.thumb = function (map, { w = 160, h: hh = 96 } = {}) {
    const nodes = map.nodes;
    const wrap = h('div.thumb', { 'aria-hidden': 'true' });
    if (!nodes.length) return wrap;
    const sz = {};
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      const s = (sz[n.id] = R.layout.estimate(n));
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h);
    }
    const pad = 24;
    const bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    let svg = `<svg viewBox="${x0 - pad} ${y0 - pad} ${bw} ${bh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    for (const e of map.edges) {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) continue;
      const ax = a.x + sz[a.id].w, ay = a.y + sz[a.id].h / 2, bx = b.x, by = b.y + sz[b.id].h / 2;
      const mx = (ax + bx) / 2;
      svg += `<path d="M${ax},${ay} C${mx},${ay} ${mx},${by} ${bx},${by}" style="fill:none;stroke:var(--outline)" stroke-width="${Math.max(2, bw / 220)}" ${e.kind === 'link' ? `stroke-dasharray="${bw / 90}"` : ''}/>`;
    }
    for (const n of nodes) {
      const s = sz[n.id];
      const ink = n.type === 'notion' || n.type === 'chapitre';
      const fill = ink ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
      const stroke = ink ? 'none' : n.type === 'lecon' || n.type === 'section' ? 'var(--on-surface)' : 'var(--outline-variant)';
      const sw = Math.max(2, bw / 300) * (n.type === 'lecon' ? 2 : 1);
      svg += `<rect x="${n.x}" y="${n.y}" width="${s.w}" height="${s.h}" rx="${n.type === 'notion' ? s.h / 2 : 10}" style="fill:${fill};stroke:${stroke}" stroke-width="${sw}"/>`;
      if (n.review.rating === 'maitrise') svg += `<rect x="${n.x + 10}" y="${n.y + s.h - 12}" width="${s.w - 20}" height="5" rx="2" style="fill:var(--primary)"/>`;
    }
    svg += '</svg>';
    wrap.innerHTML = svg;
    return wrap;
  };

  /* ---------------- Actions partagées ------------------------------ */
  R.actions = R.actions || {};

  R.actions.newCourse = async function () {
    const v = await ui.form({
      title: 'Nouveau cours', icon: 'folder', ok: 'Créer',
      fields: [
        { key: 'title', label: 'Intitulé du cours', placeholder: 'Ex. Droit des obligations', required: true },
        { key: 'description', label: 'Précision (facultatif)', placeholder: 'Ex. M1 · S1 · Pr. Dupont' },
      ],
    });
    if (!v) return null;
    const c = S.addCourse(v);
    R.app.go('#/cours/' + c.id);
    return c;
  };

  R.actions.editCourse = async function (c) {
    const v = await ui.form({
      title: 'Modifier le cours', icon: 'edit', ok: 'Enregistrer',
      fields: [
        { key: 'title', label: 'Intitulé du cours', value: c.title, required: true },
        { key: 'description', label: 'Précision (facultatif)', value: c.description },
      ],
    });
    if (!v) return;
    S.updateCourse(c.id, { title: v.title.trim(), description: v.description.trim() });
  };

  R.actions.deleteCourse = async function (c, after) {
    const n = S.mapsOf(c.id).length;
    const ok = await ui.confirm(`Supprimer « ${c.title} » ?`, n ? `Le cours et ses ${U.plural(n, 'carte')} seront supprimés.` : 'Le cours sera supprimé.', { ok: 'Supprimer', danger: true, icon: 'trash' });
    if (!ok) return;
    const snap = S.deleteCourse(c.id);
    if (after) after();
    ui.snack('Cours supprimé', { action: 'Annuler', onAction: () => S.restore(snap) });
  };

  R.actions.newMap = async function (courseId) {
    if (!courseId) {
      const courses = S.coursesSorted();
      if (!courses.length) { await R.actions.newCourse(); return; }
      courseId = courses[0].id;
    }
    const v = await ui.form({
      title: 'Nouvelle carte', icon: 'map', ok: 'Créer',
      fields: [
        { key: 'title', label: 'Notion ou chapitre', placeholder: 'Ex. La formation du contrat', required: true },
        { key: 'root', label: 'Point de départ', choices: [
          { value: 'notion', label: 'Une notion', text: 'Un concept à décomposer : définition, conditions, effets…' },
          { value: 'chapitre', label: 'Un chapitre de cours', text: 'Leçons, sections, puis les notions de chacune.' },
        ], onChange: (val, inputs) => { inputs.title.placeholder = val === 'chapitre' ? 'Ex. Les sources du droit' : 'Ex. La formation du contrat'; } },
      ],
    });
    if (!v) return;
    const m = S.addMap(courseId, v.title, { rootType: v.root });
    R.app.go('#/carte/' + m.id + '?new=1');
  };

  R.actions.courseMenu = function (anchor, c, after) {
    ui.menu(anchor, [
      { label: 'Modifier', icon: 'edit', onClick: () => R.actions.editCourse(c) },
      { label: 'Réviser ce cours', icon: 'cards', onClick: () => R.app.go('#/reviser/cours/' + c.id) },
      { label: 'Exporter', icon: 'download', onClick: () => {
        const data = { app: 'ratio', courses: [c], maps: S.mapsOf(c.id) };
        U.download(`ratio-${U.slug(c.title)}.json`, JSON.stringify(data, null, 2));
      } },
      { divider: true },
      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => R.actions.deleteCourse(c, after) },
    ]);
  };

  /* ---------------- Carte « Aujourd'hui » --------------------------- */
  function todayCard() {
    const due = S.dueCount();
    const streak = S.streak();
    const today = S.reviewedToday();
    const log = S.data.settings.reviewLog;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const n = log[U.dayKey(d)] || 0;
      days.push(h('span.week-day', { class: n ? 'on' : '', title: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) + ` · ${n} carte${n > 1 ? 's' : ''}` },
        h('span.week-dot'), h('span.week-l', d.toLocaleDateString('fr-FR', { weekday: 'narrow' }))));
    }
    const next = S.nextDueInfo();
    const card = h('section.today', { 'aria-label': 'Aujourd’hui' },
      h('p.overline', 'Aujourd’hui'),
      h('div.today-main',
        h('span.today-num', String(due)),
        h('span.today-unit', due > 1 ? 'cartes à réviser' : due === 1 ? 'carte à réviser' : 'carte à réviser')),
      h('p.today-sub', due
        ? 'Quelques minutes suffisent. Le rappel actif fixe mieux qu’une relecture.'
        : today ? `Bravo — ${U.plural(today, 'carte')} révisée${today > 1 ? 's' : ''} aujourd’hui.` : next.tomorrow ? `Tout est à jour. Demain : ${U.plural(next.tomorrow, 'carte')}.` : 'Tout est à jour. Décompose une nouvelle notion pour alimenter tes révisions.'),
      h('div.today-streak', { class: streak ? 'lit' : '' },
        h('span.flame', R.icon('flame', 20)),
        h('span', streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Lance ta série aujourd’hui'),
        h('span.week', days)),
      due ? ui.btn('Réviser maintenant', { icon: 'play', variant: 'filled', cls: 'today-cta', onClick: () => R.app.go('#/reviser') })
        : ui.btn('Réviser quand même', { icon: 'cards', variant: 'tonal', cls: 'today-cta', onClick: () => R.app.go('#/reviser?all=1') }));
    return card;
  }

  function courseCard(c, rerender) {
    const st = S.courseStats(c.id);
    const more = ui.iconBtn('more', { title: 'Options du cours', cls: 'card-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.courseMenu(more, c, rerender); });
    return h('a.course-card.ripple', { href: '#/cours/' + c.id },
      h('div.cc-top',
        h('span.cc-mono', { dataset: { hero: 'course:' + c.id + ':mono' } }, U.initials(c.title)),
        more),
      h('h3.cc-title', h('span', { dataset: { hero: 'course:' + c.id + ':title' } }, c.title)),
      c.description ? h('p.cc-desc', c.description) : h('p.cc-desc.muted', U.relTime(S.courseActivity(c))),
      h('div.cc-foot',
        h('span.cc-meta', `${U.plural(st.maps, 'carte')} · ${U.plural(st.nodes, 'nœud')}`),
        h('div.cc-progress', ui.progress(st.progress, { label: 'Maîtrise du cours' }), h('span.cc-pct', Math.round(st.progress * 100) + ' %'))));
  }

  R.mapRow = function (m, { showCourse = true } = {}) {
    const c = S.course(m.courseId);
    const st = S.mapStats(m);
    return h('a.map-row.ripple', { href: '#/carte/' + m.id },
      (() => { const t = R.thumb(m); t.dataset.hero = 'map:' + m.id + ':thumb'; return t; })(),
      h('div.map-row-body',
        h('span.map-row-title', h('span', { dataset: { hero: 'map:' + m.id + ':title' } }, m.title)),
        h('span.map-row-meta', [showCourse && c ? c.title : null, U.plural(st.nodes, 'nœud'), U.relTime(m.updatedAt)].filter(Boolean).join(' · '))),
      h('div.map-row-end', ui.mastery(st.progress >= 0.999 ? 'maitrise' : st.progress >= 0.5 ? 'compris' : st.progress > 0 ? 'revoir' : null, 14)));
  };

  /* ---------------- Vue -------------------------------------------- */
  R.views.library = {
    mount(el) {
      // première visite de la session : entrée en cascade, balayage, compteurs.
      // Les visites suivantes (et les mises à jour) restent immobiles : vu souvent = calme.
      let intro = R.motion.first('library');
      const draw = () => {
        U.clear(el);
        const courses = S.coursesSorted();
        const hour = new Date().getHours();
        const greet = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
        const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

        const topbar = h('header.topbar.topbar-lib',
          h('a.topbar-brand', { href: '#/' }, R.app.logo(), h('span.brand-name', 'Ratio')),
          h('div.topbar-actions',
            ui.iconBtn('search', { title: 'Rechercher', onClick: () => R.search.open() }),
            ui.iconBtn('settings', { title: 'Réglages', onClick: () => R.app.openSettings() })));

        const grid = h('div.course-grid');
        courses.forEach((c) => grid.appendChild(courseCard(c, draw)));
        const add = h('button.course-card.course-add.ripple', { type: 'button', onclick: R.actions.newCourse },
          h('span.add-ic', R.icon('plus', 24)), h('span.add-l', 'Nouveau cours'));
        grid.appendChild(add);
        if (intro) R.motion.stagger(Array.from(grid.children), 1);

        const recents = S.recentMaps(5);
        const main = h('div.lib-main',
          h('div.hero',
            h('p.overline.hero-date', dateStr),
            h('h1.hero-title', h('span.hl-sweep', greet + '.'))),
          h('div.today-slot.only-narrow', todayCard()),
          h('section.lib-sec',
            h('div.sec-head',
              h('h2.sec-title', 'Mes cours'),
              h('span.sec-count', courses.length ? String(courses.length) : '')),
            courses.length ? grid : ui.emptyState({
              icon: 'folder', title: 'Aucun cours pour l’instant',
              text: 'Crée un cours pour y ranger les cartes mentales de cet enseignement.',
              action: ui.btn('Créer mon premier cours', { icon: 'plus', variant: 'filled', onClick: R.actions.newCourse }),
            })),
          recents.length ? h('section.lib-sec',
            h('div.sec-head', h('h2.sec-title', 'Récemment modifiées')),
            h('div.map-list', recents.map((m) => R.mapRow(m)))) : null);

        const aside = h('aside.lib-aside.only-wide', todayCard(), tipCard());
        const pageEl = h('div.page.page-lib', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', h('div.lib-layout', main, aside)));
        el.appendChild(pageEl);
        if (intro) {
          R.motion.stagger(U.$$('.map-row', el), Math.min(grid.children.length + 1, 6));
          for (const num of U.$$('.today-num', el)) R.motion.countUp(num, +num.textContent, { duration: 900 });
          setTimeout(() => pageEl.classList.remove('intro'), 1400);
        }
        intro = false;
      };
      draw();
      R.app.setFab({ icon: 'plus', label: 'Nouveau cours', onClick: R.actions.newCourse });
      const off = S.on((t) => { if (t === 'change' || t === 'import' || t === 'review') draw(); });
      return { unmount: off };
    },
  };

  function tipCard() {
    const tips = [
      ['Conditions cumulatives ou alternatives ?', 'Sélectionne un nœud et choisis ET / OU : les liens vers ses enfants l’affichent, et la révision te le demande.'],
      ['Surligne dans tes notes', 'Entoure un passage de ==doubles égal== pour le surligner, comme au fluo.'],
      ['Fiche prête à imprimer', 'Dans une carte, bascule sur « Plan » : ta carte devient un plan I. A. 1. a., imprimable.'],
      ['Relie deux notions', 'Glisse la poignée + d’un nœud vers un autre pour créer un renvoi (« voir aussi », « sauf »…).'],
      ['Décompose au clavier', 'Tab ajoute un enfant, Entrée un frère. Tu ne quittes jamais le clavier.'],
    ];
    const [t, d] = tips[new Date().getDate() % tips.length];
    return h('section.tip-card', h('p.overline', 'Astuce'), h('h3.tip-title', t), h('p.tip-text', { html: R.md.inline(d, { articles: false }) }));
  }
})(window.R);
