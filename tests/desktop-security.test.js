'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { trustedIpc, isAppUrl, allowPermission, validHost } = require('../desktop-security');
function windowFixture() {
  const mainFrame = { url:'http://localhost:47831/' };
  const wc = { mainFrame };
  return { webContents:wc, isDestroyed:()=>false };
}
test('native IPC needs exact active main window, exact main frame and app document origin', () => {
  const win = windowFixture(), event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  assert.equal(trustedIpc(event,win,47831),true);
  assert.equal(trustedIpc({...event,sender:{}},win,47831),false);
  assert.equal(trustedIpc({...event,senderFrame:{url:event.senderFrame.url}},win,47831),false);
  assert.equal(trustedIpc(event,null,47831),false);
  for(const url of ['http://localhost:47831.evil.example/','http://localhost:47832/','https://localhost:47831/','http://localhost:47831/assets/x','http://evil.example:47831/','http://localhost:47831@evil.example/']) assert.equal(isAppUrl(url,47831),false,url);
  assert.equal(isAppUrl('http://127.0.0.1:47831/index.html',47831),true);
});
test('device, clipboard-read and unknown permissions stay denied; ordinary app permissions are scoped', () => {
  const win=windowFixture(),wc=win.webContents,main={isMainFrame:true,requestingUrl:wc.mainFrame.url};
  for(const permission of ['media','geolocation','display-capture','clipboard-read','usb','hid','unknown']) assert.equal(allowPermission(wc,permission,main,win,47831),false);
  for(const permission of ['notifications','clipboard-sanitized-write','fullscreen']) {
    assert.equal(allowPermission(wc,permission,main,win,47831),true);
    assert.equal(allowPermission({},permission,main,win,47831),false);
    assert.equal(allowPermission(wc,permission,{...main,isMainFrame:false},win,47831),false);
    assert.equal(allowPermission(wc,permission,{...main,requestingUrl:'https://evil.example/'},win,47831),false);
  }
  const lecture={isMainFrame:false,requestingUrl:'https://www.youtube-nocookie.com/embed/test'};
  assert.equal(allowPermission(wc,'fullscreen',lecture,win,47831),true);
  assert.equal(allowPermission(wc,'clipboard-sanitized-write',lecture,win,47831),false);
  assert.equal(allowPermission(wc,'fullscreen',{...lecture,requestingUrl:'https://www.youtube-nocookie.com.evil.example/'},win,47831),false);
});
test('local server rejects foreign Host and serves the actual Student Hub module with frame protection', async t => {
  let port;
  const handler=require('../desktop-http').createDesktopHandler({rootDir:path.join(__dirname,'..'),getPort:()=>port,pageHtml:()=>'<html>app</html>',libAllowed:()=>false});
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=(host,resource)=>new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path:resource,headers:{host}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);});
  assert.equal(validHost('evil.example:'+port,port),false);
  assert.equal((await request('evil.example:'+port,'/')).status,403);
  const result=await request('localhost:'+port,'/student-pro.js');
  assert.equal(result.status,200);assert.match(result.body,/computePlannerSummary/);
  assert.equal(result.headers['x-frame-options'],'DENY');
  assert.equal(result.headers['content-security-policy'],"frame-ancestors 'none'");
  assert.equal((await request('localhost:'+port,'/../../package.json')).status,404);
});
test('bridge rejects null, scalar and array input without invoking native services',async()=>{
  const bridge=require('../bridge')({statePath:'',now:()=>0,cfg:{}});
  for(const value of ['null','[]','"message"','42','true','{']) assert.equal(await bridge.handle(value),null);
});
