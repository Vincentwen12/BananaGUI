// 把 src/ui 复制到 dist/ui，并带上 xterm / highlight.js 的本地静态资源。
// 不这么做的话，npm 装到的包里没有界面资源，打开就是 404
// （源码运行时能找到 src/ui，所以本地测试发现不了这个问题）。
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyVendor } from './copy-vendor.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'ui');
const target = join(root, 'dist', 'ui');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await copyVendor(target);
process.stdout.write('已复制界面资源 -> dist/ui\n');
