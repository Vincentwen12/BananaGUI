import type { Provider, UMessage } from '../providers/types.ts';

const CHARS_PER_TOKEN = 3.2;

/** 粗略估算 token 数：中文按 ~1.5 字符/token，代码/英文更省，所以用偏保守的系数。 */
export function estimateTokens(messages: UMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    for (const call of message.toolCalls ?? []) {
      chars += call.name.length + JSON.stringify(call.input ?? {}).length;
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function estimateChars(messages: UMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length + 8;
    for (const call of message.toolCalls ?? []) {
      chars += call.name.length + JSON.stringify(call.input ?? {}).length + 8;
    }
  }
  return chars;
}

const SUMMARY_INSTRUCTION = [
  '请把下面这段 AI 编程助手与用户的对话压缩成一份交接摘要，供对话继续进行时使用。',
  '必须保留：用户的原始目标与明确约束、已经做出的决定、已确认的事实（路径/版本/命令/偏好）、已修改/新建的文件及其改动要点、关键代码事实（函数名/路径/接口）、工具报错与卡点、未完成项和下一步待办。',
  '不要保留无用的寒暄和重复内容。只输出摘要正文，用 Markdown，分「目标与约束 / 进展 / 关键事实 / 未完成项 / 下一步」五段。',
].join('\n');

/** 压缩请求本身也不能无限大；超出就先截断中间历史。 */
const MAX_TRANSCRIPT_CHARS = 40_000;

export interface CompactResult {
  messages: UMessage[];
  summary: string;
  removed: number;
}

/**
 * 上下文超限时把中间的历史压成一段摘要，保留第一条用户消息和最近若干条消息。
 * 失败时返回 null，调用方应继续带着原上下文跑（可能只是这次请求会失败）。
 */
export async function compactMessages(options: {
  provider: Provider;
  messages: UMessage[];
  /** 最近消息的字符预算，默认按调用方的上下文上限推导。 */
  keepRecentChars?: number;
  /** 最近最多保留多少条消息，保证一定能压掉一些历史。 */
  maxTailMessages?: number;
  signal?: AbortSignal;
}): Promise<CompactResult | null> {
  const {
    provider,
    messages,
    keepRecentChars = 60_000,
    maxTailMessages = 8,
    signal,
  } = options;
  if (messages.length < 4) return null;

  const firstUserIndex = messages.findIndex((message) => message.role === 'user');
  if (firstUserIndex === -1) return null;
  const firstUser = messages[firstUserIndex]!;

  const head = messages.slice(0, firstUserIndex + 1);
  // 从尾部往前保留，直到用完字符预算或达到条数上限
  let boundary = messages.length;
  let used = 0;
  for (let index = messages.length - 1; index > firstUserIndex; index -= 1) {
    const size = estimateChars([messages[index]!]);
    const keptCount = messages.length - index;
    if ((used + size > keepRecentChars && keptCount > 2) || keptCount > maxTailMessages) {
      boundary = index + 1;
      break;
    }
    used += size;
    boundary = index;
  }

  // 关键：切点不能落在 tool 结果上，否则 tail 会以孤儿 tool_result 开头，
  // Anthropic 会直接 400（tool_use_id 找不到），部分 OpenAI 兼容服务也会报错。
  // 往前退到发起调用的 assistant 消息，保证 tool_use / tool_result 成对保留。
  while (boundary > firstUserIndex + 1 && messages[boundary]?.role === 'tool') {
    boundary -= 1;
  }

  if (boundary <= firstUserIndex + 1) return null;

  const middle = messages.slice(firstUserIndex + 1, boundary);
  const tail = messages.slice(boundary);
  const rawTranscript = middle
    .map((message) => {
      const label = message.role === 'assistant' ? '助手' : message.role === 'tool' ? `工具(${message.name ?? ''})` : '用户';
      const calls = message.toolCalls?.map((call) => `[调用工具 ${call.name}]`).join(' ') ?? '';
      return `### ${label}\n${message.content}\n${calls}`.trim();
    })
    .join('\n\n');
  const transcript =
    rawTranscript.length > MAX_TRANSCRIPT_CHARS
      ? `${rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS)}\n...[中间对话过长，已截断]`
      : rawTranscript;

  try {
    const result = await provider.generate({
      messages: [
        { role: 'user', content: `${SUMMARY_INSTRUCTION}\n\n<对话记录>\n${transcript}\n</对话记录>` },
      ],
      system: '你在压缩对话上下文，输出必须简洁、结构化、只保留事实。',
      tools: [],
      signal,
    });
    const summary = result.message.content.trim();
    if (!summary) return null;

    return {
      messages: [
        ...head,
        {
          role: 'user',
          content: `[上下文已自动压缩] 下面是较早对话的摘要，请基于它继续工作：\n\n${summary}`,
        },
        ...tail,
      ],
      summary,
      removed: middle.length,
    };
  } catch {
    return null;
  }
}