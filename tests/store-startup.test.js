'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const queryModule = require('../store-update');

async function scenario(result, action) {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  const originalQuery = queryModule.queryStore;
  queryModule.queryStore = async (...args) => {
    assert.deepEqual(args[3], ['--window-handle', '1234']);
    return result;
  };
  delete require.cache[require.resolve('../store-startup')];
  const { enforceStoreStartup } = require('../store-startup');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-gate-test-'));
  fs.writeFileSync(path.join(directory, 'store-gate.json'), JSON.stringify({ errorPolicy: 'block' }));
  const ipc = new EventEmitter();
  const handlers = new Map();
  ipc.handle = (name, fn) => handlers.set(name, fn);
  ipc.removeHandler = name => handlers.delete(name);
  let quit = 0, external = 0, window, queryResolved = false;
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options; this.dead = false;
      this.webContents = new EventEmitter(); this.webContents.mainFrame = {};
      this.states = []; this.webContents.send = (name, state) => this.states.push({ name, state });
      this.webContents.setWindowOpenHandler = fn => { this.openHandler = fn; };
    }
    setMenu() {} show() { this.shown = true; }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; this.emit('closed'); }
    getNativeWindowHandle() { const b = Buffer.alloc(8); b.writeBigUInt64LE(1234n); return b; }
    async loadFile(file) { this.file = file; setImmediate(() => this.emit('ready-to-show')); }
  }
  const app = { getVersion: () => '1.2.3', getPath: () => directory, quit: () => quit++ };
  const shell = { openExternal: async uri => { external++; assert.equal(uri, 'ms-windows-store://pdp/?ProductId=9NCK2L097D7M'); } };
  try {
    const pending = enforceStoreStartup({ app, BrowserWindow: FakeWindow, ipcMain: ipc, shell, resourcesPath: directory });
    pending.then(() => { queryResolved = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    await action({ pending, window, event, ipc, handlers, wasResolved: () => queryResolved, external: () => external });
    return { quit, external };
  } finally {
    queryModule.queryStore = originalQuery;
    Object.defineProperty(process, 'platform', originalPlatform);
    fs.rmSync(directory, { recursive: true, force: true });
    delete require.cache[require.resolve('../store-startup')];
  }
}

test('actual startup coordinator enters only on successful current result and cleans IPC', async () => {
  const final = await scenario({ status: 'current' }, async ({ pending, window, handlers, ipc }) => {
    assert.equal(await pending, true); assert.equal(window.isDestroyed(), true);
    assert.equal(handlers.size, 0); assert.equal(ipc.listenerCount('store-gate:retry'), 0);
    assert.equal(window.options.webPreferences.nodeIntegration, false);
    assert.equal(window.options.webPreferences.sandbox, true);
  });
  assert.equal(final.quit, 0);
});
test('required update stays locked, ignores forged messages and exits fully when Store opens', async () => {
  const final = await scenario({ status: 'update_available' }, async ({ pending, window, event, ipc, wasResolved, external }) => {
    assert.equal(wasResolved(), false);
    assert.equal(window.states.at(-1).state.allowed, false);
    ipc.emit('store-gate:exit', { sender: {}, senderFrame: {} });
    assert.equal(wasResolved(), false);
    ipc.emit('store-gate:store', { sender: window.webContents, senderFrame: {} });
    assert.equal(external(), 0, 'subframes cannot open the Store or unlock the app');
    ipc.emit('store-gate:store', event);
    assert.equal(await pending, false);
  });
  assert.equal(final.external, 1); assert.equal(final.quit, 1);
});
test('closing the gate on a Store error quits, never starts the app', async () => {
  const final = await scenario({ status: 'error', code: 'store_query_failed' }, async ({ pending, window, wasResolved }) => {
    assert.equal(wasResolved(), false); assert.equal(window.states.at(-1).state.allowed, false);
    window.destroy(); assert.equal(await pending, false);
  });
  assert.equal(final.quit, 1);
});
