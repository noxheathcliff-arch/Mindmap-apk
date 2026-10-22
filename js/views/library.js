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
    // mêmes trajets que dans l'éditeur (disposition, renvois qui contournent les nœuds)
    const rects = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: sz[n.id].w, h: sz[n.id].h }));
    for (const e of map.edges) {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) continue;
      const cv = e.kind === 'link'
        ? R.layout.route(a, sz[a.id], b, sz[b.id], { rects, fast: true })
        : R.layout.treeCurve(map.layout, a, sz[a.id], b, sz[b.id]);
      svg += `<path d="${cv.d}" style="fill:none;stroke:var(--outline)" stroke-width="${Math.max(2, bw / 220)}" ${e.kind === 'link' ? `stroke-dasharray="${bw / 90}"` : ''}/>`;
    }
    for (const n of nodes) {
      const s = sz[n.id];
      const ink = n.type === 'notion' || n.type === 'chapitre';
      const fill = ink ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
      const stroke = ink ? 'none' : n.type === 'lecon' || n.type === 'section' || n.type === 'soussection' ? 'var(--on-surface)' : 'var(--outline-variant)';
      const sw = Math.max(2, bw / 300) * (n.type === 'lecon' || n.type === 'section' ? 2 : 1);
      svg += `<rect x="${n.x}" y="${n.y}" width="${s.w}" height="${s.h}" rx="${n.type === 'notion' ? s.h / 2 : 10}" style="fill:${fill};stroke:${stroke}" stroke-width="${sw}"/>`;
      if (n.review.rating === 'maitrise') svg += `<rect x="${n.x + 10}" y="${n.y + s.h - 12}" width="${s.w - 20}" height="5" rx="2" style="fill:var(--primary)"/>`;
    }
    svg += '</svg>';
    wrap.innerHTML = svg;
    return wrap;
  };

  /* ---------------- Actions partagées ------------------------------ */
  R.actions = R.actions || {};

  /* from : élément d'où naît le formulaire (emplacement « Nouveau cours / Nouvelle carte ») */
  R.actions.newCourse = async function ({ from } = {}) {
    const v = await ui.form({
      title: 'Nouveau cours', icon: 'folder', ok: 'Créer', origin: from, cls: 'new-course m3-form', outlined: true,
      // deux départs : un cours vide, ou un cours déjà prêt (fichier, JSON d'une IA)
      lead: (close) => h('div.nc-start',
        h('button.nc-opt.ripple', { type: 'button', onclick: () => close('__import') },
          h('span.nc-ic', R.icon('import', 24)),
          h('span.nc-t', h('b', 'Importer un cours'), h('span', 'Fichier .json ou texte d\'une IA')),
          h('span.nc-go', R.icon('chevronRight', 20))),
        h('p.nc-or', h('span', 'ou partir de zéro'))),
      fields: [
        { key: 'title', label: 'Intitulé du cours', placeholder: 'Ex. Droit des obligations', icon: 'library', required: true },
        { key: 'description', label: 'Précision', placeholder: 'Ex. M1 · S1 · Pr. Dupont', icon: 'edit', support: 'Facultatif · niveau, semestre, enseignant' },
      ],
    });
    if (v === '__import') { R.app.openImport(); return null; }
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

  R.actions.newMap = async function (courseId, { from, folderId = null } = {}) {
    if (!courseId) {
      const courses = S.coursesSorted();
      if (!courses.length) { await R.actions.newCourse(); return; }
      courseId = courses[0].id;
    }
    const v = await ui.form({
      title: 'Nouvelle carte', icon: 'map', ok: 'Créer', origin: from, cls: 'm3-form', outlined: true,
      fields: [
        { key: 'title', label: 'Notion ou chapitre', placeholder: 'Ex. La formation du contrat', icon: 'map', required: true },
        { key: 'root', label: 'Point de départ', choices: [
          { value: 'notion', icon: 'target', label: 'Une notion', text: 'Un concept à décomposer\u00a0: définition, conditions, effets…' },
          { value: 'chapitre', icon: 'outline', label: 'Un chapitre de cours', text: 'Sections, sous-sections, puis les notions de chacune.' },
        ], onChange: (val, inputs) => { inputs.title.placeholder = val === 'chapitre' ? 'Ex. Les sources du droit' : 'Ex. La formation du contrat'; } },
      ],
    });
    if (!v) return;
    const m = S.addMap(courseId, v.title, { rootType: v.root, folderId });
    R.app.go('#/carte/' + m.id + '?new=1');
  };

  /** Menu d'un cours. Sur la page du cours (inCourse), « Réviser » est déjà dans sa barre d'actions. */
  R.actions.courseMenu = function (anchor, c, after, { inCourse = false } = {}) {
    ui.menu(anchor, [
      { label: 'Modifier', icon: 'edit', onClick: () => R.actions.editCourse(c) },
      inCourse ? null : { label: 'Réviser ce cours', icon: 'cards', onClick: () => R.app.go('#/reviser/cours/' + c.id) },
      { label: 'Exporter le cours (JSON)', icon: 'export', onClick: () => {
        U.download(`ratio-${U.slug(c.title)}.json`, S.exportCourse(c.id));
        ui.snack('Cours exporté · à importer avec Réglages › Importer');
      } },
      { divider: true },
      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => R.actions.deleteCourse(c, after) },
    ].filter(Boolean));
  };

  /** Les 7 derniers jours : une pastille pleine par jour de révision (partagé avec Réviser) */
  R.weekDots = function () {
    const log = S.data.settings.reviewLog;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const n = log[U.dayKey(d)] || 0;
      days.push(h('span.week-day', { class: n ? 'on' : '', title: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) + ` · ${n} carte${n > 1 ? 's' : ''}` },
        h('span.week-dot'), h('span.week-l', d.toLocaleDateString('fr-FR', { weekday: 'narrow' }))));
    }
    return h('span.week', days);
  };

  /* ---------------- Héros « session du jour » ------------------------
     Un seul point focal (M3 Expressive) : le nombre dû, dans une forme cookie de la bibliothèque
     M3, et l'action « Réviser » dans le héros même (pas de barre d'actions sur l'onglet Cours). */
  function sessionHero() {
    const due = S.dueCount();
    const streak = S.streak();
    const today = S.reviewedToday();
    const next = S.nextDueInfo();
    const courses = S.coursesSorted().filter((c) => S.courseStats(c.id).due).length;
    const mins = Math.max(1, Math.round((due * 25) / 60));
    const hour = new Date().getHours();
    const title = due ? (hour >= 18 || hour < 5 ? 'Ta session du soir est prête' : 'Ta session du jour est prête') : today ? 'Bravo, tout est révisé' : 'Tout est à jour';
    const sub = due
      ? `${U.plural(courses, 'cours', 'cours')} · ≈ ${mins} min. Le rappel actif fixe mieux qu’une relecture.`
      : today ? `${U.plural(today, 'carte')} révisée${today > 1 ? 's' : ''} aujourd’hui.` : next.tomorrow ? `Demain : ${U.plural(next.tomorrow, 'carte')}.` : 'Décompose une nouvelle notion pour alimenter tes révisions.';
    return h('section.today', { 'aria-label': 'Aujourd’hui', dataset: { hero: 'session:all:card' } },
      h('span.today-shape', { 'aria-hidden': due ? null : 'true' },
        due ? h('span.today-num', String(due)) : R.icon('check', 40), due ? h('span.today-unit', due > 1 ? 'cartes' : 'carte') : null),
      h('div.today-body',
        h('h2.today-title', title),
        h('p.today-sub', sub),
        h('div.today-streak', { class: streak ? 'lit' : '' },
          h('span.flame', R.icon('flame', 20)),
          h('span', streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Lance ta série aujourd’hui'),
          R.weekDots()),
        reviewBtn(due)));
  }
  function reviewBtn(due) {
    const any = S.data.maps.some((m) => S.mapStats(m).reviewable);
    if (!any) return null;
    return due
      ? ui.btn(`Réviser · ${due}`, { icon: 'play', variant: 'filled', cls: 'today-cta', onClick: (e) => R.app.go('#/reviser/tout', { from: e.currentTarget.closest('.today') }) })
      : ui.btn('Réviser quand même', { icon: 'cards', variant: 'tonal', cls: 'today-cta', onClick: () => R.app.go('#/reviser/tout?all=1') });
  }

  /* ---------------- Carte de cours : un dossier entrouvert ----------------
     Le dos du dossier (avec son onglet), la prochaine fiche qui en dépasse comme une feuille
     qu'on va tirer, puis le rabat : titre du cours, avancement, « Réviser ». Lien étiré : le
     titre est le lien principal et couvre le dossier ; « Réviser » et « Options » restent des
     contrôles distincts ; toucher la feuille lance la révision sur cette fiche-là. */
  function untilLabel(t) {
    if (!t || !Number.isFinite(t)) return '';
    const days = Math.round((U.startOfDay(t) - U.startOfDay()) / U.DAY);
    return days <= 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`;
  }
  function courseCard(c, rerender) {
    const st = S.courseStats(c.id);
    const next = st.due ? S.nextCard(c.id) : null;
    const reviewHref = next ? `#/reviser/cours/${c.id}?start=${next.map.id}.${encodeURIComponent(next.key)}` : null;
    const hk = next ? next.key.replace(/:/g, '-') : '';
    const card = R.courseArt.tint(h('article.fiche.course-scope', { 'aria-labelledby': 'cc-' + c.id }), c);

    // la feuille qui dépasse : la prochaine fiche à réviser, ou l'état du cours
    let kicker, q, qHero = null;
    if (next) {
      if (next.ex) {
        kicker = 'Prochaine question · ' + S.EXERCISE_KINDS[next.ex.kind].label;
        q = next.ex.q;
      } else {
        const T = S.TYPES[next.node.type];
        kicker = 'Prochaine fiche' + (T.kicker || T.label ? ' · ' + (S.kickerOf(next.map, next.node) || T.label) : '');
        q = next.node.title;
      }
      qHero = `fiche:${hk}:q`;
    } else if (st.reviewable) {
      const nx = S.nextDueInfo({ courseId: c.id }).next;
      kicker = 'À jour';
      q = nx < Infinity ? `Prochaine révision ${untilLabel(nx)}` : 'Rien à réviser aujourd’hui';
    } else if (st.maps) {
      kicker = 'À compléter';
      q = 'Écris des notes : elles deviendront des fiches';
    } else {
      kicker = 'Dossier vide';
      q = 'Commence par une première carte';
    }
    const paper = h('div.fiche-body', next ? { dataset: { hero: `fiche:${hk}:card` } } : {},
      h('p.fiche-k', kicker),
      h('p.fiche-q', qHero ? h('span', { dataset: { hero: qHero } }, q) : q));
    paper.addEventListener('click', () => R.app.go(reviewHref || '#/cours/' + c.id));

    const more = ui.iconBtn('more', { title: 'Options du cours', cls: 'fiche-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.courseMenu(more, c, rerender); });
    const sub = c.description || (st.maps ? `Modifié ${U.relTime(S.courseActivity(c))}` : 'Nouveau cours');
    const band = h('header.fiche-band',
      h('div.fiche-id',
        h('h3.fiche-title', { id: 'cc-' + c.id },
          h('a.fiche-link', { href: '#/cours/' + c.id }, h('span', { dataset: { hero: 'course:' + c.id + ':title' } }, c.title))),
        h('p.fiche-sub', sub)),
      more);

    let action = null;
    if (next) {
      action = h('a.btn.btn-filled.fiche-cta', { href: reviewHref, 'aria-label': `Réviser ${U.plural(st.due, 'fiche')} de ${c.title}` },
        R.icon('play', 18), h('span.fiche-cta-l', 'Réviser'), h('span.fiche-count', String(st.due)));
    } else if (!st.maps) {
      action = ui.btn('Nouvelle carte', { icon: 'plus', variant: 'tonal', cls: 'fiche-cta', onClick: (e) => { e.preventDefault(); e.stopPropagation(); R.actions.newMap(c.id); } });
    }
    const foot = h('footer.fiche-foot',
      h('div.fiche-stats',
        st.maps ? h('span.fiche-meta', U.plural(st.maps, 'carte'), h('span.fiche-meta-n', ` · ${U.plural(st.nodes, 'nœud')}`)) : null,
        st.reviewable ? h('span.fiche-meter', { role: 'img', 'aria-label': `Maîtrise ${Math.round(st.progress * 100)} %` },
          h('i', { style: { transform: `scaleX(${st.progress})` } })) : null),
      action);

    // ordre du DOM : le rabat (titre) d'abord pour la lecture ; la grille place la feuille au-dessus
    card.append(
      h('span.fiche-back', { 'aria-hidden': 'true' }),
      h('span.fiche-lid', { 'aria-hidden': 'true' }),
      h('div.fiche-front', { dataset: { hero: 'course:' + c.id + ':band' } }, band, foot),
      paper);
    return card;
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
            ui.iconBtn('search', { title: 'Rechercher', onClick: (e) => R.search.open('', { from: e.currentTarget }) }),
            ui.iconBtn('settings', { title: 'Réglages', onClick: () => R.app.openSettings() })));

        const grid = h('div.course-grid');
        courses.forEach((c) => grid.appendChild(courseCard(c, draw)));
        const add = h('button.course-card.course-add.ripple', { type: 'button', onclick: (e) => R.actions.newCourse({ from: e.currentTarget }) },
          h('span.add-ic', R.icon('plus', 24)), h('span.add-txt', h('span.add-l', 'Nouveau cours'), h('span.add-s', 'Un dossier par matière')));
        grid.appendChild(add);
        if (intro) R.motion.stagger(Array.from(grid.children), 1);
        if (intro && !R.motion.reduced()) for (const f of grid.querySelectorAll('.fiche')) {
          // fermé, puis le volet bascule et la feuille sort ; la classe part quand le rabat s'est
          // posé, en dernier (sinon « both » figerait la feuille et couperait le survol)
          f.classList.add('emerge');
          const front = f.querySelector('.fiche-front');
          front.addEventListener('animationend', function done(e) { if (e.target !== front) return; f.classList.remove('emerge'); front.removeEventListener('animationend', done); });
        }

        const recents = S.recentMaps(5);
        const main = h('div.lib-main',
          h('div.hero',
            h('p.hero-date', dateStr[0].toUpperCase() + dateStr.slice(1)),
            h('h1.hero-title', greet)),
          sessionHero(),
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
            h('div.map-list', recents.map((m) => R.mapRow(m)))) : null,
          courses.length ? tipCard() : null);

        const pageEl = h('div.page.page-lib', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', h('div.lib-layout', main)));
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
    return h('section.tip-card', h('span.tip-ic', R.icon('sparkle', 20)), h('div.tip-txt', h('h3.tip-title', t), h('p.tip-text', { html: R.md.inline(d, { articles: false }) })));
  }
})(window.R);
