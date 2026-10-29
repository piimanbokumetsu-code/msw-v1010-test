/* MSW offline-only journal OCR privacy preflight. No storage, uploads, analytics, or patient registration. */
(()=>{'use strict';
const appPath='/msw-v1010-test/msw-ocr-field-focus-v2-20261029/';
const ocrPath='/msw-v1010-test/msw-ocr-field-focus-v2-20261029/ocr/';
const $=id=>document.getElementById(id);
let offlineVerified=false,worker=null,originalUrl=null,runGeneration=0,working=false,cacheVerified=false,selectingFile=false;
let region=null,selectRegion=false,dragStart=null;
const status=(msg,error=false)=>{const el=$('status');el.textContent=msg;el.dataset.error=error?'1':'0';};
const guardPage=()=>location.protocol==='https:'&&location.origin==='https://piimanbokumetsu-code.github.io'&&location.pathname===appPath;
function isOffline(){return navigator.onLine===false;}
function clearPhoto(message='写真とOCR結果を端末メモリから破棄しました。'){
 runGeneration++;offlineVerified=false;
 if(worker){const w=worker;worker=null;void Promise.resolve(w.terminate()).catch(()=>{});}
 if(originalUrl){URL.revokeObjectURL(originalUrl);originalUrl=null;}
 $('photo').removeAttribute('src');$('photo').hidden=true;$('imagePanel').hidden=true;
 $('result').textContent='';$('resultPanel').hidden=true;$('file').value='';
 clearRegion();$('regionResultPanel').hidden=true;$('regionOutputPlain').textContent='';$('regionOutputContrast').textContent='';
 $('file').disabled=true;$('capture').disabled=true;$('recognize').disabled=true;$('license').checked=false;
 if(message)status(message);
}
function updateBadge(){
 $('connection').textContent=isOffline()?'通信状態：オフライン検出':'通信状態：オンラインの可能性（画像選択禁止）';
 $('connection').dataset.offline=isOffline()?'1':'0';
 if(!isOffline()&&(originalUrl||working)){clearPhoto('通信状態が変わったため写真とOCR結果を破棄しました。');}
 if(!isOffline()){offlineVerified=false;$('file').disabled=true;$('capture').disabled=true;}
}
function script(src){return new Promise((resolve,reject)=>{
 const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(Error('日本語OCRの部品を読み込めません'));document.head.appendChild(tag);
});}
function ocrOptions(){const origin=location.origin;return {
 workerPath:origin+ocrPath+'worker.min.js',
 corePath:origin+ocrPath+'core',langPath:origin+ocrPath+'lang',
 workerBlobURL:false,gzip:true,cacheMethod:'none'
};}
async function initWorker(){
 if(!isOffline()||!cacheVerified||!navigator.serviceWorker.controller)throw Error('オフライン・キャッシュの確認が未完了です');
 if(!window.Tesseract?.createWorker)await script(ocrPath+'tesseract.min.js');
 if(!isOffline())throw Error('通信状態が変わりました');
 return await window.Tesseract.createWorker('jpn',1,ocrOptions());
}
function asyncCacheStatus(){
 return new Promise((resolve,reject)=>{
  const ctrl=navigator.serviceWorker.controller;
  if(!ctrl)return reject(Error('オフライン制御がまだ有効ではありません。Safariで再読み込みしてください'));
  const tag=Symbol(),limit=setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',onMessage);reject(Error('部品確認に応答がありません'))},9000);
  function onMessage(e){if(e.data?.type!=='CACHE_STATUS')return;clearTimeout(limit);navigator.serviceWorker.removeEventListener('message',onMessage);resolve(e.data);}
  navigator.serviceWorker.addEventListener('message',onMessage);ctrl.postMessage({type:'CACHE_STATUS'});
 });
}
async function prepare(){
 if(!guardPage()){status('承認されたHTTPSの検証URLでのみ動作します',true);return;}
 $('prepare').disabled=true;status('端末のオフライン用OCR部品を準備しています。実名画像は選ばないでください。');
 try{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw Error('Safariがオフライン用保存機能に対応していません');
  const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller){
   status('オフライン部品を準備しました。Safariでこのページを一度再読み込みしてから「準備を確認」を押してください。');
   return;
  }
  const result=await asyncCacheStatus();
  if(!result.ok)throw Error('OCR部品の一部が保存されていません');
  cacheVerified=true;
  status('オフライン用部品 '+result.items+'点を確認できました。次にiPadのWi-Fi・モバイル通信を切って、動作テストを実行してください。');
 }catch(err){status('準備失敗：'+String(err.message||err)+ '。実名画像は読み込まないでください。',true);}
 finally{$('prepare').disabled=false;}
}
async function checkReady(){
 if(!guardPage()){status('URLが正しくありません',true);return;}
 if(!isOffline()){status('通信を切ったことが確認できません。Wi-Fi・モバイル通信をオフにしてください。',true);return;}
 $('offlineTest').disabled=true;status('オフラインで日本語OCRエンジンを起動・試験しています。');
 let w=null,c=null;
 try{
  const info=await asyncCacheStatus();
  if(!info.ok)throw Error('部品が欠けています');
  cacheVerified=true;
  w=await initWorker();
  c=document.createElement('canvas');c.width=900;c.height=170;
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,170);
  ctx.fillStyle='#111';ctx.font='bold 60px sans-serif';ctx.fillText('架空の日本語OCR確認',25,106);
  await w.setParameters({tessedit_pageseg_mode:'6'});
  const r=await w.recognize(c);
  if(!isOffline())throw Error('途中で通信状態が変わりました');
  if(!String(r?.data?.text||'').trim())throw Error('動作テストで文字が読み取れませんでした');
  offlineVerified=true;
  status('オフライン日本語OCRの動作テスト成功。院内許可と通信オフを確認し、架空画像以外の現場日誌を1枚だけ選べます。');
  openControls();
 }catch(err){
  offlineVerified=false;status('オフライン動作テスト失敗：'+String(err.message||err)+'。実名画像は読み込まないでください。',true);
 }finally{
  if(c){c.width=c.height=0;}
  if(w){try{await w.terminate()}catch(_){}}
  $('offlineTest').disabled=false;
 }
}
function openControls(){
 const yes=offlineVerified&&cacheVerified&&isOffline()&&$('license').checked&&!working;
 $('file').disabled=!yes;$('capture').disabled=!yes;$('recognize').disabled=!(yes&&!!originalUrl);
 $('regionSelect').disabled=!(yes&&!!originalUrl);
 $('regionOCR').disabled=!(yes&&!!originalUrl&&!!region);
}
function chooseFile(){if(!offlineVerified||!isOffline()){status('オフライン動作確認が必要です。',true);return;}
 selectingFile=true;
 $('file').click();
}
async function pick(e){
 selectingFile=false;
 const f=e.target.files?.[0];e.target.value='';
 if(!f)return;
 if(!offlineVerified||!cacheVerified||!isOffline()||!$('license').checked){status('安全確認が未完了です。画像は読み込めません。',true);return;}
 if(!/^image\/(jpeg|png|heic|heif)$/i.test(f.type)&&!/^image\//.test(f.type)){status('写真画像だけ選択できます。',true);return;}
 if(f.size>12*1024*1024){status('12MB以下の写真を使ってください。',true);return;}
 // Clear old image; do not persist bytes or OCR text.
 if(originalUrl){URL.revokeObjectURL(originalUrl);originalUrl=null;}
 $('result').textContent='';$('resultPanel').hidden=true;
 clearRegion();$('regionResultPanel').hidden=true;$('regionOutputPlain').textContent='';$('regionOutputContrast').textContent='';
 originalUrl=URL.createObjectURL(f);
 $('photo').src=originalUrl;$('photo').hidden=false;$('imagePanel').hidden=false;
 status('写真を一時メモリに読み込みました。氏名欄などの認識を比較する場合は「範囲を選択」を押してください。');
 openControls();
}
async function recognize(){
 if(working)return;
 if(!originalUrl||!offlineVerified||!cacheVerified||!isOffline()||!$('license').checked){status('オフライン確認と画像選択が必要です',true);return;}
 working=true;openControls();$('recognize').disabled=true;
 const gen=runGeneration;
 status('端末内だけで全文OCRを実行しています。日誌の書式・氏名を自動確定しません。');
 let img=null,c=null,w=null;
 try{
  img=new Image();img.src=originalUrl;await img.decode();
  if(gen!==runGeneration||!isOffline())throw Error('検証が中断されました');
  if(img.width*img.height>32000000)throw Error('大きすぎる画像です。別の画質で撮り直してください');
  const sc=Math.min(1,2100/img.width,3000/img.height);
  c=document.createElement('canvas');c.width=Math.max(1,Math.floor(img.width*sc));c.height=Math.max(1,Math.floor(img.height*sc));
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
  w=await initWorker();worker=w;
  await w.setParameters({tessedit_pageseg_mode:'3'});
  const out=await w.recognize(c);
  if(gen!==runGeneration||!isOffline())throw Error('通信が復帰したか、OCRが中断されました');
  $('result').textContent=String(out?.data?.text||'').slice(0,12000)||'文字を検出できませんでした。';
  $('resultPanel').hidden=false;
  status('全文OCRが終了しました。文字や氏名は候補です。原本と照合してください。結果は保存しません。');
 }catch(err){if(gen===runGeneration){$('result').textContent='';$('resultPanel').hidden=true;status('OCR処理失敗：'+String(err.message||err),true);}}
 finally{
  if(c){c.width=c.height=0;}
  if(img){img.src='';img=null;}
  if(w){try{await w.terminate()}catch(_){}if(worker===w)worker=null;}
  working=false;$('recognize').disabled=false;openControls();
 }
}

function clearRegion(){
 region=null;selectRegion=false;dragStart=null;
 $('regionOverlay').classList.remove('is-selecting');
 $('regionRect').hidden=true;$('regionHint').textContent='まだ範囲を選択していません。';
 $('regionSelect').textContent='範囲を選択';
}
function displayRegion(){
 if(!region){$('regionRect').hidden=true;return;}
 const r=$('regionRect');r.hidden=false;
 r.style.left=(100*region.x).toFixed(3)+'%';
 r.style.top=(100*region.y).toFixed(3)+'%';
 r.style.width=(100*region.w).toFixed(3)+'%';
 r.style.height=(100*region.h).toFixed(3)+'%';
}
function enableSelection(){
 if(!originalUrl||!offlineVerified||!isOffline()||working){status('安全確認が完了した画像だけ選択できます',true);return;}
 selectRegion=!selectRegion;dragStart=null;
 $('regionOverlay').classList.toggle('is-selecting',selectRegion);
 $('regionSelect').textContent=selectRegion?'選択を終了':'範囲を選択';
 $('regionHint').textContent=selectRegion?'画像の上で読み取りたい氏名欄などを指で囲んでください。':'範囲を選択してから比較できます。';
}
function positionFromPointer(e){
 const r=$('regionOverlay').getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
}
function setRectFromPoints(start,end){
 const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y);
 const w=Math.abs(start.x-end.x),h=Math.abs(start.y-end.y);
 if(w<0.025||h<0.009){region=null;$('regionHint').textContent='範囲が小さすぎます。もう一度囲んでください。';displayRegion();openControls();return;}
 region={x,y,w,h};
 displayRegion();
 $('regionHint').textContent='範囲を選びました。「選んだ部分を2方式でOCR比較」で確認できます。';
 selectRegion=false;$('regionOverlay').classList.remove('is-selecting');$('regionSelect').textContent='範囲を選択';
 openControls();
}
function pointerDown(e){
 if(!selectRegion||!originalUrl||!isOffline())return;
 e.preventDefault();dragStart=positionFromPointer(e);
 $('regionOverlay').setPointerCapture?.(e.pointerId);
}
function pointerMove(e){
 if(!dragStart||!selectRegion)return;
 e.preventDefault();
 const end=positionFromPointer(e);
 const x=Math.min(dragStart.x,end.x),y=Math.min(dragStart.y,end.y);
 region={x,y,w:Math.abs(dragStart.x-end.x),h:Math.abs(dragStart.y-end.y)};
 displayRegion();
}
function pointerUp(e){
 if(!dragStart||!selectRegion)return;
 e.preventDefault();
 const begin=dragStart;dragStart=null;setRectFromPoints(begin,positionFromPointer(e));
}
function enhanceContrast(canvas){
 const context=canvas.getContext('2d',{willReadFrequently:true});
 const img=context.getImageData(0,0,canvas.width,canvas.height);
 const p=img.data,hist=new Uint32Array(256);
 // Only the selected area is enhanced; do not touch the original photo.
 for(let i=0;i<p.length;i+=4)hist[Math.max(0,Math.min(255,Math.round(p[i]*.299+p[i+1]*.587+p[i+2]*.114)))]++;
 const total=canvas.width*canvas.height,lowN=total*.015,highN=total*.985;
 let v=0,low=0,high=255;
 for(let i=0;i<256;i++){v+=hist[i];if(v>=lowN){low=i;break;}}
 v=0;for(let i=0;i<256;i++){v+=hist[i];if(v>=highN){high=i;break;}}
 const span=Math.max(36,high-low);
 for(let i=0;i<p.length;i+=4){
  let lum=p[i]*.299+p[i+1]*.587+p[i+2]*.114;
  lum=Math.max(0,Math.min(255,(lum-low)*255/span));
  p[i]=p[i+1]=p[i+2]=lum;p[i+3]=255;
 }
 context.putImageData(img,0,0);
}
async function regionCompare(){
 if(working)return;
 if(!originalUrl||!region||!offlineVerified||!cacheVerified||!isOffline()||!$('license').checked){status('安全確認か部分選択が未完了です',true);return;}
 working=true;openControls();
 const gen=runGeneration,selection={...region};
 $('regionResultPanel').hidden=false;
 $('regionOutputPlain').textContent='認識中…';$('regionOutputContrast').textContent='処理待ち…';
 status('選択した部分を、オフラインで2方式比較しています。結果は保存しません。');
 let img=null,c=null,w=null;
 try{
  img=new Image();img.src=originalUrl;await img.decode();
  if(gen!==runGeneration||!isOffline())throw Error('検証が中断されました');
  if(img.width*img.height>32000000)throw Error('写真が大きすぎます。画質を下げて撮り直してください');
  const rx=Math.floor(selection.x*img.width),ry=Math.floor(selection.y*img.height);
  const rw=Math.max(1,Math.ceil(selection.w*img.width)),rh=Math.max(1,Math.ceil(selection.h*img.height));
  if(rw<10||rh<10)throw Error('選択範囲が小さすぎます');
  // Preserve effective resolution and cap memory / canvas pixel count on iPad mini.
  const sc=Math.min(3,Math.max(1,1200/rw),Math.max(1,900/rh),Math.sqrt(2100000/(rw*rh)));
  const cw=Math.max(1,Math.round(rw*sc)),ch=Math.max(1,Math.round(rh*sc));
  c=document.createElement('canvas');c.width=cw;c.height=ch;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);
  ctx.drawImage(img,rx,ry,Math.min(rw,img.width-rx),Math.min(rh,img.height-ry),0,0,cw,ch);
  w=await initWorker();worker=w;
  await w.setParameters({tessedit_pageseg_mode:'6'});
  const plain=await w.recognize(c);
  if(gen!==runGeneration||!isOffline())throw Error('通信状態が変わりました');
  $('regionOutputPlain').textContent=String(plain?.data?.text||'').slice(0,5000)||'文字が検出できませんでした';
  status('元画像の認識が終了。続いてコントラスト補正を試しています。');
  enhanceContrast(c);
  const filtered=await w.recognize(c);
  if(gen!==runGeneration||!isOffline())throw Error('途中で通信状態が変わりました');
  $('regionOutputContrast').textContent=String(filtered?.data?.text||'').slice(0,5000)||'文字が検出できませんでした';
  status('2方式の認識結果を表示しました。正確さは自動判定していません。原本の氏名と照合してください。');
 }catch(err){if(gen===runGeneration){$('regionOutputPlain').textContent='';$('regionOutputContrast').textContent='';$('regionResultPanel').hidden=true;status('部分OCR失敗：'+String(err.message||err),true);}}
 finally{
  if(c){c.width=c.height=0;}
  if(img){img.src='';img=null;}
  if(w){try{await w.terminate()}catch(_){}if(worker===w)worker=null;}
  working=false;openControls();
 }
}

if(!guardPage()){$('main').hidden=true;status('正規の検証URLではありません',true);return;}
$('prepare').addEventListener('click',prepare);
$('offlineTest').addEventListener('click',checkReady);
$('license').addEventListener('change',openControls);
$('capture').addEventListener('click',chooseFile);
$('file').addEventListener('change',pick);
$('file').addEventListener('cancel',()=>{selectingFile=false;});
window.addEventListener('focus',()=>{if(selectingFile)setTimeout(()=>{selectingFile=false;},1500);});
$('recognize').addEventListener('click',recognize);
$('regionSelect').addEventListener('click',enableSelection);
$('regionOCR').addEventListener('click',regionCompare);
$('regionOverlay').addEventListener('pointerdown',pointerDown);
$('regionOverlay').addEventListener('pointermove',pointerMove);
$('regionOverlay').addEventListener('pointerup',pointerUp);
$('regionOverlay').addEventListener('pointercancel',()=>{dragStart=null;});

$('wipe').addEventListener('click',()=>clearPhoto());
window.addEventListener('offline',updateBadge);
window.addEventListener('online',updateBadge);
window.addEventListener('pagehide',()=>clearPhoto(''));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!selectingFile)clearPhoto('');});
updateBadge();
if(navigator.serviceWorker?.controller){
 asyncCacheStatus().then(x=>{cacheVerified=x.ok;status(x.ok?'OCR部品を確認済み。通信を切って「オフライン動作テスト」を押してください。':'キャッシュ不足。先にオフライン準備をやり直してください。');}).catch(()=>{});
}
})();