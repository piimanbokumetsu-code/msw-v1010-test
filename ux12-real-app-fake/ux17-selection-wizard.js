/* UX17 FAKE TEST: search -> select named brand -> confirm -> choose
 * strength, per-dose quantity, administration time -> single encrypted save.
 * Never infer substitution or use another brand's price. No production use.
 * A separate fictional demo is DISPLAY ONLY and cannot save any patient.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_SELECTION_WIZARD__)return;
  if(!window.RX045?.resolve||typeof renderPatientMedications!=='function')return;
  window.__MSW_UX17_SELECTION_WIZARD__=true;

  const TIME=[
    ['朝食前',1],['朝食後',1],['昼食後',1],['夕食後',1],
    ['朝・夕食後',2],['毎食前',3],['毎食後',3],['就寝前',1],
    ['疼痛時',null],['その他',null]
  ];
  // A brand may appear more than once when the *strength differs*.
  // Never collapse 0.5mg and 1mg into one prescription entry.
  // Unspecified legacy strengths are ambiguous, so require review first.
  const keyPart=value=>String(value??'').trim().normalize('NFKC')
    .replace(/[\s\u3000]+/g,'').toLocaleLowerCase('ja');
  function prescriptionConflict(rows,incoming){
    const name=keyPart(incoming?.drug?.['薬名']);
    const strength=keyPart(incoming?.pricing?.strength);
    if(!name||!strength)return 'invalid';
    for(const old of rows){
      if(keyPart(old?.drug?.['薬名'])!==name)continue;
      const previousStrength=keyPart(old?.pricing?.strength);
      if(!previousStrength)return 'unknown';
      if(previousStrength===strength)return 'same';
    }
    return '';
  }
  let submitting=false;
  const make=(tag,klass,text)=>{
    const node=document.createElement(tag);
    if(klass)node.className=klass;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  function action(text,fn,kind='secondary'){
    const btn=make('button','btn '+kind,text);
    btn.type='button';btn.onclick=fn;return btn;
  }
  function field(parent,label,node){
    const wrap=make('label','ux17-wizard-field');
    const title=make('span','',label);
    wrap.append(title,node);parent.append(wrap);return node;
  }
  function select(options){
    const s=make('select');
    for(const [value,label] of options){
      const option=make('option','',label);
      option.value=value;s.append(option);
    }
    return s;
  }
  function input(type,placeholder,maxLength){
    const i=make('input');i.type=type;i.placeholder=placeholder||'';
    if(maxLength)i.maxLength=maxLength;
    i.autocomplete='off';return i;
  }
  function info(panel,kind,message){
    const p=make('p','notice ux17-wizard-'+kind,message);panel.appendChild(p);
    return p;
  }
  function listStrengths(identity,resolved,demo){
    if(demo)return [{strength:'5mg'},{strength:'10mg'}];
    const master=state?.drugs?.[identity.index];
    if(!master)return [];
    let rows=null;
    if(identity.kind==='generic')rows=master.rx037?.generics?.[identity.brandIndex]?.priceRows;
    else if(identity.brandIndex===0)rows=master.rx037?.priceRows;
    else rows=master.rx038?.otherOriginals?.[identity.brandIndex-1]?.priceRows;
    const strengths=[];
    if(Array.isArray(rows)){
      for(const row of window.RX046?.sortedRows?.(rows)||rows){
        const amount=String(row?.amount??'').trim().normalize('NFKC');
        const unit=String(row?.unit??'').trim().normalize('NFKC');
        const strength=amount+unit;
        if(/^\d{1,6}(?:\.\d{1,3})?$/.test(amount)&&Number(amount)>0&&
          unit.length>0&&unit.length<=15&&strength.length<=60&&!/[<>]/.test(unit)&&
          !strengths.some(x=>x.strength===strength)){
          strengths.push({strength});
        }
        if(strengths.length===20)break;
      }
    }
    // Legacy price labels are also eligible only from the selected brand.
    if(typeof medPriceChoices==='function'){
      for(const entry of medPriceChoices(resolved.drug['薬価'])){
        if(!strengths.some(x=>x.strength===entry.strength)){
          strengths.push({strength:entry.strength});
        }
        if(strengths.length===20)break;
      }
    }
    return strengths;
  }
  function wizardHost(){
    const host=document.querySelector('#tabbody #patientDrugResults');
    return host?.closest('section.panel')||null;
  }
  function clearWizard(){
    document.querySelector('#tabbody #ux17Wizard')?.remove();
  }
  function renderFrame(){
    clearWizard();
    const container=wizardHost();
    if(!container)return null;
    const panel=make('section','ux17-wizard','');
    panel.id='ux17Wizard';
    panel.setAttribute('tabindex','-1');
    panel.style.cssText='border:2px solid #4f8d88;border-radius:12px;padding:12px;margin:12px 0;background:#f7fbfa;scroll-margin-top:12px';
    // Insert ABOVE search results, instead of after them where iPad mini
    // users may not see the editor after tapping a master search candidate.
    const results=document.querySelector('#tabbody #patientDrugResults');
    if(results?.parentElement===container)container.insertBefore(panel,results);
    else container.appendChild(panel);
    return panel;
  }
  function revealFrame(panel){
    if(!panel)return;
    const reveal=()=>{
      if(document.querySelector('#tabbody #ux17Wizard')!==panel)return;
      try{panel.scrollIntoView({block:'start',behavior:'auto'});}catch(_){}
      try{panel.focus({preventScroll:true});}catch(_){}
    };
    // Run immediately and again after layout; Safari can be mid-scroll.
    reveal();
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(reveal);
  }
  function demoChoice(){
    const panel=renderFrame();if(!panel)return;
    panel.append(make('h4','','① 架空薬剤を選択（表示専用）'));
    info(panel,'notice','実際の薬情マスターや患者情報には登録しない、操作確認専用です。');
    const list=make('div','ux17-demo-candidates');list.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    list.append(
      action('架空降圧薬A（先発品）',()=>begin(null,true,'original'),'secondary'),
      action('架空後発品A（後発品）',()=>begin(null,true,'generic'),'secondary')
    );panel.append(list);
  }

  function begin(identity,demo=false,demoKind='original'){
    const resolved=demo
      ?{drug:{'薬名':demoKind==='generic'?'架空後発品A':'架空降圧薬A',
              '医薬品分類':'血圧の薬','薬効':'画面確認用の架空薬剤','薬価':''},
         label:demoKind==='generic'?'後発品①':'先発品①',origin:null}
      :window.RX045.resolve(state?.drugs||[],identity);
    if(!resolved?.drug?.['薬名']){
      alert('薬情の候補が確認できません。もう一度検索してください。');return;
    }
    const patient=selectedPatient;
    const panel=renderFrame();if(!panel)return;
    // Selecting an explicit brand proceeds directly; final confirmation remains.
    configure(panel,resolved,identity,demo,patient);
    revealFrame(panel);
  }

  function configure(panel,resolved,identity,demo,patient){
    panel.replaceChildren(make('h4','','② 規格・数量・用法を設定'));
    info(panel,'notice','選択した薬剤：'+resolved.drug['薬名']+'（'+resolved.label+'）');
    info(panel,'safety','選択した銘柄名を電子カルテと照合してください。規格は手入力です。');
    if(demo)info(panel,'demo','架空の表示例です。患者・薬情マスターには保存しません。');
    const form=make('div','ux17-wizard-inputs');
    form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:10px 0';
    const strengthManual=input('text','例：10mg',60);
    field(form,'規格（手入力）',strengthManual);
    const unitSelect=select([
      ['','単位を選択'],
      ...['錠','カプセル','包','g','mL','本','枚','回','その他'].map(x=>[x,x])
    ]);
    field(form,'数量の単位',unitSelect);
    const timeEditor=window.UX19DoseSchedule.buildEditor(null,()=>unitSelect.value);
    const prnForm=make('div','ux19-prn-fields');
    prnForm.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:8px 0';
    const qty=input('text','例：1、0.5',12);qty.inputMode='decimal';
    field(prnForm,'頓服の1回量',qty);
    const timeSelect=select([
      ['','服用する条件を選択'],
      ...TIME.map(([name])=>[name,name])
    ]);
    field(prnForm,'頓服の用法',timeSelect);
    const timeManual=input('text','例：発熱時、月・木の朝',50);
    field(prnForm,'その他の服用条件',timeManual);
    panel.append(form,timeEditor.panel,prnForm);
    const syncMode=prn=>{
      prnForm.style.display=prn?'grid':'none';
      timeManual.parentElement.style.display=prn&&timeSelect.value==='その他'?'flex':'none';
    };
    timeEditor.onModeChange(syncMode);
    unitSelect.addEventListener('change',timeEditor.refresh);
    timeSelect.addEventListener('change',()=>syncMode(timeEditor.isPRN()));
    info(panel,'safety','薬価は自動設定しません。定期薬の参考日額は、単価を別途確認・保存してから計算します。');
    const message=info(panel,'status','');
    message.setAttribute('role','status');
    const buttons=make('div');buttons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    buttons.append(
      action('薬剤選択に戻る',()=>demo?demoChoice():clearWizard()),
      action(demo?'登録結果をプレビュー（保存なし）':'確認して一覧に登録',async()=>{
        if(submitting)return;
        const strength=strengthManual.value.trim().normalize('NFKC');
        const qtyText=qty.value.trim().normalize('NFKC');
        const unit=unitSelect.value;
        const mode=timeEditor.isPRN()?'頓服':'定期';
        const time=timeSelect.value==='その他'?timeManual.value.trim():timeSelect.value;
        if(!strength||strength.length>60||!unit||!mode){
          message.textContent='規格と数量の単位を入力してください。';return;
        }
        const structured=mode==='定期'?timeEditor.read(strength,unit,mode):null;
        if(structured?.error){message.textContent=structured.error;return;}
        if(mode==='頓服'&&(
           !/^\d{1,4}(?:\.\d{1,3})?$/.test(qtyText)||
           Number(qtyText)<=0||Number(qtyText)>1000||
           !time||time.length>50)){
          message.textContent='頓服の1回量・単位・用法を確認してください。';return;
        }
        if(mode!=='定期'&&mode!=='頓服'){
          message.textContent='定期薬か頓服薬か選択してください。';return;
        }
        const daily=structured?.schedule?.dailyQuantity||'';
        const record={
          id:typeof uid==='function'?uid():String(Date.now()),
          drug:resolved.drug,
          addedAt:typeof nowISO==='function'?nowISO():new Date().toISOString(),
          ...(resolved.origin?{rx045Origin:resolved.origin}:{}),
          pricing:{strength,unitPrice:'',unit,dailyQuantity:daily,status:mode},
          ux17Schedule:mode==='頓服'?{strength,doseQuantity:qtyText,doseUnit:unit,timing:time,status:mode}:null,
          ...(structured?.schedule?{ux19Schedule:structured.schedule}:{})
        };
        const description=mode==='定期'
          ?'数量'+daily+unit+'／'+window.UX19DoseSchedule.resolve(record).description
          :'1回'+qtyText+unit+'／'+time;
        if(demo){
          panel.replaceChildren(make('h4','','④ 登録後の表示イメージ（保存なし）'));
          panel.append(make('strong','',record.drug['薬名']+'　'+strength+'　'+description));
          info(panel,'demo','架空テスト用のプレビューです。薬情・患者データは変更していません。');
          panel.append(action('別の銘柄も試す',demoChoice));
          return;
        }
        if(patient!==selectedPatient||!key||!state||!patient||patient._new){
          message.textContent='患者とロック状態を確認してください。新規患者は基本情報を先に保存してください。';return;
        }
        if(patient.medications!=null&&!Array.isArray(patient.medications)){
          message.textContent='患者の登録薬データを確認できないため追加しません。';return;
        }
        const prev=medRows(patient).slice();
        if(prev.length>=100){message.textContent='一人の患者には100件まで登録できます。';return;}
        const conflict=prescriptionConflict(prev,record);
        if(conflict){
          message.textContent=conflict==='unknown'
            ?'同じ薬剤名の既存薬で規格が未設定です。既存薬の規格を確認してから追加してください。'
            :'同じ薬剤名・同じ規格はすでに登録されています。既存薬の修正をご利用ください。';
          return;
        }
        if(!confirm('「'+record.drug['薬名']+'」 '+strength+' ／ '+description+
          ' ／ '+mode+' を患者の一覧に登録しますか？\n処方内容と一致することを確認してください。'))return;
        if(patientMedicationBusy){message.textContent='別の薬剤の保存中です。完了後に操作してください。';return;}
        submitting=true;
        patientMedicationBusy=true;
        message.textContent='暗号化保存しています…';
        patient.medications=[...prev,record];
        try{
          if(patient!==selectedPatient||!key||!state)throw Error('患者またはロック状態が変わりました');
          await save();
          if(patient===selectedPatient){
            drawPatientMedicationList();
            panel.replaceChildren(make('h4','','④ 登録完了'));
            info(panel,'success','選択した薬剤と数量・用法を保存しました。');
            panel.append(action('閉じる',clearWizard));
          }
        }catch(err){
          patient.medications=prev;
          if(patient===selectedPatient){
            drawPatientMedicationList();
            message.textContent='保存できませんでした。登録は元に戻しました：'+String(err?.message||err).slice(0,100);
          }
        }finally{submitting=false;patientMedicationBusy=false;}
      },'')
    );panel.append(buttons);
  }

  // Intercept existing RX045/UX17 candidate actions before old handlers run.
  // Existing search rendering, search input and master database are untouched.
  document.addEventListener('click',event=>{
    // In addition to the button, accept tapping the candidate name/card.
    // Only use a genuine search result with explicit master brand identity.
    const row=event.target?.closest?.('.rx045Candidate, .ux17-generic-candidate');
    const btn=event.target?.closest?.('button.rx045Choose, .ux17-generic-candidate button[data-ux17-kind]')||
      row?.querySelector('button.rx045Choose, button[data-ux17-kind]');
    if(!btn||btn.disabled||!document.querySelector('#tabbody')?.contains(btn))return;
    if(!document.querySelector('#tabbody .patient-med-page'))return;
    const raw=btn.classList.contains('rx045Choose')
      ?{index:btn.dataset.index,kind:btn.dataset.kind,brandIndex:btn.dataset.brand}
      :{index:btn.dataset.ux17Index,kind:btn.dataset.ux17Kind,brandIndex:btn.dataset.ux17Brand};
    const identity={index:Number(raw.index),kind:raw.kind,brandIndex:Number(raw.brandIndex)};
    if(!Number.isSafeInteger(identity.index)||!Number.isSafeInteger(identity.brandIndex)||
       !['original','generic'].includes(identity.kind))return;
    event.preventDefault();event.stopImmediatePropagation();
    begin(identity,false);
  },true);

  function addDemoButton(){
    const panel=wizardHost();
    if(!panel||panel.querySelector('#ux17DemoWizard'))return;
    const btn=action('架空薬で登録手順を試す（保存なし）',demoChoice);
    btn.id='ux17DemoWizard';
    btn.style.cssText='display:block;margin:10px 0;width:100%;background:#fff6dc';
    panel.append(btn);
  }
  const oldRender=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=oldRender.apply(this,args);
    addDemoButton();
    return result;
  };
})();