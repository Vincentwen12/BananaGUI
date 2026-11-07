// Banana 桌面版主进程：拉起本地 GUI 服务，再用窗口加载它。
// 界面资源仍来自本包 ui/，agent 内核来自 @vincentbanana/bananacli。
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { mkdirSync, writeFileSync } = require('node:fs');

/** 优先用显式 BANANA_HOME，其次可写的 D 盘目录，最后回退到家目录。 */
function resolveDataRoot() {
  const explicit = process.env.BANANA_HOME?.trim();
  if (explicit) {
    try {
      mkdirSync(explicit, { recursive: true });
      return explicit;
    } catch {
      // 显式目录不可写时继续尝试后面的位置
    }
  }
  if (process.platform === 'win32') {
    for (const candidate of ['D:\\BananaCLI-data', 'D:\\BananaData']) {
      try {
        mkdirSync(candidate, { recursive: true });
        return candidate;
      } catch {
        // 没有 D 盘或没有写权限，试下一个
      }
    }
  }
  return join(homedir(), '.banana');
}

// 用户数据、Electron 缓存优先放 D 盘；没有 D 盘时回退到家目录。
try {
  const dataRoot = resolveDataRoot();
  for (const [name, sub] of [['userData', 'electron'], ['sessionData', 'electron-session'], ['cache', 'cache']]) {
    const target = join(dataRoot, sub);
    mkdirSync(target, { recursive: true });
    app.setPath(name, target);
  }
} catch {
  // 设置失败就退回 Electron 默认位置，不影响启动
}

const require_ = createRequire(__filename);
let child = null;
let win = null;

// electron 自带的 node 运行 CLI 内核；ELECTRON_RUN_AS_NODE 让 electron.exe 当纯 node 用，
// 否则会再开一个 Electron 窗口，而不是执行脚本。
const PASSTHROUGH = ['--port', '--cwd', '--provider', '--model', '--base-url', '--api-key'];

function serverArgs() {
  const argv = process.argv.slice(2).filter((arg) => arg.startsWith('--'));
  const extra = [];
  for (const arg of argv) {
    if (PASSTHROUGH.includes(arg)) {
      extra.push(arg);
      const value = process.argv[process.argv.indexOf(arg) + 1];
      if (value && !value.startsWith('--')) extra.push(value);
    }
  }
  // 端口交给 CLI 随机分配，避免多开时互相抢占
  return ['--ui', '--no-open', ...extra];
}

// 优先用系统 node 跑内核：Electron 自带的 node 版本和原生模块（PTY）不一定匹配，
// 系统 node 更稳。找不到再退回 electron.exe（ELECTRON_RUN_AS_NODE）。
function resolveNode() {
  const candidate = process.env.BANANA_NODE || 'node';
  try {
    const probe = spawnSync(candidate, ['-v'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (probe.status === 0 && /^v\d+\./.test((probe.stdout || '').trim())) {
      return { file: candidate, env: {} };
    }
  } catch {
    // PATH 里没有 node，退回 Electron
  }
  return { file: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

function startServer() {
  let entry;
  try {
    // 依赖可能被提升到上层 node_modules；只能解析包根（子路径受 exports 限制）
    entry = require_.resolve('@vincentbanana/bananacli');
  } catch (error) {
    throw new Error('找不到依赖 @vincentbanana/bananacli，请重新安装：npm install -g @vincentbanana/banana-gui');
  }
  const node = resolveNode();
  child = spawn(node.file, [entry, ...serverArgs()], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ...node.env,
      BANANA_UI_DIR: process.env.BANANA_UI_DIR ?? join(__dirname, '..', 'ui'),
    },
  });
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/http:\/\/127\.0\.0\.1:\d+\/t\/[a-f0-9]+\//);
      if (match) {
        child.stdout.off('data', onData);
        resolve(match[0]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => process.stderr.write(`[banana] ${chunk}`));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!win) return;
      dialog.showErrorBox('Banana 已退出', `本地服务意外结束（退出码 ${code}）。`);
      app.quit();
    });
    setTimeout(() => reject(new Error('启动超时：本地服务没有在 30 秒内就绪')), 30_000);
  });
}

async function createWindow() {
  const url = await startServer();
  const frameless = process.platform !== 'darwin';
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161616' : '#ffffff',
    title: 'Banana',
    autoHideMenuBar: true,
    // Windows / Linux 用自绘标题栏；macOS 保留原生红绿灯更符合习惯
    frame: !frameless,
    titleBarStyle: frameless ? 'default' : 'hiddenInset',
    trafficLightPosition: frameless ? undefined : { x: 14, y: 16 },
    hasShadow: true,
    // 先不显示，等页面就绪再 show()：启动器用了 windowsHide，
    // 那种情况下 Electron 会把首个窗口以隐藏状态创建，不显式 show 就看不到
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  await win.loadURL(url);
  win.show();
  win.focus();
  win.on('closed', () => {
    win = null;
  });
  // 自绘标题栏需要知道最大化状态来切换图标
  const reportMaximized = () => {
    if (!win) return;
    win.webContents.send('banana:maximized', win.isMaximized());
  };
  win.on('maximize', reportMaximized);
  win.on('unmaximize', reportMaximized);
  win.webContents.on('did-finish-load', reportMaximized);
  // 外部链接交给系统浏览器，窗口只负责本地界面
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const protocol = new URL(target).protocol;
      if (protocol === 'http:' || protocol === 'https:') shell.openExternal(target);
    } catch {
      // 非法 URL 直接丢弃
    }
    return { action: 'deny' };
  });
  if (process.argv.includes('--selftest')) await selfTest(url);
}

// 页面只能通过 preload 发三个固定动作；发送方必须就是主窗口。
ipcMain.on('banana:window', (event, action) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || target !== win) return;
  if (action === 'minimize') target.minimize();
  else if (action === 'toggle-maximize') {
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
  } else if (action === 'close') target.close();
});

/** --selftest：不靠人眼看，直接在页面里断言界面渲染成功，然后退出。 */
async function selfTest(url) {
  const report = (payload) => {
    const line = 'SELFTEST ' + JSON.stringify(payload);
    console.log(line);
    // Electron 在 Windows 上是 GUI 子系统，stdout 常被丢掉；同时落一份文件方便自动化读取
    for (const target of [
      join(app.getPath('temp'), 'banana-desktop-selftest.json'),
      join(__dirname, 'selftest.json'),
      join(process.env.BANANA_HOME || __dirname, 'banana-desktop-selftest.json'),
    ]) {
      try {
        writeFileSync(target, line + '\n', 'utf8');
        break;
      } catch {
        /* 换下一个位置 */
      }
    }
  };
  try {
    // 页面是异步启动的：等标签条或模型加载完成，避免在 boot 之前断言
    await win.webContents.executeJavaScript(`new Promise((resolve) => {
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
        if (document.querySelectorAll('.tab').length > 0 || ticks > 60) {
          clearInterval(timer);
          resolve(true);
        }
      }, 50);
    })`);
    const probe = await win.webContents.executeJavaScript(`(() => ({
      title: document.title,
      composed: Boolean(document.querySelector('#composer')),
      sidebar: Boolean(document.querySelector('#sidebar')),
      scriptLoaded: typeof window.fetch === 'function' && Boolean(document.querySelector('#input')),
      theme: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      frameless: Boolean(window.bananaDesktop?.frameless),
      winControls: !document.querySelector('#winControls')?.hidden,
      customTitlebar: getComputedStyle(document.querySelector('.titlebar')).webkitAppRegion,
      tabs: document.querySelectorAll('.tab').length,
      review: Boolean(document.querySelector('#reviewPanel')),
    }))()`);
    // 打开 Review，确认输入框仍在视口内、没有被面板盖住
    const layout = await win.webContents.executeJavaScript(`(async () => {
      document.querySelector('#reviewBtn')?.click();
      await new Promise((resolve) => setTimeout(resolve, 360));
      const composer = document.querySelector('.composer-wrap')?.getBoundingClientRect();
      const review = document.querySelector('#reviewPanel');
      return {
        reviewOpen: Boolean(review && !review.hidden),
        composerVisible: Boolean(composer && composer.bottom <= window.innerHeight + 1 && composer.height > 0),
      };
    })()`);
    const ok =
      probe.title === 'Banana' &&
      probe.composed &&
      probe.sidebar &&
      probe.scriptLoaded &&
      probe.tabs >= 1 &&
      probe.review &&
      layout.reviewOpen &&
      layout.composerVisible;
    report({ ok, url: url.replace(/\/t\/[a-f0-9]+\//, '/t/<token>/'), ...probe, ...layout });
    child?.kill();
    app.exit(ok ? 0 : 1);
  } catch (error) {
    report({ ok: false, error: String(error?.message ?? error) });
    child?.kill();
    app.exit(1);
  }
}

const menuTemplate = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  {
    label: '文件',
    submenu: [
      {
        label: '新建对话',
        accelerator: 'CmdOrCtrl+N',
        click: () => win?.webContents.executeJavaScript("document.getElementById('newChat')?.click()"),
      },
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit', label: '退出' },
    ],
  },
  { role: 'editMenu', label: '编辑' },
  {
    label: '视图',
    submenu: [
      {
        label: '项目文件',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: () => win?.webContents.executeJavaScript("document.getElementById('filesBtn')?.click()"),
      },
      { type: 'separator' },
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { role: 'togglefullscreen', label: '全屏' },
    ],
  },
  { role: 'windowMenu', label: '窗口' },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow().catch((error) => {
    // 同时打到 stderr：没有控制台时（比如从启动器拉起）也能看到原因
    console.error('[banana] 启动失败：' + String(error?.stack ?? error?.message ?? error));
    dialog.showErrorBox('Banana 启动失败', String(error?.message ?? error));
    app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  child?.kill();
  child = null;
});