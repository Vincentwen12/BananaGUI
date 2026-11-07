// GUI 包自身的完整性检查：保证拆成独立仓库后，发布出去的东西不缺件。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const passed = [];
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed.push(name);
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

check('包名正确', pkg.name === '@vincentbanana/banana-gui', pkg.name);
// 回归：曾用 PowerShell 的 ConvertTo-Json 改写 package.json，把中文写成坏字节，
// 发布出去后 Node 读到 U+FFFD 就拒绝加载整个包（ERR_INVALID_PACKAGE_CONFIG）
check('package.json 是合法 UTF-8（无损坏字符）', !readFileSync(join(root, 'package.json'), 'utf8').includes('\uFFFD'));
for (const file of ['bin/banana-gui.mjs', 'bin/banana-gui-desktop.mjs', 'desktop/main.cjs', 'README.md']) {
  check(`${file} 是合法 UTF-8`, !readFileSync(join(root, file), 'utf8').includes('\uFFFD'));
}
check('声明了 banana-gui 命令', Boolean(pkg.bin?.['banana-gui']));
check('声明了桌面版命令', Boolean(pkg.bin?.['banana-gui-desktop']));
check('依赖 CLI 包', Boolean(pkg.dependencies?.['@vincentbanana/bananacli']));
// electron 必须是 optionalDependencies：这样 npm 安装能自动带上，
// 而装不上时也不影响浏览器版
check('electron 放在可选依赖里', Boolean(pkg.optionalDependencies?.electron));
check('electron 不在 devDependencies（否则装包时不会带上）', !pkg.devDependencies?.electron);
check('发布产物含桌面入口', (pkg.files ?? []).includes('desktop') && (pkg.files ?? []).includes('bin'));

for (const file of [
  'bin/banana-gui.mjs',
  'bin/banana-gui-desktop.mjs',
  'desktop/main.cjs',
  'ui/index.html',
  'ui/app.js',
  'ui/style.css',
  'ui/vendor/xterm.js',
  'ui/vendor/xterm.css',
  'ui/vendor/addon-fit.js',
  'ui/vendor/highlight.min.js',
]) {
  check(`包含 ${file}`, existsSync(join(root, file)));
}

// 回归：曾经因为编辑残留导致启动器里出现未定义变量，装上就崩。
// 用 node --check 把每个可执行文件过一遍语法。
for (const file of ['bin/banana-gui.mjs', 'bin/banana-gui-desktop.mjs', 'desktop/main.cjs']) {
  let ok = true;
  let detail = '';
  try {
    execFileSync('node', ['--check', join(root, file)], { stdio: 'pipe' });
  } catch (error) {
    ok = false;
    detail = String(error?.stderr ?? error?.message ?? '').split('\n').slice(0, 2).join(' ');
  }
  check(`${file} 语法正确`, ok, detail);
}

const launcherSource = readFileSync(join(root, 'bin/banana-gui.mjs'), 'utf8');
check('启动器会校验内核版本', launcherSource.includes('版本过旧') && launcherSource.includes('versionOf'));
check('启动器缺 electron 二进制时自动走镜像下载', launcherSource.includes('ELECTRON_MIRROR') && launcherSource.includes('install.js'));
check('桌面启动器同样会补下载', readFileSync(join(root, 'bin/banana-gui-desktop.mjs'), 'utf8').includes('ELECTRON_MIRROR'));

// 启动器必须真的能跑：--version 和 --help 都不该触发异常
try {
  const version = execFileSync('node', [join(root, 'bin/banana-gui.mjs'), '--version'], { encoding: 'utf8' }).trim();
  check('启动器 --version 可运行', version === pkg.version, version);
} catch (error) {
  check('启动器 --version 可运行', false, String(error?.stderr ?? error?.message ?? '').split('\n')[0]);
}
try {
  const help = execFileSync('node', [join(root, 'bin/banana-gui.mjs'), '--help'], { encoding: 'utf8' });
  check('启动器 --help 可运行', help.includes('--desktop') && help.includes('--no-open'));
} catch (error) {
  check('启动器 --help 可运行', false, String(error?.stderr ?? error?.message ?? '').split('\n')[0]);
}

const html = readFileSync(join(root, 'ui/index.html'), 'utf8');
const app = readFileSync(join(root, 'ui/app.js'), 'utf8');
check('界面无 emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html));
check('界面无外部 CDN', !/https?:\/\/(?!127\.0\.0\.1)[^"']+\.(js|css)/.test(html));
check('图标全部内联 SVG（图片预览除外）', app.includes('const ICONS') && !app.includes('<img src="http'));
check('API 前缀带结尾斜杠', /const API = [^;]+\+ '\/api\/'/.test(app));

const launcher = readFileSync(join(root, 'bin/banana-gui.mjs'), 'utf8');
check('启动器用 require 解析依赖', launcher.includes("require.resolve(specifier"));
check('启动器传递 --ui', launcher.includes("'--ui'"));
check('启动器支持 --desktop', launcher.includes("'--desktop'") && launcher.includes('resolveElectron'));
// 回归：以前 args.length === 0 被算进 help 判断，导致裸跑 banana-gui 直接打印帮助后退出
check('裸跑不会误判成 help', !/args\.some\([^)]*args\.length === 0/.test(launcher));
check('版本号读自 package.json', launcher.includes('pkg.version'));

const desktopBin = readFileSync(join(root, 'bin/banana-gui-desktop.mjs'), 'utf8');
check('桌面启动器会拉起 electron', desktopBin.includes('resolveElectron') && desktopBin.includes('main.cjs'));
check('桌面启动器缺 electron 时给替代方案', desktopBin.includes('banana-gui') && desktopBin.includes('npm install -g electron'));

const main = readFileSync(join(root, 'desktop/main.cjs'), 'utf8');
check('桌面主进程拉起本地服务', main.includes("'--ui'") && main.includes('loadURL'));
// 回归：windowsHide 会让 Electron 的窗口创建不出来（只剩终端、没有 Banana 窗口）
check('启动器不用 windowsHide', !launcher.includes('windowsHide:'));
check('桌面启动器不用 windowsHide', !readFileSync(join(root, 'bin/banana-gui-desktop.mjs'), 'utf8').includes('windowsHide:'));
check('桌面模式会立刻放走 electron', launcher.includes('detached: true') && launcher.includes('child.unref()'));
// 回归：曾经用了 join() 却忘了从 node:path 导入，桌面版一启动就崩
// （弹「Banana 启动失败」对话框）。这里静态核对用到的名字都导入了。
{
  // 先去掉 Promise 执行器里的 resolve，避免误判
  const scannable = main.replace(/\(\s*resolve\s*(,\s*reject\s*)?\)/g, '()');
  for (const name of ['join', 'dirname', 'basename', 'sep']) {
    const used = new RegExp(`\\b${name}\\s*\\(`).test(scannable);
    const imported = new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*require\\('node:path'\\)`).test(main);
    check(`main.cjs 用到的 ${name} 已导入`, !used || imported, used && !imported ? `${name} 用了但没导入` : '');
  }
}
check('桌面主进程退出时清理子进程', main.includes('before-quit') && main.includes('child?.kill()'));
// 回归：Electron 里 process.execPath 是 electron.exe，必须让 node 模式跑 CLI 内核，
// 否则会再开一个窗口而不是执行脚本
check('用 ELECTRON_RUN_AS_NODE 跑内核', main.includes('ELECTRON_RUN_AS_NODE'));
// 稳定优先：有系统 node 就用系统 node，PTY 原生模块不用碰 Electron 的 ABI
check('优先用系统 node 启动内核', main.includes('BANANA_NODE') && main.includes('spawnSync'));
check('透传常用参数', main.includes('PASSTHROUGH') && main.includes("'--cwd'"));

const files = pkg.files ?? [];
check('files 覆盖 bin/ui/desktop', ['bin', 'ui', 'desktop'].every((dir) => files.includes(dir)), JSON.stringify(files));

// node_modules 里不该出现任何密钥
if (existsSync(join(root, 'node_modules'))) {
  const suspicious = [];
  const scan = (dir, depth) => {
    if (depth > 3) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, item.name);
      if (item.isDirectory()) scan(full, depth + 1);
      else if (/\.(json|js|mjs|cjs|ts)$/.test(item.name)) {
        const text = readFileSync(full, 'utf8');
        if (/sk-[A-Za-z0-9]{20,}/.test(text)) suspicious.push(full);
      }
    }
  };
  scan(join(root, 'node_modules'), 0);
  check('未包含疑似 API key', suspicious.length === 0, suspicious.slice(0, 2).join(', '));
}

if (failures.length) {
  process.stdout.write(`\n${passed.length} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
  process.reallyExit(1);
}
process.stdout.write(`\n${passed.length} 项通过，0 项失败\n`);
process.reallyExit(0);