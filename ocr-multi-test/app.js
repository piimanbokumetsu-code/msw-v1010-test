function journalCleanCrop(r){
 const bounded=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)||0));
 let x=bounded(r.x,0,.99),y=bounded(r.y,0,.99);
 return {x,y,w:bounded(r.w,.01,1-x),h:bounded(r.h,.01,1-y)};
}

function journalCropPixels(img,r,maxWidth=2400,maxHeight=1600){
 const c=journalCleanCrop(r),nw=img.naturalWidth,nh=img.naturalHeight;
 if(!nw||!nh)throw Error('画像を読み込めていません');
 // Cap each OCR region to avoid large memory spikes on iPad mini.
 const sx=Math.floor(c.x*nw),sy=Math.floor(c.y*nh);
 const sw=Math.max(1,Math.min(nw-sx,Math.round(c.w*nw)));
 const sh=Math.max(1,Math.min(nh-sy,Math.round(c.h*nh)));
 const scale=Math.min(1,maxWidth/sw,maxHeight/sh),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(sw*scale));
 canvas.height=Math.max(1,Math.round(sh*scale));
 canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
 return canvas;
}

function journalImproveCrop(canvas,mode){
 if(mode==='original')return canvas;
 if(mode!=='gray'&&mode!=='bw')throw Error('画像補正の指定が不正です');
 const cx=canvas.getContext('2d',{willReadFrequently:true});
 const img=cx.getImageData(0,0,canvas.width,canvas.height);
 const v=img.data, hist=new Uint32Array(256);
 for(let i=0;i<v.length;i+=4){
  const g=Math.round(.299*v[i]+.587*v[i+1]+.114*v[i+2]);hist[g]++;
 }
 const n=canvas.width*canvas.height,lowCount=n*.02,highCount=n*.98;
 let count=0,lo=0,hi=255;
 for(let i=0;i<256;i++){count+=hist[i];if(count>=lowCount){lo=i;break}}
 count=0;
 for(let i=0;i<256;i++){count+=hist[i];if(count>=highCount){hi=i;break}}
 if(hi-lo<24){lo=0;hi=255}
 const lut=new Uint8Array(256);
 for(let i=0;i<256;i++){
  let g=Math.round((i-lo)*255/(hi-lo));g=Math.max(0,Math.min(255,g));
  lut[i]=mode==='bw'?(g<155?0:255):g;
 }
 for(let i=0;i<v.length;i+=4){
  const gray=Math.round(.299*v[i]+.587*v[i+1]+.114*v[i+2]);
  v[i]=v[i+1]=v[i+2]=lut[gray];
 }
 cx.putImageData(img,0,0);return canvas;
}

function journalFindNameRowCells(canvas){
 const w=canvas.width,h=canvas.height;
 if(w<320||h<130)throw Error('氏名欄の範囲が小さすぎます。表の見出しと記入枠を含めて囲んでください。');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const pixels=ctx.getImageData(0,0,w,h).data;
 // Both axes are sampled sparsely to keep memory/time bounded on iPad mini.
 const dark=(x,y)=>{const off=(y*w+x)*4;return pixels[off]*.299+pixels[off+1]*.587+pixels[off+2]*.114<166};
 const joinRuns=(positions,gap=4)=>{
  const out=[];
  for(const position of positions){const last=out[out.length-1];if(last&&position-last.end<=gap)last.end=position;else out.push({start:position,end:position})}
  return out.map(r=>Math.round((r.start+r.end)/2));
 };
 const rows=[];
 const xs=Math.max(1,Math.floor(w/220));
 for(let y=2;y<h-2;y++){
  let hits=0,visits=0;
  for(let x=3;x<w-3;x+=xs){visits++;if(dark(x,y))hits++}
  if(hits/visits>.68)rows.push(y);
 }
 const lines=joinRuns(rows,5);
 if(lines.length<4)throw Error('表の横罫線を十分に検出できません。入退院欄を囲み直すか、従来の範囲OCR・手入力を使ってください。');
 const gaps=lines.slice(1).map((y,i)=>y-lines[i]).filter(g=>g>=12);
 if(!gaps.length)throw Error('患者行の高さを判定できませんでした。');
 const typical=[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)];
 const regular=lines.filter((y,i)=>i===0||y-lines[i-1]>=typical*.60);
 if(regular.length<4)throw Error('罫線の並びが不規則です。目視で修正してください。');
 // A ruled name column has persistent vertical boundaries through the table.
 // Pick the widest *interior* plausible column rather than assuming fixed
 // pixel coordinates. For this template the name is wider than room/time/age.
 const cols=[];
 const ys=Math.max(1,Math.floor((regular.at(-1)-regular[0])/190));
 for(let x=3;x<w-3;x++){
  let hits=0,visits=0;
  for(let y=regular[0]+2;y<regular.at(-1)-2;y+=ys){visits++;if(dark(x,y))hits++}
  if(visits>=4&&hits/visits>.60)cols.push(x);
 }
 const verticals=joinRuns(cols,5);
 const candidates=[];
 for(let i=0;i<verticals.length-1;i++){
  const left=verticals[i],right=verticals[i+1],size=right-left;
  if(size>=w*.13&&size<=w*.53&&left>=w*.06&&right<=w*.87){
   candidates.push({left,right,size});
  }
 }
 if(!candidates.length)throw Error('氏名列の左右の罫線を特定できません。表が傾いていないか確認し、従来の範囲OCRまたは手入力を使ってください。');
 candidates.sort((a,b)=>b.size-a.size);
 const column=candidates[0];
 // A prior table's closing line may appear just above the current table.
 // Detect the FIRST band where the detected name-column dividers continue
 // through the band, rather than assuming the first horizontal stroke is
 // this table's top edge. That band's text is the heading (氏名).
 let headingBand=-1;
 for(let i=0;i<regular.length-1;i++){
  const middle=Math.round((regular[i]+regular[i+1])/2);
  const match=[column.left,column.right].filter(x=>[middle-2,middle,middle+2].some(y=>y>=0&&y<h&&dark(x,y))).length;
  if(match===2){headingBand=i;break}
 }
 if(headingBand<0)throw Error('見出し行を確認できません。見出しと氏名欄の罫線が入るように範囲を調整してください。');
 const cells=[];
 // Skip table heading; row numbers restart at one after the heading.
 for(let i=headingBand+1;i<regular.length-1&&cells.length<10;i++){
  const y1=regular[i],y2=regular[i+1],height=y2-y1;
  if(height<typical*.62||height>typical*1.45)continue;
  const x=Math.max(0,column.left+4),right=Math.min(w,column.right-6);
  const top=Math.max(0,y1+2),bottom=Math.min(h,y2-1);
  if(right-x<32||bottom-top<13)continue;
  let ink=0,samples=0;
  for(let y=top;y<bottom;y+=3){for(let xx=x;xx<right;xx+=3){samples++;if(dark(xx,y))ink++}}
  // Never certify a blank cell. Faint strokes might fall below this threshold.
  cells.push({row:i-headingBand,rect:{x,y:top,w:right-x,h:bottom-top},inkRatio:ink/Math.max(1,samples),likelyWritten:ink/samples>.007});
 }
 if(!cells.length)throw Error('氏名の行を取り出せませんでした。罫線と表の見出しを含めてください。');
 const warnings=[];
 if(cells.length<10)warnings.push(`全10枠のうち区切りを確認できたのは${cells.length}枠です。末尾の枠が切れていないか必ず確認してください。`);
 if(gaps.some(g=>Math.abs(g-typical)>typical*.38))warnings.push('罫線間隔にずれがあります。氏名欄の位置を原本と照合してください。');
 warnings.push('空欄判定は参考のみです。薄い字・欄外の記載・10枠超過は必ず原本を確認し、必要なら手入力してください。');
 return {cells,lines:regular,verticals,nameColumn:column,warnings};
}

function journalNameCellCrop(source,rect){
 const c=document.createElement('canvas');c.width=rect.w;c.height=rect.h;
 c.getContext('2d',{willReadFrequently:true}).drawImage(source,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
 return c;
}

// OCR preview only. No patient database, no IndexedDB, no patient registration.
'use strict';
const SAMPLE_FILENAMES=["架空日誌_01_2026-10-14.png", "架空日誌_02_2026-10-14.png", "架空日誌_03_2026-10-15.png", "架空日誌_04_2026-10-15.png"];
const DEFAULT_REGIONS={
 date:{x:.042,y:.04,w:.39,h:.046},
 admission:{x:.060,y:.315,w:.670,h:.225},
 discharge:{x:.060,y:.535,w:.670,h:.205}
};
const $=id=>document.getElementById(id);
let pages=[],current=-1,generation=0,loadingWorker=null,worker=null,drawing=null;
function makePage(blob,name){return {blob,name,src:URL.createObjectURL(blob),image:null,region:'date',rects:JSON.parse(JSON.stringify(DEFAULT_REGIONS)),results:{},verified:false,status:'未確認'};}
function log(s,kind=''){const e=$('status');e.textContent=s;e.className='message '+kind;}
function safeText(s){return String(s??'').replace(/[<>]/g,c=>c==='<'?'＜':'＞')}
async function addBlobs(files){
  if(pages.length+files.length>20)throw Error('一度に選べる写真は合計20枚までです');
  for(const file of files){
    if(file.size>15*1024*1024)throw Error(file.name+' は15MBを超えています');
    if(!(file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(file.name)))throw Error('画像形式のみ選択してください');
    pages.push(makePage(file,file.name));
  }
  if(current<0&&pages.length)await selectPage(0);
  else drawList();
}
function drawList(){
  const list=$('photoList');list.replaceChildren();
  pages.forEach((p,i)=>{
    const b=document.createElement('button');b.type='button';b.className='page-button '+(i===current?'current':'');
    const dates=p.results.date?'日付確認待ち':'未認識';
    b.textContent=`${i+1}枚目：${p.name}（${p.verified?'確認完了':dates}）`;if(p.verified)b.className+=' completed';b.onclick=()=>selectPage(i);list.append(b);
  });
  $('counter').textContent=pages.length?`${current+1} / ${pages.length}枚`:'写真未選択';
  $('run').disabled=current<0;
  $('progress').textContent=`確認完了：${pages.filter(p=>p.verified).length} / ${pages.length}枚（3項目の目視照合が必要）`;
}
async function selectPage(index){
  generation++;current=index;const selectedGeneration=generation;const page=pages[current];if(!page)return;
  if(!page.image){
    const image=new Image();image.src=page.src;
    try{await image.decode()}catch(_){throw Error('この写真を表示できません。画像形式を確認してください')}
    page.image=image;
  }
  if(current!==index||generation!==selectedGeneration)return;
  $('photo').src=page.src;$('photo').hidden=false;
  $('section').value=page.region;
  drawList();redraw();renderResult();log('写真を確認し、対象を選択して「OCRで読み取る」を押してください。');
}
function redraw(){
  const p=pages[current];if(!p)return;
  const {x,y,w,h}=p.rects[p.region],e=$('crop');
  e.style.left=(x*100)+'%';e.style.top=(y*100)+'%';
  e.style.width=(w*100)+'%';e.style.height=(h*100)+'%';
  $('sectionLabel').textContent={date:'日付',admission:'入院氏名欄',discharge:'退院氏名欄'}[p.region];
}
function renderResult(){
  const p=pages[current];const region=p?.region;
  $('result').value=p?.results?.[region]||'';
  const complete=!!p&&['date','admission','discharge'].every(k=>!!p.results[k]?.trim());
  $('verified').disabled=!complete; $('verified').checked=!!p?.verified;
}
function setRegion(next){
  const p=pages[current];if(!p)return;
  generation++;p.region=next;redraw();renderResult();log('範囲を確認してください。青い枠は指で囲み直せます。');
}
function preventExternalScript(){
  // The image is used only in local Canvas. OCR files are relative to the current site.
  const base=new URL('./ocr/',document.baseURI);
  if(base.origin!==location.origin)throw Error('サイト外のOCR部品は使用できません');
  return base;
}
async function ensureWorker(){
  if(worker)return worker;if(loadingWorker)return loadingWorker;
  loadingWorker=(async()=>{
    const base=preventExternalScript();
    log('日本語OCRを初期化しています。初回は数十秒かかる場合があります。');
    if(!window.Tesseract?.createWorker){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');s.src=new URL('tesseract.min.js',base).href;
        s.onload=res;s.onerror=()=>rej(Error('OCRライブラリの読み込みに失敗しました'));document.head.append(s);
      });
    }
    const instance=await window.Tesseract.createWorker('jpn',1,{
      workerPath:new URL('worker.min.js',base).href,
      corePath:new URL('core/',base).href.replace(/\/$/,''),
      langPath:new URL('lang/',base).href.replace(/\/$/,''),
      workerBlobURL:false,gzip:true,cacheMethod:'none'
    });
    worker=instance;return worker;
  })();
  try{return await loadingWorker}
  finally{loadingWorker=null}
}
async function run(){
  const p=pages[current];if(!p)return;
  const id=generation,which=current,region=p.region,crop={...p.rects[region]};
  const btn=$('run');btn.disabled=true;
  try{
    const canvas=journalCropPixels(p.image,crop);
    const w=await ensureWorker();
    if(id!==generation||which!==current){log('別の写真を開いたため、前の読み取り結果は破棄しました。');return}
    const lines=[];
    if(region==='date'){
      log('日付欄を認識しています…');
      const v=await w.recognize(canvas);
      const s=String(v?.data?.text||'').trim();
      lines.push(s||'日付を認識できませんでした。元の日誌を見て確認してください。');
    }else{
      log('罫線と氏名列を検出しています…');
      const plan=journalFindNameRowCells(canvas);
      const likely=plan.cells.filter(x=>x.likelyWritten);
      if(!likely.length)throw Error('氏名の記入枠を検出できませんでした。枠を囲み直してください。');
      for(let i=0;i<likely.length;i++){
        if(id!==generation||which!==current){log('写真が変更されたため、前の結果は破棄しました。');return}
        log(`氏名欄を1人ずつ認識中… ${i+1}/${likely.length}`);
        const cell=journalNameCellCrop(canvas,likely[i].rect);
        const v=await w.recognize(cell);
        lines.push(`${likely[i].row}行目：${String(v?.data?.text||'').replace(/[\r\n]+/g,' ').trim()||'（読取不能）'}`);
      }
      lines.push('---');lines.push('検出枠数：'+plan.cells.length+'（人数確定ではありません）');
      lines.push(...plan.warnings);
    }
    if(id!==generation||which!==current){log('写真・範囲が変更されたため、認識結果は破棄しました。');return}
    p.results[region]=lines.join('\n');p.verified=false;renderResult();drawList();
    log('読み取りが終わりました。日付・氏名・人数を必ず紙と照合してください。','success');
  }catch(e){if(id===generation)log('認識できませんでした：'+safeText(e?.message||e)+'。範囲を変更して試せます。','error')}
  finally{btn.disabled=current<0}
}
function handleCropPointer(){
  const preview=$('preview'),rect=$('crop');
  function point(e){const r=$('photo').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
  preview.addEventListener('pointerdown',e=>{
    if(current<0)return;e.preventDefault();preview.setPointerCapture(e.pointerId);
    drawing={page:current,region:pages[current].region,start:point(e)};
  });
  preview.addEventListener('pointermove',e=>{
    if(!drawing||current!==drawing.page)return;
    const x=point(e),s=drawing.start;
    const b={x:Math.min(s.x,x.x),y:Math.min(s.y,x.y),w:Math.abs(s.x-x.x),h:Math.abs(s.y-x.y)};
    if(b.w>.01&&b.h>.01){pages[current].rects[drawing.region]=b;redraw()}
  });
  preview.addEventListener('pointerup',e=>{
    if(!drawing)return;drawing=null;generation++;
    const p=pages[current];delete p.results[p.region];p.verified=false;renderResult();drawList();
    log('範囲を更新しました。認識前に青い枠内に見出しと患者行が入っているか確認してください。');
  });
  preview.addEventListener('pointercancel',()=>{drawing=null});
}
$('section').onchange=e=>setRegion(e.target.value);
$('reset').onclick=()=>{const p=pages[current];if(!p)return;generation++;p.rects[p.region]={...DEFAULT_REGIONS[p.region]};delete p.results[p.region];p.verified=false;redraw();renderResult();drawList();log('既定の範囲に戻しました');};
$('run').onclick=run;
$('files').onchange=async e=>{try{await addBlobs([...e.target.files])}catch(err){log(err.message,'error')}finally{e.target.value=''}};
$('samples').onclick=async()=>{
  if(pages.length){log('写真を消してから架空のサンプルを読み込んでください。');return}
  try{
    const images=[];
    for(const name of SAMPLE_FILENAMES){
      const r=await fetch('./sample/'+encodeURIComponent(name));if(!r.ok)throw Error('架空サンプルを取得できません');
      const blob=await r.blob();images.push(new File([blob],name,{type:'image/png'}));
    }
    await addBlobs(images);log('架空の日誌4枚を読み込みました。1枚ずつ読み取ってください。');
  }catch(e){log('架空サンプルの読み込みに失敗：'+e.message,'error')}
};
$('clear').onclick=()=>{
  generation++;for(const p of pages)URL.revokeObjectURL(p.src);
  pages=[];current=-1;$('photo').hidden=true;$('photo').removeAttribute('src');$('result').value='';$('verified').checked=false;$('verified').disabled=true;
  $('crop').style.width='0';$('counter').textContent='写真未選択';drawList();log('写真と認識結果を画面から消しました。');
};
$('result').addEventListener('input',()=>{
 const p=pages[current];if(p){p.results[p.region]=$('result').value;p.verified=false;drawList();$('verified').checked=false;$('verified').disabled=!['date','admission','discharge'].every(k=>!!p.results[k]?.trim());}
});
$('verified').addEventListener('change',e=>{const p=pages[current];if(!p)return;const all=['date','admission','discharge'].every(k=>!!p.results[k]?.trim());p.verified=all&&e.target.checked;drawList();log(p.verified?'この架空日誌を目視確認済みにしました。患者登録は行いません。':'確認済みを解除しました。');});
handleCropPointer();drawList();
