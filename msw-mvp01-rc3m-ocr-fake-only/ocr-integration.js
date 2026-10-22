/* MSW MVP01 OCR bridge / 2026-10-22 / fictional test only.
   Keeps scanned photos & text in volatile memory; no upload/auto-registration.
   Uses independently hosted same-origin stage22 OCR assets. */
(()=>{
'use strict';
const ocrV2Css=document.createElement('style');ocrV2Css.textContent=".ocr-image-wrap{position:relative;width:100%;max-width:100%;line-height:0}\n.ocr-image-wrap .ocr-original{touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}\n.ocr-range-box{position:absolute;z-index:2;border:2px solid #ef7400;background:rgba(255,206,70,.27);box-sizing:border-box;pointer-events:none}\n.ocr-range-box[hidden]{display:none!important}\n.ocr-region-ui{display:flex;align-items:end;flex-wrap:wrap;gap:7px;margin:9px 0;padding:8px;border:1px solid #cae1df;border-radius:8px;background:#f4faf8}\n.ocr-region-ui label{min-width:160px;font-size:11px;margin:0}\n.ocr-region-ui select{display:block;min-height:35px;width:100%;margin-top:4px;font-size:13px}\n.ocr-guide{border:1px solid #c2e2da;border-radius:8px;padding:6px 9px;margin-bottom:8px;font-size:12px;background:#f8fdfb;line-height:1.6}\n.ocr-guide summary{font-weight:750;cursor:pointer}\n.ocr-guide ol{padding-left:23px;margin:6px 0}.ocr-guide li{margin-bottom:3px}.ocr-guide p{margin:4px 0}";ocrV2Css.textContent += "\n.ocr-crop-preview{display:block;max-width:100%;width:100%;height:auto;margin:8px 0;border:1px solid #bdd9d5;border-radius:6px;background:#fff;image-rendering:auto}.ocr-crop-preview[hidden]{display:none!important}.ocr-destination-note{font-size:11px;color:#525d6c;line-height:1.45;margin-top:3px}.ocr-crop-label{font-size:12px;font-weight:700;margin:8px 0 0}.ocr-region-ui label{min-width:min(150px,100%)}";document.head.appendChild(ocrV2Css);
const BASE = new URL('../ocr-auto-stage22/', document.baseURI);
const expected='/msw-v1010-test/ocr-auto-stage22/';
const pages=[];
let current=-1,busy=false,notice='写真を選択してください。';
let sessionEpoch=0,activeWorker=null;
const el=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=x=>String(x||'').split(/\r?\n/).map(y=>y.trim()).filter(Boolean);
function erase(){
 // Invalidate all in-flight camera loads, image decoding, and asynchronous OCR.
 sessionEpoch++;
 const active=activeWorker;activeWorker=null;
 if(active)try{void Promise.resolve(active.terminate()).catch(()=>{});}catch(_){}
 for(const p of pages)URL.revokeObjectURL(p.url);
 pages.length=0;current=-1;notice='写真を消去しました。';
}
function assertLive(p,epoch){
 if(epoch!==sessionEpoch||!pages.includes(p))throw Error('画面移動またはロックによりOCRを中断しました。');
}
function report(x){notice=x;const n=el('journalOCRStatus');if(n)n.textContent=x;}
function nextPaint(){return new Promise(resolve=>{if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>resolve());else setTimeout(resolve,0);});}
function loadScript(href){return new Promise((ok,fail)=>{const s=document.createElement('script');s.src=href;s.onload=ok;s.onerror=()=>fail(new Error('OCR部品を取得できません。通信環境と再読み込みを確認してください。'));document.head.append(s);});}
async function workerFor(epoch){
 if(location.protocol!=='https:' || BASE.origin!==location.origin || BASE.pathname!==expected)throw new Error('認識機能は承認したHTTPSテストURLでのみ動作します。');
 if(epoch!==sessionEpoch)throw Error('OCRは中断されました。');
 if(!window.MSWJournalLayout)await loadScript(new URL('layout-memory-safe.js?v=20261022c',document.baseURI).href);
 if(epoch!==sessionEpoch)throw Error('OCRは中断されました。');
 if(!window.Tesseract?.createWorker)await loadScript(new URL('ocr/tesseract.min.js',BASE).href);
 if(epoch!==sessionEpoch)throw Error('OCRは中断されました。');
 report('日本語OCRエンジンと辞書を準備しています…');
 const core=new URL('ocr/core/',BASE).href.replace(/\/$/,'');
 const lang=new URL('ocr/lang/',BASE).href.replace(/\/$/,'');
 const worker=await window.Tesseract.createWorker('jpn',1,{
  workerPath:new URL('ocr/worker.min.js',BASE).href,
  corePath:core,langPath:lang,workerBlobURL:false,gzip:true,cacheMethod:'none',
  logger:m=>{
   if(epoch!==sessionEpoch||!m||!m.status||!/loading|initializing/i.test(String(m.status)))return;
   const percent=typeof m.progress==='number'?Math.round(Math.max(0,Math.min(1,m.progress))*100):null;
   report('日本語OCR部品を準備しています…'+(percent===null?'':percent+'%'));
  }
 });
 if(epoch!==sessionEpoch){
  try{await worker.terminate();}catch(_){}
  throw Error('OCRは中断されました。');
 }
 return worker;
}
function dateISO(input){
 const t=String(input||'').normalize('NFKC').replace(/[〇○Ｏ]/g,'0').replace(/[　\s]+/g,' ');
 let y,month,day,found;
 // Dates with an explicit Western year; periods are common in scanned journals.
 found=t.match(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/);
 if(found){y=Number(found[1]);month=Number(found[2]);day=Number(found[3]);}
 else{
   // Never guess a year: support only explicitly printed Reiwa/Heisei years.
   found=t.match(/(令和|平成|R|H)\s*(元|\d{1,2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/i);
   if(!found)return '';
   const era=found[1].toUpperCase(), n=found[2]==='元'?1:Number(found[2]);
   y=n+(era==='令和'||era==='R'?2018:1988);
   month=Number(found[3]);day=Number(found[4]);
 }
 if(!Number.isInteger(y)||y<1989||y>2099)return '';
 const dt=new Date(Date.UTC(y,month-1,day));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day)return '';
 return [y,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
}
async function getImage(url){const img=new Image();img.src=url;await img.decode();return img;}
function compactCanvas(img){const max=1650,ratio=Math.min(1,max/img.width,max*1.6/img.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}
async function recognize(index){
 const p=pages[index],epoch=sessionEpoch;
 if(!p||p.approved)throw new Error('確認済みの画像は再認識で上書きできません。');
 // New attempts must not leave old OCR results marked as current if the new run fails.
 p.scanned=false;p.checked={date:false,names:false,counts:false};
 let worker=null,plan=null,img=null,generic=null;
 try{
  report(`${index+1}枚目：画像の書式を確認しています…`);
  await nextPaint();assertLive(p,epoch);
  img=await getImage(p.url);assertLive(p,epoch);
  let layoutError='';
  try{if(!window.MSWJournalLayout)await loadScript(new URL('layout-memory-safe.js?v=20261022c',document.baseURI).href);plan=window.MSWJournalLayout.inspect(img);}catch(e){layoutError=String(e?.message||e);}
  assertLive(p,epoch);
  worker=await workerFor(epoch);activeWorker=worker;assertLive(p,epoch);
  let result={date:'',admission:[],discharge:[],raw:'',mode:'全文OCR',warnings:[]};
  if(plan){
   result.mode='模擬書式の欄別OCR';
   result.warnings=plan.warnings||[];
   await worker.setParameters({tessedit_pageseg_mode:'6'});
   report(`${index+1}枚目：日付を認識しています…`);
   let crop=window.MSWJournalLayout.crop(plan.canvas,plan.dateRect,3);
   try{const o=await worker.recognize(crop);assertLive(p,epoch);result.date=dateISO(o?.data?.text);}finally{crop.width=crop.height=0;}
   await worker.setParameters({tessedit_pageseg_mode:'7'});
   for(const [kind,label] of [['admission','入院'],['discharge','退院']]){
    const found=plan[kind]?.written||[];
    for(let n=0;n<found.length;n++){
     report(`${index+1}枚目：${label}氏名 ${n+1}/${found.length} を認識しています…`);
     const sub=window.MSWJournalLayout.crop(plan.canvas,found[n].rect,0);
     try{const output=await worker.recognize(sub);assertLive(p,epoch);const value=String(output?.data?.text||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();result[kind].push(value);}finally{sub.width=sub.height=0;}
    }
   }
   result.raw=[`日付：${result.date||'（未認識）'}`,`入院：${result.admission.join('、')||'（なし）'}`,`退院：${result.discharge.join('、')||'（なし）'}`].join('\n');
  }else{
   report(`${index+1}枚目：登録外の書式のため、全文OCRを試しています…`);
   generic=compactCanvas(img);
   await worker.setParameters({tessedit_pageseg_mode:'3'});
   const data=(await worker.recognize(generic))?.data;assertLive(p,epoch);
   result.raw=String(data?.text||'').trim();
   result.warnings=[`日誌の欄位置を認識できませんでした（${layoutError.slice(0,120)}）。全文OCRのみ表示し、氏名や日付を推定・登録しません。`];
  }
  assertLive(p,epoch);
  p.date=result.date;p.admission=result.admission;p.discharge=result.discharge;p.raw=result.raw;p.mode=result.mode;p.warnings=result.warnings;p.scanned=true;p.approved=false;p.checked={date:false,names:false,counts:false};
  report(`${index+1}枚目：${result.mode}が完了。必ず写真と照合してください。`);
 }finally{
  if(generic){generic.width=0;generic.height=0;}
  if(plan?.canvas){plan.canvas.width=0;plan.canvas.height=0;}
  if(img){img.src='';img=null;}
  if(activeWorker===worker)activeWorker=null;
  if(worker)try{await worker.terminate();}catch(_){/* release if available */}
 }
}
function selectGeometry(image){
 const r=image.getBoundingClientRect(),nw=image.naturalWidth,nh=image.naturalHeight;
 const scale=Math.min(r.width/nw,r.height/nh);
 const w=nw*scale,h=nh*scale;
 return {r,left:(r.width-w)/2,top:(r.height-h)/2,w,h};
}
function localCoord(image,event){
 const g=selectGeometry(image);if(!g.w||!g.h)return null;
 const x=(event.clientX-g.r.left-g.left)/g.w,y=(event.clientY-g.r.top-g.top)/g.h;
 return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};
}
// Fixed-size temporary preview, not retained in the database.
function drawCropPreview(p,image){
 const canvas=el('ocrCropPreview');if(!canvas)return;
 const r=p?.region;
 if(!r||r.w<.018||r.h<.008||!image?.naturalWidth||!image?.naturalHeight){
  canvas.width=0;canvas.height=0;canvas.hidden=true;return;
 }
 const iw=image.naturalWidth,ih=image.naturalHeight;
 const sx=Math.min(iw-1,Math.max(0,Math.floor(r.x*iw)));
 const sy=Math.min(ih-1,Math.max(0,Math.floor(r.y*ih)));
 const sw=Math.max(1,Math.min(iw-sx,Math.ceil(r.w*iw)));
 const sh=Math.max(1,Math.min(ih-sy,Math.ceil(r.h*ih)));
 const scale=Math.min(580/sw,180/sh);
 canvas.width=Math.max(1,Math.round(sw*scale));
 canvas.height=Math.max(1,Math.round(sh*scale));
 const ctx=canvas.getContext('2d');
 if(!ctx){canvas.width=canvas.height=0;canvas.hidden=true;return;}
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
 canvas.hidden=false;
}
function drawSelection(p){
 const image=el('ocrPhotoOriginal'),box=el('ocrRangeBox');if(!image||!box)return;
 const g=selectGeometry(image);if(!p.region||!g.w){box.hidden=true;drawCropPreview(null,image);return}
 const a=p.region,b=box.style;
 b.left=(g.left+a.x*g.w)+'px';b.top=(g.top+a.y*g.h)+'px';
 b.width=(a.w*g.w)+'px';b.height=(a.h*g.h)+'px';box.hidden=false;
 drawCropPreview(p,image);
}
function selectRange(p){
 const image=el('ocrPhotoOriginal');if(!image)return;
 let start=null,pointer=null;
 image.addEventListener('pointerdown',e=>{
  if(busy||p.approved)return;
  const pos=localCoord(image,e);if(!pos)return;
  pointer=e.pointerId;start=pos;if(image.setPointerCapture)image.setPointerCapture(pointer);
  image.style.touchAction='none';e.preventDefault();
 });
 image.addEventListener('pointermove',e=>{
  if(start===null||pointer!==e.pointerId)return;const cur=localCoord(image,e);if(!cur)return;
  p.region={x:Math.min(start.x,cur.x),y:Math.min(start.y,cur.y),w:Math.abs(cur.x-start.x),h:Math.abs(cur.y-start.y)};
  drawSelection(p);e.preventDefault();
 });
 const finish=e=>{
  if(start===null||pointer!==e.pointerId)return;
  const cur=localCoord(image,e);if(cur){
   const rect={x:Math.min(start.x,cur.x),y:Math.min(start.y,cur.y),w:Math.abs(cur.x-start.x),h:Math.abs(cur.y-start.y)};
   p.region=(rect.w>=.018&&rect.h>=.008)?rect:null;
   report(p.region?'囲んだ範囲を指定できました。「選択範囲だけ再認識」を押してね。':'範囲が小さすぎます。文字の周囲を少し広めに囲んでね。');
  }
  start=null;pointer=null;image.style.touchAction='';drawSelection(p);
  const button=el('ocrRunRange');if(button)button.disabled=busy||!p.region;
 };
 image.addEventListener('pointerup',finish);image.addEventListener('pointercancel',finish);
 image.addEventListener('load',()=>drawSelection(p),{once:true});
 if(image.complete&&image.naturalWidth)drawSelection(p);
}
function closeupCanvas(image,area){
 const sx=Math.max(0,Math.floor(area.x*image.naturalWidth)),sy=Math.max(0,Math.floor(area.y*image.naturalHeight));
 const sw=Math.max(1,Math.min(image.naturalWidth-sx,Math.ceil(area.w*image.naturalWidth))),sh=Math.max(1,Math.min(image.naturalHeight-sy,Math.ceil(area.h*image.naturalHeight)));
 const scale=Math.min(2.2,2300/sw,1200/sh);
 const c=document.createElement('canvas');c.width=Math.max(1,Math.floor(sw*scale));c.height=Math.max(1,Math.floor(sh*scale));
 c.getContext('2d').drawImage(image,sx,sy,sw,sh,0,0,c.width,c.height);
 return c;
}
// Read-one-name corrections replace only the explicitly chosen row.
function applyCloseupRecognition(p,target,text,destination='append'){
 const raw=String(text??'').trim();
 if(!raw)throw Error('選択範囲から文字を読み取れませんでした。');
 if(target==='date'){
  const iso=dateISO(raw);
  if(!iso)throw Error('日付の形式を読み取れませんでした。日付欄に手入力してください。OCR原文：'+raw.slice(0,40));
  p.date=iso;return '日付を更新しました。';
 }
 if(target!=='admission'&&target!=='discharge')throw Error('再認識の対象を選び直してください。');
 const rows=words(raw).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
 if(!rows.length)throw Error('氏名を認識できませんでした。');
 if(destination==='append'){
  p[target]=[...p[target],...rows];
  return rows.length+'件の候補を追加しました。';
 }
 const m=/^replace:(\d+)$/.exec(String(destination));
 if(!m)throw Error('反映先を選び直してください。');
 const i=Number(m[1]),current=p[target];
 if(!Number.isSafeInteger(i)||!Array.isArray(current)||i<0||i>=current.length)throw Error('置き換える氏名欄が見つかりません。反映先を選び直してください。');
 if(rows.length!==1)throw Error('氏名欄の置き換えでは、1名だけ読み取れる範囲を選択してください。');
 p[target]=current.map((name,n)=>n===i?rows[0]:name);
 return (i+1)+'行目の氏名候補を置き換えました。';
}
function destinationOptions(p,target){
 if(target==='date')return '<option value="append">日付を上書き</option>';
 const list=target==='discharge'?p.discharge:p.admission;
 return '<option value="append">新しい氏名候補として追加</option>'+
  (list||[]).map((name,i)=>`<option value="replace:${i}">${i+1}行目「${safe(name||'（空欄）')}」を置き換え</option>`).join('');
}
async function recognizeCloseup(p,index){
 const epoch=sessionEpoch;
 if(!p.region)throw Error('画像上で文字の範囲を指で囲んでください。');
 assertLive(p,epoch);
 // Preserve edited fields on OCR failure, but require renewed review.
 p.checked={date:false,names:false,counts:false};p.approved=false;
 let image=null,canvas=null,worker=null;
 try{
  image=await getImage(p.url);assertLive(p,epoch);
  canvas=closeupCanvas(image,p.region);worker=await workerFor(epoch);activeWorker=worker;assertLive(p,epoch);
  const target=p.regionTarget||'admission',destination=p.regionDestination||'append';
  await worker.setParameters({tessedit_pageseg_mode:target==='date'?'7':'6'});
  report(`${index+1}枚目：囲んだ${target==='date'?'日付':target==='admission'?'入院氏名':'退院氏名'}を認識しています…`);
  const data=(await worker.recognize(canvas))?.data;assertLive(p,epoch);
  const txt=String(data?.text||'').trim();if(!txt)throw Error('範囲内の文字を検出できません。もう少し広めに囲んでください。');
  const effect=applyCloseupRecognition(p,target,txt,destination);
  p.scanned=true;p.approved=false;p.checked={date:false,names:false,counts:false};
  p.mode='部分拡大OCR（'+(target==='date'?'日付':target==='admission'?'入院':'退院')+'）';
  p.warnings=[effect,'今回の部分認識は目視確認が必要です。入退院の人数と氏名を原本と照合してください。'];
  p.raw=(p.raw?`${p.raw}\n`:'')+'【部分拡大OCR '+(target==='date'?'日付':target==='admission'?'入院':'退院')+'】'+txt;
  report(effect+' 原本と照合してから3項目を確認してください。');
 }finally{
  if(canvas){canvas.width=canvas.height=0;}
  if(image){image.src='';image=null;}
  if(activeWorker===worker)activeWorker=null;
  if(worker)try{await worker.terminate()}catch(_){}
 }
}
// Check live edit and confirmation state (not the original render snapshot).
function approvalReady(p){
 return Boolean(p&&!busy&&p.scanned&&p.date&&p.checked.date&&p.checked.names&&p.checked.counts
  &&p.admission.every(value=>String(value??'').trim())
  &&p.discharge.every(value=>String(value??'').trim()));
}
function refreshApproval(p){
 const btn=el('ocrApprove');if(!btn||!p)return;
 const complete=approvalReady(p);
 btn.disabled=!complete;
 const count=el('ocrVerifiedCount');if(count)count.textContent=[p.checked.date,p.checked.names,p.checked.counts].filter(Boolean).length+'/3 項目を確認済み';
}
function renderScanner(){
 const host=el('journalScanPreview');if(!host)return;
 const oldPreview=el('ocrCropPreview');
 if(oldPreview){oldPreview.width=oldPreview.height=0;}
 const p=pages[current];
 const cards=pages.map((x,i)=>`<button type="button" class="btn secondary ocr-page" data-n="${i}" aria-pressed="${i===current}">${i+1}枚目 ${x.approved?'確認済':x.scanned?'要確認':'未認識'}</button>`).join('');
 const approved=p?.approved&&p?.scanned;
 const regionTarget=p?.regionTarget||'admission';
 const destMarkup=p?destinationOptions(p,regionTarget):'';
 const chosenDestination=p?.regionDestination||'append';
 const complete=approvalReady(p);
 host.innerHTML=`<div class="ocr-zone"><details class="ocr-guide" open><summary>初めての操作はこちら（4つの手順）</summary><ol><li>「架空の日誌サンプル4枚を読み込む」をタップ</li><li>「この写真を日本語OCR」をタップ</li><li>文字が違うときは、左の写真の該当部分を指で囲んで、対象を選び「選択範囲だけ再認識」</li><li>右側の日付・氏名・人数を原本と照合・修正して、3つの確認にチェック（本番患者には登録しません）</li></ol><p>写真は端末内の一時メモリだけで扱います。終了時に削除してください。</p></details><div class="ocr-photo-bar">${cards}</div>
 ${p?`<div class="ocr-grid"><div><div class="ocr-image-wrap"><img id="ocrPhotoOriginal" class="ocr-original" src="${safe(p.url)}" alt="撮影した架空日誌"><span id="ocrRangeBox" class="ocr-range-box" hidden></span></div><p class="ocr-crop-label">囲んだ文字の拡大確認（選択したときだけ表示）</p><canvas id="ocrCropPreview" class="ocr-crop-preview" width="0" height="0" hidden aria-label="選択した氏名や日付の拡大表示"></canvas><p class="notice">${safe(p.file.name)}</p><p class="notice">読みたい日付・氏名の周囲を写真上で指で囲むと、その部分だけ再認識できます。</p></div><div>
 <p class="notice"><b>認識方式：</b>${safe(p.mode||'未認識')}</p>
 <div class="ocr-buttons"><button class="btn" id="journalTryOCR" ${busy?'disabled':''}>この写真を日本語OCR</button><button class="btn secondary" id="journalAllOCR" ${busy?'disabled':''}>未確認の写真を順番にOCR</button><button class="btn secondary" id="journalDiscardOCR" ${busy?'disabled':''}>写真をすべて消去</button></div>
 <div class="ocr-region-ui"><label>部分再認識の対象 <select id="ocrRegionTarget"><option value="date" ${p.regionTarget==='date'?'selected':''}>日誌の日付</option><option value="admission" ${!p.regionTarget||p.regionTarget==='admission'?'selected':''}>入院した患者の氏名</option><option value="discharge" ${p.regionTarget==='discharge'?'selected':''}>退院した患者の氏名</option></select></label><label>認識結果の反映先 <select id="ocrRegionDestination">${destMarkup}</select><span class="ocr-destination-note">誤認識の修正は「○行目を置き換え」を指定</span></label><button class="btn secondary" type="button" id="ocrRunRange" ${busy||!p.region?'disabled':''}>選択範囲だけ再認識</button><button class="btn secondary" type="button" id="ocrClearRange">範囲選択をやり直す</button></div>
 <p class="notice" id="journalOCRStatus" role="status" aria-live="polite">${safe(notice)}</p>
 ${p.warnings.length?`<p class="notice ocr-warning">${p.warnings.map(safe).join(' / ')}</p>`:''}
 <label>読み取った文字（確認・修正）<textarea id="journalOCRText" rows="5" placeholder="OCR結果がここに表示されます">${safe(p.raw)}</textarea></label>
 <p class="notice">模擬書式では入退院を抽出。異なる書式では全文のみ認識し、日付・氏名は手作業で確認してください。</p>
 <div class="ocr-fields"><label>日誌の日付<input type="date" id="ocrDate" value="${safe(p.date)}"></label><label>入院氏名（1行に1名）<textarea id="ocrAdmission" rows="3">${safe(p.admission.join('\n'))}</textarea></label><label>退院氏名（1行に1名）<textarea id="ocrDischarge" rows="3">${safe(p.discharge.join('\n'))}</textarea></label></div>
 <div class="ocr-checks"><label><input type="checkbox" id="ocrCheckDate" ${p.checked.date?'checked':''}> 日付を照合</label><label><input type="checkbox" id="ocrCheckNames" ${p.checked.names?'checked':''}> 全氏名を照合</label><label><input type="checkbox" id="ocrCheckCounts" ${p.checked.counts?'checked':''}> 入退院人数を照合</label></div>
 <p class="notice" id="ocrVerifiedCount">0/3 項目を確認済み</p><button type="button" class="btn" id="ocrApprove" ${complete&&!busy?'':'disabled'}>${approved?'確認済み（保存・登録しません）':'この写真の確認を完了（登録しません）'}</button>
 ${approved&&p.admission.length?`<div class="ocr-reviewed">${p.admission.map((name,i)=>`<button class="btn secondary ocr-copy-name" data-i="${i}">${safe(name)} → 手入力欄へ</button>`).join('')}</div>`:''}
 </div></div>`:`<p class="notice">写真はまだありません。上の「日誌の写真を選択・撮影」から架空画像を追加してください。</p>`}</div>`;
 for(const button of host.querySelectorAll('.ocr-page'))button.onclick=()=>{if(busy)return;current=Number(button.dataset.n);renderScanner();};
 if(!p)return;
 el('journalTryOCR').onclick=()=>run([current]);
 el('journalAllOCR').onclick=()=>run(pages.map((_,i)=>i).filter(i=>!pages[i].approved));
 el('journalDiscardOCR').onclick=()=>{erase();renderScanner();const n=el('journalPhotoInfo');if(n)n.textContent='';};
 el('journalOCRText').oninput=e=>{p.raw=e.target.value;p.approved=false;p.checked={date:false,names:false,counts:false};for(const k of ['ocrCheckDate','ocrCheckNames','ocrCheckCounts']){const box=el(k);if(box)box.checked=false}refreshApproval(p);};
 const destinationControl=el('ocrRegionDestination');
 if(destinationControl){
  const valid=Array.from(destinationControl.options||[]).some(o=>o.value===chosenDestination);
  destinationControl.value=valid?chosenDestination:'append';
  p.regionDestination=destinationControl.value;
  destinationControl.onchange=e=>{p.regionDestination=e.target.value;};
 }
 el('ocrRegionTarget').onchange=e=>{p.regionTarget=e.target.value;p.regionDestination='append';renderScanner();};
 el('ocrClearRange').onclick=()=>{p.region=null;drawSelection(p);el('ocrRunRange').disabled=true;report('もう一度、写真の文字の範囲を指で囲んでね。');};
 el('ocrRunRange').onclick=async()=>{
  if(busy||!p.region)return;
  const epoch=sessionEpoch;busy=true;renderScanner();let error='';
  try{await recognizeCloseup(p,current);}catch(e){error=String(e?.message||e)}
  finally{busy=false;if(epoch===sessionEpoch){renderScanner();if(error)report('部分再認識に失敗：'+error);}}
 };
 selectRange(p);refreshApproval(p);
 const invalidate=()=>{p.approved=false;p.checked={date:false,names:false,counts:false};renderScanner();};
 for(const [id,key,kind] of [['ocrDate','date','date'],['ocrAdmission','admission','names'],['ocrDischarge','discharge','names']]){
  el(id).onchange=e=>{p[key]=kind==='date'?e.target.value:words(e.target.value);invalidate();};
 }
 for(const [id,key] of [['ocrCheckDate','date'],['ocrCheckNames','names'],['ocrCheckCounts','counts']]){
  el(id).onchange=e=>{p.checked[key]=e.target.checked;p.approved=false;refreshApproval(p);};
 }
 el('ocrApprove').onclick=()=>{if(!approvalReady(p))return;p.approved=true;report('原本照合を記録しました。患者データには自動登録していません。');renderScanner();};
 for(const button of host.querySelectorAll('.ocr-copy-name'))button.onclick=()=>{
  if(!p.approved)return;
  const name=p.admission[Number(button.dataset.i)];
  if(!name)return;
  journalEntryOpen=true;window.renderJournalPreview();
  const n=el('journalNewName'),d=el('journalNewDate');if(n)n.value=name;if(d&&p.date)d.value=p.date;
  n?.scrollIntoView({block:'center',behavior:'smooth'});
 };
}
async function run(indices){
 if(busy||!indices.length)return;
 const epoch=sessionEpoch;
 busy=true;renderScanner();let attempted=0,completed=0,failures=[];
 try{
  for(const i of indices){
   if(epoch!==sessionEpoch)break;
   if(!pages[i]||pages[i].approved)continue;
   attempted++;current=i;renderScanner();
   try{await recognize(i);if(epoch===sessionEpoch)completed++;}
   catch(e){
    if(epoch!==sessionEpoch)break;
    const reason=String(e?.message||e).slice(0,150);
    failures.push(`${i+1}枚目: ${reason}`);
    const failed=pages[i];
    if(failed){
     failed.approved=false;failed.scanned=false;failed.checked={date:false,names:false,counts:false};
     failed.warnings=['今回のOCRは失敗しました。入力欄の文字が残っていても以前の結果です。原本を確認してください。',`認識エラー：${reason}`];
    }
   }
   if(epoch===sessionEpoch)renderScanner();
  }
 }finally{
  busy=false;
  // Locked/erased sessions must not render or report stale results.
  if(epoch===sessionEpoch){
   report(`${attempted}枚中 ${completed}枚でOCR処理が終了。${failures.length?'失敗：'+failures.join(' / '):'氏名・人数・日付を必ず照合してください。'}`);
   renderScanner();
  }
 }
}
function bindScanner(){
 const input=el('journalPhoto');if(!input)return;
 input.multiple=true;input.accept='image/*';
 const appendFiles=newFiles=>{
  if(!newFiles.length)return;
  if(busy){report('認識中は写真を追加できません。');return;}
  if(pages.length+newFiles.length>4){report('iPad miniのメモリ負担を避けるため、同時に4枚までに制限しています。');renderScanner();return;}
  if(newFiles.some(f=>!f.type.startsWith('image/')||f.size>15*1024*1024||!f.size)){
   report('15MB以下の画像だけ選択してください。');renderScanner();return;
  }
  for(const file of newFiles){pages.push({file,url:URL.createObjectURL(file),date:'',admission:[],discharge:[],raw:'',mode:'未認識',warnings:[],scanned:false,approved:false,checked:{date:false,names:false,counts:false}});}
  if(current<0)current=0;report(`${pages.length}枚選択しました。認識は端末上で行い、写真を患者記録には保存しません。`);
  const n=el('journalPhotoInfo');if(n)n.textContent=`写真 ${pages.length}枚（架空日誌で検証してください）`;
  renderScanner();
 };
 input.onchange=e=>{const selected=[...(e.target.files||[])];e.target.value='';appendFiles(selected);};
 // Render may run repeatedly; do not stack duplicate load controls.
 document.getElementById('ocrLoadSyntheticSamples')?.remove();
 const sample=document.createElement('button');sample.id='ocrLoadSyntheticSamples';sample.type='button';sample.className='btn secondary';sample.textContent='架空の日誌サンプル4枚を読み込む';
 sample.style.marginLeft='7px';input.parentElement.insertAdjacentElement('afterend',sample);
 sample.onclick=async()=>{
  if(busy||pages.length){report('既存写真を消去してからサンプルを読み込んでください。');return;}
  sample.disabled=true;
  const epoch=sessionEpoch;
  const names=['仮想日誌_01_2026-10-14.png','仮想日誌_02_2026-10-14.png','仮想日誌_03_2026-10-15.png','仮想日誌_04_2026-10-15.png'];
  try{
   const files=[];
   for(let i=0;i<names.length;i++){
    const url=new URL('../ocr-auto-stage22/sample/'+encodeURIComponent(names[i]),document.baseURI);
    if(url.origin!==location.origin)throw Error('同一サイトの架空画像のみ読み込めます');
    report('架空サンプルを準備しています… '+(i+1)+'/'+names.length);
    const res=await fetch(url.href,{cache:'force-cache'});
    if(epoch!==sessionEpoch)return;
    if(!res.ok)throw Error((i+1)+'枚目のサンプル画像を取得できません');
    const blob=await res.blob();if(epoch!==sessionEpoch)return;
    files.push(new File([blob],names[i],{type:'image/png'}));
   }
   if(epoch===sessionEpoch)appendFiles(files);
  }catch(e){if(epoch===sessionEpoch)report('サンプルを読み込めませんでした：'+String(e?.message||e));}
  finally{if(sample.isConnected)sample.disabled=false;}
 };
 renderScanner();
}
const originalJournal=window.renderJournalPreview;
if(typeof originalJournal==='function'){
 window.renderJournalPreview=function(){originalJournal();bindScanner();};
}
const originalLock=window.renderLock;
if(typeof originalLock==='function')window.renderLock=function(...args){erase();return originalLock(...args);};
const originalRender=window.render;
if(typeof originalRender==='function')window.render=function(...args){if(screen!=='journal'&&pages.length)erase();return originalRender(...args);};
})();
