import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { TerminalManager, loadPty, normalizeCwd } from './terminal.ts';
import { bananaHome, formatPreferences, loadConfig, trustProject, type AppConfig } from '../config/config.ts';
import { KNOWLEDGE_VERSION, PROMPT_VERSION } from '../config/version.ts';
import { runTurn } from '../agent/loop.ts';
import {
  REASONING_LEVELS,
  supportsReasoning,
  type ReasoningLevel,
} from '../providers/reasoning.ts';
import type { MessageAttachment } from '../providers/types.ts';
import { compactMessages } from '../agent/context.ts';
import { createProvider } from '../providers/index.ts';
import { estimateCost, formatCost, resolvePricing } from '../providers/pricing.ts';
import { SessionStore, deriveTitle, type AgentMode, type Session, type SessionPlan } from '../session/store.ts';
import { BackupStore, newTurnId } from '../session/backups.ts';
import { TraceWriter } from '../session/trace.ts';
import { canAdvance, nextPhase } from '../session/phases.ts';
import { allTools, permissionFor, summarizeInput, type ApprovalKind, type Tool, type ToolContext } from '../tools/index.ts';
import { loadPluginTools, pluginTemplate } from '../tools/plugins.ts';
import { formatTodos } from '../tools/todo.ts';
import { resolvePath } from '../tools/fs.ts';
import { commands, findCommand, suggestCommand } from '../cli/commands.ts';
import { completeCommand, completeFileReference } from '../cli/completion.ts';
import { captureOutput } from '../cli/ui.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const VENDOR_FILES: Record<string, string> = {
  'xterm.js': '@xterm/xterm/lib/xterm.js',
  'xterm.css': '@xterm/xterm/css/xterm.css',
  'addon-fit.js': '@xterm/addon-fit/lib/addon-fit.js',
  'highlight.min.js': '@highlightjs/cdn-assets/highlight.min.js',
};
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT = 120_000;
const PLAN_TOOLS = new Set([
  'read_file',
  'list_dir',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
  'todo_read',
  'todo_write',
  'memory_read',
  'memory_write',
]);
const ATTACHMENT_MIME: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.jsx': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.htm': 'text/html',
  '.xml': 'application/xml', '.yml': 'text/yaml', '.yaml': 'text/yaml', '.toml': 'text/toml',
  '.py': 'text/x-python', '.go': 'text/x-go', '.rs': 'text/x-rust', '.java': 'text/x-java',
  '.c': 'text/x-c', '.h': 'text/x-c', '.cpp': 'text/x-c++', '.hpp': 'text/x-c++',
  '.sh': 'text/x-sh', '.bash': 'text/x-sh', '.ps1': 'text/x-powershell', '.sql': 'text/x-sql',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml',
  '.toml', '.css', '.scss', '.html', '.sh', '.bash', '.zsh', '.py', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.sql', '.xml', '.ini', '.conf', '.env', '.gitignore', '.lock',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '__pycache__',
  '.venv', 'venv', 'target', '.cache', '.idea', '.gradle',
]);

/**
 * 静态资源目录。同一个包在两种形态下路径不同，所以按候选顺序找第一个真实存在的：
 * - 源码运行：src/server/ -> src/ui
 * - 编译产物：dist/server/ -> dist/ui（构建时由 scripts/copy-ui.mjs 复制）
 * - 兜底：包根 ui/ 或环境变量指定的目录（GUI 独立包用这个）
 */
export function resolveAssetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.BANANA_UI_DIR,
    join(here, '..', 'ui'),
    join(here, '..', '..', 'ui'),
    join(here, '..', '..', 'src', 'ui'),
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  // 都找不到时返回默认位置，让 404 报错能指向一个具体路径
  return join(here, '..', 'ui');
}

let activeAssetsDir: string | null = null;

function assetRoot(): string {
  return activeAssetsDir ?? resolveAssetsDir();
}

interface DiffLine {
  type: 'ctx' | 'add' | 'del';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

/** 行级 diff：小文件用 LCS，大文件退化成整段替换，避免把服务卡住。 */
function lineDiff(before: string, after: string): { lines: DiffLine[]; additions: number; deletions: number; truncated: boolean } {
  const left = before ? before.split(/\r?\n/) : [];
  const right = after ? after.split(/\r?\n/) : [];
  const n = left.length;
  const m = right.length;
  const ops: Array<{ type: 'ctx' | 'add' | 'del'; text: string }> = [];
  let additions = 0;
  let deletions = 0;

  if (n * m > 1_200_000) {
    for (const text of left) { ops.push({ type: 'del', text }); deletions += 1; }
    for (const text of right) { ops.push({ type: 'add', text }); additions += 1; }
  } else {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        const diag = table[(i + 1) * width + j + 1] ?? 0;
        const down = table[(i + 1) * width + j] ?? 0;
        const rightward = table[i * width + j + 1] ?? 0;
        table[i * width + j] = left[i] === right[j] ? diag + 1 : Math.max(down, rightward);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      const a = left[i] ?? '';
      const b = right[j] ?? '';
      const down = table[(i + 1) * width + j] ?? 0;
      const rightward = table[i * width + j + 1] ?? 0;
      if (a === b) {
        ops.push({ type: 'ctx', text: a });
        i += 1;
        j += 1;
      } else if (down >= rightward) {
        ops.push({ type: 'del', text: a });
        deletions += 1;
        i += 1;
      } else {
        ops.push({ type: 'add', text: b });
        additions += 1;
        j += 1;
      }
    }
    while (i < n) { ops.push({ type: 'del', text: left[i++] ?? '' }); deletions += 1; }
    while (j < m) { ops.push({ type: 'add', text: right[j++] ?? '' }); additions += 1; }
  }

  // 只保留改动附近 3 行上下文，跳过的部分用省略行代替
  const keep = new Set<number>();
  ops.forEach((op, index) => {
    if (op.type === 'ctx') return;
    for (let k = Math.max(0, index - 3); k <= Math.min(ops.length - 1, index + 3); k += 1) keep.add(k);
  });
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let lastKept = true;
  let truncated = lines.length >= 800;
  ops.forEach((op, index) => {
    if (!keep.has(index)) {
      if (lastKept && lines.length < 800) {
        lines.push({ type: 'ctx', text: '…', oldLine: null, newLine: null });
      }
      lastKept = false;
      if (op.type !== 'add') oldLine += 1;
      if (op.type !== 'del') newLine += 1;
      return;
    }
    lastKept = true;
    if (lines.length >= 800) { truncated = true; return; }
    lines.push({
      type: op.type,
      text: op.text,
      oldLine: op.type === 'add' ? null : oldLine,
      newLine: op.type === 'del' ? null : newLine,
    });
    if (op.type !== 'add') oldLine += 1;
    if (op.type !== 'del') newLine += 1;
  });
  return { lines, additions, deletions, truncated };
}

export interface UiServerOptions {
  config: AppConfig;
  store: SessionStore;
  tools: Tool[];
  /** 启动时加载的插件工具；运行中重载插件时只替换这部分。 */
  pluginTools?: Tool[];
  port?: number;
  host?: string;
  /** 静态资源目录（GUI 独立包会传入自己的 ui/ 目录）。 */
  assetsDir?: string;
}

interface ActiveTurn {
  controller: AbortController;
  pending: Map<string, (allowed: boolean) => void>;
  session: Session;
}

function attachmentKind(name: string, mime = ''): MessageAttachment['kind'] {
  const ext = extname(name).toLowerCase();
  const type = (mime || ATTACHMENT_MIME[ext] || '').toLowerCase();
  if (type.startsWith('image/') && ext !== '.svg') return 'image';
  if (type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    type.startsWith('text/') ||
    /(json|xml|javascript|yaml|toml|sql|python|x-go|x-rust|x-java|x-c|x-sh|x-powershell)/.test(type) ||
    TEXT_EXT.has(ext)
  ) {
    return 'text';
  }
  return 'binary';
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 把非图片附件转成给模型的文本上下文；PDF/Office/二进制只给路径和元信息。 */
async function attachmentContextFor(items: MessageAttachment[]): Promise<string> {
  const blocks: string[] = [];
  for (const item of items) {
    const kind = item.kind ?? attachmentKind(item.name, item.mime);
    const meta = `${item.name}（${kind}，${formatBytes(item.size) || '大小未知'}）`;
    if (kind === 'text') {
      try {
        const info = await stat(item.path);
        if (info.size <= MAX_FILE_BYTES) {
          const content = await readFile(item.path, 'utf8');
          blocks.push(`### 附件：${meta}\n路径：${item.path}\n\n\`\`\`\n${content.slice(0, MAX_ATTACHMENT_TEXT)}${content.length > MAX_ATTACHMENT_TEXT ? '\n…[已截断]' : ''}\n\`\`\``);
          continue;
        }
      } catch {
        /* 读不到就退化成路径说明 */
      }
    }
    if (kind === 'text') {
      // 文本文件过大或读取失败时，至少把路径和元信息交给模型，不能静默丢掉。
      blocks.push(`### 附件：${meta}\n路径：${item.path}\n（文件较大或读取失败，未自动注入正文；需要时用工具按路径读取。）`);
    } else if (kind === 'pdf' || kind === 'binary') {
      blocks.push(`### 附件：${meta}\n路径：${item.path}\n（未解析正文；需要时用工具按路径读取或让用户提供预览。）`);
    }
  }
  if (!blocks.length) return '';
  return `用户附带了以下文件：\n\n${blocks.join('\n\n')}`;
}

function planFallbackItems(text: string): SessionPlan['items'] {
  const lines = text.split(/\r?\n/);
  const items: SessionPlan['items'] = [];
  for (const line of lines) {
    const match = /^\s*(?:\d+[.)、]|[-*])\s+(.{2,120})$/.exec(line);
    if (!match) continue;
    const value = match[1]!.replace(/[*`#]/g, '').trim();
    if (!value || /^```/.test(value)) continue;
    items.push({ text: value, status: 'pending' });
    if (items.length >= 8) break;
  }
  return items;
}

function sanitizePlanItems(raw: unknown): SessionPlan['items'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const text = String(item['text'] ?? '').trim();
      const status =
        item['status'] === 'done' || item['status'] === 'in_progress' ? item['status'] : 'pending';
      const phase = typeof item['phase'] === 'string' ? item['phase'].trim() : '';
      const verify = typeof item['verify'] === 'string' ? item['verify'].trim() : '';
      const confidence =
        item['confidence'] === 'high' || item['confidence'] === 'medium' || item['confidence'] === 'low'
          ? item['confidence']
          : undefined;
      const files = Array.isArray(item['files'])
        ? item['files'].map((file) => String(file).trim()).filter(Boolean).slice(0, 20)
        : [];
      const dependsOn = Array.isArray(item['dependsOn'])
        ? item['dependsOn'].map((name) => String(name).trim()).filter(Boolean).slice(0, 10)
        : [];
      return {
        text,
        status,
        ...(phase ? { phase } : {}),
        ...(files.length ? { files } : {}),
        ...(verify ? { verify } : {}),
        ...(confidence ? { confidence } : {}),
        ...(dependsOn.length ? { dependsOn } : {}),
      } as SessionPlan['items'][number];
    })
    .filter((item) => item.text.length > 0)
    .slice(0, 50);
}

function planSystemPrompt(base: string): string {
  return [
    base,
    '',
    '## 当前是 Plan 模式（只读）',
    '你正在做方案设计，不是执行。不要修改文件，也不要运行会改变状态的命令。',
    '先读相关代码和配置，确认现状后再给计划，禁止凭空猜文件或 API。',
    '必须调用 todo_write 生成 3–7 项结构化计划，每项写清要做什么；尽量填 phase、files、verify、confidence。',
    'Plan 阶段所有条目的 status 必须是 pending；不要标 in_progress 或 done，因为还没有开始执行。',
    '正文里补充：能做到什么、做不到什么、需要用户决定什么、还有哪些未验证项。',
    '计划写完后停下，等待用户批准。不要声称已经完成改动。',
    '用户批准后系统会切到 Build 模式并让你按清单执行。',
  ].join('\n');
}

export interface UiServerHandle {
  url: string;
  token: string;
  port: number;
  close: () => Promise<void>;
}

/** 启动只监听回环地址的本地 GUI 服务；token 保护所有接口。 */
export async function startUiServer(options: UiServerOptions): Promise<UiServerHandle> {
  const { config, store } = options;
  const token = randomBytes(24).toString('hex');
  const host = options.host ?? '127.0.0.1';
  const prefix = `/t/${token}`;
  const assets = options.assetsDir ?? resolveAssetsDir();
  activeAssetsDir = assets;
  // 界面资源缺失时界面会是空白页，很容易被误判成「服务挂了」，这里说清原因
  if (!existsSync(join(assets, 'index.html'))) {
    process.stderr.write(
      `界面资源缺失（${assets}），页面会打不开。\n` +
        '多半是内核版本太旧或安装不完整，重新安装即可：npm install -g @vincentbanana/bananacli\n',
    );
  }
  let turn: ActiveTurn | null = null;
  // 当前会话记在服务进程内存里：新建对话后所有后续请求都认它，
  // 不再依赖「磁盘上谁最新」这种容易串台的推断。
  let activeId: string | null = null;
  // 删光所有会话后保留一个“空白草稿”：它不落盘、不出现在侧栏，也不占标签。
  // 用户发出第一条消息时才真正创建会话。
  let blank: Session | null = null;
  // 内嵌终端：不弹外部窗口，命令在当前工作区里执行，cd 之后的工作目录会被记住
  let terminalCwd: string | null = null;
  let terminalChild: ReturnType<typeof spawn> | null = null;
  const terminalWorkdir = (): string =>
    terminalCwd && existsSync(terminalCwd) ? terminalCwd : config.workspace;

  const provider = () => createProvider(config.current, config);
  const backups = (sessionId: string): BackupStore =>
    new BackupStore(join(bananaHome(), 'backups'), sessionId);

  const info = async (session: Session): Promise<Record<string, unknown>> => ({
    version: '0.8.5',
    promptVersion: PROMPT_VERSION,
    knowledgeVersion: KNOWLEDGE_VERSION,
    preferences: config.preferences ?? [],
    provider: { name: config.current, model: config.providers[config.current]?.model ?? '', protocol: config.providers[config.current]?.protocol ?? 'openai' },
    reasoning: {
      level: session.reasoning ?? 'standard',
      levels: REASONING_LEVELS,
      supported: supportsReasoning(
        config.current,
        config.providers[config.current]?.protocol ?? 'openai',
        config.providers[config.current]?.model ?? '',
      ),
    },
    providers: Object.entries(config.providers).map(([name, item]) => ({
      name,
      model: item.model,
      protocol: item.protocol,
      current: name === config.current,
      keySaved: Boolean(item.apiKey),
      keyEnv: item.apiKeyEnv ?? null,
      // 环境变量名只是"配置里写了"，不代表真的设了值，所以把可用性也算出来
      keyReady: Boolean(item.apiKey || (item.apiKeyEnv && process.env[item.apiKeyEnv])),
    })),
    workspace: config.workspace,
    agentDoc: Boolean(config.agentDoc),
    agentDocPath: config.agentDocPath ?? null,
    projectTrust: config.projectTrust ?? null,
    platform: process.platform,
    permissions: config.permissions,
    systemPrompt: config.systemPrompt,
    showReasoning: config.showReasoning,
    search: {
      provider: config.search?.provider ?? 'auto',
      deep: Boolean(config.search?.deep),
      deepPages: Math.min(Math.max(Number(config.search?.deepPages) || 3, 1), 5),
      language: config.search?.language ?? 'en',
      tavily: {
        saved: Boolean(config.search?.tavilyKey),
        ready: Boolean(config.search?.tavilyKey || process.env['TAVILY_API_KEY'] || process.env['BANANA_TAVILY_KEY']),
        env: 'TAVILY_API_KEY',
      },
      brave: {
        saved: Boolean(config.search?.braveKey),
        ready: Boolean(config.search?.braveKey || process.env['BRAVE_API_KEY'] || process.env['BANANA_BRAVE_KEY']),
        env: 'BRAVE_API_KEY',
      },
    },
    disabledPlugins: config.disabledPlugins,
    tools: options.tools.map((tool) => ({ name: tool.name, approval: tool.approval, permission: permissionFor(config.permissions, tool) })),
    session: {
      id: session.id,
      title: session.title,
      draft: blank === session,
      // 图片 base64 和附件全文只用于请求模型，不必每次 /api/info 全量回传前端。
      messages: session.messages.map(({ images, attachmentContext, ...message }) => ({
        ...message,
        ...(images?.length ? { imageCount: images.length } : {}),
      })),
      todos: Array.isArray(session.todos) ? session.todos : [],
      facts: Array.isArray(session.facts) ? session.facts : [],
      unknowns: Array.isArray(session.unknowns) ? session.unknowns : [],
      verification: session.verification ?? null,
      usage: session.usage ?? { inputTokens: 0, outputTokens: 0 },
      mode: session.mode ?? 'build',
      reasoning: session.reasoning ?? 'standard',
      titleSource: session.titleSource ?? 'auto',
      plan: session.plan ?? null,
    },
  });

  /**
   * 首轮结束后用当前 provider 生成 8–12 字标题。
   * 失败 / 超时 / 返回不合规时回退到首条消息截断，绝不阻塞对话收尾太久。
   */
  const generateSessionTitle = async (session: Session): Promise<string> => {
    const firstUser = session.messages.find((message) => message.role === 'user');
    const fallback = deriveTitle(firstUser?.content ?? '');
    if (session.titleSource === 'user' || !firstUser?.content.trim()) return session.title || fallback;
    const firstAssistant = session.messages.find((message) => message.role === 'assistant');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    try {
      const result = await provider().generate({
        messages: [{
          role: 'user',
          content:
            `用户：${firstUser.content.slice(0, 1200)}\n\n` +
            `助手：${(firstAssistant?.content ?? '').slice(0, 1200)}\n\n` +
            '请给这段对话起一个 8–12 个字的中文标题。只输出标题，不要引号、句号、前缀或解释。',
        }],
        system: '你是标题生成器，只输出一个简洁的中文标题。',
        tools: [],
        signal: controller.signal,
        maxTokens: 32,
        temperature: 0.2,
      });
      const raw = (result.message.content ?? '').split(/\r?\n/)[0] ?? '';
      const title = raw
        .replace(/^#+\s*/, '')
        .replace(/^标题[:：]\s*/, '')
        .replace(/[「」“”"'《》]/g, '')
        .replace(/[。.!！?？,，;；:：]+$/g, '')
        .trim()
        .slice(0, 20);
      return title.length >= 2 ? title : fallback;
    } catch {
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  };

  const listSessions = async () => (await store.list()).map((item) => ({
    id: item.id,
    title: item.title,
    updatedAt: item.updatedAt,
    turns: item.turns,
  }));

  // ---------- 插件：本地插件工坊 ----------
  const builtinTools = options.tools.filter(
    (tool) => !(options.pluginTools ?? []).some((plugin) => plugin.name === tool.name),
  );
  const pluginDirs = () => {
    const dirs = [{ id: 'global', label: '全局插件', path: join(bananaHome(), 'tools') }];
    if (config.projectTrust?.status === 'trusted') {
      dirs.push({ id: 'project', label: '项目插件', path: join(config.workspace, '.banana', 'tools') });
    }
    return dirs;
  };
  const syncPlugins = async (): Promise<Record<string, unknown>> => {
    const dirs = pluginDirs();
    const result = await loadPluginTools(
      dirs.map((dir) => dir.path),
      new Set(builtinTools.map((tool) => tool.name)),
    );
    const disabled = new Set(config.disabledPlugins);
    const enabledTools = result.tools.filter((tool) => !disabled.has(tool.name));
    options.tools.splice(0, options.tools.length, ...builtinTools, ...enabledTools);
    return {
      dirs,
      plugins: result.plugins.map((plugin) => ({
        ...plugin,
        disabled: disabled.has(plugin.name),
        enabled: plugin.ok && !disabled.has(plugin.name),
      })),
      errors: result.errors,
      toolCount: options.tools.length,
    };
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      else res.end();
    });
  });

  // 内嵌终端：WebSocket 双向通道 + 真实 PTY（cmd / pwsh / bash）
  const terminals = new TerminalManager();
  void loadPty();
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname !== `${prefix}/api/terminal/ws`) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const shellId = url.searchParams.get('shell') ?? terminals.defaultShell().id;
        const cwd = normalizeCwd(url.searchParams.get('cwd'), config.workspace);
        const existing = url.searchParams.get('id');
        const session =
          (existing ? terminals.find(existing) : undefined) ??
          terminals.create(
            shellId,
            cwd,
            Number(url.searchParams.get('cols')) || 100,
            Number(url.searchParams.get('rows')) || 28,
          );
        ws.send(JSON.stringify({ type: 'id', id: session.id }));
        session.attach(ws);
      });
    } catch {
      socket.destroy();
    }
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (!url.pathname.startsWith(prefix)) return notFound(res);
    const path = url.pathname.slice(prefix.length) || '/';

    if (path === '/' || path === '/index.html') return sendFile(res, 'index.html');
    if (path === '/style.css') return sendFile(res, 'style.css');
    if (path === '/app.js') return sendFile(res, 'app.js');
    // 终端与语法高亮的本地资源：只放行固定文件，避免任意路径读取
    if (path.startsWith('/vendor/')) {
      const name = path.slice('/vendor/'.length);
      if (Object.hasOwn(VENDOR_FILES, name)) return sendFile(res, `vendor/${name}`);
      return notFound(res);
    }

    let session =
      turn?.session ??
      (activeId ? await store.load(activeId) : null) ??
      (blank ? null : await store.lastActive().then(async (id) => (id ? await store.load(id) : null)));
    if (!session) {
      // 没有会话时用一个不落盘的草稿承接界面状态；发第一条消息才保存。
      if (!blank) blank = store.create();
      session = blank;
      activeId = null;
    } else if (session !== blank) {
      blank = null;
      activeId = session.id;
    }

    if (path === '/api/info' && req.method === 'GET') return json(res, 200, await info(session));
    if (path === '/api/sessions' && req.method === 'GET') {
      return json(res, 200, { sessions: await listSessions(), current: blank === session ? null : session.id });
    }

    if (path === '/api/files' && req.method === 'GET') {
      const target = url.searchParams.get('path') ?? '.';
      try {
        return json(res, 200, { entries: await listTree(config, target) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (path === '/api/file' && req.method === 'GET') {
      const requested = url.searchParams.get('path') ?? '';
      try {
        const context = sandboxContext(config);
        const absolute = resolvePath(requested, context);
        const info = await stat(absolute);
        if (!info.isFile()) return json(res, 400, { error: '不是文件' });
        if (info.size > MAX_FILE_BYTES) return json(res, 200, { path: requested, tooLarge: true, bytes: info.size });
        const ext = extname(absolute).toLowerCase();
        if (!TEXT_EXT.has(ext) && ext !== '') {
          return json(res, 200, { path: requested, binary: true, bytes: info.size });
        }
        const content = await readFile(absolute, 'utf8');
        return json(res, 200, { path: requested, content, bytes: info.size, truncated: info.size >= MAX_FILE_BYTES });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (path === '/api/attachment' && req.method === 'GET') {
      const requested = url.searchParams.get('path') ?? '';
      const root = resolve(join(bananaHome(), 'attachments'));
      const absolute = resolve(requested);
      if (absolute !== root && !absolute.startsWith(root + sep)) {
        return json(res, 403, { error: '只能预览附件目录里的文件' });
      }
      try {
        const info = await stat(absolute);
        if (!info.isFile()) return json(res, 400, { error: '不是文件' });
        const name = absolute.split(/[\\/]/).pop() ?? '附件';
        const ext = extname(absolute).toLowerCase();
        const mime = ATTACHMENT_MIME[ext] ?? 'application/octet-stream';
        const kind = attachmentKind(name, mime);
        const base = { path: absolute, name, bytes: info.size, mime, kind };
        if (info.size > MAX_ATTACHMENT_BYTES) {
          return json(res, 200, { ...base, tooLarge: true });
        }
        if (kind === 'image' || (kind === 'pdf' && info.size <= 12 * 1024 * 1024)) {
          const buffer = await readFile(absolute);
          return json(res, 200, { ...base, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` });
        }
        if (kind === 'text') {
          const content = await readFile(absolute, 'utf8');
          return json(res, 200, {
            ...base,
            content: content.slice(0, MAX_ATTACHMENT_TEXT),
            truncated: content.length > MAX_ATTACHMENT_TEXT,
          });
        }
        return json(res, 200, base);
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (path === '/api/session' && req.method === 'POST') {
      const body = await readJson<{ ref?: string; title?: string; action?: string; value?: string }>(req);
      // 一轮还没结束时不要换会话：否则旧 turn 的结果会写到新会话，界面标题和正文也会串台。
      const busyAction =
        body.action === 'new' ||
        body.action === 'switch' ||
        body.action === 'delete' ||
        body.action === 'clear';
      if (turn && busyAction) {
        return json(res, 409, { error: '正在生成，请先停止当前任务再切换会话' });
      }
      if (body.action === 'load') {
        const found = body.ref ? await store.find(body.ref) : null;
        if (!found) return json(res, 404, { error: '没找到这个对话' });
        return json(res, 200, { session: found });
      }
      if (body.action === 'new') {
        blank = null;
        session = store.create(body.title?.trim() || '新对话');
        // 用户明确指定了标题，后续自动标题不要覆盖它。
        if (body.title?.trim()) session.titleSource = 'user';
        await store.save(session);
        activeId = session.id;
      } else if (body.action === 'rename') {
        // 支持直接重命名侧栏里的某个会话，不必先把用户切过去。
        const target = body.ref && body.ref !== session.id ? await store.find(body.ref) : session;
        if (!target) return json(res, 404, { error: '没找到这个对话' });
        target.title = body.title?.trim() || target.title;
        target.titleSource = 'user';
        await store.save(target);
        if (blank === target) {
          blank = null;
          activeId = target.id;
        }
      } else if (body.action === 'switch') {
        const found = body.ref ? await store.find(body.ref) : null;
        if (!found) return json(res, 404, { error: '没找到这个对话' });
        blank = null;
        session = found;
        activeId = found.id;
      } else if (body.action === 'delete') {
        const found = body.ref ? await store.find(body.ref) : null;
        if (found) {
          await store.remove(found.id);
          await backups(found.id).clear();
          if (found.id === session.id) {
            // 优先切到剩下的最近会话；一个都不剩时进入空白草稿，不强行新建对话。
            const remaining = await store.lastActive();
            const next = remaining ? await store.load(remaining) : null;
            if (next) {
              session = next;
              activeId = next.id;
              blank = null;
            } else {
              session = store.create();
              blank = session;
              activeId = null;
            }
          }
        }
      } else if (body.action === 'clear') {
        session.messages = [];
        session.todos = [];
        session.facts = [];
        session.unknowns = [];
        session.plan = undefined;
        session.usage = { inputTokens: 0, outputTokens: 0 };
        if (blank !== session) await store.save(session);
      } else if (body.action === 'mode') {
        const mode: AgentMode = body.value === 'plan' ? 'plan' : 'build';
        session.mode = mode;
        // 手动切到 Build 等于放弃待批准计划，不能把计划里的 todos 继续注入下一轮。
        if (mode === 'build' && session.plan) {
          session.plan = undefined;
          session.todos = [];
        }
        if (blank !== session) await store.save(session);
      } else if (body.action === 'reasoning') {
        const level = body.value as ReasoningLevel;
        if (REASONING_LEVELS.includes(level)) {
          session.reasoning = level;
          if (blank !== session) await store.save(session);
        }
      }
      activeId = blank === session ? null : session.id;
      return json(res, 200, { session: session.id, sessions: await listSessions(), info: await info(session) });
    }

    if (path === '/api/complete' && req.method === 'GET') {
      const line = url.searchParams.get('line') ?? '';
      // 与 CLI 共用同一份补全实现
      const files = completeFileReference(line, config.workspace, { limit: 12 });
      if (files) return json(res, 200, { kind: 'file', replace: files[1], candidates: files[0] });
      const commandHits = completeCommand(line, commands.map((command) => command.name));
      if (commandHits) return json(res, 200, { kind: 'command', replace: commandHits[1], candidates: commandHits[0] });
      return json(res, 200, { kind: 'none', replace: '', candidates: [] });
    }

    if (path === '/api/command' && req.method === 'POST') {
      const body = await readJson<{ input: string; confirmed?: boolean }>(req);
      return runCliCommand(body.input ?? '', res, session, Boolean(body.confirmed));
    }

    if (path === '/api/find' && req.method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(120, Number(url.searchParams.get('limit') ?? 60) || 60));
      const skip = new Set([
        '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
        '.venv', 'venv', '__pycache__', '.idea', '.vscode', '.cache', '.banana', 'vendor',
      ]);
      const results: string[] = [];
      let scanned = 0;
      const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
        if (results.length >= limit || scanned > 6000 || depth > 8) return;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (results.length >= limit || scanned > 6000) return;
          if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
          if (skip.has(entry.name)) continue;
          const childRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await walk(join(dir, entry.name), childRel, depth + 1);
            continue;
          }
          if (!entry.isFile()) continue;
          scanned += 1;
          if (!query || childRel.toLowerCase().includes(query)) results.push(childRel);
        }
      };
      try {
        await walk(config.workspace, '', 0);
        return json(res, 200, { files: results, scanned });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (path === '/api/changes' && req.method === 'GET') {
      try {
        const store = backups(session.id);
        const manifest = await store.load();
        const turns = [...manifest.turns].reverse().slice(0, 8);
        const payload: Array<Record<string, unknown>> = [];
        for (const turn of turns) {
          const files: Array<Record<string, unknown>> = [];
          for (const change of turn.changes.slice(0, 40)) {
            let before = '';
            let after = '';
            if (change.backup) {
              try {
                before = await readFile(join(store.dir, turn.turnId, change.backup), 'utf8');
              } catch {
                before = '';
              }
            }
            let afterExists = false;
            let tooLarge = false;
            try {
              const info = await stat(change.path);
              afterExists = info.isFile();
              if (afterExists && info.size <= MAX_FILE_BYTES) after = await readFile(change.path, 'utf8');
              else if (afterExists) tooLarge = true;
            } catch {
              afterExists = false;
            }
            const diff = lineDiff(before, after);
            files.push({
              path: change.relative,
              absolute: change.path,
              existed: change.existed,
              // 大文件读不出内容不等于文件被删了。
              missing: !afterExists && change.existed,
              tooLarge,
              skipped: Boolean(change.skipped),
              bytes: change.bytes,
              additions: diff.additions,
              deletions: diff.deletions,
              truncated: diff.truncated || tooLarge,
              lines: diff.lines,
            });
          }
          if (files.length) payload.push({ turnId: turn.turnId, at: turn.at, files });
        }
        return json(res, 200, {
          turns: payload,
          totalFiles: payload.reduce((sum, turn) => sum + (turn.files as unknown[]).length, 0),
        });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (path === '/api/trust' && req.method === 'POST') {
      const body = await readJson<{ workspace?: string }>(req);
      if (body.workspace && body.workspace !== config.workspace) {
        return json(res, 409, { error: '工作区已切换，请刷新后再操作' });
      }
      await trustProject(config.workspace);
      Object.assign(config, await loadConfig({ workspace: config.workspace }));
      await syncPlugins();
      return json(res, 200, {
        ok: true,
        info: await info(session),
        sessions: await listSessions(),
      });
    }

    if (path === '/api/commands' && req.method === 'GET') {
      return json(res, 200, {
        commands: commands.map((command) => ({
          name: command.name,
          aliases: command.aliases ?? [],
          usage: command.usage,
          summary: command.summary,
        })),
      });
    }

    if (path === '/api/action' && req.method === 'POST') {
      const body = await readJson<{ action: string; value?: string; name?: string }>(req);
      if (body.action === 'provider' && body.name && config.providers[body.name]) {
        config.current = body.name;
        session.provider = body.name;
      } else if (body.action === 'model' && body.value) {
        const current = config.providers[config.current];
        if (current) current.model = body.value;
      } else if (body.action === 'permission' && body.name && body.value) {
        config.permissions = { ...config.permissions, [body.name]: body.value } as AppConfig['permissions'];
      } else if (body.action === 'apiKey') {
        const current = config.providers[config.current];
        if (current) {
          const value = String(body.value ?? '').trim();
          if (value) current.apiKey = value;
          else delete current.apiKey;
        }
      } else if (body.action === 'system' && typeof body.value === 'string') {
        // 空字符串表示恢复内置提示词，不能按 falsy 忽略。
        config.systemPrompt = body.value;
      } else if (body.action === 'showReasoning') {
        config.showReasoning = body.value === 'true' || body.value === '1';
      } else if (body.action === 'searchProvider') {
        const value = String(body.value ?? '');
        if (value === 'auto' || value === 'tavily' || value === 'brave' || value === 'free') {
          config.search.provider = value;
        }
      } else if (body.action === 'searchKey') {
        const name = String(body.name ?? '');
        const value = String(body.value ?? '').trim();
        if (name === 'tavily') {
          if (value) config.search.tavilyKey = value;
          else delete config.search.tavilyKey;
        } else if (name === 'brave') {
          if (value) config.search.braveKey = value;
          else delete config.search.braveKey;
        }
      } else if (body.action === 'searchDeep') {
        config.search.deep = body.value === 'true' || body.value === '1';
      } else if (body.action === 'searchLanguage') {
        const value = String(body.value ?? '');
        if (value === 'en' || value === 'auto' || value === 'zh') config.search.language = value;
      } else if (body.action === 'workspace' && body.value) {
        const next = resolve(String(body.value).trim());
        if (!existsSync(next)) {
          return json(res, 400, { error: `目录不存在：${next}` });
        }
        // 重新加载整份配置：工作区、系统提示词、AGENT.md、项目信任状态一起更新。
        Object.assign(config, await loadConfig({ workspace: next }));
        // 换工作区后终端也要跟着换，否则 cd 还停在旧目录
        terminalCwd = null;
        // 项目级插件依赖 workspace，切目录后立即重载。
        try {
          await syncPlugins();
        } catch {
          /* 插件加载失败不影响工作区切换 */
        }
      }
      const { saveConfig } = await import('../config/config.ts');
      await saveConfig(config);
      // 没配 key 也要能把设置存下去，这里不能因为构造 provider 失败而 500
      try {
        session.model = provider().model;
        session.provider = config.current;
        if (blank !== session) await store.save(session);
      } catch {
        /* provider 暂时不可用，不影响设置已保存 */
      }
      return json(res, 200, { info: await info(session) });
    }

    if (path === '/api/undo' && req.method === 'POST') {
      if (turn) return json(res, 409, { error: '正在生成，请先停止当前任务再撤销' });
      const result = await backups(session.id).undo();
      return json(res, 200, {
        restored: result.restored,
        deleted: result.deleted,
        skipped: result.skipped,
        had: Boolean(result.turn),
      });
    }

    if (path === '/api/attach' && req.method === 'POST') {
      const name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'file');
      // base64 会有约 4/3 膨胀，先按上限拒绝明显超大的请求，避免整包读进内存。
      if (Number(req.headers['content-length'] ?? 0) > MAX_ATTACHMENT_BYTES * 1.4) {
        return json(res, 413, { error: '附件超过 20MB' });
      }
      const body = await readBody(req);
      const buffer = Buffer.from(body, 'base64');
      if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
        return json(res, 413, { error: '附件超过 20MB' });
      }
      const dir = join(bananaHome(), 'attachments');
      await mkdir(dir, { recursive: true });
      const ext = extname(name).toLowerCase();
      const file = join(dir, `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}${ext}`);
      await writeFile(file, buffer);
      const mime = ATTACHMENT_MIME[ext] ?? 'application/octet-stream';
      return json(res, 200, {
        path: file,
        name,
        bytes: buffer.byteLength,
        mime,
        kind: attachmentKind(name, mime),
      });
    }

    if (path === '/api/approve' && req.method === 'POST') {
      const body = await readJson<{ id: string; allowed: boolean }>(req);
      const active = turn;
      const resolvePending = active?.pending.get(body.id);
      if (resolvePending && active) {
        active.pending.delete(body.id);
        resolvePending(Boolean(body.allowed));
      }
      return json(res, 200, { ok: Boolean(resolvePending) });
    }

    if (path === '/api/abort' && req.method === 'POST') {
      if (turn) {
        for (const resolvePending of turn.pending.values()) resolvePending(false);
        turn.pending.clear();
        turn.controller.abort();
      }
      return json(res, 200, { ok: Boolean(turn) });
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const body = await readJson<{ action?: string; items?: unknown; session?: string }>(req);
      // 生成中不允许改计划，否则正在跑的 turn 会持有旧的 todos 数组，状态会错乱。
      if (turn) return json(res, 409, { error: '正在生成，先停止当前任务再操作计划' });
      if (body.session && body.session !== session.id) {
        return json(res, 409, { error: '会话已切换，请刷新后再操作' });
      }
      if (body.action === 'approve') {
        if (!session.plan || session.plan.status !== 'pending') {
          return json(res, 409, { error: '当前没有待批准的计划' });
        }
        const snapshot = session.plan.items?.length
          ? session.plan.items
          : sanitizePlanItems(body.items);
        // 计划只是「打算做什么」，批准后从 pending 开始，
        // 不能把 Plan 阶段误标的 done / in_progress 带进执行。
        const firstPhase = snapshot.find((item) => item.phase)?.phase;
        session.plan = {
          ...session.plan,
          status: 'approved',
          approvedAt: new Date().toISOString(),
          items: snapshot,
          ...(firstPhase ? { currentPhase: firstPhase } : {}),
        };
        session.todos = snapshot.map((item) => ({ ...item, status: 'pending' as const }));
        session.mode = 'build';
      } else if (body.action === 'cancel') {
        if (session.plan) session.plan = { ...session.plan, status: 'cancelled' };
        session.todos = [];
        session.mode = 'build';
      } else if (body.action === 'revise') {
        // 丢弃旧计划，等用户发修改意见后重新生成；旧内容仍保留在对话历史里。
        session.plan = undefined;
        session.todos = [];
        session.mode = 'plan';
      } else if (body.action === 'nextPhase') {
        if (!session.plan || session.plan.status !== 'approved') {
          return json(res, 409, { error: '当前没有已批准的计划' });
        }
        const target = nextPhase(session.plan.items, session.plan.currentPhase);
        if (!target) return json(res, 409, { error: '已经是最后一个阶段' });
        const gate = canAdvance(session.plan.items, session.plan.currentPhase, target);
        if (!gate.ok) return json(res, 409, { error: gate.reason ?? '依赖未完成，不能进入下一阶段' });
        session.plan = { ...session.plan, currentPhase: target };
      }
      await store.save(session);
      return json(res, 200, {
        info: await info(session),
        sessions: await listSessions(),
      });
    }

    if (path === '/api/title' && req.method === 'POST') {
      // 标题在 done 之后异步生成，避免把 3 秒的标题请求算进本轮用时、也不让界面多转一次圈。
      if (turn) return json(res, 409, { error: '正在生成，稍后再生成标题' });
      const body = await readJson<{ session?: string }>(req);
      let target = session;
      if (body.session && body.session !== session.id) {
        const found = await store.load(body.session);
        if (!found) return json(res, 404, { error: '没找到这个对话' });
        target = found;
      }
      if (target.titleSource === 'user') {
        return json(res, 200, { title: target.title, session: target.id, sessions: await listSessions() });
      }
      const hasAssistant = target.messages.some((message) => message.role === 'assistant');
      if (!hasAssistant) {
        return json(res, 200, { title: target.title, session: target.id, sessions: await listSessions() });
      }
      target.title = await generateSessionTitle(target);
      await store.save(target);
      return json(res, 200, { title: target.title, session: target.id, sessions: await listSessions() });
    }

    if (path === '/api/chat' && req.method === 'POST') {
      const body = await readJson<{ message: string; images?: string[]; attachments?: MessageAttachment[]; session?: string }>(req);
      if (typeof body.message !== 'string' || !body.message.trim()) {
        return json(res, 400, { error: '消息不能为空' });
      }
      if (turn) return json(res, 409, { error: '当前正在跑一轮对话' });
      // 前端会带上会话 id：以它为准，避免新建对话后又被解析回旧对话
      let target = session;
      if (body.session && body.session !== session.id) {
        const found = await store.load(body.session);
        if (found) target = found;
      }
      // 空白草稿在第一次真正对话时才落盘。
      if (target === blank) {
        await store.save(target);
        blank = null;
      }
      session = target;
      activeId = target.id;
      return chat(body, res, target);
    }

    if (path === '/api/plugins' && req.method === 'GET') {
      return json(res, 200, await syncPlugins());
    }

    if (path === '/api/plugins' && req.method === 'POST') {
      const body = await readJson<{
        action?: string;
        name?: string;
        disabled?: boolean;
        scope?: string;
        file?: string;
        input?: unknown;
      }>(req);
      const action = String(body.action ?? '');
      const { saveConfig } = await import('../config/config.ts');

      if (action === 'reload') {
        return json(res, 200, await syncPlugins());
      }

      if (action === 'toggle' && body.name) {
        const name = String(body.name);
        const set = new Set(config.disabledPlugins);
        if (body.disabled) set.add(name);
        else set.delete(name);
        config.disabledPlugins = [...set];
        await saveConfig(config);
        return json(res, 200, await syncPlugins());
      }

      if (action === 'create') {
        const scope = body.scope === 'project' ? 'project' : 'global';
        const target = pluginDirs().find((item) => item.id === scope);
        if (!target) return json(res, 403, { error: '项目尚未信任，先信任后再创建项目插件' });
        const dir = target.path;
        await mkdir(dir, { recursive: true });
        const safe = String(body.name ?? 'my_tool').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'my_tool';
        let file = join(dir, `${safe}.mjs`);
        let index = 2;
        while (existsSync(file)) file = join(dir, `${safe}-${index++}.mjs`);
        await writeFile(file, pluginTemplate(safe), 'utf8');
        return json(res, 200, { file, ...(await syncPlugins()) });
      }

      if (action === 'open') {
        const scope = body.scope === 'project' ? 'project' : 'global';
        const target = pluginDirs().find((item) => item.id === scope);
        if (!target) return json(res, 403, { error: '项目尚未信任，先信任后再管理项目插件' });
        const dir = target.path;
        await mkdir(dir, { recursive: true });
        const command =
          process.platform === 'darwin'
            ? { file: 'open', args: [dir] }
            : process.platform === 'win32'
              ? { file: 'explorer.exe', args: [dir] }
              : { file: 'xdg-open', args: [dir] };
        try {
          spawn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } catch {
          return json(res, 400, { error: '打不开文件管理器，请手动打开：' + dir });
        }
        return json(res, 200, { dir });
      }

      if (action === 'test' && body.file) {
        const file = resolve(String(body.file));
        const allowed = pluginDirs().some((dir) => {
          const root = resolve(dir.path);
          return file === root || file.startsWith(root + sep);
        });
        if (!allowed) return json(res, 400, { error: '只能运行插件目录里的文件' });
        if (!existsSync(file)) return json(res, 400, { error: '插件文件不存在' });
        try {
          const module = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as {
            default?: { run?: (input: unknown, ctx: unknown) => unknown };
          };
          const definition = module.default ?? (module as { run?: (input: unknown, ctx: unknown) => unknown });
          if (typeof definition.run !== 'function') throw new Error('插件没有导出 run 函数');
          const input =
            body.input && typeof body.input === 'object'
              ? body.input
              : (() => {
                  try {
                    return JSON.parse(String(body.input ?? '{}'));
                  } catch {
                    return {};
                  }
                })();
          const result = await definition.run(input, {});
          return json(res, 200, {
            result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          });
        } catch (error) {
          return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      }

      return json(res, 400, { error: '未知的插件操作' });
    }

    if (path === '/api/shells' && req.method === 'GET') {
      return json(res, 200, {
        shells: terminals.shells,
        default: terminals.defaultShell().id,
      });
    }

    return notFound(res);
  }

  /**
   * 执行 CLI 命令：命令表只有一份（cli/commands.ts），GUI 只是换了个输出通道。
   * 输出逐行推给前端，行为和终端里一致。
   */
  async function runCliCommand(
    input: string,
    res: ServerResponse,
    session: Session,
    confirmed = false,
  ): Promise<void> {
    const trimmed = input.trim();
    const [token = '', ...rest] = trimmed.replace(/^\//, '').split(/\s+/);
    const command = findCommand(token);
    if (!command) {
      const suggestion = suggestCommand(token);
      json(res, 200, {
        ok: false,
        output: suggestion
          ? `未知命令 /${token}，你是不是想用 /${suggestion}？`
          : `未知命令 /${token}。输入 /help 看可用命令。`,
        info: await info(session),
      });
      return;
    }

    const chunks: string[] = [];
    const restore = captureOutput((text) => chunks.push(text));
    let next = session;
    let failure = '';
    // provider 惰性创建：像 /help、/cwd 这类命令不需要 key 也能跑
    let lazyProvider: ReturnType<typeof createProvider> | null = null;
    const needProvider = (): ReturnType<typeof createProvider> => {
      if (!lazyProvider) {
        try {
          lazyProvider = provider();
        } catch (error) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}\n请先在设置里填入 API Key。`,
          );
        }
      }
      return lazyProvider;
    };
    try {
      await command.run(rest.join(' '), {
        config,
        store,
        session,
        get provider() {
          return needProvider();
        },
        tools: options.tools,
        ask: async (question) => {
          throw new Error(`${question}（这个命令需要交互输入，请用界面上的对应功能）`);
        },
        confirm: async () => confirmed,
        setSession: (value) => {
          next = value;
        },
        setSessionAndSave: async (value) => {
          next = value;
          await store.save(value);
          if (blank === value) {
            blank = null;
            activeId = value.id;
          }
        },
        setProvider: () => {},
        setConfig: (value) => Object.assign(config, value),
        setTools: () => {},
        saveSession: async () => {
          // 空白草稿不因为 /provider、/system 之类的命令偷偷落盘。
          if (blank === next) return;
          await store.save(next);
        },
        reloadProvider: () => {},
        compactNow: async () => {},
        runSetup: async () => {
          throw new Error('配置向导请在终端运行 banana --setup');
        },
        undo: async () => backups(next.id).undo(),
        clearBackups: async (sessionId) => {
          await backups(sessionId).clear();
        },
        attachImage: async () => ({ ok: false, message: '请直接在界面里粘贴图片' }),
        listImages: () => [],
        clearImages: () => {},
        clearScreen: () => {},
        exit: () => {},
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      restore();
    }

    return json(res, 200, {
      ok: !failure,
      output: chunks.join(''),
      error: failure,
      info: await info(next),
      sessions: await listSessions(),
    });
  }

  async function chat(
    body: { message: string; images?: string[]; attachments?: MessageAttachment[] },
    res: ServerResponse,
    session: Session,
  ): Promise<void> {
    const controller = new AbortController();
    const active: ActiveTurn = { controller, pending: new Map(), session };
    turn = active;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (type: string, payload: Record<string, unknown> = {}): void => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };
    const finish = (): void => {
      turn = null;
      if (!res.writableEnded) res.end();
    };
    send('start', { session: session.id });
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
      // 浏览器断开后必须把审批 Promise 结算掉，否则 runTurn 会永远挂起，
      // turn 一直非空，后续对话全部被 409 挡住。
      for (const resolvePending of active.pending.values()) resolvePending(false);
      active.pending.clear();
    });

    // 没配 key 之类的问题要在流里说清楚，否则前端会一直转圈
    const current = config.providers[config.current];
    const hasKey = Boolean(current?.apiKey || (current?.apiKeyEnv && process.env[current.apiKeyEnv]));
    if (!hasKey) {
      send('error', {
        message: `还没有配置 ${config.current} 的 API key。点右上角的模型按钮，在设置里填入 API Key 就能开始对话。`,
        hint: '也可以在终端运行 banana --setup 走一遍配置向导。',
        code: 'no_api_key',
      });
      finish();
      return;
    }
    

    // 只认附件目录里的文件：前端传来的路径也要过一遍沙箱，避免变成任意文件读取。
    const attachmentRoot = resolve(join(bananaHome(), 'attachments'));
    const incoming: MessageAttachment[] = body.attachments?.length
      ? body.attachments
      : (body.images ?? []).map((file) => ({
          name: file.split(/[\\/]/).pop() ?? '附件',
          path: file,
        }));
    const safeAttachments: MessageAttachment[] = [];
    for (const item of incoming) {
      const absolute = resolve(String(item.path ?? ''));
      if (absolute !== attachmentRoot && !absolute.startsWith(attachmentRoot + sep)) continue;
      if (!existsSync(absolute)) continue;
      let bytes = item.size;
      try {
        bytes = (await stat(absolute)).size;
      } catch {
        continue;
      }
      safeAttachments.push({
        name: item.name || (absolute.split(/[\\/]/).pop() ?? '附件'),
        path: absolute,
        size: bytes,
        mime: item.mime,
        kind: item.kind ?? attachmentKind(item.name, item.mime ?? ''),
      });
    }

    const dataUrls = await Promise.all(
      safeAttachments
        .filter((item) => item.kind === 'image')
        .map(async (item) => {
          const type = IMAGE_TYPES[extname(item.path).toLowerCase()];
          if (!type || (item.size ?? 0) > MAX_IMAGE_BYTES) return null;
          const buffer = await readFile(item.path);
          if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
          return `data:${type};base64,${buffer.toString('base64')}`;
        }),
    );
    const attachmentContext = await attachmentContextFor(
      safeAttachments.filter((item) => item.kind !== 'image'),
    );
    const activeTools =
      session.mode === 'plan'
        ? options.tools.filter((tool) => PLAN_TOOLS.has(tool.name))
        : options.tools;
    const todoContext = session.todos?.length
      ? `\n\n## 当前任务清单\n${formatTodos(session.todos)}\n每完成一项就调用 todo_write 更新状态，不要只口头汇报。`
      : '';
    const baseSystem = [
      config.systemPrompt,
      config.agentDoc ? `## 项目规则（AGENT.md）\n${config.agentDoc}` : '',
      formatPreferences(config.preferences),
    ]
      .filter(Boolean)
      .join('\n\n');
    const phaseNote =
      session.plan?.status === 'approved' && session.plan.currentPhase
        ? `\n\n## 当前阶段\n只执行「${session.plan.currentPhase}」阶段；完成后停下，等用户确认是否进入下一阶段。`
        : '';
    const activeSystem =
      (session.mode === 'plan' ? planSystemPrompt(baseSystem) : baseSystem) + todoContext + phaseNote;

    const wasFirstTurn = !session.messages.some((message) => message.role === 'assistant');
    session.todos ??= [];
    session.facts ??= [];
    session.unknowns ??= [];
    const turnId = newTurnId();
    const trace = new TraceWriter(session.id, turnId);
    const recorder = await backups(session.id).beginTurn(turnId, config.workspace);

    const approve = async (kind: ApprovalKind, summary: string, preview?: string): Promise<boolean> => {
      const id = randomBytes(6).toString('hex');
      send('approval', { id, kind, summary, preview });
      return new Promise<boolean>((resolvePromise) => {
        let settled = false;
        const done = (allowed: boolean): void => {
          if (settled) return;
          settled = true;
          active.pending.delete(id);
          controller.signal.removeEventListener('abort', onAbort);
          resolvePromise(allowed);
        };
        const onAbort = (): void => done(false);
        active.pending.set(id, done);
        if (controller.signal.aborted) done(false);
        else controller.signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const toolContext: ToolContext = {
      workspace: config.workspace,
      signal: controller.signal,
      approve,
      log: (message: string) => send('status', { message }),
      allowOutsideWorkspace: config.allowOutsideWorkspace,
      permissions: config.permissions,
      todos: session.todos,
      search: config.search,
    };

    const started = Date.now();
    const toolStartedAt = new Map<string, number>();
    let result: Awaited<ReturnType<typeof runTurn>>;
    try {
      result = await runTurn(
      {
        provider: provider(),
        tools: activeTools,
        permissions: config.permissions,
        system: activeSystem,
        maxSteps: config.maxSteps,
        maxContextChars: config.maxContextChars,
        toolsWorkspace: config.workspace,
        allowOutsideWorkspace: config.allowOutsideWorkspace,
        signal: controller.signal,
        todos: session.todos,
        facts: session.facts,
        unknowns: session.unknowns,
        reasoning: session.reasoning ?? 'standard',
        search: config.search,
        recordChange: (path, beforeContent) => recorder.record(path, beforeContent),
        onText: (chunk) => send('text', { chunk }),
        onReasoning: (chunk) => send('reasoning', { chunk }),
        onStep: (step) => send('step', { step }),
        onToolStart: (name, input, id) => {
          trace.add('tool_start', { name, input: summarizeInput(input), id });
          if (id) toolStartedAt.set(id, Date.now());
          send('tool_start', {
            id: id ?? name,
            name,
            detail: summarizeInput(input),
            input,
          });
        },
        onToolEnd: (name, toolResult, id) => {
          const key = id ?? name;
          const began = toolStartedAt.get(key);
          toolStartedAt.delete(key);
          trace.add('tool_end', {
            name,
            id: key,
            ok: toolResult.ok,
            ms: began ? Date.now() - began : undefined,
          });
          send('tool_end', {
            id: key,
            name,
            ok: toolResult.ok,
            ms: began ? Date.now() - began : undefined,
            display: toolResult.display ?? '',
            error: toolResult.ok ? '' : toolResult.content.slice(0, 400),
            // 详情面板用：命令输出 / 搜索结果等，最多 8KB
            detail: toolResult.content.slice(0, 8000),
          });
          // 任务清单不等到整轮结束才更新，todo_write 完成立刻推
          if (name === 'todo_write') send('todos', { todos: session.todos ?? [] });
        },
        onToolOutput: (chunk, stream, id) => {
          if (!id) return;
          // 实时输出直接进 DOM，先去掉 ANSI 颜色/光标控制符
          const clean = chunk.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
          if (clean) send('tool_output', { id, chunk: clean, stream });
        },
        onNotice: (message) => send('status', { message }),
        onCompact: () => {
          trace.add('compact');
          send('status', { message: '已压缩历史对话' });
        },
        onRetry: (info) => {
          trace.add('retry', { attempt: info.attempt, reason: info.reason, delayMs: info.delayMs });
          send('status', { message: `网络重试 ${info.attempt}：${info.reason}` });
        },
        budget: config.budget,
        onBudget: (info) => {
          const used =
            info.reason === 'tokens' ? `${Math.round(info.used)} tokens` : `${info.used.toFixed(1)} 分钟`;
          send('status', {
            message: `达到本轮预算（${info.reason === 'tokens' ? 'token' : '时间'} ${used}），本轮停止。`,
          });
        },
        onCheckpoint: async (messages) => {
          session.messages = messages;
          await store.save(session).catch(() => {});
        },
        approve,
      },
      session.messages,
      body.message,
      dataUrls.filter((item): item is string => Boolean(item)),
      safeAttachments,
      attachmentContext,
      );
    } catch (error) {
      // 异常也要把已经发生的 todo / plan 变更落盘，否则界面看得到、重启就丢。
      await trace.finish({
        stopReason: 'error',
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - started,
      });
      await store.save(session).catch(() => {});
      // 任何异常都要以 error 事件收尾，否则前端会一直等下去
      send('error', {
        message: error instanceof Error ? error.message : String(error),
        code: 'turn_failed',
      });
      finish();
      return;
    }

    session.messages = result.messages;
    session.provider = config.current;
    session.model = session.model || provider().model;
    // Plan 模式跑完（或被步数上限截断）就停在这里等审批；把清单抽成可执行计划卡。
    if (session.mode === 'plan' && (result.stopReason === 'done' || result.stopReason === 'max_steps')) {
      const lastAssistant = [...result.messages].reverse().find((message) => message.role === 'assistant');
      const summary = lastAssistant?.content?.trim() ?? '';
      const raw = session.todos?.length ? [...session.todos] : planFallbackItems(summary);
      // Plan 阶段只是列计划，所有条目都必须从 pending 开始；
      // 模型误标 done / in_progress 不能带进执行阶段。
      const items = raw.map((item) => ({ ...item, status: 'pending' as const }));
      if (summary || items.length) {
        session.plan = {
          status: 'pending',
          items,
          summary: summary.slice(0, 4000),
          createdAt: new Date().toISOString(),
        };
        // 计划快照与 todo 数组分离，避免后续 todo_write 改写已批准的计划。
        session.todos = items.map((item) => ({ ...item }));
      }
    }
    // 先给一个首条消息截断的临时标题，避免 done 之后标题还是一团空白；
    // 模型标题稍后由 /api/title 异步替换。
    if (
      wasFirstTurn &&
      session.titleSource !== 'user' &&
      (!session.title || session.title === '新对话')
    ) {
      const firstUser = session.messages.find((message) => message.role === 'user');
      session.title = deriveTitle(firstUser?.content ?? '');
    }
    const pricing = resolvePricing(session.model, config.providers[config.current]?.pricing);
    const cost = estimateCost(result.usage, pricing);
    session.usage = {
      inputTokens: (session.usage?.inputTokens ?? 0) + (result.usage.inputTokens ?? 0),
      outputTokens: (session.usage?.outputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      costUsd: (session.usage?.costUsd ?? 0) + cost,
    };
    await store.save(session);
    await recorder.commit().catch(() => {});

    await trace.finish({
      stopReason: result.stopReason,
      steps: result.steps,
      usage: result.usage,
      ms: Date.now() - started,
    });
    // done 发出后这一轮就结束了；提前释放 turn，让客户端紧接着的标题请求不会被 409 挡掉。
    turn = null;
    send('done', {
      stopReason: result.stopReason,
      error: result.error ?? '',
      steps: result.steps,
      ms: Date.now() - started,
      usage: result.usage,
      cost: formatCost(cost),
      todos: session.todos ?? [],
      plan: session.plan,
      title: session.title,
      firstTurn: wasFirstTurn,
      titleSource: session.titleSource ?? 'auto',
      info: await info(session),
    });
    finish();
  }

  const port = await new Promise<number>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(options.port ?? 0, host, () => resolvePromise((server.address() as { port: number }).port));
  });

  return {
    url: `http://${host}:${port}${prefix}/`,
    token,
    port,
    close: async () => {
      await terminals.dispose();
      wss.close();
      // 浏览器可能留着 keep-alive 连接，先断开再关，否则 Windows 上会触发 libuv 断言
      server.closeAllConnections?.();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sandboxContext(config: AppConfig): ToolContext {
  return {
    workspace: config.workspace,
    signal: new AbortController().signal,
    approve: async () => false,
    log: () => {},
    allowOutsideWorkspace: false,
    permissions: config.permissions,
    todos: [],
  };
}

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeEntry[];
}

/** 目录树：只返回一层子项，按需展开，避免大仓库一次拉全量。 */
async function listTree(config: AppConfig, requested: string): Promise<TreeEntry[]> {
  const { readdir, stat: statFile } = await import('node:fs/promises');
  const root = resolvePath(requested || '.', sandboxContext(config));
  const info = await statFile(root);
  if (!info.isDirectory()) throw new Error(`${root} 不是目录`);

  const items = await readdir(root, { withFileTypes: true });
  const entries: TreeEntry[] = [];
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    if (item.isDirectory() && SKIP_DIRS.has(item.name)) continue;
    const rel = join(requested === '.' ? '' : requested, item.name).split('\\').join('/');
    if (item.isDirectory()) {
      entries.push({ name: item.name, path: rel, type: 'dir' });
    } else if (item.isFile()) {
      entries.push({ name: item.name, path: rel, type: 'file' });
    }
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return entries.slice(0, 500);
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

async function sendFile(res: ServerResponse, name: string): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  try {
    let target = join(assetRoot(), name);
    // 源码模式（npm start）下 src/ui 里没有打包拷贝的 vendor；
    // 直接从依赖包读，开发时也能秒开终端，不用先 build。
    if (name.startsWith('vendor/') && !existsSync(target)) {
      const vendorName = name.slice('vendor/'.length);
      const specifier = VENDOR_FILES[vendorName];
      if (specifier) {
        try {
          target = createRequire(import.meta.url).resolve(specifier);
        } catch {
          /* 依赖缺失，走下面的 404 */
        }
      }
    }
    const file = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(name)] ?? 'application/octet-stream',
      'Content-Length': file.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // 只允许本地脚本和 data/blob 预览；阻断模型输出里的内联事件处理器。
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; frame-src data: blob:; font-src 'self' data:; " +
        "connect-src 'self' ws: wss:;",
    });
    res.end(file);
  } catch {
    notFound(res);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const max = 30 * 1024 * 1024;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > max) throw new Error('请求体过大');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  try {
    return JSON.parse(await readBody(req)) as T;
  } catch {
    return {} as T;
  }
}

/** 打开系统默认浏览器。 */
export function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? { file: 'open', args: [url] }
    : process.platform === 'win32' ? { file: 'cmd', args: ['/c', 'start', '""', url] }
    : { file: 'xdg-open', args: [url] };
  try {
    spawn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // 打不开就让用户手动复制链接
  }
}

export const __testing = { MIME, IMAGE_TYPES, resolvePath, assetRoot };
