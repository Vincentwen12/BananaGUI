// 把构建产物 dist/ui 同步到独立 GUI 包（Electron 直接加载 gui/ui）。
import { cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'dist', 'ui');
const target = join(root, 'gui', 'ui');

if (!existsSync(join(source, 'index.html'))) {
  process.stderr.write('dist/ui 不存在，先运行 npm run build:ui。\n');
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
process.stdout.write(`synced ${source} -> ${target}\n`);
