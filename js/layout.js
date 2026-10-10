/* Ratio — mise en page automatique (arbre horizontal « bien rangé »)
   Loi de Tesler : c'est l'application qui absorbe la complexité de la disposition. */
(function (R) {
  'use strict';

  const GAP_X = 96;   // entre un parent et ses enfants
  const GAP_Y = 16;   // entre deux frères
  const GAP_ROOT = 64;

  /** Gabarits typographiques par type (largeur moyenne d'un caractère, marges, interligne) —
      reflètent editor.css ; les nœuds de structure sont plus grands (hiérarchie visuelle). */
  const METRICS = {
    chapitre: { cw: 12.2, pad: 48, lh: 32, base: 36, min: 200, max: 340, bar: 10 },
    lecon:    { cw: 10.6, pad: 41, lh: 28, base: 31, min: 160, max: 320, bar: 10 },
    section:  { cw: 8.6,  pad: 35, lh: 22, base: 25, min: 120, max: 280, bar: 10 },
    notion:   { cw: 8.4,  pad: 43, lh: 24, base: 27, min: 64,  max: 260, bar: 0 },
  };
  const BASE = { cw: 7.4, pad: 31, lh: 20, base: 22, min: 64, max: 260, bar: 0 };

  /** Estimation de taille hors DOM (seed, import) */
  function estimate(n) {
    const M = METRICS[n.type] || BASE;
    const len = (n.title || 'Sans titre').length;
    const w = Math.min(M.max, Math.max(M.min, len * M.cw + M.pad));
    const perLine = Math.max(8, Math.floor((w - M.pad) / M.cw));
    const lines = Math.max(1, Math.ceil(len / perLine));
    const top = (R.store.TYPES[n.type].kicker || n.note || n.review.rating) ? 18 : 0;
    const h = M.base + top + lines * M.lh + M.bar;
    return { w, h };
  }

  /**
   * Calcule les positions cibles {id: {x, y}} sans muter la carte.
   * size(node) → {w, h}
   */
  function tidy(map, size = estimate) {
    const S = R.store;
    const out = {};
    const sizes = {};
    for (const n of map.nodes) sizes[n.id] = size(n);

    const kids = (id) => {
      const n = S.node(map, id);
      return n && n.collapsed ? [] : S.childrenOf(map, id);
    };

    const heightOf = {};
    const visiting = new Set();
    function measure(id) {
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const ch = kids(id);
      const own = sizes[id].h;
      let sum = 0;
      ch.forEach((c, i) => { sum += measure(c.id) + (i ? GAP_Y : 0); });
      visiting.delete(id);
      heightOf[id] = Math.max(own, sum);
      return heightOf[id];
    }

    function place(id, x, top) {
      const ch = kids(id);
      const blockH = heightOf[id];
      const own = sizes[id];
      out[id] = { x, y: top + blockH / 2 - own.h / 2 };
      let cy = top + (blockH - ch.reduce((s, c, i) => s + heightOf[c.id] + (i ? GAP_Y : 0), 0)) / 2;
      // aligne les enfants sur une même colonne : bord gauche = bord droit du parent + GAP
      for (const c of ch) {
        if (out[c.id]) continue;
        place(c.id, x + own.w + GAP_X, cy);
        cy += heightOf[c.id] + GAP_Y;
      }
    }

    const roots = S.roots(map);
    if (!roots.length) return out;
    const anchor = roots[0];
    let top = 0;
    for (const r of roots) {
      measure(r.id);
      place(r.id, 0, top);
      top += heightOf[r.id] + GAP_ROOT;
    }
    // conserve la position de la première racine (pas de saut de caméra)
    const dx = anchor.x - out[anchor.id].x;
    const dy = anchor.y - out[anchor.id].y;
    for (const id in out) { out[id].x = Math.round(out[id].x + dx); out[id].y = Math.round(out[id].y + dy); }
    return out;
  }

  /** Position d'un nouvel enfant : sous le dernier enfant existant */
  function childSlot(map, parent, size = estimate) {
    const S = R.store;
    const ch = S.childrenOf(map, parent.id);
    const ps = size(parent);
    if (!ch.length) return { x: parent.x + ps.w + GAP_X, y: parent.y + ps.h / 2 - 22 };
    const last = ch[ch.length - 1];
    const ls = size(last);
    return { x: last.x, y: last.y + ls.h + GAP_Y };
  }

  R.layout = { tidy, estimate, childSlot, GAP_X, GAP_Y };
})(window.R);
