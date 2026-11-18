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
    panel.style.cssText='border:2px solid #4f8d88;border-radius:12px;padding:12px;margin:12px 0;background:#f7fbfa';
    container.appendChild(panel);
    return panel;
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
    panel.append(make('h4','','② 選択した薬剤を確認'));
    panel.append(make('strong','',resolved.drug['薬名']));
    info(panel,'notice',resolved.label+' ／ '+(resolved.drug['医薬品分類']||'分類未設定'));
    info(panel,'safety','実際に服用している銘柄名と一致しているか、処方箋・電子カルテで確認してください。別の銘柄への代替を判定するものではありません。');
    if(demo)info(panel,'demo','この銘柄は架空の表示例です。実際の患者には保存されません。');
    const controls=make('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    controls.append(
      action('戻る',()=>demo?demoChoice():clearWizard()),
      action('この薬剤名で進む',()=>configure(panel,resolved,identity,demo,patient),'')
    );panel.append(controls);
  }

  function configure(panel,resolved,identity,demo,patient){
    panel.replaceChildren(make('h4','','③ 規格・量・いつを設定'));
    info(panel,'notice','選択した薬剤：'+resolved.drug['薬名']+'（'+resolved.label+'）');
    const form=make('div','ux17-wizard-inputs');
    form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:10px 0';
    const choices=listStrengths(identity,resolved,demo);
    const strengthSelect=select([
      ['','規格を選択'],
      ...choices.map(c=>[c.strength,c.strength]),
      ['__manual__','規格を手入力']
    ]);
    field(form,'規格（mgなど）',strengthSelect);
    const strengthManual=input('text','例：5mg',60);
    strengthManual.style.display='none';
    strengthSelect.onchange=()=>{
      strengthManual.style.display=strengthSelect.value==='__manual__'?'block':'none';
    };
    field(form,'手入力の規格',strengthManual);
    const qty=input('text','例：1、0.5',12);qty.inputMode='decimal';
    field(form,'1回の服用量',qty);
    const unitSelect=select([
      ['','単位を選択'],
      ...['錠','カプセル','包','g','mL','本','枚','回','その他'].map(s=>[s,s])
    ]);
    field(form,'服用量の単位',unitSelect);
    const timeSelect=select([
      ['','飲むタイミングを選択'],
      ...TIME.map(([label])=>[label,label])
    ]);
    field(form,'いつ飲む',timeSelect);
    const timeManual=input('text','例：月・木の朝',50);
    timeManual.style.display='none';
    timeSelect.onchange=()=>{
      timeManual.style.display=timeSelect.value==='その他'?'block':'none';
    };
    field(form,'その他のタイミング',timeManual);
    const statusSelect=select([['','区分を選択'],['定期','定期薬'],['頓服','頓服薬']]);
    field(form,'服用区分',statusSelect);
    panel.append(form);
    info(panel,'safety','薬価は自動設定しません。定期薬の参考日額は、単価を別途確認・保存してから計算します。');
    const message=info(panel,'status','');
    message.setAttribute('role','status');
    const buttons=make('div');buttons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    buttons.append(
      action('薬剤名に戻る',()=>begin(identity,demo,identity?.kind==='generic'?'generic':'original')),
      action(demo?'登録結果をプレビュー（保存なし）':'確認して一覧に登録',async()=>{
        if(submitting)return;
        const strength=(strengthSelect.value==='__manual__'?strengthManual.value:strengthSelect.value).trim().normalize('NFKC');
        const qtyText=qty.value.trim().normalize('NFKC');
        const unit=unitSelect.value;
        const mode=statusSelect.value;
        const time=timeSelect.value==='その他'?timeManual.value.trim():timeSelect.value;
        if(!strength||strength.length>60||!qtyText||!unit||!time||!mode||
           time.length>50||! /^\d{1,4}(?:\.\d{1,3})?$/.test(qtyText)||
           Number(qtyText)<=0||Number(qtyText)>1000){
          message.textContent='規格・1回量・単位・服用タイミング・区分を正しく入力してください。';
          return;
        }
        if(time==='疼痛時'&&mode!=='頓服'){
          message.textContent='「疼痛時」は頓服として登録してください。';return;
        }
        const count=TIME.find(([name])=>name===time)?.[1]??null;
        const daily=mode==='定期'&&count!==null
          ?String(Math.round(Number(qtyText)*count*1000)/1000):'';
        if(daily&&Number(daily)>1000){
          message.textContent='1日の合計数量が上限を超えます。';return;
        }
        const record={
          id:typeof uid==='function'?uid():String(Date.now()),
          drug:resolved.drug,
          addedAt:typeof nowISO==='function'?nowISO():new Date().toISOString(),
          ...(resolved.origin?{rx045Origin:resolved.origin}:{}),
          pricing:{strength,unitPrice:'',unit,dailyQuantity:daily,status:mode},
          ux17Schedule:{doseQuantity:qtyText,doseUnit:unit,timing:time,status:mode}
        };
        if(demo){
          panel.replaceChildren(make('h4','','④ 登録後の表示イメージ（保存なし）'));
          panel.append(make('strong','',record.drug['薬名']+'　'+strength+'　1回'+qtyText+unit+'　'+time));
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
        if(prev.some(r=>medSignature(r?.drug)===medSignature(record.drug))){
          message.textContent='同じ薬剤はすでに登録されています。';return;
        }
        if(!confirm('「'+record.drug['薬名']+'」 '+strength+' ／ 1回'+qtyText+unit+
          ' ／ '+time+' ／ '+mode+' を患者の一覧に登録しますか？\n処方内容と一致することを確認してください。'))return;
        submitting=true;
        message.textContent='暗号化保存しています…';
        patient.medications=[...prev,record];
        try{
          if(patient!==selectedPatient||!key||!state)throw Error('患者またはロック状態が変わりました');
          await save();
          if(patient===selectedPatient){
            drawPatientMedicationList();
            panel.replaceChildren(make('h4','','④ 登録完了'));
            info(panel,'success','選択した薬剤と規格・量・タイミングを保存しました。');
            panel.append(action('閉じる',clearWizard));
          }
        }catch(err){
          patient.medications=prev;
          if(patient===selectedPatient){
            drawPatientMedicationList();
            message.textContent='保存できませんでした。登録は元に戻しました：'+String(err?.message||err).slice(0,100);
          }
        }finally{submitting=false;}
      },'')
    );panel.append(buttons);
  }

  // Intercept existing RX045/UX17 candidate actions before old handlers run.
  // Existing search rendering, search input and master database are untouched.
  document.addEventListener('click',event=>{
    const btn=event.target?.closest?.('button.rx045Choose, .ux17-generic-candidate button[data-ux17-kind]');
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