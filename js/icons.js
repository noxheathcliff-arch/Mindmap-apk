/* Ratio — jeu d'icônes SVG (trait 1.75, grille 24) */
(function (R) {
  'use strict';

  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    library: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M9 4h4v16H9z"/><path d="M15.2 4.9l3.4-.9 3 14.6-3.4.9z"/>',
    cards: '<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M7.5 7V5.5A1.5 1.5 0 0 1 9 4h10a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 17h-2.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A.5.5 0 0 1 9.5 4h5a.5.5 0 0 1 .5.5V7"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    note: '<path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5h4.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5"/>',
    zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/>',
    fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    tidy: '<rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="3.5" width="5" height="5" rx="1.2"/><rect x="16" y="15.5" width="5" height="5" rx="1.2"/><path d="M8 12h3.5M11.5 6v12M11.5 6H16M11.5 18H16"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    map: '<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="4.5" cy="18" r="1.8"/><circle cx="19.5" cy="18" r="1.8"/><path d="M6 7l4 3.5M18 7l-4 3.5M6 17l4-3.5M18 17l-4-3.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.5"/>',
    outline: '<path d="M4 5h16M8 10h12M8 15h12M12 20h8"/><path d="M4 10v10" />',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    flame: '<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.7-2.8-5.7-3.8-9.2-.3-1-1.6-1.2-2.1-.3-.7 1.3-.6 2.8-1.8 3.9-.5-1-1.1-1.4-1.7-1.6-.6-.2-1.2.3-1.2.9C7.9 11 5.5 12.3 5.5 15c0 3.6 2.5 6 6.5 6z"/>',
    play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.8l10-6.5a1 1 0 0 0 0-1.6l-10-6.5A1 1 0 0 0 8 5.5z"/>',
    collapse: '<path d="M7 15l5-5 5 5"/>',
    expand: '<path d="M7 9l5 5 5-5"/>',
    child: '<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/><path d="M7 10v4.5a2 2 0 0 0 2 2h4"/>',
    sibling: '<rect x="3" y="3.5" width="9" height="6" rx="1.5"/><rect x="3" y="14.5" width="9" height="6" rx="1.5"/><path d="M16 12h5M18.5 9.5v5"/>',
    type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    logic: '<circle cx="8.5" cy="12" r="5"/><circle cx="15.5" cy="12" r="5"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 4M12 17.5h.01"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    sparkle: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.7L12 17l-1.8-5.3L5 10l5.2-1.6z"/><path d="M19 16l.7 2 2 .7-2 .6-.7 2-.6-2-2-.6 2-.7z"/>',
    pan: '<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    highlight: '<path d="M9 15l-4.5 4.5H9l1.5-1.5"/><path d="M8.5 13.5L15 4.5l4.5 4.5-9 6.5z"/><path d="M8.5 13.5l2 2"/>',
    quote: '<path d="M5 18c2.5-1 4-3 4-6V7H4.5v5H8M15 18c2.5-1 4-3 4-6V7h-4.5v5H18"/>',
    bullet: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.75" cy="7" r=".9"/><circle cx="4.75" cy="12" r=".9"/><circle cx="4.75" cy="17" r=".9"/>',
    heading: '<path d="M6 5v14M16 5v14M6 12h10"/>',
    pin: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
    dot: '<circle cx="12" cy="12" r="3" />',
    fork: '<path d="M3 12h6"/><path d="M9 12c3 0 4.5-6 10-6M9 12c3 0 4.5 6 10 6M9 12h10"/><circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
    swap: '<path d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9l-.4-1c-.5-1.2.4-2.4 1.6-2.4h1.9a4 4 0 0 0 4-4C20.5 6.9 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"/>',
  };

  /** Renvoie un <svg> prêt à insérer */
  R.icon = function (name, size = 24, cls = '') {
    const wrap = document.createElement('span');
    wrap.className = 'ic' + (cls ? ' ' + cls : '');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.dot}</svg>`;
    return wrap;
  };

  R.iconHTML = (name, size = 24) =>
    `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.dot}</svg></span>`;
})(window.R);
