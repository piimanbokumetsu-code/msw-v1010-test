'use strict';
/* Isolated fake IndexedDB test of the exact candidate MSWImportBridge.
 No production database, real patients, photos, PINs, or external requests. */
const STORE='kv',DB_NAME='msw_fake_fullrestore_isolated_20261030_v01',P='FAKE-PIN-NOT-REAL';
const enc=new TextEncoder(),dec=new TextDecoder(),$=id=>document.getElementById(id);
let db=null,nativeDb=null,key=null,state=null,meta=null,selectedPatient=null;
let forcePostCommitUiError=false;
let dataWriteTail=Promise.resolve(),maintenance=false,approve=true,abortWhenConfirmed=false,abortNext=false,abortInjected=false,locks=0;
const confirm=()=>{if(abortWhenConfirmed)abortNext=true;return approve};
const alert=()=>{};
function dismissPhotoViewer(){if(forcePostCommitUiError)throw Error('FAKE UI update exception after atomic commit')}
function renderLock(){locks++}
async function beginMaintenance(){if(maintenance)throw Error('重複実行');maintenance=true;await dataWriteTail}
function endMaintenance(){maintenance=false}
function photoKey(id){return 'photo:'+id}
function tx(mode){
 const t=nativeDb.transaction(STORE,mode);
 if(!(abortNext&&mode==='readwrite'))return t;
 abortNext=false;
 // Inject an abort AFTER the first restored photo put has been queued,
 // so rollback tests a partially queued replacement, not an empty transaction.
 // Use native IDB methods with their real receivers for iPad Safari support.
 return new Proxy(t,{
  get(target,prop){
   if(prop==='objectStore')return name=>{
    const store=target.objectStore(name);
    return new Proxy(store,{
     get(s,k){
      if(k==='put')return (...args)=>{
       const request=s.put(...args);
       if(!abortInjected)queueMicrotask(()=>{try{target.abort();abortInjected=true}catch(e){}});
       return request;
      };
      const value=Reflect.get(s,k,s);
      return typeof value==='function'?value.bind(s):value;
     }
    });
   };
   const value=Reflect.get(target,prop,target);
   return typeof value==='function'?value.bind(target):value;
  },
  set(target,prop,value){return Reflect.set(target,prop,value,target)}
 });
}
function openDB(){return new Promise((ok,no)=>{
 const r=indexedDB.open(DB_NAME,1);
 r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
 r.onsuccess=()=>{nativeDb=r.result;db={transaction:(_s,m)=>tx(m)};ok()};
 r.onerror=()=>no(r.error);
})}
function idbGet(k){return new Promise((ok,no)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
function idbKeys(){return new Promise((ok,no)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
function idbSet(k,v){return new Promise((ok,no)=>{
 const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(v,k);
 t.oncomplete=ok;t.onerror=()=>no(t.error||Error('put fail'));t.onabort=()=>no(t.error||Error('put aborted'));
})}
function idbApplyChanges(puts,deletes=[]){return new Promise((ok,no)=>{
 const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);
 for(const [k,v] of puts)s.put(v,k);for(const k of deletes)s.delete(k);
 t.oncomplete=ok;t.onerror=()=>no(t.error||Error('change fail'));t.onabort=()=>no(t.error||Error('change abort'));
})}
function b64(a){const v=new Uint8Array(a);let s='';for(let i=0;i<v.length;i+=16384)s+=String.fromCharCode(...v.subarray(i,i+16384));return btoa(s)}
function unb64(s){return Uint8Array.from(atob(s),x=>x.charCodeAt(0))}
async function derive(pin,salt){const k=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptObj(obj,k=key){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(obj)));return {iv:b64(iv),ct:b64(ct)}}
async function decryptObj(obj,k=key){const v=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(obj.iv)},k,unb64(obj.ct));return JSON.parse(dec.decode(v))}
function removeProhibitedContactFieldsFromState(s){let removed=0,nonempty=0;for(const p of s.patients||[])for(const f of Object.keys(p.data||{})){if(/address|phone|住所|電話/i.test(f)){removed++;if(p.data[f])nonempty++;delete p.data[f]}}return {removed,nonempty}}
async function encryptPatientIndex(s,k){const c=JSON.parse(JSON.stringify(s));removeProhibitedContactFieldsFromState(c);return encryptObj(c,k)}
function validateStoredPhoto(p){if(!p||!p.dataUrl?.startsWith('data:image/jpeg;base64,')||p.width<1||p.height<1)throw Error('架空JPEG形式が不正')}
const oldData={iv:'OLD_FAKE_IV',ct:'OLD_FAKE_DATA'},oldMeta={salt:'OLD_FAKE_SALT',check:{iv:'OLD',ct:'OLD'}},oldPhoto={iv:'OLD_FAKE_IV',ct:'OLD_FAKE_PHOTO'};
async function reset(){
 abortNext=false;abortInjected=false;abortWhenConfirmed=false;approve=true;maintenance=false;locks=0;forcePostCommitUiError=false;
 key={};state={patients:[{id:'OLD_FAKE'}]};meta=oldMeta;selectedPatient=null;
 await new Promise((ok,no)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);s.clear();s.put(oldData,'data');s.put(oldMeta,'meta');s.put(oldPhoto,'photo:old_fake');t.oncomplete=ok;t.onerror=()=>no(t.error)});
}
async function oldIsIntact(){
 const a=await idbGet('data'),b=await idbGet('meta'),c=await idbGet('photo:old_fake'),ks=await idbKeys();
 if(JSON.stringify(a)!==JSON.stringify(oldData)||JSON.stringify(b)!==JSON.stringify(oldMeta)||JSON.stringify(c)!==JSON.stringify(oldPhoto))throw Error('以前の架空記録が変化');
 if(ks.some(k=>typeof k==='string'&&(k.startsWith('splitstage:')||(k.startsWith('photo:')&&k!=='photo:old_fake'))))throw Error('未完了ステージまたは新写真が残存');
}
function fakeJpeg(){const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);const dataUrl=c.toDataURL('image/jpeg',0.85);c.width=c.height=0;return {dataUrl,width:32,height:32,rotation:0}}
async function source({badAuth=false,badHash=false}={}){
 const salt=crypto.getRandomValues(new Uint8Array(16)),k=await derive(P,salt);
 const ids=['fake_photo_a','fake_photo_b'];
 const patients={patients:[{id:'FAKE_A',attachments:[{id:ids[0],type:'admission',order:0}],data:{note:'FAKE'}},{id:'FAKE_B',attachments:[{id:ids[1],type:'genogram',order:0}],data:{note:'FAKE'}}]};
 const photos={};for(const id of ids)photos[id]=await encryptObj(fakeJpeg(),k);
 if(badAuth){const v=photos[ids[1]].ct;photos[ids[1]].ct=(v[0]==='A'?'B':'A')+v.slice(1)}
 const parts=[];const r=await MSWSplitV04.create({meta:{salt:b64(salt),check:await encryptObj(true,k)},data:await encryptObj(patients,k),photoIds:ids,getPhoto:async id=>photos[id],maxBytes:4*1024*1024,onPart:async(info,blob)=>parts.push(new File([blob],info.name,{type:'application/json'}))});
 if(badHash){const v=await parts[1].text();parts[1]=new File([v.replace('"photos":{','"ph0tos":{')],parts[1].name,{type:'application/json'})}
 return {manifest:new File([r.blob],r.name,{type:'application/json'}),parts};
}
async function reject(fn,expected){let failed=false;try{await fn()}catch(e){failed=true;const description=String(e?.message||e),type=String(e?.name||'');if(expected&&!description.includes(expected)&&!type.includes(expected))throw Error('想定と異なる理由で拒否されました：'+description)}if(!failed)throw Error('拒否すべき処理が成功')}
async function success(src){
 await reset();const r=await MSWImportBridge.run(src.manifest,src.parts,P);
 if(!r.restored||r.patients!==2||r.photos!==2||locks!==1||state!==null||key!==null)throw Error('新しい架空患者・写真または再ロックが不正');
 if(await idbGet('photo:old_fake'))throw Error('旧写真が残存');
 for(const id of ['fake_photo_a','fake_photo_b'])if(!await idbGet(photoKey(id)))throw Error('新しい架空写真が未保存');
 const m=await idbGet('meta'),k=await derive(P,unb64(m.salt)),v=await decryptObj(await idbGet('data'),k);
 if(v.patients.length!==2||(await idbKeys()).some(x=>String(x).startsWith('splitstage:')))throw Error('索引または一時ファイルが不正');
}
async function postCommitUiError(src){
 await reset();forcePostCommitUiError=true;
 const r=await MSWImportBridge.run(src.manifest,src.parts,P);
 if(!r.restored||!r.uiWarning||!r.uiWarning.includes('保存済み')||key!==null||state!==null)throw Error('保存済みの復元を未完了と誤報告');
 if(await idbGet('photo:old_fake'))throw Error('旧写真が残存');
 if(!await idbGet('photo:fake_photo_a')||!await idbGet('photo:fake_photo_b'))throw Error('新写真が保存されていない');
}
async function failed(src,pin,mode){
 await reset();if(mode==='cancel')approve=false;if(mode==='abort')abortWhenConfirmed=true;
 if(mode==='cancel'){const r=await MSWImportBridge.run(src.manifest,src.parts,pin);if(!r.cancelled)throw Error('取り消しできない')}
 else await reject(()=>MSWImportBridge.run(src.manifest,src.parts,pin),mode==='abort'?undefined:mode==='tampered'?'ハッシュ検証に失敗':mode==='badPhoto'||pin!=='FAKE-PIN-NOT-REAL'?'OperationError':undefined);
 if(mode==='abort'&&!abortInjected)throw Error('実際のIndexedDB強制中断を確認できません');
 await oldIsIntact();
}
async function run(){
 const start=$('start'),summary=$('summary'),out=$('results');start.disabled=true;out.textContent='';summary.textContent='架空データを生成中';
 let good=0;
 try{
  await openDB();
  const normal=await source(),tampered=await source({badHash:true}),badPhoto=await source({badAuth:true});
  const tests=[
   ['架空患者2件・JPEG写真2件のAES-GCM完全復元',()=>success(normal)],
   ['誤った暗証番号を拒否し旧記録を保護',()=>failed(normal,'WRONG-FAKE-PIN')],
   ['SHA-256改ざんを拒否し旧記録を保護',()=>failed(tampered,P,'tampered')],
   ['写真のAES-GCM認証失敗を拒否し旧記録を保護',()=>failed(badPhoto,P,'badPhoto')],
   ['最終置き換え取り消しで旧記録を保護',()=>failed(normal,P,'cancel')],
   ['IndexedDB書込トランザクション強制中断で旧記録を保護',()=>failed(normal,P,'abort')],
   ['復元完了後の画面エラーで「未復元」と誤報告しない',()=>postCommitUiError(normal)]
  ];
  for(const [label,fn] of tests){
   try{await fn();good++;out.textContent+='✓ '+label+'：合格\n'}
   catch(e){out.textContent+='✗ '+label+'：未合格（'+(e.message||e)+'）\n'}
   summary.textContent='検証中 '+good+' / '+tests.length;await new Promise(r=>setTimeout(r,0));
  }
  summary.textContent=(good===tests.length?'合格':'未合格')+'：'+good+' / '+tests.length;
 }catch(e){summary.textContent='実行中断：'+(e.message||e)}
 finally{start.disabled=false;try{nativeDb?.close()}catch{}nativeDb=null;db=null}
}
$('start').onclick=run;
