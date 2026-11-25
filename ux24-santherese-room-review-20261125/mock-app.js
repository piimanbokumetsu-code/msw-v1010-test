/* UX24 fake-patient host; no persistent storage, imports, or production access. */
'use strict';
let sanThereseOnly=true;
let key={fake:true};
const BED_LAYOUT=[{room:'201',beds:[1,2,3,4,5,6]},{room:'202',beds:[1,2,3,4,5,6]},{room:'203',beds:[1,2,3,4,5,6,7]}];
const ICU_LAYOUT=[{room:'ICU3',beds:[1,2,3,4,5,6,7,8,9]}];
let state={patients:[
 {id:'fake-a',data:{'ベッド番号':'201-1','氏名':'架空患者A','入院日':'2026-11-10','主治医':'○○医師','病名':'肺炎'},notes:[{id:'old-a',type:'サン・テレーズ検討会',at:'2026-11-25T00:00:00+09:00',text:'発熱・CRP高値のため検討見送り'}],sanThereseMeeting:true,dischargeDate:null},
 {id:'fake-b',data:{'ベッド番号':'201-3','氏名':'架空患者B','入院日':'2026-11-15','主治医':'△△医師','病名':'大腿骨頸部骨折'},notes:[],sanThereseMeeting:true,dischargeDate:null},
 {id:'fake-c',data:{'ベッド番号':'203-2','氏名':'架空患者C','入院日':'2026-11-20','主治医':'□□医師','病名':'脳梗塞'},notes:[{id:'old-c',type:'サン・テレーズ検討会',at:'2026-11-24T00:00:00+09:00',text:'食事摂取量の改善を確認後に再検討'},{id:'other-c',type:'院内連携',at:'2026-11-24T00:00:00+09:00',text:'ほかの経過記録は検討会一覧には表示しない'}],sanThereseMeeting:true,dischargeDate:null},
 {id:'fake-d',data:{'ベッド番号':'ICU3-2','氏名':'架空患者D','入院日':'2026-11-22','主治医':'◇◇医師','病名':'心不全'},notes:[],sanThereseMeeting:true,dischargeDate:null},
 {id:'fake-e',data:{'ベッド番号':'','氏名':'架空患者E','入院日':'2026-11-23','主治医':'▽▽医師','病名':'誤嚥性肺炎'},notes:[],sanThereseMeeting:true,dischargeDate:null},
 {id:'fake-not-selected',data:{'ベッド番号':'202-2','氏名':'架空患者F','入院日':'2026-11-11','主治医':'医師X','病名':'骨折'},notes:[],sanThereseMeeting:false,dischargeDate:null}
]};
let fakeSavedSnapshot=JSON.stringify(state);
let fakeNoteNumber=0;
function normalizeBed(v){return String(v||'').trim().replace(/\s+/g,'').toUpperCase()}
function isMappedBed(v){const b=normalizeBed(v);return [...BED_LAYOUT,...ICU_LAYOUT].some(r=>r.beds.some(n=>normalizeBed(r.room+'-'+n)===b))}
function wardForBed(v){const b=normalizeBed(v);return !isMappedBed(v)?'その他':b.startsWith('ICU')?'ICU':'一般病棟'}
function activePatients(){return state.patients.filter(p=>!p.dischargeDate)}
function patientMatches(p,q){if(!q)return true;return ['氏名','病名','ベッド番号','主治医'].some(f=>String(p.data[f]||'').toLowerCase().includes(q))}
function uid(){return'ux24-fake-note-'+(++fakeNoteNumber)}
function nowISO(){return new Date().toISOString()}
async function save(){
 if(window.UX24MockFailNextSave){
   window.UX24MockFailNextSave=false;
   throw Error('架空の保存失敗テスト');
 }
 await Promise.resolve();
 fakeSavedSnapshot=JSON.stringify(state);
}
function drawPatientList(){
 const root=document.getElementById('patientList');
 root.textContent='既存の表示（UX24アドオンで検討会の表に切り替わります）';
}
function openPatient(patient){
 document.getElementById('mock-message').textContent='架空患者の選択：'+patient.data['氏名']+'（このプレビューでは実患者画面は開きません）';
}
