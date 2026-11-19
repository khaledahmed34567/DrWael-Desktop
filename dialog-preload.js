'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('__dlg', {
  onInit: (cb) => ipcRenderer.on('dlg:init', (_e, o) => cb(o)),
  done: (v) => ipcRenderer.send('dlg:done', v),
  size: (h) => ipcRenderer.send('dlg:size', h)
});
