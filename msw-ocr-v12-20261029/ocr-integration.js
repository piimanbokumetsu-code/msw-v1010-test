/* MSW MVP01 OCR bridge / 2026-10-22 / fictional test only.
   Keeps scanned photos & text in volatile memory; no upload/auto-registration.
   Uses independently hosted same-origin stage22 OCR assets. */
(()=>{
'use strict';
const ocrV2Css=document.createElement('style');ocrV2Css.textContent=".ocr-image-wrap{position:relative;width:100%;max-width:100%;line-height:0}\n.ocr-image-wrap .ocr-original{touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}\n.ocr-range-box{position:absolute;z-index:2;border:2px solid #ef7400;background:rgba(255,206,70,.27);box-sizing:border-box;pointer-events:none}\n.ocr-range-box[hidden]{display:none!important}\n.ocr-region-ui{display:flex;align-items:end;flex-wrap:wrap;gap:7px;margin:9px 0;padding:8px;border:1px solid #cae1df;border-radius:8px;background:#f4faf8}\n.ocr-region-ui label{min-width:160px;font-size:11px;margin:0}\n.ocr-region-ui select{display:block;min-height:35px;width:100%;margin-top:4px;font-size:13px}\n.ocr-guide{border:1px solid #c2e2da;border-radius:8px;padding:6px 9px;margin-bottom:8px;font-size:12px;background:#f8fdfb;line-height:1.6}\n.ocr-guide summary{font-weight:750;cursor:pointer}\n.ocr-guide ol{padding-left:23px;margin:6px 0}.ocr-guide li{margin-bottom:3px}.ocr-guide p{margin:4px 0}";ocrV2Css.textContent += "\n.ocr-crop-preview{display:block;max-width:100%;width:100%;height:auto;margin:8px 0;border:1px solid #bdd9d5;border-radius:6px;background:#fff;image-rendering:auto}.ocr-crop-preview[hidden]{display:none!important}.ocr-destination-note{font-size:11px;color:#525d6c;line-height:1.45;margin-top:3px}.ocr-crop-label{font-size:12px;font-weight:700;margin:8px 0 0}.ocr-region-ui label{min-width:min(150px,100%)}";ocrV2Css.textContent += "\n.ocr-name-shortcuts{margin:8px 0 12px;padding:7px 9px;border:1px solid #c7ddd8;border-radius:8px;background:#f7fbfa}.ocr-name-shortcuts strong{display:block;font-size:12px;margin:0 0 3px}.ocr-name-list{display:grid;gap:5px;max-height:170px;overflow-y:auto;overscroll-behavior:contain}.ocr-name-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px;align-items:center;padding:4px;border:1px solid #e1eae7;border-radius:5px;background:#fff}.ocr-name-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.ocr-name-item button{padding:5px 6px;min-height:31px;font-size:11px}.ocr-name-shortcuts p{font-size:11px;margin:3px 0 6px;color:#4e6267;line-height:1.4}.ocr-name-shortcuts .ocr-name-flag{color:#a23145;font-size:11px;font-weight:700}.ocr-target-note{font-size:12px;font-weight:700;color:#087262;margin:6px 0 4px}\n@media(max-width:440px){.ocr-name-item{grid-template-columns:minmax(0,1fr) auto}.ocr-name-item button:last-child{grid-column:2}}";ocrV2Css.textContent += "\n.ocr-batch-summary{font-size:12px;font-weight:750;margin:8px 0;padding:6px 8px;border-radius:7px;background:#edf7f4;color:#15544c;line-height:1.6}";ocrV2Css.textContent += "\n.ocr-review-board{margin:7px 0 10px;padding:7px 9px;border:1px solid #b9d4d0;border-radius:8px;background:#f6fbfa}.ocr-review-board summary{cursor:pointer;font-size:13px;font-weight:800;color:#175d53}.ocr-review-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:7px;margin:8px 0}.ocr-review-card{background:#fff;border:1px solid #dae6e1;border-radius:7px;padding:8px;min-width:0}.ocr-review-card strong{font-size:12px}.ocr-review-card p{font-size:11px;margin:3px 0;line-height:1.55;overflow-wrap:anywhere}.ocr-review-card .ocr-review-caution{color:#ab4026;font-weight:700}.ocr-review-jump{font-size:12px;min-height:32px;padding:5px 8px;margin-top:4px}.ocr-review-hint{color:#405c57;font-size:11px;line-height:1.55;margin:5px 0}";ocrV2Css.textContent += ".ocr-auto-choices{grid-column:1 / -1;display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:12px;color:#9a3412}.ocr-auto-choices button{min-height:34px;padding:5px 9px;border:1px solid #bb7f22;background:#fff8e5;color:#54380d;border-radius:7px;font-size:12px}";document.head.appendChild(ocrV2Css);
const BASE = new URL('../ocr-auto-stage22/', document.baseURI);
const expected='/msw-v1010-test/ocr-auto-stage22/';
const pages=[];
let current=-1,busy=false,notice='写真を選択してください。';
let sessionEpoch=0,activeWorker=null,reviewBoardOpen=true;
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
// v11: blank/weak name rows are reprocessed automatically, without user drawing a crop.
function ocrNameCandidate(result){
 const value=String(result?.data?.text||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
 const conf=Number(result?.data?.confidence);
 return {value,confidence:Number.isFinite(conf)&&conf>=0&&conf<=100?conf:null};
}
function correctedNameCanvas(sub,variant){
 const scale=Math.min(2.3,Math.max(1,1100/Math.max(1,sub.width)),Math.max(1,300/Math.max(1,sub.height)));
 const c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(sub.width*scale));c.height=Math.max(1,Math.round(sub.height*scale));
 const ctx=c.getContext('2d',{willReadFrequently:variant==='contrast'});
 ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 ctx.drawImage(sub,0,0,c.width,c.height);
 if(variant==='contrast'){
  const pix=ctx.getImageData(0,0,c.width,c.height);
  const v=pix.data;
  for(let i=0;i<v.length;i+=4){
   const y=.299*v[i]+.587*v[i+1]+.114*v[i+2];
   const p=Math.min(255,Math.max(0,Math.round((y-35)*255/210)));
   v[i]=v[i+1]=v[i+2]=p;
  }
  ctx.putImageData(pix,0,0);
 }
 return c;
}
async function autoRetryName(worker,sub,output,epoch,page,description){
 const first=ocrNameCandidate(output);
 let best=first;
 const need=!first.value||Array.from(first.value).length<2||(first.confidence!==null&&first.confidence<70);
 if(!need)return {value:first.value,warnings:[]};
 const warnings=[];
 for(const variant of ['enlarge','contrast']){
  let c=null;
  try{
   assertLive(page,epoch);
   report(description+'：文字を自動再認識しています…');
   c=correctedNameCanvas(sub,variant);
   const result=await worker.recognize(c);
   assertLive(page,epoch);
   const next=ocrNameCandidate(result);
   if(next.value){
    const better=!best.value || (
     next.confidence!==null &&
     (best.confidence===null || next.confidence>=best.confidence+15)
    );
    if(better)best=next;
   }
   if(best.value&&best.confidence!==null&&best.confidence>=80)break;
  }catch(e){
   if(epoch!==sessionEpoch)throw e;
   warnings.push(description+'：自動再認識の一部が失敗しました。原本と照合してください。');
  }finally{if(c){c.width=0;c.height=0;}}
 }
 if(!best.value)warnings.push(description+'：氏名が空欄です。原本と照合して手入力してください。');
 else if(best.value!==first.value)warnings.push(description+'：自動再認識で候補が変わりました。原本照合が必要です。');
 else if(first.confidence===null||first.confidence<70||Array.from(first.value).length<2)
  warnings.push(description+'：文字認識が不確実です。原本と照合してください。');
 return {value:best.value,warnings};
}
// v12: An independent second reading can expose highly confident kanji mistakes.
// Suggestions are NEVER accepted as verified names without a human looking at the page.
function candidateNames(values){
 return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))].slice(0,4);
}
async function compareNameReadings(worker,layout,rect,value,epoch,page,description){
 const primary=String(value||'').trim(), alternatives=[primary],warnings=[];
 const short=Array.from(primary).length<=2;
 // Only add extra work to short/blank names or the cells already flagged by v11.
 if(!short)return {value:primary,candidates:[],warnings};
 const candidatesBefore=alternatives.length;
 const variants=['block'];
 if(!primary||Array.from(primary).length===1)variants.push('rawline');
 for(const variant of variants){
  let canvas=null;
  try{
   assertLive(page,epoch);
   report(description+'：別方式の文字認識で照合しています…');
   // Retain a little margin from the original ruled table crop.
   // Bounds are kept inside the existing corrected document canvas.
   canvas=window.MSWJournalLayout.crop(layout.canvas,rect,7);
   let input=canvas;
   if(variant==='rawline'){
    input=correctedNameCanvas(canvas,'contrast');
   }
   try{
    await worker.setParameters({tessedit_pageseg_mode:variant==='block'?'6':'13'});
    const out=await worker.recognize(input);
    assertLive(page,epoch);
    const alternative=ocrNameCandidate(out).value;
    if(alternative)alternatives.push(alternative);
   }finally{
    await worker.setParameters({tessedit_pageseg_mode:'7'});
    if(input!==canvas){input.width=0;input.height=0;}
   }
  }catch(e){
   if(epoch!==sessionEpoch)throw e;
   warnings.push(description+'：別方式の自動照合に失敗しました。原本で確認してください。');
  }finally{if(canvas){canvas.width=0;canvas.height=0;}}
 }
 const unique=candidateNames(alternatives);
 // A blank initial result may be replaced only as an UNVERIFIED OCR candidate.
 const chosen=primary || unique[0] || '';
 if(!primary&&chosen)warnings.push(description+'：空欄から自動候補が得られました。原本を必ず確認してください。');
 if(unique.length>1)warnings.push(description+'：別方式で文字が一致しません。候補を原本と比較してください。');
 if(!chosen)warnings.push(description+'：再認識しても氏名を読めません。原本で手入力してください。');
 return {value:chosen,candidates:unique.filter(v=>v!==chosen),warnings};
}
async function recognize(index){
 const p=pages[index],epoch=sessionEpoch;
 if(!p||p.approved)throw new Error('確認済みの画像は再認識で上書きできません。');
 // New attempts must not leave old OCR results marked as current if the new run fails.
 p.scanned=false;p.nameChoices=[];p.checked={date:false,names:false,counts:false};
 let worker=null,plan=null,img=null,generic=null;
 try{
  report(`${index+1}枚目：画像の書式を確認しています…`);
  await nextPaint();assertLive(p,epoch);
  img=await getImage(p.url);assertLive(p,epoch);
  let layoutError='';
  try{if(!window.MSWJournalLayout)await loadScript(new URL('layout-memory-safe.js?v=20261022c',document.baseURI).href);plan=window.MSWJournalLayout.inspect(img);}catch(e){layoutError=String(e?.message||e);}
  assertLive(p,epoch);
  worker=await workerFor(epoch);activeWorker=worker;assertLive(p,epoch);
  let result={date:'',admission:[],discharge:[],raw:'',mode:'全文OCR',warnings:[],nameChoices:[]};
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
     try{
      const output=await worker.recognize(sub);assertLive(p,epoch);
      const candidate=await autoRetryName(worker,sub,output,epoch,p,`${label}氏名 ${n+1}行目`);
      const checked=await compareNameReadings(worker,plan,found[n].rect,candidate.value,epoch,p,`${label}氏名 ${n+1}行目`);
      result[kind].push(checked.value);
      if(checked.candidates.length)result.nameChoices.push({kind,row:n,candidates:checked.candidates});
      result.warnings.push(...candidate.warnings,...checked.warnings);
     }finally{sub.width=sub.height=0;}
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
  p.date=result.date;p.admission=result.admission;p.discharge=result.discharge;p.raw=result.raw;p.mode=result.mode;p.warnings=result.warnings;p.nameChoices=result.nameChoices;p.scanned=true;p.approved=false;p.humanEdited=false;p.checked={date:false,names:false,counts:false};
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
  p.scanned=true;p.approved=false;p.humanEdited=true;p.checked={date:false,names:false,counts:false};
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
function hasOCRContents(p){
 return Boolean(p&&(p.scanned||p.humanEdited||String(p.date||'').trim()||String(p.raw||'').trim()
  ||(p.admission||[]).length||(p.discharge||[]).length));
}
function pendingBulkIndices(){
 return pages.map((p,i)=>!p.approved&&!hasOCRContents(p)?i:-1).filter(i=>i>=0);
}
// This is a read-only, review-only aggregation. Repeated dates are common
// across multiple daily sheets and are *not* treated as duplicates by themselves.
function journalReviewModel(items){
 const indexed=new Map();
 for(let i=0;i<items.length;i++){
  const item=items[i];
  const date=String(item?.date||'').trim();
  if(!date)continue;
  for(const kind of ['admission','discharge']){
   const seenOnSheet=new Set();
   for(const value of item?.[kind]||[]){
    const name=String(value??'').normalize('NFKC').replace(/[\\s　]+/g,'').trim();
    if(!name)continue;
    const key=JSON.stringify([date,kind,name]);
    if(seenOnSheet.has(key))continue;
    seenOnSheet.add(key);
    if(!indexed.has(key))indexed.set(key,[]);
    indexed.get(key).push(i);
   }
  }
 }
 const duplicateSheetIndices=new Set();
 for(const all of indexed.values())if(all.length>=2)for(const i of all)duplicateSheetIndices.add(i);
 return items.map((item,i)=>{
  const rowsA=item?.admission||[],rowsD=item?.discharge||[];
  const noDate=!String(item?.date||'').trim();
  const hasBlankName=[...rowsA,...rowsD].some(x=>!String(x??'').trim());
  const isUnknown=Boolean(item?.scanned&&item?.mode==='全文OCR');
  const issues=[];
  if(!item?.scanned)issues.push('OCR未完了');
  if(noDate)issues.push('日付未入力');
  if(hasBlankName)issues.push('氏名候補に空欄あり');
  if(isUnknown)issues.push('全文OCRのみ（氏名欄は未抽出）');
  if(duplicateSheetIndices.has(i))issues.push('同日・同区分・同氏名が別の写真にもある');
  const status=item?.approved?'確認済み':item?.scanned?'照合待ち':hasOCRContents(item)?'手入力・要確認':'未読み取り';
  return {index:i,status,date:item?.date||'',admission:rowsA.length,discharge:rowsD.length,issues,approved:Boolean(item?.approved)};
 });
}
function reviewBoardHtml(reviewRows){
 if(!reviewRows.length)return '';
 const approvalCount=reviewRows.filter(r=>r.approved).length;
 const cautionCount=reviewRows.filter(r=>r.issues.length>0).length;
 return `<details id="ocrReviewBoard" class="ocr-review-board" ${reviewBoardOpen?'open':''}>
 <summary id="ocrReviewBoardSummary">4枚まとめて照合（${approvalCount}/${reviewRows.length}枚確認済み・注意${cautionCount}枚）</summary>
 <p class="ocr-review-hint">日付と人数はOCR候補です。重複の注意は同じ日付・入退院区分・氏名が<strong>別の写真</strong>にもある場合だけ表示します。写真と照合するまで確定情報ではありません。</p>
 <div class="ocr-review-list">${reviewRows.map(r=>`<section class="ocr-review-card">
 <strong>${r.index+1}枚目：${safe(r.status)}</strong>
 <p>日付：${safe(r.date||'未入力')} ／ 入院${r.admission}名候補・退院${r.discharge}名候補</p>
 ${r.issues.length?`<p class="ocr-review-caution">${r.issues.map(safe).join('／')}</p>`:'<p>注意項目なし（原本照合は必要）</p>'}
 <button type="button" class="btn secondary ocr-review-jump" data-review-page="${r.index}" ${busy?'disabled':''}>${r.index+1}枚目を確認</button>
 </section>`).join('')}</div>
 <p class="ocr-review-hint">この一覧で患者の自動登録・保存は行いません。各写真の日付・氏名・人数を必ず原本と照合してください。</p>
 </details>`;
}
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
// Selecting the correct row is a read-only UI action unless approval was
// already finalized, in which case the user explicitly revokes verification.
function prepareNameCorrection(p,kind,index,askConfirm){
 if(!p||(kind!=='admission'&&kind!=='discharge'))return false;
 const rows=p[kind];
 if(!Array.isArray(rows)||!Number.isSafeInteger(index)||index<0||index>=rows.length)return false;
 if(p.approved){
  if(typeof askConfirm!=='function'||!askConfirm('この写真の「確認済み」を取り消して氏名を修正しますか？\\n修正後は日付・氏名・人数を再確認してください。'))return false;
  p.approved=false;
  p.checked={date:false,names:false,counts:false};
 }
 p.regionTarget=kind;
 p.regionDestination='replace:'+index;
 p.region=null; // Never reuse a different person's highlighted crop.
 return true;
}
function nameCandidateShortcuts(p,busy){
 if(!p)return '';
 const items=[];
 for(const [kind,title] of [['admission','入院'],['discharge','退院']]){
  const rows=p[kind]||[];
  for(let index=0;index<rows.length;index++){
   const candidate=String(rows[index]||'（空欄）');
   const alternatives=(p.nameChoices||[]).find(x=>x.kind===kind&&x.row===index)?.candidates||[];
   const choicesHtml=alternatives.length?'<div class="ocr-auto-choices"><b>別方式の候補（原本確認必須）</b>'+alternatives.map((v,k)=>`<button type="button" class="ocr-auto-choice" data-kind="${kind}" data-row="${index}" data-choice="${k}" ${busy?'disabled':''}>${safe(v)}</button>`).join('')+'</div>':'';
   items.push(`<div class="ocr-name-item"><span title="${safe(title+' '+(index+1)+'行目：'+candidate)}">${safe(title)} ${index+1}行目：${safe(candidate)}</span><button type="button" class="btn secondary ocr-fix-by-ocr" data-kind="${kind}" data-row="${index}" ${busy?'disabled':''}>再認識</button><button type="button" class="btn secondary ocr-fix-manual" data-kind="${kind}" data-row="${index}" ${busy?'disabled':''}>手入力</button>${choicesHtml}</div>`);
  }
 }
 return `<section class="ocr-name-shortcuts" aria-label="氏名の修正"><strong>氏名候補を行ごとに修正</strong><p>「再認識」→写真の該当氏名を指で囲んで実行。「手入力」→選んだ氏名を直接修正。</p><div class="ocr-name-list">${items.join('')||'<p>氏名候補はまだありません。下の入力欄から手入力できます。</p>'}</div>${p.approved?'<p class="ocr-name-flag">確認済みの再認識には確認取消が必要です。</p>':''}</section>`;
}
function renderScanner(){
 const host=el('journalScanPreview');if(!host)return;
 const oldPreview=el('ocrCropPreview');
 if(oldPreview){oldPreview.width=oldPreview.height=0;}
 const p=pages[current];
 const cards=pages.map((x,i)=>`<button type="button" class="btn secondary ocr-page" data-n="${i}" aria-pressed="${i===current}">${i+1}枚目 ${x.approved?'確認済':x.humanEdited?'修正済・要確認':x.scanned?'要確認':hasOCRContents(x)?'要確認':'未認識'}</button>`).join('');
 const reviewedCount=pages.filter(x=>x.approved).length;
 const pendingCount=pages.filter(x=>!x.approved&&hasOCRContents(x)).length;
 const newCount=pendingBulkIndices().length;
 const reviewRows=journalReviewModel(pages);
 const reviewBoard=reviewBoardHtml(reviewRows);
 const approved=p?.approved&&p?.scanned;
 const regionTarget=p?.regionTarget||'admission';
 const destMarkup=p?destinationOptions(p,regionTarget):'';
 const chosenDestination=p?.regionDestination||'append';
 const rowName=regionTarget==='discharge'?'退院':regionTarget==='admission'?'入院':'日付';
 const choiceIndex=/^replace:(\d+)$/.exec(chosenDestination);
 const selectionHint=choiceIndex?rowName+' '+(Number(choiceIndex[1])+1)+'行目を再認識する準備ができています。写真の文字を新しく囲んでください。':'';
 const complete=approvalReady(p);
 host.innerHTML=`<div class="ocr-zone"><details class="ocr-guide" open><summary>初めての操作はこちら（4つの手順）</summary><ol><li>「架空の日誌サンプル4枚を読み込む」をタップ</li><li>「この写真を日本語OCR」をタップ</li><li>文字が違うときは、左の写真の該当部分を指で囲んで、対象を選び「選択範囲だけ再認識」</li><li>右側の日付・氏名・人数を原本と照合・修正して、3つの確認にチェック（本番患者には登録しません）</li></ol><p>写真は端末内の一時メモリだけで扱います。終了時に削除してください。</p></details>${reviewBoard}<p class="ocr-batch-summary">全${pages.length}枚　確認済み：${reviewedCount}枚 ／ 確認待ち：${pendingCount}枚 ／ 未読み取り：${newCount}枚</p><div class="ocr-photo-bar">${cards}</div>
 ${p?`<div class="ocr-grid"><div><div class="ocr-image-wrap"><img id="ocrPhotoOriginal" class="ocr-original" src="${safe(p.url)}" alt="撮影した架空日誌"><span id="ocrRangeBox" class="ocr-range-box" hidden></span></div><p class="ocr-crop-label">囲んだ文字の拡大確認（選択したときだけ表示）</p><canvas id="ocrCropPreview" class="ocr-crop-preview" width="0" height="0" hidden aria-label="選択した氏名や日付の拡大表示"></canvas><p class="notice">${safe(p.file.name)}</p><p class="notice">読みたい日付・氏名の周囲を写真上で指で囲むと、その部分だけ再認識できます。</p></div><div>
 <p class="notice"><b>認識方式：</b>${safe(p.mode||'未認識')}</p>
 <div class="ocr-buttons"><button class="btn" id="journalTryOCR" ${busy?'disabled':''}>この写真を日本語OCR</button><button class="btn secondary" id="journalAllOCR" ${busy||!newCount?'disabled':''}>未読み取りの写真だけを一括OCR</button><button class="btn secondary" id="journalDiscardOCR" ${busy?'disabled':''}>写真をすべて消去</button></div>
 <div class="ocr-region-ui"><label>部分再認識の対象 <select id="ocrRegionTarget"><option value="date" ${p.regionTarget==='date'?'selected':''}>日誌の日付</option><option value="admission" ${!p.regionTarget||p.regionTarget==='admission'?'selected':''}>入院した患者の氏名</option><option value="discharge" ${p.regionTarget==='discharge'?'selected':''}>退院した患者の氏名</option></select></label><label>認識結果の反映先 <select id="ocrRegionDestination">${destMarkup}</select><span class="ocr-destination-note">誤認識の修正は「○行目を置き換え」を指定</span></label><button class="btn secondary" type="button" id="ocrRunRange" ${busy||!p.region?'disabled':''}>選択範囲だけ再認識</button><button class="btn secondary" type="button" id="ocrClearRange">範囲選択をやり直す</button></div>
 <p class="ocr-target-note" role="status">${safe(selectionHint)}</p><p class="notice" id="journalOCRStatus" role="status" aria-live="polite">${safe(notice)}</p>
 ${p.warnings.length?`<p class="notice ocr-warning">${p.warnings.map(safe).join(' / ')}</p>`:''}
 <label>読み取った文字（確認・修正）<textarea id="journalOCRText" rows="5" placeholder="OCR結果がここに表示されます">${safe(p.raw)}</textarea></label>
 <p class="notice">模擬書式では入退院を抽出。異なる書式では全文のみ認識し、日付・氏名は手作業で確認してください。</p>
 ${nameCandidateShortcuts(p,busy)}
 <div class="ocr-fields"><label>日誌の日付<input type="date" id="ocrDate" value="${safe(p.date)}"></label><label>入院氏名（1行に1名）<textarea id="ocrAdmission" rows="3">${safe(p.admission.join('\n'))}</textarea></label><label>退院氏名（1行に1名）<textarea id="ocrDischarge" rows="3">${safe(p.discharge.join('\n'))}</textarea></label></div>
 <div class="ocr-checks"><label><input type="checkbox" id="ocrCheckDate" ${p.checked.date?'checked':''}> 日付を照合</label><label><input type="checkbox" id="ocrCheckNames" ${p.checked.names?'checked':''}> 全氏名を照合</label><label><input type="checkbox" id="ocrCheckCounts" ${p.checked.counts?'checked':''}> 入退院人数を照合</label></div>
 <p class="notice" id="ocrVerifiedCount">0/3 項目を確認済み</p><button type="button" class="btn" id="ocrApprove" ${complete&&!busy?'':'disabled'}>${approved?'確認済み（保存・登録しません）':'この写真の確認を完了（登録しません）'}</button>
 ${approved&&p.admission.length?`<div class="ocr-reviewed">${p.admission.map((name,i)=>`<button class="btn secondary ocr-copy-name" data-i="${i}">${safe(name)} → 手入力欄へ</button>`).join('')}</div>`:''}
 </div></div>`:`<p class="notice">写真はまだありません。上の「日誌の写真を選択・撮影」から架空画像を追加してください。</p>`}</div>`;
 const reviewSummary=el('ocrReviewBoardSummary');
 if(reviewSummary)reviewSummary.onclick=()=>{const board=el('ocrReviewBoard');reviewBoardOpen=!board?.open;};
 for(const button of host.querySelectorAll('.ocr-review-jump'))button.onclick=()=>{
  if(busy)return;
  const n=Number(button.dataset.reviewPage);
  if(!Number.isSafeInteger(n)||n<0||n>=pages.length)return;
  current=n;renderScanner();
  el('ocrPhotoOriginal')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 };
 for(const button of host.querySelectorAll('.ocr-page'))button.onclick=()=>{if(busy)return;current=Number(button.dataset.n);renderScanner();};
 if(!p)return;
 el('journalTryOCR').onclick=()=>{
  if(busy)return;
  if(p.approved){report('確認済みの写真です。修正する場合は氏名候補の「再認識」または「手入力」を使ってください。');return;}
  if(hasOCRContents(p)&&!confirm('この写真をもう一度OCRすると、手修正済みの氏名や日付を含む現在の結果が上書きされます。\n再認識しますか？'))return;
  void run([current],{explicitRetry:true});
 };
 el('journalAllOCR').onclick=()=>{
  const todo=pendingBulkIndices();
  if(!todo.length){report('未読み取りの写真はありません。修正済みの結果は保護されています。');return;}
  void run(todo);
 };
 el('journalDiscardOCR').onclick=()=>{erase();renderScanner();const n=el('journalPhotoInfo');if(n)n.textContent='';};
 el('journalOCRText').oninput=e=>{p.raw=e.target.value;p.humanEdited=true;p.approved=false;p.checked={date:false,names:false,counts:false};for(const k of ['ocrCheckDate','ocrCheckNames','ocrCheckCounts']){const box=el(k);if(box)box.checked=false}refreshApproval(p);};
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
 const invalidate=()=>{p.humanEdited=true;p.nameChoices=[];p.approved=false;p.checked={date:false,names:false,counts:false};renderScanner();};
 for(const [id,key,kind] of [['ocrDate','date','date'],['ocrAdmission','admission','names'],['ocrDischarge','discharge','names']]){
  el(id).onchange=e=>{p[key]=kind==='date'?e.target.value:words(e.target.value);invalidate();};
 }
 for(const [id,key] of [['ocrCheckDate','date'],['ocrCheckNames','names'],['ocrCheckCounts','counts']]){
  el(id).onchange=e=>{p.checked[key]=e.target.checked;p.approved=false;refreshApproval(p);};
 }
 // Candidate suggestions never count as verification. Explicit tap changes only one row.
 for(const btn of host.querySelectorAll('.ocr-auto-choice'))btn.onclick=()=>{
  if(busy)return;
  const kind=btn.dataset.kind,row=Number(btn.dataset.row),choice=Number(btn.dataset.choice);
  if(!['admission','discharge'].includes(kind)||!Number.isSafeInteger(row)||!Number.isSafeInteger(choice))return;
  const entry=(p.nameChoices||[]).find(x=>x.kind===kind&&x.row===row);
  const selected=entry?.candidates?.[choice];
  if(!selected||!Array.isArray(p[kind])||row<0||row>=p[kind].length)return;
  if(p.approved&&!confirm('確認済みを取り消し、原本と照合した認識候補へ変更しますか？'))return;
  p[kind][row]=selected;
  p.humanEdited=true;p.approved=false;
  p.checked={date:false,names:false,counts:false};
  p.nameChoices=[];
  p.warnings.push((kind==='admission'?'入院':'退院')+(row+1)+'行目：候補を選びました。原本の照合が必要です。');
  p.raw=['日付：'+(p.date||'（未認識）'),'入院：'+(p.admission.join('、')||'（なし）'),'退院：'+(p.discharge.join('、')||'（なし）')].join('\n');
  renderScanner();
 };
 // Quick correction: explicitly target the selected row, never append by default.
 for(const btn of host.querySelectorAll('.ocr-fix-by-ocr'))btn.onclick=()=>{
  if(busy)return;
  const kind=btn.dataset.kind,index=Number(btn.dataset.row);
  if(!prepareNameCorrection(p,kind,index,message=>confirm(message)))return;
  renderScanner();
  report((kind==='admission'?'入院':'退院')+'の'+(index+1)+'行目を修正します。写真で該当する文字を囲んで「選択範囲だけ再認識」を押してください。');
  el('ocrPhotoOriginal')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 };
 // Manual correction places the caret on exactly the candidate's original line.
 for(const btn of host.querySelectorAll('.ocr-fix-manual'))btn.onclick=()=>{
  if(busy)return;
  const kind=btn.dataset.kind,index=Number(btn.dataset.row);
  const list=p[kind],field=el(kind==='admission'?'ocrAdmission':'ocrDischarge');
  if(!field||!Array.isArray(list)||index<0||index>=list.length)return;
  if(p.approved){
   if(!confirm('この写真の確認済みを取り消して手入力で修正しますか？'))return;
   p.approved=false;p.checked={date:false,names:false,counts:false};
   refreshApproval(p);
  }
  const start=list.slice(0,index).reduce((n,s)=>n+String(s).length+1,0);
  const end=start+String(list[index]).length;
  field.focus();
  field.setSelectionRange?.(start,end);
  field.scrollIntoView?.({block:'nearest'});
  report((kind==='admission'?'入院':'退院')+' '+(index+1)+'行目を選択しました。編集後は原本と再照合してください。');
 };
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
async function run(indices,{explicitRetry=false}={}){
 if(busy||!indices.length)return;
 const epoch=sessionEpoch;
 busy=true;renderScanner();let attempted=0,completed=0,failures=[];
 try{
  for(const i of indices){
   if(epoch!==sessionEpoch)break;
   if(!pages[i]||pages[i].approved)continue;
   if(!explicitRetry&&hasOCRContents(pages[i]))continue;
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
  for(const file of newFiles){pages.push({file,url:URL.createObjectURL(file),date:'',admission:[],discharge:[],raw:'',mode:'未認識',warnings:[],scanned:false,approved:false,humanEdited:false,checked:{date:false,names:false,counts:false}});}
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
 // OCR v10 preflight: check Japanese Tesseract worker startup without a photo.
 // No patient data is read or written; the temporary worker is terminated.
 document.getElementById('ocrEnginePreflight')?.remove();
 document.getElementById('ocrEnginePreflightStatus')?.remove();
 const diagnostic=document.createElement('button');
 diagnostic.id='ocrEnginePreflight';
 diagnostic.type='button';
 diagnostic.className='btn secondary';
 diagnostic.style.marginLeft='7px';
 diagnostic.textContent='日本語OCRエンジンの起動診断';
 sample.insertAdjacentElement('afterend',diagnostic);
 const diagStatus=document.createElement('div');
 diagStatus.id='ocrEnginePreflightStatus';
 diagStatus.className='notice';
 diagStatus.setAttribute('role','status');
 diagStatus.setAttribute('aria-live','polite');
 diagStatus.style.cssText='margin:6px 0;padding:7px;font-size:12px;line-height:1.5';
 diagStatus.textContent='写真を選ぶ前に、OCR部品の起動を診断できます。';
 diagnostic.insertAdjacentElement('afterend',diagStatus);
 diagnostic.onclick=async()=>{
   if(busy||pages.length){
     diagStatus.textContent='写真を読み込む前に診断してください。認識中は実行できません。';
     return;
   }
   const epoch=sessionEpoch;
   let worker=null;
   busy=true;
   diagnostic.disabled=true;
   sample.disabled=true;
   const show=message=>{
     if(epoch===sessionEpoch&&diagStatus.isConnected)diagStatus.textContent=message;
   };
   show('日本語OCRエンジンと日本語辞書を準備しています…');
   try{
     await nextPaint();
     if(epoch!==sessionEpoch)return;
     worker=await workerFor(epoch);
     activeWorker=worker;
     if(epoch===sessionEpoch){
       show('日本語OCRエンジンの起動に成功しました。写真の認識精度・4枚連続処理は未検証です。');
     }
   }catch(e){
     show('日本語OCRエンジンの起動に失敗：'+String(e?.message||e).slice(0,180));
   }finally{
     if(activeWorker===worker)activeWorker=null;
     if(worker)try{await worker.terminate();}catch(_){}
     busy=false;
     if(diagnostic.isConnected)diagnostic.disabled=false;
     if(sample.isConnected)sample.disabled=false;
   }
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
