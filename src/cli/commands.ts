import type { AppConfig } from '../config/config.ts';
import { defaultSystemPrompt, loadAgentDoc, saveConfig } from '../config/config.ts';
import { formatCost } from '../providers/pricing.ts';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Provider } from '../providers/types.ts';
import { createProvider } from '../providers/index.ts';
import type { Session, SessionStore } from '../session/store.ts';
import type { Tool } from '../tools/index.ts';
import { allTools, permissionFor } from '../tools/index.ts';
import * as ui from './ui.ts';

export interface CommandContext {
  config: AppConfig;
  store: SessionStore;
  session: Session;
  provider: Provider;
  tools: Tool[];
  ask: (question: string) => Promise<string>;
  confirm: (question: string) => Promise<boolean>;
  setSession: (session: Session) => void;
  setSessionAndSave: (session: Session) => Promise<void>;
  setProvider: (provider: Provider) => void;
  setConfig: (config: AppConfig) => void;
  setTools: (tools: Tool[]) => void;
  saveSession: () => Promise<void>;
  reloadProvider: () => void;
  compactNow: () => Promise<void>;
  runSetup: () => Promise<void>;
  undo: () => Promise<{
    restored: number;
    deleted: number;
    skipped: string[];
    turn: { turnId: string } | null;
  }>;
  clearBackups: (sessionId: string) => Promise<void>;
  attachImage: (path: string) => Promise<{ ok: boolean; message: string }>;
  listImages: () => string[];
  clearImages: () => void;
  clearScreen: () => void;
  exit: () => void;
}

export interface Command {
  name: string;
  aliases?: string[];
  usage: string;
  summary: string;
  run: (args: string, ctx: CommandContext) => Promise<void>;
}

function requireArgs(args: string, usage: string): string {
  if (!args.trim()) throw new Error(`用法: ${usage}`);
  return args.trim();
}

const helpCommand: Command = {
  name: 'help',
  aliases: ['h', '?'],
  usage: '/help',
  summary: '显示可用命令',
  async run(_args, ctx) {
    ui.line(ui.c.bold('命令'));
    const nameWidth = Math.min(
      12,
      Math.max(...commands.map((command) => ui.displayWidth(command.name))) + 2,
    );
    const usageWidth = Math.min(
      28,
      Math.max(...commands.map((command) => ui.displayWidth(command.usage))) + 2,
    );
    for (const command of commands) {
      const alias = command.aliases?.length ? ` (${command.aliases.join(', ')})` : '';
      ui.line(
        `  ${ui.c.cyan(ui.padDisplay(command.name, nameWidth))}${ui.c.dim(ui.padDisplay(ui.truncateDisplay(command.usage, usageWidth), usageWidth))}${command.summary}${ui.c.dim(alias)}`,
      );
    }
    ui.line('');
    ui.hint('  直接输入文字即可与 agent 对话 · 输入 @ 后按 Tab 补全文件路径 · 行尾加 \\ 续行');
  },
};

const newCommand: Command = {
  name: 'new',
  usage: '/new [标题]',
  summary: '开一个新对话（当前对话已自动保存）',
  async run(args, ctx) {
    const session = ctx.store.create(args.trim() || '新对话');
    await ctx.setSessionAndSave(session);
    ui.ok(`新对话 ${ui.c.dim(session.id)}${args.trim() ? ` · ${args.trim()}` : ''}`);
  },
};

const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  usage: '/list',
  summary: '列出历史对话',
  async run(_args, ctx) {
    const sessions = await ctx.store.list();
    if (!sessions.length) return ui.hint('还没有历史对话。');
    ui.line(ui.c.bold('  #  会话 ID            轮数  更新时间   标题'));
    sessions.forEach((item, index) => {
      const marker = item.id === ctx.session.id ? ui.c.green('*') : ' ';
      ui.line(
        `${marker} ${String(index + 1).padStart(2)}  ${ui.c.cyan(item.id)}  ${String(item.turns).padStart(3)}  ${ui.padDisplay(ui.relativeTime(item.updatedAt), 9)}${ui.preview(item.title, 40)}`,
      );
    });
    ui.hint('  用 /use <序号|id前缀|标题关键词> 切换。');
  },
};

const useCommand: Command = {
  name: 'use',
  aliases: ['switch', 'resume'],
  usage: '/use <序号|id前缀|标题>',
  summary: '切换到某个历史对话',
  async run(args, ctx) {
    const query = requireArgs(args, '/use <序号|id前缀|标题>');
    const session = await ctx.store.find(query);
    if (!session) return ui.error(`没找到匹配 "${query}" 的对话。用 /list 看看有哪些。`);
    await ctx.setSessionAndSave(session);
    ui.ok(`已切换到 ${ui.c.dim(session.id)} · ${session.title}`);
    ui.hint(`  ${session.messages.length} 条消息，最后更新 ${ui.relativeTime(session.updatedAt)}`);
  },
};

const renameCommand: Command = {
  name: 'rename',
  usage: '/rename <新标题>',
  summary: '给当前对话改名',
  async run(args, ctx) {
    const title = requireArgs(args, '/rename <新标题>');
    ctx.session.title = title;
    await ctx.saveSession();
    ui.ok(`已改名为 ${title}`);
  },
};

const deleteCommand: Command = {
  name: 'delete',
  aliases: ['rm'],
  usage: '/delete <序号|id前缀>',
  summary: '删除一个历史对话',
  async run(args, ctx) {
    const query = requireArgs(args, '/delete <序号|id前缀>');
    const session = await ctx.store.find(query);
    if (!session) return ui.error(`没找到匹配 "${query}" 的对话。`);
    const confirmed = await ctx.confirm(`确定删除对话 ${session.id}（${session.title}）？不可恢复`);
    if (!confirmed) return ui.hint('已取消。');
    await ctx.store.remove(session.id);
    await ctx.clearBackups(session.id);
    ui.ok(`已删除 ${session.id}`);
    if (session.id === ctx.session.id) {
      const replacement = ctx.store.create('新对话');
      await ctx.setSessionAndSave(replacement);
      ui.hint('  当前对话已清空并切换到新对话。');
    }
  },
};

const clearCommand: Command = {
  name: 'clear',
  usage: '/clear',
  summary: '清空当前对话的上下文（重新开始）',
  async run(_args, ctx) {
    const confirmed = await ctx.confirm('清空当前对话的所有消息？历史文件会被覆盖');
    if (!confirmed) return ui.hint('已取消。');
    ctx.session.messages = [];
    ctx.session.todos = [];
    ctx.session.usage = { inputTokens: 0, outputTokens: 0 };
    await ctx.saveSession();
    ui.ok('上下文已清空。');
  },
};

const sessionCommand: Command = {
  name: 'session',
  usage: '/session',
  summary: '查看当前对话信息',
  async run(_args, ctx) {
    const userTurns = ctx.session.messages.filter((m) => m.role === 'user').length;
    const toolCalls = ctx.session.messages.reduce((total, m) => total + (m.toolCalls?.length ?? 0), 0);
    const usage = ctx.session.usage;
    const lines = [
      `${ui.c.bold('id')}      ${ctx.session.id}`,
      `${ui.c.bold('标题')}    ${ctx.session.title}`,
      `${ui.c.bold('模型')}    ${ctx.provider.name} / ${ctx.provider.model}`,
      `${ui.c.bold('工作区')}  ${ctx.config.workspace}`,
      `${ui.c.bold('消息')}    ${ctx.session.messages.length} 条（用户 ${userTurns} 轮，工具调用 ${toolCalls} 次）`,
      `${ui.c.bold('创建')}    ${ctx.session.createdAt}`,
      `${ui.c.bold('更新')}    ${ui.relativeTime(ctx.session.updatedAt)}`,
    ];
    if (usage) {
      const cost = usage.costUsd ? ` · 估算 ${formatCost(usage.costUsd)}` : '';
      lines.push(`${ui.c.bold('用量')}    in ${usage.inputTokens} / out ${usage.outputTokens}${cost}`);
    }
    if (ctx.session.todos?.length) {
      lines.push(
        `${ui.c.bold('任务')}    ${ctx.session.todos.map((todo) => `${todo.status === 'done' ? '☑' : todo.status === 'in_progress' ? '◐' : '☐'} ${todo.text}`).join('；')}`,
      );
    }
    ui.line(lines.join('\n'));
  },
};

const historyCommand: Command = {
  name: 'history',
  usage: '/history',
  summary: '查看当前对话的消息',
  async run(_args, ctx) {
    const messages = ctx.session.messages;
    if (!messages.length) return ui.hint('当前对话还没有消息。');
    messages.forEach((message, index) => {
      const label =
        message.role === 'user' ? ui.c.cyan('你') : message.role === 'assistant' ? ui.c.green('AI') : ui.c.magenta(`工具:${message.name}`);
      const calls = message.toolCalls?.map((call) => ` [调用 ${call.name}]`).join('') ?? '';
      ui.line(
        `${ui.c.dim(String(index).padStart(3))} ${label} ${ui.preview(message.content || calls || '(空)', 160)}${ui.c.dim(message.isError ? ' [错误]' : '')}`,
      );
    });
  },
};

const providerCommand: Command = {
  name: 'provider',
  usage: '/provider [名称]',
  summary: '查看/切换模型供应商',
  async run(args, ctx) {
    const names = Object.keys(ctx.config.providers);
    if (!args.trim()) {
      ui.line(ui.c.bold('可用 provider（* 为当前）'));
      for (const name of names) {
        const provider = ctx.config.providers[name]!;
        const marker = name === ctx.config.current ? ui.c.green('*') : ' ';
        ui.line(
          `${marker} ${ui.c.cyan(ui.padDisplay(name, 12))}${ui.c.dim(ui.padDisplay(provider.protocol, 10))}${provider.model}`,
        );
      }
      ui.hint('  用 /provider <名称> 切换；/model <模型名> 只换模型。');
      return;
    }

    const name = args.trim();
    if (!ctx.config.providers[name]) {
      ui.error(`未知 provider "${name}"。可用: ${names.join(', ')}`);
      return;
    }
    ctx.config.current = name;
    ctx.session.provider = name;
    await ctx.setProvider(createProvider(name, ctx.config));
    await saveConfig(ctx.config);
    ctx.session.model = ctx.provider.model;
    await ctx.saveSession();
    ui.ok(`已切换到 ${ui.c.cyan(name)} · ${ctx.provider.model}`);
  },
};

const modelCommand: Command = {
  name: 'model',
  usage: '/model [模型名]',
  summary: '查看/切换当前 provider 的模型',
  async run(args, ctx) {
    const provider = ctx.config.providers[ctx.config.current];
    if (!provider) return ui.error('当前 provider 不存在。');
    if (!args.trim()) {
      ui.line(`${ui.c.bold(ctx.config.current)} 当前模型: ${ui.c.cyan(provider.model)}`);
      ui.hint('  用 /model gpt-4o 之类的命令切换，或设置 BANANA_MODEL 环境变量。');
      return;
    }
    provider.model = args.trim();
    await ctx.setProvider(createProvider(ctx.config.current, ctx.config));
    await saveConfig(ctx.config);
    ctx.session.model = ctx.provider.model;
    await ctx.saveSession();
    ui.ok(`模型已切到 ${ui.c.cyan(provider.model)}`);
  },
};

const permCommand: Command = {
  name: 'perm',
  usage: '/perm <类别> <模式>',
  summary: '设置工具权限策略（shell / write / network）',
  async run(args, ctx) {
    const parts = args.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) {
      ui.line(ui.c.bold('当前权限'));
      for (const key of ['shell', 'write', 'network'] as const) {
        ui.line(`  ${ui.c.cyan(key.padEnd(8))}${ctx.config.permissions[key]}`);
      }
      ui.hint('  ask = 每次询问，allow = 直接执行，deny = 禁止。设置后写入 ~/.banana/config.json。');
      return;
    }
    const [category, mode] = parts as [string, string];
    if (!['shell', 'write', 'network'].includes(category)) {
      ui.error('类别只能是 shell / write / network。');
      return;
    }
    if (!mode || !['ask', 'allow', 'deny'].includes(mode)) {
      ui.error('模式只能是 ask / allow / deny。');
      return;
    }
    ctx.config.permissions[category as 'shell' | 'write' | 'network'] = mode as 'ask' | 'allow' | 'deny';
    await saveConfig(ctx.config);
    ui.ok(`${category} 权限已设为 ${mode}`);
  },
};

const toolsCommand: Command = {
  name: 'tools',
  usage: '/tools [名称|all]',
  summary: '查看工具列表或启用/禁用工具',
  async run(args, ctx) {
    const registry = [
      ...allTools,
      ...ctx.tools.filter((tool) => !allTools.some((builtin) => builtin.name === tool.name)),
    ];
    const enabled = new Set(ctx.tools.map((tool) => tool.name));
    if (!args.trim()) {
      ui.line(ui.c.bold('工具（* 已启用）'));
      for (const tool of registry) {
        const on = enabled.has(tool.name);
        const marker = on ? ui.c.green('*') : ' ';
        const permission = on ? permissionFor(ctx.config.permissions, tool) : '—';
        ui.line(
          `${marker} ${ui.c.cyan(ui.padDisplay(tool.name, 14))}${ui.c.dim(ui.padDisplay(`[${tool.approval}/${permission}]`, 20))}${ui.truncateDisplay(tool.description, 70)}`,
        );
      }
      ui.hint('  /tools <名称> 切换启用状态，/tools all 全部启用。');
      return;
    }

    const target = args.trim();
    if (target === 'all') {
      ctx.setTools(registry);
      ui.ok(`已启用全部 ${registry.length} 个工具。`);
      return;
    }
    const known = registry.find((tool) => tool.name === target);
    if (!known) return ui.error(`未知工具 "${target}"。可用: ${registry.map((tool) => tool.name).join(', ')}`);
    if (enabled.has(target)) {
      ctx.setTools(ctx.tools.filter((tool) => tool.name !== target));
      ui.ok(`已禁用 ${target}`);
    } else {
      ctx.setTools([...ctx.tools, known]);
      ui.ok(`已启用 ${target}`);
    }
  },
};

const systemCommand: Command = {
  name: 'system',
  usage: '/system [新的系统提示词]',
  summary: '查看/替换系统提示词',
  async run(args, ctx) {
    if (!args.trim()) {
      ui.line(ctx.config.systemPrompt);
      if (ctx.config.agentDocPath) {
        ui.hint(`  项目规则：${ctx.config.agentDocPath}（会追加在系统提示词之后）`);
      }
      ui.hint('  用 /system <新内容> 覆盖（会写入配置文件）。');
      return;
    }
    ctx.config.systemPrompt = args.trim();
    await saveConfig(ctx.config);
    ui.ok('系统提示词已更新。');
  },
};

const compactCommand: Command = {
  name: 'compact',
  usage: '/compact',
  summary: '手动压缩历史对话',
  async run(_args, ctx) {
    if (ctx.session.messages.length < 4) return ui.hint('消息太少，不用压缩。');
    await ctx.compactNow();
  },
};

const workspaceCommand: Command = {
  name: 'cwd',
  usage: '/cwd [路径]',
  summary: '查看/切换工具的工作目录',
  async run(args, ctx) {
    if (!args.trim()) {
      ui.line(ctx.config.workspace);
      return;
    }
    const requested = args.trim();
    const target = isAbsolute(requested) ? requested : resolve(ctx.config.workspace, requested);
    if (!existsSync(target)) return ui.error(`目录不存在: ${target}`);
    const answer = await ctx.confirm(`把工作目录切到 ${target}？agent 的文件工具范围会随之改变`);
    if (!answer) return ui.hint('已取消。');
    const previousWorkspace = ctx.config.workspace;
    ctx.config.workspace = target;
    if (ctx.config.systemPrompt === defaultSystemPrompt(previousWorkspace)) {
      ctx.config.systemPrompt = defaultSystemPrompt(target);
    }
    const doc = await loadAgentDoc(target);
    ctx.config.agentDoc = doc?.content;
    ctx.config.agentDocPath = doc?.path;
    await saveConfig(ctx.config);
    ui.ok(`工作目录已改为 ${target}`);
    if (doc) ui.hint(`  已加载项目规则 ${doc.path}`);
    ui.hint('  注意：路径越界限制基于这个目录，重启后仍生效。');
  },
};

const envCommand: Command = {
  name: 'env',
  usage: '/env',
  summary: '打印环境询问模板，填进 AGENT.md 后可避免重复探测',
  async run() {
    ui.line(
      [
        '开始前请确认（可只填你知道的，不确定写“不确定”）：',
        '1 系统/Shell：',
        '2 语言与版本：',
        '3 包管理器：',
        '4 关键工具（git/jq/rg/docker/…）：',
        '5 项目路径：',
        '6 启动/测试/构建命令：',
        '7 已知限制（无 sudo/需代理/无 GPU 等）：',
      ].join('\n'),
    );
    ui.hint('  把答案写进项目根目录的 AGENT.md；Agent 会直接采用，不再重复验证。');
  },
};

export const commands: Command[] = [
  helpCommand,
  newCommand,
  listCommand,
  useCommand,
  renameCommand,
  deleteCommand,
  clearCommand,
  sessionCommand,
  historyCommand,
  providerCommand,
  modelCommand,
  permCommand,
  toolsCommand,
  systemCommand,
  compactCommand,
  workspaceCommand,
  envCommand,
  {
    name: 'image',
    usage: '/image <路径|clear>',
    summary: '给下一条消息附加图片（png/jpg/gif/webp）',
    async run(args, ctx) {
      const arg = args.trim();
      if (!arg) {
        const images = ctx.listImages();
        if (!images.length) {
          ui.hint('还没有待发送的图片。用 /image <路径> 附加，例如 /image screenshot.png');
          return;
        }
        ui.line(`待发送图片：${images.length} 张（下一条消息一起提交）`);
        return;
      }
      if (arg === 'clear') {
        ctx.clearImages();
        ui.ok('已清除待发送的图片。');
        return;
      }
      const result = await ctx.attachImage(arg);
      if (result.ok) ui.ok(result.message);
      else ui.error(result.message);
    },
  },
  {
    name: 'undo',
    usage: '/undo',
    summary: '回滚上一轮对文件的修改（不含 shell 副作用）',
    async run(_args, ctx) {
      const result = await ctx.undo();
      if (!result.turn) {
        return ui.hint('没有可回滚的文件改动（只记录 write_file / edit_file，shell 命令不在范围内）。');
      }
      ui.ok(
        `已回滚 ${result.turn.turnId}：恢复 ${result.restored} 个文件，删除 ${result.deleted} 个新建文件。`,
      );
      if (result.skipped.length) {
        ui.warn(`  ${result.skipped.length} 个文件超过 4MB，没有备份，无法恢复：`);
        for (const file of result.skipped) ui.hint(`  - ${file}`);
      }
      ui.hint('  只回滚文件内容，对话记录和 shell 命令的副作用不会撤销。');
    },
  },
  {
    name: 'setup',
    usage: '/setup',
    summary: '重新配置 provider / 模型 / API key（无需退出）',
    async run(_args, ctx) {
      await ctx.runSetup();
    },
  },
  {
    name: 'save',
    usage: '/save',
    summary: '立即保存当前对话',
    async run(_args, ctx) {
      await ctx.saveSession();
      ui.ok(`已保存 ${ctx.session.id}`);
    },
  },
  {
    name: 'cls',
    aliases: ['clear-screen'],
    usage: '/cls',
    summary: '清屏',
    async run(_args, ctx) {
      ctx.clearScreen();
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    usage: '/exit',
    summary: '退出（先保存对话）',
    async run(_args, ctx) {
      await ctx.saveSession();
      ui.ok(`再见，对话已保存到 ${ctx.session.id}`);
      ctx.exit();
    },
  },
];

export function findCommand(token: string): Command | undefined {
  return commands.find(
    (command) => command.name === token || command.aliases?.includes(token),
  );
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[cols - 1]!;
}

/** 输错命令时给一个最接近的建议（比如 /providr -> /provider）。 */
export function suggestCommand(token: string): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const command of commands) {
    for (const candidate of [command.name, ...(command.aliases ?? [])]) {
      const distance = editDistance(token.toLowerCase(), candidate.toLowerCase());
      if (!best || distance < best.distance) best = { name: command.name, distance };
    }
  }
  if (!best) return undefined;
  const threshold = Math.max(2, Math.floor(token.length / 3));
  return best.distance <= threshold ? best.name : undefined;
}