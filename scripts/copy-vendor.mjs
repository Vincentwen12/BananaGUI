// 把前端用到的第三方静态资源复制到界面目录：终端（xterm）和语法高亮（highlight.js）。
// 不引 CDN：断网、内网都能用，也避免第三方脚本在本地服务里执行。
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const FILES = [
  ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['@highlightjs/cdn-assets/highlight.min.js', 'highlight.min.js'],
];

export async function copyVendor(target) {
  const vendor = join(target, 'vendor');
  await mkdir(vendor, { recursive: true });
  for (const [source, name] of FILES) {
    await cp(join(root, 'node_modules', source), join(vendor, name));
  }
}
