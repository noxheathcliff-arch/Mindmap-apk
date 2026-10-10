/* Ratio — Recherche plein texte (Ctrl/⌘ K) : cours, cartes, notions et notes
   Insensible aux accents et à la casse (loi de Postel). */
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

  function open(initial = '') {
    if (openEl) { openEl.querySelector('input').focus(); return; }
    ui.closeMenu();
    const prevFocus = document.activeElement;
    const input = h('input.search-input', { type: 'search', placeholder: 'Rechercher une notion, une note, un article…', 'aria-label': 'Rechercher', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    input.value = initial;
    const list = h('div.search-results', { role: 'listbox' });
    const back = ui.iconBtn('back', { title: 'Fermer', cls: 'search-back' });
    const clearBtn = ui.iconBtn('close', { title: 'Effacer', cls: 'search-clear' });
    const box = h('div.search', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recherche' },
      h('div.search-bar', back, R.icon('search', 22, 'search-ic'), input, clearBtn, h('kbd.search-esc', 'Échap')),
      list);
    const scrim = h('div.scrim.search-scrim');
    const wrap = h('div.search-wrap', scrim, box);
    U.$('#overlays').appendChild(wrap);
    openEl = wrap;
    requestAnimationFrame(() => { wrap.classList.add('in'); input.focus(); });

    let items = [];
    let active = 0;

    const close = () => {
      if (!openEl) return;
      wrap.classList.remove('in');
      wrap.classList.add('out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => wrap.remove(), 200);
      openEl = null;
      if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };

    const go = (href) => { close(); R.app.go(href); };

    const item = (icon, title, sub, href, extra) => {
      const b = h('button.list-item.search-item', { type: 'button', role: 'option' },
        h('span.si-ic', icon),
        h('span.si-body', h('span.si-title', { html: title }), sub ? h('span.si-sub', { html: sub }) : null),
        extra || null);
      b.addEventListener('click', () => go(href));
      b.addEventListener('pointermove', () => setActive(items.indexOf(b)));
      items.push(b);
      return b;
    };

    function setActive(i) {
      if (i < 0 || !items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((x, k) => x.setAttribute('aria-selected', String(k === active)));
      items[active].scrollIntoView({ block: 'nearest' });
    }

    function paint() {
      const q = input.value.trim();
      U.clear(list);
      items = [];
      clearBtn.hidden = !q;
      if (!q) {
        const recents = S.recentMaps(5);
        if (recents.length) {
          list.appendChild(h('p.search-group', 'Récemment modifiées'));
          for (const m of recents) {
            const c = S.course(m.courseId);
            list.appendChild(item(R.icon('map', 20), U.esc(m.title), c ? U.esc(c.title) : '', '#/carte/' + m.id));
          }
        }
        list.appendChild(h('p.search-group', 'Actions'));
        list.appendChild(item(R.icon('plus', 20), 'Nouveau cours', '', '#/', null)).addEventListener('click', () => setTimeout(R.actions.newCourse, 250));
        list.appendChild(item(R.icon('cards', 20), 'Réviser maintenant', `${S.dueCount()} carte(s) à réviser`, '#/reviser'));
        setActive(0);
        return;
      }
      const r = query(q);
      const t = r.terms;
      if (!r.courses.length && !r.maps.length && !r.nodes.length) {
        list.appendChild(h('div.search-empty', R.icon('search', 32), h('p', 'Aucun résultat pour « ', h('b', q), ' »'), h('p.muted', 'Essaie un autre mot, ou un numéro d’article.')));
        return;
      }
      if (r.courses.length) {
        list.appendChild(h('p.search-group', 'Cours'));
        for (const c of r.courses) list.appendChild(item(h('span.cc-mono.xs', U.initials(c.title)), highlight(c.title, t), U.esc(c.description), '#/cours/' + c.id));
      }
      if (r.maps.length) {
        list.appendChild(h('p.search-group', 'Cartes'));
        for (const m of r.maps) { const c = S.course(m.courseId); list.appendChild(item(R.icon('map', 20), highlight(m.title, t), c ? U.esc(c.title) : '', '#/carte/' + m.id)); }
      }
      if (r.nodes.length) {
        list.appendChild(h('p.search-group', 'Notions et notes'));
        for (const { m, n } of r.nodes) {
          const T = S.TYPES[n.type];
          const sub = [U.esc(m.title), n.note.trim() ? highlight(snippet(n.note, t), t) : ''].filter(Boolean).join(' — ');
          list.appendChild(item(R.icon(n.note.trim() ? 'note' : 'dot', 20), (T.kicker ? `<span class="si-kicker">${T.kicker}</span>` : '') + highlight(n.title || 'Sans titre', t), sub, `#/carte/${m.id}?n=${n.id}`));
        }
      }
      setActive(0);
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) items[active].click(); }
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
