/* UX17 fake stage: compact medication list ("drug / amount / when").
 * Presentation-only. Patient records do not yet store administration times:
 * never infer times or per-dose quantities from a daily total.
 * Existing drug actions, price editor and master references remain in DOM.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_MEDICATION_COMPACT_INSTALLED__)return;
  if(typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX17_MEDICATION_COMPACT_INSTALLED__=true;

  const sampleDose=[
    ['1回1錠','朝・夕食後'],
    ['1回1錠','朝食後'],
    ['未設定','未設定'],
    ['1回1錠','疼痛時']
  ];

  function addStyle(){
    if(document.getElementById('ux17-med-compact-style'))return;
    const style=document.createElement('style');
    style.id='ux17-med-compact-style';
    style.textContent=[
      '#modal .ux17-med-compact-head{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,.95fr) minmax(0,1.2fr);column-gap:10px;align-items:start}',
      '#modal .ux17-med-compact-head>div{min-width:0;overflow-wrap:anywhere}',
      '#modal .ux17-med-compact-head strong{font-size:inherit}',
      '#modal .ux17-med-compact-head .notice{margin-top:3px}',
      '#modal .ux17-med-compact-val{font-size:14px;line-height:1.45;font-weight:650;white-space:normal}',
      '#modal .ux17-med-compact-val .ux17-med-label{display:block;font-size:11px;color:var(--muted);font-weight:500;margin-bottom:2px}',
      '#modal .ux17-med-more{margin-top:9px;border-top:1px solid var(--line)}',
      '#modal .ux17-med-more>summary{padding:9px 0!important;color:var(--brand);font-size:13px;font-weight:700;cursor:pointer}',
      '#modal .ux17-med-more>.patient-med-glance{margin-top:0}',
      '#modal .ux17-med-more>.patient-med-editor{margin-top:2px}',
      '#modal .ux17-med-more>.patient-med-del,#modal .ux17-med-more>.btn.danger{margin-top:10px}',
      '@media(max-width:530px){#modal .ux17-med-compact-head{grid-template-columns:minmax(0,1.25fr) minmax(0,.85fr) minmax(0,1.2fr);column-gap:6px}#modal .ux17-med-compact-val{font-size:13px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function displayValues(row){
    const sampleId=row.getAttribute('data-ux17-sample');
    if(sampleId!==null && sampleDose[Number(sampleId)])return sampleDose[Number(sampleId)];
    const editor=row.querySelector('.patient-med-editor');
    const quantity=editor?.querySelector('.patient-med-daily')?.value?.trim()||'';
    const unit=editor?.querySelector('.patient-med-unit')?.value?.trim()||'';
    // Daily total is not per-dose amount. Keep its meaning explicit.
    const dose=quantity&&unit?'1日合計'+quantity+unit:'未設定';
    return [dose,'未設定'];
  }

  function compactRow(row){
    if(row.querySelector('.ux17-med-compact-head'))return;
    const line=row.querySelector(':scope > .patient-med-line');
    const glance=row.querySelector(':scope > .patient-med-glance');
    const editor=row.querySelector(':scope > .patient-med-editor');
    const title=line?.firstElementChild;
    if(!line||!glance||!editor||!title)return;
    const [amount,timing]=displayValues(row);

    // Keep the original medical classification notice's font size, but
    // move status and demo labels out of the concise primary view.
    const classification=title.querySelector(':scope > .notice');
    if(classification){
      const original=classification.textContent||'';
      const category=original.split('　・　')[0].trim();
      if(category)classification.textContent=category;
    }

    const heading=document.createElement('div');
    heading.className='ux17-med-compact-head';
    // Keep the original name and category's font styles.
    heading.appendChild(title);
    for(const [label,value] of [['量',amount],['いつ',timing]]){
      const col=document.createElement('div');
      col.className='ux17-med-compact-val';
      const key=document.createElement('span');
      key.className='ux17-med-label';
      key.textContent=label;
      const text=document.createElement('span');
      text.textContent=value;
      col.append(key,text);
      heading.appendChild(col);
    }

    const more=document.createElement('details');
    more.className='ux17-med-more';
    const summary=document.createElement('summary');
    summary.textContent='詳細を表示（薬効・後発品・薬価・設定など）';
    more.appendChild(summary);
    more.appendChild(glance);
    more.appendChild(editor);
    const deleteButton=line.querySelector('button');
    if(deleteButton)more.appendChild(deleteButton);
    line.remove();
    row.prepend(heading);
    row.appendChild(more);
  }

  function redraw(){
    addStyle();
    const root=document.querySelector('#tabbody .patient-med-page');
    if(!root)return;
    root.querySelectorAll('#patientMedList > .patient-med-row, #ux17SampleRows > .patient-med-row')
      .forEach(compactRow);
  }

  // Update both initial render and subsequent add/delete/price-save rerenders.
  if(typeof window.drawPatientMedicationList==='function'){
    const priorList=window.drawPatientMedicationList;
    window.drawPatientMedicationList=function(...args){
      const result=priorList.apply(this,args);
      redraw();
      return result;
    };
  }
  const priorRender=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=priorRender.apply(this,args);
    redraw();
    return result;
  };
})();