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
      const scope = p[1] === 'cours' ? { courseId: p[2] } : p[1] === 'carte' ? { mapId: p[2] } : {};
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
    const view = R.views[route.name];
    const host = U.$('#view');
    const dir = prev ? Math.sign((DEPTH[route.name] ?? 0) - (DEPTH[prev.name] ?? 0)) || 1 : 0;

    if (app.current && app.current.unmount) app.current.unmount();
    const old = host.querySelector('.page-wrap:not(.leaving)');
    if (old) {
      old.classList.add('leaving');
      old.style.setProperty('--dir', dir);
      setTimeout(() => old.remove(), 160);
    }
    const page = h('div.page-wrap', { style: { '--dir': dir } });
    if (prev) page.classList.add('entering');
    host.appendChild(page);
    app.setFab(null);
    app.route = route;
    document.body.dataset.route = route.name;
    document.body.classList.toggle('immersive', IMMERSIVE.has(route.name));
    if (prev) host.focus({ preventScroll: true });
    app.current = view.mount(page, route) || {};
    updateNav(route);
    setTimeout(() => page.classList.remove('entering'), 600);
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
    for (const b of U.$$('.nav-item[data-key="review"] .nav-badge')) {
      b.hidden = !due;
      b.textContent = due > 99 ? '99+' : due;
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

  /* ------------------------------------------------------------------ */
  /* Thème                                                              */
  /* ------------------------------------------------------------------ */
  function applyTheme() {
    const t = S.data.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const m of U.$$('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#121211' : '#fbfaf7');
  }
  app.setTheme = (t) => { S.data.settings.theme = t; S.changed('settings'); applyTheme(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  /* ------------------------------------------------------------------ */
  /* Réglages                                                           */
  /* ------------------------------------------------------------------ */
  function openSettings() {
    const seg = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Thème' });
    for (const [v, label, icon] of [['system', 'Système', 'panel'], ['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon']]) {
      const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(S.data.settings.theme === v) },
        R.icon(S.data.settings.theme === v ? 'check' : icon, 18), h('span', label));
      b.addEventListener('click', () => {
        app.setTheme(v);
        for (const x of seg.children) { x.setAttribute('aria-checked', String(x === b)); }
        U.$$('.seg-btn', seg).forEach((x, i) => {
          const ic = x.querySelector('.ic');
          ic.replaceWith(R.icon(x === b ? 'check' : ['panel', 'sun', 'moon'][i], 18));
        });
      });
      seg.appendChild(b);
    }

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

    const used = (() => { try { return (localStorage.getItem('ratio.v1') || '').length; } catch (e) { return 0; } })();
    const kb = Math.max(1, Math.round(used / 1024));

    const body = h('div.settings',
      h('section.settings-sec',
        h('h3.settings-h', 'Apparence'),
        seg),
      h('section.settings-sec',
        h('h3.settings-h', 'Données'),
        h('p.settings-p', `Tout est enregistré sur cet appareil (${kb} Ko). Exporte régulièrement une sauvegarde.`),
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
        ['Espace', 'Ouvrir la note'], ['Suppr', 'Supprimer'], ['← ↑ → ↓', 'Naviguer entre les nœuds'],
        ['L', 'Relier à un autre nœud'], ['.', 'Replier / déplier'], [`${m} Z · ${m} ⇧ Z`, 'Annuler · Rétablir'],
        ['R', 'Ranger la carte'], ['F', 'Ajuster à l’écran'], ['+ / −', 'Zoom'], ['H', 'Mode masqué (révision)'],
        ['1 … 9', 'Changer le type du nœud'], ['P', 'Basculer Carte / Plan'],
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
    let i = 0;
    const art = h('div.onb-art');
    const title = h('h2.onb-title');
    const text = h('p.onb-text');
    const dots = h('div.onb-dots', steps.map(() => h('span.onb-dot')));
    const body = h('div.onb', art, title, text, dots);
    const paint = () => {
      const s = steps[i];
      body.classList.remove('swap');
      void body.offsetWidth;
      body.classList.add('swap');
      U.clear(art).appendChild(R.icon(s.icon, 40));
      title.textContent = s.title;
      text.textContent = s.text;
      U.$$('.onb-dot', dots).forEach((d, k) => d.classList.toggle('on', k === i));
      next.querySelector('.btn-label').textContent = i === steps.length - 1 ? 'Commencer' : 'Suivant';
    };
    const next = ui.btn('Suivant', { variant: 'filled' });
    const skip = ui.btn('Passer', { variant: 'text' });
    ui.dialog({
      body: h('div', body, h('div.dialog-actions', skip, next)), cls: 'dialog-onb', dismissible: true,
      onOpen: (_, close) => {
        paint();
        next.addEventListener('click', () => { if (i < steps.length - 1) { i++; paint(); } else close(true); });
        skip.addEventListener('click', () => close(true));
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
  app.start = function () {
    S.load();
    applyTheme();
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
