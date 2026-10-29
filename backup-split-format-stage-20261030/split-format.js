'use strict';
/* Isolated technical format bridge. NEVER reads or writes a live patient database.
   Takes existing MSWDB-BACKUP v2 encrypted meta/data/photo records unchanged.
   A production restore requires extra PIN authentication and atomic DB commit. */
const MSWSplitV04=(()=>{
 const E=new TextEncoder(),D=new TextDecoder(), F='MSWDB-SPLIT-V04',P='MSWDB-SPLIT-PART-V04';
 const MAX=48*1024*1024,ID=/^[A-Za-z0-9_-]{1,100}$/;
 const err=s=>{throw Error(s)};
 const cipher=x=>!!(x&&typeof x.iv==='string'&&x.iv.length&&typeof x.ct==='string'&&x.ct.length);
 const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const id=()=>[...crypto.getRandomValues(new Uint8Array(12))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const partName=(run,n)=>'msw-split-'+run+'-'+String(n).padStart(4,'0')+'.json';
 const manifestName=run=>'msw-split-'+run+'-manifest.json';
 function coreOk(meta,data){if(!meta||!meta.salt||!cipher(meta.check)||!cipher(data))err('暗号化コアが不正')}
 function idsOk(ids){if(!Array.isArray(ids)||ids.length>2000)err('写真ID数が不正');const s=new Set();for(const x of ids){if(typeof x!=='string'||!ID.test(x)||s.has(x))err('写真IDが不正または重複');s.add(x)}}
 async function create({meta,data,photoIds,getPhoto,onPart,maxBytes=MAX}){
  coreOk(meta,data);idsOk(photoIds);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>MAX||typeof getPhoto!=='function'||typeof onPart!=='function')err('作成設定が不正');
  const run=id(), parts=[];let seq=0;
  async function emit(kind,contents,photos){
   const n=seq+1,body=JSON.stringify({format:P,version:1,run,sequence:n,kind,...contents});
   const bytes=E.encode(body);if(bytes.byteLength>maxBytes)err('単一パートがサイズ上限超過');
   const name=partName(run,n),sha256=await hash(bytes);
   await onPart({name,bytes:bytes.length,sha256,kind,sequence:n},new Blob([bytes],{type:'application/json'}));
   parts.push({name,bytes:bytes.length,sha256,kind,sequence:n,photos});seq++;
  }
  await emit('core',{meta,data},0);
  let group={},number=0;
  async function flush(){if(!number)return;await emit('photos',{photos:group},number);group={};number=0}
  for(const photoId of photoIds){
   const sealed=await getPhoto(photoId);
   if(!cipher(sealed))err('写真暗号データが不正: '+photoId);
   const candidate={...group,[photoId]:sealed};
   const raw=JSON.stringify({format:P,version:1,run,sequence:seq+1,kind:'photos',photos:candidate});
   if(E.encode(raw).length>maxBytes&&number){await flush()}
   const single=JSON.stringify({format:P,version:1,run,sequence:seq+1,kind:'photos',photos:{...group,[photoId]:sealed}});
   if(E.encode(single).length>maxBytes)err('写真1件が上限超過: '+photoId);
   group[photoId]=sealed;number++;
  }
  await flush();
  const m={format:F,version:1,sourceFormat:'MSWDB-BACKUP',sourceVersion:2,run,
   partCount:parts.length,photoCount:photoIds.length,parts};
  const mraw=JSON.stringify(m);if(E.encode(mraw).length>1024*1024)err('管理ファイルが上限超過');
  return {name:manifestName(run),blob:new Blob([mraw],{type:'application/json'}),partCount:parts.length};
 }
 async function verify({manifestFile,partFiles,getReferenceIds}){
  if(!manifestFile||manifestFile.size<10||manifestFile.size>1024*1024||typeof getReferenceIds!=='function')err('管理ファイル・検証設定が不正');
  let m;try{m=JSON.parse(await manifestFile.text())}catch{err('管理ファイルを読めません')}
  if(m.format!==F||m.version!==1||m.sourceFormat!=='MSWDB-BACKUP'||m.sourceVersion!==2||
   !/^[0-9a-f]{24}$/.test(m.run)||m.partCount<1||m.partCount>2001||
   m.partCount!==m.parts?.length||m.photoCount<0||m.photoCount>2000||
   manifestFile.name!==manifestName(m.run))err('管理ファイル形式が不正');
  const files=[...(partFiles||[])],map=new Map();
  if(files.length!==m.partCount)err('必要な分割ファイルが揃っていません');
  for(const f of files){if(!f||map.has(f.name))err('分割ファイルが重複');map.set(f.name,f)}
  let core=null;const photoIds=new Set();
  for(let i=0;i<m.parts.length;i++){
   const p=m.parts[i],kind=i?'photos':'core',file=map.get(p.name);
   if(p.name!==partName(m.run,i+1)||p.sequence!==i+1||p.kind!==kind||
      !Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX||
      !Number.isSafeInteger(p.photos)||p.photos<0||p.photos>2000||
      !/^[0-9a-f]{64}$/.test(p.sha256)||!file||file.size!==p.bytes)err('分割ファイルの構成・サイズが不正');
   const b=await file.arrayBuffer();
   if(b.byteLength!==p.bytes||await hash(b)!==p.sha256)err('ハッシュ検証に失敗');
   let obj;try{obj=JSON.parse(D.decode(b))}catch{err('分割ファイルJSONが不正')}
   if(obj.format!==P||obj.version!==1||obj.run!==m.run||obj.sequence!==i+1||obj.kind!==kind)err('異なるバックアップが混在');
   if(!i){if(p.photos!==0)err('コアに写真数あり');coreOk(obj.meta,obj.data);core={meta:obj.meta,data:obj.data}}
   else{
    if(!obj.photos||typeof obj.photos!=='object'||Array.isArray(obj.photos))err('写真データ形式が不正');
    const ids=Object.keys(obj.photos);if(!ids.length||ids.length!==p.photos)err('写真件数が不正');
    for(const id of ids){if(!ID.test(id)||photoIds.has(id)||!cipher(obj.photos[id]))err('写真のIDや暗号文が不正');photoIds.add(id)}
   }
  }
  if(photoIds.size!==m.photoCount)err('写真総数が一致しません');
  // Caller must decrypt authenticated patient index with backup PIN and
  // return referenced IDs. This prototype does not touch IndexedDB.
  const linked=await getReferenceIds(core);idsOk(linked);
  if(linked.length!==photoIds.size||linked.some(id=>!photoIds.has(id)))err('患者と写真の関連付けが不一致');
  return {verified:true,parts:m.partCount,photos:photoIds.size};
 }
 return Object.freeze({create,verify,format:F,maxPartBytes:MAX});
})();
