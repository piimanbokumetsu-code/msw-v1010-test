'use strict';
/* Split export UI v02 — isolated fictional-patient validation ONLY.
   Preserve in-memory pending blob and status across settings-screen re-render.
   If Safari reloads, do not pretend an incomplete set was completed. */
(()=>{
const allowed='/msw-v1010-test/msw-patient-kana-search-stage-20261029/';
if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!==allowed)return;
const SESSION_KEY='msw-fake-split-export-v02-status';
const baseRender=renderSettings;
let processing=false,stage='idle',message='未実施',item=null,number=0;
let priorInterrupted=false;
try{
 const previous=sessionStorage.getItem(SESSION_KEY);
 if(previous&&previous!=='complete'){
  priorInterrupted=true;
  message='前回の分割書き出しは完了を確認できません。ダウンロードした一部のファイルだけでは復元できません。最初からやり直してください。';
  stage='interrupted';
 }
}catch{}
const $p=id=>document.getElementById(id);
function setStatus(next,text){
 stage=next;message=text;
 try{if(next==='idle'||next==='complete')sessionStorage.removeItem(SESSION_KEY);
 else sessionStorage.setItem(SESSION_KEY,next)}catch{}
 update();
}
function beginDownload(blob,filename){
 if(!blob||!blob.size||typeof filename!=='string')throw Error('保存するファイルが不正です');
 const a=document.createElement('a'),url=URL.createObjectURL(blob);
 a.href=url;a.download=filename;document.body.appendChild(a);
 a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),90000);
}
function update(){
 const panel=$p('splitExportRow');
 if(!panel)return;
 const begin=panel.querySelector('#splitStart'),next=panel.querySelector('#splitNext'),info=panel.querySelector('#splitState');
 begin.disabled=processing;
 info.textContent=message;
 if(item){
  next.hidden=false;
  next.textContent=item.kind==='manifest'?'管理ファイルを保存':'保存：パート '+item.sequence;
  next.disabled=false;
 }else{
  next.hidden=true;next.disabled=false;
 }
}
function attach(){
 const anchor=$p('backup');
 if(!anchor)return;
 let panel=$p('splitExportRow');
 if(!panel){
  panel=document.createElement('div');panel.id='splitExportRow';panel.className='panel';
  panel.innerHTML='<h3>分割暗号化バックアップ（架空患者専用）</h3><p class="notice">写真を順番に検証し最大48MiBに分割します。各パートを保存し、最後に管理ファイルを保存してください。途中で閉じた場合は不完全です。</p><button type="button" class="btn secondary" id="splitStart">架空患者の分割書出を開始</button> <button type="button" class="btn secondary" id="splitNext" hidden>次のパートを保存</button><p id="splitState" class="notice" role="status">未実施</p>';
  anchor.closest('.panel').insertAdjacentElement('afterend',panel);
 }
 panel.querySelector('#splitStart').onclick=run;
 panel.querySelector('#splitNext').onclick=saveNext;
 update();
}
async function saveNext(){
 if(!item||item.saving)return;
 const pending=item;pending.saving=true;update();
 try{
  beginDownload(pending.blob,pending.name);
  if(pending.kind==='manifest'){
   item=null;setStatus('complete','全ファイルのダウンロードを開始しました。Safariのダウンロード履歴と「ファイル」で、管理ファイルを含む全件が実在するか必ず確認してください。復元成功はまだ未確認です。');
  }else{
   item=null;setStatus('running','パート '+pending.sequence+' のダウンロードを開始しました。次のパートを準備しています…');
   pending.resolve();
  }
 }catch(e){
  item=pending;item.saving=false;
  setStatus('pending','保存を開始できませんでした：'+(e.message||String(e)));
 }
}
async function run(){
 if(processing)return;
 if(item)return;
 processing=true;number=0;priorInterrupted=false;
 setStatus('running','架空患者の暗号化記録を確認しています…');
 try{
  const result=await MSWExportBridge.run(async(desc,blob)=>{
   number++;
   if(item)throw Error('保存待ちのパートが重複しました');
   await new Promise((resolve)=>{
    item={kind:'part',blob,name:desc.name,sequence:number,resolve,saving:false};
    setStatus('pending','パート '+number+'（'+(desc.bytes/1048576).toFixed(2)+'MiB）の保存操作をしてください。保存の実在確認は後で行います。');
   });
  });
  item={kind:'manifest',name:result.name,blob:result.blob,saving:false};
  setStatus('pending','写真 '+result.photoCount+'枚、パート '+result.partCount+'個のダウンロード操作が終わりました。最後に管理ファイルを保存してください。');
 }catch(e){
  item=null;
  setStatus('interrupted','分割書き出しは中断されました：'+(e.message||String(e))+'。部分ファイルは復元には使えません。');
 }finally{
  processing=false;
  update();
 }
}
renderSettings=async function(...args){await baseRender(...args);attach()};
})();