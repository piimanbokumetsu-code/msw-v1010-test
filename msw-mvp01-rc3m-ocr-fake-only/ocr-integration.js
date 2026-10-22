/* MSW MVP01 OCR bridge / 2026-10-22 / fictional test only.
   Keeps scanned photos & text in volatile memory; no upload/auto-registration.
   Uses independently hosted same-origin stage22 OCR assets. */
(()=>{
'use strict';
const BASE = new URL('../ocr-auto-stage22/', document.baseURI);
const expected='/msw-v1010-test/ocr-auto-stage22/';
const pages=[];
let current=-1,busy=false,notice='写真を選択してください。';
const el=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=x=>String(x||'').split(/\r?\n/).map(y=>y.trim()).filter(Boolean);
function erase(){for(const p of pages)URL.revokeObjectURL(p.url);pages.length=0;current=-1;notice='写真を消去しました。';}
function report(x){notice=x;const n=el('journalOCRStatus');if(n)n.textContent=x;}
function loadScript(href){return new Promise((ok,fail)=>{const s=document.createElement('script');s.src=href;s.onload=ok;s.onerror=()=>fail(new Error('OCR部品を取得できません。通信環境と再読み込みを確認してください。'));document.head.append(s);});}
async function workerFor(){
 if(location.protocol!=='https:' || BASE.origin!==location.origin || BASE.pathname!==expected)throw new Error('認識機能は承認したHTTPSテストURLでのみ動作します。');
 if(!window.MSWJournalLayout)await loadScript(new URL('layout.js',BASE).href);
 if(!window.Tesseract?.createWorker)await loadScript(new URL('ocr/tesseract.min.js',BASE).href);
 report('日本語OCRエンジンと辞書を準備しています…');
 const core=new URL('ocr/core/',BASE).href.replace(/\/$/,'');
 const lang=new URL('ocr/lang/',BASE).href.replace(/\/$/,'');
 return window.Tesseract.createWorker('jpn',1,{
  workerPath:new URL('ocr/worker.min.js',BASE).href,
  corePath:core,langPath:lang,workerBlobURL:false,gzip:true,cacheMethod:'none'
 });
}
function dateISO(s){const t=String(s||'').replace(/[〇Ｏ]/g,'0').replace(/[０-９]/g,x=>String.fromCharCode(x.charCodeAt(0)-0xfee0));const m=t.match(/(20\d{2})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);if(!m)return '';const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===mo&&dt.getUTCDate()===d?`${m[1]}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
async function getImage(url){const img=new Image();img.src=url;await img.decode();return img;}
function compactCanvas(img){const max=1400,ratio=Math.min(1,max/img.width,max*1.5/img.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}
async function recognize(index){
 const p=pages[index];if(!p||p.approved)throw new Error('確認済みの画像は再認識で上書きできません。');
 let worker=null,plan=null,img=null,generic=null;
 try{
  report(`${index+1}枚目：画像の書式を確認しています…`);
  img=await getImage(p.url);
  let layoutError='';
  try{if(!window.MSWJournalLayout)await loadScript(new URL('layout.js',BASE).href);plan=window.MSWJournalLayout.inspect(img);}catch(e){layoutError=String(e?.message||e);}
  worker=await workerFor();
  let result={date:'',admission:[],discharge:[],raw:'',mode:'全文OCR',warnings:[]};
  if(plan){
   result.mode='模擬書式の欄別OCR';
   result.warnings=plan.warnings||[];
   await worker.setParameters({tessedit_pageseg_mode:'6'});
   report(`${index+1}枚目：日付を認識しています…`);
   let crop=window.MSWJournalLayout.crop(plan.canvas,plan.dateRect,3);
   try{const o=await worker.recognize(crop);result.date=dateISO(o?.data?.text);}finally{crop.width=crop.height=0;}
   await worker.setParameters({tessedit_pageseg_mode:'7'});
   for(const [kind,label] of [['admission','入院'],['discharge','退院']]){
    const found=plan[kind]?.written||[];
    for(let n=0;n<found.length;n++){
     report(`${index+1}枚目：${label}氏名 ${n+1}/${found.length} を認識しています…`);
     const sub=window.MSWJournalLayout.crop(plan.canvas,found[n].rect,0);
     try{const value=String((await worker.recognize(sub))?.data?.text||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();result[kind].push(value);}finally{sub.width=sub.height=0;}
    }
   }
   result.raw=[`日付：${result.date||'（未認識）'}`,`入院：${result.admission.join('、')||'（なし）'}`,`退院：${result.discharge.join('、')||'（なし）'}`].join('\n');
  }else{
   report(`${index+1}枚目：登録外の書式のため、全文OCRを試しています…`);
   generic=compactCanvas(img);
   await worker.setParameters({tessedit_pageseg_mode:'3'});
   const data=(await worker.recognize(generic))?.data;
   result.raw=String(data?.text||'').trim();
   result.warnings=[`日誌の欄位置を認識できませんでした（${layoutError.slice(0,120)}）。全文OCRのみ表示し、氏名や日付を推定・登録しません。`];
  }
  p.date=result.date;p.admission=result.admission;p.discharge=result.discharge;p.raw=result.raw;p.mode=result.mode;p.warnings=result.warnings;p.scanned=true;p.approved=false;p.checked={date:false,names:false,counts:false};
  report(`${index+1}枚目：${result.mode}が完了。必ず写真と照合してください。`);
 }finally{
  if(generic){generic.width=0;generic.height=0;}
  if(plan?.canvas){plan.canvas.width=0;plan.canvas.height=0;}
  if(img){img.src='';img=null;}
  if(worker)try{await worker.terminate();}catch(_){/* release if available */}
 }
}
function renderScanner(){
 const host=el('journalScanPreview');if(!host)return;
 const p=pages[current];
 const cards=pages.map((x,i)=>`<button type="button" class="btn secondary ocr-page" data-n="${i}" aria-pressed="${i===current}">${i+1}枚目 ${x.approved?'確認済':x.scanned?'要確認':'未認識'}</button>`).join('');
 const approved=p?.approved&&p?.scanned;
 const complete=p?.scanned&&p?.date&&p?.checked.date&&p?.checked.names&&p?.checked.counts&&p.admission.every(Boolean)&&p.discharge.every(Boolean);
 host.innerHTML=`<div class="ocr-zone"><div class="ocr-photo-bar">${cards}</div>
 ${p?`<div class="ocr-grid"><div><img class="ocr-original" src="${safe(p.url)}" alt="撮影した架空日誌"><p class="notice">${safe(p.file.name)}</p></div><div>
 <p class="notice"><b>認識方式：</b>${safe(p.mode||'未認識')}</p>
 <div class="ocr-buttons"><button class="btn" id="journalTryOCR" ${busy?'disabled':''}>この写真を日本語OCR</button><button class="btn secondary" id="journalAllOCR" ${busy?'disabled':''}>未確認の写真を順番にOCR</button><button class="btn secondary" id="journalDiscardOCR" ${busy?'disabled':''}>写真をすべて消去</button></div>
 <p class="notice" id="journalOCRStatus" role="status" aria-live="polite">${safe(notice)}</p>
 ${p.warnings.length?`<p class="notice ocr-warning">${p.warnings.map(safe).join(' / ')}</p>`:''}
 <label>読み取った文字（確認・修正）<textarea id="journalOCRText" rows="5" placeholder="OCR結果がここに表示されます">${safe(p.raw)}</textarea></label>
 <p class="notice">模擬書式では入退院を抽出。異なる書式では全文のみ認識し、日付・氏名は手作業で確認してください。</p>
 <div class="ocr-fields"><label>日誌の日付<input type="date" id="ocrDate" value="${safe(p.date)}"></label><label>入院氏名（1行に1名）<textarea id="ocrAdmission" rows="3">${safe(p.admission.join('\n'))}</textarea></label><label>退院氏名（1行に1名）<textarea id="ocrDischarge" rows="3">${safe(p.discharge.join('\n'))}</textarea></label></div>
 <div class="ocr-checks"><label><input type="checkbox" id="ocrCheckDate" ${p.checked.date?'checked':''}> 日付を照合</label><label><input type="checkbox" id="ocrCheckNames" ${p.checked.names?'checked':''}> 全氏名を照合</label><label><input type="checkbox" id="ocrCheckCounts" ${p.checked.counts?'checked':''}> 入退院人数を照合</label></div>
 <button type="button" class="btn" id="ocrApprove" ${complete&&!busy?'':'disabled'}>${approved?'確認済み（保存・登録しません）':'この写真の確認を完了（登録しません）'}</button>
 ${approved&&p.admission.length?`<div class="ocr-reviewed">${p.admission.map((name,i)=>`<button class="btn secondary ocr-copy-name" data-i="${i}">${safe(name)} → 手入力欄へ</button>`).join('')}</div>`:''}
 </div></div>`:`<p class="notice">写真はまだありません。上の「日誌の写真を選択・撮影」から架空画像を追加してください。</p>`}</div>`;
 for(const button of host.querySelectorAll('.ocr-page'))button.onclick=()=>{if(busy)return;current=Number(button.dataset.n);renderScanner();};
 if(!p)return;
 el('journalTryOCR').onclick=()=>run([current]);
 el('journalAllOCR').onclick=()=>run(pages.map((_,i)=>i).filter(i=>!pages[i].approved));
 el('journalDiscardOCR').onclick=()=>{erase();renderScanner();const n=el('journalPhotoInfo');if(n)n.textContent='';};
 el('journalOCRText').oninput=e=>{p.raw=e.target.value;p.approved=false;p.checked={date:false,names:false,counts:false};renderScanner();};
 const invalidate=()=>{p.approved=false;p.checked={date:false,names:false,counts:false};renderScanner();};
 for(const [id,key,kind] of [['ocrDate','date','date'],['ocrAdmission','admission','names'],['ocrDischarge','discharge','names']]){
  el(id).onchange=e=>{p[key]=kind==='date'?e.target.value:words(e.target.value);invalidate();};
 }
 for(const [id,key] of [['ocrCheckDate','date'],['ocrCheckNames','names'],['ocrCheckCounts','counts']]){
  el(id).onchange=e=>{p.checked[key]=e.target.checked;p.approved=false;renderScanner();};
 }
 el('ocrApprove').onclick=()=>{if(!complete||busy)return;p.approved=true;report('原本照合を記録しました。患者データには自動登録していません。');renderScanner();};
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
 if(busy||!indices.length)return;busy=true;renderScanner();let completed=0;
 try{for(const i of indices){if(!pages[i]||pages[i].approved)continue;current=i;renderScanner();try{await recognize(i);completed++;}catch(e){report(`${i+1}枚目の認識に失敗：${String(e?.message||e)}。画像の確認は続けられます。`);}renderScanner();}}
 finally{busy=false;report(`${indices.length}枚中 ${completed}枚でOCR処理が終了しました。氏名・人数・日付を必ず照合してください。`);renderScanner();}
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
 const sample=document.createElement('button');sample.type='button';sample.className='btn secondary';sample.textContent='架空の日誌サンプルを読み込む';
 sample.style.marginLeft='7px';input.parentElement.insertAdjacentElement('afterend',sample);
 sample.onclick=async()=>{
  if(busy||pages.length){report('既存写真を消去してからサンプルを読み込んでください。');return;}
  try{
   const url=new URL('../ocr-auto-stage22/sample/仮想日誌_01_2026-10-14.png',document.baseURI);
   if(url.origin!==location.origin)throw Error('同一サイトの架空画像のみ読み込めます');
   report('架空サンプル画像を読み込んでいます…');const res=await fetch(url.href,{cache:'force-cache'});
   if(!res.ok)throw Error('架空画像の取得に失敗しました。');
   const blob=await res.blob();appendFiles([new File([blob],'仮想日誌_01_2026-10-14.png',{type:'image/png'})]);
  }catch(e){report('サンプルを読み込めませんでした：'+String(e?.message||e));}
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
