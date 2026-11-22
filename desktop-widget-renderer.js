'use strict';
let data=null;
const $=s=>document.querySelector(s),word=(ar,en)=>data&&data.lang==='en'?en:ar;
function paintClock(){
 if(!data)return;const f=data.focus;
 const ms=f?f.phase==='running'?Math.max(0,Math.min(f.remainingMs,f.endAt-Date.now())):f.remainingMs:1500000;
 const seconds=Math.ceil(ms/1000);
 $('#clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 $('#focusStatus').textContent=!f?word('ابدأ الجلسة من التطبيق','Start a session in the app'):ms===0?word('الجلسة خلصت. خد استراحة.','Session complete. Take a break.'):f.phase==='paused'?word('متوقف مؤقتًا','Paused'):word('جلسة تركيز شغّالة','Focus session running');
}
function render(v){
 data=v;document.documentElement.lang=v.lang;document.documentElement.dir=v.lang==='en'?'ltr':'rtl';document.body.classList.toggle('dark',v.dark);document.body.dataset.design=v.design;
 $('#label').textContent=word('مساحة المذاكرة','STUDY SPACE');$('#today').textContent=word('خطوتك الجاية','UP NEXT');$('#focusLabel').textContent=word('مؤقّت التركيز','FOCUS TIMER');$('#close').setAttribute('aria-label',word('إغلاق الويدجيت','Close widget'));$('#edit').textContent=word('افتح التطبيق للتعديل','Open app to edit');$('#privacy').textContent=word('بيانات محلية. الويدجيت تعمل والتطبيق مفتوح في الخلفية.','Local data. The widget needs the app running in the background.');
 $('#focusBox').hidden=v.showFocus===false;$('#exam').hidden=v.showExam===false;
 const tasks=$('#tasks');tasks.replaceChildren();
 for(const t of v.tasks){const row=document.createElement('div');row.className='task';const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=t.title;row.append(dot,text);tasks.append(row)}
 if(!v.tasks.length){const p=document.createElement('p');p.className='empty';p.textContent=word('خطتك فاضية. أضف مهمة من التطبيق.','Your planner is clear. Add a task in the app.');tasks.append(p)}
 const ex=$('#exam');ex.replaceChildren();
 const label=document.createElement('small');label.textContent=word('الامتحان القادم','NEXT EXAM');ex.append(label);
 const title=document.createElement('b');title.textContent=v.exam?v.exam.title:word('لا يوجد امتحان قادم','No upcoming exam');ex.append(title);
 if(v.exam){const date=document.createElement('small');date.textContent=v.exam.date+' · '+(v.exam.days===0?word('اليوم','Today'):word('باقي '+v.exam.days+' يوم','In '+v.exam.days+' days'));ex.append(date)}paintClock();
}
window.studyWidget.onData(render);
$('#edit').onclick=()=>window.studyWidget.action('edit');$('#close').onclick=()=>window.studyWidget.action('close');
window.studyWidget.action('ready');setInterval(paintClock,1000);
