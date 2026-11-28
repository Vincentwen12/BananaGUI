import { existsSync, statSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { WebSocket } from 'ws';
import {
  bananaHome,
  configPath,
  loadConfig,
  providerApiKey,
  resolveProvider,
  saveConfig,
  trustProject,
  type AppConfig,
  type ProviderConfig,
} from '../config/config.ts';
import { createProvider } from '../providers/index.ts';
import type { Provider } from '../providers/types.ts';
import type { ReasoningLevel } from '../providers/reasoning.ts';
import { SessionStore, deriveTitle, type Session, type SessionSummary } from '../session/store.ts';
import { allTools, permissionFor } from '../tools/index.ts';
import { loadPluginTools } from '../tools/plugins.ts';
import type { Tool } from '../tools/types.ts';
import {
  GUI_COMMANDS,
  type Bootstrap,
  type GuiInfo,
  type PublicProvider,
  type PublicTool,
  type PublicTrust,
  type SettingsPatch,
} from './protocol.ts';

export interface ActiveTurn {
  sessionId: string;
  turnId: string;
  controller: AbortController;
  startedAt: number;
  owner: WebSocket | null;
}

export interface QueuedTurn {
  id: string;
  input: string;
  images?: string[];
  attachments?: Array<{ name: string; path?: string; mime?: string; size?: number; kind?: 'image' | 'text' | 'pdf' | 'binary' }>;
  attachmentContext?: string;
  mode?: 'plan' | 'build';
  reasoning?: 'fast' | 'standard' | 'deep';
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  kind: 'shell' | 'write' | 'network';
  summary: string;
  preview?: string;
  resolve: (allow: boolean) => void;
  timer: NodeJS.Timeout;
  owner: WebSocket | null;
}

export interface GuiStateOptions {
  config: AppConfig;
  store: SessionStore;
  session: Session;
  provider: Provider | null;
  tools: Tool[];
  version: string;
}

function localBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl);
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export class GuiState {
  config: AppConfig;
  store: SessionStore;
  session: Session;
  provider: Provider | null;
  providerError: string | null = null;
  readonly version: string;
  tools: Tool[] = [];
  pluginTools: Tool[] = [];
  pluginErrors: string[] = [];
  disabledTools = new Set<string>();
  readonly clients = new Set<WebSocket>();
  activeTurn: ActiveTurn | null = null;
  queue: QueuedTurn[] = [];
  queueRunning = false;
  readonly pendingApprovals = new Map<string, PendingApproval>();

  constructor(options: GuiStateOptions) {
    this.config = options.config;
    this.store = options.store;
    this.session = options.session;
    this.provider = options.provider;
    this.version = options.version;
    if (!this.provider) {
      try {
        this.provider = createProvider(this.config.current, this.config);
      } catch (error) {
        this.providerError = error instanceof Error ? error.message : String(error);
      }
    }
    this.pluginTools = options.tools.filter(
      (tool) => !allTools.some((builtin) => builtin.name === tool.name),
    );
    this.tools = [...options.tools];
    if (!this.tools.length) this.rebuildTools();
  }

  async init(): Promise<void> {
    await this.reloadTools();
    if (!this.session.workspace) this.session.workspace = this.config.workspace;
    if (this.session.mode !== 'plan' && this.session.mode !== 'build') this.session.mode = 'build';
    if (
      this.session.reasoning !== 'fast' &&
      this.session.reasoning !== 'standard' &&
      this.session.reasoning !== 'deep'
    ) {
      this.session.reasoning = 'standard';
    }
    // CLI 新会话的历史默认是 fast；GUI 首次打开对齐参考图的「标准模式」。
    if (this.session.messages.length === 0 && this.session.title === '新对话' && this.session.reasoning === 'fast') {
      this.session.reasoning = 'standard';
    }
    await this.store.save(this.session);
  }

  providerConfig(name = this.config.current): ProviderConfig | undefined {
    return this.config.providers[name];
  }

  recreateProvider(): void {
    try {
      this.provider = createProvider(this.config.current, this.config);
      this.providerError = null;
      this.session.provider = this.provider.name;
      this.session.model = this.provider.model;
    } catch (error) {
      this.provider = null;
      this.providerError = error instanceof Error ? error.message : String(error);
    }
  }

  private rebuildTools(): void {
    const registry = [...allTools, ...this.pluginTools];
    const seen = new Set<string>();
    this.tools = registry.filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return !this.disabledTools.has(tool.name);
    });
  }

  async reloadTools(): Promise<void> {
    const dirs = [join(bananaHome(), 'tools')];
    if (this.config.projectTrust?.status === 'trusted') {
      dirs.push(join(this.config.workspace, '.banana', 'tools'));
    }
    const result = await loadPluginTools(dirs, new Set(allTools.map((tool) => tool.name)));
    this.pluginErrors = result.errors;
    this.pluginTools = result.tools.filter(
      (tool) => !this.config.disabledPlugins.includes(tool.name),
    );
    this.rebuildTools();
  }

  private async appFolderReload(workspace: string, session?: Session): Promise<void> {
    this.config = await loadConfig({ workspace });
    this.recreateProvider();
    await this.reloadTools();
    if (session) {
      this.session = session;
    }
    if (!this.session.workspace) this.session.workspace = this.config.workspace;
  }

  async activateSession(id: string): Promise<Session> {
    if (this.activeTurn) throw new Error('当前回合还在运行，先停止再切换对话。');
    this.queue = [];
    const next = await this.store.load(id);
    if (!next) throw new Error(`找不到对话 ${id}。`);
    const workspace = next.workspace || this.config.workspace;
    if (workspace !== this.config.workspace) {
      await this.appFolderReload(workspace, next);
    } else {
      this.session = next;
    }
    this.session.workspace = workspace;
    this.session.mode = this.session.mode === 'plan' ? 'plan' : 'build';
    if (!this.session.reasoning) this.session.reasoning = 'standard';
    return this.session;
  }

  async createSession(title = '新对话'): Promise<Session> {
    this.queue = [];
    const session = this.store.create(cleanTitle(title) || '新对话');
    session.workspace = this.session.workspace || this.config.workspace;
    session.mode = 'build';
    session.reasoning = 'standard';
    session.titleSource = title === '新对话' ? 'auto' : 'user';
    this.session = session;
    await this.store.save(session);
    return session;
  }

  async switchWorkspace(requested: string, sessionId?: string): Promise<Session> {
    if (this.activeTurn) throw new Error('当前回合还在运行，先停止再切换工作区。');
    const target = resolve(requested);
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      throw new Error(`工作区不存在或不是目录：${target}`);
    }
    if (sessionId) {
      const session = await this.store.load(sessionId);
      if (!session) throw new Error(`找不到对话 ${sessionId}。`);
      session.workspace = target;
      await this.appFolderReload(target, session);
      this.session.workspace = target;
      await this.store.save(this.session);
      return this.session;
    }
    let next: Session | null = null;
    const sessions = await this.store.list();
    const candidate = sessions.find((item) => item.workspace === target);
    if (candidate) next = await this.store.load(candidate.id);
    if (!next) {
      next = this.store.create('新对话');
      next.workspace = target;
      next.mode = 'build';
      next.reasoning = 'standard';
    }
    await this.appFolderReload(target, next);
    this.session.workspace = target;
    await this.store.save(this.session);
    return this.session;
  }

  async trustCurrentWorkspace(): Promise<void> {
    await trustProject(this.config.workspace);
    await this.appFolderReload(this.config.workspace, this.session);
    await this.store.save(this.session);
  }

  enqueueTurn(payload: {
    input?: string;
    images?: string[];
    attachments?: Array<{ name: string; path?: string; mime?: string; size?: number; kind?: 'image' | 'text' | 'pdf' | 'binary' }>;
    attachmentContext?: string;
    mode?: 'plan' | 'build';
    reasoning?: 'fast' | 'standard' | 'deep';
  }): QueuedTurn {
    if (this.queue.length >= 20) throw new Error('队列最多 20 条，先等当前任务处理。');
    const input = String(payload.input ?? '').trim();
    const images = payload.images?.length ? payload.images : undefined;
    const attachments = payload.attachments?.length ? payload.attachments : undefined;
    if (!input && !images && !attachments) throw new Error('输入不能为空。');
    const item: QueuedTurn = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      input,
      images,
      attachments,
      attachmentContext: payload.attachmentContext,
      mode: payload.mode,
      reasoning: payload.reasoning,
      createdAt: new Date().toISOString(),
    };
    this.queue.push(item);
    return item;
  }

  shiftTurn(): QueuedTurn | undefined {
    return this.queue.shift();
  }

  removeQueued(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
  }

  clearQueue(): void {
    this.queue = [];
  }

  async saveSession(): Promise<void> {
    this.session.workspace ||= this.config.workspace;
    await this.store.save(this.session);
  }

  setTitleFromInput(input: string): void {
    if (this.session.messages.length > 0) return;
    if (this.session.titleSource === 'user') return;
    if (this.session.title.trim() && this.session.title !== '新对话') return;
    this.session.title = deriveTitle(input);
  }

  async renameSession(title: string): Promise<void> {
    const next = cleanTitle(title);
    if (!next) throw new Error('标题不能为空。');
    this.session.title = next;
    this.session.titleSource = 'user';
    await this.saveSession();
  }

  async deleteSession(id: string): Promise<Session> {
    if (this.activeTurn) throw new Error('当前回合还在运行，不能删除对话。');
    const target = await this.store.load(id);
    if (!target) throw new Error(`找不到对话 ${id}。`);
    await this.store.remove(id);
    if (id === this.session.id) {
      const replacement = await this.createSession();
      return replacement;
    }
    return this.session;
  }

  async clearSession(): Promise<void> {
    if (this.activeTurn) throw new Error('当前回合还在运行，不能清空对话。');
    this.session.messages = [];
    this.session.todos = [];
    this.session.facts = [];
    this.session.unknowns = [];
    this.session.usage = { inputTokens: 0, outputTokens: 0 };
    this.session.plan = undefined;
    this.session.verification = undefined;
    await this.saveSession();
  }

  async importSession(raw: unknown): Promise<Session> {
    if (typeof raw !== 'object' || raw === null) throw new Error('会话文件格式不正确。');
    const data = raw as Partial<Session>;
    if (!Array.isArray(data.messages)) throw new Error('会话文件缺少 messages 数组。');
    const session = this.store.create(cleanTitle(data.title ?? '') || '导入的对话');
    session.messages = data.messages;
    session.workspace = this.config.workspace;
    session.mode = data.mode === 'plan' ? 'plan' : 'build';
    session.reasoning =
      data.reasoning === 'fast' || data.reasoning === 'deep' ? data.reasoning : 'standard';
    session.todos = Array.isArray(data.todos) ? data.todos : [];
    session.facts = Array.isArray(data.facts) ? data.facts : [];
    session.unknowns = Array.isArray(data.unknowns) ? data.unknowns : [];
    session.plan = data.plan;
    session.verification = data.verification;
    session.usage = data.usage;
    session.titleSource = 'user';
    this.session = session;
    await this.store.save(session);
    return session;
  }

  async saveSettings(patch: SettingsPatch): Promise<void> {
    if (patch.current && !this.config.providers[patch.current]) {
      throw new Error(`未知 provider "${patch.current}"。`);
    }
    if (patch.current) this.config.current = patch.current;

    if (patch.provider) {
      const name = patch.provider.name?.trim() || this.config.current;
      if (name !== this.config.current && !this.config.providers[name]) {
        throw new Error(`未知 provider "${name}"。`);
      }
      const provider = this.config.providers[name];
      if (!provider) throw new Error(`未知 provider "${name}"。`);
      if (typeof patch.provider.model === 'string' && patch.provider.model.trim()) {
        provider.model = patch.provider.model.trim();
      }
      if (typeof patch.provider.baseUrl === 'string' && patch.provider.baseUrl.trim()) {
        provider.baseUrl = patch.provider.baseUrl.trim().replace(/\/+$/, '');
      }
      if (typeof patch.provider.apiKeyEnv === 'string') {
        const env = patch.provider.apiKeyEnv.trim();
        if (env) provider.apiKeyEnv = env;
        else delete provider.apiKeyEnv;
      }
      if (patch.provider.clearKey) {
        delete provider.apiKey;
      } else if (typeof patch.provider.apiKey === 'string' && patch.provider.apiKey.trim()) {
        provider.apiKey = patch.provider.apiKey.trim();
      }
      this.config.current = name;
    }

    if (patch.permissions) {
      for (const key of ['shell', 'write', 'network'] as const) {
        const value = patch.permissions[key];
        if (value === 'ask' || value === 'allow' || value === 'deny') {
          this.config.permissions[key] = value;
        }
      }
    }

    if (patch.search) {
      const search = { ...this.config.search, ...patch.search };
      if (search.mode !== 'auto' && search.mode !== 'native' && search.mode !== 'api') {
        throw new Error('搜索模式只能是 auto / native / api。');
      }
      if (search.provider !== 'auto' && search.provider !== 'tavily' && search.provider !== 'brave' && search.provider !== 'free') {
        throw new Error('搜索 provider 只能是 auto / tavily / brave / free。');
      }
      if (search.language !== 'en' && search.language !== 'auto' && search.language !== 'zh') {
        throw new Error('搜索语言只能是 en / auto / zh。');
      }
      if (patch.search.clearTavily) delete search.tavilyKey;
      if (patch.search.clearBrave) delete search.braveKey;
      if (typeof patch.search.tavilyKey === 'string' && patch.search.tavilyKey.trim()) {
        search.tavilyKey = patch.search.tavilyKey.trim();
      }
      if (typeof patch.search.braveKey === 'string' && patch.search.braveKey.trim()) {
        search.braveKey = patch.search.braveKey.trim();
      }
      delete (search as unknown as Record<string, unknown>)['tavilyKey'];
      if (patch.search.tavilyKey?.trim()) this.config.search.tavilyKey = patch.search.tavilyKey.trim();
      if (patch.search.braveKey?.trim()) this.config.search.braveKey = patch.search.braveKey.trim();
      if (patch.search.clearTavily) delete this.config.search.tavilyKey;
      if (patch.search.clearBrave) delete this.config.search.braveKey;
      this.config.search = {
        ...this.config.search,
        mode: search.mode,
        provider: search.provider,
        deep: typeof search.deep === 'boolean' ? search.deep : this.config.search.deep,
        deepPages:
          typeof search.deepPages === 'number' && search.deepPages > 0
            ? Math.min(8, Math.round(search.deepPages))
            : this.config.search.deepPages,
        language: search.language,
      };
    }

    if (typeof patch.showReasoning === 'boolean') this.config.showReasoning = patch.showReasoning;
    if (typeof patch.allowOutsideWorkspace === 'boolean') {
      this.config.allowOutsideWorkspace = patch.allowOutsideWorkspace;
    }
    if (typeof patch.maxSteps === 'number' && patch.maxSteps > 0) {
      this.config.maxSteps = Math.min(500, Math.round(patch.maxSteps));
    }
    if (typeof patch.maxContextChars === 'number' && patch.maxContextChars > 0) {
      this.config.maxContextChars = Math.max(8_000, Math.round(patch.maxContextChars));
    }
    if (patch.uiGuard === 'off' || patch.uiGuard === 'warn' || patch.uiGuard === 'enforce') {
      this.config.uiGuard = patch.uiGuard;
    }
    if (typeof patch.systemPrompt === 'string' && patch.systemPrompt.trim()) {
      this.config.systemPrompt = patch.systemPrompt.trim();
    }
    if (Array.isArray(patch.preferences)) {
      this.config.preferences = patch.preferences
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    if (Array.isArray(patch.verifyCommands)) {
      this.config.verifyCommands = patch.verifyCommands
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 10);
    }

    await saveConfig(this.config);
    try {
      await chmod(configPath(), 0o600);
    } catch {
      // Windows 下 chmod 可能不支持
    }
    this.recreateProvider();
    this.session.provider = this.provider?.name;
    this.session.model = this.provider?.model;
    await this.saveSession();
  }

  async addPlugin(source: string): Promise<void> {
    const { copyFile, mkdir, stat } = await import('node:fs/promises');
    const { basename, extname, resolve } = await import('node:path');
    const target = resolve(source);
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new Error('插件路径不存在或不是文件。');
    if (!['.mjs', '.js', '.ts'].includes(extname(target).toLowerCase())) {
      throw new Error('插件只支持 .mjs / .js / .ts 文件。');
    }
    const dir = join(bananaHome(), 'tools');
    await mkdir(dir, { recursive: true });
    const destination = join(dir, basename(target));
    await copyFile(target, destination);
    await this.reloadTools();
  }

  async toggleTool(name: string, enabled: boolean): Promise<void> {
    const registry = [...allTools, ...this.pluginTools];
    const tool = registry.find((item) => item.name === name);
    if (!tool) throw new Error(`未知工具 "${name}"。`);
    const plugin = !allTools.some((item) => item.name === name);
    if (plugin) {
      const disabled = new Set(this.config.disabledPlugins);
      if (enabled) disabled.delete(name);
      else disabled.add(name);
      this.config.disabledPlugins = [...disabled];
      await saveConfig(this.config);
    } else if (enabled) {
      this.disabledTools.delete(name);
    } else {
      this.disabledTools.add(name);
    }
    this.rebuildTools();
  }

  async testConnection(name = this.config.current): Promise<{ ok: boolean; detail: string }> {
    if (!this.config.providers[name]) throw new Error(`未知 provider "${name}"。`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const provider = createProvider(name, this.config);
      let streamed = '';
      const result = await provider.generate({
        messages: [{ role: 'user', content: '连通性测试，请只回复 OK。' }],
        system: '你是连通性测试助手，只回复 OK 两个字母。',
        tools: [],
        signal: controller.signal,
        onText: (chunk) => {
          streamed += chunk;
        },
      });
      return { ok: true, detail: (streamed || result.message.content).trim().slice(0, 120) || '连接正常' };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, detail: '连接超时（25 秒）' };
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  private publicProvider(name: string, provider: ProviderConfig): PublicProvider {
    const env = provider.apiKeyEnv ? process.env[provider.apiKeyEnv]?.trim() : undefined;
    const key = providerApiKey(name, provider);
    const local = localBaseUrl(provider.baseUrl);
    return {
      name,
      protocol: provider.protocol,
      model: provider.model,
      baseUrl: provider.baseUrl,
      hasKey: Boolean(key),
      keySource: env ? 'env' : provider.apiKey ? 'config' : local ? 'local' : 'none',
      ...(provider.apiKeyEnv ? { apiKeyEnv: provider.apiKeyEnv } : {}),
    };
  }

  publicTrust(): PublicTrust | null {
    const trust = this.config.projectTrust;
    if (!trust) return null;
    return {
      status: trust.status,
      workspace: trust.workspace,
      hasConfig: trust.hasConfig,
      hasPlugins: trust.hasPlugins,
      hasAgentDoc: trust.hasAgentDoc,
    };
  }

  publicInfo(isDesktop: boolean): GuiInfo {
    const publicProviders = Object.entries(this.config.providers).map(([name, provider]) =>
      this.publicProvider(name, provider),
    );
    const current = this.config.providers[this.config.current];
    const registry = [...allTools, ...this.pluginTools];
    const tools: PublicTool[] = registry.map((tool) => {
      const builtin = allTools.some((item) => item.name === tool.name);
      const permission = permissionFor(this.config.permissions, tool);
      return {
        name: tool.name,
        description: tool.description,
        approval: tool.approval,
        permission,
        enabled: this.tools.some((item) => item.name === tool.name),
        builtin,
      };
    });
    return {
      version: this.version,
      name: 'BananaGUI',
      workspace: this.config.workspace,
      sessionDir: this.config.sessionDir,
      currentProvider: this.config.current,
      model: current?.model ?? '',
      providerError: this.providerError,
      providers: publicProviders,
      permissions: { ...this.config.permissions },
      search: {
        mode: this.config.search.mode,
        provider: this.config.search.provider,
        deep: this.config.search.deep,
        deepPages: this.config.search.deepPages,
        language: this.config.search.language,
        hasTavily: Boolean(this.config.search.tavilyKey || process.env['TAVILY_API_KEY']),
        hasBrave: Boolean(this.config.search.braveKey || process.env['BRAVE_API_KEY']),
      },
      showReasoning: this.config.showReasoning,
      allowOutsideWorkspace: this.config.allowOutsideWorkspace,
      maxSteps: this.config.maxSteps,
      maxContextChars: this.config.maxContextChars,
      uiGuard: this.config.uiGuard ?? 'enforce',
      systemPrompt: this.config.systemPrompt,
      ...(this.config.agentDocPath ? { agentDocPath: this.config.agentDocPath } : {}),
      preferences: [...(this.config.preferences ?? [])],
      verifyCommands: [...(this.config.verifyCommands ?? [])],
      trust: this.publicTrust(),
      tools,
      commands: GUI_COMMANDS,
      terminal: { available: true },
      isDesktop,
    };
  }

  async bootstrap(isDesktop: boolean): Promise<Bootstrap> {
    return {
      info: this.publicInfo(isDesktop),
      sessions: await this.sessionSummaries(),
      session: this.session,
      queue: this.queue,
      ...(this.config.agentDoc ? { agentDoc: this.config.agentDoc } : {}),
    };
  }

  async sessionSummaries(): Promise<SessionSummary[]> {
    const sessions = await this.store.list();
    // 还没有发过消息的空白对话不进侧栏，避免每次新建都留下“新对话”。
    return sessions.filter((item) => item.turns > 0);
  }

  hasProvider(): boolean {
    return Boolean(this.provider);
  }

  reasoning(): ReasoningLevel {
    const value = this.session.reasoning;
    return value === 'fast' || value === 'deep' ? value : 'standard';
  }
}
