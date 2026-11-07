// UI 反 AI 味扫描：默认扫 src/ui；也可以传任意目录/文件。
// 规则与 src/util/ui-audit.ts 共用，文档见 docs/design/。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPaths, formatViolations } from '../src/util/ui-audit.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const strictTokens = args.includes('--strict-tokens');
const paths = args.filter((arg) => !arg.startsWith('--'));
const targets = paths.length ? paths : [join(root, 'src', 'ui')];

for (const target of targets) {
  if (!existsSync(target)) {
    process.stderr.write(`目标不存在：${target}\n`);
    process.exit(1);
  }
}

const { files, violations } = auditPaths(targets, {
  strictTokens,
  ignoreFiles: [join(root, 'src', 'util', 'ui-audit.ts')],
});
const failures = violations.filter((item) => item.severity === 'fail');
const warnings = violations.filter((item) => item.severity === 'warn');

if (json) {
  process.stdout.write(`${JSON.stringify({ files, violations, failures: failures.length, warnings: warnings.length }, null, 2)}\n`);
} else {
  if (violations.length) process.stdout.write(`${formatViolations(violations)}\n\n`);
  process.stdout.write(`扫描 ${files.length} 个文件：${failures.length} 个失败，${warnings.length} 个警告\n`);
}

if (failures.length) process.exit(1);
