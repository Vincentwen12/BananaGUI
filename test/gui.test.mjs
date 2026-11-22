// GUI 集成测试：本地服务鉴权、静态资源、会话、WS 流式回合、审批、Plan 与断线恢复。
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createMockProvider, listenOnRandomPort } from './mock-provider.mjs';
import { startUiServer } from '../src/server/ui-server.ts';
import { auditPaths } from '../src/util/ui-audit.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = mkdtempSync(join(tmpdir(), 'banana-gui-'));
const workspace = join(home, 'workspace');
mkdirSync(workspace, { recursive: true });
writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'gui-fixture', version: '1.0.0' }, null, 2));
writeFileSync(join(workspace, 'note.txt'), 'hello from gui\n');
process.env.BANANA_HOME = home;
process.env.BANANA_WORKSPACE = workspace;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

const mock = createMockProvider();
const mockPort = await listenOnRandomPort(mock);
const baseUrl = `http://127.0.0.1:${mockPort}/v1`;
writeFileSync(
  join(home, 'config.json'),
  `${JSON.stringify(
    {
      current: 'openai',
      providers: {
        openai: {
          protocol: 'openai',
          baseUrl,
          model: 'mock-model',
          apiKey: 'sk-gui-test-secret',
        },
      },
      permissions: { shell: 'ask', write: 'ask', network: 'allow' },
      sessionDir: join(home, 'sessions'),
      systemPrompt: '你是测试助手。',
      maxSteps: 20,
      maxContextChars: 80000,
      showReasoning: true,
      uiGuard: 'warn',
      verifyCommands: ['node -e "process.exit(0)"'],
      search: { provider: 'free', deep: false, deepPages: 3, language: 'en' },
    },
    null,
    2,
  )}\n`,
);

const server = await startUiServer({
  port: 0,
  authToken: 'gui-test-token',
  assetsDir: join(root, 'ui'),
  launchBrowser: false,
  workspace,
});

const auth = { Authorization: 'Bearer gui-test-token' };
const base = `http://127.0.0.1:${server.port}`;

async function http(path, options = {}) {
  return fetch(`${base}${path}`, {
    headers: { ...auth, ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
    ...options,
  });
}

async function json(path, options = {}) {
  const response = await http(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data;
}

function connectWs() {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: auth,
    });
    const events = [];
    const waiters = [];
    let ready = null;
    const readyPromise = new Promise((resolveReady) => {
      ready = resolveReady;
    });
    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      events.push(message);
      if (message.type === 'ready') ready?.();
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        const waiter = waiters[index];
        if (waiter.predicate(message)) {
          waiters.splice(index, 1);
          waiter.resolve(message);
        }
      }
    });
    socket.on('error', reject);
    socket.on('open', () => {
      readyPromise.then(() => {
        resolvePromise({
          socket,
          events,
          send: (payload) => socket.send(JSON.stringify(payload)),
          waitFor(type, predicate = () => true, timeout = 20000) {
            return new Promise((resolveWaiter, rejectWaiter) => {
              const existing = events.find((event) => event.type === type && predicate(event));
              if (existing) {
                resolveWaiter(existing);
                return;
              }
              const timer = setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) waiters.splice(index, 1);
                const errors = events.filter((event) => event.type === 'error').map((event) => event.message);
                rejectWaiter(
                  new Error(
                    `等待 ${type} 超时；已收到 ${events.map((event) => event.type).join(',')}${errors.length ? `；错误: ${errors.join(' | ')}` : ''}`,
                  ),
                );
              }, timeout);
              const waiter = {
                predicate: (event) => event.type === type && predicate(event),
                resolve: (event) => {
                  clearTimeout(timer);
                  resolveWaiter(event);
                },
              };
              waiters.push(waiter);
            });
          },
          close: () => socket.close(),
          terminate: () => socket.terminate(),
        });
      });
    });
  });
}

try {
  process.stdout.write('GUI 静态与鉴权\n');
  const unauth = await fetch(`${base}/api/bootstrap`);
  check('未带 token 的 API 返回 401', unauth.status === 401, String(unauth.status));
  const tokenRedirect = await fetch(`${base}/?token=gui-test-token`, { redirect: 'manual' });
  check('token URL 设置 cookie 并重定向', tokenRedirect.status === 302 && Boolean(tokenRedirect.headers.get('set-cookie')));
  const page = await http('/index.html');
  const pageText = await page.text();
  check('界面页面可访问', page.status === 200 && pageText.includes('Banana'));
  check('页面带 CSP', Boolean(page.headers.get('content-security-policy')));
  const bootstrap = await json('/api/bootstrap');
  check('bootstrap 返回会话和模型信息', Boolean(bootstrap.session?.id && bootstrap.info?.currentProvider));
  check('bootstrap 不泄露 API key', !JSON.stringify(bootstrap).includes('sk-gui-test-secret'));
  check('bootstrap 标记 provider 已有 key', bootstrap.info.providers.some((provider) => provider.hasKey));

  const uiAudit = auditPaths([join(root, 'ui', 'src')], { strictTokens: true });
  check('界面通过反 AI 味扫描', uiAudit.violations.every((item) => item.severity !== 'fail'));

  process.stdout.write('\n会话与文件\n');
  const created = await json('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'GUI 测试会话' }) });
  check('新建会话', created.session?.title === 'GUI 测试会话');
  const renamed = await json(`/api/sessions/${created.session.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: '改名后的会话' }),
  });
  check('重命名会话', renamed.session?.title === '改名后的会话');
  const list = await json('/api/sessions');
  check('会话列表包含新会话', list.sessions.some((session) => session.id === created.session.id));
  const files = await json('/api/files?q=note');
  check('@ 文件补全能找到文件', files.files.some((file) => file.path === 'note.txt'));
  const tree = await json('/api/file/tree');
  check('文件树能列出目录', tree.items.some((item) => item.name === 'package.json'));
  const preview = await json('/api/file?path=note.txt');
  check('文件预览返回正文', preview.content.includes('hello from gui'));
  const traversal = await http('/api/file?path=../secret.txt');
  check('文件接口拒绝目录穿越', traversal.status === 400, String(traversal.status));

  process.stdout.write('\n流式回合与工具\n');
  const ws1 = await connectWs();
  ws1.send({ type: 'turn', input: '读一下配置 #read', mode: 'build' });
  await ws1.waitFor('turn_start');
  const textEvent = await ws1.waitFor('text');
  check('收到流式文本', typeof textEvent.delta === 'string' && textEvent.delta.length > 0);
  const toolStart = await ws1.waitFor('tool_start');
  check('收到工具开始事件', toolStart.name === 'read_file');
  const toolEnd = await ws1.waitFor('tool_end');
  check('收到工具结束事件', toolEnd.ok === true);
  const turnEnd = await ws1.waitFor('turn_end');
  check('回合正常结束', turnEnd.stopReason === 'done', JSON.stringify(turnEnd));
  const saved = await json(`/api/sessions/${created.session.id}`);
  check('会话落盘包含 user/assistant/tool', ['user', 'assistant', 'tool'].every((role) => saved.session.messages.some((message) => message.role === role)));

  process.stdout.write('\n审批\n');
  const shellCreated = await json('/api/sessions', { method: 'POST', body: JSON.stringify({ title: '审批会话' }) });
  ws1.events.length = 0;
  ws1.send({ type: 'turn', input: '写个文件 #write', mode: 'build' });
  const approval = await ws1.waitFor('approval_request');
  check('需要确认时发出审批请求', approval.kind === 'write' && approval.summary.includes('write_file'));
  ws1.send({ type: 'approval', id: approval.id, allow: true });
  const approvedTurnEnd = await ws1.waitFor('turn_end', (event) => event.stopReason === 'done');
  check('审批允许后回合完成', approvedTurnEnd.stopReason === 'done');
  const shellSession = await json(`/api/sessions/${shellCreated.session.id}`);
  check(
    '审批后写文件真的落盘',
    shellSession.session.messages.some((message) => message.role === 'tool' && message.isError !== true) &&
      existsSync(join(workspace, 'tmp', 'smoke.txt')),
  );
  const exports = await http(`/api/sessions/${shellCreated.session.id}/export?format=md`);
  const exported = await exports.text();
  check('导出 Markdown', exports.status === 200 && exported.includes('# '));

  process.stdout.write('\n断线审批恢复\n');
  const hangCreated = await json('/api/sessions', { method: 'POST', body: JSON.stringify({ title: '断线会话' }) });
  await ws1.waitFor('session', (event) => event.session?.id === hangCreated.session.id);
  ws1.events.length = 0;
  ws1.send({ type: 'turn', input: '再写一个文件 #write', mode: 'build' });
  await ws1.waitFor('approval_request');
  ws1.terminate();
  let idle = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    const health = await json('/api/health');
    if (!health.activeTurn) {
      idle = true;
      break;
    }
  }
  check('断开后服务端清理 activeTurn', idle);
  const ws2 = await connectWs();
  ws2.send({ type: 'turn', input: '读一下配置 #read', mode: 'build' });
  const recovered = await ws2.waitFor('turn_end', (event) => event.stopReason === 'done', 25000);
  check('关闭页面后审批不挂死，下一回合可用', recovered.stopReason === 'done');
  ws2.close();

  process.stdout.write('\nPlan / Build\n');
  const planCreated = await json('/api/sessions', { method: 'POST', body: JSON.stringify({ title: '计划会话' }) });
  const ws3 = await connectWs();
  ws3.send({ type: 'mode', mode: 'plan' });
  await ws3.waitFor('session', (event) => event.session?.mode === 'plan');
  ws3.send({ type: 'turn', input: '先计划一下 #todo', mode: 'plan' });
  await ws3.waitFor('turn_end', (event) => event.stopReason === 'done');
  const planSession = await json(`/api/sessions/${planCreated.session.id}`);
  check('Plan 模式生成待批准计划', planSession.session.plan?.status === 'pending');
  check('计划项全部重置为 pending', (planSession.session.plan?.items ?? []).every((item) => item.status === 'pending'));
  check('计划快照与 todos 分离', (planSession.session.todos ?? []).length === 0);
  const approvedPlan = await json('/api/plan/approve', { method: 'POST', body: '{}' });
  check('批准计划切换到 Build', approvedPlan.session.mode === 'build' && approvedPlan.session.plan.status === 'approved');
  check('批准后 todos 全部 pending', (approvedPlan.session.todos ?? []).length > 0 && approvedPlan.session.todos.every((item) => item.status === 'pending'));

  process.stdout.write('\n终端\n');
  const termEvents = [];
  const termSocket = new WebSocket(`ws://127.0.0.1:${server.port}/terminal`, { headers: auth });
  await new Promise((resolvePromise, reject) => {
    termSocket.on('open', resolvePromise);
    termSocket.on('error', reject);
    termSocket.on('message', (raw) => {
      try {
        termEvents.push(JSON.parse(String(raw)));
      } catch {
        // 忽略
      }
    });
  });
  termSocket.send(JSON.stringify({ type: 'input', data: 'echo gui-term\r' }));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
  const terminalUsable =
    termEvents.some((event) => event.type === 'ready') ||
    termEvents.some((event) => event.type === 'error' && String(event.message).includes('终端'));
  check('终端有明确 ready / error，不静默空白', terminalUsable, JSON.stringify(termEvents.slice(0, 4)));
  termSocket.close();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  const healthAfterTerminal = await json('/api/health');
  check('终端异常不会带崩服务', healthAfterTerminal.ok === true && !healthAfterTerminal.activeTurn);

  process.stdout.write('\n设置与安全\n');
  const settings = await json('/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      permissions: { shell: 'allow', write: 'allow', network: 'allow' },
      provider: { name: 'openai', model: 'mock-model' },
    }),
  });
  check('设置保存后权限生效', settings.info.permissions.shell === 'allow');
  check('设置响应不回传 key', !JSON.stringify(settings).includes('sk-gui-test-secret'));
  const after = await json('/api/bootstrap');
  check(
    '会话文件落盘',
    existsSync(join(home, 'sessions', `${planCreated.session.id}.json`)),
  );
  check('工作区仍在 bootstrap 中', after.info.workspace === workspace);

  ws3.close();
} catch (error) {
  check('GUI 测试执行', false, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
} finally {
  await server.close().catch(() => {});
  mock.close();
  rmSync(home, { recursive: true, force: true });
}

process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败\n`);
if (failures.length) {
  process.stdout.write(`失败项: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.exit(0);
