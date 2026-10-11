/* Ratio — Réviser : le tableau de bord de la révision (onglet de navigation)
   Répond, dans l'ordre, aux trois questions qu'on se pose avant de réviser :
   1. combien, et combien de temps ?  → le nombre dû, une estimation, la durée de session au choix
   2. quoi ?                          → chaque cours avec ce qu'il a de dû (sa teinte, son empreinte)
   3. et ensuite ?                    → la série, la charge des 7 prochains jours, les cartes à retravailler
   La session elle-même reste la vue « review » (#/reviser/tout, /cours/…, /carte/…). */
(function (R) {
  'use strict';
  const { U, ui, store: S, motion } = R;
  const { h } = U;
  R.views = R.views || {};

  const SEC_PER_CARD = 25; // rappel + vérification + note : ordre de grandeur mesuré à l'usage
  const SIZES = [[10, '10'], [20, '20'], [0, 'Toutes']];

  const minutes = (n) => `≈ ${Math.max(1, Math.round((n * SEC_PER_CARD) / 60))} min`;

  /** Lien vers une session : la taille choisie voyage dans l'URL (n=0 : toutes) */
  function sessionHref(base, { all = false } = {}) {
    const q = new URLSearchParams();
    if (all) q.set('all', '1');
    q.set('n', String(S.data.settings.sessionSize));
    return base + '?' + q.toString();
  }

  function forecastCard(intro) {
    const days = S.forecast(7);
    const max = Math.max(1, ...days.map((d) => d.n));
    const fmt = (t, i) => (i === 0 ? 'Auj.' : i === 1 ? 'Dem.' : new Date(t).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));
    const total = days.slice(1).reduce((a, d) => a + d.n, 0);
    return h('section.hub-card', { 'aria-label': 'À venir' },
      h('div.hub-card-head', h('h2.hub-card-title', 'À venir'), h('span.hub-card-sub', total ? `${U.plural(total, 'carte')} sur 6 jours` : 'Rien de prévu')),
      h('div.fc', { role: 'img', 'aria-label': days.map((d, i) => `${fmt(d.day, i)} : ${d.n}`).join(', ') },
        days.map((d, i) => h('div.fc-col', { class: (i === 0 ? 'is-today ' : '') + (d.n ? '' : 'zero'), title: `${new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} · ${U.plural(d.n, 'carte')}` },
          h('span.fc-n', d.n ? String(d.n) : ''),
          h('span.fc-track', h('span.fc-bar', { style: { '--h': String(d.n / max), '--i': i }, class: intro ? 'grow' : '' })),
          h('span.fc-l', fmt(d.day, i))))));
  }

  function streakCard() {
    const streak = S.streak();
    const today = S.reviewedToday();
    return h('section.hub-card', { 'aria-label': 'Régularité' },
      h('div.hub-card-head', h('h2.hub-card-title', 'Régularité'), h('span.hub-card-sub', today ? `${U.plural(today, 'carte')} aujourd’hui` : 'Pas encore aujourd’hui')),
      h('div.today-streak.hub-streak', { class: streak ? 'lit' : '' },
        h('span.flame', R.icon('flame', 20)),
        h('span', streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Lance ta série aujourd’hui'),
        R.weekDots()));
  }

  function courseRow(c) {
    const st = S.courseStats(c.id);
    const due = st.due;
    const row = h('a.hub-course', { href: sessionHref('#/reviser/cours/' + c.id, { all: !due }), class: due ? '' : 'is-done' },
      R.courseArt.mark(c, { size: 'sm' }),
      h('span.hub-course-body',
        h('span.hub-course-t', c.title),
        h('span.hub-course-s', due ? `${minutes(Math.min(due, S.data.settings.sessionSize || due))} · maîtrise ${Math.round(st.progress * 100)} %` : `À jour · maîtrise ${Math.round(st.progress * 100)} %`),
        ui.progress(st.progress, { label: 'Maîtrise du cours' })),
      due ? h('span.hub-course-due', String(due)) : h('span.hub-course-ok', R.icon('check', 18)));
    R.courseArt.tint(row, c);
    return row;
  }

  function weakList() {
    const list = S.weakCards(5);
    if (!list.length) return null;
    return h('section.lib-sec',
      h('div.sec-head', h('h2.sec-title', 'À retravailler'), h('span.sec-count', String(list.length))),
      h('p.hub-hint', 'Les dernières cartes notées « À revoir ». Elles reviennent dès demain ; un détour par la carte aide à comprendre ce qui coince.'),
      h('div.hub-weak', list.map(({ map, node }) => {
        const c = S.course(map.courseId);
        return h('a.hub-weak-row', { href: `#/carte/${map.id}?n=${node.id}` },
          ui.mastery('revoir', 14),
          h('span.hub-weak-body', h('span.hub-weak-t', node.title), h('span.hub-weak-s', [c && c.title, map.title].filter(Boolean).join(' › '))),
          R.icon('chevronRight', 18));
      })));
  }

  R.views.reviewHub = {
    mount(el) {
      let intro = R.motion.first('revhub');
      const draw = () => {
        U.clear(el);
        const due = S.dueCount();
        const anyReviewable = S.data.maps.some((m) => S.mapStats(m).reviewable);
        const fresh = S.reviewQueue({}, { limit: 1e9 }).filter((q) => { const m = S.map(q.mapId); const n = m && S.node(m, q.nodeId); return n && !n.review.last; }).length;
        const size = S.data.settings.sessionSize;
        const take = size ? Math.min(size, due) : due;

        const topbar = h('header.topbar.topbar-hub',
          h('h1.topbar-title.hub-topbar-title', 'Réviser'),
          h('div.topbar-actions',
            ui.iconBtn('search', { title: 'Rechercher', onClick: (e) => R.search.open('', { from: e.currentTarget }) }),
            ui.iconBtn('settings', { title: 'Réglages', onClick: () => R.app.openSettings() })));

        let main;
        if (!anyReviewable) {
          main = h('div.hub-main', ui.emptyState({
            icon: 'cards', title: 'Pas encore de cartes de révision',
            text: 'Chaque nœud qui a une note ou des éléments rattachés devient une question. Décompose une notion pour commencer.',
            action: ui.btn('Aller à mes cours', { icon: 'library', variant: 'filled', onClick: () => R.app.go('#/') }),
          }));
        } else {
          // durée de session : un choix mémorisé (10 · 20 · toutes), appliqué partout
          const seg = h('div.segmented.hub-size', { role: 'radiogroup', 'aria-label': 'Taille de la session' },
            SIZES.map(([v, l]) => {
              const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(size === v), dataset: { v } }, l);
              b.addEventListener('click', () => { S.data.settings.sessionSize = v; S.save(); draw(); });
              return b;
            }));
          ui.segIndicator(seg, 'hub-size');
          const cta = due
            ? ui.btn(`Commencer · ${take} carte${take > 1 ? 's' : ''}`, { icon: 'play', variant: 'filled', cls: 'hub-cta', onClick: () => R.app.go(sessionHref('#/reviser/tout')) })
            : ui.btn('Réviser quand même', { icon: 'cards', variant: 'tonal', cls: 'hub-cta', onClick: () => R.app.go(sessionHref('#/reviser/tout', { all: true })) });
          const due0 = due - fresh;
          const courses = S.coursesSorted().filter((c) => S.courseStats(c.id).reviewable)
            .sort((a, b) => S.courseStats(b.id).due - S.courseStats(a.id).due);
          main = h('div.hub-main',
            h('div.hero.hub-hero',
              h('p.overline.hero-date', new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
              h('h1.hero-title', due ? [h('span.hl-sweep', h('span.hub-num', String(due))), due > 1 ? ' cartes à réviser' : ' carte à réviser'] : h('span.hl-sweep', 'Tout est à jour.'))),
            h('section.hub-start',
              h('p.hub-meta', due
                ? [h('b', minutes(take)), ` pour cette session · ${[due0 ? `${due0} déjà vue${due0 > 1 ? "s" : ""}` : null, fresh ? `${fresh} nouvelle${fresh > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}`]
                : 'Rien n’est dû aujourd’hui. Une série d’entraînement ne change pas tes échéances… sauf ce que tu notes.'),
              h('div.hub-size-row', h('span.hub-size-l', 'Session'), seg),
              cta),
            h('div.hub-side.only-narrow', streakCard(), forecastCard(intro)),
            courses.length ? h('section.lib-sec',
              h('div.sec-head', h('h2.sec-title', 'Par cours'), h('span.sec-count', String(courses.length))),
              h('div.hub-courses', courses.map(courseRow))) : null,
            weakList());
        }
        const aside = anyReviewable ? h('aside.hub-side.only-wide', streakCard(), forecastCard(intro)) : null;
        const page = h('div.page.page-hub', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', h('div.hub-layout', main, aside)));
        el.appendChild(page);
        if (intro) {
          R.motion.stagger([...U.$$('.hub-start, .hub-side .hub-card, .hub-course, .hub-weak-row', el)], 1, { step: 40, max: 8 });
          const num = el.querySelector('.hub-num');
          if (num) motion.countUp(num, due, { duration: 800 });
          setTimeout(() => page.classList.remove('intro'), 1400);
        }
        intro = false;
      };
      draw();
      const off = S.on((t) => { if (t === 'change' || t === 'import' || t === 'review' || t === 'readonly') draw(); });
      return { unmount: off };
    },
  };
})(window.R);
