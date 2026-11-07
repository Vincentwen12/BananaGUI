// 桌面版预加载：只暴露窗口控制所需的最小接口。
// 页面拿不到 Node，也拿不到任意 ipcRenderer，只能发三个固定动作。
const { contextBridge, ipcRenderer } = require('electron');

const ACTIONS = new Set(['minimize', 'toggle-maximize', 'close']);

contextBridge.exposeInMainWorld('bananaDesktop', {
  platform: process.platform,
  frameless: process.platform !== 'darwin',
  minimize: () => ipcRenderer.send('banana:window', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('banana:window', 'toggle-maximize'),
  close: () => ipcRenderer.send('banana:window', 'close'),
  onMaximizeChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on('banana:maximized', handler);
    return () => ipcRenderer.removeListener('banana:maximized', handler);
  },
  isAction: (action) => ACTIONS.has(action),
});
