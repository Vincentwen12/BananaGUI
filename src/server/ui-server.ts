import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';
import { bananaHome, loadConfig } from '../config/config.ts';
import { createProvider } from '../providers/index.ts';
import { SessionStore, type Session } from '../session/store.ts';
import { BackupStore } from '../session/backups.ts';
import { compactMessages } from '../agent/context.ts';
import { reviewSession } from '../agent/review.ts';
import { runVerification } from '../session/verify.ts';
import { canAdvance, nextPhase, planPhases } from '../session/phases.ts';
import { allTools, type Tool } from '../tools/index.ts';
import { loadPluginTools } from '../tools/plugins.ts';
import { version } from '../cli/ui.ts';
import { GuiState } from './state.ts';
import { runGuiTurn, type TurnPayload } from './turns.ts';
import { filePreview, fileTree, listFiles } from './files.ts';
import { attachTerminal } from './terminal.ts';
import type { ServerEvent, SettingsPatch } from './protocol.ts';

const UI_ROOT = dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 32 * 1024 * 1024;
const COOKIE_NAME = 'banana_gui_token';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function resolveAssetsDir(explicit?: string): string {
  const candidates = [
    explicit,
    join(process.cwd(), 'dist', 'ui'),
    join(UI_ROOT, '..', 'ui'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'index.html'))) return resolve(candidate);
    } catch {
      // 继续找
    }
  }
  throw new Error('找不到 GUI 界面资源：需要 dist/ui/index.html。先运行 npm run build:ui。');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const VENDOR: Record<string, string> = {
  'xterm.js': '@xterm/xterm/lib/xterm.js',
  'xterm.css': '@xterm/xterm/css/xterm.css',
  'addon-fit.js': '@xterm/addon-fit/lib/addon-fit.js',
  'highlight.min.js': '@highlightjs/cdn-assets/highlight.min.js',
};

function projectRootHints(assetsDir: string): string[] {
  return [resolve(assetsDir, '..', '..'), process.cwd()];
}

function vendorPath(assetsDir: string, name: string): string | null {
  const source = VENDOR[name];
  if (!source) return null;
  for (const root of projectRootHints(assetsDir)) {
    const candidate = join(root, 'node_modules', source);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function tokenMatches(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > BODY_LIMIT) throw new HttpError(413, '请求体超过 32MB 上限。');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON。');
  }
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // 打不开浏览器时用户仍可手动复制 URL
  }
}

function markdownFor(session: Session): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`, '');
  lines.push(`- 会话：${session.id}`);
  if (session.provider) lines.push(`- 模型：${session.provider} / ${session.model ?? ''}`);
  if (session.workspace) lines.push(`- 工作区：${session.workspace}`);
  lines.push(`- 创建：${session.createdAt}`, `- 更新：${session.updatedAt}`, '');
  if (session.plan) {
    lines.push('## 计划', '');
    for (const item of session.plan.items) {
      lines.push(`- [${item.status}] ${item.text}${item.phase ? `（${item.phase}）` : ''}`);
    }
    lines.push('');
  }
  for (const message of session.messages) {
    if (message.role === 'user') {
      lines.push('## 你', '', message.content || '（空）', '');
      if (message.images?.length) lines.push(`> 附带 ${message.images.length} 张图片`, '');
    } else if (message.role === 'assistant') {
      lines.push('## Banana', '', message.content || '（空）', '');
      if (message.toolCalls?.length) {
        lines.push(`> 调用工具：${message.toolCalls.map((call) => call.name).join('、')}`, '');
      }
    } else {
      lines.push('<details><summary>工具结果：' + (message.name ?? '') + '</summary>', '', '```text');
      lines.push(message.content.slice(0, 80_000));
      lines.push('```', '', '</details>', '');
    }
  }
  return lines.join('\n');
}

function downloadHeaders(response: ServerResponse, filename: string): void {
  response.setHeader('content-type', 'application/octet-stream');
  response.setHeader(
    'content-disposition',
    `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
  );
  response.setHeader('cache-control', 'no-store');
}

export interface UiServerOptions {
  config?: Awaited<ReturnType<typeof loadConfig>>;
  store?: SessionStore;
  session?: Session;
  provider?: Awaited<ReturnType<typeof createProvider>> | null;
  tools?: Tool[];
  port?: number;
  launchBrowser?: boolean;
  assetsDir?: string;
  authToken?: string;
  isDesktop?: boolean;
  workspace?: string;
}

export interface UiServerHandle {
  url: string;
  port: number;
  token: string;
  state: GuiState;
  close: () => Promise<void>;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  const assetsDir = resolveAssetsDir(options.assetsDir);
  const isDesktop = Boolean(options.isDesktop);
  let config = options.config;
  if (!config) config = await loadConfig({ workspace: options.workspace });
  const store = options.store ?? new SessionStore(config.sessionDir);
  await store.ensure();
  let session = options.session;
  if (!session) {
    session = store.create('新对话');
    session.workspace = config.workspace;
    session.mode = 'build';
    session.reasoning = 'standard';
  }
  let provider = options.provider ?? null;
  if (provider === null && !options.provider) {
    try {
      provider = createProvider(config.current, config);
    } catch {
      provider = null;
    }
  }
  let tools = options.tools;
  if (!tools) {
    tools = [...allTools];
    const dirs = [join(bananaHome(), 'tools')];
    const plugins = await loadPluginTools(dirs, new Set(allTools.map((tool) => tool.name)));
    tools.push(...plugins.tools.filter((tool) => !config.disabledPlugins.includes(tool.name)));
  }
  const state = new GuiState({ config, store, session, provider, tools, version });
  await state.init();

  const token = options.authToken ?? randomBytes(24).toString('base64url');
  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  let boundPort = 0;

  const allowedHosts = (): Set<string> => {
    const hosts = new Set<string>([
      `127.0.0.1:${boundPort}`,
      `localhost:${boundPort}`,
      `[::1]:${boundPort}`,
    ]);
    return hosts;
  };

  const authorized = (request: IncomingMessage): boolean => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ') && tokenMatches(header.slice(7).trim(), token)) return true;
    const value = cookies(request)[COOKIE_NAME];
    return Boolean(value && tokenMatches(value, token));
  };

  const originOk = (request: IncomingMessage): boolean => {
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
      return allowedHosts().has(new URL(origin).host);
    } catch {
      return false;
    }
  };

  const hostOk = (request: IncomingMessage): boolean => {
    const host = request.headers.host;
    if (!host) return true;
    return allowedHosts().has(host);
  };

  const broadcast = (event: ServerEvent): void => {
    const payload = JSON.stringify(event);
    for (const client of state.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };

  const sendTo = (socket: WebSocket, event: ServerEvent): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  const sendSession = (): void => {
    broadcast({ type: 'session', session: state.session });
  };

  const sendInfo = (): void => {
    broadcast({ type: 'info', info: state.publicInfo(isDesktop) });
  };

  const sendSessions = async (): Promise<void> => {
    broadcast({ type: 'sessions', sessions: await state.sessionSummaries() });
  };

  const refreshAll = async (): Promise<void> => {
    sendInfo();
    sendSessions();
    sendSession();
  };

  const guardIdle = (): void => {
    if (state.activeTurn) throw new HttpError(409, '当前回合还在运行，先停止。');
  };

  const approvePlan = async (): Promise<void> => {
    guardIdle();
    const plan = state.session.plan;
    if (!plan || plan.status !== 'pending') throw new HttpError(409, '当前没有待批准的计划。');
    plan.status = 'approved';
    plan.approvedAt = new Date().toISOString();
    plan.currentPhase = planPhases(plan.items)[0];
    state.session.mode = 'build';
    state.session.todos = plan.items.map((item) => ({ ...item, status: 'pending' as const }));
    await state.saveSession();
    await refreshAll();
    broadcast({ type: 'notice', message: '计划已批准，任务清单已就绪。', level: 'ok' });
  };

  const cancelPlan = async (): Promise<void> => {
    guardIdle();
    const plan = state.session.plan;
    if (!plan || plan.status !== 'pending') throw new HttpError(409, '当前没有待批准的计划。');
    plan.status = 'cancelled';
    state.session.mode = 'build';
    state.session.todos = [];
    await state.saveSession();
    await refreshAll();
  };

  const switchMode = async (mode: 'plan' | 'build'): Promise<void> => {
    guardIdle();
    if (mode === 'build' && state.session.plan?.status === 'pending') {
      state.session.plan.status = 'cancelled';
      state.session.todos = [];
    }
    state.session.mode = mode;
    await state.saveSession();
    await refreshAll();
  };

  const switchPhase = async (target: string): Promise<void> => {
    guardIdle();
    const plan = state.session.plan;
    if (!plan || plan.status !== 'approved') throw new HttpError(409, '当前没有已批准的计划。');
    let next = target;
    if (target === 'next') {
      const candidate = nextPhase(plan.items, plan.currentPhase);
      if (!candidate) throw new HttpError(409, '已经是最后一个阶段。');
      next = candidate;
    }
    const gate = canAdvance(plan.items, plan.currentPhase, next);
    if (!gate.ok) throw new HttpError(409, gate.reason ?? '不能进入该阶段。');
    plan.currentPhase = next;
    await state.saveSession();
    await refreshAll();
  };

  const handleApi = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const method = request.method ?? 'GET';
    const path = url.pathname;

    if (method === 'GET' && path === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        version,
        port: boundPort,
        activeTurn: state.activeTurn
          ? { sessionId: state.activeTurn.sessionId, turnId: state.activeTurn.turnId }
          : null,
      });
      return;
    }
    if (method === 'GET' && path === '/api/bootstrap') {
      sendJson(response, 200, await state.bootstrap(isDesktop));
      return;
    }
    if (method === 'GET' && path === '/api/sessions') {
      sendJson(response, 200, { sessions: await state.sessionSummaries(), session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/sessions') {
      const body = (await readJson(request)) as { title?: string; workspace?: string };
      if (body.workspace && body.workspace !== state.config.workspace) {
        await state.switchWorkspace(body.workspace);
      }
      const session = await state.createSession(body.title?.trim() || '新对话');
      await refreshAll();
      sendJson(response, 200, { session });
      return;
    }
    if (method === 'POST' && path === '/api/sessions/import') {
      const body = (await readJson(request)) as { session?: unknown } | unknown;
      const raw = typeof body === 'object' && body !== null && 'session' in body ? body.session : body;
      const session = await state.importSession(raw);
      await refreshAll();
      sendJson(response, 200, { session });
      return;
    }
    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(path);
    if (sessionMatch) {
      const id = decodeURIComponent(sessionMatch[1]!);
      if (method === 'GET') {
        const session = await state.store.load(id);
        if (!session) throw new HttpError(404, '找不到这个对话。');
        sendJson(response, 200, { session });
        return;
      }
      if (method === 'PATCH') {
        const body = (await readJson(request)) as { title?: string };
        if (!body.title) throw new HttpError(400, '标题不能为空。');
        if (id === state.session.id) {
          await state.renameSession(body.title);
        } else {
          const session = await state.store.load(id);
          if (!session) throw new HttpError(404, '找不到这个对话。');
          session.title = body.title.trim().slice(0, 80);
          session.titleSource = 'user';
          await state.store.save(session);
        }
        await refreshAll();
        sendJson(response, 200, { session: await state.store.load(id) });
        return;
      }
      if (method === 'DELETE') {
        const session = await state.deleteSession(id);
        await refreshAll();
        sendJson(response, 200, { session });
        return;
      }
    }
    const exportMatch = /^\/api\/sessions\/([^/]+)\/export$/.exec(path);
    if (method === 'GET' && exportMatch) {
      const id = decodeURIComponent(exportMatch[1]!);
      const session = await state.store.load(id);
      if (!session) throw new HttpError(404, '找不到这个对话。');
      const format = url.searchParams.get('format') === 'json' ? 'json' : 'md';
      downloadHeaders(response, `banana-${id}.${format}`);
      response.end(format === 'json' ? `${JSON.stringify(session, null, 2)}\n` : markdownFor(session));
      return;
    }
    if (method === 'POST' && path === '/api/sessions/activate') {
      const body = (await readJson(request)) as { id?: string };
      if (!body.id) throw new HttpError(400, '缺少会话 id。');
      await state.activateSession(body.id);
      await refreshAll();
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/session/clear') {
      await state.clearSession();
      await refreshAll();
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/workspace') {
      const body = (await readJson(request)) as { path?: string; sessionId?: string };
      if (!body.path) throw new HttpError(400, '缺少工作区路径。');
      const session = await state.switchWorkspace(body.path, body.sessionId);
      await refreshAll();
      sendJson(response, 200, { session, info: state.publicInfo(isDesktop) });
      return;
    }
    if (method === 'POST' && path === '/api/trust') {
      await state.trustCurrentWorkspace();
      await refreshAll();
      sendJson(response, 200, { info: state.publicInfo(isDesktop), session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/settings') {
      const body = (await readJson(request)) as SettingsPatch;
      await state.saveSettings(body);
      await refreshAll();
      sendJson(response, 200, { info: state.publicInfo(isDesktop), session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/settings/test') {
      const body = (await readJson(request)) as { name?: string };
      sendJson(response, 200, await state.testConnection(body.name));
      return;
    }
    if (method === 'POST' && path === '/api/tools/toggle') {
      const body = (await readJson(request)) as { name?: string; enabled?: boolean };
      if (!body.name) throw new HttpError(400, '缺少工具名。');
      await state.toggleTool(body.name, Boolean(body.enabled));
      await refreshAll();
      sendJson(response, 200, { info: state.publicInfo(isDesktop) });
      return;
    }
    if (method === 'POST' && path === '/api/plugins/add') {
      const body = (await readJson(request)) as { path?: string };
      if (!body.path) throw new HttpError(400, '缺少插件文件路径。');
      await state.addPlugin(body.path);
      await refreshAll();
      sendJson(response, 200, { info: state.publicInfo(isDesktop) });
      return;
    }
    if (method === 'POST' && path === '/api/plan/approve') {
      await approvePlan();
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/plan/cancel') {
      await cancelPlan();
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/mode') {
      const body = (await readJson(request)) as { mode?: 'plan' | 'build' };
      if (body.mode !== 'plan' && body.mode !== 'build') throw new HttpError(400, 'mode 只能是 plan / build。');
      await switchMode(body.mode);
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/phase') {
      const body = (await readJson(request)) as { phase?: string };
      if (!body.phase) throw new HttpError(400, '缺少阶段名。');
      await switchPhase(body.phase);
      sendJson(response, 200, { session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/undo') {
      guardIdle();
      const result = await new BackupStore(join(bananaHome(), 'backups'), state.session.id).undo();
      broadcast({ type: 'undo', ...result });
      sendJson(response, 200, result);
      return;
    }
    if (method === 'POST' && path === '/api/verify') {
      guardIdle();
      const commands = state.config.verifyCommands?.length
        ? state.config.verifyCommands
        : ['npm test', 'npm run build'];
      broadcast({ type: 'verify_start', commands });
      const results = await runVerification(commands, state.config.workspace);
      state.session.verification = { at: new Date().toISOString(), results };
      await state.saveSession();
      broadcast({ type: 'verify', results, at: state.session.verification.at });
      sendSession();
      sendJson(response, 200, { results, at: state.session.verification.at });
      return;
    }
    if (method === 'POST' && path === '/api/compact') {
      guardIdle();
      if (!state.provider) throw new HttpError(409, state.providerError || '当前 provider 缺少 key。');
      if (state.session.messages.length < 4) throw new HttpError(409, '消息太少，不用压缩。');
      const result = await compactMessages({
        provider: state.provider,
        messages: state.session.messages,
        keepRecentChars: Math.max(200, Math.floor(state.config.maxContextChars * 0.6)),
      });
      if (!result) throw new HttpError(409, '压缩失败（消息太少或模型调用出错）。');
      state.session.messages = result.messages;
      await state.saveSession();
      broadcast({ type: 'compact', removed: result.removed, byUser: true });
      await refreshAll();
      sendJson(response, 200, { removed: result.removed, session: state.session });
      return;
    }
    if (method === 'POST' && path === '/api/review') {
      guardIdle();
      if (!state.provider) throw new HttpError(409, state.providerError || '当前 provider 缺少 key。');
      if (!state.session.messages.length) throw new HttpError(409, '还没有可审查的对话。');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      try {
        const text = await reviewSession({
          provider: state.provider,
          messages: state.session.messages,
          system: state.config.systemPrompt,
          signal: controller.signal,
        });
        broadcast({ type: 'review', text });
        sendJson(response, 200, { text });
      } finally {
        clearTimeout(timer);
      }
      return;
    }
    if (method === 'GET' && path === '/api/files') {
      try {
        sendJson(response, 200, {
          files: listFiles(
            state.config.workspace,
            url.searchParams.get('q') ?? '',
            Number(url.searchParams.get('limit') ?? 80),
          ),
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (method === 'GET' && path === '/api/file/tree') {
      try {
        sendJson(response, 200, {
          items: fileTree(state.config.workspace, url.searchParams.get('path') ?? ''),
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (method === 'GET' && path === '/api/file') {
      const requested = url.searchParams.get('path');
      if (!requested) throw new HttpError(400, '缺少 path。');
      try {
        sendJson(response, 200, filePreview(state.config.workspace, requested));
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : String(error));
      }
      return;
    }
    throw new HttpError(404, `未知接口：${method} ${path}`);
  };

  const handleStatic = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const normalized = rel.replace(/^\/+/, '');
    const candidate = resolve(assetsDir, normalized);
    if (!candidate.startsWith(`${resolve(assetsDir)}${sep}`) && candidate !== resolve(assetsDir)) {
      throw new HttpError(403, '非法路径。');
    }
    let file = candidate;
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (normalized.startsWith('vendor/')) {
        const fallback = vendorPath(assetsDir, basename(normalized));
        if (fallback) file = fallback;
        else throw new HttpError(404, '静态资源不存在。');
      } else {
        throw new HttpError(404, '静态资源不存在。');
      }
    }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  };

  server.on('request', (request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${boundPort || 8787}`);
      if (!hostOk(request)) {
        sendJson(response, 403, { error: { message: 'Host 不被允许。' } });
        return;
      }
      if (!originOk(request)) {
        sendJson(response, 403, { error: { message: 'Origin 不被允许。' } });
        return;
      }
      if (url.pathname === '/' && !authorized(request)) {
        const queryToken = url.searchParams.get('token');
        if (!queryToken || !tokenMatches(queryToken, token)) {
          sendJson(response, 401, {
            error: { message: '缺少 GUI token，请使用启动命令输出的完整 URL 打开。' },
          });
          return;
        }
        const redirect = new URL('/', `http://127.0.0.1:${boundPort}`);
        for (const [key, value] of url.searchParams) {
          if (key !== 'token') redirect.searchParams.set(key, value);
        }
        response.writeHead(302, {
          location: `${redirect.pathname}${redirect.search}`,
          'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          'cache-control': 'no-store',
        });
        response.end();
        return;
      }
      if (!authorized(request)) {
        sendJson(response, 401, { error: { message: '未授权。' } });
        return;
      }
      response.setHeader(
        'content-security-policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
          "font-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-ancestors 'none'",
        ].join('; '),
      );
      if (url.pathname.startsWith('/api/')) {
        try {
          await handleApi(request, response, url);
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 500;
          const message = error instanceof Error ? error.message : String(error);
          if (!response.headersSent) sendJson(response, status, { error: { message } });
          else response.end();
        }
        return;
      }
      try {
        await handleStatic(request, response, url);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof Error ? error.message : String(error);
        if (!response.headersSent) sendJson(response, status, { error: { message } });
        else response.end();
      }
    })();
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${boundPort || 8787}`);
    if (url.pathname !== '/ws' && url.pathname !== '/terminal') {
      socket.destroy();
      return;
    }
    if (!hostOk(request) || !originOk(request) || !authorized(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      if (url.pathname === '/terminal') {
        void attachTerminal(ws, state);
        return;
      }
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (socket) => {
    state.clients.add(socket);
    void (async () => {
      try {
        const bootstrap = await state.bootstrap(isDesktop);
        sendTo(socket, { type: 'ready', ...bootstrap });
      } catch (error) {
        sendTo(socket, { type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    socket.on('message', (raw) => {
      void (async () => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(raw)) as Record<string, unknown>;
        } catch {
          sendTo(socket, { type: 'error', message: '消息不是合法 JSON。' });
          return;
        }
        try {
          const type = String(message['type'] ?? '');
          if (type === 'turn') {
            await runGuiTurn(
              { state, broadcast, abortAll: () => {} },
              {
                input: typeof message['input'] === 'string' ? message['input'] : '',
                images: Array.isArray(message['images'])
                  ? message['images'].filter((item): item is string => typeof item === 'string')
                  : undefined,
                mode: message['mode'] === 'plan' || message['mode'] === 'build' ? message['mode'] : undefined,
                reasoning:
                  message['reasoning'] === 'fast' ||
                  message['reasoning'] === 'standard' ||
                  message['reasoning'] === 'deep'
                    ? message['reasoning']
                    : undefined,
              } satisfies TurnPayload,
              socket,
            );
            await refreshAll();
          } else if (type === 'abort') {
            if (state.activeTurn) {
              state.activeTurn.controller.abort();
              for (const approval of [...state.pendingApprovals.values()]) approval.resolve(false);
              broadcast({ type: 'notice', message: '已请求中断当前回合。', level: 'warn' });
            }
          } else if (type === 'approval') {
            const id = String(message['id'] ?? '');
            const pending = state.pendingApprovals.get(id);
            const allow = Boolean(message['allow']);
            if (pending) pending.resolve(allow);
            broadcast({ type: 'approval_resolved', id, allow });
          } else if (type === 'activate') {
            const id = String(message['id'] ?? '');
            await state.activateSession(id);
            await refreshAll();
          } else if (type === 'mode') {
            const mode = message['mode'] === 'plan' ? 'plan' : 'build';
            await switchMode(mode);
          } else if (type === 'resync') {
            sendTo(socket, { type: 'ready', ...(await state.bootstrap(isDesktop)) });
          } else if (type === 'ping') {
            sendTo(socket, { type: 'pong' });
          } else {
            sendTo(socket, { type: 'error', message: `未知消息类型：${type}` });
          }
        } catch (error) {
          sendTo(socket, {
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    });

    socket.on('close', () => {
      state.clients.delete(socket);
      for (const approval of [...state.pendingApprovals.values()]) {
        if (approval.owner === socket) approval.resolve(false);
      }
      if (state.clients.size === 0 && state.activeTurn) {
        state.activeTurn.controller.abort();
        for (const approval of [...state.pendingApprovals.values()]) approval.resolve(false);
      }
    });
  });

  state.clients.clear();

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const address = server.address();
      boundPort = typeof address === 'object' && address ? address.port : 0;
      resolvePromise();
    });
  });

  const url = `http://127.0.0.1:${boundPort}/?token=${encodeURIComponent(token)}`;
  if (options.launchBrowser !== false) openBrowser(url);

  const close = async (): Promise<void> => {
    state.activeTurn?.controller.abort();
    for (const approval of [...state.pendingApprovals.values()]) approval.resolve(false);
    for (const client of state.clients) client.close();
    state.clients.clear();
    await state.saveSession().catch(() => {});
    await new Promise<void>((resolvePromise) => wss.close(() => resolvePromise()));
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  };

  return { url, port: boundPort, token, state, close };
}
