'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storeGate', Object.freeze({
  state: () => ipcRenderer.invoke('store-gate:state'),
  onState: callback => ipcRenderer.on('store-gate:state', (_event, state) => callback(state)),
  onOpenError: callback => ipcRenderer.on('store-gate:open-error', () => callback()),
  retry: () => ipcRenderer.send('store-gate:retry'),
  openStore: () => ipcRenderer.send('store-gate:store'),
  exit: () => ipcRenderer.send('store-gate:exit')
}));
