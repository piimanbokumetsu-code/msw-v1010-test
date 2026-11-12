'use strict';
/* RX045 fictional-patient-only linkage probe.
 * Search each explicitly recorded originator and generic name separately.
 * The named product, NOT the grouped master record, is copied into an
 * encrypted patient drug snapshot only following an explicit confirmation.
 * Do not auto-substitute or use another brand's price. Old rows untouched.
 */
(function(){
  if(typeof drawPatientDrugResults!=='function'||typeof medSnapshot!=='function')return;
  const oldDraw=drawPatientDrugResults;
  const name=s=>String(s??'').trim();
  const norm=s=>name(s).normalize('NFKC').toLocaleLowerCase('ja');
  const numeral=n=>n>=1&&n<=20?String.fromCodePoint(0x245f+n):String(n);
  function brandOf(drug,kind,brandIndex){
    if(!drug||!Number.isSafeInteger(brandIndex)||brandIndex<0)return null;
    if(kind==='original'&&brandIndex===0)
      return {name:name(drug['薬名']),rows:drug?.rx037?.priceRows,raw:name(drug['薬価']),label:'先発品①'};
    if(kind==='original'&&brandIndex>0){
      const row=Array.isArray(drug?.rx038?.otherOriginals)?drug.rx038.otherOriginals[brandIndex-1]:null;
      return row?{name:name(row.name),rows:row.priceRows,raw:'',label:'先発品'+numeral(brandIndex+1)}:null;
    }
    if(kind==='generic'){
      const row=Array.isArray(drug?.rx037?.generics)?drug.rx037.generics[brandIndex]:null;
      return row?{name:name(row.name),rows:row.priceRows,raw:'',label:'後発品'+numeral(brandIndex+1)}:null;
    }
    return null;
  }
  function selectionList(drug,index){
    if(!drug||typeof drug!=='object')return [];
    const out=[];
    const record=(kind,brandIndex)=>{
      const item=brandOf(drug,kind,brandIndex);
      if(item?.name)out.push({index,kind,brandIndex,name:item.name,label:item.label});
    };
    record('original',0);
    const originals=Array.isArray(drug.rx038?.otherOriginals)?drug.rx038.otherOriginals:[];
    for(let i=0;i<Math.min(originals.length,7);i++)record('original',i+1);
    const generics=Array.isArray(drug.rx037?.generics)?drug.rx037.generics:[];
    for(let i=0;i<Math.min(generics.length,20);i++)record('generic',i);
    return out;
  }
  function candidates(drugs,search,limit=60){
    const query=norm(search);
    if(!query||!Array.isArray(drugs))return [];
    const direct=[],background=[];
    for(let index=0;index<drugs.length;index++){
      const master=drugs[index];
      const suggestions=selectionList(master,index);
      // Group-category search returns only the primary brand; never
      // suggest additional products merely because a classification matched.
      const groupMatch=['医薬品分類','薬効'].some(field=>norm(master?.[field]).includes(query));
      for(const candidate of suggestions){
        if(norm(candidate.name).includes(query))direct.push(candidate);
        else if(groupMatch&&candidate.kind==='original'&&candidate.brandIndex===0)background.push(candidate);
      }
    }
    return [...direct,...background].slice(0,Math.max(0,Math.min(60,limit)));
  }
  function priceRowsText(rows){
    if(!Array.isArray(rows))return null; // null => use primary legacy
    const out=[];
    for(const row of rows){
      const amount=name(row?.amount).normalize('NFKC');
      const unit=name(row?.unit).normalize('NFKC');
      const price=name(row?.price).normalize('NFKC');
      if(!amount||!unit)continue;
      if(!/^\d{1,6}(?:\.\d{1,3})?$/.test(amount)||Number(amount)<=0||
         !unit||unit.length>15||/[()、,，⇒=>]/.test(unit))continue;
      if(price&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(price)||
                  Number(price)<=0||Number(price)>1000000))continue;
      out.push({strength:amount+unit,price});
    }
    return out.slice(0,15);
  }
  function pricesFor(drug,kind,brandIndex){
    const brand=brandOf(drug,kind,brandIndex);
    if(!brand)return null;
    const rows=priceRowsText(window.RX046?.sortedRows?.(brand.rows)??brand.rows);
    if(rows!==null){
      // Values not entered remain unknown. Never borrow prices from another
      // original/generic. Only confirmed positive values form suggestions.
      const list=rows.filter(r=>r.price).map(r=>r.strength+'('+r.price+')').join('');
      if(list.length>650)return {text:'',preview:'規格が多いため薬価候補を手動確認'};
      return {text:list,preview:rows.length
        ?rows.map(r=>r.strength+'：'+(r.price?r.price+'円':'薬価未入力')).join(' ／ ')
        :'規格・薬価未登録'};
    }
    if(kind==='original'&&brandIndex===0&&brand.raw){
      const conservative=typeof medPriceChoices==='function'?medPriceChoices(brand.raw):[];
      return {text:brand.raw,preview:conservative.length?
        conservative.map(r=>name(r.strength)+'：'+name(r.unitPrice)+'円').join(' ／ '):
        '旧薬価データ（規格・価格は手動確認）'};
    }
    return {text:'',preview:'規格・薬価未登録'};
  }
  function resolve(drugs,identity){
    if(!Array.isArray(drugs)||!identity||typeof identity!=='object')return null;
    const index=identity.index,kind=identity.kind,brandIndex=identity.brandIndex;
    if(!Number.isSafeInteger(index)||index<0||index>=drugs.length)return null;
    if(!['original','generic'].includes(kind)||!Number.isSafeInteger(brandIndex)||brandIndex<0)return null;
    const master=drugs[index],picked=brandOf(master,kind,brandIndex);
    if(!picked?.name)return null;
    const item=medSnapshot(master),prices=pricesFor(master,kind,brandIndex);
    if(!prices)return null;
    item['薬名']=picked.name;
    item['薬価']=prices.text;
    return {
      drug:item,
      label:picked.label,
      origin:{type:'rx045-manual-brand',label:picked.label,masterName:name(master['薬名']),selectedName:picked.name}
    };
  }
  drawPatientDrugResults=function(){
    const input=document.querySelector('#patientDrugQuery');
    const host=document.querySelector('#patientDrugResults');
    if(!input||!host){oldDraw();return;}
    const query=name(input.value);
    if(!query){
      host.innerHTML='<p class="notice">先発品名・後発品名で検索。薬剤マスターに登録済みの銘柄ごとに候補を表示します。</p>';
      return;
    }
    const found=candidates(state?.drugs||[],query);
    if(!found.length){
      host.innerHTML='<p class="empty">一致する銘柄はありません。薬情マスターの登録を確認してください。</p>';
      return;
    }
    host.innerHTML='<p class="notice rx045Safety">処方の薬品名と一致する銘柄を選んでください。別銘柄への変更可否は判定せず、薬価・数量は自動確定しません。</p>'+
      found.map(c=>{
        const master=state.drugs[c.index],price=pricesFor(master,c.kind,c.brandIndex);
        return '<div class="patient-med-hit rx045Candidate"><div><strong>'+esc(c.name)+'</strong>'+
          '<div class="rx045Badge">'+esc(c.label)+'・薬情マスター候補</div>'+
          '<div class="rx045Preview">'+esc(price?.preview||'薬価未登録')+'</div>'+
          '<div class="patient-med-preview">'+esc(String(master?.['医薬品分類']||'分類未登録'))+'</div></div>'+
          '<button class="btn patient-med-add rx045Choose" type="button" data-index="'+c.index+
            '" data-kind="'+c.kind+'" data-brand="'+c.brandIndex+'">この銘柄を追加</button></div>';
      }).join('');
    host.querySelectorAll('.rx045Choose').forEach(btn=>{
      btn.onclick=()=>void changePatientMedication('add-brand',{
        index:Number(btn.dataset.index),kind:btn.dataset.kind,brandIndex:Number(btn.dataset.brand)
      });
    });
  };
  window.RX045={candidates,resolve,pricesFor,selectionList};
})();
