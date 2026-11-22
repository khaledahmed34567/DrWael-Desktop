(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DWProPromotion=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const POLICY='six-calendar-months-from-release-v1';
 function ms(value){if(value&&typeof value.toMillis==='function'){try{value=value.toMillis()}catch(_){return 0}}else if(value&&typeof value==='object'&&Number.isFinite(value.seconds))value=value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);return typeof value==='number'&&Number.isFinite(value)&&value>0?value:0}
 function addCalendarMonthsUTC(value,months=6){const start=ms(value);if(!start||!Number.isInteger(months)||months<0||months>120)return 0;const d=new Date(start),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return Number.isFinite(d.getTime())?d.getTime():0}
 // UI projection only. Inputs must come from protected server-owned fields and
 // trusted server time. This does not enforce backend access or start a grant.
 // Calendar arithmetic below is explicitly UTC; rollout policy must adopt that
 // boundary (or replace it with the chosen business timezone before activation).
 function evaluatePromotion(profile,policy,serverNowMs){
  const now=ms(serverNowMs);if(!now)throw new TypeError('Trusted current time required');
  const p=profile||{},config=policy||{},start=ms(config.startsAt),end=ms(config.endsAt),launch=ms(config.legacyLaunchAt);
  const valid=!!start&&end>start&&!!launch&&typeof config.enabled==='boolean'&&typeof config.preserveLegacy==='boolean'&&typeof config.legacyEnabled==='boolean';
  const promoUntil=valid?end:0,created=ms(p.createdAt),createdValid=p.createdAt==null||(typeof p.createdAt==='number'&&Number.isFinite(p.createdAt))||(p.createdAt&&typeof p.createdAt==='object'&&typeof p.createdAt.toMillis==='function');
  const legacyUntil=valid&&config.preserveLegacy&&config.legacyEnabled&&createdValid&&(p.createdAt==null||created<start)?Math.max(created,launch)+31536000000:0;
  const paidUntil=ms(p.vipUntil),paid=p.vip===true||paidUntil>now,isAdmin=p.role==='admin';
  const promoActive=valid&&config.enabled&&start<=now&&now<end,legacyActive=legacyUntil>now;
  const freeUntil=Math.max(promoActive?promoUntil:0,legacyActive?legacyUntil:0);
  return Object.freeze({active:isAdmin||paid||freeUntil>now,isAdmin,paid,paidUntil,releaseAt:valid?start:0,promoUntil,legacyUntil,freeUntil,effectiveUntil:Math.max(paidUntil,freeUntil),pendingRelease:!valid,includesCourses:false,source:isAdmin?'admin':paid?'paid':legacyActive&&legacyUntil>=promoUntil?'preserved-grant':promoActive?'six-month-promo':'none'});
 }
 return {POLICY,addCalendarMonthsUTC,evaluatePromotion};
});
