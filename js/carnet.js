/* Carnet — carnet d'exercices à spirale (reliure en haut, papier Seyès).
   const nb = Carnet.mount(host, { kicker, title, subtitle, count })
   nb.setPage(node) · nb.open() · nb.prep(el) · nb.write(el, { ink, cps, lift }) · nb.skip()
   nb.mark(target, kind, { ink, lift }) · nb.flag() · nb.turn(next) · nb.close({ score }) · nb.setDark(bool)
   ink : 'lead' (énoncé), 'blue' (l'élève), 'red' (la correction). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const HOLE_Y = 14;                       // axe des trous : la feuille pivote autour du fil
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const rad = (d) => (d * Math.PI) / 180;
  // réglage de l'app (data-motion) d'abord, sinon la préférence système
  const reduced = () => { const m = document.documentElement.dataset.motion; return m ? m === 'reduce' : matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function s(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let a = 0, b = 1, t = x;
      for (let i = 0; i < 40; i++) { if (X(t) < x) a = t; else b = t; t = (a + b) / 2; }
      return Y(t);
    };
  }
  const E = { std: bezier(0.2, 0, 0, 1), out: bezier(0.23, 1, 0.32, 1), turn: bezier(0.45, 0, 0.2, 1), io: bezier(0.4, 0, 0.2, 1), fall: bezier(0.55, 0, 0.75, 0.6) };
  // ressort amorti, échantillonné (rigidité, amortissement) → f(u), u ∈ [0,1] sur la durée de stabilisation
  function spring(k, c) {
    const w0 = Math.sqrt(k), z = c / (2 * Math.sqrt(k)), wd = w0 * Math.sqrt(1 - z * z);
    const f = (t) => 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    let T = 0; while (T < 4 && Math.exp(-z * w0 * T) > 0.004) T += 0.01;
    return { ms: T * 1000, at: (u) => (u >= 1 ? 1 : f(u * T)) };
  }
  const lin = (fn, n = 32) => 'linear(' + Array.from({ length: n + 1 }, (_, i) => +fn(i / n).toFixed(4)).join(', ') + ')';
  // courbe par points de contrôle (interpolation cosinus)
  function track(pts) {
    return (t) => {
      t = clamp(t, 0, 1);
      for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
        const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
        return lerp(v0, v1, (1 - Math.cos(Math.PI * ((t - t0) / (t1 - t0)))) / 2);
      }
      return pts[pts.length - 1][1];
    };
  }

  // ---- tour de page --------------------------------------------------------
  // angle du feuillet : anticipation (le bas se soulève vers le lecteur, se tasse), puis l'arc complet
  function lift(t, A, H, L) {
    if (t < A) return L * Math.sin((Math.PI / 2) * (t / A));          // soulève
    if (t < H) return L - 1.2 * smooth((t - A) / (H - A));            // léger tassement : on retient
    return null;
  }
  function theta(t) {
    const A = 0.1, H = 0.17, L = 6;
    const v = lift(t, A, H, L);
    return v !== null ? v : (L - 1.2) + (360 - L + 1.2) * E.turn((t - H) / (1 - H));
  }
  // la feuille passe derrière le carton une fois retournée
  const zOf = (th) => (th < 150 ? 0.5 : th > 320 ? -15 : lerp(0.5, -15, smooth((th - 150) / 170)));
  // courbure : le bas mène au décollage, traîne pendant l'arc, puis se pose avec un petit rebond
  const curl = track([[0, 0], [0.1, 4], [0.17, 2.5], [0.32, 15], [0.56, -12], [0.76, 4.5], [0.88, -1.5], [1, 0]]);

  // ---- post-it ---------------------------------------------------------------
  const RED_MIN = 150;                     // place minimale gardée au rouge sur la page (px)
  const POST_MAX = 3;
  const BLOCKS = 'li,p,ul,ol,div,blockquote,h1,h2,h3,h4,h5,h6,pre,table';
  const words = (els) => els.flatMap((el) => [...el.querySelectorAll('.nb-w')]);
  // cache les mots k… (et les blocs qui n'ont plus de mot visible) : sert à mesurer sans rien casser
  function cutAt(els, ws, k) {
    ws.forEach((w, i) => w.classList.toggle('nb-cut', i >= k));
    for (const el of els) for (const b of [el, ...el.querySelectorAll(BLOCKS)]) {
      const f = b.querySelector('.nb-w');
      if (f) b.classList.toggle('nb-cut', ws.indexOf(f) >= k);
    }
  }
  const uncut = (root) => { root.classList.remove('nb-cut'); root.querySelectorAll('.nb-cut').forEach((x) => x.classList.remove('nb-cut')); };
  // plus grand k (0 ≤ k ≤ n) tel que ok(k) ; ok est supposé décroissant
  function search(n, ok) {
    let a = 0, b = n;
    if (ok(n)) return n;
    while (a < b) { const m = Math.ceil((a + b) / 2); if (m < n && ok(m)) a = m; else b = m - 1; }
    return a;
  }
  // découpe : ce qui suit le mot k quitte els, en morceaux de même balise et même classe
  function carve(els, ws, k) {
    if (k >= ws.length) return [];
    const start = ws[k], out = [];
    let on = false;
    for (const el of els) {
      if (on) { el.remove(); out.push(el); continue; }
      if (!el.contains(start)) continue;
      on = true;
      const li = start.closest('li'), ol = li && li.parentElement && li.parentElement.tagName === 'OL' && el.contains(li.parentElement) ? li.parentElement : null;
      const cont = li && li.querySelector('.nb-w') !== start;
      const before = ol ? [...ol.children].indexOf(li) : 0;
      const r = document.createRange();
      r.setStartBefore(start);
      r.setEnd(el, el.childNodes.length);
      const piece = el.cloneNode(false);
      piece.append(r.extractContents());
      // les coquilles vides laissées par la découpe disparaissent
      for (const root of [el, piece]) [...root.querySelectorAll(BLOCKS + ',strong,em,mark,span:not(.nb-c)')].reverse().forEach((x) => { if (!x.querySelector('.nb-c') && !x.textContent.trim()) x.remove(); });
      // liste numérotée : la suite garde ses numéros, la ligne coupée continue sans en prendre un
      const pol = ol && (piece.tagName === 'OL' ? piece : piece.querySelector('ol'));
      if (pol) { pol.start = (+ol.getAttribute('start') || 1) + before; if (cont && pol.firstElementChild) pol.firstElementChild.classList.add('nb-cont'); }
      if (!el.querySelector('.nb-w')) el.remove();
      out.push(piece);
    }
    return out;
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ESC[c]);

  function Carnet(host, o = {}) {
    this.o = o;
    this.count = o.count || 1;
    this.flags = 0;
    this.fast = false;
    this.cur = null;
    const root = (this.root = h('div', 'nb-root'));
    const book = (this.book = h('div', 'nb-book'));
    this.boardEl = h('div', 'nb-board');
    this.behind = h('div', 'nb-behind');
    this.edges = h('div', 'nb-edges');
    this.sheet = h('div', 'nb-sheet');
    this.paper = h('div', 'nb-paper');
    this.content = h('div', 'nb-content');
    this.shade = h('div', 'nb-under-shade');
    this.sheet.append(this.paper, this.content, this.shade);
    this.cover = h('div', 'nb-cover');
    const front = h('div', 'nb-cover-face');
    front.append(h('div', 'nb-cover-band'));
    this.label = h('div', 'nb-label',
      `<div class="nb-label-k">${esc(o.kicker || 'Cahier d’exercices')}</div>` +
      `<div class="nb-label-t">${esc(o.title || '')}</div>` +
      `<div class="nb-label-s">${esc(o.subtitle || '')}</div>` +
      '<div class="nb-label-score"></div>');
    front.append(this.label);
    this.cover.append(front, h('div', 'nb-cover-face is-inside'));
    this.coil = s('svg', { class: 'nb-coil', 'aria-hidden': 'true' });
    this.pen = h('div', 'nb-pen',
      '<svg viewBox="0 0 84 84" aria-hidden="true"><g transform="translate(2 82) rotate(-52)">' +
      '<path class="nib" d="M0 0 L11 -3.4 L11 3.4 Z"/><rect class="grip" x="10" y="-4.6" width="16" height="9.2" rx="2.5"/>' +
      '<rect class="body" x="25" y="-5.5" width="60" height="11" rx="5.5"/><rect class="hi" x="29" y="-3.4" width="48" height="2" rx="1"/>' +
      '<rect class="grip" x="73" y="-6.2" width="8" height="12.4" rx="2"/></g></svg>');
    book.append(this.boardEl, this.behind, this.edges, this.sheet, this.cover, this.coil, this.pen);
    root.append(book);
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', o.title || 'Carnet');
    root.style.opacity = '0';
    host.append(root);
    this.host = host;
    this.layout();
    this.setStack(this.count);
    this.setDark(o.dark != null ? o.dark : document.documentElement.dataset.theme === 'dark' ||
      (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));
    root.addEventListener('pointerdown', () => { if (this.cur) this.skip(); });
  }

  Carnet.prototype = {
    // ---- mise en page --------------------------------------------------------
    layout() {
      const W = Math.round(clamp(this.host.clientWidth, 280, this.o.maxWidth || 440));
      const H = Math.round(clamp(Math.min(W * 1.42, innerHeight - (this.o.reserve || 240)), this.o.minHeight || 440, 640));
      const n = Math.max(6, Math.round((W - 28) / 22)), pitch = (W - 28) / n, m0 = 14;
      this.W = W; this.H = this.baseH = H;
      const a = (pitch / 2 - 3.5).toFixed(2), b = (pitch / 2 + 3.5).toFixed(2);
      const holes =
        `linear-gradient(#000 ${HOLE_Y - 3}px, transparent ${HOLE_Y - 3}px ${HOLE_Y + 3}px, #000 ${HOLE_Y + 3}px) 0 0 / 100% 100% no-repeat, ` +
        `linear-gradient(to right, #000 ${a}px, transparent ${a}px ${b}px, #000 ${b}px) ${m0}px 0 / ${pitch.toFixed(3)}px 100% repeat-x, ` +
        `linear-gradient(to right, #000 ${m0}px, transparent ${m0}px ${W - m0}px, #000 ${W - m0}px) 0 0 / 100% 100% no-repeat`;
      const st = this.root.style;
      st.setProperty('--nb-w', W + 'px');
      st.setProperty('--nb-h', H + 'px');
      st.setProperty('--nb-pitch', pitch + 'px');
      st.setProperty('--nb-holes', holes);
      // spirale Wire-O : deux boucles par trou, qui sortent du trou et repassent derrière la feuille
      const c = this.coil;
      c.setAttribute('viewBox', `0 0 ${W + 8} 44`);
      let back = '', wire = '', hi = '';
      for (let i = 0; i < n; i++) {
        const X = m0 + pitch * (i + 0.5) + 4;
        for (const x of [X - 2.3, X + 2.1]) {
          wire += `M${x} 35.5 C${x} 24 ${x - 0.4} 11 ${x + 1.6} 5.4 S${x + 4.8} 4.4 ${x + 4.6} 9 `;
          back += `M${x + 4.6} 9 L${x + 4.2} 19.6 `;
          hi += `M${x - 0.7} 31 C${x - 0.7} 23 ${x - 1} 14 ${x + 0.5} 8.4 `;
        }
      }
      c.innerHTML = `<rect class="spine" x="${m0 + 4}" y="13" width="${W - 2 * m0}" height="5" rx="2.5"/>` +
        `<path class="w-back" d="${back}"/><path class="w" d="${wire}"/><path class="w-hi" d="${hi}"/>`;
      this.fit();
    },
    // la page doit contenir l'énoncé et ce qui s'écrit au crayon (verdict compris) : on réduit
    // d'abord l'écriture, puis on allonge la feuille si besoin. Le rouge (correction, explication)
    // n'entre jamais dans ce calcul : une place fixe lui est réservée, le reste ira sur des post-it.
    fit() {
      const c = this.content, pg = c.firstElementChild;
      let H = this.baseH;
      c.classList.remove('nb-fit-1', 'nb-fit-2');
      if (pg) {
        c.classList.add('nb-measure');
        const red = pg.querySelector('.nb-answer .nb-red') ? RED_MIN : 0;
        const need = () => Math.ceil(pg.offsetTop + pg.offsetHeight + 30 + red);
        for (const k of ['nb-fit-1', 'nb-fit-2']) {
          if (need() <= H) break;
          c.classList.remove('nb-fit-1');
          c.classList.add(k);
        }
        const n = need();
        if (n > H) H = Math.ceil(n / 7) * 7;
        c.classList.remove('nb-measure');
      }
      this.H = H;
      this.root.style.setProperty('--nb-h', H + 'px');
    },
    setDark(on) { this.root.classList.toggle('is-dark', !!on); },
    setStack(n) { this.left = n; this.root.style.setProperty('--nb-stack', clamp(n, 1, 14)); },

    setPage(node) {
      this.content.replaceChildren(node);
      this.fast = false;
      this.fit();
    },

    // ---- débordement du rouge : post-it ------------------------------------------
    /* reds : les éléments rouges de la page, déjà découpés (prep), dans l'ordre. La feuille ne
       change pas de taille : ce qui ne tient pas est coupé proprement (« … suite ↓ ») et passe sur
       1 à 3 post-it, rangés dans une réserve sous le texte gardé (rien ne se chevauche).
       Renvoie null (tout tient) ou { slot, after, run } : run() fait apparaître, écrire et coller
       les post-it ; after est l'élément après lequel les lancer. */
    spill(reds) {
      const c = this.content, pg = c.firstElementChild;
      reds = (reds || []).filter((el) => el && pg && pg.contains(el) && !el.closest('.nb-postit'));
      if (!pg || !reds.length) return null;
      if (pg._spill !== undefined) return pg._spill;
      const ws = words(reds);
      const need = () => Math.ceil(pg.offsetTop + pg.offsetHeight + 30);
      c.classList.add('nb-reserve');
      const done = (v) => { c.classList.remove('nb-reserve'); return (pg._spill = v); };
      if (!ws.length || need() <= this.H) return done(null);

      // géométrie : réserve de la largeur de la page (marge comprise), post-it côte à côte
      const slot = h('div', 'nb-slot');
      const more = h('span', 'nb-more', '… suite ↓');
      more.setAttribute('aria-hidden', 'true');
      reds[reds.length - 1].after(slot);
      const aw = slot.clientWidth, gap = 12;
      // n post-it : une rangée si la largeur le permet (≥ 118 px chacun), sinon deux colonnes
      const geo = (n) => {
        let cols = Math.min(n, Math.max(1, Math.floor((aw + gap) / (118 + gap))));
        if (n === 3 && cols < 3) cols = 2;
        const pw = Math.round(Math.min(n === 1 ? 210 : 230, (aw - (cols - 1) * gap) / cols));
        return { cols, pw, rows: Math.ceil(n / cols) };
      };
      const slotH = (g, ph) => g.rows * ph + (g.rows - 1) * gap;
      const place = (k) => {
        cutAt(reds, ws, k);
        if (k > 0) { ws[k - 1].after(more); reds.find((el) => el.contains(ws[k - 1])).after(slot); }
        else { more.remove(); reds[0].before(slot); }
      };
      const mk = (i, n, pw, ph) => {
        const p = h('div', 'nb-postit');
        p.setAttribute('role', 'note');
        p.setAttribute('aria-label', n > 1 ? `Suite de la correction, post-it ${i + 1} sur ${n}` : 'Suite de la correction (post-it)');
        p.style.width = pw + 'px'; p.style.height = ph + 'px';
        const body = h('div', 'nb-postit-body nb-writing');
        body.dataset.nbSplit = '1';
        p.append(h('div', 'nb-postit-shadow'), h('div', 'nb-postit-paper'), body, h('div', 'nb-postit-curl'));
        p.body = body;
        return p;
      };
      const fits = (body) => body.scrollHeight <= body.clientHeight + 1;
      // remplit les post-it les uns après les autres ; renvoie ce qui reste après le dernier
      const fill = (posts, pieces) => {
        for (let i = 0; i < posts.length && pieces.length; i++) {
          const b = posts[i].body;
          b.append(...pieces);
          pieces = [];
          if (i === posts.length - 1) break;
          const els = [...b.children], bw = words(els);
          const k = Math.max(1, search(bw.length, (m) => { cutAt(els, bw, m); return fits(b); }));
          uncut(b);
          pieces = carve(els, bw, k);
        }
        return pieces;
      };

      // le plus petit nombre de post-it, puis la plus petite hauteur, qui suffisent ; au-delà de
      // 3 post-it, le dernier se resserre puis défile
      let n = 1, k = 0, g = geo(1), ph = 118;
      const trial = (nn, gg, hh) => {
        slot.style.height = slotH(gg, hh) + 'px';
        const kk = search(ws.length - 1, (m) => { place(m); return need() <= this.H; });
        place(kk);
        if (need() > this.H) return null;                       // la réserve elle-même ne tient pas
        const copy = reds.map((el) => el.cloneNode(true));
        copy.forEach(uncut);
        const tail = carve(copy, words(copy), kk);
        const posts = Array.from({ length: nn }, () => mk(0, nn, gg.pw, hh));
        posts.forEach((p) => { p.style.visibility = 'hidden'; slot.append(p); });
        fill(posts, tail);
        const lb = posts[nn - 1].body, ex = lb.scrollHeight - lb.clientHeight;
        posts.forEach((p) => p.remove());
        return { k: kk, ex };
      };
      // rien ne suffit : la disposition qui laisse le moins de reste au dernier post-it
      let best = Infinity;
      pick: for (let nn = 1; nn <= POST_MAX; nn++) {
        const gg = geo(nn), top = Math.round(Math.min(gg.pw * 1.4, 290));
        for (let hh = 118; hh <= top; hh += 20) {
          const r = trial(nn, gg, hh);
          if (!r) break;
          if (r.ex < best) { best = r.ex; n = nn; g = gg; ph = hh; k = r.k; }
          if (r.ex <= 1) break pick;
        }
      }
      slot.style.height = slotH(g, ph) + 'px';
      place(k);
      // découpe réelle
      uncut(pg);
      more.remove();
      const pieces = carve(reds, ws, k);
      pieces.forEach((p) => { p.classList.remove('nb-writing'); p.removeAttribute('data-nb-split'); });
      const kept = reds.filter((el) => el.isConnected && pg.contains(el));
      if (kept.length) {
        kept[kept.length - 1].after(slot);
        this.prep(more);
        more.classList.remove('nb-writing');
        words(kept).pop().after(more);              // la plume l'écrit à la suite du texte gardé
      }
      const posts = Array.from({ length: n }, (_, i) => mk(i, n, g.pw, ph));
      const { pw, cols } = g;
      posts.forEach((p) => slot.append(p));
      const rest = fill(posts, pieces);
      if (rest.length) posts[n - 1].body.append(...rest);
      const last = posts[n - 1].body;
      for (const f of ['is-fit-1', 'is-fit-2']) { if (fits(last)) break; last.classList.add(f); }
      if (!fits(last)) { last.classList.add('is-scroll'); last.tabIndex = 0; }
      // disposition : rangées centrées, chaque post-it un peu de biais
      const rot = [-2.4, 1.7, -1.1];
      posts.forEach((p, i) => {
        const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), col = i % cols;
        const x0 = (aw - (inRow * pw + (inRow - 1) * gap)) / 2;
        p.style.left = Math.round(x0 + col * (pw + gap) + (i % 2 ? 3 : -2)) + 'px';
        p.style.top = r * (ph + gap) + 'px';
        p.style.setProperty('--r', rot[i % 3] + 'deg');
        p.style.opacity = '0';
      });
      slot.style.height = slotH(g, ph) + 'px';
      const after = slot.previousElementSibling;
      return done({ slot, after, posts, run: () => this._stick(posts) });
    },

    // chaque post-it apparaît, s'écrit au stylo, puis se décolle de la main et vient se coller
    async _stick(posts) {
      for (const p of posts) {
        const rm = reduced();
        if (this.fast || rm) {
          p.style.opacity = '';
          if (rm && !this.fast) await p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }).finished;
          await this.write(p.body, { ink: 'red', lift: true });
          continue;
        }
        const r = parseFloat(p.style.getPropertyValue('--r')) || 0;
        // en main : plus haut, plus grand, plus de biais, ombre large et douce
        const air = { x: 16, y: -54, r: r - 5, s: 1.08 };
        const T = (x, y, rr, sx, sy = sx) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rr.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        const SH = (y, b, a) => `0 ${y.toFixed(1)}px ${b.toFixed(1)}px rgba(40, 30, 0, ${a.toFixed(3)})`;
        const sh = p.querySelector('.nb-postit-shadow');
        p.style.opacity = '';
        // 1. apparition : la feuille se détache du bloc, se déplie vers le lecteur
        const a1 = p.animate([
          { transform: T(air.x - 6, air.y + 14, air.r + 6, 0.86), opacity: 0 },
          { opacity: 1, offset: 0.5 },
          { transform: T(air.x, air.y, air.r, air.s), opacity: 1 },
        ], { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
        const s1 = sh.animate([{ boxShadow: SH(10, 14, 0) }, { boxShadow: SH(26, 30, 0.2) }], { duration: 280, easing: 'ease-out', fill: 'forwards' });
        this.cur = { anims: [a1, s1], pen: null };
        await a1.finished.catch(() => {});
        // 2. écriture, la feuille tenue en l'air
        await this.write(p.body, { ink: 'red', lift: true, max: 1800 });
        if (this.fast) { a1.cancel(); s1.cancel(); continue; }
        // 3. anticipation (se tasse, recule), arc, contact écrasé, retour ; le coin traîne et se recolle
        const N = 40, D = 880, kf = [], ks = [], kc = [];
        const tA = 0.15, tB = 0.64, tC = 0.73;          // fin anticipation · contact · écrasement maxi
        const arc = E.io;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          let x, y, rr, sx, sy, shY, shB, shA;
          if (t <= tA) {
            const u = smooth(t / tA);
            x = air.x + 3 * u; y = air.y + 5 * u; rr = air.r - 1.6 * u; sx = air.s + 0.02 * u; sy = air.s - 0.035 * u;
            shY = 26 - 4 * u; shB = 30 - 4 * u; shA = 0.2 + 0.02 * u;
          } else if (t <= tB) {
            const u = arc((t - tA) / (tB - tA));
            const q0 = { x: air.x + 3, y: air.y + 5 }, q1 = { x: air.x * 0.35 - 10, y: air.y - 30 };
            x = (1 - u) * (1 - u) * q0.x + 2 * u * (1 - u) * q1.x;            // arc : monte puis descend sur la place
            y = (1 - u) * (1 - u) * q0.y + 2 * u * (1 - u) * q1.y;
            rr = lerp(air.r - 1.6, r, u) + 1.2 * Math.sin(Math.PI * u);
            const st = 0.04 * Math.sin(Math.PI * Math.min(1, u * 1.4));    // étiré dans le mouvement
            sx = lerp(air.s + 0.02, 1, u) - st * 0.4; sy = lerp(air.s - 0.035, 1, u) + st;
            shY = lerp(22, 1.5, u); shB = lerp(26, 3, u); shA = lerp(0.22, 0.26, u);
          } else if (t <= tC) {
            const u = smooth((t - tB) / (tC - tB));
            x = 0; y = 0; rr = r; sx = 1 + 0.035 * u; sy = 1 - 0.055 * u;
            shY = 1.5; shB = 3 - u; shA = 0.26;
          } else {
            const u = (t - tC) / (1 - tC), sp = Math.exp(-5 * u) * Math.cos(Math.PI * 2.2 * u);
            x = 0; y = 0; rr = r; sx = 1 + 0.035 * sp; sy = 1 - 0.055 * sp;
            shY = 1.5; shB = 2 + 0.5 * u; shA = 0.26 - 0.04 * u;
          }
          kf.push({ transform: T(x, y, rr, sx, sy), offset: t });
          ks.push({ boxShadow: SH(shY, shB, shA), offset: t });
        }
        // le coin libre : soulevé par l'air pendant l'arc, il claque au contact puis se recolle à peine
        kc.push({ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1.5)', offset: tB - 0.12 }, { transform: 'scale(1.9)', offset: tB },
          { transform: 'scale(0.7)', offset: tC + 0.06 }, { transform: 'scale(1.12)', offset: 0.9 }, { transform: 'scale(1)', offset: 1 });
        const opt = { duration: D, easing: 'linear', fill: 'forwards' };
        a1.cancel(); s1.cancel();
        const all = [p.animate(kf, { ...opt, fill: 'none' }), sh.animate(ks, { ...opt, fill: 'none' }), p.querySelector('.nb-postit-curl').animate(kc, { ...opt, fill: 'none' })];
        this.cur = { anims: all, pen: null };
        await Promise.all(all.map((a) => a.finished)).catch(() => {});
        if (this.cur && this.cur.anims === all) this.cur = null;
      }
    },

    // ---- ouverture -----------------------------------------------------------
    async open() {
      const rm = reduced();
      this.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rm ? 160 : 420, easing: 'ease-out', fill: 'forwards' });
      if (!rm) {
        await this.book.animate([
          { transform: 'translateY(46px) scale(0.92) rotateZ(-4deg)' },
          { transform: 'translateY(-4px) scale(1.004) rotateZ(0.4deg)', offset: 0.72 },
          { transform: 'none' },
        ], { duration: 760, easing: lin(E.std), fill: 'none' }).finished;
        await wait(140);                                  // pose : on lit la couverture
      }
      await this._flipCover(true, rm);
    },
    // la couverture est rigide : elle pivote d'un bloc autour de la spirale
    async _flipCover(opening, rm) {
      const cv = this.cover;
      if (rm) {
        await cv.animate([{ opacity: opening ? 1 : 0 }, { opacity: opening ? 0 : 1 }], { duration: 200, fill: 'forwards' }).finished;
        cv.style.opacity = opening ? '0' : '1';
        cv.style.visibility = opening ? 'hidden' : '';
        return;
      }
      cv.style.opacity = '1';
      cv.style.visibility = '';
      const N = 48, kf = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        let th;
        if (opening) {
          const v = lift(t, 0.1, 0.17, 5);
          th = v !== null ? v : 3.8 + 356.2 * E.turn((t - 0.17) / 0.83);
        } else {
          // retour : la couverture tombe (accélère) puis rebondit à peine sur le carnet
          th = t < 0.8 ? 360 * (1 - E.fall(t / 0.8)) : 2.2 * Math.sin(Math.PI * ((t - 0.8) / 0.2)) * Math.exp(-(t - 0.8) * 6);
        }
        kf.push({ transform: `translateZ(${opening || th > 1 ? zOf(th) : 1}px) rotateX(${th.toFixed(2)}deg)`, offset: t });
      }
      const a = cv.animate(kf, { duration: opening ? 980 : 1050, easing: 'linear', fill: 'forwards' });
      if (!opening) {
        // impact : le carnet s'écrase un rien quand la couverture le frappe
        this.book.animate([{ transform: 'none' }, { transform: 'scale(0.988, 0.982)', offset: 0.35 }, { transform: 'scale(1.003)', offset: 0.7 }, { transform: 'none' }],
          { duration: 320, delay: 1050 * 0.8, easing: 'ease-out' });
      }
      await a.finished;
      cv.style.transform = opening ? 'translateZ(-15px) rotateX(360deg)' : 'translateZ(1px)';
      a.cancel();
      if (opening) cv.style.visibility = 'hidden';
    },

    // ---- écriture --------------------------------------------------------------
    prep(root) {
      if (!root || root.dataset.nbSplit) return root ? [...root.querySelectorAll('.nb-c')] : [];
      root.dataset.nbSplit = '1';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const tn of nodes) {
        if (!tn.nodeValue.trim()) continue;
        const frag = document.createDocumentFragment();
        let w = null, gap = false, glue = false;
        for (const part of tn.nodeValue.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { gap = true; continue; }
          // « ? », « : », « » » restent collés au mot d'avant, « « » au mot d'après
          const stick = w && (glue || /^[?!:;»%]/.test(part));
          if (stick) { if (gap) w.append(h('span', 'nb-c', '\u00a0')); }
          else { if (gap) frag.append(' '); w = h('span', 'nb-w'); frag.append(w); }
          gap = false;
          glue = /«$/.test(part);
          for (const ch of part) {
            const c = h('span', 'nb-c');
            c.textContent = ch;
            // la main n'est jamais parfaitement régulière
            c.style.transform = `translateY(${((Math.random() - 0.5) * 1.3).toFixed(2)}px) rotate(${((Math.random() - 0.5) * 3.2).toFixed(2)}deg)`;
            w.append(c);
          }
        }
        if (gap) frag.append(' '); // l'espace de fin sépare du nœud suivant
        tn.replaceWith(frag);
      }
      root.classList.add('nb-writing');
      return [...root.querySelectorAll('.nb-c')];
    },
    _local(r) {
      const b = this.book.getBoundingClientRect(), k = b.width / this.W || 1;
      return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k, k };
    },
    async write(root, { ink = 'lead', cps = 36, lift = true, max = 1500 } = {}) {
      const chars = this.prep(root);
      if (!chars.length) return;
      if (this.fast || reduced()) {
        root.classList.remove('nb-writing');
        if (!this.fast && reduced()) await root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }).finished;
        return;
      }
      cps = Math.max(cps, chars.length / (max / 1000));
      const gap = 1000 / cps, dur = clamp(gap * 2.4, 70, 150);
      const times = [];
      let t = 0, prevW = null;
      for (const c of chars) {
        const w = c.parentNode;
        if (prevW && w !== prevW) t += gap * 1.3;          // lever de plume entre les mots
        times.push(t);
        t += gap;
        if (/[.,;:!?…»)]/.test(c.textContent)) t += 110;  // la main marque la ponctuation
        prevW = w;
      }
      const total = t + dur;
      // invisible au départ (pas de liseré), large marge à l'arrivée : rien n'est rogné sur un i ou un l
      const hide = 'inset(-0.5em 100% -0.5em 0)', show = 'inset(-0.5em -0.6em -0.5em -0.4em)';
      const anims = chars.map((c, i) => c.animate([
        { clipPath: hide, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { clipPath: show, opacity: 1 },
      ], { duration: dur, delay: times[i], fill: 'both', easing: 'cubic-bezier(.3,.1,.4,1)' }));
      // la plume suit la lettre en cours, en sautillant un peu d'une lettre à l'autre
      const pts = [];
      let lastTop = null;
      chars.forEach((c, i) => {
        const r = this._local(c.getBoundingClientRect());
        if (lastTop != null && Math.abs(r.y - lastTop) > 8) {
          const p = pts[pts.length - 1];
          if (p) pts.push({ x: p.x + 6, y: p.y - 9, at: times[i] - gap * 0.6 });   // retour à la ligne : la plume se lève
        }
        lastTop = r.y;
        pts.push({ x: r.x + r.w * 0.9, y: r.y + r.h * 0.78 + (i % 2 ? -1.6 : 0.6), at: times[i] + dur * 0.7 });
      });
      const pen = this._pen(ink, pts, total, lift);
      const cur = (this.cur = { anims, pen });
      await Promise.all(anims.map((a) => a.finished)).catch(() => {});
      root.classList.remove('nb-writing');
      anims.forEach((a) => a.cancel());
      if (pen) await pen.finished.catch(() => {});
      if (this.cur === cur) this.cur = null;
    },
    skip() {
      this.fast = true;
      const c = this.cur;
      if (!c) return;
      c.anims.forEach((a) => a.finish());
      if (c.pen) c.pen.finish();
    },
    _pen(ink, pts, total, lift) {
      if (!pts.length) return null;
      const pen = this.pen;
      pen.classList.toggle('is-red', ink === 'red');
      pen.classList.toggle('is-lead', ink === 'lead');
      // la main pivote un peu autour de la pointe à chaque lettre, et se redresse en levant
      const tf = (p, dx = 0, dy = 0, r = 0) => `translate(${(p.x - 2 + dx).toFixed(1)}px, ${(p.y - 82 + dy).toFixed(1)}px) translateZ(10px) rotate(${r.toFixed(2)}deg)`;
      const end = total + (lift ? 280 : 60);
      const kf = [];
      const from = this._penAt;
      if (from && from.visible) kf.push({ transform: tf(from), opacity: 1, offset: 0 });
      else kf.push({ transform: tf(pts[0], 14, -18), opacity: 0, offset: 0 });
      const lead = Math.min(110, pts[0].at);
      kf.push({ transform: tf(pts[0], 0, -2), opacity: 1, offset: clamp((pts[0].at - lead * 0.2) / end, 0, 1) });
      let last = kf[kf.length - 1].offset;
      pts.forEach((p, i) => {
        const o = clamp(p.at / end, last, 1);
        kf.push({ transform: tf(p, 0, 0, Math.sin(i * 1.7) * 1.8), opacity: 1, offset: o });
        last = o;
      });
      const lp = pts[pts.length - 1];
      if (lift) {
        kf.push({ transform: tf(lp, 6, -9, -5), opacity: 1, offset: clamp(last + (1 - last) * 0.45, last, 1) });
        kf.push({ transform: tf(lp, 18, -26, -9), opacity: 0, offset: 1 });
      }
      else kf.push({ transform: tf(lp, 4, -3), opacity: 1, offset: 1 });
      this._penAt = lift ? null : { x: lp.x + 4, y: lp.y - 3, visible: true };
      kf[0].offset = 0;
      return pen.animate(kf, { duration: end, easing: 'linear', fill: 'forwards' });
    },
    // trait dessiné à la main (cercle, coche, rature…), la plume suit le tracé
    async draw(svg, d, { ink = 'blue', lift = true, speed = 0.55 } = {}) {
      const p = s('path', { d });
      svg.append(p);
      if (this.fast || reduced()) return;
      const L = p.getTotalLength();
      const dur = clamp(L / speed, 150, 520);
      p.style.strokeDasharray = L + ' ' + (L + 2);
      const a = p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: dur, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
      const pts = [], ease = E.io, n = 14;
      const off = this._local(svg.getBoundingClientRect());
      for (let i = 0; i <= n; i++) {
        const q = p.getPointAtLength(L * ease(i / n));
        pts.push({ x: off.x + q.x, y: off.y + q.y, at: (dur * i) / n });
      }
      const pen = this._pen(ink, pts, dur, lift);
      const cur = (this.cur = { anims: [a], pen });
      await a.finished.catch(() => {});
      if (pen) await pen.finished.catch(() => {});
      if (this.cur === cur) this.cur = null;
    },
    _layer(target, ink) {
      const host = target.closest('.nb-content, .nb-label') || this.content;
      const svg = s('svg', { class: 'nb-ink-svg ' + ink, 'aria-hidden': 'true' });
      svg.style.left = '0'; svg.style.top = '0'; svg.style.width = '100%'; svg.style.height = '100%';
      host.append(svg);
      const hr = host.getBoundingClientRect(), k = this.book.getBoundingClientRect().width / this.W || 1;
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - hr.left) / k, y: (r.top - hr.top) / k, w: r.width / k, h: r.height / k }; };
      return { svg, box, rects: (el) => [...el.getClientRects()].map((r) => ({ x: (r.left - hr.left) / k, y: (r.top - hr.top) / k, w: r.width / k, h: r.height / k })) };
    },
    async mark(target, kind, { ink = 'blue', lift = true, at } = {}) {
      const { svg, box, rects } = this._layer(target, ink);
      const r = box(target), j = () => (Math.random() - 0.5);
      const f = (v) => v.toFixed(1);
      if (kind === 'circle') {
        // cercle à main levée : ne se referme pas tout à fait, déborde un peu
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + 6, ry = r.h / 2 + 4.5, ph = Math.random() * 6;
        let d = '';
        for (let a = -120; a <= 268; a += 8) {
          const g = 1 + 0.045 * Math.sin(rad(a) * 3 + ph) + (a - -120) / 388 * 0.1;
          d += (d ? 'L' : 'M') + f(cx + Math.cos(rad(a)) * rx * g) + ' ' + f(cy + Math.sin(rad(a)) * ry * g) + ' ';
        }
        await this.draw(svg, d, { ink, lift });
      } else if (kind === 'check') {
        // coche dans la marge (ou juste après la cible)
        const x = at === 'after' ? r.x + r.w + 8 : this._marginX() - 30, y = r.y + r.h / 2 - 10;
        await this.draw(svg, `M${f(x)} ${f(y + 9 + j())} Q${f(x + 4)} ${f(y + 13)} ${f(x + 7)} ${f(y + 19)} Q${f(x + 12)} ${f(y + 4)} ${f(x + 22)} ${f(y - 4 + j() * 2)}`, { ink, lift, speed: 0.4 });
      } else if (kind === 'strike') {
        // on barre les mots, pas toute la ligne : un trait par ligne de mots
        const ws = target.querySelectorAll('.nb-w');
        const raw = ws.length ? [...ws].flatMap((w) => rects(w)) : rects(target);
        const ls = [];
        for (const q of raw.filter((q) => q.w > 2)) {
          const l = ls.find((o) => Math.abs(o.y - q.y) < q.h / 2);
          if (l) { const x2 = Math.max(l.x + l.w, q.x + q.w); l.x = Math.min(l.x, q.x); l.w = x2 - l.x; }
          else ls.push({ ...q });
        }
        for (let i = 0; i < ls.length; i++) {
          const q = ls[i], y = q.y + q.h * 0.56;
          await this.draw(svg, `M${f(q.x - 3)} ${f(y + 1.5 + j())} Q${f(q.x + q.w / 2)} ${f(y - 1 + j() * 2)} ${f(q.x + q.w + 4)} ${f(y - 1.5 + j())}`,
            { ink, lift: lift && i === ls.length - 1, speed: 0.9 });
        }
      } else if (kind === 'cross') {
        const p = 3;
        await this.draw(svg, `M${f(r.x + p)} ${f(r.y + p)} Q${f(r.x + r.w / 2 + 2)} ${f(r.y + r.h / 2 - 1)} ${f(r.x + r.w - p + 2)} ${f(r.y + r.h - p + 2)}`, { ink, lift: false, speed: 0.35 });
        await this.draw(svg, `M${f(r.x + r.w - p + 1)} ${f(r.y + p - 1)} Q${f(r.x + r.w / 2 - 1)} ${f(r.y + r.h / 2 + 1)} ${f(r.x + p - 2)} ${f(r.y + r.h - p + 2)}`, { ink, lift, speed: 0.35 });
      } else if (kind === 'underline') {
        const q = rects(target).pop(), y = q.y + q.h - 3;
        await this.draw(svg, `M${f(q.x - 2)} ${f(y)} C${f(q.x + q.w * 0.3)} ${f(y + 3)} ${f(q.x + q.w * 0.7)} ${f(y - 2)} ${f(q.x + q.w + 4)} ${f(y + 1)}`, { ink, lift, speed: 0.8 });
      }
      return svg;
    },
    _marginX() { return parseFloat(getComputedStyle(this.root).getPropertyValue('--nb-margin')) || 52; },

    // ---- marque-page -------------------------------------------------------------
    async flag() {
      const top = 64 + ((this.flags * 34) % Math.max(34, this.H - 130));
      this.flags++;
      const f = h('div', 'nb-flag');
      f.style.top = top + 'px';
      this.content.append(f);
      if (reduced()) { await f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 }).finished; return; }
      // anticipation (recul), glissé, arrivée sur ressort, puis on appuie dessus
      const sp = spring(200, 18), N = 30, kf = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, v = sp.at(u);
        kf.push({ transform: `translateX(${(54 * (1 - v)).toFixed(2)}px) rotate(${(7 * (1 - v)).toFixed(2)}deg)`, opacity: Math.min(1, v * 3), offset: u });
      }
      await f.animate(kf, { duration: Math.max(380, sp.ms * 0.85), easing: 'linear' }).finished;
      await f.animate([{ transform: 'none' }, { transform: 'scale(1.03, 0.9)', offset: 0.4 }, { transform: 'none' }], { duration: 200, easing: 'ease-out' }).finished;
      await wait(120);
    },

    // ---- tour de page ---------------------------------------------------------------
    _flipFrom(N) {
      const H = this.H, seg = H / N;
      const flip = h('div', 'nb-flip');
      flip.inert = true;
      let parent = flip;
      const strips = [], tones = [];
      for (let i = 0; i < N; i++) {
        const st = h('div', 'nb-strip');
        st.style.top = (i ? seg : 0) + 'px';
        st.style.height = seg + 'px';
        if (i === 0) st.style.transformOrigin = `50% ${HOLE_Y}px`;
        const y = i * seg;
        const front = h('div', 'nb-face'), sl = h('div', 'nb-slice'), tf = h('div', 'nb-tone');
        sl.style.top = -y + 'px';
        sl.append(this.paper.cloneNode(true), this.content.cloneNode(true));
        front.append(sl, tf);
        const back = h('div', 'nb-face is-back'), sb = h('div', 'nb-slice'), tb = h('div', 'nb-tone');
        sb.style.top = seg + 1 + y - H + 'px';
        sb.style.transform = 'scaleY(-1)';
        const through = this.content.cloneNode(true);
        through.className = 'nb-content nb-through';
        through.style.transform = 'none';
        sb.append(h('div', 'nb-paper is-back'), through);
        back.append(sb, tb);
        st.append(front, back);
        parent.append(st);
        parent = st;
        strips.push(st);
        tones.push([tf, tb]);
      }
      return { flip, strips, tones };
    },
    async turn(next) {
      const rm = reduced(), N = rm ? 1 : 6;
      const flagged = this.content.querySelector('.nb-flag');
      const { flip, strips, tones } = this._flipFrom(N);
      this.book.insertBefore(flip, this.cover);
      this.setPage(next);
      this.setStack(this.left - 1);
      this.cur = null;
      this._penAt = null;
      if (rm) {
        await flip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished;
      } else {
        const S = 56, dur = 900, ks = strips.map(() => []), kt = tones.map(() => [[], []]), ksh = [];
        for (let f = 0; f <= S; f++) {
          const t = f / S, th = theta(t);
          ks[0].push({ transform: `translateZ(${zOf(th).toFixed(2)}px) rotateX(${th.toFixed(2)}deg)`, offset: t });
          let acc = th;
          for (let i = 0; i < N; i++) {
            if (i) {
              // le bord libre mène : chaque bande est un peu en avance sur la précédente
              const c = curl(t + 0.018 * i) * (i / (N - 1)) * 0.55;
              acc += c;
              ks[i].push({ transform: `rotateX(${c.toFixed(2)}deg)`, offset: t });
            }
            const sn = Math.abs(Math.sin(rad(acc)));
            kt[i][0].push({ opacity: +(0.17 * sn).toFixed(3), offset: t });
            kt[i][1].push({ opacity: +(0.05 + 0.2 * sn).toFixed(3), offset: t });
          }
          const a = clamp(th, 0, 180);
          ksh.push({ opacity: +clamp(Math.sin(rad(a)) * (1.4 - a / 120), 0, 1).toFixed(3), offset: t });
        }
        const opt = { duration: dur, easing: 'linear', fill: 'forwards' };
        const all = strips.map((st, i) => st.animate(ks[i], opt));
        tones.forEach(([a, b], i) => { all.push(a.animate(kt[i][0], opt), b.animate(kt[i][1], opt)); });
        all.push(this.shade.animate(ksh, { ...opt, fill: 'none' }));
        // accent : la feuille retombe derrière, le carnet encaisse à peine
        this.book.animate([{ transform: 'none' }, { transform: 'translateY(1.2px) scale(0.996, 0.993)', offset: 0.35 }, { transform: 'translateY(-0.3px)', offset: 0.7 }, { transform: 'none' }],
          { duration: 300, delay: dur * 0.84, easing: 'ease-out' });
        await Promise.all(all.map((a) => a.finished));
      }
      flip.remove();
      if (flagged) {
        const tab = h('div', 'nb-flag is-behind');
        tab.style.top = flagged.style.top;
        this.behind.append(tab);
        if (!rm) tab.animate([{ transform: 'translateX(-14px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,0,0,1)' });
      }
    },

    // ---- fermeture -------------------------------------------------------------------
    async close({ score } = {}) {
      const rm = reduced();
      this.cover.style.visibility = '';
      this.cover.style.transform = rm ? 'translateZ(1px)' : 'translateZ(-15px) rotateX(360deg)';
      await this._flipCover(false, rm);
      await wait(rm ? 0 : 220);
      const shrink = this.book.animate([{ transform: 'none' }, { transform: 'scale(0.64)' }],
        { duration: rm ? 1 : 680, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards' });
      this.book.style.transformOrigin = '50% 0';
      await shrink.finished;
      if (score != null) {
        const el = this.label.querySelector('.nb-label-score');
        el.textContent = score;
        await this.write(el, { ink: 'red', cps: 10, max: 900 });
        await this.mark(el.querySelector('.nb-w:last-child') || el, 'underline', { ink: 'red' });
      }
    },
  };

  window.Carnet = { mount: (host, o) => new Carnet(host, o), spring, bezier, lin, wait };
})();
