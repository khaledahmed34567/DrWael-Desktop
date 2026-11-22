(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./pro-promotion'));else root.DWProClient=factory(root.DWProPromotion)})(typeof globalThis!=='undefined'?globalThis:this,function(promotion){
 'use strict';
 const FIELDS=['enabled','releaseVersion','startsAt','endsAt','preserveLegacy','legacyEnabled','legacyLaunchAt'];
 function decode(fields){const o={};for(const k of FIELDS){const v=fields&&fields[k];if(!v)continue;if(Object.hasOwn(v,'booleanValue'))o[k]=v.booleanValue;else if(Object.hasOwn(v,'stringValue'))o[k]=v.stringValue;else if(Object.hasOwn(v,'timestampValue'))o[k]=Date.parse(v.timestampValue)}return o}
 function create(options){
  const {projectId,fetch:request,monotonic}=options||{};
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)||typeof request!=='function'||typeof monotonic!=='function')throw new TypeError('Invalid promotion client dependencies');
  const document='projects/'+projectId+'/databases/(default)/documents/settings/proPromotion',url='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents:batchGet';
  const maxAge=300000,maxTrip=15000;let generation=0,anchor=null,pending=null,controller=null;
  function reset(){generation++;anchor=null;pending=null;if(controller)controller.abort();controller=null}
  function clock(){if(!anchor)return null;const elapsed=monotonic()-anchor.received;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>maxAge)return null;return {lower:anchor.server+elapsed,upper:anchor.server+elapsed+anchor.roundTrip,uncertainty:anchor.roundTrip}}
  async function sync(user){
   if(!user||typeof user.uid!=='string'||typeof user.getIdToken!=='function'){reset();return false}
   if(pending&&pending.uid===user.uid)return pending.promise;
   if((anchor&&anchor.uid!==user.uid)||(pending&&pending.uid!==user.uid))reset();
   const ownGeneration=generation,uid=user.uid;controller=new AbortController();const ownController=controller,signal=ownController.signal;
   let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{ownController.abort();reject(new Error('Promotion check timeout'))},maxTrip)});
   const promise=(async()=>{try{
    const token=await Promise.race([Promise.resolve().then(()=>user.getIdToken()),deadline]);if(ownGeneration!==generation||typeof token!=='string'||!token)return false;
    const started=monotonic();
    const response=await Promise.race([request(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},credentials:'omit',redirect:'error',cache:'no-store',signal,body:JSON.stringify({documents:[document],mask:{fieldPaths:FIELDS}})}),deadline]);
    if(!response.ok)throw new Error('Promotion check unavailable');
    const data=await Promise.race([response.json(),deadline]),received=monotonic(),roundTrip=received-started;
    if(ownGeneration!==generation||!Number.isFinite(roundTrip)||roundTrip<0||roundTrip>maxTrip)return false;
    if(!Array.isArray(data)||data.length!==1)throw new Error('Invalid promotion response');
    const row=data[0],server=Date.parse(row.readTime);
    if(!Number.isFinite(server)||server<=0||!(row.found?.name===document||row.missing===document))throw new Error('Invalid promotion response');
    anchor={uid,server,received,roundTrip:roundTrip+1,policy:row.found?decode(row.found.fields):{}};return true;
   }catch(_){if(ownGeneration===generation)anchor=null;return false}finally{clearTimeout(timer);if(ownGeneration===generation)pending=null}})();
   pending={uid,promise};promise.finally(()=>{if(pending?.promise===promise)pending=null});return promise;
  }
  function project(profile,uid){
   const c=clock();if(!c||anchor?.uid!==uid)return {active:profile?.role==='admin'||profile?.vip===true,isAdmin:profile?.role==='admin',paid:profile?.vip===true,freeActive:false,freeYearActive:false,effectiveUntil:0,daysRemaining:0,includesCourses:false,source:'unverified',needsCheck:true,canBuyPlan:false};
   const policy={...anchor.policy};if(c.lower<(policy.startsAt||0))policy.enabled=false;
   const state=promotion.evaluatePromotion(profile,policy,c.upper);
   return {...state,freeActive:state.freeUntil>c.upper,freeYearActive:false,daysRemaining:state.effectiveUntil>c.upper?Math.max(1,Math.ceil((state.effectiveUntil-c.upper)/86400000)):0,needsCheck:false,canBuyPlan:!state.pendingRelease&&!state.isAdmin&&profile?.vip!==true&&(!state.freeUntil||state.paidUntil>=state.freeUntil),serverNow:c.upper,uncertaintyMs:c.uncertainty};
  }
  return {sync,project,reset,fresh:()=>{const c=clock();return !!c&&(!promotion.evaluatePromotion({},anchor.policy,c.upper).pendingRelease||monotonic()-anchor.received<30000)}};
 }
 return {create,decode};
});
