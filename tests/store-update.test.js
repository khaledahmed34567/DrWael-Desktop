'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StoreGate, FAMILY, normalizeVersion, parseStoreResult, queryStore } = require('../store-update');
const VERSION = '1.2.3.0';
const payload = status => JSON.stringify({ protocol: 1, status, packageFamily: FAMILY, packageVersion: VERSION });
function gate(options = {}) {
  return new StoreGate({ installedVersion: '1.2.3', query: async () => ({ status: 'current' }),
    readLatch: () => null, writeLatch: () => {}, errorPolicy: 'block', ...options });
}
test('version normalization has four numeric components', () => {
  assert.equal(normalizeVersion('1.2.3'), VERSION);
  assert.equal(normalizeVersion(VERSION), VERSION);
  for (const input of ['1.2', 'junk', '', undefined, '1.2.3.beta']) assert.equal(normalizeVersion(input), null);
});
test('native success requires protocol, exact family and installed package version', () => {
  for (const status of ['current', 'update_available']) assert.equal(parseStoreResult(payload(status), '1.2.3').status, status);
  for (const text of ['', 'null', '{}', '{"protocol":2}', JSON.stringify({ protocol: 1, status: 'current', packageFamily: 'other', packageVersion: VERSION }), payload('unexpected'), payload('current').replace(VERSION, '1.0.0.0')]) {
    assert.equal(parseStoreResult(text, '1.2.3').status, 'error');
  }
});
test('native operational errors never become current', () => {
  for (const code of ['no_package_identity', 'wrong_package_identity', 'store_query_failed']) {
    assert.equal(parseStoreResult(JSON.stringify({ protocol: 1, status: 'error', code }), '1.2.3').status, 'error');
  }
});
test('helper launch failure and timeout are errors, not no-update results', async () => {
  const failed = await queryStore('helper.exe', '1.2.3', (_file, _args, opts, cb) => {
    assert.equal(opts.windowsHide, true); assert.equal(opts.timeout, 25000);
    cb(Object.assign(new Error('timed out'), { killed: true }));
  });
  assert.deepEqual(failed, { status: 'error', code: 'timeout' });
  const current = await queryStore('helper.exe', '1.2.3', (_file, args, _opts, cb) => { assert.deepEqual(args, []); cb(null, payload('current')); });
  assert.equal(current.status, 'current');
});
test('checking stays locked until the native result resolves', async () => {
  let respond; const g = gate({ query: () => new Promise(resolve => { respond = resolve; }) });
  const pending = g.check(); await Promise.resolve();
  assert.equal(g.state.allowed, false); assert.equal(g.state.status, 'checking');
  respond({ status: 'current' });
  assert.equal((await pending).allowed, true);
});
test('reported update blocks and is latched for this installed version', async () => {
  let saved;
  const g = gate({ query: async () => ({ status: 'update_available' }), writeLatch: value => { saved = value; } });
  assert.equal((await g.check()).allowed, false);
  assert.deepEqual(saved, { required: true, version: VERSION, family: FAMILY });
  g.query = async () => ({ status: 'current' });
  assert.equal((await g.check()).allowed, false, 'later stale results must not clear a known required update');
});
test('restarting offline cannot bypass a known required update', async () => {
  let queried = false;
  const g = gate({ query: async () => { queried = true; return { status: 'error' }; }, readLatch: () => ({ required: true, version: VERSION, family: FAMILY }) });
  assert.equal((await g.check()).allowed, false); assert.equal(queried, false);
});
test('new installed version clears only the old version latch and still requires a fresh check', async () => {
  const g = gate({ readLatch: () => ({ required: true, version: '1.2.2.0', family: FAMILY }), query: async () => ({ status: 'current' }) });
  assert.equal(g.state.allowed, false); assert.equal((await g.check()).allowed, true);
});
test('Store error, offline, malformed response and thrown failures block under strict policy', async () => {
  for (const code of ['offline', 'helper_failed', 'timeout', 'invalid_response', 'identity_error']) {
    assert.equal((await gate({ query: async () => ({ status: 'error', code }) }).check()).allowed, false);
  }
  assert.equal((await gate({ query: async () => { throw new Error('failure'); } }).check()).allowed, false);
});
test('offline bypass policy is not supported for this mandatory build', () => {
  assert.throws(() => gate({ errorPolicy: 'allow-offline' }), /policy must be explicit/);
});
test('duplicate retries share one in-flight Store query', async () => {
  let calls = 0;
  const g = gate({ query: async () => { calls++; return { status: 'current' }; } });
  const a = g.check(), b = g.check(); assert.equal(a, b); await Promise.all([a, b]); assert.equal(calls, 1);
});
test('persistence failure does not unlock detected updates', async () => {
  const g = gate({ query: async () => ({ status: 'update_available' }), writeLatch: () => { throw new Error('disk full'); } });
  assert.equal((await g.check()).allowed, false); assert.equal((await g.check()).allowed, false);
});
test('error policy is explicit, never silently inferred', () => {
  assert.throws(() => gate({ errorPolicy: 'pending' }), /policy must be explicit/);
});
test('main starts no server or bridge before the startup gate resolves', () => {
  const fs = require('fs'), path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const startup = main.slice(main.indexOf('app.whenReady().then'));
  const gateAt = startup.indexOf('await enforceStoreStartup');
  for (const action of ['fetchSession =', 'bridge = createBridge', 'await startServer()', '  createWindow();', '  createTray();']) {
    assert.ok(gateAt >= 0 && startup.indexOf(action) > gateAt, action);
  }
});
