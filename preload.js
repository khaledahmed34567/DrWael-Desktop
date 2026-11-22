'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// الجسر الآمن بين الصفحة والتطبيق (يُغلَّف في window.DWNative عبر سكربت الإقلاع)
contextBridge.exposeInMainWorld('__dwHost', {
  send: (s) => ipcRenderer.send('dw:msg', String(s)),
  onReply: (cb) => { ipcRenderer.on('dw:reply', (_e, m) => { try { cb(m); } catch (e) { /* تجاهل */ } }); },
  onShield: (cb) => { ipcRenderer.on('dw:shield', (_e, on) => { try { cb(!!on); } catch (e) { /* تجاهل */ } }); },
  onUpdate: (cb) => { ipcRenderer.on('dw:update', (_e, info) => { try { cb(info); } catch (e) { /* تجاهل */ } }); },
  widgetSet: value => ipcRenderer.invoke('dw:widget:set', value),
  widgetOpen: () => ipcRenderer.invoke('dw:widget:open'),
  onWidgetEdit: cb => { if(typeof cb==='function')ipcRenderer.on('dw:widget:edit', () => cb()); },
  // نوافذ alert/confirm/prompt بتصميم التطبيق (متزامنة كما في المتصفح)
  dialog: (k, m, d, l, rtl, theme) => ipcRenderer.sendSync('dw:dialog', { k, m, d, l, rtl, theme })
});
