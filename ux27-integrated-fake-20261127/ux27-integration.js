/* UX27 Integration Candidate (fake test first).
   Uses existing encrypted state: patient.notes = [{id,type,at,text}].
   No new IndexedDB object store, no backup format change, no network requests.
   This script is deliberately loaded last, after the existing UI addons. */
(function(){
'use strict';
if(window.__UX27_INTEGRATED__||!window.UX27FakeHost)return;
window.__UX27_INTEGRATED__=true;
const host=window.UX27FakeHost;
const TYPE='回診メモ',MAX=1500;
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDay(stamp){
 const d=new Date(stamp);
 return Number.isFinite(d.getTime())?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):'';
}
function clock(stamp){const d=new Date(stamp);return Number.isFinite(d.getTime())?d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'--:--';}
function dateLabel(stamp){const d=new Date(stamp);return Number.isFinite(d.getTime())?d.toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}):'日時不明';}
function notesFor(patient){
 return (Array.isArray(patient?.notes)?patient.notes:[]).filter(n=>n&&n.type===TYPE&&typeof n.text==='string'&&Number.isFinite(Date.parse(n.at||''))).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
let chosenDay=localDay(new Date()),dailyScroll=0,returnToDaily=false,recognizer=null,speechPatient=null;
let micPrefix='',micFinal='',micDraft='',micError='';
let noteSaving=false;
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

function panelMarkup(patient){
 const notes=notesFor(patient),latest=notes[0],older=notes.slice(1);
 const history=older.map(n=>'<div class="ux27-history-note"><time>'+escape(dateLabel(n.at)+' '+clock(n.at))+'</time><div>'+escape(n.text)+'</div></div>').join('');
 return '<section class="ux27-panel" id="ux27Panel" aria-label="回診メモ">'+
   '<h3>🎤 回診メモ</h3><p class="ux27-help">基本情報の一番下に追加。過去の記録を残して追記します。</p>'+
   '<div class="ux27-latest"><strong>最新の記録</strong>'+
   (latest?'<time>'+escape(dateLabel(latest.at)+' '+clock(latest.at))+'</time><div>'+escape(latest.text)+'</div>':'<p>まだ回診メモはありません。</p>')+'</div>'+
   '<label for="ux27Text">新しい回診メモ</label><textarea id="ux27Text" rows="3" maxlength="'+MAX+'" placeholder="マイクで話すか、文字を入力してください"></textarea>'+
   '<div class="ux27-controls"><button id="ux27Start" type="button" class="btn secondary" '+(!SR?'disabled':'')+' aria-pressed="false">🎤 音声入力</button>'+
   '<button type="button" id="ux27Stop" class="btn secondary" disabled>■ 停止</button>'+
   '<button type="button" id="ux27Save" class="btn">記録を追加</button></div>'+
   '<p id="ux27Status" class="ux27-status" role="status" aria-live="polite">'+(SR?'音声入力後は内容を確認して保存してください。':'この環境では音声認識が利用できません。手入力は可能です。')+'</p>'+
   '<details id="ux27History"><summary>過去の回診メモを見る（'+older.length+'件）</summary>'+
   '<div class="ux27-history-list">'+(history||'<p>過去のメモはありません。</p>')+'</div></details></section>';
}
function message(text,kind='info'){const node=$('ux27Status');if(node){node.textContent=text;node.dataset.kind=kind;}}
function abortMic(clearPartial=true){
 const r=recognizer;
 if(!r)return;
 const box=$('ux27Text');
 if(box&&clearPartial)box.value=[micPrefix,micFinal].filter(Boolean).join('\n');
 recognizer=null;speechPatient=null;
 try{r.abort()}catch(_){}
 if(box)box.readOnly=false;
 if($('ux27Start')){$('ux27Start').disabled=!SR;$('ux27Start').textContent='🎤 音声入力';$('ux27Start').setAttribute('aria-pressed','false');}
 if($('ux27Stop'))$('ux27Stop').disabled=true;
 if($('ux27Save'))$('ux27Save').disabled=false;
}
function onMicStart(patient){
 if(!SR||recognizer||noteSaving)return;
 let r;try{r=new SR()}catch(e){message('音声認識を開始できません。','error');return;}
 r.lang='ja-JP';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
 const box=$('ux27Text');
 micPrefix=box.value.trim();micFinal='';micDraft='';micError='';
 speechPatient=patient;recognizer=r;
 box.readOnly=true;
 $('ux27Start').disabled=true;$('ux27Start').setAttribute('aria-pressed','true');
 $('ux27Stop').disabled=false;$('ux27Save').disabled=true;
 message('マイクの利用を開始します。架空の業務メモだけを話してください。','info');
 r.onstart=()=>{if(recognizer!==r)return;message('音声を認識中。終了するときは「停止」を押してください。','active')};
 r.onresult=e=>{
  if(recognizer!==r)return;
  let final='',interim='';
  for(let i=0;i<e.results.length;i++){const row=e.results[i],s=String(row[0]?.transcript||'').trim();if(row.isFinal)final+=s;else interim+=s;}
  micFinal=final;micDraft=interim;
  box.value=[micPrefix,final,interim].filter(Boolean).join('\n');
  message(interim?'変換中…途中の文字は変わることがあります。':'文字を認識しました。','active');
 };
 r.onerror=e=>{
  if(recognizer!==r)return;
  micError=String(e.error||'不明');abortMic(true);
  message('音声認識エラー：'+micError+'。手入力もできます。','error');
 };
 r.onend=()=>{
  if(recognizer!==r)return;
  recognizer=null;speechPatient=null;
  box.readOnly=false;
  const result=[micPrefix,micFinal,micDraft].filter(Boolean).join('\n');box.value=result;
  $('ux27Start').disabled=false;$('ux27Start').setAttribute('aria-pressed','false');
  $('ux27Stop').disabled=true;$('ux27Save').disabled=false;
  message(micFinal||micDraft?'文字起こしが完了しました。確認して保存してください。':'音声を認識できませんでした。',micFinal||micDraft?'ok':'info');
 };
 try{r.start()}catch(e){abortMic();message('開始できませんでした：'+String(e?.name||'不明'),'error');}
}
function bindPanel(patient){
 const start=$('ux27Start'),stop=$('ux27Stop'),save=$('ux27Save');
 if(!start||!stop||!save)return;
 start.onclick=()=>onMicStart(patient);
 stop.onclick=()=>{if(!recognizer)return;stop.disabled=true;message('音声を終了しています…');try{recognizer.stop()}catch(e){abortMic();message('停止できませんでした。','error')}};
 save.onclick=()=>{void saveRoundNote(patient)};
}
async function saveRoundNote(patient){
 const box=$('ux27Text'),btn=$('ux27Save');
 if(!box||!btn||noteSaving)return;
 if(recognizer){message('マイクを停止してから保存してください。','error');return;}
 const content=box.value.trim();
 if(!content){message('メモを入力してください。','error');return;}
 if(content.length>MAX){message('メモが長すぎます。','error');return;}
 if(host.getPatient()!==patient||!host.unlocked()){message('患者情報が切り替わったかロックされています。','error');return;}
 if(!host.beginNote()){message('ほかの保存処理中です。','error');return;}
 noteSaving=true;btn.disabled=true;message('既存の暗号化保存機構で保存しています…');
 let entry=null;
 try{
  const ok=await host.flushPatient();
  if(!ok||host.getPatient()!==patient||!host.unlocked())throw Error('患者情報の保存を確認できませんでした。');
  entry={id:host.uid(),type:TYPE,at:new Date().toISOString(),text:content};
  patient.notes??=[];patient.notes.push(entry);
  await host.save();
  if(host.getPatient()!==patient||!host.unlocked())return;
  const old=$('ux27Panel');if(!old)return;
  const info=old.parentElement;
  const replacement=document.createElement('div');replacement.innerHTML=panelMarkup(patient);
  old.replaceWith(replacement.firstElementChild);
  bindPanel(patient);
  message('保存しました。既存の暗号化保存データに追記されています。','ok');
 }catch(e){
  if(entry)patient.notes=(patient.notes||[]).filter(x=>x!==entry);
  if(host.getPatient()===patient)message('保存できませんでした。入力内容は残っています：'+String(e.message||e),'error');
 }finally{noteSaving=false;host.endNote();if(btn.isConnected)btn.disabled=false;}
}
function installPanel(){
 const patient=host.getPatient(),root=$('tabbody');
 if(!patient||!root||!host.unlocked())return;
 const info=root.querySelector('.basic-information');
 if(!info||info.querySelector('#ux27Panel'))return;
 info.insertAdjacentHTML('beforeend',panelMarkup(patient));
 bindPanel(patient);
}
function dayGroups(){
 const patients=host.activePatients();
 return patients.map(p=>({patient:p,notes:notesFor(p).filter(n=>localDay(n.at)===chosenDay).reverse()})).filter(x=>x.notes.length);
}
function dailyMarkup(){
 const groups=dayGroups();
 return '<section class="ux27-daily" id="ux27Daily">'+
 '<div class="ux27-daily-head"><h2>🗓 回診メモ一覧</h2><button type="button" id="ux27Back" class="btn secondary">← 患者一覧に戻る</button></div>'+
 '<div class="ux27-date"><label for="ux27Date">表示日付</label><input type="date" id="ux27Date" value="'+escape(chosenDay)+'"></div>'+
 '<div id="ux27Groups">'+(groups.length?
 '<p class="ux27-help">'+groups.length+'名／'+groups.reduce((n,g)=>n+g.notes.length,0)+'件の回診メモ</p>'+
 groups.map(g=>'<section class="ux27-group"><button type="button" class="ux27-patient" data-ux27-id="'+escape(g.patient.id)+'">'+
 '<span>'+escape(g.patient.data?.['ベッド番号']||'未配置')+'</span><strong>'+escape(g.patient.data?.['氏名']||'架空患者')+'</strong><span>基本情報へ ›</span></button>'+
 g.notes.map(n=>'<div class="ux27-entry"><time>'+escape(clock(n.at))+'</time><div>'+escape(n.text)+'</div></div>').join('')+'</section>').join('')
 :'<p class="ux27-empty">この日に入力された回診メモはありません。</p>')+'</div></section>';
}
function drawDaily(){
 const existing=$('ux27Daily');if(existing)existing.remove();
 const main=$('main');
 if(!main||!host.unlocked())return;
 main.querySelectorAll('.kpis,.santherese-nav,.toolbar,#patientList').forEach(el=>el.hidden=true);
 main.insertAdjacentHTML('beforeend',dailyMarkup());
 $('#ux27Date').onchange=e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){chosenDay=e.target.value;drawDaily()}};
 $('#ux27Back').onclick=()=>{returnToDaily=false;restoreList()};
 main.querySelectorAll('[data-ux27-id]').forEach(btn=>btn.onclick=()=>{
  const found=host.activePatients().find(p=>p.id===btn.dataset.ux27Id);
  if(!found)return;
  dailyScroll=window.scrollY;returnToDaily=true;
  host.openPatient(found);
 });
}
function restoreList(){window.renderPatients();window.scrollTo(0,0);}
const originalPatients=window.renderPatients;
window.renderPatients=function(...args){
 if(recognizer)abortMic();
 const out=originalPatients.apply(this,args);
 const hero=document.querySelector('#main .hero');
 if(hero&&host.unlocked()){
  const button=document.createElement('button');
  button.id='ux27OpenDaily';button.className='btn secondary';button.type='button';button.textContent='🗓 回診メモ一覧';
  const next=$('newP');
  if(next)hero.insertBefore(button,next);else hero.appendChild(button);
  button.onclick=()=>{chosenDay=localDay(new Date());drawDaily();};
 }
 return out;
};
const originalBasic=window.renderBasicDashboard;
window.renderBasicDashboard=function(...args){
 const out=originalBasic.apply(this,args);
 installPanel();
 return out;
};
const originalClose=window.closePatient;
window.closePatient=function(...args){
 if(recognizer)abortMic();
 const restore=returnToDaily;
 const out=originalClose.apply(this,args);
 if(restore&&host.unlocked()){
  returnToDaily=false;
  drawDaily();
  requestAnimationFrame(()=>window.scrollTo(0,dailyScroll));
 }
 return out;
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recognizer)abortMic()});
window.addEventListener('pagehide',()=>{if(recognizer)abortMic()});
})();