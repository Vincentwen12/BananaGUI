export interface SessionSummary {
  id: string;
  title: string;
  workspace?: string;
  updatedAt: string;
  createdAt?: string;
  turns?: number;
  preview?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input?: unknown;
  summary?: string;
  status?: 'running' | 'ok' | 'fail';
  output?: string;
  durationMs?: number;
  truncated?: boolean;
}

export interface SessionMessage {
  role: string;
  content: string;
  reasoning?: string;
  images?: string[];
  attachments?: Array<{ name?: string; path?: string; kind?: string }>;
  turnId?: string;
  toolCalls?: ToolCallInfo[];
  toolCallId?: string;
  name?: string;
  isError?: boolean;
}

export interface TodoItem {
  text: string;
  status: string;
}

export interface Session {
  id: string;
  title: string;
  workspace?: string;
  mode?: 'plan' | 'build';
  reasoning?: 'fast' | 'standard' | 'deep';
  messages: SessionMessage[];
  todos?: TodoItem[];
  facts?: Array<{ text: string; source?: string }>;
  unknowns?: Array<{ text: string }>;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  plan?: { status: 'pending' | 'approved' | 'cancelled'; summary?: string; items?: TodoItem[]; currentPhase?: string } | null;
  verification?: { at: string; results: Array<{ command: string; ok: boolean; ms: number }> } | null;
}

export interface PublicTool {
  name: string;
  description: string;
  approval: string;
  permission: string;
  enabled: boolean;
  builtin: boolean;
}

export interface PublicProvider {
  name: string;
  protocol: string;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  keySource: string;
  apiKeyEnv?: string;
}

export interface GuiCommand {
  name: string;
  usage: string;
  summary: string;
}

export interface Info {
  version: string;
  name?: string;
  workspace: string;
  sessionDir?: string;
  currentProvider: string;
  model: string;
  providerError?: string | null;
  providers: PublicProvider[];
  permissions?: Record<string, string>;
  search?: { mode?: string; provider?: string; deep?: boolean; deepPages?: number; language?: string; hasTavily?: boolean; hasBrave?: boolean };
  showReasoning?: boolean;
  allowOutsideWorkspace?: boolean;
  maxSteps?: number;
  maxContextChars?: number;
  uiGuard?: string;
  systemPrompt?: string;
  preferences?: string[];
  verifyCommands?: string[];
  trust?: { status: 'none' | 'pending' | 'trusted'; workspace: string; hasConfig: boolean; hasPlugins: boolean; hasAgentDoc: boolean } | null;
  tools?: PublicTool[];
  commands?: GuiCommand[];
  terminal?: { available: boolean };
  isDesktop?: boolean;
}

export interface Bootstrap {
  info: Info;
  sessions: SessionSummary[];
  session: Session;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderModels {
  name: string;
  label: string;
  models: ModelOption[];
  source: 'live' | 'fallback';
}

export interface ModelCatalog {
  providers: ProviderModels[];
  fetchedAt: string;
}

export type WsEvent = Record<string, unknown> & { type: string };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const message = data?.error?.message ?? `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  models: (refresh = false) => request<ModelCatalog>(`/api/models${refresh ? '?refresh=1' : ''}`),
  health: () => request<{ ok: boolean; version: string }>('/api/health'),
  sessions: () => request<{ sessions: SessionSummary[]; session: Session }>('/api/sessions'),
  session: (id: string) => request<{ session: Session }>(`/api/sessions/${encodeURIComponent(id)}`),
  create: (payload: { title?: string; workspace?: string } = {}) => post<{ session: Session }>('/api/sessions', payload),
  activate: (id: string) => post<{ session: Session }>('/api/sessions/activate', { id }),
  rename: (id: string, title: string) =>
    request<{ session: Session }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  remove: (id: string) =>
    request<{ session: Session }>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clear: () => post<{ session: Session }>('/api/session/clear'),
  importSession: (session: unknown) => post<{ session: Session }>('/api/sessions/import', { session }),
  exportUrl: (id: string, format: 'md' | 'json' = 'md') =>
    `/api/sessions/${encodeURIComponent(id)}/export?format=${format}`,
  workspace: (path: string, sessionId?: string) =>
    post<{ session: Session; info: Info }>('/api/workspace', { path, sessionId }),
  trust: () => post<{ info: Info; session: Session }>('/api/trust'),
  settings: (patch: Record<string, unknown>) => post<{ info: Info; session: Session }>('/api/settings', patch),
  testConnection: (name?: string) => post<{ ok: boolean; detail: string }>('/api/settings/test', { name }),
  mode: (mode: 'plan' | 'build') => post<{ session: Session }>('/api/mode', { mode }),
  phase: (phase: string) => post<{ session: Session }>('/api/phase', { phase }),
  approvePlan: () => post<{ session: Session }>('/api/plan/approve'),
  cancelPlan: () => post<{ session: Session }>('/api/plan/cancel'),
  toggleTool: (name: string, enabled: boolean) => post<{ info: Info }>('/api/tools/toggle', { name, enabled }),
  addPlugin: (path: string) => post<{ info: Info }>('/api/plugins/add', { path }),
  undo: () => post<{ restored?: number; deleted?: number }>('/api/undo'),
  verify: () => post<{ at: string; results: Array<{ command: string; ok: boolean; ms: number }> }>('/api/verify'),
  compact: () => post<{ removed: number; session: Session }>('/api/compact'),
  review: () => post<{ text: string }>('/api/review'),
  files: (q = '', limit = 80) =>
    request<{ files: Array<{ path: string; isDirectory: boolean }> }>(
      `/api/files?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  tree: (path = '') =>
    request<{ items: Array<{ name: string; path: string; type: 'dir' | 'file'; size?: number }> }>(
      `/api/file/tree?path=${encodeURIComponent(path)}`,
    ),
  file: (path: string) =>
    request<{ path: string; content: string; truncated: boolean; binary: boolean; bytes: number }>(
      `/api/file?path=${encodeURIComponent(path)}`,
    ),
};

export interface Socket {
  send: (payload: unknown) => boolean;
  close: () => void;
}

export function connect(
  handlers: { onEvent: (event: WsEvent) => void; onStatus: (online: boolean) => void },
): Socket {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: number | undefined;
  let queue: string[] = [];

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
      handlers.onStatus(true);
      for (const item of queue) socket?.send(item);
      queue = [];
    });
    socket.addEventListener('message', (event) => {
      try {
        handlers.onEvent(JSON.parse(String(event.data)) as WsEvent);
      } catch {
        /* ignore */
      }
    });
    socket.addEventListener('close', () => {
      handlers.onStatus(false);
      schedule();
    });
    socket.addEventListener('error', () => {
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
    });
  };

  const schedule = () => {
    if (closed) return;
    const delay = Math.min(10_000, 600 * 2 ** retry);
    retry += 1;
    timer = window.setTimeout(open, delay);
  };

  open();

  return {
    send(payload: unknown) {
      const text = JSON.stringify(payload);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(text);
        return true;
      }
      if (queue.length < 20) queue.push(text);
      return false;
    },
    close() {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    },
  };
}
