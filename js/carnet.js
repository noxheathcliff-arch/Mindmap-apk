/* Carnet — carnet d'exercices à spirale (reliure en haut, papier Seyès).
   const nb = Carnet.mount(host, { kicker, title, subtitle, count })
   nb.setPage(node) · nb.open() · nb.prep(el) · nb.write(el, { ink, cps, lift }) · nb.skip()
   nb.mark(target, kind, { ink, lift }) · nb.flag() · nb.turn(next) · nb.close({ score }) · nb.setDark(bool)
   nb.clip(el, { tail, all }) → string[] : tronque `el` à la dernière phrase qui tient, rend le reste (la feuille ne s'allonge JAMAIS pour la correction rouge)
   nb.postit(text | string[], { ink }) : le reste s'écrit sur un post-it, puis se colle dans la zone libre (3 max, empilés)
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
    // la page doit tout contenir, même ce qui n'est pas encore écrit :
    // on réduit d'abord l'écriture, puis on allonge la feuille si besoin
    fit() {
      const c = this.content, pg = c.firstElementChild;
      let H = this.baseH;
      c.classList.remove('nb-fit-1', 'nb-fit-2');
      if (pg) {
        c.classList.add('nb-measure');
        const need = () => Math.ceil(pg.offsetTop + pg.offsetHeight + 30);
        for (const k of ['nb-fit-1', 'nb-fit-2']) {
          if (need() <= H) break;
          c.classList.remove('nb-fit-1');
          c.classList.add(k);
        }
        // la feuille ne s'allonge que pour le contenu non rouge : la correction déborde sur un post-it
        c.classList.add('nb-measure-base');
        const n = need();
        if (n > H) H = Math.ceil(n / 7) * 7;
        c.classList.remove('nb-measure', 'nb-measure-base');
      }
      this.H = H;
      this.root.style.setProperty('--nb-h', H + 'px');
    },
    setDark(on) { this.root.classList.toggle('is-dark', !!on); },
    setStack(n) { this.left = n; this.root.style.setProperty('--nb-stack', clamp(n, 1, 14)); },

    setPage(node) {
      this.content.replaceChildren(node);
      this._notes = [];
      this.fast = false;
      this.fit();
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
      (this._pa || []).slice().forEach((a) => a.finish());
      const c = this.cur;
      if (!c) return;
      c.anims.forEach((a) => a.finish());
      if (c.pen) c.pen.finish();
    },
    // ---- débordement de la correction : post-it -------------------------------------
    postitRoom: 140,                                   // place réservée en bas de feuille quand ça déborde
    /* Tronque `el` (texte rouge) pour qu'il tienne sans allonger la feuille : coupe à la dernière
       phrase qui tient (sinon au mot, avec « … »). `tail` : éléments qui suivent (restent sur la page).
       Rend le reste, un paragraphe par entrée ([] si tout tient). Mesure via .nb-measure. */
    clip(el, { tail = [], all = false } = {}) {
      const c = this.content, nodes = [];
      const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (wk.nextNode()) if (wk.currentNode.nodeValue.trim()) nodes.push(wk.currentNode);
      if (!nodes.length) return [];
      c.classList.add('nb-measure');
      const bottom = (e) => { const r = this._local(e.getBoundingClientRect()); return r.y + r.h; };
      const tailH = tail.reduce((a, e) => a + this._local(e.getBoundingClientRect()).h + 8, 0);
      const orig = nodes.map((n) => n.nodeValue);
      const toks = orig.map((v) => v.split(/(\s+)/));
      const isW = (t) => t && !/^\s+$/.test(t);
      const words = toks.map((t) => t.filter(isW));
      const total = words.reduce((a, w) => a + w.length, 0);
      const apply = (k) => {
        let left = k;
        nodes.forEach((n, i) => {
          const take = clamp(left, 0, words[i].length); left -= take;
          if (take >= words[i].length) { n.nodeValue = orig[i]; return; }
          let seen = 0, out = '';
          for (const t of toks[i]) { if (!isW(t)) { out += t; continue; } if (seen >= take) break; out += t; seen++; }
          n.nodeValue = take ? out.trimEnd() : '';
        });
      };
      let k = 0;
      if (!all && bottom(el) + tailH <= this.H - 30) { c.classList.remove('nb-measure'); return []; }
      if (!all) {
        const limit = this.H - 30 - this.postitRoom - tailH;
        let lo = 0, hi = total;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; apply(m); if (bottom(el) <= limit) lo = m; else hi = m - 1; }
        k = lo;
        const flat = words.flat();
        let j = -1;
        for (let i = k - 1; i >= 0; i--) if (/[.!?…]$/.test(flat[i])) { j = i; break; }
        if (j >= 0 && j + 1 >= k * 0.5) k = j + 1;
      }
      apply(k);
      if (k > 0 && k < total && !/[.!?…]$/.test(words.flat()[k - 1])) {
        const last = nodes.filter((n) => n.nodeValue.trim()).pop(); if (last) last.nodeValue += '…';
      }
      c.classList.remove('nb-measure');
      const rest = []; let g = 0;
      words.forEach((w) => { const part = w.slice(Math.max(0, k - g)); g += w.length; if (part.length) rest.push(part.join(' ')); });
      nodes.forEach((n) => { if (!n.nodeValue.trim()) { const b = n.parentElement && n.parentElement.closest('li, p'); if (b && el.contains(b)) b.remove(); } });
      if (!k) el.style.display = 'none';
      return rest;
    },
    /* Le reste de la correction s'écrit sur un post-it (détaché, au-dessus de la page), puis se colle. */
    async postit(text, { ink = 'red' } = {}) {
      const paras = (Array.isArray(text) ? text : String(text && text.textContent != null ? text.textContent : text).split(/\n+/)).filter(Boolean);
      if (!paras.length) return null;
      const list = this._notes || (this._notes = []);
      const fill = (box) => paras.forEach((t) => box.append(h('p', '', '').appendChild(document.createTextNode(t)).parentNode));
      if (list.length >= 3) { fill(list[2].querySelector('.nb-postit-text')); return list[2]; }   // au-delà : on complète le dernier, rien ne se perd
      const i = list.length, r = [-2.6, 2.2, -0.8][i];
      const el = h('div', 'nb-postit');
      el.setAttribute('role', 'note');
      el.setAttribute('aria-label', 'Suite de la correction' + (i ? ' (' + (i + 1) + ')' : ''));
      el.style.setProperty('--r', r + 'deg');
      el.style.setProperty('--i', i);
      const tx = h('div', 'nb-postit-text nb-md');
      tx.tabIndex = 0;
      fill(tx);
      const curl = h('span', 'nb-postit-curl');
      curl.setAttribute('aria-hidden', 'true');
      el.append(curl, tx);
      list.push(el);
      this.content.append(el);
      if (this.fast) { await this.write(tx, { ink }); return el; }
      if (reduced()) { await el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }).finished; await this.write(tx, { ink }); return el; }
      const T = (x, y, a, sc = '1') => `translate(${x}px, ${y}px) rotate(${a}deg) scale(${sc})`;
      const UP = '0 16px 22px -6px rgba(0,0,0,.34), 0 4px 7px rgba(0,0,0,.14)', DOWN = '0 1px 1.5px rgba(0,0,0,.28), 0 3px 5px -1px rgba(0,0,0,.18)';
      const lifted = T(-6, -34, r - 5, 0.92);
      const keep = (a) => { (this._pa || (this._pa = [])).push(a); a.finished.catch(() => {}).then(() => { this._pa = (this._pa || []).filter((x) => x !== a); }); return a; };
      // 1. il apparaît, petit, au-dessus de la page, détaché
      await keep(el.animate([{ opacity: 0, transform: T(-10, -62, r - 11, 0.7), boxShadow: UP }, { opacity: 1, transform: lifted, boxShadow: UP }],
        { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' })).finished.catch(() => {});
      el.style.opacity = '1'; el.style.transform = lifted; el.style.boxShadow = UP;
      // 2. le stylo y écrit le reste
      await this.write(tx, { ink });
      // 3. il se pose : anticipation (se soulève), arc, impact (squash, bord haut collé), coin qui se décolle
      if (!this.fast) {
        const a = keep(el.animate([
          { transform: lifted, boxShadow: UP },
          { transform: T(-6, -46, r - 7, 0.94), boxShadow: UP, offset: 0.2, easing: 'cubic-bezier(.55,.05,.67,.19)' },
          { transform: T(-1, -8, r - 1, 1), boxShadow: '0 8px 12px -4px rgba(0,0,0,.28), 0 2px 4px rgba(0,0,0,.14)', offset: 0.56, easing: 'cubic-bezier(.23,1,.32,1)' },
          { transform: T(0, 2, r, '1.03,0.95'), boxShadow: DOWN, offset: 0.68, easing: 'cubic-bezier(.23,1,.32,1)' },
          { transform: T(0, -0.5, r, '0.995,1.012'), offset: 0.84 },
          { transform: T(0, 0, r), boxShadow: DOWN },
        ], { duration: 560, easing: 'linear', fill: 'forwards' }));
        keep(curl.animate([{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(0deg) scale(1)', offset: 0.66 }, { transform: 'rotate(-16deg) scale(1.2)', offset: 0.82 }, { transform: 'rotate(-6deg) scale(1.06)' }],
          { duration: 560, easing: 'ease-out', fill: 'forwards' }));
        await a.finished.catch(() => {});
      }
      el.style.transform = el.style.boxShadow = el.style.opacity = '';
      el.getAnimations().forEach((x) => x.cancel());
      curl.style.transform = 'rotate(-6deg) scale(1.06)';
      return el;
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
