/* Ratio — mini moteur Markdown pour les notes
   Prend en charge : titres, gras, italique, ==surligné==, ~~barré~~, `code`,
   listes (imbriquées, cases à cocher), citations, séparateurs, blocs de code,
   liens, tableaux (| a | b |), [[Lien vers un nœud]] et repérage automatique des articles
   (« art. 1128 »), qui renvoient à la recherche Légifrance. */
(function (R) {
  'use strict';
  const { U } = R;

  const ART_RE = /\b((?:art(?:icles?)?\.?|arts\.)\s?(?:[LRDA]\.?\s?)?\d{1,4}(?:[-–‑.]\d+)*(?:\s(?:bis|ter|quater|quinquies))?(?:\s(?:et|à)\s(?:[LRDA]\.?\s?)?\d{1,4}(?:[-–.]\d+)*)?)/gi;

  /** « art. L. 132-1 » → recherche Légifrance « article L132-1 » */
  function legifrance(ref) {
    const q = ref.replace(/^(art(?:icles?)?\.?|arts\.)\s?/i, 'article ').replace(/\b([LRDA])\.?\s?(?=\d)/g, '$1').replace(/\s+/g, ' ').trim();
    return 'https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=' + encodeURIComponent(q);
  }

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
    if (!opts || opts.articles !== false) {
      s = s.replace(ART_RE, (m) => `<a class="md-art" href="${legifrance(m.replace(/&[a-z#0-9]+;/gi, ' '))}" target="_blank" rel="noopener" title="Chercher sur Légifrance">${m}</a>`);
    }
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

  /* ---- Tableaux (syntaxe GFM : en-têtes, ligne |---|:--:|, lignes) ---- */
  const TABLE_ROW = /^\s*\|.*\|\s*$/;
  const TABLE_SEP = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
  const isTableAt = (lines, i) => TABLE_ROW.test(lines[i] || '') && TABLE_SEP.test(lines[i + 1] || '');
  /** Découpe une ligne « | a | b \| c | » en cellules (\| = barre littérale) */
  function cells(line) {
    const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = [];
    let cur = '';
    for (let k = 0; k < t.length; k++) {
      if (t[k] === '\\' && t[k + 1] === '|') { cur += '|'; k++; continue; }
      if (t[k] === '|') { out.push(cur.trim()); cur = ''; continue; }
      cur += t[k];
    }
    out.push(cur.trim());
    return out;
  }
  /** Tableaux d'une note : [{start, end (exclu), rows: [[…]], align: ['left'|'center'|'right'|'']}] */
  function tables(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let fence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^```/.test(lines[i])) { fence = !fence; continue; }
      if (fence || !isTableAt(lines, i)) continue;
      const start = i;
      const head = cells(lines[i]);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
      const rows = [head];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      const w = Math.max(...rows.map((r) => r.length));
      for (const r of rows) while (r.length < w) r.push('');
      while (align.length < w) align.push('');
      out.push({ start, end: i, rows, align: align.slice(0, w) });
      i--;
    }
    return out;
  }
  /** Sérialise un tableau en Markdown (colonnes alignées pour rester lisible en mode Écrire) */
  function tableToMd(rows, align = []) {
    const w = Math.max(1, ...rows.map((r) => r.length));
    const esc = (c) => String(c || '').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
    const grid = rows.map((r) => Array.from({ length: w }, (_, k) => esc(r[k])));
    const width = Array.from({ length: w }, (_, k) => Math.max(3, ...grid.map((r) => r[k].length)));
    const line = (r) => '| ' + r.map((c, k) => c.padEnd(width[k])).join(' | ') + ' |';
    const sep = '| ' + width.map((n, k) => {
      const a = align[k];
      return a === 'center' ? ':' + '-'.repeat(n - 2) + ':' : a === 'right' ? '-'.repeat(n - 1) + ':' : a === 'left' ? ':' + '-'.repeat(n - 1) : '-'.repeat(n);
    }).join(' | ') + ' |';
    return [line(grid[0]), sep, ...grid.slice(1).map(line)].join('\n');
  }
  function tableHtml(t, idx) {
    const al = (k) => (t.align[k] ? ` style="text-align:${t.align[k]}"` : '');
    const head = t.rows[0].map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('');
    const body = t.rows.slice(1).map((r) => '<tr>' + r.map((c, k) => `<td${al(k)}>${inline(c)}</td>`).join('') + '</tr>').join('');
    return `<div class="md-table"${idx != null ? ` data-table="${idx}"` : ''}><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /** Lignes de tableau (sans la ligne de séparation) */
  function readTable(lines, i) {
    const t = { rows: [cells(lines[i])], align: [] };
    t.align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
    i += 2;
    while (i < lines.length && TABLE_ROW.test(lines[i])) t.rows.push(cells(lines[i++]));
    const w = Math.max(...t.rows.map((r) => r.length));
    for (const r of t.rows) while (r.length < w) r.push('');
    return { t, i };
  }

  function render(src, ctx) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    // seuls les tableaux du premier niveau sont numérotés (édition depuis l'aperçu)
    const top = !ctx;
    let tableIdx = 0;
    let out = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (isTableAt(lines, i)) {
        const r = readTable(lines, i);
        out += tableHtml(r.t, top ? tableIdx : null);
        tableIdx++;
        i = r.i;
        continue;
      }

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
        out += `<blockquote>${render(buf.join('\n'), { nested: true })}</blockquote>`;
        continue;
      }
      if (/^\s*([-*+•]|\d+[.)])\s+/.test(line)) {
        const indent = line.match(/^\s*/)[0].length;
        const r = parseList(lines, i, indent);
        out += r.html; i = r.i;
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isTableAt(lines, i) && !/^(#{1,3}\s|```|\s*>|\s*([-*+•]|\d+[.)])\s+|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])) buf.push(lines[i++]);
      out += `<p>${buf.map((l) => inline(l)).join('<br>')}</p>`;
    }
    return out;
  }

  /** Texte brut (pour extraits de recherche, plan) */
  function plain(src) {
    return String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/^[ \t]*\|([ \t]*:?-+:?[ \t]*\|)+[ \t]*$/gm, ' ')
      .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, r) => r.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')).filter(Boolean).join(' · ') + ' ·')
      .replace(/^\s*([-*+•]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '• ')
      .replace(/\*\*|__|==|~~|`/g, '')
      .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Sources d'une note : liens [titre](url) et adresses nues, sans doublon */
  function links(src) {
    const s = String(src || '').replace(/```[\s\S]*?```/g, ' ');
    const out = [];
    const seen = new Set();
    const add = (title, url) => {
      url = url.replace(/[.,;:!?)]+$/, '');
      if (seen.has(url)) return;
      seen.add(url);
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return; }
      out.push({ title: title || host, url, host });
    };
    s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => { add(t.trim(), u); return ' '; })
      .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_, p, u) => { add('', u); return ' '; });
    return out;
  }

  R.md = { render, inline, plain, tables, tableToMd, links, legifrance };
})(window.R);
