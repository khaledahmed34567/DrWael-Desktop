'use strict';
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
// Internal main-process broker. Not a native Hello implementation and not exposed
// to renderer IPC. Production integration must supply a WebAuthn signature,
// RP/origin, user-verification flag, credential and counter verifier.
function binding(accountId,purpose,context){
 if(typeof accountId!=='string'||!accountId||accountId.length>256||!['open','payment'].includes(purpose))throw new TypeError('Invalid verification scope');
 const data=JSON.stringify(context??null);if(data.length>4096)throw new TypeError('Verification context too large');
 return crypto.createHash('sha256').update(JSON.stringify([accountId,purpose,data])).digest('base64url');
}
function createDeviceAuthChallenges({verifyAssertion=async()=>false,now=()=>performance.now(),ttlMs=60000}={}){
 const pending=new Map();let generation=0;
 function prune(){for(const [key,value]of pending)if(now()>=value.expiresAt)pending.delete(key)}
 return Object.freeze({
  issue({accountId,purpose,context}){
   prune();if(pending.size>=8)throw new Error('Too many pending verifications');
   const scope=binding(accountId,purpose,context),id=crypto.randomUUID(),nonce=crypto.randomBytes(32).toString('base64url');
   const challenge=crypto.createHash('sha256').update(JSON.stringify([nonce,scope])).digest('base64url');
   pending.set(id,{accountId,purpose,scope,challenge,expiresAt:now()+ttlMs});
   return Object.freeze({id,challenge});
  },
  async complete({id,accountId,purpose,context,assertion}){
   prune();const item=pending.get(id);pending.delete(id);if(!item)return false;
   let scope;try{scope=binding(accountId,purpose,context)}catch(_){return false}
   if(scope!==item.scope)return false;
   try{const atGeneration=generation,result=await verifyAssertion(Object.freeze({accountId,purpose,challenge:item.challenge,assertion}));return result===true&&atGeneration===generation&&now()<item.expiresAt}catch(_){return false}
  },
  clear(){generation++;pending.clear()}
 });
}
module.exports={createDeviceAuthChallenges};
