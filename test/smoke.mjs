// 冒烟测试：用内置 mock provider 跑通 BananaCLI 的关键路径，不需要任何真实 API key。
// 运行：npm test
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockProvider, listenOnRandomPort } from './mock-provider.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'index.ts');
const home = mkdtempSync(join(tmpdir(), 'banana-smoke-'));
const workspace = join(home, 'workspace');
mkdirSync(workspace, { recursive: true });
writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'smoke-fixture', version: '1.0.0' }, null, 2));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

async function runBanana(args, options = {}) {
  const { provider = 'openai', baseUrl, stdin, extraEnv = {} } = options;
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [
        entry,
        ...args,
        '--base-url', baseUrl,
        '--api-key', 'test-key',
        '--model', 'mock-model',
        '--provider', provider,
        '--cwd', workspace,
      ],
      {
        cwd: workspace,
        env: { ...process.env, BANANA_HOME: home, NO_COLOR: '1', ...extraEnv },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, code: code ?? 0 });
    });
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

/** 最近更新的那个会话文件 */
function newestSession() {
  const dir = join(home, 'sessions');
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  const sessions = files.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
  sessions.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
  return sessions[sessions.length - 1];
}

async function main() {
  const server = createMockProvider();
  const port = await listenOnRandomPort(server);
  const openaiUrl = `http://127.0.0.1:${port}/v1`;
  const anthropicUrl = `http://127.0.0.1:${port}`;
  process.stdout.write(`mock provider: http://127.0.0.1:${port}\n\n`);

  process.stdout.write('OpenAI 兼容协议\n');
  {
    const { stdout } = await runBanana(['--yolo', '读一下配置 #read'], { baseUrl: openaiUrl });
    check('调用 read_file 工具', stdout.includes('read_file'));
    check('模型拿到文件内容后回答', stdout.includes('工具已执行完毕'));
    check('打印步数与 token 统计', /\d+ 步 · .*上下文/.test(stdout));
    check('流式响应的 usage 被正确解析', stdout.includes('↑100 ↓20'));
  }

  {
    const { stdout } = await runBanana(['--yolo', '跑个命令 #shell:echo hello-from-shell'], { baseUrl: openaiUrl });
    check('shell 工具执行命令', stdout.includes('hello-from-shell'));
  }

  {
    const { stdout } = await runBanana(['--yolo', '并行做两件事 #multi'], { baseUrl: openaiUrl });
    check('一轮内处理多个工具调用', stdout.includes('write_file') && stdout.includes('shell'));
    check('写文件确实落盘', readFileSync(join(workspace, 'tmp', 'smoke-multi.txt'), 'utf8') === 'a\n');
  }

  {
    const { stdout } = await runBanana(['--yolo', '用不存在的工具 #unknown'], { baseUrl: openaiUrl });
    check('未知工具回灌可读错误', stdout.includes('未知工具'));
  }

  {
    const { stdout } = await runBanana(['--yolo', '读工作区外的文件 #outside'], { baseUrl: openaiUrl });
    check('阻止访问工作区外的路径', stdout.includes('在工作区') && stdout.includes('之外'));
  }

  process.stdout.write('\nAnthropic 原生协议\n');
  {
    const { stdout } = await runBanana(['--yolo', '读一下配置 #read'], {
      baseUrl: anthropicUrl,
      provider: 'anthropic',
    });
    check('tool_use 往返正常', stdout.includes('read_file'));
    check('最终回答正常输出', stdout.includes('工具已执行完毕'));
  }
  {
    const { stdout } = await runBanana(['--yolo', '检查缓存 #cache'], {
      baseUrl: anthropicUrl,
      provider: 'anthropic',
    });
    check('system 与 tools 带 prompt caching 标记', stdout.includes('缓存标记正确'));
  }

  process.stdout.write('\n会话持久化\n');
  {
    await runBanana(['--yolo', '第一个问题 #read'], { baseUrl: openaiUrl });
    const files = readdirSync(join(home, 'sessions'));
    check('会话文件已写入', files.length > 0 && files.every((name) => name.endsWith('.json')));
    const saved = newestSession();
    check('会话包含完整的四段消息', ['user', 'assistant', 'tool', 'assistant'].every((role) =>
      saved.messages.some((message) => message.role === role),
    ));

    const list = await runBanana(['--list'], { baseUrl: openaiUrl });
    check('--list 能列出历史对话', list.stdout.includes(saved.id));

    const resumed = await runBanana(['--yolo', '--continue', '继续 #read'], { baseUrl: openaiUrl });
    check('-c 继续上一次对话', resumed.stdout.includes(saved.id));
    const afterResume = newestSession();
    check('继续时不新建会话', afterResume.id === saved.id && afterResume.messages.length > saved.messages.length);

    const switched = await runBanana(['-s', saved.id.slice(0, 12), '--session', saved.id, '/session'], {
      baseUrl: openaiUrl,
      stdin: '/session\n',
    });
    check('按 id 前缀切换会话', switched.stdout.includes(saved.id));
  }

  process.stdout.write('\n健壮性\n');
  {
    const { stdout } = await runBanana(['--yolo', '先计划一下 #todo'], { baseUrl: openaiUrl });
    check('todo_write 建立任务清单', stdout.includes('任务清单') && stdout.includes('读一下 package.json'));
    const saved = newestSession();
    check('任务清单写进会话文件', (saved.todos ?? []).length === 2);
    check('任务状态被正确保存', (saved.todos ?? []).some((todo) => todo.status === 'in_progress'));

    const flaky = await runBanana(['--yolo', '限流一下 #flaky'], { baseUrl: openaiUrl });
    check('429 自动重试后成功', flaky.stdout.includes('工具已执行完毕') || flaky.stdout.includes('网络重试'));

    const overflow = await runBanana([], {
      baseUrl: openaiUrl,
      stdin: '先读个文件 #read\n上下文超限 #overflow\n',
    });
    check('上下文超限自动压缩重试', overflow.stdout.includes('压缩历史对话') && !overflow.stdout.includes('请求失败'));

    const reasoning = await runBanana(['--yolo', '推理一下 #reasoning'], { baseUrl: openaiUrl });
    check('显示推理过程', reasoning.stdout.includes('思考中') && reasoning.stdout.includes('工具已执行完毕') === false);
  }

  process.stdout.write('\n配置向导\n');
  {
    const setupHome = mkdtempSync(join(tmpdir(), 'banana-setup-'));
    const answers = [
      '9', // 自定义服务（默认 8 个 provider 之后）
      'mock', // 名字
      '1', // OpenAI 兼容协议
      `${openaiUrl}`, // base URL
      'mock-model', // 模型名
      'n', // 不改 base URL / 模型
      'y', // 本地服务也要设置 key（模拟自建网关）
      'sk-test-key-123456', // API key
      'n', // shell 不每次确认
      'n', // 写文件不每次确认
      '',
    ].join('\n');

    const child = spawn(process.execPath, [entry, '--setup'], {
      cwd: workspace,
      env: { ...process.env, BANANA_HOME: setupHome, NO_COLOR: '1' },
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stdout += chunk));
    const code = await new Promise((resolvePromise) => {
      child.on('close', (value) => resolvePromise(value ?? 0));
      child.stdin.end(answers);
    });

    const saved = JSON.parse(readFileSync(join(setupHome, 'config.json'), 'utf8'));
    check('向导写出配置文件', existsSync(join(setupHome, 'config.json')));
    check('向导保存自定义 provider', saved.current === 'mock' && saved.providers.mock?.model === 'mock-model');
    check('向导保存 API key', saved.providers.mock?.apiKey === 'sk-test-key-123456');
    check('向导保存权限选择', saved.permissions.shell === 'allow' && saved.permissions.write === 'allow');
    check('向导执行连接测试', stdout.includes('连接成功'));
    check('向导正常结束并进入对话', code === 0 && stdout.includes('配置完成'));
    rmSync(setupHome, { recursive: true, force: true });
  }

  process.stdout.write('\n能力扩展\n');
  {
    // 1x1 透明 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(workspace, 'shot.png'), png);

    const image = await runBanana([], {
      baseUrl: openaiUrl,
      stdin: '/image shot.png\n看看这张图\n',
      extraEnv: { BANANA_HOME: join(home, 'image-home') },
    });
    check('附加图片后模型收到图片', image.stdout.includes('收到图片'));
    check('图片会进入会话记录', image.stdout.includes('已附加 shot.png'));

    const bad = await runBanana([], {
      baseUrl: openaiUrl,
      stdin: '/image package.json\n',
      extraEnv: { BANANA_HOME: join(home, 'image-home') },
    });
    check('拒绝非图片文件', bad.stdout.includes('不支持'));

    const pluginHome = join(home, 'plugin-home');
    mkdirSync(join(pluginHome, 'tools'), { recursive: true });
    writeFileSync(
      join(pluginHome, 'tools', 'echo_plugin.mjs'),
      `export default {
        name: 'echo_plugin',
        description: '回显输入',
        parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        approval: 'never',
        async run(input) { return { ok: true, content: 'plugin says: ' + input.text }; },
      };\n`,
    );
    const plugin = await runBanana(['--yolo', '调用插件 #plugin'], {
      baseUrl: openaiUrl,
      extraEnv: { BANANA_HOME: pluginHome },
    });
    check('插件工具被自动加载', plugin.stdout.includes('已加载 1 个插件工具'));
    check('插件工具能被模型调用', plugin.stdout.includes('plugin says: hello'));
  }

  process.stdout.write('\n脚本化多行输入\n');
  {
    const { stdout } = await runBanana([], {
      baseUrl: openaiUrl,
      stdin: '/help\n/list\n/exit\n',
    });
    check('stdin 多行逐条执行命令', stdout.includes('显示可用命令') && stdout.includes('/list'));
    check('/exit 正常收尾', stdout.includes('对话已保存到'));
  }

  process.stdout.write('\n权限控制\n');
  {
    const { stdout } = await runBanana(['这个任务需要跑命令 #shell:echo blocked'], { baseUrl: openaiUrl });
    check(
      '非交互模式默认拒绝 shell',
      /拒绝|非交互/.test(stdout) && !stdout.includes('blocked-ran'),
      stdout.slice(-1200),
    );
  }
  {
    const { stdout } = await runBanana(['--yolo', '这个任务需要跑命令 #shell:echo yolo-ok'], {
      baseUrl: openaiUrl,
    });
    check('--yolo 在非交互模式放行 shell', stdout.includes('yolo-ok'));
  }
  {
    const denyHome = mkdtempSync(join(tmpdir(), 'banana-deny-'));
    writeFileSync(
      join(denyHome, 'config.json'),
      JSON.stringify({ permissions: { shell: 'deny', write: 'ask', network: 'allow' } }, null, 2),
    );
    const { stdout } = await runBanana(['这个任务需要跑命令 #shell:echo blocked'], {
      baseUrl: openaiUrl,
      extraEnv: { BANANA_HOME: denyHome },
    });
    check('deny 权限阻断工具执行', stdout.includes('权限被拒绝'));
    rmSync(denyHome, { recursive: true, force: true });
  }

  server.close();
  rmSync(home, { recursive: true, force: true });

  process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败\n`);
  if (failures.length) {
    process.stdout.write(`失败项: ${failures.join(', ')}\n`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  process.stdout.write(`测试本身出错: ${error?.stack ?? error}\n`);
  process.exit(1);
});