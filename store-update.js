'use strict';
const { execFile } = require('child_process');
const FAMILY = 'sarmad.eg.Dr.waelDesktop_ez1w9zs3mdfdg';
const VERSION = /^\d+\.\d+\.\d+\.\d+$/;

function normalizeVersion(value) {
  const pieces = String(value).split('.');
  if (pieces.length === 3) pieces.push('0');
  const result = pieces.join('.');
  return VERSION.test(result) ? result : null;
}

function parseStoreResult(text, installedVersion) {
  let data;
  try { data = JSON.parse(text); } catch (_) { return { status: 'error', code: 'invalid_response' }; }
  if (!data || data.protocol !== 1) return { status: 'error', code: 'invalid_protocol' };
  if (data.status === 'error') {
    return { status: 'error', code: /^[a-z_]+$/.test(data.code) ? data.code : 'store_error', hresult: /^0x[0-9a-f]+$/i.test(data.hresult || '') ? data.hresult : '' };
  }
  if (!['current', 'update_available'].includes(data.status) || data.packageFamily !== FAMILY ||
      data.packageVersion !== normalizeVersion(installedVersion)) {
    return { status: 'error', code: 'identity_or_version_mismatch' };
  }
  return { status: data.status, packageFamily: FAMILY, packageVersion: data.packageVersion };
}

function queryStore(executable, installedVersion, run = execFile, args = []) {
  return new Promise(resolve => {
    run(executable, args, { windowsHide: true, timeout: 25000, maxBuffer: 16384, encoding: 'utf8' }, (error, stdout) => {
      if (error) return resolve({ status: 'error', code: error.killed ? 'timeout' : 'helper_failed' });
      resolve(parseStoreResult(stdout, installedVersion));
    });
  });
}

class StoreGate {
  constructor({ installedVersion, query, readLatch, writeLatch, errorPolicy, onChange = () => {} }) {
    this.version = normalizeVersion(installedVersion);
    if (!this.version) throw new Error('Invalid installed version');
    if (errorPolicy !== 'block') throw new Error('Store check failure policy must be explicit');
    this.query = query;
    this.readLatch = readLatch;
    this.writeLatch = writeLatch;
    this.errorPolicy = errorPolicy;
    this.onChange = onChange;
    this.state = { status: 'checking', allowed: false };
    this.inFlight = null;
    this.required = false;
    try {
      const latch = readLatch();
      this.required = !!latch && latch.version === this.version && latch.family === FAMILY && latch.required === true;
    } catch (_) { /* A fresh Store check is still required. */ }
  }
  set(state) { this.state = Object.freeze(state); this.onChange(this.state); return this.state; }
  check() {
    if (this.inFlight) return this.inFlight;
    if (this.required) return Promise.resolve(this.set({ status: 'update_available', allowed: false, knownRequired: true }));
    this.set({ status: 'checking', allowed: false });
    this.inFlight = Promise.resolve().then(() => this.query()).then(result => {
      if (result.status === 'update_available') {
        this.required = true;
        try { this.writeLatch({ required: true, version: this.version, family: FAMILY }); } catch (_) { /* Stay blocked even if disk is full. */ }
        return this.set({ status: 'update_available', allowed: false });
      }
      if (result.status === 'current') return this.set({ status: 'current', allowed: true });
      return this.set({ status: 'error', allowed: false, code: result.code || 'store_error' });
    }, () => this.set({ status: 'error', allowed: false, code: 'store_error' }))
      .finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
module.exports = { FAMILY, normalizeVersion, parseStoreResult, queryStore, StoreGate };
