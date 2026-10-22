/* Ratio — la boîte de Leitner de l'accueil (DESIGN.md §4.7)
   Une boîte à fiches en 2,5D (CSS 3D) : six compartiments, un par boîte de Leitner (0 → 5,
   aujourd'hui → 30 jours), séparés par des intercalaires à onglet ; les fiches sont les vraies
   fiches de l'utilisateur. On regarde la boîte de trois quarts, à hauteur des yeux ou d'en haut
   (la caméra bascule par ressort). Le doigt (ou la souris) qui passe sur les fiches les écarte
   comme dans un vrai fichier : celles d'un côté penchent à gauche, les autres à droite, et
   chacune frémit au passage. Toucher une fiche la sort de la boîte : elle monte, vient vers soi
   et se tourne face à l'écran ; la toucher encore lance la révision sur elle.
   Tout est piloté par des ressorts physiques (Euler semi-implicite) image par image ; la boucle
   s'arrête quand tout est au repos. Principes (Illusion of Life, Animator's Survival Kit) :
   anticipation (la fiche s'enfonce avant de sortir), arcs (deux ressorts décalés : monter puis
   venir), chevauchement (les voisines suivent en retard), action secondaire (les voisines
   s'écartent, la boîte se tasse en tombant), ralentis (ressorts), exagération (dépassement),
   mise en scène (la boîte s'assombrit derrière la fiche sortie), solidité (vraie 3D). */
(function (R) {
  'use strict';
  const { U, store: S } = R;
  const { h } = U;
  const rad = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* géométrie de la boîte, en px « monde » (l'ensemble est ensuite mis à l'échelle) */
  const L = 460, D = 150;          // longueur (x) et profondeur (z) intérieures
  const CW = 136, CH = 100;        // une fiche : largeur (le long de z), hauteur
  const Q = 2;                     // les fiches sont dessinées en 2× puis réduites : texte net une fois sortie
  const HF = 46, HB = 80;          // hauteur de la façade (avant) et du dos
  const DH = 112, TAB = 20;        // intercalaire : hauteur, onglet
  const CL = L / 6;                // un compartiment
  const GAP = 8.5, CAP = 7;        // pas entre fiches, fiches dessinées au plus par compartiment
  /* caméra : 0 = à hauteur des yeux, 1 = vue de dessus */
  const VIEW = { tx: [-8, -58], ty: [42, 16], dy: [0, 0] };
  const BOX_LABEL = ['Aujourd’hui', 'Chaque jour', 'Tous les 3 j', 'Chaque semaine', 'Tous les 15 j', 'Chaque mois'];
  const SHORT = ['0', '1 j', '3 j', '7 j', '15 j', '30 j'];

  /** Un ressort : x vers target ; k raideur, c amortissement. Renvoie vrai s'il bouge encore */
  function spring(o, k, c, dt) {
    const a = k * (o.t - o.x) - c * o.v;
    o.v += a * dt; o.x += o.v * dt;
    o.a = a;
    if (Math.abs(o.v) < 1e-3 && Math.abs(o.t - o.x) < 1e-3) { o.x = o.t; o.v = 0; return false; }
    return true;
  }
  const sp = (x) => ({ x, v: 0, t: x, a: 0 });

  /* Rotation caméra (convention CSS) : M = rotateX(tx) · rotateY(ty) */
  function rot([x, y, z], tx, ty) {
    const cy = Math.cos(ty), sy = Math.sin(ty), cx = Math.cos(tx), sx = Math.sin(tx);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  }
  function unrot([x, y, z], tx, ty) {
    const cy = Math.cos(ty), sy = Math.sin(ty), cx = Math.cos(tx), sx = Math.sin(tx);
    const y1 = y * cx + z * sx, z1 = -y * sx + z * cx;
    return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
  }

  /** Le texte d'une fiche (comme la feuille d'un dossier de cours) */
  function faceOf(it) {
    const course = S.course(it.map.courseId);
    if (it.ex) return { k: S.EXERCISE_KINDS[it.ex.kind].label, q: it.ex.q, course };
    const T = S.TYPES[it.node.type] || {};
    return { k: S.kickerOf(it.map, it.node) || T.label || 'Fiche', q: it.node.title, course };
  }

  /** Le héros de l'accueil : titre, boîte, série et « Réviser » */
  R.leitnerHero = function ({ title, sub, streakEl, cta, intro }) {
    const boxes = S.leitnerBoxes();
    const total = boxes.reduce((n, b) => n + b.n, 0);
    const due = boxes.reduce((n, b) => n + b.due, 0);

    const read = h('p.lbx-read', { 'aria-live': 'polite' });
    const world = h('div.lbx-world');
    const stage = h('div.lbx-stage', {
      tabindex: '0', role: 'group', 'aria-roledescription': 'boîte de Leitner',
      'aria-label': `Boîte de Leitner : ${U.plural(total, 'fiche')}, ${due} à réviser. Flèches pour parcourir, Entrée pour sortir une fiche.`,
    }, world, read);
    const viewBtn = h('button.lbx-view.icon-btn', { type: 'button', title: 'Vue de dessus', 'aria-pressed': 'false' }, R.icon('view3d', 22));
    const sec = h('section.today.lbx', { 'aria-label': 'Aujourd’hui', dataset: { hero: 'session:all:card' } },
      h('div.lbx-head', h('div.lbx-titles', h('h2.today-title', title), h('p.today-sub', sub)), viewBtn),
      stage,
      h('div.lbx-foot', streakEl, cta));

    /* ---- la boîte ---- */
    const face = (cls, w, hh, tf, extra) => {
      const el = h('div.lbx-face.' + cls, extra || null);
      el.style.cssText = `width:${w}px;height:${hh}px;left:${-w / 2}px;top:${-hh}px;transform:${tf}`;
      return el;
    };
    world.append(
      h('div.lbx-floor'),
      face('lbx-bottom', L + 8, D + 8, `rotateX(90deg) translateY(${(D + 8) / 2}px)`),
      face('lbx-back', L + 8, HB, `translateZ(${-D / 2 - 4}px)`),
      face('lbx-right', D + 8, HB, `translateX(${L / 2 + 4}px) rotateY(-90deg)`),
    );
    const parts = [];   // intercalaires et fiches, de gauche à droite
    const cards = [];
    let seq = 0;
    boxes.forEach((b, k) => {
      const x0 = -L / 2 + k * CL;
      const div = h('div.lbx-div', { dataset: { box: k } },
        h('span.lbx-tab', { style: `left:${10 + (k % 3) * 38}px` }, h('b', SHORT[k]), b.due ? h('i', String(b.due)) : null));
      div.style.cssText = `width:${CW + 6}px;height:${DH}px;left:${-(CW + 6) / 2}px;top:${-DH}px`;
      const dv = { el: div, kind: 'div', box: k, x: x0 + 5, rest: 0, lean: sp(0), up: sp(0), out: sp(0), b };
      parts.push(dv); world.append(div);
      const shown = b.items.slice(0, CAP);
      shown.forEach(({ it, due: isDue }, j) => {
        const f = faceOf(it);
        const el = h('div.lbx-card', { class: isDue ? 'due' : '' },
          h('span.lbx-k', f.course ? f.course.title : ''),
          h('span.lbx-q', f.q || ''),
          h('span.lbx-meta', f.k));
        if (f.course) R.courseArt.tint(el, f.course);
        el.style.cssText += `;width:${CW * Q}px;height:${CH * Q}px;left:${-CW * Q / 2}px;top:${-CH * Q}px`;
        const r = Math.sin(++seq * 12.9898) * 43758.5453; const rnd = r - Math.floor(r);
        const c = { el, kind: 'card', box: k, x: x0 + 14 + j * GAP, rest: 2.5 + (rnd - .5) * 3, raise: isDue ? 9 : 0,
          lean: sp(0), up: sp(0), out: sp(0), it, due: isDue, idx: j, of: b.n };
        parts.push(c); cards.push(c); world.append(el);
      });
    });
    world.append(
      face('lbx-left', D + 8, HB, `translateX(${-L / 2 - 4}px) rotateY(-90deg)`),
      face('lbx-front', L + 8, HF, `translateZ(${D / 2 + 4}px)`,
        h('span.lbx-plate', h('b', String(due)), h('span', due > 1 ? 'à réviser' : 'à réviser'))),
      face('lbx-rim', L + 8, 6, `translateY(${-HF}px) translateZ(${D / 2 + 4}px) rotateX(90deg)`),
    );

    /* ---- état animé ---- */
    const cam = sp(intro ? .55 : 0);        // vue : 0 yeux → 1 dessus
    const drop = sp(intro ? -70 : 0);       // chute d'entrée (px monde)
    const dim = sp(0);                      // la boîte s'assombrit derrière une fiche sortie
    let view = 0;                           // vue choisie
    let finger = null;                      // x monde du doigt, ou null
    let fingerV = 0, lastFX = null, lastFT = 0;
    let sel = null;                         // fiche ou intercalaire désigné par le doigt
    let pulled = null;                      // fiche sortie
    let lifted = null;                      // intercalaire soulevé
    let squash = 0;
    let W = 0, H = 0, sc = .6, ox = 0, oy = 0;
    const reduced = () => R.motion.reduced();
    for (const p of parts) { p.lean.x = p.lean.t = p.rest; }
    if (intro && !reduced()) {
      // entrée : la boîte tombe, les fiches arrivent affaissées et se redressent en cascade
      parts.forEach((p, i) => { p.lean.x = p.rest - 22 - (i % 3) * 3; p.wait = 160 + p.box * 55 + (p.idx || 0) * 14; });
    } else { cam.x = cam.t = 0; drop.x = drop.t = 0; }

    /* cadrage : la boîte (intercalaires compris) tient dans la scène, aux deux vues ;
       l'échelle est la plus petite des deux (pas de zoom en basculant), le centre suit la caméra */
    const CORNERS = [];
    for (const x of [-L / 2 - 4, L / 2 + 4]) for (const y of [0, -DH - 4]) for (const z of [-D / 2 - 4, D / 2 + 4]) CORNERS.push([x, y, z]);
    function bounds(t) {
      const tx = lerp(VIEW.tx[0], VIEW.tx[1], t) * rad, ty = lerp(VIEW.ty[0], VIEW.ty[1], t) * rad;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of CORNERS) { const [x, y] = rot(c, tx, ty); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x0, x1, y0, y1 };
    }
    let B0, B1, room = 0;
    function measure() {
      W = stage.clientWidth; H = stage.clientHeight;
      room = H - 26;                                   // la ligne de lecture en bas
      B0 = bounds(0); B1 = bounds(1);
      sc = Math.min(...[B0, B1].map((b) => Math.min((W * .94) / (b.x1 - b.x0), (room * .9) / (b.y1 - b.y0))));
      center();
    }
    function center() {
      const t = clamp(cam.x, 0, 1);
      const b = { x0: lerp(B0.x0, B1.x0, t), x1: lerp(B0.x1, B1.x1, t), y0: lerp(B0.y0, B1.y0, t), y1: lerp(B0.y1, B1.y1, t) };
      ox = W / 2 - ((b.x0 + b.x1) / 2) * sc;
      oy = room / 2 + 4 - ((b.y0 + b.y1) / 2) * sc;
      // on regarde depuis le centre de la boîte : la perspective n'ajoute pas de plongée parasite
      stage.style.perspectiveOrigin = `${ox.toFixed(1)}px ${(oy - DH * .45 * sc).toFixed(1)}px`;
    }
    const camAngles = () => {
      const t = cam.x;
      return { tx: lerp(VIEW.tx[0], VIEW.tx[1], t) * rad, ty: lerp(VIEW.ty[0], VIEW.ty[1], t) * rad, dy: lerp(VIEW.dy[0], VIEW.dy[1], t) };
    };
    /** Point monde → écran (px dans la scène), perspective comprise */
    const PERSP = 1500;
    function project(p) {
      const { tx, ty, dy } = camAngles();
      const [x, y, z] = rot([p[0], p[1] + dy + drop.x, p[2]], tx, ty);
      const k = PERSP / (PERSP - z * sc), py = oy - DH * .45 * sc;
      return [ox + x * sc * k, py + (oy + y * sc - py) * k];
    }
    /** Abscisse écran → abscisse monde le long du haut des fiches (table échantillonnée) */
    function worldX(px) {
      let a = project([-L / 2, -CH * .7, 0])[0], b = project([L / 2, -CH * .7, 0])[0];
      if (px <= a) return -L / 2 - (a - px) / sc;
      if (px >= b) return L / 2 + (px - b) / sc;
      let lo = -L / 2, hi = L / 2;
      for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (project([m, -CH * .7, 0])[0] < px) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }

    /* ---- pose d'une pièce (fiche ou intercalaire) ---- */
    function pose(p) {
      const { tx, ty } = camAngles();
      const up = p.up.x, out = p.out.x;
      // sortie : d'abord vers le haut (up), puis vers soi et face à l'écran (out)
      const baseY = -(p.raise || 0);
      const upY = -(CH + 34) * up;
      let X = p.x, Y = baseY + upY, Z = 0;
      let yaw = -90, pitch = 0, s = 1;
      if (out > 0.0005) {
        // cible : au milieu de la scène, face caméra, devant toute la boîte (sinon les
        // intercalaires la traversent), à une taille lisible une fois la perspective comptée
        const ZC = L / 2 + D, k = PERSP / (PERSP - ZC * sc), py = oy - DH * .45 * sc;
        const want = Math.min(W * .62, room * 1.15, 300) / (CW * sc * k);
        const cy = ((room * .5 - py) / k + py - oy) / sc;
        const tgt = unrot([0, cy, ZC], tx, ty);
        const { dy } = camAngles();
        tgt[1] -= dy + drop.x;
        X = lerp(X, tgt[0], out);
        Y = lerp(Y, tgt[1] + (CH * want) / 2, out);
        Z = lerp(Z, tgt[2], out);
        yaw = lerp(-90, -ty / rad, out); pitch = lerp(0, -tx / rad, out); s = lerp(1, want, out);
      }
      const lean = p.lean.x * (1 - clamp(up, 0, 1));
      p.el.style.transform = `translate3d(${X.toFixed(2)}px,${Y.toFixed(2)}px,${Z.toFixed(2)}px) rotateZ(${lean.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) rotateX(${pitch.toFixed(2)}deg) scale(${(p.kind === 'div' ? s : s / Q).toFixed(3)})`;
      // lumière venue d'en haut à gauche : la fiche qui penche vers elle s'éclaire
      p.el.style.setProperty('--shade', clamp(.1 + lean * .009 - out * .1, 0, .32).toFixed(3));
      p.el.style.zIndex = p === pulled ? 3 : '';
      // la fiche sortie reste en pleine lumière quand le reste s'assombrit
      if (out > 0.0005) p.el.style.setProperty('--dim', (dim.x * (1 - out)).toFixed(3)); else p.el.style.removeProperty('--dim');
    }
    function poseWorld() {
      center();
      const { tx, ty, dy } = camAngles();
      // tassement : la boîte s'écrase à l'atterrissage (accélération), s'étire en tombant
      const sq = clamp(squash, -.08, .08);
      world.style.transform = `translate(${ox}px,${oy}px) scale(${sc}) rotateX(${(tx / rad).toFixed(2)}deg) rotateY(${(ty / rad).toFixed(2)}deg) translateY(${(dy + drop.x).toFixed(2)}px) scale3d(${(1 + sq * .5).toFixed(3)},${(1 - sq).toFixed(3)},${(1 + sq * .5).toFixed(3)})`;
      world.style.setProperty('--dim', dim.x.toFixed(3));
    }

    /* ---- cibles ---- */
    function targets() {
      for (const p of parts) {
        let t = p.rest;
        if (finger != null && !pulled) {
          const d = p.x - finger;
          // le doigt ouvre une brèche : à gauche on penche à gauche, à droite à droite
          const amp = p.kind === 'div' ? 7 : 16;
          t += amp * Math.sign(d || 1) * Math.exp(-Math.abs(d) / 30) - (d < 0 ? 3 : -2);
        }
        if (pulled && pulled !== p && p.box === pulled.box) {
          // la place laissée par la fiche sortie : ses voisines s'y affaissent
          const d = p.x - pulled.x; t += Math.sign(d) * 7 * Math.exp(-Math.abs(d) / 24);
        }
        p.lean.t = clamp(t, -24, 24);
        if (p !== pulled) {
          p.up.t = p === lifted ? .32 : p === sel && finger != null && !pulled ? .07 : 0;
          p.out.t = 0;
        }
      }
      dim.t = pulled ? 1 : 0;
    }

    /** Ce que désigne le doigt : la fiche (ou l'intercalaire) juste à droite de la brèche */
    function pick(x) {
      if (x == null) return null;
      let best = null;
      for (const p of parts) if (p.x >= x - 2 && (!best || p.x < best.x)) best = p;
      return best || parts[parts.length - 1] || null;
    }
    function compartment(x) { return clamp(Math.floor((x + L / 2) / CL), 0, 5); }

    function say() {
      if (pulled) { read.textContent = 'Touche la fiche pour la réviser'; return; }
      const p = lifted || (finger != null ? sel : null);
      if (!p) {
        read.textContent = total ? `${U.plural(total, 'fiche')} · ${due} à réviser` : 'Ta boîte est vide';
        return;
      }
      const b = boxes[p.box];
      read.textContent = `Boîte ${p.box} · ${BOX_LABEL[p.box]} · ${U.plural(b.n, 'fiche')}${b.due ? ` · ${b.due} à réviser` : ''}`;
    }

    /* ---- boucle ---- */
    let raf = 0, last = 0, t0 = performance.now();
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function frame(now) {
      raf = 0;
      if (!sec.isConnected) return;
      const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
      targets();
      let moving = false;
      if (reduced()) {
        for (const p of parts) { p.lean.x = p.lean.t; p.up.x = p.up.t; p.out.x = p.out.t; p.lean.v = p.up.v = p.out.v = 0; }
        cam.x = cam.t; drop.x = drop.t; dim.x = dim.t; squash = 0;
      } else {
        const el = now - t0;
        moving = spring(cam, 150, 23, dt) | moving;
        const v0 = drop.v;
        moving = spring(drop, 240, 15, dt) | moving;
        // écrasement selon la décélération (lissé) : s'étire en tombant, se tasse en touchant
        squash += ((-(drop.v - v0) / dt) * .00003 - squash) * Math.min(1, dt * 30);
        if (Math.abs(squash) > 1e-4) moving = true; else squash = 0;
        moving = spring(dim, 220, 30, dt) | moving;
        for (const p of parts) {
          if (p.wait && el < p.wait) { moving = true; continue; }
          p.wait = 0;
          const stiff = p.kind === 'div' ? [520, 30] : [420, 15];
          moving = spring(p.lean, stiff[0], stiff[1], dt) | moving;
          moving = spring(p.up, 300, 26, dt) | moving;
          const was = p.up.x;
          moving = spring(p.out, p.out.t > p.out.x ? 170 : 260, p.out.t > p.out.x ? 22 : 32, dt) | moving;
          // retombée dans la boîte : les voisines encaissent le choc (action secondaire)
          if (p.landing && was < .04 && p.up.v < 0) {
            p.landing = false;
            for (const q of parts) if (q !== p && Math.abs(q.x - p.x) < 40) q.lean.v += Math.sign(q.x - p.x) * 90 * (1 - Math.abs(q.x - p.x) / 40);
          }
        }
      }
      poseWorld();
      for (const p of parts) pose(p);
      if (moving) raf = requestAnimationFrame(frame);
    }

    /* ---- gestes ---- */
    function setFinger(x, t) {
      if (x != null && lastFX != null) {
        const dt = Math.max(1, t - lastFT) / 1000;
        fingerV = lerp(fingerV, (x - lastFX) / dt, .5);
        // chaque fiche franchie par le doigt reçoit une chiquenaude dans le sens du geste
        for (const p of parts) {
          if ((p.x - lastFX) * (p.x - x) < 0) {
            p.lean.v += clamp(fingerV * .35, -320, 320) * (p.kind === 'div' ? .4 : 1);
            if (p.kind === 'div') R.motion.haptic(5);
          }
        }
      }
      finger = x; lastFX = x; lastFT = t;
      const s2 = pick(x);
      if (s2 !== sel) { sel = s2; }
      say(); kick();
    }
    function release() { finger = null; lastFX = null; fingerV = 0; sel = null; say(); kick(); }
    function pullOut(p) {
      if (!p) return;
      if (p.kind === 'div') { lifted = lifted === p ? null : p; R.motion.haptic(8); say(); kick(); return; }
      lifted = null;
      if (pulled && pulled !== p) putBack();
      pulled = p; finger = null; sel = null;
      p.up.t = 1; p.out.t = 1;
      if (!reduced()) p.up.v = -2.2;                  // anticipation : elle s'enfonce d'abord
      if (view !== 0) setView(0, true);               // on se remet à hauteur des yeux pour la lire
      sec.classList.add('has-pulled');
      R.motion.haptic(10); say(); kick();
    }
    function putBack() {
      const p = pulled; if (!p) return;
      pulled = null; p.up.t = 0; p.out.t = 0; p.landing = true;
      if (!reduced()) p.out.v = Math.min(p.out.v, -.5);
      sec.classList.remove('has-pulled');
      say(); kick();
    }
    function openReview(p) {
      const key = `${p.it.map.id}.${encodeURIComponent(p.it.key)}`;
      R.app.go(`#/reviser/tout?start=${key}${p.due ? '' : '&all=1'}`, { from: sec });
    }
    function setView(v, auto) {
      view = v; cam.t = v;
      if (!reduced() && !auto) cam.v = v ? -.9 : .9;  // anticipation : un léger recul avant de basculer
      viewBtn.setAttribute('aria-pressed', String(!!v));
      viewBtn.title = v ? 'Vue de face' : 'Vue de dessus';
      sec.classList.toggle('is-top', !!v);
      kick();
    }
    viewBtn.addEventListener('click', () => { if (pulled) putBack(); setView(view ? 0 : 1); });

    // le point touché est-il sur la fiche sortie ? (son rectangle à l'écran)
    const onPulled = (e) => { if (!pulled) return false; const r = pulled.el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    let down = null;   // { id, x, y, t, type, cam }
    stage.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (down && down.id === e.pointerId && down.camDrag) {
        cam.t = clamp(down.cam + (y - down.y) / -120, -.15, 1.15); cam.t = cam.t > 1 ? 1 + (cam.t - 1) * .4 : cam.t < 0 ? cam.t * .4 : cam.t;
        cam.x = cam.t; cam.v = 0; kick(); return;
      }
      if (down && down.id === e.pointerId) {
        const dx = x - down.x, dy = y - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 6) {
          down.moved = true;
          // souris : un glissé surtout vertical bascule la caméra
          if (e.pointerType === 'mouse' && Math.abs(dy) > Math.abs(dx) && !pulled) { down.camDrag = true; down.cam = cam.x; stage.setPointerCapture(e.pointerId); stage.classList.add('is-drag'); return; }
        }
      }
      if (pulled) return;
      if (e.pointerType === 'mouse' || (down && down.id === e.pointerId)) setFinger(worldX(x), e.timeStamp);
    });
    stage.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const [x, y] = local(e);
      down = { id: e.pointerId, x, y, t: e.timeStamp, type: e.pointerType, moved: false };
      if (!pulled && e.pointerType !== 'mouse') setFinger(worldX(x), e.timeStamp);
    });
    const up = (e) => {
      if (!down || down.id !== e.pointerId) return;
      const d = down; down = null;
      stage.classList.remove('is-drag');
      if (d.camDrag) {
        // projection à la relâche, puis la vue la plus proche
        const proj = cam.x + (cam.v || 0) * .15;
        setView(proj > .5 ? 1 : 0, true); return;
      }
      if (e.type === 'pointercancel') { release(); return; }
      if (!d.moved || e.pointerType === 'mouse') {
        if (pulled) { if (onPulled(e)) openReview(pulled); else putBack(); }
        else if (!d.moved) pullOut(pick(worldX(local(e)[0])));
      }
      if (e.pointerType !== 'mouse') release();
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !down) release(); });
    stage.addEventListener('dragstart', (e) => e.preventDefault());
    // toucher ailleurs remet la fiche en place
    const outside = (e) => { if (!sec.isConnected) { document.removeEventListener('pointerdown', outside, true); return; } if (pulled && !stage.contains(e.target)) putBack(); if (lifted && !stage.contains(e.target)) { lifted = null; say(); kick(); } };
    document.addEventListener('pointerdown', outside, true);

    // clavier : ← → parcourent, Entrée sort la fiche (puis la révise), Échap la range, ↑ ↓ la vue
    let kx = null;
    stage.addEventListener('keydown', (e) => {
      const i = sel ? parts.indexOf(sel) : -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); if (pulled) putBack();
        const n = clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, parts.length - 1);
        kx = parts[n].x - 3; setFinger(kx, e.timeStamp); sel = parts[n]; say();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (pulled) openReview(pulled); else if (sel) pullOut(sel);
      } else if (e.key === 'Escape') { if (pulled) { e.preventDefault(); putBack(); } }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setView(e.key === 'ArrowUp' ? 1 : 0); }
    });
    stage.addEventListener('blur', () => { if (kx != null) { kx = null; release(); } });

    const ro = new ResizeObserver(() => { measure(); kick(); });
    ro.observe(stage);
    requestAnimationFrame(() => { measure(); say(); if (intro && !reduced()) drop.t = 0; kick(); });
    return sec;
  };
})(window.R);
