'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareStore } = require('../scripts/prepare-store');
const pkg = require('../package.json');
test('Store build rejects unknown, missing and permissive offline policies', () => {
  for (const policy of [null, {}, {errorPolicy:'pending-owner-decision'}, {errorPolicy:'allow-offline'}]) {
    assert.throws(() => prepareStore(pkg, 3, policy), /policy/);
  }
  for (const version of [undefined, 0, -1, '3.5', 'junk']) assert.throws(() => prepareStore(pkg, version, {errorPolicy:'block'}), /number/);
});
test('Store preparation preserves identity and white tiles and embeds exact helper and strict policy', () => {
  const before = JSON.stringify(pkg);
  const result = prepareStore(pkg, 3, {errorPolicy:'block'});
  assert.equal(JSON.stringify(pkg), before);
  assert.equal(result.version, '1.1.3');
  assert.equal(result.build.appx.identityName, 'sarmad.eg.Dr.waelDesktop');
  assert.equal(result.build.appx.publisher, 'CN=CDF97DF2-E0EE-4A3C-A2C7-45354751C35D');
  assert.equal(result.build.appx.applicationId, 'App');
  assert.equal(result.build.appx.backgroundColor, '#FFFFFF');
  assert.equal(result.build.appx.minVersion, '10.0.14393.0');
  assert.equal(result.devDependencies.electron, '45.4.1');
  assert.equal(result.devDependencies['electron-builder'], '26.18.0');
  assert.equal(result.build.publish, null);
  assert.equal(result.dependencies['electron-updater'], undefined);
  assert.ok(result.build.extraResources.some(x => x.to === 'native/store-update-check.exe'));
  assert.ok(result.build.extraResources.some(x => x.to === 'store-gate.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../build/store-gate.json'),'utf8')).errorPolicy, 'block');
});
test('Store runtime and desktop source archive include all required gate files', () => {
  const files = require('../scripts/build-desktop-zip').buildDesktopZip().files;
  for (const name of ['store-update.js','store-startup.js','store-gate.html','store-gate.css','store-gate-preload.js','store-gate-renderer.js']) {
    assert.ok(pkg.build.files.includes(name), name + ' packaged');
    assert.ok(files.includes(name), name + ' source archive');
  }
  for (const name of ['native/store-update-check.cpp','scripts/build-store-helper.ps1','scripts/prepare-store.js','build/store-gate.json','.github/workflows/store-build.yml']) assert.ok(files.includes(name), name);
});
