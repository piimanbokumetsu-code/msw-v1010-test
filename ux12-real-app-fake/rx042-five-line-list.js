'use strict';
/* RX042: fake-only, presentation-only medication-master UI.
 * The first originator and first generic can show strength/price rows.
 * Additional brands are name-first; their EXISTING price input controls
 * are moved into native <details> so existing data is not erased.
 * Patient prescriptions and manual reference links are NEVER updated.
 */
(function(){
  if(typeof drawDrugs!=='function'||typeof renderDrugs!=='function')return;
  const OLD_DRAW=drawDrugs,OLD_RENDER=renderDrugs;
  const txt=x=>String(x??'').trim();
  function rowText(row){
    const amount=txt(row?.amount),unit=txt(row?.unit),price=txt(row?.price);
    if(!amount)return '';
    return amount+unit+'：'+(price?price+'円':'薬価未入力');
  }
  function priceText(drug,which){
    if(which==='original'){
      const structured=drug?.rx037?.priceRows;
      if(Array.isArray(structured)){
        const rows=(window.RX046?.sortedRows?.(structured)??structured).map(rowText).filter(Boolean);
        return rows.length?rows.join(' ／ '):'規格・薬価未登録';
      }
      // Legacy master text is not standardized; use the existing conservative
      // parser only if the entire string matches. Unknown strings are NOT
      // interpreted as a confirmed unit price.
      const raw=txt(drug?.['薬価']);
      const parsed=typeof medPriceChoices==='function'?medPriceChoices(raw):[];
      if(parsed.length)return parsed.map(x=>txt(x.strength)+'：'+txt(x.unitPrice)+'円').join(' ／ ');
      return raw?'旧薬価データ（要確認）：'+raw:'規格・薬価未登録';
    }
    const gen=Array.isArray(drug?.rx037?.generics)?drug.rx037.generics:[];
    const first=gen[0];
    if(!first)return '規格・薬価未登録';
    const rows=Array.isArray(first.priceRows)?(window.RX046?.sortedRows?.(first.priceRows)??first.priceRows).map(rowText).filter(Boolean):[];
    return rows.length?rows.join(' ／ '):'規格・薬価未登録';
  }
  function nameParts(drug){
    const first=txt(drug?.['薬名']);
    const other=Array.isArray(drug?.rx038?.otherOriginals)?drug.rx038.otherOriginals.map(x=>txt(x?.name)).filter(Boolean):[];
    const generics=Array.isArray(drug?.rx037?.generics)?drug.rx037.generics.map(x=>txt(x?.name)).filter(Boolean):[];
    const info=typeof medEffectAndGenerics==='function'
      ?medEffectAndGenerics(drug)
      :{effect:txt(drug?.['薬効']),generic:''};
    return {
      originals:[first,...other].filter(Boolean),
      generics:generics.length?generics:(txt(info.generic)?[txt(info.generic)]:[]),
      category:txt(drug?.['医薬品分類']),
      effect:txt(info.effect)
    };
  }
  function makeLine(className,label,value){
    const div=document.createElement('div');
    div.className='rx042Line '+className;
    const key=document.createElement('span');
    key.className='rx042Label';key.textContent=label;
    const text=document.createElement('span');
    text.className='rx042Value';text.textContent=value;
    if(value.length>140)text.title=value;
    div.append(key,text);
    return div;
  }
  function renderCard(card,drug){
    if(!card||!drug)return;
    const data=nameParts(drug);
    const root=document.createElement('div');root.className='rx042FiveLines';
    // Five logical rows; on a narrow iPad a long value may wrap,
    // but never shrink the font to unreadable size.
    root.appendChild(makeLine('rx042Names','先発品：',data.originals.join('・')||'未登録'));
    root.appendChild(makeLine('rx042OriginPrice','先発① 規格・薬価：',priceText(drug,'original')));
    root.appendChild(makeLine('rx042Generics','後発品：',data.generics.join('・')||'未登録'));
    root.appendChild(makeLine('rx042GenericPrice','後発① 規格・薬価：',priceText(drug,'generic')));
    const fifth=document.createElement('div');
    fifth.className='rx042Line rx042CategoryEffect';
    const category=document.createElement('span');category.className='rx042Category';
    category.textContent='医薬品分類：'+(data.category||'未登録')+'／';
    const effect=document.createElement('span');effect.className='rx042Effect';
    effect.textContent='薬効：'+(data.effect||'未登録');
    effect.title=effect.textContent;
    fifth.append(category,effect);
    root.appendChild(fifth);
    card.replaceChildren(root);
    card.classList.add('rx042Card');
    // The parent card retains the clickable handler installed in RX040.
    card.setAttribute('aria-label',(data.originals.join('・')||'薬剤')+'の編集画面を開く');
  }
  function renderFiveLineCards(){
    const root=document.querySelector('#drugList');
    if(!root)return;
    const cards=Array.from(root.querySelectorAll('.drug-list article.drug'));
    const q=txt(document.querySelector('#dq')?.value).toLowerCase();
    const shown=(state?.drugs||[]).filter(d=>!q||rx038MasterSearchText(d).includes(q)).slice(0,100);
    if(cards.length!==shown.length)return;
    for(let i=0;i<cards.length;i++)renderCard(cards[i],shown[i]);
  }
  drawDrugs=function(){
    OLD_DRAW();
    renderFiveLineCards();
  };
  renderDrugs=function(){
    OLD_RENDER();
    renderFiveLineCards();
  };

  function priceControls(card,type){
    const list=card.querySelector(type==='original'?'[data-rx038-prices]':'[data-rx037-price-list]');
    const button=card.querySelector(type==='original'?'[data-rx038-action="add-price"]':'[data-rx037-action="add-generic-price"]');
    return {list,button};
  }
  function markDetail(card,type){
    if(card.querySelector(':scope > details.rx042BrandDetails'))return;
    const {list,button}=priceControls(card,type);
    if(!list||!button)return;
    const detail=document.createElement('details');
    detail.className='rx042BrandDetails';
    const summary=document.createElement('summary');
    summary.textContent='規格・薬価も個別登録する（任意）';
    detail.appendChild(summary);
    detail.appendChild(list);
    detail.appendChild(button);
    card.appendChild(detail);
    const filled=[...list.querySelectorAll(
      type==='original'?'[data-rx038-amount]':'[data-rx037-amount]'
    )].filter(el=>txt(el.value)).length;
    if(filled){
      summary.textContent='登録済みの規格・薬価を確認・変更（'+filled+'規格）';
    }
    // Intentionally collapsed even with existing data. Price rows remain
    // present in the DOM and RX037/RX038 save logic reads them unchanged.
  }
  function restoreFirstGeneric(card){
    const detail=card.querySelector(':scope > details.rx042BrandDetails');
    if(!detail)return;
    const {list,button}=priceControls(detail,'generic');
    if(!list||!button)return;
    card.insertBefore(list,detail);
    card.insertBefore(button,detail);
    detail.remove();
  }
  function normalizeEditor(editor){
    const originals=[...editor.querySelectorAll('#rx038Brands > [data-rx038-brand]')];
    for(const card of originals)markDetail(card,'original');
    const genericCards=[...editor.querySelectorAll('#rx037GenericList > [data-rx037-generic]')];
    for(const [i,card] of genericCards.entries()){
      if(i===0)restoreFirstGeneric(card);
      else markDetail(card,'generic');
    }
    const help=editor.querySelector('#rx042Help');
    if(help)help.textContent='先発品①・後発品①は規格と薬価を入力。②以降は薬品名だけで登録できます。必要なら個別の規格・薬価を展開してください。各銘柄へ薬価を自動コピーしません。';
  }
  function install(editor){
    if(editor.querySelector('#rx042Help'))return;
    const note=document.createElement('p');
    note.id='rx042Help';note.className='rx042Help';
    const originals=editor.querySelector('#rx038Section');
    originals?.insertAdjacentElement('beforebegin',note);
    editor.querySelector('#rx036Form')?.addEventListener('click',event=>{
      // RX037/038 add/remove callbacks are installed earlier. Synchronize
      // the display afterwards, including after removal of the first generic.
      if(event.target.closest('[data-rx037-action],[data-rx038-action]'))
        normalizeEditor(editor);
    });
  }
  function open(editor){
    normalizeEditor(editor);
  }
  window.RX042={install,open,renderCard,priceText,nameParts};
})();
