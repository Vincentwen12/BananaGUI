import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { bananaHome, formatPreferences, resolveProvider } from '../config/config.ts';
import { runTurn } from '../agent/loop.ts';
import type { UMessage } from '../providers/types.ts';
import type { MessageAttachment } from '../providers/types.ts';
import { estimateTokens } from '../agent/context.ts';
import { estimateCost, resolvePricing } from '../providers/pricing.ts';
import { BackupStore, newTurnId } from '../session/backups.ts';
import { deriveTitle } from '../session/store.ts';
import type { Session } from '../session/store.ts';
import { TraceWriter } from '../session/trace.ts';
import { allTools, summarizeInput, type ApprovalKind, type Tool } from '../tools/index.ts';
import type { ToolResult } from '../tools/types.ts';
import type { GuiState } from './state.ts';
import type { ServerEvent } from './protocol.ts';

export interface TurnPayload {
  input?: string;
  images?: string[];
  attachments?: Array<Omit<MessageAttachment, 'path'> & { path?: string }>;
  attachmentContext?: string;
  mode?: 'plan' | 'build';
  reasoning?: 'fast' | 'standard' | 'deep';
}

export interface TurnHost {
  state: GuiState;
  broadcast: (event: ServerEvent) => void;
  abortAll: () => void;
}

const PLAN_TOOLS = new Set([
  'read_file',
  'list_dir',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'todo_write',
  'todo_read',
  'memory_write',
  'memory_read',
  'ui_audit',
]);

const PLAN_PROMPT = [
  '你现在处于 Plan 模式：只允许只读调研，禁止写文件、改文件和执行 shell。',
  '先读必要代码，再用 todo_write 给出 3–7 项可执行计划；每一项 status 必须是 pending，尽量填写 phase、files、verify、confidence。',
  '计划完成后用一段简短文字说明目标、关键风险和需要用户确认的点，等待用户批准。',
].join('\n');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_CHARS = 200_000;

function sessionMeta(session: Session): Record<string, unknown> {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    workspace: session.workspace,
    turns: session.messages.filter((message) => message.role === 'user').length,
    preview: [...session.messages].reverse().find((message) => message.role === 'user')?.content.slice(0, 80) ?? '',
  };
}

function validateImages(images: string[] | undefined): string[] | undefined {
  if (!images?.length) return undefined;
  if (images.length > 8) throw new Error('一次最多附加 8 张图片。');
  for (const image of images) {
    const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) throw new Error('图片格式不支持；只接受 png / jpeg / gif / webp 的 data URL。');
    const bytes = Math.floor((match[2]!.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) throw new Error(`图片 ${(bytes / 1024 / 1024).toFixed(1)}MB，超过 4MB 上限。`);
  }
  return images;
}

function validateAttachments(
  raw: Array<Omit<MessageAttachment, 'path'> & { path?: string }> | undefined,
): MessageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  const out: MessageAttachment[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 200) : '';
    if (!name) continue;
    out.push({
      name,
      path: typeof item.path === 'string' ? item.path.slice(0, 500) : name,
      ...(typeof item.mime === 'string' ? { mime: item.mime.slice(0, 120) } : {}),
      ...(typeof item.size === 'number' ? { size: item.size } : {}),
      ...(item.kind === 'image' || item.kind === 'text' || item.kind === 'pdf' || item.kind === 'binary'
        ? { kind: item.kind as MessageAttachment['kind'] }
        : {}),
    });
  }
  return out.length ? out : undefined;
}

function selectedInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['path', 'pattern', 'command', 'query', 'url', 'name', 'old_string', 'text']) {
    const value = input[key];
    if (typeof value === 'string' && value.length <= 600) out[key] = value;
  }
  return out;
}

function planPrompt(session: Session): string {
  if (session.mode === 'plan') return PLAN_PROMPT;
  if (session.plan?.status === 'approved') {
    const phase = session.plan.currentPhase ? `当前阶段：${session.plan.currentPhase}。` : '';
    const items = session.plan.items
      .map((item, index) => {
        const meta = [item.phase ? `阶段 ${item.phase}` : '', item.status, item.verify ? `验证 ${item.verify}` : '']
          .filter(Boolean)
          .join(' · ');
        return `${index + 1}. [${item.status}] ${item.text}${meta ? `（${meta}）` : ''}`;
      })
      .join('\n');
    return [
      '## 已批准计划',
      phase,
      '只执行当前阶段；本阶段完成后停下等待用户确认，不要擅自推进下一阶段。',
      items,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function approvalFor(
  host: TurnHost,
  signal: AbortSignal,
  owner: import('ws').WebSocket | null,
): (kind: ApprovalKind, summary: string, preview?: string) => Promise<boolean> {
  return (kind, summary, preview) =>
    new Promise<boolean>((resolve) => {
      if (kind === 'never') {
        resolve(true);
        return;
      }
      if (signal.aborted) {
        resolve(false);
        return;
      }
      const id = `ap_${randomBytes(4).toString('hex')}`;
      let settled = false;
      const finish = (allow: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        host.state.pendingApprovals.delete(id);
        resolve(allow);
      };
      const onAbort = (): void => finish(false);
      const timer = setTimeout(() => finish(false), 10 * 60 * 1000);
      signal.addEventListener('abort', onAbort, { once: true });
      host.state.pendingApprovals.set(id, {
        id,
        kind,
        summary,
        ...(preview ? { preview } : {}),
        resolve: finish,
        timer,
        owner,
      });
      host.broadcast({
        type: 'approval_request',
        id,
        kind,
        summary,
        ...(preview ? { preview: preview.slice(0, 40_000) } : {}),
        sessionId: host.state.session.id,
      });
    });
}

export async function runGuiTurn(
  host: TurnHost,
  payload: TurnPayload,
  owner: import('ws').WebSocket | null,
): Promise<boolean> {
  const { state } = host;
  if (state.activeTurn) throw new Error('当前回合还在运行，先停止。');
  const input = String(payload.input ?? '').trim();
  if (input.length > MAX_INPUT_CHARS) throw new Error('输入超过 200,000 字符，请拆分后重试。');
  const images = validateImages(payload.images);
  const attachments = validateAttachments(payload.attachments);
  const attachmentContext =
    typeof payload.attachmentContext === 'string' && payload.attachmentContext.trim()
      ? payload.attachmentContext.slice(0, 200_000)
      : undefined;
  if (!input && !images?.length && !attachments?.length) throw new Error('输入不能为空。');
  const provider = state.provider;
  if (!provider) {
    throw new Error(state.providerError || '当前 provider 缺少 API key，请先在设置里配置。');
  }

  if (payload.mode === 'plan' || payload.mode === 'build') state.session.mode = payload.mode;
  if (payload.reasoning === 'fast' || payload.reasoning === 'standard' || payload.reasoning === 'deep') {
    state.session.reasoning = payload.reasoning;
  }
  state.setTitleFromInput(input);
  state.session.workspace ||= state.config.workspace;
  await state.saveSession();

  const controller = new AbortController();
  const turnId = newTurnId();
  state.activeTurn = {
    sessionId: state.session.id,
    turnId,
    controller,
    startedAt: Date.now(),
    owner,
  };
  // 消息处理和断线可能交错：如果发起回合的连接已经关闭，马上中止，避免孤儿回合。
  if ((owner && owner.readyState !== 1) || state.clients.size === 0) {
    controller.abort();
  }

  const started = Date.now();
  const trace = new TraceWriter(state.session.id, turnId);
  const recorder = await new BackupStore(join(bananaHome(), 'backups'), state.session.id).beginTurn(
    turnId,
    state.config.workspace,
  );
  const toolStarted = new Map<string, number>();
  let counter = 0;

  const planMode = state.session.mode === 'plan';
  const tools: Tool[] = planMode
    ? state.tools.filter((tool) => PLAN_TOOLS.has(tool.name))
    : state.tools;

  const system = [
    state.config.systemPrompt,
    state.config.agentDoc ? `## 项目规则（AGENT.md）\n${state.config.agentDoc}` : '',
    formatPreferences(state.config.preferences),
    planPrompt(state.session),
  ]
    .filter(Boolean)
    .join('\n\n');

  host.broadcast({
    type: 'turn_start',
    turnId,
    sessionId: state.session.id,
    mode: state.session.mode,
    reasoning: state.session.reasoning,
    title: state.session.title,
    input,
    images,
    attachments,
  });

  let result: Awaited<ReturnType<typeof runTurn>>;
  try {
    result = await runTurn(
      {
        provider,
        tools,
        permissions: state.config.permissions,
        system,
        maxSteps: state.config.maxSteps,
        maxContextChars: state.config.maxContextChars,
        toolsWorkspace: state.config.workspace,
        allowOutsideWorkspace: state.config.allowOutsideWorkspace,
        signal: controller.signal,
        todos: state.session.todos ?? [],
        facts: state.session.facts ?? [],
        unknowns: state.session.unknowns ?? [],
        search: state.config.search,
        nativeSearch: (() => {
          try {
            const resolved = resolveProvider(state.config.current, state.config);
            if (!resolved.apiKey) return undefined;
            return {
              provider: state.config.current,
              protocol: resolved.config.protocol,
              baseUrl: resolved.config.baseUrl,
              apiKey: resolved.apiKey,
              model: resolved.config.model,
            };
          } catch {
            return undefined;
          }
        })(),
        budget: state.config.budget,
        uiGuard: state.config.uiGuard,
        reasoning: state.reasoning(),
        recordChange: (path, before) => recorder.record(path, before),
        approve: approvalFor(host, controller.signal, owner),
        onStep: (step) => {
          trace.add('step', { step });
          host.broadcast({ type: 'step', step, turnId });
        },
        onText: (chunk) => {
          host.broadcast({ type: 'text', delta: chunk, turnId });
        },
        onReasoning: (chunk) => {
          if (!state.config.showReasoning) return;
          host.broadcast({ type: 'reasoning', delta: chunk, turnId });
        },
        onToolStart: (name, toolInput, id) => {
          const toolId = id ?? `tool_${++counter}`;
          toolStarted.set(toolId, Date.now());
          trace.add('tool_start', { name, id: toolId, input: summarizeInput(toolInput) });
          host.broadcast({
            type: 'tool_start',
            id: toolId,
            name,
            summary: summarizeInput(toolInput),
            input: selectedInput(toolInput ?? {}),
            turnId,
          });
        },
        onToolOutput: (chunk, stream, id) => {
          host.broadcast({ type: 'tool_output', id: id ?? '', chunk: chunk.slice(0, 20_000), stream, turnId });
        },
        onToolEnd: (name, toolResult: ToolResult, id) => {
          const toolId = id ?? `tool_${counter}`;
          const startedAt = toolStarted.get(toolId) ?? Date.now();
          trace.add('tool_end', { name, id: toolId, ok: toolResult.ok });
          host.broadcast({
            type: 'tool_end',
            id: toolId,
            name,
            ok: toolResult.ok,
            display: toolResult.display ?? '',
            content: toolResult.content.slice(0, 60_000),
            truncated: toolResult.content.length > 60_000,
            durationMs: Date.now() - startedAt,
            turnId,
          });
        },
        onNotice: (message) => host.broadcast({ type: 'notice', message, turnId }),
        onRetry: (info) => host.broadcast({ type: 'retry', ...info, turnId }),
        onCompact: (info) => host.broadcast({ type: 'compact', ...info, turnId }),
        onBudget: (info) =>
          host.broadcast({
            type: 'notice',
            message:
              info.reason === 'tokens'
                ? `达到本轮 token 预算（${Math.round(info.used)}）`
                : `达到本轮时间预算（${info.used.toFixed(1)} 分钟）`,
            level: 'warn',
            turnId,
          }),
      },
      state.session.messages,
      input,
      images,
      attachments,
      attachmentContext,
    );
  } catch (error) {
    controller.abort();
    const message = error instanceof Error ? error.message : String(error);
    trace.add('error', { message });
    await trace.finish({ stopReason: 'error', error: message });
    await recorder.commit().catch(() => {});
    for (const approval of [...state.pendingApprovals.values()]) approval.resolve(false);
    state.activeTurn = null;
    host.broadcast({
      type: 'turn_end',
      turnId,
      stopReason: 'error',
      error: message,
      sessionId: state.session.id,
      sessionMeta: sessionMeta(state.session),
    });
    throw error;
  }

  state.session.messages = result.messages;
  const previous = state.session.usage;
  const pricing = resolvePricing(provider.model, state.providerConfig()?.pricing);
  const turnCost = estimateCost(result.usage, pricing);
  state.session.usage = {
    inputTokens: (previous?.inputTokens ?? 0) + (result.usage.inputTokens ?? 0),
    outputTokens: (previous?.outputTokens ?? 0) + (result.usage.outputTokens ?? 0),
    costUsd: (previous?.costUsd ?? 0) + turnCost,
  };

  let planCreated = false;
  if (state.session.mode === 'plan') {
    const items = (state.session.todos ?? []).map((item) => ({ ...item, status: 'pending' as const }));
    const lastText =
      [...state.session.messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';
    if (items.length) {
      state.session.plan = {
        status: 'pending',
        items,
        summary: lastText.replace(/\s+/g, ' ').trim().slice(0, 800),
        createdAt: new Date().toISOString(),
      };
      planCreated = true;
    } else {
      state.session.plan = undefined;
    }
    state.session.todos = [];
  }
  await state.saveSession();
  await trace.finish({
    stopReason: result.stopReason,
    steps: result.steps,
    usage: result.usage,
    ms: Date.now() - started,
  });
  await recorder.commit().catch(() => {});
  for (const approval of [...state.pendingApprovals.values()]) approval.resolve(false);
  state.activeTurn = null;

  host.broadcast({
    type: 'turn_end',
    turnId,
    stopReason: result.stopReason,
    error: result.error,
    steps: result.steps,
    usage: result.usage,
    turnCost,
    totalUsage: state.session.usage,
    elapsedMs: Date.now() - started,
    contextTokens: estimateTokens(state.session.messages),
    sessionId: state.session.id,
    sessionMeta: sessionMeta(state.session),
    todos: state.session.todos ?? [],
    plan: state.session.plan ?? null,
    planCreated,
  });
  return planCreated;
}

export function planItemsForDisplay(session: Session): Array<Record<string, unknown>> {
  return (session.plan?.items ?? []).map((item) => ({ ...item }));
}

export function allToolNames(): string[] {
  return allTools.map((tool) => tool.name);
}

export function titleFrom(input: string): string {
  return deriveTitle(input);
}

export function messageCount(messages: UMessage[]): number {
  return messages.length;
}
