/* UX09 prototype: reset pinch zoom ONLY after navigation; preserve user pinch.
 * Testing only; isolated fake app, no storage and no patient data.
 */
(function(){
 'use strict';
 if(window.__MSW_UX09_ZOOM_INSTALLED__)return;
 const meta=document.querySelector('meta[name="viewport"]');
 const initial=meta?.getAttribute('content');
 if(!meta||!initial)return;
 let prevScene=null,pulse=0;
 function scene(){
   if(document.querySelector('#app .lockwrap'))return 'lock';
   if(document.querySelector('#modal'))return 'patient:'+String(document.querySelector('#modal .tab.active')?.dataset.tab||'basic');
   if(document.querySelector('#rx036Editor:not([hidden])'))return 'drugs-editor';
   const active=document.querySelector('.bottomnav .navbtn.active');
   return 'screen:'+(active?.dataset.screen||'boot');
 }
 function scale(){const n=Number(window.visualViewport?.scale||1);return Number.isFinite(n)?n:1;}
 function report(oldScene,newScene,from){
   window.dispatchEvent(new CustomEvent('ux09-report',{detail:{fromScene:oldScene,toScene:newScene,before:from,after:scale()}}));
 }
 function zoomReset(oldScene,newScene){
   const before=scale();
   if(before<=1.02){report(oldScene,newScene,before);return;}
   const id=++pulse;
   // Temporarily request initial scale, NEVER permanently disable pinch zoom.
   // WebKit may ignore the temporary maximum-scale; user device decides.
   const temp='width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover';
   meta.setAttribute('content',temp);
   window.requestAnimationFrame(()=>{
     setTimeout(()=>{
       if(id!==pulse)return;
       meta.setAttribute('content',initial);
       setTimeout(()=>report(oldScene,newScene,before),140);
     },75);
   });
 }
 function check(){
   const next=scene();
   if(next===prevScene)return;
   const old=prevScene;prevScene=next;
   if(old!==null)zoomReset(old,next);
 }
 const ob=new MutationObserver(check);
 ob.observe(document.getElementById('app'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
 ob.observe(document.body,{childList:true});
 check();
 window.__MSW_UX09_ZOOM_INSTALLED__=true;
})();