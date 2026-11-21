'use strict';
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const { buildStandaloneHtml } = require('./scripts/build-html');
const { buildDesktopZip } = require('./scripts/build-desktop-zip');
const { normalizeReleaseInfo } = require('./app/progress-chart');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FORCE_COOLDOWN_MS = 15 * 1000;

const REPO_ANDROID = 'khaledahmed34567/DrWael-Androidapp';
const REPO_DESKTOP = 'khaledahmed34567/DrWael-Desktop';

const FALLBACK_TARGETS = Object.freeze({
  android: {
    kind: 'android',
    pickKey: 'apk',
    filename: 'DrWael.apk',
    mime: 'application/vnd.android.package-archive',
    url: `https://github.com/${REPO_ANDROID}/releases/latest/download/DrWael.apk`
  },
  win: {
    kind: 'desktop',
    pickKey: 'win',
    filename: 'DrWael-Setup.exe',
    mime: 'application/octet-stream',
    url: `https://github.com/${REPO_DESKTOP}/releases/latest/download/DrWael-Setup.exe`
  },
  mac: {
    kind: 'desktop',
    pickKey: 'mac',
    filename: 'DrWael-mac.dmg',
    mime: 'application/octet-stream',
    url: `https://github.com/${REPO_DESKTOP}/releases/latest/download/DrWael-mac.dmg`
  },
  'mac-zip': {
    kind: 'desktop',
    pickKey: 'macZip',
    filename: 'DrWael-mac.zip',
    mime: 'application/zip',
    url: `https://github.com/${REPO_DESKTOP}/releases/latest/download/DrWael-mac.zip`
  },
  linux: {
    kind: 'desktop',
    pickKey: 'linuxApp',
    filename: 'DrWael-linux.AppImage',
    mime: 'application/octet-stream',
    url: `https://github.com/${REPO_DESKTOP}/releases/latest/download/DrWael-linux.AppImage`
  },
  'linux-deb': {
    kind: 'desktop',
    pickKey: 'linuxDeb',
    filename: 'DrWael-linux.deb',
    mime: 'application/vnd.debian.binary-package',
    url: `https://github.com/${REPO_DESKTOP}/releases/latest/download/DrWael-linux.deb`
  }
});

function loadOrCreateOwnerHtmlKey() {
  const envKey = String(process.env.HTML_DOWNLOAD_KEY || '').trim();
  if (envKey.length >= 16) return envKey;

  const keyFile = path.join(__dirname, '.html-export.key');
  try {
    if (fs.existsSync(keyFile)) {
      const stored = fs.readFileSync(keyFile, 'utf8').trim();
      if (stored.length >= 16) return stored;
    }
  } catch (_) {}

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFile, generated + '\n', { mode: 0o600, encoding: 'utf8' });
  } catch (err) {
    console.warn('Could not persist .html-export.key:', err.message);
  }
  return generated;
}

function isValidOwnerKey(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const OWNER_HTML_KEY = loadOrCreateOwnerHtmlKey();

function fetchJsonHttps(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (err) {
      reject(err);
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('Only HTTPS upstream requests are allowed'));
      return;
    }
    const req = https.get(parsed, {
      headers: {
        'User-Agent': 'DrWael-Platform-Server/1.0',
        Accept: 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, parsed).toString();
        fetchJsonHttps(nextUrl, timeoutMs).then(resolve, reject);
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Upstream HTTP ${res.statusCode || 0}`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > 2 * 1024 * 1024) {
          req.destroy(new Error('Release metadata too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Upstream timeout')));
    req.on('error', reject);
  });
}

let releaseCache = {
  at: 0,
  lastForceAt: 0,
  androidRaw: null,
  desktopRaw: null,
  inflight: null
};

async function fetchRepoRelease(repo, kind) {
  try {
    const raw = await fetchJsonHttps(`https://api.github.com/repos/${repo}/releases/latest`);
    return normalizeReleaseInfo(raw, kind);
  } catch (_) {
    return null;
  }
}

async function getReleases(force) {
  const now = Date.now();
  const hasAny = Boolean(releaseCache.androidRaw || releaseCache.desktopRaw);
  const fresh = hasAny && (now - releaseCache.at < RELEASE_CACHE_TTL_MS);
  const canForce = now - releaseCache.lastForceAt >= FORCE_COOLDOWN_MS;

  if (!force && fresh) {
    return { android: releaseCache.androidRaw, desktop: releaseCache.desktopRaw };
  }
  if (force && !canForce && hasAny) {
    return { android: releaseCache.androidRaw, desktop: releaseCache.desktopRaw };
  }
  if (releaseCache.inflight) {
    return releaseCache.inflight;
  }

  if (force) releaseCache.lastForceAt = now;
  releaseCache.inflight = Promise.all([
    fetchRepoRelease(REPO_ANDROID, 'android'),
    fetchRepoRelease(REPO_DESKTOP, 'desktop')
  ]).then(([android, desktop]) => {
    if (android) releaseCache.androidRaw = android;
    if (desktop) releaseCache.desktopRaw = desktop;
    if (android || desktop) releaseCache.at = Date.now();
    releaseCache.inflight = null;
    return { android: releaseCache.androidRaw, desktop: releaseCache.desktopRaw };
  }, (err) => {
    releaseCache.inflight = null;
    throw err;
  });

  return releaseCache.inflight;
}

function sanitizeReleaseForClient(rel, kind) {
  if (!rel) return null;
  const pickMap = kind === 'android'
    ? { apk: '/dl/android' }
    : {
        win: '/dl/win',
        mac: '/dl/mac',
        macZip: '/dl/mac-zip',
        linuxApp: '/dl/linux',
        linuxDeb: '/dl/linux-deb'
      };
  const picked = {};
  for (const [k, proxyPath] of Object.entries(pickMap)) {
    const src = rel.picked && rel.picked[k];
    if (src) {
      picked[k] = {
        name: src.name,
        url: proxyPath,
        size: src.size,
        sizeLabel: src.sizeLabel
      };
    } else {
      picked[k] = null;
    }
  }
  return {
    kind: rel.kind,
    tagName: rel.tagName,
    version: rel.version,
    title: rel.title,
    publishedAt: rel.publishedAt,
    htmlUrl: '',
    notes: rel.notes,
    force: !!rel.force,
    assets: [],
    picked
  };
}

function safeDownloadFilename(name, fallback) {
  const clean = path.basename(String(name || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean || fallback;
}

function streamHttpsAsset(assetUrl, fallbackName, fallbackMime, clientReq, clientRes, redirectsLeft = 6) {
  let parsed;
  try {
    parsed = new URL(assetUrl);
  } catch (_) {
    if (!clientRes.headersSent) clientRes.status(502).type('text/plain').send('Invalid asset source');
    return;
  }
  if (parsed.protocol !== 'https:') {
    if (!clientRes.headersSent) clientRes.status(502).type('text/plain').send('Insecure asset source');
    return;
  }

  let closed = false;
  const upstream = https.get(parsed, {
    headers: {
      'User-Agent': 'DrWael-Platform-Server/1.0',
      Accept: 'application/octet-stream'
    }
  }, (upRes) => {
    const status = upRes.statusCode || 0;
    if (status >= 300 && status < 400 && upRes.headers.location) {
      upRes.resume();
      if (redirectsLeft <= 0) {
        if (!clientRes.headersSent) clientRes.status(502).type('text/plain').send('Too many upstream redirects');
        return;
      }
      const nextUrl = new URL(upRes.headers.location, parsed).toString();
      streamHttpsAsset(nextUrl, fallbackName, fallbackMime, clientReq, clientRes, redirectsLeft - 1);
      return;
    }

    if (status < 200 || status >= 300) {
      upRes.resume();
      if (!clientRes.headersSent) {
        clientRes.status(status === 404 ? 404 : 502).type('text/plain').send('Installer currently unavailable');
      }
      return;
    }

    const filename = safeDownloadFilename(fallbackName, 'DrWael-installer');
    clientRes.setHeader('Cache-Control', 'no-store');
    clientRes.setHeader('X-Download-Options', 'noopen');
    clientRes.setHeader('Content-Type', fallbackMime || upRes.headers['content-type'] || 'application/octet-stream');
    clientRes.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (upRes.headers['content-length']) {
      clientRes.setHeader('Content-Length', upRes.headers['content-length']);
    }

    upRes.pipe(clientRes);
    upRes.on('error', () => {
      if (!closed) clientRes.destroy();
    });
  });

  upstream.setTimeout(30000, () => {
    upstream.destroy(new Error('Asset download timeout'));
  });
  upstream.on('error', () => {
    if (!clientRes.headersSent) {
      clientRes.status(502).type('text/plain').send('Failed to download installer');
    } else if (!closed) {
      clientRes.destroy();
    }
  });
  clientReq.on('close', () => {
    closed = true;
    if (!upstream.destroyed) upstream.destroy();
  });
}

app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  maxAge: '1d'
}));

app.get(['/', '/index.html'], (_req, res) => {
  const htmlPath = path.join(__dirname, 'app', 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, html) => {
    if (err) {
      res.status(500).type('text/plain').send('Failed to load app/index.html');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/html; charset=utf-8').send(html);
  });
});

app.get('/course-alerts.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'app', 'course-alerts.js'));
});

app.get('/course-features.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'app', 'course-features.js'));
});

app.get('/student-badges.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'app', 'student-badges.js'));
});

app.get('/progress-chart.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'app', 'progress-chart.js'));
});

app.get('/student-pro.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'app', 'student-pro.js'));
});

app.get('/api/releases', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const force = req.query && req.query.force === '1';
  try {
    const { android, desktop } = await getReleases(force);
    res.json({
      ok: true,
      android: sanitizeReleaseForClient(android, 'android'),
      desktop: sanitizeReleaseForClient(desktop, 'desktop')
    });
  } catch (_) {
    res.json({ ok: true, android: null, desktop: null });
  }
});

app.get('/dl/:target', async (req, res) => {
  const spec = FALLBACK_TARGETS[String(req.params.target || '').toLowerCase()];
  if (!spec) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  let assetUrl = spec.url;
  let filename = spec.filename;
  try {
    const rels = await getReleases(false);
    const rel = spec.kind === 'android' ? rels.android : rels.desktop;
    const picked = rel && rel.picked && rel.picked[spec.pickKey];
    if (picked && picked.url && /^https:\/\//i.test(picked.url)) {
      assetUrl = picked.url;
      if (picked.name) filename = picked.name;
    }
  } catch (_) {}

  streamHttpsAsset(assetUrl, filename, spec.mime, req, res);
});

app.get('/download/html', (req, res) => {
  const provided = req.query && typeof req.query.key === 'string' ? req.query.key : '';
  if (!isValidOwnerKey(provided, OWNER_HTML_KEY)) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }

  let buf;
  try {
    buf = Buffer.from(buildStandaloneHtml(), 'utf8');
  } catch (_) {
    const standalonePath = path.join(__dirname, 'DrWael.html');
    if (!fs.existsSync(standalonePath)) {
      res.status(500).type('text/plain').send('Export unavailable');
      return;
    }
    buf = fs.readFileSync(standalonePath);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="DrWael.html"');
  res.setHeader('X-Download-Options', 'noopen');
  res.send(buf);
});

app.get('/download/desktop-zip', (req, res) => {
  const provided = req.query && typeof req.query.key === 'string' ? req.query.key : '';
  if (!isValidOwnerKey(provided, OWNER_HTML_KEY)) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }

  let buf;
  try {
    buf = buildDesktopZip().buffer;
  } catch (_) {
    const zipPath = path.join(__dirname, 'DrWael-Desktop-Project.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(500).type('text/plain').send('Desktop package unavailable');
      return;
    }
    buf = fs.readFileSync(zipPath);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="DrWael-Desktop-Project.zip"');
  res.setHeader('X-Download-Options', 'noopen');
  res.send(buf);
});

app.get('/favicon.ico', (_req, res) => {
  const icon = path.join(__dirname, 'build', 'icon.png');
  if (fs.existsSync(icon)) {
    res.sendFile(icon);
  } else {
    res.status(204).end();
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((_req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Dr. Wael server listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  app,
  FALLBACK_TARGETS,
  isValidOwnerKey,
  sanitizeReleaseForClient
};
