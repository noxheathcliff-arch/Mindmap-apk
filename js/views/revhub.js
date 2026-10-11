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

  /* Échéancier : chaque jour est une pile de fiches vue de profil, empilée PAR COURS (encre et
     papier du cours, du plus ancien en bas). On lit d'un coup combien et quoi revient quand. */
  function forecastCard(intro) {
    const days = S.forecast(7);
    const max = Math.max(1, ...days.map((d) => d.n));
    const fmt = (t, i) => (i === 0 ? 'Auj.' : i === 1 ? 'Dem.' : new Date(t).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));
    const total = days.slice(1).reduce((a, d) => a + d.n, 0);
    const order = S.coursesSorted().slice().sort((a, b) => a.createdAt - b.createdAt);
    const used = order.filter((c) => days.some((d) => d.by[c.id]));
    // k : rang du segment dans sa pile (0 = en bas) — les fiches se posent l'une sur l'autre
    const seg = (c, n, k) => R.courseArt.tint(h('span.fc-seg', { style: { flexGrow: String(n), '--k': k }, dataset: { c: c.id }, title: `${c.title} · ${U.plural(n, 'carte')}` }), c);
    const card = h('section.hub-card', { 'aria-label': 'À venir' },
      h('div.hub-card-head', h('h2.hub-card-title', 'Échéancier'), h('span.hub-card-sub', total ? `${U.plural(total, 'fiche')} sur 6 jours` : 'Rien de prévu')),
      h('div.fc', { role: 'img', 'aria-label': days.map((d, i) => `${fmt(d.day, i)} : ${d.n}` + (used.length > 1 && d.n ? ` (${used.filter((c) => d.by[c.id]).map((c) => `${c.title} ${d.by[c.id]}`).join(', ')})` : '')).join(' ; ') },
        days.map((d, i) => h('div.fc-col', { class: (i === 0 ? 'is-today ' : '') + (d.n ? '' : 'zero'), title: `${new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} · ${U.plural(d.n, 'carte')}` },
          h('span.fc-n', d.n ? String(d.n) : ''),
          h('span.fc-track', h('span.fc-bar', { style: { '--h': String(d.n / max), '--i': i }, class: intro ? 'grow' : '' },
            used.filter((c) => d.by[c.id]).map((c, k) => seg(c, d.by[c.id], k)))),
          h('span.fc-l', fmt(d.day, i))))),
      used.length > 1 ? h('div.fc-legend', used.map((c) => R.courseArt.tint(h('button.fc-key', { type: 'button', dataset: { c: c.id }, 'aria-pressed': 'false' }, h('i'), h('span', c.title)), c))) : null);
    /* légende ↔ données : survoler (ou toucher) un cours éclaire ses segments dans toutes les
       piles et estompe les autres (opacité, 160 ms) ; survoler un segment éclaire sa légende */
    const focus = (id) => {
      card.classList.toggle('fc-focus', !!id);
      for (const x of U.$$('[data-c]', card)) x.classList.toggle('on', x.dataset.c === id);
      for (const k of U.$$('.fc-key', card)) k.setAttribute('aria-pressed', String(k.dataset.c === id));
    };
    let pinned = null;
    for (const k of U.$$('.fc-key', card)) {
      k.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !pinned) focus(k.dataset.c); });
      k.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) focus(null); });
      k.addEventListener('click', () => { pinned = pinned === k.dataset.c ? null : k.dataset.c; focus(pinned); });
      k.addEventListener('focus', () => { if (!pinned) focus(k.dataset.c); });
      k.addEventListener('blur', () => { if (!pinned) focus(null); });
    }
    for (const sg of U.$$('.fc-seg', card)) {
      sg.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !pinned) focus(sg.dataset.c); });
      sg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) focus(null); });
    }
    return card;
  }

  /* Carte de régularité : une case par jour, un tampon encré quand on a révisé ce jour-là
     (le nombre de fiches dans le tampon, une inclinaison propre au jour, comme à la main) */
  function loyaltyCard(intro) {
    const log = S.data.settings.reviewLog;
    const streak = S.streak();
    let on = 0;
    const cells = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = U.dayKey(d);
      const n = log[key] || 0;
      if (n) on++;
      const tilt = ((parseInt(key.replace(/\D/g, ''), 10) * 37) % 25) - 12;
      cells.push(h('div.ly-cell', { class: (n ? 'on ' : '') + (i === 0 ? 'is-today' : ''), title: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) + (n ? ` · ${U.plural(n, 'fiche')}` : ' · rien') },
        h('span.ly-d', d.toLocaleDateString('fr-FR', { weekday: 'narrow' })),
        h('span.ly-slot',
          n ? h('span.ly-stamp', { class: intro ? 'slam' : '', style: { '--r': tilt + 'deg', '--i': 6 - i } }, h('b', String(n))) : i === 0 ? h('span.ly-wait', 'auj.') : h('span.ly-num', String(d.getDate()))),
      ));
    }
    return h('section.hub-card.loyal', { 'aria-label': 'Régularité' },
      h('div.hub-card-head', h('h2.hub-card-title', 'Carte de régularité'), h('span.hub-card-sub', `${on}/7 jours`)),
      h('div.ly-grid', cells),
      h('div.today-streak.hub-streak', { class: streak ? 'lit' : '' },
        h('span.flame', R.icon('flame', 20)),
        h('span', streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Un tampon aujourd’hui lance ta série')));
  }

  /** L'empreinte du cours au centre d'un anneau : l'arc dit la maîtrise (0 → 100 %) */
  function masteryRing(c, p) {
    const ring = h('span.mring', { role: 'img', 'aria-label': `Maîtrise ${Math.round(p * 100)} %`, style: { '--p': String(p) } });
    ring.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="mr-track" cx="24" cy="24" r="21"/><circle class="mr-val" cx="24" cy="24" r="21" pathLength="100"/></svg>';
    ring.appendChild(R.courseArt.mark(c, { size: 'sm', hero: true }));
    return ring;
  }

  function courseRow(c) {
    const st = S.courseStats(c.id);
    const due = st.due;
    const row = h('a.hub-course', { href: sessionHref('#/reviser/cours/' + c.id, { all: !due }), class: due ? '' : 'is-done', dataset: { hero: 'course:' + c.id + ':band' } },
      masteryRing(c, st.progress),
      h('span.hub-course-body',
        h('span.hub-course-t', c.title),
        h('span.hub-course-s', due ? `${minutes(Math.min(due, S.data.settings.sessionSize || due))} · maîtrise ${Math.round(st.progress * 100)} %` : `À jour · maîtrise ${Math.round(st.progress * 100)} %`)),
      due ? h('span.due-stamp', h('b', String(due)), h('span', due > 1 ? 'dues' : 'due')) : h('span.hub-course-ok', R.icon('check', 18)));
    R.courseArt.tint(row, c);
    return row;
  }

  /* À retravailler : des fiches cornées (coin plié = « à reprendre »), en bande horizontale */
  function weakList() {
    const list = S.weakCards(8);
    if (!list.length) return null;
    return h('section.lib-sec',
      h('div.sec-head', h('h2.sec-title', 'À retravailler'), h('span.sec-count', String(list.length))),
      h('p.hub-hint', 'Les dernières fiches notées « À revoir ». Elles reviennent dès demain ; un détour par la carte aide à comprendre ce qui coince.'),
      h('div.dogs', list.map(({ map, node }) => {
        const c = S.course(map.courseId);
        const card = h('a.dog', { href: `#/carte/${map.id}?n=${node.id}`, dataset: { hero: `map:${map.id}:node` } },
          // forme de la fiche (sous le texte) : la feuille coupée en diagonale + le rabat posé dessus
          h('span.dog-shape', { 'aria-hidden': 'true' }, h('span.dog-paper', h('span.dog-band')), h('span.dog-shade'), h('span.dog-flap')),
          h('span.dog-k', S.isStruct(node.type) ? S.kickerOf(map, node) : S.TYPES[node.type].label),
          h('span.dog-t', node.title),
          h('span.dog-s', map.title),
          h('span.dog-stamp', 'À revoir'));
        if (c) R.courseArt.tint(card, c);
        // la transition part de CETTE fiche (plusieurs fiches peuvent venir de la même carte)
        card.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); R.app.go(card.getAttribute('href'), { from: card }); });
        return card;
      })));
  }

  /* Le paquet du jour : la session à venir, en vrai paquet. Les feuilles du dessous prennent la
     teinte des cours les plus chargés ; leur nombre suit la taille de session (10 · 20 · toutes).
     La fiche du dessus porte le compte et devient la première fiche de la session.
     Changer la taille met le paquet à jour SUR PLACE : une feuille se glisse dessous (ou s'y
     range), le compte défile — rien n'est reconstruit, rien ne clignote. */
  function dayDeck(take, due, size, start) {
    const tinted = S.coursesSorted().map((c) => ({ c, d: S.courseStats(c.id).due })).filter((x) => x.d).sort((a, b) => b.d - a.d).map((x) => x.c);
    const layersFor = (n, sz) => (due ? Math.min(sz === 10 ? 1 : sz === 20 ? 2 : 3, Math.max(0, n - 1)) : 1);
    const sheet = (i) => {
      const sh = h('span.dd-sheet', { class: 's' + i, 'aria-hidden': 'true' });
      const c = tinted[(i - 1) % Math.max(1, tinted.length)];
      if (c) R.courseArt.tint(sh, c);
      return sh;
    };
    const num = due ? h('span.dd-n', String(take)) : h('span.dd-n.dd-ok', R.icon('check', 36));
    const unit = h('span.dd-u', due ? (take > 1 ? 'cartes' : 'carte') : 'tout est à jour');
    const time = due ? h('span.dd-time', minutes(take)) : null;
    // répartition par cours : un trait par cours, à l'encre du cours, long comme sa part du dû
    const mix = due && tinted.length > 1 ? h('span.dd-mix', { 'aria-hidden': 'true' },
      tinted.map((c, k) => R.courseArt.tint(h('i', { style: { flexGrow: String(S.courseStats(c.id).due), '--k': k }, title: c.title }), c))) : null;
    const top = h('span.dd-top', { dataset: { hero: 'session:all:card' } },
      h('span.dd-k', due ? 'Paquet du jour' : 'Entraînement'), num, unit, mix, time);
    const deck = h('button.daydeck', { type: 'button', 'aria-label': due ? `Commencer : ${take} cartes` : 'Réviser quand même', onclick: start });
    for (let i = layersFor(take, size); i >= 1; i--) deck.appendChild(sheet(i));
    deck.appendChild(top);

    let shown = take, token = 0;
    deck.update = (n, sz) => {
      if (!due) return;
      // feuilles : on ajoute par-dessous (glisse depuis sous la fiche), on retire par le fond (se range)
      const want = layersFor(n, sz);
      for (let i = 1; i <= 3; i++) {
        const cur = deck.querySelector(`.dd-sheet.s${i}:not(.out)`);
        if (i <= want && !cur) {
          const sh = sheet(i);
          if (!motion.reduced()) sh.classList.add('in');
          // ordre du DOM : s3, s2, s1, puis la fiche (le plus loin est peint dessous)
          const after = [...deck.querySelectorAll('.dd-sheet:not(.out)')].find((x) => +x.className.match(/s(\d)/)[1] < i);
          deck.insertBefore(sh, after || top);
        } else if (i > want && cur) {
          if (motion.reduced()) cur.remove();
          else { cur.classList.add('out'); setTimeout(() => cur.remove(), 200); }
        }
      }
      // le compte défile de l'ancienne valeur à la nouvelle (interruptible : seul le dernier écrit)
      const from = shown, my = ++token;
      shown = n;
      unit.textContent = n > 1 ? 'cartes' : 'carte';
      if (time) time.textContent = minutes(n);
      deck.setAttribute('aria-label', `Commencer : ${n} cartes`);
      if (motion.reduced() || from === n) { num.textContent = String(n); return; }
      motion.tween({ duration: 320, ease: motion.ease.expo, onUpdate: (p, e) => { if (my === token) num.textContent = String(Math.round(from + (n - from) * e(p))); } });
    };
    return deck;
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
          const due0 = due - fresh;
          const courses = S.coursesSorted().filter((c) => S.courseStats(c.id).reviewable)
            .sort((a, b) => S.courseStats(b.id).due - S.courseStats(a.id).due);
          const metaFor = (n) => (due
            ? [h('b', minutes(n)), ` pour cette session · ${[due0 ? `${due0} déjà vue${due0 > 1 ? 's' : ''}` : null, fresh ? `${fresh} nouvelle${fresh > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}`]
            : ['Rien n’est dû aujourd’hui. Une série d’entraînement ne change pas tes échéances… sauf ce que tu notes.']);
          const ctaFor = (n) => (due
            ? ui.btn(`Commencer · ${n} carte${n > 1 ? 's' : ''}`, { icon: 'play', variant: 'filled', cls: 'hub-cta', onClick: () => R.app.go(sessionHref('#/reviser/tout')) })
            : ui.btn('Réviser quand même', { icon: 'cards', variant: 'tonal', cls: 'hub-cta', onClick: () => R.app.go(sessionHref('#/reviser/tout', { all: true })) }));
          const meta = h('p.hub-meta', metaFor(take));
          let cta = ctaFor(take);
          const start = () => R.app.go(sessionHref('#/reviser/tout', { all: !due }));
          const deck = dayDeck(take, due, size, start);
          const coursesBox = courses.length ? h('div.hub-courses', courses.map(courseRow)) : null;
          /* durée de session : un choix mémorisé (10 · 20 · toutes), appliqué partout.
             Mise à jour sur place (l'indicateur glisse, le libellé tique) : la page ne se reconstruit
             pas, le défilement et le regard restent où ils sont. */
          const seg = h('div.segmented.hub-size', { role: 'radiogroup', 'aria-label': 'Taille de la session' },
            SIZES.map(([v, l]) => {
              const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(size === v), dataset: { v } }, l);
              b.addEventListener('click', () => {
                if (S.data.settings.sessionSize === v) return;
                S.data.settings.sessionSize = v;
                S.save();
                U.$$('.seg-btn', seg).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
                seg._place();
                const n = v ? Math.min(v, due) : due;
                U.clear(meta); U.append(meta, metaFor(n));
                const next = ctaFor(n);
                if (!motion.reduced()) next.classList.add('tick');
                cta.replaceWith(next); cta = next;
                // le paquet s'épaissit ou s'amincit sur place, le compte défile
                deck.update(n, v);
                if (coursesBox) { U.clear(coursesBox); courses.forEach((c) => coursesBox.appendChild(courseRow(c))); }
              });
              return b;
            }));
          ui.segIndicator(seg, 'hub-size');
          main = h('div.hub-main',
            h('div.hero.hub-hero',
              h('p.overline.hero-date', new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
              h('h1.hero-title', due ? [h('span.hl-sweep', h('span.hub-num', String(due))), due > 1 ? ' cartes à réviser' : ' carte à réviser'] : h('span.hl-sweep', 'Tout est à jour.'))),
            // le bloc « Commencer » devient la première fiche de la session (élément partagé)
            h('section.hub-start',
              deck,
              h('div.hub-start-ctl',
                meta,
                h('div.hub-size-row', h('span.hub-size-l', 'Session'), seg),
                cta)),
            h('div.hub-side.only-narrow', loyaltyCard(intro), forecastCard(intro)),
            courses.length ? h('section.lib-sec',
              h('div.sec-head', h('h2.sec-title', 'Par cours'), h('span.sec-count', String(courses.length))),
              coursesBox) : null,
            weakList());
        }
        const aside = anyReviewable ? h('aside.hub-side.only-wide', loyaltyCard(intro), forecastCard(intro)) : null;
        const page = h('div.page.page-hub', { class: intro ? 'intro' : '' }, topbar, h('div.page-scroll', h('div.hub-layout', main, aside)));
        el.appendChild(page);
        if (intro) {
          R.motion.stagger([...U.$$('.hub-start, .hub-side .hub-card, .hub-course, .dog', el)], 1, { step: 40, max: 8 });
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
