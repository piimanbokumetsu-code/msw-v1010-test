/* Test actual final render wrapper with an in-memory fictional toolbar. */
(function(){
  'use strict';
  const root=document.querySelector('#tabbody .patient-med-page');
  const toolbar=root?.querySelector('#ux17PrintToolbar');
  const removed=()=>!toolbar.querySelector('#ux20NativeShareButton')&&
                     !toolbar.querySelector('#ux20LegacyPrintPreview');
  const preserved=()=>toolbar.querySelectorAll('button').length===1&&
    toolbar.querySelector('button')?.textContent==='A4情報提供用 印刷';
  const before=removed()&&preserved();
  window.renderPatientMedications();
  const after=removed()&&preserved();
  const active=toolbar.querySelector('button');
  active?.click();const stillWorks=window.__UX23_FAKE_PRINT_COUNT__()===1;
  const result=document.getElementById('ux23TestResult');
  if(result)result.textContent=(before&&after&&stillWorks)
    ?'合格：不要な2ボタンなし／通常のA4印刷ボタンあり／再表示後も正常／通常ボタンの操作も保持'
    :'要確認：ボタンの消去または通常印刷ボタンに問題があります';
  document.getElementById('ux23Redraw')?.addEventListener('click',()=>{
    window.renderPatientMedications();
    const status=document.getElementById('ux23RedrawResult');
    if(status)status.textContent=removed()&&preserved()
      ?'再表示しても不要なボタンは現れず、A4情報提供用 印刷だけが残っています。'
      :'再表示時の動作に問題があります';
  });
})();
