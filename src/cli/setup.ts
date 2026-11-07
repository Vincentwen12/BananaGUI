import { chmod } from 'node:fs/promises';
import { emitKeypressEvents } from 'node:readline';
import { createProvider } from '../providers/index.ts';
import { defaultProviders, configPath, saveConfig, type AppConfig, type ProviderConfig } from '../config/config.ts';
import * as ui from './ui.ts';

type PromptOptions = {
  prompt: string;
  defaultValue?: string;
  mask?: boolean;
};

let keypressReady = false;
let pipedAnswers: string[] | null = null;

function ensureKeypress(): void {
  if (keypressReady) return;
  emitKeypressEvents(process.stdin);
  keypressReady = true;
}

/** 非交互环境下从 stdin 逐行取答案（方便脚本化配置：answers.txt | banana --setup）。 */
async function readPipedAnswer(): Promise<string> {
  if (!pipedAnswers) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    pipedAnswers = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  }
  return (pipedAnswers.shift() ?? '').trim();
}

/** 不依赖 readline 的单行输入，支持掩码（用于 API key）与粘贴。 */
export function promptLine(options: PromptOptions): Promise<string> {
  const { prompt, defaultValue, mask = false } = options;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return readPipedAnswer().then((answer) => answer || (defaultValue ?? ''));
  }

  ensureKeypress();
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  const label = defaultValue ? `${prompt} ${ui.c.dim(`(${defaultValue})`)} ` : `${prompt} `;
  const characters: string[] = [];

  const render = (): void => {
    const shown = mask ? '*'.repeat(characters.length) : characters.join('');
    process.stdout.write(`\r\u001b[2K${label}${shown}`);
  };

  return new Promise<string>((resolve, reject) => {
    const cleanup = (): void => {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(Boolean(wasRaw));
      // 关键：不要把 stdin 留在 flowing 状态，否则真实终端里进程会一直不退出。
      // 下一次 promptLine 会重新 resume。
      stdin.pause();
      process.stdout.write('\n');
    };

    const onKeypress = (
      sequence: string,
      key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string },
    ): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('SETUP_CANCELLED'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        const value = characters.join('').trim();
        resolve(value || (defaultValue ?? ''));
        return;
      }
      if (key.name === 'backspace' || key.name === 'delete') {
        characters.pop();
        render();
        return;
      }
      if (key.name === 'escape' || key.name === 'tab' || key.ctrl || key.meta) return;
      if (key.name === 'left' || key.name === 'right' || key.name === 'up' || key.name === 'down') return;

      const chunk = key.sequence ?? sequence;
      if (!chunk) return;
      // 粘贴时 chunk 可能是一整段文本
      for (const character of Array.from(chunk)) {
        if (character === '\r' || character === '\n') continue;
        if (character === '\u007f' || character === '\b') {
          characters.pop();
          continue;
        }
        characters.push(character);
      }
      render();
    };

    stdin.on('keypress', onKeypress);
    render();
  });
}

async function ask(prompt: string, defaultValue = ''): Promise<string> {
  return promptLine({ prompt: ui.c.cyan('?') + ' ' + prompt, defaultValue });
}

async function askSecret(prompt: string): Promise<string> {
  return promptLine({ prompt: ui.c.cyan('?') + ' ' + prompt, mask: true });
}

async function confirm(prompt: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (
    await promptLine({ prompt: `${ui.c.cyan('?')} ${prompt} ${ui.c.dim(suffix)}` })
  )
    .trim()
    .toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes' || answer === '是';
}

/** 向导的输入接口：终端用 raw mode（可掩码），REPL 里复用现有 readline。 */
export interface WizardIO {
  ask(prompt: string, defaultValue?: string): Promise<string>;
  askSecret(prompt: string): Promise<string>;
  confirm(prompt: string, defaultYes?: boolean): Promise<boolean>;
}

export function terminalWizardIO(): WizardIO {
  return { ask, askSecret, confirm };
}

function keyStatus(provider: ProviderConfig): string {
  const env = provider.apiKeyEnv ? process.env[provider.apiKeyEnv]?.trim() : undefined;
  if (env) return ui.c.green(`环境变量 ${provider.apiKeyEnv}`);
  if (provider.apiKey) return ui.c.green('已保存 key');
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(provider.baseUrl)) return ui.c.dim('本地服务，无需 key');
  return ui.c.yellow('未配置');
}

interface TestResult {
  ok: boolean;
  detail: string;
}

export async function testConnection(config: AppConfig, name: string): Promise<TestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const provider = createProvider(name, config);
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
    const reply = (streamed || result.message.content).trim().slice(0, 80);
    return { ok: true, detail: reply || '(模型返回空内容，但连接正常)' };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, detail: '连接超时（25 秒）' };
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export interface SetupOptions {
  reason?: 'first-run' | 'missing-key' | 'manual';
  io?: WizardIO;
  /** 在会话内运行时跳过 banner（避免重复的大图）。 */
  showBanner?: boolean;
}

/** 首次启动 / 缺少 key / 手动 --setup / 会话内 /setup 时运行的配置向导。 */
export async function runSetupWizard(config: AppConfig, options: SetupOptions = {}): Promise<AppConfig> {
  const reason = options.reason ?? 'manual';
  const io = options.io ?? terminalWizardIO();
  const askFn = (prompt: string, defaultValue = ''): Promise<string> => io.ask(prompt, defaultValue);
  const confirmFn = (prompt: string, defaultYes = true): Promise<boolean> => io.confirm(prompt, defaultYes);

  ui.line();
  if (options.showBanner !== false) ui.write(`${ui.banner()}\n`);
  if (reason === 'first-run') {
    ui.line(ui.c.bold('欢迎！第一次使用，先花半分钟把模型配好。'));
  } else if (reason === 'missing-key') {
    ui.line(ui.c.bold('当前 provider 还没有 API key。'));
  } else {
    ui.line(ui.c.bold('配置向导'));
  }
  ui.hint('  Ctrl+C 可随时退出；配置会写入 ' + configPath());
  ui.line();

  if (reason !== 'manual') {
    const proceed = await confirmFn('现在配置吗？', true);
    if (!proceed) {
      ui.hint('已跳过。之后可以运行 `banana --setup` 重新配置。');
      return config;
    }
    ui.line();
  }

  // —— 选择 provider ——
  const providers = { ...defaultProviders(), ...config.providers };
  const names = Object.keys(providers);
  ui.line(ui.c.bold('可用的模型服务'));
  names.forEach((name, index) => {
    const provider = providers[name]!;
    const current = name === config.current ? ui.c.green(' ← 当前') : '';
    ui.line(
      `  ${String(index + 1).padStart(2)}. ${ui.c.cyan(name.padEnd(11))} ${ui.c.dim(provider.protocol.padEnd(10))} ${provider.model.padEnd(26)} ${keyStatus(provider)}${current}`,
    );
  });
  ui.line(
    `  ${String(names.length + 1).padStart(2)}. ${ui.c.cyan('自定义'.padEnd(11))} ${ui.c.dim('接自建网关 / vLLM / LiteLLM / 其他兼容服务')}`,
  );

  const currentIndex = names.indexOf(config.current) + 1;
  const choice = await askFn(`选择服务 [1-${names.length + 1}]`, String(currentIndex > 0 ? currentIndex : 1));
  const numeric = Number(choice);
  let chosen: string;

  if (numeric === names.length + 1) {
    // 自定义服务
    const name = (await askFn('给它起个名字（用于 /provider 切换）', 'custom')).trim() || 'custom';
    const protocolChoice = await askFn('协议：1) OpenAI 兼容  2) Anthropic 原生 [1/2]', '1');
    const protocol = protocolChoice.trim() === '2' ? 'anthropic' : 'openai';
    const baseUrl = (await askFn('Base URL（例如 https://api.example.com/v1）', '')).trim();
    if (!baseUrl) throw new Error('Base URL 不能为空。');
    const model = (await askFn('模型名（例如 qwen2.5-coder-32b）', '')).trim();
    if (!model) throw new Error('模型名不能为空。');
    providers[name] = {
      protocol,
      baseUrl,
      model,
      apiKeyEnv: `${name.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_API_KEY`,
    };
    chosen = name;
  } else if (Number.isInteger(numeric) && numeric >= 1 && numeric <= names.length) {
    chosen = names[numeric - 1]!;
  } else {
    const byName = names.find((name) => name.toLowerCase() === choice.trim().toLowerCase());
    if (!byName) throw new Error(`无效的选择: ${choice}`);
    chosen = byName;
  }

  const provider = providers[chosen]!;
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(provider.baseUrl);
  ui.line();
  ui.line(`${ui.c.bold('配置')} ${ui.c.cyan(chosen)} ${ui.c.dim(`(${provider.protocol})`)}`);

  // —— base URL / 模型 ——
  ui.hint(`  当前: ${provider.baseUrl} · ${provider.model}`);
  const tweak = await confirmFn('要修改 Base URL 或模型名吗？', false);
  if (tweak) {
    const baseUrl = (await askFn('Base URL', provider.baseUrl)).trim();
    if (baseUrl) provider.baseUrl = baseUrl.replace(/\/+$/, '');
    const model = (await askFn('模型名', provider.model)).trim();
    if (model) provider.model = model;
  }

  // —— API key ——
  const envValue = provider.apiKeyEnv ? process.env[provider.apiKeyEnv]?.trim() : undefined;
  if (envValue) {
    const useEnv = await confirmFn(`检测到环境变量 ${provider.apiKeyEnv}，直接使用吗？`, true);
    if (useEnv) {
      delete provider.apiKey;
      ui.ok(`将使用环境变量 ${provider.apiKeyEnv}`);
    } else {
      provider.apiKey = await readKey(io, chosen, provider);
    }
  } else if (provider.apiKey) {
    const keep = await confirmFn('已经保存过 API key，保留它吗？', true);
    if (!keep) provider.apiKey = await readKey(io, chosen, provider);
  } else if (isLocal) {
    const needKey = await confirmFn(
      `检测到本地服务（${provider.baseUrl}），通常不需要 API key。要设置一个吗？`,
      false,
    );
    if (needKey) provider.apiKey = await readKey(io, chosen, provider);
  } else {
    ui.hint(`  提示: 输入内容不会显示；也可以之后设置环境变量 ${provider.apiKeyEnv ?? 'XXX_API_KEY'}。`);
    provider.apiKey = await readKey(io, chosen, provider);
  }

  // —— 权限 ——
  ui.line();
  ui.line(ui.c.bold('安全策略'));
  const confirmShell = await confirmFn('执行 shell 命令前先问你？', true);
  config.permissions.shell = confirmShell ? 'ask' : 'allow';
  const confirmWrite = await confirmFn('写 / 改文件前先问你？', true);
  config.permissions.write = confirmWrite ? 'ask' : 'allow';
  ui.hint(
    `  shell: ${config.permissions.shell} · write: ${config.permissions.write} · network: ${config.permissions.network}`,
  );

  // —— 写入配置 ——
  config.current = chosen;
  config.providers = providers;
  await saveConfig(config);
  try {
    await chmod(configPath(), 0o600);
  } catch {
    // Windows 上 chmod 可能不支持，忽略
  }
  ui.line();
  ui.ok(`配置已保存：${configPath()}`);

  // —— 连接测试 ——
  ui.line();
  let verified = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    ui.hint(`正在测试 ${chosen} / ${provider.model} 的连接…`);
    const result = await testConnection(config, chosen);
    if (result.ok) {
      ui.ok(`连接成功，模型回复: ${result.detail}`);
      verified = true;
      break;
    }
    ui.error(`连接失败: ${result.detail}`);
    const retry = await confirmFn('重试一次？', true);
    if (!retry) break;
  }

  if (!verified) {
    ui.hint('连接没成功，配置已保存；可以检查 key/网络后运行 /setup 或 banana --setup 重试。');
  }

  ui.line();
  ui.line(ui.c.bold('配置完成'));
  ui.line(`  provider  ${ui.c.cyan(chosen)} (${provider.protocol})`);
  ui.line(`  模型      ${provider.model}`);
  ui.line(`  Base URL  ${provider.baseUrl}`);
  ui.line(`  权限      shell=${config.permissions.shell} / write=${config.permissions.write}`);
  ui.hint('  随时用 /provider、/model、/perm 调整，或再次运行 /setup。');
  ui.line();
  return config;
}

async function readKey(io: WizardIO, name: string, provider: ProviderConfig): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const key = (await io.askSecret(`粘贴 ${name} 的 API key（不显示）:`)).trim();
    if (key) {
      if (key.length < 8) {
        ui.warn('  这个 key 看起来太短了，再试一次。');
        continue;
      }
      return key;
    }
    ui.warn('  key 不能为空。');
  }
  throw new Error('没有输入有效的 API key。');
}
