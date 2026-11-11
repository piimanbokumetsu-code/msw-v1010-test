/* UX05: Operator review status for DRUG MASTER ONLY.
 * The status is not an automatic validation of drug prices or substitution.
 * Uses the existing encrypted master save, not direct or remote writes.
 */
(function(){
 'use strict';
 if(window.__MSW_UX05_DRUG_REVIEW_INSTALLED__)return;
 if(typeof renderDrugs!=='function'||typeof drawDrugs!=='function')return;
 const oldRender=renderDrugs,oldDraw=drawDrugs;
 function isDone(drug){return drug?.ux05ReviewDone===true;}
 function ensureStyle(){
  if(document.getElementById('ux05ReviewStyle'))return;
  const s=document.createElement('style');s.id='ux05ReviewStyle';
  s.textContent='.drug-list article.drug.ux05Pending{background:#fff5e6!important;border:2px solid #e9ae5a!important;}'+
   '.ux05Pill{display:inline-flex;font-weight:700;font-size:12px;border-radius:999px;'+
   'padding:3px 9px;border:1px solid #d9a367;background:#fff0d5;color:#85501b;margin:3px 0 6px;}'+
   '.ux05Pill.done{border-color:#91abab;background:#f0f5f4;color:#35504d;}'+
   '.ux05Progress{padding:12px 14px;border:1px solid #d5e4e2;border-radius:12px;'+
   'background:#f7fbfa;margin:10px 0 14px;line-height:1.6;}'+
   '.ux05ReviewControl{padding:12px;border:1px solid #e0d8bd;background:#fffaf0;'+
   'border-radius:10px;margin:14px 0;}'+
   '.ux05ReviewControl label{display:flex;align-items:center;gap:10px;font-weight:700;}'+
   '.ux05ReviewControl input{height:22px;width:22px;flex:none;}';
  document.head.appendChild(s);
 }
 function visible(){
  const q=(document.querySelector('#dq')?.value||'').toLowerCase().trim();
  return (state?.drugs||[]).filter(d=>!q||rx038MasterSearchText(d).includes(q)).slice(0,100);
 }
 function decorate(){
  if(screen!=='drugs'||!state)return;
  const all=Array.isArray(state.drugs)?state.drugs:[];
  const reviewed=all.filter(isDone).length;
  const actions=document.querySelector('#main .rx036Actions');
  const toolbar=document.querySelector('#main .toolbar');
  let panel=document.getElementById('ux05Progress');
  if(!panel){
   const anchor=actions||toolbar;
   if(anchor){panel=document.createElement('section');panel.id='ux05Progress';
    panel.className='ux05Progress';anchor.insertAdjacentElement('afterend',panel);}
  }
  if(panel){
   panel.innerHTML='<strong>薬情の確認進捗</strong><div>全 <b>'+all.length+'</b> 件 ／ 確認済 <b>'+
    reviewed+'</b> 件 ／ 未確認 <b>'+(all.length-reviewed)+'</b> 件</div>'+
    '<small>薄いオレンジは要確認。編集画面で確認済みにチェックして保存すると通常色に戻ります。'+
    'この表示は操作者の確認記録であり、最新薬価・後発品情報の正確性を自動保証するものではありません。</small>';
  }
  const cards=Array.from(document.querySelectorAll('#drugList .drug-list article.drug'));
  const rows=visible();
  if(cards.length!==rows.length)return;
  cards.forEach((card,i)=>{
   const done=isDone(rows[i]);
   card.classList.toggle('ux05Pending',!done);
   card.querySelector('.ux05Pill')?.remove();
   const tag=document.createElement('span');
   tag.className='ux05Pill'+(done?' done':'');
   tag.textContent=done?'確認済み':'要確認';
   card.insertBefore(tag,card.firstChild);
  });
 }
 function install(form){
  if(!form||form.querySelector('#ux05ReviewDone'))return;
  ensureStyle();
  const row=document.createElement('div');
  row.className='ux05ReviewControl';row.id='ux05ReviewControl';
  row.innerHTML='<label><input type="checkbox" id="ux05ReviewDone">'+
    '<span>この薬剤の薬価・後発品等を確認済みにする</span></label>'+
    '<p class="notice" id="ux05ReviewHint">確認が終わったときだけチェックしてください。</p>';
  const actions=form.querySelector('.rx036Controls');
  if(actions)actions.insertAdjacentElement('beforebegin',row);
  else form.querySelector('#rx036Form')?.appendChild(row);
  const check=row.querySelector('#ux05ReviewDone');
  const reset=e=>{
   if(!check.checked||e.target===check||!form.contains(e.target))return;
   if(e.type==='click'){
    const btn=e.target.closest('button');
    if(!btn||btn.matches('#rx036Save,#rx036Cancel,#rx036Delete'))return;
    if(btn.closest('#rx036CategoryMatches'))return;
   }else if(!e.target.matches('input,select,textarea'))return;
   check.checked=false;
   const hint=form.querySelector('#ux05ReviewHint');
   if(hint)hint.textContent='薬情を変更したため未確認に戻しました。内容を確認し終えたら再度チェックしてください。';
  };
  form.addEventListener('input',reset);
  form.addEventListener('change',reset);
  form.addEventListener('click',reset);
 }
 function open(form,drug){
  const check=form?.querySelector('#ux05ReviewDone');
  if(!check)return;
  check.checked=isDone(drug);
  const hint=form.querySelector('#ux05ReviewHint');
  if(hint)hint.textContent=isDone(drug)
    ?'確認済みです。内容を編集したら再度チェックしてから保存してください。'
    :'確認が終わったときだけチェックしてください。変更しなかった薬も確認済みにできます。';
 }
 function changed(form,oldDrug){
  const check=form?.querySelector('#ux05ReviewDone');
  return !!check&&check.checked!==isDone(oldDrug);
 }
 function write(form,drug){
  const check=form?.querySelector('#ux05ReviewDone');
  if(!check)throw new Error('薬情の確認状態を読み取れません。編集を開き直してください。');
  drug.ux05ReviewDone=check.checked===true;
  drug.ux05ReviewedAt=check.checked?new Date().toISOString():null;
 }
 window.RX05=Object.freeze({install,open,changed,write});
 drawDrugs=function(...args){const value=oldDraw.apply(this,args);decorate();return value;};
 renderDrugs=function(...args){const value=oldRender.apply(this,args);decorate();return value;};
 ensureStyle();
 window.__MSW_UX05_DRUG_REVIEW_INSTALLED__=true;
})();