/* UX20 FAKE STAGE ONLY: inline A4 preview / safe return, no new tab.
 * Does not change the secure background auto-lock policy or patient data.
 * This is an ALTERNATIVE button for testing; existing print is untouched.
 */
(function(){
  'use strict';
  if(window.__MSW_UX20_INLINE_PRINT_TEST__)return;
  const api=window.UX17PrescriptionPrintTest;
  if(!api?.readPatientRows||!api?.printHTML||typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX20_INLINE_PRINT_TEST__=true;
  let preview=null,observer=null;
  function closePreview(){
    if(observer){observer.disconnect();observer=null;}
    if(preview){preview.remove();preview=null;}
  }
  // Do NOT weaken clinical security: if Safari backgrounds, immediately
  // remove the patient print DOM; app.js still locks and clears its key.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')closePreview();
  },true);
  window.addEventListener('pagehide',closePreview,true);
  function addStyle(){
    if(document.getElementById('ux20-inline-print-style'))return;
    const css=document.createElement('style');
    css.id='ux20-inline-print-style';
    css.textContent=`
      #ux20PrintPreview{position:fixed;inset:0;z-index:2147483000;overflow:auto;
        background:#e5e7eb;color:#111;padding:12px;box-sizing:border-box}
      #ux20PrintPreview .ux20-toolbar{position:sticky;top:0;z-index:3;display:flex;
        gap:10px;flex-wrap:wrap;background:#f8fafc;border:1px solid #94a3b8;
        border-radius:9px;padding:11px;margin:0 auto 12px;max-width:800px}
      #ux20PrintPreview .ux20-toolbar button{font-size:16px;min-height:44px;
        padding:8px 14px;border-radius:7px}
      #ux20PrintPreview .ux20-sheet{max-width:780px;margin:0 auto;background:white;
        padding:20px;box-shadow:0 1px 8px #64748b6b;box-sizing:border-box;
        font-size:11pt;line-height:1.5}
      #ux20PrintPreview .ux20-sheet h1{font-size:18pt;margin:0 0 4mm}
      #ux20PrintPreview .ux20-sheet .meta{display:grid;grid-template-columns:1fr 1fr;
        gap:2mm 10mm;margin:6mm 0}
      #ux20PrintPreview .ux20-sheet .meta p{margin:0;overflow-wrap:anywhere}
      #ux20PrintPreview .ux20-sheet .note{font-size:9pt;color:#444;margin:4mm 0 2mm}
      #ux20PrintPreview .ux20-sheet .fake{font-size:15pt;font-weight:bold;
        color:#9a3412;border:2px solid #9a3412;padding:4mm;margin:0 0 5mm;
        text-align:center}
      #ux20PrintPreview .ux20-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}
      #ux20PrintPreview .ux20-sheet thead{display:table-header-group}
      #ux20PrintPreview .ux20-sheet th,#ux20PrintPreview .ux20-sheet td{
        border:1px solid #555;padding:7px 5px;text-align:left;vertical-align:top;
        overflow-wrap:anywhere;font-size:10pt}
      #ux20PrintPreview .ux20-sheet th{background:#eee;font-size:9pt}
      #ux20PrintPreview .ux20-sheet tr{break-inside:avoid;page-break-inside:avoid}
      .msw-private #ux20PrintPreview{display:none!important}
      @page{size:A4 portrait;margin:15mm}
      @media print{
        body>*:not(#ux20PrintPreview){display:none!important}
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        #ux20PrintPreview{position:static!important;inset:auto!important;
          overflow:visible!important;padding:0!important;margin:0!important;
          background:#fff!important;box-shadow:none!important}
        #ux20PrintPreview .ux20-toolbar{display:none!important}
        #ux20PrintPreview .ux20-sheet{max-width:none!important;padding:0!important;
          box-shadow:none!important}
        #ux20PrintPreview .ux20-sheet th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }`;
    document.head.appendChild(css);
  }
  // Restore the independently proven UX19 iPad Safari print path.
  // A separate tab may trigger the existing security auto-lock in the app.
  function openProvenPrint(rows,name,id){
    const tab=window.open('','_blank');
    if(!tab){
      alert('印刷用の画面を開けませんでした。Safariのポップアップ設定をご確認ください。');
      return;
    }
    try{
      tab.document.open();
      tab.document.write(api.printHTML(rows,name,id,true));
      tab.document.close();
      tab.document.getElementById('ux17PrintNow')?.addEventListener('click',()=>tab.print());
      tab.document.getElementById('ux17PrintClose')?.addEventListener('click',()=>tab.close());
      tab.focus();
      tab.setTimeout(()=>tab.print(),240);
    }catch(e){
      try{tab.close();}catch(_){}
      alert('印刷画面の表示に失敗しました。');
    }
  }
  function displayInline(rows,name,id){
    closePreview();
    addStyle();
    const parsed=new DOMParser().parseFromString(api.printHTML(rows,name,id,true),'text/html');
    const overlay=document.createElement('section');
    overlay.id='ux20PrintPreview';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','架空患者・処方薬A4プレビュー');
    const toolbar=document.createElement('div');
    toolbar.className='ux20-toolbar';
    function button(text,click){
      const btn=document.createElement('button');btn.type='button';btn.className='btn secondary';
      btn.textContent=text;btn.addEventListener('click',click);return btn;
    }
    toolbar.append(
      button('A4で印刷（従来の別タブ方式）',()=>openProvenPrint(rows,name,id)),
      button('← 処方薬画面に戻る',closePreview)
    );
    const sheet=document.createElement('div');sheet.className='ux20-sheet';
    // Build from the same validated/safely escaped A4 document.
    for(const selector of ['.fake','h1','.meta','.note','table']){
      const item=parsed.body.querySelector(selector);
      if(item)sheet.appendChild(item.cloneNode(true));
    }
    if(!sheet.querySelector('table'))return;
    overlay.append(toolbar,sheet);document.body.appendChild(overlay);preview=overlay;
    // Explicit/inactivity lock re-renders #app; remove patient print details.
    const app=document.getElementById('app');
    if(app&&typeof MutationObserver==='function'){
      observer=new MutationObserver(()=>{
        if(!key||!state||document.body.classList.contains('msw-private'))closePreview();
      });
      observer.observe(app,{childList:true});
    }
    overlay.scrollTop=0;
  }
  function printPatient(){
    const patient=selectedPatient;
    if(!patient||!key||!state||patient._new){
      alert('架空患者を選び、暗証番号を解除してください。');return;
    }
    const data=api.readPatientRows(patient);
    if(!data.total||data.incomplete||!data.entries.length){
      alert('未確認の処方薬があるため、印刷テストを中止しました。');return;
    }
    if(!confirm('架空患者のみのUX20印刷戻りテストです。別タブは開きません。続けますか？'))return;
    const name=String(patient.data?.['氏名']||'未記入').trim();
    const id=String(patient.data?.['ＩＤ']||'');
    displayInline(data.entries,name,id);
  }
  function addButton(){
    const root=document.querySelector('#tabbody .patient-med-page');
    const toolbar=root?.querySelector('#ux17PrintToolbar');
    if(!toolbar||toolbar.querySelector('#ux20PrintReturnTest'))return;
    const b=document.createElement('button');
    b.id='ux20PrintReturnTest';b.type='button';b.className='btn secondary';
    b.textContent='A4印刷（戻り動作テスト）';
    b.addEventListener('click',printPatient);
    toolbar.appendChild(b);
  }
  const old=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=old.apply(this,args);addButton();return result;
  };
})();
