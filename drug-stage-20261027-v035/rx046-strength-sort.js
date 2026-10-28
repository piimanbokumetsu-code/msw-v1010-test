'use strict';
/* RX046 fake-only strength display/saving order.
 * Sort doses numerically per identical unit within each product. Other
 * units cannot be compared: keep their groups in first-seen order.
 * Move EXISTING editor row nodes; never delete or recreate typed inputs.
 * No auto drug substitution, no auto price fills, no patient state changes.
 */
(function(){
  const text=v=>String(v??'').trim().normalize('NFKC');
  const unitKey=v=>text(v).toLowerCase();
  function orderRows(rows,amountFn,unitFn){
    const groups=new Map();
    return rows.map((item,index)=>{
      const raw=text(amountFn(item)), unit=unitKey(unitFn(item));
      const valid=/^\d{1,6}(?:\.\d{1,3})?$/.test(raw)&&Number(raw)>0&&!!unit;
      if(valid&&!groups.has(unit))groups.set(unit,groups.size);
      return {item,index,valid,group:valid?groups.get(unit):Infinity,value:valid?Number(raw):Infinity};
    }).sort((a,b)=>
      Number(b.valid)-Number(a.valid)||a.group-b.group||a.value-b.value||a.index-b.index
    ).map(x=>x.item);
  }
  function sortedRows(rows){
    if(!Array.isArray(rows))return rows;
    return orderRows(rows,r=>r?.amount,r=>r?.unit);
  }
  function rootLists(editor){
    const found=[];
    const main=editor.querySelector('#rx037MasterPriceRows');
    if(main)found.push(main);
    for(const item of editor.querySelectorAll('#rx038Brands [data-rx038-prices]'))found.push(item);
    for(const item of editor.querySelectorAll('#rx037GenericList [data-rx037-price-list]'))found.push(item);
    return found;
  }
  function elements(list){
    const isOrigin=list.matches('[data-rx038-prices]');
    const selector=isOrigin?'[data-rx038-price-row]':'[data-rx037-price]';
    return [...list.children].filter(el=>el.matches(selector));
  }
  function sortList(list,markChanged){
    if(!list?.isConnected)return false;
    const old=elements(list);
    if(old.length<2)return false;
    const isOrigin=list.matches('[data-rx038-prices]');
    const amountSel=isOrigin?'[data-rx038-amount]':'[data-rx037-amount]';
    const unitSel=isOrigin?'[data-rx038-unit]':'[data-rx037-unit]';
    const sorted=orderRows(old,
      row=>row.querySelector(amountSel)?.value,
      row=>row.querySelector(unitSel)?.value);
    if(sorted.every((el,i)=>el===old[i]))return false;
    // Moving the row element also moves its price, unit, focusable controls,
    // and existing RX037/RX038 listeners without altering any values.
    for(const row of sorted)list.appendChild(row);
    if(markChanged){
      // Trigger existing structured editor's dirty tracking so the new order
      // is persisted only when the operator explicitly clicks Save.
      const input=sorted[0].querySelector(amountSel);
      if(input)input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return true;
  }
  function sortEditor(editor,markChanged){
    let n=0;
    for(const list of rootLists(editor))if(sortList(list,markChanged))n++;
    return n;
  }
  function install(editor){
    if(!editor||editor.dataset.rx046SortInstalled==='1')return;
    editor.dataset.rx046SortInstalled='1';
    const form=editor.querySelector('#rx036Form');
    // Wait until an amount/unit input loses focus; never change its position
    // under the iPad keyboard while the operator is typing.
    form?.addEventListener('focusout',event=>{
      const field=event.target;
      if(!field.matches(
        '[data-rx037-amount],[data-rx038-amount],[data-rx037-unit],[data-rx038-unit]'
      ))return;
      const list=field.closest('[data-rx037-price-list],[data-rx038-prices]');
      if(!list)return;
      // During a row delete / edit switch the element may leave the document.
      setTimeout(()=>{if(list.isConnected)sortList(list,false);},0);
    });
  }
  function open(editor){
    sortEditor(editor,false);
    const hint=editor.querySelector('#rx042Help');
    if(hint&&!hint.textContent.includes('小さい順'))
      hint.textContent+=' 同じ単位の規格は量の小さい順に自動整列します。';
  }
  function beforeSave(editor){
    return sortEditor(editor,true);
  }
  window.RX046={install,open,beforeSave,sortedRows,orderRows,sortEditor};
})();
