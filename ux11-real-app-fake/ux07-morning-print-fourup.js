/* UX07: Optional A4 one-sheet / 4-up layout for the existing morning print.
 * Reuses the approved four-page HTML exactly; screen UI and clinical records
 * are never modified. Print DOM is transient and contains local data only.
 */
(function(){
  'use strict';
  if(window.__MSW_UX07_PRINT_FOURUP_INSTALLED__)return;
  if(typeof renderPatients!=='function'||typeof printMorningList!=='function')return;

  const originalRenderPatients=renderPatients;
  const originalPrintMorningList=printMorningList;

  function ensurePrintStyle(){
    if(document.getElementById('ux07FourupPrintStyle'))return;
    const style=document.createElement('style');
    style.id='ux07FourupPrintStyle';
    // A4 printable area with existing 5mm left/right and 4.5mm top/bottom
    // margins is 200 x 288mm. Leave 4mm vertical safety margin for AirPrint.
    // Each original 200mm-wide A4 page is scaled to 49% (= 98mm).
    style.textContent=`@media print {
      #morningPrint.morning-print-fourup {
        display:grid!important;
        grid-template-columns:100mm 100mm;
        grid-template-rows:142mm 142mm;
        width:200mm!important;
        height:284mm!important;
        margin:0!important;
        padding:0!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
        break-after:auto!important;
        page-break-after:auto!important;
      }
      #morningPrint.morning-print-fourup>.morning-quad-cell {
        position:relative;
        display:block;
        box-sizing:border-box;
        width:100mm;
        height:142mm;
        margin:0;
        padding:0;
        overflow:hidden;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
      #morningPrint.morning-print-fourup .morning-quad-cell>.morning-page {
        display:block;
        width:200mm!important;
        max-width:none!important;
        min-height:0!important;
        height:auto!important;
        margin:0!important;
        padding:0!important;
        transform:scale(.49);
        transform-origin:top left;
        break-after:auto!important;
        page-break-after:auto!important;
        break-inside:avoid!important;
        page-break-inside:avoid!important;
      }
    }`;
    document.head.appendChild(style);
  }

  function printFourup(){
    if(typeof screen==='undefined'||screen!=='patients'||!state)return;
    // The original function builds the same approved four pages and schedules
    // the OS print dialog. Repack the DOM synchronously before its print timer.
    originalPrintMorningList();
    const root=document.getElementById('morningPrint');
    const pages=root?Array.from(root.children).filter(el=>el.classList.contains('morning-page')):[];
    if(!root||pages.length!==4)return; // Safe fallback: unchanged A4 4 pages.
    ensurePrintStyle();
    const fragment=document.createDocumentFragment();
    pages.forEach(page=>{
      const cell=document.createElement('div');
      cell.className='morning-quad-cell';
      cell.appendChild(page);
      fragment.appendChild(cell);
    });
    root.replaceChildren(fragment);
    root.classList.add('morning-print-fourup');
  }

  function installButton(){
    const normal=document.getElementById('print');
    if(!normal||document.getElementById('printFourup'))return;
    const button=document.createElement('button');
    button.id='printFourup';
    button.className='btn secondary';
    button.type='button';
    button.textContent='A4・1枚（4分割）で印刷';
    button.setAttribute('aria-label','朝一患者一覧をA4用紙1枚に4分割して印刷');
    normal.insertAdjacentElement('afterend',button);
    button.addEventListener('click',printFourup);
  }

  // Reinstall the choice whenever the patient list itself is re-rendered.
  window.renderPatients=function(...args){
    const result=originalRenderPatients.apply(this,args);
    installButton();
    return result;
  };
  installButton();
  window.__MSW_UX07_PRINT_FOURUP_INSTALLED__=true;
})();
