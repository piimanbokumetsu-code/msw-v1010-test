/* UX17 FIX01 FAKE-ONLY: interactive edit-button demonstration for the
 * four DOM-only sample medication cards. Does not access selectedPatient,
 * state, save, IndexedDB, medication master or any protected data.
 */
(function(){
  'use strict';
  if(window.__UX17_FIX01_DEMO_EDIT__)return;
  if(typeof window.renderPatientMedications!=='function')return;
  window.__UX17_FIX01_DEMO_EDIT__=true;
  const defaults=[
    ['5mg','1','錠','朝・夕食後'],
    ['10mg','1','錠','朝食後'],
    ['','1','錠','朝食後'],
    ['200mg','1','錠','疼痛時']
  ];
  const make=(tag,label)=>{
    const x=document.createElement(tag);
    if(label!==undefined)x.textContent=label;
    return x;
  };
  const field=(parent,label,value,placeholder)=>{
    const wrap=make('label');
    wrap.style.cssText='display:flex;flex-direction:column;gap:4px;min-width:125px';
    wrap.append(make('span',label));
    const input=make('input');input.type='text';input.value=value;
    input.placeholder=placeholder;input.maxLength=60;input.autocomplete='off';
    wrap.append(input);parent.append(wrap);return input;
  };
  function present(row,values){
    const cols=row.querySelectorAll('.ux17-med-compact-val');
    if(cols.length!==3)return;
    const shown=[values[0]||'未設定',values[1]?'1回'+values[1]+values[2]:'未設定',values[3]||'未設定'];
    cols.forEach((col,i)=>{
      const spans=col.querySelectorAll('span');
      if(spans[1])spans[1].textContent=shown[i];
    });
  }
  function addDemoControls(){
    const sample=document.querySelector('#ux17SampleRows');
    if(!sample)return;
    sample.querySelectorAll('.patient-med-row[data-ux17-sample]').forEach(row=>{
      if(row.querySelector('.ux17-edit-quick-action'))return;
      const index=Number(row.dataset.ux17Sample);
      if(!Number.isInteger(index)||!defaults[index])return;
      const values=defaults[index].slice();
      const details=row.querySelector(':scope > .ux17-med-more');
      if(!details)return;
      const toolbar=make('div');toolbar.className='ux17-edit-quick-action';
      toolbar.style.cssText='display:flex;justify-content:flex-end;margin:5px 0 3px';
      const btn=make('button','✏️ 規格・量・いつを修正');
      btn.type='button';btn.className='btn secondary';
      btn.style.cssText='min-height:38px;padding:6px 11px;font-size:13px;line-height:1.35';
      toolbar.append(btn);
      row.insertBefore(toolbar,details);
      btn.onclick=()=>{
        const prior=details.querySelector('.ux17-sample-edit-form');
        if(prior){prior.remove();return;}
        details.open=true;
        const panel=make('div');panel.className='ux17-sample-edit-form';
        panel.style.cssText='padding:10px;border:1px solid #91bdb5;border-radius:9px;margin:8px 0;background:#f5fbfa';
        panel.append(make('strong','架空サンプルの表示修正（保存なし）'));
        const form=make('div');
        form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:9px 0';
        const strength=field(form,'規格',values[0],'例：5mg');
        const qty=field(form,'1回の服用量',values[1],'例：1');
        const unit=field(form,'単位',values[2],'錠');
        const time=field(form,'いつ',values[3],'朝・夕食後');
        panel.append(form);
        const msg=make('p','これは架空の表示見本です。変更内容は患者情報に保存されません。');
        msg.className='notice';panel.append(msg);
        const actions=make('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
        const cancel=make('button','キャンセル');cancel.type='button';cancel.className='btn secondary';
        cancel.onclick=()=>panel.remove();
        const apply=make('button','表示だけ変更（保存なし）');apply.type='button';apply.className='btn';
        apply.onclick=()=>{
          const s=strength.value.trim(),q=qty.value.trim(),u=unit.value.trim(),t=time.value.trim();
          if(!s||s.length>60||!t||t.length>50||!u||u.length>15||
              !/^\d{1,4}(?:\.\d{1,3})?$/.test(q)||Number(q)<=0||Number(q)>1000){
            msg.textContent='入力内容を確認してください。';return;
          }
          values.splice(0,4,s,q,u,t);
          present(row,values);
          panel.remove();
        };
        actions.append(cancel,apply);panel.append(actions);
        const editor=details.querySelector('.patient-med-editor');
        if(editor)details.insertBefore(panel,editor);else details.append(panel);
        if(typeof panel.scrollIntoView==='function')
          panel.scrollIntoView({block:'nearest',behavior:'smooth'});
      };
    });
  }
  const prior=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=prior.apply(this,args);
    addDemoControls();
    return result;
  };
})();