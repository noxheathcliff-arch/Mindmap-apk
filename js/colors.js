/* Ratio — couleurs des nœuds par type (option de personnalisation)
 *
 * Principes (cf. DESIGN.md §4.6) :
 * - Par défaut, rien ne change : la carte reste monochrome (différenciation par la forme).
 * - La couleur s'AJOUTE à la forme (bordure double, pointillés, italique…), elle ne la
 *   remplace pas : teinte = famille, forme = type. On repère vite, même en daltonisme.
 * - Tout est calculé en OKLCH (perceptuellement uniforme) ; chaque couleur choisie est
 *   déclinée en fond / bordure / texte pour le thème clair et le sombre, et le texte est
 *   ajusté automatiquement pour garder un contraste WCAG ≥ 4,5:1.
 */
(function (R) {
  'use strict';

  /* ---------------- Conversions sRGB ⇄ OKLab/OKLCH (Björn Ottosson) ---------------- */
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const rgbToHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
  function rgbToOklch([r, g, b]) {
    r = toLin(r); g = toLin(g); b = toLin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.hypot(A, B);
    let h = Math.atan2(B, A) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { L, C, h };
  }
  function oklchToRgbRaw({ L, C, h }) {
    const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
      toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      toGam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
  }
  const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);
  /** OKLCH → hex, en réduisant la chroma jusqu'à entrer dans le gamut sRGB (teinte conservée) */
  function oklchToHex(c) {
    let lo = 0, hi = c.C, rgb = oklchToRgbRaw(c);
    if (inGamut(rgb)) return rgbToHex(rgb);
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const t = oklchToRgbRaw({ ...c, C: mid });
      if (inGamut(t)) { lo = mid; rgb = t; } else hi = mid;
    }
    return rgbToHex(oklchToRgbRaw({ ...c, C: lo }));
  }
  const hexToOklch = (hex) => { const rgb = hexToRgb(hex); return rgb ? rgbToOklch(rgb) : null; };

  /* ---------------- Contraste (WCAG 2) ---------------- */
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** Écart perceptuel (OKLab, ~0,02 = à peine visible, < 0,08 = proches) */
  function distance(a, b) {
    const p = hexToOklch(a), q = hexToOklch(b);
    const pa = p.C * Math.cos(p.h * Math.PI / 180), pb = p.C * Math.sin(p.h * Math.PI / 180);
    const qa = q.C * Math.cos(q.h * Math.PI / 180), qb = q.C * Math.sin(q.h * Math.PI / 180);
    return Math.hypot(p.L - q.L, pa - qa, pb - qb);
  }
  /** Garde-fou : déplace la luminance de `fg` (vers le noir ou le blanc) jusqu'au contraste visé */
  function ensureContrast(fg, bg, min = 4.5) {
    if (contrast(fg, bg) >= min) return { hex: fg, adjusted: false };
    const c = hexToOklch(fg);
    const towardDark = luminance(bg) > 0.18;
    for (let i = 1; i <= 40; i++) {
      const L = towardDark ? c.L * (1 - i / 40) : c.L + (1 - c.L) * (i / 40);
      const hex = oklchToHex({ L, C: c.C * (1 - i / 50), h: c.h });
      if (contrast(hex, bg) >= min) return { hex, adjusted: true };
    }
    return { hex: towardDark ? '#000000' : '#ffffff', adjusted: true };
  }

  /* ---------------- Palettes ---------------- */
  // Familles : la teinte dit la famille (Structure bleue, Notion chaude, Sources vertes,
  // Compléments violets) ; à l'intérieur, de petites variations + la forme distinguent le type.
  const FAMILY_HUES = {
    chapitre: 265, lecon: 248, section: 230,
    notion: 28, definition: 52, fond: 8, forme: 348, effet: 72, exception: 330,
    texte: 152, juris: 178, doctrine: 202,
    exemple: 292, retenir: 92, idee: 312,
  };
  const family = {};
  for (const [t, h] of Object.entries(FAMILY_HUES)) family[t] = oklchToHex({ L: 0.64, C: 0.14, h });
  // Daltonisme : palette d'Okabe & Ito (Wong, Nature Methods 2011), 7 couleurs sur les types
  // de contenu les plus fréquents ; les autres restent monochromes (au-delà de 8 couleurs, on ne
  // distingue plus de manière fiable).
  const okabeIto = {
    definition: '#0072B2', fond: '#009E73', forme: '#56B4E9', effet: '#E69F00',
    exception: '#D55E00', juris: '#CC79A7', texte: '#F0E442',
  };
  const PRESETS = {
    familles: { label: 'Familles', text: 'Une teinte par famille de types (structure, notion, sources, compléments).', colors: family },
    daltonisme: { label: 'Daltonisme', text: 'Palette d’Okabe & Ito, lisible par les personnes daltoniennes, sur 7 types clés.', colors: okabeIto },
  };
  /** 12 nuances harmonieuses (même luminance et saturation perçues, teintes à 30°) */
  const SWATCHES = Array.from({ length: 12 }, (_, i) => oklchToHex({ L: 0.64, C: 0.15, h: (i * 30 + 20) % 360 }));

  /** Types « forts » (ancres visuelles) : gardent un aplat soutenu même en mode doux */
  const STRONG = new Set(['notion', 'chapitre']);

  function settings() {
    const s = R.store.data.settings.colors || {};
    return { mode: s.mode || 'off', intensity: s.intensity === 'vif' ? 'vif' : 'doux', custom: s.custom || {}, last: s.last };
  }
  /** Couleur de base de chaque type selon le réglage (null = monochrome) */
  function palette(s = settings()) {
    const out = {};
    const src = s.mode === 'perso' ? s.custom : PRESETS[s.mode] ? PRESETS[s.mode].colors : {};
    for (const t of R.store.TYPE_ORDER) out[t] = s.mode === 'off' ? null : (hexToRgb(src[t]) ? src[t].toLowerCase() : null);
    return out;
  }

  /**
   * Décline une couleur de base pour un thème : { bg, fg, line, sub, adjusted }
   * variant : 'doux' (aplat pâle, bordure colorée) | 'vif' (aplat de la couleur) | 'fort'
   */
  function derive(hex, theme, variant) {
    const c = hexToOklch(hex);
    const C = c.C, h = c.h;
    let bg, line, fg, sub;
    if (variant === 'doux') {
      if (theme === 'dark') {
        bg = oklchToHex({ L: 0.31, C: Math.min(C * 0.45, 0.07), h });
        line = oklchToHex({ L: 0.66, C: Math.min(C, 0.14), h });
        fg = oklchToHex({ L: 0.95, C: 0.015, h });
        sub = oklchToHex({ L: 0.82, C: Math.min(C * 0.5, 0.09), h });
      } else {
        bg = oklchToHex({ L: 0.955, C: Math.min(C * 0.4, 0.05), h });
        line = oklchToHex({ L: 0.62, C: Math.min(C, 0.15), h });
        fg = oklchToHex({ L: 0.24, C: Math.min(C * 0.3, 0.04), h });
        sub = oklchToHex({ L: 0.45, C: Math.min(C * 0.6, 0.11), h });
      }
    } else {
      // vif : la couleur choisie telle quelle (assombrie en thème sombre pour ne pas éblouir) ;
      // fort : aplat soutenu, garde le poids des ancres (Notion, Chapitre)
      let L = c.L;
      if (variant === 'fort') L = theme === 'dark' ? 0.76 : 0.45;
      else if (theme === 'dark') L = Math.min(L, 0.72);
      bg = variant === 'vif' && theme !== 'dark' ? hex : oklchToHex({ L, C: variant === 'fort' ? Math.min(C, 0.16) : C, h });
      const dark = '#141413', light = '#ffffff';
      fg = contrast(dark, bg) >= contrast(light, bg) ? dark : light;
      const bl = hexToOklch(bg);
      line = oklchToHex({ L: fg === dark ? Math.max(0, bl.L - 0.14) : Math.min(1, bl.L + 0.14), C: bl.C, h });
      sub = fg;
    }
    const f = ensureContrast(fg, bg, 4.5);
    const s2 = ensureContrast(sub, bg, 4.5);
    return { bg, fg: f.hex, line, sub: s2.hex, adjusted: f.adjusted || s2.adjusted };
  }
  const variantOf = (type, s) => (STRONG.has(type) ? 'fort' : s.intensity);

  /** Paires de types trop proches visuellement (mêmes fonds), pour prévenir l'utilisatrice */
  function closePairs(s = settings(), theme = currentTheme(), types = R.store.TYPE_ORDER) {
    const pal = palette(s);
    // en doux, c'est la bordure qui porte la couleur ; en vif, l'aplat
    const key = (d) => (s.intensity === 'vif' ? d.bg : d.line);
    const list = types.filter((t) => pal[t]).map((t) => ({ t, c: key(derive(pal[t], theme, variantOf(t, s))) }));
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (distance(list[i].c, list[j].c) < 0.05) out.push([list[i].t, list[j].t]);
      }
    }
    return out;
  }
  function currentTheme() {
    const t = R.store.data.settings.theme;
    return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  /** Feuille de style générée (thèmes clair + sombre) */
  function css(s = settings()) {
    const pal = palette(s);
    const rules = { light: [], dark: [] };
    for (const t of R.store.TYPE_ORDER) {
      if (!pal[t]) continue;
      for (const theme of ['light', 'dark']) {
        const d = derive(pal[t], theme, variantOf(t, s));
        // la forme du type (bordure double, pointillés, italique…) reste intacte : seules les teintes changent
        rules[theme].push(
          `.node.t-${t}{background:${d.bg};color:${d.fg}}`,
          `.node.t-${t}:not(.selected):not(.drop-target){border-color:${d.line}}`,
          `.node.t-${t} .node-top,.node.t-${t}.untitled .hl{color:${d.sub}}`,
        );
      }
    }
    if (!rules.light.length) return '';
    const scope = (theme, body) => body.map((r) => `${theme} ${r}`).join('');
    return scope(':root[data-colors]', rules.light) +
      `@media (prefers-color-scheme: dark){${scope(':root[data-colors]:not([data-theme="light"])', rules.dark)}}` +
      scope(':root[data-colors][data-theme="dark"]', rules.dark);
  }

  /** Applique le réglage à la page (une seule feuille, régénérée seulement si elle change) */
  let lastCss = null;
  function apply() {
    const s = settings();
    const sheet = s.mode === 'off' ? '' : css(s);
    if (sheet !== lastCss) {
      let el = document.getElementById('node-colors');
      if (!el) { el = document.createElement('style'); el.id = 'node-colors'; document.head.appendChild(el); }
      el.textContent = sheet;
      lastCss = sheet;
    }
    if (sheet) document.documentElement.dataset.colors = s.intensity;
    else delete document.documentElement.dataset.colors;
  }

  /** Change le réglage (garde le dernier mode actif pour le bouton « Couleurs » rapide) */
  function set(patch) {
    const cur = R.store.data.settings.colors || {};
    const next = { ...settings(), ...cur, ...patch };
    if (next.mode !== 'off') next.last = next.mode;
    R.store.data.settings.colors = { mode: next.mode, intensity: next.intensity, custom: { ...(next.custom || {}) }, ...(next.last ? { last: next.last } : {}) };
    R.store.changed('settings');
    apply();
  }
  function toggle() {
    const s = settings();
    set({ mode: s.mode === 'off' ? (s.last || 'familles') : 'off' });
  }

  /** Couleur de pastille (menu Type, légende) pour un type, ou null */
  function swatch(type) {
    const s = settings();
    const pal = palette(s);
    if (!pal[type]) return null;
    const d = derive(pal[type], currentTheme(), variantOf(type, s));
    return { bg: d.bg, line: d.line, fg: d.fg };
  }

  /* ---------------- Dialogue « Couleurs des nœuds » ---------------- */
  const MODES = [
    ['off', 'Aucune', 'Monochrome : les types se distinguent par la forme (réglage d’origine).'],
    ['familles', 'Familles', PRESETS.familles.text],
    ['daltonisme', 'Daltonisme', PRESETS.daltonisme.text],
    ['perso', 'Perso', 'Tes propres couleurs, type par type. Le texte s’ajuste tout seul pour rester lisible.'],
  ];
  function openDialog() {
    const { ui, U } = R;
    const { h } = U;
    const S = R.store;
    const body = h('div.cp');
    const segRow = (label, key, options, current, onPick) => {
      const seg = h('div.segmented.seg-sm.cp-seg', { role: 'radiogroup', 'aria-label': label });
      for (const [v, text] of options) {
        const b = h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(current === v) }, h('span', text));
        b.addEventListener('click', () => onPick(v));
        seg.appendChild(b);
      }
      ui.segIndicator(seg, key);
      return seg;
    };
    /** Passe en Perso en partant de ce qui est affiché (rien n'est perdu) */
    const toPerso = () => {
      const s = settings();
      if (s.mode === 'perso') return { ...s.custom };
      const base = palette(s);
      const custom = {};
      for (const t of S.TYPE_ORDER) if (base[t]) custom[t] = base[t];
      return custom;
    };
    const pick = (type, hex) => {
      const custom = toPerso();
      if (hex) custom[type] = hex; else delete custom[type];
      set({ mode: 'perso', custom });
      paint();
    };
    const preview = (t, s, pal) => {
      const T = S.TYPES[t];
      const el = h('span.cp-node', { class: 'cp-' + t }, h('span.cp-k', T.kicker || T.label), h('span.cp-t', T.label));
      if (pal[t]) {
        const d = derive(pal[t], currentTheme(), variantOf(t, s));
        el.style.background = d.bg; el.style.color = d.fg; el.style.borderColor = d.line;
        el.querySelector('.cp-k').style.color = d.sub;
        if (d.adjusted) el.title = 'Texte ajusté automatiquement pour rester lisible';
      }
      return el;
    };
    let pendingColor = null;
    function paint() {
      const s = settings();
      const pal = palette(s);
      U.clear(body);
      body.appendChild(h('div.cp-sec',
        h('p.cp-label', 'Couleurs'),
        segRow('Couleurs des nœuds', 'cp-mode', MODES.map(([v, l]) => [v, l]), s.mode, (v) => { set(v === 'perso' ? { mode: 'perso', custom: toPerso() } : { mode: v }); paint(); }),
        h('p.cp-help', MODES.find((m) => m[0] === s.mode)[2])));
      if (s.mode !== 'off') {
        body.appendChild(h('div.cp-sec',
          h('p.cp-label', 'Intensité'),
          segRow('Intensité', 'cp-int', [['doux', 'Douce'], ['vif', 'Vive']], s.intensity, (v) => { set({ intensity: v }); paint(); }),
          h('p.cp-help', s.intensity === 'vif' ? 'Aplats de la couleur choisie : repérage immédiat.' : 'Fonds pâles et bordures colorées : plus calme pour lire longtemps.')));
      }
      // types, par familles (le menu Type suit le même ordre)
      for (const g of S.TYPE_GROUPS) {
        const rows = g.types.map((t) => {
          const cur = pal[t];
          const sw = h('div.cp-swatches', { role: 'group', 'aria-label': 'Couleur : ' + S.TYPES[t].label },
            SWATCHES.map((c, i) => {
              const b = h('button.cp-sw', { type: 'button', 'aria-label': `Nuance ${i + 1}`, 'aria-pressed': String(cur === c), style: { background: c } });
              b.addEventListener('click', () => pick(t, c));
              return b;
            }));
          const input = h('input.cp-input', { type: 'color', value: cur || '#888888', 'aria-label': 'Autre couleur : ' + S.TYPES[t].label, title: 'Autre couleur…' });
          input.addEventListener('input', () => { pendingColor = [t, input.value]; });
          input.addEventListener('change', () => { pick(t, input.value); pendingColor = null; });
          const none = h('button.cp-none', { type: 'button', 'aria-pressed': String(!cur), title: 'Sans couleur (monochrome)', 'aria-label': 'Sans couleur' }, R.icon('close', 16));
          none.addEventListener('click', () => pick(t, null));
          sw.append(input, none);
          return h('div.cp-row', preview(t, s, pal), h('div.cp-pick', sw));
        });
        body.appendChild(h('div.cp-group', h('p.cp-label', g.label), ...rows));
      }
      if (s.mode === 'perso') {
        const pairs = closePairs(s);
        if (pairs.length) {
          body.appendChild(h('p.cp-warn', R.icon('eye', 16), h('span', 'Couleurs très proches : ' + pairs.slice(0, 4).map(([a, b]) => `${S.TYPES[a].label} · ${S.TYPES[b].label}`).join(' ; ') + (pairs.length > 4 ? '…' : '') + '. La forme les distingue encore, mais une autre nuance aiderait.')));
        }
      }
    }
    paint();
    // un nuancier natif ouvert : on applique quand il se ferme (change), ou à la fermeture du dialogue
    return ui.dialog({
      title: 'Couleurs des nœuds', icon: 'palette', body, cls: 'dialog-wide dialog-colors',
      actions: [
        { label: 'Revenir au monochrome', value: 'reset', variant: 'text' },
        { label: 'Terminé', value: true, variant: 'filled' },
      ],
    }).then((v) => {
      if (pendingColor) pick(...pendingColor);
      if (v === 'reset') { set({ mode: 'off' }); R.ui.snack('Couleurs désactivées — tes réglages Perso sont gardés', { action: 'Rétablir', onAction: () => toggle() }); }
    });
  }

  R.colors = {
    openDialog,
    PRESETS, SWATCHES, settings, palette, derive, css, apply, set, toggle, swatch, closePairs, currentTheme,
    contrast, distance, variantOf, hexToOklch, oklchToHex,
  };
})(window.R);
