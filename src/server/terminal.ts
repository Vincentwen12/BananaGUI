import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { WebSocket } from 'ws';
import type { GuiState } from './state.ts';

interface ShellSpec {
  file: string;
  args: string[];
  newline: string;
  env?: Record<string, string>;
}

function shellCommand(shell?: string): ShellSpec {
  const id = (shell ?? '').toLowerCase();
  const unixLine = id === 'wsl' || id === 'bash' || id === 'zsh' || process.platform !== 'win32';
  const newline = unixLine ? '\n' : '\r\n';
  if (process.platform === 'win32') {
    if (id === 'powershell') return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', '-'], newline };
    if (id === 'pwsh') return { file: 'pwsh.exe', args: ['-NoLogo', '-NoProfile', '-Command', '-'], newline };
    if (id === 'wsl') return { file: 'wsl.exe', args: ['bash', '-i'], newline, env: { WSL_UTF8: '1' } };
    if (id === 'bash') return { file: 'bash.exe', args: ['-i'], newline };
    return { file: process.env['COMSPEC'] || 'cmd.exe', args: ['/Q', '/K', 'chcp 65001>nul'], newline: '\r\n' };
  }
  if (id === 'bash') return { file: '/bin/bash', args: ['-i'], newline };
  if (id === 'zsh') return { file: '/bin/zsh', args: ['-i'], newline };
  return { file: process.env['SHELL'] || '/bin/sh', args: ['-i'], newline };
}

/**
 * GUI 终端使用兼容模式：普通子进程 + stdin/stdout。
 * 不依赖原生 PTY，避免 Windows conpty 加载失败时把整个服务进程带崩。
 * 交互能力足够跑命令、看输出；需要完整 PTY 时可在后续版本加开关。
 */
export async function attachTerminal(ws: WebSocket, state: GuiState, shellId?: string): Promise<void> {
  const send = (event: Record<string, unknown>): void => {
    if (ws.readyState === 1) ws.send(JSON.stringify(event));
  };
  const shell = shellCommand(shellId);
  let child: ChildProcessWithoutNullStreams | null = null;
  let closed = false;

  try {
    child = spawn(shell.file, shell.args, {
      cwd: state.config.workspace,
      env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '1', ...(shell.env ?? {}) },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    send({
      type: 'error',
      message: `终端不可用：${error instanceof Error ? error.message : String(error)}`,
    });
    ws.close();
    return;
  }

  const processRef = child;
  let wroteOutput = false;
  processRef.stdout.on('data', (chunk: Buffer) => {
    wroteOutput = true;
    send({ type: 'output', data: chunk.toString('utf8') });
  });
  processRef.stderr.on('data', (chunk: Buffer) => {
    wroteOutput = true;
    send({ type: 'output', data: chunk.toString('utf8') });
  });
  processRef.on('error', (error) => {
    send({ type: 'error', message: `终端进程错误：${error.message}` });
  });
  processRef.on('close', (code) => {
    send({ type: 'exit', code: code ?? 0 });
    if (!closed) ws.close();
  });

  send({
    type: 'ready',
    shell: `${shell.file} ${shell.args.join(' ')}`.trim(),
    cwd: state.config.workspace,
    mode: 'compat',
  });
  send({
    type: 'output',
    data: '\x1b[2mBananaGUI 兼容终端（行编辑模式）。输入命令后回车执行。\x1b[0m\r\n',
  });

  // 没有 PTY 时 shell 不会做行编辑：这里自己缓存一行，处理退格和粘贴。
  let line = '';
  const sendLine = (): void => {
    try {
      processRef.stdin.write(`${line}${shell.newline}`);
    } catch {
      send({ type: 'error', message: '终端输入通道已关闭。' });
      return;
    }
    send({ type: 'output', data: '\r\n' });
    line = '';
  };

  ws.on('message', (raw) => {
    let message: { type?: string; data?: unknown };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === 'input' && typeof message.data === 'string') {
      const data = message.data;
      // 方向键、功能键这类转义序列在无 PTY 模式里没有意义，直接忽略。
      if (data.startsWith('\x1b')) return;
      for (const char of data.replace(/\r\n/g, '\n')) {
        if (char === '\n' || char === '\r') {
          sendLine();
          continue;
        }
        if (char === '\u0003') {
          line = '';
          send({ type: 'output', data: '^C\r\n' });
          continue;
        }
        if (char === '\u007f' || char === '\b') {
          if (line) {
            line = line.slice(0, -1);
            send({ type: 'output', data: '\b \b' });
          }
          continue;
        }
        if (char === '\t') continue;
        if (char < ' ') continue;
        line += char;
        send({ type: 'output', data: char });
      }
    } else if (message.type === 'resize') {
      // 兼容模式不支持 PTY resize
    } else if (message.type === 'ping') {
      send({ type: 'pong' });
    }
  });

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    try {
      processRef.kill();
    } catch {
      // 已退出
    }
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);

  // 如果子进程立刻退出，给出明确提示而不是留空白。
  setTimeout(() => {
    if (!wroteOutput && !closed && processRef.exitCode !== null) {
      send({ type: 'notice', message: '终端进程很快退出，可能是当前环境不允许启动 shell。' });
    }
  }, 800);
}
