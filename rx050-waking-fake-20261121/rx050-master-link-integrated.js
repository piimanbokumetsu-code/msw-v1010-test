/* RX050 staged review/navigation bridge. Fake-tested only; do not deploy
 * to the real patient app without explicit approval and the prescribed PR.
 * Reads existing UX05 master status. No writes, no network, no storage,
 * no new patient/master fields and no replacement of prescription save logic.
 */
(function(){
  'use strict';
  if(window.__RX050_MASTER_LINK__)return;
  if(typeof drawPatientDrugResults!=='function'||typeof renderDrugs!=='function'||
     typeof render!=='function'||typeof renderPatientModal!=='function'||
     !window.RX045)return;
  window.__RX050_MASTER_LINK__=true;
  let pending=null;
  let editorTouched=false;

  function injectStyle(){
    if(document.getElementById('rx050MasterLinkStyle'))return;
    const style=document.createElement('style');
    style.id='rx050MasterLinkStyle';
    style.textContent=[
      '#patientDrugResults .rx050PendingMaster{background:#fff5e6!important;border:2px solid #e9ae5a!important;border-radius:10px;padding:9px;}',
      '#patientDrugResults .rx050MasterPill{font-size:12px;font-weight:700;border:1px solid #d9a367;border-radius:99px;padding:3px 9px;background:#fff0d5;color:#85501b;margin-left:8px;}',
      '#patientDrugResults .rx050MasterEdit{display:block;margin:5px 0 12px;max-width:100%;white-space:normal;text-align:left;}',
      '#rx050ReturnPanel{padding:11px 13px;margin:8px 0 12px;background:#eef8f6;border:1px solid #a5d5cc;border-radius:10px;}',
      '#rx050ReturnPanel button{min-height:44px;white-space:normal;}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function decorateResults(){
    if(!key||!state||!selectedPatient||activeTab!=='medications')return;
    const host=document.querySelector('#tabbody .patient-med-page #patientDrugResults');
    if(!host)return;
    injectStyle();
    for(const card of host.querySelectorAll('.rx045Candidate, .ux17-generic-candidate')){
      const choice=card.querySelector('button.rx045Choose, button[data-ux17-kind]');
      if(!choice||choice.disabled)continue;
      const rawIndex=choice.classList.contains('rx045Choose')
        ?choice.dataset.index:choice.dataset.ux17Index;
      const index=Number(rawIndex);
      if(!Number.isSafeInteger(index)||index<0||index>=(state.drugs||[]).length)continue;
      const master=state.drugs[index];
      if(!master||master.ux05ReviewDone===true)continue;
      card.classList.add('rx050PendingMaster');
      const title=card.querySelector('strong');
      if(title){
        const pill=document.createElement('span');
        pill.className='rx050MasterPill';
        pill.textContent='マスター要確認';
        title.insertAdjacentElement('afterend',pill);
      }
      // MUST be a sibling, NOT a child of .rx045Candidate. UX17 treats
      // candidate card clicks as "register this prescription" by design.
      const edit=document.createElement('button');
      edit.type='button';edit.className='btn secondary rx050MasterEdit';
      edit.textContent='マスターを確認・編集（任意）';
      edit.addEventListener('click',()=>openMaster(index,master));
      card.insertAdjacentElement('afterend',edit);
    }
  }
  function clearPending(){pending=null;editorTouched=false;}
  function openMaster(index,master){
    if(pending||!state||!key||!selectedPatient||
       !Array.isArray(state.drugs)||state.drugs[index]!==master||
       !document.querySelector('#modal #tabbody .patient-med-page')){
      alert('患者画面・薬剤マスターを確認してください。もう一度検索してください。');return;
    }
    // In production, use the already-proven patient transition function:
    // flush any pending patient autosave and block active photo/drug writes.
    // The fake harness has no autosave and intentionally uses the fallback.
    if(typeof finishPatientAndNavigate!=='function'){
      const unsaved=document.querySelector('#tabbody .patient-med-editor[data-med-dirty="1"]');
      if(unsaved&&!confirm('患者の薬価欄に未保存の入力があります。保存せずマスター編集へ進みますか？'))return;
    }
    const wizard=document.querySelector('#tabbody #ux17Wizard');
    if(wizard&&!confirm('処方薬の入力途中の内容は登録されていません。破棄してマスター編集へ進みますか？'))return;
    const patient=selectedPatient;
    if(!Array.isArray(state.patients)||!state.patients.includes(patient)){
      alert('患者データが更新されています。患者一覧から開き直してください。');return;
    }
    const query=document.querySelector('#tabbody #patientDrugQuery')?.value||'';
    const visit=()=>{
      if(!key||!state||selectedPatient!==patient||
         !Array.isArray(state.drugs)||state.drugs[index]!==master||
         !document.querySelector('#modal')){
        alert('患者や薬情マスターの状態が変わりました。患者の処方薬から開き直してください。');return;
      }
      pending={patient,originScreen:screen,query};
      editorTouched=false;
      if(typeof clearPatientAutoTimer==='function')clearPatientAutoTimer();
      document.querySelector('#modal')?.remove();
      selectedPatient=null;
      screen='drugs';
      render();
      const input=document.querySelector('#dq');
      if(!input||!document.querySelector('#drugList'))return;
      const masterName=String(master['薬名']||'').trim();
      if(!masterName)return;
      input.value=masterName;
      if(typeof drawDrugs==='function')drawDrugs();
      const q=masterName.toLowerCase();
      const visible=(state.drugs||[]).map((drug,i)=>({drug,i}))
        .filter(({drug})=>!q||rx038MasterSearchText(drug).includes(q)).slice(0,100);
      const position=visible.findIndex(row=>row.i===index&&row.drug===master);
      const cards=document.querySelectorAll('#drugList .drug-list article.drug');
      if(position>=0&&cards[position]){
        cards[position].click(); // Invoke RX036's already-tested full-card editor.
        if(document.querySelector('#rx036Editor')?.hidden===false)return;
      }
      const notice=document.querySelector('#rx036Notice');
      if(notice)notice.textContent='対象薬が一覧に表示されています。該当カードをタップして編集してください。';
    };
    if(typeof finishPatientAndNavigate==='function'){
      void finishPatientAndNavigate(visit);
    }else{
      visit();
    }
  }
  function decorateReturn(){
    if(!pending||screen!=='drugs'||!key||!state)return;
    const main=document.querySelector('#main');
    if(!main||main.querySelector('#rx050ReturnPanel'))return;
    const banner=document.createElement('div');
    banner.id='rx050ReturnPanel';
    const caption=document.createElement('p');
    caption.className='notice';
    caption.textContent='マスターを確認したら元の患者の処方薬検索へ戻れます。';
    const button=document.createElement('button');
    button.type='button';button.className='btn secondary';
    button.textContent='← 患者の処方薬入力に戻る';
    button.addEventListener('click',returnToPatient);
    banner.append(caption,button);
    const anchor=main.querySelector('.rx036Actions')||main.querySelector('.toolbar');
    if(anchor)anchor.insertAdjacentElement('afterend',banner);
    else main.prepend(banner);
  }
  function returnToPatient(){
    const session=pending;
    if(!session)return;
    const editor=document.querySelector('#rx036Editor');
    if(editor&&!editor.hidden&&Array.from(editor.querySelectorAll('button')).some(b=>b.disabled)){
      alert('薬情マスターの保存中です。完了後に戻ってください。');return;
    }
    if(editorTouched&&document.querySelector('#rx036Editor')?.hidden===false&&
       !confirm('マスターの未保存の入力を破棄して、患者の処方薬へ戻りますか？'))return;
    if(!state||!key||!Array.isArray(state.patients)||
       !state.patients.includes(session.patient)){
      clearPending();
      alert('患者またはロック状態が変わりました。患者一覧から開き直してください。');
      return;
    }
    clearPending();
    document.querySelector('#rx036Editor')?.remove(); // view-only; encrypted master data untouched
    screen=session.originScreen;
    selectedPatient=session.patient;
    activeTab='medications';
    render();
    renderPatientModal();
    const query=document.querySelector('#tabbody #patientDrugQuery');
    if(query){
      query.value=session.query;
      drawPatientDrugResults(); // display latest master review state after save
      try{query.scrollIntoView({block:'center',behavior:'auto'});}catch(_){}
    }
  }
  const previousDraw=drawPatientDrugResults;
  drawPatientDrugResults=function(...args){
    const result=previousDraw.apply(this,args);
    decorateResults();
    return result;
  };
  const previousRender=renderDrugs;
  renderDrugs=function(...args){
    const result=previousRender.apply(this,args);
    if(pending&&screen==='drugs'&&(document.querySelector('#rx036Editor')?.hidden ?? true))
      editorTouched=false; // a completed RX036 save re-renders a closed editor
    decorateReturn();
    return result;
  };
  document.addEventListener('input',event=>{
    if(pending&&event.target?.closest?.('#rx036Editor'))editorTouched=true;
  },true);
  document.addEventListener('change',event=>{
    if(pending&&event.target?.closest?.('#rx036Editor'))editorTouched=true;
  },true);
  document.addEventListener('click',event=>{
    if(!pending)return;
    const nav=event.target?.closest?.('.bottomnav .navbtn');
    if(nav&&nav.dataset.screen!=='drugs')clearPending();
    if(event.target?.closest?.('#lockBtn'))clearPending();
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')clearPending();
  },true);
})();
