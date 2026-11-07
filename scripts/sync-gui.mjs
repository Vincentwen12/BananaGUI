// 把 src/ui 同步到 gui/ui（GUI 包自带界面资源），并带上本地 vendor 资源。
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVendor } from './copy-vendor.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const from = join(root, 'src', 'ui');
const to = join(root, 'gui', 'ui');

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
await copyVendor(to);
process.stdout.write('已同步 src/ui -> gui/ui\n');
