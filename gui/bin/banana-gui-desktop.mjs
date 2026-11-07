#!/usr/bin/env node
// 桌面版启动器：等价于 `banana-gui --desktop`，保留独立命令方便记忆。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const args = process.argv.slice(2);

// Electron 缓存优先放 D 盘；没有 D 盘或不可写就交给系统默认位置。
// BANANA_HOME 只在用户显式设置时生效，不在这里强制覆盖。
if (process.platform === 'win32') {
  try {
    if (existsSync('D:\\')) {
      const cache = join('D:\\BananaCLI-data', 'electron-cache');
      mkdirSync(cache, { recursive: true });
      process.env.ELECTRON_CACHE ??= cache;
    }
  } catch {
    // 忽略，继续用默认缓存目录
  }
}
if (args.includes('--help') || args.includes('-h')) {
  console.log('banana-gui-desktop — Banana 的桌面版（独立窗口）');
  console.log('');
  console.log('用法: banana-gui-desktop [选项]');
  console.log('  --port <端口>    指定端口（默认随机）');
  console.log('  --cwd <目录>     指定工作区');
  console.log('  --provider <名>  指定 provider');
  console.log('  --model <名>     指定模型');
  console.log('  --help           显示帮助');
  console.log('');
  console.log('提示：日常使用建议用 banana-gui（浏览器版，更轻）。');
  process.exit(0);
}

const binary = resolveElectron();
if (!binary) {
  console.error('没找到 electron，桌面版用不了。装一次即可：npm install -g electron');
  console.error('不装也没关系：banana-gui 用浏览器版，功能完全一样。');
  process.exit(1);
}

const main = join(here, '..', 'desktop', 'main.cjs');
// 独立窗口模式：把 electron 放出去，命令行立刻返回，不留黑终端窗口。
// 不能用 windowsHide：实测那会让 Electron 的窗口创建不出来（只有终端、没有窗口）。
const child = spawn(binary, [main, ...args], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, BANANA_UI_DIR: join(here, '..', 'ui') },
});
child.unref();
console.log('Banana 桌面版已启动，关闭窗口即退出。');

/**
 * 找 electron 可执行文件；二进制缺失时用镜像补下载一次。
 * 新版 electron 只在首次运行时下载一百多 MB 的二进制，默认源是 GitHub。
 */
function resolveElectron() {
  let dir;
  try {
    dir = dirname(require_.resolve('electron'));
  } catch {
    return null;
  }
  const pathTxt = join(dir, 'path.txt');
  const distDir = join(dir, 'dist');
  const current = () => {
    try {
      const name = readFileSync(pathTxt, 'utf8').trim();
      const full = join(distDir, name || (process.platform === 'win32' ? 'electron.exe' : 'electron'));
      return existsSync(full) ? full : null;
    } catch {
      return null;
    }
  };
  const ready = current();
  if (ready) return ready;

  const installScript = join(dir, 'install.js');
  if (!existsSync(installScript)) return null;
  const mirror = process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/';
  console.log('electron 的二进制还没下载，正在获取（一百多 MB，只需一次）...');
  console.log(`下载源：${mirror}`);
  const result = spawnSync(process.execPath, [installScript], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_MIRROR: mirror },
  });
  return result.status === 0 ? current() : null;
}
