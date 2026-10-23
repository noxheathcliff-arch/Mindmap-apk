/* Pioneer — le classeur d'un cours : feuille blanche, intercalaire à onglet, classeur à anneaux
 *
 * Trois objets dessinés d'après la papeterie réelle (cotes en mm, unité CSS --u = px/mm) :
 *   Binder.sheet({ content, holes, pile })              une feuille A4 blanche perforée
 *   Binder.divider({ index, count, num, kicker, title }) un intercalaire A4 maxi, onglet décalé
 *   Binder.binder({ title, kicker, sub, items, open })   le classeur 3D (dos, plats, anneaux, pile)
 * Autonome comme Carnet (aucune dépendance) ; le style vit dans css/binder.css.
 */
(function () {
  'use strict';

  function el(tag, cls, style, kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (style) for (const k in style) n.style.setProperty(k, style[k]);
    for (const c of [].concat(kids || [])) if (c != null) n.append(c);
    return n;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, kids) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    for (const c of [].concat(kids || [])) if (c) n.append(c);
    return n;
  }
  const mm = (v) => `calc(var(--u) * ${+v.toFixed(3)})`;

  /* Polygone aux coins arrondis (congés quadratiques) — pts : [x, y, r] */
  function rounded(pts) {
    let d = '';
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, y, r] = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
      const ua = norm(A[0] - x, A[1] - y), ub = norm(B[0] - x, B[1] - y);
      const ra = Math.min(r, ua.l / 2), rb = Math.min(r, ub.l / 2);
      const p1 = [x + ua.x * ra, y + ua.y * ra], p2 = [x + ub.x * rb, y + ub.y * rb];
      d += (i ? 'L' : 'M') + f(p1[0]) + ' ' + f(p1[1]) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l, l }; }
  const f = (v) => +v.toFixed(2);

  /* ---- Les définitions SVG partagées (dégradé de la carte, grain, reflet de l'onglet), posées une fois ---- */
  const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .4 0 0 0 0 .33 0 0 0 0 .2 0 0 0 .13 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
  function defs() {
    if (document.getElementById('binder-defs')) return;
    const s = svg('svg', { id: 'binder-defs', width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' }, [
      svg('defs', {}, [
        // carte lustrée : crème, un peu plus claire en haut à gauche (la lumière), plus chaude en bas
        svg('linearGradient', { id: 'inter-card', x1: 0, y1: 0, x2: .35, y2: 1 }, [
          svg('stop', { offset: 0, 'stop-color': 'var(--card)' }),
          svg('stop', { offset: .55, 'stop-color': 'var(--card)' }),
          svg('stop', { offset: 1, 'stop-color': 'var(--card-2)' }),
        ]),
        svg('pattern', { id: 'inter-grain-p', width: 60, height: 60, patternUnits: 'userSpaceOnUse' }, [
          svg('image', { href: GRAIN, width: 60, height: 60 }),
        ]),
        // plastique de l'onglet : reflet horizontal net (une feuille de Mylar plastifiée)
        svg('linearGradient', { id: 'inter-sheen', gradientUnits: 'userSpaceOnUse', x1: W - 4, y1: 0, x2: W + P, y2: 0 }, [
          svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
          svg('stop', { offset: .45, 'stop-color': '#fff', 'stop-opacity': .05 }),
          svg('stop', { offset: .62, 'stop-color': '#fff', 'stop-opacity': .45 }),
          svg('stop', { offset: .74, 'stop-color': '#fff', 'stop-opacity': .08 }),
          svg('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': .06 }),
        ]),
        svg('filter', { id: 'inter-blur', x: '-5%', y: '-5%', width: '110%', height: '110%' }, [
          svg('feGaussianBlur', { stdDeviation: 1.1 }),
        ]),
      ]),
    ]);
    document.body.prepend(s);
  }

  /* ---- Feuille blanche ---- */
  function sheet(o = {}) {
    const n = el('div', 'feuille a4' + (o.holes !== false ? ' trous' : '') + (o.pile ? ' pile' : '') + (o.cls ? ' ' + o.cls : ''));
    if (o.skeleton) n.append(el('div', 'feuille-in sk-page', null, [el('i', 'sk sk-h'), ...[1, 1, 1, .7, 0, 1, 1, .55].map((w) => el('i', 'sk' + (w ? '' : ' sk-gap'), { width: w * 100 + '%' }))]));
    else if (o.content) n.append(el('div', 'feuille-in', null, o.content));
    return n;
  }

  /* ---- Intercalaire ----
     A4 maxi : 225 × 297 mm, onglet en saillie de 12 mm sur le bord droit. L'onglet n°k occupe la k-ième
     case de la hauteur utile (14 → 283 mm), comme un jeu d'intercalaires vendu en série. */
  const TABS = ['#f4c6bf', '#f8d4ad', '#c7e5c2', '#b9e1dc', '#bcdcef', '#c4d4f3', '#d6cdf3', '#efc9e5'];
  const W = 225, P = 12, H = 297;
  let uid = 0;
  function tabSlot(index, count) {
    const top = 14, bottom = 283, h = Math.min(46, (bottom - top) / Math.max(1, count));
    const k = index % Math.max(1, Math.floor((bottom - top) / h));
    return [top + k * h + 1, top + (k + 1) * h - 1];
  }
  function divider(o = {}) {
    defs();
    const index = o.index || 0, count = o.count || 1;
    const [y0, y1] = tabSlot(index, count), s = 2.6;
    const body = rounded([[0, 0, 1.2], [W, 0, 2], [W, y0, 1.6], [W + P, y0 + s, 2.4], [W + P, y1 - s, 2.4], [W, y1, 1.6], [W, H, 2], [0, H, 1.2]]);
    const id = 'inter-c' + (++uid);
    const g = svg('svg', { viewBox: `0 0 ${W + P} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      svg('defs', {}, [svg('clipPath', { id }, [svg('rect', { x: W - 4, y: y0 - 4, width: P + 4, height: y1 - y0 + 8 })])]),
      o.shadow !== false && svg('path', { class: 'i-shadow', d: body, transform: 'translate(.5 1.1)' }),
      svg('path', { class: 'i-body', d: body }),
      svg('path', { class: 'i-grain', d: body }),
      // l'onglet : le Mylar teinté recouvre 4 mm de carte puis dépasse
      svg('g', { 'clip-path': `url(#${id})` }, [
        svg('path', { class: 'i-tab', d: body }),
        svg('path', { class: 'i-tab-sheen', d: body }),
        svg('line', { x1: W - 4, y1: y0 - 2, x2: W - 4, y2: y1 + 2, stroke: 'rgb(0 0 0 / .1)', 'stroke-width': .3 }),
      ]),
      // bande de perforation renforcée (film transparent), trous Ø 6 à 80 mm d'entraxe
      svg('rect', { class: 'i-strip', x: 4, y: 2.5, width: 16, height: H - 5, rx: 1 }),
      ...[108.5, 188.5].flatMap((y) => [
        svg('circle', { class: 'i-hole-rim', cx: 12, cy: y - .35, r: 3.15 }),
        svg('circle', { class: 'i-hole', cx: 12, cy: y + .25, r: 2.9 }),
      ]),
      svg('path', { class: 'i-edge', d: body }),
    ]);
    const n = el('div', 'inter' + (o.cls ? ' ' + o.cls : ''), { '--tab': o.tab || TABS[index % TABS.length] }, g);
    // en chargement : des gabarits à la place du texte (le contenu arrive avec la page du cours)
    if (o.skeleton) { n.append(el('div', 'inter-skel', null, [el('i', 'sk sk-k'), el('i', 'sk sk-t'), el('i', 'sk sk-t2'), ...[1, 1, .64].map((w) => el('i', 'sk', { width: w * 100 + '%' }))])); return n; }
    if (o.num != null) n.append(el('span', 'inter-num', { left: (W / (W + P) * 100) + '%', right: '0', top: (y0 / H * 100) + '%', height: ((y1 - y0) / H * 100) + '%' }, String(o.num)));
    if (o.kicker) n.append(el('p', 'inter-k', null, o.kicker));
    if (o.title) n.append(el('p', 'inter-t', null, o.title));
    return n;
  }

  /* ---- Classeur ----
     Classeur A4 en polypropylène, 260 × 320 mm, dos 34 mm, mécanisme 2 anneaux ronds Ø 25 sur une
     platine rivetée près du dos. La pile (intercalaires, feuilles) est posée à 13 mm du bord du dos,
     perforée à 12 mm de son bord : les anneaux la traversent. items[0] est au-dessus. */
  const CW = 260, CH = 320, SX = 13, SY = 11.5, RINGS = [SY + 108.5, SY + 188.5], RCX = 13, RZ = 3, STEP = .55, BASE = 1.4;
  function binder(o = {}) {
    defs();
    const items = o.items || [];
    const spine = o.spine || 34;
    const stackH = BASE + items.length * STEP + .5;
    const root = el('div', 'classeur' + (o.cls ? ' ' + o.cls : ''), { '--spine': spine, '--stack-h': stackH.toFixed(2), '--open': o.open ?? 0 });
    if (o.unit) root.style.setProperty('--u', o.unit + 'px');

    // la pile : le dernier élément au fond, le premier dessus
    const dividers = items.filter((it) => it.kind === 'inter').length;
    let di = 0;
    const lays = items.map((it, i) => {
      const z = BASE + (items.length - 1 - i) * STEP;
      const obj = it.kind === 'inter'
        ? divider({ index: di++, count: dividers, num: it.num, kicker: it.kicker, title: it.title, tab: it.tab, shadow: false, skeleton: o.skeleton })
        : sheet({ content: it.content, skeleton: o.skeleton });
      obj.style.width = obj.classList.contains('inter') ? mm(W + P) : mm(210);
      obj.style.height = mm(H);
      return el('div', 'cl-lay', { transform: `translate3d(${mm(SX)}, ${mm(SY)}, ${mm(z)})` }, obj);
    });
    const top = BASE + Math.max(0, items.length - 1) * STEP + .12;
    const stack = el('div', 'cl-stack', null, [
      ...lays.reverse(),
      items.length && el('div', 'cl-hump', { left: mm(SX), top: mm(SY), width: mm(28), height: mm(H), transform: `translateZ(${mm(top)})` }),
      ...(items.length ? RINGS.map((y) => el('div', 'cl-rshadow', { left: mm(RCX + 2), top: mm(y - .4), width: mm(26), height: mm(4.5), transform: `translateZ(${mm(top)})` })) : []),
      items.length && el('div', 'cl-edge', { left: mm(SX), top: mm(SY + H - stackH), width: mm(210), height: mm(stackH), 'transform-origin': '50% 100%', transform: 'rotateX(-90deg)' }),
    ]);

    // la platine (acier nickelé) et ses deux rivets, puis les anneaux debout dans le plan (x, z)
    const mech = el('div', 'cl-mech', { left: mm(4), top: mm(RINGS[0] - 22), width: mm(17), height: mm(RINGS[1] - RINGS[0] + 44), transform: `translateZ(${mm(.7)})` }, [
      el('i', 'cl-rivet', { top: mm(6) }), el('i', 'cl-rivet', { bottom: mm(6) }),
    ]);
    const rings = RINGS.map((y) => el('div', 'cl-ring', { left: mm(RCX - 12.5), top: mm(y - 12.5), transform: `translateZ(${mm(RZ)}) rotateX(90deg)` }));

    const back = el('div', 'cl-back', null, [el('div', 'cl-under'), mech, stack, ...rings,
      el('div', 'cl-cast')]);

    // dos et plat avant
    const label = el('div', 'cl-fr-label', null, [
      o.kicker && el('p', 'cl-fr-k', null, o.kicker),
      el('p', 'cl-fr-t', null, o.title || ''),
      o.sub && el('p', 'cl-fr-s', null, o.sub),
    ]);
    const front = el('div', 'cl-front', null, [el('div', 'cl-fr-in'), el('div', 'cl-fr-out', null, label)]);
    const spineEl = el('div', 'cl-spine', null, [
      el('div', 'cl-sp-in'),
      el('div', 'cl-sp-out', null, [el('div', 'cl-sp-label', null, el('span', null, o.title || '')), el('i', 'cl-sp-hole')]),
      front,
    ]);
    root.append(el('div', 'cl-cam', null, [back, spineEl]));

    root.setOpen = (v) => { root.style.setProperty('--open', v); return root; };
    root.setView = (pitch, yaw) => { root.style.setProperty('--pitch', pitch + 'deg'); root.style.setProperty('--yaw', (yaw || 0) + 'deg'); return root; };
    return root;
  }

  /* ---- L'entrée dans un cours : le classeur sort du dossier, s'ouvre, et l'on entre dans l'intercalaire ----
     Principes (The Illusion of Life) : anticipation (le dossier se tasse), arcs (la sortie monte puis
     se pose), overlapping action (la couverture part avant que le classeur soit posé, les onglets
     suivent), slow in / slow out (ressorts), follow-through (la couverture rebondit sur la table).
     Seuls transform, opacity et --open bougent. Interruptible : un geste ou Échap finit tout de suite.
       from    l'élément cliqué (le dossier)      opts.binder : options de Binder.binder (titre, items…)
       opts.tint(el) : colore le classeur          opts.swap() : monte la page du cours, sous la scène
     Renvoie { finish } ; finish() saute à la fin (la page est montée, la scène retirée). */
  function spring(o) {
    let x = o.from, v = o.velocity || 0, last = performance.now(), raf = 0, done = false;
    const step = (now) => {
      const dt = Math.min(.032, (now - last) / 1000);
      last = now;
      for (let i = 0; i < 4; i++) { const h = dt / 4; v += (-o.k * (x - o.to) - o.c * v) * h; x += v * h; }
      if (Math.abs(v) < .004 && Math.abs(x - o.to) < .0005) { x = o.to; done = true; }
      o.on(x, v);
      if (done) { o.end && o.end(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { done = true; cancelAnimationFrame(raf); };
  }
  const reduced = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* La scène commune à l'entrée et à la sortie : le classeur, sa pose et ses états.
     st : a sortie de la poche · b vol vers le centre · open couverture · q redressement de face
          z poussée de caméra dans l'intercalaire · f relais avec la page (la scène se dissout)
     at(rect) : le dossier d'où il sort (ou où il rentre) ; cover() : appelé quand l'intercalaire couvre l'écran */
  function stage(opts) {
    const vw = innerWidth, vh = innerHeight;
    // l'unité : le classeur ouvert (554 mm de large) tient dans l'écran, fermé il occupe 60 % de la hauteur
    const OW = 34 + 260 + 260;
    const u = Math.min(vw * .9 / OW, vh * .6 / CH, 1.5);
    const b = binder(Object.assign({}, opts.binder, { unit: u, open: 0 }));
    if (opts.tint) opts.tint(b);
    b.setView(0, 0);
    const pose = el('div', 'cl-pose', { width: CW * u + 'px', height: CH * u + 'px' }, b);
    const scene = el('div', 'cl-scene', null, pose);
    document.body.append(scene);

    // poses : centre à l'écran (X, Y) et échelle s du point (cx, cy) du classeur (mm)
    const put = (X, Y, s, open) => {
      const cx = 130 - 147 * open, cy = 160;
      pose.style.transform = `translate3d(${X - cx * u * s}px, ${Y - cy * u * s}px, 0) scale(${s})`;
      return Y - cy * u * s;
    };
    let s0 = 1, X0 = vw / 2, lip = Infinity, Y0 = vh * 1.5, Y1 = vh;
    const at = (r) => {
      s0 = Math.min(r.width * .62 / (CW * u), r.height * .8 / (CH * u));
      X0 = r.left + r.width / 2; lip = r.top + r.height * .12;   // le bord de la poche du dossier
      Y0 = lip + CH * u * s0 * .5 + 2;                            // rangé : le haut affleure la poche
      Y1 = lip - CH * u * s0 * .1;                                // à moitié sorti
    };
    const Xc = vw / 2, Yc = vh * .52;
    // le zoom : une poussée de caméra sur l'intercalaire. Le point visé (son titre) reste presque
    // fixe à l'écran pendant que tout grandit autour de lui ; l'intercalaire finit par couvrir l'écran.
    const FA = .2;                                                       // le titre : à 20 % de la hauteur
    const top0 = (opts.binder && opts.binder.items || [])[0], TW = top0 && top0.kind !== 'inter' ? 210 : W + P;   // feuille ou intercalaire
    const DX = SX + TW / 2 - (130 - 147), DY = SY + H * FA - 160;   // le point visé, relatif au centre ouvert (mm)
    const FXs = vw / 2, FYs = vh * .36;                                  // où il se pose à l'écran
    const S = 1.2 * Math.max(FYs / (H * FA * u), (vh - FYs) / (H * (1 - FA) * u), vw / 2 / (TW / 2 * u));

    const k = { b, scene, u, at, cover: null, st: { a: 0, b: 0, open: 0, q: 0, z: 0, f: 0 } };
    const st = k.st;
    let clipped = null;
    const frame = k.frame = () => {
      const { a, b: t, q, z } = st;
      const open = st.open > 1 ? 2 - st.open : st.open;    // la couverture rebondit sur la table
      // sortie (a) puis vol vers le centre (t), en arc : x en retard sur y
      const ya = Y0 + (Y1 - Y0) * a, sa = s0 * (1 + .04 * a);
      const tx = Math.min(1, Math.max(0, t)), ease = 1 - Math.pow(1 - tx, 1.6);
      let X = X0 + (Xc - X0) * ease, Y = ya + (Yc - ya) * t, s = sa + (1 - sa) * t;
      // q : une fois ouvert, la caméra se redresse et vient de face (on vise l'intercalaire avant d'y entrer)
      const lean = 1 - q;
      let pitch = (4 + 22 * t - 4 * a * (1 - t)) * lean, yaw = -7 * t * lean * (1 - z);
      const o = Math.min(1, Math.max(0, open));
      if (z > 0) {
        // caméra : échelle exponentielle d'un smootherstep : la caméra démarre, file, puis se pose
        // (vitesse perçue en ln(s) en cloche) ; après l'échange elle continue un peu (pas d'arrêt net)
        const e = z * z * z * (z * (z * 6 - 15) + 10);
        s = Math.pow(S, e) * (1 + .05 * st.f);
        const g = 1 - Math.pow(1 - z, 3);                   // le cadrage se fait avant la plongée
        const px = X + DX * u, py = Y + DY * u;            // le titre de l'intercalaire à s = 1
        const cx = px + (FXs - px) * g, cy = py + (FYs - py) * g;
        X = cx - DX * u * s; Y = cy - DY * u * s;
        pitch = 26 * lean * (1 - g);
        // dès que l'intercalaire couvre l'écran, la page de destination peut se monter dessous
        const l = cx - TW / 2 * u * s, r = cx + TW / 2 * u * s, tp = cy - H * FA * u * s, bt = cy + H * (1 - FA) * u * s;
        if (k.cover && l <= 0 && r >= vw && tp <= 0 && bt >= vh) { const c = k.cover; k.cover = null; c(); }
      }
      scene.style.setProperty('--zf', String(Math.min(1, z * 1.5)));
      b.setView(pitch, yaw);
      b.setOpen(Math.max(0, open));
      const top = put(X, Y, s, o);
      // le dossier cache ce qui est dans la poche ; la ligne de coupe descend quand le classeur
      // s'avance vers nous (et remonte quand il y retourne)
      const line = (lip + t * 1.4 * vh - top) / s, cut = z > 0 || line >= CH * u ? '' : `inset(-100vh -100vw ${Math.max(0, CH * u - line).toFixed(1)}px -100vw)`;
      if (cut !== clipped) { clipped = cut; pose.style.clipPath = cut; }
      // le relais : la scène se dissout pendant que la page monte dessous
      const f = st.f;
      scene.style.setProperty('--dim', String(Math.min(1, Math.max(0, t) * 1.4)));
      scene.style.opacity = String(1 - f * f * (3 - 2 * f));
    };

    const stops = [], timers = [];
    k.later = (ms, fn) => timers.push(setTimeout(fn, ms));
    k.tween = (key, ms, end, to = 1) => {      // linéaire vers to : la courbe de la caméra est dans frame()
      const t0 = performance.now(), v0 = st[key]; let raf = 0, done = false;
      const step = (now) => { if (done) return; const p = Math.min(1, (now - t0) / ms); st[key] = v0 + (to - v0) * p; frame(); if (p >= 1) { done = true; end && end(); } else raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      stops.push(() => { done = true; cancelAnimationFrame(raf); });
    };
    k.run = (key, to, kk, c, end) => stops.push(spring({ from: st[key], to, k: kk, c, on: (x) => { st[key] = x; frame(); }, end }));
    k.tabs = () => [...b.querySelectorAll('.cl-lay > .inter')].reverse();
    k.stop = () => { stops.forEach((f) => f()); timers.forEach(clearTimeout); };
    return k;
  }

  /* Interruptible : un geste ou Échap finit tout de suite. Renvoie { finish }. */
  function interruptible(finish) {
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', finish, true);
    return () => { removeEventListener('keydown', onKey, true); removeEventListener('pointerdown', finish, true); };
  }

  function enter(from, opts = {}) {
    let swapped = false, ended = false;
    const swap = () => { if (!swapped) { swapped = true; opts.swap && opts.swap(); } };
    if (reduced() || !from || !from.getBoundingClientRect) { swap(); return { finish() {} }; }

    const k = stage(opts), { u } = k;
    k.at(from.getBoundingClientRect());
    // entré : dès que l'intercalaire couvre l'écran, la page du cours se monte dessous
    k.cover = () => { swap(); k.tween('f', 420, finish); };

    // anticipation : le dossier se tasse, puis rebondit quand le classeur en sort
    if (from.animate) from.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: .4 }, { transform: 'scale(1.01)', offset: .75 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,0,.2,1)' });
    k.frame();
    let zooming = false;
    k.later(70, () => k.run('a', 1, 520, 44, null));
    k.later(190, () => k.run('b', 1, 240, 29, null));
    k.later(330, () => k.run('open', 1, 150, 15.5, null));
    // les onglets se déploient l'un après l'autre (40 ms), quand la couverture dégage la pile
    k.later(470, () => k.tabs().forEach((n, i) => n.animate && n.animate(
      [{ transform: `translateX(${-7 * u}px)` }, { transform: 'none' }],
      { duration: 380, delay: i * 40, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' })));
    // redressement de face quand la couverture s'est posée, le zoom part juste avant la fin (chevauchement)
    k.later(800, () => k.run('q', 1, 190, 26, null));
    k.later(1060, () => {
      if (zooming || ended) return;
      zooming = true;
      k.tween('z', 1000, () => { if (!swapped) { k.cover = null; swap(); k.tween('f', 420, finish); } });
    });
    function finish() {
      if (ended) return;
      ended = true;
      k.stop(); release();
      swap();
      k.scene.remove();
    }
    const release = interruptible(finish);
    return { finish };
  }

  /* ---- La sortie d'un cours : l'entrée jouée à l'envers ----
     L'intercalaire revient couvrir l'écran par-dessus la page du cours, la page d'arrivée se monte
     dessous, puis la caméra recule, se penche, la couverture se referme (les onglets rentrent avant),
     le classeur repart en arc vers son dossier et redescend dans la poche ; le dossier le reçoit.
       opts.swap()   monte la page d'arrivée, sous la scène
       opts.target() après swap : le dossier où ranger le classeur (null : la scène se dissout au centre)
     Renvoie { finish }, ou null si le mouvement est réduit (l'appelant navigue normalement). */
  function leave(opts = {}) {
    if (reduced()) return null;
    let swapped = false, ended = false, to = null;
    const swap = () => { if (!swapped) { swapped = true; opts.swap && opts.swap(); } };
    const k = stage(opts), { u, st } = k;
    Object.assign(st, { a: 1, b: 1, open: 1, q: 1, z: 1, f: 1 });
    k.frame();
    // le relais à l'envers : l'intercalaire se recompose par-dessus la page du cours
    k.tween('f', 300, () => {
      if (ended) return;
      swap();
      to = opts.target && opts.target();
      const r = to && to.getBoundingClientRect();
      if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) {
        // pas de dossier visible : la caméra recule puis la scène se dissout
        k.tween('z', 700, () => k.tween('f', 320, finish), 0);
        return;
      }
      k.at(r);
      k.frame();
      k.tween('z', 760, null, 0);
      k.later(320, () => k.run('q', 0, 220, 28, null));
      // les onglets rentrent dans la pile juste avant que la couverture ne se rabatte
      k.later(420, () => k.tabs().reverse().forEach((n, i) => n.animate && n.animate(
        [{ transform: 'none' }, { transform: `translateX(${-7 * u}px)` }],
        { duration: 240, delay: i * 25, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' })));
      k.later(500, () => k.run('open', 0, 190, 24, null));
      k.later(720, () => k.run('b', 0, 300, 30, null));
      // le dossier reçoit le classeur : il se tasse sous le poids puis reprend sa forme
      k.later(1000, () => to.animate && to.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: .45 }, { transform: 'scale(1.01)', offset: .8 }, { transform: 'scale(1)' }], { duration: 440, easing: 'cubic-bezier(.3,0,.2,1)' }));
      k.later(900, () => k.run('a', 0, 600, 46, null));
      // rangé : le classeur est sous la ligne de la poche, la scène peut partir sans attendre la fin du ressort
      k.later(1400, finish);
    }, 0);
    function finish() {
      if (ended) return;
      ended = true;
      k.stop(); release();
      swap();
      k.scene.remove();
    }
    const release = interruptible(finish);
    return { finish };
  }

  window.Binder = { sheet, divider, binder, enter, leave, TABS };
})();
