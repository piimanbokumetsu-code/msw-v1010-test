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
  let categoryOptions=[];
  let categoryMatches=[];

  function escText(v){return esc(String(v??''));}
  function message(text){
    const el=document.querySelector('#rx036Notice');
    if(el)el.textContent=String(text);
  }
  function findDisplayed(){
    const q=(document.querySelector('#dq')?.value||'').toLowerCase().trim();
    return (state.drugs||[]).map((drug,index)=>({drug,index}))
      .filter(({drug})=>!q||rx038MasterSearchText(drug).includes(q))
      .slice(0,100);
  }
  function decorateList(){
    const list=document.querySelector('#drugList');
    if(!list)return;
    const displayed=findDisplayed();
    const cards=Array.from(list.querySelectorAll('.drug-list article.drug'));
    if(displayed.length!==cards.length)return;
    cards.forEach((card,i)=>{
      // Full-card tap replaces the separate edit button. The index follows the
      // currently filtered/sorted rendered list, not the unfiltered array.
      // Original render already invokes wrapped drawDrugs() once; do not
      // install duplicate listeners or duplicate the RX037/038 summaries.
      if(card.dataset.rx040TapEdit==='1')return;
      const index=displayed[i].index;
      const name=String(displayed[i].drug['薬名']||'薬剤');
      card.dataset.rx040TapEdit='1';
      card.classList.add('rx040TapCard');
      card.tabIndex=0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label',name+'の編集画面を開く');
      function activate(){
        if(busy)return;
        const visibleEditor=document.querySelector('#rx036Editor');
        if(visibleEditor&&!visibleEditor.hidden){
          if(draftMode==='edit'&&editorIndex===index){
            visibleEditor.scrollIntoView({behavior:'auto',block:'start'});
            return;
          }
          // Prevent silently losing unsaved changes by tapping another card.
          if(!confirm('編集中の内容はまだ保存されていません。別の薬剤に切り替えますか？'))return;
        }
        openEditor('edit',index);
      }
      card.addEventListener('click',event=>{
        // Future actions added inside drug cards must remain independent.
        const nested=event.target.closest('button,a,input,select,textarea,summary,[role="button"],[contenteditable]');
        // The article itself has role="button"; do not suppress its own tap.
        if(nested&&nested!==card)return;
        activate();
      });
      card.addEventListener('keydown',event=>{
        if(event.target!==card)return;
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          activate();
        }
      });
      window.RX037?.summarize(card,displayed[i].drug);
      window.RX038?.summarize(card,displayed[i].drug);
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
      '<span class="notice rx040TapHint">薬剤の枠をタップして編集できます</span>'+
      '<span id="rx036Notice" class="notice" role="status" aria-live="polite"></span>';
    toolbar.insertAdjacentElement('afterend',actions);
    const form=document.createElement('section');
    form.id='rx036Editor';form.className='panel';form.hidden=true;
    form.innerHTML='<h3 id="rx036Heading">薬剤マスター編集</h3>'+
      '<p class="notice">薬情マスターの1件のみを登録・編集します。登録済み患者の処方薬や参考薬情は自動変更しません。</p>'+
      '<form id="rx036Form" autocomplete="off" novalidate>'+
        '<label>薬名（必須）<input type="text" name="name" maxlength="160" required placeholder="例：ノルバスク錠"></label>'+
        '<label>医薬品分類<input type="text" name="category" maxlength="150" autocomplete="off" aria-controls="rx036CategoryMatches" aria-autocomplete="list" placeholder="分類名で既存候補を検索"></label>'+
        '<div id="rx036CategoryMatches" class="rx036CategoryMatches" role="group" aria-label="医薬品分類の入力候補" hidden></div>'+
        '<p class="notice">入力中に既存の分類を絞り込みます。候補をタップするか、そのまま自由入力できます。</p>'+
        '<label>薬価の元データ<textarea name="price" rows="3" maxlength="1600" placeholder="例：5mg(12.30)10mg(24.50)"></textarea></label>'+
        '<div id="rx036PricePreview" class="notice" role="status" aria-live="polite">薬価を入力すると規格別の読み取り候補が表示されます。</div>'+
        '<label>薬効・補足メモ<textarea name="effect" rows="4" maxlength="6500" placeholder="薬効や補足情報を入力"></textarea></label>'+
        '<p class="notice">旧CSVの「後発品⇒薬剤名」などは参考情報として残せます。銘柄の登録は上の先発品・後発品欄を使ってください。</p>'+
        '<div class="rx036Controls">'+
          '<button class="btn" id="rx036Save" type="submit">保存する</button>'+
          '<button class="btn secondary" id="rx036Cancel" type="button">キャンセル</button>'+
          '<button class="btn danger" id="rx036Delete" type="button" hidden>この薬剤を削除</button>'+
        '</div><p id="rx036FormStatus" role="status" aria-live="polite"></p>'+
      '</form>';
    actions.insertAdjacentElement('afterend',form);
    actions.querySelector('#rx036Add').onclick=()=>openEditor('new');
    const catInput=form.querySelector('input[name="category"]');
    const matches=form.querySelector('#rx036CategoryMatches');
    catInput.addEventListener('focus',renderCategoryMatches);
    catInput.addEventListener('input',renderCategoryMatches);
    catInput.addEventListener('keydown',event=>{
      if(event.key==='Escape')matches.hidden=true;
    });
    // Keep the iPad soft keyboard from dismissing the tapped option first.
    matches.addEventListener('pointerdown',event=>{
      if(event.target.closest('button[data-category-index]'))event.preventDefault();
    });
    matches.addEventListener('click',event=>{
      const btn=event.target.closest('button[data-category-index]');
      if(!btn||!matches.contains(btn))return;
      const index=Number(btn.dataset.categoryIndex);
      if(!Number.isInteger(index)||!categoryMatches[index])return;
      catInput.value=categoryMatches[index];
      matches.hidden=true;
      matches.innerHTML='';
      catInput.blur();
    });
    catInput.addEventListener('blur',()=>{
      setTimeout(()=>{
        if(matches.isConnected&&document.activeElement!==catInput)matches.hidden=true;
      },170);
    });
    form.querySelector('textarea[name="price"]').addEventListener('input',updatePricePreview);
    form.querySelector('#rx036Cancel').onclick=()=>{
      if(!busy){form.hidden=true;editorIndex=null;editorOld=null;}
    };
    form.querySelector('#rx036Form').onsubmit=e=>{e.preventDefault();void commitEdit();};
    window.RX037?.install(form);
    window.RX038?.install(form);
    window.RX039?.install(form);
    window.RX042?.install(form);
    window.RX043?.install(form);
    window.RX046?.install(form);
    form.querySelector('#rx036Delete').onclick=()=>{void deleteMasterDrug();};
    const drugList=main.querySelector('#drugList');
    if(drugList)drugList.insertAdjacentHTML('afterend',
      '<p class="notice rx036Foot">薬剤CSVを再取り込みすると、この画面からの追加・編集内容も薬剤マスター全件とともに置き換わります。必要時は事前に暗号化バックアップを保存してください。</p>');
    decorateList();
  }
  function populateCategoryChoices(form){
    const seen=new Set();
    categoryOptions=[];
    for(const drug of state?.drugs||[]){
      const value=String(drug?.['医薬品分類']??'').trim();
      const key=value.normalize('NFKC').toLocaleLowerCase('ja');
      if(!value||seen.has(key))continue;
      seen.add(key);categoryOptions.push(value);
    }
    categoryOptions.sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
    categoryMatches=[];
    const matches=form.querySelector('#rx036CategoryMatches');
    if(matches){matches.hidden=true;matches.innerHTML='';}
  }
  function filteredCategoryChoices(input){
    const q=String(input??'').normalize('NFKC').toLocaleLowerCase('ja').trim();
    return (q
      ? categoryOptions.filter(x=>x.normalize('NFKC').toLocaleLowerCase('ja').includes(q))
      : categoryOptions).slice(0,12);
  }
  function renderCategoryMatches(){
    const form=document.querySelector('#rx036Editor');
    if(!form||form.hidden||busy)return;
    const input=form.querySelector('input[name="category"]');
    const matches=form.querySelector('#rx036CategoryMatches');
    if(!input||!matches)return;
    categoryMatches=filteredCategoryChoices(input.value);
    matches.innerHTML=categoryMatches.length
      ? '<span class="rx036CategoryCount">登録済みの分類候補（最大12件）</span>'+
        categoryMatches.map((value,i)=>
          '<button type="button" class="rx036CategoryOption" data-category-index="'+i+'">'+esc(value)+'</button>'
        ).join('')
      : '<span class="rx036CategoryEmpty">一致する分類はありません。そのまま自由入力できます。</span>';
    matches.hidden=false;
  }
  function updatePricePreview(){
    const form=document.querySelector('#rx036Editor');
    if(!form)return;
    const input=form.querySelector('textarea[name="price"]');
    const preview=form.querySelector('#rx036PricePreview');
    if(!input||!preview)return;
    const raw=input.value.trim();
    if(!raw){preview.textContent='薬価を入力すると規格別の読み取り候補が表示されます。';return;}
    const choices=(typeof medPriceChoices==='function')?medPriceChoices(raw):[];
    if(!choices.length){
      preview.textContent='規格別の薬価候補を認識できません。例：5mg(12.30)10mg(24.50)。入力内容はそのまま保存されます。';
      return;
    }
    preview.innerHTML='<strong>読み取り候補：'+choices.length+'件</strong><div class="rx036Prices">'+
      choices.map(x=>'<span>'+esc(x.strength)+'：'+esc(x.unitPrice)+'円</span>').join('')+
      '</div><small>確認用の候補です。1錠・1包などの価格単位は別途確認してください。薬価の自動確定はしません。</small>';
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
    form.querySelector('#rx036Delete').hidden=mode!=='edit';
    const inputs=form.querySelector('#rx036Form').elements;
    inputs.namedItem('name').value=String(editorOld?.['薬名']??'');
    inputs.namedItem('category').value=String(editorOld?.['医薬品分類']??'');
    inputs.namedItem('price').value=String(editorOld?.['薬価']??'');
    inputs.namedItem('effect').value=String(editorOld?.['薬効']??'');
    populateCategoryChoices(form);
    updatePricePreview();
    window.RX037?.open(form,editorOld);
    window.RX038?.open(form,editorOld);
    window.RX039?.open(form,editorOld);
    window.RX042?.open(form,editorOld);
    window.RX043?.open(form,editorOld);
    window.RX046?.open(form,editorOld);
    form.querySelector('#rx036FormStatus').textContent='';
    form.hidden=false;
    form.scrollIntoView({behavior:'auto',block:'start'});
  }
  function setWorking(value){
    busy=value;
    const form=document.querySelector('#rx036Editor');
    if(!form)return;
    form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=value);
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
    let rx037=null;
    try{
      // Sort the unchanged input DOM rows before the existing validators
      // and encryption commit read them. No saved array is changed here.
      window.RX046?.beforeSave(form);
      rx037=window.RX037?.read(form,editorOld,data)||null;
    }catch(e){
      status.textContent=String(e?.message||e);
      return;
    }
    if(rx037?.priceText!==undefined)data['薬価']=rx037.priceText;
    let rx038=null;
    try{
      rx038=window.RX038?.read(form,editorOld,data,rx037)||null;
    }catch(e){
      status.textContent=String(e?.message||e);
      return;
    }
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
    if(draftMode==='edit'&&fields.every(f=>String(editorOld[f]??'').trim()===data[f])&&!rx037?.changed&&!rx038?.changed){
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
      const savedDrug=draftMode==='new'?{...data}:{...editorOld,...data};
      if(rx037?.changed)savedDrug.rx037=rx037.value;
      if(rx038?.changed)savedDrug.rx038=rx038.value;
      if(draftMode==='new')nextDrugs.push(savedDrug);
      else nextDrugs[editorIndex]=savedDrug;
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
  async function deleteMasterDrug(){
    if(busy||drugCsvBusy)return;
    const form=document.querySelector('#rx036Editor');
    if(!form||form.hidden||!key||!state||screen!=='drugs'||draftMode!=='edit')return;
    const status=form.querySelector('#rx036FormStatus');
    const current=state;
    const rows=Array.isArray(current.drugs)?current.drugs:[];
    const index=editorIndex, old=editorOld;
    if(!Number.isInteger(index)||index<0||index>=rows.length||rows[index]!==old){
      status.textContent='薬剤マスターの内容が変わりました。薬情一覧から開き直してください。';
      return;
    }
    const originalName=String(old?.['薬名']??'');
    if(!confirm('薬情マスターから「'+originalName+'」を1件削除します。'+
      '\n\nこの操作は元に戻せません。'+
      '\n患者ごとに登録済みの処方薬・参考薬情・過去の記録は削除・変更しません。'+
      '\n\n削除してよろしいですか？'))return;
    const actionName='薬情マスターの個別削除';
    let acquired=false;
    setWorking(true);
    status.textContent='薬情マスターから削除して暗号化保存しています…';
    try{
      await beginMaintenance(actionName);acquired=true;
      if(!key||screen!=='drugs'||state!==current||
         !Array.isArray(state.drugs)||state.drugs[index]!==old||
         draftMode!=='edit'||editorIndex!==index||editorOld!==old)
        throw new Error('削除対象が変わったため中止しました。');
      const nextDrugs=rows.slice();
      nextDrugs.splice(index,1);
      const next={...current,drugs:nextDrugs,version:APP_VERSION,updatedAt:nowISO()};
      const activeKey=key;
      await orderedDataWrite(async()=>idbSet('data',await encryptPatientIndex(next,activeKey)));
      if(key!==activeKey)throw new Error('ロック状態が変わりました。');
      state=next;
      ensureStateSchema();
      editorIndex=null;editorOld=null;
      if(screen==='drugs'){
        renderDrugs();
        message('「'+originalName+'」を薬情マスターから1件削除しました。患者の処方薬・過去の参考情報は変更していません。');
      }
    }catch(e){
      if(status&&status.isConnected)
        status.textContent='削除できませんでした：'+String(e?.message||e).slice(0,160);
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