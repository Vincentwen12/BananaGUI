// 发布前校验：src/ui 与 gui/ui 必须逐文件一致，GUI 包的 CLI 依赖必须跟根包版本一致。
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'ui');
const target = join(root, 'gui', 'ui');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile()) out.push(relative(base, full).replaceAll('\\', '/'));
  }
  return out.sort();
}

const hash = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const problems = [];
let left = [];
let right = [];
try {
  left = await walk(source);
} catch {
  problems.push('找不到 src/ui');
}
try {
  right = await walk(target);
} catch {
  problems.push('找不到 gui/ui，先运行 npm run gui:sync');
}

const all = new Set([...left, ...right]);
for (const file of [...all].sort()) {
  if (!left.includes(file)) {
    problems.push(`gui/ui 多出文件：${file}`);
    continue;
  }
  if (!right.includes(file)) {
    problems.push(`gui/ui 缺少文件：${file}`);
    continue;
  }
  if ((await hash(join(source, file))) !== (await hash(join(target, file)))) {
    problems.push(`内容不一致：${file}`);
  }
}

const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const guiPkg = JSON.parse(await readFile(join(root, 'gui', 'package.json'), 'utf8'));
const required = guiPkg.dependencies?.['@vincentbanana/bananacli'];
if (required !== `^${rootPkg.version}`) {
  problems.push(
    `gui/package.json 的 CLI 依赖是 ${required ?? '(缺失)'}，应跟随根包写成 ^${rootPkg.version}`,
  );
}

if (problems.length) {
  process.stderr.write(`CLI / GUI 同步检查失败（${problems.length} 项）：\n`);
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `同步检查通过：${left.length} 个界面文件一致，GUI 依赖 ^${rootPkg.version}\n`,
  );
}
