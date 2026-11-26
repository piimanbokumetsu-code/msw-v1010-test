/* UX25: fake iPad gesture checklist, no persistent writes. */
(function(){
 'use strict';
 window.drawPatientList();
 const status=document.getElementById('fakeStatus');
 const holds=document.getElementById('holdCount');
 let holdCount=0,wasHolding=false;
 const observer=new MutationObserver(()=>{
  const isHolding=!!document.querySelector('.ux11-holding');
  if(isHolding&&!wasHolding){
   holds.textContent=String(++holdCount);
   status.textContent='✅ 0.4秒の長押しを検出。指を動かして移動先を選ぶか、その場で離して選択してね。';
  }
  wasHolding=isHolding;
 });
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 document.getElementById('resetFake')?.addEventListener('click',()=>{
   // No locally persisted data: page reload creates the original fake patient set.
   location.reload();
 });
})();
