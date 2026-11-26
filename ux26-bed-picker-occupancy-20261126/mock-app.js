/* UX26 fake-only host. Layout, normalization and picker copied byte-for-byte
 * from the current production app.js. Only artificial patients are provided. */
'use strict';
const $=query=>document.querySelector(query);
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
const BED_LAYOUT=[
  {room:'201',beds:[1,2,3,4,5,6]},
  {room:'202',beds:[1,2,3,4,5,6]},
  {room:'203',beds:[1,2,3,4,5,6,7]},
  {room:'205',beds:[1,2,3,4,5,6]},
  {room:'206',beds:[1,2,3,4,5,6]},
  {room:'207',beds:[1,2,3,4,5,6]},
  {room:'208',beds:[1,2]},
  {room:'210',beds:[1,2]},
  {room:'211',beds:['']},
  {room:'212',beds:['']},
  {room:'213',beds:['']}
];

const ICU_LAYOUT=[
  {room:'ICU1',beds:[1,2,3,4,5,6,7]},
  {room:'ICU2',beds:[1,2,3,4,5,6,7]},
  {room:'ICU3',beds:[1,2,3,4,5,6,7,8,9]}
];

function normalizeBed(v){return String(v||'').trim().replace(/\s+/g,'').replace(/[‐-‒–—―ー－]/g,'-').toUpperCase()}
function bedKey(room,n){return n===''?room:`${room}-${n}`}
function isMappedBed(v){const b=normalizeBed(v);return [...BED_LAYOUT,...ICU_LAYOUT].some(room=>room.beds.some(n=>normalizeBed(bedKey(room.room,n))===b))}

let state={patients:[
 {id:'fake-01',data:{'ベッド番号':'201-1','氏名':'架空患者A'},dischargeDate:null},
 {id:'fake-02',data:{'ベッド番号':'201-3','氏名':'架空患者B'},dischargeDate:null},
 {id:'fake-03',data:{'ベッド番号':'202-2','氏名':'架空患者C'},dischargeDate:null},
 {id:'fake-04',data:{'ベッド番号':'203-4','氏名':'架空患者D'},dischargeDate:null},
 {id:'fake-05',data:{'ベッド番号':'ICU1-2','氏名':'架空患者E'},dischargeDate:null},
 {id:'fake-06',data:{'ベッド番号':'211','氏名':'架空患者F'},dischargeDate:null},
 {id:'fake-07',data:{'ベッド番号':'203-4','氏名':'架空患者G'},dischargeDate:null},
 {id:'fake-08',data:{'ベッド番号':'201-4','氏名':'架空の退院患者'},dischargeDate:'2026-11-24'}
]};
function showGroupedBedPicker(current,onChoose,options={}){
  $('#groupedBedPicker')?.remove();
  const groups=[...BED_LAYOUT,...ICU_LAYOUT];
  const panel=`<div class="bed-picker-shade" id="groupedBedPicker" role="dialog" aria-modal="true" aria-label="ベッド配置先を選択"><div class="bed-picker-panel"><div class="bed-picker-head"><strong>ベッド配置先を選択</strong><button type="button" class="btn secondary" id="bedPickerClose">閉じる</button></div><div class="bed-picker-scroll"><div class="bed-picker-top"><button type="button" class="bed-picker-choice ${!current?'chosen':''}" data-bed="">その他・未配置</button>${options.onDischarge?`<button type="button" class="bed-picker-choice discharge-choice" id="pickerDischarge">退院</button>`:''}</div>${groups.map(r=>`<section class="bed-picker-room"><h3>${esc(r.room)}${r.room.startsWith('ICU')?'':'号室'}</h3><div class="bed-picker-grid">${r.beds.map(n=>{const b=bedKey(r.room,n);return `<button type="button" class="bed-picker-choice ${normalizeBed(current)===normalizeBed(b)?'chosen':''}" data-bed="${esc(b)}">${esc(b)}</button>`}).join('')}</div></section>`).join('')}</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',panel);
  const root=$('#groupedBedPicker');
  const close=()=>root.remove();
  root.addEventListener('click',e=>{if(e.target===root)close()});
  $('#bedPickerClose').onclick=close;if(options.onDischarge)$('#pickerDischarge').onclick=()=>{close();options.onDischarge()};
  root.querySelectorAll('[data-bed]').forEach(btn=>btn.onclick=()=>{onChoose(btn.dataset.bed);close()});
}
