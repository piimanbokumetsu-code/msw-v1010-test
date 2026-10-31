'use strict';
/* KANA02 integrated fake-patient shell: no production app data or passwords. */
const FAKE_DATABASE='kana02_fake_integration_20261031_v1';
let state=null,key=null,selectedPatient=null,screen='patients',db=null,testCryptoKey=null,lastPersist=Promise.resolve(),failSaveNext=false,writes=0;
const FAKE_PATIENTS=[
 {id:'k02f01',data:{'氏名':'佐藤 花子','フリガナ':'','ベッド番号':'201-1'},furiganaConfirmed:false,dischargeDate:null},
 {id:'k02f02',data:{'氏名':'中川 明美','フリガナ':'','ベッド番号':'201-2'},furiganaConfirmed:false,dischargeDate:null},
 {id:'k02f03',data:{'氏名':'山崎 一郎','フリガナ':'ヤマサキ イチロウ','ベッド番号':'201-3'},furiganaConfirmed:true,furiganaConfirmedFor:'山崎 一郎',dischargeDate:null}
];
function nowISO(){return new Date().toISOString()}
function activePatients(){return state.patients.filter(p=>!p.dischargeDate)}
function furiganaSuggestion(name){return ''}
function renderPatients(){
 const el=document.getElementById('main');el.replaceChildren();
 const bar=document.createElement('div');bar.className='toolbar';
 const label=document.createElement('span');label.textContent='架空患者：'+activePatients().length+'名';
 const add=document.createElement('button');add.id='newP';add.type='button';add.textContent='＋患者（架空）';
 bar.append(label,add);el.append(bar);
 const summary=document.createElement('div');
 summary.id='fakeSummary';summary.className='panel';
 summary.textContent=state.patients.map(p=>p.data['氏名']+'：'+(p.data['フリガナ']||'未入力')+'（'+(window.MSWKana02?.isConfirmed(p)?'確認済み':'要確認')+'）').join(' ／ ');
 el.append(summary);
}
function openStore(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(FAKE_DATABASE,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('kv');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function putRecord(value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,'data');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
function getRecord(){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('kv','readonly');const req=tx.objectStore('kv').get('data');
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
 });
}
async function prepareFakeEncryption(){
 const secret=new TextEncoder().encode('KANA02 FAKE ONLY - NO REAL PATIENT DATA - 20261031');
 const hashed=await crypto.subtle.digest('SHA-256',secret);
 testCryptoKey=await crypto.subtle.importKey('raw',hashed,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function fakeEncrypt(value){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plain=new TextEncoder().encode(JSON.stringify(value));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},testCryptoKey,plain);
 return {iv:Array.from(iv),ciphertext:Array.from(new Uint8Array(encrypted)),kind:'KANA02-FAKE-ONLY'};
}
async function fakeDecrypt(saved){
 if(saved?.kind!=='KANA02-FAKE-ONLY')throw Error('Invalid fake file');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(saved.iv)},testCryptoKey,new Uint8Array(saved.ciphertext));
 return JSON.parse(new TextDecoder().decode(plain));
}
async function save(){
 if(!state||!key)throw Error('Not unlocked in fake shell');
 const snapshot=JSON.parse(JSON.stringify(state));
 lastPersist=(async()=>{
  if(failSaveNext){failSaveNext=false;throw Error('Intentional simulated save failure')}
  await putRecord(await fakeEncrypt(snapshot));writes++;
 })();
 return lastPersist;
}
async function bootFake(){
 db=await openStore();await prepareFakeEncryption();
 state={patients:JSON.parse(JSON.stringify(FAKE_PATIENTS)),drugs:[],masters:{},settings:{}};
 key={fake:true};renderPatients();
}
