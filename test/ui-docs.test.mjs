// UI 知识包与扫描器测试：文档完整、good 通过、bad 每个都命中预期规则。
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPaths } from '../src/util/ui-audit.ts';
import { writeFileTool } from '../src/tools/fs.ts';
import { uiAuditTool } from '../src/tools/ui.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
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

const docs = [
  'README.md',
  'principles.md',
  'tokens.md',
  'components.md',
  'states.md',
  'accessibility.md',
  'typography-spacing.md',
  'layout.md',
  'forms.md',
  'data-display.md',
  'motion.md',
  'content.md',
  'checklist.md',
  'refs/linear.md',
  'refs/notion.md',
  'refs/stripe.md',
  'refs/github-primer.md',
  'refs/govuk.md',
];

for (const doc of docs) {
  check(`文档存在 ${doc}`, existsSync(join(root, 'docs/design', doc)));
}

const good = auditPaths([join(root, 'docs/design/examples/good')]);
check('good 示例 0 失败', good.violations.filter((item) => item.severity === 'fail').length === 0);

const expectations = [
  ['neon.css', 'no-neon-glow'],
  ['glass.css', 'no-glass'],
  ['big-radius.css', 'no-big-radius'],
  ['heavy-shadow.css', 'no-heavy-shadow'],
  ['emoji.tsx', 'no-emoji'],
  ['gradient-hero.css', 'no-gradient-hero'],
];
for (const [file, rule] of expectations) {
  const result = auditPaths([join(root, 'docs/design/examples/bad', file)]);
  check(`${file} 命中 ${rule}`, result.violations.some((item) => item.rule === rule));
}

const workspace = mkdtempSync(join(tmpdir(), 'banana-ui-audit-'));
const target = join(workspace, 'bad.css');
writeFileSync(target, '.x { border-radius: 20px; }\n');
const written = await writeFileTool.run(
  { path: 'bad.css', content: '.x { border-radius: 20px; }\n' },
  makeContext(workspace),
);
check('写 UI 文件后自动审计', written.content.includes('UI 审计') && written.content.includes('no-big-radius'));
check('UI 审计结果带 meta', Boolean(written.meta?.uiViolations?.length));
const audited = await uiAuditTool.run({ path: '.' }, makeContext(workspace));
check('ui_audit 工具能扫描工作区', audited.content.includes('no-big-radius'));
rmSync(workspace, { recursive: true, force: true });

process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败\n`);
if (failures.length) process.exit(1);
