/* UX17 fake stage ONLY: four visually realistic sample prescriptions.
 * DOM-only preview, never writes to patient records or the drug master.
 * Sample buttons/fields are non-saving; expanding details remains possible.
 */
(function(){
  'use strict';
  if(window.__MSW_UX17_SAMPLE_MEDICATIONS_INSTALLED__)return;
  if(typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX17_SAMPLE_MEDICATIONS_INSTALLED__=true;

  const samples=[
    {name:'架空降圧薬A',group:'血圧の薬',status:'定期',strength:'5mg',price:'20.40',unit:'錠',quantity:'2',cost:'40.80円',effect:'血圧を下げる薬（サンプル）',generic:'架空後発品A'},
    {name:'架空胃薬B',group:'胃の薬',status:'定期',strength:'10mg',price:'17.20',unit:'錠',quantity:'1',cost:'17.20円',effect:'胃酸の分泌を抑える薬（サンプル）',generic:'登録情報なし'},
    {name:'架空ビタミン薬C',group:'ビタミン製剤',status:'定期',strength:'規格未設定',price:'',unit:'錠',quantity:'',cost:'計算待ち',effect:'ビタミンを補う薬（サンプル）',generic:'架空後発品C'},
    {name:'架空頓服薬D',group:'痛み止め',status:'頓服',strength:'200mg',price:'9.70',unit:'錠',quantity:'',cost:'対象外',effect:'痛みを和らげる薬（サンプル）',generic:'登録情報なし'}
  ];
  function cards(){
    return samples.map((drug,i)=>{
      const price=drug.price?Number(drug.price).toFixed(2)+'円／'+drug.unit:'薬価未設定';
      return `<article class="patient-med-row" data-ux17-sample="${i}">
        <div class="patient-med-line">
          <div><strong>${drug.name}</strong><div class="notice">${drug.group}　・　${drug.status}　・　架空サンプル</div></div>
          <button type="button" class="btn danger" disabled>一覧から削除</button>
        </div>
        <div class="patient-med-glance">
          <div><b>薬効</b><span class="patient-med-glance-effect">${drug.effect}</span></div>
          <div><b>後発品</b><span>${drug.generic}</span></div>
          <div><b>薬価</b><span>${drug.strength}　${price}　／　参考日額：${drug.cost}</span></div>
        </div>
        <details class="patient-med-editor">
          <summary>規格・薬価・1日量を設定 / 全文を見る</summary>
          <div class="patient-med-editor-body">
            <p class="notice">架空の表示サンプルです。各項目は保存できません。</p>
            <div class="patient-med-fact"><dt>薬効（全文）</dt><dd>${drug.effect}</dd></div>
            <div class="patient-med-fact"><dt>後発品（登録情報）</dt><dd>${drug.generic}</dd></div>
            <div class="patient-med-fact"><dt>薬価の元データ</dt><dd>サンプル（実際の薬価ではありません）</dd></div>
            <div class="patient-med-fields">
              <label>規格<input value="${drug.strength==='規格未設定'?'':drug.strength}" disabled></label>
              <label>参考単価（円）<input value="${drug.price}" disabled></label>
              <label>単価の単位<select disabled><option>${drug.unit}</option></select></label>
              <label>1日合計数量<input value="${drug.quantity}" disabled></label>
              <label>区分<select disabled><option>${drug.status}</option></select></label>
            </div>
            <button type="button" class="btn" disabled>薬価設定を保存</button>
          </div>
        </details>
      </article>`;
    }).join('');
  }

  function addDemoControl(){
    const page=document.querySelector('#tabbody .patient-med-page');
    const host=page?.querySelector('#patientMedList');
    const count=page?.querySelector('#patientMedCount');
    const total=page?.querySelector('#patientMedSummary');
    if(!page||!host||!count||!total||page.querySelector('#ux17SampleToggle'))return;

    const originalCount=count.textContent;
    const controls=document.createElement('div');
    controls.className='ux17-sample-controls';
    controls.style.cssText='margin:12px 0;border:2px solid #cc902b;border-radius:10px;padding:10px;background:#fff9e8';
    const button=document.createElement('button');
    button.id='ux17SampleToggle';
    button.className='btn secondary';
    button.type='button';
    button.style.width='100%';
    button.textContent='架空の処方薬4件を表示（保存なし）';
    const hint=document.createElement('p');
    hint.className='notice';
    hint.style.margin='6px 0 0';
    hint.textContent='UX17の画面確認用です。架空の薬名・金額で、患者情報には登録されません。';
    controls.append(button,hint);
    host.before(controls);

    const preview=document.createElement('div');
    preview.id='ux17SampleRows';
    preview.style.display='none';
    preview.innerHTML=cards();
    host.after(preview);

    const previewTotal=document.createElement('div');
    previewTotal.id='ux17SampleTotal';
    previewTotal.className='patient-med-summary';
    previewTotal.style.display='none';
    previewTotal.innerHTML='<strong>架空サンプルの定期薬・参考日額小計：58.00円</strong><span>計算可能 2/3件</span><small>未計算の定期薬が1件あります。この数字は架空の表示例です。</small>';
    total.after(previewTotal);

    let showing=false;
    button.onclick=()=>{
      showing=!showing;
      host.style.display=showing?'none':'';
      preview.style.display=showing?'':'none';
      total.style.display=showing?'none':'';
      previewTotal.style.display=showing?'':'none';
      count.textContent=showing?'4件（架空サンプル）':originalCount;
      button.textContent=showing?'架空の処方薬表示を終了':'架空の処方薬4件を表示（保存なし）';
      hint.textContent=showing
        ?'黄色枠内の表示例です。実際の患者薬剤とは無関係で、変更や保存はできません。'
        :'UX17の画面確認用です。架空の薬名・金額で、患者情報には登録されません。';
    };
  }

  const previousRender=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=previousRender.apply(this,args);
    addDemoControl();
    return result;
  };
})();
