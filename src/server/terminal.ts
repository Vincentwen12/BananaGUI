// 内嵌终端：真实 PTY + 多会话。
// 用 @lydell/node-pty（自带预编译二进制），Windows 走 ConPTY，输出天然是 UTF-8，
// 所以中文路径和中文输出不会再乱码，提示符也由 shell 自己打印（D:\banana>）。
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IPty } from '@lydell/node-pty';
import type { WebSocket } from 'ws';

export interface ShellOption {
  id: string;
  name: string;
  file: string;
  args: string[];
}

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  name: string;
  running: boolean;
  cwd: string;
}

interface Client {
  ws: WebSocket;
  alive: boolean;
}

const isWin = process.platform === 'win32';

/** 在 PATH 里找一个可执行文件（Windows 会补 .exe）。不依赖 shell，避免启动时开子进程。 */
function findOnPath(name: string): string | null {
  const paths = (process.env['PATH'] ?? '').split(isWin ? ';' : ':').filter(Boolean);
  const exts = isWin ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of paths) {
    for (const ext of exts) {
      const candidate = join(dir, name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        /* 无权限的目录跳过 */
      }
    }
  }
  return null;
}

/** 探测机器上可用的 shell，顺序即默认优先级。 */
export function detectShells(): ShellOption[] {
  const shells: ShellOption[] = [];
  const seen = new Set<string>();
  const push = (item: ShellOption | null): void => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    shells.push(item);
  };

  if (isWin) {
    const pwsh = findOnPath('pwsh');
    push(pwsh ? { id: 'pwsh', name: 'PowerShell 7', file: pwsh, args: ['-NoLogo'] } : null);
    const powershell = findOnPath('powershell');
    push(powershell ? { id: 'powershell', name: 'Windows PowerShell', file: powershell, args: ['-NoLogo'] } : null);
    const comspec = process.env['ComSpec'] ?? findOnPath('cmd');
    push(comspec ? { id: 'cmd', name: '命令提示符', file: comspec, args: [] } : null);
    for (const bash of [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
    ]) {
      if (bash && existsSync(bash)) {
        push({ id: 'bash', name: 'Git Bash', file: bash, args: ['--login', '-i'] });
        break;
      }
    }
    const wsl = findOnPath('wsl');
    push(wsl ? { id: 'wsl', name: 'WSL', file: wsl, args: [] } : null);
  } else {
    const candidates = [
      { id: 'zsh', name: 'zsh', file: findOnPath('zsh') },
      { id: 'bash', name: 'bash', file: findOnPath('bash') },
      { id: 'sh', name: 'sh', file: findOnPath('sh') ?? '/bin/sh' },
    ];
    const preferred = process.env['SHELL'];
    for (const item of candidates) {
      if (!item.file) continue;
      push({ id: item.id, name: item.name, file: item.file, args: ['-l'] });
    }
    if (preferred) {
      const found = shells.find((item) => item.file === preferred);
      if (found) {
        shells.splice(shells.indexOf(found), 1);
        shells.unshift(found);
      }
    }
  }
  return shells;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private seq = 0;
  readonly shells: ShellOption[];

  constructor(shells?: ShellOption[]) {
    const detected = shells ?? detectShells();
    this.shells = detected.length
      ? detected
      : [{ id: 'sh', name: 'sh', file: isWin ? (process.env['ComSpec'] ?? 'cmd.exe') : '/bin/sh', args: [] }];
  }

  defaultShell(): ShellOption {
    return this.shells[0]!;
  }

  find(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  create(shellId: string, cwd: string, cols = 100, rows = 28): TerminalSession {
    const shell = this.shells.find((item) => item.id === shellId) ?? this.defaultShell();
    const id = `t${++this.seq}`;
    const session = new TerminalSession(id, shell, cwd, cols, rows);
    this.sessions.set(id, session);
    return session;
  }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((session) => session.dispose()));
  }
}

export class TerminalSession {
  readonly id: string;
  readonly shell: ShellOption;
  private pty: IPty | null = null;
  private clients = new Set<Client>();
  private buffer = '';
  private startedAt = '';
  private cwd: string;
  private exitPromise: Promise<void> = Promise.resolve();
  private exitResolve: (() => void) | null = null;
  cols: number;
  rows: number;
  running = false;

  constructor(
    id: string,
    shell: ShellOption,
    cwd: string,
    cols: number,
    rows: number,
  ) {
    this.id = id;
    this.shell = shell;
    this.cwd = existsSync(cwd) ? cwd : process.cwd();
    this.cols = Math.max(20, cols);
    this.rows = Math.max(4, rows);
    this.start();
  }

  info(): TerminalSessionInfo {
    return { id: this.id, shell: this.shell.id, name: this.shell.name, running: this.running, cwd: this.cwd };
  }

  private start(): void {
    this.startedAt = new Date().toISOString();
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value;
    }
    env['TERM'] = 'xterm-256color';
    env['COLORTERM'] = 'truecolor';
    // Windows 终端里让 Python / Node 也走 UTF-8，避免第三方程序自己输出 GBK
    env['PYTHONIOENCODING'] = 'utf-8';
    env['PYTHONUTF8'] = '1';

    try {
      // 延迟到运行时加载：没装到对应平台的预编译包时，服务本身仍然能启动
      const spawnPty = (globalThis as { __bananaPtySpawn?: typeof import('@lydell/node-pty').spawn }).__bananaPtySpawn;
      if (!spawnPty) throw new Error('PTY 未加载');
      this.pty = spawnPty(this.shell.file, this.shell.args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env,
      });
    } catch (error) {
      this.running = false;
      this.broadcast({
        type: 'error',
        message:
          `终端启动失败：${error instanceof Error ? error.message : String(error)}\n` +
          'PTY 原生模块可能没装上，试试重新安装：npm install -g @vincentbanana/bananacli',
      });
      return;
    }

    const pty = this.pty;
    this.running = true;
    this.exitPromise = new Promise<void>((resolvePromise) => {
      this.exitResolve = resolvePromise;
    });
    pty.onData((data: string) => {
      this.buffer = (this.buffer + data).slice(-200_000);
      this.broadcast({ type: 'data', data });
    });
    pty.onExit(({ exitCode, signal }) => {
      // restart 时旧进程的退出事件可能晚到，不能把新进程的状态覆盖掉
      if (this.pty !== pty) return;
      this.running = false;
      this.pty = null;
      this.exitResolve?.();
      this.exitResolve = null;
      const notice = `\r\n\x1b[90m[进程已退出，代码 ${exitCode ?? 0}]\x1b[0m\r\n`;
      this.buffer += notice;
      this.broadcast({ type: 'data', data: notice });
      this.broadcast({ type: 'exit', code: exitCode ?? 0, signal: signal ?? null });
    });
  }

  private broadcast(payload: Record<string, unknown>): void {
    const line = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.ws.readyState === 1) client.ws.send(line);
    }
  }

  attach(ws: WebSocket): void {
    const client: Client = { ws, alive: true };
    this.clients.add(client);
    ws.send(JSON.stringify({ type: 'ready', ...this.info(), startedAt: this.startedAt }));
    // 重连时把最近的屏幕内容一次性补上，再让前端继续增量渲染
    if (this.buffer) ws.send(JSON.stringify({ type: 'data', data: this.buffer }));

    ws.on('message', (raw) => {
      let message: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === 'input' && typeof message.data === 'string') this.write(message.data);
      else if (message.type === 'resize') this.resize(Number(message.cols) || 0, Number(message.rows) || 0);
      else if (message.type === 'restart') this.restart();
      else if (message.type === 'close') this.dispose();
    });
    ws.on('close', () => this.clients.delete(client));
    ws.on('error', () => this.clients.delete(client));
  }

  write(data: string): void {
    if (this.pty && this.running) this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!cols || !rows) return;
    this.cols = Math.max(20, Math.floor(cols));
    this.rows = Math.max(4, Math.floor(rows));
    try {
      this.pty?.resize(this.cols, this.rows);
    } catch {
      /* 进程刚退出时 resize 会抛，忽略 */
    }
  }

  restart(): void {
    this.disposePty();
    this.buffer = '';
    this.start();
    const pty = this.pty as IPty | null;
    if (pty) this.broadcast({ type: 'ready', ...this.info(), startedAt: this.startedAt });
  }

  async dispose(): Promise<void> {
    const pty = this.pty;
    if (pty) {
      try {
        pty.kill();
      } catch {
        /* 已经退出 */
      }
      // 等 PTY 真正退出，避免子进程的 stdout 句柄拖住父进程（npm publish 时会卡住）
      await Promise.race([
        this.exitPromise,
        new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 1500)),
      ]);
    }
    this.pty = null;
    this.running = false;
    for (const client of this.clients) {
      try {
        client.ws.close();
      } catch {
        /* 已经断开 */
      }
    }
    this.clients.clear();
  }

  disposePty(): void {
    try {
      this.pty?.kill();
    } catch {
      /* 已经退出 */
    }
    this.pty = null;
    this.running = false;
  }
}

/** 启动时把 PTY 模块解析一次，失败不影响整个 GUI 服务。 */
export async function loadPty(): Promise<boolean> {
  try {
    const mod = await import('@lydell/node-pty');
    (globalThis as { __bananaPtySpawn?: typeof import('@lydell/node-pty').spawn }).__bananaPtySpawn = mod.spawn;
    return true;
  } catch {
    return false;
  }
}

export function normalizeCwd(cwd: string | null, fallback: string): string {
  const raw = cwd?.trim();
  if (!raw) return fallback;
  const next = resolve(raw);
  try {
    return existsSync(next) && statSync(next).isDirectory() ? next : fallback;
  } catch {
    return fallback;
  }
}
