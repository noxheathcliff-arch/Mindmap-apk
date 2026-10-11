/* Ratio — utilitaires partagés (namespace global R) */
window.R = window.R || {};

(function (R) {
  'use strict';

  const U = {};

  U.uid = (p = '') =>
    p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /**
   * Hyperscript : h('div.cls#id', {attrs/on*}, children...)
   */
  U.h = function h(tag, props, ...children) {
    let [name, ...rest] = tag.split(/(?=[.#])/);
    const el = document.createElement(name || 'div');
    for (const r of rest) {
      if (r[0] === '.') el.classList.add(r.slice(1));
      else if (r[0] === '#') el.id = r.slice(1);
    }
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
      children.unshift(props);
      props = null;
    }
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
          }
        }
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    U.append(el, children);
    return el;
  };

  U.append = function (el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  U.debounce = (fn, ms) => {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    d.cancel = () => clearTimeout(t);
    return d;
  };

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  U.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Normalisation pour la recherche : minuscules, sans accents. */
  U.norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ]/g, "'").toLowerCase();

  U.dayKey = (d = new Date()) => {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };

  U.startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  U.DAY = 86400000;

  U.relTime = (t) => {
    if (!t) return '';
    const diff = Date.now() - t;
    const m = Math.round(diff / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24);
    if (d === 1) return 'hier';
    if (d < 7) return `il y a ${d} j`;
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  U.plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;

  U.download = (filename, content, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = U.h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  U.slug = (s) => U.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ratio';

  U.initials = (s) => {
    const words = String(s || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter((w) => w && !/^(de|du|des|la|le|les|et|l|d|en|au|aux)$/i.test(w));
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  U.roman = (n) => {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = '';
    for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
    return r;
  };

  U.alpha = (n, upper) => {
    let s = '';
    n += 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(97 + m) + s; n = Math.floor((n - 1) / 26); }
    return upper ? s.toUpperCase() : s;
  };

  /** Mouvement réduit : réglage de l'app (data-motion) prioritaire, sinon préférence système */
  U.reducedMotion = () => {
    const m = document.documentElement.dataset.motion;
    if (m) return m === 'reduce';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /** Classe de fenêtre M3 */
  U.windowClass = () => {
    const w = window.innerWidth;
    if (w < 600) return 'compact';
    if (w < 840) return 'medium';
    if (w < 1200) return 'expanded';
    if (w < 1600) return 'large';
    return 'xlarge';
  };
  U.isCompact = () => window.innerWidth < 600;

  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  U.mod = U.isMac ? '⌘' : 'Ctrl';

  U.isTyping = (el = document.activeElement) =>
    !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  R.U = U;
})(window.R);
