/* RX02 restore rehearsal: fictional values only, separate disposable IndexedDB. */
'use strict';
window.rx02SandboxCheck=async function(){
 const prefix='rx02-scratch-restore-only-';
 const name=prefix+Date.now()+'-'+Math.random().toString(36).slice(2,9);
 const open=()=>new Promise((ok,bad)=>{
  const r=indexedDB.open(name,1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>ok(r.result);
  r.onerror=()=>bad(r.error);
 });
 const read=(db,k)=>new Promise((ok,bad)=>{
  const r=db.transaction('kv','readonly').objectStore('kv').get(k);
  r.onsuccess=()=>ok(r.result);
  r.onerror=()=>bad(r.error);
 });
 const write=(db,entries,deleted=[],abort=false)=>new Promise((ok,bad)=>{
  const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
  tx.oncomplete=ok;tx.onabort=()=>bad(tx.error||Error('試験用の中断'));tx.onerror=()=>bad(tx.error||Error('書込失敗'));
  for(const [k,v] of entries)store.put(v,k);
  for(const k of deleted)store.delete(k);
  if(abort)tx.abort();
 });
 const remove=()=>new Promise((ok,bad)=>{
  const r=indexedDB.deleteDatabase(name);
  r.onsuccess=ok;r.onerror=()=>bad(r.error);r.onblocked=()=>bad(Error('試験領域が使用中'));
 });
 let db,passed=0,error='',clean=false;
 try{
  db=await open();
  const old={patients:[{id:'架空旧'}],drugs:[{name:'架空旧薬'}]};
  const fresh={patients:[{id:'架空新',rx:{name:'架空試験薬A'}}],drugs:[{name:'架空試験薬A'}],links:{'架空新':'架空試験薬A'}};
  await write(db,[['data',old],['meta',{id:'old'}],['photo:old',{id:'old'}]]);
  if((await read(db,'data')).patients[0].id!=='架空旧')throw Error('準備が失敗しました');
  passed++;
  await write(db,[['data',fresh],['meta',{id:'new'}],['photo:new',{id:'new'}]],['photo:old']);
  if((await read(db,'data')).patients[0].id!=='架空新'||await read(db,'photo:old')!==undefined||!(await read(db,'photo:new')))throw Error('一括保存が失敗しました');
  passed++;
  if((await read(db,'data')).rx.name==='架空試験薬A'||(await read(db,'data')).links['架空新']!=='架空試験薬A')throw Error('処方・照合先の形式が不正です');
  passed++;
  let rejected=false;
  try{await write(db,[['data',{patients:[]}],['photo:partial',{id:'partial'}]],['meta'],true)}catch(_){rejected=true}
  if(!rejected||(await read(db,'data')).patients[0].id!=='架空新'||!(await read(db,'meta'))||await read(db,'photo:partial')!==undefined)throw Error('途中失敗時の巻き戻しが不完全です');
  passed++;
 }catch(e){error=e.message||'検証エラー'}
 finally{
  try{db?.close();await remove();clean=true;passed++}catch(e){error+=(error?' ／ ':'')+'一時領域の削除を確認できません：'+(e.message||'')}
 }
 return {passed,total:5,ok:passed===5&&!error,details:error,clean};
};