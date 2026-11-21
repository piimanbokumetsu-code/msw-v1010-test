/* RX050 FAKE TEST COPY (derived from UX19): explicit time-of-day quantities (no patient writes here).
   Legacy UX17 one-dose records are never silently converted. */
(function(){
  'use strict';
  if(window.UX19DoseSchedule)return;
  const slots=[['waking','起床時','起床時'],['morning','朝','朝'],['noon','昼','昼'],['evening','夜','夜'],['bedtime','寝る前','寝前']];
  const relations=['食後','食前','食直前','食直後','食間','時間帯のみ'];
  const allowedUnits=new Set(['錠','カプセル','包','g','mL','本','枚','回','その他']);
  function qty(raw,allowZero){
    const v=String(raw??'').trim().normalize('NFKC');
    if(!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(v))return null;
    const n=Number(v);
    if(!Number.isFinite(n)||n>1000||(!allowZero&&n<=0))return null;
    return n;
  }
  function cleanNumber(n){return String(Math.round(n*1000)/1000);}
  function resolve(record){
    const s=record?.ux19Schedule,p=record?.pricing||{};
    if(!s||s.version!==1||p.status!=='定期'||s.status!=='定期'||
       String(s.strength||'')!==String(p.strength||'')||
       String(s.unit||'')!==String(p.unit||'')||
       !allowedUnits.has(String(s.unit||'')))return null;
    const doses={},names=[];
    let total=0;
    for(const [key,,abbr] of slots){
      // Legacy records made before RX050 do not contain the waking key.
      // Treat only that missing key as zero; never infer or alter the four existing doses.
      const value=s.slots?.[key];
      const amount=qty(key==='waking'&&(value===undefined||value===null)?'0':value,true);
      if(amount===null)return null;
      total+=amount;doses[key]=cleanNumber(amount);
      if(amount>0)names.push(abbr+':'+cleanNumber(amount));
    }
    total=Math.round(total*1000)/1000;
    const wakingOnly=names.length===1&&Number(doses.waking)>0;
    if(!(relations.includes(s.relation)||(wakingOnly&&s.relation==='')))return null;
    if(!names.length||total>1000||
       (s.dailyQuantity!=null&&String(s.dailyQuantity)!==cleanNumber(total))||
       (p.dailyQuantity!=null&&String(p.dailyQuantity)!==cleanNumber(total)))return null;
    return {doses,total:cleanNumber(total),unit:s.unit,
      description:names.join('－')+(!s.relation||s.relation==='時間帯のみ'?'':'（'+s.relation+'）')};
  }
  function buildEditor(oldSchedule,getUnit,initialPrn=false){
    const panel=document.createElement('div');
    panel.className='ux19-time-editor';
    panel.style.cssText='border:1px solid #cbd5e1;border-radius:9px;padding:9px;background:#f8fafc;margin:8px 0';
    const headline=document.createElement('strong');headline.textContent='時間帯ごとの数量（1日分）';
    panel.append(headline);
    const fields=document.createElement('div');
    fields.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0';
    const inputs={};
    for(const [key,label] of slots){
      const row=document.createElement('div');
      row.style.cssText='display:flex;gap:6px;align-items:center;min-width:0;padding:6px;background:white;border:1px solid #e2e8f0;border-radius:7px';
      const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',label+'に服用');
      const text=document.createElement('span');text.textContent=label;
      const amount=document.createElement('input');amount.type='text';amount.inputMode='decimal';amount.placeholder='数量';amount.maxLength=9;
      amount.setAttribute('aria-label',label+'の数量');amount.style.cssText='width:65px;max-width:40%;padding:5px;margin-left:auto';
      const old=qty(oldSchedule?.slots?.[key],true);
      check.checked=old!==null&&old>0;
      amount.value=check.checked?cleanNumber(old):'';
      amount.disabled=!check.checked;
      check.addEventListener('change',()=>{
        amount.disabled=!check.checked;
        if(!check.checked)amount.value='';
        refresh();
        if(check.checked)amount.focus();
      });
      amount.addEventListener('input',refresh);
      row.append(check,text,amount);fields.appendChild(row);
      inputs[key]={check,amount};
    }
    panel.append(fields);
    const prnRow=document.createElement('label');
    prnRow.style.cssText='display:flex;align-items:center;gap:8px;padding:9px 4px;font-weight:700';
    const prnCheck=document.createElement('input');
    prnCheck.type='checkbox';
    prnCheck.checked=Boolean(initialPrn);
    prnCheck.setAttribute('aria-label','頓服として登録');
    prnRow.append(prnCheck,document.createTextNode('頓服（必要時）'));
    panel.append(prnRow);
    const relationRow=document.createElement('label');
    relationRow.style.cssText='display:flex;flex-direction:column;gap:4px';
    relationRow.append(document.createTextNode('服用条件（例：食後）'));
    const relation=document.createElement('select');
    [['','選択してください'],...relations.map(x=>[x,x])].forEach(([value,label])=>{
      const option=document.createElement('option');option.value=value;option.textContent=label;relation.appendChild(option);
    });
    relation.value=relations.includes(oldSchedule?.relation)?oldSchedule.relation:'';
    relationRow.append(relation);panel.append(relationRow);
    const totalLabel=document.createElement('p');totalLabel.style.cssText='font-weight:700;margin:8px 0 2px';
    totalLabel.setAttribute('role','status');panel.append(totalLabel);
    function onlyWaking(){
      return inputs.waking.check.checked&&
        Object.entries(inputs).every(([key,input])=>key==='waking'||!input.check.checked);
    }
    function refresh(){
      let count=0,invalid=false,selected=0;
      for(const {check,amount} of Object.values(inputs)){
        if(!check.checked)continue;
        selected++;
        const n=qty(amount.value,false);
        if(n===null)invalid=true;else count+=n;
      }
      if(!prnCheck.checked)relationRow.style.display=onlyWaking()?'none':'flex';
      totalLabel.textContent=invalid?'1日合計：数量を入力してください':
        '1日合計：'+cleanNumber(count)+(getUnit?.()||'')+(selected?'（自動計算）':'（時間帯未選択）');
    }
    relation.addEventListener('change',refresh);
    const modeListeners=[];
    function syncMode(){
      const prn=prnCheck.checked;
      fields.style.display=prn?'none':'grid';
      relationRow.style.display=prn||onlyWaking()?'none':'flex';
      totalLabel.style.display=prn?'none':'';
      headline.textContent=prn?'頓服の用法を設定':'時間帯ごとの数量（1日分）';
      if(!prn)refresh();
      for(const callback of modeListeners)callback(prn);
    }
    prnCheck.addEventListener('change',syncMode);
    syncMode();
    function read(strength,unit,status){
      if(prnCheck.checked)return {error:'頓服の1回量・服用時点を確認してください。'};
      const doses={};let total=0;let selected=0;
      for(const [key,label] of slots){
        const {check,amount}=inputs[key];
        const n=check.checked?qty(amount.value,false):0;
        if(n===null)return {error:label+'の数量を確認してください。'};
        doses[key]=cleanNumber(n);total+=n;
        if(n>0)selected++;
      }
      total=Math.round(total*1000)/1000;
      if(status!=='定期'||!allowedUnits.has(unit)||!String(strength||'').trim()||
         !selected||total>1000||(!onlyWaking()&&!relations.includes(relation.value))){
        return {error:'時間帯・数量・服用条件を正しく選択してください。'};
      }
      return {schedule:{version:1,slots:doses,relation:onlyWaking()?'':relation.value,
        strength,unit,status:'定期',dailyQuantity:cleanNumber(total)}};
    }
    return {panel,read,refresh,
      isPRN:()=>prnCheck.checked,
      onModeChange:fn=>{if(typeof fn==='function'){modeListeners.push(fn);fn(prnCheck.checked);}}
    };
  }
  window.UX19DoseSchedule=Object.freeze({slots,relations,qty,resolve,buildEditor,cleanNumber});
})();
