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
      const scopeMap = scope.mapId && S.map(scope.mapId);
      const scopeNode = scopeMap && scope.nodeId && S.node(scopeMap, scope.nodeId);
      const scopeName = scopeNode ? [S.kickerOf(scopeMap, scopeNode), scopeNode.title].filter(Boolean).join(' · ')
        : scope.mapId ? (scopeMap || {}).title : scope.courseId ? (S.course(scope.courseId) || {}).title : 'Tous les cours';
      const exitHref = scopeNode ? `#/carte/${scope.mapId}?n=${scope.nodeId}` : scope.mapId ? '#/carte/' + scope.mapId : scope.courseId ? '#/cours/' + scope.courseId : '#/';

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
        // value change : la barre avance en transform (scaleX), 360 ms ease-out
        bar.querySelector('.progress-bar').style.setProperty('--p', String(done / total));
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
        const nums = S.structNumbers(map);

        const prompt = kids.length
          ? (node.logic ? `${T.prompt} — ${kids.length} éléments ${node.logic === 'et' ? 'cumulatifs' : 'alternatifs'} à retrouver` : `${T.prompt} — ${kids.length} élément${kids.length > 1 ? 's' : ''} à retrouver`)
          : T.prompt;

        const answer = h('div.answer', { 'aria-live': 'polite' },
          h('div.answer-inner',
            kids.length ? h('div.answer-block',
              h('p.overline', node.logic === 'et' ? 'Éléments cumulatifs (ET)' : node.logic === 'ou' ? 'Éléments alternatifs (OU)' : 'Décomposition'),
              h('ol.answer-list', kids.map((c) => h('li',
                node.logic ? h('span.decomp-logic', node.logic === 'et' ? 'ET' : 'OU') : null,
                S.TYPES[c.type].kicker ? h('span.decomp-kicker', S.kickerOf(map, c, nums)) : null,
                h('span', c.title || 'Sans titre'))))) : null,
            node.note.trim() ? h('div.answer-block', h('p.overline', 'Note'), h('div.md.answer-note', { html: R.md.render(node.note) })) : null,
            h('a.answer-open', { href: `#/carte/${map.id}?n=${node.id}` }, R.icon('map', 16), 'Ouvrir dans la carte')));

        const card = h('article.rcard', { class: dir < 0 ? 'from-left' : 'from-right' },
          h('div.rcard-ctx', [course ? course.title : null, map.title].filter(Boolean).join(' › ')),
          anc.length && !(anc.length === 1 && U.norm(anc[0].title) === U.norm(map.title)) ? h('div.rcard-path', anc.map((a, i) => [i ? ' › ' : '', a.title])) : null,
          h('div.rcard-kicker', S.isStruct(node.type) ? S.kickerOf(map, node, nums) : T.label),
          h('h2.rcard-title', node.title),
          h('p.rcard-prompt', prompt),
          answer,
          h('span.rate-stamp.left', { 'aria-hidden': 'true' }, 'À revoir'),
          h('span.rate-stamp.right', { 'aria-hidden': 'true' }, 'Maîtrisé'));

        if (cardEl) {
          const old = cardEl;
          old.classList.add('leaving');
          setTimeout(() => old.remove(), 260);
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
          // les notes arrivent après la réponse (overlap), en cascade courte : 30 ms
          R.motion.stagger(Array.from(actions.querySelectorAll('.rate-btn')), 0, { step: 30 });
        }
      }

      /* Révéler : feedback immédiat (pas d'anticipation, action répétée à chaque carte).
         La réponse se déplie (280 ms) puis son contenu suit en cascade (40 ms). */
      function reveal() {
        if (revealed || busy) return;
        revealed = true;
        cardEl.classList.add('revealed');
        paintActions();
      }

      function rate(rating, fling) {
        if (!revealed || busy) return;
        const cur = current();
        if (!cur) return;
        busy = true;
        S.rate(cur.map, cur.node, rating);
        results[rating]++;
        if (rating === 'maitrise') {
          // action secondaire discrète : vue à chaque carte maîtrisée, donc petite
          const r = cardEl.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + 40, { count: 8, spread: 48 });
        }
        if (rating === 'revoir' && !requeued.has(cur.node.id)) {
          requeued.add(cur.node.id);
          queue.push({ ...queue[idx] });
          total++;
        }
        if (fling && cardEl.animate && !motion.reduced()) {
          // la carte lancée garde sa vitesse : on prolonge le geste plutôt que de rejouer une sortie
          const dir = Math.sign(fling.dx) || 1;
          const dist = window.innerWidth * 0.9;
          const ms = U.clamp((dist - Math.abs(fling.dx)) / Math.max(1.2, Math.abs(fling.v)), 120, 220);
          cardEl.classList.add('leaving');
          cardEl.animate([
            { transform: `translateX(${fling.dx}px) rotate(${fling.dx / 24}deg)`, opacity: 1 },
            { transform: `translateX(${dir * dist}px) translateY(20px) rotate(${dir * 10}deg)`, opacity: 0 },
          ], { duration: ms, easing: motion.css.in, fill: 'forwards' });
        } else {
          cardEl.classList.add(rating === 'revoir' ? 'out-left' : rating === 'maitrise' ? 'out-right' : 'out-up');
        }
        done++;
        idx++;
        // chevauchement : la carte suivante entre quand la précédente est à mi-sortie
        setTimeout(() => {
          busy = false;
          if (idx >= queue.length) finish();
          else showCard(1);
        }, motion.reduced() ? 0 : 120);
      }

      /* Glisser pour noter (manipulation directe) :
         suivi 1:1 + rotation en arc ; les tampons « À revoir » / « Maîtrisé » apparaissent
         avec la distance (parenting) ; au relâchement, un geste rapide suffit (vélocité),
         sinon la carte revient en ressort, en conservant l'élan. */
      function swipe(card) {
        let sx = 0, sy = 0, active = false, dx = 0, armed = 0, back = null;
        const vt = motion.velocity();
        const stampL = card.querySelector('.rate-stamp.left');
        const stampR = card.querySelector('.rate-stamp.right');
        const paint = (x) => {
          card.style.transform = `translateX(${x}px) rotate(${x / 24}deg)`;
          stampL.style.opacity = String(U.clamp((-x - 24) / 80, 0, 1));
          stampR.style.opacity = String(U.clamp((x - 24) / 80, 0, 1));
        };
        card.addEventListener('pointerdown', (e) => {
          if (!revealed || busy || e.pointerType === 'mouse' || e.target.closest('a, button')) return;
          if (back) { back(); back = null; }
          active = true; sx = e.clientX - dx; sy = e.clientY;
          vt.reset(); vt.add(e.clientX, 0);
          card.classList.add('dragging');
          card.style.animation = 'none';
          card.setPointerCapture(e.pointerId);
        });
        card.addEventListener('pointermove', (e) => {
          if (!active) return;
          const ndx = e.clientX - sx;
          if (Math.abs(e.clientY - sy) > Math.abs(ndx) * 1.5 && Math.abs(ndx) < 20) return;
          dx = ndx;
          vt.add(e.clientX, 0);
          paint(dx);
          const now = Math.abs(dx) > 110 ? Math.sign(dx) : 0;
          if (now && now !== armed) motion.haptic(8); // seuil franchi
          armed = now;
        });
        const end = () => {
          if (!active) return;
          active = false;
          card.classList.remove('dragging');
          const v = vt.get().x;
          const goes = Math.abs(dx) > 110 || (Math.abs(v) > 0.6 && Math.abs(dx) > 30 && Math.sign(v) === Math.sign(dx));
          if (goes) { const x = dx; dx = 0; rate(x > 0 ? 'maitrise' : 'revoir', { dx: x, v }); return; }
          back = motion.spring({
            from: dx, to: 0, velocity: v, ...motion.springs.snappy,
            onUpdate: (x) => { dx = x; paint(x); },
            onDone: () => { back = null; dx = 0; card.style.transform = ''; stampL.style.opacity = '0'; stampR.style.opacity = '0'; },
          });
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

      /* Fin de session — le seul moment vraiment expressif (pic-fin) :
         chorégraphie en 4 temps, ≈ 1 s, jamais bloquante.
         1) la flamme surgit (ease-pop) et sa série défile  2) le titre est surligné
         3) le bilan arrive, chaque barre grandit en décalé  4) les actions. */
      function finish() {
        document.removeEventListener('keydown', onKey);
        bar.querySelector('.progress-bar').style.setProperty('--p', '1');
        counter.textContent = `${total} / ${total}`;
        U.clear(actions);
        if (cardEl) { cardEl.classList.add('leaving'); const c = cardEl; setTimeout(() => c.remove(), 260); }
        const streak = S.streak();
        const next = S.nextDueInfo(scope.courseId ? { courseId: scope.courseId } : {});
        const remaining = S.dueCount(scope);
        const sum = results.revoir + results.compris + results.maitrise || 1;
        const counts = [];
        const dist = h('div.dist',
          ['maitrise', 'compris', 'revoir'].map((k, i) => {
            const n = h('span.dist-n', '0');
            counts.push([n, results[k], i]);
            return h('div.dist-row',
              ui.mastery(k, 14),
              h('span.dist-l', S.RATINGS[k].label),
              h('span.dist-bar', h('span', { style: { '--w': String(results[k] / sum), '--i': i } })),
              n);
          }));
        const streakEl = h('span.end-streak', String(streak));
        const doneEl = h('b', String(done));
        const end = h('section.review-end.intro',
          h('div.end-flame', { class: streak ? 'lit' : '' }, R.icon('flame', 40), streakEl),
          h('p.overline', streak > 1 ? `${streak} jours de suite` : 'Série lancée'),
          h('h2.end-title', h('span.hl-sweep', 'Session terminée')),
          h('p.end-sub', doneEl, ` ${done > 1 ? 'cartes révisées' : 'carte révisée'}. ${results.maitrise ? 'Ce que tu maîtrises reviendra plus tard ; ' : ''}ce qui est à revoir reviendra demain.`),
          dist,
          h('p.end-next', remaining ? `Encore ${U.plural(remaining, 'carte')} à réviser maintenant.` : next.tomorrow ? `Prochaine révision : demain · ${U.plural(next.tomorrow, 'carte')}.` : 'Rien d’autre à réviser pour l’instant.'),
          h('div.end-actions',
            ui.btn('Terminer', { variant: remaining ? 'outlined' : 'filled', onClick: () => R.app.go(exitHref) }),
            remaining ? ui.btn('Encore une série', { icon: 'play', variant: 'filled', onClick: () => R.app.go(location.hash.split('?')[0] + '?r=' + Date.now(), { replace: true }) }) : null));
        stage.appendChild(end);
        // la flamme a sa propre entrée (flame-pop) ; le reste suit en cascade de 70 ms
        R.motion.stagger(Array.from(end.children).slice(1), 1, { step: 70, max: 8 });
        motion.countUp(streakEl, streak, { from: Math.max(0, streak - 1), duration: 600 });
        motion.countUp(doneEl, done, { duration: 700 });
        counts.forEach(([el, n, i]) => setTimeout(() => motion.countUp(el, n, { duration: 560 }), motion.reduced() ? 0 : 360 + i * 60));
        setTimeout(() => {
          const f = end.querySelector('.end-flame');
          if (!f || !f.isConnected) return;
          const r = f.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, spread: 96 });
          motion.haptic(14);
        }, 260);
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
