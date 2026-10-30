'use strict';
/* Isolated v06 — fictional-only IndexedDB, never a production database. */
const FakeAtomicV06=(()=>{
 const DB='msw_split_atomic_v06_fake_only_20261030',STORE='kv',TE=new TextEncoder(),TD=new TextDecoder();
 const b64=a=>btoa(String.fromCharCode(...a)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const named=(blob,name)=>{Object.defineProperty(blob,'name',{value:name});return blob};
 const fail=m=>{throw Error(m)};
 async function keyFor(pin,salt){
  const k=await crypto.subtle.importKey('raw',TE.encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(salt),iterations:250000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(v,k){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,TE.encode(JSON.stringify(v))));return {iv:b64(iv),ct:b64(ct)}}
 async function unlock(v,k){return JSON.parse(TD.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.ct))))}
 function refs(state){
  if(!Array.isArray(state?.patients))fail('架空患者索引が不正');
  const ids=new Set();
  for(const p of state.patients)for(const a of p.attachments||[]){
   if(!a||typeof a.id!=='string'||ids.has(a.id)||!['admission','genogram'].includes(a.type)||!Number.isSafeInteger(a.order))fail('写真参照が不正');
   ids.add(a.id);
  }
  return [...ids];
 }
 async function fakeBundle(){
  const pin='FAKE-V06-PIN-ONLY',salt=b64(crypto.getRandomValues(new Uint8Array(16))),key=await keyFor(pin,salt);
  const ids=['fake001','fake002','fake003'];
  const state={patients:[{id:'fakePatientA',attachments:ids.map((id,order)=>({id,type:'admission',order}))}]};
  const cipherPhotos=new Map();
  for(const id of ids){
   const raw=new Uint8Array(200);raw.fill(23);raw[0]=255;raw[1]=216;raw[198]=255;raw[199]=217;
   cipherPhotos.set(id,await seal({dataUrl:'data:image/jpeg;base64,'+b64(raw),width:200,height:200,rotation:0},key));
  }
  const meta={salt,check:await seal({ok:true},key)},data=await seal(state,key),files=[];
  const result=await MSWSplitV04.create({meta,data,photoIds:ids,getPhoto:async id=>cipherPhotos.get(id),onPart:async(p,blob)=>files.push(named(blob,p.name)),maxBytes:2300});
  return {manifest:named(result.blob,result.name),files,pin};
 }
 async function preflight(bundle,pin,files=bundle.files){
  let key=null,core=null,expected=null;
  const result=await MSWSplitV04.verify({manifestFile:bundle.manifest,partFiles:files,getReferenceIds:async incoming=>{
   core=incoming;key=await keyFor(pin,incoming.meta.salt);
   const check=await unlock(incoming.meta.check,key);
   if(check!==true&&check?.ok!==true)fail('暗証の確認に失敗');
   expected=refs(await unlock(incoming.data,key));return expected;
  }});
  const photos=new Map();
  for(const file of files){
   const data=JSON.parse(await file.text());
   if(data.kind!=='photos')continue;
   for(const [id,cipher] of Object.entries(data.photos)){
    const photo=await unlock(cipher,key);
    if(!photo?.dataUrl?.startsWith('data:image/jpeg;base64,')||!Number.isSafeInteger(photo.width)||!Number.isSafeInteger(photo.height))fail('写真フォーマットが不正');
    photos.set('photo:'+id,cipher);
   }
  }
  if(photos.size!==result.photos||photos.size!==expected.length)fail('写真件数が不一致');
  return {core,photos};
 }
 function openDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 })}
 function transact(db,puts,removes=[],abort=false){return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('テスト用書込中断'));
  tx.onerror=()=>reject(tx.error||Error('書込処理失敗'));
  for(const k of removes)store.delete(k);
  for(const [k,v] of puts)store.put(v,k);
  if(abort)tx.abort();
 })}
 async function snapshot(db){
  const read=(k)=>new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const keys=await new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const result={};for(const k of keys)result[k]=await read(k);return result;
 }
 async function commit(db,staged,abort=false){
  const current=await snapshot(db);
  const removes=Object.keys(current).filter(k=>k.startsWith('photo:')&&!staged.photos.has(k));
  await transact(db,[['meta',staged.core.meta],['data',staged.core.data],...staged.photos],removes,abort);
 }
 async function run(){
  const db=await openDB();
  try{
   await transact(db,[['meta',{fake:'oldMeta'}],['data',{fake:'oldIndex'}],['photo:old',{fake:'oldPhoto'}],['sentinel',{fake:true}]]);
   const before=JSON.stringify(await snapshot(db));
   const bundle=await fakeBundle();
   let rejectedMissing=false,rejectedPin=false,rejectedAbort=false;
   try{await preflight(bundle,bundle.pin,bundle.files.slice(1))}catch{rejectedMissing=true}
   if(JSON.stringify(await snapshot(db))!==before)fail('欠落後の元データ保持失敗');
   try{await preflight(bundle,'WRONG-FAKE-PIN')}catch{rejectedPin=true}
   if(JSON.stringify(await snapshot(db))!==before)fail('誤暗証後の元データ保持失敗');
   const staged=await preflight(bundle,bundle.pin);
   try{await commit(db,staged,true)}catch{rejectedAbort=true}
   if(JSON.stringify(await snapshot(db))!==before)fail('書込中断後の元データ保持失敗');
   await commit(db,staged);
   const after=await snapshot(db);
   if(!rejectedMissing||!rejectedPin||!rejectedAbort||staged.photos.size!==3||!after.sentinel?.fake||after['photo:old']||
      !after['photo:fake001']||!after['photo:fake002']||!after['photo:fake003']||
      JSON.stringify(after.meta)!==JSON.stringify(staged.core.meta)||
      JSON.stringify(after.data)!==JSON.stringify(staged.core.data))fail('成功時の全件反映に失敗');
   return {photos:staged.photos.size};
  }finally{db.close()}
 }
 return {run};
})();
document.getElementById('run').onclick=async()=>{
 const button=document.getElementById('run'),area=document.getElementById('result');
 button.disabled=true;area.textContent='架空データで検証中…';
 try{const r=await FakeAtomicV06.run();
  area.textContent='合格\n写真 '+r.photos+' 枚の認証：合格\n分割ファイル欠落：元データ保持\n誤った暗証番号：元データ保持\n書込途中の強制中断：元データ保持\n正常な復元：全件反映\n本番DBや実患者データにはアクセスなし';
 }catch(e){area.textContent='テスト不合格：'+(e.message||String(e))}
 finally{button.disabled=false}
};