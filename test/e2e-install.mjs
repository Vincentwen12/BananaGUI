// 端到端验证：把 CLI 和 GUI 都打成 tarball，装到 D 盘的临时目录，
// 用「安装后的产物」起服务并核对页面内容。这是唯一能发现
// 「源码能跑、发布包跑不了」这类问题的测试。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = mkdtempSync(join(root, '.tmp-e2e-'));
const npm = (args, cwd) =>
  execFileSync('npm', args, { cwd, stdio: 'pipe', shell: process.platform === 'win32', encoding: 'utf8', timeout: 300_000 });

/** 读某个 package.json 的版本号 */
const versionOf = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;

const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  ${detail}`}\n`);
};

try {
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'e2e', version: '1.0.0', private: true }));

  // 打包两个包
  npm(['pack', '--pack-destination', temp], root);
  npm(['pack', '--pack-destination', temp], join(root, 'gui'));
  const cliTar = join(temp, `vincentbanana-bananacli-${versionOf(root)}.tgz`);
  const guiTar = join(temp, `vincentbanana-banana-gui-${versionOf(join(root, 'gui'))}.tgz`);
  record('两个包都能打包', true);

  // 装 GUI（跳过 electron，先验浏览器版路径）
  npm(['install', cliTar, guiTar, '--no-save', '--omit=optional', '--registry=https://registry.npmjs.org'], temp);
  record('安装成功（跳过 electron）', true);

  const guiBin = join(temp, 'node_modules', '@vincentbanana', 'banana-gui', 'bin', 'banana-gui.mjs');
  const version = execFileSync('node', [guiBin, '--version'], { cwd: temp, encoding: 'utf8' }).trim();
  record('--version 读的是真实版本', version === versionOf(join(root, 'gui')), version);

  const help = execFileSync('node', [guiBin, '--help'], { cwd: temp, encoding: 'utf8' });
  record('--help 正常', help.includes('banana-gui') && help.includes('--desktop'));

  // 起服务（GUI 启动器 + CLI 内核），从 stdout 抓 URL
  const { spawn } = await import('node:child_process');
  mkdirSync(join(temp, 'home'), { recursive: true });
  const child = spawn('node', [guiBin, '--no-open'], {
    cwd: temp,
    env: { ...process.env, BANANA_HOME: join(temp, 'home'), BANANA_WORKSPACE: join(temp, 'ws') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  mkdirSync(join(temp, 'ws'), { recursive: true });
  const url = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('等待 URL 超时: ' + buffer.slice(-300))), 60_000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/t\/[a-f0-9]+\//);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', (chunk) => (buffer += chunk.toString('utf8')));
    child.on('exit', (code) => reject(new Error(`进程提前退出(${code}): ${buffer.slice(-300)}`)));
  });
  record('GUI 启动并给出带 token 的地址', Boolean(url), url);

  const page = await fetch(url);
  const html = await page.text();
  record('页面 200 且有标题', page.status === 200 && html.includes('<title>Banana</title>'), String(page.status));

  const js = await (await fetch(new URL('app.js', url))).text();
  record('样式脚本可访问', js.includes('const ICONS'));
  record('页面脚本含侧边栏收起修复', js.includes('closeSidebarIfOverlay'));
  record('页面脚本含命令面板', js.includes('commandPalette'));

  const bare = await fetch(new URL('/', new URL(url).origin + '/'));
  record('不带 token 直接访问返回 404', bare.status === 404, String(bare.status));

  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
} catch (error) {
  record('端到端流程执行完成', false, String(error?.message ?? error).slice(0, 300));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const failed = results.filter((item) => !item).length;
process.stdout.write(`\n${results.length - failed} 项通过，${failed} 项失败\n`);
process.reallyExit(failed ? 1 : 0);
