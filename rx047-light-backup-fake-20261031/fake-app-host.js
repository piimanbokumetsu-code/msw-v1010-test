'use strict';
/* Completely fake independent host for RX047's actual settings wrapper,
   cryptography, file operations and IndexedDB. Clinical app never loaded. */
let key=null,state=null,screen='settings';
let chosenBlob=null,chosenName='',approved=0,maintenanceAction=null;
let dataWriteTail=Promise.resolve(),db=null;
const FAKE_DB='msw_rx047_fake_only_integration_20261031_v1';
const fakePatients=[{id:'FAKE-001',data:{'氏名':'架空患者・検証用'}}];
const sampleDrugs=[
 {'薬名':'架空薬A','薬価':'10.50','医薬品分類':'架空分類','薬効':'架空薬効',
 rx038:{ingredient:'架空成分',otherOriginals:[{name:'架空先発B',strength:'2.5mg'}]},
 rx037:{generics:[{name:'架空後発C',strength:'5mg'},{name:'架空後発D',strength:'10mg'}]},
 rx039:{groups:['架空①','架空②']}},
 {'薬名':'架空薬E','薬価':'0.00','医薬品分類':'架空分類②','薬効':'架空薬効②'}
];
const fakeMasters={'市町村':['架空町']};
const fakeSettings={autoLockMin:5,retentionDays:null};
function createFakeState(){
 return {version:'FAKE-RX047-ONLY',patients:JSON.parse(JSON.stringify(fakePatients)),
 drugs:JSON.parse(JSON.stringify(sampleDrugs)),
 masters:JSON.parse(JSON.stringify(fakeMasters)),
 settings:JSON.parse(JSON.stringify(fakeSettings)),
 journal:[{note:'架空日誌'}],updatedAt:new Date().toISOString()};
}
async function openFakeDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(FAKE_DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('records');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function idbSet(k,v){return new Promise((resolve,reject)=>{
 const tx=db.transaction('records','readwrite');tx.objectStore('records').put(v,k);
 tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('中断'));
 tx.onerror=()=>reject(tx.error||Error('保存失敗'));
})}
function idbGet(k){return new Promise((resolve,reject)=>{
 const req=db.transaction('records','readonly').objectStore('records').get(k);
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
})}
const enc=new TextEncoder(),dec=new TextDecoder();
function toB64(v){let s='';for(let i=0;i<v.length;i++)s+=String.fromCharCode(v[i]);return btoa(s)}
function fromB64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function encryptObj(v,k=key){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(v)));
 return {iv:toB64(iv),ct:toB64(new Uint8Array(encrypted))};
}
async function decryptObj(v,k=key){
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(v.iv)},k,fromB64(v.ct));
 return JSON.parse(dec.decode(plain));
}
function orderedDataWrite(callback){
 const next=dataWriteTail.then(callback);dataWriteTail=next.catch(()=>{});return next;
}
async function beginMaintenance(name){
 if(maintenanceAction||!key||!state)throw Error('管理操作が実行できません');
 maintenanceAction=name;await dataWriteTail;
}
function endMaintenance(name){if(maintenanceAction===name)maintenanceAction=null}
async function renderSettings(){
 document.getElementById('main').innerHTML='<section class="panel"><h2>設定（架空環境）</h2><button id="backup" disabled>既存バックアップ（使いません）</button></section>';
}
function download(blob,name){chosenBlob=blob;chosenName=name}
function pickFile(accept,callback){
 if(!chosenBlob||!accept.includes('.mswrx'))throw Error('架空ファイル未作成');
 const fake=new File([chosenBlob],chosenName,{type:'application/octet-stream'});
 void callback(fake);
}
window.prompt=(msg)=>{
 if(msg.includes('パスフレーズ'))return 'FAKE-Lab-Passphrase2026';
 throw Error('予期しない入力要求');
};
window.confirm=msg=>{
 if(!msg.includes('薬情だけを置換')||!msg.includes('患者情報・処方薬・写真・日誌・その他のマスターは変更しません'))throw Error('復元の確認文が不正');
 approved++;return true;
};
window.alert=(msg)=>{document.getElementById('alerts').textContent=msg};
