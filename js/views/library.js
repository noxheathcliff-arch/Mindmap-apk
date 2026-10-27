/* Pioneer — Bibliothèque : Aujourd'hui (déclencheur) · Mes cours · Récemment modifiées */
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
      const s = (sz[n.id] = R.layout.estimate(n, map));
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h);
    }
    const pad = 24;
    const bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    let svg = `<svg viewBox="${x0 - pad} ${y0 - pad} ${bw} ${bh}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    // mêmes trajets que dans l'éditeur (disposition, renvois qui contournent les nœuds)
    const rects = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: sz[n.id].w, h: sz[n.id].h }));
    const child = new Set(map.edges.filter((e) => e.kind === 'tree').map((e) => e.to));
    for (const e of map.edges) {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) continue;
      const cv = e.kind === 'link'
        ? R.layout.route(a, sz[a.id], b, sz[b.id], { rects, fast: true })
        : R.layout.treeCurve(map.layout, a, sz[a.id], b, sz[b.id], !child.has(a.id));
      svg += `<path d="${cv.d}" style="fill:none;stroke:var(--outline)" stroke-width="${Math.max(2, bw / 220)}" ${e.kind === 'link' ? `stroke-dasharray="${bw / 90}"` : ''}/>`;
    }
    for (const n of nodes) {
      const s = sz[n.id];
      // trois apparences : Notion (aplat d'encre), Idée (aplat clair), Référence (filet à gauche)
      const lk = R.store.look(n.type);
      const hue = R.store.HUES[n.color || (map.typeColors && map.typeColors[n.type])];
      const fill = hue ? `oklch(${lk === 'notion' ? '.5' : '.9'} ${hue.c} ${hue.h})` : lk === 'notion' ? 'var(--on-surface)' : lk === 'idee' ? 'var(--surface-container-high)' : 'var(--surface-container-low)';
      const rx = Number.isFinite(n.r) ? n.r : lk === 'ref' ? 4 : lk === 'notion' ? 16 : 12;
      svg += `<rect x="${n.x}" y="${n.y}" width="${s.w}" height="${s.h}" rx="${rx}" style="fill:${fill}"/>`;
      if (lk === 'ref') svg += `<rect x="${n.x}" y="${n.y}" width="${Math.max(4, bw / 160)}" height="${s.h}" style="fill:var(--outline)"/>`;
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
      title: 'Modifier le cours', icon: 'edit', ok: 'Enregistrer', cls: 'm3-form', outlined: true,
      fields: [
        { key: 'title', label: 'Intitulé du cours', value: c.title, icon: 'library', required: true },
        { key: 'description', label: 'Précision', value: c.description, placeholder: 'Ex. M1 · S1 · Pr. Dupont', icon: 'edit', support: 'Facultatif · niveau, semestre, enseignant' },
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
        U.download(`pioneer-${U.slug(c.title)}.json`, S.exportCourse(c.id));
        ui.snack('Cours exporté · à importer avec Réglages › Importer');
      } },
      { divider: true },
      { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => R.actions.deleteCourse(c, after) },
    ].filter(Boolean));
  };

  /** Les 7 derniers jours : une coche par jour de révision, un cercle pointillé sinon (partagé avec Réviser) */
  R.weekDots = function () {
    const log = S.data.settings.reviewLog;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const n = log[U.dayKey(d)] || 0;
      days.push(h('span.week-day', { class: n ? 'on' : '', title: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) + ` · ${n} carte${n > 1 ? 's' : ''}` },
        h('span.week-dot', { html: n
          ? `<svg viewBox="0 0 16 16" width="16" height="16"><mask id="wk${i}"><rect width="16" height="16" fill="#fff"/><path d="M4.8 8.3l2.1 2.1 4.3-4.5" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></mask><circle cx="8" cy="8" r="8" fill="currentColor" mask="url(#wk${i})"/></svg>`
          : '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2.4" opacity=".55"/></svg>' }), h('span.week-l', d.toLocaleDateString('fr-FR', { weekday: 'narrow' }))));
    }
    return h('span.week', days);
  };

  /* ---------------- Héros « session du jour » ------------------------
     La boîte de Leitner en 2,5D (js/leitner.js) avec le titre, la série et l'action « Réviser ». */
  function sessionHero(intro) {
    const due = S.dueCount();
    const streak = S.streak();
    const today = S.reviewedToday();
    const next = S.nextDueInfo();
    const courses = S.coursesSorted().filter((c) => S.courseStats(c.id).due).length;
    const mins = Math.max(1, Math.round((due * 25) / 60));
    const hour = new Date().getHours();
    // sur mobile, le titre et le sous-titre tiennent sur une ligne : la forme longue se replie (.wide)
    const moment = hour >= 18 || hour < 5 ? 'soir' : 'jour';
    const title = due ? [h('span.wide', 'Ta s'), h('span.narrow', 'S'), `ession du ${moment} `, h('span.wide', 'est '), 'prête'] : today ? 'Bravo, tout est révisé' : 'Tout est à jour';
    const sub = due
      ? [`${U.plural(due, 'fiche')} à réviser · ≈ ${mins} min`, h('span.wide', ` · ${U.plural(courses, 'cours', 'cours')}. Le rappel actif fixe mieux qu’une relecture.`)]
      : today ? `${U.plural(today, 'fiche')} révisée${today > 1 ? 's' : ''} aujourd’hui.` : next.tomorrow ? `Demain : ${U.plural(next.tomorrow, 'fiche')}.` : 'Décompose une nouvelle notion pour alimenter tes révisions.';
    const streakEl = h('div.today-streak', { class: streak ? 'lit' : '' },
      h('span.flame', R.icon('flame', 20)),
      h('span', streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Lance ta série aujourd’hui'),
      R.weekDots());
    return R.leitnerHero({ title, sub, streakEl, cta: reviewBtn(due), intro });
  }
  /** Téléphone : la série quitte le héros pour une puce de l'en-tête ; un toucher montre la semaine */
  function streakChip() {
    const streak = S.streak();
    return h('button.streak-chip', { type: 'button', class: streak ? 'lit' : '',
      'aria-label': streak ? `Série : ${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Série : pas encore lancée',
      onclick: () => ui.dialog({ title: streak ? `${streak} jour${streak > 1 ? 's' : ''} de suite` : 'Lance ta série aujourd’hui', icon: 'flame',
        body: h('div.streak-week', R.weekDots(), h('p', 'Un jour de révision coche sa case. La série tient jusqu’à ce soir.')),
        actions: [{ label: 'OK', value: true }] }) },
      R.icon('flame', 18), h('span', String(streak)));
  }
  function reviewBtn(due) {
    const any = S.data.maps.some((m) => S.mapStats(m).reviewable);
    if (!any) return null;
    const b = due
      ? ui.btn(`Réviser · ${due}`, { icon: 'play', variant: 'filled', cls: 'today-cta', onClick: (e) => R.app.go('#/reviser/tout', { from: e.currentTarget.closest('.today') }) })
      : ui.btn('Réviser quand même', { icon: 'cards', variant: 'filled', cls: 'today-cta', onClick: () => R.app.go('#/reviser/tout?all=1') });
    // bande compacte (téléphone) : le bouton se réduit à ▶ (le nombre est dans le sous-titre)
    b.setAttribute('aria-label', due ? `Réviser ${U.plural(due, 'fiche')}` : 'Réviser quand même');
    return b;
  }

  /* ---------------- Carte de cours : un dossier fermé qui s'ouvre ----------------
     Le dos du dossier (avec son onglet), les feuilles rangées dedans (la première : la
     prochaine fiche à réviser), puis la façade : titre du cours, avancement, « Réviser ».
     Fermé au repos ; survol, appui ou appui long l'ouvrent et la feuille dépasse. Lien étiré :
     le titre est le lien principal et couvre la façade ; « Réviser » et « Options » restent des
     contrôles distincts ; toucher la feuille lance la révision sur cette fiche-là. */
  function untilLabel(t) {
    if (!t || !Number.isFinite(t)) return '';
    const days = Math.round((U.startOfDay(t) - U.startOfDay()) / U.DAY);
    return days <= 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`;
  }
  /* Gestes du dossier : on tire les feuilles hors du dossier, ou on les y repousse.
     Un ressort par couche, image par image (rAF) : --lift (la fiche), --lift2 (la seconde
     feuille, plus molle : elle traîne et arrive après = chevauchement), --flap (la façade,
     qui mène), --stretch (étirement selon la vitesse). Le doigt mène 1:1, au-delà des bornes
     la course s'élastifie ; au lâcher, la position projetée par la vitesse choisit la détente
     (fermé 0, entrevu .45, ouvert 1) et le ressort y va en dépassant un peu.
     Souris : survol = entrouvert, appui = ouvert, appui glissé = on tire / on repousse.
     Tactile : doigt posé = entrevu ; appui long = tenu ouvert, puis glisser tire ou repousse
     (sans défiler) ; un toucher ailleurs ou un défilement range les feuilles.
     Clavier : focus = entrouvert, ↑ ↓ passent d'une détente à l'autre. demo(t) : s'ouvre puis se referme. */
  const DETENTS = [0, .45, 1];
  function foldGestures(card) {
    const K = 320, C = 29, K2 = 210, C2 = 21, KF = 460, CF = 34;      // ζ ≈ .8 / .72 / .8
    let x = 0, v = 0, x2 = 0, v2 = 0, f = 0, vf = 0, T = 0, raf = 0, last = 0;
    let rest = 0, drag = false, held = false, swallow = false, touch = false;
    let pid = null, x0 = 0, y0 = 0, base = 0, yb = 0, ty = 0, tt = 0, notch = 0, t1 = 0, t2 = 0;
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const flapOf = (l) => clamp(l / .6, 0, 1);
    const rise = () => parseFloat(getComputedStyle(card).getPropertyValue('--rise')) || 60;
    // au-delà des bornes, la feuille résiste de plus en plus (c = .55, comme un défilement iOS)
    const band = (l) => l > 1 ? 1 + (1 - 1 / ((l - 1) * .55 / .3 + 1)) * .3
      : l < 0 ? -(1 - 1 / (-l * .55 / .14 + 1)) * .14 : l;
    const paint = () => {
      const st = card.style;
      st.setProperty('--lift', x.toFixed(4)); st.setProperty('--lift2', x2.toFixed(4));
      st.setProperty('--flap', f.toFixed(4)); st.setProperty('--stretch', clamp(v * .012, -.05, .07).toFixed(4));
      card.classList.toggle('is-up', x > .01 || f > .01 || drag);
    };
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
      if (!drag) { v += (-K * (x - T) - C * v) * dt; x += v * dt; }
      v2 += (-K2 * (x2 - x) - C2 * v2) * dt; x2 += v2 * dt;
      const ft = flapOf(x);
      vf += (-KF * (f - ft) - CF * vf) * dt; f += vf * dt;
      if (!drag && Math.abs(x - T) < .002 && Math.abs(v) < .01 && Math.abs(x2 - T) < .002 && Math.abs(v2) < .01 && Math.abs(f - ft) < .002) {
        x = x2 = T; v = v2 = vf = 0; f = flapOf(T); raf = 0; paint();
        if (T === 0) { for (const p of ['--lift', '--lift2', '--flap', '--stretch']) card.style.removeProperty(p); card.classList.remove('is-up'); }
        return;
      }
      paint(); raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    // va vers t ; kick : vitesse de départ (négative = anticipation, la feuille s'enfonce d'abord)
    const to = (t, kick = 0) => {
      T = t;
      if (R.motion.reduced()) { cancelAnimationFrame(raf); raf = 0; x = x2 = t; v = v2 = vf = 0; f = flapOf(t); paint(); return; }
      if (kick && Math.abs(v) < .5) v = kick;
      run();
    };
    const nearest = (l) => DETENTS.reduce((a, d) => Math.abs(d - l) < Math.abs(a - l) ? d : a, 0);
    const unhold = () => {
      held = false; card.classList.remove('is-held');
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', outside, true);
    };
    const hold = () => {
      if (held) return;
      held = true; card.classList.add('is-held');
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('scroll', outside, true);
    };
    function outside(e) {
      if (e.type === 'pointerdown' && card.contains(e.target)) return;
      unhold(); rest = 0; to(0);
    }
    const stop = () => { clearTimeout(t1); clearTimeout(t2); t1 = t2 = 0; };
    const grab = (e) => {
      stop(); drag = swallow = true; base = x; yb = e.clientY; ty = e.clientY; tt = e.timeStamp; v = 0;
      notch = nearest(x); card.classList.add('is-drag');
      try { card.setPointerCapture(e.pointerId); } catch (_) {}
      run();
    };
    card.addEventListener('pointerdown', (e) => {
      swallow = false; touch = e.pointerType !== 'mouse';
      if (e.button > 0 || e.target.closest('.fiche-more')) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
      if (held) { grab(e); return; }                       // déjà tenu : le doigt reprend la feuille où elle est
      if (!touch) { to(1, -2.2); return; }
      t1 = setTimeout(() => to(.45, -1.6), 70);
      t2 = setTimeout(() => { swallow = true; hold(); R.motion.haptic(12); to(1); }, 380);
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      if (drag) {
        const nx = band(base + (yb - e.clientY) / rise()), dt = Math.max(e.timeStamp - tt, 1) / 1000;
        if (e.timeStamp > tt) { v = v * .4 + ((nx - x) / dt) * .6; tt = e.timeStamp; }
        x = nx;
        const n = nearest(x); if (n !== notch) { notch = n; R.motion.haptic(6); }  // un cran à chaque détente franchie
        return;
      }
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!touch) { if ((e.buttons & 1) && Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(dx)) grab(e); return; }
      if (held) { if (Math.abs(dy) > 4) grab(e); return; }
      if (Math.hypot(dx, dy) > 10) { stop(); pid = null; to(rest); }   // c'est un défilement, pas un geste
    });
    // tactile tenu : bloquer le défilement pour que le doigt tire la feuille
    card.addEventListener('touchmove', (e) => { if (held || drag) e.preventDefault(); }, { passive: false });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      stop(); pid = null;
      if (drag) {
        drag = false; card.classList.remove('is-drag');
        // projection : où la vitesse aurait mené la feuille (décélération « rapide », d = .99)
        const t = nearest(clamp(x + v / 1000 * .99 / (1 - .99), -.2, 1.2));
        rest = t; to(t);
        if (t === 0) unhold(); else if (touch) hold();
        return;
      }
      if (!held) setTimeout(() => { if (pid === null && !held && !drag) to(rest); }, e.type === 'pointercancel' ? 0 : 140);
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    card.addEventListener('lostpointercapture', (e) => { if (drag && e.target === card) end(e); });
    card.addEventListener('click', (e) => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    card.addEventListener('contextmenu', (e) => { if (touch) e.preventDefault(); });
    card.addEventListener('dragstart', (e) => e.preventDefault());   // sinon le lien part en glisser-déposer natif
    card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !held) { rest = Math.max(rest, .3); if (!drag && pid === null) to(rest); } });
    card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { stop(); pid = null; rest = 0; to(0); } });
    card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible') && rest < .3) { rest = .3; to(.3); } });
    card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget) && !held) { rest = 0; to(0); } });
    card.addEventListener('keydown', (e) => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !e.target.matches(':focus-visible')) return;
      e.preventDefault();
      const i = DETENTS.indexOf(nearest(T)), j = clamp(i + (e.key === 'ArrowUp' ? 1 : -1), 0, DETENTS.length - 1);
      rest = DETENTS[j]; to(rest, j > i ? -1.6 : 0);
    });
    return {
      demo(delay) {
        setTimeout(() => {
          if (!card.isConnected || held || drag || pid !== null) return;
          to(1, -2.4);
          setTimeout(() => { if (!held && !drag && pid === null) to(rest); }, 900);
        }, delay);
      },
    };
  }
  /** Entrer dans un cours : le classeur sort du dossier, s'ouvre sur son premier intercalaire,
      et l'on plonge dedans (js/binder.js) ; la page du cours s'échange dessous, sans transition. */
  function openCourse(card, c) {
    const go = () => R.app.go('#/cours/' + c.id, { still: true });
    if (!window.Binder) { R.app.go('#/cours/' + c.id); return; }
    const { items } = S.unitsIn(c.id, null);
    let nf = 0;
    const stack = items.slice(0, 9).map((x) => (x.folder
      ? { kind: 'inter', num: R.numeral ? R.numeral(x.folder.label, nf++) : String(++nf), kicker: x.folder.label || S.FOLDER_LABELS[x.folder.kind], title: x.folder.title }
      : { kind: 'sheet', content: x.map.title }));
    if (!stack.length) stack.push({ kind: 'sheet' });
    window.Binder.enter(card, {
      binder: { title: c.title, kicker: 'Cours', sub: c.description || '', items: stack, skeleton: true },
      tint: (el) => R.courseArt.tint(el, c),
      // la page du cours monte sous la scène qui se dissout : ses blocs remontent un à un (relais du zoom)
      swap: () => {
        const before = new Set(U.$$('#view .page-wrap'));
        go();
        let tries = 0;
        const reveal = () => {
          const page = U.$$('#view .page-wrap').find((n) => !before.has(n));
          if (!page) { if (++tries < 12) requestAnimationFrame(reveal); return; }
          if (!page.animate || U.reducedMotion()) return;
          const kids = [...(page.firstElementChild || page).children].slice(0, 8);
          (kids.length ? kids : [page]).forEach((n, i) => n.animate(
            [{ opacity: 0, transform: 'translateY(18px) scale(.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 520, delay: 60 + i * 45, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' }));
        };
        reveal();
      },
    });
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
    paper.addEventListener('click', () => (reviewHref ? R.app.go(reviewHref) : openCourse(card, c)));

    const more = ui.iconBtn('more', { title: 'Options du cours', cls: 'fiche-more' });
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); R.actions.courseMenu(more, c, rerender); });
    const sub = c.description || (st.maps ? `Modifié ${U.relTime(S.courseActivity(c))}` : 'Nouveau cours');
    const band = h('header.fiche-band',
      h('div.fiche-id',
        h('h3.fiche-title', { id: 'cc-' + c.id },
          h('a.fiche-link', { href: '#/cours/' + c.id, onclick: (e) => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openCourse(card, c); } }, h('span', { dataset: { hero: 'course:' + c.id + ':title' } }, c.title))),
        h('p.fiche-sub', sub)),
      more);

    let action = null;
    if (next) {
      action = h('a.btn.btn-filled.fiche-cta', { href: reviewHref, 'aria-label': `Réviser ${U.plural(st.due, 'fiche')} de ${c.title}` },
        R.icon('play', 18), h('span.fiche-cta-l', 'Réviser'), h('span.fiche-count', st.due > 999 ? '999+' : String(st.due), h('span.fiche-count-u', st.due > 1 ? 'fiches' : 'fiche')));
    } else if (!st.maps) {
      action = ui.btn('Nouvelle carte', { icon: 'plus', variant: 'tonal', cls: 'fiche-cta', onClick: (e) => { e.preventDefault(); e.stopPropagation(); R.actions.newMap(c.id); } });
    }
    const foot = h('footer.fiche-foot',
      h('div.fiche-stats',
        st.maps ? h('span.fiche-meta', { title: `${U.plural(st.maps, 'carte')} mentale${st.maps > 1 ? 's' : ''} · ${U.plural(st.nodes, 'nœud')}` }, U.plural(st.maps, 'carte')) : null,
        // maîtrise : anneau + pourcentage sur la même ligne que le compte de cartes (plus de barre qui prend une ligne)
        st.reviewable ? h('span.fiche-meter', { title: `Maîtrise ${Math.round(st.progress * 100)} %`, style: { '--ring': st.progress } },
          h('i', { 'aria-hidden': 'true' }), Math.round(st.progress * 100) + ' %') : null),
      action);

    // ordre du DOM : la façade (titre) d'abord pour la lecture ; les feuilles, en absolu, passent dessous
    card.append(...[
      h('span.fiche-back', { 'aria-hidden': 'true' }),
      st.nodes > 1 ? h('span.fiche-sheet', { 'aria-hidden': 'true' }) : null,
      h('div.fiche-front', { dataset: { hero: 'course:' + c.id + ':band' } }, band, foot),
      paper].filter(Boolean));
    card.fold = foldGestures(card);
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
          h('a.topbar-brand', { href: '#/' }, R.app.logo(), h('span.brand-name', 'Pioneer')),
          h('div.topbar-actions',
            streakChip(),
            ui.iconBtn('search', { title: 'Rechercher', onClick: (e) => R.search.open('', { from: e.currentTarget }) }),
            ui.iconBtn('settings', { title: 'Réglages', onClick: () => R.app.openSettings() })));

        const grid = h('div.course-grid');
        courses.forEach((c) => grid.appendChild(courseCard(c, draw)));
        // pas de tuile « Nouveau cours » : le + (téléphone) et le rail (ordinateur) la portent déjà
        if (intro) R.motion.stagger(Array.from(grid.children), 1);
        // les premiers dossiers s'ouvrent l'un après l'autre, le temps de montrer ce qu'ils rangent
        if (intro && !R.motion.reduced()) Array.from(grid.querySelectorAll('.fiche')).slice(0, 6).forEach((f, i) => f.fold.demo(420 + i * 120));

        const recents = S.recentMaps(5);
        const main = h('div.lib-main',
          h('div.hero',
            h('p.hero-date', dateStr[0].toUpperCase() + dateStr.slice(1)),
            h('h1.hero-title', greet)),
          sessionHero(intro),
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
