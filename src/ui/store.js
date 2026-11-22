import { getLanguage, setLanguage } from './i18n.js';
import { applyTheme, getTheme } from './theme.js';

const listeners = new Set();

export const store = {
  info: null,
  sessions: [],
  session: null,
  agentDoc: '',
  running: false,
  activeTurn: null,
  connection: 'connecting',
  stream: { text: '', reasoning: '', tools: new Map(), startedAt: 0 },
  approvals: [],
  trust: null,
  images: [],
  draft: '',
  theme: getTheme(),
  language: getLanguage(),
  panels: { sidebar: true, right: false, tab: 'tasks', terminal: false },
  filters: { query: '', mode: 'all', workspace: '' },
  search: { query: '', open: false },
  usage: null,
  verification: null,
  review: null,
  pendingPlan: null,
  lastError: null,
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(store, patch);
  for (const listener of listeners) listener(store);
}

export function update(mutator) {
  mutator(store);
  for (const listener of listeners) listener(store);
}

export function setTheme(mode) {
  applyTheme(mode);
  setState({ theme: mode });
}

export function setLang(language) {
  setLanguage(language);
  setState({ language });
}

export function workspaces() {
  const map = new Map();
  const active = store.session?.workspace || store.info?.workspace || '';
  if (active) map.set(active, []);
  for (const session of store.sessions) {
    const workspace = session.workspace || active || '';
    if (!map.has(workspace)) map.set(workspace, []);
    map.get(workspace).push(session);
  }
  if (!map.size) map.set('', []);
  return [...map.entries()].map(([workspace, sessions]) => ({
    workspace,
    label: workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() || workspace : '未分组',
    sessions: sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
  }));
}

export function activeWorkspace() {
  return store.session?.workspace || store.info?.workspace || '';
}

export function isImageDataUrl(value) {
  return /^data:image\/(png|jpeg|gif|webp);base64,/.test(String(value));
}
