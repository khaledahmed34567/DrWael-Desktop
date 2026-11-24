'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sp=require('../app/student-pro');
test('focus timer uses a deadline, pauses accurately and resumes remaining time',()=>{
 const start=1000000,session=sp.createFocusSession(25,start,'one');
 assert.equal(sp.focusSnapshot(session,start+61000).remainingMs,1439000);
 assert.equal(session.remainingMs,1500000);
 const paused=sp.transitionFocus(session,'pause',start+60000);
 assert.equal(paused.phase,'paused');assert.equal(sp.focusSnapshot(paused,start+600000).remainingMs,1440000);
 const resumed=sp.transitionFocus(paused,'resume',start+600000);
 assert.equal(resumed.endAt,start+600000+1440000);
 const done=sp.focusSnapshot(resumed,resumed.endAt+1000);assert.equal(done.phase,'completed');assert.equal(done.remainingMs,0);
 assert.equal(sp.transitionFocus(done,'resume',resumed.endAt+2000).phase,'completed');
});
test('focus rejects corrupt state and unreasonable durations, and clamps clock changes',()=>{
 for(const minutes of [-1,0,4,121,NaN,25.5])assert.throws(()=>sp.createFocusSession(minutes,1000,'x'));
 for(const state of [null,{},[],{schema:1,id:'x',phase:'paused',durationMs:1500000,remainingMs:-1}])assert.equal(sp.focusSnapshot(state,1000),null);
 const s=sp.createFocusSession(50,100000,'two');assert.equal(sp.focusSnapshot(s,0).remainingMs,3000000);
 assert.equal(sp.focusSnapshot(s,10000000).phase,'completed');
});
test('exam export produces all-day calendar events, handles year end and has no alarms or attendees',()=>{
 const ics=sp.examCalendar([{id:'exam_1',title:'Anatomy',date:'2026-12-31'},{id:'bad',title:'bad',date:'2026-02-30'}],Date.UTC(2026,10,22));
 assert.match(ics,/DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,1);
 assert.doesNotMatch(ics,/VALARM|ATTENDEE|ORGANIZER/);
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
test('exam export escapes calendar injection and folds Arabic UTF-8 without splitting characters',()=>{
 const title='مراجعة علم التشريح، '.repeat(12)+'\nBEGIN:VEVENT\r\nSUMMARY:Injected;value,comma\\slash';
 const ics=sp.examCalendar([{id:'bad\nBEGIN:VEVENT',title,date:'2026-12-01'}],0);
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 assert.equal((ics.match(/^BEGIN:VEVENT$/gm)||[]).length,1);
 const unfolded=ics.replace(/\r\n /g,'');assert.match(unfolded,/\\nBEGIN:VEVENT\\nSUMMARY:Injected\\;value\\,comma\\\\slash/);
 assert.equal(unfolded.includes('\ufffd'),false);
});

test('manual desktop update status opens the Store without falsely reporting latest version',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
 const begin=html.indexOf('$("#updb").onclick=async()=>{');
 const end=html.indexOf('$("#dlb2").onclick=showDl;',begin);
 assert.ok(begin>0&&end>begin);
 const button={disabled:false},status={innerHTML:''};let requested=false;
 const context={$:s=>s==='#updb'?button:status,DESK:true,L:(_ar,en)=>en,esc:s=>s,dwBackup(){},dwDoRestore(){},dwPickRestore(){},_dwPend:false,checkAppUpdates:async opts=>{requested=opts.manual&&opts.force;return null}};
 vm.runInNewContext(html.slice(begin,end),context);
 await button.onclick();
 assert.equal(requested,true);assert.equal(button.disabled,false);
 assert.match(status.innerHTML,/Microsoft Store/);assert.doesNotMatch(status.innerHTML,/latest available version/);
});
