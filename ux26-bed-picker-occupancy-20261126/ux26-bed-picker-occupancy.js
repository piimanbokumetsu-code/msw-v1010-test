/* UX26: presentation-only occupancy colors for the existing bed destination picker.
 * Retain the original picker, its selection callbacks, and all patient save flows.
 * Occupancy is read fresh each time the existing picker opens.
 */
(function(){
'use strict';
if(window.__MSW_UX26_BED_PICKER_COLORS__)return;
if(typeof window.showGroupedBedPicker!=='function'||typeof normalizeBed!=='function')return;
const previous=window.showGroupedBedPicker;
window.showGroupedBedPicker=function(...args){
  const result=previous.apply(this,args);
  try{
    const root=document.getElementById('groupedBedPicker');
    if(!root)return result;
    const patients=(typeof state!=='undefined'&&state&&Array.isArray(state.patients))?state.patients:[];
    const occupied=new Set(patients
      .filter(p=>p&&!p.dischargeDate&&p.data?.['ベッド番号'])
      .map(p=>normalizeBed(p.data['ベッド番号'])));
    root.querySelectorAll('.bed-picker-grid .bed-picker-choice[data-bed]').forEach(button=>{
      const bed=button.dataset.bed;
      if(bed&&occupied.has(normalizeBed(bed)))button.classList.add('ux26-occupied');
    });
  }catch(_){
    // The original bed picker must remain usable if optional coloring fails.
  }
  return result;
};
window.__MSW_UX26_BED_PICKER_COLORS__=true;
})();