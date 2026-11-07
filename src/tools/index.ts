import type { Provider, ToolSchema } from '../providers/types.ts';
import { fileTools } from './fs.ts';
import { shellTool } from './shell.ts';
import { todoTools } from './todo.ts';
import { memoryTools } from './memory.ts';
import type { PermissionMap, PermissionMode } from './types.ts';
import { type ApprovalKind, type Tool, type ToolContext, type ToolResult, fail } from './types.ts';
import { webSearchTool, webFetchTool } from './web.ts';

export * from './types.ts';

export const allTools: Tool[] = [
  ...fileTools,
  shellTool,
  webSearchTool,
  webFetchTool,
  ...todoTools,
  ...memoryTools,
];

export function toolMap(tools: Tool[]): Map<string, Tool> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

export function toolSchemas(tools: Tool[]): ToolSchema[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

const PERMISSION_BY_APPROVAL: Record<ApprovalKind, keyof PermissionMap | undefined> = {
  never: undefined,
  write: 'write',
  shell: 'shell',
  network: 'network',
};

export function permissionFor(permissions: PermissionMap, tool: Tool): PermissionMode {
  const key = PERMISSION_BY_APPROVAL[tool.approval];
  if (!key) return 'allow';
  return permissions[key] ?? 'allow';
}

/** 统一的工具执行入口：处理权限判断、结果规范化与异常兜底。 */
export async function runTool(
  tool: Tool,
  input: Record<string, unknown>,
  ctx: ToolContext,
  permission: PermissionMode,
): Promise<ToolResult> {
  if (permission === 'deny') {
    return fail(`权限被拒绝：${tool.name}（当前配置 permissions 里该类别是 deny）。请让用户调整配置或改用别的方式。`);
  }
  if (permission === 'ask') {
    const summary = `${tool.name}(${summarizeInput(input)})`;
    let preview: string | undefined;
    if (tool.preview) {
      try {
        preview = await tool.preview(input, ctx);
      } catch {
        preview = undefined;
      }
    }
    const allowed = await ctx.approve(tool.approval, summary, preview);
    if (!allowed) return fail(`用户拒绝了 ${summary}。不要重试同一个操作，换个方案或询问用户。`);
  }
  try {
    const result = await tool.run(input, ctx);
    return result.content.length > 200_000
      ? { ...result, content: `${result.content.slice(0, 200_000)}\n...[工具输出被截断]` }
      : result;
  } catch (error) {
    return fail(`工具执行异常: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function summarizeInput(input: Record<string, unknown>, max = 120): string {
  const entries = Object.entries(input ?? {});
  const parts = entries.map(([key, value]) => {
    if (typeof value === 'string') {
      const flat = value.replace(/\s+/g, ' ');
      return `${key}=${flat.length > 60 ? `"${flat.slice(0, 60)}…"` : `"${flat}"`}`;
    }
    return `${key}=${JSON.stringify(value)?.slice(0, 60) ?? String(value)}`;
  });
  const text = parts.join(', ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface BuildContextOptions {
  workspace: string;
  signal: AbortSignal;
  permissions: PermissionMap;
  allowOutsideWorkspace: boolean;
  approve: (kind: ApprovalKind, summary: string, preview?: string) => Promise<boolean>;
  log: (message: string) => void;
  todos?: ToolContext['todos'];
}

export function createToolContext(options: BuildContextOptions): ToolContext {
  return {
    workspace: options.workspace,
    signal: options.signal,
    permissions: options.permissions,
    allowOutsideWorkspace: options.allowOutsideWorkspace,
    approve: options.approve,
    log: options.log,
    todos: options.todos ?? [],
  };
}

export type { Provider };