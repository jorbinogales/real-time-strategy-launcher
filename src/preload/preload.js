'use strict';
// Preload mínimo: única superficie que el renderer del launcher ve (window.masterwar). Tipos en masterwar.d.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('masterwar', {
  getState: () => ipcRenderer.invoke('mw:getState'),
  checkUpdate: () => ipcRenderer.invoke('mw:checkUpdate'),
  startUpdate: () => ipcRenderer.invoke('mw:startUpdate'),
  play: () => ipcRenderer.invoke('mw:play'),
  openUrl: (url) => ipcRenderer.invoke('mw:openUrl', String(url)),
  getLicense: () => ipcRenderer.invoke('mw:getLicense'),
  onUpdateProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('mw:update-progress', h);
    return () => ipcRenderer.removeListener('mw:update-progress', h);
  },
});
