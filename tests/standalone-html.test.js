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

