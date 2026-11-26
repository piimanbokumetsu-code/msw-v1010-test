/* UX25: isolated fake patient host for the *real* UX18 long-press module.
   No IndexedDB, credentials, real patient information or network calls. */
'use strict';
let screen='patients',key={fakeUnlock:true};
const BED_LAYOUT=[
 {room:'201',beds:[1,2,3,4,5,6]},
 {room:'202',beds:[1,2,3,4,5,6]},
 {room:'203',beds:[1,2,3,4,5,6,7]},
 {room:'205',beds:[1,2,3,4,5,6]},
 {room:'206',beds:[1,2,3,4,5,6]},
 {room:'207',beds:[1,2,3,4,5,6]},
 {room:'208',beds:[1,2]},
 {room:'210',beds:[1,2]}
];
const ICU_LAYOUT=[
 {room:'ICU1',beds:[1,2,3,4,5,6,7]},
 {room:'ICU2',beds:[1,2,3,4,5,6,7]},
 {room:'ICU3',beds:[1,2,3,4,5,6,7,8,9]}
];
const fakeBeds=['201-1','201-3','201-5','202-1','202-4','203-2','203-3',
 '203-5','205-1','205-3','206-2','206-5','207-2','207-4','208-1',
 '210-2','ICU1-2','ICU1-4','ICU2-3','ICU3-1','ICU3-6'];
let state={patients:fakeBeds.map((bed,i)=>({
 id:'fake-ux25-'+String(i+1).padStart(2,'0'),
 data:{'ベッド番号':bed,'氏名':'架空患者'+String(i+1).padStart(2,'0'),
  'ＩＤ':'FAKE-'+String(i+1).padStart(3,'0')},
 createdAt:'2026-11-26T09:00:00+09:00',
 updatedAt:'2026-11-26T09:00:00+09:00',
 dischargeDate:null
})).concat([{id:'fake-ux25-unplaced',data:{'ベッド番号':'','氏名':'架空の未配置患者','ＩＤ':'FAKE-U01'},dischargeDate:null}])};
let fakeWriteCount=0;
function nowISO(){return new Date().toISOString()}
function normalizeBed(v){return String(v||'').trim().replace(/\s+/g,'').replace(/[‐-‒–—―ー－]/g,'-').toUpperCase()}
function bedKey(room,n){return n===''?room:room+'-'+n}
function isMappedBed(v){const b=normalizeBed(v);return [...BED_LAYOUT,...ICU_LAYOUT].some(r=>r.beds.some(n=>normalizeBed(bedKey(r.room,n))===b))}
function maintenanceBusyReason(){return''}
async function save(){
 // Writes exist only in the current JS object's memory for this fake test.
 // Reloading the page resets all fake bed changes. No persistent data changes.
 if(!key||!state)throw Error('架空テストでロックされています');
 await Promise.resolve();
 fakeWriteCount++;
 document.getElementById('fakeSaveCount').textContent=String(fakeWriteCount);
}
function openPatient(p){
 const el=document.getElementById('fakeStatus');
 if(el)el.textContent='架空患者 '+(p?.data?.['氏名']||'')+' をタップ（実際の患者データには触れません）';
}
function drawPatientList(){
 const root=document.getElementById('patientList');
 if(!root)return;
 const roomHtml=(room,kind)=>'<section class="room-block"><h2>'+room.room+(kind==='general'?'号室':'')+'</h2>'+
 '<div class="compact-room-scroll"><div class="bed-grid">'+room.beds.map(n=>{
  const bed=bedKey(room.room,n),found=state.patients.find(p=>p.data['ベッド番号']===bed);
  if(!found)return '<button type="button" class="bed-slot empty-bed" data-new-bed="'+bed+'"><b>'+bed+'</b><small>空床</small></button>';
  return '<button type="button" class="bed-slot occupied-bed" data-id="'+found.id+'" data-bed="'+bed+'"><b>'+bed+'</b><strong>'+found.data['氏名']+'</strong><small>長押しで移動</small></button>';
 }).join('')+'</div></div></section>';
 root.innerHTML='<div class="general-room-map">'+BED_LAYOUT.map(r=>roomHtml(r,'general')).join('')+
 '</div><div class="icu-map">'+ICU_LAYOUT.map(r=>roomHtml(r,'icu')).join('')+'</div>';
 // Original tap-to-open behavior remains distinct from long-press.
 root.querySelectorAll('.occupied-bed').forEach(node=>node.addEventListener('click',()=>{
   const p=state.patients.find(p=>p.id===node.dataset.id);
   if(p)openPatient(p);
 }));
}
