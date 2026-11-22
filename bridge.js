'use strict';
/**
 * منطق الجسر (DWNative) لتطبيق سطح المكتب — منفصل عن Electron ليسهل اختباره.
 * كل رسالة من الصفحة: {a: الإجراء, id: رقم, ...بيانات} والرد: {id, ok, ...}
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ICONS = ['Default', 'Red', 'Black', 'Salmon', 'Dark', 'Glow', 'Spray', 'Navy'];

module.exports = function createBridge(d) {
  const st = { reminders: {}, daily: null, lastDaily: '', lastNotifAt: 0, icon: 'Default' };
  try { Object.assign(st, JSON.parse(fs.readFileSync(d.statePath, 'utf8'))); } catch (e) { /* أول تشغيل */ }

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(d.statePath), { recursive: true });
      fs.writeFileSync(d.statePath, JSON.stringify(st));
    } catch (e) { /* تجاهل */ }
  };
  const normAt = (v) => (v > 0 && v < 1e11 ? v * 1000 : v);

  function loginPage(state) {
    const cfg = JSON.stringify({ apiKey: d.cfg.apiKey, authDomain: d.cfg.authDomain });
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dr. Wael</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#B22127,#3a0a0e);color:#fff;font-family:system-ui,Segoe UI,Tahoma,sans-serif}
.c{background:#fff;color:#101426;border-radius:26px;padding:30px 26px;width:min(420px,90vw);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h2{margin:0 0 6px}p{color:#4a4f68;margin:0 0 18px}button{width:100%;padding:14px;border:0;border-radius:14px;background:#B22127;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
#m{margin-top:14px;min-height:22px;font-size:14px}</style></head>
<body><div class="c"><h2 id="h"></h2><p id="p"></p><button id="b"></button><div id="m"></div></div>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>
const ar=(navigator.language||'').startsWith('ar');const $=id=>document.getElementById(id);
$('h').textContent=ar?'د. وائل':'Dr. Wael';$('p').textContent=ar?'سجّل دخولك بحساب جوجل ثم ارجع إلى التطبيق.':'Sign in with Google, then return to the app.';
$('b').textContent=ar?'المتابعة مع Google':'Continue with Google';
firebase.initializeApp(${cfg});
const S=${JSON.stringify(state)};
$('b').onclick=async()=>{try{
  await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
  const r=await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
  const t=r.credential&&r.credential.idToken;if(!t)throw new Error('no_token');
  await fetch('/done?s='+S,{method:'POST',body:JSON.stringify({idToken:t})});
  try{await firebase.auth().signOut()}catch(e){}
  $('m').textContent=ar?'تم تسجيل الدخول. يمكنك إغلاق هذه الصفحة والرجوع للتطبيق.':'Signed in. You can close this page and go back to the app.';
}catch(e){const c=String(e.code||e.message||'error');$('m').textContent=(ar?'تعذر تسجيل الدخول: ':'Sign-in failed: ')+c;
  fetch('/fail?s='+S,{method:'POST',body:c}).catch(()=>{})}};
</script></body></html>`;
  }

  /** تسجيل جوجل عبر المتصفح الافتراضي (جوجل تمنع تسجيل الدخول داخل نوافذ التطبيقات المدمجة) */
  function google() {
    return new Promise((resolve) => {
      const state = crypto.randomBytes(16).toString('hex');
      let srv = null;
      let done = false;
      let timer = null;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { srv.close(); } catch (e) { /* تجاهل */ }
        resolve(r);
      };
      srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://localhost');
        if (u.searchParams.get('s') !== state) { res.writeHead(403); return res.end('forbidden'); }
        if (req.method === 'GET' && u.pathname === '/login') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(loginPage(state));
        }
        if (req.method === 'POST' && (u.pathname === '/done' || u.pathname === '/fail')) {
          let b = '';
          req.on('data', (c) => { b += c; if (b.length > 20000) req.destroy(); });
          req.on('end', () => {
            res.writeHead(200); res.end('ok');
            if (u.pathname === '/fail') return finish({ ok: false, err: b.slice(0, 80) });
            try {
              const j = JSON.parse(b);
              finish(j.idToken ? { ok: true, token: String(j.idToken) } : { ok: false, err: 'no_token' });
            } catch (e) { finish({ ok: false, err: 'bad_response' }); }
          });
          return undefined;
        }
        res.writeHead(404); return res.end();
      });
      srv.on('error', () => finish({ ok: false, err: 'server' }));
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        d.openExternal('http://localhost:' + port + '/login?s=' + state);
      });
      timer = setTimeout(() => finish({ ok: false, err: 'timeout' }), 180000);
    });
  }

  async function handle(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const id = m.id || 0;
    const ok = (extra) => Object.assign({ id, ok: true }, extra || {});
    const no = (err) => ({ id, ok: false, err: err || 'failed' });
    try {
      switch (m.a) {
        case 'ver': return ok({ v: d.version });
        case 'auth': return d.touchId ? { id, ok: !!(await d.touchId(String(m.why || 'auth'))) } : ok();
        case 'google': {
          const r = await google();
          return Object.assign({ id }, r);
        }
        case 'session': return ok();
        case 'logout': return ok();
        case 'prefs': return ok();
        case 'update': if (d.checkUpdate) d.checkUpdate(); return ok();
        case 'save': {
          const buf = Buffer.from(String(m.b64 || ''), 'base64');
          const saved = await d.saveFile(String(m.name || 'file').replace(/[\\/:*?"<>|]/g, '_'), String(m.mime || ''), buf);
          return { id, ok: !!saved };
        }
        case 'notify': {
          const at = normAt(Number(m.at) || 0);
          if (at === 0) { d.notify(String(m.t || ''), String(m.b || '')); } else if (at > st.lastNotifAt) {
            d.notify(String(m.t || ''), String(m.b || ''));
            st.lastNotifAt = at; save();
          }
          return ok();
        }
        case 'remind': {
          const rid = String(m.rid || '');
          if (!rid) return no('rid');
          st.reminders[rid] = { t: String(m.title || ''), b: String(m.body || ''), at: Number(m.at) || 0 };
          save();
          return ok();
        }
        case 'unremind': delete st.reminders[String(m.rid || '')]; save(); return ok();
        case 'daily':
          st.daily = { on: !!m.on, h: Number(m.h) || 0, m: Number(m.m) || 0, t: String(m.title || ''), b: String(m.body || '') };
          save();
          return ok();
        case 'icon': {
          const name = String(m.name || '');
          if (!ICONS.includes(name)) return no('icon');
          const r = d.setIcon ? d.setIcon(name) : true;
          if (r) { st.icon = name; save(); }
          return { id, ok: !!r };
        }
        default: return no('unknown');
      }
    } catch (e) {
      return no('error');
    }
  }

  /** يُستدعى كل ~20 ثانية: ينبّه بالتذكيرات المستحقة والتذكير اليومي */
  function tick() {
    const now = d.now();
    let ch = false;
    for (const rid of Object.keys(st.reminders)) {
      const r = st.reminders[rid];
      if (r.at > 0 && r.at <= now) {
        if (now - r.at < 24 * 3600 * 1000) d.notify(r.t, r.b);
        delete st.reminders[rid];
        ch = true;
      }
    }
    const dl = st.daily;
    if (dl && dl.on) {
      const n = new Date(now);
      const key = n.toDateString();
      const cur = n.getHours() * 60 + n.getMinutes();
      const at = dl.h * 60 + dl.m;
      if (st.lastDaily !== key && cur >= at && cur <= at + 120) {
        d.notify(dl.t, dl.b);
        st.lastDaily = key;
        ch = true;
      }
    }
    if (ch) save();
  }

  return { handle, tick, state: () => st };
};
