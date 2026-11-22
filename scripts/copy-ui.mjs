// 把源码界面复制到 dist/ui，并带上 xterm / highlight.js 本地资源。
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVendor } from './copy-vendor.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'ui');
const target = join(root, 'dist', 'ui');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await copyVendor(target);
process.stdout.write(`copied ${source} -> ${target}\n`);
