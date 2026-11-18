/* RX048 FAKE-STAGE ONLY (2026-11-18): three visual improvements
 * 1. Hide explanatory prose immediately beneath original-brand header.
 * 2. Collapse originator #1 strength/quantity/price inputs (native details).
 * 3. Show existing master categories in a select; permit explicit custom entry.
 *
 * Data-safe: preserve the ORIGINAL RX036 category input and RX037 price rows,
 * attach only view controls, and do not touch state/save/DB/master metadata.
 * The normal RX036 commit/validation code continues to read original fields.
 */
(function(){
  'use strict';
  if(window.__RX048_MASTER_CLEAN_LAYOUT__)return;
  const prior=window.RX043;
  if(!prior?.install||!prior?.open)return;
  window.__RX048_MASTER_CLEAN_LAYOUT__=true;

  const OTHER='__rx048_custom__';
  const normalize=v=>String(v??'').trim().normalize('NFKC').toLocaleLowerCase('ja');

  function style(){
    if(document.getElementById('rx048MasterCleanStyle'))return;
    const el=document.createElement('style');
    el.id='rx048MasterCleanStyle';
    el.textContent=[
      '#rx036Editor .rx048HiddenHelp{display:none!important}',
      '#rx036Editor .rx048CanonicalCategory{display:none!important}',
      '#rx036Editor #rx036CategoryMatches{display:none!important}',
      '#rx036Editor .rx048PrimaryPriceDisclosure{margin:6px 0 12px;border:1px solid var(--line,#cbd5d1);border-radius:9px;background:transparent}',
      '#rx036Editor .rx048PrimaryPriceDisclosure>summary{cursor:pointer;padding:11px 12px;font-weight:700;color:var(--brand,#0f766e);list-style:revert}',
      '#rx036Editor .rx048PrimaryPriceContent{padding:0 10px 12px}',
      '#rx036Editor .rx048CategoryPicker{display:block;margin:9px 0}',
      '#rx036Editor .rx048CategoryPicker select{width:100%;min-height:42px;font-size:16px}',
      '#rx036Editor .rx048CategoryOther{display:block;margin:8px 0}',
      '#rx036Editor .rx048CategoryOther input{width:100%;font-size:16px}'
    ].join('\n');
    document.head.appendChild(el);
  }

  function suppressHelp(editor){
    const original=editor.querySelector('#rx038Section');
    const primary=editor.querySelector('#rx037MasterPrice');
    const notes=editor.querySelector('#rx039Notes');
    if(!original||!primary||!notes)return;
    const hide=node=>node?.classList.add('rx048HiddenHelp');
    // The requested first section's introductory explanation and RX042 hint.
    hide(original.querySelector(':scope > p.rx039Help'));
    hide(original.querySelector(':scope > p.notice'));
    hide(editor.querySelector('#rx042Help'));
    hide(original.querySelector('.rx038MainBrand > small'));
    // Secondary instructional paragraphs in the same section (keep form data).
    original.querySelectorAll(':scope > p.notice').forEach(hide);
    hide(primary.querySelector(':scope > p.notice'));
    // The category input's former "search as you type" help is redundant.
    for(const p of notes.querySelectorAll(':scope > p.notice')){
      if((p.textContent||'').includes('既存の分類')||
         (p.textContent||'').includes('自由入力できます'))hide(p);
    }
  }

  function priceCount(list){
    return Array.from(list?.querySelectorAll(':scope > [data-rx037-price]')||[])
      .filter(row=>String(row.querySelector('[data-rx037-amount]')?.value||'').trim()).length;
  }
  function updatePriceSummary(editor){
    const detail=editor.querySelector('#rx048PrimaryPriceDisclosure');
    const list=editor.querySelector('#rx037MasterPriceRows');
    const summary=detail?.querySelector('summary');
    if(!summary||!list)return;
    const count=priceCount(list);
    summary.textContent=count
      ?'規格・量・薬価を表示・編集（'+count+'規格）'
      :'規格・量・薬価を入力する';
  }

  function installPrice(editor){
    const primary=editor.querySelector('#rx037MasterPrice');
    if(!primary||editor.querySelector('#rx048PrimaryPriceDisclosure'))return;
    const list=primary.querySelector('#rx037MasterPriceRows');
    const add=primary.querySelector('[data-rx037-action="add-master-price"]');
    if(!list||!add)return;
    const detail=document.createElement('details');
    detail.id='rx048PrimaryPriceDisclosure';
    detail.className='rx048PrimaryPriceDisclosure';
    const summary=document.createElement('summary');
    detail.appendChild(summary);
    const content=document.createElement('div');
    content.className='rx048PrimaryPriceContent';
    // MOVE existing nodes rather than copying them. RX037's dirty tracking,
    // delegated buttons and save-time query selectors must retain identity.
    content.appendChild(list);
    content.appendChild(add);
    detail.appendChild(content);
    primary.appendChild(detail);
    detail.open=false;
    updatePriceSummary(editor);
    const refresh=()=>updatePriceSummary(editor);
    editor.querySelector('#rx036Form')?.addEventListener('input',refresh);
    editor.querySelector('#rx036Form')?.addEventListener('change',refresh);
    // RX037 adds/removes rows in a delegated click handler installed earlier.
    editor.querySelector('#rx036Form')?.addEventListener('click',event=>{
      if(event.target.closest('[data-rx037-action]'))refresh();
    });
  }

  function storedCategories(){
    const out=[],seen=new Set();
    for(const drug of Array.isArray(state?.drugs)?state.drugs:[]){
      const v=String(drug?.['医薬品分類']||'').trim();
      const key=normalize(v);
      if(!v||seen.has(key))continue;
      seen.add(key);out.push(v);
    }
    return out.sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
  }
  function option(select,value,label){
    const el=document.createElement('option');
    el.value=value;el.textContent=label;
    select.appendChild(el);
  }
  function syncCategory(editor,value){
    const original=editor.querySelector('input[name="category"]');
    if(!original)return;
    // RX036's existing field stays the single source of truth when saving.
    original.value=value;
    original.dispatchEvent(new Event('input',{bubbles:true}));
    original.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function installCategory(editor){
    const original=editor.querySelector('input[name="category"]');
    if(!original||editor.querySelector('#rx048CategoryPicker'))return;
    const oldLabel=original.closest('label');
    const notes=editor.querySelector('#rx039Notes');
    if(!oldLabel||!notes)return;
    oldLabel.classList.add('rx048CanonicalCategory');
    const box=document.createElement('div');
    box.id='rx048CategoryPicker';box.className='rx048CategoryPicker';
    const label=document.createElement('label');
    label.textContent='医薬品分類';
    const select=document.createElement('select');
    select.id='rx048CategorySelect';
    select.setAttribute('aria-label','医薬品分類を選択');
    label.appendChild(select);
    box.appendChild(label);
    const custom=document.createElement('label');
    custom.id='rx048CategoryOther';
    custom.className='rx048CategoryOther';
    custom.textContent='分類を手入力';
    const input=document.createElement('input');
    input.id='rx048CategoryOtherInput';
    input.type='text';input.maxLength=150;
    input.autocomplete='off';input.placeholder='新しい分類名';
    custom.appendChild(input);
    box.appendChild(custom);
    notes.insertBefore(box,oldLabel);
    select.addEventListener('change',()=>{
      const manual=select.value===OTHER;
      custom.hidden=!manual;
      syncCategory(editor,manual?input.value:select.value);
      if(manual)input.focus();
    });
    input.addEventListener('input',()=>{
      if(select.value===OTHER)syncCategory(editor,input.value);
    });
  }
  function refreshCategory(editor){
    const select=editor.querySelector('#rx048CategorySelect');
    const manual=editor.querySelector('#rx048CategoryOther');
    const input=editor.querySelector('#rx048CategoryOtherInput');
    const original=editor.querySelector('input[name="category"]');
    if(!select||!manual||!input||!original)return;
    const current=String(original.value||'').trim();
    const cats=storedCategories();
    select.replaceChildren();
    option(select,'','選択してください');
    for(const cat of cats)option(select,cat,cat);
    option(select,OTHER,'＋ その他（手入力）');
    const found=cats.find(cat=>normalize(cat)===normalize(current));
    if(current&&!found){
      select.value=OTHER;
      input.value=current;
      manual.hidden=false;
    }else{
      select.value=found||'';
      input.value='';
      manual.hidden=true;
    }
    // Do NOT dispatch input here: opening an editor must not edit saved data.
  }

  function install(editor){
    prior.install(editor);
    if(!editor||editor.querySelector('#rx048MasterCleanMarker'))return;
    // RX043 moves the original master controls into their final sections.
    if(!editor.querySelector('#rx043Marker'))return;
    style();
    suppressHelp(editor);
    installPrice(editor);
    installCategory(editor);
    const marker=document.createElement('span');
    marker.id='rx048MasterCleanMarker';marker.hidden=true;
    editor.querySelector('#rx036Form')?.appendChild(marker);
  }
  function open(editor,drug){
    prior.open(editor,drug);
    if(!editor?.querySelector('#rx048MasterCleanMarker'))return;
    suppressHelp(editor);
    const detail=editor.querySelector('#rx048PrimaryPriceDisclosure');
    if(detail)detail.open=false;
    updatePriceSummary(editor);
    refreshCategory(editor);
  }
  window.RX043={...prior,install,open};
})();