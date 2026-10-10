/* Ratio — composants d'interface (M3) et motion */
(function (R) {
  'use strict';
  const { U } = R;
  const { h } = U;

  const ui = {};

  /* ------------------------------------------------------------------ */
  /* Boutons                                                            */
  /* ------------------------------------------------------------------ */
  ui.btn = function (label, opts = {}) {
    const { icon, variant = 'text', onClick, title, cls = '', type = 'button', disabled } = opts;
    const b = h(`button.btn.btn-${variant}`, { type, title, class: cls, disabled, onclick: onClick });
    if (icon) b.appendChild(R.icon(icon, 18));
    if (label) b.appendChild(h('span.btn-label', label));
    return b;
  };

  ui.iconBtn = function (icon, opts = {}) {
    const { onClick, title, cls = '', variant = 'standard', pressed, disabled, size = 24 } = opts;
    const b = h(`button.icon-btn.icon-btn-${variant}`, {
      type: 'button', 'aria-label': title, 'data-tip': title, class: cls, disabled, onclick: onClick,
    });
    if (pressed != null) b.setAttribute('aria-pressed', String(!!pressed));
    b.appendChild(R.icon(icon, size));
    return b;
  };

  /* Ripple M3 — délégué global (action secondaire au toucher) */
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.btn, .icon-btn, .ripple, .nav-item, .chip, .menu-item, .list-item, .fab');
    if (!t || t.disabled || U.reducedMotion()) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const wave = h('span.ripple-wave', {
      style: { width: size + 'px', height: size + 'px', left: e.clientX - r.left - size / 2 + 'px', top: e.clientY - r.top - size / 2 + 'px' },
    });
    t.appendChild(wave);
    const done = () => { wave.classList.add('out'); setTimeout(() => wave.remove(), 260); };
    window.addEventListener('pointerup', done, { once: true });
    window.addEventListener('pointercancel', done, { once: true });
  }, { passive: true });

  /* ------------------------------------------------------------------ */
  /* Infobulles (souris uniquement)                                     */
  /* ------------------------------------------------------------------ */
  let tipEl = null, tipTimer = null, tipWarmUntil = 0, tipFor = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest('[data-tip]');
    if (t && t === tipFor) return;
    clearTimeout(tipTimer);
    if (!t) { hideTip(); return; }
    // premier survol : 400 ms ; ensuite, entre infobulles voisines : immédiat
    const warm = performance.now() < tipWarmUntil;
    tipTimer = setTimeout(() => showTip(t, warm), warm ? 0 : 400);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); hideTip(); }, true);
  function showTip(t, warm) {
    const text = t.getAttribute('data-tip');
    if (!text || !document.body.contains(t)) return;
    hideTip();
    tipFor = t;
    tipEl = h('div.tooltip', { role: 'tooltip', class: warm ? 'warm' : '' }, text);
    const kbd = t.getAttribute('data-kbd');
    if (kbd) tipEl.appendChild(h('span.tooltip-kbd', kbd));
    document.body.appendChild(tipEl);
    const r = t.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8;
    let left = r.left + r.width / 2 - tr.width / 2;
    if (r.left < 120 && r.width < 80 && r.top > 60 && t.closest('.rail, .vtoolbar')) { left = r.right + 8; top = r.top + r.height / 2 - tr.height / 2; }
    tipEl.style.left = U.clamp(left, 8, window.innerWidth - tr.width - 8) + 'px';
    tipEl.style.top = top + 'px';
    requestAnimationFrame(() => tipEl && tipEl.classList.add('in'));
  }
  function hideTip() {
    if (tipEl) { tipEl.remove(); tipEl = null; tipWarmUntil = performance.now() + 600; }
    tipFor = null;
  }
  ui.hideTip = hideTip;

  /* ------------------------------------------------------------------ */
  /* Dialogues                                                          */
  /* ------------------------------------------------------------------ */
  const layer = () => U.$('#overlays');

  ui.dialog = function ({ title, icon, body, actions = [], cls = '', dismissible = true, onOpen, full }) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const scrim = h('div.scrim');
      const box = h('div.dialog', { role: 'dialog', 'aria-modal': 'true', class: cls + (full ? ' dialog-full' : '') });
      if (icon) box.appendChild(h('div.dialog-icon', R.icon(icon, 24)));
      if (title) box.appendChild(h('h2.dialog-title', title));
      const content = h('div.dialog-body');
      if (body) U.append(content, [body]);
      box.appendChild(content);
      const bar = h('div.dialog-actions');
      let closed = false;
      const close = (val) => {
        if (closed) return;
        closed = true;
        box.classList.add('out');
        scrim.classList.add('out');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => { wrap.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); }, motion.reduced() ? 120 : 180);
        resolve(val);
      };
      for (const a of actions) {
        const b = ui.btn(a.label, { variant: a.variant || 'text', icon: a.icon, cls: a.danger ? 'danger' : '' });
        b.addEventListener('click', () => {
          if (a.validate && !a.validate()) return;
          close(typeof a.value === 'function' ? a.value() : a.value);
        });
        bar.appendChild(b);
      }
      if (actions.length) box.appendChild(bar);
      const wrap = h('div.dialog-wrap', scrim, box);
      if (dismissible) scrim.addEventListener('click', () => close(undefined));
      const onKey = (e) => {
        if (e.key === 'Escape' && dismissible) { e.stopPropagation(); e.preventDefault(); close(undefined); }
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'INPUT') {
          const primary = actions.find((a) => a.primary);
          if (primary) { e.preventDefault(); if (!primary.validate || primary.validate()) close(typeof primary.value === 'function' ? primary.value() : primary.value); }
        }
        if (e.key === 'Tab') trapFocus(e, box);
      };
      document.addEventListener('keydown', onKey, true);
      layer().appendChild(wrap);
      ui.hideTip();
      requestAnimationFrame(() => {
        const f = box.querySelector('[autofocus], input, textarea') || box.querySelector('.dialog-actions .btn:last-child');
        if (f) f.focus({ preventScroll: true });
      });
      if (onOpen) onOpen(box, close);
    });
  };

  function trapFocus(e, box) {
    const f = U.$$('button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"]), a[href]', box)
      .filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  ui.confirm = (title, text, { ok = 'Confirmer', danger = false, icon } = {}) => ui.dialog({
    title, icon,
    body: text ? h('p.dialog-text', text) : null,
    actions: [
      { label: 'Annuler', value: false },
      { label: ok, value: true, variant: danger ? 'filled-danger' : 'filled', primary: true },
    ],
  });

  ui.field = function ({ label, value = '', placeholder = '', multiline = false, maxlength = 200, autofocus }) {
    const id = U.uid('f');
    const input = multiline
      ? h('textarea.field-input', { id, rows: 3, placeholder, maxlength })
      : h('input.field-input', { id, type: 'text', placeholder, maxlength, autocomplete: 'off', spellcheck: 'true' });
    input.value = value;
    if (autofocus) input.setAttribute('autofocus', '');
    const wrap = h('label.field', { for: id }, h('span.field-label', label), input);
    return { wrap, input };
  };

  /** Formulaire : fields = [{key,label,value,placeholder,multiline,required}] */
  ui.form = function ({ title, icon, fields, ok = 'Créer' }) {
    const inputs = {};
    const body = h('div.form');
    fields.forEach((f, i) => {
      const fld = ui.field({ ...f, autofocus: i === 0 });
      inputs[f.key] = fld.input;
      body.appendChild(fld.wrap);
    });
    const validate = () => {
      for (const f of fields) {
        if (f.required && !inputs[f.key].value.trim()) {
          const fld = inputs[f.key].closest('.field');
          fld.classList.add('invalid');
          inputs[f.key].focus();
          motion.shake(fld);
          setTimeout(() => fld.classList.remove('invalid'), 1600);
          return false;
        }
      }
      return true;
    };
    const collect = () => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value]));
    return ui.dialog({
      title, icon, body,
      actions: [
        { label: 'Annuler', value: null },
        { label: ok, value: collect, validate, variant: 'filled', primary: true },
      ],
      onOpen: () => { const first = Object.values(inputs)[0]; if (first) { first.focus(); first.select(); } },
    });
  };

  /* ------------------------------------------------------------------ */
  /* Menus                                                              */
  /* ------------------------------------------------------------------ */
  let openMenu = null;
  ui.closeMenu = () => { if (openMenu) { openMenu(); openMenu = null; } };

  ui.menu = function (anchor, items, { align = 'end', placement = 'bottom' } = {}) {
    ui.closeMenu();
    ui.hideTip();
    const el = h('div.menu', { role: 'menu' });
    let idx = 0;
    for (const it of items) {
      if (!it) continue;
      if (it.divider) { el.appendChild(h('div.menu-divider')); continue; }
      if (it.header) { el.appendChild(h('div.menu-header', it.header)); continue; }
      const b = h('button.menu-item', { type: 'button', role: 'menuitem', class: (it.danger ? 'danger ' : '') + (it.checked ? 'checked' : ''), style: { '--i': Math.min(idx++, 6) } });
      if (it.icon) b.appendChild(R.icon(it.icon, 20));
      else if (it.checked != null) b.appendChild(h('span.menu-check', it.checked ? R.icon('check', 20) : ''));
      b.appendChild(h('span.menu-label', it.label));
      if (it.hint) b.appendChild(h('span.menu-hint', it.hint));
      b.addEventListener('click', () => { close(); it.onClick && it.onClick(); });
      el.appendChild(b);
    }
    layer().appendChild(el);
    const r = anchor.getBoundingClientRect();
    // taille réelle, hors animation d'ouverture (scaleY)
    const mr = { width: el.offsetWidth, height: el.offsetHeight };
    let top = placement === 'top' ? r.top - mr.height - 4 : r.bottom + 4;
    if (top + mr.height > window.innerHeight - 8) top = Math.max(8, r.top - mr.height - 4);
    if (top < 8) top = 8;
    let left = align === 'end' ? r.right - mr.width : r.left;
    left = U.clamp(left, 8, window.innerWidth - mr.width - 8);
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.style.transformOrigin = `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : mr.height}px`;
    requestAnimationFrame(() => el.classList.add('in'));
    const firstItem = el.querySelector('.menu-item');
    if (firstItem) firstItem.focus({ preventScroll: true });

    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = (e) => {
      const its = U.$$('.menu-item', el);
      const i = its.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus && anchor.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); its[(i + 1) % its.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); its[(i - 1 + its.length) % its.length].focus(); }
      else if (e.key === 'Tab') { close(); }
    };
    setTimeout(() => document.addEventListener('pointerdown', onDown, true));
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close, { once: true });
    function close() {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 110);
      if (openMenu === closeRef) openMenu = null;
    }
    const closeRef = close;
    openMenu = close;
    return close;
  };

  /* ------------------------------------------------------------------ */
  /* Snackbar                                                           */
  /* ------------------------------------------------------------------ */
  let snackEl = null;
  ui.snack = function (text, { action, onAction, duration = 4000 } = {}) {
    if (snackEl) snackEl._dismiss(true);
    const el = h('div.snackbar', { role: 'status' }, h('span.snackbar-text', text));
    if (action) {
      const b = ui.btn(action, { variant: 'text', cls: 'snackbar-action' });
      b.addEventListener('click', () => { onAction && onAction(); dismiss(); });
      el.appendChild(b);
    }
    U.$('#snack-host').appendChild(el);
    snackEl = el;
    requestAnimationFrame(() => el.classList.add('in'));

    // minuteur suspendu au survol / focus (le temps de lire et d'agir)
    let remaining = duration, startedAt = performance.now(), timer = setTimeout(dismiss, remaining);
    const pause = () => { clearTimeout(timer); remaining -= performance.now() - startedAt; };
    const resume = () => { startedAt = performance.now(); clearTimeout(timer); timer = setTimeout(dismiss, Math.max(1200, remaining)); };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pause(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') resume(); });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);

    // glisser horizontalement pour fermer (suivi 1:1, puis fling ou retour en ressort)
    let sx = 0, dx = 0, drag = false;
    const vt = motion.velocity();
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      drag = true; sx = e.clientX; dx = 0; vt.reset(); vt.add(e.clientX, 0);
      el.setPointerCapture(e.pointerId); el.classList.add('dragging'); pause();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      dx = e.clientX - sx; vt.add(e.clientX, 0);
      el.style.translate = dx + 'px 0';
      el.style.opacity = String(1 - Math.min(0.6, Math.abs(dx) / 300));
    });
    const end = () => {
      if (!drag) return;
      drag = false; el.classList.remove('dragging');
      const v = vt.get().x;
      if (Math.abs(dx) > 90 || Math.abs(v) > 0.5) {
        const dir = Math.sign(dx || v);
        el.animate([{ translate: dx + 'px 0', opacity: el.style.opacity }, { translate: dir * (el.offsetWidth + 40) + 'px 0', opacity: 0 }],
          { duration: motion.reduced() ? 1 : 180, easing: motion.css.in, fill: 'forwards' });
        dismiss(true, 180);
      } else {
        el.animate([{ translate: dx + 'px 0' }, { translate: '0 0' }], { duration: 240, easing: motion.css.settle });
        el.style.translate = ''; el.style.opacity = '';
        resume();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    function dismiss(immediate, delay) {
      clearTimeout(timer);
      if (snackEl === el) snackEl = null;
      if (immediate && !delay) { el.remove(); return; }
      if (!delay) { el.classList.remove('in'); el.classList.add('out'); }
      setTimeout(() => el.remove(), delay || 200);
    }
    el._dismiss = dismiss;
    return dismiss;
  };

  /* ------------------------------------------------------------------ */
  /* Indicateurs                                                        */
  /* ------------------------------------------------------------------ */
  ui.progress = (value, { label } = {}) => {
    const p = Math.round(U.clamp(value, 0, 1) * 100);
    return h('div.progress', { role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label || 'Progression' },
      h('div.progress-bar', { style: { '--p': String(p / 100) } }));
  };

  /** Pastille de maîtrise (○ ◔ ◑ ●) — monochrome */
  ui.mastery = (rating, size = 12) => {
    const fill = rating ? R.store.RATINGS[rating].fill : 0;
    const el = h('span.mastery', { class: 'f' + fill, style: { '--s': size + 'px' }, title: rating ? R.store.RATINGS[rating].label : 'Pas encore révisé' });
    return el;
  };

  /** Contrôle segmenté avec indicateur qui glisse d'une option à l'autre (Tabs indicator).
      key : identifiant stable pour animer depuis la position précédente même après un re-rendu. */
  const segMemory = new Map();
  ui.segIndicator = function (seg, key) {
    let ind = seg.querySelector(':scope > .seg-ind');
    if (!ind) { ind = h('span.seg-ind', { 'aria-hidden': 'true' }); seg.prepend(ind); }
    const place = (animate) => {
      const sel = seg.querySelector('.seg-btn[aria-checked="true"], .seg-btn[aria-selected="true"]');
      if (!sel || !seg.isConnected) { ind.style.opacity = '0'; return; }
      const x = sel.offsetLeft, w = sel.offsetWidth;
      const from = key && segMemory.get(key);
      const to = `translateX(${x}px) scaleX(${w / 100})`;
      ind.style.opacity = '1';
      if (animate !== false && from && from !== to && !motion.reduced()) {
        ind.animate([{ transform: from }, { transform: to }], { duration: 240, easing: motion.css.inOut });
      }
      ind.style.transform = to;
      if (key) segMemory.set(key, to);
    };
    seg._place = place;
    // premier placement après mise en page
    requestAnimationFrame(() => place(true));
    return place;
  };

  ui.emptyState = ({ icon, title, text, action }) => h('div.empty',
    h('div.empty-art', R.icon(icon, 40)),
    h('h3.empty-title', title),
    text ? h('p.empty-text', text) : null,
    action || null);

  /* ------------------------------------------------------------------ */
  /* Motion — tokens, courbes, ressorts, inertie                        */
  /* ------------------------------------------------------------------ */
  const motion = {};

  /** Mouvement réduit : préférence système OU réglage de l'app */
  motion.reduced = () => U.reducedMotion();

  /** Bézier cubique (implémentation type WebKit) */
  motion.bezier = function (x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-5) break;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      t = U.clamp(t, 0, 1);
      return sy(t);
    };
  };

  /* Les mêmes 5 courbes que tokens.css — un seul système */
  motion.ease = {
    out: motion.bezier(0.23, 1, 0.32, 1),
    in: motion.bezier(0.55, 0.055, 0.675, 0.19),
    inOut: motion.bezier(0.645, 0.045, 0.355, 1),
    drawer: motion.bezier(0.32, 0.72, 0, 1),
    pop: motion.bezier(0.175, 0.885, 0.32, 1.275),
    expo: motion.bezier(0.16, 1, 0.3, 1),
  };
  const supportsLinear = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
  motion.css = {
    out: 'cubic-bezier(0.23, 1, 0.32, 1)',
    in: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
    inOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
    pop: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    settle: supportsLinear
      ? 'linear(0, 0.157 4.6%, 0.508 10.6%, 0.784 16.7%, 0.932 22.7%, 1.006 29.4%, 1.026 35.6%, 1.019 43.5%, 1.003 57%, 0.999 72%, 1)'
      : 'cubic-bezier(0.23, 1, 0.32, 1)',
  };
  motion.dur = { xs: 100, sm: 160, md: 240, lg: 360, xl: 560 };

  /** Durée proportionnée à la distance (racine), plafonnée — cf. timing.rules */
  motion.durationFor = (distancePx, { min = 160, max = 480 } = {}) =>
    U.clamp(150 + 30 * Math.sqrt(Math.abs(distancePx) / 10), min, max);

  /** Interpolation à durée fixe (pose à pose). Interruptible : renvoie stop(). */
  motion.tween = function ({ duration = 240, ease = motion.ease.out, onUpdate, onDone }) {
    if (motion.reduced()) duration = 1;
    const t0 = performance.now();
    let raf, stopped = false;
    const step = (now) => {
      if (stopped) return;
      const p = U.clamp((now - t0) / duration, 0, 1);
      onUpdate(p, ease);
      if (p < 1) raf = requestAnimationFrame(step);
      else onDone && onDone();
    };
    raf = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  };

  /** Ressort (Euler semi-implicite) — conserve la vélocité du geste, interruptible.
      Préréglages : ui (ζ≈1), snappy (ζ≈0.8), drawer (ζ≈0.97). */
  motion.springs = {
    ui: { stiffness: 400, damping: 40 },
    snappy: { stiffness: 500, damping: 36 },
    drawer: { stiffness: 380, damping: 38 },
    gentle: { stiffness: 170, damping: 26 },
  };
  motion.spring = function ({ from, to, velocity = 0, stiffness = 400, damping = 40, mass = 1, onUpdate, onDone }) {
    if (motion.reduced()) { onUpdate(to); onDone && onDone(); return () => {}; }
    let x = from, v = velocity * 1000; // px/ms → px/s
    let last = performance.now(), raf, stopped = false;
    const step = (now) => {
      if (stopped) return;
      let dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // sous-pas pour la stabilité
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        const f = -stiffness * (x - to) - damping * v;
        v += (f / mass) * h;
        x += v * h;
      }
      onUpdate(x);
      if (Math.abs(v) < 2 && Math.abs(x - to) < 0.3) { onUpdate(to); onDone && onDone(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  };

  /** Inertie (momentum) : la vitesse du geste se prolonge et décroît (decelerationRate ≈ 0.998/ms) */
  motion.decay = function ({ velocity, rate = 0.995, onUpdate, onDone }) {
    let vx = velocity.x, vy = velocity.y; // px/ms
    if (motion.reduced() || Math.hypot(vx, vy) < 0.05) { onDone && onDone(); return () => {}; }
    let last = performance.now(), raf, stopped = false;
    const step = (now) => {
      if (stopped) return;
      const dt = Math.min(32, now - last);
      last = now;
      const k = Math.pow(rate, dt);
      vx *= k; vy *= k;
      onUpdate(vx * dt, vy * dt);
      if (Math.hypot(vx, vy) < 0.02) { onDone && onDone(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  };

  /** Mesure de vélocité sur les ~80 dernières ms d'un geste (px/ms) */
  motion.velocity = function () {
    let samples = [];
    return {
      reset() { samples = []; },
      add(x, y) {
        const t = performance.now();
        samples.push({ x, y, t });
        while (samples.length > 2 && t - samples[0].t > 80) samples.shift();
      },
      get() {
        if (samples.length < 2) return { x: 0, y: 0 };
        const a = samples[0], b = samples[samples.length - 1];
        const dt = Math.max(1, b.t - a.t);
        if (performance.now() - b.t > 100) return { x: 0, y: 0 }; // doigt immobile avant relâchement
        return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
      },
    };
  };

  /** Value change : compteur qui défile (chiffres tabulaires) */
  motion.countUp = function (el, to, { duration = 900, from = 0, format = (n) => String(n) } = {}) {
    if (motion.reduced() || to === from) { el.textContent = format(to); return; }
    el.textContent = format(from);
    motion.tween({
      duration, ease: motion.ease.expo,
      onUpdate: (p, e) => { el.textContent = format(Math.round(from + (to - from) * e(p))); },
    });
  };

  /** Shake d'erreur : 0, −8, 8, −6, 6, −3, 0 px sur 400 ms, une seule fois */
  motion.shake = function (el) {
    if (motion.reduced() || !el.animate) return;
    el.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '8px' }, { translate: '-6px' }, { translate: '6px' }, { translate: '-3px' }, { translate: '0' }],
      { duration: 400, easing: 'ease-out' });
  };

  /** Éclat de particules — réservé aux moments expressifs (maîtrise, fin de session) */
  motion.burst = function (x, y, { count = 14, spread = 70 } = {}) {
    if (motion.reduced()) return;
    const host = h('div.burst', { style: { left: x + 'px', top: y + 'px' } });
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const d = spread * (0.6 + Math.random() * 0.6);
      const s = 4 + Math.random() * 5;
      host.appendChild(h('span.burst-p', {
        style: {
          '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', '--r': (Math.random() * 360) + 'deg',
          width: s + 'px', height: s * (Math.random() > 0.5 ? 1 : 0.4) + 'px', animationDelay: Math.random() * 40 + 'ms',
        },
      }));
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 900);
  };

  /** Entrée en cascade : 40 ms par élément, plafonnée à 8 (total ≤ 320 ms) */
  motion.stagger = function (els, base = 0, { step = 40, max = 8 } = {}) {
    els.forEach((el, i) => {
      el.style.setProperty('--i', Math.min(base + i, max));
      el.style.setProperty('--step', step + 'ms');
      el.classList.add('stagger');
    });
  };

  /** « Première fois » par clé et par session : l'intensité baisse avec la fréquence */
  const seen = new Set();
  motion.first = (key) => { if (seen.has(key)) return false; seen.add(key); return true; };

  /** Retour haptique léger (Android) — feedback de seuil, jamais en continu */
  motion.haptic = (ms = 8) => { if (!motion.reduced() && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  R.ui = ui;
  R.motion = motion;
})(window.R);
