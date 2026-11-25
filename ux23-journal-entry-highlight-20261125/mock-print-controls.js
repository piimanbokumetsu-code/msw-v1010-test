/* Fictional print toolbar only; never accesses production patient records. */
(function(){
  'use strict';
  let printed=0;
  window.renderPatientMedications=function(){
    const toolbar=document.querySelector('#tabbody .patient-med-page #ux17PrintToolbar');
    if(!toolbar)return;
    toolbar.replaceChildren();
    const make=(id,label,click)=>{
      const b=document.createElement('button');
      b.type='button';b.className='btn secondary';b.id=id;b.textContent=label;b.onclick=click;
      toolbar.appendChild(b);
    };
    make('ux17FakePrimary','A4情報提供用 印刷',()=>{
      printed++;document.getElementById('ux23PrintTap').textContent=
      '通常印刷のボタン操作を確認しました（架空画面のため実際には印刷しません）';
    });
    make('ux20NativeShareButton','A4共有印刷（パスワード戻り対策）',()=>{});
    make('ux20LegacyPrintPreview','従来の印刷前プレビュー',()=>{});
  };
  window.__UX23_FAKE_PRINT_COUNT__=()=>printed;
  window.renderPatientMedications();
})();
