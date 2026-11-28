const paths: Record<string, string> = {
  leaf: '<path d="M5 14c1-6 6-10 14-10 0 8-4 13-10 13"/><path d="M5 21c3-6 7-9 12-11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  sliders: '<path d="M4 8h8M16 8h4M4 16h4M12 16h8"/><circle cx="14" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
  folder: '<path d="M4 6.5h5.5L12 9h8v10.5H4z"/>',
  folderOpen: '<path d="M4 6.5h5.5L12 9h8v2H4z"/><path d="M4 11h18l-1.5 9H5.5z"/>',
  terminal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l2.5 2L7 14M12.5 14.5H16"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  check: '<path d="M4.5 12.5l4.5 4.5L19.5 6.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/>',
  clip: '<path d="M8 12.5l6.4-6.4a3 3 0 1 1 4.2 4.2l-7.7 7.7a5 5 0 0 1-7.1-7.1l7.7-7.7"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.6A3 3 0 0 0 7 18a3 3 0 0 0 2 2.5M9 4.5V21M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.6A3 3 0 0 1 17 18a3 3 0 0 1-2 2.5M15 4.5V21"/>',
  shield: '<path d="M12 3.5l7 2.5V12c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6z"/>',
  plugin: '<path d="M9 4.5a1.5 1.5 0 0 1 3 0V6h3.5A1.5 1.5 0 0 1 17 7.5V11h1.5a1.5 1.5 0 0 1 0 3H17v3.5a1.5 1.5 0 0 1-1.5 1.5H12v-1.5a1.5 1.5 0 0 0-3 0V19H5.5A1.5 1.5 0 0 1 4 17.5V14h1.5a1.5 1.5 0 0 0 0-3H4V7.5A1.5 1.5 0 0 1 5.5 6H9z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6.5M20 5v6h-6"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 0 12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.4 3.5 5.2 3.5 8s-1 5.6-3.5 8c-2.5-2.4-3.5-5.2-3.5-8S9.5 6.4 12 4z"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  message: '<path d="M4 5h16v11H9l-4 4z"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4 2v-8z"/>',
};

export function Icon(props: { name: string; size?: number; class?: string }) {
  const size = () => props.size ?? 16;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      width={size()}
      height={size()}
      aria-hidden="true"
      innerHTML={paths[props.name] ?? paths.leaf}
    />
  );
}
