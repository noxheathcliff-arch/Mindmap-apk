/* Ratio — Révision : rappel actif + répétition espacée (Leitner)
   Hooked : déclencheur (Aujourd'hui) → action (1 tap) → récompense variable → investissement. */
(function (R) {
  'use strict';
  const { U, ui, store: S, motion } = R;
  const { h } = U;
  R.views = R.views || {};

  function nextLabel(node, rating) {
    const b = node.review.box;
    if (rating === 'revoir') return 'demain';
    const box = rating === 'compris' ? Math.min(5, Math.max(1, b + 1)) : Math.min(5, Math.max(2, b + 2));
    const d = S.INTERVALS[box];
    return d === 1 ? 'demain' : `${d} j`;
  }

  R.views.review = {
    mount(el, route) {
      const scope = route.scope || {};
      const all = route.q && route.q.all === '1';
      const scopeName = scope.mapId ? (S.map(scope.mapId) || {}).title : scope.courseId ? (S.course(scope.courseId) || {}).title : 'Tous les cours';
      const exitHref = scope.mapId ? '#/carte/' + scope.mapId : scope.courseId ? '#/cours/' + scope.courseId : '#/';

      const queue = S.reviewQueue(scope, { all });
      const results = { revoir: 0, compris: 0, maitrise: 0 };
      const requeued = new Set();
      let idx = 0, revealed = false, done = 0, busy = false;

      const counter = h('span.review-count');
      const bar = ui.progress(0, { label: 'Progression de la session' });
      const topbar = h('header.topbar.review-top',
        ui.iconBtn('close', { title: 'Terminer la session', onClick: () => R.app.go(exitHref) }),
        h('div.topbar-title', h('span.review-scope', 'Révision'), h('span.review-scope-name', scopeName || '')),
        h('div.topbar-actions', counter));
      const stage = h('div.review-stage');
      const actions = h('div.review-actions');
      const page = h('div.page.page-review', topbar, h('div.review-progress', bar), stage, actions);
      el.appendChild(page);

      if (!queue.length) { empty(); return { unmount() {} }; }

      let total = queue.length;
      let cardEl = null;
      showCard(1);
      document.addEventListener('keydown', onKey);

      function current() {
        const q = queue[idx];
        if (!q) return null;
        const map = S.map(q.mapId);
        const node = map && S.node(map, q.nodeId);
        return map && node ? { map, node } : null;
      }

      function updateProgress() {
        counter.textContent = `${Math.min(done + 1, total)} / ${total}`;
        bar.querySelector('.progress-bar').style.setProperty('--p', Math.round((done / total) * 100) + '%');
      }

      function showCard(dir) {
        let cur = current();
        while (!cur && idx < queue.length) { idx++; cur = current(); }
        if (!cur) { finish(); return; }
        revealed = false;
        updateProgress();
        const { map, node } = cur;
        const T = S.TYPES[node.type];
        const kids = S.childrenOf(map, node.id);
        const anc = S.ancestors(map, node.id);
        const course = S.course(map.courseId);

        const prompt = kids.length
          ? (node.logic ? `${T.prompt} — ${kids.length} éléments ${node.logic === 'et' ? 'cumulatifs' : 'alternatifs'} à retrouver` : `${T.prompt} — ${kids.length} élément${kids.length > 1 ? 's' : ''} à retrouver`)
          : T.prompt;

        const answer = h('div.answer', { 'aria-live': 'polite' },
          h('div.answer-inner',
            kids.length ? h('div.answer-block',
              h('p.overline', node.logic === 'et' ? 'Éléments cumulatifs (ET)' : node.logic === 'ou' ? 'Éléments alternatifs (OU)' : 'Décomposition'),
              h('ol.answer-list', kids.map((c) => h('li',
                node.logic ? h('span.decomp-logic', node.logic === 'et' ? 'ET' : 'OU') : null,
                S.TYPES[c.type].kicker ? h('span.decomp-kicker', S.TYPES[c.type].kicker) : null,
                h('span', c.title || 'Sans titre'))))) : null,
            node.note.trim() ? h('div.answer-block', h('p.overline', 'Note'), h('div.md.answer-note', { html: R.md.render(node.note) })) : null,
            h('a.answer-open', { href: `#/carte/${map.id}?n=${node.id}` }, R.icon('map', 16), 'Ouvrir dans la carte')));

        const card = h('article.rcard', { class: dir < 0 ? 'from-left' : 'from-right' },
          h('div.rcard-ctx', [course ? course.title : null, map.title].filter(Boolean).join(' › ')),
          anc.length && !(anc.length === 1 && U.norm(anc[0].title) === U.norm(map.title)) ? h('div.rcard-path', anc.map((a, i) => [i ? ' › ' : '', a.title])) : null,
          h('div.rcard-kicker', T.label),
          h('h2.rcard-title', node.title),
          h('p.rcard-prompt', prompt),
          answer);

        if (cardEl) {
          const old = cardEl;
          old.classList.add('leaving');
          setTimeout(() => old.remove(), 420);
        }
        cardEl = card;
        stage.appendChild(card);
        swipe(card);
        paintActions();
      }

      function paintActions() {
        U.clear(actions);
        const cur = current();
        if (!cur) return;
        if (!revealed) {
          const b = ui.btn('Afficher la réponse', { variant: 'filled', cls: 'reveal-btn', onClick: reveal });
          b.appendChild(h('kbd.btn-kbd', 'Espace'));
          actions.appendChild(b);
          actions.appendChild(h('p.review-hint', 'Formule ta réponse dans ta tête (ou à voix haute) avant de la découvrir.'));
          setTimeout(() => b.focus({ preventScroll: true }), 50);
        } else {
          const mk = (rating, variant, key) => {
            const b = h('button.rate-btn', { type: 'button', class: 'rate-' + rating + ' btn-' + variant, onclick: () => rate(rating) },
              ui.mastery(rating, 14),
              h('span.rate-l', S.RATINGS[rating].label),
              h('span.rate-next', nextLabel(cur.node, rating)),
              h('kbd.rate-kbd', key));
            return b;
          };
          actions.appendChild(h('div.rate-row', mk('revoir', 'outlined', '1'), mk('compris', 'tonal', '2'), mk('maitrise', 'filled', '3')));
          actions.appendChild(h('p.review-hint.only-touch', 'Astuce : glisse la carte ← à revoir · → maîtrisé'));
        }
        R.motion.stagger(Array.from(actions.querySelectorAll('.rate-btn, .reveal-btn')));
      }

      function reveal() {
        if (revealed || busy) return;
        revealed = true;
        cardEl.classList.add('anticipate');
        setTimeout(() => { cardEl.classList.remove('anticipate'); cardEl.classList.add('revealed'); }, U.reducedMotion() ? 0 : 110);
        paintActions();
      }

      function rate(rating) {
        if (!revealed || busy) return;
        const cur = current();
        if (!cur) return;
        busy = true;
        S.rate(cur.map, cur.node, rating);
        results[rating]++;
        if (rating === 'maitrise') {
          const r = cardEl.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + 40, { count: 10, spread: 60 });
        }
        if (rating === 'revoir' && !requeued.has(cur.node.id)) {
          requeued.add(cur.node.id);
          queue.push({ ...queue[idx] });
          total++;
        }
        cardEl.classList.add(rating === 'revoir' ? 'out-left' : rating === 'maitrise' ? 'out-right' : 'out-up');
        done++;
        idx++;
        setTimeout(() => {
          busy = false;
          if (idx >= queue.length) finish();
          else showCard(1);
        }, U.reducedMotion() ? 0 : 220);
      }

      function swipe(card) {
        let sx = 0, sy = 0, active = false, dx = 0;
        card.addEventListener('pointerdown', (e) => {
          if (!revealed || e.pointerType === 'mouse' || e.target.closest('a, button')) return;
          active = true; sx = e.clientX; sy = e.clientY; dx = 0;
          card.classList.add('dragging');
          card.setPointerCapture(e.pointerId);
        });
        card.addEventListener('pointermove', (e) => {
          if (!active) return;
          dx = e.clientX - sx;
          const dy = e.clientY - sy;
          if (Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dx) < 20) return;
          card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
          card.dataset.lean = dx > 60 ? 'right' : dx < -60 ? 'left' : '';
        });
        const end = () => {
          if (!active) return;
          active = false;
          card.classList.remove('dragging');
          card.style.transform = '';
          card.dataset.lean = '';
          if (dx > 110) rate('maitrise');
          else if (dx < -110) rate('revoir');
        };
        card.addEventListener('pointerup', end);
        card.addEventListener('pointercancel', end);
      }

      function onKey(e) {
        if (U.isTyping() || U.$('.dialog') || U.$('.search')) return;
        if (e.key === 'Escape') { R.app.go(exitHref); return; }
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); return; }
        if (revealed && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); rate(['revoir', 'compris', 'maitrise'][+e.key - 1]); }
      }

      function finish() {
        document.removeEventListener('keydown', onKey);
        bar.querySelector('.progress-bar').style.setProperty('--p', '100%');
        counter.textContent = `${total} / ${total}`;
        U.clear(actions);
        if (cardEl) { cardEl.classList.add('leaving'); setTimeout(() => cardEl && cardEl.remove(), 400); }
        const streak = S.streak();
        const next = S.nextDueInfo(scope.courseId ? { courseId: scope.courseId } : {});
        const remaining = S.dueCount(scope);
        const sum = results.revoir + results.compris + results.maitrise || 1;
        const dist = h('div.dist',
          ['maitrise', 'compris', 'revoir'].map((k) => h('div.dist-row',
            ui.mastery(k, 14),
            h('span.dist-l', S.RATINGS[k].label),
            h('span.dist-bar', h('span', { style: { '--w': (results[k] / sum) * 100 + '%' } })),
            h('span.dist-n', String(results[k])))));
        const end = h('section.review-end',
          h('div.end-flame', { class: streak ? 'lit' : '' }, R.icon('flame', 40), h('span.end-streak', String(streak))),
          h('p.overline', streak > 1 ? `${streak} jours de suite` : 'Série lancée'),
          h('h2.end-title', h('span.hl-sweep', 'Session terminée')),
          h('p.end-sub', `${U.plural(done, 'carte')} révisée${done > 1 ? 's' : ''}. ${results.maitrise ? 'Ce que tu maîtrises reviendra plus tard ; ' : ''}ce qui est à revoir reviendra demain.`),
          dist,
          h('p.end-next', remaining ? `Encore ${U.plural(remaining, 'carte')} à réviser maintenant.` : next.tomorrow ? `Prochaine révision : demain · ${U.plural(next.tomorrow, 'carte')}.` : 'Rien d’autre à réviser pour l’instant.'),
          h('div.end-actions',
            ui.btn('Terminer', { variant: remaining ? 'outlined' : 'filled', onClick: () => R.app.go(exitHref) }),
            remaining ? ui.btn('Encore une série', { icon: 'play', variant: 'filled', onClick: () => R.app.go(location.hash.split('?')[0] + '?r=' + Date.now(), { replace: true }) }) : null));
        stage.appendChild(end);
        R.motion.stagger(Array.from(end.children));
        setTimeout(() => {
          const f = end.querySelector('.end-flame');
          if (!f) return;
          const r = f.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 22, spread: 110 });
        }, 350);
      }

      function empty() {
        const anyReviewable = S.dueCount(scope) > 0 || S.reviewQueue(scope, { all: true, limit: 1 }).length > 0;
        const next = S.nextDueInfo(scope.courseId ? { courseId: scope.courseId } : {});
        stage.appendChild(ui.emptyState(anyReviewable ? {
          icon: 'check', title: 'Tout est à jour',
          text: next.tomorrow ? `Prochaine révision : demain · ${U.plural(next.tomorrow, 'carte')}. Tu peux aussi réviser quand même.` : 'Rien n’est dû aujourd’hui. Tu peux réviser quand même pour t’entraîner.',
          action: h('div.end-actions',
            ui.btn('Retour', { variant: 'outlined', onClick: () => R.app.go(exitHref) }),
            ui.btn('Réviser quand même', { icon: 'cards', variant: 'filled', onClick: () => R.app.go(location.hash.split('?')[0] + '?all=1', { replace: true }) })),
        } : {
          icon: 'cards', title: 'Pas encore de cartes de révision',
          text: 'Chaque nœud qui a une note ou des éléments rattachés devient une question. Décompose une notion pour commencer.',
          action: ui.btn('Retour', { variant: 'filled', onClick: () => R.app.go(exitHref) }),
        }));
        counter.textContent = '';
      }

      return { unmount() { document.removeEventListener('keydown', onKey); } };
    },
  };
})(window.R);
