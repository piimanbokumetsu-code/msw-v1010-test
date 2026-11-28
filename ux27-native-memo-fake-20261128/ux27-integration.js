/* UX27 Integration Candidate (fake test first).
   Uses existing encrypted state: patient.notes = [{id,type,at,text}].
   No new IndexedDB object store, no backup format change, no network requests.
   This script is deliberately loaded last, after the existing UI addons. */
(function(){
'use strict';
if(window.__UX27_INTEGRATED__||!window.UX27Host)return;
window.__UX27_INTEGRATED__=true;
const host=window.UX27Host;
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
// Fake-only speech integration. In production the microphone stays disabled.
const SR=window.webkitSpeechRecognition||window.SpeechRecognition||null;
let ux27OfflineVoiceConfirmed=false;
function ux27VoiceAllowed(){
 return Boolean(SR&&window.isSecureContext&&navigator.onLine===false&&ux27OfflineVoiceConfirmed&&host.unlocked()&&!document.hidden);
}
function ux27VoiceRefresh(){
 const start=$('ux27Start'),check=$('ux27OfflineVoiceConfirm');
 if(check)check.checked=ux27OfflineVoiceConfirmed;
 if(start)start.disabled=!ux27VoiceAllowed()||Boolean(recognizer)||noteSaving;
 const note=$('ux27VoiceReadiness');
 if(note)note.textContent=!SR?'この端末のSafariでは音声認識APIが使えません。':
 ux27VoiceAllowed()?'オフライン確認済み：マイクを1回タップすると音声認識を開始できます。':
 '実際の患者情報は話さないでください。機内モードON・Wi-Fi OFFを確認後、チェックしてください。';
}

function panelMarkup(patient){
 const notes=notesFor(patient),latest=notes[0],older=notes.slice(1);
 const history=older.map(n=>'<div class="ux27-history-note"><time>'+escape(dateLabel(n.at)+' '+clock(n.at))+'</time><div>'+escape(n.text)+'</div></div>').join('');
 return '<section class="ux27-panel" id="ux27Panel" aria-label="回診メモ">'+
   '<h3>📝 回診メモ</h3><p class="ux27-help">基本情報の一番下に追加。過去の記録を残して追記します。</p>'+
   '<div class="ux27-latest"><strong>最新の記録</strong>'+
   (latest?'<time>'+escape(dateLabel(latest.at)+' '+clock(latest.at))+'</time><div>'+escape(latest.text)+'</div>':'<p>まだ回診メモはありません。</p>')+'</div>'+
   '<label for="ux27Text">新しい回診メモ</label><textarea id="ux27Text" rows="3" maxlength="'+MAX+'" placeholder="回診メモを入力してください"></textarea>'+
   '<label class="ux27-help" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input id="ux27OfflineVoiceConfirm" type="checkbox" style="width:21px;height:21px;flex-shrink:0">架空テスト用：機内モードON・Wi-Fi OFFを手動で確認した</label>'+'<p id="ux27VoiceReadiness" class="ux27-help" role="status">通信遮断と確認チェックがそろうまでは音声入力できません。</p>'+'<div class="ux27-controls"><button id="ux27Start" type="button" class="btn secondary" disabled aria-pressed="false">🎤 音声入力</button>'+
   '<button type="button" id="ux27Stop" class="btn secondary" disabled>■ 停止</button>'+
   '<button type="button" id="ux27Save" class="btn">記録を追加</button></div>'+
   '<p id="ux27Status" class="ux27-status" role="status" aria-live="polite">架空データ限定。Safariの音声認識で文字起こし後、内容を必ず確認してね。通信中の利用はできません。</p>'+
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
 if($('ux27Start')){$('ux27Start').disabled=true;$('ux27Start').textContent='🎤 音声入力';$('ux27Start').setAttribute('aria-pressed','false');}
 if($('ux27Stop'))$('ux27Stop').disabled=true;
 if($('ux27Save'))$('ux27Save').disabled=false;
}
function onMicStart(patient){
 if(!ux27VoiceAllowed()||recognizer||noteSaving||host.getPatient()!==patient){
  message('この架空テストでは通信遮断の確認が必要です。','error');ux27VoiceRefresh();return;
 }
 let r;try{r=new SR()}catch(e){message('音声認識を開始できません。','error');return;}
 if('processLocally' in r){r.processLocally=true;}
 r.lang='ja-JP';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
 const box=$('ux27Text');
 micPrefix=box.value.trim();micFinal='';micDraft='';micError='';
 speechPatient=patient;recognizer=r;
 box.readOnly=true;
 $('ux27Start').disabled=true;$('ux27Start').setAttribute('aria-pressed','true');
 $('ux27Stop').disabled=false;$('ux27Save').disabled=true;
 message('マイクの利用を開始します。架空の業務メモだけを話してください。','info');
 r.onstart=()=>{if(recognizer!==r)return;if(!ux27VoiceAllowed()){abortMic();message('通信状態が変わったため音声入力を停止しました。','error');return;}message('音声を認識中。終了するときは「停止」を押してください。','active')};
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
  $('ux27Start').disabled=!ux27VoiceAllowed();$('ux27Start').setAttribute('aria-pressed','false');
  $('ux27Stop').disabled=true;$('ux27Save').disabled=false;
  message(micFinal||micDraft?'文字起こしが完了しました。確認して保存してください。':'音声を認識できませんでした。',micFinal||micDraft?'ok':'info');
 };
 try{r.start()}catch(e){abortMic();message('開始できませんでした：'+String(e?.name||'不明'),'error');}
}
function bindPanel(patient){
 const start=$('ux27Start'),stop=$('ux27Stop'),save=$('ux27Save'),offline=$('ux27OfflineVoiceConfirm');
 if(!start||!stop||!save||!offline)return;
 offline.onchange=()=>{
  ux27OfflineVoiceConfirmed=Boolean(offline.checked);
  if(!ux27VoiceAllowed()&&recognizer)abortMic();
  ux27VoiceRefresh();
 };
 start.onclick=()=>onMicStart(patient);
 stop.onclick=()=>{if(!recognizer)return;stop.disabled=true;message('音声を終了しています…');try{recognizer.stop()}catch(e){abortMic();message('停止できませんでした。','error')}};
 save.onclick=()=>{void saveRoundNote(patient)};
 ux27VoiceRefresh();
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
 if(recognizer&&speechPatient!==host.getPatient())abortMic();
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
// Stable capture-phase handlers: unlike handlers attached to a temporary
// daily section, these survive every patient-list or date re-render.
function ux27ButtonFromEvent(event){
 const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
 const button=target?.closest?.('#ux27Daily button.ux27-patient[data-ux27-id]');
 return button?.isConnected?button:null;
}
function ux27Trace(){} // no diagnostic UI in production
let ux27LastActivationTime=0,ux27LastActivationId='';
function ux27ActivatePatient(button,source){
 if(!button||!host.unlocked()||!$('ux27Daily'))return;
 const id=String(button.getAttribute('data-ux27-id')||'');
 const now=Date.now();
 if(id===ux27LastActivationId&&now-ux27LastActivationTime<1000)return;
 ux27LastActivationId=id;ux27LastActivationTime=now;
 ux27Trace('B：'+source+'で患者選択処理に到達');
 const patient=host.activePatients().find(p=>String(p.id)===id);
 if(!patient){alert('該当する在院患者が見つかりません。患者一覧で確認してください。');return;}
 dailyScroll=window.scrollY;
 returnToDaily=true;
 ux27Trace('C：患者を確認、基本情報を開きます');
 try{
  host.openPatient(patient);
  const modal=$('modal');
  if(!modal||!$('tabbody')||!modal.querySelector('.basic-information')){
   throw new Error('患者基本情報の生成を確認できませんでした');
  }
  ux27Trace('D：基本情報を生成しました');
 }catch(error){
  const explanation=String(error?.message||error);
  ux27Trace('E：'+explanation);
  if(!$('modal'))returnToDaily=false;
  alert('画面遷移診断 E：'+explanation);
 }
}
document.addEventListener('pointerdown',event=>{
 const daily=$('ux27Daily');
 if(!daily||!daily.contains(event.target))return;
 ux27Trace(ux27ButtonFromEvent(event)?'A：患者ボタンに触れました':'A：一覧内の患者ボタン以外に触れました');
},true);
let ux27TouchStart=null;
document.addEventListener('touchstart',event=>{
 const button=ux27ButtonFromEvent(event),touch=event.touches?.[0];
 if(!touch||event.touches.length!==1)return;
 if(!button){
  if($('ux27Daily')?.contains(event.target))ux27Trace('A：一覧の患者ボタン以外をタッチ');
  return;
 }
 ux27TouchStart={id:button.getAttribute('data-ux27-id'),x:touch.clientX,y:touch.clientY};
 ux27Trace('A：患者ボタンのタッチを検出');
},{capture:true,passive:true});
document.addEventListener('touchend',event=>{
 const start=ux27TouchStart;ux27TouchStart=null;
 const button=ux27ButtonFromEvent(event),touch=event.changedTouches?.[0];
 if(!start||!button||!touch||start.id!==button.getAttribute('data-ux27-id'))return;
 if(Math.abs(touch.clientX-start.x)>16||Math.abs(touch.clientY-start.y)>16)return;
 ux27ActivatePatient(button,'タッチ');
},{capture:true,passive:true});
document.addEventListener('click',event=>{
 const button=ux27ButtonFromEvent(event);
 if(!button)return;
 event.preventDefault();
 event.stopPropagation();
 ux27ActivatePatient(button,'クリック');
},true);

let ux27DrawPhase='開始';
function drawDaily(){
 ux27DrawPhase='画面準備';
 const existing=$('ux27Daily');if(existing)existing.remove();
 const main=$('main');
 if(!main||!host.unlocked())return;
 ux27DrawPhase='一覧データ';
 const markup=dailyMarkup();
 ux27DrawPhase='一覧描画';
 main.querySelectorAll('.kpis,.santherese-nav,.toolbar,#patientList').forEach(el=>el.hidden=true);
 main.insertAdjacentHTML('beforeend',markup);
 ux27DrawPhase='操作接続';
 const date=$('ux27Date'),back=$('ux27Back');
 if(!date||!back)throw new Error('optional controls unavailable');
 date.onchange=e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){chosenDay=e.target.value;drawDaily()}};
 back.onclick=()=>{returnToDaily=false;restoreList()};
 ux27DrawPhase='完了';
}
function restoreList(){window.renderPatients();window.scrollTo(0,0);}
function protectPatientListAfterDailyError(error){
 returnToDaily=false;
 try{
  $('ux27Daily')?.remove();
  $('main')?.querySelectorAll('.kpis,.santherese-nav,.toolbar,#patientList').forEach(el=>{el.hidden=false;});
 }catch(_){}
 const allowed=['NotFoundError','TypeError','RangeError','SyntaxError','InvalidStateError','SecurityError'];
 const kind=allowed.includes(String(error?.name||''))?String(error.name):'Other';
 alert('回診メモ一覧を表示できませんでした。診断：'+ux27DrawPhase+'／'+kind+'。患者一覧は維持します。');
}
const originalPatients=window.renderPatients;
window.renderPatients=function(...args){
 if(recognizer)abortMic();
 // Native patient rendering is never swallowed. Only the optional UX27 UI
 // can fail open, so a broken round-note button cannot block patient access.
 const out=originalPatients.apply(this,args);
 try{
  const hero=document.querySelector('#main .hero');
  if(hero&&host.unlocked()&&!$('ux27OpenDaily')){
   const button=document.createElement('button');
   button.id='ux27OpenDaily';button.className='btn secondary';button.type='button';button.textContent='🗓 回診メモ一覧';
   // Never pass a node from outside this hero to insertBefore.
   // Some production add-ons may move or replace the new-patient button.
   const next=hero.querySelector('#newP');
   if(next&&next.parentNode===hero)hero.insertBefore(button,next);
   else hero.appendChild(button);
   button.onclick=()=>{
    chosenDay=localDay(new Date());
    try{drawDaily()}catch(error){protectPatientListAfterDailyError(error)}
   };
  }
  // Called by the native render() after the current patient's save-before-close checks.
  if(returnToDaily&&host.unlocked()&&!$('modal')){
   returnToDaily=false;
   try{drawDaily();requestAnimationFrame(()=>window.scrollTo(0,dailyScroll))}
   catch(error){protectPatientListAfterDailyError(error)}
  }
 }catch(_){
  returnToDaily=false;
  // Protect all normal patient controls even if an optional UX27 DOM operation fails.
  try{
   $('ux27Daily')?.remove();
   $('main')?.querySelectorAll('.kpis,.santherese-nav,.toolbar,#patientList').forEach(el=>{el.hidden=false;});
  }catch(__){}
 }
 return out;
};
const originalBasic=window.renderBasicDashboard;
window.renderBasicDashboard=function(...args){
 const out=originalBasic.apply(this,args);
 try{installPanel()}catch(_){/* Optional memo panel must not break Basic information. */}
 return out;
};

document.addEventListener('click',event=>{
 const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
 const button=target?.closest?.('#modal #closeM, #modal #saveP, #modal .tab');
 if(!button||!$('ux27Text')?.value.trim())return;
 if(!confirm('未保存の回診メモがあります。保存せず画面を移動しますか？')){
  event.preventDefault();event.stopImmediatePropagation();
 }
},true);
window.addEventListener('online',()=>{
 ux27OfflineVoiceConfirmed=false;
 if(recognizer)abortMic();
 ux27VoiceRefresh();
});
window.addEventListener('offline',ux27VoiceRefresh);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  ux27OfflineVoiceConfirmed=false;
  if(recognizer)abortMic();
  returnToDaily=false;
 }
 ux27VoiceRefresh();
});
window.addEventListener('pagehide',()=>{if(recognizer)abortMic()});
})();