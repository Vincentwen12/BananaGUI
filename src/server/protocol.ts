import type { AppConfig } from '../config/config.ts';
import type { Session, SessionSummary } from '../session/store.ts';
import type { Tool } from '../tools/types.ts';

export const GUI_COMMANDS: Array<{ name: string; usage: string; summary: string; gui?: boolean }> = [
  { name: 'new', usage: '/new [标题]', summary: '开一个新对话' },
  { name: 'list', usage: '/list', summary: '在侧栏查看历史对话' },
  { name: 'use', usage: '/use <序号|id前缀|标题>', summary: '切换到历史对话' },
  { name: 'rename', usage: '/rename <新标题>', summary: '给当前对话改名' },
  { name: 'delete', usage: '/delete <序号|id前缀>', summary: '删除一个历史对话' },
  { name: 'clear', usage: '/clear', summary: '清空当前对话' },
  { name: 'session', usage: '/session', summary: '查看当前对话信息' },
  { name: 'history', usage: '/history', summary: '查看当前对话消息' },
  { name: 'provider', usage: '/provider [名称]', summary: '切换模型供应商' },
  { name: 'model', usage: '/model [模型名]', summary: '切换模型' },
  { name: 'perm', usage: '/perm <类别> <模式>', summary: '设置工具权限' },
  { name: 'tools', usage: '/tools [名称|all]', summary: '查看/启停工具' },
  { name: 'system', usage: '/system [文本]', summary: '查看/替换系统提示词' },
  { name: 'compact', usage: '/compact', summary: '压缩历史对话' },
  { name: 'cwd', usage: '/cwd [路径]', summary: '切换工作区' },
  { name: 'verify', usage: '/verify', summary: '运行验收命令' },
  { name: 'phase', usage: '/phase [next|阶段名]', summary: '切换计划阶段' },
  { name: 'review', usage: '/review', summary: '独立审查最近交付' },
  { name: 'prefer', usage: '/prefer [文本|clear]', summary: '追加用户偏好' },
  { name: 'image', usage: '/image <路径|clear>', summary: '附加图片' },
  { name: 'undo', usage: '/undo', summary: '回滚上一轮文件修改' },
  { name: 'save', usage: '/save', summary: '立刻保存对话' },
  { name: 'setup', usage: '/setup', summary: '打开模型设置' },
  { name: 'help', usage: '/help', summary: '查看命令与快捷键' },
];

export interface PublicProvider {
  name: string;
  protocol: 'openai' | 'anthropic';
  model: string;
  baseUrl: string;
  hasKey: boolean;
  keySource: 'env' | 'config' | 'local' | 'none';
  apiKeyEnv?: string;
}

export interface PublicTool {
  name: string;
  description: string;
  approval: string;
  permission: string;
  enabled: boolean;
  builtin: boolean;
}

export interface PublicTrust {
  status: 'none' | 'pending' | 'trusted';
  workspace: string;
  hasConfig: boolean;
  hasPlugins: boolean;
  hasAgentDoc: boolean;
}

export interface GuiInfo {
  version: string;
  name: string;
  workspace: string;
  sessionDir: string;
  currentProvider: string;
  model: string;
  providerError: string | null;
  providers: PublicProvider[];
  permissions: AppConfig['permissions'];
  search: {
    mode: string;
    provider: string;
    deep: boolean;
    deepPages: number;
    language: string;
    hasTavily: boolean;
    hasBrave: boolean;
  };
  showReasoning: boolean;
  allowOutsideWorkspace: boolean;
  maxSteps: number;
  maxContextChars: number;
  uiGuard: string;
  systemPrompt: string;
  agentDocPath?: string;
  preferences: string[];
  verifyCommands: string[];
  trust: PublicTrust | null;
  tools: PublicTool[];
  commands: typeof GUI_COMMANDS;
  terminal: { available: boolean };
  isDesktop: boolean;
}

export interface Bootstrap {
  info: GuiInfo;
  sessions: SessionSummary[];
  session: Session;
  agentDoc?: string;
}

export interface ApprovalRequest {
  id: string;
  kind: 'shell' | 'write' | 'network';
  summary: string;
  preview?: string;
}

export interface SettingsPatch {
  current?: string;
  provider?: {
    name?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    clearKey?: boolean;
  };
  permissions?: Partial<AppConfig['permissions']>;
  search?: Partial<AppConfig['search']> & { tavilyKey?: string; braveKey?: string; clearTavily?: boolean; clearBrave?: boolean };
  showReasoning?: boolean;
  allowOutsideWorkspace?: boolean;
  maxSteps?: number;
  maxContextChars?: number;
  uiGuard?: 'off' | 'warn' | 'enforce';
  systemPrompt?: string;
  preferences?: string[];
  verifyCommands?: string[];
}

export type ServerEvent = {
  type: string;
  [key: string]: unknown;
};

export interface SessionGroup {
  workspace: string;
  label: string;
  sessions: SessionSummary[];
}

export function summarizeTool(tool: Tool): PublicTool {
  return {
    name: tool.name,
    description: tool.description,
    approval: tool.approval,
    permission: 'allow',
    enabled: true,
    builtin: false,
  };
}
