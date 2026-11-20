/* UX17 FAKE TEST: patient prescription A4 external-information print.
 * Uses ONLY explicitly selected medication + prescribed dose/timing.
 * No drug price or reference price is ever copied into the print model.
 * No patient-data writes. Only fictional data can be printed in this stage.
 * To reverse, remove this script; patient records remain untouched.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_PRESCRIPTION_PRINT__)return;
  if(typeof window.renderPatientMedications!=='function'||typeof medRows!=='function')return;
  window.__MSW_UX17_PRESCRIPTION_PRINT__=true;

  const allowedUnits=new Set(['錠','カプセル','包','g','mL','本','枚','回','その他']);
  const statuses=new Set(['定期','頓服']);
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const text=s=>String(s??'').trim().normalize('NFKC');
  const qtyOK=s=>/^\d{1,4}(?:\.\d{1,3})?$/.test(s)&&Number(s)>0&&Number(s)<=1000;
  const dateText=()=>{
    const d=new Date();
    return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 '+
      String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  };

  // Print ONLY the explicit prescribed fields from UX17. Never print master
  // drug effect, generic list, reference pricing, unit price or totals.
  function printableRow(record){
    const pricing=record?.pricing||{};
    const name=text(record?.drug?.['薬名']);
    const strength=text(pricing.strength);
    if(!name||name.length>180||!strength||strength.length>60)return null;
    if(pricing.status==='定期'){
      // Old UX17 one-dose records cannot safely become a daily breakdown.
      const verified=window.UX19DoseSchedule?.resolve(record);
      if(!verified)return null;
      return {name,strength,dose:verified.total+verified.unit+'／日',
        when:verified.description,status:'定期'};
    }
    const dose=record?.ux17Schedule;
    const quantity=text(dose?.doseQuantity);
    const unit=text(dose?.doseUnit);
    const when=text(dose?.timing);
    if(pricing.status!=='頓服'||!dose||dose.status!=='頓服'||
       String(dose.strength||'')!==String(pricing.strength||'')||
       String(dose.doseUnit||'')!==String(pricing.unit||'')||
       !qtyOK(quantity)||!allowedUnits.has(unit)||!when||when.length>50)return null;
    return {name,strength,dose:'1回'+quantity+unit,when,status:'頓服'};
  }
  function readPatientRows(patient){
    const all=medRows(patient);
    const entries=[];
    let incomplete=0,stopped=0;
    for(const record of all){
      if(record?.pricing?.status==='中止'||record?.ux17Schedule?.status==='中止'){
        stopped++;continue;
      }
      const entry=printableRow(record);
      if(entry)entries.push(entry);
      else incomplete++;
    }
    return {entries,incomplete,stopped,total:all.length};
  }

  function demoRows(){
    // All names and prescription instructions below are explicitly FICTIONAL.
    return [
      {name:'架空降圧薬A',strength:'5mg',dose:'2錠／日',when:'朝:1－夜:1（食後）',status:'定期'},
      {name:'架空胃薬B',strength:'10mg',dose:'3錠／日',when:'朝:1－昼:1－夜:1（食後）',status:'定期'},
      {name:'架空ビタミン薬C',strength:'規格未設定',dose:'未設定',when:'未設定',status:'定期'},
      {name:'架空頓服薬D',strength:'200mg',dose:'1回1錠',when:'疼痛時',status:'頓服'}
    ];
  }

  function printHTML(rows,patientName,id,demo){
    const output=rows.map((item,i)=>'<tr>'+
      '<td class="num">'+(i+1)+'</td>'+
      '<td class="drug">'+safe(item.name)+'</td>'+
      '<td>'+safe(item.strength)+'</td>'+
      '<td>'+safe(item.dose)+'</td>'+
      '<td>'+safe(item.when)+'</td></tr>').join('');
    const banner=demo?'<div class="fake">架空印刷見本・実患者には使用不可</div>':'';
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<title>現在の内服処方一覧（情報提供用）</title>'+
      '<style>'+
      '@page{size:A4 portrait;margin:15mm}'+
      'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif}'+
      'body{padding:16px;font-size:11pt;line-height:1.5}'+
      'h1{font-size:18pt;margin:0 0 4mm}'+
      '.meta{display:grid;grid-template-columns:1fr 1fr;gap:2mm 10mm;margin:6mm 0}'+
      '.meta p{margin:0;overflow-wrap:anywhere}'+
      '.note{font-size:9pt;color:#444;margin:4mm 0 2mm}'+
      '.fake{font-size:15pt;font-weight:bold;color:#9a3412;border:2px solid #9a3412;padding:4mm;margin:0 0 5mm;text-align:center}'+
      'table{width:100%;border-collapse:collapse;table-layout:fixed}'+
      'thead{display:table-header-group}'+
      'th,td{border:1px solid #555;padding:7px 5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
      'th{background:#eee;font-size:9pt}td{font-size:10pt}'+
      'tr{break-inside:avoid;page-break-inside:avoid}'+
      '.num{width:5%;text-align:center}.drug{width:29%}'+
      '.controls{margin:0 0 18px;display:flex;gap:8px}'+
      '.controls button{background:#0f766e;color:white;font-size:16px;padding:10px 18px;border:0;border-radius:8px}'+
      '@media print{body{padding:0}.controls{display:none!important}.fake{color:#111;border-color:#111}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
      '</style></head><body>'+
      '<div class="controls"><button type="button" id="ux17PrintNow">A4で印刷</button>'+
      '<button type="button" id="ux17PrintClose">閉じる</button></div>'+
      banner+
      '<h1>現在の内服処方一覧（情報提供用）</h1>'+
      '<div class="meta"><p><strong>氏名：</strong>'+safe(patientName)+'</p>'+
      '<p><strong>患者ID：</strong>'+safe(id||'未記入')+'</p>'+
      '<p><strong>作成日時：</strong>'+safe(dateText())+'</p>'+
      '<p><strong>薬剤数：</strong>'+rows.length+'剤</p></div>'+
      '<p class="note">電子カルテの最新処方と照合済みの情報のみ、情報提供用として使用してください。</p>'+
      '<table><colgroup><col style="width:5%"><col style="width:29%"><col style="width:14%">'+
      '<col style="width:15%"><col style="width:37%"></colgroup>'+
      '<thead><tr><th>No.</th><th>薬剤名</th><th>規格</th><th>数量</th><th>用法</th></tr></thead>'+
      '<tbody>'+output+'</tbody></table>'+
      '</body></html>';
  }
  function openPrint(rows,name,id,autoPrint,demo){
    // Run directly in the click gesture: Safari/iPad may block later popups.
    const tab=window.open('','_blank');
    if(!tab){
      alert('印刷用の画面を開けませんでした。Safariのポップアップ設定を確認してください。');
      return;
    }
    try{
      tab.document.open();
      tab.document.write(printHTML(rows,name,id,demo));
      tab.document.close();
      tab.document.getElementById('ux17PrintNow')?.addEventListener('click',()=>tab.print());
      tab.document.getElementById('ux17PrintClose')?.addEventListener('click',()=>tab.close());
      tab.focus();
      // New tab includes a manual print button if Safari skips auto printing.
      if(autoPrint)tab.setTimeout(()=>tab.print(),240);
    }catch(e){
      try{tab.close();}catch(_){}
      alert('印刷画面の表示に失敗しました。');
    }
  }
  function printCurrent(){
    const patient=selectedPatient;
    if(!patient||!key||!state){alert('患者を選んでロックを解除してください。');return;}
    if(patient._new){alert('先に患者情報を保存してください。');return;}
    const data=readPatientRows(patient);
    if(!data.total){alert('処方薬が登録されていません。');return;}
    if(data.incomplete){
      alert('数量・用法が未確認（旧形式を含む）の薬剤が'+data.incomplete+'件あります。'+
        '\n印刷前に登録内容を確認・入力してください。未確認の処方薬を省略して印刷しないよう、今回は中止します。');
      return;
    }
    if(!data.entries.length){alert('印刷できる現在の処方薬がありません。');return;}
    // Fake-stage-only confirmation: do not ask the operator to attest to
    // nonexistent electronic medical record details for fictional patients.
    if(!confirm('UX19 架空患者の印刷テストです。登録した架空薬の内容をA4見本で表示します。'+
      '\n実際の患者・処方への使用はできません。印刷見本を開きますか？'))return;
    const name=text(patient.data?.['氏名'])||'未記入';
    const id=text(patient.data?.['ＩＤ'])||'';
    openPrint(data.entries,name,id,false,true);
  }

  function showDemo(){
    // Render entirely fictional rows. No access to selected patient data.
    openPrint(demoRows(),'架空患者A','FAKE-0001',false,true);
  }

  function addButton(){
    const root=document.querySelector('#tabbody .patient-med-page');
    const target=root?.querySelector('#patientMedList')?.closest('section.panel');
    if(!root||!target||target.querySelector('#ux17PrintToolbar'))return;
    const toolbar=document.createElement('div');
    toolbar.id='ux17PrintToolbar';
    toolbar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:9px 0 12px';
    const make=(title,fn)=>{
      const button=document.createElement('button');
      button.type='button';button.className='btn secondary';
      button.textContent=title;button.onclick=fn;
      return button;
    };
    toolbar.append(
      make('A4情報提供用 印刷',printCurrent),
      make('架空4剤の印刷見本（保存なし）',showDemo)
    );
    const hint=document.createElement('p');
    hint.className='notice';
    hint.textContent='印刷は薬価なし。実データの印刷は電子カルテ照合後のみ。見本は架空データだけを表示します。';
    const after=target.querySelector('h4');
    if(after){
      after.after(toolbar);
      toolbar.after(hint);
    }else{
      target.append(toolbar,hint);
    }
  }

  const prev=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const ret=prev.apply(this,args);
    addButton();
    return ret;
  };
  window.UX17PrescriptionPrintTest=Object.freeze({printableRow,readPatientRows,printHTML,demoRows});
})();