'use strict';
/* Isolated developer regression checks. Not loaded by index.html or sw.js.
 * Run only after split-format.js in an isolated, non-patient browser context:
 *   await MSWSplitPreflightTests.run()
 * This never opens IndexedDB, accesses patients, or downloads files.
 */
const MSWSplitPreflightTests=Object.freeze({
 async run(){
  if(typeof MSWSplitV04==='undefined')throw Error('split-format.js を先に読み込んでください');
  const results=[];
  async function test(label,fn){try{await fn();results.push({label,pass:true})}catch(e){results.push({label,pass:false,error:String(e?.message||e)})}}
  async function rejects(label,fn){
   await test(label,async()=>{let failed=false;try{await fn()}catch{failed=true}if(!failed)throw Error('不正データを拒否しませんでした')});
  }
  const encrypted={iv:'fake-iv-only',ct:'fake-ciphertext-only'};
  const photoId='fake-photo-001';
  const records=[];
  const made=await MSWSplitV04.create({
   meta:{salt:'fake-salt-only',check:encrypted},data:encrypted,photoIds:[photoId],
   getPhoto:async()=>encrypted,
   maxBytes:4096,
   onPart:async(desc,blob)=>records.push({desc,file:new File([blob],desc.name,{type:'application/json'})})
  });
  const mf=new File([made.blob],made.name,{type:'application/json'});
  const parts=records.map(r=>r.file);
  const good=()=>MSWSplitV04.verify({manifestFile:mf,partFiles:parts,getReferenceIds:async()=>[photoId]});
  await test('正常なコア+架空写真1件',async()=>{const r=await good();if(!r.verified||r.photos!==1||r.parts!==parts.length)throw Error('件数が不一致')});
  await rejects('パート欠落を拒否',()=>MSWSplitV04.verify({manifestFile:mf,partFiles:parts.slice(0,-1),getReferenceIds:async()=>[photoId]}));
  await rejects('パート重複を拒否',()=>MSWSplitV04.verify({manifestFile:mf,partFiles:[parts[0],parts[0]],getReferenceIds:async()=>[photoId]}));
  await rejects('異なる写真参照を拒否',()=>MSWSplitV04.verify({manifestFile:mf,partFiles:parts,getReferenceIds:async()=>['fake-photo-other']}));
  const bytes=await parts[0].arrayBuffer();const tamper=new Uint8Array(bytes);tamper[tamper.length-2]^=1;
  const corrupted=new File([tamper],parts[0].name,{type:'application/json'});
  await rejects('SHA-256改ざんを拒否',()=>MSWSplitV04.verify({manifestFile:mf,partFiles:[corrupted,...parts.slice(1)],getReferenceIds:async()=>[photoId]}));
  const pass=results.every(x=>x.pass);
  return Object.freeze({pass,total:results.length,results});
 }
});
