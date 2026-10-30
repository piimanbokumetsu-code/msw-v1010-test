'use strict';
/* v05: Synthetic-only PBKDF2/AES-GCM authorization before hypothetical restore.
   No IndexedDB, patient input, file picker, network, or DB writes. */
const FakeAuthV05=(()=>{
 const te=new TextEncoder(),td=new TextDecoder();
 const named=(blob,name)=>{Object.defineProperty(blob,'name',{value:name});return blob};
 const b64=b=>{let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s)};
 const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function derive(pin,salt64){
  const km=await crypto.subtle.importKey('raw',te.encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(salt64),iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(data,key){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(data))));
  return {iv:b64(iv),ct:b64(ct)};
 }
 async function open(data,key){
  const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(data.iv)},key,unb64(data.ct));
  return JSON.parse(td.decode(out));
 }
 function photoRefs(state){
  if(!state||!Array.isArray(state.patients))throw Error('患者索引が不正');
  const ids=new Set();
  for(const p of state.patients){
   if(!Array.isArray(p.attachments||[]))throw Error('写真の一覧が不正');
   for(const a of p.attachments||[]){
    if(!a||typeof a.id!=='string'||ids.has(a.id)||!['genogram','admission'].includes(a.type)||!Number.isSafeInteger(a.order))throw Error('添付情報が不正');
    ids.add(a.id);
   }
  }
  return [...ids];
 }
 async function verify(manifest,parts,pin){
  let key,references=[];
  const report=await MSWSplitV04.verify({manifestFile:manifest,partFiles:parts,
   getReferenceIds:async core=>{
    key=await derive(pin,core.meta.salt);
    const pass=await open(core.meta.check,key);
    if(pass!==true&&pass?.ok!==true)throw Error('暗証の確認に失敗');
    references=photoRefs(await open(core.data,key));
    return references;
   }});
  let checked=0;
  for(const file of parts){
   const obj=JSON.parse(await file.text());
   if(obj.kind!=='photos')continue;
   for(const sealed of Object.values(obj.photos)){
    const photo=await open(sealed,key); // AES-GCM verifies each ciphertext/tag
    if(!photo||!Number.isSafeInteger(photo.width)||photo.width<1||
      !Number.isSafeInteger(photo.height)||photo.height<1||
      !photo.dataUrl?.startsWith('data:image/jpeg;base64,'))throw Error('写真が不正');
    checked++;
   }
  }
  if(checked!==report.photos||references.length!==checked)throw Error('写真検証件数不一致');
  return {ok:true,photos:checked,parts:report.parts};
 }
 async function fixture(){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const pin='FAKE-PIN-V05-ONLY',key=await derive(pin,b64(salt));
  const ids=['fake001','fake002','fake003','fake004'];
  const patients=[{id:'fakePatient',attachments:ids.map((id,i)=>({id,type:'admission',order:i}))}];
  const meta={salt:b64(salt),check:await seal({ok:true},key)};
  const data=await seal({patients},key);
  const encrypted=new Map();
  for(const [i,id] of ids.entries()){
   const raw=new Uint8Array(450);raw.fill(30+i);raw[0]=255;raw[1]=216;raw[448]=255;raw[449]=217;
   encrypted.set(id,await seal({dataUrl:'data:image/jpeg;base64,'+b64(raw),width:500,height:400,rotation:0},key));
  }
  const files=[];
  const manifest=await MSWSplitV04.create({meta,data,photoIds:ids,getPhoto:async id=>encrypted.get(id),
    onPart:async(desc,blob)=>files.push(named(blob,desc.name)),maxBytes:2300});
  return {manifest:named(manifest.blob,manifest.name),parts:files,pin};
 }
 async function tamperRehash(f){
  const m=JSON.parse(await f.manifest.text()),parts=f.parts.slice();
  for(let i=0;i<parts.length;i++){
   const obj=JSON.parse(await parts[i].text());
   if(obj.kind!=='photos')continue;
   const sealed=Object.values(obj.photos)[0];
   sealed.ct=(sealed.ct[0]==='A'?'B':'A')+sealed.ct.slice(1);
   const text=JSON.stringify(obj),blob=named(new Blob([text],{type:'application/json'}),parts[i].name);
   const digest=await crypto.subtle.digest('SHA-256',te.encode(text));
   m.parts[i].sha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
   m.parts[i].bytes=blob.size;parts[i]=blob;
   return {manifest:named(new Blob([JSON.stringify(m)],{type:'application/json'}),f.manifest.name),parts,pin:f.pin};
  }
  throw Error('架空写真がありません');
 }
 async function test(){
  const f=await fixture();
  const pass=await verify(f.manifest,f.parts,f.pin);
  let wrong=false,missing=false,tampered=false;
  try{await verify(f.manifest,f.parts,'INCORRECT-FAKE-PIN')}catch{wrong=true}
  try{await verify(f.manifest,f.parts.slice(1),f.pin)}catch{missing=true}
  const bad=await tamperRehash(f);
  try{await verify(bad.manifest,bad.parts,bad.pin)}catch{tampered=true}
  if(!pass.ok||pass.photos!==4||!wrong||!missing||!tampered)throw Error('自動テストの合格条件を満たしません');
  return {pass,wrong,missing,tampered};
 }
 return {test};
})();
document.getElementById('run').onclick=async()=>{
 const b=document.getElementById('run'),out=document.getElementById('result');
 b.disabled=true;out.textContent='架空データを暗号化して検証しています…';
 try{
  const x=await FakeAuthV05.test();
  out.textContent='合格\nPBKDF2・AES-GCM認証：合格\n写真 '+x.pass.photos+' 枚の暗号認証：合格\n誤った暗証番号：拒否\nファイル欠落：拒否\n改変写真（ハッシュ再計算済み）：拒否\n本番のDB・患者情報へのアクセスなし';
 }catch(e){out.textContent='テスト不合格：'+(e.message||String(e))}
 finally{b.disabled=false}
};