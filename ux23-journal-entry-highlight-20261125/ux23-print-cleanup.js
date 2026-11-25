/* UX23: remove only two unused prescription-print toolbar buttons.
 * Existing A4 information print and iPad native AirPrint stay untouched.
 * Presentation only: no patient data or print/security logic is modified.
 */
(function(){
  'use strict';
  if(window.__MSW_UX23_PRINT_CLEANUP_INSTALLED__)return;
  if(typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX23_PRINT_CLEANUP_INSTALLED__=true;

  function removeUnusedButtons(){
    const toolbar=document.querySelector('#tabbody .patient-med-page #ux17PrintToolbar');
    if(!toolbar)return;
    for(const id of ['ux20NativeShareButton','ux20LegacyPrintPreview']){
      const button=toolbar.querySelector('#'+id);
      if(button?.tagName==='BUTTON')button.remove();
    }
  }

  const previous=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=previous.apply(this,args);
    removeUnusedButtons();
    return result;
  };
  removeUnusedButtons();
})();
