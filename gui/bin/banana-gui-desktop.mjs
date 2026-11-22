#!/usr/bin/env node
// Electron 桌面壳启动器；没有安装 electron 时回退到浏览器启动器，不报未捕获异常。
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guiRoot = join(here, '..');
const require = createRequire(join(guiRoot, 'package.json'));

let electron = null;
try {
  electron = require('electron');
} catch {
  electron = null;
}

if (!electron || typeof electron !== 'string') {
  console.error('没有找到 Electron。先安装 electron（例如 npm i -D electron），再运行 banana-gui-desktop。');
  console.error('现在改用浏览器模式启动 BananaGUI。');
  const child = spawn(process.execPath, [join(here, 'banana-gui.mjs'), ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const main = join(guiRoot, 'desktop', 'main.cjs');
  if (!existsSync(main)) {
    console.error('缺少 desktop/main.cjs。');
    process.exit(1);
  }
  const child = spawn(electron, [main, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, BANANA_GUI_ROOT: guiRoot },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
