'use strict';
/* RX043 compact master editor, fake patients only.
 * Previously "basic" name is the first brand's name; keep the SAME form
 * control within that brand. Move classification and the optional active
 * ingredient into the notes panel. No input is cloned, deleted or renamed
 * at the data/form level. No persistence or patient prescription changes.
 */
(function(){
  function install(editor){
    if(!editor||editor.querySelector('#rx043Marker'))return;
    const basics=editor.querySelector('#rx039Basics');
    const originals=editor.querySelector('#rx038Section');
    const generics=editor.querySelector('#rx037GenericSection');
    const notes=editor.querySelector('#rx039Notes');
    const form=editor.querySelector('#rx036Form');
    const brand=originals?.querySelector('.rx038MainBrand');
    const name=editor.querySelector('input[name="name"]')?.closest('label');
    const category=editor.querySelector('input[name="category"]')?.closest('label');
    const categoryMatches=editor.querySelector('#rx036CategoryMatches');
    const categoryHelp=basics?.querySelector(':scope > p.notice');
    const ingredientDetails=editor.querySelector('#rx041IngredientDetails');
    const effect=editor.querySelector('textarea[name="effect"]')?.closest('label');
    if(!basics||!originals||!generics||!notes||!form||!brand||!name||
       !category||!ingredientDetails||!effect)return;

    // 1. Original #1. Preserve the original 'name' input, which is used by
    // RX036 to read drug['薬名'] and by RX038 to refresh the brand label.
    name.classList.add('rx043PrimaryName');
    for(const node of name.childNodes){
      if(node.nodeType===Node.TEXT_NODE){
        node.nodeValue='先発品①の薬品名（必須）';break;
      }
    }
    brand.classList.add('rx043PrimaryBrand');
    if(brand.firstChild?.nodeType===Node.TEXT_NODE)
      brand.firstChild.nodeValue='先発品①';
    brand.appendChild(name);
    const oldSmall=brand.querySelector('small');
    if(oldSmall)oldSmall.textContent='規格・薬価はこの下で入力します。';

    // 2. Classification and optional ingredient follow the medicines as
    // part of the summary/notes area. Move existing validation, suggestion
    // list, text input and listeners unchanged.
    notes.classList.add('rx043Notes');
    notes.insertBefore(category,effect);
    if(categoryMatches)notes.insertBefore(categoryMatches,effect);
    if(categoryHelp)notes.insertBefore(categoryHelp,effect);
    notes.insertBefore(ingredientDetails,effect);

    const brandTitle=originals.querySelector(':scope > h4');
    if(brandTitle)brandTitle.textContent='① 先発品の登録';
    const genericTitle=generics.querySelector(':scope > h4');
    if(genericTitle)genericTitle.textContent='② 後発品の登録';
    const notesTitle=notes.querySelector(':scope > h4');
    if(notesTitle)notesTitle.textContent='③ 医薬品分類・薬効・補足メモ';
    const notesHelp=notes.querySelector(':scope > p.rx039Help');
    if(notesHelp)notesHelp.textContent='医薬品分類と薬効を登録します。有効成分は必要なときだけ展開できます。';

    // The 'RX042' workflow hint now belongs within the first group so that
    // the editor begins directly with "① 先発品".
    const hint=editor.querySelector('#rx042Help');
    if(hint){
      const about=originals.querySelector(':scope > p.rx039Help');
      if(about)about.insertAdjacentElement('afterend',hint);
      else originals.insertBefore(hint,originals.firstChild);
    }

    // Completely remove the now-empty basic information section.
    basics.remove();
    const marker=document.createElement('span');
    marker.id='rx043Marker';marker.hidden=true;form.appendChild(marker);

    // Avoid overwriting the dynamic title and accumulated status during
    // incremental input. This function only updates visible headings.
    const syncLabels=()=>{
      const title=editor.querySelector('#rx037GenericSection > h4');
      if(!title)return;
      const count=Array.from(editor.querySelectorAll(
        '#rx037GenericList [data-rx037-generic-name]'
      )).filter(el=>String(el.value??'').trim()).length;
      title.textContent='② 後発品の登録'+(count?'（'+count+'銘柄）':'');
    };
    // RX039's input listener updates the old "③" title, so re-label after it.
    form.addEventListener('input',syncLabels);
    form.addEventListener('change',syncLabels);
    form.addEventListener('click',event=>{
      if(event.target.closest('[data-rx037-action]'))syncLabels();
    });
  }
  function open(editor){
    // RX039.open runs first and keeps ingredient disclosure collapsed.
    if(!editor?.querySelector('#rx043Marker'))return;
    const title=editor.querySelector('#rx037GenericSection > h4');
    if(title){
      const count=Array.from(editor.querySelectorAll(
        '#rx037GenericList [data-rx037-generic-name]'
      )).filter(el=>String(el.value??'').trim()).length;
      title.textContent='② 後発品の登録'+(count?'（'+count+'銘柄）':'');
    }
  }
  window.RX043={install,open};
})();
