/* UX08 v3 (2026-11-06): When a searched patient was MOVED and saved,
 * clear patient search and restore the real pre-search bed-map viewport.
 * All state is transient UI state; no patient or master data writes.
 */
(function(){
 'use strict';
 if(window.__MSW_UX08_BED_SEARCH_RETURN_INSTALLED__)return;
 if(typeof window.openPatient!=='function'||typeof window.closePatient!=='function'||
    typeof window.drawPatientList!=='function')return;
 const originalOpen=window.openPatient;
 const originalClose=window.closePatient;  // UX01 already wraps this.
 const originalDraw=window.drawPatientList;
 let lastUnfiltered=null, beforeSearch=null, opened=null;
 let lastDrawnQuery=String(document.getElementById('q')?.value||'').trim();
 let returning=false,restoreToken=0;
 const scrollRoot=()=>document.scrollingElement||document.documentElement;
 const scrollTop=()=>Math.max(0,Number(scrollRoot()?.scrollTop||window.scrollY||0));
 const normalizeBed=bed=>String(bed||'').trim().toUpperCase().replace(/\s+/g,'')
   .replace(/[‐-‒–—―ー－]/g,'-');
 const roomKey=bed=>normalizeBed(bed)
   .match(/^(ICU[1-3]|\d{3})(?:-|$)/)?.[1]||'';
 const roomName=node=>node.querySelector('.room-title')?.textContent?.trim()
   .match(/ICU[1-3]|\d{3}/)?.[0]||'';
 function listVisible(){
   return typeof screen!=='undefined'&&screen==='patients'&&
    !!document.getElementById('patientList')&&!document.getElementById('modal');
 }
 function isUnfiltered(){return listVisible()&&!String(document.getElementById('q')?.value||'').trim();}
 function capture(){
   const viewport=window.innerHeight;
   const offsets=Object.create(null);
   document.querySelectorAll('#patientList .room-map-item, #patientList .icu-map .room-block').forEach(node=>{
     const key=roomName(node),rect=node.getBoundingClientRect();
     if(key&&rect.bottom>0&&rect.top<viewport)offsets[key]=rect.top;
   });
   return {top:scrollTop(),offsets,
     horizontal:[...document.querySelectorAll('#patientList .compact-room-scroll')].map(n=>n.scrollLeft)};
 }
 function rememberUnfiltered(){
   if(isUnfiltered()&&!returning&&document.activeElement?.id!=='q')
     lastUnfiltered=capture();
 }
 // Cache a settled bed-map location while the user scrolls. iPad may move the
 // page to reveal the input *before* focus events, so never rely solely on focus.
 document.addEventListener('scroll',rememberUnfiltered,{capture:true,passive:true});
 // Do not auto-scroll again if the user resumes touching/scrolling the page.
 ['pointerdown','touchstart','wheel','keydown'].forEach(type=>
   document.addEventListener(type,()=>{restoreToken++;},{capture:true,passive:true}));
 document.addEventListener('touchend',rememberUnfiltered,{capture:true,passive:true});
 function rememberBeforeTyping(e){
   if(e.target?.id!=='q'||!isUnfiltered()||beforeSearch)return;
   beforeSearch=lastUnfiltered||capture();
 }
 document.addEventListener('pointerdown',rememberBeforeTyping,true);
 document.addEventListener('touchstart',rememberBeforeTyping,{capture:true,passive:true});
 document.addEventListener('focusin',rememberBeforeTyping,true);
 document.addEventListener('focusout',e=>{
   if(e.target?.id==='q'&&!String(e.target.value||'').trim()&&!lastDrawnQuery)
     beforeSearch=null;
 },true);
 window.drawPatientList=function(...args){
   const query=String(document.getElementById('q')?.value||'').trim();
   if(query&&!lastDrawnQuery&&!beforeSearch&&listVisible())
     beforeSearch=lastUnfiltered||capture();
   if(!query&&lastDrawnQuery&&!returning)beforeSearch=null;
   const result=originalDraw.apply(this,args);
   lastDrawnQuery=query;
   if(!query&&!returning&&listVisible())requestAnimationFrame(rememberUnfiltered);
   return result;
 };
 window.openPatient=function(patient,...args){
   const fromList=listVisible();
   opened=fromList&&patient?{
     id:patient.id,
     bed:normalizeBed(patient.data?.['ベッド番号']),
     searched:!!String(document.getElementById('q')?.value||'').trim()
   }:null;
   return originalOpen.call(this,patient,...args);
 };
 function restore(snapshot,destination){
   const token=++restoreToken;
   function apply(){
     if(token!==restoreToken||!isUnfiltered())return;
     const offsets=snapshot?.offsets||{};
     const rooms=[...document.querySelectorAll('#patientList .room-map-item, #patientList .icu-map .room-block')];
     const destinationRoom=roomKey(destination);
     // Prefer exact on-screen offset of the DESTINATION room if it was visible
     // before searching. This avoids accidentally anchoring adjacent room 205.
     let anchor='',offset=0;
     if(destinationRoom&&Number.isFinite(offsets[destinationRoom])){
       anchor=destinationRoom;offset=offsets[destinationRoom];
     }else{
       for(const key of Object.keys(offsets)){
         if(rooms.some(node=>roomName(node)===key)){
           anchor=key;offset=offsets[key];break;
         }
       }
     }
     let target=Number(snapshot?.top);
     if(anchor){
       const found=rooms.find(node=>roomName(node)===anchor);
       if(found)target=scrollTop()+found.getBoundingClientRect().top-offset;
     }
     if(!Number.isFinite(target)){
       // No reliable saved position? Show the new bed rather than page top.
       const found=rooms.find(node=>roomName(node)===destinationRoom);
       target=found?scrollTop()+found.getBoundingClientRect().top-
         Math.max(100,window.innerHeight*.25):scrollTop();
     }
     const scrolling=scrollRoot();
     const max=Math.max(0,scrolling.scrollHeight-window.innerHeight);
     const next=Math.max(0,Math.min(target,max));
     scrolling.scrollTop=next;
     window.scrollTo(0,next);
     if(snapshot?.horizontal?.length){
       document.querySelectorAll('#patientList .compact-room-scroll').forEach((el,i)=>{
         el.scrollLeft=snapshot.horizontal[i]||0;
       });
     }
   }
   apply();
   requestAnimationFrame(()=>{apply();requestAnimationFrame(apply)});
   // UIKit can restore the scroll position when the keyboard disappears after
   // the DOM has been rendered. Re-apply only if still on the same list.
   [120,360,700].forEach(ms=>setTimeout(apply,ms));
 }
 window.closePatient=function(...args){
   const p=typeof selectedPatient!=='undefined'?selectedPatient:null;
   const transfer=opened&&p&&opened.id===p.id&&opened.searched&&
     typeof screen!=='undefined'&&screen==='patients'&&
     !p.dischargeDate&&!p._new&&
     opened.bed!==normalizeBed(p.data?.['ベッド番号']);
   const dest=transfer?p.data?.['ベッド番号']:'';
   const snapshot=transfer?(beforeSearch||lastUnfiltered):null;
   opened=null;
   if(!transfer)return originalClose.apply(this,args);
   returning=true;
   // Reset both user-visible and app-internal query before render().
   patientListSearchQuery='';
   const q=document.getElementById('q');if(q)q.value='';
   try{
     const result=originalClose.apply(this,args);
     beforeSearch=null;
     restore(snapshot,dest);
     return result;
   }finally{returning=false;}
 };
 window.__MSW_UX08_BED_SEARCH_RETURN_INSTALLED__=true;
})();
