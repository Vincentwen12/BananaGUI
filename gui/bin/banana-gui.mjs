#!/usr/bin/env node
// Banana GUI 启动器：复用 CLI 包的 agent 内核，用本包自带的界面资源。
// 安装：npm install -g @vincentbanana/banana-gui
// 启动：banana-gui（首次会进配置向导）
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const here = dirname(fileURLToPath(import.meta.url));

// Electron 缓存优先放 D 盘；没有 D 盘或不可写就交给系统默认位置。
// 不再强制 BANANA_HOME，避免没有 D 盘的机器保存不了配置和会话。
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

/** CLI 内核入口。依赖可能被 npm 提升到上层 node_modules，用 require 解析更稳。 */
function resolveCli() {
  const candidates = [];
  for (const specifier of ['@vincentbanana/bananacli']) {
    // 先在本包的依赖树里找（版本对得上），再退回到被提升到上层的副本
    for (const paths of [[join(here, '..')], undefined]) {
      try {
        const entry = paths ? require.resolve(specifier, { paths }) : require.resolve(specifier);
        candidates.push(entry);
      } catch {
        /* 换下一个候选 */
      }
    }
  }
  if (!candidates.length) return null;

  /** 读内核版本：entry 是 dist/index.js，同目录上一级就是包根 */
  const versionOf = (entry) => {
    try {
      return JSON.parse(readFileSync(join(dirname(entry), '..', 'package.json'), 'utf8')).version;
    } catch {
      return '0.0.0';
    }
  };
  const required = String(pkg.dependencies?.['@vincentbanana/bananacli'] ?? '').replace(/^[^\d]*/, '') || '0.0.0';
  const newer = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
    }
    return false;
  };
  const best = candidates.sort((a, b) => (newer(versionOf(a), versionOf(b)) ? -1 : 1))[0];
  const found = versionOf(best);
  if (newer(required, found)) {
    // 旧内核没有内置界面资源，界面会 404。与其让用户看白屏，不如直接说清。
    console.error(`内核 @vincentbanana/bananacli 版本过旧（当前 ${found}，需要 ${required} 以上）。`);
    console.error('旧版本不含界面资源，打开会是空白页。先更新内核：');
    console.error('  npm install -g @vincentbanana/bananacli');
    console.error('然后再运行 banana-gui。');
    process.exit(1);
  }
  return best;
}

/**
 * 找到 electron 可执行文件。electron 是个可选依赖，而且新版只在**首次运行**才下载
 * 一百多 MB 的二进制（npm install 时只装壳）。默认从 GitHub 下，国内基本连不上，
 * 所以这里主动用镜像补下载一次，用户不用记任何参数。
 * 想换源：设 ELECTRON_MIRROR 环境变量即可。
 */
function resolveElectron() {
  let dir;
  try {
    dir = dirname(require.resolve('electron'));
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
  if (result.status === 0) return current();
  console.error('');
  console.error('下载失败。可以换个网络或换个源再试，比如：');
  console.error('  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
  console.error('  banana-gui --desktop');
  return null;
}

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log('banana-gui — Banana 的图形界面');
  console.log('');
  console.log('用法: banana-gui [选项]');
  console.log('  --desktop        用独立窗口打开（首次会下载 electron 运行时）');
  console.log('  --port <端口>    指定端口（默认随机）');
  console.log('  --cwd <目录>     指定工作区');
  console.log('  --provider <名>  指定 provider');
  console.log('  --model <名>     指定模型');
  console.log('  --no-open        不自动打开浏览器');
  console.log('  --version        显示版本');
  console.log('  --help           显示帮助');
  console.log('');
  console.log('提示：默认用浏览器打开。想要独立窗口就加 --desktop，');
  console.log('      或直接运行 banana-gui-desktop。');
  process.exit(0);
}

const entry = resolveCli();
if (!entry) {
  console.error('找不到依赖 @vincentbanana/bananacli，请重新安装：npm install -g @vincentbanana/banana-gui');
  process.exit(1);
}

// 界面资源用本包自带的那份，保证 GUI 包和它的 ui/ 版本一致
const uiDir = join(here, '..', 'ui');

/** 用户参数原样转给内核；只摘掉本启动器自己的开关。 */
function kernelArgs() {
  const rest = [];
  for (const arg of args) {
    if (arg === '--desktop' || arg === '--open') continue;
    rest.push(arg);
  }
  return rest;
}

if (args.includes('--desktop')) {
  const binary = resolveElectron();
  if (!binary) {
    console.error('没找到 electron，用不了独立窗口。装一次即可：');
    console.error('  npm install -g electron');
    console.error('不装也没关系：直接运行 banana-gui 用浏览器版，功能完全一样。');
    process.exit(1);
  }
  // 独立窗口模式：把 electron 放出去，命令行立刻返回，
  // 不留一个黑终端窗口挡着（关掉 Banana 窗口即退出，里面的服务会一起收掉）。
  // 注意：不能用 windowsHide，实测那会让 Electron 的窗口创建不出来（只有终端、没有窗口）。
  const child = spawn(binary, [join(here, '..', 'desktop', 'main.cjs'), ...kernelArgs()], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log('Banana 桌面版已启动，关闭窗口即退出。');
} else {
  launch(process.execPath, [entry, '--ui', ...kernelArgs()], { BANANA_UI_DIR: uiDir });
}

function launch(command, commandArgs, extraEnv) {
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('error', (error) => {
    console.error('启动失败：' + error.message);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
}
