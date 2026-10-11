/* Ratio — Cours : le « dossier » qui regroupe les cartes d'un enseignement */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;
  R.views = R.views || {};

  R.actions.renameMap = async function (m) {
    const v = await ui.form({ title: 'Renommer la carte', icon: 'edit', ok: 'Enregistrer', fields: [{ key: 'title', label: 'Titre', value: m.title, required: true }] });
    if (v) S.updateMap(m.id, { title: v.title.trim() });
  };

  R.actions.moveMap = async function (m) {
    const courses = S.coursesSorted().filter((c) => c.id !== m.courseId);
    if (!courses.length) { ui.snack('Crée d’abord un autre cours.'); return; }
    let chosen = courses[0].id;
    const list = h('div.choice-list', { role: 'radiogroup' }, courses.map((c, i) => {
      const b = h('button.list-item.choice', { type: 'button', role: 'radio', 'aria-checked': String(i === 0) },
        R.courseArt.mark(c, { size: 'sm' }), h('span.choice-l', c.title), h('span.choice-check', R.icon('check', 20)));
      b.addEventListener('click', () => { chosen = c.id; U.$$('.choice', list).forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
      return b;
    }));
    const ok = await ui.dialog({ title: 'Déplacer vers…', icon: 'folder', body: list, actions: [{ label: 'Annuler', value: false }, { label: 'Déplacer', value: true, variant: 'filled' }] });
    if (!ok) return;
    S.moveMap(m.id, chosen);
    ui.snack(`Carte déplacée dans « ${S.course(chosen).title} »`, { action: 'Ouvrir le cours', onAction: () => R.app.go('#/cours/' + chosen) });
  };

  R.actions.deleteMap = async function (m, after) {
    const snap = S.deleteMap(m.id);
    if (after) after();
    ui.snack(`« ${m.title} » supprimée`, { action: 'Annuler', onAction: () => S.restore(snap), duration: 6000 });
  };

  R.actions.mapMenu = function (anchor, m, after, { inEditor } = {}) {
    ui.menu(anchor, [
      { label: 'Renommer', icon: 'edit', onClick: () => R.actions.renameMap(m) },
      { label: 'Dupliquer', icon: 'copy', onClick: () => { const c = S.duplicateMap(m.id); ui.snack('Carte dupliquée', { action: 'Ouvrir', onAction: () => R.app.go('#/carte/' + c.id) }); } },
      { label: 'Déplacer vers…', icon: 'folder', onClick: () => R.actions.moveMap(m) },
      { label: 'Réviser cette carte', icon: 'cards', onClick: () => R.app.go('#/reviser/carte/' + m.id) },
      m.readOnly
        ? { label: 'Autoriser les modifications', icon: 'lockOpen', onClick: () => S.setReadOnly(m.id, false) }
        : { label: 'Lecture seule', icon: 'lock', onClick: () => { S.setReadOnly(m.id, true); ui.snack(`« ${m.title} » en lecture seule`, { action: 'Annuler', onAction: () => S.setReadOnly(m.id, false) }); } },
      { divider: true },
      { label: 'Exporter en Markdown', icon: 'download', onClick: () => U.download(`${U.slug(m.title)}.md`, R.outline.markdown(m), 'text/markdown') },
      { label: 'Exporter (JSON)', icon: 'download', onClick: () => U.download(`${U.slug(m.title)}.json`, JSON.stringify(m, null, 2)) },
      inEditor ? { label: 'Imprimer la fiche', icon: 'print', onClick: () => R.app.go('#/carte/' + m.id + '/plan?print=1') } : null,
      inEditor ? { divider: true } : null,
      inEditor ? { label: 'Couleurs des nœuds…', icon: 'palette', onClick: () => R.colors.openDialog() } : null,
      inEditor && (R.colors.settings().mode !== 'off' || R.colors.settings().last)
        ? { label: R.colors.settings().mode === 'off' ? 'Afficher les couleurs' : 'Masquer les couleurs', icon: R.colors.settings().mode === 'off' ? 'eye' : 'eyeOff', onClick: () => R.colors.toggle() } : null,
      { divider: true },
      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => R.actions.deleteMap(m, after) },
    ]);
  };

  function mapCard(m, rerender) {
    const st = S.mapStats(m);
    const more = ui.iconBtn('more', { title: 'Options de la carte', cls: 'card-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.mapMenu(more, m, rerender); });
    return h('a.map-card.ripple', { href: '#/carte/' + m.id },
      h('div.mc-thumb', { dataset: { hero: 'map:' + m.id + ':thumb' } }, R.thumb(m)),
      h('div.mc-body',
        h('div.mc-head', h('h3.mc-title', h('span', { dataset: { hero: 'map:' + m.id + ':title' } }, m.title)), more),
        h('p.mc-meta', m.readOnly ? h('span.ro-badge', { title: 'Lecture seule' }, R.icon('lock', 14), 'Lecture seule') : null, `${U.plural(st.nodes, 'nœud')} · ${U.relTime(m.updatedAt)}`),
        h('div.mc-foot',
          ui.progress(st.progress, { label: 'Maîtrise de la carte' }),
          h('span.mc-due', st.due && st.reviewable ? `${st.due} à réviser` : st.reviewable ? 'À jour' : 'Pas de carte'))));
  }

  R.views.course = {
    mount(el, route) {
      let intro = R.motion.first('course:' + route.id);
      let course = S.course(route.id);
      const draw = () => {
        course = S.course(route.id);
        U.clear(el);
        if (!course) {
          el.appendChild(h('div.page', h('div.page-scroll', ui.emptyState({
            icon: 'folder', title: 'Cours introuvable', text: 'Il a peut-être été supprimé.',
            action: ui.btn('Retour aux cours', { variant: 'filled', onClick: () => R.app.go('#/') }),
          }))));
          return;
        }
        const maps = S.mapsOf(course.id);
        const st = S.courseStats(course.id);

        const more = ui.iconBtn('more', { title: 'Options du cours' });
        more.addEventListener('click', () => R.actions.courseMenu(more, course, () => R.app.go('#/', { replace: true })));

        const topbar = h('header.topbar',
          ui.iconBtn('back', { title: 'Cours', onClick: () => R.app.go('#/') }),
          h('div.topbar-title.crumbs', h('a.crumb', { href: '#/' }, 'Cours'), R.icon('chevronRight', 16), h('span.crumb.current', course.title)),
          h('div.topbar-actions', more));

        const grid = h('div.map-grid');
        maps.forEach((m) => grid.appendChild(mapCard(m, draw)));
        grid.appendChild(h('button.map-card.map-add.ripple', { type: 'button', onclick: (e) => R.actions.newMap(course.id, { from: e.currentTarget }) },
          h('span.add-ic', R.icon('plus', 20)), h('span.add-txt', h('span.add-l', 'Nouvelle carte'), h('span.add-s', 'Une notion ou un chapitre'))));
        if (intro) R.motion.stagger(Array.from(grid.children), 1);

        const header = h('div.course-head',
          // la bande « papier » de la fiche devient l'en-tête du cours (container transform)
          R.courseArt.tint(h('div.course-head-main.course-band', { dataset: { hero: 'course:' + course.id + ':band' } },
            R.courseArt.mark(course, { size: 'lg', hero: true }), // pas de tracé ici : l'empreinte arrive déjà de la fiche (élément partagé)
            h('div.course-band-id',
              h('p.overline', 'Cours'),
              h('h1.course-title', h('span', { dataset: { hero: 'course:' + course.id + ':title' } }, course.title)),
              course.description ? h('p.course-desc', course.description) : null)), course),
          h('div.course-stats',
            stat(st.maps, st.maps > 1 ? 'cartes' : 'carte'),
            stat(st.nodes, st.nodes > 1 ? 'nœuds' : 'nœud'),
            stat(st.due, 'à réviser'),
            h('div.stat.stat-progress',
              h('span.stat-n', Math.round(st.progress * 100) + ' %'),
              h('span.stat-l', 'maîtrise'),
              ui.progress(st.progress))),
          h('div.course-actions',
            ui.btn('Nouvelle carte', { icon: 'plus', variant: 'filled', onClick: () => R.actions.newMap(course.id) }),
            ui.btn('Réviser ce cours', { icon: 'cards', variant: 'outlined', disabled: !st.reviewable, onClick: () => R.app.go('#/reviser/cours/' + course.id) })));

        el.appendChild(h('div.page.page-course', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll',
          h('div.course-layout', header,
            maps.length ? h('section.lib-sec', h('div.sec-head', h('h2.sec-title', 'Cartes'), h('span.sec-count', String(maps.length))), grid)
              : h('section.lib-sec', ui.emptyState({
                icon: 'map', title: 'Aucune carte dans ce cours',
                text: 'Une carte = une notion à décomposer : sa définition, ses conditions, ses exceptions…',
                action: ui.btn('Créer la première carte', { icon: 'plus', variant: 'filled', onClick: () => R.actions.newMap(course.id) }),
              }))))));
        if (intro) {
          // value change : les chiffres du cours défilent à la première ouverture
          for (const n of U.$$('.course-stats .stat-n', el)) {
            const m = n.textContent.match(/^(\d+)( %)?$/);
            if (m) R.motion.countUp(n, +m[1], { duration: 800, format: (v) => v + (m[2] || '') });
          }
          const pg = el.querySelector('.page-course');
          setTimeout(() => pg && pg.classList.remove('intro'), 1400);
        }
        intro = false;
      };
      const stat = (n, l) => h('div.stat', h('span.stat-n', String(n)), h('span.stat-l', l));
      draw();
      R.app.setFab({ icon: 'plus', label: 'Nouvelle carte', onClick: () => R.actions.newMap(route.id) });
      const off = S.on((t) => { if (t === 'change' || t === 'import' || t === 'review' || t === 'readonly') draw(); });
      return { unmount: off };
    },
  };
})(window.R);
