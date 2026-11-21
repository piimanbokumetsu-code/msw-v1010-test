/* RX050 integrated fictional offline test harness.
   Implements only essential UI/navigation of production app.
   Drug data and "patient" are hard-coded fictional and RAM-only;
   no persistence, server actions, photo access or print actions.
*/
'use strict';
let screen='patients',activeTab='medications',key=true;
let state={
 drugs:[
  {'薬名':'架空薬A','医薬品分類':'架空分類A','薬効':'架空の説明','薬価':'',ux05ReviewDone:false},
  {'薬名':'架空薬B','医薬品分類':'架空分類B','薬効':'架空の説明','薬価':'',ux05ReviewDone:true}
 ],
 patients:[{id:'FAKE01',data:{'氏名':'架空患者A'},_new:false,medications:[]}]
};
let selectedPatient=state.patients[0],patientMedicationBusy=false,seq=0,failSave=false;
function uid(){return 'fake-'+(++seq);}
function nowISO(){return new Date().toISOString();}
function medRows(p){return Array.isArray(p?.medications)?p.medications:[];}
async function save(){
  await Promise.resolve();
  if(failSave){
    failSave=false;
    const x=document.getElementById('fakeFailSave');if(x)x.checked=false;
    throw Error('架空テストで意図的に起こした保存失敗');
  }
}
function rx038MasterSearchText(drug){return [drug['薬名'],drug['医薬品分類'],drug['薬効']].join(' ').toLowerCase();}
function drawPatientMedicationList(){
  const host=document.getElementById('fakeRegisteredList');
  if(!host)return;
  host.replaceChildren();
  const rows=medRows(state.patients[0]);
  document.getElementById('fakeCount').textContent=String(rows.length);
  for(const row of rows){
    const p=document.createElement('p');p.className='fakeRegistered';
    const rx=row?.ux19Schedule?window.UX19DoseSchedule?.resolve(row):null;
    p.textContent=String(row.drug?.['薬名']||'')+' ／ '+String(row.pricing?.strength||'')+
      ' ／ '+String(rx?.description||row.ux17Schedule?.timing||'用法未設定');
    host.append(p);
  }
  if(!rows.length){const p=document.createElement('p');p.textContent='登録された架空薬はありません。';host.append(p);}
}
function drawPatientDrugResults(){
  const query=document.querySelector('#tabbody #patientDrugQuery');
  const host=document.querySelector('#tabbody #patientDrugResults');
  if(!query||!host)return;
  const search=query.value.trim();
  host.replaceChildren();
  if(!search){
    const p=document.createElement('p');p.className='notice';p.textContent='「架空薬」と入力して候補を表示してください。';
    host.append(p);return;
  }
  let found=0;
  state.drugs.forEach((d,i)=>{
    if(!d['薬名'].includes(search))return;found++;
    const card=document.createElement('div');card.className='patient-med-hit rx045Candidate';
    const n=document.createElement('strong');n.textContent=d['薬名'];
    const hint=document.createElement('p');hint.className='notice';hint.textContent='架空マスター候補';
    const btn=document.createElement('button');btn.type='button';btn.className='btn rx045Choose';
    btn.textContent='この銘柄を追加';
    btn.dataset.index=String(i);btn.dataset.kind='original';btn.dataset.brand='0';
    card.append(n,hint,btn);host.append(card);
  });
  if(!found){const p=document.createElement('p');p.textContent='一致する架空薬はありません。';host.append(p);}
}
function renderPatientMedications(){drawPatientMedicationList();drawPatientDrugResults();}
function renderPatientModal(){
  document.getElementById('modal')?.remove();
  const modal=document.createElement('div');
  modal.id='modal';
  const sheet=document.createElement('section');sheet.className='panel fakePatientModal';
  sheet.innerHTML='<h2>架空患者A — 処方薬</h2>'+
    '<p class="notice">患者氏名・処方薬・薬剤マスターはすべて架空です。データ保存なし。</p>'+
    '<div id="tabbody"><div class="patient-med-page">'+
    '<section class="panel"><h3>登録済み架空薬：<span id="fakeCount">0</span>件</h3><div id="fakeRegisteredList"></div></section>'+
    '<section class="panel"><h3>＋ 架空マスターから追加</h3>'+
    '<label>架空薬を検索<input type="search" id="patientDrugQuery" placeholder="架空薬" autocomplete="off"></label>'+
    '<div id="patientDrugResults"></div></section></div></div>';
  modal.append(sheet);document.getElementById('app').insertAdjacentElement('afterend',modal);
  document.getElementById('patientDrugQuery').addEventListener('input',drawPatientDrugResults);
  renderPatientMedications();
}
function drawDrugs(){
  const q=String(document.getElementById('dq')?.value||'').toLowerCase().trim();
  const host=document.getElementById('drugList');if(!host)return;
  host.replaceChildren();
  const list=document.createElement('div');list.className='drug-list';host.append(list);
  state.drugs.forEach((d,index)=>{
    if(q&&!rx038MasterSearchText(d).includes(q))return;
    const card=document.createElement('article');card.className='drug rx040TapCard';
    card.tabIndex=0;card.setAttribute('role','button');card.dataset.rx040TapEdit='1';
    const name=document.createElement('strong');name.textContent=d['薬名'];
    const pill=document.createElement('span');
    pill.className='fakePill'+(d.ux05ReviewDone?' done':'');
    pill.textContent=d.ux05ReviewDone?'確認済み':'マスター要確認';
    const info=document.createElement('p');info.className='notice';info.textContent=d['医薬品分類']||'未設定';
    card.append(pill,name,info);
    card.addEventListener('click',()=>openFakeMaster(index));
    card.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();openFakeMaster(index);}
    });
    list.append(card);
  });
}
function openFakeMaster(index){
  const d=state.drugs[index],form=document.getElementById('rx036Editor');
  if(!d||!form)return;
  form.hidden=false;form.dataset.index=String(index);
  document.getElementById('fakeMasterDrugName').value=d['薬名'];
  document.getElementById('fakeMasterCategory').value=d['医薬品分類']||'';
  document.getElementById('fakeMasterChecked').checked=d.ux05ReviewDone===true;
  document.getElementById('fakeMasterMessage').textContent='実際の薬情マスターには一切反映されません。';
  form.scrollIntoView({block:'start',behavior:'auto'});
}
function renderDrugs(){
  const main=document.getElementById('main');if(!main)return;
  main.innerHTML='<h2>薬情マスター（架空）</h2>'+
    '<div class="toolbar"><label>薬剤名で検索<input id="dq" type="search"></label></div>'+
    '<div class="rx036Actions"><p class="notice">既存の確認済みフラグを使った試験です。</p></div>'+
    '<div id="drugList"></div>'+
    '<section class="panel" id="rx036Editor" hidden>'+
    '<h3>マスターを編集（架空）</h3>'+
    '<label>薬剤名<input id="fakeMasterDrugName" type="text"></label>'+
    '<label>分類<input id="fakeMasterCategory" type="text"></label>'+
    '<label class="checkbox"><input id="fakeMasterChecked" type="checkbox">確認済みにする</label>'+
    '<p id="fakeMasterMessage" role="status" class="notice"></p>'+
    '<div class="controls"><button id="fakeMasterSave" type="button">架空マスターを保存</button>'+
    '<button id="fakeMasterCancel" type="button" class="btn secondary">変更せず閉じる</button></div></section>';
  document.getElementById('dq').addEventListener('input',drawDrugs);
  document.getElementById('fakeMasterSave').addEventListener('click',()=>{
    const editor=document.getElementById('rx036Editor'),index=Number(editor.dataset.index);
    const prev=state.drugs[index];if(!prev)return;
    const name=document.getElementById('fakeMasterDrugName').value.trim();
    if(!name){document.getElementById('fakeMasterMessage').textContent='薬剤名を入力してください。';return;}
    state.drugs[index]={...prev,'薬名':name,'医薬品分類':document.getElementById('fakeMasterCategory').value.trim(),
      ux05ReviewDone:document.getElementById('fakeMasterChecked').checked===true};
    // Mimic RX036's successful re-render after an explicit encrypted save.
    renderDrugs();
  });
  document.getElementById('fakeMasterCancel').addEventListener('click',()=>{
    document.getElementById('rx036Editor').hidden=true;
  });
  drawDrugs();
}
function render(){
  const app=document.getElementById('app');
  app.innerHTML='<header class="topbar">MSW RX050 架空テスト</header>'+
    '<main id="main"></main>'+
    '<nav class="bottomnav"><button type="button" class="navbtn" data-screen="patients">患者</button>'+
    '<button type="button" class="navbtn" data-screen="drugs">薬情</button></nav>';
  document.querySelectorAll('.bottomnav button').forEach(btn=>btn.onclick=()=>{
    screen=btn.dataset.screen;render();
    if(screen==='patients'){selectedPatient=state.patients[0];renderPatientModal();}
  });
  if(screen==='drugs')renderDrugs();
  else document.getElementById('main').innerHTML='<p class="notice">架空患者の処方薬を編集しています。</p>';
}
window.RX045={
 resolve(drugs,identity){
  if(identity?.kind!=='original'||identity.brandIndex!==0||
     !Number.isSafeInteger(identity.index)||!drugs[identity.index])return null;
  const drug=drugs[identity.index];
  return {drug:{...drug},label:'架空銘柄',origin:{type:'rx045-manual-brand',label:'架空銘柄'}};
 }
};
document.getElementById('fakeFailSave').addEventListener('change',e=>{failSave=e.target.checked;});
document.getElementById('fakeResetApp').addEventListener('click',()=>{
  state.drugs=[
    {'薬名':'架空薬A','医薬品分類':'架空分類A','薬効':'架空の説明','薬価':'',ux05ReviewDone:false},
    {'薬名':'架空薬B','医薬品分類':'架空分類B','薬効':'架空の説明','薬価':'',ux05ReviewDone:true}
  ];
  state.patients[0].medications=[];
  failSave=false;document.getElementById('fakeFailSave').checked=false;
  selectedPatient=state.patients[0];screen='patients';activeTab='medications';
  render();renderPatientModal();
});
render();renderPatientModal();
