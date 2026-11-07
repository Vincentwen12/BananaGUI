import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import { dirname, extname, join } from 'node:path';
import { collectContinuation } from './continuation.ts';
import type { AppConfig } from '../config/config.ts';
import { bananaHome, formatPreferences } from '../config/config.ts';
import { runTurn } from '../agent/loop.ts';
import { compactMessages, estimateTokens } from '../agent/context.ts';
import { createProvider } from '../providers/index.ts';
import { estimateCost, formatCost, resolvePricing } from '../providers/pricing.ts';
import type { Provider } from '../providers/types.ts';
import type { Session, SessionStore } from '../session/store.ts';
import { deriveTitle } from '../session/store.ts';
import { BackupStore, newTurnId } from '../session/backups.ts';
import { TraceWriter } from '../session/trace.ts';
import { type ApprovalKind, type Tool, type ToolContext } from '../tools/index.ts';
import { summarizeInput } from '../tools/index.ts';
import { resolvePath } from '../tools/fs.ts';
import { type CommandContext, commands, findCommand, suggestCommand } from './commands.ts';
import { completeCommand, completeFileReference } from './completion.ts';
import { runSetupWizard, type WizardIO } from './setup.ts';
import * as ui from './ui.ts';

export interface ReplOptions {
  config: AppConfig;
  store: SessionStore;
  provider: Provider;
  tools: Tool[];
  session: Session;
  /** 启动时直接执行的一轮输入（非交互模式）。 */
  oneShot?: string;
  /** 已经打印过 banner（例如刚跑完配置向导）时跳过重复展示。 */
  skipBanner?: boolean;
}

function historyPath(): string {
  return join(bananaHome(), 'history');
}

async function loadHistory(): Promise<string[]> {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, 'utf8');
    return raw.split('\n').filter(Boolean).slice(-500);
  } catch {
    return [];
  }
}

async function pushHistory(entry: string): Promise<void> {
  if (!entry.trim()) return;
  const path = historyPath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${entry.replace(/\r?\n/g, ' ⏎ ')}\n`, 'utf8');
  } catch {
    // 历史记录写不进去也不影响使用
  }
}

async function saveHistory(entries: string[]): Promise<void> {
  const path = historyPath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${entries.join('\n')}\n`, 'utf8');
  } catch {
    // 同上
  }
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export interface StartupInfo {
  providerName: string;
  model: string;
  workspace: string;
  toolCount: number;
  permissions: { shell: string; write: string; network: string };
  sessionTitle: string;
  sessionId: string;
  skipBanner?: boolean;
}

/** 启动头部：banner（可选）+ 当前模型/工作区/权限/会话。抽出来方便单测和复用。 */
export function startupHeader(info: StartupInfo): string {
  const lines: string[] = [];
  if (!info.skipBanner) lines.push(ui.banner(), '');
  lines.push(
    `  ${ui.c.dim('模型')}    ${ui.c.cyan(`${info.providerName}/${info.model}`)}`,
    `  ${ui.c.dim('工作区')}  ${info.workspace}`,
    `  ${ui.c.dim('工具')}    ${info.toolCount} 个 ${ui.c.dim('·')} 权限 shell=${info.permissions.shell} write=${info.permissions.write} network=${info.permissions.network}`,
    `  ${ui.c.dim('会话')}    ${ui.truncateDisplay(info.sessionTitle, 36)} ${ui.c.dim(`· ${info.sessionId}`)}`,
    '',
    ui.c.dim('  输入文字开始对话 · @ + Tab 补全文件 · /help 查看命令 · /exit 退出 · Ctrl+C 中断请求'),
  );
  return lines.join('\n');
}

export async function startRepl(options: ReplOptions): Promise<{ hadError: boolean }> {
  let { config, provider, tools, session } = options;
  const store = options.store;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  let controller: AbortController | null = null;
  let busy = false;
  let sigints = 0;
  let exiting = false;
  let saidGoodbye = false;
  let hadError = false;
  const historyEntries: string[] = await loadHistory();

  const rl: Interface | null = interactive
    ? createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '',
        history: historyEntries.slice(-500),
        historySize: 500,
        completer: (text: string): [string[], string] => {
          const commandHits = completeCommand(text, commands.map((command) => command.name));
          if (commandHits) return commandHits;
          const fileHits = completeFileReference(text, config.workspace);
          if (fileHits) return fileHits;
          return [[], text];
        },
      })
    : null;

  const prompt = (): string =>
    `${ui.c.magenta('🍌')} ${ui.c.bold(ui.truncateDisplay(session.title, 28))} ${ui.c.dim(`[${provider.name}/${provider.model}]`)}${pendingImages.length ? ui.c.yellow(` [+${pendingImages.length} 图]`) : ''} ${ui.c.magenta('›')} `;

  const saveSession = async (): Promise<void> => {
    await store.save(session);
  };

  /** 备份库跟着当前会话走（/new、/use 之后自动切到新会话）。 */
  const currentBackups = (): BackupStore => new BackupStore(join(bananaHome(), 'backups'), session.id);

  // 待发送的图片（data URL）与显示名，下一条用户消息一起提交
  const pendingImages: string[] = [];
  const pendingImageNames: string[] = [];
  const IMAGE_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  const attachImage = async (input: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const context: ToolContext = {
        workspace: config.workspace,
        signal: new AbortController().signal,
        approve: async () => true,
        log: () => {},
        allowOutsideWorkspace: config.allowOutsideWorkspace,
        permissions: config.permissions,
        todos: [],
      };
      const target = resolvePath(input, context);
      const mediaType = IMAGE_TYPES[extname(target).toLowerCase()];
      if (!mediaType) {
        return { ok: false, message: `不支持的图片格式；只支持 png / jpg / gif / webp。` };
      }
      const buffer = await readFile(target);
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        return { ok: false, message: `图片 ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB，超过 4MB 上限。` };
      }
      pendingImages.push(`data:${mediaType};base64,${buffer.toString('base64')}`);
      pendingImageNames.push(target.split(/[\\/]/).pop() ?? target);
      return {
        ok: true,
        message: `已附加 ${pendingImageNames[pendingImageNames.length - 1]}（${(buffer.byteLength / 1024).toFixed(0)}KB），下一条消息会一起发送。`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  };

  /** 提一个问题，但 Ctrl+C（abort）能立刻让等待结束，避免卡在确认提示上。 */
  const askWithAbort = (question: string): Promise<string> => {
    if (!rl) return Promise.resolve('');
    return new Promise<string>((resolvePromise) => {
      let settled = false;
      const onAbort = (): void => finish('__aborted__');
      const finish = (value: string): void => {
        if (settled) return;
        settled = true;
        controller?.signal.removeEventListener('abort', onAbort);
        resolvePromise(value);
      };
      controller?.signal.addEventListener('abort', onAbort, { once: true });
      rl.question(question).then(
        (value) => finish(value ?? ''),
        () => finish('__aborted__'),
      );
    });
  };

  const commandContext = (): CommandContext => ({
    config,
    store,
    session,
    provider,
    tools,
    ask: (question) => askWithAbort(question),
    confirm: async (question) => {
      if (!rl) {
        ui.hint(`(非交互模式，跳过确认) ${question}`);
        return false;
      }
      const answer = (await askWithAbort(`${ui.c.yellow('?')} ${question} ${ui.c.dim('[y/N]')} `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes' || answer === '是';
    },
    setSession: (next) => {
      session = next;
    },
    setSessionAndSave: async (next) => {
      session = next;
      await saveSession();
    },
    setProvider: (next) => {
      provider = next;
      session.provider = next.name;
      session.model = next.model;
    },
    setConfig: (next) => {
      config = next;
    },
    setTools: (next) => {
      tools = next;
    },
    saveSession,
    reloadProvider: () => {
      provider = createProvider(config.current, config);
    },
    compactNow: async () => {
      const result = await compactMessages({
        provider,
        messages: session.messages,
        keepRecentChars: Math.max(200, Math.floor(config.maxContextChars * 0.6)),
      });
      if (!result) return ui.warn('压缩失败（消息太少或模型调用出错）。');
      session.messages = result.messages;
      await saveSession();
      ui.ok(`已压缩 ${result.removed} 条消息，现在约 ${estimateTokens(session.messages)} tokens。`);
    },
    undo: async () => {
      const result = await currentBackups().undo();
      return result;
    },
    clearBackups: async (sessionId) => {
      await new BackupStore(join(bananaHome(), 'backups'), sessionId).clear();
    },
    attachImage,
    listImages: () => [...pendingImageNames],
    clearImages: () => {
      pendingImages.length = 0;
      pendingImageNames.length = 0;
    },
    runSetup: async () => {
      const wizardIO: WizardIO = {
        ask: async (prompt, defaultValue = '') => {
          const suffix = defaultValue ? ` ${ui.c.dim(`(${defaultValue})`)}` : '';
          const value = (await askWithAbort(`${ui.c.cyan('?')} ${prompt}${suffix} `)).trim();
          return value || defaultValue;
        },
        askSecret: async (prompt) => {
          ui.hint('  会话内输入的 key 会显示在屏幕上；需要掩码的话用 /exit 后运行 banana --setup。');
          return (await askWithAbort(`${ui.c.cyan('?')} ${prompt} `)).trim();
        },
        confirm: async (prompt, defaultYes = true) => {
          const suffix = defaultYes ? '[Y/n]' : '[y/N]';
          const answer = (await askWithAbort(`${ui.c.cyan('?')} ${prompt} ${ui.c.dim(suffix)} `))
            .trim()
            .toLowerCase();
          if (!answer) return defaultYes;
          return answer === 'y' || answer === 'yes' || answer === '是';
        },
      };
      const updated = await runSetupWizard(config, {
        reason: 'manual',
        io: wizardIO,
        showBanner: false,
      });
      config = updated;
      provider = createProvider(config.current, config);
      session.provider = provider.name;
      session.model = provider.model;
      await saveSession();
      ui.ok(`已切换到 ${provider.name} / ${provider.model}`);
    },
    clearScreen: ui.clearScreen,
    exit: () => {
      exiting = true;
      saidGoodbye = true;
      rl?.close();
    },
  });

  let nonInteractiveDenyNoted = false;
  const approve = async (
    kind: ApprovalKind,
    summary: string,
    preview?: string,
  ): Promise<boolean> => {
    if (!process.stdin.isTTY) {
      if (!nonInteractiveDenyNoted) {
        nonInteractiveDenyNoted = true;
        ui.hint('非交互模式默认拒绝 shell/write；需要放行请加 --yolo，或把对应权限设为 allow。');
      }
      ui.hint(`  已拒绝 ${kind}: ${summary}`);
      return false;
    }
    if (!rl) return false;
    const kindLabel = kind === 'shell' ? '执行命令' : kind === 'write' ? '写文件' : '访问网络';
    const icon = kind === 'shell' ? ui.c.yellow('⚡') : kind === 'write' ? ui.c.yellow('✏️') : ui.c.yellow('🌐');
    const header = `${icon} ${ui.c.bold('需要确认')} ${ui.c.dim(kindLabel)}`;
    const columns = process.stdout.columns ?? 100;
    const oneLine = `${header} ${summary} ${ui.c.dim('[Y/n]')} `;

    const printPreview = (text: string): void => {
      const lines = text.split('\n');
      const max = 40;
      for (const raw of lines.slice(0, max)) {
        const painted = raw.startsWith('+') ? ui.c.green(raw) : raw.startsWith('-') ? ui.c.red(raw) : ui.c.dim(raw);
        ui.line(`  ${ui.truncateDisplay(painted, columns - 4)}`);
      }
      if (lines.length > max) ui.line(ui.c.dim(`  …（还有 ${lines.length - max} 行）`));
    };

    let answer: string;
    if (preview || ui.displayWidth(oneLine) > columns - 2) {
      ui.line(`${header} ${ui.c.dim('[Y/n]')}`);
      ui.line(`  ${ui.c.bold(summary)}`);
      if (preview) printPreview(preview);
      answer = (await askWithAbort(`  ${ui.c.dim('允许吗？')} `)).trim().toLowerCase();
    } else {
      answer = (await askWithAbort(oneLine)).trim().toLowerCase();
    }
    if (answer === '__aborted__') return false;
    return answer === '' || answer === 'y' || answer === 'yes' || answer === '是';
  };

  const runTurnOnce = async (input: string): Promise<void> => {
    busy = true;
    controller = new AbortController();
    const started = Date.now();
    let printed = false;
    let reasoningOpen = false;
    let streamedInTool = false;
    session.todos ??= [];
    session.facts ??= [];
    session.unknowns ??= [];
    const todosBefore = JSON.stringify(session.todos);

    // 等待首个 token 时的状态指示，任何输出前都会先擦掉
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let statusTimer: NodeJS.Timeout | null = null;
    let statusVisible = false;
    let frameIndex = 0;
    const clearStatus = (): void => {
      if (!statusVisible) return;
      statusVisible = false;
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = null;
      process.stdout.write('\r\u001b[2K');
    };
    const startStatus = (): void => {
      if (!interactive) return;
      statusVisible = true;
      const tick = (): void => {
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        const frame = frames[frameIndex++ % frames.length];
        process.stdout.write(`\r\u001b[2K${ui.c.dim(`${frame} 等待 ${provider.name} 响应… ${elapsed}s`)}`);
      };
      tick();
      statusTimer = setInterval(tick, 120);
      statusTimer.unref?.();
    };

    if (session.messages.length === 0 && session.title === '新对话') {
      session.title = deriveTitle(input);
    }

    const closeReasoning = (): void => {
      if (!reasoningOpen) return;
      reasoningOpen = false;
      ui.line();
      ui.line();
      printed = false;
    };

    startStatus();
    const turnId = newTurnId();
    const trace = new TraceWriter(session.id, turnId);
    const recorder = await currentBackups().beginTurn(turnId, config.workspace);
    const images = pendingImages.length ? [...pendingImages] : undefined;
    let result;
    try {
      result = await runTurn(
        {
          provider,
          tools,
          permissions: config.permissions,
          system: [
            config.systemPrompt,
            config.agentDoc ? `## 项目规则（AGENT.md）\n${config.agentDoc}` : '',
            formatPreferences(config.preferences),
          ]
            .filter(Boolean)
            .join('\n\n'),
          maxSteps: config.maxSteps,
          maxContextChars: config.maxContextChars,
          toolsWorkspace: config.workspace,
          allowOutsideWorkspace: config.allowOutsideWorkspace,
          signal: controller.signal,
          todos: session.todos,
          facts: session.facts,
          unknowns: session.unknowns,
          search: config.search,
          budget: config.budget,
          onBudget: (info) => {
            const used = info.reason === 'tokens' ? `${Math.round(info.used)} tokens` : `${info.used.toFixed(1)} 分钟`;
            ui.warn(`达到本轮预算（${info.reason === 'tokens' ? 'token' : '时间'} ${used}），本轮停止。`);
          },
          recordChange: (path, before) => recorder.record(path, before),
          onText: (chunk) => {
            clearStatus();
            closeReasoning();
            if (!printed) {
              printed = true;
              ui.line();
            }
            ui.write(chunk);
          },
          onReasoning: (chunk) => {
            if (!config.showReasoning) return;
            clearStatus();
            if (!reasoningOpen) {
              if (printed) ui.line();
              printed = true;
              reasoningOpen = true;
              ui.line(ui.c.dim('· 思考中…'));
            }
            ui.write(ui.c.dim(chunk));
          },
          onToolStart: (name, toolInput) => {
            trace.add('tool_start', { name, input: summarizeInput(toolInput) });
            clearStatus();
            closeReasoning();
            if (printed) ui.line();
            printed = true;
            streamedInTool = false;
            const columns = process.stdout.columns ?? 100;
            const detail = ui.truncateDisplay(summarizeInput(toolInput), Math.max(30, columns - name.length - 8));
            ui.line(ui.toolLine(name, detail));
          },
          onToolOutput: interactive
            ? (chunk) => {
                clearStatus();
                streamedInTool = true;
                ui.write(chunk);
              }
            : undefined,
          onToolEnd: (name, toolResult) => {
            trace.add('tool_end', { name, ok: toolResult.ok, display: toolResult.display ?? '' });
            clearStatus();
            if (streamedInTool && !toolResult.content.endsWith('\n')) ui.line();
            streamedInTool = false;
            if (!toolResult.ok) {
              ui.line(`  ${ui.errorBlock(toolResult.content)}`);
            } else if (toolResult.display) {
              ui.line(`  ${ui.c.green('✓')} ${ui.c.dim(toolResult.display)}`);
            }
          },
          onNotice: (message) => {
            clearStatus();
            closeReasoning();
            ui.hint(message);
          },
          onRetry: (info) => {
            trace.add('retry', { attempt: info.attempt, reason: info.reason, delayMs: info.delayMs });
            clearStatus();
            ui.hint(`  网络重试 ${info.attempt}：${info.reason}，${info.delayMs}ms 后再试…`);
          },
          onCompact: () => {
            trace.add('compact');
            clearStatus();
            ui.hint('  已压缩历史对话。');
          },
          approve,
        },
        session.messages,
        input,
        images,
      );
    } catch (error) {
      clearStatus();
      busy = false;
      await trace.finish({ stopReason: 'error', error: error instanceof Error ? error.message : String(error) });
      await recorder.commit().catch(() => {});
      throw error;
    }
    clearStatus();
    await trace.finish({
      stopReason: result.stopReason,
      steps: result.steps,
      usage: result.usage,
      ms: Date.now() - started,
    });
    await recorder.commit().catch(() => {});

    session.messages = result.messages;
    if (printed) ui.line();
    busy = false;

    if (result.stopReason === 'done' && images) {
      // 发送成功才清空，失败/中断时保留，方便直接重试
      pendingImages.length = 0;
      pendingImageNames.length = 0;
    }

    if (result.stopReason === 'error') {
      hadError = true;
      ui.error(`请求失败: ${result.error}`);
      if (/401|unauthorized|api key/i.test(result.error ?? '')) {
        ui.hint('  看起来是鉴权问题，检查一下 API key（环境变量或 ~/.banana/config.json）。');
      }
    } else if (result.stopReason === 'aborted') {
      ui.warn('已中断。');
    } else if (result.stopReason === 'max_steps') {
      ui.warn(`已达到 ${config.maxSteps} 步上限，本轮停止。可以直接说"继续"接着做。`);
    } else if (result.stopReason === 'budget') {
      ui.warn('已达到本轮预算，停止。可以直接说"继续"接着做，或调大 config.budget。');
    }

    const previous = session.usage;
    const pricing = resolvePricing(provider.model, config.providers[config.current]?.pricing);
    const turnCost = estimateCost(result.usage, pricing);
    session.usage = {
      inputTokens: (previous?.inputTokens ?? 0) + (result.usage.inputTokens ?? 0),
      outputTokens: (previous?.outputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      costUsd: (previous?.costUsd ?? 0) + turnCost,
    };

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const turnIn = result.usage.inputTokens ?? 0;
    const turnOut = result.usage.outputTokens ?? 0;
    const totalIn = session.usage.inputTokens;
    const totalOut = session.usage.outputTokens;
    const parts = [`${result.steps} 步`, `${elapsed}s`];
    if (turnIn || turnOut) parts.push(`↑${ui.formatCount(turnIn)} ↓${ui.formatCount(turnOut)}`);
    parts.push(`上下文 ~${ui.formatCount(estimateTokens(session.messages))}`);
    if (turnCost > 0) parts.push(formatCost(turnCost));
    if (totalIn || totalOut) parts.push(`本会话 ↑${ui.formatCount(totalIn)} ↓${ui.formatCount(totalOut)}`);
    if ((session.usage.costUsd ?? 0) > 0) parts.push(`累计 ${formatCost(session.usage.costUsd ?? 0)}`);
    ui.hint(parts.join(' · '));
    ui.line(ui.divider());

    const todosAfter = JSON.stringify(session.todos ?? []);
    if (todosAfter !== todosBefore && session.todos?.length) {
      ui.line(ui.c.bold('任务清单'));
      for (const todo of session.todos) {
        const mark = todo.status === 'done' ? ui.c.green('☑') : todo.status === 'in_progress' ? ui.c.yellow('◐') : ui.c.gray('☐');
        ui.line(`  ${mark} ${todo.text}`);
      }
    }

    await saveSession();
  };

  const handleInput = async (raw: string): Promise<void> => {
    const input = raw.trim();
    if (!input) return;
    await pushHistory(input);
    historyEntries.push(input);
    if (historyEntries.length > 500) historyEntries.shift();

    if (input.startsWith('/')) {
      const [token = '', ...rest] = input.slice(1).split(/\s+/);
      const command = findCommand(token);
      if (!command) {
        const suggestion = suggestCommand(token);
        ui.error(
          suggestion
            ? `未知命令 /${token}，你是不是想用 /${suggestion}？`
            : `未知命令 /${token}。输入 /help 看可用命令。`,
        );
        return;
      }
      try {
        await command.run(rest.join(' '), commandContext());
      } catch (error) {
        ui.error(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    try {
      await runTurnOnce(input);
    } catch (error) {
      ui.error(`出错: ${error instanceof Error ? error.message : String(error)}`);
      busy = false;
    }
  };

  rl?.on('close', () => {
    exiting = true;
  });

  rl?.on('SIGINT', () => {
    if (busy && controller) {
      controller.abort();
      sigints = 0;
      return;
    }
    sigints += 1;
    if (sigints >= 2) {
      ui.line();
      void saveSession().finally(() => {
        void saveHistory(historyEntries.slice(-500));
        exiting = true;
        rl?.close();
      });
    } else {
      ui.hint('再按一次 Ctrl+C 退出，或输入 /exit。');
    }
  });

  try {
    if (options.oneShot) {
      await handleInput(options.oneShot);
      if (!saidGoodbye) ui.hint(`对话已保存：${session.id}（用 -c 继续，/list 查看）`);
      return { hadError };
    }

    if (!interactive) {
      // 脚本化模式：stdin 的每一行按顺序执行（readline 在非 TTY 下不会正确断行）
      const piped = await readAllStdin();
      for (const line of piped.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        await handleInput(trimmed);
        ui.line();
      }
      if (!saidGoodbye) ui.hint(`对话已保存：${session.id}（用 -c 继续，/list 查看）`);
      return { hadError };
    }

    ui.line();
    ui.line(
      startupHeader({
        providerName: provider.name,
        model: provider.model,
        workspace: config.workspace,
        toolCount: tools.length,
        permissions: config.permissions,
        sessionTitle: session.title,
        sessionId: session.id,
        skipBanner: options.skipBanner,
      }),
    );
    ui.line();

    while (!exiting) {
      const answer = (await rl?.question(prompt()))?.trim() ?? '';
      if (!answer) {
        if (exiting) break;
        continue;
      }
      if (answer.endsWith('\\')) {
        // 尾随反斜杠 = 续行，方便粘贴多行内容
        const buffer = await collectContinuation(
          answer,
          async () => ((await rl?.question(ui.c.dim('    … '))) ?? '').trim(),
        );
        await handleInput(buffer);
      } else {
        await handleInput(answer);
      }
      if (!exiting) ui.line(ui.divider());
    }
  } finally {
    await saveSession().catch(() => {});
    await saveHistory(historyEntries.slice(-500)).catch(() => {});
    rl?.close();
    // 别把 stdin 留在 flowing 状态：某些终端下会让进程退出时挂住
    process.stdin.pause();
  }

  if (!saidGoodbye) {
    ui.hint(`对话已保存：${session.id}（用 /list 查看，用 /use ${session.id.slice(0, 8)} 继续）`);
  }
  return { hadError };
}