'use strict';
/* RX036: editable fake-only drug master.
 * Preserves patient-specific prescription snapshots and historical drug refs.
 * Requires explicit confirmation and waits for encrypted IndexedDB writes
 * before replacing active state. No upload/API/remote calls.
 */
(function(){
  if(typeof renderDrugs!=='function'||typeof drawDrugs!=='function'||
     typeof beginMaintenance!=='function'||typeof orderedDataWrite!=='function')return;
  const originalRender=renderDrugs;
  const originalDraw=drawDrugs;
  const fields=['薬名','医薬品分類','薬価','薬効'];
  let busy=false;
  let editorIndex=null;
  let editorOld=null;
  let draftMode='new';

  function escText(v){return esc(String(v??''));}
  function message(text){
    const el=document.querySelector('#rx036Notice');
    if(el)el.textContent=String(text);
  }
  function findDisplayed(){
    const q=(document.querySelector('#dq')?.value||'').toLowerCase().trim();
    return (state.drugs||[]).map((drug,index)=>({drug,index}))
      .filter(({drug})=>!q||[drug['薬名'],drug['医薬品分類'],drug['薬効']].join(' ').toLowerCase().includes(q))
      .slice(0,100);
  }
  function decorateList(){
    const list=document.querySelector('#drugList');
    if(!list)return;
    const displayed=findDisplayed();
    const cards=Array.from(list.querySelectorAll('.drug-list article.drug'));
    if(displayed.length!==cards.length)return;
    cards.forEach((card,i)=>{
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn secondary rx036Edit';
      btn.textContent='この薬剤を編集';
      btn.setAttribute('aria-label',String(displayed[i].drug['薬名']||'薬剤')+'の情報を編集');
      btn.onclick=()=>openEditor('edit',displayed[i].index);
      card.appendChild(btn);
    });
  }
  function install(){
    const main=document.querySelector('#main');
    if(!main)return;
    const toolbar=main.querySelector('.toolbar');
    if(!toolbar)return;
    const actions=document.createElement('div');
    actions.className='rx036Actions';
    actions.innerHTML='<button type="button" class="btn" id="rx036Add">＋ 薬剤を新規登録</button>'+
      '<span id="rx036Notice" class="notice" role="status" aria-live="polite"></span>';
    toolbar.insertAdjacentElement('afterend',actions);
    const form=document.createElement('section');
    form.id='rx036Editor';form.className='panel';form.hidden=true;
    form.innerHTML='<h3 id="rx036Heading">薬剤マスター編集</h3>'+
      '<p class="notice">薬情マスターの1件のみを登録・編集します。登録済み患者の処方薬や参考薬情は自動変更しません。</p>'+
      '<form id="rx036Form" autocomplete="off" novalidate>'+
        '<label>薬名（必須）<input type="text" name="name" maxlength="160" required placeholder="例：架空薬剤テスト"></label>'+
        '<label>医薬品分類<input type="text" name="category" maxlength="150" placeholder="分類を入力"></label>'+
        '<label>薬価の元データ<textarea name="price" rows="3" maxlength="1600" placeholder="例：5mg(12.30)10mg(24.50)"></textarea></label>'+
        '<label>薬効・後発品などの参考情報<textarea name="effect" rows="5" maxlength="6500" placeholder="薬効の説明や後発品情報を入力"></textarea></label>'+
        '<p class="notice">薬価は元データとして文字列を保存します。規格・単位が未確認の金額を自動計算しません。後発品を記す場合は「後発品⇒薬剤名」の形式が使えます。</p>'+
        '<div class="rx036Controls">'+
          '<button class="btn" id="rx036Save" type="submit">保存する</button>'+
          '<button class="btn secondary" id="rx036Cancel" type="button">キャンセル</button>'+
        '</div><p id="rx036FormStatus" role="status" aria-live="polite"></p>'+
      '</form>';
    actions.insertAdjacentElement('afterend',form);
    actions.querySelector('#rx036Add').onclick=()=>openEditor('new');
    form.querySelector('#rx036Cancel').onclick=()=>{
      if(!busy){form.hidden=true;editorIndex=null;editorOld=null;}
    };
    form.querySelector('#rx036Form').onsubmit=e=>{e.preventDefault();void commitEdit();};
    const drugList=main.querySelector('#drugList');
    if(drugList)drugList.insertAdjacentHTML('afterend',
      '<p class="notice rx036Foot">薬剤CSVを再取り込みすると、この画面からの追加・編集内容も薬剤マスター全件とともに置き換わります。必要時は事前に暗号化バックアップを保存してください。</p>');
    decorateList();
  }
  function openEditor(mode,index=null){
    if(busy)return;
    const form=document.querySelector('#rx036Editor');
    if(!form)return;
    const current=state?.drugs||[];
    if(mode==='edit'&&(!Number.isInteger(index)||index<0||index>=current.length)){
      message('対象の薬剤が見つかりません。再検索してください。');return;
    }
    draftMode=mode;editorIndex=mode==='edit'?index:null;editorOld=mode==='edit'?current[index]:null;
    form.querySelector('#rx036Heading').textContent=mode==='edit'?'薬情マスターを編集':'薬情マスターへ新規登録';
    const inputs=form.querySelector('#rx036Form').elements;
    inputs.namedItem('name').value=String(editorOld?.['薬名']??'');
    inputs.namedItem('category').value=String(editorOld?.['医薬品分類']??'');
    inputs.namedItem('price').value=String(editorOld?.['薬価']??'');
    inputs.namedItem('effect').value=String(editorOld?.['薬効']??'');
    form.querySelector('#rx036FormStatus').textContent='';
    form.hidden=false;
    form.scrollIntoView({behavior:'auto',block:'start'});
  }
  function setWorking(value){
    busy=value;
    const form=document.querySelector('#rx036Editor');
    if(!form)return;
    form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value);
    const add=document.querySelector('#rx036Add');
    if(add)add.disabled=value;
    document.querySelectorAll('.rx036Edit, .bottomnav .navbtn').forEach(el=>el.disabled=value);
  }
  function readDraft(){
    const e=document.querySelector('#rx036Form')?.elements;
    if(!e)return null;
    return {
      '薬名':e.namedItem('name').value.trim(),
      '医薬品分類':e.namedItem('category').value.trim(),
      '薬価':e.namedItem('price').value.trim(),
      '薬効':e.namedItem('effect').value.trim()
    };
  }
  async function commitEdit(){
    if(busy||drugCsvBusy)return;
    const form=document.querySelector('#rx036Editor');
    if(!form||form.hidden||!key||!state||screen!=='drugs')return;
    const status=form.querySelector('#rx036FormStatus');
    const data=readDraft();
    if(!data||!data['薬名']){status.textContent='薬名を入力してください。';return;}
    if(data['薬名'].length>160||data['医薬品分類'].length>150||
       data['薬価'].length>1600||data['薬効'].length>6500){
      status.textContent='入力が長すぎます。欄ごとの文字数制限を確認してください。';return;
    }
    const current=state;
    const rows=Array.isArray(current.drugs)?current.drugs:[];
    if(rows.length>=10000&&draftMode==='new'){status.textContent='薬剤マスターは最大10000件です。';return;}
    if(draftMode==='edit'&&rows[editorIndex]!==editorOld){
      status.textContent='他の処理で薬剤マスターが更新されました。再度開いてください。';return;
    }
    const same=rows.findIndex((drug,i)=>(draftMode!=='edit'||i!==editorIndex)&&
      fields.every(f=>String(drug[f]??'').trim()===data[f]));
    if(same>=0){status.textContent='まったく同じ内容の薬剤が登録済みです。';return;}
    if(draftMode==='edit'&&fields.every(f=>String(editorOld[f]??'').trim()===data[f])){
      status.textContent='変更されていません。';return;
    }
    const action=draftMode==='new'?'新規登録':'編集';
    if(!confirm('薬情マスターの「'+data['薬名']+'」を'+action+'して端末内に保存します。'+
      '\n患者の処方薬、参考薬情、過去の記録は変更しません。よろしいですか？'))return;
    const actionName='薬情マスターの個別'+action;
    let acquired=false;
    setWorking(true);status.textContent='暗号化保存しています…';
    try{
      await beginMaintenance(actionName);acquired=true;
      if(screen!=='drugs'||state!==current||(draftMode==='edit'&&current.drugs[editorIndex]!==editorOld))
        throw new Error('操作中に内容が変わったため保存を中止しました。');
      const nextDrugs=rows.slice();
      if(draftMode==='new')nextDrugs.push(data);
      else nextDrugs[editorIndex]={...editorOld,...data};
      const next={...current,drugs:nextDrugs,version:APP_VERSION,updatedAt:nowISO()};
      const activeKey=key;
      // Same encrypted, serialized commit pattern as the existing CSV importer.
      await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,activeKey)));
      if(key!==activeKey)throw new Error('ロック状態が変更されました。');
      state=next;ensureStateSchema();
      editorIndex=null;editorOld=null;
      if(screen==='drugs'){
        renderDrugs();
        const q=document.querySelector('#dq');
        if(q){q.value=data['薬名'];drawDrugs();}
        message('「'+data['薬名']+'」を'+action+'して保存しました。患者ごとの処方薬は変更していません。');
      }
    }catch(e){
      if(status&&status.isConnected)status.textContent='保存できませんでした：'+String(e?.message||e).slice(0,160);
    }finally{
      if(acquired)endMaintenance(actionName);
      setWorking(false);
    }
  }
  drawDrugs=function(){
    originalDraw();
    decorateList();
  };
  renderDrugs=function(){
    originalRender();
    install();
  };
})();