// 校验 dist/ui 与 gui/ui 是否一致（Electron 包用的是 gui/ui 的副本）。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'dist', 'ui');
const target = join(root, 'gui', 'ui');

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!existsSync(join(source, 'index.html'))) {
  process.stderr.write('dist/ui 不存在，先运行 npm run build:ui。\n');
  process.exit(1);
}
if (!existsSync(join(target, 'index.html'))) {
  process.stderr.write('gui/ui 不存在，先运行 npm run gui:sync。\n');
  process.exit(1);
}

const sourceFiles = walk(source);
const targetFiles = walk(target);
const missing = sourceFiles.filter((file) => !targetFiles.includes(file));
const extra = targetFiles.filter((file) => !sourceFiles.includes(file));
const changed = sourceFiles.filter(
  (file) => targetFiles.includes(file) && statSync(join(source, file)).isFile() && hash(join(source, file)) !== hash(join(target, file)),
);

if (missing.length || extra.length || changed.length) {
  process.stderr.write('gui/ui 与 dist/ui 不一致：\n');
  if (missing.length) process.stderr.write(`  缺少: ${missing.join(', ')}\n`);
  if (extra.length) process.stderr.write(`  多出: ${extra.join(', ')}\n`);
  if (changed.length) process.stderr.write(`  不同: ${changed.join(', ')}\n`);
  process.stderr.write('运行 npm run gui:sync 后重试。\n');
  process.exit(1);
}
process.stdout.write(`gui/ui 与 dist/ui 一致（${sourceFiles.length} 个文件）。\n`);
