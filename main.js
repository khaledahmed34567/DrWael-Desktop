'use strict';
const {
  app, BrowserWindow, ipcMain, session, Notification, dialog, Tray, Menu, nativeImage, shell, systemPreferences, clipboard, globalShortcut, powerMonitor
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const createBridge = require('./bridge');
const { createDesktopHandler } = require('./desktop-http');
const { trustedIpc, allowPermission } = require('./desktop-security');
const { enforceStoreStartup } = require('./store-startup');
const { createDesktopWidget } = require('./desktop-widget');
const { requestDeviceVerification } = require('./auth-guard');
const { createWindowsHello } = require('./windows-hello');
const { createHelloGate, hwnd } = require('./windows-hello-gate');
let hello=null,helloGate=null,deviceUnlocked=process.platform!=='win32',activeDeviceAccount='windows-device';
let studyWidget = null;

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const APP_NAME = CFG.appName || 'Dr. Wael';

let win = null;
let tray = null;
let quitting = false;
let PORT = 0;
let bridge = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}
app.setAppUserModelId('com.drwael.desktop');

// ------------------------------------------------------------------ مخزن المكتبات (يعمل بدون إنترنت)
const LIB_HOSTS = [
  ['www.gstatic.com', '/firebasejs/'],
  ['cdnjs.cloudflare.com', '/ajax/libs/'],
  ['cdn.jsdelivr.net', '/npm/pdfjs-dist']
];
const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
const PREFETCH = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  KATEX + 'katex.min.css',
  KATEX + 'katex.min.js',
  KATEX + 'contrib/mhchem.min.js',
  KATEX + 'contrib/auto-render.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'
];
const libAllowed = (u) => u.protocol === 'https:' && LIB_HOSTS.some(([h, p]) => u.hostname === h && u.pathname.startsWith(p));
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const cacheDir = () => path.join(app.getPath('userData'), 'libcache');
let fetchSession = null;

function mimeFor(url, header) {
  const h = (header || '').split(';')[0].trim();
  if (h && h !== 'application/octet-stream') return h;
  const p = url.split('?')[0];
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.woff2')) return 'font/woff2';
  if (p.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function nodeHttpsGet(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).href;
        nodeHttpsGet(nextUrl, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), ct: res.headers['content-type'] }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function fetchToCache(url) {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    let buf = null;
    let ct = '';
    try {
      const r = await fetchSession.fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        buf = Buffer.from(await r.arrayBuffer());
        ct = r.headers.get('content-type') || '';
      }
    } catch (e) { /* تجربة الاتصال المباشر */ }
    if (!buf || buf.length === 0) {
      const res = await nodeHttpsGet(url);
      buf = res.buf;
      ct = res.ct || '';
    }
    if (!buf || buf.length === 0) return false;
    const f = path.join(cacheDir(), sha1(url));
    fs.writeFileSync(f + '.tmp', buf);
    fs.renameSync(f + '.tmp', f);
    fs.writeFileSync(f + '.m', mimeFor(url, ct));
    return true;
  } catch (e) {
    return false;
  }
}

const isCached = (url) => {
  const f = path.join(cacheDir(), sha1(url));
  try {
    return fs.existsSync(f + '.m') && fs.existsSync(f) && fs.statSync(f).size > 0;
  } catch (e) {
    return false;
  }
};

async function prefetchLibs() {
  for (const u of PREFETCH) if (!isCached(u)) await fetchToCache(u);
  try {
    const css = fs.readFileSync(path.join(cacheDir(), sha1(KATEX + 'katex.min.css')), 'utf8');
    const fonts = new Set([...css.matchAll(/url\((fonts\/[^)]+?\.woff2)\)/g)].map((m) => m[1]));
    for (const f of fonts) if (!isCached(KATEX + f)) await fetchToCache(KATEX + f);
  } catch (e) { /* تجاهل */ }
}

// ------------------------------------------------------------------ سكربت الإقلاع المحقون في الصفحة
function bootScript() {
  return `(function(){
var h=window.__dwHost;if(!h)return;
window.DWNative={desktop:true,platform:${JSON.stringify(process.platform)},postMessage:function(s){h.send(String(s))},onmessage:null};
h.onReply(function(m){try{if(window.DWNative.onmessage)window.DWNative.onmessage({data:m})}catch(e){}});
if(h.onShield){h.onShield(function(on){try{window.dispatchEvent(new CustomEvent('dw-shield',{detail:!!on}))}catch(e){}});}
if(h.onUpdate){h.onUpdate(function(info){try{window.dispatchEvent(new CustomEvent('dw-update',{detail:info}))}catch(e){}});}
var D=function(k,m,d){try{var r=h.dialog(k,m==null?'':String(m),d==null?'':String(d),document.documentElement.lang||'ar',document.documentElement.dir!=='ltr',{dark:document.documentElement.dataset.theme==='dark',colors:['card','ink','mute','line','f2','h1'].map(function(k){return getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim()})});return r===undefined?null:r}catch(e){return null}};
window.alert=function(m){D('alert',m)};
window.confirm=function(m){return D('confirm',m)===true};
window.prompt=function(m,d){var r=D('prompt',m,d);return typeof r==='string'?r:null};
})();`;
}

function pageHtml() {
  const html = fs.readFileSync(path.join(__dirname, 'app', 'index.html'), 'utf8');
  return html.replace('<head>', '<head><script>' + bootScript() + '</script>');
}

const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

// ------------------------------------------------------------------ خادم محلي صغير لعرض الصفحة
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer(createDesktopHandler({ rootDir: __dirname, getPort: () => PORT, pageHtml, libAllowed, isCached, fetchToCache, cacheDir, sha1, iconPath }));
    srv.once('error', () => {
      // المنفذ المفضّل مشغول: نستخدم منفذًا عشوائيًا
      srv.listen(0, '127.0.0.1', () => { PORT = srv.address().port; resolve(); });
    });
    srv.listen(CFG.preferredPort || 47831, '127.0.0.1', () => { PORT = srv.address().port; resolve(); });
  });
}

// ------------------------------------------------------------------ نوافذ التنبيه بتصميم التطبيق
const dlgPending = new Map();

function brandDialog(o) {
  return new Promise((resolve) => {
    const parent = win && win.isVisible() ? win : undefined;
    const w = new BrowserWindow({
      parent, modal: !!parent, width: 460, height: 260, useContentSize: true,
      frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false,
      fullscreenable: false, show: false, skipTaskbar: true, backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'dialog-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false
      }
    });
    w.setContentProtection(true);
    const def = o.k === 'confirm' ? false : o.k === 'prompt' ? null : true;
    let done = false;
    let showTimer = null;
    const fin = (v) => {
      if (done) return;
      done = true;
      clearTimeout(showTimer);
      dlgPending.delete(w.webContents.id);
      resolve(v);
      try { w.close(); } catch (e) { /* تجاهل */ }
    };
    dlgPending.set(w.webContents.id, { fin, w, parent });
    w.on('closed', () => fin(def));
    w.webContents.on('did-fail-load', () => fin(def));
    w.webContents.on('render-process-gone', () => fin(def));
    w.webContents.once('did-finish-load', () => {
      if (!w.isDestroyed()) {
        w.setContentProtection(true);
        w.webContents.send('dlg:init', o);
        showTimer = setTimeout(() => {
          if (!done && !w.isDestroyed() && !w.isVisible()) {
            w.center();
            w.show();
          }
        }, 1200);
      }
    });
    w.loadFile(path.join(__dirname, 'dialog.html')).catch(() => fin(def));
  });
}

ipcMain.on('dlg:done', (e, v) => { const p = dlgPending.get(e.sender.id); if (p) p.fin(v); });
ipcMain.on('dlg:size', (e, h) => {
  const p = dlgPending.get(e.sender.id);
  if (!p || p.w.isDestroyed()) return;
  const height = Math.max(150, Math.min(Math.ceil(Number(h) || 260), 640));
  p.w.setContentSize(460, height);
  if (p.parent && !p.parent.isDestroyed()) {
    const b = p.parent.getBounds();
    p.w.setPosition(Math.round(b.x + (b.width - 460) / 2), Math.round(b.y + (b.height - height) / 2));
  } else {
    p.w.center();
  }
  p.w.setContentProtection(true);
  p.w.show();
});

const trusted = e => deviceUnlocked && trustedIpc(e, win, PORT);

ipcMain.on('dw:dialog', (e, o) => {
  if (!trusted(e) || !o || typeof o !== 'object') { e.returnValue = null; return; }
  const k = ['alert', 'confirm', 'prompt'].includes(o.k) ? o.k : 'alert';
  brandDialog({ k, m: String(o.m || '').slice(0, 3000), d: String(o.d || '').slice(0, 1000), l: o.l === 'en' ? 'en' : 'ar', rtl: o.rtl !== false, theme: { dark: o.theme?.dark === true, colors: Array.isArray(o.theme?.colors) ? o.theme.colors.slice(0, 6).map(v => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v)) ? String(v) : '') : [] } })
    .then((v) => { e.returnValue = v === undefined ? null : v; })
    .catch(() => { e.returnValue = null; });
});

ipcMain.on('dw:msg', async (e, raw) => {
  if (!trusted(e) || typeof raw !== 'string' || raw.length > 60 * 1024 * 1024) return;
  if (!bridge) return;
  const r = await bridge.handle(raw);
  if (r && !e.sender.isDestroyed()) e.sender.send('dw:reply', JSON.stringify(r));
});

// ------------------------------------------------------------------ النافذة والأيقونة
const iconPath = (name) => path.join(__dirname, 'assets', 'icons', (name || 'Default') + '.png');
const appIcon = () => {
  const candidates = [
    iconPath(bridge ? bridge.state().icon : 'Default'),
    iconPath('Default'),
    path.join(__dirname, 'build', 'icon.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (img && !img.isEmpty()) return img;
      }
    } catch (e) { /* تجاهل */ }
  }
  return nativeImage.createEmpty();
};

function protectWindow(bw) {
  if (!bw || bw.isDestroyed()) return;
  try { bw.setContentProtection(true); } catch (e) { /* تجاهل */ }
}

function triggerShotShield(bw) {
  try { Promise.resolve(clipboard.writeText('')).catch(() => {}); } catch (e) { /* تجاهل */ }
  const target = bw && !bw.isDestroyed() ? bw : win;
  if (target && !target.isDestroyed()) {
    try { target.webContents.send('dw:shield', true); } catch (e) { /* تجاهل */ }
    setTimeout(() => {
      if (target && !target.isDestroyed() && target.isFocused()) {
        try { target.webContents.send('dw:shield', false); } catch (e) { /* تجاهل */ }
      }
    }, 2500);
  }
}

const SHOT_SHORTCUTS = [
  'PrintScreen',
  'Alt+PrintScreen',
  'CommandOrControl+Shift+3',
  'CommandOrControl+Shift+4',
  'CommandOrControl+Shift+5',
  'CommandOrControl+Shift+6'
];

function registerShotShortcuts() {
  for (const acc of SHOT_SHORTCUTS) {
    try {
      if (!globalShortcut.isRegistered(acc)) {
        globalShortcut.register(acc, () => triggerShotShield(win));
      }
    } catch (e) { /* تجاهل */ }
  }
}

function unregisterShotShortcuts() {
  for (const acc of SHOT_SHORTCUTS) {
    try {
      if (globalShortcut.isRegistered(acc)) globalShortcut.unregister(acc);
    } catch (e) { /* تجاهل */ }
  }
}

function attachInputProtection(bw) {
  if (!bw || bw.isDestroyed()) return;
  bw.webContents.on('before-input-event', (ev, input) => {
    const key = String(input.key || '').toLowerCase();
    const isScreenshot =
      key === 'printscreen' ||
      input.code === 'PrintScreen' ||
      ((input.meta || input.control) && input.shift && ['3', '4', '5', '6', 's'].includes(key));
    const isRestricted =
      key === 'f12' ||
      ((input.control || input.meta) && input.shift && ['i', 'j', 'c', 'k'].includes(key)) ||
      ((input.control || input.meta) && ['u', 'p', 's'].includes(key));
    if (isScreenshot || isRestricted) {
      ev.preventDefault();
      if (isScreenshot) triggerShotShield(bw);
    }
  });
}

app.on('browser-window-created', (_ev, bw) => {
  protectWindow(bw);
  attachInputProtection(bw);
  bw.once('ready-to-show', () => protectWindow(bw));
  bw.on('show', () => protectWindow(bw));
  bw.on('restore', () => protectWindow(bw));
  bw.on('focus', () => {
    protectWindow(bw);
    registerShotShortcuts();
  });
  bw.on('blur', () => {
    setTimeout(() => {
      const focused = BrowserWindow.getFocusedWindow();
      if (!focused) unregisterShotShortcuts();
    }, 50);
  });
  bw.on('enter-full-screen', () => protectWindow(bw));
  bw.on('leave-full-screen', () => protectWindow(bw));
  bw.on('maximize', () => protectWindow(bw));
  bw.on('unmaximize', () => protectWindow(bw));
  bw.webContents.on('did-finish-load', () => protectWindow(bw));
  bw.webContents.on('did-frame-finish-load', () => protectWindow(bw));
});

function applyProtection() {
  protectWindow(win);
  for (const bw of BrowserWindow.getAllWindows()) protectWindow(bw);
}

async function showWin() {
  if (!win) return;
  if(process.platform==='win32'&&!deviceUnlocked){if(!helloGate||!await helloGate.ensure())return;deviceUnlocked=true;}
  if (win.isMinimized()) win.restore();
  applyProtection();
  win.show();
  win.focus();
}

function createWindow() {
  const initIcon = appIcon();
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 560,
    title: APP_NAME, icon: initIcon.isEmpty() ? undefined : initIcon, backgroundColor: '#B22127', autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      spellcheck: false, autoplayPolicy: 'no-user-gesture-required', devTools: !app.isPackaged
    }
  });
  applyProtection(); // يمنع لقطة الشاشة وتسجيلها (ويندوز وماك)
  win.once('ready-to-show', () => {
    const icImg = appIcon();
    if (!icImg.isEmpty()) try { win.setIcon(icImg); } catch (e) { /* تجاهل */ }
    applyProtection();
    if(deviceUnlocked)win.show();
  });
  win.on('show', ()=>{if(!deviceUnlocked){win.hide();return;}applyProtection();});
  win.on('restore', ()=>{if(!deviceUnlocked){win.hide();return;}applyProtection();});
  win.on('focus', () => {
    applyProtection();
    if (!win.isDestroyed()) win.webContents.send('dw:shield', false);
  });
  win.on('blur', () => {
    if (!win.isDestroyed()) win.webContents.send('dw:shield', true);
  });
  win.on('hide', () => {
    unregisterShotShortcuts();
  });
  setTimeout(() => {
    if (deviceUnlocked && win && !win.isDestroyed() && !win.isVisible()) {
      applyProtection();
      win.show();
    }
  }, 3000);

  win.on('close', (ev) => {
    if (!quitting) { ev.preventDefault(); win.hide(); }
  });

  const origin = 'http://localhost:' + PORT;
  let loadRetried = false;
  win.webContents.on('did-fail-load', (_ev, code) => {
    if (code === -3 || loadRetried || win.isDestroyed()) return;
    loadRetried = true;
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.loadURL(origin + '/');
    }, 500);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith(origin + '/')) {
      ev.preventDefault();
      if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.on('did-start-navigation', (_ev, _url, _inPlace, mainFrame) => { if(mainFrame && studyWidget)studyWidget.clear(); });
  win.webContents.on('render-process-gone', () => { if(studyWidget)studyWidget.clear(); });
  win.loadURL(origin + '/');
}

function createTray() {
  try {
    const img = appIcon().resize({ width: 20, height: 20 });
    tray = new Tray(img);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'فتح / Open', click: showWin },
      { label: 'Microsoft Store / تحديث التطبيق', click: () => checkUpdates(true) },
      { type: 'separator' },
      { label: 'خروج / Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWin);
  } catch (e) { /* بعض بيئات لينكس بلا Tray */ }
}

// ------------------------------------------------------------------ التحديثات (ويندوز ولينكس AppImage)
function checkUpdates(manual) {
  // Microsoft Store owns installation, signatures and all app updates.
  // Never download or execute an installer from a repository.
  if (!manual) return;
  shell.openExternal('ms-windows-store://pdp/?ProductId=9NCK2L097D7M').catch(() => {
    shell.openExternal('https://apps.microsoft.com/detail/9NCK2L097D7M').catch(() => {});
  });
}

// ------------------------------------------------------------------ التشغيل
app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; if(studyWidget)studyWidget.destroy(); unregisterShotShortcuts(); });
app.on('will-quit', () => { unregisterShotShortcuts(); });
app.on('activate', showWin);
app.on('window-all-closed', () => { /* نبقى في الخلفية (Tray) للتذكيرات */ });

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }

  // Do not start the content server, bridge, tray or app window before the
  // Store check has authorized entry. A renderer cannot bypass this boundary.
  try {
    if (!(await enforceStoreStartup({ app, BrowserWindow, ipcMain, shell }))) return;
  } catch (_) {
    dialog.showErrorBox('Dr. Wael', 'تعذّر تشغيل فحص تحديث Microsoft Store. حاول فتح التطبيق من جديد.');
    app.quit();
    return;
  }

  if(process.platform==='win32'){
    hello=createWindowsHello({filePath:path.join(app.getPath('userData'),'hello-public-credential.json'),helperPath:app.isPackaged?path.join(process.resourcesPath,'native','windows-hello.exe'):path.join(__dirname,'build','native','windows-hello.exe')});
    helloGate=createHelloGate({BrowserWindow,ipcMain,shell,app,hello});
    const lockDevice=()=>{deviceUnlocked=false;helloGate.close();if(studyWidget)studyWidget.clear();for(const pending of dlgPending.values())pending.fin(false);if(win&&!win.isDestroyed())win.hide();};
    powerMonitor.on('lock-screen',lockDevice);powerMonitor.on('suspend',lockDevice);
    try{if(!await helloGate.ensure()){app.quit();return}deviceUnlocked=true}catch(_){app.quit();return}
  }
  fetchSession = session.fromPartition('libfetch');
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(allowPermission(wc, perm, details, win, PORT)));
  ses.setPermissionCheckHandler((wc, perm, origin, details) => allowPermission(wc, perm, { ...(details || {}), requestingUrl: details?.requestingUrl || origin }, win, PORT));
  if (typeof ses.setDisplayMediaRequestHandler === 'function') {
    ses.setDisplayMediaRequestHandler((_req, cb) => cb({}));
  }
  ses.on('will-download', (ev) => ev.preventDefault());

  bridge = createBridge({
    cfg: CFG,
    statePath: path.join(app.getPath('userData'), 'state.json'),
    version: app.getVersion(),
    now: () => Date.now(),
    notify: (t, b) => {
      if (!deviceUnlocked || !Notification.isSupported()) return;
      const n = new Notification({ title: t || APP_NAME, body: b || '', icon: appIcon() });
      n.on('click', showWin);
      n.show();
    },
    saveFile: async (name, mime, buf) => {
      const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name) });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, buf);
      return true;
    },
    openExternal: (url) => shell.openExternal(url),
    helloSettings:()=>shell.openExternal('ms-settings:signinoptions').catch(()=>{}),
    touchId: (why,context) => requestDeviceVerification({platform:process.platform,windowsHello:async()=>{if(!deviceUnlocked||!hello||!win||win.isDestroyed()||why!=='pay')return false;return hello.verify({hwnd:hwnd(win),accountId:activeDeviceAccount,purpose:'payment',context:{why,transaction:context??null}})},canTouchID:()=>systemPreferences.canPromptTouchID(),touchID:reason=>systemPreferences.promptTouchID(reason),reason:why}),
    session:uid=>{const next=String(uid||'windows-device').slice(0,256);if(next!==activeDeviceAccount){activeDeviceAccount=next;if(hello)hello.clear();}},
    logout:()=>{activeDeviceAccount='windows-device';if(hello)hello.clear();},
    setIcon: (name) => {
      const img = nativeImage.createFromPath(iconPath(name));
      if (img.isEmpty()) return false;
      if (win) win.setIcon(img);
      if (process.platform === 'darwin' && app.dock) app.dock.setIcon(img);
      if (tray) tray.setImage(img.resize({ width: 20, height: 20 }));
      return true;
    },
    checkUpdate: () => checkUpdates(true)
  });

  await startServer();

  // تحويل طلبات مكتبات الـ CDN إلى المخزن المحلي (يعمل بدون إنترنت بعد أول تشغيل)
  ses.webRequest.onBeforeRequest(
    { urls: ['https://www.gstatic.com/firebasejs/*', 'https://cdnjs.cloudflare.com/ajax/libs/*', 'https://cdn.jsdelivr.net/npm/pdfjs-dist*'] },
    (details, cb) => {
      try {
        if (libAllowed(new URL(details.url)) && details.method === 'GET') {
          cb({ redirectURL: 'http://localhost:' + PORT + '/__lib?u=' + encodeURIComponent(details.url) });
          return;
        }
      } catch (e) { /* تجاهل */ }
      cb({});
    }
  );

  if (process.platform === 'darwin' && app.dock) {
    const dockImg = appIcon();
    if (!dockImg.isEmpty()) app.dock.setIcon(dockImg);
  }
  createWindow();
  studyWidget=createDesktopWidget({BrowserWindow,ipcMain,powerMonitor,trustedMain:trusted,showMain:()=>{showWin();if(win&&!win.isDestroyed())win.webContents.send('dw:widget:edit');}});
  createTray();
  setInterval(() => bridge.tick(), 20000);
  setTimeout(() => { prefetchLibs(); checkUpdates(false); }, 4000);
});
