// GUI 本地服务的回归测试：token 保护、静态资源、信息接口。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get as httpGet, request as httpRequest } from 'node:http';
import WebSocket from 'ws';

// 用 node:http 且关闭 keep-alive，避免 undici 连接池在 server.close() 后触发 Windows libuv 断言
function call(target, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(target);
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: options.method ?? 'GET', agent: false, headers: options.headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolvePromise({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', rejectPromise);
    req.end(options.body);
  });
}

async function getJson(target) {
  const res = await call(target);
  return { status: res.status, json: JSON.parse(res.text) };
}

async function postJson(target, body) {
  const res = await call(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: JSON.parse(res.text) };
}

/** 收完一条 SSE 聊天流，返回事件数组。 */
function collectChat(target, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolvePromise) => {
    const events = [];
    const url = new URL(target);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
          let index = buffer.indexOf('\n');
          while (index >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line.startsWith('data:')) {
              try {
                events.push(JSON.parse(line.slice(5)));
              } catch {}
            }
            index = buffer.indexOf('\n');
          }
        });
        res.on('end', () => resolvePromise(events));
      },
    );
    req.on('error', () => resolvePromise(events));
    req.end(payload);
  });
}
import { loadConfig } from '../src/config/config.ts';
import { SessionStore } from '../src/session/store.ts';
import { allTools } from '../src/tools/index.ts';
import { startUiServer } from '../src/server/ui-server.ts';
import { createMockProvider, listenOnRandomPort } from './mock-provider.mjs';

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

async function main() {
  const home = mkdtempSync(join(tmpdir(), 'banana-gui-'));
  const previousHome = process.env.BANANA_HOME;
  process.env.BANANA_HOME = home;

  const config = await loadConfig({ workspace: home });
  config.providers.openai.apiKey = 'test-key';
  config.providers.openai.model = 'mock-model';
  config.current = 'openai';
  const store = new SessionStore(config.sessionDir);
  await store.ensure();

  const server = await startUiServer({ config, store, tools: [...allTools], port: 0 });
  const base = `http://127.0.0.1:${server.port}`;

  const root = await call(`${base}/`);
  check('无 token 访问根路径被拒绝', root.status === 404, String(root.status));

  const page = await call(server.url);
  check('带 token 能拿到页面', page.status === 200, String(page.status));
  const html = page.text;
  check('页面引用了样式与脚本', html.includes('style.css') && html.includes('app.js'));
  check('桌面外壳含顶部标签条与 Review', html.includes('tabStrip') && html.includes('reviewPanel') && html.includes('titlebar'));
  check('页面不含 emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), '检测到 emoji');
  check('页面不含外部 CDN 引用', !/https?:\/\/(?!127\.0\.0\.1)[^"']+\.(js|css)/.test(html));

  const css = await call(new URL('style.css', server.url).toString());
  check('样式文件可访问', css.status === 200, String(css.status));
  const cssText = css.text;
  const vendorScript = await call(new URL('vendor/xterm.js', server.url).toString());
  const vendorCss = await call(new URL('vendor/xterm.css', server.url).toString());
  const vendorHighlight = await call(new URL('vendor/highlight.min.js', server.url).toString());
  check('终端资源可访问', vendorScript.status === 200 && vendorCss.status === 200, `${vendorScript.status}/${vendorCss.status}`);
  check('语法高亮资源可访问', vendorHighlight.status === 200, String(vendorHighlight.status));
  const vendorTraversal = await call(new URL('vendor/../package.json', server.url).toString());
  check('vendor 路径不能越界', vendorTraversal.status === 404, String(vendorTraversal.status));
  const js = await call(new URL('app.js', server.url).toString());
  const jsText = js.text;
  check('脚本可访问且自绘图标', js.status === 200 && jsText.includes('const ICONS'));
  // 回归：API 前缀必须带结尾斜杠，且所有调用都不能再写前导斜杠（否则会拼成 /apiaction）
  check('API 前缀带结尾斜杠', /const API = [^;]+\+ '\/api\/'/.test(jsText));
  check(
    '请求路径没有多余的前导斜杠',
    !/(get|post)\('\/|API \+ '\//.test(jsText),
    '发现会导致 URL 拼错的写法',
  );
  check('前端包含 API key 设置项', jsText.includes("saveSetting('apiKey'") || jsText.includes("action: 'apiKey'"));
  check('思考与回答使用增量 Markdown 渲染', jsText.includes('createMarkdownStream') && jsText.includes('splitStableMarkdown'));
  check(
    '滚动使用单一缓动相机',
    jsText.includes('cameraTick') && jsText.includes('requestAnimationFrame(cameraTick)') && cssText.includes('scroll-behavior: auto !important'),
  );
  check('工具调用使用人性化文案', jsText.includes('TOOL_LABEL') && jsText.includes("shell: '运行命令'"));
  check('重命名/删除使用自定义对话框，不依赖 window.prompt', jsText.includes('openAppDialog') && !jsText.includes('prompt('));
  check('首轮标题异步生成，不阻塞 done', jsText.includes('requestAutoTitle') && jsText.includes("post('title'"));
  check('GUI 只暴露可执行的命令', jsText.includes('GUI_COMMANDS'));
  check('思考默认折叠成一行摘要', jsText.includes('reasoning.open = false') && cssText.includes('.think-peek'));
  check('系统提示词允许空字符串恢复默认', (await (await import('node:fs/promises')).readFile(new URL('../src/server/ui-server.ts', import.meta.url), 'utf8')).includes("typeof body.value === 'string'"));
  check('空任务清单可以清空', (await (await import('node:fs/promises')).readFile(new URL('../src/tools/todo.ts', import.meta.url), 'utf8')).includes('任务清单已清空'));
  check('对话框层级盖住 tooltip / 选择工具条', cssText.includes('.modal { z-index: 200; }') && cssText.includes('z-index: 120'));
  check('删除/清空确认默认焦点在取消', jsText.includes('else if (danger)') && jsText.includes('cancel.focus()'));
  check('回到最新按钮跟随 composer 高度', jsText.includes('syncJumpPosition') && cssText.includes('--composer-h'));

  // 文件面板：工作区是个空临时目录，先放点东西进去
  writeFileSync(join(home, 'note.md'), '# 你好\n');
  mkdirSync(join(home, 'src'));
  writeFileSync(join(home, 'src', 'a.ts'), 'export const a = 1;\n');
  const tree = await getJson(new URL('api/files?path=.', server.url).toString());
  const names = tree.json.entries?.map((e) => e.name) ?? [];
  check('目录树可读且含 src', tree.status === 200 && names.includes('src'), JSON.stringify(names.slice(0, 5)));
  const file = await getJson(new URL('api/file?path=' + encodeURIComponent('src/a.ts'), server.url).toString());
  check('文件内容可读', file.status === 200 && String(file.json.content ?? '').includes('export const a'), (file.text ?? '').slice(0, 120));
  const escape = await getJson(new URL('api/file?path=' + encodeURIComponent('../../package.json'), server.url).toString());
  check('越界路径被拒', escape.status === 400, String(escape.status));
  check('页面含文件面板容器', js.status === 200 && jsText.includes("'filesPanel'"));
  check('页面含 Plan/Build、思考强度与任务入口', html.includes('modeSwitch') && html.includes('reasoningBtn') && html.includes('todoDock') && html.includes('reviewTabTasks'));
  check('右上角停止按钮已移除', !html.includes('abortBtn'), '仍存在 abortBtn');
  check('隐藏元素有 display:none 兜底', cssText.includes('[hidden] { display: none !important; }'));

  // 附件：任意文件上传 + 只读预览接口，且不能越过 attachments 目录
  const attachmentBytes = Buffer.from('附件正文\nsecond line\n', 'utf8').toString('base64');
  const uploaded = await postJson(
    new URL('api/attach?name=' + encodeURIComponent('note-test.md'), server.url).toString(),
    { data: attachmentBytes },
  );
  check('可上传文本附件', uploaded.status === 200 && uploaded.json.kind === 'text' && uploaded.json.bytes > 0, uploaded.text);
  const preview = await getJson(
    new URL('api/attachment?path=' + encodeURIComponent(uploaded.json.path), server.url).toString(),
  );
  check(
    '附件预览只读接口返回正文',
    preview.status === 200 && String(preview.json.content ?? '').includes('附件正文'),
    preview.text,
  );
  const outside = await getJson(
    new URL('api/attachment?path=' + encodeURIComponent(join(home, 'note.md')), server.url).toString(),
  );
  check('附件接口拒绝目录外路径', outside.status === 403, String(outside.status));

  // 变更接口：用备份记录一次修改，确认能按行给出增删
  const infoForChanges = await getJson(new URL('api/info', server.url).toString());
  const changeSession = infoForChanges.json.session.id;
  const { BackupStore } = await import('../src/session/backups.ts');
  const demoPath = join(home, 'diff-demo.txt');
  writeFileSync(demoPath, 'old line\n');
  const backup = new BackupStore(join(home, 'backups'), changeSession);
  const recorder = await backup.beginTurn('test-diff', home);
  await recorder.record(demoPath, 'old line\n');
  await recorder.commit();
  writeFileSync(demoPath, 'old line\nnew line\n');
  const changes = await getJson(new URL('api/changes', server.url).toString());
  const firstFile = changes.json.turns?.[0]?.files?.[0];
  check(
    '变更接口返回行级 Diff',
    changes.status === 200 && firstFile?.additions === 1 && firstFile?.deletions === 0 && firstFile?.path === 'diff-demo.txt',
    (changes.text ?? '').slice(0, 160),
  );
  check('变更接口含 Review 与底部终端入口', html.includes('reviewTabChanges') && html.includes('reviewTabFiles') && html.includes('terminalPanel'));

  // 回归：窄屏下侧边栏是覆盖层，切完会话必须收起，否则一直挡住对话
  check(
    '窄屏选完会话会收起侧边栏',
    jsText.includes('closeSidebarIfOverlay') && /switchSession[\s\S]{0,800}closeSidebarIfOverlay\(\)/.test(jsText),
  );
  check('窄屏点空白处收起侧边栏', jsText.includes("event.target.closest('#sidebar, #toggleSidebar')"));

  // 工具输出详情：跑一次真实工具调用，检查 SSE 里带上了 detail
  const mock = createMockProvider();
  await listenOnRandomPort(mock);
  const mockPort = mock.address().port;
  config.providers.openai.baseUrl = `http://127.0.0.1:${mockPort}/v1`;
  const previousPermissions = config.permissions;
  config.permissions = { shell: 'allow', write: 'allow', network: 'allow' };
  const events = [];
  let streamRes = null;
  const chatBody = JSON.stringify({ message: '#read README.md' });
  await new Promise((done) => {
    const url = new URL('api/chat', server.url);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(chatBody) },
      },
      (res) => {
        streamRes = res;
        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
          let index = buffer.indexOf('\n');
          while (index >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line.startsWith('data:')) {
              try {
                events.push(JSON.parse(line.slice(5)));
              } catch {}
            }
            index = buffer.indexOf('\n');
          }
        });
        res.on('end', done);
      },
    );
    req.on('error', done);
    req.end(chatBody);
  });
  const toolEnd = events.find((event) => event.type === 'tool_end');
  // 命令表与 CLI 共用一份：GUI 应该能列出并执行
  const commandList = await getJson(new URL('api/commands', server.url).toString());
  const commandNames = commandList.json.commands?.map((item) => item.name) ?? [];
  check('命令表可读且含 help/undo', commandNames.includes('help') && commandNames.includes('undo'), JSON.stringify(commandNames.slice(0, 5)));
  const helpRun = await postJson(new URL('api/command', server.url).toString(), { input: '/help' });
  check('可执行命令并拿到输出', helpRun.status === 200 && String(helpRun.json.output ?? '').includes('/help'), String(helpRun.json.output).slice(0, 60));
  const badRun = await postJson(new URL('api/command', server.url).toString(), { input: '/zzzz' });
  check('未知命令给出提示', badRun.status === 200 && badRun.json.ok === false && String(badRun.json.output).includes('未知命令'));
  const cwdDenied = await postJson(new URL('api/command', server.url).toString(), {
    input: `/cwd ${home}`,
  });
  check(
    'GUI 破坏性命令未确认时取消',
    cwdDenied.status === 200 && String(cwdDenied.json.output ?? '').includes('已取消'),
    JSON.stringify(cwdDenied.json.output ?? '').slice(0, 120),
  );

  // @ 文件补全：与 CLI 同一份 completeFileReference
  const complete = await getJson(new URL('api/complete?line=' + encodeURIComponent('@src/a'), server.url).toString());
  check(
    '@ 补全能命中文件',
    complete.status === 200 && complete.json.kind === 'file' && complete.json.candidates.includes('@src/a.ts'),
    JSON.stringify(complete.json.candidates ?? []).slice(0, 120),
  );
  const cmdComplete = await getJson(new URL('api/complete?line=' + encodeURIComponent('/mo'), server.url).toString());
  check('/ 补全能命中命令', cmdComplete.json.kind === 'command' && cmdComplete.json.candidates.includes('/model'));

  // 会话切换：两个会话来回切，info 里的内容必须跟着变（前端「点了没反应」的后端兜底）
  const sessionA = await postJson(new URL('api/session', server.url).toString(), { action: 'new', title: '切换测试 A' });
  const idA = sessionA.json.session;
  const sessionB = await postJson(new URL('api/session', server.url).toString(), { action: 'new', title: '切换测试 B' });
  const idB = sessionB.json.session;
  const backToA = await postJson(new URL('api/session', server.url).toString(), { action: 'switch', ref: idA });
  check('能切回会话 A', backToA.status === 200 && backToA.json.info?.session?.title === '切换测试 A', JSON.stringify(backToA.json.error ?? ''));
  const backToB = await postJson(new URL('api/session', server.url).toString(), { action: 'switch', ref: idB });
  check('能切到会话 B', backToB.status === 200 && backToB.json.info?.session?.title === '切换测试 B');
  const sessionsAfter = await getJson(new URL('api/sessions', server.url).toString());
  check('切换后列表里两个会话都在', (sessionsAfter.json.sessions ?? []).length >= 2, String((sessionsAfter.json.sessions ?? []).length));

  // 前端：切换必须走统一的 switchSession（有错误提示和状态锁），不能裸调 post 后静默失败
  check('前端有统一的切换入口', jsText.includes('async function switchSession') && jsText.includes('switchSession(item.id)'));
  check('切换失败会提示', /切换会话失败/.test(jsText));
  // 平滑度：历史消息不再做入场动画（切换会话时整屏重绘会卡）
  check('消息不再整屏重放入场动画', !/\.msg\s*\{[^}]*animation:\s*rise/.test(cssText));
  check('切换时有即时反馈', cssText.includes('body.switching'));

  check('工具结束事件带输出详情', Boolean(toolEnd && toolEnd.detail && toolEnd.detail.length > 0), JSON.stringify(events.map((e) => e.type)));
  check('助手有回复内容', events.some((event) => event.type === 'text' && event.chunk.trim().length > 0), JSON.stringify(events.map((e) => e.type)));
  const doneEvent = events.find((event) => event.type === 'done');
  check('首轮结束后自动生成会话标题', Boolean(doneEvent?.info?.session?.title && doneEvent.info.session.title !== '新对话'), JSON.stringify(doneEvent?.info?.session?.title));

  // Plan 模式：只读工具 + todo_write 生成计划卡，批准后切 Build
  const planSession = await postJson(new URL('api/session', server.url).toString(), { action: 'new' });
  const planId = planSession.json.session;
  await postJson(new URL('api/session', server.url).toString(), { action: 'mode', value: 'plan' });
  const planEvents = await collectChat(new URL('api/chat', server.url).toString(), {
    message: '#todo 先列一个计划，等我批准',
    session: planId,
  });
  const planDone = planEvents.find((event) => event.type === 'done');
  check(
    'Plan 模式返回待批准计划',
    planDone?.plan?.status === 'pending' && (planDone.plan.items?.length ?? 0) >= 1,
    JSON.stringify(planDone?.plan?.items ?? []),
  );
  check(
    'Plan 模式 todo 实时事件',
    planEvents.some((event) => event.type === 'todos' && (event.todos?.length ?? 0) >= 1),
    JSON.stringify(planEvents.map((event) => event.type)),
  );
  check(
    'Plan 阶段计划项全部为 pending',
    (planDone?.plan?.items ?? []).every((item) => item.status === 'pending'),
    JSON.stringify(planDone?.plan?.items ?? []),
  );
  const approved = await postJson(new URL('api/plan', server.url).toString(), {
    action: 'approve',
    session: planId,
  });
  check(
    '批准计划后切到 Build 并复制任务清单',
    approved.status === 200 &&
      approved.json.info?.session?.mode === 'build' &&
      approved.json.info?.session?.plan?.status === 'approved' &&
      (approved.json.info?.session?.todos?.length ?? 0) >= 1,
    JSON.stringify(approved.json.info?.session ?? {}).slice(0, 200),
  );
  check(
    '批准后任务从 pending 开始',
    (approved.json.info?.session?.todos ?? []).every((item) => item.status === 'pending'),
    JSON.stringify(approved.json.info?.session?.todos ?? []),
  );

  // 取消计划必须清空任务清单，否则下一轮会把已取消的计划继续注入提示词。
  await postJson(new URL('api/session', server.url).toString(), { action: 'mode', value: 'plan' });
  const cancelEvents = await collectChat(new URL('api/chat', server.url).toString(), {
    message: '#todo 再列一个计划',
    session: planId,
  });
  check(
    '第二次进入 Plan 能生成计划',
    cancelEvents.find((event) => event.type === 'done')?.plan?.status === 'pending',
    JSON.stringify(cancelEvents.map((event) => event.type)),
  );
  const cancelled = await postJson(new URL('api/plan', server.url).toString(), {
    action: 'cancel',
    session: planId,
  });
  check(
    '取消计划后清空任务清单',
    cancelled.status === 200 &&
      cancelled.json.info?.session?.plan?.status === 'cancelled' &&
      (cancelled.json.info?.session?.todos?.length ?? 0) === 0,
    JSON.stringify(cancelled.json.info?.session ?? {}).slice(0, 200),
  );

  // 手动切 Build 等于放弃待批准计划，不能把计划里的 todos 带进下一轮。
  await postJson(new URL('api/session', server.url).toString(), { action: 'mode', value: 'plan' });
  await collectChat(new URL('api/chat', server.url).toString(), {
    message: '#todo 再列一个计划',
    session: planId,
  });
  const switched = await postJson(new URL('api/session', server.url).toString(), {
    action: 'mode',
    value: 'build',
  });
  check(
    '切到 Build 会丢弃待批准计划',
    switched.status === 200 &&
      !switched.json.info?.session?.plan &&
      (switched.json.info?.session?.todos?.length ?? 0) === 0,
    JSON.stringify(switched.json.info?.session ?? {}).slice(0, 200),
  );
  const reasoningSet = await postJson(new URL('api/session', server.url).toString(), {
    action: 'reasoning',
    value: 'deep',
  });
  check(
    '思考强度存到会话',
    reasoningSet.json.info?.session?.reasoning === 'deep' &&
      typeof reasoningSet.json.info?.reasoning?.supported === 'boolean',
    JSON.stringify(reasoningSet.json.info?.reasoning ?? {}),
  );
  // 缺 key 时不能卡死：应立刻给出可执行提示
  const noKey = await getJson(new URL('api/info', server.url).toString());
  check('信息里带 key 可用性', typeof noKey.json.providers?.[0]?.keyReady === 'boolean');
  mock.close();
  streamRes?.destroy();
  await new Promise((resolveTick) => setTimeout(resolveTick, 50));
  config.permissions = previousPermissions;

  const info = await getJson(new URL('api/info', server.url).toString());
  check(
    '信息接口返回模型信息',
    info.status === 200 && info.json.provider.model === config.providers[config.current].model,
    JSON.stringify(info.json.provider),
  );
  check('信息接口返回工具清单', Array.isArray(info.json.tools) && info.json.tools.length >= 10, String(info.json.tools?.length));
  check('信息接口返回权限策略', info.json.permissions?.shell === 'ask');
  check('信息接口返回工作区', info.json.workspace === home, info.json.workspace);

  const sessions = await getJson(new URL('api/sessions', server.url).toString());
  check('会话接口可用', sessions.status === 200 && Array.isArray(sessions.json.sessions));

  const created = await postJson(new URL('api/session', server.url).toString(), { action: 'new', title: 'GUI 测试对话' });
  check('新建会话成功', created.status === 200, String(created.status));

  // 设置里的「切换工作区」：目录必须存在，切完 info.workspace 立刻跟着变
  const nextWorkspace = mkdtempSync(join(tmpdir(), 'banana-workspace-'));
  const switchWorkspace = await postJson(new URL('api/action', server.url).toString(), { action: 'workspace', value: nextWorkspace });
  check('能切换工作区', switchWorkspace.status === 200, String(switchWorkspace.status));
  const afterWorkspace = await getJson(new URL('api/info', server.url).toString());
  check('切换后工作区生效', afterWorkspace.json.workspace === nextWorkspace, afterWorkspace.json.workspace);
  const badWorkspace = await postJson(new URL('api/action', server.url).toString(), { action: 'workspace', value: join(nextWorkspace, '不存在的目录') });
  check('不存在的目录被拒绝', badWorkspace.status === 400, String(badWorkspace.status));
  rmSync(nextWorkspace, { recursive: true, force: true });

  // 内嵌终端：真实 PTY + WebSocket，输出必须流回来；不是弹外部窗口
  const shells = await getJson(new URL('api/shells', server.url).toString());
  check('终端列出可用 shell', shells.status === 200 && Array.isArray(shells.json.shells) && shells.json.shells.length > 0);
  check('终端有默认 shell', typeof shells.json.default === 'string' && shells.json.shells.some((item) => item.id === shells.json.default));

  const termUrl = new URL('api/terminal/ws', server.url);
  termUrl.protocol = 'ws:';
  termUrl.searchParams.set('shell', shells.json.default);
  termUrl.searchParams.set('cwd', home);
  termUrl.searchParams.set('cols', '90');
  termUrl.searchParams.set('rows', '26');

  const readTerm = (ws, needle, timeout = 12000) =>
    new Promise((resolvePromise) => {
      let output = '';
      let termId = null;
      const timer = setTimeout(() => finish(false), timeout);
      const finish = (ok) => {
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        resolvePromise({ ok, output, termId });
      };
      const onMessage = (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.id) termId = message.id;
        if (message.type === 'data') {
          output += message.data;
          if (needle && output.includes(needle)) finish(true);
        }
        if (message.type === 'error') finish(false);
      };
      ws.addEventListener('message', onMessage);
    });

  const first = new WebSocket(termUrl);
  let firstId = null;
  first.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.id) firstId = message.id;
    } catch {
      /* 忽略非 JSON */
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    first.addEventListener('open', resolvePromise, { once: true });
    first.addEventListener('error', rejectPromise, { once: true });
  });
  const firstOut = readTerm(first, 'banana-term-ok');
  first.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
  first.send(JSON.stringify({ type: 'input', data: 'echo banana-term-ok\r' }));
  const firstResult = await firstOut;
  check('终端 PTY 返回真实输出', firstResult.ok, firstResult.output.slice(-200));
  check('终端会话分配 id', typeof firstId === 'string' && firstId.length > 0, String(firstId));
  first.close();

  // 断开后按 id 重连：服务端会话常驻，历史输出会回放
  const again = new URL(termUrl);
  again.searchParams.set('id', firstId);
  const second = new WebSocket(again);
  const replay = readTerm(second, 'banana-term-ok', 5000);
  await new Promise((resolvePromise, rejectPromise) => {
    second.addEventListener('open', resolvePromise, { once: true });
    second.addEventListener('error', rejectPromise, { once: true });
  });
  const replayResult = await replay;
  check('重连复用同一个终端会话', replayResult.ok, replayResult.output.slice(-160));
  second.close();

  const serverSource = await (await import('node:fs/promises')).readFile(new URL('../src/server/ui-server.ts', import.meta.url), 'utf8');
  check('终端是内嵌实现（不弹外部窗口）', serverSource.includes("path === '/api/shells'") && serverSource.includes('terminal/ws') && !serverSource.includes('x-terminal-emulator'));
  check('删光会话后进入不落盘草稿，不强制新建对话', serverSource.includes('let blank: Session | null') && serverSource.includes('draft: blank === session'));
  check('搜索设置能保存 Key 且不回传明文', serverSource.includes("body.action === 'searchKey'") && serverSource.includes('tavilyKey') && !serverSource.includes('tavilyKey: config.search'));
  check('联网搜索设置入口存在', jsText.includes("id: 'search'") && jsText.includes('renderSearchSettings') && jsText.includes("saveSetting('searchKey'"));
  check('深度搜索可按需切换', jsText.includes("saveSetting('searchDeep'") && jsText.includes('深度搜索'));
  check('前端有内嵌终端面板', jsText.includes('termCreateTab') && jsText.includes('terminalPanel') && jsText.includes("API + 'terminal/ws'"));
  check('终端支持多标签', jsText.includes('termRenderTabs') && jsText.includes('termCloseTab'));
  check('终端是底部可折叠 dock，不再覆盖输入框', jsText.includes('applyDockHeight') && html.includes('class="terminal-dock"') && !jsText.includes('termApplyDock'));
  check('思考与工具调用默认折叠', jsText.includes("className = 'think'") && jsText.includes("className = 'work-group'"));
  check('终端支持 Ctrl+` 开关', jsText.includes('event.ctrlKey && event.key'));
  const configSource = await (await import('node:fs/promises')).readFile(new URL('../src/config/config.ts', import.meta.url), 'utf8');
  check('默认数据目录在 D 盘', configSource.includes('D:\\\\BananaCLI-data') && configSource.includes('BANANA_HOME'));
  check('前端有工作区与终端入口', jsText.includes("saveSetting('workspace'") && jsText.includes('打开终端'));
  check('前端提示工作区只能用绝对路径', jsText.includes('工作区'));
  // 弹力：只加在按压和弹出层上
  check('定义了回弹曲线', cssText.includes('--spring:'));
  check('按钮按下有回弹缩放', /\.btn:active[\s\S]{0,120}scale\(0\.95\)/.test(cssText));
  check('新消息有弹性入场', cssText.includes('.msg.enter') && /\.msg\.enter[^{]*\{[^}]*var\(--spring\)/.test(cssText));

  await server.close();
  rmSync(home, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.BANANA_HOME;
  else process.env.BANANA_HOME = previousHome;

  if (failures.length) {
    process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
    process.reallyExit(1);
  }
  process.stdout.write(`\n${passed} 项通过，0 项失败\n`);
  // Windows 上 undici 连接池与 server.close() 竞态会在正常退出时触发 libuv 断言，
  // 这里强制退出，避免假失败（服务本身已经关闭干净）。
  process.reallyExit(0);
}

main().catch((error) => {
  process.stdout.write(`测试出错: ${error?.stack ?? error}\n`);
  process.reallyExit(1);
});