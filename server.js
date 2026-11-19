'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.disable('x-powered-by');

app.use((req, res, next) => {
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

app.listen(PORT, HOST, () => {
  console.log(`Dr. Wael server listening on http://${HOST}:${PORT}`);
});
