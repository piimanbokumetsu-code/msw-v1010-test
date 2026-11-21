/* RX050 prescription-search fake bridge.
   This self-contained harness creates and displays ONLY fictional prescriptions
   in JavaScript memory. No IndexedDB/localStorage, storage, upload, network, print
   or real patient API calls. */
'use strict';
let state={drugs:[
  {'薬名':'架空薬A','医薬品分類':'架空分類A','薬効':'架空の説明','薬価':''},
  {'薬名':'架空薬B','医薬品分類':'架空分類B','薬効':'架空の説明','薬価':''}
]};
let selectedPatient={_new:false,medications:[]};
let key=true, patientMedicationBusy=false;
let testNumber=0, failNextSave=false;
function uid(){return 'fake-rx-'+(++testNumber);}
function nowISO(){return new Date().toISOString();}
function medRows(patient){return patient.medications||[];}
async function save(){
  await Promise.resolve();
  if(failNextSave){failNextSave=false;document.querySelector('#failNext').checked=false;throw Error('架空テスト用の保存失敗');}
  // Fake success only: do not write to storage or any external application.
}
function drawPatientMedicationList(){
  const host=document.querySelector('#fakeRegisteredList');
  if(!host)return;
  host.replaceChildren();
  const drugs=medRows(selectedPatient);
  document.querySelector('#fakePatientCount').textContent=String(drugs.length);
  if(!drugs.length){const p=document.createElement('p');p.textContent='架空の登録薬はありません。';host.append(p);return;}
  for(const m of drugs){
    const p=document.createElement('p');p.className='fake-drug';
    const when=m.ux19Schedule?window.UX19DoseSchedule.resolve(m)?.description:m.ux17Schedule?.timing;
    p.textContent=String(m.drug?.['薬名']||'')+' ／ '+String(m.pricing?.strength||'')+' ／ '+String(when||'用法未確認');
    host.append(p);
  }
}
function drawPatientDrugResults(){
  const input=document.querySelector('#tabbody #patientDrugQuery'),host=document.querySelector('#tabbody #patientDrugResults');
  if(!input||!host)return;
  const q=input.value.trim();
  host.replaceChildren();
  if(!q){const p=document.createElement('p');p.className='notice';p.textContent='検索すると架空薬の候補が表示されます。';host.append(p);return;}
  let matches=0;
  state.drugs.forEach((d,i)=>{
    if(!d['薬名'].includes(q))return;
    matches++;
    const row=document.createElement('div');row.className='rx045Candidate candidate';
    const name=document.createElement('strong');name.textContent=d['薬名'];
    const btn=document.createElement('button');btn.className='btn rx045Choose';
    btn.type='button';btn.textContent='この銘柄を追加';
    btn.dataset.index=String(i);btn.dataset.kind='original';btn.dataset.brand='0';
    row.append(name,btn);host.append(row);
  });
  if(!matches){const p=document.createElement('p');p.className='notice';p.textContent='一致する架空薬はありません。';host.append(p);}
}
window.RX045={
  resolve(drugs,identity){
    if(identity?.kind!=='original'||identity?.brandIndex!==0||!Number.isSafeInteger(identity.index))return null;
    const d=drugs[identity.index];if(!d)return null;
    return {drug:{...d},label:'架空の先発品①',origin:{type:'rx045-manual-brand',label:'架空の先発品①'}};
  }
};
window.renderPatientMedications=function(){};
document.querySelector('#patientDrugQuery').addEventListener('input',drawPatientDrugResults);
document.querySelector('#failNext').addEventListener('change',event=>{failNextSave=event.target.checked;});
document.querySelector('#fakeReset').addEventListener('click',()=>{
  if(document.querySelector('#ux17Wizard')){
    document.querySelector('#ux17Wizard').remove();
  }
  selectedPatient.medications=[];
  document.querySelector('#patientDrugQuery').value='';
  failNextSave=false;document.querySelector('#failNext').checked=false;
  drawPatientMedicationList();drawPatientDrugResults();
});
drawPatientMedicationList();drawPatientDrugResults();
