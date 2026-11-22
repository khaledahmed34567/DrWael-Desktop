'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createDeviceAuthChallenges}=require('./device-auth-challenges');
if(!globalThis.crypto)globalThis.crypto=crypto.webcrypto;
const RP='localhost',ORIGIN='http://localhost';
function runNative(helper,action,hwnd,lines,signal){
 return new Promise(resolve=>{let done=false,text='',timer;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)};
  const p=spawn(helper,action==='probe'?['probe']:[action,hwnd],{windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false,signal});
  timer=setTimeout(()=>{p.kill();finish({ok:false,code:'verification_timeout'})},75000);
  p.on('error',()=>finish({ok:false,code:'helper_unavailable'}));p.stdout.on('data',chunk=>{text+=chunk.toString('utf8');if(text.length>524288){p.kill();finish({ok:false,code:'invalid_response'})}});
  p.on('close',code=>{if(code!==0)return finish({ok:false,code:'helper_failed'});try{const value=JSON.parse(text);finish(value.protocol===1?value:{ok:false,code:'invalid_response'})}catch(_){finish({ok:false,code:'invalid_response'})}});
  p.stdin.on('error',()=>{});p.stdin.end(lines?lines.join('\n')+'\n':'');
 });
}
function createWindowsHello(options){
 const {filePath,helperPath,native=runNative,platform=process.platform,release=os.release(),verifier=()=>require('@simplewebauthn/server')}=options;
 let busy=false,generation=0,lastCode='verification_required',activeAbort=null;
 function read(){try{const c=JSON.parse(fs.readFileSync(filePath,'utf8'));if(c.version!==1||c.rp!==RP||c.origin!==ORIGIN||!/^[A-Za-z0-9_-]{1,8192}$/.test(c.id)||!/^[A-Za-z0-9_-]{1,16384}$/.test(c.publicKey)||!Number.isSafeInteger(c.counter)||c.counter<0)throw Error();return c}catch(e){if(e.code==='ENOENT')return null;throw Error('credential_record_invalid')}}
 function write(value){fs.mkdirSync(path.dirname(filePath),{recursive:true});const temp=filePath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(temp,filePath)}finally{try{fs.unlinkSync(temp)}catch(_){}}}
 const broker=createDeviceAuthChallenges({ttlMs:90000,verifyAssertion:async({assertion,challenge})=>{
  const {response,existing}=assertion,lib=verifier();
  if(!existing){const result=await lib.verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:ORIGIN,expectedRPID:RP,requireUserPresence:true,requireUserVerification:true,supportedAlgorithmIDs:[-7]});
   if(!result.verified||!result.registrationInfo.userVerified||result.registrationInfo.credentialDeviceType!=='singleDevice')return false;
   const c=result.registrationInfo.credential;assertion.next={version:1,rp:RP,origin:ORIGIN,id:c.id,publicKey:Buffer.from(c.publicKey).toString('base64url'),counter:c.counter};return true;
  }
  const result=await lib.verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:ORIGIN,expectedRPID:RP,requireUserVerification:true,credential:{id:existing.id,publicKey:new Uint8Array(Buffer.from(existing.publicKey,'base64url')),counter:existing.counter,transports:['internal']}});
  if(!result.verified||!result.authenticationInfo.userVerified||result.authenticationInfo.credentialDeviceType!=='singleDevice')return false;
  assertion.next={...existing,counter:result.authenticationInfo.newCounter};return true;
 }});
 async function probe(signal){if(platform!=='win32'||Number(release.split('.')[2])<18362){lastCode='windows_1903_required';return false}const r=await native(helperPath,'probe',undefined,undefined,signal);lastCode=r.ok===true?'verification_required':r.code||'hello_setup_required';return r.ok===true}
 async function verify({hwnd,accountId='windows-device',purpose='open',context=null,resetCredential=false}){
  if(busy)return false;busy=true;const ownGeneration=generation,ownAbort=new AbortController();activeAbort=ownAbort;
  try{if(!await probe(ownAbort.signal))return false;if(!/^[a-fA-F0-9]{1,16}$/.test(hwnd))throw Error('invalid_window');const existing=resetCredential?null:read(),ticket=broker.issue({accountId,purpose,context}),clientDataJSON=Buffer.from(JSON.stringify({type:existing?'webauthn.get':'webauthn.create',challenge:ticket.challenge,origin:ORIGIN,crossOrigin:false})).toString('base64url');
   const result=await native(helperPath,existing?'get':'create',hwnd,[clientDataJSON,existing?existing.id:crypto.randomBytes(32).toString('base64url')],ownAbort.signal);
   if(result.ok!==true){lastCode=result.code||'verification_failed';return false}
   if(!/^[A-Za-z0-9_-]{1,8192}$/.test(result.id)||existing&&result.id!==existing.id)throw Error('invalid_credential');
   const response={id:result.id,rawId:result.id,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:existing?{clientDataJSON,authenticatorData:result.authenticatorData,signature:result.signature,userHandle:result.userHandle||undefined}:{clientDataJSON,attestationObject:result.attestationObject,transports:['internal']}};
   const assertion={response,existing};const valid=await broker.complete({id:ticket.id,accountId,purpose,context,assertion});if(!valid||ownGeneration!==generation){lastCode='verification_failed';return false}write(assertion.next);lastCode='verified';return true;
  }catch(_){lastCode='verification_failed';return false}finally{busy=false;if(activeAbort===ownAbort)activeAbort=null}
 }
 return {probe,verify,clear(){generation++;broker.clear();if(activeAbort)activeAbort.abort()},status:()=>lastCode};
}
module.exports={createWindowsHello,runNative};
