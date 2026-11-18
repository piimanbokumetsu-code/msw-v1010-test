/* UX17 (2026-11-18): Search an originator brand and show generic names
 * explicitly registered in the SAME medication master group.
 * Fake staging only; no automatic substitution, name rewrite, or price reuse.
 * The chosen named drug is still saved only by RX045's existing confirmed flow.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_GENERIC_CHOICES_INSTALLED__)return;
  if(typeof drawPatientDrugResults!=='function'||!window.RX045?.selectionList)return;
  window.__MSW_UX17_GENERIC_CHOICES_INSTALLED__=true;
  const norm=text=>String(text??'').trim().normalize('NFKC').toLocaleLowerCase('ja');

  function drawRelatedGenerics(){
    const queryInput=document.querySelector('#patientDrugQuery');
    const host=document.querySelector('#patientDrugResults');
    if(!queryInput||!host)return;
    const q=norm(queryInput.value);
    if(q.length<2)return;

    const drugs=Array.isArray(state?.drugs)?state.drugs:[];
    const related=[];
    for(let masterIndex=0;masterIndex<drugs.length;masterIndex++){
      const master=drugs[masterIndex];
      const options=window.RX045.selectionList(master,masterIndex);
      if(!options.some(c=>c.kind==='original'&&norm(c.name).includes(q)))continue;
      for(const candidate of options){
        if(candidate.kind!=='generic'||!candidate.name)continue;
        // Direct name results are already listed by RX045 itself.
        if(norm(candidate.name).includes(q))continue;
        related.push(candidate);
        if(related.length>=40)break;
      }
      if(related.length>=40)break;
    }

    if(!related.length && !q.includes('架空降圧薬a'))return;
    const panel=document.createElement('section');
    panel.className='ux17-related-generic-choices';
    panel.style.cssText='margin-top:12px;padding:10px;border:1px solid #9dc6b7;border-radius:10px;background:#f6fcf9';
    const heading=document.createElement('strong');
    heading.textContent='同じ薬情マスターに登録されている後発品候補';
    const caution=document.createElement('p');
    caution.className='notice';
    caution.textContent='実際の処方箋・薬剤情報で商品名と規格を確認してから選択してください。代替可能性を自動判定しません。';
    panel.append(heading,caution);

    const addItem=(label,preview,identity)=>{
      const row=document.createElement('div');
      row.className='patient-med-hit ux17-generic-candidate';
      const info=document.createElement('div');
      const title=document.createElement('strong');
      title.textContent=label;
      const desc=document.createElement('p');
      desc.className='notice';
      desc.textContent=preview;
      info.append(title,desc);
      const button=document.createElement('button');
      button.type='button';
      button.className='btn secondary';
      button.textContent=identity?'この後発品を選ぶ':'表示例（登録なし）';
      if(!identity){button.disabled=true;}
      else{
        // UX17 workflow intercepts this button and asks for strength, amount
        // and timing BEFORE the medication is saved to the fake patient.
        button.dataset.ux17Index=String(identity.index);
        button.dataset.ux17Kind=identity.kind;
        button.dataset.ux17Brand=String(identity.brandIndex);
        button.onclick=()=>void changePatientMedication('add-brand',identity);
      }
      row.append(info,button);
      panel.appendChild(row);
    };

    for(const c of related){
      const master=drugs[c.index];
      const price=window.RX045.pricesFor?.(master,'generic',c.brandIndex);
      addItem(c.name,c.label+' ／ '+String(price?.preview||'規格・薬価未登録'),{
        index:c.index,kind:'generic',brandIndex:c.brandIndex
      });
    }

    // Non-persistent demonstration if no sample master was registered yet.
    // This disabled fictional example can never be added to a patient.
    if(q.includes('架空降圧薬a')&&!related.length)
      addItem('架空後発品A','架空の表示例（薬情マスターには未登録）',null);

    host.appendChild(panel);
  }

  const prior=drawPatientDrugResults;
  drawPatientDrugResults=function(...args){
    const result=prior.apply(this,args);
    drawRelatedGenerics();
    return result;
  };
})();