export const THEME_KEY = 'banana-theme';

export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // 忽略存储错误
  }
  return 'dark';
}

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
    root.setAttribute('data-theme-source', 'system');
  } else {
    root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
    root.removeAttribute('data-theme-source');
  }
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // 忽略存储错误
  }
  window.dispatchEvent(new CustomEvent('banana-theme', { detail: { mode } }));
}

export const THEME_LABEL = {
  dark: '深色',
  light: '浅色',
  system: '跟随系统',
};
