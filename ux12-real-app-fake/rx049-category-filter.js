/* RX049 fake-stage only: type to filter RX048 drug classifications.
 * Read-only candidate lookup until the operator explicitly selects one.
 * Uses the existing RX048 dropdown, its canonical RX036 input and the
 * established encrypted save transaction. No master/patient data writes.
 */
(function(){
  'use strict';
  if(window.__RX049_CATEGORY_FILTER__)return;
  const previous=window.RX043;
  if(!previous?.install||!previous?.open)return;
  window.__RX049_CATEGORY_FILTER__=true;
  const OTHER='__rx048_custom__';
  const MAX_VISIBLE=12;
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ja').trim();
  function categories(){
    const found=[],keys=new Set();
    for(const drug of Array.isArray(state?.drugs)?state.drugs:[]){
      const name=String(drug?.['医薬品分類']??'').trim(),key=normalize(name);
      if(!name||!key||keys.has(key))continue;
      keys.add(key);found.push(name);
    }
    return found.sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
  }
  function option(select,value,label){
    const node=document.createElement('option');node.value=value;node.textContent=label;
    select.appendChild(node);
  }
  function addStyles(){
    if(document.getElementById('rx049CategoryStyle'))return;
    const style=document.createElement('style');
    style.id='rx049CategoryStyle';
    style.textContent=[
      '#rx036Editor .rx049CategorySearch{display:flex;flex-direction:column;gap:5px;margin:10px 0 7px}',
      '#rx036Editor .rx049CategorySearch>input{width:100%;min-height:42px;font-size:16px}',
      '#rx036Editor .rx049CategoryResults{display:flex;flex-direction:column;gap:4px;max-height:250px;overflow-y:auto;margin:3px 0 7px}',
      '#rx036Editor .rx049CategoryResults[hidden]{display:none!important}',
      '#rx036Editor .rx049CategoryChoice{width:100%;min-height:38px;padding:8px 10px;text-align:left;white-space:normal;overflow-wrap:anywhere}',
      '#rx036Editor .rx049CategoryCount{display:block;margin:0 0 4px}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function install(editor){
    previous.install(editor);
    if(!editor||editor.querySelector('#rx049CategoryMarker'))return;
    const picker=editor.querySelector('#rx048CategoryPicker');
    const select=editor.querySelector('#rx048CategorySelect');
    const notes=editor.querySelector('#rx039Notes');
    if(!picker||!select||!notes)return;
    addStyles();
    const searchWrap=document.createElement('label');
    searchWrap.className='rx049CategorySearch';
    searchWrap.textContent='医薬品分類を検索';
    const search=document.createElement('input');
    search.type='search';search.id='rx049CategorySearch';
    search.placeholder='分類名の一部を入力';search.autocomplete='off';
    search.maxLength=150;search.setAttribute('aria-label','医薬品分類の候補を絞り込む');
    searchWrap.appendChild(search);
    notes.insertBefore(searchWrap,picker);
    const results=document.createElement('div');
    results.id='rx049CategoryResults';results.className='rx049CategoryResults';
    results.setAttribute('role','group');
    results.setAttribute('aria-label','絞り込んだ医薬品分類');
    results.hidden=true;
    notes.insertBefore(results,picker);
    const feedback=document.createElement('span');
    feedback.id='rx049CategoryCount';feedback.className='notice rx049CategoryCount';
    feedback.setAttribute('role','status');
    notes.insertBefore(feedback,picker);
    let all=[];
    function update(){
      const query=normalize(search.value);
      const original=editor.querySelector('input[name="category"]');
      const current=String(original?.value??'').trim();
      const filtered=query?all.filter(name=>normalize(name).includes(query)):all;
      // Keep the current category visible in the dropdown even if it is
      // outside the current filter. Typing NEVER changes the saved value.
      const selected=all.find(x=>normalize(x)===normalize(current));
      select.replaceChildren();
      option(select,'','選択してください');
      if(selected&&!filtered.includes(selected))
        option(select,selected,'現在の分類：'+selected);
      for(const cat of filtered)option(select,cat,cat);
      option(select,OTHER,'＋ その他（手入力）');
      select.value=selected||current?selected||OTHER:'';
      if(!query){
        feedback.textContent=all.length+'件の登録済み分類から選択できます';
        results.replaceChildren();results.hidden=true;
        return;
      }
      feedback.textContent=filtered.length
        ?filtered.length+'件に絞り込み'+(filtered.length>MAX_VISIBLE?'（上位'+MAX_VISIBLE+'件を表示）':'')
        :'一致する分類はありません（新しい分類は「その他」で手入力）';
      results.replaceChildren();
      for(const cat of filtered.slice(0,MAX_VISIBLE)){
        const btn=document.createElement('button');
        btn.type='button';btn.className='btn secondary rx049CategoryChoice';
        btn.textContent=cat;
        btn.onclick=()=>{
          // The original RX048 onchange handler updates only the canonical
          // RX036 input, using the usual validation and save path.
          search.value='';
          all=categories();
          const originalNow=editor.querySelector('input[name="category"]');
          select.replaceChildren();
          option(select,'','選択してください');
          for(const item of all)option(select,item,item);
          option(select,OTHER,'＋ その他（手入力）');
          if(!all.includes(cat))return;
          select.value=cat;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          update();
          search.blur();
        };
        results.appendChild(btn);
      }
      results.hidden=false;
    }
    search.addEventListener('input',update);
    // When a choice is made from the filtered dropdown, reset search
    // afterwards so all options are available the next time it opens.
    select.addEventListener('change',()=>{
      search.value='';
      all=categories();
      update();
    });
    editor.__rx049CategoryReset=()=>{
      all=categories();
      search.value='';
      update();
    };
    const marker=document.createElement('span');
    marker.id='rx049CategoryMarker';marker.hidden=true;
    editor.querySelector('#rx036Form')?.appendChild(marker);
  }
  function open(editor,drug){
    previous.open(editor,drug);
    if(editor?.querySelector('#rx049CategoryMarker'))
      editor.__rx049CategoryReset?.();
  }
  window.RX043={...previous,install,open};
})();