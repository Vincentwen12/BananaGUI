// 契约 A/B：用两个提示词后缀各跑一遍契约评测，比较通过项。
// 真实模型 A/B 需要 API key，按 docs/ab-testing.md 在本地做。
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(suffix) {
  try {
    const output = execFileSync(process.execPath, ['test/eval.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, BANANA_PROMPT_SUFFIX: suffix },
    });
    const match = output.match(/(\d+) 项通过/);
    return { ok: true, passed: Number(match?.[1] ?? 0), output };
  } catch (error) {
    const output = String(error.stdout ?? error.message);
    const match = output.match(/(\d+) 项通过/);
    return { ok: false, passed: Number(match?.[1] ?? 0), output };
  }
}

const a = run(process.argv[2] ?? '');
const b = run(process.argv[3] ?? '');
process.stdout.write(`A: ${a.passed} 通过${a.ok ? '' : '（失败）'}\n`);
process.stdout.write(`B: ${b.passed} 通过${b.ok ? '' : '（失败）'}\n`);
process.stdout.write(
  a.passed === b.passed
    ? '结论：契约层面无差异；真实质量请按 docs/ab-testing.md 用模型评测。\n'
    : `结论：${b.passed > a.passed ? 'B' : 'A'} 更好。\n`,
);
