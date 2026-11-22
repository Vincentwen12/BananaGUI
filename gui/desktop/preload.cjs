const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bananaDesktop', {
  isDesktop: true,
  platform: process.platform,
  windowControl: (action) => ipcRenderer.invoke('banana:window', action),
  selectDirectory: () => ipcRenderer.invoke('banana:select-directory'),
});
