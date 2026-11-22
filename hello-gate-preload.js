'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('helloGate',{act:action=>{if(['verify','repair','settings','quit'].includes(action))ipcRenderer.send('hello:action',action)},onState:callback=>ipcRenderer.on('hello:state',(_e,value)=>callback(value))});
