/* UX27 test-only regression fixture. No patient data, storage, or PIN access.
   Reproduces a DOM relocation introduced by another optional screen addon. */
(function(){
 'use strict';
 const native=window.renderPatients;
 if(typeof native!=='function')return;
 window.renderPatients=function(...args){
  const result=native.apply(this,args);
  const hero=document.querySelector('#main .hero');
  const add=hero?.querySelector('#newP');
  if(hero&&add){
   document.getElementById('ux27RelocatedTestShelf')?.remove();
   const shelf=document.createElement('div');
   shelf.id='ux27RelocatedTestShelf';
   shelf.style.cssText='padding:8px;margin:8px 0;border:2px dashed #64748b;border-radius:8px;';
   const marker=document.createElement('strong');
   marker.textContent='🧪配置移動を再現中：＋患者ボタンを別枠へ移動';
   marker.style.cssText='display:block;font-size:13px;margin-bottom:6px;';
   shelf.appendChild(marker);
   shelf.appendChild(add);
   hero.insertAdjacentElement('afterend',shelf);
  }
  return result;
 };
})();
