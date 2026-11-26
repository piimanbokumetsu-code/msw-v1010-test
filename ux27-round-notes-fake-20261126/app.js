/* UX27 isolated fictional-patient prototype; nothing imported from the live MSW app.
   Storage: one namespaced browser-local key containing ONLY fictional test notes.
   The browser's speech recognition service MAY send spoken audio outside the device. */
(function(){
'use strict';
const C=window.UX27FakeCore;
if(!C)throw Error('UX27 fictional core did not load');
const $=id=>document.getElementById(id);
const esc=C.esc;
const recognizedBy=window.SpeechRecognition||window.webkitSpeechRecognition;
const pwa=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
let storage=null,storageIssue='',notes=[],screen='list',patientId=null,returnScreen='list',historyExpanded=false;
let selectedDate=C.day(new Date()),dailyScroll=0,recognition=null,recordingPatient=null;
let micPrefix='',micDone='',micPartial='',micError='';
const drafts=Object.create(null);
try{
  storage=window.localStorage;
  const raw=storage.getItem(C.KEY);
  notes=C.clean(raw?JSON.parse(raw):[]);
}catch(e){
  storage=null;
  storageIssue='この環境では架空メモの保存・再読み込みができません。';
}
function localDateLabel(day){
  return day?day.replace(/-/g,'/'):'—';
}
function showMessage(message,kind){
  const node=$('globalStatus');
  node.textContent=message||'';
  node.dataset.kind=kind||'info';
}
function syncStoreState(){
  $('storeState').textContent=storage
    ? '架空メモ '+notes.length+' 件を、このブラウザー内のテスト専用領域に保存しています（暗号化なし）。'
    : storageIssue;
}
function compose(prefix,done,partial){
  return [String(prefix).trim(),String(done).trim(),String(partial).trim()].filter(Boolean).join('\n');
}
function micMessage(m,type){
  const n=$('micStatus');
  if(n){n.textContent=m;n.dataset.kind=type||'info'}
}
function stopSpeech(abort){
  if(!recognition)return;
  const r=recognition;
  const input=$('memoDraft');
  if(input){
    input.value=compose(micPrefix,micDone,abort?'':micPartial);
    if(recordingPatient)drafts[recordingPatient]=input.value;
  }
  recognition=null;
  recordingPatient=null;
  try{if(abort)r.abort();else r.stop()}catch(_){}
  const start=$('startMic'),stop=$('stopMic'),save=$('saveMemo');
  if(start){start.disabled=!recognizedBy;start.textContent='🎤 マイクで入力';start.setAttribute('aria-pressed','false')}
  if(stop)stop.disabled=true;
  if(save)save.disabled=false;
  if(input)input.readOnly=false;
}
function stashDraft(){
  if(screen!=='patient'||!patientId)return;
  const input=$('memoDraft');
  if(input&&(!recognition||recordingPatient!==patientId))drafts[patientId]=input.value;
}
function navigate(to,pid=null,from=null){
  if(screen==='patient'){
    if(recognition)stopSpeech(true);
    stashDraft();
  }
  screen=to;
  patientId=to==='patient'?pid:null;
  if(to==='patient'){
    returnScreen=from||'list';
    historyExpanded=false;
  }
  for(const id of ['listView','patientView','dailyView'])$(id).hidden=(id!==to+'View');
  $('screenTitle').textContent=to==='patient'?'基本情報（架空患者）':to==='daily'?'回診メモ一覧':'架空の患者一覧';
  $('navList').hidden=to==='list';
  $('navDaily').hidden=to==='daily';
  if(to==='list')renderList();
  if(to==='patient')renderPatient();
  if(to==='daily')renderDaily();
  window.scrollTo(0,to==='daily'&&from==='patient'?dailyScroll:0);
}
function fakeField(label,value){
  return '<div class="fake-field"><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b></div>';
}
function daysSince(date){
  const from=new Date(date+'T00:00:00');
  const now=new Date();now.setHours(0,0,0,0);
  return Number.isFinite(from.getTime())?Math.max(0,Math.round((now.getTime()-from.getTime())/86400000))+'日':'—';
}
function renderList(){
  const counts=C.daily(notes,C.day(new Date()));
  const map=new Map(counts.map(g=>[g.patient.id,g.notes.length]));
  $('listView').innerHTML='<div class="section-head"><div><h2>架空の在院患者 '+C.patients.length+'名</h2><p>患者を開くと「基本」タブの一番下に回診メモがあります。</p></div><button class="primary" id="openDaily">🗓 回診メモ一覧</button></div>'+
  '<div class="beds">'+C.patients.map(p=>
    '<button type="button" class="patient-card" data-pid="'+esc(p.id)+'"><span class="bed-no">'+esc(p.bed)+'</span><span class="patient-name">'+esc(p.name)+'</span><small>'+esc(p.doctor)+'</small>'+
    (map.has(p.id)?'<span class="small-chip">今日 '+map.get(p.id)+'件</span>':'')+'</button>'
  ).join('')+'</div>';
  $('openDaily').onclick=()=>navigate('daily');
  $('listView').querySelectorAll('[data-pid]').forEach(b=>b.onclick=()=>navigate('patient',b.dataset.pid,'list'));
  syncStoreState();
}
function historyMarkup(records){
  if(records.length<2)return '<p class="quiet">過去の回診メモはまだありません。</p>';
  let previousDay='',out='';
  for(const record of records.slice(1)){
    const d=C.day(record.ts);
    if(d!==previousDay){out+='<h4 class="history-date">'+esc(localDateLabel(d))+'</h4>';previousDay=d;}
    out+='<div class="history-entry"><time>'+esc(C.time(record.ts))+'</time><div class="note-text">'+esc(record.body)+'</div></div>';
  }
  return out;
}
function renderPatient(preserveScroll){
  const p=C.patients.find(x=>x.id===patientId);
  if(!p){navigate('list');return;}
  const y=preserveScroll?window.scrollY:0;
  const all=C.byPatient(notes,p.id),latest=all[0];
  const doc='<section class="fake-documents"><h3>写真・書類（画面配置の参考）</h3><div class="document-placeholder">ジェノグラム・入院時患者情報は、この架空テストでは使用しません。</div></section>';
  $('patientView').innerHTML=
    '<div class="sheethead"><button id="backPatient" class="ghost">← '+(returnScreen==='daily'?'回診メモ一覧':'患者一覧')+'へ戻る</button><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.bed)+'</small></div><span class="tab-on">基本</span></div>'+
    '<section class="fake-basic"><h2>基本情報</h2><p class="quiet">既存の基本情報の並びを参考にした架空表示。これらの項目は変更できません。</p>'+
    '<div class="basic-row">'+fakeField('ベッド番号',p.bed)+fakeField('入院日',p.admission)+fakeField('入院日数',daysSince(p.admission))+'</div>'+
    '<div class="basic-row">'+fakeField('ID','架空'+p.id.slice(-1).toUpperCase())+fakeField('氏名',p.name)+fakeField('フリガナ','カクウカンジャ')+fakeField('市町村','架空市')+fakeField('家族構成','架空の家族')+'</div>'+
    '<div class="basic-row">'+fakeField('主治医',p.doctor)+fakeField('病名',p.diagnosis)+'</div>'+
    '<div class="basic-row">'+fakeField('介護度',p.care)+fakeField('調査日','—')+'</div>'+
    '<div class="basic-row">'+fakeField('介護情報','架空の介護情報')+'</div>'+
    '<div class="basic-row">'+fakeField('入院元','架空の病院')+'</div>'+
    '<div class="basic-row">'+fakeField('備考','架空の基本情報だけを表示')+'</div>'+
    '<details class="basic-extra"><summary>その他の既存項目（保険・本人職業・術式・かかりつけ）</summary><p class="quiet">この架空テストでは入力・保存の対象外です。</p></details></section>'+
    doc+
    '<section class="memo-section" id="roundMemo"><h2>📝 回診メモ <small>UX27 テスト</small></h2>'+
    '<p class="quiet">新しい記録は日付・時刻付きで追加。過去のメモは上書きしません。</p>'+
    '<div class="latest"><h3>最新の回診メモ</h3>'+
    (latest?'<time>'+esc(localDateLabel(C.day(latest.ts))+' '+C.time(latest.ts))+'</time><div class="note-text">'+esc(latest.body)+'</div>':'<p class="quiet">まだ記録はありません。</p>')+'</div>'+
    '<label for="memoDraft">新しい回診メモを入力</label>'+
    '<textarea id="memoDraft" rows="4" maxlength="2000" placeholder="架空の内容を話すか、文字で入力してください。">'+esc(drafts[p.id]||'')+'</textarea>'+
    '<div class="mic-row"><button id="startMic" class="primary" type="button" '+(!recognizedBy?'disabled':'')+' aria-pressed="false">🎤 マイクで入力</button><button id="stopMic" type="button" disabled>■ 停止</button></div>'+
    '<p id="micStatus" class="status" role="status" aria-live="polite">'+(recognizedBy?'マイクを押すと日本語音声入力を開始します。':'この環境では専用音声入力が利用できません。手入力を使用できます。')+'</p>'+
    '<div class="memo-actions"><button id="insertExample" type="button" class="ghost">架空例文を入力欄へ</button><button id="saveMemo" type="button" class="primary">記録を追加</button></div>'+
    '<p id="saveStatus" class="status" role="status" aria-live="polite">保存する前に文章を確認してください。</p>'+
    '<button id="toggleHistory" type="button" aria-expanded="'+historyExpanded+'" class="history-toggle">▸ 過去の回診メモを見る（'+Math.max(0,all.length-1)+'件）</button>'+
    '<div id="historyPane" class="history-pane" '+(!historyExpanded?'hidden':'')+'>'+historyMarkup(all)+'</div></section>';
  $('backPatient').onclick=()=>navigate(returnScreen,null,'patient');
  const area=$('memoDraft');
  area.addEventListener('input',()=>{drafts[p.id]=area.value;});
  $('insertExample').onclick=()=>{
    if(recognition)return;
    area.value=area.value.trim()?area.value.trim()+'\n今後の方針を検討するため家族を呼ぶ':'今後の方針を検討するため家族を呼ぶ';
    drafts[p.id]=area.value;
    area.focus();
  };
  $('saveMemo').onclick=()=>saveMemo(p);
  $('toggleHistory').onclick=()=>{
    historyExpanded=!historyExpanded;
    $('historyPane').hidden=!historyExpanded;
    $('toggleHistory').setAttribute('aria-expanded',String(historyExpanded));
    $('toggleHistory').textContent=(historyExpanded?'▾':'▸')+' 過去の回診メモを見る（'+Math.max(0,all.length-1)+'件）';
  };
  $('startMic').onclick=()=>startSpeech(p.id);
  $('stopMic').onclick=()=>{if(!recognition)return;micMessage('音声認識を終了しています…');try{recognition.stop()}catch(e){stopSpeech(true);micMessage('終了できませんでした。','error')}};
  if(preserveScroll)window.scrollTo(0,y);
}
function saveMemo(p){
  const area=$('memoDraft'),status=$('saveStatus');
  if(recognition){status.textContent='音声認識を停止してから保存してください。';status.dataset.kind='error';return;}
  const content=area.value.trim();
  let next;
  try{
    const stamp=new Date().toISOString();
    const id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
    next=C.next(notes,p.id,content,stamp,id);
  }catch(e){status.textContent=e.message;status.dataset.kind='error';return;}
  if(!storage){
    status.textContent='架空メモの保存領域が利用できません。入力内容は残しています。';
    status.dataset.kind='error';return;
  }
  try{storage.setItem(C.KEY,JSON.stringify(next));}
  catch(e){
    status.textContent='保存に失敗しました。入力内容と過去の履歴は残しています。';
    status.dataset.kind='error';return;
  }
  notes=next;
  drafts[p.id]='';
  renderPatient(true);
  $('saveStatus').textContent='保存しました。日付・時刻付きで追加されています。';
  $('saveStatus').dataset.kind='ok';
  syncStoreState();
}
function startSpeech(pid){
  if(!recognizedBy||recognition)return;
  const input=$('memoDraft');
  let r;
  try{r=new recognizedBy();}catch(e){micMessage('マイクの利用を開始できません。','error');return}
  r.lang='ja-JP';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
  micPrefix=input.value;micDone='';micPartial='';micError='';
  recognition=r;recordingPatient=pid;
  input.readOnly=true;
  $('startMic').disabled=true;$('stopMic').disabled=false;$('saveMemo').disabled=true;
  $('startMic').textContent='🎙️ 認識しています';
  $('startMic').setAttribute('aria-pressed','true');
  micMessage('マイクを開始します。架空の業務メモだけを話してください。');
  r.onstart=()=>{if(recognition!==r)return;micMessage('音声を認識中。話し終えたら停止を押してください。','active');};
  r.onresult=e=>{
    if(recognition!==r)return;
    let final='',interim='';
    for(let i=0;i<e.results.length;i++){
      const item=e.results[i],piece=String(item[0]?.transcript||'').trim();
      if(item.isFinal)final+=piece;else interim+=piece;
    }
    micDone=final;micPartial=interim;
    input.value=compose(micPrefix,micDone,micPartial);
    drafts[pid]=input.value;
    micMessage(interim?'変換中…途中の文字は変わることがあります。':'文字を認識しました。','active');
  };
  r.onerror=e=>{
    if(recognition!==r)return;
    micError=String(e.error||'不明');
    stopSpeech(true);
    micMessage('音声認識エラー：'+micError+'。手入力に切り替えることもできます。','error');
  };
  r.onend=()=>{
    if(recognition!==r)return;
    stopSpeech(false);
    micMessage(micDone||micPartial?'文字に変換しました。内容を確認して保存してください。':'文字を認識できませんでした。',micDone||micPartial?'ok':'info');
  };
  try{r.start()}catch(e){stopSpeech(true);micMessage('音声認識を開始できませんでした：'+String(e?.name||'不明'),'error');}
}
function renderDaily(){
  $('dailyView').innerHTML='<div class="section-head"><div><h2>🗓 回診メモ一覧</h2><p>指定した日にメモを記録した患者だけを表示します。</p></div><button id="dailyBack" class="ghost">← 患者一覧</button></div>'+
    '<div class="date-control"><label for="dailyDate">表示する日付</label><input id="dailyDate" type="date" value="'+esc(selectedDate)+'"></div>'+
    '<div id="dailyGroups"></div>';
  $('dailyBack').onclick=()=>navigate('list');
  $('dailyDate').onchange=e=>{selectedDate=e.target.value;drawDailyGroups();};
  drawDailyGroups();
}
function drawDailyGroups(){
  const groups=C.daily(notes,selectedDate);
  $('dailyGroups').innerHTML=groups.length?
    '<p class="quiet">'+esc(localDateLabel(selectedDate))+'の入力：'+groups.length+'名／'+groups.reduce((a,b)=>a+b.notes.length,0)+'件</p>'+
    groups.map(g=>
      '<section class="daily-group"><button type="button" class="daily-patient" data-open-patient="'+esc(g.patient.id)+'"><span class="bed-no">'+esc(g.patient.bed)+'</span><strong>'+esc(g.patient.name)+'</strong><span class="open-arrow">患者情報へ ›</span></button>'+
      g.notes.map(n=>'<div class="daily-entry"><time>'+esc(C.time(n.ts))+'</time><p class="note-text">'+esc(n.body)+'</p></div>').join('')+
      '</section>').join('')
    :'<div class="empty-day">この日に入力された回診メモはありません。<br>患者一覧から架空の患者を開いて入力してみてね。</div>';
  $('dailyGroups').querySelectorAll('[data-open-patient]').forEach(b=>b.onclick=()=>{dailyScroll=window.scrollY;navigate('patient',b.dataset.openPatient,'daily');});
}
function resetFake(){
  if(!window.confirm('このテスト画面だけに保存した架空の回診メモをすべて削除します。よろしいですか？'))return;
  if(!storage){showMessage('保存領域が利用できません。','error');return}
  try{storage.removeItem(C.KEY);}
  catch(e){showMessage('架空メモを削除できませんでした。','error');return}
  notes=[];
  Object.keys(drafts).forEach(k=>delete drafts[k]);
  renderList();
  showMessage('このテスト版の架空メモだけを消去しました。患者管理ソフトの情報には影響しません。','ok');
}
$('navList').onclick=()=>navigate('list');
$('navDaily').onclick=()=>navigate('daily');
$('clearFake').onclick=resetFake;
const mode=pwa?'ホーム画面PWA':'Safariなどのブラウザー';
$('mode').textContent=mode;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recognition){stopSpeech(true);micMessage('画面が非表示になったためマイクを終了しました。')}});
window.addEventListener('pagehide',()=>{if(recognition)stopSpeech(true)});
navigate('list');
syncStoreState();
showMessage('この画面は架空患者だけを扱う独立テスト版です。','info');
})();