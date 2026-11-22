// 把 src/ui 同步到独立 GUI 包，并带上本地 vendor 资源。
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVendor } from './copy-vendor.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'ui');
const target = join(root, 'gui', 'ui');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await copyVendor(target);
process.stdout.write(`synced ${source} -> ${target}\n`);
