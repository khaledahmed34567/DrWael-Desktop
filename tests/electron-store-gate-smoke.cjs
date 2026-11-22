'use strict';
// Real Electron + real native helper negative-path test. Not a Store-install test.
const { app, BrowserWindow, ipcMain, shell }=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const { enforceStoreStartup }=require('../store-startup');
const root=path.join(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'drwael-gate-smoke-'));
app.setPath('userData',path.join(temp,'user'));
app.on('window-all-closed',()=>{});
const timeout=setTimeout(()=>{console.error('Electron smoke timed out');app.exit(1)},45000);
app.whenReady().then(async()=>{
 if(process.platform!=='win32')throw new Error('This acceptance smoke requires Windows');
 fs.mkdirSync(path.join(temp,'native'),{recursive:true});
 fs.copyFileSync(path.join(root,'build/native/store-update-check.exe'),path.join(temp,'native/store-update-check.exe'));
 fs.writeFileSync(path.join(temp,'store-gate.json'),JSON.stringify({errorPolicy:'block'}));
 let window,quitRequested=false;
 function CapturedWindow(options) { window = new BrowserWindow(options); return window; }
 const facade={getPath:key=>app.getPath(key),getVersion:()=>app.getVersion(),quit:()=>{quitRequested=true}};
 const pending=enforceStoreStartup({app:facade,BrowserWindow:CapturedWindow,ipcMain,shell,resourcesPath:temp});
 let state;
 for(let i=0;i<70;i++){
  await new Promise(resolve=>setTimeout(resolve,400));
  if(window&&!window.isDestroyed()){
   state=await window.webContents.executeJavaScript('window.storeGate ? window.storeGate.state() : null');
   if(state&&state.status==='error')break;
  }
 }
 assert.equal(state?.status,'error');assert.equal(state.allowed,false);assert.equal(state.code,'no_package_identity');
 assert.equal(BrowserWindow.getAllWindows().length,1);
 const isolated=await window.webContents.executeJavaScript('typeof require === "undefined" && typeof process === "undefined" && typeof window.storeGate.exit === "function"');
 assert.equal(isolated,true);
 assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth'),true);
 fs.mkdirSync(path.join(root,'build/validation'),{recursive:true});
 fs.writeFileSync(path.join(root,'build/validation/real-electron-gate-error.png'),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript('window.storeGate.exit(); true');
 assert.equal(await pending,false);assert.equal(quitRequested,true);
 clearTimeout(timeout);
 console.log('Real sandboxed Electron renderer, IPC and native helper missing-identity rejection passed. This does not test actual Store update detection.');
 app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1)});
