/* UX14: temporarily conceal the unused journal photo/OCR import UI.
 * This is presentation only: manual admission, pending discharges, records,
 * and underlying scan code/data remain untouched and recoverable. */
(function(){
'use strict';
if(window.__MSW_UX14_INSTALLED__)return;
if(typeof window.renderJournalPreview!=='function')return;
window.__MSW_UX14_INSTALLED__=true;
const previous=window.renderJournalPreview;
window.renderJournalPreview=function(...args){
  const value=previous.apply(this,args);
  if(typeof screen!=='undefined'&&screen==='journal'){
    const heading=document.querySelector('#main .hero h1');
    if(heading&&heading.textContent==='日誌・患者情報取り込み')heading.textContent='日誌';
    const scanPanel=document.querySelector('#main .journal-warning');
    if(scanPanel)scanPanel.hidden=true;
    // Remove the unused warning and scanner from accessibility navigation.
    if(scanPanel)scanPanel.style.display='none';
  }
  return value;
};
})();