/* Ratio — noyau : routeur, navigation globale, thème, réglages, onboarding */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;

  const app = { current: null, route: null, fab: null };

  /* ------------------------------------------------------------------ */
  /* Routeur (hash)                                                     */
  /* ------------------------------------------------------------------ */
  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const p = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (p[0] === 'cours' && p[1]) return { name: 'course', id: p[1], q };
    if (p[0] === 'carte' && p[1]) return { name: 'editor', id: p[1], mode: p[2] === 'plan' ? 'plan' : 'map', q };
    if (p[0] === 'reviser') {
      const scope = p[1] === 'cours' ? { courseId: p[2] } : p[1] === 'carte' ? (p[3] ? { mapId: p[2], nodeId: p[3] } : { mapId: p[2] }) : {};
      return { name: 'review', scope, q };
    }
    return { name: 'library', q };
  }

  const DEPTH = { library: 0, course: 1, review: 1, editor: 2 };
  const IMMERSIVE = new Set(['editor', 'review']);

  app.go = (hash, { replace } = {}) => {
    if (replace) { history.replaceState(null, '', hash); render(); }
    else if (location.hash === hash) render();
    else location.hash = hash;
  };
  app.back = (fallback = '#/') => {
    if (app.canGoBack) history.back();
    else app.go(fallback, { replace: true });
  };

  let navCount = 0;
  window.addEventListener('hashchange', () => { navCount++; app.canGoBack = navCount > 0; render(); });

  /* ---- Transitions de page ---------------------------------------------
     Hiérarchie (Cours → Cours › Carte) = axe Z : on « entre dans » l'élément.
     Élément partagé (container transform) : la carte cliquée devient l'en-tête
     ou le canvas de la page suivante, et inversement au retour (View Transitions).
     Repli sans View Transitions : axe Z simple (scale + fondu). */
  const supportsVT = typeof document.startViewTransition === 'function';
  let vtRunning = null;
  const entityOf = (r) => {
    if (!r) return null;
    if (r.name === 'course') return 'course:' + r.id;
    if (r.name === 'editor') return 'map:' + r.id;
    // révision lancée depuis la fiche d'un cours : la fiche devient la carte de révision
    if (r.name === 'review' && r.q && r.q.start) return 'fiche:' + String(r.q.start).split('.')[1];
    return null;
  };

  /** Nomme les éléments « héros » d'une page pour une clé d'entité (un seul par rôle) */
  function nameHeroes(container, key) {
    if (!container || !key) return [];
    const named = [];
    const used = new Set();
    for (const el of U.$$(`[data-hero^="${key}:"]`, container)) {
      const part = el.dataset.hero.split(':')[2];
      if (used.has(part) || !el.getClientRects().length) continue;
      used.add(part);
      el.style.viewTransitionName = 'hero-' + part;
      named.push(el);
    }
    return named;
  }

  function render() {
    const route = parse();
    const prev = app.route;
    ui.closeMenu();
    ui.hideTip();
    // même vue, autre paramètre (ex. Carte ↔ Plan) : mise à jour sans remonter
    if (prev && app.current && prev.name === route.name && route.id && prev.id === route.id && app.current.update) {
      app.route = route;
      app.current.update(route);
      updateNav(route);
      return;
    }
    const dir = prev ? Math.sign((DEPTH[route.name] ?? 0) - (DEPTH[prev.name] ?? 0)) : 0;
    const host = U.$('#view');
    const useVT = !!prev && supportsVT && !U.reducedMotion() && !document.hidden;

    if (!useVT) { mountRoute(route, prev, dir, false); return; }

    if (vtRunning) { try { vtRunning.skipTransition(); } catch (e) { /* ignore */ } }
    const root = document.documentElement;
    root.dataset.vt = dir > 0 ? 'forward' : dir < 0 ? 'back' : 'peer';
    // en avançant, le héros est la destination ; en reculant, ce que l'on quitte
    const key = dir >= 0 ? entityOf(route) : entityOf(prev);
    const oldNamed = nameHeroes(host.querySelector('.page-wrap'), key);
    let newNamed = [];
    const vt = document.startViewTransition(() => {
      oldNamed.forEach((el) => { el.style.viewTransitionName = ''; });
      const page = mountRoute(route, prev, dir, true);
      // ne garder que les paires présentes des deux côtés
      newNamed = nameHeroes(page, key);
    });
    vtRunning = vt;
    vt.finished.finally(() => {
      newNamed.forEach((el) => { el.style.viewTransitionName = ''; });
      if (vtRunning === vt) { vtRunning = null; delete root.dataset.vt; }
    });
  }

  function mountRoute(route, prev, dir, viaVT) {
    const view = R.views[route.name];
    const host = U.$('#view');
    if (app.current && app.current.unmount) app.current.unmount();
    for (const old of U.$$('.page-wrap', host)) {
      if (viaVT) { old.remove(); continue; }
      if (old.classList.contains('leaving')) continue;
      old.classList.add('leaving');
      old.style.setProperty('--dir', dir);
      setTimeout(() => old.remove(), 170);
    }
    const page = h('div.page-wrap', { style: { '--dir': dir } });
    if (prev && !viaVT) page.classList.add('entering');
    host.appendChild(page);
    app.setFab(null);
    app.route = route;
    document.body.dataset.route = route.name;
    document.body.classList.toggle('immersive', IMMERSIVE.has(route.name));
    if (prev) host.focus({ preventScroll: true });
    app.current = view.mount(page, route) || {};
    updateNav(route);
    if (prev && !viaVT) setTimeout(() => page.classList.remove('entering'), 400);
    return page;
  }

  /* ------------------------------------------------------------------ */
  /* Navigation globale (rail / barre basse)                            */
  /* ------------------------------------------------------------------ */
  const DESTS = [
    { key: 'library', label: 'Cours', icon: 'library', href: '#/' },
    { key: 'review', label: 'Réviser', icon: 'cards', href: '#/reviser' },
    { key: 'search', label: 'Rechercher', icon: 'search', action: () => R.search.open(), kbd: `${U.mod} K` },
  ];

  function buildNav() {
    const rail = U.$('#rail');
    const bar = U.$('#navbar');
    U.clear(rail); U.clear(bar);

    rail.appendChild(h('a.rail-brand', { href: '#/', 'aria-label': 'Ratio — accueil' }, logo()));
    rail.appendChild(h('div.rail-fab-slot#rail-fab'));
    const railItems = h('div.rail-items');
    for (const d of DESTS) {
      railItems.appendChild(navItem(d, 'rail'));
      bar.appendChild(navItem(d, 'bar'));
    }
    rail.appendChild(railItems);
    rail.appendChild(h('div.rail-spacer'));
    rail.appendChild(ui.iconBtn('settings', { title: 'Réglages', onClick: openSettings, cls: 'rail-settings' }));
  }

  function navItem(d, kind) {
    const el = h(d.href ? 'a.nav-item' : 'button.nav-item', {
      href: d.href, type: d.href ? null : 'button', dataset: { key: d.key },
      'data-tip': kind === 'rail' && d.kbd ? d.label : null, 'data-kbd': kind === 'rail' ? d.kbd : null,
    });
    if (d.action) el.addEventListener('click', d.action);
    el.appendChild(h('span.nav-indicator', R.icon(d.icon, 24), h('span.nav-badge', { hidden: true })));
    el.appendChild(h('span.nav-label', d.label));
    return el;
  }

  function updateNav(route = app.route) {
    if (!route) return;
    const active = route.name === 'review' ? 'review' : route.name === 'library' || route.name === 'course' ? 'library' : '';
    for (const el of U.$$('.nav-item')) {
      const on = el.dataset.key === active;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    }
    const due = S.dueCount();
    const label = due > 99 ? '99+' : String(due);
    for (const b of U.$$('.nav-item[data-key="review"] .nav-badge')) {
      const changed = b.textContent !== label;
      b.hidden = !due;
      b.textContent = label;
      // value change : le badge « pop » seulement quand son nombre change
      if (changed && due && b.dataset.ready && !U.reducedMotion()) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
      b.dataset.ready = '1';
    }
  }
  app.updateNav = updateNav;

  /** FAB contextuel (rail sur grand écran, flottant sur mobile) */
  app.setFab = function (cfg) {
    app.fab = cfg;
    const slot = U.$('#rail-fab');
    U.clear(slot);
    const old = U.$('#fab-float');
    if (old) old.remove();
    if (!cfg) return;
    const mk = (extended) => {
      const b = h('button.fab', { type: 'button', 'aria-label': cfg.label, 'data-tip': extended ? null : cfg.label, onclick: cfg.onClick });
      b.appendChild(R.icon(cfg.icon || 'plus', 24));
      if (extended) b.appendChild(h('span.fab-label', cfg.label));
      return b;
    };
    slot.appendChild(mk(false));
    const f = mk(true);
    f.id = 'fab-float';
    f.classList.add('fab-float', 'fab-extended');
    U.$('#app').appendChild(f);
  };

  function logo() {
    const s = h('span.logo', { 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32"><rect x="2" y="2" width="28" height="28" rx="9" style="fill:var(--primary)"/><text x="16" y="23" text-anchor="middle" style="fill:var(--on-primary);font:600 20px \'Source Serif 4\', Georgia, serif">R</text><rect x="9" y="25" width="14" height="2" rx="1" style="fill:var(--on-primary)"/></svg>';
    return s;
  }
  app.logo = logo;

  let lastScroll = 0;
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.classList.contains('page-scroll')) return;
    const f = U.$('#fab-float');
    const y = t.scrollTop, d = y - lastScroll;
    lastScroll = y;
    if (!f || Math.abs(d) < 6) return;
    f.classList.toggle('hide', d > 0 && y > 80);
  }, true);

  /* ------------------------------------------------------------------ */
  /* Thème                                                              */
  /* ------------------------------------------------------------------ */
  function applyTheme() {
    const t = S.data.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const m of U.$$('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#121211' : '#f5f4ef');
  }
  app.setTheme = (t, origin) => {
    const apply = () => { S.data.settings.theme = t; S.changed('settings'); applyTheme(); };
    if (!origin || !supportsVT || U.reducedMotion()) { apply(); return; }
    const root = document.documentElement;
    const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    root.style.setProperty('--vx', origin.x + 'px');
    root.style.setProperty('--vy', origin.y + 'px');
    root.style.setProperty('--vr', r + 'px');
    root.dataset.vt = 'theme';
    const vt = document.startViewTransition(apply);
    vt.finished.finally(() => { if (root.dataset.vt === 'theme') delete root.dataset.vt; });
  };

  /* ---- Mouvement : réglage de l'app > préférence système ---------------- */
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  function applyMotion() {
    const m = S.data.settings.motion || 'system';
    document.documentElement.dataset.motion = m === 'system' ? (mqReduce.matches ? 'reduce' : 'full') : m;
  }
  app.setMotion = (m) => { S.data.settings.motion = m; S.changed('settings'); applyMotion(); };
  mqReduce.addEventListener('change', applyMotion);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  /* ------------------------------------------------------------------ */
  /* Réglages                                                           */
  /* ------------------------------------------------------------------ */
  function openSettings() {
    const makeSeg = (label, key, options, current, onPick) => {
      const seg = h('div.segmented', { role: 'radiogroup', 'aria-label': label });
      for (const [v, text, icon] of options) {
        const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(current === v) }, R.icon(icon, 18), h('span', text));
        b.addEventListener('click', (e) => {
          U.$$('.seg-btn', seg).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          seg._place();
          onPick(v, e);
        });
        seg.appendChild(b);
      }
      ui.segIndicator(seg, key);
      return seg;
    };
    const seg = makeSeg('Thème', 'settings-theme', [['system', 'Système', 'panel'], ['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon']],
      S.data.settings.theme, (v, e) => app.setTheme(v, { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 }));
    const motionSeg = makeSeg('Animations', 'settings-motion', [['system', 'Système', 'panel'], ['reduce', 'Réduites', 'pause'], ['full', 'Complètes', 'sparkle']],
      S.data.settings.motion || 'system', (v) => app.setMotion(v));

    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const text = await f.text();
      const mode = await ui.dialog({
        title: 'Importer la sauvegarde', icon: 'upload',
        body: h('p.dialog-text', 'Fusionner avec tes données actuelles, ou tout remplacer par le fichier ?'),
        actions: [
          { label: 'Annuler', value: null },
          { label: 'Remplacer', value: 'replace', variant: 'outlined' },
          { label: 'Fusionner', value: 'merge', variant: 'filled', primary: true },
        ],
      });
      if (!mode) return;
      try {
        const r = S.importData(text, mode);
        ui.snack(`Import réussi · ${U.plural(r.courses, 'cours', 'cours')}, ${U.plural(r.maps, 'carte')}`);
        closeFn && closeFn();
        app.go('#/', { replace: true });
      } catch (e) {
        ui.snack('Fichier illisible : ce n’est pas une sauvegarde Ratio.');
      }
    });

    const colorsP = h('p.settings-p');
    const paintColorsP = () => {
      const c = R.colors.settings();
      const names = { familles: 'une couleur par famille de types', daltonisme: 'palette adaptée au daltonisme', perso: 'tes couleurs personnalisées' };
      colorsP.textContent = c.mode === 'off'
        ? 'Monochrome (réglage d’origine) : les types se distinguent par leur forme. Option pour repérer les types d’un coup d’œil.'
        : `Actives : ${names[c.mode]}, intensité ${c.intensity === 'vif' ? 'vive' : 'douce'}. Le texte reste toujours lisible.`;
    };
    paintColorsP();
    const usageP = h('p.settings-p', 'Tout est enregistré sur cet appareil. Exporte régulièrement une sauvegarde.');
    S.usage().then((u) => {
      const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko');
      const where = u.backend === 'indexeddb' ? 'base locale du navigateur' : 'stockage local (limité à ~5 Mo)';
      usageP.textContent = `Tout est enregistré sur cet appareil : ${size(u.bytes)} dans la ${where}${u.quota ? ` · ${size(u.quota)} disponibles` : ''}. Exporte régulièrement une sauvegarde.`;
    });

    const body = h('div.settings',
      h('section.settings-sec',
        h('h3.settings-h', 'Apparence'),
        seg),
      h('section.settings-sec',
        h('h3.settings-h', 'Animations'),
        motionSeg,
        h('p.settings-p', '« Réduites » remplace les déplacements et zooms par des fondus courts.')),
      h('section.settings-sec',
        h('h3.settings-h', 'Couleurs des nœuds'),
        colorsP,
        h('div.settings-row', ui.btn('Personnaliser les couleurs', { icon: 'palette', variant: 'tonal', onClick: () => R.colors.openDialog().then(paintColorsP) }))),
      h('section.settings-sec',
        h('h3.settings-h', 'Données'),
        usageP,
        h('div.settings-row',
          ui.btn('Exporter la sauvegarde', { icon: 'download', variant: 'tonal', onClick: () => {
            U.download(`ratio-sauvegarde-${U.dayKey()}.json`, S.exportAll());
            ui.snack('Sauvegarde téléchargée');
          } }),
          ui.btn('Importer', { icon: 'upload', variant: 'outlined', onClick: () => fileInput.click() }),
          fileInput)),
      h('section.settings-sec',
        h('h3.settings-h', 'Aide'),
        h('div.settings-row',
          ui.btn('Raccourcis clavier', { icon: 'keyboard', variant: 'text', onClick: () => { closeFn(); setTimeout(showShortcuts, 220); } }),
          ui.btn('Revoir le guide', { icon: 'help', variant: 'text', onClick: () => { closeFn(); setTimeout(onboarding, 220); } }))),
      h('section.settings-sec.settings-danger',
        h('h3.settings-h', 'Zone sensible'),
        ui.btn('Tout effacer', { icon: 'trash', variant: 'text', cls: 'danger', onClick: async () => {
          const ok = await ui.confirm('Tout effacer ?', 'Tous les cours, cartes et notes de cet appareil seront supprimés. Exporte une sauvegarde avant si besoin.', { ok: 'Tout effacer', danger: true, icon: 'trash' });
          if (!ok) return;
          S.reset();
          closeFn && closeFn();
          app.go('#/', { replace: true });
          ui.snack('Données effacées');
        } })),
      h('p.settings-foot', 'Ratio · fonctionne hors-ligne · installable sur Android et desktop'));

    let closeFn = null;
    ui.dialog({ title: 'Réglages', icon: 'settings', body, cls: 'dialog-settings', actions: [{ label: 'Fermer', value: true, variant: 'text' }], onOpen: (_, close) => { closeFn = close; } });
  }
  app.openSettings = openSettings;

  /* ------------------------------------------------------------------ */
  /* Raccourcis                                                         */
  /* ------------------------------------------------------------------ */
  function showShortcuts() {
    const m = U.mod;
    const groups = [
      ['Partout', [[`${m} K`, 'Rechercher'], ['?', 'Afficher les raccourcis']]],
      ['Carte', [
        ['Tab', 'Ajouter un enfant (décomposer)'], ['Entrée', 'Ajouter un frère'], ['F2 · double-clic', 'Renommer'],
        ['Espace · 2e clic', 'Ouvrir la note (ou toucher son icône sur le nœud)'], ['Suppr', 'Supprimer'], ['← ↑ → ↓', 'Naviguer entre les nœuds'],
        ['L', 'Relier à un ou plusieurs nœuds (Entrée pour terminer)'], ['.', 'Replier / déplier'], [`${m} Z · ${m} ⇧ Z`, 'Annuler · Rétablir'],
        ['R', 'Ranger la carte'], ['F', 'Ajuster à l’écran'], ['+ / −', 'Zoom'], ['H', 'Mode masqué (révision)'],
        ['1 … 9', 'Changer le type du nœud'], ['Alt 1 · 2 · 3', 'Chapitre · Leçon · Section'], ['P', 'Basculer Carte / Plan'],
      ]],
      ['Révision', [['Espace', 'Afficher la réponse'], ['1 · 2 · 3', 'À revoir · Compris · Maîtrisé']]],
    ];
    const body = h('div.shortcuts', groups.map(([g, rows]) => h('section',
      h('h3.settings-h', g),
      h('dl.kbd-list', rows.map(([k, d]) => [h('dt', k.split(' · ').map((x, i) => [i ? ' · ' : '', h('kbd', x)])), h('dd', d)])))));
    ui.dialog({ title: 'Raccourcis clavier', icon: 'keyboard', body, cls: 'dialog-wide', actions: [{ label: 'OK', value: true, variant: 'filled' }] });
  }
  app.showShortcuts = showShortcuts;

  /* ------------------------------------------------------------------ */
  /* Onboarding — 3 écrans, pas plus (Miller / Lean)                    */
  /* ------------------------------------------------------------------ */
  function onboarding() {
    const steps = [
      { icon: 'folder', title: 'Range par cours', text: 'Un cours = un dossier. Tu y ranges toutes les cartes du même enseignement : droit des obligations, droit administratif…' },
      { icon: 'child', title: 'Décompose chaque notion', text: 'Une carte part d’une notion et se décompose : définition, conditions de fond et de forme (cumulatives ET / alternatives OU), exceptions, jurisprudence. Chaque nœud a sa note.' },
      { icon: 'cards', title: 'Révise en rappel actif', text: 'Ratio transforme tes cartes en questions. Tu notes ta réponse — À revoir, Compris, Maîtrisé — et la répétition espacée te les représente au bon moment.' },
    ];
    let i = 0, busy = false;
    const art = h('div.onb-art');
    const title = h('h2.onb-title');
    const text = h('p.onb-text');
    const dots = h('div.onb-dots', steps.map(() => h('span.onb-dot')));
    const body = h('div.onb', art, title, text, dots);
    const paint = (d) => {
      const s = steps[i];
      body.style.setProperty('--d', d || 0);
      body.classList.remove('swap');
      void body.offsetWidth;
      body.classList.add('swap');
      U.clear(art).appendChild(R.icon(s.icon, 40));
      title.textContent = s.title;
      text.textContent = s.text;
      U.$$('.onb-dot', dots).forEach((dot, k) => dot.classList.toggle('on', k === i));
      next.querySelector('.btn-label').textContent = i === steps.length - 1 ? 'Commencer' : 'Suivant';
    };
    /* Étapes = pairs : axe X. L'ancien contenu part (100 ms, ease-in), le nouveau
       arrive du côté où l'on va (240 ms, ease-out) — sortie avant entrée. */
    const go = (to) => {
      if (busy || to === i || to < 0 || to >= steps.length) return;
      const d = Math.sign(to - i);
      i = to;
      if (R.motion.reduced()) { paint(d); return; }
      busy = true;
      const kids = [art, title, text];
      Promise.all(kids.map((k) => k.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${-d * 16}px 0` }],
        { duration: 100, easing: R.motion.css.in, fill: 'forwards' }).finished))
        .then(() => { kids.forEach((k) => k.getAnimations().forEach((a) => a.cancel())); paint(d); busy = false; });
    };
    const next = ui.btn('Suivant', { variant: 'filled' });
    const skip = ui.btn('Passer', { variant: 'text' });
    ui.dialog({
      body: h('div', body, h('div.dialog-actions', skip, next)), cls: 'dialog-onb', dismissible: true,
      onOpen: (box, close) => {
        paint(0);
        next.addEventListener('click', () => { if (i < steps.length - 1) go(i + 1); else close(true); });
        skip.addEventListener('click', () => close(true));
        box.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
        });
        // swipe horizontal entre les étapes
        let sx = null;
        body.addEventListener('pointerdown', (e) => { sx = e.clientX; });
        body.addEventListener('pointerup', (e) => {
          if (sx == null) return;
          const dx = e.clientX - sx; sx = null;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        });
        next.focus();
      },
    }).then(() => {
      S.data.settings.onboarded = true;
      S.changed('settings');
    });
  }
  app.onboarding = onboarding;

  /* ------------------------------------------------------------------ */
  /* Clavier global                                                     */
  /* ------------------------------------------------------------------ */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); R.search.open(); return; }
    if (e.key === '?' && !U.isTyping() && !U.$('.dialog')) { e.preventDefault(); showShortcuts(); }
  });

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                          */
  /* ------------------------------------------------------------------ */
  app.start = async function () {
    try { await S.load(); } catch (e) { /* stockage illisible : l'app démarre quand même (données vides) */ }
    applyTheme();
    R.colors.apply();
    applyMotion();
    if (S.fresh) R.seed();
    buildNav();
    const navLater = U.debounce(() => updateNav(), 800);
    S.on((type) => {
      if (type === 'change' || type === 'review' || type === 'import') updateNav();
      if (type === 'edit') navLater();
      if (type === 'saved' && S.saveError) ui.snack('Stockage plein : exporte une sauvegarde puis libère de la place.', { duration: 8000 });
    });
    render();
    document.body.classList.add('ready');
    if (!S.data.settings.onboarded) setTimeout(onboarding, 450);

    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  };

  R.app = app;
  R.views = R.views || {};
  document.addEventListener('DOMContentLoaded', () => app.start());
})(window.R);
