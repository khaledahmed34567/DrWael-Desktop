'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = require('../package.json');
test('Desktop branding resources are present for installer, uninstaller and runtime', () => {
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.equal(pkg.build.nsis.installerIcon, 'build/icon.ico');
  assert.equal(pkg.build.nsis.uninstallerIcon, 'build/icon.ico');
  for (const f of [pkg.build.win.icon, pkg.build.mac.icon, pkg.build.linux.icon, ...['installerIcon','uninstallerIcon','installerSidebar','uninstallerSidebar','installerHeader','include'].map(k => pkg.build.nsis[k])]) {
    assert.ok(fs.statSync(path.join(root, f)).size > 0, f);
  }
  const ico = fs.readFileSync(path.join(root, pkg.build.win.icon));
  assert.equal(ico.readUInt32LE(0), 65536);
  assert.equal(ico.readUInt16LE(4), 7);
  const sizes = Array.from({length: 7}, (_, i) => ico[6 + i * 16] || 256);
  assert.deepEqual(sizes, [16,24,32,48,64,128,256]);
  assert.deepEqual(fs.readFileSync(path.join(root,'assets/icons/Default.png')), fs.readFileSync(path.join(root,'build/icon.png')));
});
