'use strict';
/* Only fictional data; in-memory simulation. No storage, imports or network. */
let screen='patients',patientListSearchQuery='',patientListWard='',selectedPatient=null;
let state={patients:[
 {id:'fake-a',data:{'氏名':'架空太郎','ベッド番号':'ICU1-1'}},
 {id:'fake-b',data:{'氏名':'架空花子','ベッド番号':'206-5'}}
]};
const rooms=['201','202','203','205','206','207','208','210','211','212','213','ICU1','ICU2','ICU3'];
const bedsFor=room=>room==='206'?[1,2,3,4,5,6].map(n=>room+'-'+n):room.startsWith('ICU')?[1,2,3].map(n=>room+'-'+n):[1,2,3].map(n=>room+'-'+n);
const roomForBed=bed=>String(bed||'').match(/ICU[1-3]|\d{3}/)?.[0]||'';
function renderPatients(){
 document.getElementById('app').innerHTML='<header><h1>UX08 検索解除・位置復元テスト</h1><p>架空患者だけ／本番データは使いません／端末内保存なし</p></header><main>'+
 '<div class="test-guide"><p>① 206号室が見える位置まで下へスクロール</p><p>② 検索に「架空太郎」と入力</p><p>③ 架空太郎を開き、ICU1-1 → 206-3へ変更して「保存して戻る」</p><p>④ 検索が消え、206号室付近へ戻るか確認</p></div>'+
 '<div class="toolbar"><input id="q" type="search" autocomplete="off" placeholder="架空患者名で検索" value="'+patientListSearchQuery+'"><button id="clearPatientSearch">消去</button><select id="ward"><option value="">全病棟</option></select><button type="button" id="print" hidden>印刷</button></div>'+
 '<div id="patientList"></div></main>';
 document.getElementById('q').oninput=()=>{patientListSearchQuery=document.getElementById('q').value;drawPatientList()};
 document.getElementById('clearPatientSearch').onclick=()=>{patientListSearchQuery='';document.getElementById('q').value='';drawPatientList()};
 drawPatientList();
}
function drawPatientList(){
 const q=(document.getElementById('q')?.value||'').trim();
 const shown=rooms.filter(room=>!q||state.patients.some(p=>p.data['氏名'].includes(q)&&roomForBed(p.data['ベッド番号'])===room));
 const html=shown.map(room=>{
  const beds=bedsFor(room);
  const slots=beds.map(bed=>{
   const p=state.patients.find(p=>p.data['ベッド番号']===bed);
   return p?'<button type="button" class="bed-slot occupied-bed" data-id="'+p.id+'">'+bed+'<br>'+p.data['氏名']+'</button>':'<button type="button" class="bed-slot">'+bed+'<br>空床</button>';
  }).join('');
  return '<div class="room-map-item standard-room"><div class="room-title">'+room+(room.startsWith('ICU')?'':'号室')+'</div><div class="bed-grid">'+slots+'</div></div>';
 }).join('');
 document.getElementById('patientList').innerHTML='<section class="map-section">'+(html||'<div class="empty">該当なし</div>')+'</section>';
 document.querySelectorAll('.occupied-bed[data-id]').forEach(el=>el.onclick=()=>openPatient(state.patients.find(p=>p.id===el.dataset.id)));
}
function openPatient(p){selectedPatient=p;document.body.insertAdjacentHTML('beforeend','<div class="modal" id="modal"><div class="sheet"><h2>'+p.data['氏名']+'（架空）</h2><label>ベッド番号<select id="patientBedValue"><option value="ICU1-1">ICU1-1</option><option value="206-3">206-3</option><option value="206-5">206-5</option></select></label><button type="button" id="saveP" class="btn">保存して戻る</button><button type="button" id="cancelP">変更せず戻る</button><p class="note">データは架空・メモリ内だけ。ページを閉じれば消えます。</p></div></div>');document.getElementById('patientBedValue').value=p.data['ベッド番号'];document.getElementById('saveP').onclick=()=>{p.data['ベッド番号']=document.getElementById('patientBedValue').value;closePatient()};document.getElementById('cancelP').onclick=closePatient}
function closePatient(){selectedPatient=null;document.getElementById('modal')?.remove();renderPatients()}
renderPatients();
