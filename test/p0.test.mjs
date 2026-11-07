// P0 修复的回归测试：压缩配对、符号链接沙箱、失败退出码。
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { compactMessages } from '../src/agent/context.ts';
import { readFileTool } from '../src/tools/fs.ts';

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

function toolCall(id, name = 'read_file') {
  return { id, name, input: { path: 'x' } };
}

function toolResult(id) {
  return { role: 'tool', toolCallId: id, name: 'read_file', content: 'x'.repeat(1200) };
}

/** 校验每个 tool 结果前面都有发起它的 assistant tool_call。 */
function pairingOk(messages) {
  const open = new Set();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) open.add(call.id);
    } else if (message.role === 'tool') {
      if (!open.has(message.toolCallId)) return false;
      open.delete(message.toolCallId);
    }
  }
  return open.size === 0;
}

async function testCompactionBoundary() {
  const messages = [
    { role: 'user', content: '开始' },
    { role: 'assistant', content: '', toolCalls: [toolCall('t1')] },
    toolResult('t1'),
    { role: 'assistant', content: '第一步完成' },
    { role: 'user', content: '继续' },
    { role: 'assistant', content: '', toolCalls: [toolCall('t2')] },
    toolResult('t2'),
    { role: 'assistant', content: '第二步完成' },
    { role: 'user', content: '再继续' },
    { role: 'assistant', content: '', toolCalls: [toolCall('t3')] },
    toolResult('t3'),
    { role: 'assistant', content: '第三步完成' },
  ];

  const provider = {
    name: 'fake',
    model: 'fake',
    async generate() {
      return { message: { role: 'assistant', content: '摘要内容' }, usage: {} };
    },
  };

  // maxTailMessages = 2 时，原始切点会正好落在 tool 结果上
  const result = await compactMessages({
    provider,
    messages,
    keepRecentChars: 10_000,
    maxTailMessages: 2,
  });

  check('历史确实被压缩', Boolean(result) && result.removed > 0, String(result?.removed));
  if (result) {
    check('压缩后 tool_call/tool_result 仍然成对', pairingOk(result.messages));
    check(
      '压缩后的 tail 不以孤儿 tool 结果开头',
      result.messages.findIndex((message) => message.role === 'tool') !== -1
        ? result.messages.some((message, index) => message.role === 'tool' && result.messages[index - 1]?.role !== 'user')
        : true,
    );
    check(
      '最近一轮的工具调用被完整保留',
      JSON.stringify(result.messages).includes('t3'),
    );
  }
}

async function testSymlinkSandbox() {
  const base = mkdtempSync(join(tmpdir(), 'banana-p0-'));
  const workspace = join(base, 'ws');
  const outside = join(base, 'outside');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'TOP SECRET\n');
  writeFileSync(join(workspace, 'inside.txt'), 'ok\n');

  let linked = true;
  try {
    symlinkSync(outside, join(workspace, 'escape'), 'junction');
  } catch {
    linked = false;
  }

  const context = {
    workspace,
    signal: new AbortController().signal,
    approve: async () => true,
    log: () => {},
    allowOutsideWorkspace: false,
    permissions: {},
    todos: [],
  };

  if (!linked) {
    process.stdout.write('  skip 符号链接测试（当前环境无法创建 junction）\n');
  } else {
    const escaped = await readFileTool.run({ path: 'escape/secret.txt' }, context);
    check('通过 junction 访问外部文件被拒绝', escaped.ok === false, escaped.content.slice(0, 120));
    check('错误信息说明是越界', /在工作区|之外/.test(escaped.content), escaped.content.slice(0, 120));
  }

  const normal = await readFileTool.run({ path: 'inside.txt' }, context);
  check('工作区内正常文件仍可读', normal.ok === true, normal.content.slice(0, 80));

  const traversal = await readFileTool.run({ path: '../outside/secret.txt' }, context);
  check('../ 越界被拒绝', traversal.ok === false, traversal.content.slice(0, 120));

  rmSync(base, { recursive: true, force: true });
}

async function testExitCode() {
  const server = http.createServer((request, response) => {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'mock failure for exit code test' } }));
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  const home = mkdtempSync(join(tmpdir(), 'banana-exit-'));
  const workspace = mkdtempSync(join(tmpdir(), 'banana-exit-ws-'));

  const run = (args) =>
    new Promise((resolvePromise) => {
      const child = spawn(
        process.execPath,
        [
          'src/index.ts',
          ...args,
          '--provider', 'openai',
          '--base-url', `http://127.0.0.1:${port}/v1`,
          '--api-key', 'test-key',
          '--model', 'mock-model',
          '--cwd', workspace,
        ],
        { cwd: process.cwd(), env: { ...process.env, BANANA_HOME: home, NO_COLOR: '1' } },
      );
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.stdin.end();
      child.on('close', (code) => resolvePromise({ code, output }));
    });

  const oneShot = await run(['这个任务会失败']);
  check('单轮失败时退出码非零', oneShot.code === 1, String(oneShot.code));
  check('失败原因被打印出来', oneShot.output.includes('请求失败'), oneShot.output.slice(0, 200));

  server.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}

async function main() {
  process.stdout.write('P0 回归测试\n');
  await testCompactionBoundary();
  await testSymlinkSandbox();
  await testExitCode();

  if (failures.length) {
    process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`\n${passed} 项通过，0 项失败\n`);
  process.exit(0);
}

main().catch((error) => {
  process.stdout.write(`测试出错: ${error?.stack ?? error}\n`);
  process.exit(1);
});