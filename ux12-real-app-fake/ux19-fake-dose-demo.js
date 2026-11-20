/* UX19: entirely fictional, DOM-only schedule/printing preview. Never saves. */
(function(){
  'use strict';
  if(window.__UX19_FAKE_DEMO__)return;
  window.__UX19_FAKE_DEMO__=true;
  const make=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
  function install(){
    const root=document.querySelector('#tabbody .patient-med-page');
    if(!root||root.querySelector('#ux19FakeDemo'))return;
    const target=root.querySelector('#patientMedList')?.closest('section.panel');
    if(!target)return;
    const card=make('section');card.id='ux19FakeDemo';
    card.className='panel';
    card.style.cssText='padding:12px;border:2px solid #14b8a6;background:#f0fdfa;margin:12px 0';
    card.append(make('h4','UX19 架空薬の数量・用法テスト（保存なし）'));
    const help=make('p','架空薬A 10mg／錠：朝・昼・夜に各1錠を入力した見本。時間帯の数量を変えると合計も変わります。患者データ・薬情には保存しません。');
    help.className='notice';card.append(help);
    const unitLabel=make('strong','規格：10mg　単位：錠');
    card.append(unitLabel);
    const editor=window.UX19DoseSchedule.buildEditor(null,()=>'錠');
    card.append(editor.panel);
    // Pre-fill fictional values explicitly, not inferred from patient data.
    const items=editor.panel.querySelectorAll('input[type=checkbox]');
    const amounts=editor.panel.querySelectorAll('input[type=text]');
    items.forEach((x,i)=>{x.checked=i<3;});
    amounts.forEach((x,i)=>{x.disabled=i>=3;x.value=i<3?'1':'';});
    const condition=editor.panel.querySelector('select');
    if(condition)condition.value='食後';
    editor.refresh();
    const result=make('p','上の数量を変更して「数量と用法を確認」を押してください。');
    result.style.cssText='font-weight:700;white-space:pre-wrap';
    const button=make('button','数量と用法を確認（保存なし）');
    button.type='button';button.className='btn secondary';
    const paper=make('button','架空薬のA4印刷見本');
    paper.type='button';paper.className='btn secondary';
    let last=null;
    button.onclick=()=>{
      const checked=editor.read('10mg','錠','定期');
      if(checked.error){last=null;result.textContent=checked.error;return;}
      const row={drug:{'薬名':'架空薬A'},pricing:{
        strength:'10mg',unit:'錠',status:'定期',dailyQuantity:checked.schedule.dailyQuantity
      },ux19Schedule:checked.schedule};
      last=window.UX17PrescriptionPrintTest?.printableRow(row)||null;
      result.textContent=last
        ?'規格：'+last.strength+'　数量：'+last.dose+'　用法：'+last.when
        :'印刷用の数量と用法を確認できませんでした。';
    };
    paper.onclick=()=>{
      button.click();
      if(!last)return;
      const html=window.UX17PrescriptionPrintTest.printHTML([last],'架空患者A','FAKE-UX19',true);
      const w=window.open('','_blank');
      if(!w){alert('Safariで別画面を開けませんでした。');return;}
      w.document.open();w.document.write(html);w.document.close();
    };
    const actions=make('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:8px 0';
    actions.append(button,paper);
    card.append(actions,result);
    target.before(card);
  }
  const old=window.renderPatientMedications;
  if(typeof old==='function'){
    window.renderPatientMedications=function(...args){
      const result=old.apply(this,args);install();return result;
    };
  }
})();
