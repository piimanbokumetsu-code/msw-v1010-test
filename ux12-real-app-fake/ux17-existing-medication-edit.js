/* UX17-FIX01 fake-stage: visible per-row edit of dose/timing for an EXISTING drug.
 * Preserves medication id, named brand snapshot, notes, original selected
 * product, attached RX035 reference, and historical metadata.
 * Atomic encrypted save with rollback; no mutation of drug master.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_EXISTING_EDIT__)return;
  if(typeof window.drawPatientMedicationList!=='function')return;
  window.__MSW_UX17_EXISTING_EDIT__=true;
  const units=['錠','カプセル','包','g','mL','本','枚','回','その他'];
  const times=[
    ['朝食前',1],['朝食後',1],['昼食後',1],['夕食後',1],
    ['朝・夕食後',2],['毎食前',3],['毎食後',3],
    ['就寝前',1],['疼痛時',null],['その他',null]
  ];
  const readRecord=(id)=>medRows(selectedPatient).find(r=>r.id===id);
  const control=(tag,text)=>{
    const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;
  };
  const field=(panel,title,el)=>{
    const label=control('label');label.className='ux17-edit-field';
    label.style.cssText='display:flex;flex-direction:column;gap:4px;min-width:130px';
    label.append(control('span',title),el);panel.append(label);return el;
  };
  const pick=(options,initial)=>{
    const el=control('select');
    for(const [value,name] of options){const opt=control('option',name);opt.value=value;el.append(opt);}
    el.value=initial||'';return el;
  };
  const txt=(value,max,placeholder)=>{
    const el=control('input');el.type='text';el.value=String(value||'');el.maxLength=max;
    el.placeholder=placeholder;el.autocomplete='off';return el;
  };
  const button=(title,fn)=>{
    const el=control('button',title);el.type='button';el.className='btn secondary';el.onclick=fn;return el;
  };

  function drawEditor(row,record){
    const host=row.querySelector(':scope > .ux17-med-more');
    if(!host||!record)return;
    const existing=host.querySelector('.ux17-existing-edit');
    const priceEditor=host.querySelector('.patient-med-editor');
    if(existing){
      if(priceEditor&&priceEditor.dataset.medDirty==='1'){
        const flags=existing.dataset.ux17OwnDirty==='1';
        if(flags&&existing.dataset.ux17PriceDirty!=='1')priceEditor.dataset.medDirty='0';
      }
      existing.remove();return;
    }
    if(priceEditor?.dataset.medDirty==='1'){
      alert('薬価・規格に未保存の変更があります。先に保存または取り消してください。');
      return;
    }
    const id=record.id,pricing=record.pricing||{},schedule=record.ux17Schedule||{};
    const panel=control('div');
    panel.className='ux17-existing-edit';
    panel.style.cssText='padding:10px;border:1px solid #91bdb5;border-radius:9px;margin:8px 0;background:#f5fbfa';
    panel.append(control('strong','処方内容（規格・1回量・いつ）を設定／修正'));
    const cols=control('div');
    cols.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin:10px 0';

    const strength=field(cols,'規格',txt(pricing.strength,60,'例：5mg'));
    const qty=field(cols,'1回の服用量',txt(schedule.doseQuantity,12,'例：1、0.5'));
    qty.inputMode='decimal';
    const unit=field(cols,'単位',pick([['','選択してください'],...units.map(x=>[x,x])],schedule.doseUnit||pricing.unit));
    const mode=field(cols,'区分',pick([['','選択してください'],['定期','定期薬'],['頓服','頓服薬']],schedule.status||(['定期','頓服'].includes(pricing.status)?pricing.status:'')));
    const knownTime=times.some(([value])=>value===schedule.timing);
    const timing=field(cols,'いつ',pick([['','選択してください'],...times.map(([v])=>[v,v])],knownTime?schedule.timing:schedule.timing?'その他':''));
    const other=field(cols,'その他の服用時点',txt(knownTime?'':schedule.timing,50,'例：月・木の朝'));
    other.parentElement.style.display=timing.value==='その他'?'flex':'none';
    timing.onchange=()=>{other.parentElement.style.display=timing.value==='その他'?'flex':'none';};
    panel.append(cols);
    const notice=control('p','規格・服用内容を実際の処方と照合して保存します。規格・単位を変更した場合、以前の参考単価はクリアします。');
    notice.className='notice';panel.append(notice);
    const message=control('p');message.className='notice';message.setAttribute('role','status');panel.append(message);
    const actions=control('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    actions.append(button('キャンセル',()=>{
      if(priceEditor?.dataset.medDirty==='1'&&panel.dataset.ux17OwnDirty==='1'&&
         panel.dataset.ux17PriceDirty!=='1')priceEditor.dataset.medDirty='0';
      panel.remove();
    }));
    actions.append(button('内容を確認して保存',async()=>{
      if(patientMedicationBusy)return;
      const patient=selectedPatient;
      if(!patient||!key||!state||patient._new||!Array.isArray(patient.medications)){
        message.textContent='ロック状態または患者データを確認してください。';return;
      }
      if(panel.dataset.ux17PriceDirty==='1'||
         (priceEditor?.dataset.medDirty==='1'&&panel.dataset.ux17OwnDirty!=='1')){
        message.textContent='薬価・規格の未保存変更があります。先に保存または取り消してください。';return;
      }
      const current=readRecord(id);
      if(!current){message.textContent='該当する薬剤が見つかりません。';return;}
      const st=strength.value.trim().normalize('NFKC'),q=qty.value.trim().normalize('NFKC');
      const u=unit.value,when=timing.value==='その他'?other.value.trim():timing.value,m=mode.value;
      if(!st||st.length>60||!/^\d{1,4}(?:\.\d{1,3})?$/.test(q)||Number(q)<=0||
        Number(q)>1000||!units.includes(u)||!when||when.length>50||
        !['定期','頓服'].includes(m)||(when==='疼痛時'&&m!=='頓服')){
        message.textContent='規格・1回量・単位・タイミング・区分を正しく入力してください。';
        return;
      }
      const timesPerDay=times.find(([v])=>v===when)?.[1]??null;
      const daily=m==='定期'&&timesPerDay!==null
        ?String(Math.round(Number(q)*timesPerDay*1000)/1000):'';
      if(daily&&Number(daily)>1000){
        message.textContent='1日の合計数量を確認してください。';return;
      }
      if(!confirm('「'+String(current.drug?.['薬名']||'薬剤')+'」の処方内容を'+
        '\n'+st+'／1回'+q+u+'／'+when+'／'+m+' に設定します。'+
        '\n電子カルテ等の現在の処方と一致していますか？'))return;
      const oldPricing=current.pricing||{};
      const priceUnchanged=String(oldPricing.strength||'')===st&&String(oldPricing.unit||'')===u;
      const nextPricing={
        ...oldPricing,strength:st,unit:u,status:m,dailyQuantity:daily,
        unitPrice:priceUnchanged?String(oldPricing.unitPrice||''):''
      };
      const nextSchedule={strength:st,doseQuantity:q,doseUnit:u,timing:when,status:m};
      const before=patient.medications.slice();
      patientMedicationBusy=true;
      message.textContent='暗号化保存しています…';
      patient.medications=before.map(x=>x.id===id?{
        ...x,pricing:nextPricing,ux17Schedule:nextSchedule
      }:x);
      try{
        if(selectedPatient!==patient||!key||!state)throw Error('患者またはロック状態が変わりました。');
        await save();
        if(selectedPatient===patient){
          drawPatientMedicationList();
          const status=document.querySelector('#patientMedStatus');
          if(status)status.textContent='処方内容を更新しました。';
        }
      }catch(e){
        patient.medications=before;
        if(selectedPatient===patient){
          // Keep typed inputs for a safe retry after a transient write failure.
          message.textContent='保存できず、元に戻しました：'+String(e.message||e).slice(0,100);
        }
      }finally{patientMedicationBusy=false;}
    }));
    panel.append(actions);
    const point=priceEditor;
    if(point)host.insertBefore(panel,point);else host.append(panel);
    // The edit launcher is always visible; expand the previously collapsed
    // details before displaying the editor. No need to delete/re-add the drug.
    host.open=true;
    if(typeof panel.scrollIntoView==='function'){
      panel.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    for(const input of panel.querySelectorAll('input,select')){
      const mark=()=>{
        panel.dataset.ux17OwnDirty='1';
        if(priceEditor)priceEditor.dataset.medDirty='1';
      };
      input.addEventListener('input',mark);
      input.addEventListener('change',mark);
    }
    if(priceEditor){
      for(const input of priceEditor.querySelectorAll('input,select')){
        const mark=()=>{panel.dataset.ux17PriceDirty='1';};
        input.addEventListener('input',mark);
        input.addEventListener('change',mark);
      }
    }
  }
  function addControls(){
    const root=document.querySelector('#tabbody .patient-med-page');
    if(!root||!selectedPatient)return;
    for(const row of root.querySelectorAll('#patientMedList > .patient-med-row')){
      const details=row.querySelector(':scope > .ux17-med-more');
      const id=row.querySelector('.patient-med-del')?.dataset.id;
      if(!details||!id||row.querySelector('.ux17-edit-quick-action'))continue;
      const record=readRecord(id);if(!record)continue;
      const bar=control('div');
      bar.className='ux17-edit-quick-action';
      bar.style.cssText='display:flex;justify-content:flex-end;gap:7px;margin:5px 0 3px';
      const launch=button('✏️ 規格・量・いつを修正',()=>{
        const current=readRecord(id);
        if(current)drawEditor(row,current);
      });
      launch.classList.add('ux17-edit-launcher');
      launch.style.cssText='min-height:38px;padding:6px 11px;font-size:13px;line-height:1.35';
      bar.appendChild(launch);
      row.insertBefore(bar,details);
    }
  }
  const oldList=window.drawPatientMedicationList;
  window.drawPatientMedicationList=function(...args){
    const result=oldList.apply(this,args);addControls();return result;
  };
  const oldRender=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=oldRender.apply(this,args);addControls();return result;
  };
})();