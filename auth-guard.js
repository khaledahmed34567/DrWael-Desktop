'use strict';
// No platform/device capability may be treated as successful verification.
// Windows returns success only from the main-process signature verifier.
async function requestDeviceVerification({platform,windowsHello,canTouchID,touchID,reason}){
  if(platform==='win32'&&typeof windowsHello==='function'){try{return(await windowsHello(String(reason||'auth')))===true}catch(_){return false}}
  if(platform==='darwin'&&typeof canTouchID==='function'&&typeof touchID==='function'){
    try{if(!canTouchID())return false;await touchID(String(reason||'Confirm in Dr. Wael').slice(0,200));return true}catch(_){return false}
  }
  return false;
}
module.exports={requestDeviceVerification};
