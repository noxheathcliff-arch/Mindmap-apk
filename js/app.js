/* Pioneer — noyau : routeur, navigation globale, thème, réglages, onboarding */
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
    if (p[0] === 'dossier' && p[1]) return { name: 'folder', id: p[1], q };
    if (p[0] === 'carte' && p[1]) return { name: 'editor', id: p[1], mode: p[2] === 'plan' ? 'plan' : 'map', q };
    if (p[0] === 'reviser') {
      // #/reviser : le tableau de bord (onglet) ; #/reviser/tout : une session tous cours
      if (!p[1] && !q.all) return { name: 'reviewHub', q };
      // un dossier (partie, chapitre…) se révise seul ; son cours donne la couleur et la bande
      const scope = p[1] === 'cours' ? { courseId: p[2] } : p[1] === 'dossier' ? { folderId: p[2], courseId: (S.folder(p[2]) || {}).courseId } : p[1] === 'carte' ? (p[3] ? { mapId: p[2], nodeId: p[3] } : { mapId: p[2] }) : {};
      return { name: 'review', scope, q };
    }
    return { name: 'library', q };
  }

  const DEPTH = { library: 0, reviewHub: 0, course: 1, folder: 1.5, review: 1, editor: 2 };
  /* un sous-dossier est « plus profond » que son parent : on y entre (axe Z) */
  const depthOf = (r) => (r.name === 'folder' ? 1.5 + S.folderPath(r.id).length / 100 : DEPTH[r.name] ?? 0);
  const IMMERSIVE = new Set(['editor', 'review']);

  /* from : élément hors de la page (ex. une ligne de la recherche) qui porte les héros de
     départ ; swap(viaVT) : appelé au moment de l'échange de page, pour retirer cet élément
     de la capture « après » (viaVT = true) ou le fermer normalement (false).
     still : la page s'échange sans transition (une animation du dessus, ex. l'entrée dans le
     classeur, la couvre déjà ; une View Transition figerait son rendu). */
  let pendingNav = null;
  app.go = (hash, { replace, from, swap, still } = {}) => {
    pendingNav = from || swap || still ? { from, swap, still } : null;
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
    if (r.name === 'folder') return 'folder:' + r.id;
    if (r.name === 'editor') return 'map:' + r.id;
    // révision lancée depuis la fiche d'un cours : la fiche devient la carte de révision
    if (r.name === 'review' && r.q && r.q.start) { const st = String(r.q.start); return 'fiche:' + st.slice(st.indexOf('.') + 1).replace(/:/g, '-'); }
    // session d'un dossier : son bloc (sommaire) ou son en-tête devient la bande de la fiche
    if (r.name === 'review' && r.scope && r.scope.folderId) return 'folder:' + r.scope.folderId;
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
    const dir = prev ? Math.sign(depthOf(route) - depthOf(prev)) : 0;
    const host = U.$('#view');
    const still = !!(nav && nav.still);
    const useVT = !!prev && !still && supportsVT && !U.reducedMotion() && !document.hidden;

    if (!useVT) { swap(false); mountRoute(route, prev, dir, false, still); return; }

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

  function mountRoute(route, prev, dir, viaVT, still) {
    const view = R.views[route.name];
    const host = U.$('#view');
    if (app.current && app.current.unmount) app.current.unmount();
    for (const old of U.$$('.page-wrap', host)) {
      if (viaVT || still) { old.remove(); continue; }
      if (old.classList.contains('leaving')) continue;
      old.classList.add('leaving');
      old.style.setProperty('--dir', dir);
      setTimeout(() => old.remove(), 170);
    }
    const page = h('div.page-wrap', { style: { '--dir': dir } });
    if (prev && !viaVT && !still) page.classList.add('entering');
    host.appendChild(page);
    app.setFab(null);
    app.setActions(null);
    app.route = route;
    document.body.dataset.route = route.name;
    document.body.classList.toggle('immersive', IMMERSIVE.has(route.name));
    if (prev) host.focus({ preventScroll: true });
    app.current = view.mount(page, route) || {};
    updateNav(route);
    if (prev && !viaVT && !still) setTimeout(() => page.classList.remove('entering'), 400);
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

    rail.appendChild(h('a.rail-brand', { href: '#/', 'aria-label': 'Pioneer — accueil' }, logo(), wordmark()));
    rail.appendChild(h('div.rail-fab-slot#rail-fab'));
    const railItems = h('div.rail-items');
    for (const d of DESTS) railItems.appendChild(navItem(d, 'rail'));
    /* barre flottante (compact) : Cours · action principale au centre · Réviser. La recherche
       n'y figure pas : elle est déjà dans la barre haute de chaque page principale. */
    for (const d of DESTS.filter((x) => x.key !== 'search')) {
      if (bar.children.length === 1) bar.appendChild(h('div.nav-center#nav-center'));
      bar.appendChild(navItem(d, 'bar'));
    }
    bar.prepend(h('span.nav-pill#nav-pill', { 'aria-hidden': 'true' }));
    for (const it of bar.querySelectorAll('.nav-item')) it.draggable = false;
    pillWatch(bar);
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
    const cur = route && (route.name === 'course' ? route.id : route.name === 'folder' ? (S.folder(route.id) || {}).courseId : route.name === 'editor' ? (S.map(route.id) || {}).courseId : route.name === 'review' && route.scope ? route.scope.courseId : null);
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
    const active = route.name === 'review' || route.name === 'reviewHub' ? 'review' : route.name === 'library' || route.name === 'course' || route.name === 'folder' ? 'library' : '';
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
    placePill();
  }
  app.updateNav = updateNav;

  /* Pilule active partagée (barre compacte) : posée en px sur la destination active. Le sens du
     trajet choisit quel bord mène (CSS pill-r / pill-l) : étirement puis retour. Barre cachée
     (display: none) → la prochaine pose est instantanée, sans trajet depuis 0. */
  function placePill(target) {
    const bar = U.$('#navbar'), pill = U.$('#nav-pill');
    if (!bar || !pill) return;
    const el = target || bar.querySelector('.nav-item.active');
    bar.classList.toggle('has-pill', !!el);
    if (!el || !bar.offsetWidth) { pill.dataset.stale = '1'; return; }
    // au sous-pixel près : le centre de la destination ne bouge pas quand elle est pressée (scale)
    const br = bar.getBoundingClientRect(), er = el.getBoundingClientRect(), k = br.height / bar.offsetHeight || 1;
    const w0 = er.width / k, w = Math.abs(w0 - el.offsetWidth) < 1 ? w0 : el.offsetWidth, l = (er.left + er.width / 2 - br.left) / k - w / 2, r = br.width / k - l - w;
    const prev = parseFloat(pill.style.left);
    const instant = pill.dataset.stale === '1' || isNaN(prev);
    delete pill.dataset.stale;
    bar.classList.toggle('pill-r', !instant && l > prev);
    bar.classList.toggle('pill-l', !instant && l < prev);
    pill.classList.toggle('instant', instant);
    pill.style.left = l + 'px'; pill.style.right = r + 'px';
    if (instant) { void pill.offsetWidth; pill.classList.remove('instant'); }
  }

  /* Suivi de la barre (taille, CTA au centre) + glisser le doigt d'une destination à l'autre :
     la pilule suit, un tic haptique à chaque destination franchie, la page change au relâché. */
  function pillWatch(bar) {
    if (bar.dataset.pill) return;
    bar.dataset.pill = '1';
    if (window.ResizeObserver) new ResizeObserver(() => placePill()).observe(bar);
    let st = null, eat = 0;
    const itemAt = (x) => {
      const r = bar.getBoundingClientRect();
      const el = document.elementFromPoint(Math.min(Math.max(x, r.left + 1), r.right - 1), r.top + r.height / 2);
      return el && el.closest('#navbar .nav-item');
    };
    bar.addEventListener('pointerdown', (e) => {
      const it = e.button === 0 && e.target.closest('.nav-item');
      st = it ? { x: e.clientX, id: e.pointerId, from: it, over: it, on: false } : null;
    });
    bar.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.on) {
        if (Math.abs(e.clientX - st.x) < 8) return;
        st.on = true;
        bar.classList.add('scrubbing');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      const it = itemAt(e.clientX);
      if (it && it !== st.over) { st.over = it; placePill(it); R.motion.haptic(6); }
    });
    const end = (e, ok) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      if (!s.on) return;
      bar.classList.remove('scrubbing');
      if (ok && s.over && !s.over.classList.contains('active')) s.over.click();
      else placePill();
      eat = Date.now(); // le clic natif qui suit le relâché ne doit pas naviguer une 2e fois
    };
    bar.addEventListener('pointerup', (e) => end(e, true));
    bar.addEventListener('pointercancel', (e) => end(e, false));
    bar.addEventListener('click', (e) => {
      if (Date.now() - eat < 400 && e.isTrusted) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
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
    const f = h('button.fab.fab-float.nav-fab.lux#fab-float', { type: 'button', 'aria-label': cfg.label, 'data-tip': cfg.label, onclick: cfg.onClick }, R.icon(cfg.icon || 'plus', 24));
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
        el = h(it.href ? 'a.btn.btn-filled.ctx-primary.lux' : 'button.btn.btn-filled.ctx-primary.lux', { type: it.href ? null : 'button', href: it.href || null, class: it.cls || '', 'aria-label': it.aria || null },
          R.icon(it.icon, 20), h('span.ctx-primary-l', it.label), it.short ? h('span.ctx-primary-s', it.short) : null, luxCount(it));
        if (it.short) el.classList.add('has-short');
        luxMark(el, it);
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

  /** Bouton « lux » : pastille de compte (24 px) et ▶ qui s'élance (classe is-play) */
  function luxCount(it) { return it.count ? h('span.lux-count', { 'aria-hidden': 'true' }, String(it.count)) : null; }
  function luxMark(el, it) {
    if (it.count) el.classList.add('has-count');
    if (it.icon === 'play') el.classList.add('is-play');
  }

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
    const el = h(it.href ? 'a.nav-cta.lux' : 'button.nav-cta.lux', { type: it.href ? null : 'button', href: it.href || null, class: it.cls || '', 'aria-label': it.aria || it.label },
      R.icon(it.icon, 22), h('span.nav-cta-l', it.short || it.label), luxCount(it));
    luxMark(el, it);
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
    // l'icône Pioneer : le p-fanion sur la tuile primary (brand/pioneer-logo.html)
    s.innerHTML = '<svg viewBox="0 0 512 512" width="32" height="32"><rect width="512" height="512" rx="115" style="fill:var(--primary)"/><path style="fill:var(--on-primary)" d="M0,191v-183c0,-4.42 3.58,-8 8,-8h127.77c4.6,0 8.25,3.87 7.99,8.46c-3.64,62.73 -47.43,114.69 -106.06,130.55c-2.18,0.59 -3.69,2.57 -3.69,4.83v47.16c0,4.42 -3.58,8 -8,8h-18c-4.42,0 -8,-3.58 -8,-8zM40.86,102.16c28.93,-11.58 51.79,-35.09 62.51,-64.45c1.19,-3.26 -1.22,-6.71 -4.7,-6.71h-59.67c-2.76,0 -5,2.24 -5,5v61.52c0,3.54 3.57,5.96 6.86,4.64z" transform="translate(160.14 123.91) scale(1.50754)"/></svg>';
    return s;
  }
  // le mot-symbole Pioneer, en currentColor
  function wordmark() {
    const s = h('span.rail-brand-name', { 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 -51 966 250" height="24"><g fill="currentColor" fill-rule="evenodd"><path d="M0,191v-183c0,-4.42 3.58,-8 8,-8h127.77c4.6,0 8.25,3.87 7.99,8.46c-3.64,62.73 -47.43,114.69 -106.06,130.55c-2.18,0.59 -3.69,2.57 -3.69,4.83v47.16c0,4.42 -3.58,8 -8,8h-18c-4.42,0 -8,-3.58 -8,-8zM40.86,102.16c28.93,-11.58 51.79,-35.09 62.51,-64.45c1.19,-3.26 -1.22,-6.71 -4.7,-6.71h-59.67c-2.76,0 -5,2.24 -5,5v61.52c0,3.54 3.57,5.96 6.86,4.64z"/><path d="M164,136v-128c0,-4.42 3.58,-8 8,-8h18c4.42,0 8,3.58 8,8v128c0,4.42 -3.58,8 -8,8h-18c-4.42,0 -8,-3.58 -8,-8zM162,-32c0,-10.49 8.51,-19 19,-19c10.49,0 19,8.51 19,19c0,10.49 -8.51,19 -19,19c-10.49,0 -19,-8.51 -19,-19z"/><path d="M225,72c0,-41.42 33.58,-75 75,-75c41.42,0 75,33.58 75,75c0,41.42 -33.58,75 -75,75c-41.42,0 -75,-33.58 -75,-75zM300,113c22.09,0 40,-18.36 40,-41c0,-22.64 -17.91,-41 -40,-41c-22.09,0 -40,18.36 -40,41c0,22.64 17.91,41 40,41z"/><path d="M463,-2c36.45,0 66,29.55 66,66v72c0,4.42 -3.58,8 -8,8l-18,0c-4.42,0 -8,-3.58 -8,-8v-75c0,-17.67 -14.33,-32 -32,-32c-17.67,0 -32,14.33 -32,32v75c0,4.42 -3.58,8 -8,8h-18c-4.42,0 -8,-3.58 -8,-8v-72c0,-36.45 29.55,-66 66,-66z"/><path d="M551,72c0,-41.42 33.58,-75 75,-75c41.42,0 75,33.58 75,75c0,4.58 -0.41,9.07 -1.2,13.42c-0.69,3.81 -4,6.58 -7.87,6.58h-91.11c-4.38,0 -6.64,5.23 -3.65,8.42c7.28,7.75 17.5,12.58 28.83,12.58h45.7c7.26,0 10.77,8.9 5.46,13.85c-13.4,12.5 -31.38,20.15 -51.15,20.15c-41.42,0 -75,-33.58 -75,-75zM626,31c-16.16,0 -30.08,9.82 -36.39,23.96c-1.48,3.31 0.94,7.04 4.57,7.04l63.66,0c3.62,0 6.04,-3.73 4.57,-7.04c-6.31,-14.14 -20.23,-23.96 -36.39,-23.96z"/><path d="M714,72c0,-41.42 33.58,-75 75,-75c41.42,0 75,33.58 75,75c0,4.58 -0.41,9.07 -1.2,13.42c-0.69,3.81 -4,6.58 -7.87,6.58h-91.11c-4.38,0 -6.64,5.23 -3.65,8.42c7.28,7.75 17.5,12.58 28.83,12.58h45.7c7.26,0 10.77,8.9 5.46,13.85c-13.4,12.5 -31.38,20.15 -51.15,20.15c-41.42,0 -75,-33.58 -75,-75zM789,31c-16.16,0 -30.08,9.82 -36.39,23.96c-1.48,3.31 0.94,7.04 4.57,7.04l63.66,0c3.62,0 6.04,-3.73 4.57,-7.04c-6.31,-14.14 -20.23,-23.96 -36.39,-23.96z"/><path d="M880,136v-72c0,-36.45 29.55,-66 66,-66c4.68,0 9.24,0.49 13.65,1.41c3.7,0.78 6.35,4.04 6.35,7.83v15.59c0,5.4 -5.24,9.25 -10.4,7.63c-3.03,-0.95 -6.26,-1.47 -9.6,-1.47c-17.67,0 -32,14.33 -32,32c0,1.01 0.05,2.01 0.14,3h-0.14v72c0,4.42 -3.58,8 -8,8h-18c-4.42,0 -8,-3.58 -8,-8z"/></g></svg>';
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
    for (const m of U.$$('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#111319' : '#ffffff');
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

  /* ---- Police des notes (Réglages › Typographie des cartes › Notes) ------- */
  function applyNoteTypo() {
    const t = S.typoOf('note');
    R.fonts.ensure(t.font);
    const root = document.documentElement.style;
    root.setProperty('--note-font', R.fonts.family(t.font));
    root.setProperty('--note-fs', t.size + 'px');
    root.setProperty('--note-fw', t.bold ? '600' : '400');
  }

  /* ---- Mouvement : réglage de l'app > préférence système ---------------- */
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  function applyMotion() {
    const m = S.data.settings.motion || 'system';
    const v = m === 'system' ? (mqReduce.matches ? 'reduce' : 'full') : m;
    if (document.documentElement.dataset.motion === v) return;
    // changer de mode change le nom des animations : sans ça, le dialogue ouvert (Réglages) rejouait
    // son entrée depuis l'opacité 0 et laissait voir la page dessous un instant
    U.$$('.scrim, .dialog, .dialog > *, .snackbar').forEach((el) => el.classList.add('settled'));
    document.documentElement.dataset.motion = v;
  }
  app.setMotion = (m) => { S.data.settings.motion = m; S.changed('settings'); applyMotion(); };
  mqReduce.addEventListener('change', applyMotion);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  /* ------------------------------------------------------------------ */
  /* Réglages                                                           */
  /* ------------------------------------------------------------------ */
  function openSettings() {
    let closeFn = null;
    // choix exclusif : groupe de boutons connectés (M3 Expressive), le choix porte une coche
    const choice = (label, options, current, onPick) => {
      const g = h('div.st-choice', { role: 'radiogroup', 'aria-label': label });
      for (const [v, text] of options) {
        const b = h('button.st-opt', { type: 'button', role: 'radio', 'aria-checked': String(current === v) },
          h('span.st-opt-check', R.icon('check', 18)), h('span', text));
        b.addEventListener('click', (e) => {
          U.$$('.st-opt', g).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          onPick(v, e);
        });
        g.appendChild(b);
      }
      return g;
    };
    const themeC = choice('Thème', [['system', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']],
      S.data.settings.theme, (v, e) => app.setTheme(v, { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 }));
    const motionC = choice('Animations', [['system', 'Auto'], ['reduce', 'Réduites'], ['full', 'Complètes']],
      S.data.settings.motion || 'system', (v) => app.setMotion(v));

    const colorsD = h('span.st-d');
    const paintColors = () => {
      const c = R.colors.settings();
      const names = { familles: 'Une couleur par famille', daltonisme: 'Palette daltonisme', perso: 'Couleurs personnalisées' };
      colorsD.textContent = c.mode === 'off' ? 'Monochrome — les types se distinguent par leur forme' : `${names[c.mode]} · intensité ${c.intensity === 'vif' ? 'vive' : 'douce'}`;
    };
    paintColors();
    const typoD = h('span.st-d');
    const paintTypo = () => {
      const mine = Object.keys(S.data.settings.typo || {}).length;
      typoD.textContent = mine ? `Réglée pour ${U.plural(mine, 'niveau', 'niveaux')}` : 'Police, taille et gras par niveau';
    };
    paintTypo();

    /* Données : jauge de stockage + date de la dernière sauvegarde (rappel au-delà de 14 jours) */
    const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko');
    const meter = h('span.st-meter', h('i'));
    const usageD = h('span.st-d', 'Calcul…');
    S.usage().then((u) => {
      const where = u.backend === 'indexeddb' ? 'base locale' : 'stockage local';
      usageD.textContent = `${size(u.bytes)}${u.quota ? ` sur ${size(u.quota)}` : ''} · ${where}`;
      meter.firstChild.style.transform = `scaleX(${u.quota ? Math.min(1, Math.max(0.01, u.bytes / u.quota)) : 0.02})`;
    });
    const last = S.data.settings.lastExport;
    const lastDays = last ? Math.floor((Date.now() - last) / U.DAY) : null;
    const lastD = h('span.st-d', { class: last && lastDays < 14 ? '' : 'warn' },
      last ? `Dernière ${U.relTime(last)}${lastDays >= 14 ? ' — pense à en refaire une' : ''}` : 'Aucune sauvegarde pour l’instant');

    // ligne de liste M3 : pastille d'icône · intitulé + précision · fin (chevron, ou rien) ; toute la ligne est la cible
    const item = (icon, title, desc, { onClick, trail = 'chevronRight', cls = '', below } = {}) => {
      const inner = [h('span.st-ic', R.icon(icon, 20)), h('span.st-txt', h('span.st-t', title), desc || null),
        onClick && trail ? h('span.st-trail', R.icon(trail, 20)) : null];
      const el = onClick ? h('button.st-item', { type: 'button', class: cls, onclick: onClick }, inner) : h('div.st-item', { class: cls }, inner);
      return below ? h('div.st-block', el, h('div.st-below', below)) : el;
    };
    // animations réduites : la suite s'ouvre par-dessus, puis les réglages s'effacent dessous (jamais la page entre les deux)
    const after = (fn) => () => { if (U.reducedMotion()) { fn(); closeFn(); } else { closeFn(); setTimeout(fn, 220); } };
    const group = (title, ...items) => h('section.st-group', h('h3.st-h', title), h('div.st-list', items));

    const body = h('div.st',
      h('header.st-bar',
        ui.iconBtn('close', { title: 'Fermer', cls: 'st-close', onClick: () => closeFn() }),
        h('h2.st-title', 'Réglages')),
      h('div.st-scroll',
        group('Apparence',
          item('sun', 'Thème', null, { below: themeC }),
          item('sparkle', 'Animations', h('span.st-d', '« Réduites » : fondus courts à la place des zooms'), { below: motionC }),
          item('palette', 'Couleurs des nœuds', colorsD, { onClick: () => R.colors.openDialog().then(paintColors) }),
          item('type', 'Typographie des cartes', typoD, { onClick: () => openTypo().then(paintTypo) })),
        group('Données',
          item('folder', 'Stockage sur cet appareil', h('span.st-dd', usageD, meter)),
          item('export', 'Exporter une sauvegarde', lastD, { trail: 'download', onClick: () => {
            U.download(`pioneer-sauvegarde-${U.dayKey()}.json`, S.exportAll());
            lastD.textContent = 'Dernière à l’instant'; lastD.classList.remove('warn');
            ui.snack('Sauvegarde téléchargée');
          } }),
          item('import', 'Importer', h('span.st-d', 'Sauvegarde, cours exporté ou généré par une IA'), { onClick: after(() => openImport()) })),
        group('Aide',
          item('keyboard', 'Raccourcis clavier', null, { onClick: after(showShortcuts) }),
          item('help', 'Guide de démarrage', null, { onClick: after(onboarding) })),
        group('Zone sensible',
          item('trash', 'Tout effacer', h('span.st-d', 'Supprime cours, cartes et notes de cet appareil'), { cls: 'danger', trail: null, onClick: async () => {
            const ok = await ui.confirm('Tout effacer ?', 'Tous les cours, cartes et notes de cet appareil seront supprimés. Exporte une sauvegarde avant si besoin.', { ok: 'Tout effacer', danger: true, icon: 'trash' });
            if (!ok) return;
            S.reset();
            closeFn && closeFn();
            app.go('#/', { replace: true });
            ui.snack('Données effacées');
          } })),
        h('p.st-foot', 'Pioneer · hors ligne · installable sur Android et ordinateur')));

    ui.dialog({ body, cls: 'dialog-settings', onOpen: (_, close) => { closeFn = close; } });
  }
  app.openSettings = openSettings;

  /* Typographie des cartes : un niveau à la fois (chapitre… notes), aperçu en direct.
     Seuls les écarts au défaut sont gardés dans settings.typo ; une carte ouverte se redessine à chaque choix. */
  function openTypo() {
    const LV = S.TYPO_LEVELS;
    let lv = 'chapitre';
    const box = h('div.st.ty');
    const save = (field, v) => {
      const all = { ...(S.data.settings.typo || {}) };
      const o = { ...(all[lv] || {}) };
      if (v === undefined || v === LV[lv][field]) delete o[field]; else o[field] = v;
      if (Object.keys(o).length) all[lv] = o; else delete all[lv];
      if (Object.keys(all).length) S.data.settings.typo = all; else delete S.data.settings.typo;
      S.changed('settings');
    };
    const SAMPLE = { chapitre: 'Les sources du droit', section: 'La loi', soussection: 'L’élaboration de la loi', paragraphe: 'Le vote au Parlement',
      lecon: 'Introduction au droit', notion: 'Hiérarchie des normes', idee: 'La Constitution prime sur la loi', ref: '« Nul n’est censé ignorer la loi »',
      note: 'La loi est votée par le Parlement puis promulguée par le président de la République dans les quinze jours.' };

    // même langage que les Réglages : barre (retour · titre · réinitialiser), aperçu fixe en haut, réglages en listes
    let closeFn = null;
    const tuned = () => !!(S.data.settings.typo || {})[lv];
    const reset = ui.iconBtn('undo', { title: 'Réinitialiser ce niveau', onClick: () => {
      const all = { ...(S.data.settings.typo || {}) }; delete all[lv];
      if (Object.keys(all).length) S.data.settings.typo = all; else delete S.data.settings.typo;
      S.changed('settings'); paint();
    } });
    const stage = h('div.ty-stage');
    const scroll = h('div.st-scroll');
    box.append(
      h('header.st-bar', ui.iconBtn('back', { title: 'Retour', cls: 'st-close', onClick: () => closeFn && closeFn(true) }),
        h('h2.st-title', 'Typographie'), h('span.ty-bar-fill'), reset),
      stage, scroll);

    function paint() {
      const t = S.typoOf(lv);
      const keep = stage.querySelector('.typo-levels')?.scrollLeft || 0;
      const top = scroll.scrollTop;
      U.clear(stage); U.clear(scroll);
      reset.disabled = !tuned();
      const chips = h('div.typo-levels', { role: 'radiogroup', 'aria-label': 'Niveau' },
        Object.entries(LV).map(([k, d]) => {
          const on = !!(S.data.settings.typo || {})[k];
          const b = h('button.chip.chip-filter', { type: 'button', role: 'radio', 'aria-checked': String(k === lv), class: k === lv ? 'on' : '' },
            k === lv ? R.icon('check', 18) : null, h('span', d.label), on ? h('i.typo-dot', { 'aria-label': 'personnalisé' }) : null);
          b.addEventListener('click', () => { if (k !== lv) { lv = k; paint(); } });
          return b;
        }));
      R.fonts.ensure(t.font);
      const pre = 'prefix' in LV[lv] && t.prefix ? `${LV[lv].label} I · ` : '';
      const sample = h('div.typo-preview', { class: lv === 'note' ? 'is-note' : lv === 'ref' ? 'is-ref' : lv === 'idee' ? 'is-idee' : 'is-notion',
        style: { fontFamily: R.fonts.family(t.font), fontSize: t.size + 'px', fontWeight: t.bold ? '700' : '400' } },
      pre ? h('span.typo-pre', pre) : null, SAMPLE[lv]);
      stage.append(chips, h('div.ty-canvas', { 'aria-label': 'Aperçu' }, sample));

      // police : pas de nouveau rendu à chaque choix, la liste garde sa place ; l'aperçu et « personnalisé » suivent
      const fonts = ui.fontPicker({ value: t.font, key: 'typo-font', label: 'Police', sample: SAMPLE[lv].slice(0, 60),
        onPick: (k) => {
          save('font', k);
          sample.style.fontFamily = R.fonts.family(k);
          reset.disabled = !tuned();
          const chip = chips.querySelector('[aria-checked="true"]');
          const dot = chip && chip.querySelector('.typo-dot');
          if (chip && tuned() && !dot) chip.appendChild(h('i.typo-dot', { 'aria-label': 'personnalisé' }));
          else if (dot && !tuned()) dot.remove();
        } });
      const out = h('output.ty-val', t.size + ' px');
      const size = h('input.slider', { type: 'range', min: String(S.SIZE.fs[0]), max: String(S.SIZE.fs[1]), step: '1', value: String(t.size), 'aria-label': 'Taille' });
      const syncSize = () => { out.textContent = size.value + ' px'; size.style.setProperty('--p', ((size.value - S.SIZE.fs[0]) / (S.SIZE.fs[1] - S.SIZE.fs[0]) * 100) + '%'); sample.style.fontSize = size.value + 'px'; };
      syncSize();
      size.addEventListener('input', syncSize);
      size.addEventListener('change', () => save('size', +size.value));
      const sw = (icon, label, sub, on, field) => {
        const b = h('button.st-item.sty-switch', { type: 'button', role: 'switch', 'aria-checked': String(on) },
          h('span.st-ic', R.icon(icon, 20)),
          h('span.st-txt', h('span.st-t', label), sub ? h('span.st-d', sub) : null),
          h('span.m3-switch', { 'aria-hidden': 'true' }, h('i')));
        b.addEventListener('click', () => { save(field, b.getAttribute('aria-checked') !== 'true'); paint(); });
        return b;
      };
      const group = (title, ...kids) => h('section.st-group', h('h3.st-h', title), h('div.st-list', ...kids));
      requestAnimationFrame(() => { chips.scrollLeft = keep; scroll.scrollTop = top; });
      scroll.append(
        group('Police', h('div.ty-fp', fonts)),
        group('Texte',
          h('div.st-block',
            h('div.st-item', h('span.st-ic', R.icon('heading', 20)), h('span.st-txt', h('span.st-t', 'Taille')), out),
            h('div.st-below.ty-slide', size)),
          sw('bold', 'Gras', null, !!t.bold, 'bold'),
          'prefix' in LV[lv] ? sw('list', 'Préfixe numéroté', `« ${LV[lv].label} I », « ${LV[lv].label} II »… devant le titre`, !!t.prefix, 'prefix') : null),
        h('p.ty-help', lv === 'note' ? 'S’applique au texte des notes, dans l’éditeur et en lecture.' : 'Un nœud peut toujours garder sa propre police ou sa taille (fiche « Apparence »).'));
    }
    paint();
    return ui.dialog({ body: box, cls: 'dialog-settings dialog-typo', onOpen: (_, close) => { closeFn = close; } });
  }

  /* ------------------------------------------------------------------ */
  /* Import : source (déposer · choisir · coller) → aperçu → mode → import (annulable)
     Le texte collé depuis une IA est lu tel quel : balises ```json, texte autour, virgules en
     trop sont tolérés ; ce qui a été corrigé est dit dans l'aperçu.                         */
  /* ------------------------------------------------------------------ */
  function openImport() {
    let parsed = null, mode = 'add', closeFn = null;
    const KIND = { backup: 'Sauvegarde complète', course: 'Cours', map: 'Carte seule', maps: 'Cartes' };
    // input natif dans un <label> : le sélecteur s'ouvre au toucher, sans passer par du JS
    const fileInput = h('input.imp-file', { type: 'file', accept: '.json,application/json,text/plain', id: 'imp-file' });
    const drop = h('label.imp-drop', { for: 'imp-file' },
      h('span.imp-drop-ic', R.icon('import', 24)),
      h('span.imp-drop-t', h('b', 'Choisir un fichier'), h('span', '.json · ou dépose-le ici')),
      R.icon('chevronRight', 20));
    const paste = h('textarea.imp-paste', { id: 'imp-paste', rows: 5, spellcheck: 'false', placeholder: '{ "courses": … }' });
    const pasteBtn = navigator.clipboard && navigator.clipboard.readText
      ? ui.btn('Coller', { icon: 'paste', variant: 'tonal', onClick: async () => {
        try { const t = await navigator.clipboard.readText(); if (t.trim()) { paste.value = t; paste.dispatchEvent(new Event('input')); } }
        catch { paste.focus(); }
      } }) : null;
    const preview = h('div.imp-preview', { 'aria-live': 'polite' });
    const go = ui.btn('Importer', { icon: 'import', variant: 'filled', disabled: true });
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
          h('div.imp-stats', chip(st.courses, st.courses > 1 ? 'cours' : 'cours'), chip(st.maps, st.maps > 1 ? 'cartes' : 'carte'), chip(st.nodes, st.nodes > 1 ? 'nœuds' : 'nœud'), chip(st.notes, st.notes > 1 ? 'notes' : 'note'), chip(st.edges, st.edges > 1 ? 'liens' : 'lien'), st.exercises ? chip(st.exercises, st.exercises > 1 ? 'exercices' : 'exercice') : null),
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
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
    paste.addEventListener('input', () => pasteBox.classList.toggle('filled', !!paste.value));
    paste.addEventListener('input', U.debounce(() => { if (paste.value.trim()) analyse(paste.value); else { parsed = null; paint(); } }, 250));

    go.addEventListener('click', async () => {
      if (!parsed) return;
      if (mode === 'replace') {
        const ok = await ui.confirm('Tout remplacer ?', 'Tes cours, cartes et notes actuels seront remplacés par le fichier. Tu pourras annuler juste après.', { ok: 'Tout remplacer', danger: true, icon: 'import' });
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

    const pasteBox = h('div.imp-pbox',
      h('label.imp-plabel', { for: 'imp-paste' }, 'JSON'),
      paste,
      h('div.imp-pfoot', h('span.imp-psup', 'Réponse d’une IA acceptée, balises ```json comprises.'), pasteBtn));
    const body = h('div.imp',
      fileInput, drop,
      h('div.imp-or', h('span', 'ou colle le texte')),
      pasteBox, preview,
      h('div.dialog-actions', cancel, go));
    ui.dialog({ title: 'Importer', icon: 'import', body, cls: 'dialog-wide dialog-import m3-form', onOpen: (_, close) => { closeFn = close; } });
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
        ['L', 'Relier à un ou plusieurs nœuds (Entrée pour terminer)'], ['A', 'Apparence du nœud (couleur, forme, police)'], ['.', 'Replier / déplier'], [`${m} Z · ${m} ⇧ Z`, 'Annuler · Rétablir'],
        ['R', 'Ranger la carte'], ['F', 'Ajuster à l’écran'], ['+ / −', 'Zoom'], ['H', 'Mode masqué (révision)'],
        ['1 … 9', 'Changer le type du nœud'], ['Alt 1 … 5', 'Chapitre · Section · Sous-section · Paragraphe · Leçon'], ['P', 'Basculer Carte / Plan'],
      ]],
      ['Révision', [['Espace', 'Afficher la réponse'], ['1 · 2 · 3', 'Oublié · Retrouvé · Évident']]],
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
      { icon: 'cards', title: 'Révise en rappel actif', text: 'Pioneer transforme tes cartes en questions. Tu dis comment elle t’est revenue — Oublié, Retrouvé, Évident — et la répétition espacée te les représente au bon moment.' },
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
    applyNoteTypo();
    if (S.fresh) R.seed();
    buildNav();
    const navLater = U.debounce(() => updateNav(), 800);
    S.on((type) => {
      if (type === 'change' || type === 'review' || type === 'import') { updateNav(); updateCourses(); }
      if (type === 'edit') navLater();
      if (type === 'settings' || type === 'import') applyNoteTypo();
      if (type === 'saved' && S.saveError) ui.snack('Stockage plein : exporte une sauvegarde puis libère de la place.', { duration: 8000 });
    });
    render();
    document.body.classList.add('ready');
    // l'accueil attend la fin de l'écran d'ouverture
    if (!S.data.settings.onboarded) (R.splash ? R.splash.done : Promise.resolve()).then(() => setTimeout(onboarding, 450));

    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      // Mise à jour : sw.js jamais pris dans le cache HTTP, vérifié au retour sur l'app ; nouvelle version = rechargement
      const hadSW = !!navigator.serviceWorker.controller;
      let fresh = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadSW || fresh) return;
        fresh = true;
        if (document.hidden) location.reload();
        else ui.snack('Nouvelle version de Pioneer installée.', { action: 'Recharger', onAction: () => location.reload(), duration: 12000 });
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (fresh) location.reload(); else reg.update().catch(() => {});
        });
      }).catch(() => {});
    }
  };

  R.app = app;
  R.views = R.views || {};
  document.addEventListener('DOMContentLoaded', () => app.start());
})(window.R);
