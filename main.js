'use strict';
const {
  app, BrowserWindow, ipcMain, session, Notification, dialog, Tray, Menu, nativeImage, shell, systemPreferences, clipboard, globalShortcut
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const createBridge = require('./bridge');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const APP_NAME = CFG.appName || 'Dr. Wael';

let win = null;
let tray = null;
let quitting = false;
let PORT = 0;
let bridge = null;
let autoUpdater = null;

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
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
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
var D=function(k,m,d){try{var r=h.dialog(k,m==null?'':String(m),d==null?'':String(d),document.documentElement.lang||'ar',document.documentElement.dir!=='ltr');return r===undefined?null:r}catch(e){return null}};
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
    const srv = http.createServer(async (req, res) => {
      try {
        if (!isLoopback(req.socket.remoteAddress)) {
          res.writeHead(403);
          return res.end();
        }
        const u = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          return res.end(pageHtml());
        }
        if (req.method === 'GET' && u.pathname === '/course-alerts.js') {
          res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          return res.end(fs.readFileSync(path.join(__dirname, 'app', 'course-alerts.js'), 'utf8'));
        }
        if (req.method === 'GET' && u.pathname === '/course-features.js') {
          res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          return res.end(fs.readFileSync(path.join(__dirname, 'app', 'course-features.js'), 'utf8'));
        }
        if (req.method === 'GET' && u.pathname === '/__lib') {
          let t;
          try { t = new URL(u.searchParams.get('u') || ''); } catch (e) { res.writeHead(400); return res.end(); }
          if (!libAllowed(t)) { res.writeHead(403); return res.end(); }
          if (!isCached(t.href) && !(await fetchToCache(t.href))) { res.writeHead(504); return res.end(); }
          const f = path.join(cacheDir(), sha1(t.href));
          res.writeHead(200, {
            'content-type': fs.readFileSync(f + '.m', 'utf8'),
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=31536000'
          });
          return fs.createReadStream(f).pipe(res);
        }
        if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
        res.writeHead(404);
        return res.end();
      } catch (e) {
        res.writeHead(500);
        return res.end();
      }
    });
    srv.once('error', () => {
      // المنفذ المفضّل مشغول: نستخدم منفذًا عشوائيًا
      srv.listen(0, () => { PORT = srv.address().port; resolve(); });
    });
    srv.listen(CFG.preferredPort || 47831, () => { PORT = srv.address().port; resolve(); });
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

const trusted = (e) => {
  try {
    return e.senderFrame.url.startsWith('http://localhost:' + PORT + '/') ||
           e.senderFrame.url.startsWith('http://127.0.0.1:' + PORT + '/');
  } catch (x) { return false; }
};

ipcMain.on('dw:dialog', (e, o) => {
  if (!trusted(e) || !o || typeof o !== 'object') { e.returnValue = null; return; }
  const k = ['alert', 'confirm', 'prompt'].includes(o.k) ? o.k : 'alert';
  brandDialog({ k, m: String(o.m || '').slice(0, 3000), d: String(o.d || '').slice(0, 1000), l: o.l === 'en' ? 'en' : 'ar', rtl: o.rtl !== false })
    .then((v) => { e.returnValue = v === undefined ? null : v; })
    .catch(() => { e.returnValue = null; });
});

ipcMain.on('dw:msg', async (e, raw) => {
  if (!trusted(e) || typeof raw !== 'string' || raw.length > 60 * 1024 * 1024) return;
  const r = await bridge.handle(raw);
  if (r && !e.sender.isDestroyed()) e.sender.send('dw:reply', JSON.stringify(r));
});

// ------------------------------------------------------------------ النافذة والأيقونة
const iconPath = (name) => path.join(__dirname, 'assets', 'icons', (name || 'Default') + '.png');
const appIcon = () => nativeImage.createFromPath(iconPath(bridge ? bridge.state().icon : 'Default'));

function protectWindow(bw) {
  if (!bw || bw.isDestroyed()) return;
  try { bw.setContentProtection(true); } catch (e) { /* تجاهل */ }
}

function triggerShotShield(bw) {
  try { clipboard.writeText(''); } catch (e) { /* تجاهل */ }
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

function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  applyProtection();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 820, minWidth: 360, minHeight: 560,
    title: APP_NAME, icon: appIcon(), backgroundColor: '#B22127', autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      spellcheck: false, autoplayPolicy: 'no-user-gesture-required', devTools: !app.isPackaged
    }
  });
  applyProtection(); // يمنع لقطة الشاشة وتسجيلها (ويندوز وماك)
  win.once('ready-to-show', () => { applyProtection(); win.show(); });
  win.on('show', applyProtection);
  win.on('restore', applyProtection);
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
    if (win && !win.isDestroyed() && !win.isVisible()) {
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
  win.loadURL(origin + '/');
}

function createTray() {
  try {
    const img = appIcon().resize({ width: 20, height: 20 });
    tray = new Tray(img);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'فتح / Open', click: showWin },
      { label: 'التحقق من التحديثات / Check for updates', click: () => checkUpdates(true) },
      { type: 'separator' },
      { label: 'خروج / Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWin);
  } catch (e) { /* بعض بيئات لينكس بلا Tray */ }
}

// ------------------------------------------------------------------ التحديثات (ويندوز ولينكس AppImage)
function checkUpdates(manual) {
  if (!app.isPackaged) return;
  if (process.platform === 'darwin') {
    if (manual) shell.openExternal('https://github.com/khaledahmed34567/DrWael-Desktop/releases/latest');
    return;
  }
  try {
    if (!autoUpdater) {
      ({ autoUpdater } = require('electron-updater'));
      autoUpdater.autoDownload = true;
      autoUpdater.on('update-downloaded', (info) => {
        brandDialog({
          k: 'confirm', l: 'ar', rtl: true,
          m: 'تحديث جديد (الإصدار ' + info.version + ') جاهز. هل تريد إعادة التشغيل الآن لتثبيته؟',
          okText: 'إعادة التشغيل', cancelText: 'لاحقًا'
        }).then((yes) => { if (yes) { quitting = true; autoUpdater.quitAndInstall(); } });
      });
      autoUpdater.on('error', () => { /* تجاهل أخطاء الشبكة */ });
    }
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) { /* تجاهل */ }
}

// ------------------------------------------------------------------ التشغيل
app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; unregisterShotShortcuts(); });
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

  fetchSession = session.fromPartition('libfetch');
  const ses = session.defaultSession;
  const okPerms = ['notifications', 'fullscreen', 'clipboard-sanitized-write', 'media'];
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm !== 'media' && okPerms.includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => perm !== 'media' && okPerms.includes(perm));
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
      if (!Notification.isSupported()) return;
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
    touchId: async (why) => {
      if (process.platform === 'darwin' && systemPreferences.canPromptTouchID()) {
        try { await systemPreferences.promptTouchID(why); return true; } catch (e) { return false; }
      }
      return true; // على ويندوز/لينكس تحمي الصفحة نفسها برمز PIN
    },
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

  createWindow();
  createTray();
  setInterval(() => bridge.tick(), 20000);
  setTimeout(() => { prefetchLibs(); checkUpdates(false); }, 4000);
});
