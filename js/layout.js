/* Ratio — mise en page automatique (arbre horizontal « bien rangé »)
   Loi de Tesler : c'est l'application qui absorbe la complexité de la disposition. */
(function (R) {
  'use strict';

  const GAP_X = 96;   // entre un parent et ses enfants
  const GAP_Y = 16;   // entre deux frères
  const GAP_ROOT = 64;

  /** Estimation de taille hors DOM (seed, import) */
  function estimate(n) {
    const len = (n.title || 'Sans titre').length;
    const notion = n.type === 'notion';
    const cw = notion ? 8.4 : 7.4;
    const pad = notion ? 43 : 31;
    const w = Math.min(260, Math.max(64, len * cw + pad));
    const perLine = Math.max(8, Math.floor((w - pad) / cw));
    const lines = Math.max(1, Math.ceil(len / perLine));
    const top = (R.store.TYPES[n.type].kicker || n.note || n.review.rating) ? 18 : 0;
    const h = (notion ? 27 : 22) + top + lines * (notion ? 24 : 20);
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
