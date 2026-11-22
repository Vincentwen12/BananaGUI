const API_BASE = '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  let data = null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message = data?.error?.message || `请求失败（${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  sessions: () => request('/api/sessions'),
  session: (id) => request(`/api/sessions/${encodeURIComponent(id)}`),
  createSession: (payload = {}) => request('/api/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  patchSession: (id, payload) =>
    request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSession: (id) => request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  activate: (id) =>
    request('/api/sessions/activate', { method: 'POST', body: JSON.stringify({ id }) }),
  clearSession: () => request('/api/session/clear', { method: 'POST', body: '{}' }),
  importSession: (session) =>
    request('/api/sessions/import', { method: 'POST', body: JSON.stringify({ session }) }),
  exportUrl: (id, format) => `/api/sessions/${encodeURIComponent(id)}/export?format=${format}`,
  settings: (patch) => request('/api/settings', { method: 'POST', body: JSON.stringify(patch) }),
  testConnection: (name) =>
    request('/api/settings/test', { method: 'POST', body: JSON.stringify({ name }) }),
  workspace: (path, sessionId) =>
    request('/api/workspace', { method: 'POST', body: JSON.stringify({ path, sessionId }) }),
  trust: () => request('/api/trust', { method: 'POST', body: '{}' }),
  toggleTool: (name, enabled) =>
    request('/api/tools/toggle', { method: 'POST', body: JSON.stringify({ name, enabled }) }),
  addPlugin: (path) =>
    request('/api/plugins/add', { method: 'POST', body: JSON.stringify({ path }) }),
  approvePlan: () => request('/api/plan/approve', { method: 'POST', body: '{}' }),
  cancelPlan: () => request('/api/plan/cancel', { method: 'POST', body: '{}' }),
  mode: (mode) => request('/api/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  phase: (phase) => request('/api/phase', { method: 'POST', body: JSON.stringify({ phase }) }),
  undo: () => request('/api/undo', { method: 'POST', body: '{}' }),
  verify: () => request('/api/verify', { method: 'POST', body: '{}' }),
  compact: () => request('/api/compact', { method: 'POST', body: '{}' }),
  review: () => request('/api/review', { method: 'POST', body: '{}' }),
  files: (q, limit = 80) =>
    request(`/api/files?q=${encodeURIComponent(q)}&limit=${limit}`),
  tree: (path = '') => request(`/api/file/tree?path=${encodeURIComponent(path)}`),
  file: (path) => request(`/api/file?path=${encodeURIComponent(path)}`),
};

export function connectSocket(handlers = {}) {
  let socket = null;
  let closed = false;
  let retry = 0;
  let timer = null;
  let queue = [];

  const setStatus = (status, detail) => handlers.onStatus?.(status, detail);

  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    const delay = Math.min(10000, 600 * 2 ** retry);
    retry += 1;
    setStatus('reconnecting', delay);
    timer = setTimeout(open, delay);
  };

  const open = () => {
    if (closed) return;
    try {
      socket = new WebSocket(`ws://${location.host}/ws`);
    } catch {
      schedule();
      return;
    }
    socket.addEventListener('open', () => {
      retry = 0;
      setStatus('online');
      for (const payload of queue) socket.send(payload);
      queue = [];
      handlers.onOpen?.();
    });
    socket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handlers.onEvent?.(data);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      setStatus('offline');
      handlers.onClose?.();
      schedule();
    });
    socket.addEventListener('error', () => {
      try {
        socket.close();
      } catch {
        // 忽略
      }
    });
  };

  const send = (payload) => {
    const text = JSON.stringify(payload);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(text);
      return true;
    }
    if (queue.length < 20) queue.push(text);
    return false;
  };

  const close = () => {
    closed = true;
    clearTimeout(timer);
    if (socket) {
      try {
        socket.close();
      } catch {
        // 忽略
      }
    }
  };

  open();
  return { send, close };
}
