'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const enc=new TextEncoder(), dec=new TextDecoder();
const DB_NAME='msw_journal_print_fiction_20261027_v1', STORE='kv';
let db=null,key=null,state=null,meta=null,screen='patients',selectedPatient=null,activeTab='basic',lockTimer=null;
const APP_VERSION='JP-FICTION-0.03';

const masterFields=['ベッド番号','主治医','病名','保険','本人職業','術式','入院元','かかりつけ','家構','KP職業','介護度','入院時介護度','介護連携','ケアマネ・施設','検討会','退院支援','食事','食事：介助量','水分：トロミ','排泄','排泄：介助量','排泄：尿便意','排泄：利用','移乗','移動器具','睡眠','睡眠：薬剤','高次脳','問題行動','スケール','リハ状況','DM注','コール'];
const defaultMasters={
  '進捗ステータス':['未設定','情報収集中','家族調整中','施設調整中','介護申請中','退院先決定','要対応'],
  '経過記録種別':['面談','家族連絡','施設連絡','院内連携','制度・申請','その他'],
  '介護度':['未申請','申請中','非該当','要支援1','要支援2','要介護1','要介護2','要介護3','要介護4','要介護5'],
  '入院時介護度':['未申請','申請中','非該当','要支援1','要支援2','要介護1','要介護2','要介護3','要介護4','要介護5'],
  '食事':['自立','見守り','一部介助','全介助'],
  '移乗':['自立','見守り','一部介助','全介助'],
  '移動器具':['独歩','杖','歩行器','車椅子','ストレッチャー'],
  '睡眠':['良好','不良','不明'],
  'コール':['自立','使用可','使用困難','不明']
};
function ensureStateSchema(){
  if(!state)return;
  state.version=APP_VERSION;
  state.masters??={};
  for(const [k,vals] of Object.entries(defaultMasters)) state.masters[k]=uniq([...(state.masters[k]||[]),...vals]);
  for(const f of masterFields){
    const fromPatients=(state.patients||[]).map(p=>String(p.data?.[f]??'').trim()).filter(Boolean);
    if(f==='ベッド番号')continue; // Official 67 beds are independent of imported values.
    state.masters[f]=uniq([...(state.masters[f]||[]),...fromPatients]);
  }
}
function uniq(a){return [...new Set(a.map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));}
function officialBeds(){return [...BED_LAYOUT,...ICU_LAYOUT].flatMap(r=>r.beds.map(n=>bedKey(r.room,n)))}
function masterValues(f,current=''){
  if(f==='ベッド番号')return officialBeds();
  ensureStateSchema();return uniq([...(state.masters?.[f]||[]),...(current?[current]:[])]);
}
function masterSelectHtml(f,v='',attrs='data-field="'+f+'"'){
  if(f==='ベッド番号'){
    const current=String(v||'').trim(),valid=officialBeds().some(b=>normalizeBed(b)===normalizeBed(current));
    const opts=officialBeds().map(b=>`<option value="${esc(b)}" ${normalizeBed(current)===normalizeBed(b)?'selected':''}>${esc(b)}</option>`).join('');
    // Preserve legacy/invalid value until user explicitly chooses a valid bed.
    const legacy=current&&!valid?`<option value="${esc(current)}" selected>その他・未配置（現在：${esc(current)}）</option>`:'';
    return `<select ${attrs} data-master-field="ベッド番号"><option value="" ${!current?'selected':''}>その他・未配置（ベッド未選択）</option>${legacy}${opts}</select>`;
  }
  const opts=masterValues(f,v).map(x=>`<option value="${esc(x)}" ${String(v)===String(x)?'selected':''}>${esc(x)}</option>`).join('');
  return `<select ${attrs} data-master-field="${esc(f)}"><option value="">未選択</option>${opts}<option value="__add__">＋ リストにない → 新規登録</option></select>`;
}
function bindMasterSelects(root=document){
  root.querySelectorAll?.('[data-master-field]').forEach(el=>el.onchange=async()=>{
    if(el.value!=='__add__')return;
    const f=el.dataset.masterField; const v=(prompt(`${f} の新しい候補を登録してください`)||'').trim();
    if(!v){el.value='';return;}
    state.masters[f]=uniq([...(state.masters[f]||[]),v]);
    await save();
    const addOpt=[...el.options].find(o=>o.value==='__add__');
    const o=document.createElement('option');o.value=v;o.textContent=v;el.insertBefore(o,addOpt);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

const legacyFields=['ADL調査日','DM注','ＩＤ','KP','KP職業','KP年齢','MMT右下','MMT右上','MMT左下','MMT左上','かかりつけ','ケアマネ・施設','コール','スケール','スケール：点数','ベッド番号','リハ状況','移乗','移動器具','家屋','家構','介護度','介護連携','介護情報','検討会','高次脳','氏名','主治医','住所','術式','食事','食事：介助量','水分：トロミ','睡眠','睡眠：薬剤','退院支援','調査日','入院元','入院時介護度','入院日','入院日数','排泄','排泄：介助量','排泄：尿便意','排泄：利用','番号','備考','病名','保険','本人職業','問題行動'];
const groups={
  basic:['ベッド番号','ＩＤ','氏名','入院日','主治医','病名','住所','保険','本人職業','術式','入院元','かかりつけ','家構'],
  care:['KP','KP職業','KP年齢','介護度','入院時介護度','介護連携','ケアマネ・施設','検討会','退院支援'],
  adl:['ADL調査日','食事','食事：介助量','水分：トロミ','排泄','排泄：介助量','排泄：尿便意','排泄：利用','移乗','移動器具','睡眠','睡眠：薬剤','高次脳','問題行動','スケール','スケール：点数','MMT右上','MMT右下','MMT左上','MMT左下','リハ状況','DM注','コール'],
};
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function nowISO(){return new Date().toISOString()}
function fmtDate(v){if(!v)return'';const d=new Date(v);if(isNaN(d))return v;return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`}
function daysSince(v){
  if(!v)return'';
  // A date-only string is parsed as UTC by Safari. Compare local calendar dates,
  // otherwise admission-day count changes at 09:00 JST rather than midnight.
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if(m){
    const y=+m[1],mo=+m[2],day=+m[3];
    const date=new Date(y,mo-1,day);
    if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==day)return'';
    const today=new Date();
    return Math.max(0,Math.round((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.UTC(y,mo-1,day))/86400000)+1);
  }
  const d=new Date(v);if(isNaN(d))return'';
  const today=new Date();
  return Math.max(0,Math.round((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000)+1);
}
function bedGroup(b){b=String(b||'未配置').toUpperCase();if(b.startsWith('ICU')){const m=b.match(/^ICU(\d)/);return m?`ICU${m[1]}`:'ICU'}const m=b.match(/^(\d{3})/);return m?m[1].slice(0,2)+'0':'その他'}
function humanBytes(n){if(!n)return'0 B';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}
async function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>{db=r.result;res(db)};r.onerror=()=>rej(r.error)})}
function idbGet(k){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly').objectStore(STORE).get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error)})}
function idbSet(k,v){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error||new Error('保存に失敗しました'));tx.onabort=()=>rej(tx.error||new Error('保存が中断されました'));tx.objectStore(STORE).put(v,k)})}
function idbDel(k){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite').objectStore(STORE).delete(k);t.onsuccess=()=>res();t.onerror=()=>rej(t.error)})}
function idbKeys(){return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
// Restore related records in a single IndexedDB transaction: all-or-nothing on storage errors.
function idbSetMany(records){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('保存に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('保存が中断されました'));for(const [k,v] of records)store.put(v,k)})}
// Commit photo additions/deletions and the encrypted patient index together.
function idbApplyChanges(puts,deletes=[]){return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('保存に失敗しました'));
  tx.onabort=()=>reject(tx.error||new Error('保存が中断されました'));
  for(const [k,v] of puts)store.put(v,k);
  for(const k of deletes)store.delete(k);
})}
// Avoid spreading megabyte-sized encrypted photo buffers into function arguments.
function b64(a){
  const bytes=new Uint8Array(a);let binary='';
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary);
}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function derive(pin,salt){const km=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptObj(obj,k=key){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(obj)));return {iv:b64(iv),ct:b64(ct)}}
async function decryptObj(blob,k=key){const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},k,unb64(blob.ct));return JSON.parse(dec.decode(pt))}
// Keep normal encrypted patient-index writes in order. An earlier slow encryption
// must never overwrite a more recent edit.
let dataWriteTail=Promise.resolve();
function orderedDataWrite(work){
  const next=dataWriteTail.then(work);
  dataWriteTail=next.catch(()=>{}); // A failed write must not block later retries.
  return next;
}
async function save(){
  if(!key||!state)throw new Error('ロック中のため保存できません');
  state.updatedAt=nowISO();
  const snapshot=JSON.stringify(state), activeKey=key;
  return orderedDataWrite(async()=>{
    await idbSet('data',await encryptObj(JSON.parse(snapshot),activeKey));
    if(key===activeKey)resetAutoLock();
  });
}
function blankState(){
 const examples=[
  ['架空入院テストA','', 'DEMO-001','水戸市','',true],
  ['架空検討会テストB','201-1','DEMO-002','茨城町','サン・テレーズ検討会',false],
  ['架空在院テストC','202-1','DEMO-003','ひたちなか市','',false],
  ['架空未配置テストD','','DEMO-004','かすみがうら市','',false]
 ];
 const patients=examples.map(([name,bed,id,address,meeting,pending])=>{
  const p=newPatient(bed);delete p._new;
  Object.assign(p.data,{'氏名':name,'ＩＤ':id,'住所':address,'検討会':meeting,'入院日':'2026-10-27'});
  p.journalAdmissionPending=pending;p.committee=!!meeting;return p;
 });
 return {version:APP_VERSION,patients,drugs:[],masters:{},settings:{retentionDays:null,autoLockMin:5,lastBackupAt:null},createdAt:nowISO(),updatedAt:nowISO()};
}
async function init(){
  // Test candidate only: GitHub Pages shares IndexedDB across paths on the same origin.
  // Never open the production site's database from a preview deployed under that host.
if (
  location.hostname !== 'piimanbokumetsu-code.github.io' ||
 !location.pathname.startsWith('/msw-v1010-test/journal-print-verify-20261027/')
) {
  document.getElementById('app').textContent =
    'このテスト版は指定されたテスト用URLでのみ起動できます。';
  return;
}
  await openDB();meta=await idbGet('meta');/* Child test site does not register any service worker. */try{if(navigator.storage?.persist)await navigator.storage.persist()}catch(e){}renderLock()}
function renderLock(msg=''){document.getElementById('morningPrint')?.remove();const fresh=!meta;$('#app').innerHTML=`<div class="lockwrap"><div class="lockcard"><h1>MSW患者管理</h1><p style="font-weight:700">架空患者専用 Ver.${APP_VERSION}</p><p>${fresh?'初回設定：この端末用の暗証を作成します。':'暗証を入力してロック解除してください。'}</p>${msg?`<div class="alert">${esc(msg)}</div>`:''}<input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="6文字以上" /><button class="btn" id="unlock" style="width:100%">${fresh?'暗証を設定':'ロック解除'}</button><p class="notice">患者情報は端末内で暗号化して保存します。暗証を忘れると復旧できません。端末自体のパスコード・紛失対策も必ず有効にしてください。</p></div></div>`;$('#unlock').onclick=fresh?setup:unlock;$('#pin').onkeydown=e=>{if(e.key==='Enter')$('#unlock').click()};setTimeout(()=>$('#pin').focus(),80)}
async function setup(){const pin=$('#pin').value;if(pin.length<6)return renderLock('暗証は6文字以上にしてください。');const salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pin,salt);const check=await encryptObj({ok:true});meta={version:1,salt:b64(salt),check,createdAt:nowISO()};await idbSet('meta',meta);state=blankState();ensureStateSchema();await save();render();}
async function unlock(){try{const pin=$('#pin').value;key=await derive(pin,unb64(meta.salt));await decryptObj(meta.check);const blob=await idbGet('data');state=blob?await decryptObj(blob):blankState();ensureStateSchema();await save();render()}catch(e){key=null;renderLock('暗証が違います。')}}
async function lock(automatic=false){
  let unsaved=false;
  if(selectedPatient){
    const ok=await flushPatientAutoSave();
    if(!ok||patientSavedRev<patientChangeRev){
      unsaved=true;
      if(!automatic){
        patientSaveIndicator('未保存：ロック前に保存してください','error');
        alert('未保存の患者情報があります。氏名または患者IDと保存状態を確認してください。');
        resetAutoLock();return;
      }
    }
  }
  clearPatientAutoTimer();clearBasicPhotoPreview();dismissPhotoViewer();key=null;state=null;selectedPatient=null;clearTimeout(lockTimer);renderLock(unsaved?'自動ロックしました。ただし直前の編集は保存できていない可能性があります。保存容量を確認してください。':'');
}
function resetAutoLock(){clearTimeout(lockTimer);if(!state)return;lockTimer=setTimeout(()=>lock(true),(state.settings.autoLockMin||5)*60000)}
['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(key)resetAutoLock()},{passive:true}));
// Safari may suspend timers when backgrounded; flush pending text edits promptly.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&selectedPatient&&!patientIME)void flushPatientAutoSave()});
window.addEventListener('pagehide',()=>{if(selectedPatient&&!patientIME)void flushPatientAutoSave()});
// Ver.1.0.17: archived patient records are never deleted automatically.
function backupDue(){const t=state?.settings?.lastBackupAt;if(!t)return true;return Date.now()-new Date(t).getTime()>7*86400000}
function render(){resetAutoLock();const net=navigator.onLine?'通信あり':'オフライン可';$('#app').innerHTML=`<div class="shell"><header class="topbar"><div class="brand">MSW患者管理</div><span class="pill">公開前テスト Ver.${APP_VERSION}</span><span class="pill">${net}</span>${backupDue()?'<span class="pill backupwarn">要バックアップ</span>':''}<div class="spacer"></div><button class="pill" id="lockBtn">🔒</button></header><main class="content" id="main"></main><nav class="bottomnav"><button class="navbtn ${(screen==='patients'||screen==='archive')?'active':''}" data-screen="patients"><span class="ico">🏥</span>患者</button><button class="navbtn ${screen==='journal'?'active':''}" data-screen="journal"><span class="ico">📄</span>日誌</button><button class="navbtn ${screen==='tasks'?'active':''}" data-screen="tasks"><span class="ico">✅</span>要対応</button><button class="navbtn ${screen==='drugs'?'active':''}" data-screen="drugs"><span class="ico">💊</span>薬情</button><button class="navbtn ${screen==='masters'?'active':''}" data-screen="masters"><span class="ico">📋</span>マスター</button><button class="navbtn ${screen==='settings'?'active':''}" data-screen="settings"><span class="ico">⚙️</span>設定</button></nav></div>`;$('#lockBtn').onclick=()=>lock(false);$$('.navbtn').forEach(b=>b.onclick=()=>{screen=b.dataset.screen;render()});({patients:renderPatients,archive:renderArchive,journal:renderJournalPreview,tasks:renderTasks,drugs:renderDrugs,masters:renderMasters,settings:renderSettings}[screen])()}
function activePatients(){return state.patients.filter(p=>!p.dischargeDate)}
function getStatus(p){return p.status||'未設定'}
function statusTag(s){const c=s.includes('要')?'red':s.includes('決定')?'green':s.includes('施設')?'purple':s==='未設定'?'':'orange';return `<span class="tag ${c}">${esc(s)}</span>`}
function renderPatients(){const ps=activePatients();$('#main').innerHTML=`<div class="hero"><div><h1>入院患者</h1><p>在院患者を管理します。退院確定後の患者は「退院患者記録」から確認できます。</p></div><div class="spacer"></div><button class="btn secondary" id="openArchive">退院患者記録</button><button class="btn" id="newP">＋患者</button></div><div class="kpis"><div class="kpi"><b>${ps.length}</b><span>在院患者</span></div><div class="kpi"><b>${ps.filter(p=>p.tasks?.some(t=>!t.done)).length}</b><span>要対応あり</span></div><div class="kpi"><b>${ps.filter(p=>getStatus(p).includes('施設')).length}</b><span>施設調整中</span></div><div class="kpi"><b>${ps.filter(p=>getStatus(p).includes('決定')).length}</b><span>退院先決定</span></div></div><div class="toolbar"><input id="q" placeholder="氏名・病名・病床で検索"><select id="ward"><option value="">全病棟</option><option value="一般病棟">一般病棟</option><option value="ICU">ICU</option><option value="その他">その他・未配置</option></select><button class="btn secondary" id="print">朝一患者一覧を印刷</button></div><div id="patientList"></div>`;$('#openArchive').onclick=()=>{screen='archive';render()};$('#newP').onclick=()=>openPatient(newPatient());$('#print').onclick=printMorningList;$('#q').oninput=drawPatientList;$('#ward').onchange=drawPatientList;drawPatientList()}
function printText(v,max=0){const a=Array.from(String(v??'').trim());return esc(max?a.slice(0,max).join(''):a.join(''))}
function shortCareLevel(v){const s=String(v||'').trim();return s.replace('要介護','要').replace('要支援','支')}
function printPatientForBed(bed,patients){return patientsForBed(bed,patients)[0]||null}

function isSaintThereseMeeting(p){
 return p?.committee===true||/サン[・･\s　-]?テレーズ/.test(String(p?.data?.['検討会']??''));
}
function printRoomName(bed){
 const t=String(bed||'').trim().toUpperCase();
 const m=t.match(/^(ICU[1-3]|\d{3})(?:-|$)/);
 return m?m[1]:t;
}
function printRowHtml(bed,patients,rowClass=''){
 const attr=rowClass?' class="'+esc(rowClass)+'"':'';
 const p=printPatientForBed(bed,patients);
 if(!p)return '<tr'+attr+'><td>'+esc(bed)+'</td>'+'<td></td>'.repeat(11)+'</tr>';
 const d=p.data||{},days=daysSince(d['入院日'])||d['入院日数']||'';
 return '<tr'+attr+'><td>'+esc(bed)+'</td><td class="'+(isSaintThereseMeeting(p)?'saint-id':'')+'">'+printText(d['ＩＤ'])+'</td><td>'+printText(d['氏名'])+'</td><td>'+esc(shortAdmissionDate(d['入院日']))+'</td><td>'+printText(d['主治医'],3)+'</td><td>'+printText(d['住所'],3)+'</td><td class="disease-cell"><span class="disease-text">'+printText(d['病名'])+'</span></td><td>'+esc(shortCareLevel(d['介護度']))+'</td><td class="facility-cell"><span class="facility-text">'+printText(d['ケアマネ・施設'])+'</span></td><td class="memo"></td><td>'+printText(d['家構'])+'</td><td>'+esc(days)+'</td></tr>';
}
function printTableHtml(beds,patients){
 const rows=beds.map((bed,i)=>{
  const room=printRoomName(bed),first=i===0||printRoomName(beds[i-1])!==room;
  const last=i===beds.length-1||printRoomName(beds[i+1])!==room;
  const gap=first&&i>0?'<tr class="room-gap" aria-hidden="true"><td colspan="12"></td></tr>':'';
  return gap+printRowHtml(bed,patients,[(first?'room-first':''),(last?'room-last':'')].filter(Boolean).join(' '));
 }).join('');
 return '<table class="morning-table"><colgroup><col class="c-bed"><col class="c-id"><col class="c-name"><col class="c-admit"><col class="c-doc"><col class="c-address"><col class="c-disease"><col class="c-care"><col class="c-facility"><col class="c-memo"><col class="c-family"><col class="c-days"></colgroup><thead><tr>'+['部屋','ID','氏名','入院日','主治医','住所','病名','介護度','ケアマネ・施設','メモ','家族','日数'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
}
function printExtraTableHtml(patients){
  const headers=['部屋','ID','氏名','入院日','主治医','住所','病名','介護度','ケアマネ・施設','メモ','家族','日数'];
  const rows=patients.map(p=>{
    const d=p.data||{},days=daysSince(d['入院日'])||d['入院日数']||'';
    const cells=[d['ベッド番号']||'未配置',d['ＩＤ'],d['氏名'],shortAdmissionDate(d['入院日']),String(d['主治医']||'').slice(0,3),String(d['住所']||'').slice(0,3),d['病名'],shortCareLevel(d['介護度']),d['ケアマネ・施設'],'',d['家構'],days];
    return `<tr>${cells.map((x,i)=>i===6?`<td class="disease-cell"><span class="disease-text">${printText(x)}</span></td>`:i===8?`<td class="facility-cell"><span class="facility-text">${printText(x)}</span></td>`:`<td${i===1&&isSaintThereseMeeting(p)?' class="saint-id"':''}>${printText(x)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table class="morning-table"><colgroup><col class="c-bed"><col class="c-id"><col class="c-name"><col class="c-admit"><col class="c-doc"><col class="c-address"><col class="c-disease"><col class="c-care"><col class="c-facility"><col class="c-memo"><col class="c-family"><col class="c-days"></colgroup><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function printMorningList(){
  const patients=activePatients(),general=layoutBedNumbers(BED_LAYOUT,patients),icu=layoutBedNumbers(ICU_LAYOUT,patients);
  const bedsFor=rooms=>rooms.flatMap(name=>general.find(r=>r.room===name)?.beds||[]);
  const icuBeds=icu.flatMap(r=>r.beds);
  const pages=[
    {ward:'一般病棟',beds:bedsFor(['201','202','203'])},
    {ward:'一般病棟',beds:bedsFor(['205','206','207','208','210','211','212','213'])},
    {ward:'ICU',beds:icuBeds}
  ];
  const unplaced=patients.filter(p=>!isMappedBed(p.data['ベッド番号']));
  // A second patient on the same official bed must never disappear from print.
  const duplicates=officialBeds().flatMap(b=>patientsForBed(b,patients).slice(1));
  const extra=[...unplaced,...duplicates];
  if(extra.length)pages.push({ward:'その他・未配置／重複',extra});
  const d=new Date(),date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  $('#morningPrint')?.remove();
  const root=document.createElement('div');root.id='morningPrint';root.className='morning-print';
  root.innerHTML=pages.map((pg,i)=>`<section class="morning-page"><div class="morning-head"><h1>入院患者一覧</h1><div>${date}　朝　　${pg.ward}　${i+1}/${pages.length}</div></div>${pg.extra?printExtraTableHtml(pg.extra):printTableHtml(pg.beds,patients)}</section>`).join('');
  document.body.appendChild(root);
  // iPadOS may dispatch afterprint while the printer is being selected.
  // Keep the print DOM until the next print or app lock, so the preview
  // remains intact during AirPrint's printer-selection re-pagination.
  setTimeout(()=>window.print(),50);
}
function drawPatientList(){const q=($('#q')?.value||'').trim().toLowerCase(),w=$('#ward')?.value||'',all=activePatients();const filtered=all.filter(p=>patientMatches(p,q)&&(!w||wardForBed(p.data['ベッド番号'])===w));const root=$('#patientList');if(q&&!filtered.length){root.innerHTML='<div class="empty">該当する患者がいません</div>';return}
  const general=layoutBedNumbers(BED_LAYOUT,all),icu=layoutBedNumbers(ICU_LAYOUT,all);let html='';
  if(!w||w==='一般病棟'){html+=`<section class="map-section"><div class="map-section-title"><div><strong>一般病棟</strong><span>病室・ベッドマップ</span></div><span class="count">${general.reduce((n,r)=>n+r.beds.length,0)}床</span></div><div class="room-map general-room-map">${general.filter(room=>!['208','210','211','212','213'].includes(room.room)).map(room=>`<div class="room-map-item standard-room">${roomMapHtml(room,filtered,q)}</div>`).join('')}<div class="compact-room-guide">208・210・211・212・213号室</div><div class="compact-room-scroll" role="region" aria-label="208・210・211・212・213号室（横スクロール可能）" tabindex="0"><div class="compact-room-row">${general.filter(room=>['208','210','211','212','213'].includes(room.room)).map(room=>`<div class="room-map-item compact-room ${room.beds.length===2?'two-bed-room':''}">${roomMapHtml(room,filtered,q)}</div>`).join('')}</div></div></div></section>`}
  if(!w||w==='ICU'){html+=`<section class="map-section"><div class="map-section-title"><div><strong>ICU</strong><span>集中治療室</span></div><span class="count">${icu.reduce((n,r)=>n+r.beds.length,0)}床</span></div><div class="room-map icu-map">${icu.map(room=>roomMapHtml(room,filtered,q,true)).join('')}</div></section>`}
  const other=filtered.filter(p=>!isMappedBed(p.data['ベッド番号']));if((!w||w==='その他')&&other.length)html+=`<section class="map-section"><style>@media(max-width:900px){.unplaced-patient-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:540px){.unplaced-patient-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}</style><div class="map-section-title"><div><strong>その他・未配置</strong><span>標準マップ外の患者</span></div><span class="count">${other.length}人</span></div><div class="room-map unplaced-patient-grid" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">${other.map(p=>patientBedHtml(p.data['ベッド番号']||'未配置',[p])).join('')}</div></section>`;
  root.innerHTML=html||'<div class="empty">該当する患者がいません</div>';bindPatientMapEvents()}
const BED_LAYOUT=[
  {room:'201',beds:[1,2,3,4,5,6]},
  {room:'202',beds:[1,2,3,4,5,6]},
  {room:'203',beds:[1,2,3,4,5,6,7]},
  {room:'205',beds:[1,2,3,4,5,6]},
  {room:'206',beds:[1,2,3,4,5,6]},
  {room:'207',beds:[1,2,3,4,5,6]},
  {room:'208',beds:[1,2]},
  {room:'210',beds:[1,2]},
  {room:'211',beds:['']},
  {room:'212',beds:['']},
  {room:'213',beds:['']}
];

const ICU_LAYOUT=[
  {room:'ICU1',beds:[1,2,3,4,5,6,7]},
  {room:'ICU2',beds:[1,2,3,4,5,6,7]},
  {room:'ICU3',beds:[1,2,3,4,5,6,7,8,9]}
];

function normalizeBed(v){return String(v||'').trim().replace(/\s+/g,'').replace(/[‐-‒–—―ー－]/g,'-').toUpperCase()}
function bedKey(room,n){return n===''?room:`${room}-${n}`}
function isMappedBed(v){const b=normalizeBed(v);return [...BED_LAYOUT,...ICU_LAYOUT].some(room=>room.beds.some(n=>normalizeBed(bedKey(room.room,n))===b))}
function wardForBed(v){const b=normalizeBed(v);if(!isMappedBed(b))return'その他';return b.startsWith('ICU')?'ICU':'一般病棟'}
function patientMatches(p,q){if(!q)return true;return[p.data['氏名'],p.data['病名'],p.data['ベッド番号'],p.data['主治医']].join(' ').toLowerCase().includes(q)}
function patientsForBed(bed,patients=activePatients()){const key=normalizeBed(bed);return patients.filter(p=>normalizeBed(p.data['ベッド番号'])===key)}
function layoutBedNumbers(layout,patients){
  // Fixed bed map: imported patient bed numbers never create new bed slots.
  return layout.map(room=>({room:room.room,beds:room.beds.map(n=>bedKey(room.room,n))}));
}
function shortAdmissionDate(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return esc(v);return`${d.getMonth()+1}/${d.getDate()}`}
function patientBedHtml(bed,patients=[]){
  if(!patients.length)return`<button class="bed-slot empty-bed" data-new-bed="${esc(bed)}"><b>${esc(bed)}</b><span>空床</span><small>タップして登録</small></button>`;
  if(patients.length>1)return`<button class="bed-slot occupied-bed duplicate-bed" data-bed="${esc(bed)}"><div class="bed-line"><b>${esc(bed)}</b></div><strong>${patients.length}名重複あり</strong><span>タップして全員を表示</span></button>`;
  const p=patients[0],days=daysSince(p.data['入院日'])||p.data['入院日数']||'',date=shortAdmissionDate(p.data['入院日']),tasks=p.tasks?.filter(t=>!t.done).length||0;
  return`<button class="bed-slot occupied-bed" data-id="${esc(p.id)}"><div class="bed-line"><b>${esc(bed)}</b></div><strong>${esc(p.data['氏名']||'氏名未入力')}</strong><span class="bed-meta admission-line"><span>${date?esc(date):'—'}</span><span class="doctor">${esc(String(p.data['主治医']||'').replace(/医師\s*$/,'').trim()||'—')}</span><span class="days">${days?`${esc(days)}日目`:'—'}</span></span><div class="tags">${statusTag(getStatus(p))}${tasks?`<span class="tag red">要対応 ${tasks}</span>`:''}</div></button>`;
}
function roomMapHtml(room,patients,q){
  return`<div class="room-block"><div class="room-title">${esc(room.room)}${room.room.startsWith('ICU')?'':'号室'}</div><div class="bed-grid">${room.beds.map(bed=>{const ps=patientsForBed(bed,patients);if(q&&!ps.length)return'';return patientBedHtml(bed,ps)}).join('')}</div></div>`;
}
function openDuplicateBed(bed){
  $('#duplicateModal')?.remove();
  const ps=patientsForBed(bed);
  if(ps.length<2){drawPatientList();return}
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="duplicateModal"><div class="sheet"><div class="sheethead"><button class="btn secondary" id="closeDuplicate">← 戻る</button><div><h2>${esc(bed)}</h2><div class="notice duplicate-warning">${ps.length}名重複あり・下へスクロールして全員確認できます</div></div></div><div class="duplicate-list">${ps.map((p,i)=>`<article class="panel duplicate-patient"><h3>患者 ${i+1}／${ps.length}</h3><div class="duplicate-patient-row"><div class="duplicate-patient-info">${patientCard(p)}</div><div class="duplicate-move"><label>ベッド変更</label><input type="hidden" class="duplicate-bed-select" data-id="${esc(p.id)}" value="${esc(p.data['ベッド番号']||'')}"><button class="btn secondary duplicate-bed-pick" data-id="${esc(p.id)}" type="button">${esc(p.data['ベッド番号']||'その他・未配置')} ▾</button><button class="btn duplicate-move-save" data-id="${esc(p.id)}">変更を保存</button></div></div><button class="btn secondary duplicate-open" data-id="${esc(p.id)}">この患者の詳細・編集を開く</button></article>`).join('')}</div></div></div>`);
  $$('.duplicate-bed-pick').forEach(btn=>btn.onclick=()=>{
    const sel=[...$$('.duplicate-bed-select')].find(x=>x.dataset.id===btn.dataset.id);
    if(!sel)return;
    showGroupedBedPicker(sel.value,value=>{sel.value=value;btn.textContent=(value||'その他・未配置')+' ▾'});
  });
  $('#closeDuplicate').onclick=()=>$('#duplicateModal')?.remove();
  $$('.duplicate-open').forEach(btn=>btn.onclick=()=>{const p=state.patients.find(p=>p.id===btn.dataset.id);$('#duplicateModal')?.remove();if(p)openPatient(p)});
  $$('.duplicate-move-save').forEach(btn=>btn.onclick=async()=>{
    const p=state.patients.find(p=>p.id===btn.dataset.id);
    const sel=[...$$('.duplicate-bed-select')].find(x=>x.dataset.id===btn.dataset.id);
    if(!p||!sel)return;
    const target=sel.value,old=p.data['ベッド番号'];
    if(normalizeBed(target)===normalizeBed(old)){alert('変更先のベッドを選んでください。');return}
    const occupied=patientsForBed(target).filter(x=>x.id!==p.id).length;
    const message=`${p.data['氏名']||'この患者'}のベッドを ${old||'未配置'} → ${target||'その他・未配置'} に変更します。${occupied?`\n※変更先にはすでに${occupied}名います。重複になります。`:''}\nよろしいですか？`;
    if(!confirm(message))return;
    p.data['ベッド番号']=target;p.updatedAt=nowISO();
    try{await save();drawPatientList();openDuplicateBed(bed)}catch(e){p.data['ベッド番号']=old;alert('保存できませんでした。再度お試しください。')}
  });
}
function bindPatientMapEvents(){
  $$('.duplicate-bed').forEach(x=>x.onclick=()=>openDuplicateBed(x.dataset.bed));
  $$('.occupied-bed:not(.duplicate-bed)').forEach(x=>x.onclick=()=>{const p=state.patients.find(p=>p.id===x.dataset.id);if(p)openPatient(p)});
  $$('.empty-bed').forEach(x=>x.onclick=()=>openPatient(newPatient(x.dataset.newBed)));
}function patientCard(p){const days=daysSince(p.data['入院日'])||p.data['入院日数']||'';const tasks=p.tasks?.filter(t=>!t.done).length||0;return `<article class="patient-card" data-id="${p.id}"><div class="pc-head"><span class="bed">${esc(p.data['ベッド番号']||'未配置')}</span><span class="name">${esc(p.data['氏名']||'氏名未入力')}</span></div><div class="pc-meta"><span>主治医 ${esc(p.data['主治医']||'-')}</span><span>入院 ${esc(days)}日</span><span>${esc(p.data['病名']||'')}</span></div><div class="tags">${statusTag(getStatus(p))}${tasks?`<span class="tag red">要対応 ${tasks}</span>`:''}</div></article>`}
function newPatient(bed=''){const data={};legacyFields.forEach(k=>data[k]='');data['ベッド番号']=bed;return{id:uid(),data,status:'未設定',tasks:[],notes:[],dischargeDate:null,createdAt:nowISO(),updatedAt:nowISO(),_new:true}}
// Ver.1.0.18: autosave patient form edits, with a visible durable-save status.
const PATIENT_AUTOSAVE_DELAY=650;
let patientAutoTimer=null, patientChangeRev=0, patientSavedRev=0, patientWriteBusy=null, patientTransitionBusy=false, patientIME=false;
function clearPatientAutoTimer(){clearTimeout(patientAutoTimer);patientAutoTimer=null}
function patientSaveIndicator(message,kind='idle'){
  const el=$('#patientSaveStatus');if(!el)return;
  el.textContent=message;el.dataset.state=kind;
}
function capturePatientForm(){
  const p=selectedPatient;if(!p)return false;
  let changed=false;
  $$('#tabbody [data-field]').forEach(el=>{
    const f=el.dataset.field,v=el.value;
    if(v==='__add__')return; // A temporary master-registration choice is not patient data.
    if(String(p.data[f]??'')!==String(v)){p.data[f]=v;changed=true}
  });
  const status=$('#status');if(status&&String(p.status??'')!==status.value){p.status=status.value;changed=true}
  const date=$('#dischargeDate');if(date&&(p.dischargeDate||'')!==date.value){p.dischargeDate=date.value||null;changed=true}
  if(p.journalAdmissionPending===true&&isMappedBed(p.data['ベッド番号'])){
    p.journalAdmissionPending=false;changed=true;
  }
  if(changed){patientChangeRev++;patientSaveIndicator('未保存の変更あり','pending')}
  return changed;
}
function patientCanSave(p){return !!(String(p?.data?.['氏名']||'').trim()||String(p?.data?.['ＩＤ']||'').trim())}
function schedulePatientAutoSave(){
  clearPatientAutoTimer();
  if(!selectedPatient)return;
  const p=selectedPatient;
  if(p._new&&!patientCanSave(p)){
    patientSaveIndicator('氏名か患者IDの入力後に自動保存','pending');return;
  }
  patientAutoTimer=setTimeout(()=>{patientAutoTimer=null;void flushPatientAutoSave()},PATIENT_AUTOSAVE_DELAY);
}
function onPatientFormEdit(e){
  const el=e.target;
  if(!el?.matches?.('[data-field], #status, #dischargeDate'))return;
  if(el.value==='__add__'||e.isComposing||patientIME)return;
  if(capturePatientForm())schedulePatientAutoSave();
}
function bindPatientAutosave(){
  const root=$('#tabbody');
  if(!root)return;
  root.addEventListener('compositionstart',()=>{patientIME=true});
  root.addEventListener('compositionend',e=>{patientIME=false;onPatientFormEdit(e)});
  root.addEventListener('input',onPatientFormEdit);
  root.addEventListener('change',onPatientFormEdit);
  root.addEventListener('focusout',()=>{if(!patientIME&&patientChangeRev>patientSavedRev)void flushPatientAutoSave()});
  patientSaveIndicator(selectedPatient?._new?'氏名か患者IDの入力後に自動保存':'保存済み（自動保存）',selectedPatient?._new?'pending':'saved');
}
async function flushPatientAutoSave(){
  clearPatientAutoTimer();
  const patient=selectedPatient;
  if(!patient)return true;
  if(patientIME)return false; // Do not commit an unfinished Japanese IME composition.
  capturePatientForm();
  if(patient._new&&!patientCanSave(patient)){
    patientSaveIndicator('氏名か患者IDが必要です（未保存）','error');
    return false;
  }
  // Another flush may already be writing this patient. Wait and retry any later edit.
  if(patientWriteBusy){
    try{await patientWriteBusy}catch(e){}
    if(selectedPatient!==patient)return false;
    if(!patient._new&&patientSavedRev>=patientChangeRev)return true;
  }
  if(!patient._new&&patientSavedRev>=patientChangeRev){
    patientSaveIndicator('保存済み（自動保存）','saved');return true;
  }
  if(!key||!state){patientSaveIndicator('保存失敗：ロック状態です','error');return false}
  const rev=patientChangeRev;
  let registered=false;
  if(patient._new){delete patient._new;state.patients.push(patient);registered=true}
  patient.updatedAt=nowISO();
  patientSaveIndicator('保存中…','saving');
  const writing=save();patientWriteBusy=writing;
  try{
    await writing;
    patientSavedRev=Math.max(patientSavedRev,rev);
    if(selectedPatient===patient){
      if(patientSavedRev>=patientChangeRev)patientSaveIndicator('保存済み（自動保存）','saved');
      else{patientSaveIndicator('変更を保存待ち','pending');schedulePatientAutoSave()}
    }
    return true;
  }catch(e){
    // Keep the entered content in memory so the user can retry without retyping.
    // If creation failed, also retain its identity in memory for the next retry.
    if(registered)patient._new=false;
    if(selectedPatient===patient)patientSaveIndicator('保存失敗：再試行してください','error');
    return false;
  }finally{if(patientWriteBusy===writing)patientWriteBusy=null}
}
// A new patient is not saved until a name or patient ID is supplied. Merely
// tapping an empty bed must be reversible without a save error. Never discard
// entered details (including tabs other than Basic) without confirmation.
function newPatientHasEnteredData(p){
  if(!p)return false;
  if(Object.entries(p.data||{}).some(([field,value])=>
    !['ベッド番号','入院日数'].includes(field)&&String(value??'').trim()!==''))return true;
  return (p.tasks||[]).length>0||(p.notes||[]).length>0||
    (p.attachments||[]).length>0||!!p.dischargeDate||
    (!!p.status&&p.status!=='未設定');
}
async function finishPatientAndNavigate(next,{closing=false}={}){
  if(patientTransitionBusy)return;
  // A photo operation uses an atomic transaction for metadata and encrypted pixels.
  // Do not navigate away while it is still running.
  if(photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||pdfExportBusy){
    alert('写真・PDFの処理が終わってから画面を切り替えてください。');return;
  }
  patientTransitionBusy=true;
  const controls=$$('#modal .sheethead button, #modal .tab');
  controls.forEach(b=>b.disabled=true);
  try{
    capturePatientForm();
    const draft=selectedPatient;
    if(draft?._new&&!patientCanSave(draft)){
      // Tab changes keep the in-memory draft intact; leaving the sheet discards
      // it only if untouched or the user explicitly authorizes discarding edits.
      if(closing&&newPatientHasEnteredData(draft)&&
        !confirm('氏名・患者IDが未入力のため保存できません。入力した内容を破棄して戻りますか？'))return;
      if(!closing)patientSaveIndicator('氏名か患者IDの入力後に自動保存','pending');
      next();return;
    }
    // If the user entered more text while a save was pending, flush it too.
    let ok=false;
    for(let attempt=0;attempt<4;attempt++){
      ok=await flushPatientAutoSave();
      if(!ok||!selectedPatient||patientSavedRev>=patientChangeRev)break;
    }
    if(!ok||patientSavedRev<patientChangeRev){
      alert('患者情報を保存できませんでした。入力内容は画面に残っています。保存状態を確認して再試行してください。');
      return;
    }
    next();
  }finally{
    patientTransitionBusy=false;
    controls.forEach(b=>{if(b.isConnected)b.disabled=false});
  }
}
function openPatient(p){
  clearBasicPhotoPreview();dismissPhotoViewer();clearPatientAutoTimer();
  selectedPatient=p;activeTab='basic';patientChangeRev=0;patientSavedRev=0;patientWriteBusy=null;patientIME=false;
  renderPatientModal();
}
function renderPatientModal(){
  const p=selectedPatient;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><div class="sheethead"><button class="btn secondary" id="closeM">←</button><div class="patient-sheet-title"><h2>${esc(p.data['氏名']||'新規患者')}</h2><div class="notice">${esc(p.data['ベッド番号']||'病床未設定')}　${esc(p.data['病名']||'')}</div></div><div class="spacer"></div><span id="patientSaveStatus" role="status" aria-live="polite" class="patient-save-status">保存済み（自動保存）</span><button class="btn secondary" id="saveP">保存して閉じる</button></div><div class="tabs">${[['basic','基本'],['care','家族・介護'],['adl','ADL'],['support','退院支援'],['notes','経過記録'],['photos','写真・書類']].map(([k,n])=>`<button class="tab ${activeTab===k?'active':''}" data-tab="${k}">${n}</button>`).join('')}</div><div class="sheetbody" id="tabbody"></div></div></div>`);
  $('#closeM').onclick=()=>finishPatientAndNavigate(closePatient,{closing:true});
  $('#saveP').onclick=()=>finishPatientAndNavigate(closePatient,{closing:true});
  $$('.tab').forEach(t=>t.onclick=()=>finishPatientAndNavigate(()=>{
    activeTab=t.dataset.tab;clearBasicPhotoPreview();$('#modal').remove();renderPatientModal();
  }));
  renderTab();bindPatientAutosave();
}
function closePatient(){clearPatientAutoTimer();clearBasicPhotoPreview();dismissPhotoViewer();selectedPatient=null;$('#modal')?.remove();if(key&&state&&$('#main'))render()}
function renderTab(){const root=$('#tabbody'),p=selectedPatient;if(activeTab==='photos'){renderPhotosTab();return;}if(activeTab==='basic'){renderBasicDashboard();return;}if(groups[activeTab]){root.innerHTML=`<div class="panel"><div class="form-grid">${groups[activeTab].map(fieldHtml).join('')}</div></div>`;bindMasterSelects(root);return}if(activeTab==='support'){root.innerHTML=`<div class="panel"><h3>退院支援</h3><div class="form-grid"><div class="field"><label>進捗ステータス</label>${masterSelectHtml('進捗ステータス',getStatus(p),'id="status"')}</div><div class="field"><label>退院日</label><input type="date" id="dischargeDate" value="${esc(p.dischargeDate||'')}"></div><div class="field span2"><label>退院支援メモ</label><textarea data-field="退院支援">${esc(p.data['退院支援']||'')}</textarea></div></div></div><div class="panel"><h3>要対応タスク</h3><div id="taskList">${taskListHtml(p)}</div><div class="toolbar"><input id="newTask" placeholder="例：長女へ電話、施設へ空床確認"><button class="btn" id="addTask">追加</button></div></div><div class="panel"><button class="btn danger" id="dischargeNow">退院として登録</button><p class="notice">退院患者の情報は自動削除されず、退院患者記録に保持されます。</p></div>`;$('#addTask').onclick=addTask;$('#dischargeNow').onclick=()=>{if(!$('#dischargeDate').value)$('#dischargeDate').value=new Date().toISOString().slice(0,10);$('#status').value='退院先決定';};bindTaskChecks();bindMasterSelects(root);return}if(activeTab==='notes'){root.innerHTML=`<div class="panel"><h3>経過記録を追加</h3><div class="form-grid"><div class="field"><label>種別</label>${masterSelectHtml('経過記録種別','面談','id="noteType"')}</div><div class="field"><label>日時</label><input id="noteAt" type="datetime-local" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></div><div class="field span2"><label>内容</label><textarea id="noteText" placeholder="対応内容・決定事項・次にやること"></textarea></div></div><button class="btn" id="addNote">記録追加</button></div><div class="panel"><h3>時系列</h3><div class="timeline">${notesHtml(p)}</div></div>`;$('#addNote').onclick=addNote;bindMasterSelects(root);return}}
// Ver.1.0.19: compact basic information overview. Preserve each existing data key so
// backups, morning print, and the family shorthand (家構: e.g. 2同別) continue working.
const BASIC_FIELDS=[
  ['ベッド番号','ベッド番号'],['氏名','氏名'],
  ['ＩＤ','ID'],['入院日','入院日'],
  ['入院日数','入院日数'],['主治医','主治医'],
  ['病名','病名'],['住所','住所'],
  ['保険','保険'],['家構','家族構成'],
  ['介護度','介護度'],['介護情報','介護情報'],
  ['備考','備考']
];
function basicFieldHtml(field,label){
  const p=selectedPatient,v=p.data?.[field]??'';
  const span=['病名','住所','介護情報','備考'].includes(field)?' basic-wide':'';
  if(field==='ベッド番号')return `<div class="field basic-field"><label>ベッド番号</label><input type="hidden" data-field="ベッド番号" id="patientBedValue" value="${esc(v)}"><button type="button" class="btn secondary basic-bed-picker" id="patientBedPick">${esc(v||'その他・未配置')} ▾</button></div>`;
  if(field==='入院日数')return `<div class="field basic-field"><label>入院日数（自動計算）</label><div id="basicAdmissionDays" class="basic-readonly" aria-live="polite">${esc(daysSince(p.data['入院日'])||p.data['入院日数']||'—')}日</div></div>`;
  const placeholder=field==='家構'?'例：2同別':field==='介護情報'?'ケアマネ・介護サービス・連絡事項など':'';
  const type=field==='入院日'?'date':'text';
  const suggest=['保険','主治医','介護度'].includes(field)?` list="basicList_${field}"`:'';
  const datalist=suggest?`<datalist id="basicList_${field}">${masterValues(field,v).map(item=>`<option value="${esc(item)}"></option>`).join('')}</datalist>`:'';
  const common=`data-field="${esc(field)}" aria-label="${esc(label)}" placeholder="${esc(placeholder)}"`;
  const control=['介護情報','備考'].includes(field)?`<textarea ${common} rows="2">${esc(v)}</textarea>`:`<input type="${type}" ${common}${suggest} value="${esc(v)}">`;
  return `<div class="field basic-field${span}"><label>${esc(label)}</label>${control}${datalist}</div>`;
}
function basicDocumentHtml(){
  const gen=photoList(selectedPatient,'genogram');
  const admission=photoList(selectedPatient,'admission');
  return `<aside class="basic-docs">
    <section class="basic-photo-card" aria-label="ジェノグラム">
      <div class="basic-card-title"><strong>ジェノグラム</strong><span>タップで拡大</span></div>
      <button type="button" class="basic-gen-preview" id="basicGenogramOpen" aria-label="${gen.length?'ジェノグラムを拡大表示':'ジェノグラムの写真を登録'}">
        ${gen.length?'<span id="basicGenogramLoading">読み込み中…</span><img id="basicGenogramImg" alt="ジェノグラムのプレビュー" hidden>':'<span>未登録<br>写真・書類から登録</span>'}
      </button>
    </section>
    <section class="basic-admission-card">
      <div class="basic-card-title"><strong>入院時患者情報</strong></div>
      <button type="button" class="basic-admission-open" id="basicAdmissionOpen">
        <span class="basic-document-icon" aria-hidden="true">📄</span>
        <span>${admission.length?`登録済み（${admission.length}ページ）`:'未登録'}<small>${admission.length?'タップして写真・書類を閲覧':'タップして写真・書類を登録'}</small></span>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  </aside>`;
}
function renderBasicDashboard(){
  const root=$('#tabbody');
  // Two zones keep the important patient data readable without vertical scrolling
  // on the iPad mini where space allows. Very narrow screens scroll as a fallback.
  root.innerHTML=`<div class="basic-dashboard">
    <section class="basic-information" aria-label="患者基本情報">
      <div class="basic-form-grid">${BASIC_FIELDS.map(([field,label])=>basicFieldHtml(field,label)).join('')}</div>
      <details class="basic-extra"><summary>その他の既存項目（本人職業・術式・入院元・かかりつけ）</summary>
        <div class="basic-extra-grid">${['本人職業','術式','入院元','かかりつけ'].map(fieldHtml).join('')}</div>
      </details>
    </section>
    ${basicDocumentHtml()}
  </div>`;
  bindPatientBedPicker();
  bindMasterSelects(root); // Preserve legacy basic fields via the collapsed extra section.
  const input=root.querySelector('[data-field="入院日"]');
  input?.addEventListener('input',()=>{
    const el=$('#basicAdmissionDays');if(el)el.textContent=(daysSince(input.value)||'—')+'日';
  });
  const patient=selectedPatient;
  const gen=photoList(patient,'genogram'),admission=photoList(patient,'admission');
  $('#basicGenogramOpen').onclick=()=>gen.length?viewPhoto(gen[0].id):openPatientPhotosFromBasic();
  $('#basicAdmissionOpen').onclick=()=>admission.length?viewPhoto(admission[0].id):openPatientPhotosFromBasic();
  loadBasicGenogramPreview(patient,root,gen[0]);
}
function openPatientPhotosFromBasic(){
  finishPatientAndNavigate(()=>{activeTab='photos';clearBasicPhotoPreview();$('#modal').remove();renderPatientModal()});
}
let basicPhotoPreviewUrl=null,basicPhotoPreviewToken=0;
function clearBasicPhotoPreview(){
  basicPhotoPreviewToken++;
  if(basicPhotoPreviewUrl){URL.revokeObjectURL(basicPhotoPreviewUrl);basicPhotoPreviewUrl=null}
}
async function loadBasicGenogramPreview(patient,root,meta){
  clearBasicPhotoPreview();
  if(!meta)return;
  const request=basicPhotoPreviewToken;
  try{
    const data=await readPhotoRecord(meta.id);
    if(request!==basicPhotoPreviewToken||selectedPatient!==patient||activeTab!=='basic'||!root.isConnected)return;
    const jpeg=await photoJpeg(data);
    if(request!==basicPhotoPreviewToken||selectedPatient!==patient||activeTab!=='basic'||!root.isConnected)return;
    const url=URL.createObjectURL(new Blob([jpeg.bytes],{type:'image/jpeg'}));
    if(request!==basicPhotoPreviewToken||selectedPatient!==patient||activeTab!=='basic'||!root.isConnected){URL.revokeObjectURL(url);return}
    basicPhotoPreviewUrl=url;
    const img=root.querySelector('#basicGenogramImg'),loading=root.querySelector('#basicGenogramLoading');
    if(img){img.onload=()=>{if(request===basicPhotoPreviewToken){img.hidden=false;loading?.remove()}};img.onerror=()=>{if(request===basicPhotoPreviewToken){loading.textContent='プレビュー不可（タップして確認）'}};img.src=url}
  }catch(e){
    if(request===basicPhotoPreviewToken&&selectedPatient===patient&&root.isConnected){
      const el=root.querySelector('#basicGenogramLoading');if(el)el.textContent='プレビュー不可（タップして確認）';
    }
  }
}
// Photo documents are individually encrypted; only small metadata lives in the patient record.
function photoList(p,type){return (p.attachments||[]).filter(x=>x.type===type).sort((a,b)=>a.order-b.order)}
function nextPhotoOrder(list){return list.length?Math.max(...list.map(m=>Number.isFinite(m.order)?m.order:-1))+1:0}
function photoKey(id){return 'photo:'+id}
async function savePhotoRecord(id,data){await idbSet(photoKey(id),await encryptObj(data))}
async function readPhotoRecord(id){const v=await idbGet(photoKey(id));if(!v)throw new Error('写真データが見つかりません');return decryptObj(v)}
async function fileToPhoto(file){
  if(!file.type.startsWith('image/'))throw new Error('画像ファイルを選択してください');
  // Prevent oversized camera files from exhausting Safari memory during decoding.
  if(file.size>20*1024*1024)throw new Error('写真は1枚20MB以下にしてください');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('画像を読み込めません'));i.src=url});
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)throw new Error('画像が大きすぎます（最大6000万画素）');
    const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    try{
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('画像処理用メモリを確保できません');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return {dataUrl:canvas.toDataURL('image/jpeg',.84),width:canvas.width,height:canvas.height,rotation:0};
    }finally{
      // Release canvas pixels even when drawing or JPEG encoding throws (e.g. memory pressure).
      canvas.width=0;canvas.height=0;
    }
  }finally{URL.revokeObjectURL(url)}
}
function rotatePhoto(data){data.rotation=((data.rotation||0)+90)%360;return data}
// Validate decrypted backup photos without decoding pixels or allocating a canvas.
// A damaged or oversized record must be rejected before replacing local data.
function validateStoredPhoto(data){
  if(!data||typeof data.dataUrl!=='string'||!data.dataUrl.startsWith('data:image/jpeg;base64,'))throw new Error('JPEGデータが不正です');
  if(!Number.isSafeInteger(data.width)||!Number.isSafeInteger(data.height)||data.width<1||data.height<1||data.width>1800||data.height>1800)throw new Error('画像サイズが不正です');
  if(![0,90,180,270].includes(data.rotation??0))throw new Error('回転情報が不正です');
  const encoded=data.dataUrl.slice('data:image/jpeg;base64,'.length);
  if(encoded.length<8||encoded.length>20*1024*1024*4/3||!/^[-A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('JPEGデータが不正です');
  // Inspect the first quartet and final TWO quartets: a padded last quartet can
  // contain only one decoded byte, which is insufficient to check JPEG's FF D9.
  // Decoding the whole JPEG here
  // would temporarily allocate another multi-megabyte string for every photo
  // during backup/restore validation, increasing Safari memory pressure.
  if(encoded.length%4!==0)throw new Error('JPEGデータが不正です');
  let head,tail;
  try{head=atob(encoded.slice(0,4));tail=atob(encoded.slice(-8))}
  catch(e){throw new Error('JPEGデータが不正です')}
  if(head.length<2||tail.length<2||head.charCodeAt(0)!==255||head.charCodeAt(1)!==216||tail.charCodeAt(tail.length-2)!==255||tail.charCodeAt(tail.length-1)!==217)throw new Error('JPEG形式が不正です');
  return true;
}
async function photoJpeg(data){
  // Check bounds and JPEG markers before allocating decoded bytes or a rotation canvas.
  // This protects PDF export and the photo viewer even if a local record is damaged.
  validateStoredPhoto(data);
  const rotation=data.rotation||0;
  if(![0,90,180,270].includes(rotation))throw new Error('回転情報が不正です');
  // Avoid an extra full-resolution canvas and JPEG re-encoding for unrotated photos.
  if(rotation===0){
    const raw=atob(data.dataUrl.slice('data:image/jpeg;base64,'.length));
    const n=raw.length;
    if(n<4||raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||raw.charCodeAt(n-2)!==255||raw.charCodeAt(n-1)!==217)throw new Error('JPEG形式が不正です');
    const bytes=new Uint8Array(n);
    for(let i=0;i<n;i++)bytes[i]=raw.charCodeAt(i);
    return {bytes,width:data.width,height:data.height};
  }
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('画像読込失敗'));i.src=data.dataUrl});
  const rotated=rotation%180!==0,w=rotated?img.height:img.width,h=rotated?img.width:img.height;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  try{
    const x=c.getContext('2d');if(!x)throw new Error('画像処理用メモリを確保できません');
    x.fillStyle='#fff';x.fillRect(0,0,w,h);x.translate(w/2,h/2);x.rotate(rotation*Math.PI/180);x.drawImage(img,-img.width/2,-img.height/2);
    const encoded=c.toDataURL('image/jpeg',.85).split(',')[1];
    return {bytes:Uint8Array.from(atob(encoded),v=>v.charCodeAt(0)),width:w,height:h};
  }finally{c.width=0;c.height=0} // Also release pixels if rendering or encoding fails.
}
// Minimal, offline-capable JPEG PDF writer. A4 pages, aspect-ratio preserving margins.
function makePhotoPdf(images){
  // Bound memory use before building an in-memory PDF on iPad Safari.
  if(!Array.isArray(images)||images.length===0)throw new Error('PDFにする写真がありません');
  if(images.length>100)throw new Error('PDFは一度に100ページまでです');
  let totalBytes=0;
  for(const img of images){
    if(!img||!(img.bytes instanceof Uint8Array)||!img.bytes.length||!Number.isSafeInteger(img.width)||!Number.isSafeInteger(img.height)||img.width<1||img.height<1)throw new Error('写真データが不正です');
    totalBytes+=img.bytes.length;
    if(totalBytes>80*1024*1024)throw new Error('写真データが80MBを超えています');
  }
  const chunks=[],offsets=[0];let pos=0;
  const push=x=>{const a=typeof x==='string'?enc.encode(x):x;chunks.push(a);pos+=a.length};
  const obj=(n,content)=>{offsets[n]=pos;push(`${n} 0 obj\n${content}\nendobj\n`)};
  push('%PDF-1.4\n');const count=2+images.length*3;
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Kids [${images.map((_,i)=>3+i*3+' 0 R').join(' ')}] /Count ${images.length} >>`);
  images.forEach((img,i)=>{
    const page=3+i*3,im=page+1,stream=page+2;
    const ratio=Math.min(535/img.width,782/img.height),w=img.width*ratio,h=img.height*ratio,x=(595-w)/2,y=(842-h)/2;
    const cmd=`q\n${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im1 Do\nQ\n`;
    obj(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 ${im} 0 R >> >> /Contents ${stream} 0 R >>`);
    offsets[im]=pos;push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);push(img.bytes);push('\nendstream\nendobj\n');
    obj(stream,`<< /Length ${enc.encode(cmd).length} >>\nstream\n${cmd}endstream`);
  });
  const start=pos;push(`xref\n0 ${count+1}\n0000000000 65535 f \n`);
  for(let i=1;i<=count;i++)push(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return new Blob(chunks,{type:'application/pdf'});
}
function renderPhotosTab(){
  const p=selectedPatient,gen=photoList(p,'genogram'),info=photoList(p,'admission');
  const items=a=>a.length?a.map((m,i)=>`<div class="settings-row"><div><b>${i+1}ページ</b><small>${esc(m.name||'撮影画像')} ・ ${esc(fmtDate(m.addedAt))}</small></div><div class="toolbar"><button class="btn secondary photo-view" data-id="${esc(m.id)}">表示</button><button class="btn secondary photo-rotate" data-id="${esc(m.id)}">90°回転</button><button class="btn secondary photo-up" data-id="${esc(m.id)}">↑</button><button class="btn danger photo-del" data-id="${esc(m.id)}">削除</button></div></div>`).join(''):'<div class="notice">まだ登録されていません。</div>';
  $('#tabbody').innerHTML=`<div class="panel"><h3>ジェノグラム（基本1枚）</h3>${items(gen)}<input id="genFile" type="file" accept="image/*" hidden><button class="btn secondary" id="genAdd">${gen.length?'写真を差し替える':'撮影・画像を登録'}</button></div><div class="panel"><h3>入院時患者情報（複数ページ）</h3>${items(info)}<input id="infoFile" type="file" accept="image/*" multiple hidden><button class="btn secondary" id="infoAdd">＋ 写真を追加</button> <button class="btn" id="photoPdf" ${info.length?'':'disabled'}>全ページをPDF化</button><p class="notice">後日追加できます。↑でページ順を変更できます。写真は暗号化してこの端末に保存します。</p></div>`;
  $('#genAdd').onclick=()=>$('#genFile').click();$('#infoAdd').onclick=()=>$('#infoFile').click();
  $('#genFile').onchange=e=>addPhotos(e.target.files,'genogram');$('#infoFile').onchange=e=>addPhotos(e.target.files,'admission');
  $$('.photo-view').forEach(b=>b.onclick=()=>viewPhoto(b.dataset.id));
  $$('.photo-rotate').forEach(b=>b.onclick=()=>rotateStoredPhoto(b.dataset.id));
  $$('.photo-del').forEach(b=>b.onclick=()=>deletePhoto(b.dataset.id));
  $$('.photo-up').forEach(b=>b.onclick=()=>movePhotoUp(b.dataset.id));
  $('#photoPdf').onclick=exportAdmissionPdf;
}
function ensurePhotoPatient(){
  saveFieldsOnly();
  const p=selectedPatient;
  if(p._new&&!p.data['氏名']&&!p.data['ＩＤ']){
    alert('写真を登録する前に氏名または患者IDを入力してください。');
    return false;
  }
  return true;
}
let photoImportBusy=false;
async function addPhotos(files,type){
  if(!files?.length||photoImportBusy)return;
  // Process a bounded batch: avoids holding dozens of encoded camera images in Safari memory.
  if(type==='admission'&&files.length>10){alert('一度に登録できる写真は10枚までです。残りは追加登録してください。');return}
  // Preflight the whole batch before decoding any image. This avoids spending
  // memory on earlier photos only to reject a later oversized or invalid file.
  const batch=Array.from(files).slice(0,type==='genogram'?1:10);
  if(batch.some(f=>!f||typeof f.size!=='number'||!Number.isFinite(f.size)||f.size<=0||f.size>20*1024*1024||typeof f.type!=='string'||!f.type.startsWith('image/'))){
    alert('画像形式またはファイルサイズを確認してください（1枚20MB以下）。');return;
  }
  if(batch.reduce((total,f)=>total+f.size,0)>40*1024*1024){alert('一度に登録する写真の合計は40MB以下にしてください。分けて追加できます。');return}
  photoImportBusy=true;
  let p=null;
  const addButtons=['#genAdd','#infoAdd'].map(selector=>$(selector)).filter(Boolean);
  addButtons.forEach(button=>button.disabled=true);
  try{
    if(!ensurePhotoPatient())return;
    p=selectedPatient;
    const oldList=photoList(p,type);
    if(type==='genogram'&&oldList.length&&!confirm('登録済みのジェノグラムを差し替えますか？'))return;
    // Prepare every photo before changing the saved patient index.
    const additions=[];
    for(const file of batch){
      const data=await fileToPhoto(file),id=uid();
      additions.push({entry:{id,type,name:file.name,addedAt:nowISO(),order:nextPhotoOrder([...oldList,...additions.map(x=>x.entry)])},cipher:await encryptObj(data)});
    }
    if(!additions.length)return;
    // Never commit an import for a patient whose sheet was closed or replaced.
    if(selectedPatient!==p)return;
    const previous=p.attachments||[];
    const removed=type==='genogram'?oldList:[];
    const next=previous.filter(m=>!removed.some(x=>x.id===m.id)).concat(additions.map(x=>x.entry));
    const updatedPatient={...p,attachments:next};delete updatedPatient._new;
    const newPatients=p._new?[...state.patients,updatedPatient]:state.patients.map(x=>x===p?updatedPatient:x);
    const newState={...state,patients:newPatients,updatedAt:nowISO()};
    if(selectedPatient!==p)return;
    const stateCipher=await encryptObj(newState);
    // Encryption is asynchronous: the user may switch sheets while it runs.
    if(selectedPatient!==p)return;
    await idbApplyChanges([...additions.map(x=>[photoKey(x.entry.id),x.cipher]),['data',stateCipher]],removed.map(x=>photoKey(x.id)));
    p.attachments=next;
    if(p._new){delete p._new;state.patients.push(p)}
    state.updatedAt=newState.updatedAt;
    // A patient switch can happen while the IndexedDB transaction is pending.
    // Keep the committed patient's data in sync without redrawing another sheet.
    if(selectedPatient===p){
      if(type==='genogram'&&activeTab==='photos'){
        // Only a successful persisted genogram import returns to the overview.
        // Admission information retains its multi-page registration workflow.
        activeTab='basic';clearBasicPhotoPreview();$('#modal')?.remove();renderPatientModal();
      }else renderPhotosTab();
    }
  }catch(e){
    // Do not show an obsolete import error on a different patient's sheet.
    if(selectedPatient===p)alert('写真を保存できませんでした：'+(e.message||e));
  }
  finally{photoImportBusy=false;addButtons.forEach(button=>{if(button.isConnected)button.disabled=false})}
}
// Revoke object URLs as soon as the photo viewer closes or the patient changes.
let activePhotoViewer=null;
let photoViewRequest=0;
function dismissPhotoViewer(){
  // Invalidate any pending asynchronous decrypt/view request, even without an open viewer.
  photoViewRequest++;
  if(!activePhotoViewer)return;
  const viewer=activePhotoViewer;
  activePhotoViewer=null;
  viewer.overlay.remove();
  URL.revokeObjectURL(viewer.url);
}
async function viewPhoto(id){
  const request=++photoViewRequest;
  // A slow decryption must not open a previous patient's image after the user
  // closes the sheet or switches to a different patient.
  const patient=selectedPatient,modal=$('#modal');
  if(!patient||!(patient.attachments||[]).some(m=>m.id===id))return;
  try{
    const d=await readPhotoRecord(id),image=await photoJpeg(d);
    if(request!==photoViewRequest||selectedPatient!==patient||!modal?.isConnected||$('#modal')!==modal||!(patient.attachments||[]).some(m=>m.id===id))return;
    dismissPhotoViewer();
    const url=URL.createObjectURL(new Blob([image.bytes],{type:'image/jpeg'}));
    // An in-page viewer avoids Safari blocking window.open after asynchronous decryption.
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.className='btn';
    const img=document.createElement('img');img.src=url;img.alt='登録写真';img.style.cssText='max-width:100%;min-height:0;flex:1;object-fit:contain';
    const dismiss=()=>{if(activePhotoViewer?.overlay===overlay)dismissPhotoViewer()};
    close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss()};
    const bar=document.createElement('div');bar.style.cssText='width:100%;display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px';
    const pages=photoList(patient,'admission'),pageIndex=pages.findIndex(m=>m.id===id);
    if(pageIndex>=0){
      const previous=document.createElement('button');previous.type='button';previous.className='btn secondary';previous.textContent='← 前';previous.disabled=pageIndex===0;
      const label=document.createElement('span');label.textContent=`入院時患者情報 ${pageIndex+1} / ${pages.length}`;label.style.cssText='color:#fff;font-weight:700';
      const next=document.createElement('button');next.type='button';next.className='btn secondary';next.textContent='次 →';next.disabled=pageIndex===pages.length-1;
      previous.onclick=()=>{if(pageIndex>0)void viewPhoto(pages[pageIndex-1].id)};
      next.onclick=()=>{if(pageIndex<pages.length-1)void viewPhoto(pages[pageIndex+1].id)};
      const pagesBar=document.createElement('div');pagesBar.style.cssText='display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px';pagesBar.append(previous,label,next);
      overlay.append(bar,img,pagesBar);
    }else{overlay.append(bar,img)}
    bar.append(document.createElement('span'),close);
    document.body.appendChild(overlay);
    activePhotoViewer={overlay,url};
  }catch(e){
    // Ignore failures from an obsolete request after the viewer was closed or patient changed.
    if(request===photoViewRequest&&selectedPatient===patient&&modal?.isConnected&&$('#modal')===modal)
      alert('写真を開けません：'+e.message);
  }
}
let photoRotateBusy=false;
async function rotateStoredPhoto(id){
  if(photoRotateBusy)return;
  const patient=selectedPatient;
  if(!patient||(patient.attachments||[]).every(m=>m.id!==id))return;
  photoRotateBusy=true;
  try{
    const d=await readPhotoRecord(id);
    if(selectedPatient!==patient||(patient.attachments||[]).every(m=>m.id!==id))return;
    // Encrypt before committing; a slow encryption must not write a photo after
    // the user has switched patients or deleted its attachment.
    const cipher=await encryptObj(rotatePhoto({...d}));
    if(selectedPatient!==patient||(patient.attachments||[]).every(m=>m.id!==id))return;
    await idbSet(photoKey(id),cipher);
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真を回転できませんでした：'+(e.message||e))}
  finally{photoRotateBusy=false}
}

let photoDeleteBusy=false;
async function deletePhoto(id){
  if(photoDeleteBusy)return;
  const patient=selectedPatient;
  if(!patient||(patient.attachments||[]).every(m=>m.id!==id))return;
  if(!confirm('この写真を削除しますか？'))return;
  // Confirm dialogs may change focus; never apply a stale action to another sheet.
  if(selectedPatient!==patient)return;
  photoDeleteBusy=true;
  try{
    const next=(patient.attachments||[]).filter(m=>m.id!==id);
    const newState={...state,patients:state.patients.map(x=>x===patient?{...patient,attachments:next}:x),updatedAt:nowISO()};
    const cipher=await encryptObj(newState);
    if(selectedPatient!==patient)return;
    await idbApplyChanges([['data',cipher]],[photoKey(id)]);
    patient.attachments=next;state.updatedAt=newState.updatedAt;
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真を削除できませんでした：'+(e.message||e))}
  finally{photoDeleteBusy=false}
}
let photoReorderBusy=false;
async function movePhotoUp(id){
  if(photoReorderBusy)return;
  const patient=selectedPatient,m=(patient?.attachments||[]).find(m=>m.id===id);
  if(!m)return;
  const a=photoList(patient,m.type),idx=a.findIndex(x=>x.id===id);
  if(idx<1)return;
  const other=a[idx-1];
  // Work on a snapshot: never mutate live patient metadata before durable storage succeeds.
  const nextAttachments=(patient.attachments||[]).map(entry=>
    entry.id===m.id?{...entry,order:other.order}:
    entry.id===other.id?{...entry,order:m.order}:entry);
  photoReorderBusy=true;
  try{
    const updatedAt=nowISO();
    const nextState={...state,updatedAt,patients:state.patients.map(p=>
      p===patient?{...p,attachments:nextAttachments}:p)};
    const cipher=await encryptObj(nextState);
    // A patient switch during encryption must not commit an old sheet's action.
    if(selectedPatient!==patient)return;
    await idbSet('data',cipher);
    patient.attachments=nextAttachments;
    state.updatedAt=updatedAt;
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真の並び替えを保存できませんでした：'+(e.message||e))}
  finally{photoReorderBusy=false}
}

let pdfExportBusy=false;
async function exportAdmissionPdf(){
  if(pdfExportBusy)return;
  // Keep the export bound to the patient whose button was pressed. The modal
  // may be closed or another patient selected while Safari decrypts images.
  const patient=selectedPatient;
  if(!patient)return;
  pdfExportBusy=true;
  const button=$('#photoPdf');if(button)button.disabled=true;
  try{
    const a=photoList(patient,'admission');if(!a.length)return;
    if(a.length>100)throw new Error('PDFは一度に100ページまでです');
    const imgs=[];let total=0;
    for(const m of a){
      const img=await photoJpeg(await readPhotoRecord(m.id));total+=img.bytes.length;
      if(total>80*1024*1024)throw new Error('写真データが80MBを超えています');
      imgs.push(img);
      // Stop promptly if the user leaves this patient's sheet during a long export.
      if(selectedPatient!==patient)return;
    }
    // Never download a previous patient's PDF after switching to another patient.
    if(selectedPatient!==patient)return;
    download(makePhotoPdf(imgs),`入院時患者情報_${safeFilePart(patient.data['ＩＤ'])}_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){
    // An obsolete export must not show its error on a different patient's sheet.
    if(selectedPatient===patient)alert('PDFを作成できません：'+e.message);
  }
  finally{
    pdfExportBusy=false;
    // Never change a button belonging to a different patient or a new modal.
    if(button?.isConnected&&selectedPatient===patient)button.disabled=!photoList(patient,'admission').length;
  }
}
function fieldHtml(f){
  const v=selectedPatient.data[f]??'';
  const long=['備考'].includes(f);
  const type=['入院日','調査日','ADL調査日'].includes(f)?'date':'text';
  const span=['病名','かかりつけ','ケアマネ・施設','リハ状況','問題行動','備考'].includes(f)?'span2':'';
  if(f==='ベッド番号')return `<div class="field ${span}"><label>ベッド番号</label><input type="hidden" data-field="ベッド番号" id="patientBedValue" value="${esc(v)}"><button type="button" class="btn secondary" id="patientBedPick">${esc(v||'その他・未配置')} ▾</button></div>`;if(masterFields.includes(f))return `<div class="field ${span}"><label>${esc(f)}</label>${masterSelectHtml(f,v)}</div>`;
  return `<div class="field ${span}"><label>${esc(f)}</label>${long?`<textarea data-field="${esc(f)}">${esc(v)}</textarea>`:`<input data-field="${esc(f)}" type="${type}" value="${esc(v)}">`}</div>`;
}
function saveFieldsOnly(){return capturePatientForm()}
async function savePatientFromForm(){return finishPatientAndNavigate(closePatient,{closing:true})}
function taskListHtml(p){if(!p.tasks?.length)return'<div class="empty">タスクなし</div>';return p.tasks.map((t,i)=>`<label class="settings-row"><span><input type="checkbox" data-task="${i}" ${t.done?'checked':''}> ${esc(t.text)}</span><small>${fmtDate(t.createdAt)}</small></label>`).join('')}
function bindTaskChecks(){$$('[data-task]').forEach(c=>c.onchange=()=>{selectedPatient.tasks[+c.dataset.task].done=c.checked;save()})}
function addTask(){const el=$('#newTask'),v=el.value.trim();if(!v)return;selectedPatient.tasks??=[];selectedPatient.tasks.push({id:uid(),text:v,done:false,createdAt:nowISO()});$('#taskList').innerHTML=taskListHtml(selectedPatient);el.value='';bindTaskChecks();save()}
function notesHtml(p){const a=[...(p.notes||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at)));if(!a.length)return'<div class="empty">経過記録はまだありません</div>';return a.map(n=>`<div class="note"><div class="time">${fmtDate(n.at)} ${new Date(n.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div><div class="type">${esc(n.type)}</div><div>${esc(n.text).replace(/\n/g,'<br>')}</div></div>`).join('')}
function addNote(){const txt=$('#noteText').value.trim();if(!txt)return;selectedPatient.notes??=[];selectedPatient.notes.push({id:uid(),type:$('#noteType').value,at:new Date($('#noteAt').value).toISOString(),text:txt});save();activeTab='notes';$('#modal').remove();renderPatientModal()}
function renderTasks(){const rows=[];activePatients().forEach(p=>(p.tasks||[]).filter(t=>!t.done).forEach(t=>rows.push({p,t})));$('#main').innerHTML=`<div class="hero"><div><h1>要対応</h1><p>患者横断の未完了タスクです。</p></div></div>${rows.length?`<div class="panel">${rows.map(({p,t})=>`<div class="settings-row taskjump" data-id="${p.id}"><div><b>${esc(p.data['氏名'])}</b> <span class="tag">${esc(p.data['ベッド番号'])}</span><small>${esc(t.text)}</small></div><span>›</span></div>`).join('')}</div>`:'<div class="empty">未完了タスクはありません</div>'}`;$$('.taskjump').forEach(x=>x.onclick=()=>openPatient(state.patients.find(p=>p.id===x.dataset.id)))}
function renderDrugs(){const ds=state.drugs||[];$('#main').innerHTML=`<div class="hero"><div><h1>薬情</h1><p>端末内の簡易薬剤マスター。患者処方そのものは保存しません。</p></div></div><div class="toolbar"><input id="dq" placeholder="薬名・分類・薬効で検索"></div><div id="drugList"></div>`;$('#dq').oninput=drawDrugs;drawDrugs()}
function drawDrugs(){const q=($('#dq')?.value||'').toLowerCase().trim();const a=(state.drugs||[]).filter(d=>!q||[d['薬名'],d['医薬品分類'],d['薬効']].join(' ').toLowerCase().includes(q)).slice(0,100);$('#drugList').innerHTML=a.length?`<div class="drug-list">${a.map(d=>`<article class="drug"><b>${esc(d['薬名'])}</b><div class="small">${esc(d['医薬品分類'])}　${esc(d['薬価'])}</div><div class="effect">${esc(d['薬効'])}</div></article>`).join('')}</div>`:'<div class="empty">薬剤データがありません。設定から「薬剤CSV」を読み込んでください。</div>'}

function renderMasters(){
  ensureStateSchema();
  const fields=['進捗ステータス','経過記録種別',...masterFields];
  $('#main').innerHTML=`<div class="hero"><div><h1>マスター管理</h1><p>入力候補をここで管理します。患者入力中でも「＋ リストにない → 新規登録」から追加できます。</p></div></div>
  <div class="panel"><div class="form-grid"><div class="field span2"><label>編集する項目</label><select id="mf">${fields.map(f=>`<option>${esc(f)}</option>`).join('')}</select></div></div></div>
  <div class="panel"><h3 id="masterTitle"></h3><div class="toolbar"><input id="newMaster" placeholder="新しい候補を入力"><button class="btn" id="addMaster">＋追加</button></div><div id="masterList"></div></div>`;
  $('#mf').onchange=drawMasterList; $('#addMaster').onclick=addMasterFromScreen; $('#newMaster').onkeydown=e=>{if(e.key==='Enter')addMasterFromScreen()}; drawMasterList();
}
function drawMasterList(){
  const f=$('#mf').value, vals=masterValues(f); $('#masterTitle').textContent=`${f}　${vals.length}件`;
  $('#masterList').innerHTML=vals.length?vals.map((v,i)=>`<div class="settings-row"><div><b>${esc(v)}</b></div><button class="btn danger masterDel" data-i="${i}">削除</button></div>`).join(''):'<div class="empty">候補がありません</div>';
  $$('.masterDel').forEach(b=>b.onclick=async()=>{const val=vals[+b.dataset.i];if(!confirm(`「${val}」をマスターから削除しますか？\n既存患者に入力済みの値は消えません。`))return;state.masters[f]=(state.masters[f]||[]).filter(x=>x!==val);await save();drawMasterList()});
}
async function addMasterFromScreen(){
  const f=$('#mf').value,v=$('#newMaster').value.trim();if(!v)return;state.masters[f]=uniq([...(state.masters[f]||[]),v]);$('#newMaster').value='';await save();drawMasterList();
}

async function renderSettings(){
  const est=navigator.storage?.estimate?await navigator.storage.estimate():{};
  const usage=est.usage||0,quota=est.quota||0,pct=quota?Math.min(100,usage/quota*100):0;
  let persisted='未確認'; try{if(navigator.storage?.persisted)persisted=(await navigator.storage.persisted())?'保持を要求済み':'通常保存'}catch(e){}
  const last=state.settings.lastBackupAt?new Date(state.settings.lastBackupAt).toLocaleString('ja-JP'):'まだありません';
  $('#main').innerHTML=`<div class="hero"><div><h1>設定</h1><p>移行・バックアップ・容量・セキュリティを管理します。</p></div></div>
  <div class="panel"><h3>データ移行</h3><div class="settings-row"><div><b>患者CSVを読み込む</b><small>旧FileMakerから出した患者情報CSV。重複患者IDは更新します。</small></div><button class="btn secondary" id="impP">読込</button></div><div class="settings-row"><div><b>薬剤CSVを読み込む</b><small>医薬品分類・薬価・薬効・薬名の4列。</small></div><button class="btn secondary" id="impD">読込</button></div></div>
  <div class="panel"><h3>FileMaker最新データで入れ替え（試験用）</h3><div class="settings-row"><div><b>患者CSVで全件入れ替え</b><small>患者データのみを全件置換します。薬剤・マスター・設定は保持します。患者ID（番号）必須。実行前に件数を確認します。</small></div><button class="btn danger" id="replaceP">全件入れ替え</button></div></div>
  <div class="panel"><h3>退院患者の保存</h3><p class="notice">Ver.1.0.17から退院患者の自動削除を停止しました。退院確定後も記録を保存し、患者画面の「退院患者記録」から検索・閲覧・確定取消できます。</p><div class="settings-row"><b>保存中の退院患者</b><span>${state.patients.filter(p=>p.dischargeDate).length}名</span></div></div>
  <div class="panel"><h3>セキュリティ</h3><div class="settings-row"><div><b>自動ロック</b><small>無操作時に暗証画面へ戻ります。</small></div><select id="autolock"><option value="1">1分</option><option value="5">5分</option><option value="10">10分</option><option value="30">30分</option></select></div><div class="settings-row"><div><b>暗証を変更</b><small>現在の暗証を確認後、新しい暗証でDBを再暗号化します。</small></div><button class="btn secondary" id="changePin">変更</button></div></div>
  <div class="panel"><h3>バックアップ</h3><div class="settings-row"><div><b>暗号化バックアップ</b><small>患者・薬剤・経過記録・マスターを暗号化したまま書き出します。<br>最終：${esc(last)}</small></div><button class="btn secondary" id="backup">書出</button></div><div class="settings-row"><div><b>バックアップ復元</b><small>.mswdb ファイルを読み込みます。</small></div><button class="btn secondary" id="restore">復元</button></div></div>
  <div class="panel"><h3>端末保存</h3><div class="settings-row"><div><b>保存領域</b><small>${esc(persisted)} / 使用量 ${humanBytes(usage)}${quota?' / 上限目安 '+humanBytes(quota):''}</small></div><button class="btn secondary" id="persist">保持を要求</button></div><div class="storagebar"><div style="width:${pct}%"></div></div><p class="notice">iPadではホーム画面から起動してください。写真・PDFの元画像は暗号化して端末内に保存します。容量に注意し、写真を含むバックアップを定期的に作成してください。</p></div>
  <div class="panel"><h3>初期化</h3><div class="settings-row"><div><b>この端末のMSW-DBを全消去</b><small>患者・薬剤・マスター・暗証をすべて削除します。復元にはバックアップが必要です。</small></div><button class="btn danger" id="resetAll">全消去</button></div></div>
  <div class="panel"><div class="notice">MSW-DB 公開前テスト Ver.${APP_VERSION} / 在院 ${activePatients().length}人 / 薬剤 ${state.drugs.length}件</div></div>`;
  $('#autolock').value=String(state.settings.autoLockMin??5);
  $('#autolock').onchange=async e=>{state.settings.autoLockMin=+e.target.value;await save();resetAutoLock()};
  $('#replaceP').onclick=()=>pickFile('.csv',replacePatientsFromFileMaker);
  $('#impP').onclick=()=>pickFile('.csv',importPatients);$('#impD').onclick=()=>pickFile('.csv',importDrugs);
  $('#backup').onclick=backup;$('#restore').onclick=()=>pickFile('.mswdb,application/json',restore);
  $('#changePin').onclick=changePin;
  $('#persist').onclick=async()=>{try{const ok=navigator.storage?.persist?await navigator.storage.persist():false;alert(ok?'保存領域の保持を要求しました。':'このブラウザでは保持要求を利用できないか、許可されませんでした。');renderSettings()}catch(e){alert('保持要求を実行できませんでした。')}};
  $('#resetAll').onclick=resetAll;
}
async function changePin(){
  const oldPin=prompt('現在の暗証を入力してください'); if(oldPin===null)return;
  try{const oldKey=await derive(oldPin,unb64(meta.salt));await decryptObj(meta.check,oldKey)}catch(e){return alert('現在の暗証が違います。')}
  const np=prompt('新しい暗証（6文字以上）を入力してください');if(np===null)return;if(np.length<6)return alert('6文字以上にしてください。');
  const np2=prompt('確認のため新しい暗証をもう一度入力してください');if(np!==np2)return alert('新しい暗証が一致しません。');
  const salt=crypto.getRandomValues(new Uint8Array(16));const newKey=await derive(np,salt);const newMeta={version:1,salt:b64(salt),check:await encryptObj({ok:true},newKey),createdAt:meta.createdAt||nowISO(),changedAt:nowISO()};
  // Re-encrypt every referenced photo together with the patient state and PIN metadata.
  // Do not switch the in-memory key unless the entire IndexedDB transaction commits.
  try{
    const records=[];
    const ids=new Set(state.patients.flatMap(p=>(p.attachments||[]).map(m=>m.id)));
    for(const id of ids){
      const oldCipher=await idbGet(photoKey(id));
      if(!oldCipher)throw new Error('写真データが見つかりません: '+id);
      const plain=await decryptObj(oldCipher,key);
      records.push([photoKey(id),await encryptObj(plain,newKey)]);
    }
    const nextState={...state,updatedAt:nowISO()};
    records.push(['data',await encryptObj(nextState,newKey)],['meta',newMeta]);
    await idbSetMany(records);
    state=nextState;meta=newMeta;key=newKey;
    alert('暗証を変更しました。写真も新しい暗証で保護されています。');
  }catch(e){alert('暗証の変更を中止しました。以前の暗証とデータは維持されます：'+e.message)}
}
async function resetAll(){
  if(!confirm('この端末のMSW-DBデータをすべて削除します。\nバックアップが無い場合は復元できません。'))return;
  const word=prompt('実行する場合は「全消去」と入力してください');if(word!=='全消去')return;
  await idbDel('data');await idbDel('meta');meta=null;key=null;state=null;selectedPatient=null;alert('全消去しました。');renderLock();
}
function pickFile(accept,cb){const f=$('#fileInput');f.accept=accept;f.value='';f.onchange=()=>{if(f.files[0])cb(f.files[0])};f.click()}
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(q){if(c==='"'&&n==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}}if(cell.length||row.length){row.push(cell);rows.push(row)}return rows}
function rowsToObjects(rows){const h=rows[0]||[];return rows.slice(1).filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
function fileMakerBed(bed){
  const value=String(bed??'').trim(),m=normalizeBed(value).match(/^ICU3-(\d+)$/);
  // This mapping applies ONLY to CSV imported from FileMaker.
  if(m&&Number(m[1])>=7&&Number(m[1])<=15)return `ICU3-${Number(m[1])-6}`;
  return value;
}
async function importPatients(file){
  const objs=rowsToObjects(parseCSV(await file.text()));
  const candidates=objs.filter(o=>o['氏名']||o['ＩＤ']);
  const converted=candidates.filter(o=>o['ベッド番号']!==undefined&&fileMakerBed(o['ベッド番号'])!==String(o['ベッド番号']).trim());
  const detail=converted.length?`\nICU3番号変換：${converted.length}件（旧7～15 → 新1～9）`:'';
  if(!confirm(`患者CSVを取り込みますか？\n対象 ${candidates.length}件${detail}\n\n同じ患者IDは既存の情報が更新されます。取り込み前のバックアップを推奨します。`))return;
  let added=0,updated=0;
  for(const o of candidates){
    const idKey=String(o['ＩＤ']||'').trim();
    let p=idKey?state.patients.find(x=>String(x.data['ＩＤ']||'').trim()===idKey):null;
    if(!p){p=newPatient();delete p._new;state.patients.push(p);added++}else updated++;
    legacyFields.forEach(k=>{if(o[k]!==undefined)p.data[k]=k==='ベッド番号'?fileMakerBed(o[k]):o[k]});
    p.updatedAt=nowISO();
  }
  ensureStateSchema();await save();
  alert(`患者CSV読込完了\n追加 ${added}人 / 更新 ${updated}人${detail}`);render();
}
// Ver.1.0.7: explicitly requested full replacement of TEST patient records only.
// The original merge import remains available separately and unchanged.
function prepareFileMakerReplacement(csvText){
  const rows=parseCSV(csvText), headers=(rows[0]||[]).map(h=>String(h).replace(/^\uFEFF/,'').trim());
  const idCol=headers.includes('番号')?'番号':headers.includes('ＩＤ')?'ＩＤ':headers.includes('ID')?'ID':null;
  if(!idCol||!headers.includes('氏名')||!headers.includes('ベッド番号'))throw new Error('必要な列（番号またはID・氏名・ベッド番号）がありません。');
  const raw=rowsToObjects([headers,...rows.slice(1)]);
  if(!raw.length)throw new Error('患者データがありません。');
  const seen=new Set(), errors=[], patients=[], changed=[];
  for(let i=0;i<raw.length;i++){
    const o=raw[i],id=String(o[idCol]??'').trim(),name=String(o['氏名']??'').trim();
    if(!id){errors.push(`${i+2}行目：患者IDが空欄`);continue;}
    if(!name){errors.push(`${i+2}行目：氏名が空欄`);continue;}
    if(seen.has(id)){errors.push(`${i+2}行目：患者IDの重複`);continue;}
    seen.add(id);
    const p=newPatient();delete p._new;
    for(const k of legacyFields)if(o[k]!==undefined)p.data[k]=String(o[k]??'').trim();
    p.data['ＩＤ']=id;
    const oldBed=String(o['ベッド番号']??'').trim(),newBed=fileMakerBed(oldBed);
    p.data['ベッド番号']=newBed;
    if(oldBed!==newBed)changed.push({oldBed,newBed});
    patients.push(p);
  }
  if(errors.length)throw new Error(`CSVを取り込めません。\n${errors.slice(0,8).join('\n')}${errors.length>8?'\nほかにもエラーがあります':''}`);
  const invalid=patients.filter(p=>p.data['ベッド番号']&&!isMappedBed(p.data['ベッド番号']));
  return {patients,changed,invalid};
}
async function replacePatientsFromFileMaker(file){
  try{
    const {patients,changed,invalid}=prepareFileMakerReplacement(await file.text());
    const existingPhotoKeys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith('photo:'));
    const preview=`FileMaker患者データ：${patients.length}人\n現在のアプリ患者データ：${state.patients.length}人\n削除される写真：${existingPhotoKeys.length}枚\nICU3番号変換：${changed.length}人\nその他・未配置：${invalid.length}人\n\n現在の患者データ（メモ・経過記録・タスク・写真を含む）をすべて削除し、CSVの患者データに入れ替えます。\n薬剤・マスター・設定・暗証は保持されます。\n事前にバックアップを保存してください。\n\n続行しますか？`;
    if(!confirm(preview))return;
    const word=prompt('最終確認：患者データを全件入れ替える場合は「入れ替え」と入力してください。');
    if(word!=='入れ替え')return;
    // Remove all old photo records and replace patient state in one transaction.
    // Do not mutate in-memory state until IndexedDB confirms the transaction committed.
    const next={...state,patients,version:APP_VERSION,updatedAt:nowISO()};
    await idbApplyChanges([['data',await encryptObj(next)]],existingPhotoKeys);
    state=next;ensureStateSchema();
    alert(`全件入れ替えが完了しました。\n患者 ${patients.length}人\nICU3番号変換 ${changed.length}人\nその他・未配置 ${invalid.length}人`);
    render();
  }catch(e){alert(`患者CSVの入れ替えを中止しました。\n${e.message||'ファイルの読み込みに失敗しました。'}`)}
}
async function importDrugs(file){const objs=rowsToObjects(parseCSV(await file.text()));state.drugs=objs.filter(x=>x['薬名']);await save();alert(`薬剤 ${state.drugs.length}件を読み込みました。`);render()}
let backupBusy=false;
async function backup(){
  if(backupBusy)return;
  backupBusy=true;
  try{
    // Preflight every referenced photo before claiming the backup is complete.
    // Detect missing, duplicated, corrupted, or wrongly encrypted records.
    const photos={},seen=new Set();
    for(const p of state.patients){
      if(!Array.isArray(p.attachments||[]))throw new Error('患者の写真一覧が不正です');
      let genograms=0;const admissionOrders=new Set();
      for(const m of p.attachments||[]){
        if(!m||typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)||seen.has(m.id))throw new Error('写真IDが重複または不正です');
        if(m.type!=='genogram'&&m.type!=='admission')throw new Error('写真の種類が不正です');
        if(!Number.isSafeInteger(m.order)||m.order<0||m.order>100000)throw new Error('写真のページ順が不正です');
        if(m.type==='genogram'&&++genograms>1)throw new Error('ジェノグラムが複数登録されています');
        if(m.type==='admission'){if(admissionOrders.has(m.order))throw new Error('入院時情報のページ順が重複しています');admissionOrders.add(m.order)}
        seen.add(m.id);
        // Match the restore limit: never offer a backup that this app cannot import.
        if(seen.size>2000)throw new Error('写真が2000枚を超えるため、復元可能なバックアップを作成できません');
        const data=await idbGet(photoKey(m.id));
        if(!data)throw new Error('写真データが不足しています: '+m.id);
        try{validateStoredPhoto(await decryptObj(data,key))}catch(e){throw new Error('写真を検証できません: '+m.id+' ('+e.message+')')}
        photos[m.id]=data;
      }
    }
    // Enforce the restore-side 120MB ceiling at export time as well. Check the
    // encrypted payload before JSON.stringify creates another large allocation.
    const backupLimit=120*1024*1024;
    let estimatedBytes=1024*1024;
    for(const [id,record] of Object.entries(photos)){
      estimatedBytes+=id.length+record.iv.length+record.ct.length+256;
      if(estimatedBytes>backupLimit)throw new Error('写真付きバックアップが120MBを超えるため作成できません。写真を整理してください');
    }
    const storedMeta=await idbGet('meta'),storedData=await idbGet('data');
    const validCipher=x=>x&&typeof x.iv==='string'&&x.iv.length>0&&typeof x.ct==='string'&&x.ct.length>0;
    if(!storedMeta||typeof storedMeta.salt!=='string'||!storedMeta.salt||!validCipher(storedMeta.check)||!validCipher(storedData)){
      throw new Error('保存済みの暗号化情報が不完全です。バックアップを中止しました');
    }
    const pack={format:'MSWDB-BACKUP',version:2,appVersion:APP_VERSION,exportedAt:nowISO(),meta:storedMeta,data:storedData,photos};
    const serialized=JSON.stringify(pack);
    if(new Blob([serialized]).size>backupLimit)throw new Error('バックアップが120MBを超えるため作成できません');
    download(new Blob([serialized],{type:'application/json'}),`MSWDB_backup_${new Date().toISOString().slice(0,10)}.mswdb`);
    state.settings.lastBackupAt=nowISO();await save();
    setTimeout(()=>{if(screen==='settings')renderSettings();else render()},300);
  }catch(e){alert('バックアップを作成できません：'+e.message)}
  finally{backupBusy=false}
}
let restoreBusy=false;
async function restore(file){
  if(restoreBusy)return;
  restoreBusy=true;
  try{
    // Reject huge backups before file.text()/JSON.parse allocate multiple large copies in Safari.
    // This is a safety limit for iPad; larger archives need a separate import strategy.
    if(!file||!Number.isFinite(file.size)||file.size>120*1024*1024)throw new Error('バックアップは120MB以下にしてください（メモリ保護のため）');
    const pack=JSON.parse(await file.text());
    if(pack.format!=='MSWDB-BACKUP'||!pack.meta||!pack.data)throw new Error('形式が違います');
    const validCipher=x=>x&&typeof x.iv==='string'&&typeof x.ct==='string'&&x.iv.length>0&&x.ct.length>0;
    if(!validCipher(pack.data)||!validCipher(pack.meta.check)||typeof pack.meta.salt!=='string'||!pack.meta.salt)throw new Error('暗号化データが不正です');
    if(pack.photos!==undefined&&(typeof pack.photos!=='object'||pack.photos===null||Array.isArray(pack.photos)))throw new Error('写真情報が不正です');
    if(Object.keys(pack.photos||{}).length>2000)throw new Error('写真が2000枚を超えるバックアップは読み込めません');
    for(const [id,data] of Object.entries(pack.photos||{})){
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!validCipher(data))throw new Error('写真情報が不正です');
    }
    // Verify the backup PIN and every patient/photo association before overwriting anything.
    // This also rejects damaged or incomplete backups while preserving current local data.
    const backupPin=prompt('バックアップ作成時の暗証を入力してください（復元前の整合性確認）');
    if(backupPin===null)return;
    const backupKey=await derive(backupPin,unb64(pack.meta.salt));
    try{const checked=await decryptObj(pack.meta.check,backupKey);if(checked!==true&&checked?.ok!==true)throw new Error('確認情報が不正です')}catch(e){throw new Error('バックアップの暗証が違うか、確認情報が破損しています')}
    let backupState;
    try{backupState=await decryptObj(pack.data,backupKey)}catch(e){throw new Error('患者情報を復号できません。バックアップが破損している可能性があります')}
    if(!backupState||!Array.isArray(backupState.patients))throw new Error('患者情報の形式が不正です');
    const referenced=new Set(),incomingPhotos=pack.photos||{};
    for(const patient of backupState.patients){
      if(!Array.isArray(patient.attachments||[]))throw new Error('患者の写真一覧が不正です');
      let genograms=0;const admissionOrders=new Set();
      for(const attachment of patient.attachments||[]){
        const id=attachment?.id;
        if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||referenced.has(id))throw new Error('写真IDが不正、または複数患者で重複しています');
        if(attachment.type!=='genogram'&&attachment.type!=='admission')throw new Error('写真の種類が不正です');
        if(!Number.isSafeInteger(attachment.order)||attachment.order<0||attachment.order>100000)throw new Error('写真のページ順が不正です');
        if(attachment.type==='genogram'&&++genograms>1)throw new Error('ジェノグラムが複数登録されています');
        if(attachment.type==='admission'){if(admissionOrders.has(attachment.order))throw new Error('入院時情報のページ順が重複しています');admissionOrders.add(attachment.order)}
        if(!Object.prototype.hasOwnProperty.call(incomingPhotos,id))throw new Error('バックアップに必要な写真がありません: '+id);
        referenced.add(id);
      }
    }
    for(const id of Object.keys(incomingPhotos)){
      if(!referenced.has(id))throw new Error('患者と紐づかない写真があります: '+id);
      try{validateStoredPhoto(await decryptObj(incomingPhotos[id],backupKey))}catch(e){throw new Error('写真データが破損または不正です: '+id+' ('+e.message+')')}
    }
    if(!confirm(`患者${backupState.patients.length}件・写真${referenced.size}枚を確認しました。現在のデータを置き換えますか？`))return;
    // Commit photos and encrypted patient state atomically; a failed restore must not leave half-written records.
    // Remove old, unrelated photo records as part of the same restore transaction.
    // A legacy backup has no photos, so its restore must also clear old photos.
    const existingPhotoKeys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith('photo:'));
    const obsoletePhotoKeys=existingPhotoKeys.filter(k=>!Object.prototype.hasOwnProperty.call(incomingPhotos,k.slice(6)));
    await idbApplyChanges([...Object.entries(incomingPhotos).map(([id,data])=>[photoKey(id),data]),['meta',pack.meta],['data',pack.data]],obsoletePhotoKeys);
    // A successful restore invalidates the previous patient's open sheet and photo viewer.
    dismissPhotoViewer();
    selectedPatient=null;
    document.getElementById('modal')?.remove();
    meta=pack.meta;key=null;state=null;alert('復元しました。バックアップ作成時の暗証で再度ロック解除してください。');renderLock();
  }catch(e){alert('バックアップファイルを読み込めませんでした：'+e.message)}
  finally{restoreBusy=false}
}
function safeFilePart(value){return String(value||'患者').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,60)||'患者'}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
init().catch(e=>{document.getElementById('app').innerHTML=`<div class="lockwrap"><div class="lockcard"><h1>起動できません</h1><p>${esc(e.message)}</p><p class="notice">HTTPSで開いているか確認してください。iPadではSafariからホーム画面へ追加して使用します。</p></div></div>`});


// Shared bed selector: compact 3 columns, room headings, without leaving the current screen.
function showGroupedBedPicker(current,onChoose,options={}){
  $('#groupedBedPicker')?.remove();
  const groups=[...BED_LAYOUT,...ICU_LAYOUT];
  const panel=`<div class="bed-picker-shade" id="groupedBedPicker" role="dialog" aria-modal="true" aria-label="ベッド配置先を選択"><div class="bed-picker-panel"><div class="bed-picker-head"><strong>ベッド配置先を選択</strong><button type="button" class="btn secondary" id="bedPickerClose">閉じる</button></div><div class="bed-picker-scroll"><div class="bed-picker-top"><button type="button" class="bed-picker-choice ${!current?'chosen':''}" data-bed="">その他・未配置</button>${options.onDischarge?`<button type="button" class="bed-picker-choice discharge-choice" id="pickerDischarge">退院</button>`:''}</div>${groups.map(r=>`<section class="bed-picker-room"><h3>${esc(r.room)}${r.room.startsWith('ICU')?'':'号室'}</h3><div class="bed-picker-grid">${r.beds.map(n=>{const b=bedKey(r.room,n);return `<button type="button" class="bed-picker-choice ${normalizeBed(current)===normalizeBed(b)?'chosen':''}" data-bed="${esc(b)}">${esc(b)}</button>`}).join('')}</div></section>`).join('')}</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',panel);
  const root=$('#groupedBedPicker');
  const close=()=>root.remove();
  root.addEventListener('click',e=>{if(e.target===root)close()});
  $('#bedPickerClose').onclick=close;if(options.onDischarge)$('#pickerDischarge').onclick=()=>{close();options.onDischarge()};
  root.querySelectorAll('[data-bed]').forEach(btn=>btn.onclick=()=>{onChoose(btn.dataset.bed);close()});
}

// Real patient discharge: preserve records and keep pending summaries visible.
function bindPatientBedPicker(){
 const btn=$('#patientBedPick'),input=$('#patientBedValue');if(!btn||!input)return;
 btn.onclick=()=>showGroupedBedPicker(input.value,value=>{input.value=value;btn.textContent=(value||'その他・未配置')+' ▾';input.dispatchEvent(new Event('change',{bubbles:true}))},
   {onDischarge:()=>startDischargeFlow()});
}
function startDischargeFlow(){
 const p=selectedPatient;if(!p)return;
 if(p._new){alert('先に患者情報を保存してください。');return;}
 const previousBed=$('#patientBedValue')?.value??p.data['ベッド番号']??'';
 const today=new Date().toLocaleDateString('sv-SE');
 document.body.insertAdjacentHTML('beforeend',`<div class="bed-picker-shade" id="dischargeFlow" role="dialog" aria-modal="true" aria-label="退院日を選択"><div class="bed-picker-panel discharge-panel"><div class="bed-picker-head"><strong>退院日を選択</strong><button class="btn secondary" id="dischargeCancel">戻る</button></div><div class="discharge-content"><p><b>${esc(p.data['氏名']||'氏名未入力')}</b></p><label>退院日<input type="date" id="dischargeChosenDate" value="${today}"></label><p class="notice">退院確定後はベッドを空け、日誌の退院患者一覧に残します。サマリー入力完了までは削除されません。</p><button class="btn" id="dischargeReview">確認へ</button><div id="dischargeReviewBody"></div></div></div></div>`);
 const root=$('#dischargeFlow');$('#dischargeCancel').onclick=()=>root.remove();
 $('#dischargeReview').onclick=()=>{
  const date=$('#dischargeChosenDate').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('退院日を入力してください');return;}
  const admission=p.data['入院日'];if(admission&&/^\d{4}-\d{2}-\d{2}$/.test(admission)&&date<admission){alert('退院日は入院日以降を指定してください');return;}
  $('#dischargeReviewBody').innerHTML=`<div class="panel"><p><b>退院処理を確定しますか？</b></p><p>${esc(p.data['氏名']||'氏名未入力')} ／ 退院日：${esc(date)} ／ 退院前：${esc(previousBed||'その他・未配置')}</p><button class="btn" id="dischargeCommit">確定して退院一覧へ</button></div>`;
  $('#dischargeCommit').onclick=async()=>{
   const b=$('#dischargeCommit');b.disabled=true;
   if(!await flushPatientAutoSave()){b.disabled=false;alert('患者情報の自動保存に失敗しました。退院処理を中止しました。');return;}
   const old={date:p.dischargeDate,pending:p.summaryPending,bed:p.data['ベッド番号'],former:p.formerBed};
   try{p.formerBed=previousBed;p.dischargeDate=date;p.summaryPending=true;p.data['ベッド番号']='';p.updatedAt=nowISO();await save();root.remove();closePatient();screen='journal';render()}
   catch(e){p.dischargeDate=old.date;p.summaryPending=old.pending;p.data['ベッド番号']=old.bed;p.formerBed=old.former;alert('保存できませんでした：'+e.message);b.disabled=false}
  };
 };
}
function renderPendingDischarges(){
 const pending=state.patients.filter(p=>p.summaryPending&&p.dischargeDate);
 return `<div class="panel"><h2>② 退院患者一覧　${pending.length}名</h2><p class="notice">電子カルテに退院サマリーを入力した後、「退院」を押してください。完了まで一覧に残ります。</p><div class="journal-table-wrap"><table class="journal-table"><thead><tr><th>氏名</th><th>退院日</th><th>退院前の病室</th><th>処理</th></tr></thead><tbody>${pending.map(p=>`<tr><td>${esc(p.data['氏名']||'氏名未入力')}</td><td>${esc(p.dischargeDate||'')}</td><td>${esc(p.formerBed||'未配置')}</td><td><div class="journal-actions"><button type="button" class="btn secondary pending-cancel" data-id="${esc(p.id)}">退院取消</button><button type="button" class="btn secondary pending-complete" data-id="${esc(p.id)}">退院</button></div></td></tr>`).join('')||'<tr><td colspan="4">サマリー未完了の退院患者はいません</td></tr>'}</tbody></table></div></div>`;
}
// Archived discharge records remain encrypted in the same patient database.
function renderArchive(){
 const all=state.patients.filter(p=>!!p.dischargeDate).sort((a,b)=>String(b.dischargeDate||'').localeCompare(String(a.dischargeDate||'')));
 $('#main').innerHTML=`<div class="hero"><div><h1>退院患者記録</h1><p>退院確定後も記録を保持します。サマリー未完了の患者も検索できます。</p></div><div class="spacer"></div><button type="button" class="btn secondary" id="archiveBack">← 入院患者へ</button></div><div class="toolbar"><input id="archiveQuery" type="search" placeholder="氏名・患者ID・退院日で検索"></div><div class="panel"><p class="notice">該当する患者を開いて情報を確認できます。「退院確定取消」はサマリー未完了の退院患者一覧へ戻す操作です。</p><div id="archiveRows"></div></div>`;
 $('#archiveBack').onclick=()=>{screen='patients';render()};
 const draw=()=>{const q=($('#archiveQuery').value||'').trim().toLowerCase();const rows=all.filter(p=>!q||[p.data?.['氏名'],p.data?.['ＩＤ'],p.data?.['番号'],p.dischargeDate].some(v=>String(v||'').toLowerCase().includes(q)));
 $('#archiveRows').innerHTML=rows.length?`<div class="archive-list">${rows.map(p=>`<div class="archive-item"><div><b>${esc(p.data?.['氏名']||'氏名未入力')}</b><div class="notice">退院日：${esc(p.dischargeDate)} ／ ${p.summaryPending?'サマリー未完了':'退院確定済み'} ／ ID：${esc(p.data?.['ＩＤ']||'未入力')}</div></div><div class="archive-actions"><button type="button" class="btn secondary archive-view" data-id="${esc(p.id)}">患者情報</button>${!p.summaryPending?`<button type="button" class="btn secondary archive-undo" data-id="${esc(p.id)}">退院確定取消</button>`:''}</div></div>`).join('')}</div>`:'<div class="empty">該当する退院患者はいません</div>';
 $$('.archive-view').forEach(b=>b.onclick=()=>openPatient(state.patients.find(p=>p.id===b.dataset.id)));
 $$('.archive-undo').forEach(b=>b.onclick=async()=>{const p=state.patients.find(x=>x.id===b.dataset.id);if(!p||!p.dischargeDate||p.summaryPending)return;
 if(!confirm(`${p.data?.['氏名']||'この患者'}さんの退院確定を取り消し、日誌の退院患者一覧（サマリー未完了）へ戻しますか？\n入院中には戻しません。`))return;
 b.disabled=true;const old={pending:p.summaryPending,completed:p.summaryCompletedAt};p.summaryPending=true;p.summaryCompletedAt=null;p.updatedAt=nowISO();
 try{await save();renderArchive()}catch(e){p.summaryPending=old.pending;p.summaryCompletedAt=old.completed;b.disabled=false;alert('保存できませんでした：'+e.message)}
 });};$('#archiveQuery').oninput=draw;draw();
}
function restoreDischargePatient(p){
 p.dischargeDate=null;p.summaryPending=false;p.summaryCompletedAt=null;p.data['ベッド番号']='';p.updatedAt=nowISO();
 p.journalAdmissionPending=true;
}
function bindPendingDischarges(){
 $$('.pending-cancel').forEach(btn=>btn.onclick=async()=>{
  const p=state.patients.find(x=>x.id===btn.dataset.id);if(!p||!p.summaryPending)return;
  if(!confirm(`${p.data['氏名']||'この患者'}さんの退院を取り消し、入院中（その他・未配置）へ戻しますか？\n元のベッドには自動で戻しません。`))return;
  const snapshot={date:p.dischargeDate,pending:p.summaryPending,completed:p.summaryCompletedAt,bed:p.data['ベッド番号'],queue:p.journalAdmissionPending};
  btn.disabled=true;restoreDischargePatient(p);
  try{await save();renderJournalPreview()}catch(e){p.dischargeDate=snapshot.date;p.summaryPending=snapshot.pending;p.summaryCompletedAt=snapshot.completed;p.data['ベッド番号']=snapshot.bed;p.journalAdmissionPending=snapshot.queue;btn.disabled=false;alert('保存できませんでした：'+e.message)}
 });
 $$('.pending-complete').forEach(btn=>btn.onclick=async()=>{
  const p=state.patients.find(x=>x.id===btn.dataset.id);if(!p||!p.summaryPending)return;
  if(!confirm(`${p.data['氏名']||'この患者'}さんの退院サマリーは電子カルテへの入力が完了しましたか？\n完了の場合、未処理一覧から外します。`))return;
  btn.disabled=true;p.summaryPending=false;p.summaryCompletedAt=nowISO();
  try{await save();renderJournalPreview()}catch(e){p.summaryPending=true;p.summaryCompletedAt=null;btn.disabled=false;alert('保存できませんでした：'+e.message)}
 });
}
// Admission queue uses real encrypted patient records; no automatic OCR registration.
let journalEntryOpen=false,journalScanImage=null,journalScanText='',journalScanStatus='';
function renderJournalPreview(){
  const admissions=state.patients.filter(p=>!p.dischargeDate&&p.journalAdmissionPending&&!isMappedBed(p.data?.['ベッド番号'])).sort((a,b)=>String(a.data['入院日']||'').localeCompare(String(b.data['入院日']||'')));
  const entry=`<div class="journal-entry"><h3>新しい患者を手入力</h3><div class="journal-entry-fields"><label>氏名<input id="journalNewName" type="text" autocomplete="off" placeholder="氏名を入力"></label><label>入院日<input id="journalNewDate" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></label><label>ベッド配置先<button class="btn secondary journal-pick" id="journalNewBedPick" type="button">その他・未配置 ▾</button><input type="hidden" id="journalNewBed" value=""></label></div><div class="journal-entry-actions"><button type="button" class="btn secondary" id="journalCancel">キャンセル</button><button type="button" class="btn" id="journalAdd">一覧に追加</button></div></div>`;
  $('#main').innerHTML=`<div class="hero"><div><h1>日誌・患者情報取り込み</h1><p>架空患者専用 Ver.${APP_VERSION} ／ 入院患者の手入力と配置</p></div></div>
  <div class="panel journal-warning"><b>手入力患者は実際の患者管理データに保存されます</b><p>写真の文字認識は未実装です。必ず架空のテスト患者を使い、事前にバックアップしてください。既存患者と同姓同名の場合は追加前に確認します。</p><label class="btn secondary journal-photo">📷 日誌の写真を選択・撮影<input type="file" id="journalPhoto" accept="image/*" style="display:none"></label><div id="journalPhotoInfo" class="notice"></div><div id="journalScanPreview"></div></div>
  <div class="panel"><h2>① 入院患者一覧　${admissions.length}名</h2><p class="notice">未配置の患者はここに残ります。ベッドへの配置が完了すると一覧から外れます。</p><div class="journal-table-wrap"><table class="journal-table"><thead><tr><th>氏名</th><th>入院日</th><th>現在地</th><th>配置先</th></tr></thead><tbody>${admissions.map(p=>`<tr><td>${esc(p.data['氏名']||'氏名未入力')}</td><td>${esc(p.data['入院日']||'')}</td><td>${esc(p.data['ベッド番号']||'未配置')}</td><td><button type="button" class="btn secondary journal-bed-btn" data-id="${esc(p.id)}">部屋選択</button></td></tr>`).join('')||'<tr><td colspan="4">ベッド配置待ちの患者はいません</td></tr>'}</tbody></table></div><button type="button" class="btn secondary journal-add-toggle" id="journalEntryToggle">${journalEntryOpen?'− 手入力を閉じる':'＋ 患者を手入力'}</button>${journalEntryOpen?entry:''}</div>
  ${renderPendingDischarges()}`;
  bindPendingDischarges();
  $$('.journal-bed-btn').forEach(btn=>btn.onclick=()=>{
   const p=state.patients.find(x=>x.id===btn.dataset.id);if(!p||p.dischargeDate)return;
   showGroupedBedPicker(p.data['ベッド番号']||'',async value=>{
    const oldBed=p.data['ベッド番号'],oldPending=p.journalAdmissionPending;
    if(value){const occupied=activePatients().filter(x=>x.id!==p.id&&normalizeBed(x.data['ベッド番号'])===normalizeBed(value));if(occupied.length&&!confirm(`このベッドにはすでに${occupied.length}名登録されています。重複配置しますか？`))return;}
    if(!confirm(`${p.data['氏名']||'患者'}さんを ${value||'その他・未配置'} に配置しますか？`))return;
    p.data['ベッド番号']=value;p.journalAdmissionPending=!value;p.updatedAt=nowISO();
    try{await save();renderJournalPreview()}catch(e){p.data['ベッド番号']=oldBed;p.journalAdmissionPending=oldPending;alert('保存できませんでした：'+e.message)}
   });
  });
  $('#journalEntryToggle').onclick=()=>{journalEntryOpen=!journalEntryOpen;renderJournalPreview()};
  if(journalEntryOpen){
    $('#journalNewBedPick').onclick=()=>showGroupedBedPicker($('#journalNewBed').value,value=>{$('#journalNewBed').value=value;$('#journalNewBedPick').textContent=(value||'その他・未配置')+' ▾'});
    $('#journalCancel').onclick=()=>{journalEntryOpen=false;renderJournalPreview()};
    $('#journalAdd').onclick=async()=>{
     const name=$('#journalNewName').value.trim(),date=$('#journalNewDate').value,bed=$('#journalNewBed').value;
     if(!name||!date){alert('氏名と入院日を入力してください。');return}
     const matches=state.patients.filter(p=>!p.dischargeDate&&String(p.data['氏名']||'').replace(/\s/g,'')===name.replace(/\s/g,''));
     if(matches.length&&!confirm(`同じ氏名の入院患者が${matches.length}名います。既存患者を確認しましたか？\nそれでも新しく登録しますか？`))return;
     if(bed){const occupied=activePatients().filter(p=>normalizeBed(p.data['ベッド番号'])===normalizeBed(bed));if(occupied.length&&!confirm(`選択したベッドにはすでに${occupied.length}名登録されています。重複配置しますか？`))return;}
     const btn=$('#journalAdd');btn.disabled=true;
     const p=newPatient(bed);p.data['氏名']=name;p.data['入院日']=date;p.journalAdmissionPending=!bed;delete p._new;
     state.patients.push(p);
     try{await save();journalEntryOpen=false;renderJournalPreview()}catch(e){state.patients=state.patients.filter(x=>x!==p);btn.disabled=false;alert('登録できませんでした：'+e.message)}
    };
  }
  const preview=$('#journalScanPreview');
  const paintScan=()=>{preview.innerHTML=journalScanImage?`<div class="journal-scan-preview"><img src="${journalScanImage}" alt="選択した日誌写真"><p class="notice">画像はこの画面内で表示するだけです。患者データには保存しません。</p><button type="button" class="btn secondary" id="journalTryOCR">この端末で文字認識を試す</button><p class="notice" id="journalOCRStatus">${esc(journalScanStatus)}</p><label>読み取り内容（確認・修正用）<textarea id="journalOCRText" rows="5" placeholder="認識できない場合は架空の内容を手入力して試せます">${esc(journalScanText)}</textarea></label><p class="notice">安全のため、ここに入力した内容は患者一覧に自動反映しません。</p></div>`:'';
    if(!journalScanImage)return;
    $('#journalOCRText').oninput=e=>{journalScanText=e.target.value};
    $('#journalTryOCR').onclick=async()=>{const status=$('#journalOCRStatus');if(!('TextDetector' in window)){status.textContent='このブラウザには文字認識機能がありません。iPad mini向けのオフライン日本語OCRエンジンは未搭載です。';return}status.textContent='端末の文字認識機能を確認中…';try{const detector=new window.TextDetector();const img=preview.querySelector('img');const lines=await detector.detect(img);journalScanText=lines.map(x=>x.rawValue||'').join('\n');$('#journalOCRText').value=journalScanText;status.textContent=journalScanText?'認識候補を表示しました。内容を必ず確認してください。':'文字を検出できませんでした。'}catch(err){status.textContent='この端末では文字認識を実行できませんでした：'+String(err.message||err)}};
  };
  paintScan();
  $('#journalPhoto').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')){$('#journalPhotoInfo').textContent='画像ファイルを選択してください。';return}if(f.size>15*1024*1024){$('#journalPhotoInfo').textContent='15MB以下の画像を選んでください。';return}const reader=new FileReader();reader.onload=()=>{journalScanImage=reader.result;journalScanText='';journalScanStatus='写真を読み込みました。文字認識の可否を確認できます。';$('#journalPhotoInfo').textContent='選択した写真：'+f.name;paintScan()};reader.readAsDataURL(f)};
}
