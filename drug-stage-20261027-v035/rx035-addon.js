'use strict';
/* RX035 independent medication master reference.
 * Does not modify the actual prescribed drug snapshot, prescription price,
 * status, dose, generic decision or any printed/exported patient details. */
(function(){
  if(typeof renderPatientMedications!=='function'||typeof medSnapshot!=='function')return;
  const priorRender=renderPatientMedications;
  const previousDraw=drawPatientMedicationList;
  drawPatientMedicationList=function(){
    previousDraw();
    if(document.querySelector('#rx035Panel'))renderRefPanel();
  };
  renderPatientMedications=function(){
    priorRender();
    const page=document.querySelector('#tabbody .patient-med-page');
    if(!page)return;
    const p=document.createElement('section');
    p.id='rx035Panel';p.className='panel';
    const searchPanel=page.querySelector('#patientDrugQuery')?.closest('section.panel');
    if(searchPanel)page.insertBefore(p,searchPanel);else page.appendChild(p);
    renderRefPanel();
  };
  let inFlight=false;
  async function updateRef(kind,rowId,index){
    if(inFlight||patientMedicationBusy)return;
    const patient=selectedPatient;
    if(!patient||patient._new||!key||!state)return;
    const before=medRows(patient).slice();
    const row=before.find(r=>r.id===rowId);
    if(!row)return;
    let next;
    if(kind==='link'){
      if(!Number.isSafeInteger(index)||index<0||index>=state.drugs.length)return;
      const ref=medSnapshot(state.drugs[index]);
      if(!ref['薬名'])return;
      if(!confirm('処方薬「'+String(row.drug?.['薬名']||'名称なし')+'」は変更せず、薬情「'+ref['薬名']+'」を別の参考情報として保存します。代替可能性を示すものではありません。よろしいですか？'))return;
      next=before.map(r=>r.id===rowId?{...r,reference:{drug:ref,linkedAt:nowISO(),kind:'manual-reference-only'}}:r);
    }else{
      if(!confirm('参考薬情の紐づけだけを解除します。処方薬は残します。よろしいですか？'))return;
      next=before.map(r=>r.id===rowId?{...r,reference:null}:r);
    }
    const status=document.querySelector('#rx035Status');if(status)status.textContent='暗号化保存しています…';
    inFlight=true;patient.medications=next;
    try{
      if(selectedPatient!==patient||!key||!state)throw Error('患者またはロック状態が変わりました');
      await save();
      if(selectedPatient===patient){
        drawPatientMedicationList();renderRefPanel();
        const msg=document.querySelector('#rx035Status');if(msg)msg.textContent=kind==='link'?'処方薬は変えず参考薬情だけ保存しました。':'参考薬情だけ解除しました。';
      }
    }catch(e){
      patient.medications=before;
      if(selectedPatient===patient){renderRefPanel();const msg=document.querySelector('#rx035Status');if(msg)msg.textContent='保存できませんでした：'+String(e.message||e).slice(0,100);}
    }finally{inFlight=false;}
  }
  function renderRefPanel(){
    const host=document.querySelector('#rx035Panel'),patient=selectedPatient;
    if(!host||!patient)return;
    const rows=medRows(patient);
    host.innerHTML='<h3>薬情マスターと別照合（V0.35）</h3>'+
      '<p class="notice">医師の処方名・規格・数量・薬価・定期／頓服区分は変更しません。候補は過去の薬情マスター由来の参考情報であり、薬の代替可能性や最新薬価を保証しません。</p>'+
      (rows.length?'<label>照合対象の処方薬<select id="rx035Row">'+rows.map((r,i)=>'<option value="'+esc(r.id)+'">'+esc(r.drug?.['薬名']||'名称なし')+'（'+(i+1)+'）</option>').join('')+'</select></label>'+
      '<div id="rx035Summary" class="notice"></div><label>薬情マスターを検索<input id="rx035Query" type="search" autocomplete="off" placeholder="例：架空参照候補B"></label>'+
      '<div id="rx035Results"></div><p id="rx035Status" class="notice" role="status"></p>':
      '<p class="notice">先に下の薬剤マスターから処方薬を追加してください。</p>');
    if(!rows.length)return;
    const pick=host.querySelector('#rx035Row'),query=host.querySelector('#rx035Query'),summary=host.querySelector('#rx035Summary'),results=host.querySelector('#rx035Results');
    function show(){
      const r=rows.find(v=>v.id===pick.value),d=r?.reference?.drug;
      if(!d){summary.textContent='参考薬情：未照合';return;}
      const g=medEffectAndGenerics(d);
      summary.innerHTML='<b>参考薬情：</b>'+esc(d['薬名']||'')+' ／ 薬価元データ：'+esc(d['薬価']||'未登録')+
        ' ／ 後発品情報：'+esc(g.generic||'記載なし')+
        '<p class="notice">処方薬そのものと参考日額は変更されません。</p>'+
        '<button id="rx035Unlink" class="btn secondary" type="button">参考薬情だけ解除</button>';
      host.querySelector('#rx035Unlink').onclick=()=>void updateRef('unlink',pick.value);
    }
    function search(){
      const q=query.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
      if(q.length<2){results.innerHTML='<p class="notice">2文字以上入力すると候補が表示されます。</p>';return;}
      const matches=(state.drugs||[]).map((d,index)=>({d,index})).filter(({d})=>
        MED_SNAPSHOT_FIELDS.some(k=>String(d[k]||'').normalize('NFKC').toLocaleLowerCase('ja').includes(q))).slice(0,30);
      results.innerHTML=matches.length?matches.map(({d,index})=>'<div class="patient-med-hit"><div><strong>'+esc(d['薬名']||'名称なし')+'</strong>'+
        '<div class="notice">薬価元データ：'+esc(String(d['薬価']||'未登録').slice(0,120))+'</div>'+
        '<div class="patient-med-preview">'+esc(String(d['薬効']||'').slice(0,150))+'</div></div>'+
        '<button class="btn secondary rx035Pick" type="button" data-index="'+index+'">参考登録</button></div>').join(''):
        '<p class="empty">候補が見つかりません。</p>';
      results.querySelectorAll('.rx035Pick').forEach(b=>b.onclick=()=>void updateRef('link',pick.value,Number(b.dataset.index)));
    }
    pick.onchange=show;query.oninput=search;show();search();
  }
})();