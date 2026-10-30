'use strict';
/* v07: on-demand fake ciphertext record batching, no DB/storage/network.
  Target 8MB only. Not a real backup, nor an iPad 120MiB+ stress test. */
const FakeBoundedV07=(()=>{
 const RECORD_BYTES=256*1024,IDS=32,PART_LIMIT=1024*1024;
 const fakeIds=Array.from({length:IDS},(_,i)=>'fakePhoto_'+String(i+1).padStart(4,'0'));
 const meta={salt:'fakeSalt',check:{iv:'fakeIV',ct:'FAKECHECK'}};
 const data={iv:'fakeIV',ct:'FAKE-PATIENT-INDEX'};
 async function run(){
  let loads=0,flushed=0,maxPart=0,total=0;
  const fileNames=new Set(),descriptors=[];
  let saveCalls=0,manifestPublished=false;
  const create=await MSWSplitV04.create({
   meta,data,photoIds:fakeIds,maxBytes:PART_LIMIT,
   getPhoto:async id=>{
    if(!fakeIds.includes(id))throw Error('架空写真IDが不正');
    loads++;
    // New record is allocated only when requested, not kept in a photos map.
    return {iv:'FAKE-IV',ct:'A'.repeat(RECORD_BYTES)};
   },
   onPart:async(info,blob)=>{
    saveCalls++;
    if(blob.size!==info.bytes||blob.size>PART_LIMIT||fileNames.has(info.name))
      throw Error('分割サイズまたはファイル名が不正');
    fileNames.add(info.name);flushed++;maxPart=Math.max(maxPart,blob.size);
    total+=blob.size;
    descriptors.push({name:info.name,size:info.bytes,sha256:info.sha256});
    // Deliberately don't retain the blob; this simulates a completed
    // one-at-a-time save. The real user-controlled saving flow is future work.
   }
  });
  const manifest=JSON.parse(await create.blob.text());
  if(manifestPublished||loads!==IDS||manifest.partCount!==flushed||
   !manifest.parts.every((p,i)=>p.name===descriptors[i]?.name&&p.bytes===descriptors[i]?.size&&p.sha256===descriptors[i]?.sha256)||
   maxPart>PART_LIMIT||total<=8*1024*1024)throw Error('正常な分割・逐次処理に不一致');
  manifestPublished=true;
  // Inject failure during the 3rd output: manifest must NOT be returned.
  let failingLoads=0,failingSaves=0,manifestReturned=false,stopped=false;
  try{
   const result=await MSWSplitV04.create({
    meta,data,photoIds:fakeIds,maxBytes:PART_LIMIT,
    getPhoto:async id=>{failingLoads++;return {iv:'FAKE-IV',ct:'A'.repeat(RECORD_BYTES)}},
    onPart:async()=>{if(++failingSaves===3)throw Error('意図した保存中断')}
   });
   manifestReturned=!!result;
  }catch(e){stopped=e.message==='意図した保存中断'}
  if(!stopped||manifestReturned||failingLoads>=IDS)throw Error('途中失敗時の停止動作が不正');
  return {count:IDS,parts:flushed,totalMiB:(total/1048576).toFixed(2),maxMiB:(maxPart/1048576).toFixed(2),failureStops:true};
 }
 return {run};
})();
document.getElementById('run').onclick=async()=>{
 const b=document.getElementById('run'),status=document.getElementById('status');
 b.disabled=true;status.textContent='架空写真を順番に分割しています…';
 try{
  const result=await FakeBoundedV07.run();
  status.textContent='合格\n架空写真：'+result.count+'件\n生成した分割パート：'+result.parts+'個\n合計処理量：約'+result.totalMiB+'MiB\n最大パート：約'+result.maxMiB+'MiB\n逐次読み出し：合格\n途中の保存処理失敗：中断\n失敗時の管理ファイル発行：なし\n実際のファイル保存・患者DB変更：なし';
 }catch(e){status.textContent='テスト不合格：'+(e.message||String(e))}
 finally{b.disabled=false}
};
