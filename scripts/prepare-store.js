'use strict';
const fs = require('fs');
const path = require('path');
function prepareStore(pkg, runNumber, policy) {
  if (!Number.isSafeInteger(Number(runNumber)) || Number(runNumber) < 1) throw new Error('Invalid Store build number');
  if (!policy || policy.errorPolicy !== 'block') throw new Error('Owner must select offline/Store-error policy before an app package can be built');
  const result = structuredClone(pkg);
  result.dependencies = { ...result.dependencies };
  delete result.dependencies.express;
  delete result.dependencies['electron-updater'];
  result.devDependencies = { ...result.devDependencies, electron: '45.4.1', 'electron-builder': '26.18.0' };
  result.version = '1.1.' + Number(runNumber);
  result.build = { ...result.build,
    win: { ...result.build.win, target: [{ target: 'appx', arch: ['x64'] }], artifactName: '${productName}-Store.${ext}' },
    appx: { applicationId: 'App', identityName: 'sarmad.eg.Dr.waelDesktop', publisher: 'CN=CDF97DF2-E0EE-4A3C-A2C7-45354751C35D', publisherDisplayName: 'sarmad.eg', displayName: 'Dr.wael Desktop', backgroundColor: '#FFFFFF', languages: ['ar', 'en-US'], minVersion: '10.0.14393.0', maxVersionTested: '10.0.14393.0' },
    extraResources: [...(result.build.extraResources || []),
      { from: 'build/native/store-update-check.exe', to: 'native/store-update-check.exe' },
      { from: 'build/store-gate.json', to: 'store-gate.json' }],
    publish: null
  };
  return result;
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'build', 'store-gate.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(prepareStore(pkg, process.env.STORE_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER, policy), null, 2) + '\n');
}
module.exports = { prepareStore };
