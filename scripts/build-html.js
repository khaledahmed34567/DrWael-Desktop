'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');

const INLINE_SCRIPTS = [
  'course-alerts.js',
  'course-features.js',
  'student-badges.js',
  'progress-chart.js',
  'student-pro.js'
];

function safeInlineScript(code) {
  return String(code).replace(/<\/script/gi, '<\\/script');
}

function buildStandaloneHtml(options) {
  const appDir = (options && options.appDir) || APP_DIR;
  const htmlPath = path.join(appDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('Missing app/index.html');
  }
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html.replace(/<script>if\(!window\.d3\)\{document\.write\('<scr'\+'ipt src="d3\.min\.js"><\/scr'\+'ipt>'\)\}<\/script>\r?\n?/i, '');

  for (const fileName of INLINE_SCRIPTS) {
    const tag = `<script src="${fileName}"></script>`;
    if (!html.includes(tag)) {
      throw new Error(`Expected script tag not found in app/index.html: ${tag}`);
    }
    const jsPath = path.join(appDir, fileName);
    if (!fs.existsSync(jsPath)) {
      throw new Error(`Missing helper script: ${jsPath}`);
    }
    const jsCode = fs.readFileSync(jsPath, 'utf8').trim();
    const inlined = `<script>\n${safeInlineScript(jsCode)}\n</script>`;
    html = html.replace(tag, () => inlined);
  }

  return html;
}

if (require.main === module) {
  const outputPath = path.join(ROOT, 'DrWael.html');
  const html = buildStandaloneHtml();
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Built ${path.basename(outputPath)} (${Buffer.byteLength(html, 'utf8')} bytes)`);
}

module.exports = {
  buildStandaloneHtml,
  INLINE_SCRIPTS
};
