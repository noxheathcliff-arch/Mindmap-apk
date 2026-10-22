/* Pioneer — Recherche plein texte (Ctrl/⌘ K) : cours, cartes, notions et notes
   Insensible aux accents et à la casse (loi de Postel).

   Présentation « index » : les notions sont rangées sous leur carte (le contexte n'est
   pas répété à chaque ligne), le passage trouvé est souligné au surligneur, et un numéro
   d'article propose aussi la recherche sur Légifrance.
   Mouvement : le panneau naît de son déclencheur ; la sélection est un fond qui suit
   souris et clavier ; le résultat choisi devient sa destination (View Transitions,
   via R.app.go({ from, swap })). */
(function (R) {
  'use strict';
  const { U, ui, store: S } = R;
  const { h } = U;

  let openEl = null;

  function highlight(text, terms) {
    let html = U.esc(text);
    if (!terms.length) return html;
    // surligne sur le texte normalisé en conservant les accents d'origine
    const norm = U.norm(text);
    const marks = [];
    for (const t of terms) {
      let i = norm.indexOf(t);
      while (i >= 0) { marks.push([i, i + t.length]); i = norm.indexOf(t, i + t.length); }
    }
    if (!marks.length) return html;
    marks.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [a, b] of marks) {
      if (a < pos) continue;
      out += U.esc(text.slice(pos, a)) + '<mark>' + U.esc(text.slice(a, b)) + '</mark>';
      pos = b;
    }
    return out + U.esc(text.slice(pos));
  }

  function snippet(note, terms) {
    const plain = R.md.plain(note);
    if (!plain) return '';
    const n = U.norm(plain);
    let at = -1;
    for (const t of terms) { at = n.indexOf(t); if (at >= 0) break; }
    if (at < 0) return plain.slice(0, 110) + (plain.length > 110 ? '…' : '');
    const start = Math.max(0, at - 40);
    return (start ? '…' : '') + plain.slice(start, start + 120) + (start + 120 < plain.length ? '…' : '');
  }

  function query(q) {
    const terms = U.norm(q).split(/\s+/).filter(Boolean);
    const res = { courses: [], maps: [], nodes: [], terms };
    if (!terms.length) return res;
    const match = (s) => { const n = U.norm(s); return terms.every((t) => n.includes(t)); };
    for (const c of S.data.courses) if (match(c.title + ' ' + c.description)) res.courses.push(c);
    for (const m of S.data.maps) {
      if (match(m.title)) res.maps.push(m);
      for (const n of m.nodes) {
        const inTitle = match(n.title);
        const inNote = !inTitle && match(n.title + ' ' + n.note + ' ' + S.TYPES[n.type].label);
        if (inTitle || inNote) res.nodes.push({ m, n, score: inTitle ? 2 : 1 });
      }
    }
    res.nodes.sort((a, b) => b.score - a.score || b.m.updatedAt - a.m.updatedAt);
    res.nodes = res.nodes.slice(0, 40);
    return res;
  }

  /** « 1128 », « art. 1240 », « L. 132-1 » → référence d'article (sinon null) */
  const ART_Q = /^(?:art(?:icles?)?\.?\s*)?(?:[LRDA]\.?\s?)?\d{1,4}(?:[-.]\d+)*$/i;
  function articleRef(q) {
    const s = q.trim();
    if (!ART_Q.test(s)) return null;
    return /^art/i.test(s) ? s : 'art. ' + s;
  }

  /** Notions regroupées par carte, cartes ordonnées par leur meilleur résultat */
  function byMap(nodes) {
    const groups = new Map();
    for (const r of nodes) {
      if (!groups.has(r.m.id)) groups.set(r.m.id, { m: r.m, list: [] });
      groups.get(r.m.id).list.push(r);
    }
    return [...groups.values()];
  }

  const SCOPES = [['all', 'Tout'], ['courses', 'Cours'], ['maps', 'Cartes'], ['nodes', 'Notions']];

  /**
   * from : élément déclencheur (le panneau en naît et y retourne). Sans lui (raccourci
   * clavier), le panneau descend légèrement depuis le haut.
   */
  function open(initial = '', { from } = {}) {
    if (openEl) { openEl.querySelector('input').focus(); return; }
    ui.closeMenu();
    const prevFocus = document.activeElement;
    const input = h('input.search-input', { type: 'search', placeholder: 'Notion, note, article…', 'aria-label': 'Rechercher', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'search-results', 'aria-autocomplete': 'list' });
    input.value = initial;
    const list = h('div.search-results#search-results', { role: 'listbox', 'aria-label': 'Résultats' });
    const back = ui.iconBtn('back', { title: 'Fermer', cls: 'search-back' });
    const clearBtn = ui.iconBtn('close', { title: 'Effacer', cls: 'search-clear' });
    const scopes = h('div.search-scopes', { role: 'tablist', 'aria-label': 'Filtrer les résultats' });
    const foot = h('div.search-foot', { 'aria-hidden': 'true' },
      h('span', h('kbd', '↑'), h('kbd', '↓'), ' naviguer'), h('span', h('kbd', '↵'), ' ouvrir'), h('span', h('kbd', 'Échap'), ' fermer'));
    const box = h('div.search', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recherche' },
      h('div.search-bar', back, R.icon('search', 22, 'search-ic'), input, clearBtn),
      scopes,
      h('div.search-scroll', list),
      foot);
    const scrim = h('div.scrim.search-scrim');
    const wrap = h('div.search-wrap', scrim, box);
    U.$('#overlays').appendChild(wrap);
    openEl = wrap;

    // le panneau naît de son déclencheur (même principe que ui.dialog({ origin }))
    if (from && from.isConnected) {
      const o = from.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      box.style.transformOrigin = `${Math.round(o.left + o.width / 2 - w.left - box.offsetLeft)}px ${Math.round(o.top + o.height / 2 - w.top - box.offsetTop)}px`;
      box.classList.add('from-origin');
    }
    // la destination « Rechercher » s'allume dans la navigation tant que le panneau est ouvert
    for (const el of U.$$('.nav-item')) el.classList.toggle('active', el.dataset.key === 'search');
    requestAnimationFrame(() => { wrap.classList.add('in'); input.focus(); });

    let items = [];
    let active = 0;
    let scope = 'all';
    let firstPaint = true;

    const teardown = () => {
      document.removeEventListener('keydown', onKey, true);
      openEl = null;
      R.app.updateNav();
    };
    const close = () => {
      if (openEl !== wrap) return;
      wrap.classList.remove('in');
      wrap.classList.add('out');
      teardown();
      setTimeout(() => wrap.remove(), U.reducedMotion() ? 120 : 160);
      if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };

    /* Ouvrir un résultat : avec View Transitions, le panneau disparaît dans la capture
       « avant » et la ligne choisie se transforme en sa destination ; sinon, fermeture
       ordinaire puis navigation. */
    const go = (href, row) => {
      if (openEl !== wrap) return;
      R.app.go(href, {
        from: row,
        swap: (viaVT) => {
          if (!viaVT) { close(); return; }
          teardown();
          wrap.remove();
        },
      });
    };

    const item = (lead, title, sub, onPick, { hero, end, cls = '' } = {}) => {
      const b = h('button.list-item.search-item', { type: 'button', role: 'option', class: cls, dataset: hero ? { hero } : {} },
        lead ? h('span.si-lead', lead) : null,
        h('span.si-body', h('span.si-title', typeof title === 'string' ? { html: title } : {}, typeof title === 'string' ? null : title), sub ? h('span.si-sub', { html: sub }) : null),
        end || null);
      b.addEventListener('click', () => onPick(b));
      b.addEventListener('pointermove', () => { const i = items.indexOf(b); if (i !== active) setActive(i, { scroll: false }); });
      items.push(b);
      return b;
    };

    const mapThumb = (m) => {
      const t = R.thumb(m);
      t.dataset.hero = 'map:' + m.id + ':thumb';
      return h('span.si-thumb', t);
    };
    const titleHero = (key, html) => h('span', { dataset: { hero: key + ':title' }, html });

    function setActive(i, { scroll = true } = {}) {
      if (i < 0 || !items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((x, k) => x.setAttribute('aria-selected', String(k === active)));
      const it = items[active];
      input.setAttribute('aria-activedescendant', it.id || (it.id = 'si-' + Math.random().toString(36).slice(2, 8)));
      if (scroll) it.scrollIntoView({ block: 'nearest' });
    }

    function group(label, extra) {
      return h('p.search-group', label, extra || null);
    }

    function paintScopes(r) {
      U.clear(scopes);
      const counts = { all: r.courses.length + r.maps.length + r.nodes.length, courses: r.courses.length, maps: r.maps.length, nodes: r.nodes.length };
      const kinds = ['courses', 'maps', 'nodes'].filter((k) => counts[k]).length;
      scopes.hidden = kinds < 2;
      if (scopes.hidden) return;
      for (const [k, label] of SCOPES) {
        if (k !== 'all' && !counts[k]) continue;
        const b = h('button.search-scope', { type: 'button', role: 'tab', 'aria-selected': String(scope === k) },
          label, h('span.search-scope-n', String(counts[k])));
        b.addEventListener('click', () => { scope = k; paint(); input.focus({ preventScroll: true }); });
        scopes.appendChild(b);
      }
    }

    function paint() {
      const q = input.value.trim();
      U.clear(list);
      items = [];
      clearBtn.hidden = !q;
      list.scrollTop = 0;
      if (!q) {
        scopes.hidden = true;
        scope = 'all';
        const recents = S.recentMaps(5);
        if (recents.length) {
          list.appendChild(group('Récemment modifiées'));
          for (const m of recents) {
            const c = S.course(m.courseId);
            list.appendChild(item(mapThumb(m), titleHero('map:' + m.id, U.esc(m.title)), c ? U.esc(c.title) : '', (b) => go('#/carte/' + m.id, b)));
          }
        }
        list.appendChild(group('Raccourcis'));
        list.appendChild(item(R.icon('plus', 20), 'Nouveau cours', '', () => {
          close();
          if (R.app.route && R.app.route.name !== 'library') R.app.go('#/');
          setTimeout(R.actions.newCourse, 250);
        }, { cls: 'si-action' }));
        const due = S.dueCount();
        list.appendChild(item(R.icon('cards', 20), 'Réviser maintenant', due ? '' : 'Tout est à jour', (b) => go(due ? '#/reviser/tout' : '#/reviser', b),
          { cls: 'si-action', end: due ? h('span.si-badge', String(due)) : null }));
        list.appendChild(h('p.search-hint', 'Astuce : tape un numéro d’article (ex. ', h('b', '1128'), ') pour le retrouver dans tes notes et sur Légifrance.'));
        finish();
        return;
      }
      const r = query(q);
      const t = r.terms;
      const art = articleRef(q);
      paintScopes(r);
      if (scope !== 'all' && !r[scope].length) scope = 'all';
      const show = (k) => scope === 'all' || scope === k;
      if (!r.courses.length && !r.maps.length && !r.nodes.length) {
        list.appendChild(h('div.search-empty', R.icon('search', 28), h('p', 'Aucun résultat pour « ', h('b', q), ' »'),
          h('p.muted', art ? 'Rien dans tes notes : tu peux chercher le texte officiel.' : 'Essaie un autre mot, un type (« jurisprudence ») ou un numéro d’article.')));
      }
      if (r.courses.length && show('courses')) {
        list.appendChild(group('Cours'));
        for (const c of r.courses) {
          const n = S.mapsOf(c.id).length;
          list.appendChild(item(R.courseArt.mark(c, { size: 'xs', hero: true }), titleHero('course:' + c.id, highlight(c.title, t)), U.esc(c.description),
            (b) => go('#/cours/' + c.id, b), { hero: 'course:' + c.id + ':band', end: h('span.si-end', U.plural(n, 'carte')) }));
        }
      }
      if (r.maps.length && show('maps')) {
        list.appendChild(group('Cartes'));
        for (const m of r.maps) {
          const c = S.course(m.courseId);
          list.appendChild(item(mapThumb(m), titleHero('map:' + m.id, highlight(m.title, t)), c ? U.esc(c.title) : '', (b) => go('#/carte/' + m.id, b)));
        }
      }
      if (r.nodes.length && show('nodes')) {
        list.appendChild(group('Notions et notes'));
        for (const g of byMap(r.nodes)) {
          const c = S.course(g.m.courseId);
          list.appendChild(h('p.search-sub', R.icon('map', 16), h('span.search-sub-t', g.m.title), c ? h('span.search-sub-c', c.title) : null));
          for (const { m, n } of g.list) {
            const T = S.TYPES[n.type];
            const title = (T.kicker ? `<span class="si-kicker">${U.esc(T.kicker)}</span>` : '') + highlight(n.title || 'Sans titre', t);
            const sub = n.note.trim() ? highlight(snippet(n.note, t), t) : '';
            list.appendChild(item(null, title, sub, (b) => go(`#/carte/${m.id}?n=${n.id}`, b), { hero: 'map:' + m.id + ':node', cls: 'si-node' }));
          }
        }
      }
      if (art) {
        list.appendChild(group('Texte officiel'));
        const a = item(R.icon('globe', 20), `Chercher « ${U.esc(art)} » sur Légifrance`, 'S’ouvre dans un nouvel onglet', () => {
          window.open(R.md.legifrance(art), '_blank', 'noopener');
        }, { cls: 'si-action', end: R.icon('external', 18, 'si-ext') });
        list.appendChild(a);
      }
      finish();
    }

    function finish() {
      // entrée en cascade à l'ouverture seulement : pendant la frappe, la liste se met à jour sans bouger
      if (firstPaint && !U.reducedMotion()) {
        Array.from(list.children).slice(0, 10).forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('si-in'); });
      }
      firstPaint = false;
      setActive(items.length ? 0 : -1);
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); if (items[active]) items[active].click(); }
    };
    document.addEventListener('keydown', onKey, true);
    input.addEventListener('input', U.debounce(paint, 60));
    back.addEventListener('click', close);
    clearBtn.addEventListener('click', () => { input.value = ''; paint(); input.focus(); });
    scrim.addEventListener('click', close);
    paint();
  }

  R.search = { open, query };
})(window.R);
