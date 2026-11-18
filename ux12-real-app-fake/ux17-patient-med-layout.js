/* UX17 (2026-11-18): Improve patient medication tab layout.
 * Display order only: medication master search first; registered drugs
 * in the middle; daily reference cost summary at the very bottom.
 * Drug matching, calculation, storage and all existing handlers unchanged.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_PATIENT_MED_LAYOUT_INSTALLED__)return;
  if(typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX17_PATIENT_MED_LAYOUT_INSTALLED__=true;

  function rearrangePatientMedications(){
    const page=document.querySelector('#tabbody .patient-med-page');
    if(!page)return;
    const searchPanel=page.querySelector('#patientDrugQuery')?.closest('section.panel');
    const summary=page.querySelector('#patientMedSummary');
    const list=page.querySelector('#patientMedList');
    if(!searchPanel||!summary||!list||!page.contains(searchPanel))return;

    // Keep the entire existing master search (and its event bindings) intact.
    page.insertBefore(searchPanel,page.firstElementChild);

    // Move the existing live calculation node, not its text or data, so
    // future drawPatientMedicationList() updates still target the same ID.
    const summaryPanel=document.createElement('section');
    summaryPanel.className='panel ux17-medication-summary-panel';
    const heading=document.createElement('h3');
    heading.textContent='定期薬の参考日額';
    summaryPanel.appendChild(heading);

    const note=summary.nextElementSibling;
    const isDailyNote=note?.matches?.('p.notice')&&note.textContent.includes('参考日額');
    summaryPanel.appendChild(summary);
    if(isDailyNote)summaryPanel.appendChild(note);
    page.appendChild(summaryPanel);
  }

  const previousRender=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=previousRender.apply(this,args);
    rearrangePatientMedications();
    return result;
  };
})();
