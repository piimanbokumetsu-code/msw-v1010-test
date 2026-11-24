/* 2026-11-24 UX22 fake discharge-search reset test.
   The startDischargeFlow function below is extracted verbatim from main
   except for the one success-only search-reset statement under test.
   Everything else is fictional and in memory; no storage/network/print. */
'use strict';
let screen='patients',selectedPatient=null,patientListSearchQuery='';
let failNextSave=false;
const freshPatients=()=>[
 {id:'FAKE-A',data:{'氏名':'架空患者A','ベッド番号':'201-1','入院日':'2026-11-01'},summaryPending:false,dischargeDate:null},
 {id:'FAKE-B',data:{'氏名':'架空患者B','ベッド番号':'202-2','入院日':'2026-11-05'},summaryPending:false,dischargeDate:null}
];
let state={patients:freshPatients()};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowISO=()=>new Date().toISOString();
async function flushPatientAutoSave(){return true}
async function save(){
  await Promise.resolve();
  if(failNextSave){
    failNextSave=false;
    $('#failSave').checked=false;
    throw Error('架空テスト用の保存失敗です');
  }
}
function renderPatientList(){
  const list=$('#fakePatientList');if(!list)return;
  list.replaceChildren();
  const q=patientListSearchQuery.trim();
  const visible=state.patients.filter(p=>!p.dischargeDate&&(!q||p.data['氏名'].includes(q)));
  const status=$('#fakeListStatus');
  if(status)status.textContent='在院の架空患者 '+state.patients.filter(p=>!p.dischargeDate).length+'人／検索該当 '+visible.length+'人';
  for(const p of visible){
    const btn=document.createElement('button');btn.type='button';btn.className='patient-btn';
    btn.textContent=p.data['氏名']+'／'+p.data['ベッド番号'];
    btn.onclick=()=>openPatient(p);
    list.append(btn);
  }
  if(!visible.length){const empty=document.createElement('p');empty.textContent='該当する架空患者がいません';list.append(empty);}
}
function render(){
  $('#app').innerHTML='<div class="panel"><h2>架空の患者一覧</h2>'+
    '<label>患者検索<input id="q" type="search" placeholder="架空患者A と入力" autocomplete="off" value="'+esc(patientListSearchQuery)+'"></label>'+
    '<button type="button" class="subtle" id="fakeClear">消去</button>'+
    '<p id="fakeListStatus" class="notice" role="status"></p><div id="fakePatientList"></div></div>';
  $('#q').oninput=()=>{patientListSearchQuery=$('#q').value;renderPatientList()};
  $('#fakeClear').onclick=()=>{patientListSearchQuery='';$('#q').value='';renderPatientList()};
  renderPatientList();
}
function openPatient(patient){
  selectedPatient=patient;
  $('#modal')?.remove();
  const modal=document.createElement('section');modal.id='modal';modal.className='panel';
  modal.innerHTML='<h2>'+esc(patient.data['氏名'])+' の患者情報（架空）</h2>'+
    '<p class="notice">ベッド番号をタップして退院を選べます</p>'+
    '<button type="button" id="fakeBed">ベッド番号：'+esc(patient.data['ベッド番号'])+' ▾</button>'+
    '<button type="button" id="fakeBack" class="subtle">患者情報を閉じる（通常の戻り）</button>'+
    '<div id="fakeBedChoice" hidden><button type="button" id="fakeDischarge">退院</button></div>';
  $('#app').append(modal);
  $('#fakeBed').onclick=()=>{$('#fakeBedChoice').hidden=false};
  $('#fakeDischarge').onclick=()=>startDischargeFlow(patient);
  $('#fakeBack').onclick=closePatient;
}
function closePatient(){
  selectedPatient=null;$('#modal')?.remove();render();
}
function startDischargeFlow(p=selectedPatient){
 const fromPatientList=screen==='patients';
 if(!p)return;
 if(selectedPatient&&selectedPatient!==p){alert('別の患者情報が編集中です。退院処理を中止しました。');return;}
 if(p._new){alert('先に患者情報を保存してください。');return;}
 const previousBed=$('#patientBedValue')?.value??p.data['ベッド番号']??'';
 const today=new Date().toLocaleDateString('sv-SE');
 $('#dischargeFlow')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="bed-picker-shade" id="dischargeFlow" role="dialog" aria-modal="true" aria-label="退院日を選択"><div class="bed-picker-panel discharge-panel"><div class="bed-picker-head"><strong>退院日を選択</strong><button class="btn secondary" id="dischargeCancel">戻る</button></div><div class="discharge-content"><p><b>${esc(p.data['氏名']||'氏名未入力')}</b></p><label>退院日<input type="date" id="dischargeChosenDate" value="${today}"></label><p class="notice">退院確定後はベッドを空け、日誌の退院患者一覧に残します。サマリー入力完了までは削除されません。</p><button class="btn" id="dischargeReview">確認へ</button><div id="dischargeReviewBody"></div></div></div></div>`);
 const root=$('#dischargeFlow');$('#dischargeCancel').onclick=()=>root.remove();
 $('#dischargeReview').onclick=()=>{
  const date=$('#dischargeChosenDate').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('退院日を入力してください');return;}
  const admission=p.data['入院日'];if(admission&&/^\d{4}-\d{2}-\d{2}$/.test(admission)&&date<admission){alert('退院日は入院日以降を指定してください');return;}
  $('#dischargeReviewBody').innerHTML=`<div class="panel"><p><b>退院処理を確定しますか？</b></p><p>${esc(p.data['氏名']||'氏名未入力')} ／ 退院日：${esc(date)} ／ 退院前：${esc(previousBed||'その他・未配置')}</p><button class="btn" id="dischargeCommit">${fromPatientList?'退院を確定して患者一覧へ戻る':'確定して退院一覧へ'}</button></div>`;
  $('#dischargeCommit').onclick=async()=>{
   const b=$('#dischargeCommit');b.disabled=true;
   if(selectedPatient===p&&!await flushPatientAutoSave()){b.disabled=false;alert('患者情報の自動保存に失敗しました。退院処理を中止しました。');return;}
   const old={date:p.dischargeDate,pending:p.summaryPending,bed:p.data['ベッド番号'],former:p.formerBed};
   try{p.formerBed=previousBed;p.dischargeDate=date;p.summaryPending=true;p.data['ベッド番号']='';p.updatedAt=nowISO();await save();if(fromPatientList){patientListSearchQuery='';const search=$('#q');if(search)search.value='';}root.remove();$('#duplicateModal')?.remove();const hadPatientSheet=selectedPatient===p;if(hadPatientSheet)closePatient();if(fromPatientList){screen='patients';if(!hadPatientSheet)render()}else{screen='journal';render()}}
   catch(e){p.dischargeDate=old.date;p.summaryPending=old.pending;p.data['ベッド番号']=old.bed;p.formerBed=old.former;alert('保存できませんでした：'+e.message);b.disabled=false}
  };
 };
}

$('#failSave').onchange=e=>{failNextSave=e.target.checked};
$('#fakeReset').onclick=()=>{
  $('#dischargeFlow')?.remove();
  state={patients:freshPatients()};selectedPatient=null;
  patientListSearchQuery='';failNextSave=false;$('#failSave').checked=false;
  render();
};
render();
