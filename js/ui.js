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
    const done = () => { wave.classList.add('out'); setTimeout(() => wave.remove(), 400); };
    window.addEventListener('pointerup', done, { once: true });
    window.addEventListener('pointercancel', done, { once: true });
  }, { passive: true });

  /* ------------------------------------------------------------------ */
  /* Infobulles (souris uniquement)                                     */
  /* ------------------------------------------------------------------ */
  let tipEl = null, tipTimer = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest('[data-tip]');
    clearTimeout(tipTimer);
    if (!t) { hideTip(); return; }
    tipTimer = setTimeout(() => showTip(t), 450);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); hideTip(); }, true);
  function showTip(t) {
    const text = t.getAttribute('data-tip');
    if (!text || !document.body.contains(t)) return;
    hideTip();
    tipEl = h('div.tooltip', { role: 'tooltip' }, text);
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
  function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
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
        setTimeout(() => { wrap.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); }, 200);
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
          inputs[f.key].closest('.field').classList.add('invalid');
          inputs[f.key].focus();
          setTimeout(() => inputs[f.key].closest('.field').classList.remove('invalid'), 600);
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
      const b = h('button.menu-item', { type: 'button', role: 'menuitem', class: (it.danger ? 'danger ' : '') + (it.checked ? 'checked' : ''), style: { '--i': idx++ } });
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
      setTimeout(() => el.remove(), 150);
      if (openMenu === closeRef) openMenu = null;
    }
    const closeRef = close;
    openMenu = close;
    return close;
  };

  /* ------------------------------------------------------------------ */
  /* Snackbar                                                           */
  /* ------------------------------------------------------------------ */
  let snackTimer = null, snackEl = null;
  ui.snack = function (text, { action, onAction, duration = 4000 } = {}) {
    if (snackEl) { snackEl.remove(); clearTimeout(snackTimer); }
    const el = h('div.snackbar', { role: 'status' }, h('span.snackbar-text', text));
    if (action) {
      const b = ui.btn(action, { variant: 'text', cls: 'snackbar-action' });
      b.addEventListener('click', () => { onAction && onAction(); dismiss(); });
      el.appendChild(b);
    }
    U.$('#snack-host').appendChild(el);
    snackEl = el;
    requestAnimationFrame(() => el.classList.add('in'));
    function dismiss() {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
      if (snackEl === el) snackEl = null;
    }
    snackTimer = setTimeout(dismiss, duration);
    return dismiss;
  };

  /* ------------------------------------------------------------------ */
  /* Indicateurs                                                        */
  /* ------------------------------------------------------------------ */
  ui.progress = (value, { label } = {}) => {
    const p = Math.round(U.clamp(value, 0, 1) * 100);
    return h('div.progress', { role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label || 'Progression' },
      h('div.progress-bar', { style: { '--p': p + '%' } }));
  };

  /** Pastille de maîtrise (○ ◔ ◑ ●) — monochrome */
  ui.mastery = (rating, size = 12) => {
    const fill = rating ? R.store.RATINGS[rating].fill : 0;
    const el = h('span.mastery', { class: 'f' + fill, style: { '--s': size + 'px' }, title: rating ? R.store.RATINGS[rating].label : 'Pas encore révisé' });
    return el;
  };

  ui.emptyState = ({ icon, title, text, action }) => h('div.empty',
    h('div.empty-art', R.icon(icon, 40)),
    h('h3.empty-title', title),
    text ? h('p.empty-text', text) : null,
    action || null);

  /* ------------------------------------------------------------------ */
  /* Motion                                                             */
  /* ------------------------------------------------------------------ */
  const motion = {};

  /** Bézier cubique (implémentation type WebKit) */
  motion.bezier = function (x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
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
  motion.ease = {
    standard: motion.bezier(0.2, 0, 0, 1),
    decel: motion.bezier(0, 0, 0, 1),
    emphDecel: motion.bezier(0.05, 0.7, 0.1, 1),
    emphAccel: motion.bezier(0.3, 0, 0.8, 0.15),
    overshoot: motion.bezier(0.34, 1.56, 0.64, 1),
  };

  motion.tween = function ({ duration = 400, ease = motion.ease.standard, onUpdate, onDone }) {
    if (U.reducedMotion()) duration = 1;
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

  /** Éclat de particules (exagération / pic-fin) */
  motion.burst = function (x, y, { count = 14, spread = 70 } = {}) {
    if (U.reducedMotion()) return;
    const host = h('div.burst', { style: { left: x + 'px', top: y + 'px' } });
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const d = spread * (0.6 + Math.random() * 0.6);
      const s = 4 + Math.random() * 6;
      host.appendChild(h('span.burst-p', {
        style: {
          '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', '--r': (Math.random() * 360) + 'deg',
          width: s + 'px', height: s * (Math.random() > 0.5 ? 1 : 0.4) + 'px', animationDelay: Math.random() * 60 + 'ms',
        },
      }));
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 1000);
  };

  /** Entrée en cascade (continuité / chevauchement) */
  motion.stagger = function (els, base = 0) {
    els.forEach((el, i) => { el.style.setProperty('--i', base + i); el.classList.add('stagger'); });
  };

  R.ui = ui;
  R.motion = motion;
})(window.R);
