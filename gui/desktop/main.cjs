const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const guiRoot = process.env.BANANA_GUI_ROOT || join(__dirname, '..');
const assetsDir = join(guiRoot, 'ui');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefixed = process.argv.find((item) => item.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
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

let serverHandle = null;

async function start() {
  const portValue = argValue('--port');
  const port = portValue === undefined ? undefined : Number(portValue);
  const server = await loadServer();
  serverHandle = await server.startUiServer({
    port,
    launchBrowser: false,
    assetsDir,
    isDesktop: true,
  });

  const window = new BrowserWindow({
    width: 1283,
    height: 814,
    minWidth: 920,
    minHeight: 620,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    title: 'BananaGUI',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('http://localhost:')) {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (serverHandle) {
      serverHandle.close().catch(() => {});
      serverHandle = null;
    }
  });
  await window.loadURL(serverHandle.url);
}

ipcMain.handle('banana:window', (_event, action) => {
  const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (action === 'minimize') window.minimize();
  else if (action === 'maximize') {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else if (action === 'close') window.close();
});

ipcMain.handle('banana:select-directory', async () => {
  const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(window, {
    title: '选择工作区',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await start();
  } catch (error) {
    dialog.showErrorBox('BananaGUI 启动失败', error instanceof Error ? error.message : String(error));
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void start();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
