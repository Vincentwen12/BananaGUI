const PATHS = {
  banana: [
    '<path d="M4.8 14.4c-.1 3.4 3.2 5.6 7.7 4.2 5.9-1.8 8.8-6.9 8.1-12.1-.1-1-.5-2-1.1-2.8-.7 2.9-2.6 5.3-5.5 6.8-3.1 1.6-5.5 3.8-6.8 6.3-.7 1.3-1.1 2.4-1.2 3.3Z" />',
    '<path d="M8.1 5.2c1-.9 2.3-1.3 3.7-1" />',
  ],
  plus: ['<path d="M12 5v14M5 12h14" />'],
  upload: ['<path d="M12 16V4m0 0 4 4m-4-4-4 4" />', '<path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />'],
  download: ['<path d="M12 4v12m0 0 4-4m-4 4-4-4" />', '<path d="M5 19h14" />'],
  puzzle: [
    '<path d="M9 4h3a2 2 0 0 1 2 2v1.2a1.8 1.8 0 1 0 3.6 0V7a2 2 0 0 1 2-2H20v5h-1.4a1.8 1.8 0 1 0 0 3.6H20v4h-4.4v-1.2a1.8 1.8 0 1 0-3.6 0V19H8a2 2 0 0 1-2-2v-3H4.8a1.8 1.8 0 1 1 0-3.6H6V6a2 2 0 0 1 2-2Z" />',
  ],
  clock: ['<circle cx="12" cy="12" r="8" />', '<path d="M12 8v4.2l2.8 1.8" />'],
  grid: [
    '<rect x="4" y="4" width="6" height="6" rx="1" />',
    '<rect x="14" y="4" width="6" height="6" rx="1" />',
    '<rect x="4" y="14" width="6" height="6" rx="1" />',
    '<rect x="14" y="14" width="6" height="6" rx="1" />',
  ],
  ellipsis: ['<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />', '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />', '<circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />'],
  search: ['<circle cx="11" cy="11" r="6" />', '<path d="m16 16 4 4" />'],
  filter: ['<path d="M4 6h16M7 12h10M10 18h4" />'],
  folder: ['<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" />'],
  'folder-plus': ['<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" />', '<path d="M12 11v6M9 14h6" />'],
  'chevron-right': ['<path d="m9 6 6 6-6 6" />'],
  'chevron-down': ['<path d="m6 9 6 6 6-6" />'],
  'chevron-up': ['<path d="m6 15 6-6 6 6" />'],
  panel: ['<rect x="4" y="4" width="16" height="16" rx="2" />', '<path d="M15 4v16" />'],
  sidebar: ['<rect x="3.5" y="4.5" width="17" height="15" rx="2" />', '<path d="M9 4.5v15" />'],
  settings: ['<circle cx="12" cy="12" r="3" />', '<path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />'],
  'arrow-up': ['<path d="M12 19V5m0 0-6 6m6-6 6 6" />'],
  stop: ['<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />'],
  paperclip: ['<path d="m8.5 12.5 5.7-5.7a3 3 0 0 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7-7" />'],
  shield: ['<path d="M12 3.5 19 6v5.5c0 4.5-3 7.3-7 9-4-1.7-7-4.5-7-9V6l7-2.5Z" />'],
  spark: ['<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />', '<path d="M19 16.5 19.7 18l1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />'],
  close: ['<path d="M6 6l12 12M18 6 6 18" />'],
  check: ['<path d="m5 12.5 4.5 4.5L19 7" />'],
  x: ['<path d="M6 6l12 12M18 6 6 18" />'],
  spinner: ['<path d="M12 4a8 8 0 1 1-6.3 3.1" />'],
  file: ['<path d="M6 3.5h8l4 4v13H6v-17Z" />', '<path d="M14 3.5v4h4" />'],
  image: ['<rect x="3.5" y="4.5" width="17" height="15" rx="2" />', '<circle cx="9" cy="10" r="1.6" />', '<path d="m4 17 5-5 4 4 2.5-2.5 3.5 3.5" />'],
  keyboard: ['<rect x="3" y="6" width="18" height="12" rx="2" />', '<path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15h8" />'],
  'file-text': ['<path d="M6 3.5h8l4 4v13H6v-17Z" />', '<path d="M14 3.5v4h4M9 12h6M9 15.5h6" />'],
  code: ['<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />'],
  terminal: ['<rect x="3.5" y="4.5" width="17" height="15" rx="2" />', '<path d="m7 9 3 3-3 3M13 15h4" />'],
  layer: ['<path d="m12 3 9 5-9 5-9-5 9-5Z" />', '<path d="m3 12 9 5 9-5M3 16l9 5 9-5" />'],
  info: ['<circle cx="12" cy="12" r="8.5" />', '<path d="M12 11v5M12 8h.01" />'],
  edit: ['<path d="M4 20h4l11-11-4-4L4 16v4Z" />', '<path d="m13.5 6.5 4 4" />'],
  trash: ['<path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5" />'],
  undo: ['<path d="M9 7 4 12l5 5" />', '<path d="M4 12h9a6 6 0 0 1 6 6v1" />'],
  refresh: ['<path d="M20 11a8 8 0 1 0-2.3 6.7" />', '<path d="M20 4v7h-7" />'],
  key: ['<circle cx="8" cy="12" r="3.5" />', '<path d="M11.5 12H21M17 12v3M14 12v2" />'],
  globe: ['<circle cx="12" cy="12" r="8.5" />', '<path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.2 3.4 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.6 8.7 8.6 12s1.2 6.2 3.4 8.5" />'],
  sun: ['<circle cx="12" cy="12" r="4" />', '<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />'],
  moon: ['<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />'],
  monitor: ['<rect x="3.5" y="4.5" width="17" height="12" rx="2" />', '<path d="M9 20h6M12 16.5V20" />'],
  warning: ['<path d="M12 4 21 20H3L12 4Z" />', '<path d="M12 9v5M12 17h.01" />'],
  message: ['<path d="M4 5.5h16v11H9l-5 4v-15Z" />'],
  command: ['<path d="M9 6a2.5 2.5 0 1 0-2.5 2.5H18A2.5 2.5 0 1 0 15.5 11v2A2.5 2.5 0 1 0 18 15.5H6.5A2.5 2.5 0 1 0 9 18v-2" />'],
  at: ['<circle cx="12" cy="12" r="3.5" />', '<path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" />'],
  'check-circle': ['<circle cx="12" cy="12" r="8.5" />', '<path d="m8 12 2.7 2.7L16.5 9" />'],
  'x-circle': ['<circle cx="12" cy="12" r="8.5" />', '<path d="m9 9 6 6M15 9l-6 6" />'],
  minimize: ['<path d="M5 12h14" />'],
  maximize: ['<rect x="5" y="5" width="14" height="14" rx="1" />'],
  copy: ['<rect x="8" y="8" width="11" height="11" rx="1.5" />', '<path d="M16 8V5H5v11h3" />'],
  external: ['<path d="M14 4h6v6M20 4l-9 9" />', '<path d="M18 14v5H5V6h5" />'],
  play: ['<path d="m8 5 11 7-11 7V5Z" />'],
  history: ['<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />', '<path d="M4 4v4.6h4.6M12 8v4.5l3 1.7" />'],
  user: ['<circle cx="12" cy="8" r="3.5" />', '<path d="M5 20a7 7 0 0 1 14 0" />'],
  brain: ['<path d="M9 5.5A3 3 0 0 0 6.5 8.5 3.5 3.5 0 0 0 5 15a3.5 3.5 0 0 0 4 5.2V20h1.5V5.5H9Z" />', '<path d="M15 5.5A3 3 0 0 1 17.5 8.5 3.5 3.5 0 0 1 19 15a3.5 3.5 0 0 1-4 5.2V20h-1.5V5.5H15Z" />'],
  circle: ['<circle cx="12" cy="12" r="3" />'],
  'circle-check': ['<circle cx="12" cy="12" r="8.5" />', '<path d="m8 12 2.7 2.7L16.5 9" />'],
  'circle-half': ['<circle cx="12" cy="12" r="8.5" />', '<path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />'],
  'more-horizontal': ['<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />', '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />', '<circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />'],
  'folder-open': ['<path d="M3.5 8V6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V9" />', '<path d="M3.5 9h17l-2 9h-13l-2-9Z" />'],
  send: ['<path d="M4 12 20 4l-4 16-5-6-7-2Z" />'],
  'arrow-down': ['<path d="M12 5v14m0 0-6-6m6 6 6-6" />'],
  'refresh-cw': ['<path d="M20 11a8 8 0 1 0-2.3 6.7" />', '<path d="M20 4v7h-7" />'],
  slash: ['<path d="M15 4 9 20" />'],
  play_arrow: ['<path d="m8 5 11 7-11 7V5Z" />'],
};

export function icon(name, className = '') {
  const paths = PATHS[name] ?? PATHS.circle;
  const cls = className ? ` ${className}` : '';
  return `<svg class="icon${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.join('')}</svg>`;
}

export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const name = el.getAttribute('data-icon');
    if (!name) continue;
    el.innerHTML = icon(name);
  }
}

export function setIcon(el, name) {
  if (el) el.innerHTML = icon(name);
}
