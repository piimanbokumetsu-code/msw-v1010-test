/* UX01 (2026-11-04): restore the patient-list viewport after closing a patient.
 * UI-only, session-only; never reads, writes, exports, or stores patient records.
 */
(function(){
  'use strict';
  if(window.__MSW_UX01_SCROLL_RETURN_INSTALLED__)return;
  if(typeof window.openPatient!=='function'||typeof window.closePatient!=='function')return;
  const openOriginal=window.openPatient,closeOriginal=window.closePatient;
  let returnPosition=null;
  function listVisible(){
    return typeof screen!=='undefined'&&screen==='patients'&&
      !!document.getElementById('patientList')&&!document.getElementById('modal');
  }
  function capture(){
    const scrolling=document.scrollingElement||document.documentElement;
    return {
      top:Math.max(0,Number(window.scrollY||scrolling?.scrollTop||0)),
      horizontal:[...document.querySelectorAll('#patientList .compact-room-scroll')].map(el=>el.scrollLeft),
      query:document.getElementById('q')?.value||'',
      ward:document.getElementById('ward')?.value||'',
      saint:document.getElementById('showSanTherese')?.getAttribute('aria-pressed')||''
    };
  }
  function restore(saved){
    function apply(){
      if(!listVisible())return;
      if((document.getElementById('q')?.value||'')!==saved.query||
        (document.getElementById('ward')?.value||'')!==saved.ward||
        (document.getElementById('showSanTherese')?.getAttribute('aria-pressed')||'')!==saved.saint)return;
      const scrolling=document.scrollingElement||document.documentElement;
      const maxTop=Math.max(0,scrolling.scrollHeight-window.innerHeight);
      window.scrollTo(0,Math.min(saved.top,maxTop));
      document.querySelectorAll('#patientList .compact-room-scroll').forEach((el,i)=>{
        el.scrollLeft=saved.horizontal[i]||0;
      });
    }
    apply();
    window.requestAnimationFrame(apply);
  }
  window.openPatient=function(...args){
    returnPosition=listVisible()?capture():null;
    return openOriginal.apply(this,args);
  };
  window.closePatient=function(...args){
    const saved=returnPosition;
    returnPosition=null;
    const result=closeOriginal.apply(this,args);
    if(saved&&listVisible())restore(saved);
    return result;
  };
  window.__MSW_UX01_SCROLL_RETURN_INSTALLED__=true;
})();
