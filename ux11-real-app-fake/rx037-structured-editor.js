'use strict';
/* RX037. Fake-only structured master editor, additive to RX036. No automatic
 * substitution or patient record updates. Existing price text is preserved
 * untouched unless the operator explicitly edits the structured rows.
 * Linked generics are non-clinical, manually entered reference candidates.
 */
(function(){
  const units=['mg','μg','g','mL','%','単位','錠','包','その他'];
  const maxRows=15,maxCandidates=20,maxText=160;
  let form=null,masterDirty=false,genericDirty=false,rawDirty=false,building=false;
  const escVal=s=>esc(String(s??''));
  function unitOptions(current){
    const opts=units.includes(current)?units:[...units,current];
    return opts.filter(Boolean).map(v=>'<option value="'+escVal(v)+'"'+(v===current?' selected':'')+'>'+escVal(v)+'</option>').join('');
  }
  function newRow(data={}){
    const amount=String(data.amount??''),unit=String(data.unit??'mg'),price=String(data.price??'');
    return '<div class="rx037Row" data-rx037-price>'+
      '<label>量<input data-rx037-amount type="text" inputmode="decimal" maxlength="15" placeholder="例：5" value="'+escVal(amount)+'"></label>'+
      '<label>単位<select data-rx037-unit>'+unitOptions(unit)+'</select></label>'+
      '<label>薬価（円）<input data-rx037-price type="text" inputmode="decimal" maxlength="16" placeholder="例：12.30" value="'+escVal(price)+'"></label>'+
      '<button class="btn secondary rx037RemovePrice" type="button" data-rx037-action="remove-price" aria-label="この規格を削除">×</button>'+
      '</div>';
  }
  function newGeneric(data={}){
    const name=String(data.name??'');
    const rows=Array.isArray(data.priceRows)&&data.priceRows.length?data.priceRows:[{}];
    const count=form.querySelectorAll('[data-rx037-generic]').length+1;
    const section=document.createElement('section');section.className='rx037Generic';section.dataset.rx037Generic='';
    section.innerHTML='<div class="rx037GenericTitle"><strong>後発品候補 '+count+'</strong>'+
      '<button type="button" class="btn secondary" data-rx037-action="remove-generic">この候補を外す</button></div>'+
      '<label>後発品薬名<input data-rx037-generic-name maxlength="160" placeholder="例：架空後発薬B" value="'+escVal(name)+'"></label>'+
      '<div class="rx037GenericPrices" data-rx037-price-list>'+rows.map(newRow).join('')+'</div>'+
      '<button type="button" class="btn secondary" data-rx037-action="add-generic-price">＋ この後発品の規格を追加</button>';
    return section;
  }
  function sectionHtml(){
    return '<section class="rx037Section" id="rx037MasterPrice"><h4>規格別の薬価</h4>'+
      '<p class="notice">「量」「単位」「薬価」を1行ずつ入力。例：5｜mg｜12.30円。薬価は未確認なら空欄のまま規格を保存できます。価格未確認の規格は患者側の薬価候補には表示しません。1錠・1包など薬価の算定単位は別途確認してください。</p>'+
      '<div data-rx037-price-list id="rx037MasterPriceRows"></div>'+
      '<button type="button" class="btn secondary" data-rx037-action="add-master-price">＋ 規格を追加</button>'+
      '<p class="notice" id="rx037LegacyStatus"></p></section>'+
      '<section class="rx037Section" id="rx037GenericSection"><h4>後発品候補の登録（参考情報）</h4>'+
      '<p class="notice">薬名ごとに規格・薬価を複数登録できます。薬価が未確認なら空欄のまま保存できます。先発品からの変更可否・同等性は自動判定しません。現在の処方薬は変更されません。</p>'+
      '<div id="rx037GenericList"></div><button type="button" class="btn secondary" data-rx037-action="add-generic">＋ 後発品候補を追加</button></section>';
  }
  function findList(el){return el.closest('[data-rx037-price-list]');}
  function setDirty(el){
    if(building)return;
    if(el.closest('#rx037MasterPrice'))masterDirty=true;
    if(el.closest('#rx037GenericSection'))genericDirty=true;
    if(el.name==='price')rawDirty=true;
  }
  function onClick(event){
    const btn=event.target.closest('[data-rx037-action]');
    if(!btn||!form.contains(btn))return;
    const action=btn.dataset.rx037Action;
    if(action==='add-master-price'){
      const list=form.querySelector('#rx037MasterPriceRows');
      if(list.children.length>=maxRows)return alert('1剤の規格は最大15件です。');
      list.insertAdjacentHTML('beforeend',newRow());masterDirty=true;
    }else if(action==='add-generic'){
      const list=form.querySelector('#rx037GenericList');
      if(list.children.length>=maxCandidates)return alert('後発品候補は最大20件です。');
      list.appendChild(newGeneric());genericDirty=true;
    }else if(action==='add-generic-price'){
      const list=btn.parentElement.querySelector('[data-rx037-price-list]');
      if(list.children.length>=maxRows)return alert('1候補の規格は最大15件です。');
      list.insertAdjacentHTML('beforeend',newRow());genericDirty=true;
    }else if(action==='remove-price'){
      const row=btn.closest('[data-rx037-price]');
      const list=findList(btn);
      if(!row||!list)return;
      row.remove();
      if(list.id==='rx037MasterPriceRows')masterDirty=true;else genericDirty=true;
    }else if(action==='remove-generic'){
      btn.closest('[data-rx037-generic]')?.remove();
      genericDirty=true;
    }
  }
  function legacyRows(text){
    if(typeof medPriceChoices!=='function')return [];
    const priceChoices=medPriceChoices(text);
    const rows=[];
    for(const item of priceChoices){
      const match=String(item.strength).normalize('NFKC').match(/^(\d{1,6}(?:\.\d{1,3})?)(.+)$/);
      if(!match)return [];
      const unit=match[2];
      if(!unit||unit.length>15)return [];
      rows.push({amount:match[1],unit,price:String(item.unitPrice)});
    }
    return rows;
  }
  function normalizedRows(container,name){
    const rows=[];
    for(const el of container.querySelectorAll(':scope > [data-rx037-price]')){
      const amount=String(el.querySelector('[data-rx037-amount]')?.value??'').trim().normalize('NFKC');
      const unit=String(el.querySelector('[data-rx037-unit]')?.value??'').trim().normalize('NFKC');
      const price=String(el.querySelector('[data-rx037-price]')?.value??'').trim().normalize('NFKC');
      if(!amount&&!price)continue;
      if(!/^\d{1,6}(?:\.\d{1,3})?$/.test(amount)||Number(amount)<=0||
         !unit||unit.length>15||/[()、,，⇒=>]/.test(unit)||
         (price!==''&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(price)||Number(price)<=0||Number(price)>1000000)))
        throw Error(name+'：量・単位・薬価を正しい形式で入力してください。');
      rows.push({amount,unit,price});
    }
    if(rows.length>maxRows)throw Error(name+'：規格は15件以内にしてください。');
    const seen=new Set();
    for(const r of rows){
      const id=r.amount+'|'+r.unit;
      if(seen.has(id))throw Error(name+'：同じ量・単位が重複しています。');
      seen.add(id);
    }
    return rows;
  }
  function gatherGenerics(){
    const result=[],seen=new Set();
    for(const el of form.querySelectorAll('#rx037GenericList > [data-rx037-generic]')){
      const name=String(el.querySelector('[data-rx037-generic-name]')?.value??'').trim();
      const prices=normalizedRows(el.querySelector('[data-rx037-price-list]'),'後発品 '+(name||'名称未入力'));
      if(!name&&!prices.length)continue;
      if(!name||name.length>maxText)throw Error('後発品候補の薬名を入力してください（160字以内）。');
      const signature=name.normalize('NFKC').toLocaleLowerCase('ja');
      if(seen.has(signature))throw Error('同じ後発品名が重複しています。量・単位が異なる規格は同じ後発品の下に追加してください。');
      seen.add(signature);
      result.push({name,priceRows:prices});
    }
    if(result.length>maxCandidates)throw Error('後発品候補は20件以内にしてください。');
    return result;
  }
  function install(el){
    form=el;
    const priceField=el.querySelector('textarea[name="price"]');
    if(!priceField)return;
    const priceLabel=priceField.closest('label');
    priceLabel?.insertAdjacentHTML('beforebegin',sectionHtml());
    // Keep the original CSV text visible only on request. Never silently
    // overwrite unreadable historical price text.
    const legacy=document.createElement('details');legacy.id='rx037Legacy';
    legacy.innerHTML='<summary>旧データの薬価文字列を確認・修正する</summary>'+
      '<p class="notice">旧CSVで登録した薬価は元の文字列のまま保持します。新しい規格別入力と旧文字列を同時に変更した場合は、保存を止めて確認します。</p>';
    priceLabel?.parentElement?.insertBefore(legacy,priceLabel);
    legacy.appendChild(priceLabel);
    const preview=el.querySelector('#rx036PricePreview');
    if(preview)legacy.appendChild(preview);
    const effect=el.querySelector('textarea[name="effect"]')?.closest('label');
    if(effect)effect.insertAdjacentElement('beforebegin',el.querySelector('#rx037GenericSection'));
    el.addEventListener('click',onClick);
    el.addEventListener('input',event=>setDirty(event.target));
    el.addEventListener('change',event=>setDirty(event.target));
  }
  function open(el,drug){
    form=el;building=true;masterDirty=genericDirty=rawDirty=false;
    const stored=drug?.rx037&&typeof drug.rx037==='object'?drug.rx037:{};
    const raw=String(drug?.['薬価']??'');
    const rows=Array.isArray(stored.priceRows)?stored.priceRows:legacyRows(raw);
    const priceRoot=el.querySelector('#rx037MasterPriceRows');
    priceRoot.innerHTML=(rows?.length?rows:[{}]).map(newRow).join('');
    const list=el.querySelector('#rx037GenericList');
    list.innerHTML='';
    for(const item of Array.isArray(stored.generics)?stored.generics:[])list.appendChild(newGeneric(item));
    const note=el.querySelector('#rx037LegacyStatus');
    if(note)note.textContent=raw&&!rows?.length
      ? '旧薬価データは自動分解できませんでした。下の旧データを確認しながら1規格ずつ入力できます。'
      : raw
        ? '旧薬価データを候補として表示しています。入力を変更するまでは旧文字列のまま保存します。'
        : '規格を入力して保存できます。薬価未入力の規格は患者の薬価選択候補には表示しません。';
    const legacy=el.querySelector('#rx037Legacy');
    if(legacy)legacy.open=false;
    building=false;
  }
  function read(el,drug,data){
    if(!form||form!==el)throw Error('編集フォームが一致しません。');
    if(masterDirty&&rawDirty)throw Error('規格別の入力と旧薬価文字列を両方変更しています。どちらか一方だけを変更してください。');
    const prev=drug?.rx037&&typeof drug.rx037==='object'?drug.rx037:{};
    const next={...prev,v:1};
    let priceText;
    if(masterDirty){
      const rows=normalizedRows(el.querySelector('#rx037MasterPriceRows'),'薬価');
      next.priceRows=rows;
      if(!('originalPriceText' in prev))next.originalPriceText=String(drug?.['薬価']??'');
      // Keep compatibility with the old prescription-price choice parser.
      // Keep an unpriced strength in the structured catalog, but do not feed
      // it to the old parser which only accepts actual numeric prices.
      priceText=rows.filter(r=>r.price!=='').map(r=>r.amount+r.unit+'('+r.price+')').join('');
      if(priceText.length>650)throw Error('規格別薬価の文字数が多すぎます。');
    }else if(rawDirty&&Object.prototype.hasOwnProperty.call(prev,'priceRows')){
      delete next.priceRows;
    }
    if(genericDirty)next.generics=gatherGenerics();
    const changed=masterDirty||genericDirty||(rawDirty&&Object.prototype.hasOwnProperty.call(prev,'priceRows'));
    return {changed,priceText,value:next};
  }
  function summarize(card,drug){
    const items=Array.isArray(drug?.rx037?.generics)?drug.rx037.generics:[];
    if(!items.length)return;
    const div=document.createElement('div');div.className='rx037Summary';
    div.textContent='登録した後発品候補：'+items.map(x=>String(x.name??'')).filter(Boolean).slice(0,4).join('、')+
      (items.length>4?' ほか'+(items.length-4)+'件':'')+'（参考情報）';
    card.appendChild(div);
  }
  window.RX037={install,open,read,summarize};
})();
