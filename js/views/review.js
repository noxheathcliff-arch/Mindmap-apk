/* Ratio — Révision : rappel actif + répétition espacée (Leitner)
   Hooked : déclencheur (Aujourd'hui / Réviser) → action (1 tap) → récompense variable → investissement.

   La session est un paquet de fiches : la fiche du dessus porte la teinte et l'empreinte de son
   cours ; dessous, l'épaisseur du paquet dit ce qu'il reste. Trois temps par fiche :
   se rappeler (indice possible : la structure de la réponse, sans la réponse) → vérifier → noter.
   Une note se reprend (Annuler / Z) : la fiche revient du côté où elle était partie. */
(function (R) {
  'use strict';
  const { U, ui, store: S, motion } = R;
  const { h } = U;
  R.views = R.views || {};

  const KEYS = ['revoir', 'compris', 'maitrise'];

  function nextLabel(node, rating) {
    const b = node.review.box;
    if (rating === 'revoir') return 'demain';
    const box = rating === 'compris' ? Math.min(5, Math.max(1, b + 1)) : Math.min(5, Math.max(2, b + 2));
    const d = S.INTERVALS[box];
    return d === 1 ? 'demain' : `dans ${d} j`;
  }

  /** Indice : la forme de la réponse sans la réponse (nombre d'éléments, leur nature, l'initiale) */
  function hintFor(map, node) {
    const kids = S.childrenOf(map, node.id);
    const nums = S.structNumbers(map);
    if (kids.length) {
      return h('ol.hint-list', kids.map((c) => {
        const t = (c.title || '').trim();
        return h('li',
          S.TYPES[c.type].kicker ? h('span.decomp-kicker', S.kickerOf(map, c, nums)) : null,
          h('span.hint-mask', t ? t[0] + '…' : '…'));
      }));
    }
    const plain = R.md.plain(node.note).trim();
    if (!plain) return null;
    const words = plain.split(/\s+/);
    return h('p.hint-text', words.slice(0, Math.min(4, Math.max(2, Math.floor(words.length / 5)))).join(' ') + ' …');
  }

  /** État de la fiche dans la boîte de Leitner : nouvelle, ou vue il y a…, avec sa boîte (1–5) */
  function cardState(node) {
    const r = node.review;
    if (!r.last) return h('span.rcard-state.is-new', 'Nouvelle');
    return h('span.rcard-state', { title: `Boîte ${r.box} sur 5` },
      h('span', 'Vue ' + U.relTime(r.last)),
      h('span.box-pips', { 'aria-label': `Boîte ${r.box} sur 5` }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= r.box ? 'on' : '' }))));
  }

  R.views.review = {
    mount(el, route) {
      const scope = route.scope || {};
      const q = route.q || {};
      const all = q.all === '1';
      const scopeMap = scope.mapId && S.map(scope.mapId);
      const scopeNode = scopeMap && scope.nodeId && S.node(scopeMap, scope.nodeId);
      const scopeName = scopeNode ? [S.kickerOf(scopeMap, scopeNode), scopeNode.title].filter(Boolean).join(' · ')
        : scope.mapId ? (scopeMap || {}).title : scope.courseId ? (S.course(scope.courseId) || {}).title : 'Tous les cours';
      // base de l'URL de la session (l'ancien lien #/reviser?all=1 désigne la session tous cours)
      const sessionBase = () => { const b = location.hash.split('?')[0]; return /^#\/reviser\/?$/.test(b) ? '#/reviser/tout' : b; };
      const exitHref = scopeNode ? `#/carte/${scope.mapId}?n=${scope.nodeId}` : scope.mapId ? '#/carte/' + scope.mapId : scope.courseId ? '#/cours/' + scope.courseId : '#/reviser';

      // taille de session : celle de l'URL (depuis Réviser), sinon le réglage mémorisé (0 = toutes)
      const size = q.n != null && q.n !== '' ? +q.n : S.data.settings.sessionSize;
      const limit = size > 0 ? size : 1e9;
      // lancée depuis la fiche d'une carte de cours : la session commence par cette fiche
      const [startMap, startNode] = String(q.start || '').split('.');
      const first = startMap && startNode ? { mapId: startMap, nodeId: startNode } : null;
      const queue = S.reviewQueue(scope, { all, first, limit });
      const results = { revoir: 0, compris: 0, maitrise: 0 };
      const requeued = new Set();
      const history = []; // notes de la session, pour Annuler
      const missed = new Map(); // fiches notées « À revoir » (fin de session)
      let idx = 0, revealed = false, hinted = false, done = 0, busy = false, ended = false;

      const counter = h('span.review-count');
      const undoBtn = ui.iconBtn('undo', { title: 'Annuler la dernière note', onClick: () => undo() });
      undoBtn.dataset.kbd = 'Z';
      undoBtn.disabled = true;
      const bar = ui.progress(0, { label: 'Progression de la session' });
      const topbar = h('header.topbar.review-top',
        ui.iconBtn('close', { title: 'Terminer la session', onClick: () => R.app.go(exitHref) }),
        h('div.topbar-title', h('span.review-scope', 'Révision'), h('span.review-scope-name', scopeName || '')),
        h('div.topbar-actions', undoBtn, counter));
      const deck = h('div.rdeck');
      const actions = h('div.review-actions');
      const stage = h('div.review-stage', deck, actions);
      const page = h('div.page.page-review', topbar, h('div.review-progress', bar), stage);
      el.appendChild(page);

      if (!queue.length) { empty(); return { unmount() {} }; }

      let total = queue.length;
      let cardEl = null;
      showCard('stack');
      document.addEventListener('keydown', onKey);

      function current() {
        const it = queue[idx];
        if (!it) return null;
        const map = S.map(it.mapId);
        const node = map && S.node(map, it.nodeId);
        return map && node ? { map, node } : null;
      }

      function updateProgress() {
        const txt = `${Math.min(done + 1, total)} / ${total}`;
        if (counter.textContent && counter.textContent !== txt && !motion.reduced()) {
          // value change : le compteur « tique » (4 px, 160 ms) quand il change
          counter.classList.remove('tick'); void counter.offsetWidth; counter.classList.add('tick');
        }
        counter.textContent = txt;
        // value change : la barre avance en transform (scaleX), 360 ms ease-out
        bar.querySelector('.progress-bar').style.setProperty('--p', String(done / total));
        undoBtn.disabled = !history.length;
      }

      /** L'épaisseur du paquet : 0, 1 ou 2 feuilles sous la fiche, selon ce qu'il reste */
      function paintStack() {
        const left = total - done - 1;
        const want = left >= 2 ? 2 : left;
        // u1 juste sous la fiche, u2 au fond (avant dans le DOM = peint dessous) ; on retire par le fond
        for (const i of [1, 2]) {
          const u = deck.querySelector(`.rdeck-under.u${i}:not(.gone)`);
          if (i <= want && !u) deck.prepend(h('div.rdeck-under', { class: 'u' + i, 'aria-hidden': 'true' }));
          if (i > want && u) { u.classList.add('gone'); setTimeout(() => u.remove(), 240); }
        }
      }

      /**
       * enter : 'stack' (la fiche monte du paquet) | 'left' | 'right' | 'up' (retour après Annuler,
       * du côté où elle était partie) ; reveal : la réponse est déjà visible (Annuler).
       */
      function showCard(enter, { reveal: open = false } = {}) {
        let cur = current();
        while (!cur && idx < queue.length) { idx++; cur = current(); }
        if (!cur) { finish(); return; }
        revealed = open;
        hinted = false;
        updateProgress();
        const { map, node } = cur;
        const T = S.TYPES[node.type];
        const kids = S.childrenOf(map, node.id);
        const anc = S.ancestors(map, node.id);
        const course = S.course(map.courseId);
        const nums = S.structNumbers(map);
        const prompt = S.promptFor(map, node);
        // première fiche venue d'une carte de cours : elle « devient » la carte de révision
        // (élément partagé, View Transitions) — pas d'entrée propre qui doublerait le mouvement
        const shared = first && done === 0 && idx === 0 && node.id === first.nodeId && !history.length;

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

        // élément partagé : la ligne du cours (Réviser) ou l'en-tête du cours devient la bande de la
        // fiche ; le bloc « Commencer » devient la première fiche d'une session tous cours
        const band = h('header.rcard-band', { dataset: scope.courseId ? { hero: 'course:' + scope.courseId + ':band' } : {} },
          course ? (() => { const mk = R.courseArt.mark(course, { size: 'xs' }); if (scope.courseId) mk.dataset.hero = 'course:' + scope.courseId + ':mono'; return mk; })() : null,
          h('span.rcard-ctx', [course ? course.title : null, map.title].filter(Boolean).join(' › ')),
          cardState(node));
        // pendant une transition de page (View Transitions), la première fiche est portée par
        // l'élément partagé : pas d'entrée propre qui doublerait le mouvement
        const viaVT = done === 0 && !history.length && !!document.documentElement.dataset.vt;
        const enterCls = shared || viaVT ? '' : open ? 'enter-' + enter : enter === 'stack' ? 'from-stack' : 'enter-' + enter;
        const hero = shared ? `fiche:${node.id}:card` : !scope.courseId && !scope.mapId && done === 0 && !history.length ? 'session:all:card' : null;
        const card = h('article.rcard', { class: enterCls + (open ? ' revealed' : ''), dataset: hero ? { hero } : {} },
          band,
          h('div.rcard-body',
            anc.length && !(anc.length === 1 && U.norm(anc[0].title) === U.norm(map.title)) ? h('div.rcard-path', anc.map((a, i) => [i ? ' › ' : '', a.title])) : null,
            h('div.rcard-kicker', S.isStruct(node.type) ? S.kickerOf(map, node, nums) : T.label),
            h('h2.rcard-title', shared ? h('span', { dataset: { hero: `fiche:${node.id}:q` } }, node.title) : node.title),
            h('p.rcard-prompt', prompt),
            h('div.rcard-hint', { hidden: true }),
            answer),
          h('span.rate-stamp.left', { 'aria-hidden': 'true' }, 'À revoir'),
          h('span.rate-stamp.mid', { 'aria-hidden': 'true' }, 'Compris'),
          h('span.rate-stamp.right', { 'aria-hidden': 'true' }, 'Maîtrisé'));
        if (course) R.courseArt.tint(card, course);

        if (cardEl) {
          const old = cardEl;
          if (!old.classList.contains('leaving')) old.classList.add('leaving');
          setTimeout(() => old.remove(), 260);
        }
        cardEl = card;
        deck.appendChild(card);
        paintStack();
        swipe(card);
        paintActions();
        stage.scrollTop = 0;
      }

      /* Actions : l'ancien jeu sort (100 ms, ease-in, −4 px), le nouveau entre avec 50 % de
         chevauchement (rise 240 ms) — jamais deux jeux lisibles en même temps. */
      function paintActions() {
        const old = [...actions.children].filter((x) => !x.classList.contains('leaving'));
        old.forEach((x) => { x.classList.add('leaving'); setTimeout(() => x.remove(), motion.reduced() ? 0 : 110); });
        const set = h('div.act-set', { class: old.length && !revealed ? 'enter' : '' }); // les notes ont leur propre cascade
        actions.appendChild(set);
        const cur = current();
        if (!cur) return;
        const put = (x) => set.appendChild(x);
        if (!revealed) {
          const b = ui.btn('Afficher la réponse', { variant: 'filled', cls: 'reveal-btn', onClick: reveal });
          b.appendChild(h('kbd.btn-kbd', 'Espace'));
          const canHint = !hinted && (S.childrenOf(cur.map, cur.node.id).length || cur.node.note.trim());
          put(h('div.reveal-row',
            canHint ? (() => { const x = ui.btn('Indice', { icon: 'sparkle', variant: 'text', cls: 'hint-btn', onClick: hint }); x.appendChild(h('kbd.btn-kbd', 'H')); return x; })() : null,
            b));
          put(h('p.review-hint', hinted ? 'Avec l’indice, essaie de retrouver le reste avant de vérifier.' : 'Formule ta réponse dans ta tête (ou à voix haute) avant de la découvrir.'));
          setTimeout(() => b.focus({ preventScroll: true }), 50);
        } else {
          const mk = (rating, variant, key) => h('button.rate-btn', { type: 'button', class: 'rate-' + rating + ' btn-' + variant, onclick: () => rate(rating) },
            ui.mastery(rating, 14),
            h('span.rate-l', S.RATINGS[rating].label),
            h('span.rate-next', nextLabel(cur.node, rating)),
            h('kbd.rate-kbd', key));
          put(h('div.rate-row', mk('revoir', 'outlined', '1'), mk('compris', 'tonal', '2'), mk('maitrise', 'filled', '3')));
          put(h('p.review-hint.only-touch', 'Astuce : glisse la fiche ← à revoir · → maîtrisé'));
          // les notes arrivent après la réponse (overlap), en cascade courte : 30 ms
          R.motion.stagger(Array.from(set.querySelectorAll('.rate-btn')), 0, { step: 30 });
        }
      }

      /* Indice : la structure apparaît sous la consigne (fondu + 4 px, 200 ms) */
      function hint() {
        if (revealed || hinted || busy) return;
        const cur = current();
        const content = cur && hintFor(cur.map, cur.node);
        if (!content) return;
        hinted = true;
        const slot = cardEl.querySelector('.rcard-hint');
        U.clear(slot);
        slot.append(h('p.overline', 'Indice'), content);
        slot.hidden = false;
        paintActions();
      }

      /* Révéler : feedback immédiat (pas d'anticipation, action répétée à chaque carte).
         La réponse se déplie (280 ms) puis son contenu suit en cascade (40 ms). */
      function reveal() {
        if (revealed || busy) return;
        revealed = true;
        cardEl.classList.add('revealed');
        paintActions();
        // petit écran : si la réponse commence sous la ligne de flottaison, on l'y amène
        // (défilement doux, après le dépliage — l'œil suit la réponse, pas un saut)
        setTimeout(() => {
          const a = cardEl && cardEl.querySelector('.answer');
          if (!a || !a.isConnected) return;
          const top = a.getBoundingClientRect().top - stage.getBoundingClientRect().top;
          if (top > stage.clientHeight * 0.55) stage.scrollTo({ top: stage.scrollTop + top - 96, behavior: motion.reduced() ? 'auto' : 'smooth' });
        }, motion.reduced() ? 0 : 200);
      }

      function rate(rating, fling) {
        if (!revealed || busy) return;
        const cur = current();
        if (!cur) return;
        busy = true;
        const entry = { qIdx: idx, before: { ...cur.node.review }, day: U.dayKey(), rating, requeued: false, mapId: cur.map.id, nodeId: cur.node.id };
        S.rate(cur.map, cur.node, rating);
        results[rating]++;
        if (rating === 'revoir') missed.set(cur.node.id, cur); else missed.delete(cur.node.id);
        if (rating === 'maitrise') {
          // action secondaire discrète : vue à chaque carte maîtrisée, donc petite
          const r = cardEl.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + 40, { count: 8, spread: 48 });
        }
        if (rating === 'revoir' && !requeued.has(cur.node.id)) {
          requeued.add(cur.node.id);
          queue.push({ ...queue[idx] });
          total++;
          entry.requeued = true;
        }
        history.push(entry);
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
          // le tampon de la note frappe la fiche (scale 1.5 → 1, 140 ms), puis elle part dans sa direction
          const stamp = cardEl.querySelector(rating === 'revoir' ? '.rate-stamp.left' : rating === 'maitrise' ? '.rate-stamp.right' : '.rate-stamp.mid');
          const leave = cardEl;
          const out = rating === 'revoir' ? 'out-left' : rating === 'maitrise' ? 'out-right' : 'out-up';
          if (motion.reduced()) leave.classList.add('leaving', out);
          else {
            stamp.classList.add('slam');
            leave.classList.add('stamped');
            setTimeout(() => leave.classList.add('leaving', out), 140);
          }
        }
        done++;
        idx++;
        // chevauchement : la fiche suivante monte du paquet quand la précédente est à mi-sortie
        setTimeout(() => {
          busy = false;
          if (idx >= queue.length) finish();
          else showCard('stack');
        }, motion.reduced() ? 0 : fling ? 120 : 260);
      }

      /* Annuler la dernière note : l'état de la fiche, le journal du jour et la file reviennent
         en arrière ; la fiche revient du côté où elle était partie, réponse ouverte. */
      function undo() {
        if (busy || !history.length) return;
        const last = history.pop();
        const map = S.map(last.mapId);
        const node = map && S.node(map, last.nodeId);
        if (!node) { updateProgress(); return; }
        S.unrate(map, node, last.before, last.day);
        results[last.rating]--;
        missed.delete(node.id);
        if (last.requeued) { queue.pop(); total--; requeued.delete(node.id); }
        done--;
        idx = last.qIdx;
        if (ended) {
          ended = false;
          const end = deck.querySelector('.review-end');
          if (end) end.remove();
          stage.classList.remove('is-end');
          document.addEventListener('keydown', onKey);
        } else if (cardEl) {
          cardEl.classList.add('leaving', 'out-down');
        }
        showCard(last.rating === 'revoir' ? 'left' : last.rating === 'maitrise' ? 'right' : 'up', { reveal: true });
        ui.snack('Note annulée', { duration: 1400 });
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
        const k = e.key.toLowerCase();
        if (e.key === 'Escape') { R.app.go(exitHref); return; }
        if ((k === 'z' && !e.altKey) || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!revealed && k === 'h') { e.preventDefault(); hint(); return; }
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); return; }
        if (revealed && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); rate(KEYS[+e.key - 1]); }
      }
      // Annuler reste disponible sur l'écran de fin (Z)
      function onEndKey(e) {
        if (U.isTyping() || U.$('.dialog') || U.$('.search')) return;
        if (e.key === 'Escape') { R.app.go(exitHref); return; }
        if ((e.key.toLowerCase() === 'z' && !e.altKey) || e.key === 'Backspace') { e.preventDefault(); undo(); }
      }

      /* Fin de session — le seul moment vraiment expressif (pic-fin) :
         chorégraphie en 4 temps, ≈ 1 s, jamais bloquante.
         1) la flamme surgit (ease-pop) et sa série défile  2) le titre est surligné
         3) le bilan arrive, chaque barre grandit en décalé  4) ce qui est à retravailler, les actions. */
      function finish() {
        ended = true;
        document.removeEventListener('keydown', onKey);
        bar.querySelector('.progress-bar').style.setProperty('--p', '1');
        counter.textContent = `${total} / ${total}`;
        undoBtn.disabled = !history.length;
        U.clear(actions);
        U.$$('.rdeck-under', deck).forEach((u) => u.remove());
        if (cardEl) { if (!cardEl.classList.contains('leaving')) cardEl.classList.add('leaving'); const c = cardEl; setTimeout(() => c.remove(), 260); cardEl = null; }
        stage.classList.add('is-end');
        const streak = S.streak();
        const fc = S.forecast(2, scope.courseId ? { courseId: scope.courseId } : {});
        const remaining = S.dueCount(scope);
        const sum = results.revoir + results.compris + results.maitrise || 1;
        const counts = [];
        /* Relevé de session : un ticket perforé, points de conduite, total, tampon de la série */
        const totalEl = h('b.rc-n', '0');
        const dist = h('div.receipt', { role: 'group', 'aria-label': 'Relevé de session' },
          h('div.rc-head', h('span', 'Relevé de session'), h('span', new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))),
          ['maitrise', 'compris', 'revoir'].map((k, i) => {
            const n = h('span.rc-n', '0');
            counts.push([n, results[k], i]);
            return h('div.rc-row', ui.mastery(k, 14), h('span.rc-l', S.RATINGS[k].label), h('span.rc-dots'),
              h('span.rc-bar', h('span', { style: { '--w': String(results[k] / sum), '--i': i } })), n);
          }),
          h('div.rc-total', h('span', 'Total'), h('span.rc-dots'), totalEl),
          h('span.rc-stamp', streak > 1 ? `Série · ${streak} j` : 'Validée'));
        counts.push([totalEl, done, 3]);
        const weak = [...missed.values()].filter(({ node }) => node.review.rating === 'revoir');
        const streakEl = h('span.end-streak', String(streak));
        const doneEl = h('b', String(done));
        const end = h('section.review-end.intro',
          h('div.end-flame', { class: streak ? 'lit' : '' }, R.icon('flame', 40), streakEl),
          h('p.overline', streak > 1 ? `${streak} jours de suite` : 'Série lancée'),
          h('h2.end-title', h('span.hl-sweep', 'Session terminée')),
          h('p.end-sub', doneEl, ` ${done > 1 ? 'cartes révisées' : 'carte révisée'}. ${results.maitrise ? 'Ce que tu maîtrises reviendra plus tard ; ' : ''}ce qui est à revoir reviendra demain.`),
          dist,
          weak.length ? h('div.end-weak',
            h('p.overline', 'À retravailler'),
            h('div.end-weak-list', weak.slice(0, 5).map(({ map, node }) => h('a.end-weak-row', { href: `#/carte/${map.id}?n=${node.id}` },
              ui.mastery('revoir', 14), h('span', node.title), R.icon('chevronRight', 16))))) : null,
          h('p.end-next', remaining ? `Encore ${U.plural(remaining, 'carte')} à réviser maintenant.` : fc[1].n ? `Demain : ${U.plural(fc[1].n, 'carte')}.` : 'Rien d’autre à réviser pour l’instant.'),
          h('div.end-actions',
            ui.btn('Terminer', { variant: remaining ? 'outlined' : 'filled', onClick: () => R.app.go(exitHref) }),
            remaining ? ui.btn('Encore une série', { icon: 'play', variant: 'filled', onClick: () => R.app.go(sessionBase() + '?n=' + (q.n != null ? q.n : S.data.settings.sessionSize) + '&r=' + Date.now(), { replace: true }) }) : null));
        deck.appendChild(end);
        document.removeEventListener('keydown', onEndKey);
        document.addEventListener('keydown', onEndKey);
        // la flamme a sa propre entrée (flame-pop) ; le reste suit en cascade de 70 ms
        R.motion.stagger(Array.from(end.children).slice(1), 1, { step: 70, max: 8 });
        motion.countUp(streakEl, streak, { from: Math.max(0, streak - 1), duration: 600 });
        motion.countUp(doneEl, done, { duration: 700 });
        counts.forEach(([n, v, i]) => setTimeout(() => motion.countUp(n, v, { duration: 560 }), motion.reduced() ? 0 : 360 + i * 60));
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
        const fc = S.forecast(2, scope.courseId ? { courseId: scope.courseId } : {});
        undoBtn.hidden = true;
        deck.appendChild(ui.emptyState(anyReviewable ? {
          icon: 'check', title: 'Tout est à jour',
          text: fc[1].n ? `Prochaine révision : demain · ${U.plural(fc[1].n, 'carte')}. Tu peux aussi réviser quand même.` : 'Rien n’est dû aujourd’hui. Tu peux réviser quand même pour t’entraîner.',
          action: h('div.end-actions',
            ui.btn('Retour', { variant: 'outlined', onClick: () => R.app.go(exitHref) }),
            ui.btn('Réviser quand même', { icon: 'cards', variant: 'filled', onClick: () => R.app.go(sessionBase() + '?all=1', { replace: true }) })),
        } : {
          icon: 'cards', title: 'Pas encore de cartes de révision',
          text: 'Chaque nœud qui a une note ou des éléments rattachés devient une question. Décompose une notion pour commencer.',
          action: ui.btn('Retour', { variant: 'filled', onClick: () => R.app.go(exitHref) }),
        }));
        counter.textContent = '';
      }

      return { unmount() { document.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onEndKey); } };
    },
  };
})(window.R);
