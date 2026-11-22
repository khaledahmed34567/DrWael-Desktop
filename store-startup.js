'use strict';
const path = require('path');
const fs = require('fs');
const { StoreGate, queryStore } = require('./store-update');
const STORE_URI = 'ms-windows-store://pdp/?ProductId=9NCK2L097D7M';

// A Store build embeds a policy marker separately from app.asar. No environment
// variable or command-line switch can opt a Store build out of this gate.
function needsStoreGate(platform, windowsStore, resourcesPath) {
  return platform === 'win32' && (windowsStore === true || fs.existsSync(path.join(resourcesPath, 'store-gate.json')));
}

async function enforceStoreStartup({ app, BrowserWindow, ipcMain, shell, resourcesPath = process.resourcesPath }) {
  if (!needsStoreGate(process.platform, process.windowsStore, resourcesPath)) return true;
  let errorPolicy = 'block';
  try {
    const policy = JSON.parse(fs.readFileSync(path.join(resourcesPath, 'store-gate.json'), 'utf8'));
    if (policy.errorPolicy !== 'block') throw new Error('Invalid policy');
    errorPolicy = policy.errorPolicy;
  } catch (_) { /* Missing/corrupt Store configuration must not silently bypass. */ }
  let gateWindow;
  let finish;
  let settled = false;
  const done = new Promise(resolve => { finish = resolve; });
  const latchPath = path.join(app.getPath('userData'), 'store-update-required.json');
  const gate = new StoreGate({
    installedVersion: app.getVersion(), errorPolicy,
    query: () => {
      const handle = gateWindow.getNativeWindowHandle();
      const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
      return queryStore(path.join(resourcesPath, 'native', 'store-update-check.exe'), app.getVersion(), undefined, ['--window-handle', hwnd]);
    },
    readLatch: () => fs.existsSync(latchPath) ? JSON.parse(fs.readFileSync(latchPath, 'utf8')) : null,
    writeLatch: latch => {
      fs.writeFileSync(latchPath + '.tmp', JSON.stringify(latch), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(latchPath + '.tmp', latchPath);
    },
    onChange: state => {
      if (gateWindow && !gateWindow.isDestroyed()) gateWindow.webContents.send('store-gate:state', state);
    }
  });
  gateWindow = new BrowserWindow({
    width: 650, height: 530, useContentSize: true, resizable: false, maximizable: false, show: false,
    title: 'Dr. Wael | Microsoft Store', backgroundColor: '#fffaf8', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'store-gate-preload.js'), sandbox: true,
      contextIsolation: true, nodeIntegration: false, devTools: false
    }
  });
  gateWindow.setMenu(null);
  gateWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  gateWindow.webContents.on('will-navigate', event => event.preventDefault());
  const trusted = event => !gateWindow.isDestroyed() && event.sender === gateWindow.webContents && event.senderFrame === gateWindow.webContents.mainFrame;
  const cleanup = () => {
    ipcMain.removeListener('store-gate:retry', retry);
    ipcMain.removeListener('store-gate:store', openStore);
    ipcMain.removeListener('store-gate:exit', exit);
    ipcMain.removeHandler('store-gate:state');
  };
  const resolve = allowed => {
    if (settled) return;
    settled = true;
    cleanup();
    finish(allowed);
    if (!gateWindow.isDestroyed()) gateWindow.destroy();
    if (!allowed) app.quit();
  };
  const check = async () => {
    const state = await gate.check();
    if (settled) return;
    // No renderer message can authorize entry. Only the main-process Store
    // query result, combined with the explicit owner-selected policy, can.
    if (state.allowed) resolve(true);
  };
  const retry = event => { if (trusted(event)) check(); };
  const openStore = async event => {
    if (!trusted(event) || gate.state.status === 'checking') return;
    try {
      await shell.openExternal(STORE_URI);
      // Exit fully, not to tray, so Store can replace the running executable.
      resolve(false);
    } catch (_) {
      if (!gateWindow.isDestroyed()) gateWindow.webContents.send('store-gate:open-error');
    }
  };
  const exit = event => { if (trusted(event)) resolve(false); };
  ipcMain.on('store-gate:retry', retry);
  ipcMain.on('store-gate:store', openStore);
  ipcMain.on('store-gate:exit', exit);
  ipcMain.handle('store-gate:state', event => trusted(event) ? gate.state : null);
  gateWindow.on('closed', () => { if (!settled) resolve(false); });
  gateWindow.once('ready-to-show', () => { gateWindow.show(); check(); });
  gateWindow.webContents.once('did-fail-load', () => resolve(false));
  await gateWindow.loadFile(path.join(__dirname, 'store-gate.html'));
  return done;
}
module.exports = { needsStoreGate, enforceStoreStartup };
