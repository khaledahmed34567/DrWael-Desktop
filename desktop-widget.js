'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
function cleanSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const text=(s,n=120)=>typeof s==='string'?s.slice(0,n):'';
  const tasks=(Array.isArray(value.tasks)?value.tasks:[]).slice(0,4).filter(x=>x&&typeof x.title==='string').map(x=>({title:text(x.title),done:x.done===true}));
  const f=value.focus,focus=f&&['running','paused','completed'].includes(f.phase)&&Number.isFinite(f.remainingMs)&&f.remainingMs>=0&&f.remainingMs<=7200000?{phase:f.phase,remainingMs:f.remainingMs,endAt:Number.isFinite(f.endAt)?f.endAt:0}:null;
  const e=value.exam,exam=e&&typeof e.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&Number.isInteger(e.days)&&e.days>=0&&e.days<36600?{title:text(e.title),date:e.date,days:e.days}:null;
  return {lang:value.lang==='en'?'en':'ar',dark:value.dark===true,design:['classic', 'minimal', 'warm', 'midnight', 'forest', 'ocean', 'rose', 'solar'].includes(value.design)?value.design:'classic',alwaysOnTop:value.alwaysOnTop===true,showFocus:value.showFocus!==false,showExam:value.showExam!==false,tasks,exam,focus};
}
function createDesktopWidget({BrowserWindow,ipcMain,powerMonitor,trustedMain,showMain,rootDir=__dirname,now=Date.now}){
  let widget=null,snapshot=null,sessionKey='',lastAt=0;
  const url=pathToFileURL(path.join(rootDir,'desktop-widget.html')).href;
  const live=()=>widget&&!widget.isDestroyed();
  const clear=()=>{snapshot=null;sessionKey='';lastAt=0;if(live())widget.close();widget=null;};
  const trustedWidget=e=>{try{return live()&&e.sender===widget.webContents&&e.senderFrame===widget.webContents.mainFrame&&e.senderFrame.url===url}catch(_){return false}};
  const publish=()=>{if(live()&&snapshot)widget.webContents.send('dw:widget:data',snapshot)};
  ipcMain.handle('dw:widget:set',(e,value)=>{
    if(!trustedMain(e))return false;
    if(value===null){clear();return true;}
    if(!value||typeof value.session!=='string'||!value.session||value.session.length>160)return false;
    let size;try{size=JSON.stringify(value).length}catch(_){return false}if(size>12000)return false;
    const clean=cleanSnapshot(value.snapshot);if(!clean)return false;
    if(sessionKey&&sessionKey!==value.session)clear();
    sessionKey=value.session;snapshot=clean;lastAt=now();
    if(live()){widget.setAlwaysOnTop(clean.alwaysOnTop);publish();}return true;
  });
  ipcMain.handle('dw:widget:open',e=>{
    if(!trustedMain(e)||!snapshot||now()-lastAt>15000)return false;
    if(live()){widget.show();return true;}
    widget=new BrowserWindow({width:356,height:620,minWidth:300,minHeight:350,maxWidth:600,maxHeight:900,useContentSize:true,show:false,frame:false,resizable:true,skipTaskbar:false,alwaysOnTop:snapshot.alwaysOnTop,title:'Dr. Wael · Study widget',backgroundColor:snapshot.dark?'#101723':'#f5f6f8',webPreferences:{preload:path.join(rootDir,'desktop-widget-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false,partition:'dw-study-widget'}});
    widget.setContentProtection(true);
    widget.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    widget.webContents.on('will-navigate',(ev,dest)=>{if(dest!==url)ev.preventDefault()});
    widget.webContents.session.setPermissionRequestHandler((_wc,_perm,cb)=>cb(false));
    widget.webContents.session.setPermissionCheckHandler(()=>false);
    widget.webContents.session.on('will-download',ev=>ev.preventDefault());
    widget.webContents.once('did-finish-load',()=>{if(!live())return;publish();widget.show()});
    widget.on('closed',()=>{widget=null});widget.loadURL(url);return true;
  });
  ipcMain.handle('dw:widget:action',(e,action)=>{
    if(!trustedWidget(e)||!['edit','close','ready'].includes(action))return false;
    if(action==='ready'){publish();return true;}
    if(action==='close'){if(live())widget.close();return true;}
    showMain();return true;
  });
  const timer=setInterval(()=>{if(snapshot&&now()-lastAt>15000)clear()},5000);if(timer.unref)timer.unref();
  if(powerMonitor){powerMonitor.on('lock-screen',clear);powerMonitor.on('suspend',clear);}
  return {clear,destroy:()=>{clearInterval(timer);clear();for(const ch of ['dw:widget:set','dw:widget:open','dw:widget:action'])ipcMain.removeHandler(ch);if(powerMonitor){powerMonitor.removeListener('lock-screen',clear);powerMonitor.removeListener('suspend',clear);}}};
}
module.exports={cleanSnapshot,createDesktopWidget};
