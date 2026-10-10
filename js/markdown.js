/* Ratio — mini moteur Markdown pour les notes
   Prend en charge : titres, gras, italique, ==surligné==, ~~barré~~, `code`,
   listes (imbriquées, cases à cocher), citations, séparateurs, blocs de code,
   liens, [[Lien vers un nœud]] et repérage automatique des articles (« art. 1128 »). */
(function (R) {
  'use strict';
  const { U } = R;

  const ART_RE = /\b((?:art(?:icles?)?\.?|arts\.)\s?(?:[LRDA]\.?\s?)?\d{1,4}(?:[-–‑.]\d+)*(?:\s(?:bis|ter|quater|quinquies))?(?:\s(?:et|à)\s(?:[LRDA]\.?\s?)?\d{1,4}(?:[-–.]\d+)*)?)/gi;

  function inline(src, opts) {
    let s = U.esc(src);
    const slots = [];
    const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;

    s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => keep(`<a href="#" class="md-wiki" data-wiki="${t}">${t}</a>`));
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => keep(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_, p, u) => p + keep(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`));
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    if (!opts || opts.articles !== false) s = s.replace(ART_RE, '<span class="md-art">$1</span>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
    return s;
  }

  function parseList(lines, i, baseIndent) {
    const first = lines[i].match(/^(\s*)([-*+•]|\d+[.)])\s+/);
    const ordered = /\d/.test(first[2]);
    let html = ordered ? '<ol>' : '<ul>';
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
      if (!m) {
        if (/^\s+\S/.test(line) && html.endsWith('</li>')) { // continuation
          html = html.slice(0, -5) + '<br>' + inline(line.trim()) + '</li>';
          i++; continue;
        }
        break;
      }
      const indent = m[1].replace(/\t/g, '  ').length;
      if (indent < baseIndent) break;
      if (indent === baseIndent && /\d/.test(m[2]) !== ordered) break; // changement de type de liste
      if (indent > baseIndent) {
        const sub = parseList(lines, i, indent);
        html = html.endsWith('</li>') ? html.slice(0, -5) + sub.html + '</li>' : html + sub.html;
        i = sub.i;
        continue;
      }
      let text = m[3];
      let cls = '';
      const task = text.match(/^\[( |x|X)\]\s+(.*)$/);
      if (task) {
        const done = task[1] !== ' ';
        cls = ` class="md-task${done ? ' done' : ''}"`;
        text = task[2];
      }
      html += `<li${cls}>${inline(text)}</li>`;
      i++;
    }
    html += ordered ? '</ol>' : '</ul>';
    return { html, i };
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let out = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out += `<pre><code>${U.esc(buf.join('\n'))}</code></pre>`;
        continue;
      }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { const l = h[1].length + 2; out += `<h${l}>${inline(h[2])}</h${l}>`; i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out += '<hr>'; i++; continue; }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out += `<blockquote>${render(buf.join('\n'))}</blockquote>`;
        continue;
      }
      if (/^\s*([-*+•]|\d+[.)])\s+/.test(line)) {
        const indent = line.match(/^\s*/)[0].length;
        const r = parseList(lines, i, indent);
        out += r.html; i = r.i;
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*>|\s*([-*+•]|\d+[.)])\s+|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])) buf.push(lines[i++]);
      out += `<p>${buf.map((l) => inline(l)).join('<br>')}</p>`;
    }
    return out;
  }

  /** Texte brut (pour extraits de recherche, plan) */
  function plain(src) {
    return String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*([-*+•]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '• ')
      .replace(/\*\*|__|==|~~|`/g, '')
      .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  R.md = { render, inline, plain };
})(window.R);
