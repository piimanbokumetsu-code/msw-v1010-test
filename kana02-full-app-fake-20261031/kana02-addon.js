/* KANA02 integration draft. Classic-script add-on: load after app.js and kana02-core.js.
 * Offline only. Explicit user action is required before any patient data is written.
 * This module never reads/export images, medicines, PINs, or backups.
 */
(function(){
'use strict';
if(!window.MSWKana02||typeof furiganaSuggestion!=='function'||typeof renderPatients!=='function')return;
const kana=window.MSWKana02;
const previousSuggestion=furiganaSuggestion;
furiganaSuggestion=function(name){
  return kana.suggest(name)||previousSuggestion(name);
};
const previousRender=renderPatients;
renderPatients=function(){
  previousRender();
  const anchor=document.querySelector('#newP');
  if(!anchor||document.querySelector('#kana02OpenBatch')||!key||!state)return;
  const hero=anchor.closest('.hero');
  if(!hero||!hero.parentElement)return;
  const pending=activePatients().filter(p=>!kana.isConfirmed(p)).length;
  const actions=document.createElement('div');
  actions.id='kana02PatientActions';
  actions.className='kana02-patient-actions';
  actions.setAttribute('role','group');
  actions.setAttribute('aria-label','新規患者登録とフリガナ確認');
  actions.style.cssText='display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0 16px;width:100%';
  // Move the ORIGINAL new-patient button, preserving its existing click handler.
  // Keep the two actions separate on narrow iPad screens.
  anchor.textContent='＋患者（新規登録）';
  const button=document.createElement('button');
  button.type='button';button.id='kana02OpenBatch';
  button.className='btn secondary';
  button.textContent='フリガナ一括確認（未確認 '+pending+'人）';
  button.addEventListener('click',openKanaBatch);
  actions.append(anchor,button);
  hero.insertAdjacentElement('afterend',actions);
};
function openKanaBatch(){
  if(!key||!state||selectedPatient||document.querySelector('#kana02Batch'))return;
  const originalState=state,originalKey=key;
  const patients=activePatients().filter(p=>!kana.isConfirmed(p));
  const dialog=document.createElement('div');
  dialog.className='modal kana02-modal';
  dialog.id='kana02Batch';
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-label','フリガナ未確認患者の一括確認');
  const sheet=document.createElement('div');sheet.className='sheet';
  const head=document.createElement('div');head.className='sheethead';
  const close=document.createElement('button');close.type='button';close.className='btn secondary';close.textContent='← 戻る';
  const title=document.createElement('h2');title.textContent='フリガナをまとめて確認';
  const number=document.createElement('span');number.id='kana02Remaining';number.className='count';
  const text=document.createElement('p');text.className='notice';
  text.textContent='一般的な読みの候補です。正しい読みを確認して、違うところだけ手直しし、患者ごとに「確認」を押してください。候補は確認するまで保存されません。';
  const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.className='notice';
  const body=document.createElement('div');body.className='sheetbody';
  const list=document.createElement('div');list.className='kana02-batch-list';
  head.append(close,title,number);sheet.append(head);
  body.append(text,message,list);sheet.append(body);dialog.append(sheet);document.body.append(dialog);
  const styleId='kana02BatchStyle';
  if(!document.getElementById(styleId)){
    const style=document.createElement('style');style.id=styleId;
    style.textContent='.kana02-batch-row{display:grid;grid-template-columns:minmax(90px,1fr) minmax(135px,1.6fr) auto;gap:8px;align-items:center;padding:10px 2px;border-bottom:1px solid #d9e4e4}.kana02-batch-row input{width:100%;min-width:0;border:1px solid #adc7c7;border-radius:8px;padding:8px;min-height:43px;font-size:16px}.kana02-batch-name{font-weight:700;overflow-wrap:anywhere}.kana02-batch-unknown{color:#aa4b08}.kana02-batch-done{color:#047857}.kana02-batch-row button{min-height:43px}@media(max-width:480px){.kana02-batch-row{grid-template-columns:minmax(90px,1fr) minmax(120px,1.5fr) auto;gap:5px}.kana02-batch-row button{padding:8px}}';
    document.head.append(style);
  }
  function stillValid(){return !!key&&key===originalKey&&state===originalState&&!!dialog.isConnected}
  function count(){number.textContent='残り '+patients.filter(p=>!kana.isConfirmed(p)).length+'人'}
  function exit(){dialog.remove();if(key&&state&&!selectedPatient&&screen==='patients')renderPatients()}
  close.addEventListener('click',exit);
  if(!patients.length){
    const empty=document.createElement('p');empty.className='empty';empty.textContent='在院患者のフリガナはすべて確認済みです。';
    list.append(empty);count();return;
  }
  for(const p of patients){
    const row=document.createElement('div');row.className='kana02-batch-row';
    const name=document.createElement('span');name.className='kana02-batch-name';
    name.textContent=String(p.data?.['氏名']||'氏名未入力');
    const input=document.createElement('input');input.type='text';input.autocomplete='off';
    input.value=kana.preview(p).text;
    input.setAttribute('aria-label',name.textContent+'のフリガナ');
    if(!input.value)input.placeholder='候補なし・手入力';
    const confirm=document.createElement('button');confirm.type='button';confirm.className='btn';
    confirm.textContent='確認';
    row.append(name,input,confirm);list.append(row);
    confirm.addEventListener('click',async()=>{
      if(!stillValid()){message.textContent='患者データの状態が変わりました。いったん閉じて開き直してください。';return;}
      if(kana.isConfirmed(p)){message.textContent='すでに確認済みです。';return;}
      const reading=kana.normalizeKana(input.value);
      const patientName=String(p.data?.['氏名']||'').trim();
      if(!patientName||!reading){message.textContent='氏名とフリガナを入力してから確認してください。';input.focus();return;}
      if(!state.patients.includes(p)){message.textContent='対象患者が変わりました。閉じて開き直してください。';return;}
      const before={reading:p.data['フリガナ'],flag:p.furiganaConfirmed,forName:p.furiganaConfirmedFor,updatedAt:p.updatedAt};
      confirm.disabled=true;input.disabled=true;message.textContent='暗号化して保存中…';
      try{
        p.data['フリガナ']=reading;
        p.furiganaConfirmed=true;p.furiganaConfirmedFor=patientName;
        p.updatedAt=nowISO();
        await save();
        if(!stillValid())return;
        input.value=reading;input.readOnly=true;input.disabled=false;
        confirm.textContent='済';confirm.disabled=true;row.classList.add('kana02-batch-done');
        message.textContent='「'+patientName+'」のフリガナを確認・保存しました。';
        count();
      }catch(error){
        p.data['フリガナ']=before.reading;
        p.furiganaConfirmed=before.flag;
        p.furiganaConfirmedFor=before.forName;
        p.updatedAt=before.updatedAt;
        if(stillValid()){
          input.disabled=false;confirm.disabled=false;
          message.textContent='保存に失敗しました。入力した候補はそのまま残っています。もう一度確認してください。';
        }
      }
    });
  }
  count();
}
})();