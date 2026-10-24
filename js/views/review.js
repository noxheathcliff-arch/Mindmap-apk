/* Pioneer — Révision : rappel actif + répétition espacée (Leitner)
   Hooked : déclencheur (Aujourd'hui / Réviser) → action (1 tap) → récompense variable → investissement.

   La session est un carnet d'exercices (js/carnet.js) : il s'ouvre, chaque question s'écrit
   à la main sur sa page, la correction arrive au stylo rouge, la page se tourne ; une question
   ratée reçoit un marque-page. À la fin, le carnet se ferme, rétrécit et porte le score.
   Une note se reprend (Annuler / Z) : la page revient, réponse ouverte.

   Une carte qui a des exercices se révise par eux (store.reviewItems) :
   - question-réponse : comme une fiche — on se rappelle, on vérifie, on dit si on avait trouvé ;
   - QCM et vrai ou faux : on entoure (ou coche) au stylo bleu, la correction est immédiate et la
     note en découle (store.gradeFor) — juste deux fois de suite = maîtrisé, faux = à revoir. */
(function (R) {
  'use strict';
  const { U, ui, store: S, motion } = R;
  const { h } = U;
  R.views = R.views || {};

  const KEYS = ['revoir', 'compris', 'maitrise'];

  const LETTERS = 'ABCDEFGH';
  const isAuto = (it) => !!(it && it.ex && it.ex.kind !== 'qa');
  const isMulti = (ex) => Array.isArray(ex.answer);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  function nextLabel(review, rating, back) {
    const b = review.box;
    const box = rating === 'compris' ? Math.min(5, Math.max(1, b + 1)) : Math.min(5, Math.max(2, b + 2));
    const d = rating === 'revoir' ? 1 : S.INTERVALS[box];
    const when = d === 1 ? 'demain' : d >= 28 ? 'dans 1 mois' : d % 7 === 0 ? `dans ${d / 7} sem.` : `dans ${d} j`;
    return back ? 'revient ' + when : when;
  }

  /* Noter : le vocabulaire du rappel (ce qui s'est passé dans ta tête), pas celui du niveau */
  const WORDS = {
    card: { revoir: 'Oublié', compris: 'Retrouvé', maitrise: 'Évident' },
    ex: { revoir: 'Raté', compris: 'Réussi', maitrise: 'Facile' },
  };
  /* Icônes dessinées au trait (24 × 24, trait 2) : la boucle qui ramène · la clé qui ouvre · l'éclat */
  const RATE_ICONS = {
    revoir: ['M4.5 9.5A8 8 0 1 1 4 14', 'M4 4.5v5h5'],
    compris: ['M8.5 15.5a4.5 4.5 0 1 1 3.2-1.3L20 22', 'M16.5 18.5l2-2', 'M8.5 11.5h.01'],
    go: ['M5 12h13', 'M13 7l5 5-5 5'],
    maitrise: ['M12 2.5c.7 5 2.5 6.8 7.5 7.5-5 .7-6.8 2.5-7.5 7.5-.7-5-2.5-6.8-7.5-7.5 5-.7 6.8-2.5 7.5-7.5Z', 'M19 17v4', 'M17 19h4'],
  };
  function rateIcon(rating) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('rate-ic');
    RATE_ICONS[rating].forEach((d, i) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('pathLength', '1'); p.style.setProperty('--i', i);
      svg.append(p);
    });
    return svg;
  }

  /* La jauge de mémoire : on pousse la plume aussi loin que c'est revenu. Le curseur part à
     gauche ; trois crans (Oublié · Retrouvé · Évident), l'encre suit le doigt et prend la
     couleur du cran, un petit choc à chaque cran franchi. Lâcher sur un cran note ; lâcher
     avant le premier ramène la plume. Toucher un cran ou un mot y va directement. */
  function rateGauge(review, W, ask, onPick) {
    let L = 0, x = 0, k = 0, drag = null, done = false;
    const thumb = h('span.rg-thumb', rateIcon('go'));
    const stops = KEYS.map((r, i) => h('button.rg-stop', { type: 'button', class: 'rate-' + r, tabindex: -1, 'aria-hidden': 'true',
      style: { '--k': i + 1 }, onclick: () => !done && onPick(r) },
      h('span.rg-l', W[r]), h('span.rg-next', R.icon('clock', 12), nextLabel(review, r, false).replace(/^dans /, '')), h('kbd.rate-kbd', String(i + 1))));
    const track = h('div.rg-track',
      h('span.rg-hint', 'glisse : tu t’en souvenais ?'),
      h('span.rg-ink'),
      KEYS.map((r, i) => h('span.rg-notch', { style: { '--k': i + 1 } })),
      thumb);
    const el = h('div.rate-gauge', { role: 'slider', tabindex: 0, 'aria-label': ask, 'aria-valuemin': 0, 'aria-valuemax': 3, 'aria-valuenow': 0, 'aria-valuetext': 'pas encore noté' },
      h('div.rg-stops', stops), track);
    const measure = () => { L = track.clientWidth - thumb.offsetWidth - 2 * thumb.offsetLeft; return track.getBoundingClientRect(); };
    function set(nx, live) {
      x = Math.max(0, Math.min(L, nx));
      el.classList.toggle('is-drag', !!live);
      el.style.setProperty('--x', x + 'px');
      const nk = L ? Math.round(x / (L / 3)) : 0;
      if (nk === k) return;
      k = nk;
      const r = KEYS[k - 1];
      el.dataset.at = r || '';
      thumb.replaceChildren(rateIcon(r || 'go'));
      el.setAttribute('aria-valuenow', k);
      el.setAttribute('aria-valuetext', r ? `${W[r]}, ${nextLabel(review, r, true)}` : 'pas encore noté');
      if (live) R.motion.haptic(5);
    }
    const go = (nk) => { measure(); set(L * nk / 3, false); };
    track.addEventListener('pointerdown', (e) => {
      if (done || e.button > 0) return;
      const rc = measure(), x0 = rc.left + thumb.offsetLeft;
      const onThumb = thumb.contains(e.target);
      drag = { off: onThumb ? e.clientX - x0 - x : thumb.offsetWidth / 2, moved: false, onThumb };
      track.setPointerCapture(e.pointerId);
      if (!onThumb) set(e.clientX - x0 - drag.off, false);
      el.classList.add('is-hold');
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const x0 = track.getBoundingClientRect().left + thumb.offsetLeft;
      drag.moved = true;
      set(e.clientX - x0 - drag.off, true);
    });
    const release = (e, cancel) => {
      if (!drag) return;
      const d = drag; drag = null;
      el.classList.remove('is-hold');
      if (cancel || !k) {
        go(0);
        if (d.onThumb && !d.moved) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); }
        return;
      }
      onPick(KEYS[k - 1]);
    };
    track.addEventListener('pointerup', (e) => release(e, false));
    track.addEventListener('pointercancel', (e) => release(e, true));
    el.step = (dk) => { if (!done) go(Math.max(0, Math.min(3, k + dk))); };
    el.current = () => KEYS[k - 1];
    // le choix : la plume file au cran, s'y pose, l'encre s'allume, le reste s'efface
    el.pick = async (r) => {
      done = true;
      go(KEYS.indexOf(r) + 1);
      await wait(220);
      el.classList.add('picked');
      motion.haptic(r === 'revoir' ? [10, 40, 10] : r === 'compris' ? 10 : [6, 30, 14]);
      await wait(360);
    };
    requestAnimationFrame(() => { measure(); set(0, false); });
    return el;
  }

  /** Indice : la forme de la réponse sans la réponse (nombre d'éléments, leur nature, l'initiale) */
  function hintFor(map, node) {
    const kids = S.childrenOf(map, node.id);
    const nums = S.structNumbers(map);
    if (kids.length) {
      return kids.map((c) => {
        const t = (c.title || '').trim();
        return [S.TYPES[c.type].kicker ? S.kickerOf(map, c, nums) : null, t ? t[0] + '…' : '…'].filter(Boolean).join(' ');
      }).join(' · ');
    }
    const plain = R.md.plain(node.note).trim();
    if (!plain) return null;
    const words = plain.split(/\s+/);
    return words.slice(0, Math.min(4, Math.max(2, Math.floor(words.length / 5)))).join(' ') + ' …';
  }

  // une boîte tracée au feutre, pas tout à fait carrée
  const boxPath = () => { const j = () => (Math.random() - 0.5) * 1.4; return `M${2 + j()} ${3 + j()} L${22 + j()} ${2 + j()} L${22.5 + j()} ${22 + j()} L${2.5 + j()} ${22.5 + j()} Z`; };

  R.views.review = {
    mount(el, route) {
      const scope = route.scope || {};
      const q = route.q || {};
      const all = q.all === '1';
      const scopeMap = scope.mapId && S.map(scope.mapId);
      const scopeNode = scopeMap && scope.nodeId && S.node(scopeMap, scope.nodeId);
      const scopeFolder = scope.folderId && S.folder(scope.folderId);
      const scopeName = scopeNode ? [S.kickerOf(scopeMap, scopeNode), scopeNode.title].filter(Boolean).join(' · ')
        : scope.mapId ? (scopeMap || {}).title : scopeFolder ? [scopeFolder.label, scopeFolder.title].filter(Boolean).join(' · ') : scope.courseId ? (S.course(scope.courseId) || {}).title : 'Tous les cours';
      // base de l'URL de la session (l'ancien lien #/reviser?all=1 désigne la session tous cours)
      const sessionBase = () => { const b = location.hash.split('?')[0]; return /^#\/reviser\/?$/.test(b) ? '#/reviser/tout' : b; };
      const exitHref = scopeNode ? `#/carte/${scope.mapId}?n=${scope.nodeId}` : scope.mapId ? '#/carte/' + scope.mapId : scope.folderId ? '#/dossier/' + scope.folderId : scope.courseId ? '#/cours/' + scope.courseId : '#/reviser';

      // taille de session : celle de l'URL (depuis Réviser), sinon le réglage mémorisé (0 = toutes)
      const size = q.n != null && q.n !== '' ? +q.n : S.data.settings.sessionSize;
      const limit = size > 0 ? size : 1e9;
      // lancée depuis la fiche d'une carte de cours : la session commence par cette fiche
      // (start = carte.clé ; la clé d'un exercice contient « : », celle d'une fiche est l'id du nœud)
      const start = String(q.start || '');
      const dot = start.indexOf('.');
      const first = dot > 0 && dot < start.length - 1 ? { mapId: start.slice(0, dot), key: start.slice(dot + 1) } : null;
      const queue = S.reviewQueue(scope, { all, first, limit });
      const results = { revoir: 0, compris: 0, maitrise: 0 };
      const requeued = new Set();
      const history = []; // notes de la session, pour Annuler
      const missed = new Map(); // clé → { mapId, key } notés « À revoir » (fin de session)
      const score = { asked: 0, right: 0 }; // QCM et vrai ou faux : corrigés par l'app
      const noun = queue.some((x) => x.exId) ? 'question' : 'fiche';
      let idx = 0, hinted = false, done = 0, ended = false, dead = false, opened = false;
      let cur = null; // l'élément affiché (idx avance dès la note, la correction reste à l'écran)
      // busy : le stylo écrit · answer : à toi · rate : réponse ouverte, à noter · next : corrigé
      let state = 'busy', gen = 0, P = null, verdict = null, validateBtn = null, nb = null, sig = '';
      const alive = (g) => !dead && g === gen;

      const counter = h('span.review-count');
      const undoBtn = ui.iconBtn('undo', { title: 'Annuler la dernière note', onClick: () => undo() });
      undoBtn.dataset.kbd = 'Z';
      undoBtn.disabled = true;
      const bar = ui.progress(0, { label: 'Progression de la session' });
      const topbar = h('header.topbar.review-top',
        ui.iconBtn('close', { title: 'Terminer la session', onClick: () => R.app.go(exitHref) }),
        h('div.topbar-title', h('span.review-scope', 'Révision'), h('span.review-scope-name', scopeName || '')),
        h('div.topbar-actions', undoBtn, counter));
      const host = h('div.review-nb');
      const actions = h('div.review-actions');
      const stage = h('div.review-stage', host, actions);
      const page = h('div.page.page-review', topbar, h('div.review-progress', bar), stage);
      el.appendChild(page);

      if (!queue.length) { empty(); return { unmount() {} }; }

      let total = queue.length;
      const theme = new MutationObserver(() => nb && nb.setDark(isDark()));
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onScheme = () => nb && nb.setDark(isDark());
      mq.addEventListener('change', onScheme);
      let rz = 0;
      const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (nb && !ended) nb.layout(); }); };
      window.addEventListener('resize', onResize);

      mountBook();
      updateProgress();
      document.addEventListener('keydown', onKey);
      // l'écriture a besoin de ses polices : on les attend (un peu), sinon le texte « saute » en cours de route
      const fonts = document.fonts ? Promise.all([document.fonts.load('19px Kalam'), document.fonts.load('23px Caveat'), document.fonts.load('21px "Playwrite FR Moderne"')]).catch(() => {}) : null;
      Promise.race([fonts, wait(1500)]).then(() => { if (!dead) present('open'); });

      function mountBook() {
        host.replaceChildren();
        opened = false;
        nb = Carnet.mount(host, { kicker: 'Cahier de révision', title: scopeName || 'Révision', subtitle: U.plural(total, noun), count: total, reserve: 250, dark: isDark() });
      }

      function current() {
        const it = queue[idx];
        if (!it) return null;
        const map = S.map(it.mapId);
        return (map && S.reviewItem(map, it.key)) || null;
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

      /* ---- une page du carnet ---------------------------------------------------------------
         Tout est posé (et découpé en lettres) d'avance, invisible : le carnet mesure la page,
         réduit l'écriture ou allonge la feuille pour que rien ne déborde, puis le stylo écrit. */
      function build(it) {
        const { map, node, ex } = it;
        const course = S.course(map.courseId);
        const p = { it, choices: [], pick: new Set(), parts: [], hint: null };
        const pg = h('div.nb-page');
        const head = h('div.nb-head', h('span', [course ? course.title : null, map.title].filter(Boolean).join(' · ')), h('span', `${done + 1}/${total}`));
        p.num = h('span.nb-num', `${done + 1}.`);
        p.verdict = h('div.nb-verdict', { role: 'status' });
        pg.append(head);
        if (ex) {
          const K = S.EXERCISE_KINDS[ex.kind];
          p.qt = h('span.nb-qt', ex.q);
          p.note = h('div.nb-q-note.nb-lead', (K.short || K.label) + (ex.kind === 'qcm' && isMulti(ex) ? ' · plusieurs réponses possibles' : ''));
          pg.append(h('div.nb-q', p.num, p.qt), p.note);
          if (ex.kind === 'qcm') {
            pg.append(h('div.nb-choices', { role: 'group', 'aria-label': 'Choix' }, ex.choices.map((c, k) => {
              const L = h('span.nb-letter', LETTERS[k]), T = h('span.nb-ctext', c);
              const b = h('button.nb-choice', { type: 'button', 'aria-pressed': 'false', onclick: () => choose(k) }, L, T);
              b.disabled = true;
              p.choices.push({ b, L, T });
              return b;
            })));
          } else if (ex.kind === 'vf') {
            pg.append(h('div.nb-vf', { role: 'group', 'aria-label': 'Vrai ou faux' }, ['Vrai', 'Faux'].map((c, k) => {
              const B = h('span.nb-box', { html: '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>' }), T = h('span.nb-ctext', c);
              const b = h('button.nb-choice', { type: 'button', 'aria-pressed': 'false', onclick: () => choose(k) }, B, T);
              b.disabled = true;
              p.choices.push({ b, B, T });
              return b;
            })));
          }
          const ans = [];
          if (ex.kind === 'qa') ans.push([h('div.nb-answer-k.nb-lead', 'Réponse :'), 'lead', 500], [h('div.nb-md.nb-red', { html: R.md.render(ex.a) }), 'red', 2200]);
          if (ex.explain) ans.push([h('div.nb-md.nb-red.nb-explain', { html: R.md.render(ex.explain) }), 'red', 1900]);
          if (node) ans.push([h('a.nb-open.nb-lead', { href: `#/carte/${map.id}?n=${node.id}` }, 'Revoir dans la carte →'), 'lead', 500]);
          p.ans = h('div.nb-answer', { hidden: true, 'aria-live': 'polite' }, ans.map((x) => x[0]));
          p.parts = ans;
          if (ex.kind === 'qa') pg.append(p.ans, p.verdict);
          else pg.append(p.verdict, p.ans);
        } else {
          const T = S.TYPES[node.type];
          const nums = S.structNumbers(map);
          const kids = S.childrenOf(map, node.id);
          p.qt = h('span.nb-qt', node.title || 'Sans titre');
          p.note = h('div.nb-q-note.nb-lead', `${S.isStruct(node.type) ? S.kickerOf(map, node, nums) || T.label : T.label} · ${S.promptFor(map, node)}`);
          pg.append(h('div.nb-q', p.num, p.qt), p.note);
          const hintTxt = hintFor(map, node);
          if (hintTxt) { p.hint = h('div.nb-hint.nb-blue', { hidden: true }, 'Indice : ' + hintTxt); pg.append(p.hint); }
          // définition décomposée : la réponse déroule la chaîne de composantes, en retrait
          const chain = [];
          if (node.type === 'definition') {
            const walk = (id, depth) => { for (const k of S.childrenOf(map, id)) { chain.push({ c: k, depth }); if (k.type === 'idee') walk(k.id, depth + 1); } };
            walk(node.id, 0);
          }
          const rows = chain.length ? chain : kids.map((c) => ({ c, depth: 0 }));
          const rel = [];
          for (const e of map.edges) {
            if (e.kind !== 'link') continue;
            const out = e.from === node.id, inn = e.to === node.id;
            if (!out && !inn) continue;
            const o = S.node(map, out ? e.to : e.from);
            if (o) rel.push((out ? (e.label || 'voir') + ' → ' : '← ' + (e.label || 'voir') + ' ') + (o.title || 'Sans titre'));
          }
          const ans = [[h('div.nb-answer-k.nb-lead', 'Réponse :'), 'lead', 500]];
          const noteEl = node.note.trim() ? [h('div.nb-md.nb-red', { html: R.md.render(node.note) }), 'red', 2200] : null;
          if (noteEl && chain.length) ans.push(noteEl); // définition : le texte exact d'abord, sa décomposition ensuite
          if (rows.length) {
            ans.push([h('ol.nb-list.nb-red', rows.map(({ c, depth }) => {
              const pe = S.parentEdge(map, c.id);
              const pre = node.logic ? (node.logic === 'et' ? 'ET' : 'OU') : pe && pe.label ? pe.label : S.TYPES[c.type].kicker ? S.kickerOf(map, c, nums) : null;
              return h('li', { style: depth ? `margin-left:${depth * 18}px` : null }, pre ? h('span.nb-lead', pre + ' ') : null, c.title || 'Sans titre');
            })), 'red', 2200]);
          }
          if (noteEl && !chain.length) ans.push(noteEl);
          if (rel.length) ans.push([h('div.nb-rel.nb-lead', 'Relié à : ' + rel.slice(0, 3).join(' · ') + (rel.length > 3 ? ` (+ ${rel.length - 3})` : '')), 'lead', 900]);
          ans.push([h('a.nb-open.nb-lead', { href: `#/carte/${map.id}?n=${node.id}` }, 'Ouvrir dans la carte →'), 'lead', 500]);
          p.ans = h('div.nb-answer', { hidden: true, 'aria-live': 'polite' }, ans.map((x) => x[0]));
          p.parts = ans;
          pg.append(p.ans, p.verdict);
        }
        pg.append(h('div.nb-pageno.nb-lead', String(done + 1)));
        p.page = pg;
        return p;
      }
      // le texte est découpé une fois la page posée dans le carnet (les lettres ont besoin du DOM)
      function prepAll(p) {
        [p.num, p.qt, p.note, p.hint, ...p.choices.flatMap((c) => [c.L, c.T]), ...p.parts.map((x) => x[0])].forEach((n) => n && nb.prep(n));
      }

      /* petit écran : ce qui s'écrit sous les boutons remonte (défilement doux) — l'œil suit le stylo */
      function follow(n) {
        if (!n || !n.isConnected) return;
        const r = n.getBoundingClientRect(), s = stage.getBoundingClientRect();
        const bottom = s.bottom - actions.offsetHeight - 12;
        if (r.bottom > bottom) stage.scrollTo({ top: stage.scrollTop + Math.min(r.bottom - bottom, r.top - s.top - 24), behavior: motion.reduced() || nb.fast ? 'auto' : 'smooth' });
      }
      /* La feuille ne grandit pas pour le rouge : ce qui ne tient pas passe sur des post-it
         (nb.spill), écrits puis collés juste après le texte gardé. */
      async function writeParts(parts, g) {
        const sp = nb.spill(parts.filter((x) => x[1] === 'red').map((x) => x[0]));
        const todo = parts.filter(([n]) => n.isConnected && !n.closest('.nb-postit'));
        const stick = async () => { follow(sp.slot); await sp.run(); return alive(g); };
        if (sp && !todo.some(([n]) => n === sp.after) && !(await stick())) return false;
        for (let i = 0; i < todo.length; i++) {
          if (!alive(g)) return false;
          const [n, ink, max] = todo[i];
          follow(n);
          await nb.write(n, { ink, max, lift: i === todo.length - 1 || (sp && n === sp.after) });
          if (sp && n === sp.after && !(await stick())) return false;
        }
        return alive(g);
      }

      /**
       * mode : 'open' (le carnet s'ouvre sur la page) | 'turn' (la page se tourne) | 'instant' (Annuler) ;
       * open : la réponse est déjà là (Annuler une note) ; fast : tout s'affiche d'un coup.
       */
      async function present(mode, { open = false, fast = false } = {}) {
        let it = current();
        while (!it && idx < queue.length) { idx++; it = current(); }
        if (!it) { finish(); return; }
        const g = ++gen;
        cur = it;
        verdict = null; hinted = false; validateBtn = null;
        state = 'busy';
        P = build(it);
        updateProgress();
        paintActions();
        const auto = isAuto(it);
        const reveal0 = open && !auto;
        if (mode === 'turn') {
          stage.scrollTo({ top: 0, behavior: motion.reduced() ? 'auto' : 'smooth' });
          prepAll(P);
          await nb.turn(P.page);
        } else {
          nb.setPage(P.page);
          prepAll(P);
          if (mode === 'instant' || fast) nb.skip();
          if (mode === 'open') { await nb.open(); opened = true; }
          else if (!motion.reduced()) P.page.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,0,0,1)' });
        }
        if (!alive(g)) return;
        nb.setStack(total - done);
        const head = [[P.num, 'red', 300, 14], [P.qt, 'lead', 1500], [P.note, 'lead', 600]];
        for (let i = 0; i < head.length; i++) {
          const [n, ink, max, cps] = head[i];
          const last = i === head.length - 1 && !P.choices.length && !reveal0;
          await nb.write(n, { ink, max, cps: cps || 36, lift: last });
          if (!alive(g)) return;
        }
        for (let k = 0; k < P.choices.length; k++) {
          const c = P.choices[k], last = k === P.choices.length - 1;
          follow(c.b);
          if (c.L) await nb.write(c.L, { ink: 'lead', lift: false, max: 120 });
          else await nb.draw(c.B.firstChild, boxPath(), { ink: 'lead', lift: false, speed: 0.45 });
          if (!alive(g)) return;
          await nb.write(c.T, { ink: 'lead', lift: last, max: 700 });
          if (!alive(g)) return;
        }
        if (reveal0) {
          P.ans.hidden = false;
          if (!(await writeParts(P.parts, g))) return;
        }
        nb.fast = false;
        P.choices.forEach((c) => (c.b.disabled = false));
        state = reveal0 ? 'rate' : 'answer';
        paintActions();
      }

      /* Actions : l'ancien jeu sort (100 ms, ease-in, −4 px), le nouveau entre avec 50 % de
         chevauchement (rise 240 ms) — jamais deux jeux lisibles en même temps. */
      function paintActions() {
        const it = cur;
        const s = [state, it ? it.key : '', hinted].join('|');
        if (s === sig) return;
        sig = s;
        const old = [...actions.children].filter((x) => !x.classList.contains('leaving'));
        old.forEach((x) => { x.classList.add('leaving'); setTimeout(() => x.remove(), motion.reduced() ? 0 : 110); });
        const set = h('div.act-set', { class: old.length && state !== 'rate' ? 'enter' : '' }); // les notes ont leur propre cascade
        actions.appendChild(set);
        validateBtn = null;
        if (!it) return;
        const put = (x) => set.appendChild(x);
        const withKbd = (b, k) => { b.appendChild(h('kbd.btn-kbd', k)); return b; };
        if (state === 'busy') {
          put(h('p.review-hint', 'Touche le carnet (ou Espace) pour aller plus vite.'));
          return;
        }
        if (state === 'next') {
          const last = idx >= queue.length;
          const b = withKbd(ui.btn(last ? 'Voir le bilan' : 'Continuer', { variant: 'filled', cls: 'reveal-btn', onClick: next }), 'Entrée');
          put(h('div.reveal-row', b));
          if (verdict) put(h('p.review-hint', `Elle reviendra ${verdict.when}.`));
          setTimeout(() => b.isConnected && b.focus({ preventScroll: true }), 50);
          return;
        }
        if (state === 'rate') {
          put(rateGauge(it.review, it.ex ? WORDS.ex : WORDS.card, it.ex ? 'Tu avais trouvé ?' : 'Tu la connaissais ?', rate));
          return;
        }
        // state === 'answer'
        if (isAuto(it)) {
          if (it.ex.kind === 'qcm' && isMulti(it.ex)) {
            validateBtn = withKbd(ui.btn('Valider', { variant: 'filled', cls: 'reveal-btn', disabled: !P.pick.size, onClick: submit }), 'Entrée');
            put(h('div.reveal-row', validateBtn));
            put(h('p.review-hint', 'Entoure toutes les bonnes réponses, puis valide.'));
          } else {
            put(h('p.review-hint', it.ex.kind === 'vf' ? 'Coche Vrai ou Faux · V / F' : `Entoure la bonne réponse · 1 à ${it.ex.choices.length}`));
          }
          return;
        }
        const b = withKbd(ui.btn('Afficher la réponse', { variant: 'filled', cls: 'reveal-btn', onClick: reveal }), 'Espace');
        const canHint = !it.ex && !hinted && P.hint;
        put(h('div.reveal-row',
          canHint ? withKbd(ui.btn('Indice', { icon: 'sparkle', variant: 'text', cls: 'hint-btn', onClick: hint }), 'H') : null,
          b));
        put(h('p.review-hint', hinted ? 'Avec l’indice, essaie de retrouver le reste avant de vérifier.' : 'Formule ta réponse dans ta tête (ou à voix haute) avant de la découvrir.'));
        setTimeout(() => b.isConnected && b.focus({ preventScroll: true }), 50);
      }

      /* Indice : il s'écrit au stylo bleu sous la consigne */
      async function hint() {
        if (state !== 'answer' || hinted || !cur || cur.ex || !P.hint) return;
        const g = gen;
        hinted = true;
        nb.fast = false;
        state = 'busy';
        paintActions();
        P.hint.hidden = false;
        follow(P.hint);
        await nb.write(P.hint, { ink: 'blue', max: 1400 });
        if (!alive(g)) return;
        nb.fast = false;
        state = 'answer';
        paintActions();
      }

      /* Révéler : la réponse s'écrit au rouge, sous la question */
      async function reveal() {
        if (state !== 'answer' || !cur || isAuto(cur)) return;
        const g = gen;
        nb.fast = false;
        state = 'busy';
        paintActions();
        P.ans.hidden = false;
        if (!(await writeParts(P.parts, g))) return;
        nb.fast = false;
        state = 'rate';
        paintActions();
      }

      /** Enregistre la note de l'élément affiché : état, journal, file (« à revoir » revient une fois), Annuler */
      function commit(rating, extra = {}) {
        const it = cur;
        const target = it.ex || it.node;
        const entry = { qIdx: idx, before: { ...target.review }, day: U.dayKey(), rating, requeued: false, mapId: it.map.id, key: it.key, wasMissed: missed.has(it.map.id + '|' + it.key), ...extra };
        S.rate(it.map, target, rating);
        results[rating]++;
        if ('correct' in extra) { score.asked++; if (extra.correct) score.right++; }
        if (rating === 'revoir') missed.set(it.map.id + '|' + it.key, { mapId: it.map.id, key: it.key });
        else missed.delete(it.map.id + '|' + it.key);
        if (rating === 'revoir' && !requeued.has(it.map.id + '|' + it.key)) {
          requeued.add(it.map.id + '|' + it.key);
          queue.push({ ...queue[idx] });
          total++;
          entry.requeued = true;
        }
        history.push(entry);
        done++;
        idx++;
      }

      /* Choisir (QCM, vrai ou faux) : un seul choix → entouré (ou coché) puis corrigé tout de suite ;
         plusieurs réponses attendues → on entoure, puis Valider. */
      async function choose(k) {
        if (state !== 'answer' || !isAuto(cur) || !P || k >= P.choices.length) return;
        const g = gen, c = P.choices[k];
        nb.fast = false;
        if (cur.ex.kind === 'qcm' && isMulti(cur.ex)) {
          if (P.drawing) return;
          if (P.pick.has(k)) {
            P.pick.delete(k);
            if (c.svg) { c.svg.remove(); c.svg = null; }
            c.b.setAttribute('aria-pressed', 'false');
          } else {
            P.pick.add(k);
            c.b.setAttribute('aria-pressed', 'true');
            P.drawing = true;
            motion.haptic(6);
            c.svg = await nb.mark(c.L, 'circle', { ink: 'blue' });
            P.drawing = false;
            if (!alive(g)) return;
          }
          if (validateBtn) validateBtn.disabled = !P.pick.size;
          return;
        }
        P.pick = new Set([k]);
        c.b.setAttribute('aria-pressed', 'true');
        state = 'busy';
        P.choices.forEach((x) => (x.b.disabled = true));
        paintActions();
        motion.haptic(6);
        if (cur.ex.kind === 'qcm') await nb.mark(c.L, 'circle', { ink: 'blue' });
        else await nb.mark(c.B, 'cross', { ink: 'blue' });
        if (!alive(g)) return;
        correct(g);
      }
      function submit() {
        if (state !== 'answer' || !isAuto(cur) || !P.pick.size || P.drawing) return;
        state = 'busy';
        P.choices.forEach((x) => (x.b.disabled = true));
        paintActions();
        correct(gen);
      }

      /* Corriger au stylo rouge : coche devant les bonnes réponses, rature les mauvaises, verdict
         souligné, puis l'explication. La note découle de la réponse (juste deux fois de suite = maîtrisé). */
      async function correct(g) {
        const ex = cur.ex;
        const given = ex.kind === 'vf' ? P.pick.has(0) : isMulti(ex) ? [...P.pick].sort((a, b) => a - b) : [...P.pick][0];
        const ok = S.isCorrect(ex, given);
        const rating = S.gradeFor(ex.review, ok);
        const when = nextLabel(ex.review, rating);
        commit(rating, { correct: ok });
        verdict = { correct: ok, rating, when };
        bar.querySelector('.progress-bar').style.setProperty('--p', String(done / total));
        undoBtn.disabled = false;
        if (ex.kind === 'vf') {
          const right = ex.answer ? 0 : 1;
          await nb.mark(P.choices[right].T, 'check', { ink: 'red', at: 'after', lift: ok });
          if (!alive(g)) return;
          if (!ok) await nb.mark(P.choices[1 - right].T, 'strike', { ink: 'red' });
        } else {
          const good = new Set(isMulti(ex) ? ex.answer : [ex.answer]);
          const todo = [];
          P.choices.forEach((c, k) => { if (good.has(k)) todo.push(['check', c.T]); else if (P.pick.has(k)) todo.push(['strike', c.T]); });
          for (let n = 0; n < todo.length; n++) {
            await nb.mark(todo[n][1], todo[n][0], { ink: 'red', lift: n === todo.length - 1 });
            if (!alive(g)) return;
          }
        }
        if (!alive(g)) return;
        P.verdict.textContent = ok ? (rating === 'maitrise' ? 'Juste — maîtrisé' : 'Bien !') : 'À revoir';
        follow(P.verdict);
        await nb.write(P.verdict, { ink: 'red', cps: 16, max: 600, lift: false });
        if (!alive(g)) return;
        await nb.mark(P.verdict, 'underline', { ink: 'red', lift: !P.parts.length });
        if (!alive(g)) return;
        if (ok) {
          const r = P.verdict.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + r.height / 2, { count: rating === 'maitrise' ? 10 : 6, spread: 40 });
          motion.haptic(10);
        } else {
          motion.haptic([10, 40, 10]);
        }
        if (P.parts.length) {
          P.ans.hidden = false;
          if (!(await writeParts(P.parts, g))) return;
        }
        nb.fast = false;
        state = 'next';
        paintActions();
      }

      /* Noter (question-réponse, fiche) : le verdict s'écrit en rouge, puis la page se tourne */
      async function rate(rating) {
        if (state !== 'rate' || !cur || isAuto(cur)) return;
        const g = gen, ex = !!cur.ex;
        nb.fast = false;
        state = 'busy';
        commit(rating);
        updateProgress();
        // la plume file au cran choisi et s'y pose, puis la jauge s'en va
        const gauge = actions.querySelector('.act-set:not(.leaving) .rate-gauge');
        if (gauge && !motion.reduced()) {
          await gauge.pick(rating);
          if (!alive(g)) return;
        }
        paintActions();
        if (rating === 'maitrise') {
          const r = nb.book.getBoundingClientRect();
          motion.burst(r.left + r.width / 2, r.top + 60, { count: 8, spread: 48 });
        }
        P.verdict.textContent = (ex ? WORDS.ex : WORDS.card)[rating] + (rating === 'maitrise' ? ' !' : '');
        follow(P.verdict);
        await nb.write(P.verdict, { ink: 'red', cps: 16, max: 600, lift: rating !== 'revoir' });
        if (!alive(g)) return;
        if (rating === 'revoir') await nb.mark(P.verdict, 'underline', { ink: 'red' });
        if (!alive(g)) return;
        await wait(motion.reduced() ? 0 : 320);
        if (alive(g)) advance(g, rating === 'revoir');
      }

      /* Continuer (après une correction) */
      function next() {
        if (state !== 'next' || !verdict) return;
        state = 'busy';
        paintActions();
        advance(gen, !verdict.correct);
      }
      // une question ratée reçoit un marque-page, puis on tourne la page
      async function advance(g, flag) {
        nb.fast = false;
        if (flag) await nb.flag();
        if (!alive(g)) return;
        if (idx >= queue.length) finish();
        else present('turn');
      }

      /* Annuler la dernière note : l'état de la fiche, le journal du jour et la file reviennent
         en arrière ; la page revient, réponse ouverte. Un QCM ou un vrai ou faux revient sans sa
         correction : on peut y répondre à nouveau. */
      function undo() {
        if (!history.length || !['answer', 'rate', 'next', 'done'].includes(state) || (P && P.drawing)) return;
        const last = history.pop();
        const map = S.map(last.mapId);
        const it = map && S.reviewItem(map, last.key);
        if (!it) { updateProgress(); return; }
        S.unrate(map, it.ex || it.node, last.before, last.day);
        results[last.rating]--;
        if ('correct' in last) { score.asked--; if (last.correct) score.right--; }
        if (last.wasMissed) missed.set(map.id + '|' + last.key, { mapId: map.id, key: last.key });
        else missed.delete(map.id + '|' + last.key);
        if (last.requeued) { queue.pop(); total--; requeued.delete(map.id + '|' + last.key); }
        done--;
        idx = last.qIdx;
        const auto = 'correct' in last;
        if (ended) {
          ended = false;
          const end = stage.querySelector('.review-end');
          if (end) end.remove();
          stage.classList.remove('is-end');
          document.removeEventListener('keydown', onEndKey);
          document.addEventListener('keydown', onKey);
          stage.scrollTop = 0;
          mountBook();
          present('open', { open: !auto, fast: true });
        } else {
          present('instant', { open: !auto });
        }
        ui.snack(auto ? 'Réponse annulée' : 'Note annulée', { duration: 1400 });
      }

      function onKey(e) {
        if (U.isTyping() || U.$('.dialog') || U.$('.search')) return;
        const k = e.key.toLowerCase();
        if (e.key === 'Escape') { R.app.go(exitHref); return; }
        if ((k === 'z' && !e.altKey) || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey || !cur) return;
        if (state === 'busy') { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nb.skip(); } return; }
        if (state === 'next') { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); } return; }
        if (state === 'rate') {
          const gauge = actions.querySelector('.act-set:not(.leaving) .rate-gauge');
          if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); rate(KEYS[+e.key - 1]); }
          else if (gauge && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); gauge.step(e.key === 'ArrowRight' ? 1 : -1); }
          else if (gauge && e.key === 'Enter' && gauge.current()) { e.preventDefault(); rate(gauge.current()); }
          return;
        }
        if (state !== 'answer') return;
        if (isAuto(cur)) {
          // QCM, vrai ou faux : 1-8 / A-H (V/F) choisissent, Entrée valide
          if (cur.ex.kind === 'vf') {
            if (k === 'v' || k === '1') { e.preventDefault(); choose(0); } else if (k === 'f' || k === '2') { e.preventDefault(); choose(1); }
            return;
          }
          const n = /^[1-8]$/.test(k) ? +k - 1 : /^[a-h]$/.test(k) ? LETTERS.indexOf(k.toUpperCase()) : -1;
          if (n >= 0 && n < cur.ex.choices.length) { e.preventDefault(); choose(n); return; }
          if (e.key === 'Enter' && P.pick.size) { e.preventDefault(); submit(); }
          return;
        }
        if (k === 'h') { e.preventDefault(); hint(); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
      }
      // Annuler reste disponible sur l'écran de fin (Z)
      function onEndKey(e) {
        if (U.isTyping() || U.$('.dialog') || U.$('.search')) return;
        if (e.key === 'Escape') { R.app.go(exitHref); return; }
        if ((e.key.toLowerCase() === 'z' && !e.altKey) || e.key === 'Backspace') { e.preventDefault(); undo(); }
      }

      /* Fin de session — le seul moment vraiment expressif (pic-fin) :
         le carnet se ferme, rétrécit et porte le score au rouge ; puis, dessous,
         1) la flamme surgit (ease-pop) et sa série défile  2) le titre est surligné
         3) le bilan arrive, chaque barre grandit en décalé  4) ce qui est à retravailler, les actions. */
      async function finish() {
        ended = true;
        state = 'closing';
        const g = ++gen;
        cur = null;
        document.removeEventListener('keydown', onKey);
        bar.querySelector('.progress-bar').style.setProperty('--p', '1');
        counter.textContent = `${total} / ${total}`;
        undoBtn.disabled = true;
        U.clear(actions);
        sig = '';
        stage.classList.add('is-end');
        stage.scrollTo({ top: 0, behavior: motion.reduced() ? 'auto' : 'smooth' });
        if (opened) {
          nb.fast = false;
          await nb.close({ score: `${done - results.revoir}/${done}` });
          if (!alive(g)) return;
          // le carnet réduit libère sa place : le bilan remonte dessous
          nb.book.style.marginBottom = -(nb.H * 0.36) + 4 + 'px';
        } else host.replaceChildren();
        if (!alive(g)) return;
        undoBtn.disabled = !history.length;
        const streak = S.streak();
        const fc = S.forecast(2, scope.folderId ? { folderId: scope.folderId } : scope.courseId ? { courseId: scope.courseId } : {});
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
            return h('div.rc-row', { class: 'k-' + k }, ui.mastery(k, 14), h('span.rc-l', S.RATINGS[k].label), h('span.rc-dots'),
              h('span.rc-bar', h('span', { style: { '--w': String(results[k] / sum), '--i': i } })), n);
          }),
          h('div.rc-total', h('span', 'Total'), h('span.rc-dots'), totalEl),
          h('span.rc-stamp', streak > 1 ? `Série · ${streak} j` : 'Validée'));
        counts.push([totalEl, done, 3]);
        const weak = [...missed.values()]
          .map(({ mapId, key }) => { const m = S.map(mapId); return m && S.reviewItem(m, key); })
          .filter((it) => it && (it.ex || it.node).review.rating === 'revoir');
        const streakEl = h('span.end-streak', String(streak));
        const doneEl = h('b', String(done));
        const end = h('section.review-end.intro',
          h('div.end-flame', { class: streak ? 'lit' : '' }, R.icon('flame', 40), streakEl),
          h('p.overline', streak > 1 ? `${streak} jours de suite` : 'Série lancée'),
          h('h2.end-title', h('span.hl-sweep', 'Session terminée')),
          h('p.end-sub', doneEl, ` ${noun}${done > 1 ? 's' : ''} ${done > 1 ? 'révisées' : 'révisée'}. ${results.maitrise ? 'Ce que tu maîtrises reviendra plus tard ; ce' : 'Ce'} qui est à revoir reviendra demain.`),
          score.asked ? h('p.end-score', R.icon('check', 18), h('span', h('b', String(score.right)), ` juste${score.right > 1 ? 's' : ''} sur ${score.asked} en QCM et vrai ou faux`)) : null,
          dist,
          weak.length ? h('div.end-weak',
            h('p.overline', 'À retravailler'),
            h('div.end-weak-list', weak.slice(0, 5).map(({ map, node, ex }) => h('a.end-weak-row', { href: node ? `#/carte/${map.id}?n=${node.id}` : `#/carte/${map.id}`, dataset: { hero: `map:${map.id}:node` },
              onclick: (e) => { e.preventDefault(); R.app.go(e.currentTarget.getAttribute('href'), { from: e.currentTarget }); } },
              ui.mastery('revoir', 14), h('span', ex ? ex.q : node.title), R.icon('chevronRight', 16))))) : null,
          h('p.end-next', remaining ? `Encore ${U.plural(remaining, 'élément')} à réviser maintenant.` : fc[1].n ? `Demain : ${U.plural(fc[1].n, 'élément')}.` : 'Rien d’autre à réviser pour l’instant.'),
          h('div.end-actions',
            ui.btn('Terminer', { variant: remaining ? 'tonal' : 'filled', onClick: () => R.app.go(exitHref) }),
            remaining ? ui.btn('Encore une série', { icon: 'play', variant: 'filled', onClick: () => R.app.go(sessionBase() + '?n=' + (q.n != null ? q.n : S.data.settings.sessionSize) + '&r=' + Date.now(), { replace: true }) }) : null));
        stage.insertBefore(end, actions);
        state = 'done';
        document.removeEventListener('keydown', onEndKey);
        document.addEventListener('keydown', onEndKey);
        // la flamme a sa propre entrée (flame-pop) ; le reste suit en cascade de 70 ms
        R.motion.stagger(Array.from(end.children).slice(1), 1, { step: 70, max: 8 });
        motion.countUp(streakEl, streak, { from: Math.max(0, streak - 1), duration: 600 });
        motion.countUp(doneEl, done, { duration: 700 });
        // chaque ligne compte quand l'impression la découvre (ticket : 200 → 720 ms)
        counts.forEach(([n, v, i]) => setTimeout(() => motion.countUp(n, v, { duration: 560 }), motion.reduced() ? 0 : 420 + i * 90));
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
        const fc = S.forecast(2, scope.folderId ? { folderId: scope.folderId } : scope.courseId ? { courseId: scope.courseId } : {});
        undoBtn.hidden = true;
        stage.insertBefore(ui.emptyState(anyReviewable ? {
          icon: 'check', title: 'Tout est à jour',
          text: fc[1].n ? `Prochaine révision : demain · ${U.plural(fc[1].n, 'élément')}. Tu peux aussi réviser quand même.` : 'Rien n’est dû aujourd’hui. Tu peux réviser quand même pour t’entraîner.',
          action: h('div.end-actions',
            ui.btn('Retour', { variant: 'tonal', onClick: () => R.app.go(exitHref) }),
            ui.btn('Réviser quand même', { icon: 'cards', variant: 'filled', onClick: () => R.app.go(sessionBase() + '?all=1', { replace: true }) })),
        } : {
          icon: 'cards', title: 'Pas encore de questions de révision',
          text: 'Importe un cours avec ses exercices (QCM, vrai ou faux, questions) : ils deviennent ta révision. Sans exercices, chaque nœud qui a une note devient une question.',
          action: ui.btn('Retour', { variant: 'filled', onClick: () => R.app.go(exitHref) }),
        }), actions);
        counter.textContent = '';
      }

      return {
        unmount() {
          dead = true;
          gen++;
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('keydown', onEndKey);
          window.removeEventListener('resize', onResize);
          mq.removeEventListener('change', onScheme);
          theme.disconnect();
        },
      };
    },
  };
})(window.R);
