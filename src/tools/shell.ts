import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { type Tool, type ToolContext, type ToolResult, fail, ok } from './types.ts';
import { resolvePath } from './fs.ts';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 30_000;
const MAX_DISPLAY_CHARS = 20_000;

/** 超时/中断时连同子进程一起杀掉，避免 npm/pytest 之类的子进程残留。 */
export function terminateTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return;
    } catch {
      // 退回到普通 kill
    }
  }
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // 进程可能已经退出
    }
  }
}

export const shellTool: Tool = {
  name: 'shell',
  description: [
    '在 shell 里执行一条命令并返回 stdout/stderr 与退出码。',
    '工作目录默认继承当前会话目录，可用 cwd 指定相对路径。',
    '注意：命令会真实作用于文件系统，破坏性操作执行前应先向用户确认。',
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令行' },
      cwd: { type: 'string', description: '工作目录，相对工作区根目录' },
      timeout_ms: { type: 'number', description: `超时毫秒数，默认 ${DEFAULT_TIMEOUT_MS}，最大 ${MAX_TIMEOUT_MS}` },
    },
    required: ['command'],
    additionalProperties: false,
  },
  approval: 'shell',
  async run(input, ctx: ToolContext): Promise<ToolResult> {
    const command = String(input.command ?? '').trim();
    if (!command) return fail('command 不能为空。');

    let cwd = ctx.workspace;
    if (input.cwd) {
      try {
        cwd = resolvePath(String(input.cwd), ctx);
      } catch (error) {
        return fail((error as Error).message);
      }
    }
    if (!existsSync(cwd)) return fail(`工作目录不存在: ${cwd}`);

    const requested = Number(input.timeout_ms) || DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(requested, MAX_TIMEOUT_MS);

    return new Promise<ToolResult>((resolvePromise) => {
      const child = spawn(command, {
        shell: true,
        cwd,
        windowsHide: true,
        // POSIX 下单独成组，超时能杀掉整个进程组
        detached: process.platform !== 'win32',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });

      let stdout = '';
      let stderr = '';
      let displayed = 0;
      let timedOut = false;
      let settled = false;

      const emitDisplay = (text: string, stream: 'stdout' | 'stderr'): void => {
        if (!ctx.onOutput || displayed >= MAX_DISPLAY_CHARS) return;
        const room = MAX_DISPLAY_CHARS - displayed;
        const chunk = text.length > room ? text.slice(0, room) : text;
        displayed += chunk.length;
        ctx.onOutput(chunk, stream);
        if (displayed >= MAX_DISPLAY_CHARS) {
          ctx.onOutput('\n...[实时输出已截断]\n', 'stderr');
        }
      };

      const append = (buffer: 'out' | 'err', chunk: Buffer): void => {
        const text = chunk.toString('utf8');
        emitDisplay(text, buffer === 'out' ? 'stdout' : 'stderr');
        if (buffer === 'out') {
          if (stdout.length < MAX_OUTPUT_CHARS) stdout += text;
        } else if (stderr.length < MAX_OUTPUT_CHARS) stderr += text;
      };

      child.stdout?.on('data', (chunk: Buffer) => append('out', chunk));
      child.stderr?.on('data', (chunk: Buffer) => append('err', chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        terminateTree(child);
      }, timeoutMs);

      const onAbort = (): void => {
        timedOut = true;
        terminateTree(child);
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });

      const finish = (result: ToolResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        resolvePromise(result);
      };

      child.on('error', (error) => finish(fail(`无法启动命令: ${error.message}`)));

      child.on('close', (code, signal) => {
        const truncated = (text: string): string =>
          text.length > MAX_OUTPUT_CHARS
            ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[输出被截断，共 ${text.length} 字符]`
            : text;

        if (timedOut) {
          const reason = signal ? `命令被 ${signal} 终止` : '命令超时或被中断';
          return finish(
            fail(
              [
                `$ ${command}`,
                reason,
                truncated(stdout) && '--- stdout ---\n' + truncated(stdout),
                truncated(stderr) && '--- stderr ---\n' + truncated(stderr),
              ]
                .filter(Boolean)
                .join('\n'),
              `shell: ${reason}`,
            ),
          );
        }

        const parts = [`$ ${command}`, 'exit code: ' + (code ?? 'null')];
        if (stdout) parts.push(`--- stdout ---\n${truncated(stdout)}`);
        if (stderr) parts.push(`--- stderr ---\n${truncated(stderr)}`);
        const output = parts.join('\n');

        if (code === 0) return finish(ok(output, `$ ${command}`));
        finish(fail(output, `$ ${command} -> exit ${code}`));
      });
    });
  },
};

export const shellTools: Tool[] = [shellTool];