import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { WebSocket } from 'ws';
import type { GuiState } from './state.ts';

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: process.env['COMSPEC'] || 'cmd.exe', args: ['/Q', '/K'] };
  }
  return { file: process.env['SHELL'] || '/bin/sh', args: ['-i'] };
}

/**
 * GUI 终端使用兼容模式：普通子进程 + stdin/stdout。
 * 不依赖原生 PTY，避免 Windows conpty 加载失败时把整个服务进程带崩。
 * 交互能力足够跑命令、看输出；需要完整 PTY 时可在后续版本加开关。
 */
export async function attachTerminal(ws: WebSocket, state: GuiState): Promise<void> {
  const send = (event: Record<string, unknown>): void => {
    if (ws.readyState === 1) ws.send(JSON.stringify(event));
  };
  const shell = shellCommand();
  let child: ChildProcessWithoutNullStreams | null = null;
  let closed = false;

  try {
    child = spawn(shell.file, shell.args, {
      cwd: state.config.workspace,
      env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '1' },
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
    data: '\x1b[2mBananaGUI 兼容终端（无 PTY）。输入命令后回车执行。\x1b[0m\r\n',
  });

  ws.on('message', (raw) => {
    let message: { type?: string; data?: unknown };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === 'input' && typeof message.data === 'string') {
      const data = message.data;
      try {
        // Windows 管道里的 cmd.exe 需要 \r\n；xterm 的 Enter 只发 \r。
        const writeData =
          process.platform === 'win32' ? data.replace(/\r(?!\n)/g, '\r\n') : data;
        processRef.stdin.write(writeData);
      } catch {
        send({ type: 'error', message: '终端输入通道已关闭。' });
        return;
      }
      // 兼容终端没有本地回显，手动把可打印字符和换行回显给 xterm。
      if (data === '\r' || data === '\n') send({ type: 'output', data: '\r\n' });
      else if (data === '\u007f') send({ type: 'output', data: '\b \b' });
      else if (!data.startsWith('\x1b')) send({ type: 'output', data });
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
