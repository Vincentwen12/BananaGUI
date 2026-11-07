import type { JsonSchema } from '../providers/types.ts';
import type { SearchConfig } from '../config/config.ts';

export type ApprovalKind = 'never' | 'write' | 'shell' | 'network';
export type PermissionKey = 'shell' | 'write' | 'network';
export type PermissionMode = 'ask' | 'allow' | 'deny';
export type PermissionMap = Partial<Record<PermissionKey, PermissionMode>>;

export type FactSource = 'user' | 'doc' | 'test' | 'infer' | 'guess';

export interface FactItem {
  content: string;
  source: FactSource;
  confidence: 'high' | 'medium' | 'low';
}

export interface UnknownItem {
  item: string;
  reason?: string;
  verify?: string;
}

export interface TodoItem {
  text: string;
  status: 'pending' | 'in_progress' | 'done';
  /** 计划阶段（例如「核心循环」），可选。 */
  phase?: string;
  /** 涉及文件，可选。 */
  files?: string[];
  /** 验证方式，可选。 */
  verify?: string;
  /** 置信度，可选；没有依据时不要瞎填 high。 */
  confidence?: 'high' | 'medium' | 'low';
}

export interface ToolContext {
  /** 工作区根目录，所有路径默认限制在此之内。 */
  workspace: string;
  signal: AbortSignal;
  /** 交互式确认；返回 false 表示用户拒绝。preview 是给用户看的 diff/内容预览。 */
  approve: (kind: ApprovalKind, summary: string, preview?: string) => Promise<boolean>;
  log: (message: string) => void;
  allowOutsideWorkspace: boolean;
  permissions: PermissionMap;
  /** 当前会话的任务清单；todo_* 工具直接读写这个数组。 */
  todos: TodoItem[];
  /** 已确认事实；memory_* 工具直接读写。 */
  facts?: FactItem[];
  /** 未验证项；memory_* 工具直接读写。 */
  unknowns?: UnknownItem[];
  /** 长时间运行的命令可以边跑边把输出交给界面显示。 */
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  /** 写文件前记录改动前内容，供 /undo 回滚；before 为 null 表示新建。 */
  recordChange?: (path: string, before: string | null) => Promise<void>;
  /** 联网搜索配置（Key 已从配置/环境变量解析前的原始配置）。 */
  search?: SearchConfig;
}

export interface ToolResult {
  ok: boolean;
  /** 回灌给模型的内容。 */
  content: string;
  /** 只给终端用户看的提示，可选。 */
  display?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  approval: ApprovalKind;
  run(input: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
  /** 需要确认时给用户看的预览（写文件/改文件用 diff）。 */
  preview?(input: Record<string, any>, ctx: ToolContext): Promise<string | undefined>;
}

export function ok(content: string, display?: string): ToolResult {
  return { ok: true, content, display };
}

export function fail(content: string, display?: string): ToolResult {
  return { ok: false, content, display };
}

export function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return fail(`错误: ${message}`);
}