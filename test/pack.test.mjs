// 发布包完整性测试：打完包后确认 tarball 里真的有界面资源。
//
// 之前踩过的坑：源码运行时能找到 src/ui，一切正常；但 npm publish 只带 dist/，
// 装到用户机器上就没有 ui/，打开页面直接 404。所以必须在"发布形态"下测。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
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

// 临时目录放在项目盘（D:），不污染系统盘
const temp = mkdtempSync(join(root, '.tmp-pack-'));

try {
  execFileSync('node', ['scripts/copy-ui.mjs'], { cwd: root, stdio: 'pipe' });
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', temp], {
    cwd: root,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  // 先造一个空的 package.json，否则 npm install 会拒绝安装
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'pack-probe', version: '1.0.0', private: true }));
  const parsed = JSON.parse(raw.slice(raw.indexOf('[')));
  const files = parsed[0].files.map((file) => file.path);

  check('包内包含界面页面', files.includes('dist/ui/index.html'), files.filter((f) => f.includes('ui')).join(','));
  check('包内包含界面脚本', files.includes('dist/ui/app.js'));
  check('包内包含样式', files.includes('dist/ui/style.css'));
  check('包内包含 CLI 入口', files.includes('dist/index.js'));
  check('包内包含 GUI 服务', files.includes('dist/server/ui-server.js'));
  check('包内包含终端资源', files.includes('dist/ui/vendor/xterm.js') && files.includes('dist/ui/vendor/xterm.css') && files.includes('dist/ui/vendor/addon-fit.js'));
  check('包内包含语法高亮资源', files.includes('dist/ui/vendor/highlight.min.js'));
  check(
    '包内包含 UI 知识包',
    files.includes('docs/design/principles.md') && files.includes('docs/design/tokens.md'),
    files.filter((f) => f.startsWith('docs/')).join(','),
  );
  const guiLauncher = readFileSync(join(root, 'gui', 'bin', 'banana-gui.mjs'), 'utf8');
  const desktopLauncher = readFileSync(join(root, 'gui', 'bin', 'banana-gui-desktop.mjs'), 'utf8');
  check(
    'GUI 启动器不再强制 D 盘数据目录',
    !/BANANA_HOME\s*\?\?=\s*['"]D:/.test(guiLauncher) &&
      !/BANANA_HOME\s*\?\?=\s*['"]D:/.test(desktopLauncher),
  );

  // 回归：曾用会毁掉编码的方式改写 package.json，坏字节进了发布包，
  // Node 读到 U+FFFD 就直接拒绝加载整个包（ERR_INVALID_PACKAGE_CONFIG）
  const broken = [];
  for (const file of files) {
    if (!/\.(mjs|cjs|js|ts|json|html|css|md)$/i.test(file)) continue;
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    if (readFileSync(abs, 'utf8').includes('\uFFFD')) broken.push(file);
  }
  check('发布文件没有损坏的 UTF-8 字符', broken.length === 0, broken.join(','));

  // 装到临时目录，用「安装后的路径」实际起一次服务，确认能取到页面
  const tarball = join(temp, parsed[0].filename);
  execFileSync('npm', ['install', tarball, '--no-save', '--prefix', temp, '--registry=https://registry.npmjs.org'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 300_000,
  });
  const installed = join(temp, 'node_modules', '@vincentbanana', 'bananacli');

  const probe = `
    import { resolveAssetsDir } from ${JSON.stringify(new URL('file://' + join(installed, 'dist/server/ui-server.js').replace(/\\/g, '/')).href)};
    import { existsSync } from 'node:fs';
    import { join } from 'node:path';
    const dir = resolveAssetsDir();
    console.log(JSON.stringify({
      dir,
      index: existsSync(join(dir, 'index.html')),
      app: existsSync(join(dir, 'app.js')),
      css: existsSync(join(dir, 'style.css')),
      xterm: existsSync(join(dir, 'vendor', 'xterm.js')),
      fit: existsSync(join(dir, 'vendor', 'addon-fit.js')),
      highlight: existsSync(join(dir, 'vendor', 'highlight.min.js')),
      pty: typeof (await import('@lydell/node-pty')).spawn === 'function',
    }));
  `;
  const output = execFileSync('node', ['--input-type=module', '-e', probe], {
    cwd: installed,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 60_000,
  });
  const result = JSON.parse(output.trim().split('\n').pop());
  check('安装后能解析到界面目录', result.dir === join(installed, 'dist', 'ui'), result.dir);
  check('安装后界面文件齐全', result.index && result.app && result.css, JSON.stringify(result));
  check('安装后终端与高亮资源齐全', result.xterm && result.fit && result.highlight, JSON.stringify(result));
  check('安装后 PTY 原生模块可用', result.pty === true, JSON.stringify(result));
} catch (error) {
  const stderr = error?.stderr ? String(error.stderr).trim().split('\n').slice(-6).join(' | ') : '';
  check('打包检查执行成功', false, `${String(error?.message ?? error).slice(0, 120)} ${stderr}`.slice(0, 400));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  process.stdout.write(`\n${passed.length} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`\n${passed.length} 项通过，0 项失败\n`);
process.exit(0);
