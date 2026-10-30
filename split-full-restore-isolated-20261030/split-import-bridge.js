'use strict';
const MSWImportBridge=(()=>{
const prefix=run=>'splitstage:'+run+':';
function refs(index){if(!Array.isArray(index?.patients))throw Error('患者索引が不正');const ids=new Set();for(const p of index.patients){if(!Array.isArray(p.attachments||[]))throw Error('写真一覧が不正');let g=0;const ord=new Set();for(const a of p.attachments||[]){if(!a||typeof a.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(a.id)||ids.has(a.id)||!['genogram','admission'].includes(a.type)||!Number.isSafeInteger(a.order)||a.order<0||a.order>100000)throw Error('写真ID・添付情報が不正');if(a.type==='genogram'&&++g>1)throw Error('ジェノグラム重複');if(a.type==='admission'){if(ord.has(a.order))throw Error('入院時写真の順序重複');ord.add(a.order)}ids.add(a.id)}}return [...ids]}
async function clean(p){const keys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith(p));for(let i=0;i<keys.length;i+=50)await idbApplyChanges([],keys.slice(i,i+50))}
async function commit(p,expected,core){
const old=(await idbKeys()).filter(x=>typeof x==='string'&&x.startsWith('photo:'));
await new Promise((resolve,reject)=>{
const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);let count=0,reason='復元トランザクションが中断されました';
const r=s.openCursor(IDBKeyRange.bound(p,p+'\uffff'));
tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error(reason));tx.onabort=()=>reject(tx.error||Error(reason));
r.onerror=()=>{reason='写真の参照に失敗';tx.abort()};
r.onsuccess=()=>{const c=r.result;if(c){const id=String(c.key).slice(p.length);if(!expected.has(id)){reason='未知の写真が混在';tx.abort();return}s.put(c.value,photoKey(id));s.delete(c.key);count++;c.continue();return}if(count!==expected.size){reason='写真件数の不一致';tx.abort();return}for(const k of old)if(!expected.has(k.slice(6)))s.delete(k);s.put(core.meta,'meta');s.put(core.data,'data')};
})}
async function run(manifest,parts,pin,progress=()=>{}){
const action='分割バックアップ安全復元';await beginMaintenance(action);let stage='';
try{
if(!manifest||!Array.isArray(parts)||parts.length>2001||!pin)throw Error('ファイルまたは暗証が不正');
const m=JSON.parse(await manifest.text());if(m.format!=='MSWDB-SPLIT-V04'||!/^[0-9a-f]{24}$/.test(m.run))throw Error('管理ファイルの形式が不正');
stage=prefix(m.run);await clean(stage);
let core=null,passKey=null,index=null,photoIds=[];
const report=await MSWSplitV04.verify({manifestFile:manifest,partFiles:parts,getReferenceIds:async v=>{
core=v;passKey=await derive(pin,unb64(v.meta.salt));
const check=await decryptObj(v.meta.check,passKey);if(check!==true&&check?.ok!==true)throw Error('バックアップ暗証の確認に失敗');
index=await decryptObj(v.data,passKey);photoIds=refs(index);return photoIds}});
// Keep the production restore privacy policy: omit prohibited structured fields.
const privacyReduction=removeProhibitedContactFieldsFromState(index);
const safeCore={meta:core.meta,data:privacyReduction.removed
  ?await encryptPatientIndex(index,passKey):core.data};
const wanted=new Set(photoIds);let checked=0;
for(const file of parts){const part=JSON.parse(await file.text());if(part.kind!=='photos')continue;
for(const [id,cipher] of Object.entries(part.photos||{})){if(!wanted.has(id)||!cipher?.ct||!cipher?.iv)throw Error('写真レコードが不正');validateStoredPhoto(await decryptObj(cipher,passKey));await idbSet(stage+id,cipher);progress(++checked,report.photos)}}
if(checked!==report.photos)throw Error('写真の検査枚数が不一致');
const disclosure=privacyReduction.removed
  ?'旧バックアップの不要な構造化項目 '+privacyReduction.removed+'件（値あり '+privacyReduction.nonempty+'件）を除外して復元します。\n':'';
if(!confirm('患者'+index.patients.length+'件／写真'+checked+'件を確認しました。\n'+disclosure+
  '写真や自由記述内の住所・連絡先は自動除去されません。\n現在の本番患者データを置き換えますか？'))
  return {cancelled:true};
await dataWriteTail;await commit(stage,wanted,safeCore);
// The IndexedDB replacement is committed at this point. Never report it as
// "cancelled" or "old data unchanged" because a subsequent UI update fails.
// Invalidate the old in-memory decrypted index before touching the DOM.
meta=core.meta;key=null;state=null;selectedPatient=null;
let uiWarning='';
try{
  dismissPhotoViewer();
  document.getElementById('modal')?.remove();
  renderLock();
  alert('分割バックアップから復元しました。バックアップの暗証でロック解除してください。');
}catch(e){
  uiWarning='復元は保存済みですが画面更新に失敗しました。アプリを再読み込みしてバックアップ暗証でロック解除してください。';
  try{renderLock()}catch(_){}
}
return {restored:true,patients:index.patients.length,photos:checked,uiWarning};
}finally{if(stage)await clean(stage).catch(()=>{});endMaintenance(action)}
}
return Object.freeze({run});
})();