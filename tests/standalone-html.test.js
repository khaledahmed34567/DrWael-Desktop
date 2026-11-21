'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { buildStandaloneHtml, INLINE_SCRIPTS } = require('../scripts/build-html');

test('buildStandaloneHtml inlines all local scripts cleanly with valid JS syntax', () => {
  const html = buildStandaloneHtml();
  assert.ok(html.startsWith('<!doctype html>'), 'Expected HTML doctype');

  for (const fileName of INLINE_SCRIPTS) {
    assert.equal(
      html.includes(`<script src="${fileName}"></script>`),
      false,
      `Expected external script tag for ${fileName} to be removed`
    );
  }

  assert.ok(html.includes('DWCourseAlerts'), 'Expected DWCourseAlerts to be inlined');
  assert.ok(html.includes('DWCourseFeatures'), 'Expected DWCourseFeatures to be inlined');
  assert.ok(html.includes('DWStudentBadges'), 'Expected DWStudentBadges to be inlined');
  assert.ok(html.includes('DWProgressChart'), 'Expected DWProgressChart to be inlined');
  assert.ok(html.includes('DWStudentPro'), 'Expected DWStudentPro to be inlined');

  const scriptSrcs = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const nonHttpsSrcs = scriptSrcs.filter((src) => !/^https:\/\//i.test(src));
  assert.deepEqual(nonHttpsSrcs, [], 'Standalone HTML must not reference local external JS files');

  let inlineScriptCount = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineScriptCount += 1;
    assert.doesNotThrow(() => new vm.Script(m[1]), `Inline script #${inlineScriptCount} should parse cleanly`);
  }
  assert.ok(inlineScriptCount >= 5, 'Expected at least 5 inline script blocks');

  assert.equal(html.includes('/download/html'), false, 'Standalone UI must not expose /download/html link');
  assert.equal(html.includes('DL_RELS'), false, 'Standalone UI must not expose DL_RELS repository links');
  assert.equal(html.includes('DESK_RELS'), false, 'Standalone UI must not expose DESK_RELS repository links');
  assert.equal(html.includes('via GitHub'), false, 'Standalone UI must not mention GitHub');
});

test('server security helpers validate owner key and strip GitHub URLs from release JSON', () => {
  const { isValidOwnerKey, sanitizeReleaseForClient, FALLBACK_TARGETS } = require('../server');

  assert.equal(isValidOwnerKey('secret-token-123456', 'secret-token-123456'), true);
  assert.equal(isValidOwnerKey('secret-token-123457', 'secret-token-123456'), false);
  assert.equal(isValidOwnerKey('', 'secret-token-123456'), false);
  assert.equal(isValidOwnerKey(undefined, 'secret-token-123456'), false);

  const sanitized = sanitizeReleaseForClient({
    kind: 'desktop',
    tagName: 'v1.2.0',
    version: '1.2.0',
    title: 'v1.2.0',
    publishedAt: '2026-04-10T00:00:00Z',
    htmlUrl: 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/tag/v1.2.0',
    notes: 'Fixes',
    force: false,
    assets: [{ name: 'DrWael-Setup.exe', url: 'https://github.com/example.exe', size: 1000, sizeLabel: '0.0 MB' }],
    picked: {
      win: { name: 'DrWael-Setup.exe', url: 'https://github.com/example.exe', size: 1000, sizeLabel: '0.0 MB' },
      mac: null,
      macZip: null,
      linuxApp: null,
      linuxDeb: null
    }
  }, 'desktop');

  assert.equal(sanitized.htmlUrl, '');
  assert.deepEqual(sanitized.assets, []);
  assert.equal(sanitized.picked.win.url, '/dl/win');
  assert.equal(Object.keys(FALLBACK_TARGETS).length, 6);
});

test('buildDesktopZip packages updated Desktop repo files, NSIS graphics/script, and icons without HTML export or owner key', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { buildDesktopZip } = require('../scripts/build-desktop-zip');

  const rootDir = path.join(__dirname, '..');
  const iconPath = path.join(rootDir, 'build', 'icon.png');
  const sideBannerPath = path.join(rootDir, 'build', 'side_banner.bmp');
  const headerLogoPath = path.join(rootDir, 'build', 'header_logo.bmp');
  const installerNshPath = path.join(rootDir, 'build', 'installer.nsh');

  assert.equal(fs.existsSync(iconPath), true, 'build/icon.png must exist for Electron desktop builds');
  assert.equal(fs.existsSync(sideBannerPath), true, 'build/side_banner.bmp must exist for NSIS installer');
  assert.equal(fs.existsSync(headerLogoPath), true, 'build/header_logo.bmp must exist for NSIS installer');
  assert.equal(fs.existsSync(installerNshPath), true, 'build/installer.nsh must exist for NSIS installer');

  const sideBuf = fs.readFileSync(sideBannerPath);
  assert.equal(sideBuf.toString('ascii', 0, 2), 'BM', 'side_banner.bmp must have BMP signature');
  assert.equal(sideBuf.readUInt32LE(10), 54, 'side_banner.bmp must use classic 40-byte BITMAPINFOHEADER (offset 54)');
  assert.equal(sideBuf.readInt32LE(18), 164, 'side_banner.bmp width must be 164px');
  assert.equal(sideBuf.readInt32LE(22), 314, 'side_banner.bmp height must be 314px');
  assert.equal(sideBuf.readUInt16LE(28), 24, 'side_banner.bmp must be 24-bit RGB');

  const headerBuf = fs.readFileSync(headerLogoPath);
  assert.equal(headerBuf.toString('ascii', 0, 2), 'BM', 'header_logo.bmp must have BMP signature');
  assert.equal(headerBuf.readUInt32LE(10), 54, 'header_logo.bmp must use classic 40-byte BITMAPINFOHEADER (offset 54)');
  assert.equal(headerBuf.readInt32LE(18), 150, 'header_logo.bmp width must be 150px');
  assert.equal(headerBuf.readInt32LE(22), 57, 'header_logo.bmp height must be 57px');
  assert.equal(headerBuf.readUInt16LE(28), 24, 'header_logo.bmp must be 24-bit RGB');

  const nshText = fs.readFileSync(installerNshPath, 'utf8');
  for (const macro of [
    'MUI_WELCOMEFINISHPAGE_BITMAP',
    'MUI_UNWELCOMEFINISHPAGE_BITMAP',
    'MUI_HEADERIMAGE',
    'MUI_HEADERIMAGE_BITMAP',
    'MUI_HEADERIMAGE_RIGHT'
  ]) {
    assert.ok(nshText.includes(macro), `Expected ${macro} in build/installer.nsh`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(pkg.build.nsis.installerSidebar, 'build/side_banner.bmp');
  assert.equal(pkg.build.nsis.uninstallerSidebar, 'build/side_banner.bmp');
  assert.equal(pkg.build.nsis.installerHeader, 'build/header_logo.bmp');
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');

  const { buffer, files } = buildDesktopZip();
  assert.ok(buffer.length > 100000, 'Expected non-empty desktop zip archive');
  assert.equal(buffer.readUInt32LE(0), 0x04034b50, 'Expected valid PKZIP signature');

  for (const reqFile of [
    'package.json',
    'main.js',
    'preload.js',
    'bridge.js',
    'dialog.html',
    'dialog-preload.js',
    'config.json',
    '.github/workflows/build.yml',
    'build/icon.png',
    'build/side_banner.bmp',
    'build/header_logo.bmp',
    'build/installer.nsh',
    'assets/icons/Default.png',
    'app/index.html',
    'app/course-alerts.js',
    'app/course-features.js',
    'app/student-badges.js',
    'app/progress-chart.js',
    'app/student-pro.js'
  ]) {
    assert.ok(files.includes(reqFile), `Expected ${reqFile} in desktop zip`);
  }

  for (const forbidden of ['DrWael.html', '.html-export.key', 'server.js', 'DrWael-Desktop-Project.zip']) {
    assert.equal(files.includes(forbidden), false, `Must exclude ${forbidden} from desktop repo zip`);
  }

  const indexHtml = fs.readFileSync(path.join(rootDir, 'app', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('.wrap{width:100%;max-width:none;margin:0;'), 'Expected full-width .wrap rule in app/index.html');
  assert.ok(indexHtml.includes('.dlb{width:100%;max-width:none;margin:0;'), 'Expected full-width .dlb rule in app/index.html');
  assert.equal(indexHtml.includes('/download/desktop-zip'), false, 'Student UI must never expose /download/desktop-zip');
});


