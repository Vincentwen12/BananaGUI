import type { SessionMessage, SessionSummary, ToolCallInfo } from './api';

export function shortPath(path: string, keep = 2): string {
  const parts = String(path ?? '').split(/[\\/]/).filter(Boolean);
  if (parts.length <= keep) return path;
  return `…/${parts.slice(-keep).join('/')}`;
}

export function formatCount(value: number | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatBytes(bytes: number | undefined): string {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number | undefined): string {
  const n = Number(ms ?? 0);
  if (!n) return '';
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export function toolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  const pick = (keys: string[]): string => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value)) return value.map(String).join(' ');
    }
    return '';
  };
  const summary = pick(['path', 'file', 'command', 'query', 'pattern', 'url', 'title', 'name', 'text']);
  return summary.length > 90 ? `${summary.slice(0, 88)}…` : summary;
}

/** Merge streaming fragments and attach tool results from stored `tool` messages. */
export function buildTimeline(messages: SessionMessage[]): SessionMessage[] {
  const results = new Map<string, { content: string; isError?: boolean; name?: string }>();
  for (const message of messages) {
    if (message.role === 'tool' && message.toolCallId) {
      results.set(message.toolCallId, {
        content: message.content ?? '',
        isError: message.isError,
        name: message.name,
      });
    }
  }

  const out: SessionMessage[] = [];
  for (const message of messages) {
    if (message.role === 'tool') continue;
    if (message.role !== 'user' && message.role !== 'assistant') continue;

    const toolCalls: ToolCallInfo[] = (message.toolCalls ?? []).map((call) => {
      const result = call.id ? results.get(call.id) : undefined;
      return {
        ...call,
        name: call.name || result?.name || 'tool',
        summary: call.summary || toolSummary(call.name || result?.name || '', call.input),
        status: call.status ?? (result ? (result.isError ? 'fail' : 'ok') : call.status),
        output: call.output ?? result?.content,
      };
    });

    const last = out[out.length - 1];
    if (
      message.role === 'assistant' &&
      last?.role === 'assistant' &&
      (message.turnId ?? '') === (last.turnId ?? '')
    ) {
      out[out.length - 1] = {
        ...last,
        content: [last.content, message.content].filter(Boolean).join('\n\n'),
        reasoning: [last.reasoning, message.reasoning].filter(Boolean).join('\n\n'),
        toolCalls: [...(last.toolCalls ?? []), ...toolCalls],
      };
    } else {
      out.push({ ...message, toolCalls: toolCalls.length ? toolCalls : undefined });
    }
  }
  return out;
}

export interface WorkspaceGroup {
  workspace: string;
  label: string;
  items: SessionSummary[];
}

export function groupSessions(sessions: SessionSummary[], currentWorkspace: string, query: string): WorkspaceGroup[] {
  const needle = query.trim().toLowerCase();
  const map = new Map<string, SessionSummary[]>();
  for (const item of sessions) {
    const workspace = item.workspace || currentWorkspace || '';
    if (!map.has(workspace)) map.set(workspace, []);
    map.get(workspace)!.push(item);
  }
  if (currentWorkspace && !map.has(currentWorkspace)) map.set(currentWorkspace, []);
  return [...map.entries()]
    .map(([workspace, items]) => ({
      workspace,
      label: workspace.split(/[\\/]/).filter(Boolean).pop() || workspace || '—',
      items: items.filter((item) => {
        if (!needle) return true;
        return (
          (item.title ?? '').toLowerCase().includes(needle) ||
          (item.preview ?? '').toLowerCase().includes(needle)
        );
      }),
    }))
    .filter((group) => group.items.length > 0 || !needle);
}
