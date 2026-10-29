'use strict';
/* Isolated offline test; fictional ciphertext-shaped strings only.
 * Production backup files are never accepted as inputs by the test parser.
 * No IndexedDB, no network, no external dependency. */
const $=s=>document.querySelector(s);
const enc=new TextEncoder();
const MAX_TEST_BYTES=40*1024;
const ROOT='MSWDB-SPLIT-LAB-20261029';
const isUniqueName=x=>/^[A-Za-z0-9_.-]{1,120}$/.test(x);
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=v=>enc.encode(typeof v==='string'?v:JSON.stringify(v));
function download(blob,name){const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
function fictionalCipher(seed,amount){
 let x=(seed*7919+11)>>>0;const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 let out='';for(let i=0;i<amount;i++){x=(Math.imul(1664525,x)+1013904223)>>>0;out+=alphabet[x%64]}
 return out;
}
async function exportFictional(){
 const patients=[{id:'fake001',name:'架空太郎',attachments:['fake_photo_001','fake_photo_002']},{id:'fake002',name:'架空花子',attachments:['fake_photo_003','fake_photo_004']}];
 const data={iv:'test-nonce',ct:fictionalCipher(1,9000)};
 const meta={salt:'test-salt',check:{iv:'test-nonce',ct:fictionalCipher(2,80)}};
 const photoRecords=Object.fromEntries([1,2,3,4].map(i=>['fake_photo_00'+i,{iv:'test-nonce',ct:fictionalCipher(i+2,20000)}]));
 const core={format:ROOT,kind:'core',data,meta,patients,photoIds:Object.keys(photoRecords)};
 const entries=[{kind:'core',payload:core},...Object.entries(photoRecords).map(([id,cipher])=>({kind:'photo',payload:{format:ROOT,kind:'photo',id,cipher}}))];
 const chunks=[];
 for(const entry of entries){
  const serialized=JSON.stringify(entry.payload);
  if(bytes(serialized).length>MAX_TEST_BYTES)throw Error('1つの架空レコードが上限超過');
  const name='fake-backup-part-'+String(chunks.length+1).padStart(3,'0')+'.mswpart';
  chunks.push({name,serialized,sha256:await sha256(bytes(serialized)),byteLength:bytes(serialized).length,kind:entry.kind});
 }
 const manifest={format:ROOT,kind:'manifest',version:1,parts:chunks.map(({name,sha256,byteLength,kind})=>({name,sha256,byteLength,kind})),totalParts:chunks.length};
 const mName='fake-backup-manifest.json';
 $('#out').innerHTML='<p class="ok">架空パート'+chunks.length+'個とマニフェストを生成しました。各ダウンロードが保存されたか「ファイル」で確認してください。</p>';
 const d=document.createElement('div');$('#out').appendChild(d);
 for(const item of [{name:mName,serialized:JSON.stringify(manifest)},...chunks]){
  const b=document.createElement('button');b.className='secondary';b.textContent='保存：'+item.name;
  b.onclick=()=>download(new Blob([item.serialized],{type:'application/octet-stream'}),item.name);
  d.appendChild(b);d.appendChild(document.createTextNode(' '));
 }
 return manifest;
}
async function inspectFiles(fileList){
 const files=Array.from(fileList||[]);
 if(!files.length)throw Error('検証する架空ファイルを選んでください');
 if(files.length>30)throw Error('検証用のファイル数上限超過');
 if(files.some(f=>!isUniqueName(f.name)||f.size>MAX_TEST_BYTES*2))throw Error('ファイル名またはサイズが不正');
 const seen=new Map();
 for(const f of files){if(seen.has(f.name))throw Error('重複ファイル名: '+f.name);seen.set(f.name,f)}
 const manifestFile=seen.get('fake-backup-manifest.json');
 if(!manifestFile)throw Error('検証用マニフェストがありません');
 const manifest=JSON.parse(await manifestFile.text());
 if(manifest.format!==ROOT||manifest.kind!=='manifest'||manifest.version!==1||!Array.isArray(manifest.parts))throw Error('検証用マニフェストの形式が違います。本番ファイルは受け付けません');
 if(manifest.parts.length<2||manifest.parts.length>25||manifest.totalParts!==manifest.parts.length)throw Error('パート数が不正');
 if(seen.size!==manifest.parts.length+1)throw Error('必要なパートの欠落、または余分なファイルがあります');
 const names=new Set(),ids=new Set();let coreCount=0,photoCount=0,core=null;
 for(const part of manifest.parts){
  if(!part||!isUniqueName(part.name)||!part.name.endsWith('.mswpart')||names.has(part.name)||!Number.isSafeInteger(part.byteLength)||part.byteLength<1||part.byteLength>MAX_TEST_BYTES||!(/^[0-9a-f]{64}$/).test(part.sha256))throw Error('パート一覧が不正');
  names.add(part.name);const file=seen.get(part.name);if(!file)throw Error('必要なパートがありません: '+part.name);
  const b=await file.arrayBuffer();if(b.byteLength!==part.byteLength)throw Error('ファイルのサイズが違います: '+part.name);
  if(await sha256(b)!==part.sha256)throw Error('ハッシュが一致しません: '+part.name);
  const obj=JSON.parse(new TextDecoder().decode(b));
  if(obj.format!==ROOT||obj.kind!==part.kind)throw Error('パート種別が不正: '+part.name);
  if(part.kind==='core'){coreCount++;core=obj;if(!Array.isArray(obj.patients)||!Array.isArray(obj.photoIds))throw Error('患者索引が不正')}
  else if(part.kind==='photo'){photoCount++;if(!/^fake_photo_\d{3}$/.test(obj.id)||ids.has(obj.id)||!obj.cipher?.ct)throw Error('写真情報が不正');ids.add(obj.id)}
  else throw Error('未知のパート種別');
 }
 if(coreCount!==1||photoCount!==ids.size||core.photoIds.length!==ids.size||core.photoIds.some(id=>!ids.has(id)))throw Error('患者索引と写真パートの対応が不正');
 if(core.patients.some(p=>p.attachments.some(id=>!ids.has(id))))throw Error('患者写真の参照が不正');
 return {parts:manifest.parts.length,patients:core.patients.length,photos:ids.size,verified:true};
}
$('#make').onclick=async()=>{const b=$('#make');b.disabled=true;try{await exportFictional()}catch(e){$('#out').textContent='エラー: '+String(e.message||e)}finally{b.disabled=false}};
$('#check').onclick=async()=>{const el=$('#result');el.textContent='検査中…';try{const report=await inspectFiles($('#parts').files);el.className='ok';el.textContent='全パート整合性確認 合格\n架空患者 '+report.patients+' 件／架空写真 '+report.photos+' 件／ファイル '+report.parts+' 個。\n実際のデータ復元・書込みは実行していません。'}catch(e){el.className='danger';el.textContent='検査中断: '+String(e.message||e)}};
