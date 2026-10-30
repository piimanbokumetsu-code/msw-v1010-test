'use strict';
/* Fake-only integration adapter. Never reads the clinical application origin/DB.
 * Split format/export/import/selection code is unchanged from the unreleased candidate.
 * The two UI wrappers differ only by their strict test-origin guards. */
const DB_NAME='msw_fake_split_ui_integration_20261030_v01',STORE='kv';
const TEST_PIN='FAKE-TEST-ONLY-PIN',enc=new TextEncoder(),dec=new TextDecoder();
let db=null,key=null,state=null,meta=null,selectedPatient=null,dataWriteTail=Promise.resolve();
let maintenanceAction=null;const ROOT=document.getElementById('app');
const confirm=s=>window.confirm(String(s).replaceAll('本番患者データ','架空患者データ'));
const alert=s=>window.alert(String(s));
function photoKey(id){return 'photo:'+id}
function b64(a){const v=new Uint8Array(a);let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(s)}
function unb64(s){return Uint8Array.from(atob(s),x=>x.charCodeAt(0))}
async function derive(pin,salt){if(pin!==TEST_PIN)throw Error('診断PIN：入力した架空専用PINが一致していません。前後の空白も確認してください');const raw=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptObj(obj,k=key){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(obj)));return {iv:b64(iv),ct:b64(ct)}}
async function decryptObj(blob,k=key){const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},k,unb64(blob.ct));return JSON.parse(dec.decode(bytes))}
function removeProhibitedContactFieldsFromState(target){let removed=0,nonempty=0;for(const p of target?.patients||[])for(const k of Object.keys(p.data||{})){if(/住所|電話|address|phone/i.test(k)){if(String(p.data[k]??'').trim())nonempty++;delete p.data[k];removed++}}return {removed,nonempty}}
async function encryptPatientIndex(target,k){const copy=JSON.parse(JSON.stringify(target));removeProhibitedContactFieldsFromState(copy);return encryptObj(copy,k)}
function validateStoredPhoto(p){if(!p||!p.dataUrl?.startsWith('data:image/jpeg;base64,')||p.width<1||p.height<1||p.width>1800||p.height>1800||![0,90,180,270].includes(p.rotation??0))throw Error('架空写真の形式が不正');const bytes=p.dataUrl.slice(23);if(bytes.length>25*1024*1024)throw Error('画像過大');if(!bytes.startsWith('/9j/'))throw Error('JPEG開始情報が不正')}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{r.result.createObjectStore(STORE)};r.onsuccess=()=>{db=r.result;resolve()};r.onerror=()=>reject(r.error)})}
function idbGet(k){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function idbSet(k,v){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('保存できません'));tx.onabort=()=>reject(tx.error||Error('保存中断'))})}
function idbKeys(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function idbApplyChanges(puts,deletes=[]){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);for(const [k,v] of puts)s.put(v,k);for(const k of deletes)s.delete(k);t.oncomplete=resolve;t.onerror=()=>reject(t.error||Error('変更失敗'));t.onabort=()=>reject(t.error||Error('変更中断'))})}
async function beginMaintenance(name){if(maintenanceAction||!state||!key)throw Error('ロック中か別の操作中です');maintenanceAction=name;await dataWriteTail}
function endMaintenance(name){if(name===maintenanceAction)maintenanceAction=null}
function dismissPhotoViewer(){}
function fakePhoto(name){const c=document.createElement('canvas');c.width=420;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#e8f3fa';ctx.fillRect(0,0,420,180);ctx.fillStyle='#124e7b';ctx.font='bold 37px sans-serif';ctx.fillText('FAKE '+name,30,105);const dataUrl=c.toDataURL('image/jpeg',0.8);c.width=0;c.height=0;return {dataUrl,width:420,height:180,rotation:0}}
const fakeIndex=()=>({version:'FAKE-SPLIT-INTEGRATION',patients:[
 {id:'FAKE_A',name:'架空患者A',attachments:[{id:'fake_a_photo',type:'admission',order:0}],data:{note:'架空データだけ'}},
 {id:'FAKE_B',name:'架空患者B',attachments:[{id:'fake_b_photo',type:'genogram',order:0}],data:{note:'架空データだけ'}}
],drugs:[],masters:{},settings:{lastBackupAt:null}});
async function ensureFakeData(){
 meta=await idbGet('meta');if(meta)return;
 const salt=crypto.getRandomValues(new Uint8Array(16)),k=await derive(TEST_PIN,salt),initial=fakeIndex();
 const meta0={salt:b64(salt),check:await encryptObj(true,k)},data=await encryptObj(initial,k);
 const photoA=await encryptObj(fakePhoto('A'),k),photoB=await encryptObj(fakePhoto('B'),k);
 await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);s.put(meta0,'meta');s.put(data,'data');s.put(photoA,'photo:fake_a_photo');s.put(photoB,'photo:fake_b_photo');t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
 meta=meta0;
}
async function renderPhotoReview(){
 const panel=document.createElement('section');panel.id='fakePhotoReview';panel.className='panel';
 const heading=document.createElement('h3');heading.textContent='架空患者・保存済み写真の表示確認';
 panel.appendChild(heading);
 const status=document.createElement('p');status.className='note';status.setAttribute('role','status');status.textContent='保存領域から暗号化写真を確認しています…';
 panel.appendChild(status);
 ROOT.appendChild(panel);
 let expected=0,shown=0;
 try{
  for(const patient of state.patients||[]){
   const line=document.createElement('div');line.className='fake-review-patient';
   const name=document.createElement('h4');name.textContent=patient.name||patient.id;line.appendChild(name);
   panel.appendChild(line);
   for(const attachment of patient.attachments||[]){
    expected++;
    const raw=await idbGet(photoKey(attachment.id));
    if(!raw)throw Error('保存済み写真が見つかりません：'+attachment.id);
    const photo=await decryptObj(raw,key);
    validateStoredPhoto(photo);
    const img=document.createElement('img');
    img.alt=(patient.name||'架空患者')+'の架空試験写真';
    img.style.cssText='display:block;width:100%;max-width:330px;height:auto;margin:7px 0 14px;border:1px solid #abc9db;border-radius:7px';
    img.onload=()=>{shown++;status.textContent='患者 '+(state.patients||[]).length+' 名・写真 '+shown+' / '+expected+' 枚を表示'+(shown===expected?'（表示成功）':'')};
    img.onerror=()=>{status.textContent='写真の画像表示に失敗しました。確認が必要です'};
    line.appendChild(img);
    img.src=photo.dataUrl;
   }
  }
  status.textContent='患者 '+(state.patients||[]).length+' 名・写真 '+shown+' / '+expected+' 枚を表示'+(shown===expected?'（表示成功）':'（画像読み込み中）');
 }catch(e){status.textContent='架空写真の確認エラー：'+(e?.message||String(e))}
}
async function unlock(){key=await derive(TEST_PIN,unb64(meta.salt));const test=await decryptObj(meta.check,key);if(test!==true&&test?.ok!==true)throw Error('架空PINの照合に失敗');state=await decryptObj(await idbGet('data'),key);await renderSettings();await renderPhotoReview()}
function renderLock(){ROOT.innerHTML='<section class="panel"><h2>架空試験：復元後のロック状態</h2><p>架空患者データは端末の独立した保存領域にあります。</p><button id="unlockFake" class="btn">固定の架空PINでロック解除</button><p id="unlockInfo" class="note"></p></section>';document.getElementById('unlockFake').onclick=()=>unlock().catch(e=>document.getElementById('unlockInfo').textContent=String(e.message||e))}
async function renderSettings(){
 if(!state)throw Error('架空患者のロック解除が必要');
 ROOT.innerHTML='<section class="panel"><h2>統合候補・架空患者専用の設定画面</h2><p>患者2名・架空JPEG写真2枚。分割バックアップの書出と復元がここに追加されます。</p><p>バックアップ用の固定架空PIN： <code>FAKE-TEST-ONLY-PIN</code></p><p class="note">実患者情報・実際の暗証番号・既存.mswdbを絶対に選ばないでください。</p><div class="settings-row"><div>既存単体バックアップは本番候補の app.js に残したままです。<small>この架空試験画面では新しい分割機能だけを試します。</small></div><button class="btn secondary" id="backup" disabled>旧形式（この画面は対象外）</button></div></section>';
}
async function init(){
 if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!=='/msw-v1010-test/split-ui-integration-fake-20261030/')throw Error('独立試験URLに一致しません');
 if(!crypto?.subtle)throw Error('HTTPSの暗号処理を使用できません');
 await openDB();await ensureFakeData();await unlock();
}
document.addEventListener('DOMContentLoaded',()=>init().catch(e=>{ROOT.textContent='架空試験版を起動できません：'+(e.message||e)}));