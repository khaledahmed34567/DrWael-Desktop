'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sp=require('../app/student-pro');const {cleanSnapshot}=require('../desktop-widget');
test('organizer derives counts and next valid upcoming exam without changing saved records',()=>{
 const tasks=[{id:'a',title:'Anatomy',done:false},{id:'b',title:'Physiology',done:true},null,{id:'c',title:''}],exams=[{title:'Old',date:'2026-11-20'},{title:'Next',date:'2026-12-01'},{title:'Bad',date:'2026-02-30'},{title:'Today',date:'2026-11-22'}];
 const before=JSON.stringify({tasks,exams}),out=sp.organizerSnapshot(tasks,exams,null,new Date(2026,10,22,12).getTime());assert.equal(out.tasks.length,2);assert.equal(out.open.length,1);assert.equal(out.done,1);assert.equal(out.nextExam.title,'Today');assert.equal(out.upcomingCount,2);assert.equal(JSON.stringify({tasks,exams}),before);
});
test('planner filter searches title and course without modifying tasks',()=>{
 const tasks=[{id:'a',title:'مراجعة التشريح',course:'Anatomy',done:false},{id:'b',title:'Review',course:'Physiology',done:true}];assert.equal(sp.filterPlannerTasks(tasks,'open','ANATOMY').length,1);assert.equal(sp.filterPlannerTasks(tasks,'done','التشريح').length,0);assert.equal(sp.filterPlannerTasks(tasks,'all','').length,2);
});
test('widget snapshot allows only bounded display data, not arbitrary properties or commands',()=>{
 const x=cleanSnapshot({lang:'bad',dark:1,design:'../../file',alwaysOnTop:'true',showFocus:false,tasks:Array.from({length:20},()=>({title:'x'.repeat(500),secret:'never'})),exam:{title:'Exam',date:'2026-12-01',days:9},focus:{phase:'running',remainingMs:1500000,endAt:2000000},secret:'never',url:'https://example.com'});
 assert.equal(x.lang,'ar');assert.equal(x.dark,false);assert.equal(x.design,'classic');assert.equal(x.alwaysOnTop,false);assert.equal(x.showFocus,false);assert.equal(x.tasks.length,4);assert.equal(x.tasks[0].title.length,120);assert.equal(JSON.stringify(x).includes('never'),false);assert.equal(x.url,undefined);assert.equal(x.exam.title,'Exam');assert.equal(x.focus.phase,'running');
});
test('widget corrupt input and timers fail closed',()=>{
 for(const x of [null,[],0,'bad'])assert.equal(cleanSnapshot(x),null);
 assert.equal(cleanSnapshot({focus:{phase:'running',remainingMs:-1},exam:{title:'Bad',date:'bad',days:NaN}}).focus,null);assert.equal(cleanSnapshot({exam:{title:'Bad',date:'bad',days:4}}).exam,null);
});
test('widget files are packaged and Store startup still precedes all widget creation',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..'),p=require('../package.json'),main=fs.readFileSync(path.join(root,'main.js'),'utf8');for(const name of ['desktop-widget.js','desktop-widget-preload.js','desktop-widget-renderer.js','desktop-widget.html','desktop-widget.css']){assert.ok(p.build.files.includes(name));assert.ok(fs.existsSync(path.join(root,name)))}assert.ok(main.indexOf('await enforceStoreStartup')<main.indexOf('studyWidget=createDesktopWidget'));
});
