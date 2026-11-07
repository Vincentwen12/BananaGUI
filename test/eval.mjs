// 轻量契约评测：不调用真实模型，检查提示词、知识包、UI 扫描和关键行为是否退化。
// 真实模型的质量评测需要 API key，放在本地手动跑，不阻塞 CI。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSystemPrompt } from '../src/config/config.ts';
import { collectContinuation } from '../src/cli/continuation.ts';
import { grepTool } from '../src/tools/fs.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const passed = [];
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed.push(name);
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

function makeContext(workspace) {
  return {
    workspace,
    signal: new AbortController().signal,
    approve: async () => true,
    log: () => {},
    allowOutsideWorkspace: false,
    permissions: { write: 'allow', shell: 'allow', network: 'allow' },
    todos: [],
  };
}

async function main() {
  process.stdout.write('契约评测\n');

  const prompt = defaultSystemPrompt('/tmp/banana-eval');
  for (const section of [
    '冲突优先级',
    '环境信息',
    '事实与不确定性',
    '能力边界',
    '复杂度预算',
    '执行与安全',
    '验收',
    'AGENT.md',
  ]) {
    check(`提示词包含「${section}」`, prompt.includes(section));
  }

  for (const file of [
    'docs/design/principles.md',
    'docs/design/tokens.md',
    'docs/design/components.md',
    'docs/design/checklist.md',
    'docs/failures.md',
  ]) {
    check(`知识包存在 ${file}`, existsSync(join(root, file)));
  }

  try {
    execFileSync(process.execPath, ['scripts/check-ui.mjs'], { cwd: root, stdio: 'pipe' });
    check('UI 扫描 0 失败', true);
  } catch (error) {
    check('UI 扫描 0 失败', false, String(error.stdout ?? error.message).slice(-400));
  }

  const joined = await collectContinuation('a\\', async () => 'b');
  check('多行续行不重复', joined === 'a\nb', JSON.stringify(joined));

  const workspace = mkdtempSync(join(tmpdir(), 'banana-eval-'));
  writeFileSync(join(workspace, 'a.txt'), 'match 1\nmatch 2\nmatch 3\n');
  const grep = await grepTool.run({ pattern: 'match', limit: 1 }, makeContext(workspace));
  check('grep 截断后总数正确', grep.content.includes('找到 3 处匹配'), grep.content);
  rmSync(workspace, { recursive: true, force: true });

  const source = readFileSync(join(root, 'src/tools/types.ts'), 'utf8');
  check('计划项支持置信度/验证字段', source.includes('confidence') && source.includes('verify'));

  process.stdout.write(`\n${passed.length} 项通过，${failures.length} 项失败\n`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  process.stdout.write(`评测出错: ${error?.stack ?? error}\n`);
  process.exit(1);
});
