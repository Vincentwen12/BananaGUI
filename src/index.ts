#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  bananaHome,
  configPath,
  loadConfig,
  resolveProvider,
  saveConfig,
  trustProject,
  type AppConfig,
} from './config/config.ts';
import { createProvider } from './providers/index.ts';
import { SessionStore } from './session/store.ts';
import { allTools } from './tools/index.ts';
import { loadPluginTools } from './tools/plugins.ts';
import { startUiServer, openBrowser } from './server/ui-server.ts';
import { join } from 'node:path';
import { startRepl } from './cli/repl.ts';
import { runSetupWizard } from './cli/setup.ts';
import * as ui from './cli/ui.ts';

const HELP = `
${'🍌'} BananaCLI v${ui.version} - 终端里的多 provider AI agent

用法:
  banana                       进入交互式多轮对话
  banana "帮我看看这个项目"     单轮任务模式（不进入对话）

选项:
  -p, --provider <名称>   指定 provider（openai/anthropic/deepseek/moonshot/qwen/gemini/openrouter/ollama 或自定义）
  -m, --model <模型名>    覆盖模型名
      --base-url <url>   覆盖 base URL
      --api-key <key>    直接指定 API key（不推荐，优先用环境变量）
  -s, --session <ref>    载入指定对话（序号 / id 前缀 / 标题关键词）
  -c, --continue         继续上一次对话
      --list             列出历史对话后退出
      --cwd <目录>       指定工作区（agent 能访问的目录范围）
      --allow-outside    允许工具访问工作区之外的路径
      --yolo             跳过所有确认（shell/写文件都不问）
      --trust-project    信任当前项目的 .banana 配置/插件/AGENT.md
      --system <文本>    覆盖系统提示词
      --no-tools         不给 agent 任何工具（纯对话）
      --no-reasoning     不显示推理模型的思考过程
      --setup            运行/重新运行配置向导（配置 API key、模型、权限）
      --ui               启动图形界面（本地服务 + 浏览器），不开终端对话
      --port <端口>      指定 GUI 端口（默认随机端口）
      --no-open          启动 GUI 时不自动打开浏览器
  -h, --help             显示帮助
  -v, --version          显示版本

环境变量:
  ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY / MOONSHOT_API_KEY
  DASHSCOPE_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY
  TAVILY_API_KEY 或 BRAVE_API_KEY（更好的搜索质量，否则用 DuckDuckGo）
  BANANA_PROVIDER / BANANA_MODEL / BANANA_BASE_URL / BANANA_HOME / BANANA_CONFIG
  NODE_ENV=development 可以打印调试日志

配置文件:
  ~/.banana/config.json        全局配置（providers、权限、systemPrompt）
  <工作区>/.banana/config.json 项目配置（需显式信任；只允许白名单键）
  <工作区>/AGENT.md            项目规则（需显式信任）

示例:
  banana -c                              继续上次对话
  banana --provider deepseek "跑一下测试"
  banana -s 2                            切到第 2 个历史对话
  BANANA_PROVIDER=ollama banana          用本地模型
`;

interface Resolved {
  config: AppConfig;
  store: SessionStore;
  providerName: string;
  sessionRef?: string;
  continueLast: boolean;
  listOnly: boolean;
  oneShot?: string;
  noTools: boolean;
  yolo: boolean;
  trustProject: boolean;
  setup: boolean;
  ui: boolean;
  port?: number;
  launchBrowser: boolean;
  firstRun: boolean;
  missingKey: boolean;
}

async function resolve(argv: string[]): Promise<Resolved> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      provider: { type: 'string', short: 'p' },
      model: { type: 'string', short: 'm' },
      'base-url': { type: 'string' },
      'api-key': { type: 'string' },
      session: { type: 'string', short: 's' },
      continue: { type: 'boolean', short: 'c' },
      list: { type: 'boolean' },
      cwd: { type: 'string' },
      'allow-outside': { type: 'boolean' },
      yolo: { type: 'boolean' },
      'trust-project': { type: 'boolean' },
      system: { type: 'string' },
      'no-tools': { type: 'boolean' },
      'no-reasoning': { type: 'boolean' },
      setup: { type: 'boolean' },
      ui: { type: 'boolean' },
      port: { type: 'string' },
      'no-open': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) {
    ui.line(HELP);
    process.exit(0);
  }
  if (values.version) {
    ui.line(ui.version);
    process.exit(0);
  }

  const config = await loadConfig({ workspace: values.cwd });

  if (values.provider) {
    if (!config.providers[values.provider]) {
      ui.error(`未知 provider "${values.provider}"。可用: ${Object.keys(config.providers).join(', ')}`);
      process.exit(1);
    }
    config.current = values.provider;
  }
  const providerConfig = config.providers[config.current];
  if (!providerConfig) {
    ui.error(`配置里找不到 provider "${config.current}"。`);
    process.exit(1);
  }
  if (values.model) providerConfig.model = values.model;
  if (values['base-url']) providerConfig.baseUrl = values['base-url'];
  if (values['api-key']) providerConfig.apiKey = values['api-key'];
  if (values.system) config.systemPrompt = values.system;
  if (values['allow-outside']) config.allowOutsideWorkspace = true;
  if (values['no-reasoning']) config.showReasoning = false;
  if (values.provider || values.model || values['base-url'] || values['api-key'] || values.system) {
    await saveConfig(config);
  }
  // --yolo 只影响本次运行，不能写进全局权限配置。
  if (values.yolo) config.permissions = { shell: 'allow', write: 'allow', network: 'allow' };

  const store = new SessionStore(config.sessionDir);
  await store.ensure();

  if (values.list) {
    const sessions = await store.list();
    if (!sessions.length) {
      ui.hint('还没有历史对话。');
      process.exit(0);
    }
    sessions.forEach((session, index) => {
      const time = ui.relativeTime(session.updatedAt);
      ui.line(
        `${String(index + 1).padStart(3)}. ${ui.c.cyan(session.id)}  ${String(session.turns).padStart(3)} 轮  ${ui.padDisplay(time, 9)}${ui.preview(session.title, 50)}`,
      );
    });
    process.exit(0);
  }

  let sessionRef = values.session;
  let continueLast = Boolean(values.continue);
  if (!sessionRef && !continueLast && positionals.length > 0) {
    // banana 1 "任务" -> 在第 1 个历史对话里单轮执行
    if (/^\d+$/.test(positionals[0]!)) {
      sessionRef = positionals.shift();
      continueLast = false;
    }
  }

  const oneShot = positionals.join(' ').trim() || undefined;

  const missingKey = (() => {
    try {
      return resolveProvider(config.current, config).needsKey;
    } catch {
      return false;
    }
  })();

  return {
    config,
    store,
    providerName: config.current,
    sessionRef,
    continueLast,
    listOnly: false,
    oneShot,
    noTools: Boolean(values['no-tools']),
    yolo: Boolean(values.yolo),
    trustProject: Boolean(values['trust-project']),
    setup: Boolean(values.setup),
    ui: Boolean(values.ui),
    port: values.port ? Number(values.port) : undefined,
    launchBrowser: values['no-open'] !== true,
    firstRun: !existsSync(configPath()),
    missingKey,
  };
}

async function askProjectTrust(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('检测到项目级配置/插件/AGENT.md，是否信任并加载？[y/N] ');
    return /^(y|yes|是)/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const resolved = await resolve(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let { config } = resolved;

  // 项目级配置/插件/AGENT.md 必须先信任；GUI 模式下交给界面弹窗处理。
  if (config.projectTrust?.status === 'pending') {
    const shouldTrust =
      resolved.trustProject || (!resolved.ui && interactive && (await askProjectTrust()));
    if (shouldTrust) {
      await trustProject(config.workspace);
      config = await loadConfig({ workspace: config.workspace });
      ui.ok('已信任并加载项目配置/插件/AGENT.md');
    } else if (!resolved.ui) {
      ui.warn('检测到未信任的项目配置/插件/AGENT.md，本次已忽略；使用 --trust-project 可信任。');
    }
  }

  // 首次启动 / 缺少 key / --setup 时进入配置向导
  const needsWizard = resolved.setup || (interactive && (resolved.firstRun || resolved.missingKey));
  let wizardRan = false;
  if (needsWizard) {
    if (!interactive) {
      ui.hint('非交互模式：将从 stdin 逐行读取向导答案（每行回答一个问题）。');
    }
    try {
      config = await runSetupWizard(config, {
        reason: resolved.setup ? 'manual' : resolved.firstRun ? 'first-run' : 'missing-key',
      });
      wizardRan = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'SETUP_CANCELLED') {
        ui.hint('已取消配置。之后可以运行 `banana --setup` 重新配置。');
        process.exit(0);
      }
      throw error;
    }
  }

  const store = resolved.store;

  let session;
  if (resolved.sessionRef) {
    session = await store.find(resolved.sessionRef);
    if (!session) {
      ui.error(`没找到对话 "${resolved.sessionRef}"。用 --list 看看有哪些。`);
      process.exit(1);
    }
  } else if (resolved.continueLast) {
    const lastId = await store.lastActive();
    session = lastId ? await store.load(lastId) : null;
    if (!session) ui.hint('没有可继续的对话，开一个新的。');
  }

  if (!session) {
    session = store.create();
    const task = resolved.oneShot;
    session.title = task ? task.replace(/\s+/g, ' ').slice(0, 42) : '新对话';
  }

  let provider;
  try {
    provider = createProvider(config.current, config);
  } catch (error) {
    // GUI 模式下不因缺 key 而退出：界面本身可以用来填 key
    if (resolved.ui) {
      ui.warn(error instanceof Error ? error.message : String(error));
      ui.hint('  图形界面会照常打开，在设置里填入 API Key 即可开始使用。');
      provider = null;
    } else {
      ui.error(error instanceof Error ? error.message : String(error));
      if (interactive) ui.hint('  运行 `banana --setup` 运行配置向导，或设置对应环境变量后重试。');
      process.exit(1);
    }
  }
  if (provider) {
    session.provider = provider.name;
    session.model = provider.model;
  }

  const tools = resolved.noTools ? [] : [...allTools];
  if (resolved.noTools) ui.hint('已禁用全部工具（--no-tools）。');

  // 加载用户级 / 项目级插件工具（.banana/tools/*.mjs）
  let pluginTools: Awaited<ReturnType<typeof loadPluginTools>>['tools'] = [];
  if (!resolved.noTools) {
    const dirs = [join(bananaHome(), 'tools')];
    if (config.projectTrust?.status === 'trusted') dirs.push(join(config.workspace, '.banana', 'tools'));
    const pluginResult = await loadPluginTools(dirs, new Set(allTools.map((tool) => tool.name)));
    for (const error of pluginResult.errors) {
      ui.warn(`插件未加载: ${error}`);
    }
    pluginTools = pluginResult.tools.filter((tool) => !config.disabledPlugins.includes(tool.name));
    if (pluginTools.length) {
      tools.push(...pluginTools);
      ui.hint(`已加载 ${pluginTools.length} 个插件工具: ${pluginTools.map((tool) => tool.name).join(', ')}`);
    }
  }

  // GUI 模式：本地服务 + 浏览器，不进入终端对话（不需要先有可用 provider）
  if (resolved.ui) {
    const handle = await startUiServer({ config, store, tools, pluginTools, port: resolved.port });
    ui.line();
    ui.ok(`GUI 已启动：${handle.url}`);
    ui.hint('只监听 127.0.0.1，URL 里的 token 是访问凭证，不要分享。按 Ctrl+C 退出。');
    if (resolved.launchBrowser) openBrowser(handle.url);
    await new Promise<void>((resolvePromise) => {
      process.on('SIGINT', () => {
        void handle.close().finally(() => resolvePromise());
      });
    });
    return;
  }

  // 走到这里说明 provider 可用（GUI 分支已在上方返回）
  const outcome = await startRepl({
    config,
    store,
    provider: provider!,
    tools,
    session,
    oneShot: resolved.oneShot,
    skipBanner: wizardRan,
  });
  // 脚本化场景（单轮 / 管道）失败时返回非零，方便 CI 判断
  if (outcome.hadError && (resolved.oneShot || !interactive)) {
    process.exitCode = 1;
  }
}

process.on('unhandledRejection', (error: unknown) => {
  ui.error(`未处理的错误: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});

main().catch((error: unknown) => {
  ui.error(error instanceof Error ? error.message : String(error));
  if (process.env['NODE_ENV'] === 'development' && error instanceof Error) {
    ui.hint(error.stack ?? '');
  }
  process.exit(1);
});