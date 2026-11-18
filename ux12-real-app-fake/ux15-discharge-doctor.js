/* UX15 (2026-11-18): Show existing attending physician in Journal's
 * pending-discharge table. Presentation only: no patient data or discharge
 * state is modified. Preserves UX02/UX03/UX14 and archived records.
 */
(function(){
  'use strict';
  if(window.__MSW_UX15_DISCHARGE_DOCTOR_INSTALLED__)return;
  if(typeof window.renderJournalPreview!=='function')return;
  window.__MSW_UX15_DISCHARGE_DOCTOR_INSTALLED__=true;

  function addDoctorColumn(){
    if(typeof screen==='undefined'||screen!=='journal')return;
    const heading=[...document.querySelectorAll('#main .panel h2')]
      .find(el=>/^②\s*退院患者一覧/.test(el.textContent.trim()));
    const table=heading?.closest('.panel')?.querySelector('table.journal-table');
    const headerRow=table?.querySelector('thead tr');
    const firstHeader=headerRow?.querySelector('th');
    if(!headerRow||!firstHeader||headerRow.querySelector('[data-ux15-doctor]'))return;

    const doctorHeader=document.createElement('th');
    doctorHeader.textContent='主治医';
    doctorHeader.dataset.ux15Doctor='1';
    firstHeader.after(doctorHeader);

    table.querySelectorAll('tbody tr').forEach(row=>{
      const nameCell=row.querySelector('td');
      if(!nameCell)return;
      const completeButton=row.querySelector('.pending-complete[data-id]');
      if(!completeButton){
        const emptyCell=row.querySelector('td[colspan="4"]');
        if(emptyCell)emptyCell.colSpan=5;
        return;
      }
      const patient=typeof state==='undefined'?null:
        state?.patients?.find(p=>p.id===completeButton.dataset.id);
      const doctorCell=document.createElement('td');
      doctorCell.className='ux15-attending-physician';
      doctorCell.textContent=String(patient?.data?.['主治医']??'').trim()||'—';
      nameCell.after(doctorCell);
    });
  }

  const previousRender=window.renderJournalPreview;
  window.renderJournalPreview=function(...args){
    const result=previousRender.apply(this,args);
    addDoctorColumn();
    return result;
  };
  addDoctorColumn();
})();
