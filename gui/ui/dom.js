export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function create(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function clear(element) {
  if (element) element.replaceChildren();
}

export function on(element, type, handler, options) {
  if (!element) return () => {};
  element.addEventListener(type, handler, options);
  return () => element.removeEventListener(type, handler, options);
}

export function debounce(fn, delay = 120) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, delay = 60) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, delay - (now - last));
    }
  };
}

export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(then).toLocaleDateString();
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 1000) return String(value);
  if (value < 1000000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
  return `${(value / 1000000).toFixed(1)}M`;
}

export function formatCost(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 0.0001) return `≈$${value.toFixed(6)}`;
  if (value < 0.01) return `≈$${value.toFixed(4)}`;
  if (value < 1) return `≈$${value.toFixed(3)}`;
  return `≈$${value.toFixed(2)}`;
}

export function shortPath(path) {
  if (!path) return '';
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function isMobile() {
  return window.matchMedia('(max-width: 860px)').matches;
}
