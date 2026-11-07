import {
  type FactItem,
  type FactSource,
  type Tool,
  type ToolContext,
  type ToolResult,
  type UnknownItem,
  fail,
  ok,
} from './types.ts';

const SOURCES: FactSource[] = ['user', 'doc', 'test', 'infer', 'guess'];
const CONFIDENCE: FactItem['confidence'][] = ['high', 'medium', 'low'];

function normalizeFacts(raw: unknown): FactItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const content = String(item['content'] ?? '').trim();
      const source = SOURCES.includes(item['source'] as FactSource)
        ? (item['source'] as FactSource)
        : 'guess';
      const confidence = CONFIDENCE.includes(item['confidence'] as FactItem['confidence'])
        ? (item['confidence'] as FactItem['confidence'])
        : 'low';
      return { content, source, confidence };
    })
    .filter((item) => item.content.length > 0)
    .slice(0, 200);
}

function normalizeUnknowns(raw: unknown): UnknownItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      item: String(item['item'] ?? '').trim(),
      reason: typeof item['reason'] === 'string' ? item['reason'].trim() : undefined,
      verify: typeof item['verify'] === 'string' ? item['verify'].trim() : undefined,
    }))
    .filter((item) => item.item.length > 0)
    .slice(0, 200);
}

const SOURCE_LABEL: Record<FactSource, string> = {
  user: '用户',
  doc: '文档/代码',
  test: '实测',
  infer: '推断',
  guess: '猜测',
};

export function formatMemory(facts: FactItem[] = [], unknowns: UnknownItem[] = []): string {
  const parts: string[] = [];
  if (facts.length) {
    parts.push(
      `## 已确认事实\n${facts
        .map(
          (fact, index) =>
            `${index + 1}. [${SOURCE_LABEL[fact.source]}/${fact.confidence}] ${fact.content}`,
        )
        .join('\n')}`,
    );
  }
  if (unknowns.length) {
    parts.push(
      `## 未验证项\n${unknowns
        .map(
          (item, index) =>
            `${index + 1}. ${item.item}${item.reason ? `（原因：${item.reason}）` : ''}${
              item.verify ? `（验证：${item.verify}）` : ''
            }`,
        )
        .join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

export const memoryWriteTool: Tool = {
  name: 'memory_write',
  description:
    '写入/更新已确认事实和未验证项（整表覆盖）。事实必须标注来源 user/doc/test/infer/guess 和置信度 high/medium/low；没依据的写进 unknowns。',
  parameters: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        description: '已确认事实列表；不传表示保持原值',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            source: { type: 'string', enum: SOURCES },
            confidence: { type: 'string', enum: CONFIDENCE },
          },
          required: ['content', 'source', 'confidence'],
        },
      },
      unknowns: {
        type: 'array',
        description: '未验证项列表；不传表示保持原值',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string' },
            reason: { type: 'string' },
            verify: { type: 'string' },
          },
          required: ['item'],
        },
      },
    },
    required: [],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    if (!Array.isArray(input.facts) && !Array.isArray(input.unknowns)) {
      return fail('facts 和 unknowns 至少要传一个数组。');
    }
    ctx.facts ??= [];
    ctx.unknowns ??= [];
    if (Array.isArray(input.facts)) {
      const facts = normalizeFacts(input.facts);
      ctx.facts!.length = 0;
      ctx.facts!.push(...facts);
    }
    if (Array.isArray(input.unknowns)) {
      const unknowns = normalizeUnknowns(input.unknowns);
      ctx.unknowns!.length = 0;
      ctx.unknowns!.push(...unknowns);
    }
    return ok(
      `记忆已更新（事实 ${ctx.facts?.length ?? 0} 条，未验证 ${ctx.unknowns?.length ?? 0} 条）。`,
      `memory ${ctx.facts?.length ?? 0}/${ctx.unknowns?.length ?? 0}`,
    );
  },
};

export const memoryReadTool: Tool = {
  name: 'memory_read',
  description: '读取当前会话的已确认事实和未验证项。',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  approval: 'never',
  async run(_input, ctx: ToolContext): Promise<ToolResult> {
    return ok(formatMemory(ctx.facts ?? [], ctx.unknowns ?? []) || '（还没有事实或未验证项）');
  },
};

export const memoryTools: Tool[] = [memoryWriteTool, memoryReadTool];
