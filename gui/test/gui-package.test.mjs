import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guiRoot = join(here, '..');
const root = join(guiRoot, '..');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const guiPkg = JSON.parse(readFileSync(join(guiRoot, 'package.json'), 'utf8'));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

check('GUI 包版本与 CLI 一致', guiPkg.version === rootPkg.version, `${guiPkg.version} / ${rootPkg.version}`);
check('bin 启动器存在', existsSync(join(guiRoot, 'bin', 'banana-gui.mjs')));
check('桌面启动器存在', existsSync(join(guiRoot, 'bin', 'banana-gui-desktop.mjs')));
check('Electron main 存在', existsSync(join(guiRoot, 'desktop', 'main.cjs')));
check('preload 存在', existsSync(join(guiRoot, 'desktop', 'preload.cjs')));
check('同步后的界面存在', existsSync(join(guiRoot, 'ui', 'index.html')));
check('界面包含黄白黑主题令牌', existsSync(join(guiRoot, 'ui', 'tokens.css')));
check('界面包含香蕉欢迎语', existsSync(join(guiRoot, 'ui', 'index.html')) && readFileSync(join(guiRoot, 'ui', 'index.html'), 'utf8').includes('探索香蕉之境'));

const guiLauncher = readFileSync(join(guiRoot, 'bin', 'banana-gui.mjs'), 'utf8');
const desktopLauncher = readFileSync(join(guiRoot, 'bin', 'banana-gui-desktop.mjs'), 'utf8');
check('启动器不硬编码 D 盘数据目录', !/BANANA_HOME\s*=\s*['"]D:/.test(guiLauncher) && !/BANANA_HOME\s*=\s*['"]D:/.test(desktopLauncher));

const help = spawnSync(process.execPath, [join(guiRoot, 'bin', 'banana-gui.mjs'), '--help'], {
  stdio: 'inherit',
  timeout: 20000,
});
check('--help 正常退出且不启动服务', help.status === 0, `status=${help.status ?? 'null'} ${help.error?.message ?? ''}`);

if (failures.length) {
  process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`\n${passed} 项通过，0 项失败\n`);
