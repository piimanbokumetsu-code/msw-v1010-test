'use strict';
/* RX039 fake-only UI grouping; moves the EXISTING input nodes without
 * replacing them. Keeps RX036-038 handlers, saved drugs and patient records.
 */
(function(){
 function group(id,title,help){
   const section=document.createElement('section');
   section.id=id;section.className='rx039Group';
   const h=document.createElement('h4');h.className='rx039Title';h.textContent=title;section.appendChild(h);
   const p=document.createElement('p');p.className='rx039Help';p.textContent=help;section.appendChild(p);
   return section;
 }
 function install(editor){
   if(!editor||editor.querySelector('#rx039Basics'))return;
   const form=editor.querySelector('#rx036Form');
   const name=editor.querySelector('input[name="name"]')?.closest('label');
   const category=editor.querySelector('input[name="category"]')?.closest('label');
   const suggestions=editor.querySelector('#rx036CategoryMatches');
   const ingredient=editor.querySelector('#rx038Ingredient')?.closest('label');
   const originals=editor.querySelector('#rx038Section');
   const mainPrices=editor.querySelector('#rx037MasterPrice');
   const genericSection=editor.querySelector('#rx037GenericSection');
   const effect=editor.querySelector('textarea[name="effect"]')?.closest('label');
   const legacy=editor.querySelector('#rx037Legacy');
   const buttons=editor.querySelector('.rx036Controls');
   if(!form||!name||!category||!ingredient||!originals||!mainPrices||!genericSection||!effect||!legacy||!buttons)return;
   const categoryHelp=suggestions?.nextElementSibling;
   const effectHelp=effect.nextElementSibling;
   const summary=document.createElement('div');summary.id='rx039Summary';summary.className='rx039Summary';
   summary.setAttribute('role','status');summary.setAttribute('aria-live','off');
   form.insertBefore(summary,form.firstChild);
   const basics=group('rx039Basics','① 薬剤の基本情報','薬剤名・医薬品分類を入力します。有効成分は必要な場合だけ追加できます。');
   const fields=document.createElement('div');fields.className='rx039Fields';basics.appendChild(fields);
   fields.appendChild(name);fields.appendChild(category);
   // The original RX038 ingredient input remains the SAME DOM element.
   // Hide it in a native disclosure without changing any encrypted drug data.
   const detail=document.createElement('details');
   detail.id='rx041IngredientDetails';
   detail.className='rx041IngredientDetails';
   const trigger=document.createElement('summary');
   const triggerLabel=document.createElement('span');
   triggerLabel.textContent='有効成分を入力・確認する（任意）';
   const storedBadge=document.createElement('span');
   storedBadge.id='rx041IngredientState';
   storedBadge.className='rx041IngredientState';
   trigger.appendChild(triggerLabel);
   trigger.appendChild(storedBadge);
   detail.appendChild(trigger);
   const optional=document.createElement('div');
   optional.className='rx041IngredientContent';
   const help=document.createElement('p');
   help.className='rx041IngredientHelp';
   help.textContent='分かる場合だけ入力してください。未入力でも保存できます。';
   optional.appendChild(help);
   optional.appendChild(ingredient);
   detail.appendChild(optional);
   basics.appendChild(detail);
   if(suggestions)basics.appendChild(suggestions);
   if(categoryHelp?.classList.contains('notice'))basics.appendChild(categoryHelp);
   // Keep disclosure below the normal fields and their category suggestions.
   basics.appendChild(detail);
   form.insertBefore(basics,summary.nextSibling);
   originals.classList.add('rx039Group','rx039Originals');
   const originalHeader=originals.querySelector(':scope > h4');
   if(originalHeader){originalHeader.textContent='② 先発品の登録';originalHeader.classList.add('rx039Title');}
   const originalDescription=originals.querySelector(':scope > p.notice');
   if(originalDescription){
     originalDescription.classList.add('rx039Help');
     originalDescription.textContent='先発品①の規格を入力し、別の先発品があれば下に追加。未確認の薬価は空欄でも保存できます。';
   }
   const list=originals.querySelector('#rx038Brands');
   if(list)originals.insertBefore(mainPrices,list);
   const small=originals.querySelector('.rx038MainBrand small');
   if(small)small.textContent='①で入力した薬名の規格と薬価を下に入力';
   form.insertBefore(originals,basics.nextSibling);
   genericSection.classList.add('rx039Group','rx039Generics');
   const genericHeader=genericSection.querySelector(':scope > h4');
   if(genericHeader)genericHeader.classList.add('rx039Title');
   const genericHelp=genericSection.querySelector(':scope > p.notice');
   if(genericHelp){
     genericHelp.classList.add('rx039Help');
     genericHelp.textContent='後発品の薬名と規格・薬価を銘柄ごとに登録します。薬価は未入力でも保存できます。';
   }
   form.insertBefore(genericSection,originals.nextSibling);
   const notes=group('rx039Notes','④ 薬効・補足メモ','必要な説明や補足情報を入力してください。');
   notes.appendChild(effect);
   if(effectHelp?.classList.contains('notice'))notes.appendChild(effectHelp);
   form.insertBefore(notes,genericSection.nextSibling);
   form.insertBefore(legacy,notes.nextSibling);
   legacy.classList.add('rx039Legacy');
   const footer=document.createElement('p');footer.className='rx039Footer';
   footer.textContent='保存するまで変更は確定しません。既存患者の処方薬や過去記録は変更されません。';
   form.insertBefore(footer,buttons);
   const update=()=>refresh(editor);
   form.addEventListener('input',update);
   form.addEventListener('change',update);
   form.addEventListener('click',event=>{
     if(event.target.closest('[data-rx037-action],[data-rx038-action]'))refresh(editor);
   });
   refresh(editor);
 }
 function tally(root,selector){
   let rows=0,unpriced=0;
   for(const item of root?.querySelectorAll(selector)||[]){
     const quantity=item.querySelector('[data-rx037-amount],[data-rx038-amount]');
     const price=item.querySelector('[data-rx037-price],[data-rx038-price]');
     if(!String(quantity?.value??'').trim())continue;
     rows++;
     if(!String(price?.value??'').trim())unpriced++;
   }
   return {rows,unpriced};
 }
 function refresh(editor){
   const label=editor.querySelector('#rx039Summary');
   if(!label)return;
   const value=String(editor.querySelector('#rx038Ingredient')?.value??'').trim();
   const stateLabel=editor.querySelector('#rx041IngredientState');
   if(stateLabel)stateLabel.textContent=value?'登録済み':'';
   const main=String(editor.querySelector('input[name="name"]')?.value??'').trim();
   const other=Array.from(editor.querySelectorAll('#rx038Brands [data-rx038-name]')).filter(x=>String(x.value??'').trim()).length;
   const generics=Array.from(editor.querySelectorAll('#rx037GenericList [data-rx037-generic-name]')).filter(x=>String(x.value??'').trim()).length;
   const a=tally(editor.querySelector('#rx037MasterPriceRows'),':scope > [data-rx037-price]');
   const b=tally(editor.querySelector('#rx038Brands'),'[data-rx038-price-row]');
   const c=tally(editor.querySelector('#rx037GenericList'),'[data-rx037-price]');
   label.textContent='先発品 '+((main?1:0)+other)+'銘柄 ／ 後発品 '+generics+'銘柄 ／ 規格 '+(a.rows+b.rows+c.rows)+'件 ／ 薬価未入力 '+(a.unpriced+b.unpriced+c.unpriced)+'件';
   const firstTitle=editor.querySelector('#rx037MasterPrice h4');
   if(firstTitle)firstTitle.textContent='先発品①の規格・薬価'+(a.rows?'（'+a.rows+'件）':'');
   for(const [i,card] of Array.from(editor.querySelectorAll('#rx038Brands > [data-rx038-brand]')).entries()){
     const title=card.querySelector('.rx038BrandHead strong');
     if(title)title.textContent='先発品 '+(i+2);
   }
   for(const [i,card] of Array.from(editor.querySelectorAll('#rx037GenericList > [data-rx037-generic]')).entries()){
     const title=card.querySelector('.rx037GenericTitle strong');
     if(title)title.textContent='後発品 '+(i+1);
   }
   const genericTitle=editor.querySelector('#rx037GenericSection h4');
   if(genericTitle)genericTitle.textContent='③ 後発品の登録'+(generics?'（'+generics+'銘柄）':'');
 }
 function open(editor){
   // The RX043 layout intentionally removes #rx039Basics after relocating its
   // existing controls. Update counts and ingredient disclosure regardless.
   if(!editor?.querySelector('#rx039Summary'))return;
   // Always start collapsed, including when a value was previously saved.
   const detail=editor.querySelector('#rx041IngredientDetails');
   if(detail)detail.open=false;
   refresh(editor);
 }
 window.RX039={install,open};
})();
