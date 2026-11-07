import type { Permissions, SearchConfig } from '../config/config.ts';
import { isContextOverflowError } from '../providers/http.ts';
import type { MessageAttachment, Provider, ToolCall, UMessage, Usage } from '../providers/types.ts';
import type { ReasoningLevel } from '../providers/reasoning.ts';
import {
  type ApprovalKind,
  type TodoItem,
  type Tool,
  type ToolResult,
  permissionFor,
  runTool,
  toolMap,
  toolSchemas,
} from '../tools/index.ts';
import { compactMessages, estimateChars, estimateTokens } from './context.ts';

export type StopReason = 'done' | 'max_steps' | 'aborted' | 'error';

export interface AgentDeps {
  provider: Provider;
  tools: Tool[];
  permissions: Permissions;
  system: string;
  maxSteps: number;
  maxContextChars: number;
  /** 工具的工作区根目录。 */
  toolsWorkspace: string;
  allowOutsideWorkspace: boolean;
  signal: AbortSignal;
  /** 当前会话的任务清单（todo_* 工具读写它，由调用方持久化）。 */
  todos?: TodoItem[];
  /** 本轮思考强度。 */
  reasoning?: ReasoningLevel;
  /** 联网搜索配置；不传时工具退回环境变量和免费源。 */
  search?: SearchConfig;
  onText?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onToolStart?: (name: string, input: Record<string, unknown>, id?: string) => void;
  onToolEnd?: (name: string, result: ToolResult, id?: string) => void;
  onStep?: (step: number) => void;
  onCompact?: (info: { removed: number; before: number; after: number }) => void;
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
  onToolOutput?: (chunk: string, stream: 'stdout' | 'stderr', id?: string) => void;
  onNotice?: (message: string) => void;
  /** 写文件前记录备份，供 /undo 使用。 */
  recordChange?: (path: string, before: string | null) => Promise<void>;
  approve: (kind: ApprovalKind, summary: string, preview?: string) => Promise<boolean>;
}

export interface TurnResult {
  messages: UMessage[];
  steps: number;
  usage: Usage;
  stopReason: StopReason;
  error?: string;
  compacted: boolean;
}

function mergeUsage(total: Usage, next: Usage): Usage {
  return {
    inputTokens: (total.inputTokens ?? 0) + (next.inputTokens ?? 0) || undefined,
    outputTokens: (total.outputTokens ?? 0) + (next.outputTokens ?? 0) || undefined,
  };
}

const MAX_TOOL_MESSAGE_CHARS = 6000;

/**
 * 历史太短压不动、但上下文已经超限时，先把超长的工具输出截断。
 * 这是无损信息里最划算的一刀：大文件读取/命令输出通常才是占地方的元凶。
 */
export function truncateToolOutputs(messages: UMessage[], maxChars = MAX_TOOL_MESSAGE_CHARS): number {
  let trimmed = 0;
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    if (message.content.length <= maxChars) continue;
    const head = Math.floor(maxChars * 0.75);
    const tail = maxChars - head;
    message.content = `${message.content.slice(0, head)}\n...[历史工具输出已截断，原长 ${message.content.length} 字符]...\n${message.content.slice(-tail)}`;
    trimmed += 1;
  }
  return trimmed;
}

/**
 * 跑完一整轮：请求 -> 工具调用 -> 回灌结果 -> 再请求，直到模型不再要工具。
 * messages 不会被原地修改，返回的是新数组，方便会话持久化。
 */
export async function runTurn(
  deps: AgentDeps,
  messages: UMessage[],
  input?: string,
  images?: string[],
  attachments?: MessageAttachment[],
  attachmentContext?: string,
): Promise<TurnResult> {
  const tools = toolMap(deps.tools);
  const schemas = toolSchemas(deps.tools);
  const convo: UMessage[] = [...messages];
  if (input) {
    convo.push({
      role: 'user',
      content: input,
      ...(images?.length ? { images } : {}),
      ...(attachments?.length ? { attachments } : {}),
      ...(attachmentContext ? { attachmentContext } : {}),
    });
  }

  const usage: Usage = {};
  const todos: TodoItem[] = deps.todos ?? [];
  let steps = 0;
  let compacted = false;
  let overflowRecovered = false;

  const toolContext = {
    workspace: deps.toolsWorkspace,
    signal: deps.signal,
    approve: deps.approve,
    log: deps.onNotice ?? (() => {}),
    allowOutsideWorkspace: deps.allowOutsideWorkspace,
    permissions: deps.permissions,
    todos,
    recordChange: deps.recordChange,
    search: deps.search,
  };

  const tryCompact = async (aggressive: boolean): Promise<boolean> => {
    deps.onNotice?.(
      aggressive ? '上游报告上下文超限，正在压缩历史对话后重试…' : '上下文接近上限，正在压缩历史对话…',
    );
    const result = await compactMessages({
      provider: deps.provider,
      messages: convo,
      keepRecentChars: Math.max(
        200,
        Math.floor(deps.maxContextChars * (aggressive ? 0.25 : 0.6)),
      ),
      maxTailMessages: aggressive ? 2 : 8,
      signal: deps.signal,
    });
    if (!result) {
      const trimmed = truncateToolOutputs(convo);
      if (trimmed > 0) deps.onNotice?.(`历史太短，已截断 ${trimmed} 条超长工具输出。`);
      return trimmed > 0;
    }
    const before = estimateTokens(convo);
    convo.length = 0;
    convo.push(...result.messages);
    compacted = true;
    deps.onCompact?.({ removed: result.removed, before, after: estimateTokens(convo) });
    return true;
  };

  while (steps < deps.maxSteps) {
    if (deps.signal.aborted) return { messages: convo, steps, usage, stopReason: 'aborted', compacted };

    if (estimateChars(convo) > deps.maxContextChars) {
      const done = await tryCompact(false);
      if (!done) deps.onNotice?.('暂时压不动（历史太短），继续用当前上下文尝试。');
    }

    let result;
    try {
      deps.onStep?.(steps + 1);
      result = await deps.provider.generate({
        messages: convo,
        system: deps.system,
        tools: schemas,
        signal: deps.signal,
        onText: deps.onText,
        onReasoning: deps.onReasoning,
        onRetry: deps.onRetry,
        reasoning: deps.reasoning,
      });
    } catch (error) {
      if (deps.signal.aborted) return { messages: convo, steps, usage, stopReason: 'aborted', compacted };
      const message = error instanceof Error ? error.message : String(error);

      // 上下文超限：压缩后原地重试一次，不算作一步
      if (!overflowRecovered && isContextOverflowError(message)) {
        overflowRecovered = true;
        if (await tryCompact(true)) continue;
      }
      return { messages: convo, steps, usage, stopReason: 'error', error: message, compacted };
    }

    steps += 1;
    Object.assign(usage, mergeUsage(usage, result.usage));
    convo.push(result.message);

    const calls: ToolCall[] = result.message.toolCalls ?? [];
    if (calls.length === 0) {
      return { messages: convo, steps, usage, stopReason: 'done', compacted };
    }

    // 只读工具可以并发跑，并在同一轮里复用完全相同的调用结果。
    // 写文件 / shell 仍然串行，避免顺序和副作用被打乱。
    const READ_ONLY_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep']);
    const toolCache = new Map<string, ToolResult>();
    const recordResult = (call: ToolCall, toolResult: ToolResult): void => {
      deps.onToolEnd?.(call.name, toolResult, call.id);
      convo.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: toolResult.content,
        isError: !toolResult.ok,
      });
    };

    for (let index = 0; index < calls.length; ) {
      const call = calls[index]!;

      if (deps.signal.aborted) {
        // 为所有未执行的 tool_use 补上结果，避免下一轮协议校验失败
        for (const pending of calls.slice(index)) {
          convo.push({
            role: 'tool',
            toolCallId: pending.id,
            name: pending.name,
            content: '操作被用户中断。',
            isError: true,
          });
        }
        return { messages: convo, steps, usage, stopReason: 'aborted', compacted };
      }

      const input = (call.input && typeof call.input === 'object' ? call.input : {}) as Record<string, unknown>;
      const tool = tools.get(call.name);

      if (!tool) {
        const result: ToolResult = {
          ok: false,
          content: `未知工具 "${call.name}"。可用工具: ${[...tools.keys()].join(', ')}。请改用已有工具。`,
        };
        recordResult(call, result);
        index += 1;
        continue;
      }

      if (READ_ONLY_TOOLS.has(call.name)) {
        // 收集连续的只读调用一起执行；保持结果顺序与模型请求一致。
        const batch: Array<{ call: ToolCall; input: Record<string, unknown> }> = [];
        let cursor = index;
        while (
          cursor < calls.length &&
          READ_ONLY_TOOLS.has(calls[cursor]!.name) &&
          tools.has(calls[cursor]!.name)
        ) {
          const item = calls[cursor]!;
          batch.push({
            call: item,
            input: (item.input && typeof item.input === 'object' ? item.input : {}) as Record<string, unknown>,
          });
          cursor += 1;
        }
        for (const item of batch) deps.onToolStart?.(item.call.name, item.input, item.call.id);
        const results = await Promise.all(
          batch.map(async (item) => {
            const key = `${item.call.name}\u0000${JSON.stringify(item.input)}`;
            const cached = toolCache.get(key);
            if (cached) return cached;
            const itemTool = tools.get(item.call.name)!;
            const callContext = {
              ...toolContext,
              onOutput: (chunk: string, stream: 'stdout' | 'stderr') =>
                deps.onToolOutput?.(chunk, stream, item.call.id),
            };
            const result = await runTool(
              itemTool,
              item.input,
              callContext,
              permissionFor(deps.permissions, itemTool),
            );
            toolCache.set(key, result);
            return result;
          }),
        );
        for (let offset = 0; offset < batch.length; offset += 1) {
          recordResult(batch[offset]!.call, results[offset]!);
        }
        index = cursor;
        continue;
      }

      deps.onToolStart?.(call.name, input, call.id);
      const callContext = {
        ...toolContext,
        onOutput: (chunk: string, stream: 'stdout' | 'stderr') =>
          deps.onToolOutput?.(chunk, stream, call.id),
      };
      const toolResult = await runTool(tool, input, callContext, permissionFor(deps.permissions, tool));
      recordResult(call, toolResult);
      // 一旦发生写操作/命令，之前的只读缓存可能过期。
      toolCache.clear();
      index += 1;
    }
  }

  return { messages: convo, steps, usage, stopReason: 'max_steps', compacted };
}