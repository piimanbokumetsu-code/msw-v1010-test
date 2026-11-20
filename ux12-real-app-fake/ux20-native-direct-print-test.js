/* UX20 FAKE STAGE ONLY: direct OS AirPrint using the morning-list method.
 * Produces a print-only sibling #morningPrint.morning-print to reuse the same
 * documented print-isolation path. Unlike previous UX20 attempts, no print
 * content is placed outside .morning-print (which base CSS hides at print).
 * This does not change actual patients, locks, morning print code, or existing
 * A4 print buttons. Fully fictional patients only.
 */
(function(){
  'use strict';
  if(window.__UX20_DIRECT_OS_PRINT_FAKE__)return;
  const api=window.UX17PrescriptionPrintTest;
  if(!api?.readPatientRows||!api?.printHTML||typeof window.renderPatientMedications!=='function')return;
  window.__UX20_DIRECT_OS_PRINT_FAKE__=true;
  function installScopedPrintStyle(){
    if(document.getElementById('ux20-direct-print-style'))return;
    const style=document.createElement('style');
    style.id='ux20-direct-print-style';
    // Never affect the unrelated morning-list printing. The selectors
    // below apply ONLY to #morningPrint carrying .ux20-rx-direct.
    style.textContent=String.raw`
    @media print {
      #morningPrint.ux20-rx-direct {
        display:block!important;
        box-sizing:border-box;
        padding:10mm;
        width:100%;
        height:auto;
        font-size:11pt;
        line-height:1.45;
        color:#111;
        background:#fff;
        font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;
      }
      #morningPrint.ux20-rx-direct h1 {font-size:18pt;margin:0 0 4mm}
      #morningPrint.ux20-rx-direct .fake {
        font-size:13pt;text-align:center;color:#111;border:2px solid #111;
        font-weight:bold;padding:3mm;margin:0 0 4mm
      }
      #morningPrint.ux20-rx-direct .meta {
        display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;margin:5mm 0
      }
      #morningPrint.ux20-rx-direct .meta p {margin:0;overflow-wrap:anywhere}
      #morningPrint.ux20-rx-direct .note {font-size:9pt;color:#444;margin:4mm 0 2mm}
      #morningPrint.ux20-rx-direct table {
        width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5pt
      }
      #morningPrint.ux20-rx-direct thead {display:table-header-group}
      #morningPrint.ux20-rx-direct th,
      #morningPrint.ux20-rx-direct td {
        border:1px solid #555;padding:5px 4px;text-align:left;
        vertical-align:top;overflow-wrap:anywhere
      }
      #morningPrint.ux20-rx-direct th {font-size:9pt;background:#eee!important}
      #morningPrint.ux20-rx-direct tr {break-inside:avoid;page-break-inside:avoid}
    }
    `;
    document.head.appendChild(style);
  }
  function printDirect(){
    const patient=selectedPatient;
    if(!patient||!key||!state||patient._new){
      alert('架空患者を選び、暗証番号を解除してください。');return;
    }
    const name=String(patient.data?.['氏名']||'').trim();
    if(!name.includes('架空')){
      alert('このテストでは架空患者だけを利用できます。');return;
    }
    const data=api.readPatientRows(patient);
    if(!data.total||data.incomplete||!data.entries.length){
      alert('未確認の薬剤があるため、印刷を中止します。');return;
    }
    if(!confirm('架空患者専用テストです。患者一覧と同じiPad標準の印刷設定を開きます。実患者の印刷には使用できません。続けますか？'))return;
    installScopedPrintStyle();
    const html=api.printHTML(data.entries,name,String(patient.data?.['ＩＤ']||''),true);
    const doc=new DOMParser().parseFromString(html,'text/html');
    const root=document.createElement('section');
    root.id='morningPrint';root.className='morning-print ux20-rx-direct';
    for(const selector of ['.fake','h1','.meta','.note','table']){
      const node=doc.body.querySelector(selector);
      if(node)root.appendChild(node.cloneNode(true));
    }
    if(!root.querySelector('table')){
      alert('印刷用の処方表を作成できませんでした。');return;
    }
    // Remove the prior patient-list print DOM, just as printMorningList does.
    document.getElementById('morningPrint')?.remove();
    document.body.appendChild(root);
    // Exactly the successful patient list print invocation: no tab/PDF/share.
    // Keep print DOM until the next print or app lock; iPad AirPrint may
    // repaginate while a printer is being selected.
    setTimeout(()=>window.print(),50);
  }
  function addButton(){
    const page=document.querySelector('#tabbody .patient-med-page');
    const toolbar=page?.querySelector('#ux17PrintToolbar');
    if(!toolbar||toolbar.querySelector('#ux20DirectOsPrintFake'))return;
    const btn=document.createElement('button');
    btn.id='ux20DirectOsPrintFake';btn.type='button';btn.className='btn secondary';
    btn.textContent='A4標準プリント直接（架空テスト）';
    btn.addEventListener('click',printDirect);
    toolbar.appendChild(btn);
  }
  const previous=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const ret=previous.apply(this,args);addButton();return ret;
  };
})();