'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studyWidget',{
 onData:cb=>{if(typeof cb!=='function')return;ipcRenderer.on('dw:widget:data',(_e,v)=>cb(v));},
 action:name=>ipcRenderer.invoke('dw:widget:action',name)
});
