/* RX050 fake-only review and master-return prototype.
   The existing UX05 confirmation flag is read from a fictional master.
   Registration stays available even for pending masters. In-memory only.
   This is a navigation prototype, not the live RX036 master editor. */
(function(){
  'use strict';
  const root=document.querySelector('#tabbody');
  const panel=document.querySelector('#fakeMasterPanel');
  if(!root||!panel||!Array.isArray(state?.drugs))return;
  let editingIndex=null;
  const originalMaster=state.drugs.map(d=>({...d}));
  const $=id=>document.getElementById(id);
  function decorate(){
    const host=$('patientDrugResults');if(!host)return;
    for(const candidate of host.querySelectorAll('.rx045Candidate')){
      const btn=candidate.querySelector('button.rx045Choose');
      const index=Number(btn?.dataset.index);
      if(!btn||!Number.isSafeInteger(index)||index<0||index>=state.drugs.length)continue;
      const drug=state.drugs[index],done=drug.ux05ReviewDone===true;
      candidate.classList.toggle('rx050Pending',!done);
      const badge=document.createElement('span');
      badge.className='rx050ReviewPill'+(done?' rx050Done':'');
      badge.textContent=done?'確認済み':'マスター要確認';
      const name=candidate.querySelector('strong');
      if(name)name.after(badge);
      // Put the edit action OUTSIDE .rx045Candidate. UX17 selection wizard
      // intentionally interprets any click inside a candidate as registration.
      if(!done){
        const edit=document.createElement('button');
        edit.type='button';
        edit.className='btn secondary rx050FakeMasterEdit';
        edit.textContent='この薬のマスターを確認・編集';
        edit.setAttribute('aria-label',String(drug['薬名']||'薬剤')+'の薬情マスターを確認・編集');
        edit.addEventListener('click',()=>open(index));
        candidate.after(edit);
      }
    }
  }
  function showPatient(){
    editingIndex=null;
    panel.hidden=true;
    root.hidden=false;
    drawPatientDrugResults(); // Preserves the original query & refreshes review badges.
  }
  function open(index){
    const drug=state.drugs[index];
    if(!drug||editingIndex!==null)return;
    const wizard=document.querySelector('#ux17Wizard');
    if(wizard){
      if(!confirm('入力途中の処方薬はまだ登録されていません。登録せずマスター編集へ進みますか？'))return;
      wizard.remove();
    }
    editingIndex=index;
    $('fakeMasterName').value=String(drug['薬名']||'');
    $('fakeMasterCategory').value=String(drug['医薬品分類']||'');
    $('fakeMasterEffect').value=String(drug['薬効']||'');
    $('fakeMasterReviewed').checked=drug.ux05ReviewDone===true;
    $('fakeMasterStatus').textContent='架空マスターの確認・編集です。患者の登録済み処方は自動変更しません。';
    root.hidden=true;
    panel.hidden=false;
    panel.scrollIntoView({block:'start',behavior:'auto'});
  }
  $('fakeMasterBack').addEventListener('click',showPatient);
  $('fakeMasterSave').addEventListener('click',()=>{
    if(!Number.isSafeInteger(editingIndex))return;
    const drug=state.drugs[editingIndex];
    if(!drug)return;
    const name=$('fakeMasterName').value.trim(),category=$('fakeMasterCategory').value.trim();
    if(!name||name.length>160||category.length>150){
      $('fakeMasterStatus').textContent='架空薬の薬名・分類を確認してください。';return;
    }
    // Explicitly change only the selected master. Do not touch
    // selectedPatient.medications or the original patient snapshot.
    drug['薬名']=name;
    drug['医薬品分類']=category;
    drug['薬効']=$('fakeMasterEffect').value.trim();
    drug.ux05ReviewDone=$('fakeMasterReviewed').checked;
    showPatient();
    $('fakeReviewMessage').textContent=drug.ux05ReviewDone
      ?'架空マスターを確認済みにしました。該当薬の要確認色は消えます。'
      :'架空マスターを保存しました。未確認のままでも患者への薬剤登録はできます。';
  });
  $('fakeReset').addEventListener('click',()=>{
    state.drugs=originalMaster.map(d=>({...d}));
    editingIndex=null;
    panel.hidden=true;
    root.hidden=false;
    $('fakeReviewMessage').textContent='';
    drawPatientDrugResults();
  });
  window.RX050FakeReview=Object.freeze({decorate});
  decorate();
})();
