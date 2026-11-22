// 校验 src/ui 与 gui/ui 是否一致（忽略 vendor 生成资源）。
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'ui');
const target = join(root, 'gui', 'ui');

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

let sourceFiles;
let targetFiles;
try {
  sourceFiles = walk(source);
  targetFiles = walk(target);
} catch (error) {
  process.stderr.write(`gui/ui 不存在或读不到：${error.message}\n先运行 npm run gui:sync。\n`);
  process.exit(1);
}

const missing = sourceFiles.filter((file) => !targetFiles.includes(file));
const extra = targetFiles.filter((file) => !sourceFiles.includes(file));
const changed = sourceFiles.filter(
  (file) =>
    targetFiles.includes(file) &&
    statSync(join(source, file)).isFile() &&
    hash(join(source, file)) !== hash(join(target, file)),
);

if (missing.length || extra.length || changed.length) {
  process.stderr.write('gui/ui 与 src/ui 不一致：\n');
  if (missing.length) process.stderr.write(`  缺少: ${missing.join(', ')}\n`);
  if (extra.length) process.stderr.write(`  多出: ${extra.join(', ')}\n`);
  if (changed.length) process.stderr.write(`  不同: ${changed.join(', ')}\n`);
  process.stderr.write('运行 npm run gui:sync 后重试。\n');
  process.exit(1);
}
process.stdout.write(`gui/ui 与 src/ui 一致（${sourceFiles.length} 个文件）。\n`);
