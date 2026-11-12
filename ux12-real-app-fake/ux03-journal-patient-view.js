/* UX03 (2026-11-04): View pending-discharge patient details from Journal.
 * UI-only; invokes the existing patient viewer and keeps summary workflow intact.
 * Does not read/write storage or mutate discharge/summary fields.
 */
(function(){
  'use strict';
  if(window.__MSW_UX03_JOURNAL_PATIENT_VIEW_INSTALLED__)return;
  if(typeof window.renderJournalPreview!=='function'||
     typeof window.openPatient!=='function'||typeof window.closePatient!=='function')return;
  const originalRenderJournal=window.renderJournalPreview;
  const originalClosePatient=window.closePatient;
  let journalReturnTop=null;
  function onJournal(){
    return typeof screen!=='undefined'&&screen==='journal'&&
      !!document.getElementById('main');
  }
  function attachPatientViewButtons(){
    if(!onJournal())return;
    document.querySelectorAll('#main .pending-complete').forEach(doneButton=>{
      const actions=doneButton.closest('.journal-actions');
      if(!actions||actions.querySelector('.ux03-view-patient'))return;
      const viewButton=document.createElement('button');
      viewButton.type='button';
      viewButton.className='btn secondary ux03-view-patient';
      viewButton.textContent='患者情報';
      viewButton.dataset.id=doneButton.dataset.id;
      viewButton.onclick=()=>{
        if(!onJournal()||document.getElementById('modal'))return;
        const patient=state?.patients?.find(p=>p.id===viewButton.dataset.id);
        if(!patient||!patient.summaryPending||!patient.dischargeDate)return;
        const scrolling=document.scrollingElement||document.documentElement;
        journalReturnTop=Math.max(0,Number(window.scrollY||scrolling?.scrollTop||0));
        try{window.openPatient(patient)}catch(error){journalReturnTop=null;throw error;}
      };
      actions.insertBefore(viewButton,actions.firstChild);
    });
  }
  window.renderJournalPreview=function(...args){
    const result=originalRenderJournal.apply(this,args);
    attachPatientViewButtons();
    return result;
  };
  window.closePatient=function(...args){
    const saved=journalReturnTop;
    journalReturnTop=null;
    const result=originalClosePatient.apply(this,args);
    if(saved!==null&&onJournal()&&!document.getElementById('modal')){
      const restore=()=>{
        if(!onJournal()||document.getElementById('modal'))return;
        const scrolling=document.scrollingElement||document.documentElement;
        const maxTop=Math.max(0,scrolling.scrollHeight-window.innerHeight);
        window.scrollTo(0,Math.min(saved,maxTop));
      };
      restore();
      window.requestAnimationFrame(restore);
    }
    return result;
  };
  attachPatientViewButtons(); // A journal screen may already be rendered.
  window.__MSW_UX03_JOURNAL_PATIENT_VIEW_INSTALLED__=true;
})();
