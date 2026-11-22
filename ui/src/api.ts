export interface SessionSummary {
  id: string;
  title: string;
  workspace?: string;
  updatedAt: string;
  turns?: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; name: string; input?: unknown }>;
}

export interface Session {
  id: string;
  title: string;
  workspace?: string;
  mode?: 'plan' | 'build';
  reasoning?: string;
  messages: SessionMessage[];
  todos?: Array<{ text: string; status: string }>;
  plan?: { status: string; summary?: string; items?: Array<{ text: string; status: string }> } | null;
  verification?: { at: string; results: Array<{ command: string; ok: boolean; ms: number }> } | null;
}

export interface Info {
  version: string;
  workspace: string;
  currentProvider: string;
  model: string;
  providerError?: string | null;
  providers: Array<{ name: string; model: string; hasKey: boolean }>;
}

export interface Bootstrap {
  info: Info;
  sessions: SessionSummary[];
  session: Session;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? `请求失败（${response.status}）`);
  return data as T;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  activate: (id: string) =>
    request<{ session: Session }>('/api/sessions/activate', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  create: (title?: string) =>
    request<{ session: Session }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  session: (id: string) => request<{ session: Session }>(`/api/sessions/${encodeURIComponent(id)}`),
  workspace: (path: string) =>
    request<{ session: Session; info: Info }>('/api/workspace', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  files: (path = '') => request<{ entries: Array<{ name: string; type: string }> }>(`/api/file/tree?path=${encodeURIComponent(path)}`),
  mode: (mode: string) => request('/api/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
};

export type WsEvent = Record<string, unknown> & { type: string };

export function connect(onEvent: (event: WsEvent) => void, onStatus: (online: boolean) => void) {
  let socket: WebSocket | null = null;
  let closed = false;
  let timer: number | undefined;

  const open = () => {
    if (closed) return;
    socket = new WebSocket(`ws://${location.host}/ws`);
    socket.addEventListener('open', () => onStatus(true));
    socket.addEventListener('message', (event) => {
      try {
        onEvent(JSON.parse(String(event.data)) as WsEvent);
      } catch {
        /* ignore */
      }
    });
    socket.addEventListener('close', () => {
      onStatus(false);
      if (!closed) timer = window.setTimeout(open, 1200);
    });
  };
  open();

  return {
    send(payload: unknown) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
        return true;
      }
      return false;
    },
    close() {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    },
  };
}
