// 一条命令完成：检查 -> 同步 -> 发布 CLI / GUI -> 等 registry -> 全局安装验证。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'https://registry.npmjs.org';
const cache = process.env.NPM_CACHE_DIR || join(process.env.TEMP || process.env.TMP || root, 'npm-cache-banana');
// Windows 上直接 spawn npm.cmd 会 EINVAL，统一用当前 node 跑 npm-cli.js
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function run(args, cwd = root) {
  process.stdout.write(`\n$ npm ${args.join(' ')}\n`);
  execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit', env: { ...process.env } });
}

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const guiPkg = JSON.parse(readFileSync(join(root, 'gui', 'package.json'), 'utf8'));

run(['run', 'typecheck']);
run(['test']);
run(['run', 'build']);
run(['run', 'gui:sync']);
run(['run', 'gui:check']);
execFileSync(process.execPath, [join(root, 'test', 'pack.test.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'gui', 'test', 'gui-package.test.mjs')], {
  cwd: join(root, 'gui'),
  stdio: 'inherit',
});

run(['publish', `--registry=${registry}`, '--access', 'public']);
run(['publish', `--registry=${registry}`, '--access', 'public'], join(root, 'gui'));

const waitFor = async (name, version) => {
  let latest = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch(`${registry}/${encodeURIComponent(name).replace('%40', '@')}`);
      const data = await res.json();
      latest = data?.['dist-tags']?.latest ?? '';
      if (latest === version) return true;
    } catch {
      /* registry 还在处理 */
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  process.stderr.write(`\n${name} 还没在 registry 上出现 ${version}（latest=${latest || 'unknown'}）\n`);
  return false;
};

const okCli = await waitFor(rootPkg.name, rootPkg.version);
const okGui = await waitFor(guiPkg.name, guiPkg.version);
if (!okCli || !okGui) process.exit(1);

run([
  'install', '-g',
  `${rootPkg.name}@${rootPkg.version}`,
  `${guiPkg.name}@${guiPkg.version}`,
  `--registry=${registry}`,
  `--cache=${cache}`,
  '--prefer-online',
]);
run(['ls', '-g', '--depth=0']);
