'use strict';
/* RX038 fake-only: multiple originator brands under one drug master record.
 * Kept separate from RX037's candidate generics. Neither edits patient
 * prescriptions nor infers pharmaceutical equivalence or price-unit basis.
 */
(function(){
  const MAX_BRANDS=8,MAX_PRICES=15,MAX_NAME=160;
  const UNITS=['mg','μg','g','mL','%','単位','錠','包','その他'];
  let editor=null,dirty=false,building=false;
  const encode=text=>esc(String(text??''));
  const normName=text=>String(text??'').normalize('NFKC').trim().toLocaleLowerCase('ja');
  function unitOptions(selected='mg'){
    const opts=UNITS.includes(selected)?UNITS:[...UNITS,selected];
    return opts.filter(Boolean).map(x=>'<option value="'+encode(x)+'"'+(x===selected?' selected':'')+'>'+encode(x)+'</option>').join('');
  }
  function makePriceRow(row={}){
    return '<div class="rx038PriceRow" data-rx038-price-row>'+
      '<label>量<input data-rx038-amount type="text" inputmode="decimal" maxlength="15" value="'+encode(row.amount)+'" placeholder="例：5"></label>'+
      '<label>単位<select data-rx038-unit>'+unitOptions(String(row.unit??'mg'))+'</select></label>'+
      '<label>薬価（円）<input data-rx038-price type="text" inputmode="decimal" maxlength="16" value="'+encode(row.price)+'" placeholder="例：12.30"></label>'+
      '<button type="button" class="btn secondary rx038RemoveRow" data-rx038-action="remove-price" aria-label="この規格を外す">×</button></div>';
  }
  function makeBrandCard(data={},index=0){
    const el=document.createElement('section');
    el.className='rx038Brand';el.dataset.rx038Brand='';
    const rows=Array.isArray(data.priceRows)&&data.priceRows.length?data.priceRows:[{}];
    el.innerHTML='<div class="rx038BrandHead"><strong>追加の先発品 '+(index+2)+'</strong>'+
      '<button type="button" class="btn secondary" data-rx038-action="remove-brand">この先発品を外す</button></div>'+
      '<label>先発品の商品名<input data-rx038-name type="text" maxlength="160" placeholder="例：アムロジン錠" value="'+encode(data.name)+'"></label>'+
      '<div class="rx038Prices" data-rx038-prices>'+rows.map(makePriceRow).join('')+'</div>'+
      '<button type="button" class="btn secondary" data-rx038-action="add-price">＋ この先発品の規格を追加</button>';
    return el;
  }
  function html(){
    return '<section class="rx038Section" id="rx038Section">'+
      '<h4>同じ成分の先発品をまとめて登録</h4>'+
      '<p class="notice">先発品が2種類ある場合は、上の「薬名」と「規格別の薬価」を先発品①として使い、下に先発品②を追加します。先発品②は規格を先に入力し、薬価が未確認なら薬価欄を空欄のまま保存できます。</p>'+
      '<label>有効成分（任意）<input id="rx038Ingredient" type="text" maxlength="160" placeholder="例：アムロジピン（確認した成分名）"></label>'+
      '<div class="rx038MainBrand">先発品①：<strong id="rx038MainName"></strong>'+
      '<small>画面上部の「薬名」と「規格別の薬価」で入力</small></div>'+
      '<div id="rx038Brands"></div>'+
      '<button type="button" class="btn secondary" data-rx038-action="add-brand">＋ 別の先発品を追加</button>'+
      '<p class="notice">先発品・後発品の区分と成分は資料で確認してください。同じ成分でも剤形・規格などにより代替できるとは限りません。患者の処方内容は自動変更しません。</p>'+
      '</section>';
  }
  function install(form){
    editor=form;
    if(form.querySelector('#rx038Section'))return;
    const genericSection=form.querySelector('#rx037GenericSection');
    if(!genericSection)return;
    genericSection.insertAdjacentHTML('beforebegin',html());
    const nameInput=form.querySelector('input[name="name"]');
    nameInput?.addEventListener('input',()=>{
      const label=form.querySelector('#rx038MainName');
      if(label)label.textContent=nameInput.value||'（画面上部で薬名を入力）';
    });
    form.addEventListener('input',event=>{
      if(!building&&(event.target.id==='rx038Ingredient'||(event.target.closest('#rx038Section')&&!event.target.closest('#rx037MasterPrice'))))dirty=true;
    });
    form.addEventListener('change',event=>{
      if(!building&&(event.target.id==='rx038Ingredient'||(event.target.closest('#rx038Section')&&!event.target.closest('#rx037MasterPrice'))))dirty=true;
    });
    form.addEventListener('click',event=>{
      const button=event.target.closest('[data-rx038-action]');
      if(!button||!form.contains(button))return;
      const action=button.dataset.rx038Action;
      const list=form.querySelector('#rx038Brands');
      if(action==='add-brand'){
        if(list.children.length>=MAX_BRANDS-1)return alert('先発品の登録は合計8種類までです。');
        list.appendChild(makeBrandCard({},list.children.length));dirty=true;
      }else if(action==='remove-brand'){
        button.closest('[data-rx038-brand]')?.remove();
        for(const [i,el] of Array.from(list.children).entries()){
          const label=el.querySelector('.rx038BrandHead strong');
          if(label)label.textContent='追加の先発品 '+(i+2);
        }
        dirty=true;
      }else if(action==='add-price'){
        const rows=button.closest('[data-rx038-brand]')?.querySelector('[data-rx038-prices]');
        if(!rows)return;
        if(rows.children.length>=MAX_PRICES)return alert('1製品の規格は最大15件です。');
        rows.insertAdjacentHTML('beforeend',makePriceRow());dirty=true;
      }else if(action==='remove-price'){
        button.closest('[data-rx038-price-row]')?.remove();dirty=true;
      }
    });
  }
  function open(form,drug){
    editor=form;dirty=false;building=true;
    const stored=drug?.rx038&&typeof drug.rx038==='object'?drug.rx038:{};
    const ingredient=form.querySelector('#rx038Ingredient');
    ingredient.value=String(stored.ingredient??'');
    form.querySelector('#rx038MainName').textContent=String(drug?.['薬名']??'')||'（画面上部で薬名を入力）';
    const list=form.querySelector('#rx038Brands');
    list.replaceChildren();
    for(const [i,item] of (Array.isArray(stored.otherOriginals)?stored.otherOriginals:[]).slice(0,MAX_BRANDS-1).entries())
      list.appendChild(makeBrandCard(item,i));
    building=false;
  }
  function readPriceRows(group,title){
    const result=[];
    for(const element of group.querySelectorAll(':scope > [data-rx038-price-row]')){
      const amount=String(element.querySelector('[data-rx038-amount]')?.value??'').trim().normalize('NFKC');
      const unit=String(element.querySelector('[data-rx038-unit]')?.value??'').trim().normalize('NFKC');
      const price=String(element.querySelector('[data-rx038-price]')?.value??'').trim().normalize('NFKC');
      if(!amount&&!price)continue;
      if(!/^\d{1,6}(?:\.\d{1,3})?$/.test(amount)||Number(amount)<=0||
         !unit||unit.length>15||/[()、,，⇒=>]/.test(unit)||
         (price!==''&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(price)||Number(price)<=0||Number(price)>1000000)))
        throw Error(title+'：量・単位・薬価は数値を正しく入力してください。空欄の規格は登録されません。');
      result.push({amount,unit,price});
    }
    if(result.length>MAX_PRICES)throw Error(title+'：規格は15件までです。');
    const ids=new Set();
    for(const row of result){
      const id=String(Number(row.amount))+'|'+row.unit;
      if(ids.has(id))throw Error(title+'：量と単位が重複しています。');
      ids.add(id);
    }
    return result;
  }
  function read(form,drug,baseData,rx037){
    if(editor!==form||!form.querySelector('#rx038Section'))throw Error('先発品編集画面を確認できません。');
    const ingredient=String(form.querySelector('#rx038Ingredient').value??'').trim();
    if(ingredient.length>MAX_NAME)throw Error('有効成分名は160文字以内で入力してください。');
    const originals=[];
    const seen=new Set([normName(baseData?.['薬名'])]);
    for(const item of form.querySelectorAll('#rx038Brands > [data-rx038-brand]')){
      const name=String(item.querySelector('[data-rx038-name]')?.value??'').trim();
      const priceRows=readPriceRows(item.querySelector('[data-rx038-prices]'),'先発品 '+(name||'名称未入力'));
      if(!name&&!priceRows.length)continue;
      if(!name||name.length>MAX_NAME)throw Error('先発品の商品名を入力してください（160文字以内）。');
      const id=normName(name);
      if(seen.has(id))throw Error('同じ先発品名が重複しています。規格が違う場合は1つの商品名にまとめてください。');
      seen.add(id);originals.push({name,priceRows});
    }
    if(originals.length>=MAX_BRANDS)throw Error('先発品は合計8種類までです。');
    const generics=rx037?.value?.generics??drug?.rx037?.generics??[];
    for(const generic of Array.isArray(generics)?generics:[]){
      if(seen.has(normName(generic?.name)))throw Error('先発品と後発品候補に同じ薬名が登録されています。区分を確認してください。');
    }
    const prev=drug?.rx038&&typeof drug.rx038==='object'?drug.rx038:{};
    const next={...prev,v:1,ingredient,otherOriginals:originals};
    const changed=dirty;
    return {changed,value:next};
  }
  function summarize(card,drug){
    const data=drug?.rx038;
    if(!data||typeof data!=='object')return;
    const list=Array.isArray(data.otherOriginals)?data.otherOriginals:[];
    if(!list.length&&!data.ingredient)return;
    const el=document.createElement('div');
    el.className='rx038Summary';
    const names=list.slice(0,5).map(x=>x.name).filter(Boolean).join('、');
    el.textContent=(data.ingredient?'有効成分：'+data.ingredient+' ／ ':'')+
      (list.length?'追加の先発品：'+names+(list.length>5?' ほか'+(list.length-5)+'件':''):'');
    card.appendChild(el);
  }
  window.RX038={install,open,read,summarize};
})();
