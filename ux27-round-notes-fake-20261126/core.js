/* UX27 fake patient diary core: no production imports or patient identifiers.
   Only test entries created for fixed fictional patients may be read and stored. */
(function(global){
'use strict';
const KEY='UX27_FAKE_ONLY_ROUND_NOTES_20261126_V1';
const patients=Object.freeze([
  {id:'fake-a',bed:'201-1',name:'架空患者A',admission:'2026-11-10',doctor:'架空医師A',diagnosis:'架空の入院理由',care:'未申請'},
  {id:'fake-b',bed:'201-3',name:'架空患者B',admission:'2026-11-14',doctor:'架空医師B',diagnosis:'架空の療養相談',care:'要介護2'},
  {id:'fake-c',bed:'203-2',name:'架空患者C',admission:'2026-11-19',doctor:'架空医師C',diagnosis:'架空の退院調整',care:'申請中'},
  {id:'fake-d',bed:'208-1',name:'架空患者D',admission:'2026-11-20',doctor:'架空医師A',diagnosis:'架空の転院検討',care:'要支援1'},
  {id:'fake-e',bed:'211',name:'架空患者E',admission:'2026-11-12',doctor:'架空医師B',diagnosis:'架空の療養支援',care:'未申請'},
  {id:'fake-f',bed:'ICU1-2',name:'架空患者F',admission:'2026-11-22',doctor:'架空医師C',diagnosis:'架空の転棟調整',care:'要介護1'}
]);
const ids=new Set(patients.map(p=>p.id));
function day(ts) {
 const d=new Date(ts);if(!Number.isFinite(d.getTime()))return'';
 return String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function time(ts) {
 const d=new Date(ts);
 return Number.isFinite(d.getTime())?String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):'--:--';
}
function clean(list){
 if(!Array.isArray(list))return[];
 return list.filter(x=>x&&ids.has(x.pid)&&typeof x.body==='string'&&x.body.trim()&&typeof x.ts==='string'&&Number.isFinite(Date.parse(x.ts))&&typeof x.key==='string')
 .slice(-1000).map(x=>({key:x.key,pid:x.pid,ts:x.ts,body:x.body.slice(0,2000)}));
}
function next(list,pid,body,ts,key){
 if(!ids.has(pid))throw Error('架空患者を指定してください');
 const value=String(body||'').trim();
 if(!value)throw Error('内容を入力してください');
 if(value.length>2000)throw Error('メモは2000文字以内にしてください');
 if(!Number.isFinite(Date.parse(ts)))throw Error('日時が不正です');
 const entry={key:String(key),pid,ts,body:value};
 return clean(list).concat([entry]);
}
function byPatient(list,pid){return clean(list).filter(x=>x.pid===pid).sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts)||b.key.localeCompare(a.key))}
function daily(list,selectedDay){
 return patients.map(p=>({patient:p,notes:clean(list).filter(x=>x.pid===p.id&&day(x.ts)===selectedDay).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts)||a.key.localeCompare(b.key))})).filter(g=>g.notes.length);
}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
global.UX27FakeCore=Object.freeze({KEY,patients,day,time,clean,next,byPatient,daily,esc});
})(window);