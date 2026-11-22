'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');

const DESKTOP_ENTRIES = [
  'package.json',
  'package-lock.json',
  'main.js',
  'store-update.js',
  'store-startup.js',
  'store-gate.html',
  'store-gate.css',
  'store-gate-preload.js',
  'store-gate-renderer.js',
  'native',
  '.github/workflows/store-build.yml',
  'preload.js',
  'bridge.js',
  'desktop-http.js',
  'desktop-widget.js', 'desktop-widget-preload.js', 'desktop-widget-renderer.js', 'desktop-widget.html', 'desktop-widget.css', 'desktop-security.js',
  'dialog.html',
  'dialog-preload.js',
  'config.json',
  'README.md',
  '.gitignore',
  '.github/workflows/build.yml',
  'build',
  'assets',
  'app',
  'scripts',
  'tests'
];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(rootDir) {
  const out = [];
  const seen = new Set();

  function walk(relPath) {
    const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleanRel) return;
    const abs = path.join(rootDir, cleanRel);
    if (!fs.existsSync(abs)) return;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const children = fs.readdirSync(abs).sort();
      for (const ch of children) {
        if (ch === 'validation' || ch.endsWith('.obj') || ch.endsWith('.tmp') || ch === 'node_modules' || ch === '.git' || ch === 'dist' || ch === 'out' || ch === '_project') continue;
        walk(`${cleanRel}/${ch}`);
      }
      return;
    }
    if (st.isFile() && !seen.has(cleanRel)) {
      seen.add(cleanRel);
      out.push({ relPath: cleanRel, absPath: abs, mtime: st.mtime });
    }
  }

  for (const entry of DESKTOP_ENTRIES) {
    walk(entry);
  }
  return out;
}

function dosTimeDate(date) {
  const d = date instanceof Date ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const item of files) {
    const nameBuf = Buffer.from(item.relPath, 'utf8');
    const raw = item.data || fs.readFileSync(item.absPath);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const { dosTime, dosDate } = dosTimeDate(item.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // UNIX + version 2.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset >>> 0, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function buildDesktopZip(options) {
  const rootDir = (options && options.rootDir) || ROOT;
  const files = collectFiles(rootDir);
  if (!files.some((f) => f.relPath === 'package.json') || !files.some((f) => f.relPath === 'build/icon.png') || !files.some((f) => f.relPath === 'build/installer.nsh')) {
    throw new Error('Required desktop project files (package.json, build/icon.png, build/installer.nsh) are missing');
  }
  return {
    buffer: createZipBuffer(files),
    files: files.map((f) => f.relPath)
  };
}

if (require.main === module) {
  const outputPath = path.join(ROOT, 'DrWael-Desktop-Project.zip');
  const { buffer, files } = buildDesktopZip();
  fs.writeFileSync(outputPath, buffer);
  console.log(`Built ${path.basename(outputPath)} (${files.length} files, ${buffer.length} bytes)`);
}

module.exports = {
  buildDesktopZip,
  collectFiles,
  DESKTOP_ENTRIES
};
