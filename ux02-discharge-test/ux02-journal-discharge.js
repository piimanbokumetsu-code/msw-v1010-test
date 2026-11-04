/* UX02 (2026-11-04): Allow discharge from the Journal admission queue bed picker.
 * Only adds a UI entry point to the existing, confirmed discharge workflow.
 * Does not read/write storage or alter patient data itself.
 */
(function(){
  'use strict';
  if(window.__MSW_UX02_JOURNAL_DISCHARGE_INSTALLED__)return;
  if(typeof window.renderJournalPreview!=='function'||typeof window.startDischargeFlow!=='function')return;
  const originalRenderJournal=window.renderJournalPreview;
  function attachJournalButtons(){
    document.querySelectorAll('#main .journal-bed-btn').forEach(button=>{
      if(button.dataset.ux02Bound)return;
      button.dataset.ux02Bound='1';
      button.addEventListener('click',()=>{
        if(typeof screen==='undefined'||screen!=='journal')return;
        const patient=state?.patients?.find(p=>p.id===button.dataset.id);
        if(!patient||patient.dischargeDate||!patient.journalAdmissionPending)return;
        const picker=document.getElementById('groupedBedPicker');
        if(!picker||picker.querySelector('#pickerDischarge'))return;
        const choiceBar=picker.querySelector('.bed-picker-top');
        if(!choiceBar)return;
        const dischargeButton=document.createElement('button');
        dischargeButton.type='button';
        dischargeButton.id='pickerDischarge';
        dischargeButton.className='bed-picker-choice discharge-choice';
        dischargeButton.textContent='退院';
        dischargeButton.addEventListener('click',()=>{
          // Recheck identity and eligibility before invoking the original flow.
          if(!state?.patients?.some(p=>p===patient&&!p.dischargeDate&&p.journalAdmissionPending))return;
          picker.remove();
          window.startDischargeFlow(patient);
        });
        choiceBar.appendChild(dischargeButton);
      });
    });
  }
  window.renderJournalPreview=function(...args){
    const result=originalRenderJournal.apply(this,args);
    attachJournalButtons();
    return result;
  };
  attachJournalButtons(); // Handles a journal screen already rendered on load.
  window.__MSW_UX02_JOURNAL_DISCHARGE_INSTALLED__=true;
})();
