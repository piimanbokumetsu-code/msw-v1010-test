/* MSW auto journal prototype, synthetic-only, no patient database */
'use strict';
const SAMPLE_NAMES=["仮想日誌_01_2026-10-14.png","仮想日誌_02_2026-10-14.png","仮想日誌_03_2026-10-15.png","仮想日誌_04_2026-10-15.png"];
const $=id=>document.getElementById(id);
const pages=[];let active=-1,busy=false,worker=null,workerPending=null;
const blankReview=()=>({date:false,names:false,counts:false});
function status(text,type=''){$('status').textContent=text;$('status').className='result '+type;}
function makePage(blob){return {blob,src:URL.createObjectURL(blob),name:blob.name||'架空画像',date:'',admission:[],discharge:[],checked:blankReview(),approved:false,scanned:false,errors:[],processing:false};}
function resetReview(page){page.checked=blankReview();page.approved=false;}
async function appendImages(files){
 if(busy)throw Error('読み取り中は追加できません。');
 if(files.length+pages.length>20)throw Error('最大20枚までです。');
 for(const file of files){
  if(file.size>15*1024*1024)throw Error('15MB以下の架空画像を選んでください。');
  if(!file.type.startsWith('image/'))throw Error('画像形式だけを選択してください。');
  pages.push(makePage(file));
 }
 if(pages.length&&active<0)active=0;
 render();
}
async function imageForPage(page){const image=new Image();image.src=page.src;await image.decode();return image;}
function renderPhotos(){
 const e=$('photos');e.replaceChildren();
 pages.forEach((p,i)=>{
  const b=document.createElement('button');b.type='button';b.className='photo-item '+(active===i?'selected ':'')+(p.approved?'approved':'');
  b.textContent=`${i+1}枚目　${p.name}\n${p.approved?'確認完了':p.scanned?'読み取り済み・要確認':'未読み取り'}`;
  b.onclick=()=>{if(busy)return;active=i;render();};e.append(b);
 });
 $('progress').textContent=`確認完了：${pages.filter(p=>p.approved).length} / ${pages.length}枚`;
 $('analyzeOne').disabled=busy||active<0;
 $('analyzeAll').disabled=busy||pages.length===0;
 $('samples').disabled=busy;$('clear').disabled=busy;
}
function appendRow(holder,label,value,onUpdate,onDelete,rowIndex){
 const box=document.createElement('div');box.className='name-row';
 const n=document.createElement('label');n.textContent=`${rowIndex+1}番`;
 const input=document.createElement('input');input.value=value;input.setAttribute('aria-label',label+(rowIndex+1));
 input.oninput=()=>onUpdate(input.value);
 const del=document.createElement('button');del.type='button';del.textContent='削除';del.onclick=onDelete;
 box.append(n,input,del);holder.append(box);
}
function renderNames(p,field,holderName,countName){
 const h=$(holderName);h.replaceChildren();
 p[field].forEach((r,i)=>appendRow(h,field==='admission'?'入院氏名':'退院氏名',r.value,(v)=>{p[field][i].value=v;resetReview(p);syncCheckState(p);renderPhotos();},()=>{p[field].splice(i,1);resetReview(p);render();},i));
 $(countName).textContent=p[field].length;
}
function syncCheckState(p){
 $('checkDate').checked=p.checked.date;$('checkNames').checked=p.checked.names;$('checkCounts').checked=p.checked.counts;
 $('approve').disabled=!(p.scanned&&p.date.trim()&&p.checked.date&&p.checked.names&&p.checked.counts&&p.admission.every(x=>x.value.trim())&&p.discharge.every(x=>x.value.trim()));
 $('approve').textContent=p.approved?'確認完了済み（登録はしません）':'この日誌の確認を完了（登録はしません）';
}
function render(){
 renderPhotos();const p=pages[active];$('editarea').classList.toggle('hidden',!p);$('photo').classList.toggle('hidden',!p);
 if(!p){$('photo').removeAttribute('src');$('filename').textContent='';return;}
 $('photo').src=p.src;$('filename').textContent=p.name;
 $('date').value=p.date;
 renderNames(p,'admission','adNames','adCount');renderNames(p,'discharge','disNames','disCount');
 $('warnings').textContent=p.errors.join('\n')||'人数と氏名を必ず原本と照合してください。';
 syncCheckState(p);
}
async function ensureOCR(){
 if(worker)return worker;if(workerPending)return workerPending;
 workerPending=(async()=>{
   if(!window.Tesseract?.createWorker){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('OCR部品を読み込めません'));document.head.append(s);});
   }
   const base=new URL('./ocr/',document.baseURI);
   if(base.origin!==location.origin)throw Error('OCR部品は同一サイト内のファイルだけを使用します。');
   const w=await window.Tesseract.createWorker('jpn',1,{workerPath:new URL('worker.min.js',base).href,corePath:new URL('core/',base).href.replace(/\/$/,''),langPath:new URL('lang/',base).href.replace(/\/$/,''),workerBlobURL:false,gzip:true,cacheMethod:'none'});
   worker=w;return w;
 })();
 try{return await workerPending}catch(e){workerPending=null;throw e;}
}
async function recognizeNameCell(w,plan,cell){
 const canvas=MSWJournalLayout.crop(plan.canvas,cell.rect,0);
 const result=await w.recognize(canvas);
 return String(result?.data?.text||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
}
function parseDate(raw){
 const z=String(raw||'').replace(/[ \t\n]/g,'').replace(/〇/g,'0');
 const m=z.match(/(20\d{2})[年\-/](\d{1,2})[月\-/](\d{1,2})日?/);
 if(!m)return z;
 const month=Number(m[2]),day=Number(m[3]);
 if(month<1||month>12||day<1||day>31)return z;
 return `${m[1]}年${month}月${day}日`;
}
async function scanIndex(index){
 const page=pages[index];if(!page)throw Error('画像がありません');
 page.processing=true;active=index;render();
 try{
  status(`${index+1}枚目：日誌の書式と入退院欄を自動判定しています…`);
  const image=await imageForPage(page);
  const plan=MSWJournalLayout.inspect(image);
  status(`${index+1}枚目：日本語OCRを準備しています…`);
  const w=await ensureOCR();
  status(`${index+1}枚目：日付をOCR中…`);
  await w.setParameters({tessedit_pageseg_mode:'6'});
  const dateRaw=(await w.recognize(MSWJournalLayout.crop(plan.canvas,plan.dateRect,3))).data.text;
  const date=parseDate(dateRaw);
  const res={date,admission:[],discharge:[],errors:[...plan.warnings]};
  await w.setParameters({tessedit_pageseg_mode:'7'});
  for(const [key,label] of [['admission','入院'],['discharge','退院']]){
   const rows=plan[key].written;
   for(let i=0;i<rows.length;i++){
    status(`${index+1}枚目：${label}患者の氏名OCR中… ${i+1}/${rows.length}`);
    const name=await recognizeNameCell(w,plan,rows[i]);
    res[key].push({row:rows[i].row,value:name});
    if(!name)res.errors.push(`${label}${rows[i].row}行目の氏名を読み取れませんでした。手入力してください。`);
   }
  }
  // Fail closed: once review edits exist, never overwrite them accidentally.
  if(page.approved)throw Error('この日誌は確認完了済みです。自動読み取りで上書きしません。');
  page.date=res.date;page.admission=res.admission;page.discharge=res.discharge;
  page.errors=res.errors;page.scanned=true;resetReview(page);
  status(`${index+1}枚目：自動振り分けが終わりました。入院${res.admission.length}名・退院${res.discharge.length}名。氏名・日付・人数は必ず確認してください。`,'good');
 }catch(e){status(`${index+1}枚目：自動読み取りに失敗しました。${e.message}（今回は勝手に登録・確認完了しません）`,'bad');throw e;}
 finally{page.processing=false;render();}
}
async function withBusy(fn){if(busy)return;busy=true;renderPhotos();try{await fn()}catch(e){/* status already supplied in scanIndex */}finally{busy=false;renderPhotos();}}
$('analyzeOne').onclick=()=>withBusy(async()=>scanIndex(active));
$('analyzeAll').onclick=()=>withBusy(async()=>{
 let completed=0;
 for(let i=0;i<pages.length;i++){
  if(pages[i].approved){completed++;continue;}
  try{await scanIndex(i);completed++;}catch(_){/* Separate photos; leave failed photo unapproved */}
 }
 status(`${pages.length}枚の処理を試行し、${completed}枚でOCR結果を表示できました。各日誌を1枚ずつ目視確認・修正してください。`,completed===pages.length?'good':'bad');
});
$('samples').onclick=async()=>{
 if(pages.length){status('架空の日誌を読み直す場合は「すべて消去」してから操作してください。');return;}
 try{const files=[];for(const name of SAMPLE_NAMES){const response=await fetch('./sample/'+encodeURIComponent(name));if(!response.ok)throw Error('架空画像を取得できません');files.push(new File([await response.blob()],name,{type:'image/png'}));}await appendImages(files);status('架空の日誌4枚を読み込みました。「全4枚を順番に自動読み取り」を押すと日付と患者一覧を自動抽出します。');}
 catch(e){status('架空画像を読み込めません：'+e.message,'bad');}
};
$('choose').onchange=async e=>{try{await appendImages([...e.target.files]);status(`${pages.length}枚を読み込みました。架空の日誌のみでテストしてください。`);}catch(err){status(err.message,'bad')}finally{e.target.value=''}};
$('clear').onclick=()=>{if(busy)return;pages.forEach(p=>URL.revokeObjectURL(p.src));pages.length=0;active=-1;render();status('写真・認識結果・確認状況を消去しました。');};
$('date').oninput=e=>{const p=pages[active];if(!p)return;p.date=e.target.value;resetReview(p);syncCheckState(p);renderPhotos();};
function addRow(field){const p=pages[active];if(!p)return;p[field].push({row:p[field].length+1,value:''});resetReview(p);render();}
$('adAdd').onclick=()=>addRow('admission');$('disAdd').onclick=()=>addRow('discharge');
for(const [id,key] of [['checkDate','date'],['checkNames','names'],['checkCounts','counts']]){
 $(id).onchange=e=>{const p=pages[active];if(!p)return;p.checked[key]=e.target.checked;p.approved=false;syncCheckState(p);renderPhotos();};
}
$('approve').onclick=()=>{const p=pages[active];if(!p||$('approve').disabled)return;p.approved=true;render();status('この架空日誌の目視確認を完了しました。患者管理データへの登録は一切行っていません。','good');};
render();
