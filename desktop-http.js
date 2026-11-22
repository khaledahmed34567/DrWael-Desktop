'use strict';
const fs = require('fs');
const path = require('path');
const { validHost } = require('./desktop-security');
const isLoopback = addr => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
function createDesktopHandler({ rootDir, getPort, pageHtml, libAllowed, isCached, fetchToCache, cacheDir, sha1, iconPath }) {
  return async (req, res) => {
      try {
        res.setHeader('x-content-type-options', 'nosniff');
        res.setHeader('x-frame-options', 'DENY');
        res.setHeader('content-security-policy', "frame-ancestors 'none'");
        if (!validHost(req.headers.host, getPort())) { res.writeHead(403); return res.end(); }
        if (!isLoopback(req.socket.remoteAddress)) {
          res.writeHead(403);
          return res.end();
        }
        const u = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          return res.end(pageHtml());
        }
        const scripts = ['course-alerts.js', 'course-features.js', 'student-badges.js', 'progress-chart.js', 'student-pro.js'];
        if (req.method === 'GET' && scripts.some(name => u.pathname === '/' + name)) {
          res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(fs.readFileSync(path.join(rootDir, 'app', u.pathname.slice(1)), 'utf8'));
        }
        if (req.method === 'GET' && u.pathname === '/d3.min.js') {
          const d3p = path.join(rootDir, 'node_modules', 'd3', 'dist', 'd3.min.js');
          if (fs.existsSync(d3p)) {
            res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
            return res.end(fs.readFileSync(d3p, 'utf8'));
          }
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
        if (req.method === 'GET' && u.pathname.startsWith('/assets/')) {
          const assetsRoot = path.join(rootDir, 'assets');
          const relPath = decodeURIComponent(u.pathname.slice('/assets/'.length));
          const resolved = path.resolve(assetsRoot, relPath);
          if ((resolved === assetsRoot || resolved.startsWith(assetsRoot + path.sep)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            const ext = path.extname(resolved).toLowerCase();
            const ct = ext === '.png' ? 'image/png' : ext === '.ttf' ? 'font/ttf' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
            res.writeHead(200, { 'content-type': ct, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
            return res.end(fs.readFileSync(resolved));
          }
        }
        if (u.pathname === '/favicon.ico') {
          const fav = [path.join(rootDir, 'build', 'icon.png'), iconPath('Default')].find((p) => fs.existsSync(p));
          if (fav) {
            res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
            return res.end(fs.readFileSync(fav));
          }
          res.writeHead(204);
          return res.end();
        }
        res.writeHead(404);
        return res.end();
      } catch (e) {
        res.writeHead(500);
        return res.end();
      }
  };
}
module.exports = { createDesktopHandler };
