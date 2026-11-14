import { existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectProject,
  type ProjectArtifacts,
  type ProjectTrust,
  type ProjectTrustStatus,
} from './project-trust.ts';

export type Protocol = 'openai' | 'anthropic';
export type Permission = 'ask' | 'allow' | 'deny';

export interface ProviderConfig {
  protocol: Protocol;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  maxTokens?: number;
  temperature?: number;
  /** Anthropic 协议下是否给 system/tools 打 prompt caching 标记（省 token 费用），默认 true。 */
  promptCaching?: boolean;
  /** 覆盖成本估算用的价格（美元 / 百万 token）。 */
  pricing?: { input: number; output: number };
}

export interface Permissions {
  shell: Permission;
  write: Permission;
  network: Permission;
}

export type SearchProvider = 'auto' | 'tavily' | 'brave' | 'free';
export type SearchLanguage = 'en' | 'auto' | 'zh';

export interface SearchConfig {
  /** auto：有 Key 就用 API，没有就抓免费源；free：强制只用免费源。 */
  provider: SearchProvider;
  tavilyKey?: string;
  braveKey?: string;
  /** 深度搜索：搜完自动读前几页正文再交给模型。默认关闭，按需开启。 */
  deep: boolean;
  /** 深度搜索读几页，默认 3。 */
  deepPages: number;
  /** 结果语言偏好：默认英文/技术源，中文问题仍可拿到中文结果。 */
  language: SearchLanguage;
}

export interface AppConfig {
  current: string;
  providers: Record<string, ProviderConfig>;
  permissions: Permissions;
  sessionDir: string;
  workspace: string;
  systemPrompt: string;
  maxSteps: number;
  maxContextChars: number;
  allowOutsideWorkspace: boolean;
  /** 是否显示推理模型的思考过程（DeepSeek-R1 / Claude thinking），默认 true。 */
  showReasoning: boolean;
  /** 被停用的插件工具名（按 name 记录，文件改名不影响）。 */
  disabledPlugins: string[];
  /** 联网搜索：API Key、深度搜索和语言偏好。 */
  search: SearchConfig;
  /** 单轮预算；超出后在下一次模型调用前停止。 */
  budget?: { tokens?: number; minutes?: number };
  /** 用户反复纠正后沉淀的偏好，注入系统提示词。 */
  preferences?: string[];
  /** /verify 运行的验收命令。 */
  verifyCommands?: string[];
  /** UI 质量门禁：off / warn / enforce，默认 enforce。 */
  uiGuard?: 'off' | 'warn' | 'enforce';
  /** 运行时加载的项目规则（AGENT.md），不写入配置文件。 */
  agentDoc?: string;
  /** AGENT.md 的实际路径，供 GUI 展示。 */
  agentDocPath?: string;
  /** 已信任项目的指纹；只写全局配置，项目配置不能覆盖。 */
  trustedProjects?: Record<string, { fingerprint: string; approvedAt: string }>;
  /** 运行时：当前工作区的项目信任状态，不写入配置文件。 */
  projectTrust?: ProjectTrust;
}

export type ConfigFile = Partial<
  Omit<
    AppConfig,
    | 'providers'
    | 'permissions'
    | 'search'
    | 'agentDoc'
    | 'agentDocPath'
    | 'trustedProjects'
    | 'projectTrust'
  >
> & {
  providers?: Record<string, Partial<ProviderConfig>>;
  permissions?: Partial<Permissions>;
  search?: Partial<SearchConfig>;
};

export function bananaHome(): string {
  const custom = process.env['BANANA_HOME']?.trim();
  if (custom) return resolve(custom);
  // Windows 默认落到 D 盘：配置、会话、备份、缓存都不写系统盘。
  // 老版本的数据在 %USERPROFILE%\.banana，第一次启动时自动搬过去（只搬一次）。
  if (process.platform === 'win32') {
    for (const candidate of ['D:\\BananaCLI-data', 'D:\\BananaData']) {
      try {
        mkdirSync(candidate, { recursive: true });
        const legacy = join(homedir(), '.banana');
        if (existsSync(legacy)) {
          if (!existsSync(join(candidate, 'config.json')) && existsSync(join(legacy, 'config.json'))) {
            copyFileSync(join(legacy, 'config.json'), join(candidate, 'config.json'));
          }
          for (const name of ['sessions', 'backups']) {
            if (!existsSync(join(candidate, name)) && existsSync(join(legacy, name))) {
              try {
                cpSync(join(legacy, name), join(candidate, name), { recursive: true });
              } catch {
                // 单个会话复制失败不影响启动
              }
            }
          }
        }
        return candidate;
      } catch {
        // 没有 D 盘或没写权限，试下一个位置
      }
    }
  }
  return join(homedir(), '.banana');
}

export function configPath(): string {
  const custom = process.env['BANANA_CONFIG']?.trim();
  return custom ? resolve(custom) : join(bananaHome(), 'config.json');
}

export function projectConfigPath(root: string): string {
  return join(root, '.banana', 'config.json');
}

export function defaultSessionDir(): string {
  return join(bananaHome(), 'sessions');
}

export function defaultProviders(): Record<string, ProviderConfig> {
  return {
    openai: {
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    anthropic: {
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      maxTokens: 8192,
      promptCaching: true,
    },
    deepseek: {
      protocol: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    moonshot: {
      protocol: 'openai',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-32k',
      apiKeyEnv: 'MOONSHOT_API_KEY',
    },
    qwen: {
      protocol: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      apiKeyEnv: 'DASHSCOPE_API_KEY',
    },
    gemini: {
      protocol: 'openai',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.0-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
    },
    openrouter: {
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-4.5',
      apiKeyEnv: 'OPENROUTER_API_KEY',
    },
    ollama: {
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3.1',
      headers: {},
    },
  };
}

export function defaultSystemPrompt(workspace: string): string {
  const platformName =
    process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  // 源码与 dist 的相对层级一致：<pkg>/src|dist/config -> <pkg>/docs/design
  const designRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design');
  return [
    '你是 BananaCLI，一个运行在终端里的编程 agent。你可以使用工具读写文件、执行命令、搜索代码、上网查询。',
    '',
    `运行环境：${platformName} (${process.platform}/${process.arch})，shell 工具使用 ${shell}。写命令时按这个平台来。`,
    `工作目录：${workspace}。默认只在这个目录内读写；需要越界时先说明原因。`,
    '',
    '## 冲突优先级',
    '安全 > 真实 > 用户事实 > 简洁。',
    '',
    '## 环境信息',
    '用户说过的环境、版本、路径直接用，不重复探测；没说清的一次问完；不主动全盘扫描项目。',
    '',
    '## 事实与不确定性',
    '不确定就说不确定；不编造文件路径、API、版本号、测试结果。',
    '',
    '## 能力边界',
    '做不到就直说，给 2–3 条可选路径；不硬接超纲需求。',
    '',
    '## 复杂度预算',
    '最短可行优先；命令默认不超过 5 行；新增核心实现软预算 80 行；不新增依赖；不为假设的需求做抽象。',
    '',
    '## 执行与安全',
    '先读相关代码再改，最小改动；破坏性操作先确认；工具报错自己修一次，仍不行再说明卡点。',
    '',
    '## 验收',
    '改了代码才跑测试 / 构建；没验证就别说“完成”；交付只说：改了什么 / 验证结果 / 未验证项。',
    '',
    '## 记忆与任务',
    '三步以上才用 todo，简单问题不建清单；项目根目录的 AGENT.md 优先遵守。',
    '',
    '## 沟通',
    '先给结论，再补必要解释，不复述每一步；',
    `做 UI 先读 ${designRoot}/principles.md 与 tokens.md，交付前调用 ui_audit。`,
    ...(process.env['BANANA_PROMPT_SUFFIX']?.trim()
      ? [`\n## 实验提示词\n${process.env['BANANA_PROMPT_SUFFIX']!.trim()}`]
      : []),
  ].join('\n');
}

function detectProvider(providers: Record<string, ProviderConfig>): string {
  const forced = process.env['BANANA_PROVIDER']?.trim();
  if (forced && providers[forced]) return forced;
  const probe: Array<[string, string]> = [
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['moonshot', 'MOONSHOT_API_KEY'],
    ['qwen', 'DASHSCOPE_API_KEY'],
    ['gemini', 'GEMINI_API_KEY'],
    ['openrouter', 'OPENROUTER_API_KEY'],
  ];
  for (const [name, env] of probe) {
    if (providers[name] && process.env[env]) return name;
  }
  return 'deepseek';
}

function defaultConfig(workspace: string): AppConfig {
  const providers = defaultProviders();
  return {
    current: detectProvider(providers),
    providers,
    permissions: { shell: 'ask', write: 'ask', network: 'allow' },
    sessionDir: defaultSessionDir(),
    workspace,
    systemPrompt: defaultSystemPrompt(workspace),
    maxSteps: 16,
    maxContextChars: 160_000,
    allowOutsideWorkspace: false,
    showReasoning: true,
    disabledPlugins: [],
    trustedProjects: {},
    preferences: [],
    verifyCommands: ['npm test', 'npm run build'],
    uiGuard: 'enforce',
    search: {
      provider: 'auto',
      deep: false,
      deepPages: 3,
      language: 'en',
    },
  };
}

async function readConfigFile(path: string): Promise<ConfigFile> {
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ConfigFile) : {};
  } catch (error) {
    throw new Error(`配置文件解析失败 ${path}: ${(error as Error).message}`);
  }
}

function merge(base: AppConfig, patch: ConfigFile): AppConfig {
  const providers = { ...base.providers };
  for (const [name, cfg] of Object.entries(patch.providers ?? {})) {
    providers[name] = { ...providers[name], ...cfg } as ProviderConfig;
  }
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(([key]) => key !== 'providers' && key !== 'permissions' && key !== 'search'),
    ),
    providers,
    permissions: { ...base.permissions, ...(patch.permissions ?? {}) },
    search: { ...base.search, ...(patch.search ?? {}) },
  };
}

export function formatPreferences(preferences: string[] = []): string {
  const items = preferences.map((item) => item.trim()).filter(Boolean);
  if (!items.length) return '';
  return `## 用户偏好\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

function applyEnvOverrides(config: AppConfig): AppConfig {
  const provider = config.current;
  const target = config.providers[provider];
  if (!target) return config;

  const patch: Partial<ProviderConfig> = {};
  const env = (key: string): string | undefined => process.env[key]?.trim() || undefined;

  const baseUrl = env('BANANA_BASE_URL');
  if (baseUrl) patch.baseUrl = baseUrl.replace(/\/+$/, '');
  const protocol = env('BANANA_PROTOCOL');
  if (protocol === 'openai' || protocol === 'anthropic') patch.protocol = protocol;
  const model = env('BANANA_MODEL');
  if (model) patch.model = model;
  const apiKey = env('BANANA_API_KEY');
  if (apiKey) patch.apiKey = apiKey;

  const upper = provider.replace(/[^a-z0-9]/gi, '_').toUpperCase();
  const namespacedBase = env(`${upper}_BASE_URL`);
  if (namespacedBase) patch.baseUrl = namespacedBase.replace(/\/+$/, '');
  const namespacedModel = env(`${upper}_MODEL`);
  if (namespacedModel) patch.model = namespacedModel;
  if (env('OPENAI_BASE_URL') && provider === 'openai') patch.baseUrl = env('OPENAI_BASE_URL')!;
  if (env('ANTHROPIC_BASE_URL') && provider === 'anthropic') patch.baseUrl = env('ANTHROPIC_BASE_URL')!;
  if (env('ANTHROPIC_MODEL') && provider === 'anthropic') patch.model = env('ANTHROPIC_MODEL')!;

  if (Object.keys(patch).length > 0) {
    config.providers[provider] = { ...target, ...patch };
  }
  return config;
}

const MAX_AGENT_DOC_BYTES = 16 * 1024;

/** 读取工作区的 AGENT.md；根目录优先，其次 .banana/AGENT.md。 */
export async function loadAgentDoc(
  workspace: string,
): Promise<{ path: string; content: string; truncated: boolean } | null> {
  const candidates = [join(workspace, 'AGENT.md'), join(workspace, '.banana', 'AGENT.md')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = await readFile(file, 'utf8');
      const buffer = Buffer.from(raw, 'utf8');
      const truncated = buffer.byteLength > MAX_AGENT_DOC_BYTES;
      const content = (truncated
        ? `${buffer.subarray(0, MAX_AGENT_DOC_BYTES).toString('utf8')}\n...[AGENT.md 已截断，超过 16KB]`
        : raw
      ).trim();
      if (!content) continue;
      return { path: file, content, truncated };
    } catch {
      // 读不到就继续找下一个候选位置
    }
  }
  return null;
}

/** 项目配置只允许影响行为参数，不能碰 provider、权限、沙箱和系统提示词。 */
export function sanitizeProjectConfig(patch: ConfigFile): ConfigFile {
  const out: ConfigFile = {};
  if (typeof patch.maxSteps === 'number' && patch.maxSteps > 0) out.maxSteps = patch.maxSteps;
  if (typeof patch.maxContextChars === 'number' && patch.maxContextChars > 0) {
    out.maxContextChars = patch.maxContextChars;
  }
  if (typeof patch.showReasoning === 'boolean') out.showReasoning = patch.showReasoning;
  if (patch.uiGuard === 'off' || patch.uiGuard === 'warn' || patch.uiGuard === 'enforce') {
    out.uiGuard = patch.uiGuard;
  }
  if (Array.isArray(patch.verifyCommands)) {
    out.verifyCommands = patch.verifyCommands
      .filter((command): command is string => typeof command === 'string')
      .map((command) => command.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  if (Array.isArray(patch.disabledPlugins)) {
    out.disabledPlugins = patch.disabledPlugins.filter((name): name is string => typeof name === 'string');
  }
  if (patch.search && typeof patch.search === 'object') {
    const search: Partial<SearchConfig> = {};
    const provider = patch.search.provider;
    if (provider === 'auto' || provider === 'tavily' || provider === 'brave' || provider === 'free') {
      search.provider = provider;
    }
    if (typeof patch.search.deep === 'boolean') search.deep = patch.search.deep;
    if (typeof patch.search.deepPages === 'number' && patch.search.deepPages > 0) {
      search.deepPages = patch.search.deepPages;
    }
    const language = patch.search.language;
    if (language === 'en' || language === 'auto' || language === 'zh') search.language = language;
    if (Object.keys(search).length) out.search = search;
  }
  return out;
}

function trustStatus(
  workspace: string,
  artifacts: ProjectArtifacts,
  config: AppConfig,
): ProjectTrust {
  const hasAny = artifacts.hasConfig || artifacts.hasPlugins || artifacts.hasAgentDoc;
  const record = config.trustedProjects?.[workspace];
  const trusted = hasAny && record?.fingerprint === artifacts.fingerprint;
  const status: ProjectTrustStatus = !hasAny ? 'none' : trusted ? 'trusted' : 'pending';
  return {
    status,
    workspace,
    hasConfig: artifacts.hasConfig,
    hasPlugins: artifacts.hasPlugins,
    hasAgentDoc: artifacts.hasAgentDoc,
    fingerprint: artifacts.fingerprint,
  };
}

/** 信任当前工作区的项目配置/插件/AGENT.md，并写入全局配置。 */
export async function trustProject(workspace: string, configFile = configPath()): Promise<void> {
  const artifacts = inspectProject(workspace);
  const raw = (await readConfigFile(configFile)) as ConfigFile & {
    trustedProjects?: Record<string, { fingerprint: string; approvedAt: string }>;
  };
  const trusted = { ...(raw.trustedProjects ?? {}) };
  trusted[workspace] = { fingerprint: artifacts.fingerprint, approvedAt: new Date().toISOString() };
  await mkdir(dirname(configFile), { recursive: true });
  await writeFile(
    configFile,
    `${JSON.stringify({ ...raw, trustedProjects: trusted }, null, 2)}\n`,
    'utf8',
  );
}

export async function loadConfig(options: {
  workspace?: string;
  cwd?: string;
  configFile?: string;
} = {}): Promise<AppConfig> {
  const cwd = options.cwd ?? process.cwd();
  let workspace = resolve(options.workspace ?? cwd);
  if (process.env['BANANA_WORKSPACE']) {
    workspace = resolve(process.env['BANANA_WORKSPACE']);
  }

  let config = defaultConfig(workspace);
  config = merge(config, await readConfigFile(options.configFile ?? configPath()));
  config.workspace = workspace;

  const artifacts = inspectProject(workspace);
  const trust = trustStatus(workspace, artifacts, config);
  config.projectTrust = trust;
  if (trust.status === 'trusted') {
    // 即使已信任，也只合并白名单键；providers / permissions / 沙箱 / 系统提示词永远来自全局。
    config = merge(config, sanitizeProjectConfig(await readConfigFile(projectConfigPath(workspace))));
  }

  if (process.env['BANANA_MODEL'] || process.env['BANANA_PROVIDER']) {
    const requested = process.env['BANANA_PROVIDER']?.trim();
    if (requested && config.providers[requested]) config.current = requested;
  }
  const reasoning = process.env['BANANA_SHOW_REASONING']?.trim();
  if (reasoning) config.showReasoning = /^(1|true|yes|on)$/i.test(reasoning);

  // 未信任的项目不能注入 AGENT.md，否则克隆仓库即可写系统提示词。
  if (trust.status !== 'pending') {
    const agentDoc = await loadAgentDoc(config.workspace);
    if (agentDoc) {
      config.agentDoc = agentDoc.content;
      config.agentDocPath = agentDoc.path;
    }
  }

  return applyEnvOverrides(config);
}

export async function saveConfig(config: AppConfig, path = configPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // 运行时字段不落盘：AGENT.md 的路径和内容属于工作区，不属于全局配置。
  const persisted: Record<string, unknown> = { ...config };
  delete persisted['agentDoc'];
  delete persisted['agentDocPath'];
  delete persisted['projectTrust'];
  await writeFile(path, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
}

export function providerApiKey(name: string, config: ProviderConfig): string | undefined {
  if (config.apiKeyEnv) {
    const fromEnv = process.env[config.apiKeyEnv]?.trim();
    if (fromEnv) return fromEnv;
  }
  const upper = name.replace(/[^a-z0-9]/gi, '_').toUpperCase();
  return (
    config.apiKey?.trim() ||
    process.env['BANANA_API_KEY']?.trim() ||
    process.env[`${upper}_API_KEY`]?.trim() ||
    undefined
  );
}

export interface ResolvedProvider {
  name: string;
  config: ProviderConfig;
  apiKey: string | undefined;
  needsKey: boolean;
}

export function resolveProvider(name: string, config: AppConfig): ResolvedProvider {
  const providerConfig = config.providers[name];
  if (!providerConfig) {
    const known = Object.keys(config.providers).join(', ');
    throw new Error(`未知的 provider "${name}"。可用: ${known}`);
  }
  const apiKey = providerApiKey(name, providerConfig);
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(providerConfig.baseUrl);
  return { name, config: providerConfig, apiKey, needsKey: !apiKey && !local };
}