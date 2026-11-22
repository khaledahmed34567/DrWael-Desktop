'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
function hwnd(window){const b=window.getNativeWindowHandle();return (b.length>=8?b.readBigUInt64LE():BigInt(b.readUInt32LE())).toString(16)}
function createHelloGate({BrowserWindow,ipcMain,shell,app,hello}){
 let pending=null,gate=null;
 function ensure(){if(pending)return pending;
  pending=new Promise(resolve=>{let done=false,working=false;const expected=pathToFileURL(path.join(__dirname,'hello-gate.html')).href;
   gate=new BrowserWindow({width:580,height:570,resizable:false,show:false,title:'Dr. Wael | Windows Hello',autoHideMenuBar:true,backgroundColor:'#141824',webPreferences:{preload:path.join(__dirname,'hello-gate-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});gate.setContentProtection(true);
   const own=gate;const state=(code)=>{if(!own.isDestroyed())own.webContents.send('hello:state',code)};
   const finish=value=>{if(done)return;done=true;if(!value)hello.clear();ipcMain.removeListener('hello:action',action);pending=null;if(gate===own)gate=null;resolve(value);if(!own.isDestroyed())own.destroy()};
   const action=async(e,value)=>{if(done||e.sender!==own.webContents||e.senderFrame!==own.webContents.mainFrame||e.senderFrame.url!==expected)return;
    if(value==='quit'){finish(false);app.quit();return}
    if(value==='settings'){await shell.openExternal('ms-settings:signinoptions').catch(()=>{});return}
    if(!['verify','repair'].includes(value)||working)return;working=true;state('checking');
    const ok=await hello.verify({hwnd:hwnd(own),accountId:'windows-device',purpose:'open',resetCredential:value==='repair'});
    working=false;if(ok)finish(true);else state(hello.status());
   };
   ipcMain.on('hello:action',action);own.on('closed',()=>finish(false));own.webContents.on('render-process-gone',()=>finish(false));own.webContents.on('did-fail-load',()=>finish(false));own.webContents.setWindowOpenHandler(()=>({action:'deny'}));own.webContents.on('will-navigate',(e,url)=>{if(url!==expected)e.preventDefault()});
   own.once('ready-to-show',()=>own.show());own.loadFile(path.join(__dirname,'hello-gate.html')).catch(()=>finish(false));
  });return pending;
 }
 return {ensure,close(){hello.clear();if(gate&&!gate.isDestroyed())gate.destroy()}};
}
module.exports={createHelloGate,hwnd};
