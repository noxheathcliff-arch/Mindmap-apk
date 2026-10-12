/* Ratio — noyau : routeur, navigation globale, thème, réglages, onboarding */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;

  const app = { current: null, route: null, fab: null, actions: null };

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
      // #/reviser : le tableau de bord (onglet) ; #/reviser/tout : une session tous cours
      if (!p[1] && !q.all) return { name: 'reviewHub', q };
      const scope = p[1] === 'cours' ? { courseId: p[2] } : p[1] === 'carte' ? (p[3] ? { mapId: p[2], nodeId: p[3] } : { mapId: p[2] }) : {};
      return { name: 'review', scope, q };
    }
    return { name: 'library', q };
  }

  const DEPTH = { library: 0, reviewHub: 0, course: 1, review: 1, editor: 2 };
  const IMMERSIVE = new Set(['editor', 'review']);

  /* from : élément hors de la page (ex. une ligne de la recherche) qui porte les héros de
     départ ; swap(viaVT) : appelé au moment de l'échange de page, pour retirer cet élément
     de la capture « après » (viaVT = true) ou le fermer normalement (false). */
  let pendingNav = null;
  app.go = (hash, { replace, from, swap } = {}) => {
    pendingNav = from || swap ? { from, swap } : null;
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
    // session d'un cours : la ligne du cours (Réviser) ou l'en-tête du cours devient la bande de la fiche
    if (r.name === 'review' && r.scope && r.scope.courseId) return 'course:' + r.scope.courseId;
    // session tous cours : le bloc « Commencer » devient la première fiche
    if (r.name === 'review' && r.scope && !r.scope.mapId) return 'session:all';
    return null;
  };

  /** Nomme les éléments « héros » d'une page pour une clé d'entité (un seul par rôle) */
  function nameHeroes(container, key) {
    if (!container || !key) return [];
    const named = [];
    const used = new Set();
    const sel = `[data-hero^="${key}:"]`;
    const els = U.$$(sel, container);
    if (container.matches && container.matches(sel)) els.unshift(container); // le conteneur peut être lui-même un héros
    for (const el of els) {
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
    const nav = pendingNav;
    pendingNav = null;
    const swap = (viaVT) => { if (nav && nav.swap) nav.swap(viaVT); };
    ui.closeMenu();
    ui.hideTip();
    // même vue, autre paramètre (ex. Carte ↔ Plan) : mise à jour sans remonter
    if (prev && app.current && prev.name === route.name && route.id && prev.id === route.id && app.current.update) {
      swap(false);
      app.route = route;
      app.current.update(route);
      updateNav(route);
      return;
    }
    const dir = prev ? Math.sign((DEPTH[route.name] ?? 0) - (DEPTH[prev.name] ?? 0)) : 0;
    const host = U.$('#view');
    const useVT = !!prev && supportsVT && !U.reducedMotion() && !document.hidden;

    if (!useVT) { swap(false); mountRoute(route, prev, dir, false); return; }

    if (vtRunning) { try { vtRunning.skipTransition(); } catch (e) { /* ignore */ } }
    const root = document.documentElement;
    root.dataset.vt = dir > 0 ? 'forward' : dir < 0 ? 'back' : 'peer';
    // en avançant, le héros est la destination ; en reculant, ce que l'on quitte
    const key = dir >= 0 ? entityOf(route) : entityOf(prev);
    const oldNamed = nameHeroes((nav && nav.from && nav.from.isConnected) ? nav.from : host.querySelector('.page-wrap'), key);
    let newNamed = [];
    const vt = document.startViewTransition(() => {
      oldNamed.forEach((el) => { el.style.viewTransitionName = ''; });
      swap(true);
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
    app.setActions(null);
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
    { key: 'search', label: 'Rechercher', icon: 'search', action: (e) => R.search.open('', { from: e.currentTarget }), kbd: `${U.mod} K` },
  ];

  /* Navigation (M3 Expressive, direction « Barre contextuelle ») :
     · compact (< 600) : barre d'outils flottante en bas (navigation) dans un dock, avec le FAB
       ou les actions de la page ;
     · medium / expanded (600–1199) : rail replié 80 dp, FAB en haut ;
     · large (≥ 1200) : rail étendu 260 dp, Extended FAB, et la liste des cours (dossiers).
     Les actions propres à une page vivent dans une barre flottante contextuelle (setActions). */
  function buildNav() {
    const rail = U.$('#rail');
    const bar = U.$('#navbar');
    U.clear(rail); U.clear(bar);

    rail.appendChild(h('a.rail-brand', { href: '#/', 'aria-label': 'Ratio — accueil' }, logo(), h('span.rail-brand-name', 'Ratio')));
    rail.appendChild(h('div.rail-fab-slot#rail-fab'));
    const railItems = h('div.rail-items');
    for (const d of DESTS) railItems.appendChild(navItem(d, 'rail'));
    /* barre flottante (compact) : Cours · action principale au centre · Réviser. La recherche
       n'y figure pas : elle est déjà dans la barre haute de chaque page principale. */
    for (const d of DESTS.filter((x) => x.key !== 'search')) {
      if (bar.children.length === 1) bar.appendChild(h('div.nav-center#nav-center'));
      bar.appendChild(navItem(d, 'bar'));
    }
    rail.appendChild(railItems);
    rail.appendChild(h('div.rail-courses#rail-courses', { role: 'group', 'aria-label': 'Mes cours' }));
    rail.appendChild(h('div.rail-spacer'));
    const set = h('button.nav-item.rail-settings', { type: 'button', 'data-tip': 'Réglages', onclick: openSettings },
      h('span.nav-indicator', R.icon('settings', 24)), h('span.nav-label', 'Réglages'));
    rail.appendChild(set);

    // dock (compact) : la barre de navigation flottante + le FAB ou les actions de la page
    let dock = U.$('#dock');
    if (!dock) { dock = h('div.dock#dock'); U.$('#app').appendChild(dock); }
    dock.appendChild(bar);
    if (!U.$('#ctxbar')) dock.appendChild(h('div.ctxbar#ctxbar', { role: 'toolbar', 'aria-label': 'Actions de la page', hidden: true }));
    railCourses();
  }

  /* Rail étendu : un dossier par cours, son nombre de fiches dues, le cours courant surligné */
  function railCourses(route = app.route) {
    const box = U.$('#rail-courses');
    if (!box) return;
    U.clear(box);
    const courses = S.coursesSorted();
    if (!courses.length) return;
    box.appendChild(h('p.rail-sec', 'Mes cours'));
    const cur = route && (route.name === 'course' ? route.id : route.name === 'editor' ? (S.map(route.id) || {}).courseId : route.name === 'review' && route.scope ? route.scope.courseId : null);
    for (const c of courses) {
      const due = S.courseStats(c.id).due;
      const a = h('a.rail-course', { href: '#/cours/' + c.id, class: c.id === cur ? 'active' : '', 'aria-current': c.id === cur ? 'page' : null },
        R.courseArt.dot(c), h('span.rail-course-t', c.title), due ? h('span.rail-course-n', String(due)) : null);
      box.appendChild(a);
    }
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
    const active = route.name === 'review' || route.name === 'reviewHub' ? 'review' : route.name === 'library' || route.name === 'course' ? 'library' : '';
    railCourses(route);
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
  const updateCourses = U.debounce(() => railCourses(), 120);

  /** FAB contextuel : dans le rail (Extended FAB quand le rail est étendu), à côté de la barre
      flottante sur compact (FAB simple : M3 n'associe jamais un Extended FAB à une toolbar). */
  app.setFab = function (cfg) {
    app.fab = cfg;
    const slot = U.$('#rail-fab');
    U.clear(slot);
    const old = U.$('#fab-float');
    if (old) old.remove();
    if (!cfg) return;
    const rb = h('button.fab.fab-rail', { type: 'button', 'aria-label': cfg.label, 'data-tip': cfg.label, onclick: cfg.onClick });
    rb.append(R.icon(cfg.icon || 'plus', 24), h('span.fab-label', cfg.label));
    slot.appendChild(rb);
    // compact : le FAB prend le centre de la barre flottante
    const f = h('button.fab.fab-float.nav-fab#fab-float', { type: 'button', 'aria-label': cfg.label, 'data-tip': cfg.label, onclick: cfg.onClick }, R.icon(cfg.icon || 'plus', 24));
    (U.$('#nav-center') || U.$('#dock') || U.$('#app')).appendChild(f);
    syncDock();
  };

  /** Barre d'actions contextuelle (floating toolbar M3) : les actions de la page courante.
      cfg = { items: [{ icon, label, onClick, href, primary, cls, count }], vibrant, style } ;
      primary = une seule action en forte emphase (bouton plein). Sur compact, elle rejoint la
      barre de navigation dans le dock ; replaceNav : elle la remplace (pages de détail). */
  app.setActions = function (cfg) {
    app.actions = cfg;
    const bar = U.$('#ctxbar');
    if (!bar) return;
    U.clear(bar);
    bar.removeAttribute('style');
    bar.className = 'ctxbar';
    centerAction(cfg);
    if (!cfg || !cfg.items || !cfg.items.length) { bar.hidden = true; syncDock(); return; }
    if (cfg.vibrant) bar.classList.add('vibrant');
    // barre teintée par un cours : ses rôles Material remplacent ceux de l'app (zone du cours)
    if (cfg.course) { R.courseArt.tint(bar, cfg.course); bar.classList.add('course-scope'); }
    if (cfg.style) for (const [k, v] of Object.entries(cfg.style)) bar.style.setProperty(k, v);
    for (const it of cfg.items) {
      let el;
      if (it.primary) {
        el = h(it.href ? 'a.btn.btn-filled.ctx-primary' : 'button.btn.btn-filled.ctx-primary', { type: it.href ? null : 'button', href: it.href || null, class: it.cls || '' },
          R.icon(it.icon, 20), h('span.ctx-primary-l', it.label), it.short ? h('span.ctx-primary-s', it.short) : null);
        if (it.short) el.classList.add('has-short');
      } else {
        el = h(it.href ? 'a.icon-btn.ctx-ic' : 'button.icon-btn.ctx-ic', { type: it.href ? null : 'button', href: it.href || null, 'aria-label': it.label, 'data-tip': it.label, class: it.cls || '' }, R.icon(it.icon, 24));
      }
      if (it.onClick) el.addEventListener('click', (e) => it.onClick(e, el));
      if (it.disabled) { el.setAttribute('aria-disabled', 'true'); el.disabled = true; }
      bar.appendChild(el);
    }
    bar.hidden = false;
    syncDock();
  };

  /** Compact : une page dont la seule action est l'action principale (Réviser › Commencer) la
      place au centre de la barre flottante, à la place du FAB ; la barre contextuelle reste
      pour les écrans larges. */
  function centerAction(cfg) {
    const slot = U.$('#nav-center');
    if (!slot) return;
    const old = slot.querySelector('.nav-cta');
    const had = !!old;
    if (old) old.remove();
    const it = cfg && !cfg.replaceNav && cfg.items && cfg.items.length === 1 && cfg.items[0].primary ? cfg.items[0] : null;
    slot.closest('.navbar').classList.toggle('has-cta', !!it);
    if (!it) return;
    const el = h(it.href ? 'a.nav-cta' : 'button.nav-cta', { type: it.href ? null : 'button', href: it.href || null, class: it.cls || '', 'aria-label': it.label },
      R.icon(it.icon, 22), h('span.nav-cta-l', it.short || it.label));
    if (it.onClick) el.addEventListener('click', (e) => it.onClick(e, el));
    // une mise à jour (même page) ne rejoue pas l'entrée : seul le libellé « tique »
    if (had) el.classList.add('no-enter');
    slot.appendChild(el);
  }

  /** État du dock : sur compact, la barre d'actions remplace la navigation (replaceNav) ou s'y ajoute ;
      le FAB s'efface quand la page a déjà son action principale dans la barre. */
  function syncDock() {
    const dock = U.$('#dock');
    if (!dock) return;
    const cfg = app.actions;
    const has = !!(cfg && cfg.items && cfg.items.length);
    dock.classList.toggle('has-actions', has);
    dock.classList.toggle('replace-nav', has && !!cfg.replaceNav);
    document.body.classList.toggle('has-ctxbar', has);
  }

  function logo() {
    const s = h('span.logo', { 'aria-hidden': 'true' });
    // l'initiale sur un carré arrondi primary (le dossier reste réservé aux cours de « Mes cours »)
    s.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32"><rect x="2" y="2" width="28" height="28" rx="9" style="fill:var(--primary)"/><text x="16" y="22.5" text-anchor="middle" style="fill:var(--on-primary);font:800 17px \'Plus Jakarta Sans\', system-ui, sans-serif">R</text></svg>';
    return s;
  }
  app.logo = logo;

  let lastScroll = 0;
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.classList.contains('page-scroll')) return;
    // M3 : la barre flottante sort de l'écran au défilement vers le bas et revient en remontant
    // (elle sort OU se replie, jamais les deux)
    const f = U.$('#dock');
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
    for (const m of U.$$('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#131318' : '#fbf8ff');
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

    const colorsP = h('span.set-d');
    const paintColorsP = () => {
      const c = R.colors.settings();
      const names = { familles: 'une couleur par famille', daltonisme: 'palette daltonisme', perso: 'couleurs personnalisées' };
      colorsP.textContent = c.mode === 'off' ? 'Monochrome : les types se distinguent par leur forme.' : `Actives : ${names[c.mode]}, intensité ${c.intensity === 'vif' ? 'vive' : 'douce'}.`;
    };
    paintColorsP();

    /* Données : jauge de stockage + date de la dernière sauvegarde (rappel au-delà de 14 jours) */
    const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko');
    const meter = h('span.set-meter', h('i'));
    const usageD = h('span.set-d', 'Calcul…');
    S.usage().then((u) => {
      const where = u.backend === 'indexeddb' ? 'base locale du navigateur' : 'stockage local (≈ 5 Mo)';
      usageD.textContent = `${size(u.bytes)} utilisés${u.quota ? ` sur ${size(u.quota)}` : ''} · ${where}`;
      meter.firstChild.style.transform = `scaleX(${u.quota ? Math.min(1, Math.max(0.01, u.bytes / u.quota)) : 0.02})`;
    });
    const last = S.data.settings.lastExport;
    const lastDays = last ? Math.floor((Date.now() - last) / U.DAY) : null;
    const lastD = h('span.set-d', { class: last && lastDays < 14 ? '' : 'warn' },
      last ? `Dernière sauvegarde ${U.relTime(last)}${lastDays >= 14 ? ' — pense à en refaire une' : ''}` : 'Aucune sauvegarde exportée pour l’instant');

    const row = (icon, title, desc, control, cls = '') => h('div.set-row', { class: cls },
      h('span.set-ic', R.icon(icon, 20)),
      h('span.set-txt', h('span.set-t', title), desc || null),
      control ? h('span.set-ctl', control) : null);

    const body = h('div.settings',
      h('section.set-group', h('h3.settings-h', 'Apparence'),
        h('div.set-card',
          row('sun', 'Thème', null, seg, 'stack'),
          row('sparkle', 'Animations', h('span.set-d', '« Réduites » remplace déplacements et zooms par des fondus courts.'), motionSeg, 'stack'),
          row('palette', 'Couleurs des nœuds', colorsP, ui.btn('Personnaliser', { variant: 'tonal', onClick: () => R.colors.openDialog().then(paintColorsP) })))),
      h('section.set-group', h('h3.settings-h', 'Données'),
        h('div.set-card',
          row('folder', 'Stockage sur cet appareil', h('span.set-dd', usageD, meter)),
          row('download', 'Sauvegarde', lastD, ui.btn('Exporter tout', { icon: 'download', variant: 'tonal', onClick: () => {
            U.download(`ratio-sauvegarde-${U.dayKey()}.json`, S.exportAll());
            lastD.textContent = 'Dernière sauvegarde à l’instant'; lastD.classList.remove('warn');
            ui.snack('Sauvegarde téléchargée');
          } })),
          row('upload', 'Importer', h('span.set-d', 'Une sauvegarde, un cours exporté ou un cours généré par une IA (fichier ou texte collé).'),
            ui.btn('Importer…', { icon: 'upload', variant: 'tonal', onClick: () => { closeFn(); setTimeout(() => openImport(), 220); } })))),
      h('section.set-group', h('h3.settings-h', 'Aide'),
        h('div.set-card',
          row('keyboard', 'Raccourcis clavier', null, ui.btn('Afficher', { variant: 'text', onClick: () => { closeFn(); setTimeout(showShortcuts, 220); } })),
          row('help', 'Guide de démarrage', null, ui.btn('Revoir', { variant: 'text', onClick: () => { closeFn(); setTimeout(onboarding, 220); } })))),
      h('section.set-group', h('h3.settings-h', 'Zone sensible'),
        h('div.set-card.set-danger',
          row('trash', 'Tout effacer', h('span.set-d', 'Supprime tous les cours, cartes et notes de cet appareil.'),
            ui.btn('Effacer…', { variant: 'text', cls: 'danger', onClick: async () => {
              const ok = await ui.confirm('Tout effacer ?', 'Tous les cours, cartes et notes de cet appareil seront supprimés. Exporte une sauvegarde avant si besoin.', { ok: 'Tout effacer', danger: true, icon: 'trash' });
              if (!ok) return;
              S.reset();
              closeFn && closeFn();
              app.go('#/', { replace: true });
              ui.snack('Données effacées');
            } })))),
      h('p.settings-foot', 'Ratio · fonctionne hors ligne · installable sur Android et ordinateur'));

    let closeFn = null;
    ui.dialog({ title: 'Réglages', icon: 'settings', body, cls: 'dialog-settings', actions: [{ label: 'Fermer', value: true, variant: 'text' }], onOpen: (_, close) => { closeFn = close; } });
  }
  app.openSettings = openSettings;

  /* ------------------------------------------------------------------ */
  /* Import : source (déposer · choisir · coller) → aperçu → mode → import (annulable)
     Le texte collé depuis une IA est lu tel quel : balises ```json, texte autour, virgules en
     trop sont tolérés ; ce qui a été corrigé est dit dans l'aperçu.                         */
  /* ------------------------------------------------------------------ */
  function openImport() {
    let parsed = null, mode = 'add', closeFn = null;
    const KIND = { backup: 'Sauvegarde complète', course: 'Cours', map: 'Carte seule', maps: 'Cartes' };
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json,.txt', hidden: true });
    const drop = h('div.imp-drop', { tabindex: '0', role: 'button', autofocus: true, 'aria-label': 'Choisir un fichier à importer' },
      R.icon('upload', 28), h('b', 'Dépose un fichier .json ici'), h('span', 'ou touche pour en choisir un'));
    const paste = h('textarea.imp-paste', { id: 'imp-paste', rows: 5, spellcheck: 'false', placeholder: 'Ou colle ici le JSON (par exemple la réponse d’une IA, balises ```json comprises)' });
    const preview = h('div.imp-preview', { 'aria-live': 'polite' });
    const go = ui.btn('Importer', { icon: 'upload', variant: 'filled', disabled: true });
    const cancel = ui.btn('Annuler', { variant: 'text', onClick: () => closeFn && closeFn() });

    const modeRow = (v, title, text, extra = '') => {
      const b = h('button.list-item.choice', { type: 'button', role: 'radio', 'aria-checked': String(mode === v), class: extra, dataset: { v } },
        h('span.choice-l', h('b', title), h('span.choice-sub', text)), h('span.choice-check', R.icon('check', 20)));
      b.addEventListener('click', () => { mode = v; U.$$('.imp-modes .choice', preview).forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
      return b;
    };
    // suite d'un cours (partie 2 d'un livre…) : un seul cours, déjà présent, et seulement des cartes nouvelles
    const completable = (p) => (p.data.courses.length === 1 && p.collide.courses === 1 && !p.collide.maps ? S.course(p.data.courses[0].id) : null);
    function paint(err) {
      U.clear(preview);
      go.disabled = !parsed;
      if (err) { preview.appendChild(h('p.imp-err', R.icon('close', 18), h('span', err))); return; }
      if (!parsed) return;
      const st = parsed.stats;
      const chip = (n, w) => h('span.imp-stat', h('b', String(n)), ' ' + w);
      const courses = parsed.data.courses;
      const suite = completable(parsed);
      preview.append(
        h('div.imp-sum',
          h('p.overline', KIND[parsed.kind] || 'Données'),
          h('div.imp-stats', chip(st.courses, st.courses > 1 ? 'cours' : 'cours'), chip(st.maps, st.maps > 1 ? 'cartes' : 'carte'), chip(st.nodes, st.nodes > 1 ? 'nœuds' : 'nœud'), chip(st.notes, st.notes > 1 ? 'notes' : 'note'), chip(st.edges, st.edges > 1 ? 'liens' : 'lien')),
          h('ul.imp-courses', courses.slice(0, 6).map((c) => {
            const n = parsed.data.maps.filter((m) => m.courseId === c.id).length;
            return h('li', h('b', c.title), h('span', ` · ${U.plural(n, 'carte')}`));
          }), courses.length > 6 ? h('li.muted', `… et ${courses.length - 6} autres`) : null)),
        parsed.fixes.length || parsed.issues.length ? h('div.imp-notes',
          h('p.overline', 'Corrigé à la lecture'),
          h('ul', [...parsed.fixes.map((f) => f[0].toUpperCase() + f.slice(1)), ...parsed.issues].map((t) => h('li', R.icon('check', 14), h('span', t))))) : null,
        h('div.imp-modes.choice-list.form-choice', { role: 'radiogroup', 'aria-label': 'Comment importer' },
          suite ? modeRow('complete', `Compléter « ${suite.title} » (conseillé)`, `Suite d’un cours déjà présent : ${U.plural(st.maps, 'carte')} rejoi${st.maps > 1 ? 'gnent' : 'nt'} ce cours.`) : null,
          modeRow('add', suite ? 'Ajouter en copie' : 'Ajouter en copie (conseillé)', 'Les cours importés s’ajoutent aux tiens. Rien n’est écrasé.'),
          parsed.collide.courses || parsed.collide.maps
            ? modeRow('update', 'Mettre à jour', `Remplace les éléments déjà présents (${[parsed.collide.courses ? U.plural(parsed.collide.courses, 'cours', 'cours') : null, parsed.collide.maps ? U.plural(parsed.collide.maps, 'carte') : null].filter(Boolean).join(', ')}) par ceux du fichier.`)
            : null,
          modeRow('replace', 'Tout remplacer', 'Efface tes données actuelles et ne garde que le fichier.', 'imp-danger')));
      preview.classList.remove('in'); void preview.offsetWidth; preview.classList.add('in');
    }
    function analyse(text) {
      try { parsed = S.parseImport(text); mode = completable(parsed) ? 'complete' : 'add'; paint(); }
      catch (e) { parsed = null; paint(e.message || 'Lecture impossible.'); }
    }
    const readFile = async (f) => { if (!f) return; paste.value = ''; analyse(await f.text()); };
    fileInput.addEventListener('change', () => readFile(fileInput.files[0]));
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
    paste.addEventListener('input', U.debounce(() => { if (paste.value.trim()) analyse(paste.value); else { parsed = null; paint(); } }, 250));

    go.addEventListener('click', async () => {
      if (!parsed) return;
      if (mode === 'replace') {
        const ok = await ui.confirm('Tout remplacer ?', 'Tes cours, cartes et notes actuels seront remplacés par le fichier. Tu pourras annuler juste après.', { ok: 'Tout remplacer', danger: true, icon: 'upload' });
        if (!ok) return;
      }
      const r = S.applyImport(parsed, mode);
      closeFn && closeFn();
      app.go(r.courses.length === 1 && mode !== 'replace' ? '#/cours/' + r.courses[0] : '#/', { replace: true });
      ui.snack(`Importé · ${U.plural(r.courses.length, 'cours', 'cours')}, ${U.plural(r.maps, 'carte')}`, {
        action: 'Annuler', duration: 8000,
        onAction: () => { S.restoreSnapshot(r.snapshot); app.go('#/', { replace: true }); ui.snack('Import annulé'); },
      });
    });

    const body = h('div.imp',
      drop, fileInput,
      h('label.imp-or', { for: 'imp-paste' }, 'ou'),
      paste, preview,
      h('div.dialog-actions', cancel, go));
    ui.dialog({ title: 'Importer', icon: 'upload', body, cls: 'dialog-wide dialog-import', onOpen: (_, close) => { closeFn = close; } });
  }
  app.openImport = openImport;

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
      if (type === 'change' || type === 'review' || type === 'import') { updateNav(); updateCourses(); }
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
