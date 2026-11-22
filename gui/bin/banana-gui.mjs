#!/usr/bin/env node
// BananaGUI 独立启动器：加载 BananaCLI 的 GUI server，使用本包 ui/ 资源。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guiRoot = join(here, '..');
const pkg = JSON.parse(readFileSync(join(guiRoot, 'package.json'), 'utf8'));

function parseArgs(argv) {
  const out = { port: undefined, open: true, help: false, version: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--version' || arg === '-v') out.version = true;
    else if (arg === '--no-open') out.open = false;
    else if (arg === '--port') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        console.error('--port 需要 0–65535 的整数。');
        process.exit(1);
      }
      out.port = value;
    } else if (arg.startsWith('--port=')) {
      const value = Number(arg.slice('--port='.length));
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        console.error('--port 需要 0–65535 的整数。');
        process.exit(1);
      }
      out.port = value;
    }
  }
  return out;
}

async function loadServer() {
  const candidates = [
    join(guiRoot, '..', 'dist', 'server', 'ui-server.js'),
    join(guiRoot, '..', 'src', 'server', 'ui-server.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }
  return import('@vincentbanana/bananacli/server');
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(`BananaGUI v${pkg.version}

用法:
  banana-gui [--port <端口>] [--no-open]
  banana-gui-desktop [--port <端口>]

说明:
  banana-gui          启动本地 GUI 并在浏览器打开
  banana-gui-desktop  使用 Electron 桌面壳（需要另装 electron）
  --port <端口>       指定端口，默认随机
  --no-open           不自动打开浏览器

界面默认深色，黄白黑配色，香蕉黄强调；浅色/跟随系统可在设置里切换。`);
  process.exit(0);
}
if (options.version) {
  console.log(pkg.version);
  process.exit(0);
}

const server = await loadServer();
const assetsDir = join(guiRoot, 'ui');
if (!existsSync(join(assetsDir, 'index.html'))) {
  console.error('找不到 gui/ui/index.html。请先在仓库根目录运行 npm run gui:sync。');
  process.exit(1);
}

const gui = await server.startUiServer({
  port: options.port,
  launchBrowser: options.open,
  assetsDir,
});
console.log(`BananaGUI 已启动：${gui.url}`);
console.log('按 Ctrl+C 停止服务。URL 里的 token 用于保护本地接口，请不要分享。');

const stop = async () => {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
  await gui.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
