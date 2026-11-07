import { type TodoItem, type Tool, type ToolContext, type ToolResult, fail, ok } from './types.ts';

const STATUS_LABEL: Record<TodoItem['status'], string> = {
  pending: '待办',
  in_progress: '进行中',
  done: '已完成',
};

const STATUS_MARK: Record<TodoItem['status'], string> = {
  pending: '☐',
  in_progress: '◐',
  done: '☑',
};

export function formatTodos(items: TodoItem[]): string {
  if (!items.length) return '（还没有待办）';
  return items
    .map((item, index) => `${index + 1}. ${STATUS_MARK[item.status]} [${STATUS_LABEL[item.status]}] ${item.text}`)
    .join('\n');
}

function normalize(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const text = String(item['text'] ?? '').trim();
      const status = String(item['status'] ?? 'pending');
      const valid: TodoItem['status'] =
        status === 'in_progress' || status === 'done' || status === 'pending' ? status : 'pending';
      const phase = typeof item['phase'] === 'string' ? item['phase'].trim() : '';
      const verify = typeof item['verify'] === 'string' ? item['verify'].trim() : '';
      const confidence =
        item['confidence'] === 'high' || item['confidence'] === 'medium' || item['confidence'] === 'low'
          ? item['confidence']
          : undefined;
      const files = Array.isArray(item['files'])
        ? item['files'].map((file) => String(file).trim()).filter(Boolean).slice(0, 20)
        : [];
      return {
        text,
        status: valid,
        ...(phase ? { phase } : {}),
        ...(files.length ? { files } : {}),
        ...(verify ? { verify } : {}),
        ...(confidence ? { confidence } : {}),
      } as TodoItem;
    })
    .filter((item) => item.text.length > 0);
}

export const todoWriteTool: Tool = {
  name: 'todo_write',
  description: [
    '写入/更新任务清单（整表覆盖）。多步骤任务开始前先建清单，之后每完成一步就更新状态。',
    'status 只能是 pending / in_progress / done；同一时间建议只有一个 in_progress。',
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: '完整的任务列表',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '任务描述' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            phase: { type: 'string', description: '可选：所属阶段' },
            files: { type: 'array', items: { type: 'string' }, description: '可选：涉及文件' },
            verify: { type: 'string', description: '可选：如何验证这一步' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '可选：置信度' },
          },
          required: ['text', 'status'],
        },
      },
    },
    required: ['todos'],
    additionalProperties: false,
  },
  approval: 'never',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    // 空数组是合法的“清空清单”，不要再当成错误。
    if (!Array.isArray(input.todos)) return fail('todos 必须是数组。');
    const items = normalize(input.todos);
    ctx.todos.length = 0;
    ctx.todos.push(...items);
    if (!items.length) return ok('任务清单已清空。', 'todo 已清空');
    return ok(`任务清单已更新（${items.length} 项）:\n${formatTodos(items)}`, `todo ${items.length} 项`);
  },
};

export const todoReadTool: Tool = {
  name: 'todo_read',
  description: '读取当前任务清单。不确定进度时先读一次，不要凭记忆猜。',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  approval: 'never',
  async run(_input, ctx: ToolContext): Promise<ToolResult> {
    return ok(`当前任务清单:\n${formatTodos(ctx.todos)}`);
  },
};

export const todoTools: Tool[] = [todoWriteTool, todoReadTool];