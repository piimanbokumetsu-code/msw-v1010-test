'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const enc=new TextEncoder(), dec=new TextDecoder();
const DB_NAME='msw_rx_fake_20261027_v035', STORE='kv'; // Separate, draft-only database; never touch installed MVP01 data.
let db=null,key=null,state=null,meta=null,screen='patients',selectedPatient=null,activeTab='basic',lockTimer=null;
let sanThereseOnly=false; // Volatile list-view filter only; patient flags are stored in encrypted state.
const APP_VERSION='RX-FAKE-20261028-V039';
// LIMITED OPERATIONAL PILOT. Clinical authorization is determined by employer and operator, not by this program.
// Patient data must never be uploaded to ChatGPT or GitHub. Local encryption does not replace institutional controls.
const DEPLOYMENT_POLICY=Object.freeze({
  origin:'https://piimanbokumetsu-code.github.io',
  basePath:'/msw-v1010-test/drug-stage-20261027-v035/',
  releaseCandidate:true
});
function deploymentLocationAllowed(loc){
  if(!DEPLOYMENT_POLICY.releaseCandidate)return false;
  if(!loc || loc.origin!==DEPLOYMENT_POLICY.origin)return false;
  const path=loc.pathname;
  return path===DEPLOYMENT_POLICY.basePath || path===DEPLOYMENT_POLICY.basePath+'index.html';
}


// Data minimization policy for structured fields. This is NOT a content scanner:
// notes, tasks, arbitrary text, uploaded images and exported PDFs still need
// operator review before storage. Legacy attachment filenames are normalized. Keep FileMaker 番号 and hospital ＩＤ intact.
function isProhibitedContactField(field){
  const normalized=String(field??'').normalize('NFKC').toLowerCase().replace(/[\s_\-]/g,'');
  return /住所|所在地|電話|携帯|連絡先|郵便|メール|fax|tel|phone|mobile|address|email|postal|zipcode|zip/.test(normalized);
}
function removeProhibitedContactFieldsFromState(candidate){
  let removed=0,nonempty=0;
  for(const patient of candidate?.patients||[]){
    if(!patient||typeof patient!=='object')continue;
    if(patient.data&&typeof patient.data==='object'){
      for(const f of Object.keys(patient.data)){
        if(!isProhibitedContactField(f))continue;
        if(String(patient.data[f]??'').trim())nonempty++;
        delete patient.data[f];removed++;
      }
    }
    // Legacy backups may contain an original photo filename with a patient's
    // address, telephone number or email in it. Preserve only the metadata
    // the photo viewer actually uses; original filenames are not required.
    const safePhotoKeys=new Set(['id','type','name','addedAt','order']);
    for(const photo of Array.isArray(patient.attachments)?patient.attachments:[]){
      if(!photo||typeof photo!=='object')continue;
      for(const attr of Object.keys(photo)){
        if(safePhotoKeys.has(attr))continue;
        if(String(photo[attr]??'').trim())nonempty++;
        delete photo[attr];removed++;
      }
      const generic=photo.type==='genogram'?'ジェノグラム画像':'入院時画像';
      if(photo.name!==generic){
        if(typeof photo.name==='string'&&photo.name.trim()){
          nonempty++;removed++;
        }
        photo.name=generic;
      }
    }
  }
  if(candidate?.masters&&typeof candidate.masters==='object'){
    for(const f of Object.keys(candidate.masters)){
      if(!isProhibitedContactField(f))continue;
      const entries=candidate.masters[f];
      if(Array.isArray(entries)&&entries.some(x=>String(x??'').trim()))nonempty++;
      delete candidate.masters[f];removed++;
    }
  }
  return {removed,nonempty};
}
const DATA_MINIMIZATION_NOTICE='住所は市町村名のみ。番地・電話番号・連絡先は登録しません。自由記述や写真に含まれる情報は自動除去できません。';

const masterFields=['ベッド番号','市町村','主治医','病名','保険','本人職業','術式','入院元','かかりつけ','家構','KP職業','介護度','入院時介護度','介護連携','ケアマネ・施設','検討会','退院支援','食事','食事：介助量','水分：トロミ','排泄','排泄：介助量','排泄：尿便意','排泄：利用','移乗','移動器具','睡眠','睡眠：薬剤','高次脳','問題行動','スケール','リハ状況','DM注','コール'];
const defaultMasters={
  '市町村':['茨城町','水戸市','小美玉市','笠間市','鉾田市'],
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
// Only a deliberate master registration may add values to these three
// lists. A patient's text, OCR/CSV imported value or changed status must
// not silently add a shared pick-list item.
const EXPLICIT_ONLY_MASTER_FIELDS=new Set(['市町村','主治医','介護度']);
function ensureStateSchema(target=state){
  if(!target)return;
  target.version=APP_VERSION;
  target.masters??={};
  for(const [k,vals] of Object.entries(defaultMasters)) target.masters[k]=uniq([...(target.masters[k]||[]),...vals]);
  for(const f of masterFields){
    if(f==='ベッド番号'||EXPLICIT_ONLY_MASTER_FIELDS.has(f))continue;
    const fromPatients=(target.patients||[]).map(p=>String(p.data?.[f]??'').trim()).filter(Boolean);
    target.masters[f]=uniq([...(target.masters[f]||[]),...fromPatients]);
  }
}
function uniq(a){return [...new Set(a.map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));}
function officialBeds(){return [...BED_LAYOUT,...ICU_LAYOUT].flatMap(r=>r.beds.map(n=>bedKey(r.room,n)))}
const ORDERABLE_MASTER_FIELDS=new Set(['介護度','市町村','主治医']);
function applyMasterDisplayOrder(f,values,order){
  const available=uniq(values),allowed=new Set(available),seen=new Set(),out=[];
  for(const entry of Array.isArray(order)?order:[]){
    const v=String(entry??'').trim();
    if(allowed.has(v)&&!seen.has(v)){seen.add(v);out.push(v)}
  }
  for(const v of available)if(!seen.has(v)){seen.add(v);out.push(v)}
  return out;
}
function masterValues(f,current=''){
  if(f==='ベッド番号')return officialBeds();
  ensureStateSchema();
  const values=uniq([...(state.masters?.[f]||[]),...(current?[current]:[])]);
  if(!ORDERABLE_MASTER_FIELDS.has(f))return values;
  const saved=state.masterOrder?.[f];
  return applyMasterDisplayOrder(f,values,Array.isArray(saved)?saved:f==='介護度'?defaultMasters['介護度']:[]);
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
    const previous=state.masters[f]||[];
    state.masters[f]=uniq([...previous,v]);
    try{await save();}
    catch(e){
      state.masters[f]=previous;
      el.value='';
      alert('新しい入力候補を保存できませんでした。元の候補を保持しています：'+(e.message||e));
      return;
    }
    const addOpt=[...el.options].find(o=>o.value==='__add__');
    const o=document.createElement('option');o.value=v;o.textContent=v;el.insertBefore(o,addOpt);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

const legacyFields=['ADL調査日','DM注','ＩＤ','KP','KP職業','KP年齢','MMT右下','MMT右上','MMT左下','MMT左上','かかりつけ','ケアマネ・施設','コール','スケール','スケール：点数','ベッド番号','リハ状況','移乗','移動器具','家屋','家構','介護度','介護連携','介護情報','検討会','高次脳','氏名','主治医','術式','食事','食事：介助量','水分：トロミ','睡眠','睡眠：薬剤','退院支援','調査日','入院元','入院時介護度','入院日','入院日数','排泄','排泄：介助量','排泄：尿便意','排泄：利用','番号','備考','病名','保険','本人職業','問題行動'];
const groups={
  basic:['ベッド番号','ＩＤ','氏名','入院日','主治医','病名','保険','本人職業','術式','入院元','かかりつけ','家構'],
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
// One IndexedDB transaction removes the encrypted index, authentication metadata,
// every encrypted photo, and any auxiliary keys. Failure leaves the DB unchanged.
function idbClearAll(){return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||new Error('全消去に失敗しました'));
  tx.onabort=()=>reject(tx.error||new Error('全消去が中断されました'));
  tx.objectStore(STORE).clear();
})}
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
// Only patient-index writes use this wrapper. Photos and authentication metadata
// have distinct schemas and must not be altered by the structured-field policy.
async function encryptPatientIndex(target,k=key){
  const minimal=JSON.parse(JSON.stringify(target));
  removeProhibitedContactFieldsFromState(minimal);
  return encryptObj(minimal,k);
}
async function decryptObj(blob,k=key){const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},k,unb64(blob.ct));return JSON.parse(dec.decode(pt))}
// Keep normal encrypted patient-index writes in order. An earlier slow encryption
// must never overwrite a more recent edit.
let dataWriteTail=Promise.resolve(), resetInProgress=false;
// Prevent admin-level destructive operations from overlapping one another,
// patient edits, photo writes, CSV migration or auto-lock.  The privacy curtain
// still covers the page immediately when iPadOS backgrounds Safari.
let maintenanceAction=null,maintenanceDone=Promise.resolve(),maintenanceRelease=null;
function maintenanceBusyReason({allowCsv=false,allowDrugCsv=false}={}){
  if(maintenanceAction)return '別の管理処理（'+maintenanceAction+'）が進行中です。';
  if(selectedPatient)return '患者編集画面を閉じ、保存完了を確認してください。';
  if((patientCsvBusy&&!allowCsv)||(drugCsvBusy&&!allowDrugCsv)||photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||pdfExportBusy||noteWriteBusy||taskWriteBusy||taskTogglePending.size>0)
    return 'データ・写真の保存処理が進行中です。';
  return '';
}
async function beginMaintenance(name,{allowCsv=false,allowDrugCsv=false}={}){
  const reason=maintenanceBusyReason({allowCsv,allowDrugCsv});if(reason)throw new Error(reason);
  if(!key||!state)throw new Error('ロック中のため実行できません。');
  maintenanceAction=name;
  maintenanceDone=new Promise(resolve=>{maintenanceRelease=resolve});
  try{
    await dataWriteTail;
    if(!key||!state)throw new Error('ロック状態が変わりました。');
    // Guard re-entrancy even after an asynchronous write is finished.
    if(selectedPatient||(patientCsvBusy&&!allowCsv)||(drugCsvBusy&&!allowDrugCsv)||photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||pdfExportBusy||noteWriteBusy||taskWriteBusy||taskTogglePending.size)
      throw new Error('別の操作が始まったため中止しました。');
  }catch(e){endMaintenance(name);throw e}
}
function endMaintenance(name){
  if(maintenanceAction!==name)return;
  maintenanceAction=null;
  const release=maintenanceRelease;maintenanceRelease=null;
  if(release)release();
}

function orderedDataWrite(work){
  const next=dataWriteTail.then(work);
  dataWriteTail=next.catch(()=>{}); // A failed write must not block later retries.
  return next;
}
async function save(){
  if(resetInProgress||maintenanceAction)throw new Error('データ管理処理中は保存できません');
  if(!key||!state)throw new Error('ロック中のため保存できません');
  state.updatedAt=nowISO();
  const activeKey=key, fallbackState=state;
  return orderedDataWrite(async()=>{
    // Snapshot when our turn in the queue arrives: a photo operation may have
    // updated attachment metadata since save() was requested.
    const current=key===activeKey&&state?state:fallbackState;
    removeProhibitedContactFieldsFromState(current);
    await idbSet('data',await encryptPatientIndex(current,activeKey));
    if(key===activeKey)resetAutoLock();
  });
}
function blankState(){
 const examples=[
  {bed:'',name:'架空入院テストA',id:'DEMO-C01',city:'水戸市',pending:true,meeting:false},
  {bed:'201-1',name:'架空検討会テストB',id:'DEMO-C02',city:'茨城町',pending:false,meeting:true},
  {bed:'202-1',name:'架空印刷テストC',id:'DEMO-C03',city:'ひたちなか市',pending:false,meeting:false},
  {bed:'',name:'架空未配置テストD',id:'DEMO-C04',city:'かすみがうら市',pending:false,meeting:false},
  {bed:'201-3',name:'架空旧欄テストE',id:'DEMO-C05',city:'笠間市',pending:false,meeting:false}
 ];
 const patients=examples.map(x=>{
  const p=newPatient(x.bed);
  delete p._new;
  Object.assign(p.data,{
   '氏名':x.name,'ＩＤ':x.id,'市町村':x.city,'入院日':'2026-10-27',
   '病名':x.name==='架空印刷テストC'?'大腿骨頸部骨折術後、慢性心不全および誤嚥性肺炎に対する継続的な治療と生活支援の調整':'架空検証用の病名',
   '介護情報':x.name==='架空印刷テストC'?'地域包括支援センター担当ケアマネージャー架空担当者と老健入所準備を進めている。家族と長期調整中。':'',
   'ケアマネ・施設':x.name==='架空旧欄テストE'?'旧欄のケアマネ・施設情報が空欄でも印刷できることを検証する':''
  });
  p.journalAdmissionPending=x.pending;
  p.sanThereseMeeting=x.meeting;
  return p;
 });
 const drugSamples=[
  {'薬名':'架空処方A','医薬品分類':'架空分類','薬価':'100mg(34.30)','薬効':'架空の薬効\n後発品⇒架空後発品B'},
  {'薬名':'架空参照候補B','医薬品分類':'架空分類','薬価':'100mg(21.20)','薬効':'架空の薬効・比較候補'},
  {'薬名':'架空別規格C','医薬品分類':'架空分類','薬価':'50mg(17.00)','薬効':'別規格の架空薬情'}
 ];
 patients[0].medications=[
  {id:uid(),drug:{...drugSamples[0]},pricing:{strength:'100mg',unitPrice:'34.30',unit:'錠',dailyQuantity:'3',status:'定期'},addedAt:nowISO()},
  {id:uid(),drug:{'薬名':'架空頓服D','医薬品分類':'架空分類','薬価':'10mg(9.00)','薬効':'架空の頓服'},pricing:{strength:'10mg',unitPrice:'9.00',unit:'錠',dailyQuantity:'2',status:'頓服'},addedAt:nowISO()}
 ];
 return {version:APP_VERSION,patients,drugs:drugSamples,masters:{},settings:{retentionDays:null,autoLockMin:5,lastBackupAt:null},createdAt:nowISO(),updatedAt:nowISO()};
}
async function init(){
  // Fail closed before opening IndexedDB unless the exact dedicated release URL matches.
  // URL checks alone DO NOT prove that the host or running code is trustworthy.
  if(!deploymentLocationAllowed(location)){
    document.getElementById('app').textContent =
      '専用配信URLと一致しないため、保存領域を開かず起動を停止しました。';
    return;
  }
  if(typeof isSecureContext==='boolean'&&!isSecureContext){
    document.getElementById('app').textContent='HTTPSの安全な接続が必要です。';
    return;
  }
  await openDB();meta=await idbGet('meta');/* No SW registration in this fake-only clinical source verification. */try{if(navigator.storage?.persist)await navigator.storage.persist()}catch(e){}renderLock()}
function renderLock(msg=''){document.getElementById('morningPrint')?.remove();const fresh=!meta;$('#app').innerHTML=`<div class="lockwrap"><div class="lockcard"><h1>MSW患者管理</h1><p style="font-weight:700">架空データ専用 Ver.${APP_VERSION}</p><p>${fresh?'【初回登録】この画面はロック解除ではありません。新しい検証版専用の暗証を2回入力して登録してください。':'暗証を入力してロック解除してください。'}</p>${msg?`<div class="alert">${esc(msg)}</div>`:''}<form id="authForm" autocomplete="on"><input type="text" name="username" autocomplete="username" value="msw-local" readonly aria-label="ローカルアプリ" style="position:absolute;left:-9999px;width:1px;height:1px" /><input id="pin" name="password" type="password" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="${fresh?'new-password':'current-password'}" placeholder="12文字以上・文字と数字" />${fresh?'<input id="pinConfirm" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="同じ暗証をもう一度入力" aria-label="暗証の確認入力" />':''}${fresh?'<label style="display:block;font-size:13px;line-height:1.5;margin:8px 0 12px"><input id="newRegistrationAck" type="checkbox" style="width:auto;min-height:0;margin-right:6px">新しい暗証を登録する操作であることを確認しました</label>':''}<button class="btn" id="unlock" type="submit" style="width:100%">${fresh?'2回入力を確認して新規登録':'ロック解除'}</button></form><p class="notice">この画面は過去のテスト版と異なる専用保存領域を使います。勤務先が許可した端末のみで使用し、氏名・病名など業務に必要な情報だけ登録してください。氏名・病名は登録できますが、住所・電話番号・連絡先の専用項目は保存しません。端末内で暗号化して保存します。暗証を忘れると復旧できません。端末が対応していればiPadのパスワード自動入力を利用できます（利用可否は端末環境によります）。端末自体のパスコード・紛失対策も必ず有効にしてください。</p></div></div>`;$('#authForm').onsubmit=e=>{e.preventDefault();void (fresh?setup():unlock());};setTimeout(()=>$('#pin').focus(),80)}
function strongNewPin(pin){return typeof pin==='string'&&pin.length>=12&&/[0-9]/.test(pin)&&/\p{L}/u.test(pin)}
let setupInProgress=false;
async function setup(){
  if(setupInProgress)return;
  const pin=$('#pin').value;
  if(!strongNewPin(pin))return renderLock('暗証は12文字以上で、数字と文字を組み合わせてください。');
  if(pin!==document.querySelector('#pinConfirm')?.value)return renderLock('確認入力の暗証が一致しません。もう一度入力してください。');
  if(!document.querySelector('#newRegistrationAck')?.checked)return renderLock('新規登録であることを確認するチェックを入れてください。');
  if(!confirm('これは暗証番号の新規登録です。入力した暗証を手元に控えたことを確認してから「OK」を押してください。'))return;
  setupInProgress=true;
  const submitButton=document.querySelector('#unlock'); if(submitButton)submitButton.disabled=true;
  try{
    // Missing authentication metadata must never silently orphan old encrypted photos.
    // Reject *any* pre-existing record before generating new authentication keys.
    if((await idbKeys()).length)throw new Error('認証情報がない一方、既存の保存データが残っています。初期設定を中止しました。');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const freshKey=await derive(pin,salt);
    const freshState=blankState();ensureStateSchema(freshState);
    const freshMeta={version:1,salt:b64(salt),check:await encryptObj({ok:true},freshKey),createdAt:nowISO()};
    // Meta and ciphertext are committed in one IndexedDB transaction.
    await idbSetMany([['meta',freshMeta],['data',await encryptPatientIndex(freshState,freshKey)]]);
    key=freshKey;meta=freshMeta;state=freshState;ensureStateSchema();
    render();
  }catch(e){key=null;meta=null;state=null;renderLock('初回設定を完了できませんでした：'+(e.message||'保存領域を確認してください。'))}
  finally{setupInProgress=false;}
}
async function unlock(){
  if(Number(meta?.lockUntil||0)>Date.now())return renderLock('暗証の入力を一時的に制限しています。15分後に再度お試しください。');
  const pin=$('#pin').value;
  try{
    key=await derive(pin,unb64(meta.salt));
    await decryptObj(meta.check);
  }catch(e){
    key=null;
    const attempts=Math.max(0,Number(meta?.failedAttempts)||0)+1;
    const locked=attempts>=5;
    const nextMeta={...meta,failedAttempts:locked?0:attempts,lockUntil:locked?Date.now()+15*60000:0};
    try{await idbSet('meta',nextMeta);meta=nextMeta}
    catch(_){return renderLock('認証試行の保存に失敗したため、ロックを解除できません。')}
    return renderLock(locked?'暗証の入力を15分間制限します。':'暗証が違います。');
  }
  // Separate authentication errors from storage errors. Never misreport a
  // failed patient-index read or write as an incorrect PIN.
  try{
    const blob=await idbGet('data');
    if(!blob)throw new Error('暗号化患者データが存在しません');
    state=await decryptObj(blob);
    if(!state||!Array.isArray(state.patients))throw new Error('患者データの形式が不正です');
    const cleared={...meta,failedAttempts:0,lockUntil:0};
    await idbSet('meta',cleared);meta=cleared;
    ensureStateSchema();await save();render();
  }catch(e){
    key=null;state=null;
    renderLock('患者情報を読み込めませんでした。空き容量やデータの状態を確認してください。');
  }
}
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
  await maintenanceDone; // Never forget the active encryption key mid-backup, PIN change, or restore.
  await dataWriteTail; // Give queued photo/data commits time to finish before forgetting the key.
  clearPatientAutoTimer();clearBasicPhotoPreview();dismissPhotoViewer();
  document.querySelectorAll('#modal,#duplicateModal,#groupedBedPicker,#dischargeFlow,#morningPrint').forEach(el=>el.remove());
  key=null;state=null;selectedPatient=null;clearTimeout(lockTimer);
  renderLock(unsaved?'自動ロックしました。ただし直前の編集は保存できていない可能性があります。保存容量を確認してください。':'');
}
function resetAutoLock(){clearTimeout(lockTimer);if(!state)return;lockTimer=setTimeout(()=>lock(true),(state.settings.autoLockMin||5)*60000)}
['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(key)resetAutoLock()},{passive:true}));
// Safari pauses background timers: hide patient information immediately and
// require the app PIN again after backgrounding. Pending text edits are flushed
// before clearing the key; the curtain stays up until that flush is finished.
let backgroundLockPromise=null;
function secureBackground(){
  if(!key||!state)return;
  document.body.classList.add('msw-private');
  if(backgroundLockPromise)return;
  backgroundLockPromise=lock(true).catch(()=>{
    // Even if a failed write prevents a normal lock, never expose an unlocked UI.
    clearPatientAutoTimer();dismissPhotoViewer();
    document.querySelectorAll('#modal,#duplicateModal,#groupedBedPicker,#dischargeFlow').forEach(el=>el.remove());
    key=null;state=null;selectedPatient=null;renderLock('アプリをロックしました。直前の編集が保存されたかご確認ください。');
  }).finally(()=>{
    backgroundLockPromise=null;
    if(document.visibilityState==='visible')document.body.classList.remove('msw-private');
  });
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')secureBackground();
  else if(backgroundLockPromise)void backgroundLockPromise.finally(()=>document.body.classList.remove('msw-private'));
  else if(key&&state)secureBackground(); // return from a suspended, unfinished lock
  else document.body.classList.remove('msw-private');
});
window.addEventListener('msw-pwa-update-available',()=>{if(key&&state&&!selectedPatient&&!patientCsvBusy)render();});
window.addEventListener('pagehide',secureBackground);
window.addEventListener('pageshow',()=>{
  if(document.body.classList.contains('msw-private')&&document.visibilityState==='visible'){
    if(backgroundLockPromise)void backgroundLockPromise.finally(()=>document.body.classList.remove('msw-private'));
    else if(key&&state)secureBackground();
    else document.body.classList.remove('msw-private');
  }
});
// Ver.1.0.17: archived patient records are never deleted automatically.
// No periodic backup deadline for a short-stay acute-care workflow.
// A manual encrypted export remains available under Settings when truly needed.
async function applySafePwaUpdate(){
  if(!window.MSW_PWA_UPDATE_PENDING)return;
  if(selectedPatient||patientCsvBusy||photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||noteWriteBusy||taskWriteBusy||taskTogglePending.size>0||restoreBusy||backupBusy||resetInProgress||maintenanceAction){
    alert('患者の編集画面を閉じ、保存・移行処理が終わってから更新してください。');return;
  }
  if(!confirm('入力中の画面がないことを確認しました。アプリをロックして最新版を再読み込みしますか？'))return;
  try{
    await dataWriteTail;
    if(selectedPatient||patientCsvBusy||photoImportBusy||noteWriteBusy||taskWriteBusy)throw new Error('別の操作が始まりました');
    await lock(false);
    if(key||state)throw new Error('ロックできませんでした。');
    // Allow the new service worker to take over only after the user confirms
    // and patient data has been locked. On a pending update, do not reload
    // before controllerchange; that could bring back the old cached shell.
    const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration(new URL('./',location.href).href) : null;
    if(reg?.waiting){
      await new Promise((resolve,reject)=>{
        let done=false;
        const worker=reg.waiting;
        const cleanup=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed)};
        const changed=()=>{if(done)return;done=true;cleanup();resolve()};
        const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('更新の有効化が時間内に完了しませんでした。再度お試しください。'))},12000);
        navigator.serviceWorker.addEventListener('controllerchange',changed);
        worker.postMessage({type:'SKIP_WAITING'});
      });
    }
    window.MSW_PWA_UPDATE_PENDING=false;
    location.reload();
  }catch(e){alert('アプリを更新できません：'+(e.message||e))}
}
function render(){resetAutoLock();const net=navigator.onLine?'通信あり':'通信なし';$('#app').innerHTML=`<div class="shell"><header class="topbar"><div class="brand">MSW患者管理</div><span class="pill">架空データ専用 Ver.${APP_VERSION}</span><span class="pill">${net}</span>${window.MSW_PWA_UPDATE_PENDING?'<button class="pill" id="safeUpdateBtn" type="button">更新可能</button>':''}<div class="spacer"></div><button class="pill" id="lockBtn">🔒</button></header><main class="content" id="main"></main><nav class="bottomnav"><button class="navbtn ${(screen==='patients'||screen==='archive')?'active':''}" data-screen="patients"><span class="ico">🏥</span>患者</button><button class="navbtn ${screen==='journal'?'active':''}" data-screen="journal"><span class="ico">📄</span>日誌</button><button class="navbtn ${screen==='tasks'?'active':''}" data-screen="tasks"><span class="ico">✅</span>今日・要対応</button><button class="navbtn ${screen==='drugs'?'active':''}" data-screen="drugs"><span class="ico">💊</span>薬情</button><button class="navbtn ${screen==='masters'?'active':''}" data-screen="masters"><span class="ico">📋</span>マスター</button><button class="navbtn ${screen==='settings'?'active':''}" data-screen="settings"><span class="ico">⚙️</span>設定</button></nav></div>`;$('#lockBtn').onclick=()=>lock(false);if($('#safeUpdateBtn'))$('#safeUpdateBtn').onclick=applySafePwaUpdate;$$('.navbtn').forEach(b=>b.onclick=()=>{screen=b.dataset.screen;render()});({patients:renderPatients,archive:renderArchive,journal:renderJournalPreview,tasks:renderTasks,drugs:renderDrugs,masters:renderMasters,settings:renderSettings}[screen])()}
function activePatients(){return state.patients.filter(p=>!p.dischargeDate)}
function getStatus(p){return p.status||'未設定'}
function statusTag(s){const c=s.includes('要')?'red':s.includes('決定')?'green':s.includes('施設')?'purple':s==='未設定'?'':'orange';return `<span class="tag ${c}">${esc(s)}</span>`}
function sanThereseTargets(){return activePatients().filter(p=>p.sanThereseMeeting===true)}
function renderPatients(){
  const ps=activePatients(),targets=sanThereseTargets();
  $('#main').innerHTML=`<div class="hero"><div><h1>入院患者</h1><p>在院患者を管理します。退院確定後の患者は「退院患者記録」から確認できます。</p></div><div class="spacer"></div><button class="btn secondary" id="openArchive">退院患者記録</button><button class="btn" id="newP">＋患者</button></div><div class="kpis"><div class="kpi"><b>${ps.length}</b><span>在院患者</span></div><div class="kpi"><b>${ps.filter(p=>p.tasks?.some(t=>!t.done)).length}</b><span>要対応あり</span></div><div class="kpi"><b>${ps.filter(p=>getStatus(p).includes('施設')).length}</b><span>施設調整中</span></div><div class="kpi"><b>${ps.filter(p=>getStatus(p).includes('決定')).length}</b><span>退院先決定</span></div></div><div class="santherese-nav" role="group" aria-label="患者一覧の切り替え"><button type="button" class="btn secondary ${sanThereseOnly?'':'is-selected'}" id="showAllPatients" aria-pressed="${!sanThereseOnly}">🏥 全患者のベッドマップ</button><button type="button" class="btn secondary santherese-filter ${sanThereseOnly?'is-selected':''}" id="showSanTherese" aria-pressed="${sanThereseOnly}">🟠 サン・テレーズ検討会 ${targets.length}人</button></div><div class="toolbar"><input id="q" placeholder="氏名・病名・病床で検索" aria-label="患者検索"><select id="ward"><option value="">全病棟</option><option value="一般病棟">一般病棟</option><option value="ICU">ICU</option><option value="その他">その他・未配置</option></select><button class="btn secondary" id="print">朝一患者一覧を印刷</button></div><div id="patientList"></div>`;
  $('#openArchive').onclick=()=>{screen='archive';render()};
  $('#newP').onclick=()=>openPatient(newPatient());
  $('#print').onclick=printMorningList;
  $('#q').oninput=drawPatientList;
  $('#ward').onchange=drawPatientList;
  $('#showAllPatients').onclick=()=>{sanThereseOnly=false;renderPatients()};
  $('#showSanTherese').onclick=()=>{sanThereseOnly=true;renderPatients()};
  drawPatientList();
}
function printText(v,max=0){const a=Array.from(String(v??'').trim());return esc(max?a.slice(0,max).join(''):a.join(''))}
function shortCareLevel(v){const s=String(v||'').trim();return s.replace('要介護','要').replace('要支援','支')}
function printPatientForBed(bed,patients){return patientsForBed(bed,patients)[0]||null}
// Morning print: municipality is an existing privacy-limited field.
// Do not add an address field or read an obsolete full-address field.
function printMunicipality(p){return printText(p?.data?.['市町村'],3)}
// The approved Basic tab uses 介護情報; retain the legacy care-tab field as fallback.
function printCareManager(p){
 const d=p?.data||{};
 return String(d['介護情報']??'').trim()||String(d['ケアマネ・施設']??'').trim();
}
function printRoomName(bed){
 const str=normalizeBed(bed);
 const m=str.match(/^(ICU[1-3]|\d{3})(?:-|$)/);
 return m?m[1]:str;
}
function printRowHtml(bed,patients,rowClass=''){
 const p=printPatientForBed(bed,patients);
 const attr=rowClass?' class="'+esc(rowClass)+'"':'';
 if(!p)return '<tr'+attr+'><td>'+esc(bed)+'</td>'+'<td></td>'.repeat(11)+'</tr>';
 const d=p.data||{},days=daysSince(d['入院日'])||d['入院日数']||'';
 return '<tr'+attr+'><td>'+esc(bed)+'</td>'+
  '<td'+(p.sanThereseMeeting===true?' class="saint-id"':'')+'>'+printText(d['ＩＤ'])+'</td>'+
  '<td>'+printText(d['氏名'])+'</td>'+
  '<td>'+esc(shortAdmissionDate(d['入院日']))+'</td>'+
  '<td>'+printText(d['主治医'],3)+'</td>'+
  '<td>'+printMunicipality(p)+'</td>'+
  '<td class="disease-cell"><span class="disease-text">'+printText(d['病名'])+'</span></td>'+
  '<td>'+esc(shortCareLevel(d['介護度']))+'</td>'+
  '<td class="facility-cell"><span class="facility-text">'+printText(printCareManager(p))+'</span></td>'+
  '<td class="memo"></td><td>'+printText(d['家構'])+'</td><td>'+esc(days)+'</td></tr>';
}
function printTableHtml(beds,patients){
 const rows=beds.map((bed,i)=>{
  const room=printRoomName(bed),first=i===0||printRoomName(beds[i-1])!==room;
  const last=i===beds.length-1||printRoomName(beds[i+1])!==room;
  const gap=first&&i>0?'<tr class="room-gap" aria-hidden="true"><td colspan="12"></td></tr>':'';
  const flags=[first?'room-first':'',last?'room-last':''].filter(Boolean).join(' ');
  return gap+printRowHtml(bed,patients,flags);
 }).join('');
 const cols=['bed','id','name','admit','doc','address','disease','care','facility','memo','family','days'];
 const headers=['部屋','ID','氏名','入院日','主治医','住所','病名','介護度','ケアマネ・施設','メモ','家族','日数'];
 return '<table class="morning-table"><colgroup>'+cols.map(c=>'<col class="c-'+c+'">').join('')+
  '</colgroup><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
}
function printExtraTableHtml(patients){
 const cols=['bed','id','name','admit','doc','address','disease','care','facility','memo','family','days'];
 const headers=['部屋','ID','氏名','入院日','主治医','住所','病名','介護度','ケアマネ・施設','メモ','家族','日数'];
 const rows=patients.map(p=>{
  const d=p.data||{},days=daysSince(d['入院日'])||d['入院日数']||'';
  const cells=[d['ベッド番号']||'未配置',d['ＩＤ'],d['氏名'],
   shortAdmissionDate(d['入院日']),String(d['主治医']||'').slice(0,3),
   String(d['市町村']||'').slice(0,3),d['病名'],shortCareLevel(d['介護度']),
   printCareManager(p),'',d['家構'],days];
  const row=cells.map((v,i)=>{
   const klass=i===1&&p.sanThereseMeeting===true?' class="saint-id"':
    i===6?' class="disease-cell"':i===8?' class="facility-cell"':'';
   const content=i===6?'<span class="disease-text">'+printText(v)+'</span>':
    i===8?'<span class="facility-text">'+printText(v)+'</span>':printText(v);
   return '<td'+klass+'>'+content+'</td>';
  }).join('');
  return '<tr>'+row+'</tr>';
 }).join('') || '<tr><td colspan="12">現在、未配置・重複の患者はいません</td></tr>';
 return '<table class="morning-table"><colgroup>'+cols.map(c=>'<col class="c-'+c+'">').join('')+
  '</colgroup><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
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
  // Keep four A4 pages even when there are no unplaced or duplicate patients.
  pages.push({ward:'その他・未配置／重複',extra});
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
function drawPatientList(){const q=($('#q')?.value||'').trim().toLowerCase(),w=$('#ward')?.value||'',all=activePatients();const filtered=all.filter(p=>patientMatches(p,q)&&(!w||wardForBed(p.data['ベッド番号'])===w));const root=$('#patientList');if(sanThereseOnly){
    const ps=filtered.filter(p=>p.sanThereseMeeting===true).sort((a,b)=>normalizeBed(a.data['ベッド番号']).localeCompare(normalizeBed(b.data['ベッド番号']),'ja',{numeric:true}));
    root.innerHTML=`<section class="santherese-list"><h2>サン・テレーズ検討会 対象者一覧 <span class="count">${ps.length}人</span></h2>${ps.length?`<div class="santherese-target-grid">${ps.map(p=>`<button type="button" class="santherese-target-card" data-id="${esc(p.id)}"><span class="target-small">サン・テレーズ検討会</span><strong>${esc(p.data['氏名']||'氏名未入力')}</strong><span class="target-small">ベッド：${esc(p.data['ベッド番号']||'未配置')} ／ 主治医：${esc(p.data['主治医']||'—')}</span></button>`).join('')}</div>`:'<div class="empty">対象者はいません。患者の「基本」タブで検討会にチェックを入れてください。</div>'}</section>`;
    root.querySelectorAll('.santherese-target-card').forEach(el=>el.onclick=()=>{const p=state.patients.find(p=>p.id===el.dataset.id);if(p)openPatient(p)});
    return;
  }if(q&&!filtered.length){root.innerHTML='<div class="empty">該当する患者がいません</div>';return}
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
// Display-only patient flags: clinical entries and actual bed assignment remain unchanged.
function patientDisplayFlags(p){
  const data=p?.data||{};
  return {
    idMissing: !String(data['ＩＤ']??'').trim(),
    surveyed: !!String(data['調査日']??'').trim(),
    meeting: p?.sanThereseMeeting===true
  };
}
function patientBedHtml(bed,patients=[]){
  if(!patients.length)return`<button class="bed-slot empty-bed" data-new-bed="${esc(bed)}"><b>${esc(bed)}</b><span>空床</span><small>タップして登録</small></button>`;
  if(patients.length>1)return`<button class="bed-slot occupied-bed duplicate-bed" data-bed="${esc(bed)}"><div class="bed-line"><b>${esc(bed)}</b></div><strong>${patients.length}名重複あり</strong><span>タップして全員を表示</span></button>`;
  const p=patients[0],days=daysSince(p.data['入院日'])||p.data['入院日数']||'',date=shortAdmissionDate(p.data['入院日']),tasks=p.tasks?.filter(t=>!t.done).length||0;
  const flags=patientDisplayFlags(p);
  const classes=[flags.meeting?'santherese-bed':'',flags.surveyed?'surveyed-bed':'',flags.idMissing?'id-missing-bed':''].filter(Boolean).join(' ');
  return`<button class="bed-slot occupied-bed ${classes}" data-id="${esc(p.id)}"><div class="bed-line"><b>${esc(bed)}</b></div>${flags.idMissing?'<span class="id-missing-bed-label">ID未</span>':''}<strong>${esc(p.data['氏名']||'氏名未入力')}</strong><span class="bed-meta admission-line"><span>${date?esc(date):'—'}</span><span class="doctor">${esc(String(p.data['主治医']||'').replace(/医師\s*$/,'').trim()||'—')}</span><span class="days">${days?`${esc(days)}日目`:'—'}</span></span>${flags.meeting?'<span class="santherese-bed-mark">● 検討会</span>':''}<div class="tags">${statusTag(getStatus(p))}${tasks?`<span class="tag red">要対応 ${tasks}</span>`:''}</div></button>`;
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
    const chosen=state.patients.find(p=>p.id===btn.dataset.id);
    showGroupedBedPicker(sel.value,value=>{sel.value=value;btn.textContent=(value||'その他・未配置')+' ▾'},
      {onDischarge:chosen?()=>startDischargeFlow(chosen):undefined});
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
function newPatient(bed=''){const data={};legacyFields.forEach(k=>data[k]='');data['ベッド番号']=bed;return{id:uid(),data,status:'未設定',tasks:[],notes:[],medications:[],dischargeDate:null,createdAt:nowISO(),updatedAt:nowISO(),_new:true}}
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
    if(isProhibitedContactField(f))return;
    if(v==='__add__')return; // A temporary master-registration choice is not patient data.
    if(String(p.data[f]??'')!==String(v)){p.data[f]=v;changed=true}
  });
  const meeting=$('#sanThereseCheck');if(meeting&&Boolean(p.sanThereseMeeting) !== meeting.checked){p.sanThereseMeeting=meeting.checked;changed=true}
  const status=$('#status');if(status&&String(p.status??'')!==status.value){p.status=status.value;changed=true}
  const date=$('#dischargeDate');if(date&&(p.dischargeDate||'')!==date.value){p.dischargeDate=date.value||null;changed=true}
  // Complete the journal admission queue only when the patient is now assigned
  // to an official bed. This flag is saved together with the patient data.
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
  if(!el?.matches?.('[data-field], #status, #dischargeDate, #sanThereseCheck'))return;
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
  return p.sanThereseMeeting===true||(p.tasks||[]).length>0||(p.notes||[]).length>0||
    (p.attachments||[]).length>0||(p.medications||[]).length>0||!!p.dischargeDate||
    (!!p.status&&p.status!=='未設定');
}
async function finishPatientAndNavigate(next,{closing=false}={}){
  if(patientTransitionBusy)return;
  // A photo operation uses an atomic transaction for metadata and encrypted pixels.
  // Do not navigate away while it is still running.
  if(photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||pdfExportBusy||noteWriteBusy||patientMedicationBusy){
    alert('写真・PDFの処理が終わってから画面を切り替えてください。');return;
  }
  if(document.querySelector('#tabbody .patient-med-editor[data-med-dirty="1"]')&&
     !confirm('薬価・規格・数量に未保存の入力があります。保存せずに画面を移動しますか？'))return;
  patientTransitionBusy=true;
  const controls=Array.from(document.querySelectorAll('#modal .sheethead button, #modal .tab'))
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
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><div class="sheethead"><button class="btn secondary" id="closeM">←</button><div class="patient-sheet-title"><h2>${esc(p.data['氏名']||'新規患者')}</h2><div class="notice">${esc(p.data['ベッド番号']||'病床未設定')}　${esc(p.data['病名']||'')}</div></div><div class="spacer"></div><span id="patientSaveStatus" role="status" aria-live="polite" class="patient-save-status">保存済み（自動保存）</span><button class="btn secondary" id="saveP">保存して閉じる</button></div><div class="tabs">${[['basic','基本'],['medications','処方薬'],['care','家族・介護'],['adl','ADL'],['support','退院支援'],['notes','経過記録'],['photos','写真・書類']].map(([k,n])=>`<button class="tab ${activeTab===k?'active':''}" data-tab="${k}">${n}</button>`).join('')}</div><div class="sheetbody" id="tabbody"></div></div></div>`);
  $('#closeM').onclick=()=>finishPatientAndNavigate(closePatient,{closing:true});
  $('#saveP').onclick=()=>finishPatientAndNavigate(closePatient,{closing:true});
  $$('.tab').forEach(t=>t.onclick=()=>finishPatientAndNavigate(()=>{
    activeTab=t.dataset.tab;clearBasicPhotoPreview();$('#modal').remove();renderPatientModal();
  }));
  renderTab();bindPatientAutosave();
}
function closePatient(){clearPatientAutoTimer();clearBasicPhotoPreview();dismissPhotoViewer();selectedPatient=null;$('#modal')?.remove();if(key&&state&&$('#main'))render()}
function renderTab(){const root=$('#tabbody'),p=selectedPatient;if(activeTab==='photos'){renderPhotosTab();return;}if(activeTab==='basic'){renderBasicDashboard();return;}if(activeTab==='medications'){renderPatientMedications();return;}if(groups[activeTab]){root.innerHTML=`<div class="panel"><div class="form-grid">${groups[activeTab].map(fieldHtml).join('')}</div></div>`;bindMasterSelects(root);return}if(activeTab==='support'){root.innerHTML=`<div class="panel"><h3>退院支援</h3><div class="form-grid"><div class="field"><label>進捗ステータス</label>${masterSelectHtml('進捗ステータス',getStatus(p),'id="status"')}</div><div class="field"><label>退院日</label><input type="date" id="dischargeDate" value="${esc(p.dischargeDate||'')}"></div><div class="field span2"><label>退院支援メモ</label><textarea data-field="退院支援">${esc(p.data['退院支援']||'')}</textarea></div></div></div><div class="panel"><h3>要対応タスク</h3><div id="taskList">${taskListHtml(p)}</div><label class="mvp-task-label">対応内容<input id="newTask" maxlength="300" placeholder="例：家族に連絡、施設へ確認"></label><div class="mvp-task-options"><label>対応期限（任意）<input type="date" id="newTaskDue"></label><label class="mvp-urgent"><input type="checkbox" id="newTaskUrgent"> 優先対応</label><button class="btn" id="addTask">＋ タスク追加</button></div><p class="notice">期限を空欄にしたタスクも「要対応」一覧に残ります。</p></div><div class="panel"><button class="btn danger" id="dischargeNow">退院として登録</button><p class="notice">退院患者の情報は自動削除されず、退院患者記録に保持されます。</p></div>`;$('#addTask').onclick=addTask;$('#dischargeNow').onclick=()=>{if(!$('#dischargeDate').value)$('#dischargeDate').value=new Date().toISOString().slice(0,10);$('#status').value='退院先決定';};bindTaskChecks();bindMasterSelects(root);return}if(activeTab==='notes'){root.innerHTML=`<div class="panel"><h3>経過記録を追加</h3><p class="notice">${esc(DATA_MINIMIZATION_NOTICE)}</p><div class="form-grid"><div class="field"><label>種別</label>${masterSelectHtml('経過記録種別','面談','id="noteType"')}</div><div class="field"><label>日時</label><input id="noteAt" type="datetime-local" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></div><div class="field span2"><label>内容</label><textarea id="noteText" placeholder="対応内容・決定事項・次にやること"></textarea></div></div><button class="btn" id="addNote">記録追加</button><p id="noteSaveState" class="notice" role="status" aria-live="polite"></p></div><div class="panel"><h3>時系列</h3><div class="timeline">${notesHtml(p)}</div></div>`;$('#addNote').onclick=addNote;bindMasterSelects(root);return}}
// Seven rows are provisional, not a fixed requirement; keep original field keys
// (家構, 入院元, 介護度 etc.) so FileMaker mapping and existing records still work.
// Municipality is a new, distinct city/town/village field. No street address is copied.
function basicFieldHtml(field,label,{multiline=false,rows=2}={}){
  const p=selectedPatient,v=p.data?.[field]??'';
  if(field==='ベッド番号')return `<div class="field basic-field"><label>ベッド番号</label><input type="hidden" data-field="ベッド番号" id="patientBedValue" value="${esc(v)}"><button type="button" class="btn secondary basic-bed-picker" id="patientBedPick">${esc(v||'その他・未配置')} ▾</button></div>`;
  if(field==='入院日数')return `<div class="field basic-field"><label>入院日数（自動）</label><div id="basicAdmissionDays" class="basic-readonly" aria-live="polite">${esc(daysSince(p.data['入院日'])||p.data['入院日数']||'—')}${daysSince(p.data['入院日'])||p.data['入院日数']?'日':''}</div></div>`;
  const placeholder=field==='家構'?'例：2同別':field==='市町村'?'例：小美玉（市町村名の略称可・番地不可）':field==='介護情報'?'ケアマネ・介護サービスなど':'';
  const common=`data-field="${esc(field)}" aria-label="${esc(label)}" placeholder="${esc(placeholder)}"`;
  if(multiline)return `<div class="field basic-field"><label>${esc(label)}</label><textarea ${common} rows="${rows}">${esc(v)}</textarea></div>`;
  const type=(field==='入院日'||field==='調査日')?'date':'text';
  const numeric=field==='ＩＤ'?' inputmode="numeric" autocomplete="off"':'';
  const limited=field==='市町村'?' maxlength="30"':'';
  const control=`<input type="${type}" ${common}${numeric}${limited} value="${esc(v)}">`;
  if(field==='調査日')return `<div class="field basic-field basic-survey-date"><label>${esc(label)}</label><div class="basic-survey-date-line">${control}<button type="button" id="basicSurveyDateClear" class="basic-survey-date-clear" aria-label="この患者の介護調査日を消去">日付を消去</button></div></div>`;
  if(!['市町村','主治医','介護度'].includes(field))return `<div class="field basic-field"><label>${esc(label)}</label>${control}</div>`;
  return `<div class="field basic-field basic-combo" data-basic-combo="${esc(field)}"><label>${esc(label)}</label><div class="basic-combo-input">${control}<button type="button" class="basic-combo-arrow" data-combo-open="${esc(field)}" aria-label="${esc(label)}の候補を開く">▾</button></div></div>`;
}
function bindBasicComboInputs(root){
  // Candidate choices are drawn as a screen-centered dialog rather than inside
  // the small left column. This avoids overlap and clipping on iPad mini.
  const boxes=[...root.querySelectorAll('[data-basic-combo]')];
  let overlay=null;
  const cityValid=validMunicipalityCandidate;
  function close(){if(overlay){overlay.remove();overlay=null}}
  function show(box){
    const modal=document.getElementById('modal');
    if(!modal||!box.isConnected||!selectedPatient)return;
    close();
    const input=box.querySelector('input[data-field]'),field=box.dataset.basicCombo;
    if(!input)return;
    if(document.activeElement===input)input.blur();
    overlay=document.createElement('div');overlay.className='basic-candidate-screen';
    overlay.innerHTML='<div class="basic-candidate-shade"></div><section class="basic-candidate-dialog" role="dialog" aria-modal="true" aria-labelledby="basicCandidateTitle"><div class="basic-candidate-head"><strong id="basicCandidateTitle"></strong><button type="button" class="basic-candidate-close" aria-label="候補を閉じる">✕ 閉じる</button></div><p class="basic-candidate-hint">選びたい項目を1回タップしてください。</p><label class="basic-candidate-search-label">候補を絞り込む（任意）<input class="basic-candidate-search" type="search" autocomplete="off" placeholder="候補を検索"></label><div class="basic-candidate-list" role="listbox"></div><div class="basic-candidate-footer"><button type="button" class="basic-candidate-manual">自由入力する</button><button type="button" class="basic-candidate-save">入力中の文字を候補に追加</button></div><p class="basic-candidate-error" role="status" aria-live="polite"></p></section>';
    modal.appendChild(overlay);
    overlay.querySelector('#basicCandidateTitle').textContent=field==='市町村'?'住所（市町村のみ）の候補':field+'の候補';
    const search=overlay.querySelector('.basic-candidate-search');
    const list=overlay.querySelector('.basic-candidate-list');
    const error=overlay.querySelector('.basic-candidate-error');
    function paint(q=''){
      list.replaceChildren();
      const options=masterValues(field,input.value).filter(v=>field!=='市町村'||cityValid(v));
      const filtered=options.filter(v=>!q||v.toLocaleLowerCase('ja').includes(q.toLocaleLowerCase('ja'))).slice(0,100);
      if(!filtered.length){
        const empty=document.createElement('p');empty.className='basic-candidate-empty';empty.textContent='一致する候補はありません。自由入力できます。';list.appendChild(empty);return;
      }
      for(const v of filtered){
        const b=document.createElement('button');b.type='button';b.className='basic-candidate-item';b.setAttribute('role','option');b.textContent=v;
        b.onclick=()=>{
          // Reuse the existing patient autosave listeners and do not touch storage keys.
          input.value=v;close();
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
          input.blur();
        };
        list.appendChild(b);
      }
    }
    overlay.querySelector('.basic-candidate-shade').onclick=close;
    overlay.querySelector('.basic-candidate-close').onclick=close;
    search.oninput=()=>paint(search.value);
    overlay.querySelector('.basic-candidate-manual').onclick=()=>{
      close();box.dataset.manualTyping='1';input.focus();
      const n=input.value.length;try{input.setSelectionRange(n,n)}catch(_){}
    };
    overlay.querySelector('.basic-candidate-save').onclick=async e=>{
      // In the candidate dialog the search box, not the patient field,
      // may hold a brand-new city name.
      const value=String(search.value.trim()||input.value.trim()).normalize('NFKC');
      if(!value){error.textContent='候補の検索欄に新しい市町村名を入力してください。';return}
      if(field==='市町村'&&!cityValid(value)){error.textContent='「小美玉」など市町村の略称も登録できます。番地・数字・電話番号は登録しないでください。';return}
      const prev=[...(state.masters?.[field]||[])];
      if(masterValues(field).includes(value)){error.textContent='すでに共通候補に登録されています。候補から選択してください。';paint(search.value);return}
      const btn=e.currentTarget;btn.disabled=true;
      try{
        await dataWriteTail;
        state.masters[field]=uniq([...prev,value]);
        await save();
        error.textContent='「'+value+'」を固定の共通候補に登録しました。候補一覧から選択してください。';
        search.value=value;paint(search.value);
      }catch(err){state.masters[field]=prev;error.textContent='候補を保存できませんでした：'+String(err.message||err)}
      finally{if(btn.isConnected)btn.disabled=false}
    };
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
    paint();
    overlay.querySelector('.basic-candidate-close').focus({preventScroll:true});
  }
  for(const box of boxes){
    const input=box.querySelector('input[data-field]'),arrow=box.querySelector('[data-combo-open]');
    input.autocomplete='off';
    // Cancel mobile focus on ordinary tap so the iPad keyboard does not cover the list.
    input.addEventListener('pointerdown',e=>{
      if(box.dataset.manualTyping==='1')return;
      if(e.cancelable)e.preventDefault();
      show(box);
    });
    input.addEventListener('click',()=>{if(box.dataset.manualTyping!=='1'&&!overlay)show(box)});
    input.addEventListener('focus',()=>{
      // Keyboard focus (rather than touch) still opens the accessible chooser.
      if(box.dataset.manualTyping!=='1'&&!overlay)show(box);
    });
    input.addEventListener('blur',()=>{
      if(box.dataset.manualTyping==='1')delete box.dataset.manualTyping;
    });
    arrow.onclick=()=>show(box);
  }
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
    <section class="basic-santherese" aria-label="サン・テレーズ検討会の登録">
      <label for="sanThereseCheck"><input type="checkbox" id="sanThereseCheck" ${selectedPatient.sanThereseMeeting===true?'checked':''}><span>サン・テレーズ検討会</span></label>
      <p class="basic-santherese-note">チェックON → 患者一覧でオレンジ色・検討会対象者一覧に表示。OFF → 通常の青色に戻ります。</p>
    </section>
  </aside>`;
}
// iPadOS native date-picker "reset" may select today instead of clearing the date.
// This explicit button clears only the survey-date input and waits for durable
// patient autosave, so the bed's green status clears after returning to the map.
function bindSurveyDateClear(root){
  const input=root.querySelector('[data-field="調査日"]');
  const clear=root.querySelector('#basicSurveyDateClear');
  if(!input||!clear)return;
  const sync=()=>{if(clear.isConnected)clear.disabled=!input.value};
  input.addEventListener('input',sync);
  input.addEventListener('change',sync);
  sync();
  clear.onclick=async()=>{
    const patient=selectedPatient;
    if(!patient||!root.isConnected||!input.isConnected||!input.value)return;
    if(!confirm('この患者の介護調査日を空欄にしますか？\n患者：'+String(patient.data?.['氏名']||'氏名未入力')+'\n※他の患者の情報は変更しません。'))return;
    clear.disabled=true;
    input.value='';
    // Reuse ordinary capture, revision tracking and encrypted autosave.
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    let ok=false;
    try{ok=await flushPatientAutoSave();}
    catch(e){ok=false;}
    if(selectedPatient===patient&&clear.isConnected){
      sync();
      if(!ok)alert('調査日の消去を保存できませんでした。画面上部の保存状態を確認してください。');
    }
  };
}
let basicLayoutMode='balanced'; // Display-only session preference.
function renderBasicDashboard(){
  const root=$('#tabbody');
  root.classList.add('basic-fixed-body');
  root.innerHTML=`<div class="basic-dashboard ${basicLayoutMode==='info'?'basic-layout-info':basicLayoutMode==='docs'?'basic-layout-docs':'basic-layout-balanced'}">
    <div class="basic-layout-switch" role="group" aria-label="基本タブの表示幅を切り替え">
      <span>画面固定</span>
      ${[['balanced','標準'],['info','情報を広く'],['docs','書類を広く']].map(([mode,label])=>`<button type="button" class="basic-layout-choice" data-basic-layout="${mode}" aria-pressed="${basicLayoutMode===mode}">${label}</button>`).join('')}
    </div>
    <section class="basic-information" aria-label="患者基本情報">
      <div class="basic-form-rows">
        <div class="basic-row basic-r1">${basicFieldHtml('ベッド番号','ベッド番号')}${basicFieldHtml('入院日','入院日')}${basicFieldHtml('入院日数','入院日数')}</div>
        <div class="basic-row basic-r2">${basicFieldHtml('ＩＤ','ID')}${basicFieldHtml('氏名','氏名')}${basicFieldHtml('市町村','住所（市町村のみ）')}${basicFieldHtml('家構','家族構成')}</div>
        <div class="basic-row basic-r3">${basicFieldHtml('主治医','主治医')}${basicFieldHtml('病名','病名')}</div>
        <div class="basic-row basic-r4">${basicFieldHtml('介護度','介護度')}${basicFieldHtml('調査日','調査日')}</div>
        <div class="basic-row basic-r5">${basicFieldHtml('介護情報','介護情報（広め）',{multiline:true,rows:2})}</div>
        <div class="basic-row basic-r6">${basicFieldHtml('入院元','入院元')}</div>
        <div class="basic-row basic-r7">${basicFieldHtml('備考','備考',{multiline:true,rows:2})}</div>
      </div>
      <details class="basic-extra"><summary>その他の既存項目（保険・本人職業・術式・かかりつけ）</summary>
        <div class="basic-extra-grid">${['保険','本人職業','術式','かかりつけ'].map(fieldHtml).join('')}</div>
      </details>
      <p class="basic-private-hint">※住所は市町村名のみ入力してください。番地や電話番号は登録しないでください。</p>
    </section>
    ${basicDocumentHtml()}
  </div>`;
  root.querySelectorAll('[data-basic-layout]').forEach(button=>button.onclick=()=>{
    const mode=button.dataset.basicLayout;
    if(!['balanced','info','docs'].includes(mode))return;
    basicLayoutMode=mode;
    const dash=root.querySelector('.basic-dashboard');if(!dash)return;
    dash.classList.remove('basic-layout-balanced','basic-layout-info','basic-layout-docs');
    dash.classList.add(mode==='info'?'basic-layout-info':mode==='docs'?'basic-layout-docs':'basic-layout-balanced');
    root.querySelectorAll('[data-basic-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.basicLayout===mode)));
  });
  bindPatientBedPicker();
  bindMasterSelects(root);
  bindBasicComboInputs(root);
  bindSurveyDateClear(root);
  const input=root.querySelector('[data-field="入院日"]');
  input?.addEventListener('input',()=>{
    const el=$('#basicAdmissionDays');if(el)el.textContent=(daysSince(input.value)||'—')+(daysSince(input.value)?'日':'');
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
  $('#tabbody').innerHTML=`<div class="panel"><h3>ジェノグラム（基本1枚）</h3>${items(gen)}<input id="genFile" type="file" accept="image/*" hidden><button class="btn secondary" id="genAdd">${gen.length?'写真を差し替える':'撮影・画像を登録'}</button></div><div class="panel"><h3>入院時患者情報（複数ページ）</h3>${items(info)}<input id="infoFile" type="file" accept="image/*" multiple hidden><button class="btn secondary" id="infoAdd">＋ 写真を追加</button> <button class="btn" id="photoPdf" ${info.length?'':'disabled'}>全ページをPDF化</button><p class="notice">後日追加できます。↑でページ順を変更できます。写真は暗号化してこの端末に保存します。住所・電話番号が写った画像は登録しないでください（自動判別できません）。</p></div>`;
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
  if(!files?.length||photoImportBusy||maintenanceAction)return;
  // Process a bounded batch: avoids holding dozens of encoded camera images in Safari memory.
  if(type==='admission'&&files.length>10){alert('一度に登録できる写真は10枚までです。残りは追加登録してください。');return}
  // Preflight the whole batch before decoding any image. This avoids spending
  // memory on earlier photos only to reject a later oversized or invalid file.
  const batch=Array.from(files).slice(0,type==='genogram'?1:10);
  if(batch.some(f=>!f||typeof f.size!=='number'||!Number.isFinite(f.size)||f.size<=0||f.size>20*1024*1024||typeof f.type!=='string'||!f.type.startsWith('image/'))){
    alert('画像形式またはファイルサイズを確認してください（1枚20MB以下）。');return;
  }
  if(batch.reduce((total,f)=>total+f.size,0)>40*1024*1024){alert('一度に登録する写真の合計は40MB以下にしてください。分けて追加できます。');return}
  if(!confirm('登録する写真に住所・電話番号・連絡先が写っていないことを確認しましたか？\n画像の中身はアプリでは自動検査・除去できません。'))return;
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
      additions.push({entry:{id,type,name:type==='genogram'?'ジェノグラム画像':'入院時画像',addedAt:nowISO(),order:nextPhotoOrder([...oldList,...additions.map(x=>x.entry)])},cipher:await encryptObj(data)});
    }
    if(!additions.length)return;
    // Never commit an import for a patient whose sheet was closed or replaced.
    if(selectedPatient!==p)return;
    const committed=await orderedDataWrite(async()=>{
      if(selectedPatient!==p||!key)return false;
      const previous=p.attachments||[];
      const removed=type==='genogram'?photoList(p,type):[];
      const next=previous.filter(m=>!removed.some(x=>x.id===m.id)).concat(additions.map(x=>x.entry));
      const updatedPatient={...p,attachments:next};delete updatedPatient._new;
      const newPatients=p._new?[...state.patients,updatedPatient]:state.patients.map(x=>x===p?updatedPatient:x);
      const newState={...state,patients:newPatients,updatedAt:nowISO()};
      const stateCipher=await encryptPatientIndex(newState);
      if(selectedPatient!==p)return false;
      await idbApplyChanges([...additions.map(x=>[photoKey(x.entry.id),x.cipher]),['data',stateCipher]],removed.map(x=>photoKey(x.id)));
      p.attachments=next;
      if(p._new){delete p._new;state.patients.push(p)}
      state.updatedAt=newState.updatedAt;
      return true;
    });
    if(!committed)return;
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
  if(photoRotateBusy||maintenanceAction)return;
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
    await orderedDataWrite(()=>idbSet(photoKey(id),cipher));
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真を回転できませんでした：'+(e.message||e))}
  finally{photoRotateBusy=false}
}

let photoDeleteBusy=false;
async function deletePhoto(id){
  if(photoDeleteBusy||maintenanceAction)return;
  const patient=selectedPatient;
  if(!patient||(patient.attachments||[]).every(m=>m.id!==id))return;
  if(!confirm('この写真を削除しますか？'))return;
  // Confirm dialogs may change focus; never apply a stale action to another sheet.
  if(selectedPatient!==patient)return;
  photoDeleteBusy=true;
  try{
    await orderedDataWrite(async()=>{
      if(selectedPatient!==patient||!key)return;
      const next=(patient.attachments||[]).filter(m=>m.id!==id);
      const newState={...state,patients:state.patients.map(x=>x===patient?{...patient,attachments:next}:x),updatedAt:nowISO()};
      const cipher=await encryptPatientIndex(newState);
      if(selectedPatient!==patient)return;
      await idbApplyChanges([['data',cipher]],[photoKey(id)]);
      patient.attachments=next;state.updatedAt=newState.updatedAt;
    });
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真を削除できませんでした：'+(e.message||e))}
  finally{photoDeleteBusy=false}
}
let photoReorderBusy=false;
async function movePhotoUp(id){
  if(photoReorderBusy||maintenanceAction)return;
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
    await orderedDataWrite(async()=>{
      if(selectedPatient!==patient||!key)return;
      const updatedAt=nowISO();
      const nextState={...state,updatedAt,patients:state.patients.map(p=>
        p===patient?{...p,attachments:nextAttachments}:p)};
      const cipher=await encryptPatientIndex(nextState);
      if(selectedPatient!==patient)return;
      await idbSet('data',cipher);
      patient.attachments=nextAttachments;
      state.updatedAt=updatedAt;
    });
    if(selectedPatient===patient)renderPhotosTab();
  }catch(e){if(selectedPatient===patient)alert('写真の並び替えを保存できませんでした：'+(e.message||e))}
  finally{photoReorderBusy=false}
}

let pdfExportBusy=false;
async function exportAdmissionPdf(){
  if(pdfExportBusy||maintenanceAction)return;
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
// MVP01: Task deadlines are optional, preserving legacy {text, done} objects.
function mvpLocalDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function mvpDueType(task,today=mvpLocalDate()){
  const due=String(task?.dueDate||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due))return 'undated';
  if(due<today)return 'overdue';
  if(due===today)return 'today';
  return 'future';
}
function mvpDueBadge(task){
  const kind=mvpDueType(task),due=String(task?.dueDate||'');
  const names={overdue:'期限切れ',today:'今日',future:'期限あり',undated:'期限なし'};
  const flag=task?.priority==='high'?' <span class="mvp-priority">優先</span>':'';
  return `<span class="mvp-due ${kind}">${names[kind]}${due?' '+esc(due):''}</span>${flag}`;
}
function taskListHtml(p){
  if(!p.tasks?.length)return'<div class="empty">タスクなし</div>';
  return p.tasks.map((t,i)=>`<label class="settings-row"><span><input type="checkbox" data-task="${i}" ${t.done?'checked':''}> ${esc(t.text)} <span class="mvp-task-status">${mvpDueBadge(t)}</span></span><small>${t.done?'完了':'未完了'}</small></label>`).join('');
}
// Serialize rapid repeated changes to a single task; prevent optimistic UI from
// claiming completion when encrypted storage fails.
const taskTogglePending=new Set();
function bindTaskChecks(){
  $$('[data-task]').forEach(c=>c.onchange=async()=>{
    const patient=selectedPatient, t=patient?.tasks?.[+c.dataset.task];
    if(!t)return;
    if(taskTogglePending.has(t)||taskWriteBusy||patientCsvBusy||resetInProgress||restoreBusy||maintenanceAction){
      c.checked=!!t.done;return;
    }
    const old=!!t.done, desired=!!c.checked;
    taskTogglePending.add(t);c.disabled=true;t.done=desired;
    try{
      if(selectedPatient!==patient||!key||!state)throw new Error('患者情報の画面が切り替わりました');
      await save();
      if(selectedPatient===patient&&c.isConnected){
        const status=c.closest('.settings-row')?.querySelector('small');
        if(status)status.textContent=t.done?'完了':'未完了';
      }
    }catch(e){
      t.done=old;
      if(selectedPatient===patient&&c.isConnected)c.checked=old;
      if(selectedPatient===patient)alert('タスクの完了状態を保存できませんでした。もう一度お試しください。');
    }finally{
      taskTogglePending.delete(t);
      if(c.isConnected)c.disabled=false;
    }
  });
}
// Only show a newly added task after IndexedDB confirms its encrypted commit.
// Prevent accidental duplicate taps and preserve the typed text on a storage error.
let taskWriteBusy=false;
async function addTask(){
  if(taskWriteBusy)return;
  const el=$('#newTask'),btn=$('#addTask'),v=el?.value.trim();
  if(!v||!btn)return;
  const due=$('#newTaskDue')?.value||'';
  if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due)){
    alert('対応期限の形式が不正です。');return;
  }
  const priority=$('#newTaskUrgent')?.checked?'high':'normal';
  const p=selectedPatient;if(!p)return;
  if(patientCsvBusy||resetInProgress||restoreBusy||maintenanceAction){
    alert('別のデータ処理が進行中です。完了後に再試行してください。');return;
  }
  taskWriteBusy=true;btn.disabled=true;
  let task=null;
  try{
    if(p._new){
      if(!patientCanSave(p))throw new Error('先に患者の氏名またはIDを入力してください。');
      const ok=await flushPatientAutoSave();
      if(!ok||selectedPatient!==p)throw new Error('患者情報の保存を確認してからタスクを追加してください。');
    }
    if(selectedPatient!==p||!key||!state||patientCsvBusy||resetInProgress||restoreBusy||maintenanceAction)
      throw new Error('患者情報が切り替わったか、ほかの処理が始まりました。');
    task={id:uid(),text:v,done:false,createdAt:nowISO(),dueDate:due,priority};
    p.tasks??=[];p.tasks.push(task);
    await save();
    if(selectedPatient===p&&el.isConnected){
      el.value='';
      if($('#newTaskDue'))$('#newTaskDue').value='';
      if($('#newTaskUrgent'))$('#newTaskUrgent').checked=false;
      if($('#taskList'))$('#taskList').innerHTML=taskListHtml(p);
      bindTaskChecks();
    }
  }catch(e){
    if(task)p.tasks=(p.tasks||[]).filter(t=>t!==task);
    if(selectedPatient===p)alert('タスクを保存できませんでした。入力内容は保持しています：'+(e.message||e));
  }finally{
    taskWriteBusy=false;
    if(btn.isConnected)btn.disabled=false;
  }
}
function notesHtml(p){const a=[...(p.notes||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at)));if(!a.length)return'<div class="empty">経過記録はまだありません</div>';return a.map(n=>`<div class="note"><div class="time">${fmtDate(n.at)} ${new Date(n.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div><div class="type">${esc(n.type)}</div><div>${esc(n.text).replace(/\n/g,'<br>')}</div></div>`).join('')}
// Never navigate away from a new case note before its encrypted write commits.
// On any storage failure, keep the text in the editor and restore the old note list.
let noteWriteBusy=false;
async function addNote(){
  if(noteWriteBusy||maintenanceAction)return;
  const patient=selectedPatient, editor=$('#noteText'),btn=$('#addNote');
  const txt=editor?.value.trim();
  if(!patient||!txt||!btn)return;
  const atInput=$('#noteAt')?.value||'';
  const timestamp=new Date(atInput);
  if(!atInput||!Number.isFinite(timestamp.getTime())){
    alert('経過記録の日時が不正です。修正してから保存してください。');return;
  }
  noteWriteBusy=true;btn.disabled=true;
  const status=$('#noteSaveState');
  if(status)status.textContent='経過記録を暗号化して保存しています…';
  let note=null;
  try{
    if(patient._new){
      if(!patientCanSave(patient))throw new Error('先に患者の氏名またはIDを入力してください。');
      if(!await flushPatientAutoSave()||selectedPatient!==patient)
        throw new Error('患者基本情報の保存を確認できませんでした。');
    }
    if(selectedPatient!==patient||!key)throw new Error('患者情報が切り替わりました。');
    note={id:uid(),type:$('#noteType').value,at:timestamp.toISOString(),text:txt};
    patient.notes??=[];patient.notes.push(note);
    await save();
    if(selectedPatient===patient){
      // Only committed notes are shown in the timeline.
      activeTab='notes';$('#modal')?.remove();renderPatientModal();
    }
  }catch(e){
    if(note)patient.notes=(patient.notes||[]).filter(n=>n!==note);
    if(selectedPatient===patient){
      const msg='経過記録を保存できませんでした。入力内容は残っています：'+(e.message||e);
      const live=$('#noteSaveState');if(live)live.textContent=msg;
      alert(msg);
    }
  }finally{
    noteWriteBusy=false;
    if(btn.isConnected)btn.disabled=false;
  }
}
// MVP01: All pending tasks stay visible. Due dates help order work, not hide it.
function mvpTaskRows(){
  const rows=[];
  activePatients().forEach(p=>(p.tasks||[]).filter(t=>!t.done).forEach(t=>rows.push({p,t})));
  const order={overdue:0,today:1,future:2,undated:3};
  rows.sort((a,b)=>order[mvpDueType(a.t)]-order[mvpDueType(b.t)] ||
    Number(b.t.priority==='high')-Number(a.t.priority==='high') ||
    String(a.t.dueDate||'').localeCompare(String(b.t.dueDate||'')) ||
    String(a.p.data?.['ベッド番号']||'').localeCompare(String(b.p.data?.['ベッド番号']||''),'ja'));
  return rows;
}
function renderTasks(){
  const rows=mvpTaskRows(),today=rows.filter(x=>mvpDueType(x.t)==='today').length,
  overdue=rows.filter(x=>mvpDueType(x.t)==='overdue').length,
  noDate=rows.filter(x=>mvpDueType(x.t)==='undated').length;
  const categories=[['overdue','期限切れ（優先して確認）'],['today','今日の対応'],['future','今後の対応'],['undated','期限未設定の対応']];
  const items=categories.map(([type,name])=>{
    const subset=rows.filter(x=>mvpDueType(x.t)===type);
    if(!subset.length)return'';
    return `<section class="panel mvp-task-group"><h3>${name} <span class="mvp-count">${subset.length}件</span></h3>${subset.map(({p,t})=>`<button type="button" class="settings-row mvp-taskjump" data-id="${esc(p.id)}"><span class="mvp-task-summary"><b>${esc(p.data?.['氏名']||'氏名未入力')}</b> <span class="tag">${esc(p.data?.['ベッド番号']||'未配置')}</span><span class="mvp-task-copy">${esc(t.text)}</span><span class="mvp-task-status">${mvpDueBadge(t)}</span></span><span aria-hidden="true">›</span></button>`).join('')}</section>`;
  }).join('');
  $('#main').innerHTML=`<div class="hero"><div><h1>今日の業務・要対応</h1><p>期限が過ぎたタスクから順に表示します。期限なしの業務も隠しません。</p></div></div><div class="mvp-kpis"><div class="mvp-kpi"><b>${overdue}</b><span>期限切れ</span></div><div class="mvp-kpi"><b>${today}</b><span>今日</span></div><div class="mvp-kpi"><b>${noDate}</b><span>期限なし</span></div><div class="mvp-kpi"><b>${rows.length}</b><span>未完了合計</span></div></div>${items||'<div class="empty">未完了の要対応タスクはありません</div>'}<p class="notice">操作：患者名をタップすると患者詳細が開きます。内容を確認・完了するには「退院支援」タブを開いてください。</p>`;
  $$('.mvp-taskjump').forEach(x=>x.onclick=()=>{
    const p=state.patients.find(p=>p.id===x.dataset.id);if(p)openPatient(p);
  });
}
function renderDrugs(){const ds=state.drugs||[];$('#main').innerHTML=`<div class="hero"><div><h1>薬情</h1><p>端末内の簡易薬剤マスター。患者別の登録は患者情報の「処方薬」タブから行えます。</p></div></div><div class="toolbar"><input id="dq" placeholder="薬名・分類・薬効で検索"></div><div id="drugList"></div>`;$('#dq').oninput=drawDrugs;drawDrugs()}

function rx038MasterSearchText(drug){
 const secondaries=Array.isArray(drug?.rx038?.otherOriginals)?drug.rx038.otherOriginals:[];
 const generics=Array.isArray(drug?.rx037?.generics)?drug.rx037.generics:[];
 return [drug?.['薬名'],drug?.['医薬品分類'],drug?.['薬効'],
         drug?.rx038?.ingredient,
         ...secondaries.map(x=>x?.name),
         ...generics.map(x=>x?.name)].join(' ').toLowerCase();
}
function drawDrugs(){const q=($('#dq')?.value||'').toLowerCase().trim();const a=(state.drugs||[]).filter(d=>!q||rx038MasterSearchText(d).includes(q)).slice(0,100);$('#drugList').innerHTML=a.length?`<div class="drug-list">${a.map(d=>`<article class="drug"><b>${esc(d['薬名'])}</b><div class="small">${esc(d['医薬品分類'])}　${esc(d['薬価'])}</div><div class="effect">${esc(d['薬効'])}</div></article>`).join('')}</div>`:'<div class="empty">薬剤データがありません。設定から「薬剤CSV」を読み込んでください。</div>'}


/* RX01: Patient-specific reference list. Selected master data is copied into
 * the encrypted patient record to prevent later CSV replacement/reordering
 * from changing the original selected drug. Not an electronic prescription. */
let patientMedicationBusy=false;
const MED_SNAPSHOT_FIELDS=['薬名','医薬品分類','薬価','薬効'];
function medSnapshot(d){return Object.fromEntries(MED_SNAPSHOT_FIELDS.map(k=>[k,String(d?.[k]??'').trim()]))}
function medSignature(d){return JSON.stringify(MED_SNAPSHOT_FIELDS.map(k=>String(d?.[k]??'').trim()))}
function medRows(p){return Array.isArray(p?.medications)?p.medications:[]}

const MED_UNITS=['','錠','カプセル','包','g','mL','本','枚','回','その他'];
const MED_STATUSES=['','定期','頓服','中止','不明'];
// Read only unambiguous "strength(price)" pairs; do not guess from mixed
// units, combined labels, or historical unstructured cost strings.
function medPriceChoices(text){
 const s=String(text??'').normalize('NFKC').replace(/[\s\u000b　]+/g,'');
 if(!s||s.length>650)return [];
 const re=/([^()]+)\((\d{1,7}(?:\.\d{1,2})?)\)/g;
 const out=[];let cursor=0,match;
 while((match=re.exec(s))!==null){
   if(match.index!==cursor)return [];
   const strength=match[1],unitPrice=match[2],v=Number(unitPrice);
   if(strength.length>45||!strength||/[、,，⇒=>]/.test(strength)||!Number.isFinite(v)||v<=0||v>1000000)return [];
   out.push({strength,unitPrice});cursor=re.lastIndex;
   if(out.length>15)return [];
 }
 if(cursor!==s.length)return [];
 return out;
}
function medEffectAndGenerics(drug){
 const source=String(drug?.['薬効']??'').replace(/\r/g,'').replace(/\u000b/g,'\n');
 const marker=source.match(/後発(?:医薬)?品?\s*[⇒=>:：]\s*([^\n]+)/);
 const generic=marker?marker[1].trim():'';
 const effect=(marker?source.replace(marker[0],''):source).trim().replace(/\n{3,}/g,'\n\n');
 return{effect,generic};
}
function medPriceInfo(record){
 const p=record?.pricing||{};
 if(p.status!=='定期')return null;
 const priceText=String(p.unitPrice??'').trim(),qtyText=String(p.dailyQuantity??'').trim();
 const price=Number(priceText),qty=Number(qtyText);
 if(!p.strength||!MED_UNITS.includes(p.unit)||!p.unit||!priceText||!qtyText||
    !/^\d{1,7}(?:\.\d{1,2})?$/.test(priceText)||
    !/^\d{1,4}(?:\.\d{1,3})?$/.test(qtyText)||
    !Number.isFinite(price)||!Number.isFinite(qty)||price<=0||qty<=0||
    price>1000000||qty>1000||price*qty>10000000)return null;
 return Math.round(Math.round(price*100)*qty)/100;
}
function medMoney(number){return Number(number).toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})+'円'}
function medReferenceSummary(rows){
 const regular=rows.filter(r=>r?.pricing?.status==='定期');
 const costs=regular.map(medPriceInfo);
 const known=costs.filter(v=>v!==null);
 const sum=Math.round(known.reduce((total,n)=>total+n,0)*100)/100;
 return {regular:regular.length,known:known.length,pending:regular.length-known.length,sum};
}
function renderPatientMedications(){
 const root=$('#tabbody');
 root.innerHTML=`<div class="patient-med-page">
   <section class="panel"><h3>処方薬一覧（確認用）</h3>
    <p class="notice">薬効・後発品はFileMaker由来の登録内容で、現在の添付文書・薬価とは限りません。正式な処方・服薬の記録ではありません。</p>
    <div id="patientMedSummary" class="patient-med-summary" role="status" aria-live="polite"></div>
    <p class="notice">参考日額＝確認した単価 × 1日数量。定期薬のみ集計し、未設定分は除外します。実際の請求額ではありません。</p>
    <p id="patientMedStatus" class="patient-med-status" role="status" aria-live="polite">薬名と薬効・後発品・薬価を一覧で確認できます。</p>
    <h4>この患者の登録薬　<span id="patientMedCount"></span></h4><div id="patientMedList"></div>
   </section>
   <section class="panel"><h3>＋ 薬剤マスターから追加</h3>
    <label class="patient-med-query-label">薬名・分類・薬効で検索
     <input type="search" id="patientDrugQuery" autocomplete="off" placeholder="例：メネシット">
    </label><div id="patientDrugResults"></div>
   </section>
 </div>`;
 root.querySelector('#patientDrugQuery').oninput=drawPatientDrugResults;
 drawPatientMedicationList();drawPatientDrugResults();
}
function drawPatientMedicationList(){
 const patient=selectedPatient,host=$('#patientMedList'),count=$('#patientMedCount'),summary=$('#patientMedSummary');
 if(!patient||!host||!count||!summary)return;
 const rows=medRows(patient);count.textContent=String(rows.length)+'件';
 const s=medReferenceSummary(rows);
 const sumText=s.known?(s.pending?'定期薬の参考日額・小計':'定期薬の参考日額・合計')+'：'+medMoney(s.sum):'定期薬の参考日額：—（計算待ち）';
 summary.innerHTML=`<strong>${esc(sumText)}</strong><span>計算可能 ${s.known}/${s.regular}件</span>`+
  (s.pending?`<small>未計算の定期薬が${s.pending}件あるため、全薬剤の合計ではありません。</small>`:'' );
 if(!rows.length){host.innerHTML='<p class="empty">登録薬はありません。下の検索から追加してください。</p>';return;}
 host.innerHTML=rows.map(item=>{
   const d=item.drug||{},p=item.pricing||{},text=medEffectAndGenerics(d),cost=medPriceInfo(item);
   const status=p.status||'未設定',strength=p.strength||'規格未設定';
   const currentPrice=p.unitPrice?medMoney(Number(p.unitPrice))+(p.unit?'／'+p.unit:'（単位未確認）'):'薬価未設定';
   const costText=cost===null?(p.status==='定期'?'参考日額：計算待ち':'参考日額：対象外'):'参考日額：'+medMoney(cost);
   const options=medPriceChoices(d['薬価']);
   const optionHtml=options.length?`<label>旧データから規格・薬価を選択（内容を確認）<select class="patient-med-choice"><option value="">候補から選ぶ（任意）</option>${
      options.map((v,i)=>`<option value="${i}">${esc(v.strength)} ／ ${esc(v.unitPrice)}円</option>`).join('')
    }</select></label>`:'<p class="notice">元の薬価から規格別価格を安全に抽出できません。価格は手動で確認してください。</p>';
   return `<article class="patient-med-row">
     <div class="patient-med-line"><div><strong>${esc(d['薬名']||'名称未登録')}</strong>
       <div class="notice">${esc(d['医薬品分類']||'分類未登録')}　・　${esc(status)}</div></div>
       <button type="button" class="btn danger patient-med-del" data-id="${esc(item.id)}">一覧から削除</button></div>
     <div class="patient-med-glance">
       <div><b>薬効</b><span class="patient-med-glance-effect">${esc(text.effect||'未登録')}</span></div>
       <div><b>後発品</b><span>${esc(text.generic||'登録情報なし')}</span></div>
       <div><b>薬価</b><span>${esc(strength)}　${esc(currentPrice)}　／　${esc(costText)}</span></div>
     </div>
     <details class="patient-med-editor" data-id="${esc(item.id)}" data-med-dirty="0">
       <summary>規格・薬価・1日量を設定 / 全文を見る</summary>
       <div class="patient-med-editor-body">
         <div class="patient-med-fact"><dt>薬効（全文）</dt><dd>${esc(text.effect||'未登録')}</dd></div>
         <div class="patient-med-fact"><dt>後発品（登録情報）</dt><dd>${esc(text.generic||'未登録')}</dd></div>
         <div class="patient-med-fact"><dt>薬価の元データ</dt><dd>${esc(d['薬価']||'未登録')}</dd></div>
         <p class="notice">価格・規格は古い可能性があります。CSVから候補を選んでも、単価の対象単位と1日数量は必ず確認してください。</p>
         ${optionHtml}
         <div class="patient-med-fields">
          <label>規格<input class="patient-med-strength" maxlength="60" value="${esc(p.strength||'')}" placeholder="例：100mg"></label>
          <label>参考単価（円）<input class="patient-med-unit-price" inputmode="decimal" maxlength="14" value="${esc(p.unitPrice||'')}" placeholder="例：34.30"></label>
          <label>単価の単位<select class="patient-med-unit">${MED_UNITS.map(u=>`<option value="${esc(u)}" ${p.unit===u?'selected':''}>${esc(u||'単位を選択')}</option>`).join('')}</select></label>
          <label>1日合計数量<input class="patient-med-daily" inputmode="decimal" maxlength="12" value="${esc(p.dailyQuantity||'')}" placeholder="例：3"></label>
          <label>区分<select class="patient-med-status-choice">${MED_STATUSES.map(u=>`<option value="${esc(u)}" ${p.status===u?'selected':''}>${esc(u||'未確認')}</option>`).join('')}</select></label>
         </div>
         <p class="notice">例：1錠34.30円、1日3錠の定期薬なら102.90円／日。頓服・中止・不明は参考日額に含めません。入力後は保存を押してください。</p>
         <button type="button" class="btn patient-med-pricing-save">薬価設定を保存</button>
         <p class="patient-med-entry-state notice" role="status" aria-live="polite"></p>
       </div></details>
     </article>`;
 }).join('');
 host.querySelectorAll('.patient-med-del').forEach(btn=>btn.onclick=()=>{void changePatientMedication('delete',btn.dataset.id)});
 host.querySelectorAll('.patient-med-editor').forEach(editor=>{
   const options=medPriceChoices(medRows(patient).find(r=>r.id===editor.dataset.id)?.drug?.['薬価']);
   const mark=()=>{editor.dataset.medDirty='1';const message=editor.querySelector('.patient-med-entry-state');if(message)message.textContent='未保存の変更があります。';};
   editor.querySelectorAll('input,select').forEach(input=>{input.addEventListener('input',mark);input.addEventListener('change',mark)});
   const selector=editor.querySelector('.patient-med-choice');
   if(selector)selector.onchange=()=>{
     if(selector.value==='')return;
     const picked=options[Number(selector.value)];if(!picked)return;
     const prevStrength=editor.querySelector('.patient-med-strength').value;
     editor.querySelector('.patient-med-strength').value=picked.strength;
     editor.querySelector('.patient-med-unit-price').value=picked.unitPrice;
     if(prevStrength!==picked.strength){
       editor.querySelector('.patient-med-unit').value='';
       editor.querySelector('.patient-med-daily').value='';
     }
     mark();
   };
   editor.querySelector('.patient-med-pricing-save').onclick=()=>{
      const val=k=>editor.querySelector(k).value.trim();
      void changePatientMedication('pricing',{id:editor.dataset.id,pricing:{
         strength:val('.patient-med-strength'),unitPrice:val('.patient-med-unit-price'),
         unit:val('.patient-med-unit'),dailyQuantity:val('.patient-med-daily'),
         status:val('.patient-med-status-choice')}});
   };
 });
}
function drawPatientDrugResults(){
  const search=$('#patientDrugQuery'),host=$('#patientDrugResults');
  if(!host||!search)return;
  const q=search.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
  if(!q){host.innerHTML='<p class="notice">検索すると候補が表示されます。選んだ薬だけ患者の一覧に保存します。</p>';return;}
  const matched=(state?.drugs||[]).map((drug,index)=>({drug,index})).filter(({drug})=>
    MED_SNAPSHOT_FIELDS.some(k=>String(drug[k]||'').normalize('NFKC').toLocaleLowerCase('ja').includes(q))).slice(0,60);
  if(!matched.length){host.innerHTML='<p class="empty">一致する薬がありません。薬情マスターを確認してください。</p>';return;}
  host.innerHTML=matched.map(({drug,index})=>`<div class="patient-med-hit">
    <div><strong>${esc(drug['薬名'])}</strong><div class="notice">${esc(drug['医薬品分類']||'分類未登録')}　${esc(String(drug['薬価']||'').slice(0,100))}</div>
    <div class="patient-med-preview">${esc(String(drug['薬効']||'').slice(0,120))}</div></div>
    <button type="button" class="btn patient-med-add" data-index="${index}">この薬を追加</button></div>`).join('');
  host.querySelectorAll('.patient-med-add').forEach(btn=>btn.onclick=()=>{void changePatientMedication('add',Number(btn.dataset.index))});
}
async function changePatientMedication(action,ident){
  if(patientMedicationBusy)return;
  const patient=selectedPatient,status=$('#patientMedStatus');
  const inform=msg=>{if(status&&status.isConnected)status.textContent=msg;};
  if(!key||!state||!patient){inform('ロック状態と患者情報を確認してください。');return;}
  if(patient._new){inform('先に基本タブで氏名または患者IDを入力して保存してください。');return;}
  if(patient.medications!=null&&!Array.isArray(patient.medications)){inform('登録済みデータの形式が不正です。変更は行いません。');return;}
  const prev=medRows(patient).slice();let next;
  if(action==='add'){
    if(!Number.isSafeInteger(ident)||ident<0||ident>=(state.drugs||[]).length){inform('薬剤をもう一度検索してください。');return;}
    const item=medSnapshot(state.drugs[ident]);
    if(!item['薬名']){inform('薬名が空欄の候補は登録できません。');return;}
    if(prev.some(r=>medSignature(r?.drug)===medSignature(item))){inform('同じ薬剤情報はすでに登録されています。');return;}
    if(prev.length>=100){inform('一人の患者には100件まで登録できます。');return;}
    next=[...prev,{id:uid(),drug:item,addedAt:nowISO()}];
  }else if(action==='pricing'){
    const row=prev.find(x=>x.id===ident?.id);
    if(!row){inform('対象の登録薬が見つかりません。');return;}
    const value=ident.pricing||{};
    const strength=String(value.strength||'').trim(),unitPrice=String(value.unitPrice||'').trim();
    const dailyQuantity=String(value.dailyQuantity||'').trim(),unit=String(value.unit||''),status=String(value.status||'');
    if(strength.length>60||!MED_UNITS.includes(unit)||!MED_STATUSES.includes(status)||
      (unitPrice&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(unitPrice)||Number(unitPrice)<=0||Number(unitPrice)>1000000))||
      (dailyQuantity&&(!/^\d{1,4}(?:\.\d{1,3})?$/.test(dailyQuantity)||Number(dailyQuantity)<=0||Number(dailyQuantity)>1000))){
       const message='金額は正の数で小数2桁まで、1日数量は正の数で小数3桁まで入力してください。';
       inform(message);const local=document.querySelector('#tabbody .patient-med-editor[data-id="'+row.id+'"] .patient-med-entry-state');if(local)local.textContent=message;
       return;
    }
    if(unitPrice&&dailyQuantity&&Number(unitPrice)*Number(dailyQuantity)>10000000){
      inform('1日参考額が大きすぎるため保存できません。単位と数量を確認してください。');return;
    }
    const pricing={strength,unitPrice,unit,dailyQuantity,status};
    next=prev.map(x=>x.id===row.id?{...x,pricing}:x);
  }else if(action==='delete'){
    const existing=prev.find(x=>x.id===ident);
    if(!existing){inform('対象が見つかりません。');return;}
    if(!confirm('「'+String(existing.drug?.['薬名']||'薬剤')+'」をこの患者の一覧から削除しますか？\n薬剤マスターは削除しません。'))return;
    next=prev.filter(x=>x.id!==ident);
  }else return;
  patientMedicationBusy=true;
  const buttons=Array.from(document.querySelectorAll('#tabbody .patient-med-add, #tabbody .patient-med-del'));
  buttons.forEach(b=>b.disabled=true);
  inform('暗号化保存しています…');
  patient.medications=next;
  try{
    if(selectedPatient!==patient||!key||!state)throw new Error('患者またはロック状態が変わりました。');
    await save();
    if(selectedPatient===patient){drawPatientMedicationList();inform(action==='add'?'登録しました。薬名と薬効・後発品を一覧で確認できます。':action==='pricing'?'規格・参考薬価・1日数量を保存しました。':'患者の一覧から削除しました。');}
  }catch(e){
    patient.medications=prev;
    if(selectedPatient===patient){drawPatientMedicationList();inform('保存失敗のため元に戻しました：'+String(e.message||e).slice(0,120));}
  }finally{
    patientMedicationBusy=false;
    buttons.forEach(b=>{if(b.isConnected)b.disabled=false});
  }
}

// City/town/village only. Exclude addresses and labels.
// Staff deliberately enter concise municipality labels for the small iPad
// viewport and printed forms (e.g. 小美玉 instead of 小美玉市).
// Never force a suffix. Restrict to Japanese characters only to avoid storing
// numbers, apartment addresses and contact details in this structured field.
// This is a format check, not an official-municipality dictionary.
function validMunicipalityCandidate(value){
 const text=String(value??'').trim().normalize('NFKC');
 return text.length>=1&&text.length<=30&&text!=='市町村'
   &&/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u.test(text)
   &&!/丁目|番地|地番|号室|住居|郵便|電話|住所|連絡先/.test(text);
}
let masterSelectedField='市町村';
function renderMasters(){
  ensureStateSchema();
  const fields=['進捗ステータス','経過記録種別',...masterFields];
  $('#main').innerHTML=`<div class="hero"><div><h1>マスター管理</h1><p>入力候補を管理します。介護度・住所（市町村）・主治医は↑↓で並び替えできます。</p></div></div>
  <div class="panel"><div class="form-grid"><div class="field span2"><label>編集する項目</label><select id="mf">${fields.map(f=>`<option>${esc(f)}</option>`).join('')}</select></div></div></div>
  <div class="panel"><h3 id="masterTitle"></h3><p id="masterManualPolicy" class="notice">主治医・市町村・介護度は、ここで登録した候補だけを今後の共通候補に追加します。患者情報の手入力は自動追加しません。以前の共通候補は残しています。</p><div class="toolbar"><input id="newMaster" autocomplete="off" placeholder="新しい候補を入力"><button type="button" class="btn" id="addMaster">＋追加</button></div><p id="masterAddStatus" class="notice master-add-status" role="status" aria-live="polite">登録先：市町村。小美玉など「市」を省いた略称も追加できます。</p><div id="masterList"></div></div>`;
  // Default to city master, and retain the operator's selected field during
  // this session. The selected field is shown directly beside add feedback.
  const selector=$('#mf'),entry=$('#newMaster'),button=$('#addMaster'),status=$('#masterAddStatus');
  selector.value=fields.includes(masterSelectedField)?masterSelectedField:'市町村';
  const syncTarget=()=>{
    masterSelectedField=selector.value;
    entry.placeholder=masterSelectedField==='市町村'?'例：小美玉（市町村の略称OK）':'「'+masterSelectedField+'」の新しい候補';
    status.textContent=masterSelectedField==='市町村'?'登録先：市町村。「小美玉」「小美玉市」どちらも登録できます。':'登録先：'+masterSelectedField+'。新しい候補を入力して「＋追加」を押してください。';
    drawMasterList();
  };
  selector.onchange=syncTarget;
  button.onclick=()=>{void addMasterFromScreen();};
  entry.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();void addMasterFromScreen();}};
  syncTarget();
}
// Some dropdown values are system defaults or are still used by patients.
// Deleting them here would appear to succeed, then silently recreate them
// on the next ensureStateSchema() call. Explain why they cannot be deleted.
function masterValueIsProtected(field,value){
  if(field==='ベッド番号')return true; // Fixed official bed layout.
  if((defaultMasters[field]||[]).includes(value))return true;
  // A legacy patient-typed value might already be in the master list.
  // It can be removed from the global pick-list even while a patient uses it.
  // The patient-specific field value is never deleted or rewritten.
  if(EXPLICIT_ONLY_MASTER_FIELDS.has(field))return false;
  if(['進捗ステータス','経過記録種別'].includes(field))return false;
  return (state?.patients||[]).some(p=>String(p.data?.[field]??'').trim()===String(value));
}
// Persist a new patient-master snapshot atomically. Never show a master change
// as committed until the encrypted IndexedDB transaction has finished.
let masterWriteBusy=false;
async function commitMasterValues(field,values){
  if(masterWriteBusy){alert('マスターの保存処理中です。少し待ってください。');return false;}
  const action='マスターの変更';masterWriteBusy=true;let began=false;
  try{
    await beginMaintenance(action);began=true;
    const activeKey=key;
    const next={...state,masters:{...state.masters,[field]:uniq(values)},updatedAt:nowISO()};
    await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,activeKey)));
    if(activeKey!==key)throw new Error('保存中にロック状態が変わりました。');
    state=next;resetAutoLock();
    return true;
  }catch(e){alert('マスターの変更を保存できませんでした。元の候補は保持しています：'+(e.message||e));return false;}
  finally{if(began)endMaintenance(action);masterWriteBusy=false;}
}
async function commitMasterOrder(field,ordered){
  if(!ORDERABLE_MASTER_FIELDS.has(field))return false;
  if(masterWriteBusy){alert('ほかの保存処理が終わってから操作してください。');return false;}
  const current=masterValues(field);
  if(!Array.isArray(ordered)||ordered.length!==current.length||new Set(ordered).size!==current.length||ordered.some(v=>!current.includes(v))){
    alert('候補の内容が変更されたため、読み直してください。');return false;
  }
  const action='マスターの並び替え';masterWriteBusy=true;let began=false;
  try{
    await beginMaintenance(action);began=true;
    const activeKey=key;
    const next={...state,masterOrder:{...(state.masterOrder||{}),[field]:ordered.slice()},updatedAt:nowISO()};
    await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,activeKey)));
    if(activeKey!==key)throw new Error('ロック状態が変わりました');
    state=next;resetAutoLock();return true;
  }catch(e){alert('並び順の保存に失敗しました。元の順序を保持します：'+String(e.message||e));return false;}
  finally{if(began)endMaintenance(action);masterWriteBusy=false;}
}
function drawMasterList(){
 const f=$('#mf').value,vals=masterValues(f),ordered=ORDERABLE_MASTER_FIELDS.has(f);
 $('#masterTitle').textContent=`${f}　${vals.length}件`;
 const host=$('#masterList');
 host.innerHTML=(ordered?'<p class="master-sort-guide">「↑」「↓」で好きな順番に変更。自動保存され、患者情報の候補画面にも反映されます。</p>':'')+
 (vals.length?vals.map((v,i)=>{
  const move=ordered?`<div class="master-sort-buttons"><button type="button" class="master-sort-up" data-i="${i}" aria-label="${esc(v)}を上に移動" ${i===0?'disabled':''}>↑</button><button type="button" class="master-sort-down" data-i="${i}" aria-label="${esc(v)}を下に移動" ${i===vals.length-1?'disabled':''}>↓</button></div>`:'';
  const other=masterValueIsProtected(f,v)?'<span class="notice master-sort-status">標準・使用中：削除不可</span>':`<button class="btn danger masterDel" data-i="${i}" type="button">削除</button>`;
  return `<div class="settings-row master-sort-row"><div class="master-sort-name"><b>${esc(v)}</b></div><div class="master-sort-controls">${move}${other}</div></div>`;
 }).join(''):'<div class="empty">候補がありません</div>');
 host.querySelectorAll('.master-sort-up,.master-sort-down').forEach(btn=>btn.onclick=async()=>{
  if(masterWriteBusy)return;
  const from=Number(btn.dataset.i),to=from+(btn.classList.contains('master-sort-up')?-1:1);
  if(from<0||from>=vals.length||to<0||to>=vals.length)return;
  const next=vals.slice();[next[from],next[to]]=[next[to],next[from]];
  host.querySelectorAll('button').forEach(b=>b.disabled=true);
  await commitMasterOrder(f,next);
  if($('#mf')?.value===f&&host.isConnected)drawMasterList();
 });
 host.querySelectorAll('.masterDel').forEach(btn=>btn.onclick=async()=>{
  const value=vals[Number(btn.dataset.i)];
  if(masterValueIsProtected(f,value)){drawMasterList();return;}
  if(!confirm(`「${value}」を共通の候補一覧から削除しますか？\n患者情報に入力済みの値はそのまま残ります。`))return;
  btn.disabled=true;
  try{
   const next=(state.masters[f]||[]).filter(x=>x!==value);
   if(await commitMasterValues(f,next)&&$('#mf')?.value===f)drawMasterList();
  }finally{if(btn.isConnected)btn.disabled=false}
 });
}
// Show feedback before any synchronous or asynchronous validation/work.
// Staff should never be left with an unchanged field and no explanation.
async function addMasterFromScreen(){
  const input=$('#newMaster'),btn=$('#addMaster'),selector=$('#mf'),status=$('#masterAddStatus');
  const inform=message=>{if(status&&status.isConnected)status.textContent=message;else alert(message);};
  if(!input||!btn||!selector){
    inform('マスター登録画面が正しく読み込まれていません。患者データは変更していません。');
    return;
  }
  const f=String(selector.value||'');
  inform('「'+f+'」への追加ボタンを押しました。入力内容を確認しています…');
  if(btn.disabled){inform('現在、別の保存処理を実行中です。保存完了を確認してください。');return;}
  btn.disabled=true;
  const originalText=String(input.value||''),v=originalText.trim().normalize('NFKC');
  try{
    if(!v){inform('登録する候補が空欄です。文字を入力してください。');return;}
    if(f==='ベッド番号'){inform('ベッド番号は固定です。候補を追加できません。');return;}
    if(f==='市町村'&&!validMunicipalityCandidate(v)){
      inform('「'+v+'」は市町村の候補に登録できません。例：「小美玉」「小美玉市」のように入力してください。番地・数字・電話番号は登録できません。');
      return;
    }
    if(!state||!key){inform('アプリがロックされているため登録できません。');return;}
    if(masterValues(f).includes(v)){
      inform('「'+v+'」はすでに「'+f+'」の固定候補に登録されています。患者情報が変わっても候補は残ります。');
      return;
    }
    inform('「'+v+'」を「'+f+'」へ暗号化保存しています…');
    const ok=await commitMasterValues(f,[...(state.masters?.[f]||[]),v]);
    if(!ok){inform('保存できませんでした。エラー表示を確認してください。入力文字は残しています。');return;}
    // Confirm the encrypted IndexedDB record can actually be read again.
    // Do not display or export patient data during this check.
    const blob=await idbGet('data');
    const saved=await decryptObj(blob,key);
    if(!Array.isArray(saved?.masters?.[f])||!saved.masters[f].includes(v)){
      inform('保存後の読み戻し確認ができませんでした。候補一覧を確認してください。入力文字は残しています。');
      return;
    }
    if(selector.isConnected&&selector.value===f){
      drawMasterList();
      inform('固定候補に登録完了：「'+v+'」を「'+f+'」に保存し、再読み込みで確認できました。');
    }
    if(input.isConnected&&input.value===originalText)input.value='';
  }catch(error){
    inform('登録処理で問題が発生しました：'+String(error?.message||error).slice(0,140)+'。入力文字は残しています。');
  }finally{
    if(btn.isConnected)btn.disabled=false;
  }
}
// Diagnostic report intentionally contains only release/runtime facts, NOT patients,
// passwords, photos, hospital IDs, notes, task content, or indexedDB contents.
// It is a readiness report, not a security certification or a proof of offline behavior.
function diagnosticCheck(name, status, detail=''){
  return {name,status,detail};
}
async function collectEnvironmentDiagnostics(){
  const tests=[];
  tests.push(diagnosticCheck('指定URLとの一致',deploymentLocationAllowed(location)?'OK':'NG',
    deploymentLocationAllowed(location)?'指定した専用URLで起動':'許可されたURL以外です'));
  tests.push(diagnosticCheck('HTTPS/安全なコンテキスト',
    location.protocol==='https:'&&isSecureContext?'OK':'NG',
    location.protocol==='https:'&&isSecureContext?'HTTPSで起動':'HTTPS接続が必要'));
  const knownShared=location.hostname==='piimanbokumetsu-code.github.io';
  const githubPages=location.hostname.endsWith('.github.io');
  tests.push(diagnosticCheck('専用ホストの分離',knownShared?'NG':'要管理確認',
    knownShared?'既存MVP01と同じオリジンです。実患者情報の入力は禁止します':
    githubPages?'別のGitHub Pagesホストです。組織内の他の公開アプリ・配信権限を管理者が確認してください':
    '専用ホストかどうか、管理者・配信権限は別途確認が必要です'));
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  tests.push(diagnosticCheck('ホーム画面での単独起動',standalone?'OK':'未確認',
    standalone?'単独画面として起動中':'Safariで表示中。ホーム画面版で再診断してください'));
  if(!('serviceWorker' in navigator)){
    tests.push(diagnosticCheck('オフライン用制御', 'NG','この環境ではService Workerが利用できません'));
  }else{
    try{
      const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);
      const controlling=!!navigator.serviceWorker.controller;
      tests.push(diagnosticCheck('オフライン用制御',reg?.active&&controlling?'OK':'要再起動',
        reg?.active&&controlling?'Service Workerが有効':'初回起動なら一度画面を閉じて開き直してください'));
    }catch(e){tests.push(diagnosticCheck('オフライン用制御','未確認','登録状態を取得できません'))}
  }
  if(!('caches' in window)){
    tests.push(diagnosticCheck('アプリ資産の事前保存','未確認','キャッシュAPIが利用できません'));
  }else{
    try{
      const names=(await caches.keys()).filter(name=>name.startsWith('msw-mvp01-clinical-rc-'));
      const pathRoot=new URL('./',location.href);
      let available=false;
      for(const name of names){
        const cache=await caches.open(name);
        const start=await cache.match(new URL('./index.html',pathRoot).href);
        const script=await cache.match(new URL('./app.js?v=mvp01-sec13-20261021clinicalpilot6',pathRoot).href);
        if(start&&script){available=true;break;}
      }
      tests.push(diagnosticCheck('アプリ資産の事前保存',available?'OK':'要再起動',
        available?'画面とコードの保存を確認。実際のオフライン起動は別途必要':'初回起動後に再診断してください'));
    }catch(e){tests.push(diagnosticCheck('アプリ資産の事前保存','未確認','キャッシュを読み取れません'))}
  }
  try{
    const metadata=await idbGet('meta'),ciphertext=await idbGet('data');
    if(metadata&&ciphertext&&key){
      const actual=await decryptObj(ciphertext);
      tests.push(diagnosticCheck('暗号化した保存データの読取',Array.isArray(actual?.patients)?'OK':'NG',
        Array.isArray(actual?.patients)?'復号後の構造のみ確認。患者内容は診断に含めません':'保存データの構造が不正です'));
    }else tests.push(diagnosticCheck('暗号化した保存データの読取','未確認','暗証解除後に実行してください'));
  }catch(e){tests.push(diagnosticCheck('暗号化した保存データの読取','NG','保存データの読取または復号に失敗しました'))}
  try{
    const persistent=await navigator.storage?.persisted?.();
    tests.push(diagnosticCheck('端末保存の永続化',persistent===true?'OK':persistent===false?'注意':'未確認',
      persistent===true?'保持要求が承認されています':persistent===false?'通常保存。iPadOSにより消去される可能性があります':'取得できません'));
  }catch(e){tests.push(diagnosticCheck('端末保存の永続化','未確認','保存領域の状態を取得できません'))}
  return tests;
}
function formatEnvironmentDiagnostics(tests){
  return ['MSW-MVP01 sec13 配信・端末診断（導入候補）',
    '※この報告は患者情報・暗証番号を含みません。',
    ...tests.map(t=>`[${t.status}] ${t.name}: ${t.detail}`),
    '※実機でのオフライン起動・改ざん対策・勤務先承認は別途必要。',
    '※本診断だけでは運用開始の承認にはなりません。'].join('\n');
}

// A failed write must never falsely mark the backup as confirmed in RAM.
// Otherwise a later unrelated save could persist a backup date that was never verified.
async function markBackupFileVerified(){
  if(maintenanceAction||backupBusy||restoreBusy||resetInProgress||patientCsvBusy){
    alert('データ管理処理が終わってからバックアップ保存を確認してください。');return false;
  }
  if(!key||!state)return false;
  const previous=state.settings.lastBackupAt??null,stamp=nowISO();
  state.settings.lastBackupAt=stamp;
  try{await save();return true}
  catch(e){
    if(state?.settings?.lastBackupAt===stamp)state.settings.lastBackupAt=previous;
    alert('バックアップ確認日時を保存できませんでした：'+(e.message||e));
    return false;
  }
}
async function renderSettings(){
  const est=navigator.storage?.estimate?await navigator.storage.estimate():{};
  const usage=est.usage||0,quota=est.quota||0,pct=quota?Math.min(100,usage/quota*100):0;
  let persisted='未確認'; try{if(navigator.storage?.persisted)persisted=(await navigator.storage.persisted())?'保持を要求済み':'通常保存'}catch(e){}
  const last=state.settings.lastBackupAt?new Date(state.settings.lastBackupAt).toLocaleString('ja-JP'):'まだありません';
  $('#main').innerHTML=`<div class="hero"><div><h1>設定</h1><p>移行・バックアップ・容量・セキュリティを管理します。</p></div></div>
  <div class="panel"><h3>データ移行</h3><p class="notice">住所・電話番号・連絡先の列はCSVに含まれていても保存しません。氏名・病名・病院ID・FileMaker番号は取り込みます。写真や自由記述の内容は対象外です。</p><div class="settings-row"><div><b>患者CSVを読み込む</b><small>病院の「ＩＤ」で患者を照合。「番号」は全員同じでも問題ありません。タスク・記録・写真も残します。ICU3-10以降は未配置扱い。追加・更新は既存の記録を保持します。必要なときだけ手動でバックアップできます。</small></div><button class="btn secondary" id="impP">読込</button></div><div class="settings-row"><div><b>ベッド照合（保存なし）</b><small>同じCSVを選び、MVP01の現在のベッド番号と比較します。患者氏名・IDの表示・外部送信・保存・更新は行いません。人数と差異の例だけ確認できます。</small></div><button class="btn secondary" id="auditP" type="button">照合</button></div><pre id="bedAuditResult" class="notice" style="white-space:pre-wrap;overflow-wrap:anywhere" role="status" aria-live="polite"></pre><div class="settings-row"><div><b>初回49人のベッド照合基準を確定</b><small>上の照合で一致43人・不一致6人を確認し、MVP01の現在の49人全員の配置が正しいと確定した場合だけ使います。選択したCSVの古いベッド位置を比較用として暗号化記録します。患者のベッドや情報は変更しません。再登録はできません。</small></div><button class="btn secondary" id="confirmBedBaseline" type="button">基準を登録</button></div><pre id="bedBaselineResult" class="notice" style="white-space:pre-wrap;overflow-wrap:anywhere" role="status" aria-live="polite"></pre><div class="settings-row"><div><b>薬剤CSVを読み込む</b><small>医薬品分類・薬価・薬効・薬名の4列。</small></div><button class="btn secondary" id="impD">読込</button></div></div>
  <div class="panel"><h3>全件入れ替え（危険：現在の記録を全消去）</h3><div class="settings-row"><div><b>患者CSVで全件入れ替え（記録も消去）</b><small>患者データ・タスク・経過記録・写真をすべて置換します。薬剤・マスター・設定は保持します。実務試用版では安全のため全件入れ替えを停止しています。</small></div><button class="btn danger" id="replaceP">全件入れ替え</button></div></div>
  <div class="panel"><h3>退院患者の保存</h3><p class="notice">Ver.1.0.17から退院患者の自動削除を停止しました。退院確定後も記録を保存し、患者画面の「退院患者記録」から検索・閲覧・確定取消できます。</p><div class="settings-row"><b>保存中の退院患者</b><span>${state.patients.filter(p=>p.dischargeDate).length}名</span></div></div>
  <div class="panel"><h3>セキュリティ</h3><div class="settings-row"><div><b>自動ロック</b><small>無操作時に暗証画面へ戻ります。</small></div><select id="autolock"><option value="1">1分</option><option value="5">5分</option><option value="10">10分</option><option value="30">30分</option></select></div><div class="settings-row"><div><b>暗証を変更</b><small>現在の暗証を確認後、新しい暗証でDBを再暗号化します。</small></div><button class="btn secondary" id="changePin">変更</button></div></div>
  <div class="panel"><h3>必要時のみ：手動バックアップ</h3><p class="notice">定期バックアップは必須にしません。患者情報を長期間保管する目的ではなく、端末故障時に残したい未完了タスクや記録がある場合、端末変更や全件入替の前など必要な場面で利用します。保存したファイルの管理・削除にも注意してください。</p><div class="settings-row"><div><b>暗号化バックアップ</b><small>患者・薬剤・経過記録・マスターを暗号化したまま書き出します。<br>保存確認済み：${esc(last)}</small></div><button class="btn secondary" id="backup">書出</button></div><div class="settings-row"><div><b>ファイルへの保存確認</b><small>「ファイル」アプリに .mswdb があることを実際に確認してから押してください。復元成功の証明ではありません。</small></div><button class="btn secondary" id="backupVerified">保存確認済み</button></div><div class="settings-row"><div><b>バックアップ復元</b><small>.mswdb ファイルを読み込みます。</small></div><button class="btn secondary" id="restore">復元</button></div></div>
  <div class="panel"><h3>端末保存</h3><div class="settings-row"><div><b>保存領域</b><small>${esc(persisted)} / 使用量 ${humanBytes(usage)}${quota?' / 上限目安 '+humanBytes(quota):''}</small></div><button class="btn secondary" id="persist">保持を要求</button></div><div class="storagebar"><div style="width:${pct}%"></div></div><p class="notice">iPadではホーム画面から起動してください。写真・PDFの元画像は暗号化して端末内に保存します。端末故障・データ消失時はバックアップなしでは復元できません。必要性と保存先は勤務先の運用方針に従って判断してください。</p></div>
  <div class="panel"><h3>配信・端末の診断（導入候補）</h3><p class="notice">ボタン1回でURL・オフライン用の保存準備・暗号化データの読取などを点検します。患者氏名・病名・記録・暗証は報告に含めません。これは実際のオフライン動作や実務利用の安全性を証明するものではありません。</p><button class="btn secondary" id="runEnvDiagnostics" type="button">環境を診断</button> <button class="btn secondary" id="copyEnvDiagnostics" type="button" hidden>結果をコピー</button><pre id="envDiagnosticsResult" class="notice" style="white-space:pre-wrap;overflow-wrap:anywhere" role="status" aria-live="polite"></pre></div>
  <div class="panel"><h3>ソフト本体の復旧（患者データとは別）</h3><p class="notice">iPad miniが故障した場合、管理された配信先に保管済みの同じプログラムを新しい端末で開き、ホーム画面に追加できます。アプリ本体は再設置できますが、端末内の患者・タスク・記録は自動復旧しません。患者情報は電子カルテ等から再入力し、暗号化バックアップがある場合のみ別途復元します。配信先やプログラムが消えたときは、管理者が検証済み復旧キットから再配信する必要があります。</p><button class="btn secondary" id="recoverGuide" type="button">復旧手順を表示</button></div>
  <div class="panel"><h3>初期化</h3><div class="settings-row"><div><b>この端末のMSW-DBを全消去</b><small>患者・薬剤・マスター・暗証をすべて削除します。復元にはバックアップが必要です。</small></div><button class="btn danger" id="resetAll">全消去</button></div></div>
  <div class="panel"><div class="notice">MSW-DB 架空データ専用 Ver.${APP_VERSION} / 在院 ${activePatients().length}人 / 薬剤 ${state.drugs.length}件</div></div>`;
  $('#autolock').value=String(state.settings.autoLockMin??5);
  $('#autolock').onchange=async e=>{state.settings.autoLockMin=+e.target.value;await save();resetAutoLock()};
  $('#replaceP').onclick=()=>pickFile('.csv',replacePatientsFromFileMaker);
  $('#impP').onclick=()=>pickFile('.csv',importPatients);$('#auditP').onclick=()=>pickFile('.csv',auditPatientBedCsvFile);$('#confirmBedBaseline').onclick=()=>pickFile('.csv',enrollVerifiedBedBaseline);$('#impD').onclick=()=>pickFile('.csv',importDrugs);
  $('#backup').onclick=backup;$('#restore').onclick=()=>pickFile('.mswdb,application/json',restore);
  $('#backupVerified').onclick=async()=>{
    if(!confirm('iPadの「ファイル」アプリで .mswdb が存在することを直接確認しましたか？\nこれは復元試験の完了を意味しません。'))return;
    if(await markBackupFileVerified())renderSettings();
  };
  $('#changePin').onclick=changePin;
  $('#persist').onclick=async()=>{try{const ok=navigator.storage?.persist?await navigator.storage.persist():false;alert(ok?'保存領域の保持を要求しました。':'このブラウザでは保持要求を利用できないか、許可されませんでした。');renderSettings()}catch(e){alert('保持要求を実行できませんでした。')}};
  $('#runEnvDiagnostics').onclick=async()=>{
    const btn=$('#runEnvDiagnostics'),result=$('#envDiagnosticsResult'),copy=$('#copyEnvDiagnostics');
    btn.disabled=true;result.textContent='診断中…';copy.hidden=true;
    try{
      const tests=await collectEnvironmentDiagnostics();
      result.textContent=formatEnvironmentDiagnostics(tests);
      copy.hidden=false;
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(result.textContent);alert('患者情報を含まない診断結果をコピーしました。')}catch(e){alert('コピーできませんでした。必要な場合は表示内容を選択してコピーしてください。')}};
    }catch(e){result.textContent='診断を完了できませんでした。アプリを開き直して再実行してください。';}
    finally{btn.disabled=false;}
  };
  $('#recoverGuide').onclick=()=>alert('【ソフト本体の再設置】\n1. 管理者が保管した同一バージョンの配信URLを確認\n2. 新しいiPad miniのSafariでそのURLを開く\n3. ホーム画面に追加\n4. 初期暗証を設定\n5. 電子カルテなどから必要な情報だけを再入力\n\n注意：患者・タスク・経過記録は自動で復元しません。紛失した端末のデータはこの操作では取り戻せません。本番設置前のテスト版には架空患者のみを入力してください。');
  $('#resetAll').onclick=resetAll;
}
async function changePin(){
  const action='暗証変更';
  try{
    await beginMaintenance(action);
  const oldPin=prompt('現在の暗証を入力してください'); if(oldPin===null)return;
  try{const oldKey=await derive(oldPin,unb64(meta.salt));await decryptObj(meta.check,oldKey)}catch(e){return alert('現在の暗証が違います。')}
  const np=prompt('新しい暗証（12文字以上、数字だけでなく文字も使用）を入力してください');if(np===null)return;if(!strongNewPin(np))return alert('新しい暗証は12文字以上で、数字と文字を組み合わせてください。');
  const np2=prompt('確認のため新しい暗証をもう一度入力してください');if(np!==np2)return alert('新しい暗証が一致しません。');
  const salt=crypto.getRandomValues(new Uint8Array(16));const newKey=await derive(np,salt);const newMeta={version:1,salt:b64(salt),check:await encryptObj({ok:true},newKey),createdAt:meta.createdAt||nowISO(),changedAt:nowISO()};
  // Re-encrypt every referenced photo together with the patient state and PIN metadata.
  // Do not switch the in-memory key unless the entire IndexedDB transaction commits.
  try{
    await dataWriteTail; // Earlier saves must not commit after the new encryption key.
    const records=[];
    const ids=new Set(state.patients.flatMap(p=>(p.attachments||[]).map(m=>m.id)));
    for(const id of ids){
      const oldCipher=await idbGet(photoKey(id));
      if(!oldCipher)throw new Error('写真データが見つかりません: '+id);
      const plain=await decryptObj(oldCipher,key);
      records.push([photoKey(id),await encryptObj(plain,newKey)]);
    }
    const nextState={...state,updatedAt:nowISO()};
    records.push(['data',await encryptPatientIndex(nextState,newKey)],['meta',newMeta]);
    await idbSetMany(records);
    state=nextState;meta=newMeta;key=newKey;
    alert('暗証を変更しました。写真も新しい暗証で保護されています。');
  }catch(e){alert('暗証の変更を中止しました。以前の暗証とデータは維持されます：'+e.message)}
  }catch(e){alert('暗証変更を開始できませんでした：'+e.message)}
  finally{endMaintenance(action)}
}
async function resetAll(){
  if(resetInProgress)return;
  if(!confirm('この端末のMSW-DBデータをすべて削除します。\n写真を含みます。バックアップが無い場合は復元できません。'))return;
  const word=prompt('実行する場合は「全消去」と入力してください');if(word!=='全消去')return;
  resetInProgress=true;
  const action='全消去';
  try{
    await beginMaintenance(action);
    // Any already-queued encrypted index writes must finish before deletion.
    // The guard above prevents new regular saves from being queued.
    await dataWriteTail;
    await idbClearAll();
    clearPatientAutoTimer();clearBasicPhotoPreview();dismissPhotoViewer();
    document.querySelectorAll('#modal,#duplicateModal,#groupedBedPicker,#dischargeFlow,#morningPrint').forEach(el=>el.remove());
    meta=null;key=null;state=null;selectedPatient=null;clearTimeout(lockTimer);
    alert('この端末のアプリ内データをすべて削除しました（写真を含む）。保存済みバックアップファイルは別途管理してください。');
    renderLock();
  }catch(e){alert('全消去に失敗しました。データが残っているか確認してください：'+(e.message||e))}
  finally{endMaintenance(action);resetInProgress=false}
}
function pickFile(accept,cb){const f=$('#fileInput');f.accept=accept;f.value='';f.onchange=()=>{if(f.files[0])cb(f.files[0])};f.click()}
// FileMaker exports can be UTF-8, Shift_JIS (CP932), or UTF-16LE.
// Decode strictly and never import silently corrupted Japanese text.
async function readFileMakerCsv(file){
  if(!file||!Number.isFinite(file.size)||file.size===0||file.size>10*1024*1024)
    throw new Error('CSVは10MB以下の空でないファイルを選んでください。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let text,encoding;
  if(bytes[0]===0xff&&bytes[1]===0xfe){
    text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(2));encoding='UTF-16LE';
  }else if(bytes[0]===0xfe&&bytes[1]===0xff){
    text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes.subarray(2));encoding='UTF-16BE';
  }else{
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='UTF-8'}
    catch(e){text=new TextDecoder('shift_jis',{fatal:true}).decode(bytes);encoding='Shift_JIS'}
  }
  if(text.includes('\u0000')||text.includes('\ufffd'))throw new Error('CSVの文字コードが正しく判定できませんでした。');
  return{text,encoding};
}
// Strict CSV parser: reject broken quotes or missing/extra columns instead of
// truncating cells (which could overwrite patient information with blanks).
function parseCSV(text){
  text=String(text).replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',mode='start',line=1;
  function endCell(){row.push(cell);cell='';mode='start'}
  function endRow(){endCell();rows.push(row);row=[];if(rows.length>50001)throw new Error('CSVの行数が多すぎます。')}
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(mode==='quoted'){
      if(c==='"'){
        if(text[i+1]==='"'){cell+='"';i++}else mode='afterQuote';
      }else{cell+=c;if(c==='\n')line++}
    }else if(c===','){endCell()}
    else if(c==='\n'||c==='\r'){
      endRow();line++;
      if(c==='\r'&&text[i+1]==='\n')i++;
    }else if(mode==='start'&&c==='"'){mode='quoted'}
    else if(c==='"'||mode==='afterQuote')throw new Error(`${line}行目：CSVの引用符（ダブルクォート）が不正です。`);
    else{cell+=c;mode='unquoted'}
  }
  if(mode==='quoted')throw new Error(`${line}行目：引用符が閉じられていません。`);
  if(row.length||cell.length||mode!=='start')endRow();
  return rows;
}
function readPatientCsvRows(csvText){
  const rows=parseCSV(csvText);
  if(!rows.length)throw new Error('CSVに見出し行がありません。');
  const headers=rows[0].map(h=>String(h).trim());
  if(headers.some(h=>!h))throw new Error('CSVに空欄の列名があります。');
  if(new Set(headers).size!==headers.length)throw new Error('CSVの列名が重複しています。');
  const objects=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];if(r.every(v=>!String(v).trim()))continue;
    if(r.length!==headers.length)throw new Error(`${i+1}行目：列数が見出しと異なります（${r.length}列／${headers.length}列）。`);
    const record=Object.fromEntries(headers.map((h,j)=>[h,r[j]]));
    // Legacy FileMaker output uses 家構; accept its readable alias as well.
    if(headers.includes('家族構成')&&!headers.includes('家構'))record['家構']=record['家族構成'];
    if(headers.includes('ID')&&!headers.includes('ＩＤ'))record['ＩＤ']=record['ID'];
    objects.push(record);
  }
  return{headers,rows:objects};
}
function rowsToObjects(rows){const h=rows[0]||[];return rows.slice(1).filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
function fileMakerBed(bed){
  // Do not renumber ICU3-7~15 automatically: 7~9 are official beds,
  // 10~15 are displayed as unassigned, retaining the original bed string.
  return normalizeBed(bed);
}
// Patient safety: a different FileMaker record number must not create a second
// active record with the same hospital ID. Staff must resolve legitimate
// duplicate admissions explicitly; never guess which admission should win.
function assertUniqueActiveHospitalIds(patients){
  const seen=new Map();
  for(const p of patients){
    if(p.dischargeDate)continue;
    const hospitalId=String(p.data?.['ＩＤ']??p.data?.['ID']??'').trim();
    if(!hospitalId)continue;
    const fileMakerId=String(p.data?.['番号']??'').trim();
    if(seen.has(hospitalId)){
      const prior=seen.get(hospitalId);
      if(prior!==fileMakerId)
        throw new Error('同じ病院IDに異なるFileMaker番号の在院患者があります。患者の取り違えを防ぐため取り込みを中止しました。');
      throw new Error('同じ病院IDの在院患者が重複しています。取り込みを中止しました。');
    }
    seen.set(hospitalId,fileMakerId);
  }
}
// CSV patient identity is hospital ID (ＩＤ). FileMaker 番号 may be 1 for all rows.
// Keep 番号 only as an optional original field; never use it as a matching key.
function prepareFileMakerMerge(csvText,currentPatients=state.patients){
  const {headers,rows:rowsIn}=readPatientCsvRows(csvText);
  const idCol='ＩＤ';
  if(!(headers.includes('ＩＤ')||headers.includes('ID'))||!headers.includes('氏名')||!headers.includes('ベッド番号'))throw new Error('必要な列（病院の「ＩＤ」または「ID」・氏名・ベッド番号）がありません。');
  if(!rowsIn.length)throw new Error('患者データがありません。');
  const patients=currentPatients.map(p=>({...p,data:{...p.data}}));
  const seen=new Set();let added=0,updated=0,normalized=0,unplaced=0,protectedBeds=0,csvBedMoves=0,unverifiedDifferences=0;
  const protectedDestinations=new Set();
  for(let i=0;i<rowsIn.length;i++){
    const o=rowsIn[i],id=String(o[idCol]??'').trim(),name=String(o['氏名']??'').trim();
    if(!id||!name)throw new Error(`${i+2}行目：患者IDまたは氏名が空欄です。`);
    if(seen.has(id))throw new Error(`${i+2}行目：CSV内に患者IDが重複しています。`);
    seen.add(id);
    const matching=patients.filter(p=>String(p.data?.['ＩＤ']||p.data?.['ID']||'').trim()===id);
    if(matching.length>1)throw new Error(`${i+2}行目：既存患者に同じIDが複数あります。取り込みを中止しました。`);
    let p=matching[0];
    if(p?.dischargeDate)throw new Error(`${i+2}行目：退院済みの同一IDが存在します。再入院か確認してください。`);
    if(p){
      const oldHospitalId=String(p.data?.['ＩＤ']||p.data?.['ID']||'').trim();
      const csvHospitalId=String(o['ＩＤ']||o['ID']||'').trim();
      const sameHospitalId=Boolean(oldHospitalId&&csvHospitalId&&oldHospitalId===csvHospitalId);
      if(oldHospitalId&&csvHospitalId&&!sameHospitalId)
        throw new Error(`${i+2}行目：病院IDの病院IDが既存患者と違います。手動照合してください。`);
      const normalName=v=>String(v??'').replace(/[\s\u3000]/g,'');
      if(normalName(p.data?.['氏名'])&&normalName(p.data?.['氏名'])!==normalName(name))
        throw new Error(`${i+2}行目：病院IDの氏名が既存患者と異なります。自動上書きせず手動照合してください。`);
      const oldAdmission=String(p.data?.['入院日']??'').trim();
      const csvAdmission=String(o['入院日']??'').trim();
      const day=v=>String(v).replace(/\//g,'-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/,(_m,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
      if(oldAdmission&&csvAdmission&&day(oldAdmission)!==day(csvAdmission))
        throw new Error(`${i+2}行目：病院IDの入院日が異なります。再入院か確認してください。`);
    }
    // A legacy patient without FileMaker 番号 must never be matched automatically
    // using hospital ＩＤ or name: that would risk linking a different admission.
    if(!p){
      const norm=v=>String(v??'').replace(/\s/g,'');
      const legacyCandidate=patients.some(x=>!x.dischargeDate&&!String(x.data?.['ＩＤ']||x.data?.['ID']||'').trim()&&norm(x.data?.['氏名'])===norm(name));
      if(legacyCandidate)throw new Error(`${i+2}行目：病院IDが未設定の同姓同名患者がいます。手動照合してください。`);
    }
    if(!p){
      const sameNameWithoutId=patients.some(x=>!x.dischargeDate&&String(x.data?.['氏名']??'').replace(/\s/g,'')===name.replace(/\s/g,'')&&![x.data?.['番号'],x.data?.['ＩＤ']].some(v=>String(v??'').trim()));
      if(sameNameWithoutId)throw new Error(`${i+2}行目：患者ID未設定の同姓同名患者があります。重複を確認してください。`);
      p=newPatient();delete p._new;patients.push(p);added++;
    }else updated++;
    // Three-way bed merge: the last FileMaker bed, current app bed, and incoming
    // FileMaker bed are independent. All metadata stays inside encrypted local
    // patient state. Earlier PILOT-IDKEY1 imports have no baseline: on their
    // first re-import, an existing mismatch is treated as a local correction.
    // Never rewrite any local position before the user approves the preview.
    const incomingBed=fileMakerBed(o['ベッド番号']);
    const appBed=normalizeBed(p.data?.['ベッド番号']);
    const knownCsvBed=typeof p.lastFileMakerBed==='string';
    const previousCsvBed=knownCsvBed?normalizeBed(p.lastFileMakerBed):null;
    let preserveManualBed=false;
    if(matching.length===1){
      if(!knownCsvBed){
        preserveManualBed=appBed!==incomingBed;
        if(preserveManualBed)unverifiedDifferences++;
      }else if(appBed!==previousCsvBed){
        // If both the source and the app moved to different destinations since
        // the prior sync, we cannot safely decide whose transfer is correct.
        if(incomingBed!==previousCsvBed&&incomingBed!==appBed)
          throw new Error(`${i+2}行目：FileMakerとMVP01の両方でベッド番号が別々に変更されています。配置を照合してから再度取り込んでください。`);
        preserveManualBed=incomingBed!==appBed;
      }
      if(preserveManualBed){
        protectedBeds++;
        if(isMappedBed(appBed))protectedDestinations.add(appBed);
      }else if(appBed!==incomingBed){
        csvBedMoves++;
      }
    }
    for(const field of legacyFields){
      if(isProhibitedContactField(field)||!Object.prototype.hasOwnProperty.call(o,field))continue;
      if(field==='ベッド番号'&&preserveManualBed)continue;
      p.data[field]=field==='ベッド番号'?incomingBed:String(o[field]??'').trim();
    }
    // Keep source provenance separate from the clinician-corrected bed.
    p.lastFileMakerBed=incomingBed;
    // The CSV 番号, when provided, is copied above. Never overwrite it with hospital ID.
    if(String(o['ベッド番号']??'').trim()!==incomingBed)normalized++;
    if(p.data['ベッド番号']&&!isMappedBed(p.data['ベッド番号']))unplaced++;
    p.updatedAt=nowISO();
  }
  // For pre-baseline imported records, a widespread discrepancy can indicate
  // an incorrect CSV column, wrong export, or unexpected source change.
  // Never infer that all 49 patients were manually relocated.
  const suspiciousThreshold=Math.max(5,Math.floor(updated*0.25));
  if(unverifiedDifferences>suspiciousThreshold)
    throw new Error('ベッド番号がCSVと'+unverifiedDifferences+'人分異なります（前回のFileMaker番号が未記録）。設定の「ベッド照合（保存なし）」で確認してください。患者データは更新していません。');
  // Do not silently hide a second occupant on a bed where a local correction
  // was kept. Reject only newly introduced conflicts, not existing duplicates.
  for(const bed of protectedDestinations){
    const oldCount=currentPatients.filter(x=>!x.dischargeDate&&normalizeBed(x.data?.['ベッド番号'])===bed).length;
    const newCount=patients.filter(x=>!x.dischargeDate&&normalizeBed(x.data?.['ベッド番号'])===bed).length;
    if(newCount>Math.max(1,oldCount))
      throw new Error(`保護したベッド${bed}にCSV由来の患者が重複します。配置を確認してから再度取り込んでください。`);
  }
  assertUniqueActiveHospitalIds(patients);
  removeProhibitedContactFieldsFromState({patients});
  return{patients,added,updated,normalized,unplaced,protectedBeds,csvBedMoves,skippedContactColumns:headers.filter(isProhibitedContactField).length};
}

// Strictly read-only local CSV comparison. This function does not call save(),
// idbSet(), fetch(), or change patient state. Do not reveal names / IDs in UI.
function auditPatientBedCsvText(csvText,currentPatients=state.patients){
  const {headers,rows}=readPatientCsvRows(csvText);
  if(!headers.includes('ＩＤ')&&!headers.includes('ID'))throw new Error('CSVに病院ID列がありません。');
  if(!headers.includes('ベッド番号'))throw new Error('CSVにベッド番号列がありません。');
  const byId=new Map();
  for(const p of currentPatients){
    if(p.dischargeDate)continue;
    const id=String(p.data?.['ＩＤ']||p.data?.['ID']||'').trim();
    if(!id)continue;
    if(byId.has(id))throw new Error('MVP01内に同じ病院IDが複数あります。安全のため照合を中止しました。');
    byId.set(id,p);
  }
  const seen=new Set(), samples=[];
  let matched=0,equal=0,different=0,csvOnly=0,appBlank=0,csvBlank=0,unknownBaseline=0;
  for(const row of rows){
    const id=String(row['ＩＤ']||row['ID']||'').trim();
    if(!id||seen.has(id))throw new Error('CSVに病院IDの空欄または重複があります。安全のため照合を中止しました。');
    seen.add(id);
    const patient=byId.get(id);
    if(!patient){csvOnly++;continue;}
    matched++;
    const appBed=normalizeBed(patient.data?.['ベッド番号']);
    const csvBed=fileMakerBed(row['ベッド番号']);
    if(!appBed)appBlank++;
    if(!csvBed)csvBlank++;
    if(appBed===csvBed){equal++;continue;}
    different++;
    if(typeof patient.lastFileMakerBed!=='string')unknownBaseline++;
    if(samples.length<3){
      const bedLabel=v=>!v?'(空欄)':/^(?:[0-9]{3}(?:-[0-9]{1,2})?|ICU[1-3](?:-[0-9]{1,2}(?:-[0-9]{1,2})?)?)$/.test(v)?v:'(ベッド表記以外)';
      samples.push({app:bedLabel(appBed),csv:bedLabel(csvBed)});
    }
  }
  return {csvRows:rows.length,matched,equal,different,csvOnly,appOnly:[...byId.keys()].filter(id=>!seen.has(id)).length,appBlank,csvBlank,unknownBaseline,samples};
}
function formatPatientBedAudit(report){
  return [
    '【FileMaker CSV ↔ MVP01 ベッド番号照合・保存なし】',
    'CSVの患者数：'+report.csvRows+'人',
    '病院IDで照合できた：'+report.matched+'人',
    'ベッド番号が一致：'+report.equal+'人',
    'ベッド番号が不一致：'+report.different+'人',
    'CSVだけにいる患者：'+report.csvOnly+'人',
    'MVP01だけにいる患者：'+report.appOnly+'人',
    'MVP01側のベッド空欄：'+report.appBlank+'人',
    'CSV側のベッド空欄：'+report.csvBlank+'人',
    '不一致のうち前回CSV配置が未記録：'+report.unknownBaseline+'人',
    ...(report.samples.length?['差異の例（氏名・IDは出しません）:',
      ...report.samples.map((v,i)=>(i+1)+'. MVP01「'+v.app+'」／CSV「'+v.csv+'」')]:[]),
    '※これは表示のみ。患者情報やベッド位置を書き換えません。',
    '※人数だけチャッピーに伝えてください。氏名・ID・ファイルは送信不要。'
  ].join('\n');
}
// One-time baseline enrollment for the 49 verified active patients.
// Compare only: do not import CSV fields or replace clinician-corrected beds.
// The caller explicitly confirms the exact 49/43/6 audit results before any
// encrypted metadata is saved. Subsequent attempts must not reset the baseline.
function prepareVerifiedBedBaseline(csvText,currentPatients=state.patients){
  const report=auditPatientBedCsvText(csvText,currentPatients);
  if(report.csvRows!==49||report.matched!==49||report.equal!==43||report.different!==6||
     report.csvOnly!==0||report.appOnly!==0||report.appBlank!==0||report.csvBlank!==0||
     report.unknownBaseline!==6)
    throw new Error('初回確認時の49人・一致43人・差異6人と照合結果が異なります。保存せず再確認してください。');
  const {rows}=readPatientCsvRows(csvText);
  const rowsById=new Map();
  for(const row of rows){
    const id=String(row['ＩＤ']||row['ID']||'').trim();
    if(!id||rowsById.has(id))throw new Error('CSVの病院IDが空欄または重複しています。');
    rowsById.set(id,row);
  }
  const confirmedAt=nowISO();
  const patients=currentPatients.map(p=>{
    if(p.dischargeDate)return {...p};
    const id=String(p.data?.['ＩＤ']||p.data?.['ID']||'').trim(),row=rowsById.get(id);
    if(!row)throw new Error('病院IDに一致するCSVの患者がいません。');
    if(typeof p.lastFileMakerBed==='string')
      throw new Error('比較基準がすでに登録されています。再登録で上書きしません。');
    const normalizeName=v=>String(v??'').replace(/[\s\u3000]/g,'');
    if(!normalizeName(p.data?.['氏名'])||normalizeName(p.data['氏名'])!==normalizeName(row['氏名']))
      throw new Error('患者氏名がCSVと一致しません。基準登録を中止します。');
    const day=v=>String(v).replace(/\//g,'-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/,(_m,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    const d1=String(p.data?.['入院日']??'').trim(),d2=String(row['入院日']??'').trim();
    if(d1&&d2&&day(d1)!==day(d2))throw new Error('入院日がCSVと一致しません。基準登録を中止します。');
    const sourceBed=fileMakerBed(row['ベッド番号']);
    const currentBed=normalizeBed(p.data?.['ベッド番号']);
    if(!sourceBed||!currentBed)throw new Error('ベッド番号が空欄の患者がいます。基準登録を中止します。');
    // Do not touch p.data, tasks, notes, photos, status, or current bed.
    return {...p,lastFileMakerBed:sourceBed,bedBaselineVerifiedAt:confirmedAt};
  });
  return {patients,report};
}
async function enrollVerifiedBedBaseline(file){
  const name='FileMakerベッド比較基準の確定';
  const resultEl=$('#bedBaselineResult');
  if(!resultEl)return;
  if(patientCsvBusy){resultEl.textContent='CSV管理処理中です。完了後に再試行してください。';return;}
  patientCsvBusy=true;
  try{
    await preflightPatientImport({reserved:true});
    await beginMaintenance(name,{allowCsv:true});
    const {text}=await readFileMakerCsv(file);
    const {patients,report}=prepareVerifiedBedBaseline(text);
    const yes=confirm('【初回49人のベッド位置を基準登録】\nCSV：49人／病院ID一致：49人\nベッド一致：43人／不一致：6人\n\n現在MVP01にある49人のベッド配置が全員正しいことを確認済みですか？\n\n「OK」でCSV側の古いベッド番号だけを比較用として暗号化保存します。患者のベッド位置・氏名・記録・写真は変更しません。\nこの基準は2回目以降の自動上書きができません。');
    if(!yes){resultEl.textContent='基準登録をキャンセルしました。患者情報は変更していません。';return;}
    const next={...state,patients,updatedAt:nowISO()};
    await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,key)));
    state=next;
    resultEl.textContent='比較基準の登録完了：49人（ベッド一致43人・手動配置差異6人）。現在の患者のベッド位置や記録は変更していません。';
    $('#confirmBedBaseline').disabled=true;
    alert('比較基準を暗号化保存しました。\n49人の現在のベッド配置は保持されています。\n次回のCSV取り込み時は、この基準と照合します。');
  }catch(e){resultEl.textContent='基準登録は中止されました：'+(e.message||'処理に失敗しました。')}
  finally{endMaintenance(name);patientCsvBusy=false;}
}
async function auditPatientBedCsvFile(file){
  const status=$('#bedAuditResult');
  if(!status)return;
  if(!key||!state){status.textContent='ロック中のため照合できません。';return;}
  status.textContent='CSVを端末内で照合中…';
  try{
    const {text}=await readFileMakerCsv(file);
    const summary=auditPatientBedCsvText(text);
    status.textContent=formatPatientBedAudit(summary);
  }catch(e){status.textContent='照合を中止しました：'+(e.message||'形式エラー');}
}

let patientCsvBusy=false;
async function preflightPatientImport({reserved=false}={}){
  if(!key||!state)throw new Error('アプリがロックされています。');
  if(maintenanceAction||restoreBusy||backupBusy||resetInProgress)throw new Error('データ管理処理中はCSV移行できません。');
  if((patientCsvBusy&&!reserved)||photoImportBusy||photoRotateBusy||photoDeleteBusy||photoReorderBusy||noteWriteBusy||taskWriteBusy||taskTogglePending.size>0)
    throw new Error('他の保存・写真処理が進行中です。完了後に再試行してください。');
  if(selectedPatient){
    const ok=await flushPatientAutoSave();
    if(!ok||patientSavedRev<patientChangeRev)
      throw new Error('患者情報に未保存の変更があります。保存後に再試行してください。');
  }
  await dataWriteTail;
}
async function importPatients(file){
  if(patientCsvBusy){alert('患者CSVの取り込み処理中です。完了後に再試行してください。');return}
  patientCsvBusy=true;
  const action='FileMaker CSV追加更新';
  try{
    await preflightPatientImport({reserved:true});
    await beginMaintenance(action,{allowCsv:true});
    const {text,encoding}=await readFileMakerCsv(file);
    const result=prepareFileMakerMerge(text);
    const {patients,added,updated,normalized,unplaced,protectedBeds,csvBedMoves,skippedContactColumns}=result;
    if(!confirm(`FileMakerのCSVを病院ID（ＩＤ）で照合し、追加・更新します。\n新規：${added}人／既存更新：${updated}人\nベッド表記の正規化：${normalized}人／その他・未配置：${unplaced}人\n現在のベッドを暫定保持：${protectedBeds}人（CSVとの差異を含む）\nFileMaker側のベッド移動を反映：${csvBedMoves}人
文字コード：${encoding}\n住所・電話・連絡先の除外列：${skippedContactColumns}列\n\n既存の退院支援タスク・経過記録・写真を保持します。\n更新されない患者は残ります。CSV処理は上書きのため、復元したい独自記録がある場合は事前に手動バックアップを検討してください。\n\n続行しますか？`))return;
    const next={...state,patients,version:APP_VERSION,updatedAt:nowISO()};
    ensureStateSchema(next);
    // A failed IndexedDB commit must not mutate the visible in-memory state.
    await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,key)));
    state=next;ensureStateSchema();render();
    alert(`患者CSVの追加・更新が完了しました。\n新規 ${added}人／更新 ${updated}人\n現在の配置を保持 ${protectedBeds}人／CSVの配置移動を反映 ${csvBedMoves}人`);
  }catch(e){alert('患者CSVの追加・更新を中止しました。\n'+(e.message||'読み込みに失敗しました。'))}
  finally{endMaintenance(action);patientCsvBusy=false}
}
// Ver.1.0.7: explicitly requested full replacement of TEST patient records only.
// The original merge import remains available separately and unchanged.
function prepareFileMakerReplacement(csvText){
  throw new Error('実務試用版では全件入れ替えを一時停止しています。通常の「患者CSVを読み込む」を使用してください。');
}
async function replacePatientsFromFileMaker(file){
  if(patientCsvBusy){alert('患者CSVの取り込み処理中です。完了後に再試行してください。');return}
  patientCsvBusy=true;
  const action='FileMaker CSV全件入替';
  try{
    await preflightPatientImport({reserved:true});
    await beginMaintenance(action,{allowCsv:true});
    const {text,encoding}=await readFileMakerCsv(file);
    const {patients,changed,invalid,skippedContactColumns}=prepareFileMakerReplacement(text);
    const existingPhotoKeys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith('photo:'));
    const preview=`FileMaker患者データ：${patients.length}人\n現在のアプリ患者データ：${state.patients.length}人\n削除される写真：${existingPhotoKeys.length}枚\nベッド表記の正規化：${changed.length}人
文字コード：${encoding}\n住所・電話・連絡先の除外列：${skippedContactColumns}列\nその他・未配置：${invalid.length}人\n\n現在の患者データ（メモ・経過記録・タスク・写真を含む）をすべて削除し、CSVの患者データに入れ替えます。\n薬剤・マスター・設定・暗証は保持されます。\n事前にバックアップを保存してください。\n\n続行しますか？`;
    if(!confirm(preview))return;
    const word=prompt('最終確認：患者データを全件入れ替える場合は「入れ替え」と入力してください。');
    if(word!=='入れ替え')return;
    await dataWriteTail; // Prevent an earlier in-flight save from resurrecting deleted patient records.
    // Remove all old photo records and replace patient state in one transaction.
    // Do not mutate in-memory state until IndexedDB confirms the transaction committed.
    const next={...state,patients,version:APP_VERSION,updatedAt:nowISO()};
    ensureStateSchema(next);
    await idbApplyChanges([['data',await encryptPatientIndex(next)]],existingPhotoKeys);
    state=next;ensureStateSchema();
    alert(`全件入れ替えが完了しました。\n患者 ${patients.length}人\nベッド表記の正規化 ${changed.length}人\nその他・未配置 ${invalid.length}人`);
    render();
  }catch(e){alert(`患者CSVの入れ替えを中止しました.\n${e.message||'ファイルの読み込みに失敗しました。'}`)}
  finally{endMaintenance(action);patientCsvBusy=false}
}
function prepareDrugCsv(csvText){
  const {headers,rows}=readPatientCsvRows(csvText);
  const columns=['薬名','医薬品分類','薬価','薬効'];
  for(const c of columns)if(!headers.includes(c))throw new Error('薬剤CSVに必要な列がありません：'+c);
  if(!rows.length)throw new Error('薬剤CSVに薬剤データがありません。');
  if(rows.length>10000)throw new Error('薬剤CSVの件数が上限を超えています（10000件まで）。');
  return rows.map((row,i)=>{
    const item=Object.fromEntries(columns.map(c=>[c,String(row[c]??'').trim()]));
    if(!item['薬名'])throw new Error(`${i+2}行目：薬名が空欄です。`);
    return item;
  });
}
let drugCsvBusy=false;
async function importDrugs(file){
  if(drugCsvBusy){alert('薬剤CSVの取込処理中です。完了後に再試行してください。');return;}
  drugCsvBusy=true;
  const action='薬剤CSVの取込';
  try{
    await beginMaintenance(action,{allowDrugCsv:true});
    const {text,encoding}=await readFileMakerCsv(file);
    const drugs=prepareDrugCsv(text);
    if(!confirm(`薬剤マスターを入れ替えます。\n現在：${state.drugs.length}件／取込：${drugs.length}件\n文字コード：${encoding}\n\n患者情報・タスク・経過記録は変更しません。\n続行しますか？`))return;
    const activeKey=key;
    const next={...state,drugs,version:APP_VERSION,updatedAt:nowISO()};
    // The visible state only changes after IndexedDB has committed ciphertext.
    await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,activeKey)));
    if(key!==activeKey)throw new Error('認証状態が変更されました。画面を再確認してください。');
    state=next;
    ensureStateSchema();
    render();
    alert(`薬剤 ${drugs.length}件の取込が完了しました。`);
  }catch(e){alert('薬剤CSVの取込を中止しました。\n'+(e?.message||'保存に失敗しました。'));}
  finally{endMaintenance(action);drugCsvBusy=false;}
}

let backupBusy=false;
async function backup(){
  if(backupBusy)return;
  backupBusy=true;
  const action='暗号化バックアップ';
  try{
    await beginMaintenance(action);
    await dataWriteTail; // Export the latest successfully persisted patient index, not a stale snapshot.
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
    if(storedData){
      const savedState=await decryptObj(storedData,key);
      if(JSON.stringify(savedState)!==JSON.stringify(state))
        throw new Error('画面上の編集と保存済みデータに差があります。数秒待ってもう一度書き出してください。');
    }
    const validCipher=x=>x&&typeof x.iv==='string'&&x.iv.length>0&&typeof x.ct==='string'&&x.ct.length>0;
    if(!storedMeta||typeof storedMeta.salt!=='string'||!storedMeta.salt||!validCipher(storedMeta.check)||!validCipher(storedData)){
      throw new Error('保存済みの暗号化情報が不完全です。バックアップを中止しました');
    }
    const pack={format:'MSWDB-BACKUP',version:2,appVersion:APP_VERSION,exportedAt:nowISO(),meta:storedMeta,data:storedData,photos};
    const serialized=JSON.stringify(pack);
    if(new Blob([serialized]).size>backupLimit)throw new Error('バックアップが120MBを超えるため作成できません');
    download(new Blob([serialized],{type:'application/json'}),`MSWDB_backup_${new Date().toISOString().slice(0,10)}.mswdb`);
    // Initiating a download is not proof that Safari saved the .mswdb file.
    // lastBackupAt is set only through the explicit 'saved file verified' action.
    alert('暗号化バックアップの書き出しを開始しました。iPadの「ファイル」アプリで .mswdb が保存されたことを確認し、設定画面の「保存確認済み」を押してください。');
  }catch(e){alert('バックアップを作成できません：'+e.message)}
  finally{endMaintenance(action);backupBusy=false}
}
let restoreBusy=false;
async function restore(file){
  if(restoreBusy)return;
  restoreBusy=true;
  const action='バックアップ復元';
  try{
    await beginMaintenance(action);
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
    const privacyReduction=removeProhibitedContactFieldsFromState(backupState);
    // Original backup remains unchanged; a declined restore does not touch the DB.
    // Consent to remove structured fields is requested in the final restore dialog.
    const normalizedBackupData=privacyReduction.removed
      ?await encryptPatientIndex(backupState,backupKey):pack.data;
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
    if(!confirm(`患者${backupState.patients.length}件・写真${referenced.size}枚を確認しました。\n${privacyReduction.removed?`旧バックアップの住所・連絡先・写真名などの不要な項目 ${privacyReduction.removed}件（値あり ${privacyReduction.nonempty}件）を除外して復元します。\n`:''}写真や自由記述内の住所・電話番号は自動除去されません。\n現在のデータを置き換えますか？`))return;
    await dataWriteTail; // Old queued writes must not overwrite the restored encrypted index.
    // Commit photos and encrypted patient state atomically; a failed restore must not leave half-written records.
    // Remove old, unrelated photo records as part of the same restore transaction.
    // A legacy backup has no photos, so its restore must also clear old photos.
    const existingPhotoKeys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith('photo:'));
    const obsoletePhotoKeys=existingPhotoKeys.filter(k=>!Object.prototype.hasOwnProperty.call(incomingPhotos,k.slice(6)));
    await idbApplyChanges([...Object.entries(incomingPhotos).map(([id,data])=>[photoKey(id),data]),['meta',pack.meta],['data',normalizedBackupData]],obsoletePhotoKeys);
    // A successful restore invalidates the previous patient's open sheet and photo viewer.
    dismissPhotoViewer();
    selectedPatient=null;
    document.getElementById('modal')?.remove();
    meta=pack.meta;key=null;state=null;alert('復元しました。バックアップ作成時の暗証で再度ロック解除してください。');renderLock();
  }catch(e){alert('バックアップファイルを読み込めませんでした：'+e.message)}
  finally{endMaintenance(action);restoreBusy=false}
}
function safeFilePart(value){return String(value||'患者').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,60)||'患者'}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
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
function startDischargeFlow(p=selectedPatient){
 if(!p)return;
 if(selectedPatient&&selectedPatient!==p){alert('別の患者情報が編集中です。退院処理を中止しました。');return;}
 if(p._new){alert('先に患者情報を保存してください。');return;}
 const previousBed=$('#patientBedValue')?.value??p.data['ベッド番号']??'';
 const today=new Date().toLocaleDateString('sv-SE');
 $('#dischargeFlow')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="bed-picker-shade" id="dischargeFlow" role="dialog" aria-modal="true" aria-label="退院日を選択"><div class="bed-picker-panel discharge-panel"><div class="bed-picker-head"><strong>退院日を選択</strong><button class="btn secondary" id="dischargeCancel">戻る</button></div><div class="discharge-content"><p><b>${esc(p.data['氏名']||'氏名未入力')}</b></p><label>退院日<input type="date" id="dischargeChosenDate" value="${today}"></label><p class="notice">退院確定後はベッドを空け、日誌の退院患者一覧に残します。サマリー入力完了までは削除されません。</p><button class="btn" id="dischargeReview">確認へ</button><div id="dischargeReviewBody"></div></div></div></div>`);
 const root=$('#dischargeFlow');$('#dischargeCancel').onclick=()=>root.remove();
 $('#dischargeReview').onclick=()=>{
  const date=$('#dischargeChosenDate').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('退院日を入力してください');return;}
  const admission=p.data['入院日'];if(admission&&/^\d{4}-\d{2}-\d{2}$/.test(admission)&&date<admission){alert('退院日は入院日以降を指定してください');return;}
  $('#dischargeReviewBody').innerHTML=`<div class="panel"><p><b>退院処理を確定しますか？</b></p><p>${esc(p.data['氏名']||'氏名未入力')} ／ 退院日：${esc(date)} ／ 退院前：${esc(previousBed||'その他・未配置')}</p><button class="btn" id="dischargeCommit">確定して退院一覧へ</button></div>`;
  $('#dischargeCommit').onclick=async()=>{
   const b=$('#dischargeCommit');b.disabled=true;
   if(selectedPatient===p&&!await flushPatientAutoSave()){b.disabled=false;alert('患者情報の自動保存に失敗しました。退院処理を中止しました。');return;}
   const old={date:p.dischargeDate,pending:p.summaryPending,bed:p.data['ベッド番号'],former:p.formerBed};
   try{p.formerBed=previousBed;p.dischargeDate=date;p.summaryPending=true;p.data['ベッド番号']='';p.updatedAt=nowISO();await save();root.remove();$('#duplicateModal')?.remove();if(selectedPatient===p)closePatient();screen='journal';render()}
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
  $('#main').innerHTML=`<div class="hero"><div><h1>日誌・患者情報取り込み</h1><p>架空データ専用 Ver.${APP_VERSION} ／ 入院患者の手入力と配置</p></div></div>
  <div class="panel journal-warning"><b>架空患者専用の独立保存領域です。実際の患者情報は入力しないでください</b><p>写真の文字認識は未実装です。業務に必要な内容のみを入力し、正式な記録は電子カルテで管理してください。必要なら手動バックアップを利用できます。既存患者と同姓同名の場合は追加前に確認します。</p><label class="btn secondary journal-photo">📷 日誌の写真を選択・撮影<input type="file" id="journalPhoto" accept="image/*" style="display:none"></label><div id="journalPhotoInfo" class="notice"></div><div id="journalScanPreview"></div></div>
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
