/* UX08 (2026-11-06): clear patient search after a SAVED bed transfer, and
 * restore the bed-map location viewed BEFORE searching. Other UX01 behavior
 * stays unchanged: no transfer => preserve query and scroll position.
 *
 * Volatile UI-only state; no patient storage, backup, IndexedDB or network.
 */
(function(){
  'use strict';
  if(window.__MSW_UX08_BED_SEARCH_RETURN_INSTALLED__)return;
  if(typeof window.openPatient!=='function'||typeof window.closePatient!=='function'||
     typeof window.drawPatientList!=='function')return;

  const oldOpen=window.openPatient;
  const oldClose=window.closePatient; // UX01 has already wrapped this.
  const oldDraw=window.drawPatientList;
  let beforeSearch=null;
  let opened=null;
  let drawnQuery=String(document.getElementById('q')?.value||'').trim();
  let movingBack=false;

  function listVisible(){
    return typeof screen!=='undefined'&&screen==='patients'&&
      !!document.getElementById('patientList')&&!document.getElementById('modal');
  }
  function bedKey(value){
    return String(value||'').trim().replace(/\s+/g,'')
      .replace(/[‐-‒–—―ー－]/g,'-').toUpperCase();
  }
  function roomKey(value){
    const bed=bedKey(value);
    return bed.startsWith('ICU')?bed.match(/^ICU[1-3]/)?.[0]||'':bed.match(/^\d{3}/)?.[0]||'';
  }
  function roomElements(){
    return [...document.querySelectorAll('#patientList .room-map-item')];
  }
  function roomFor(el){
    const label=el.querySelector('.room-title')?.textContent||'';
    return label.match(/ICU[1-3]|\d{3}/)?.[0]||'';
  }
  function captureListLocation(){
    const scrolling=document.scrollingElement||document.documentElement;
    const y=Math.max(0,Number(window.scrollY||scrolling?.scrollTop||0));
    const horizontal=[...document.querySelectorAll('#patientList .compact-room-scroll')]
      .map(node=>node.scrollLeft);
    const nodes=roomElements();
    // Use a visible room, not a patient name, as a stable vertical anchor.
    const focusY=Math.min(200,Math.max(110,window.innerHeight*.25));
    const inView=nodes.filter(node=>{
      const r=node.getBoundingClientRect();
      return r.bottom>65&&r.top<window.innerHeight-35;
    });
    const best=inView.sort((a,b)=>
      Math.abs(a.getBoundingClientRect().top-focusY)-
      Math.abs(b.getBoundingClientRect().top-focusY))[0];
    const r=best?.getBoundingClientRect();
    return {top:y,horizontal,room:best?roomFor(best):'',offset:r?r.top:0};
  }
  function restoreListLocation(snapshot,destination){
    function apply(){
      if(!listVisible())return;
      const q=document.getElementById('q');
      if(q?.value.trim())return; // Never jump while another search is active.
      const scrolling=document.scrollingElement||document.documentElement;
      const nodes=roomElements();
      const key=snapshot?.room||roomKey(destination);
      const matched=key?nodes.find(node=>roomFor(node)===key):null;
      let target=Number(snapshot?.top||0);
      if(matched){
        const rect=matched.getBoundingClientRect();
        // Preserve the original on-screen location of the room; when no
        // pre-search snapshot exists, show the destination near the top.
        const offset=snapshot?.room?Number(snapshot.offset||0):160;
        target=Math.max(0,window.scrollY+rect.top-offset);
      }
      const maxTop=Math.max(0,scrolling.scrollHeight-window.innerHeight);
      window.scrollTo(0,Math.min(Math.max(0,target),maxTop));
      if(snapshot?.horizontal?.length){
        document.querySelectorAll('#patientList .compact-room-scroll').forEach((el,i)=>{
          el.scrollLeft=snapshot.horizontal[i]||0;
        });
      }
    }
    apply();
    requestAnimationFrame(()=>{apply();requestAnimationFrame(apply)});
  }

  // The user may be looking at 206 when first tapping the search field.
  // Capture BEFORE iPad keyboard focus/filtered rendering changes scroll.
  document.addEventListener('focusin',event=>{
    if(event.target?.id==='q'&&listVisible()&&!String(event.target.value||'').trim()){
      beforeSearch=captureListLocation();
    }
  },true);

  window.drawPatientList=function(...args){
    const query=String(document.getElementById('q')?.value||'').trim();
    if(query&&!drawnQuery&&listVisible()&&!beforeSearch){
      // The current map is still unfiltered: capture before the old draw.
      beforeSearch=captureListLocation();
    }
    if(!query&&drawnQuery&&!movingBack)beforeSearch=null;
    const result=oldDraw.apply(this,args);
    drawnQuery=query;
    return result;
  };

  window.openPatient=function(patient,...args){
    const fromList=listVisible();
    opened=fromList&&patient?{
      id:patient.id,
      originalBed:bedKey(patient.data?.['ベッド番号']),
      searched:Boolean(String(document.getElementById('q')?.value||'').trim()),
      fallback:fromList?captureListLocation():null
    }:null;
    return oldOpen.call(this,patient,...args);
  };

  window.closePatient=function(...args){
    const patient=typeof selectedPatient!=='undefined'?selectedPatient:null;
    const valid=opened&&patient&&opened.id===patient.id;
    const transferred=valid&&opened.searched&&
      (typeof screen!=='undefined'&&screen==='patients')&&
      !patient.dischargeDate&&!patient._new&&
      bedKey(patient.data?.['ベッド番号'])!==opened.originalBed;
    const destination=transferred?patient.data?.['ベッド番号']:'';
    const snapshot=transferred?beforeSearch:null;
    opened=null;
    if(!transferred)return oldClose.apply(this,args);

    movingBack=true;
    // The app keeps its own volatile search state. Clearing the input alone
    // would cause renderPatients() to restore the stale searched query.
    patientListSearchQuery='';
    const search=document.getElementById('q');
    if(search)search.value='';
    try{
      const result=oldClose.apply(this,args); // UX01's normal close behavior.
      beforeSearch=null;
      restoreListLocation(snapshot,destination);
      return result;
    }finally{
      movingBack=false;
    }
  };

  window.__MSW_UX08_BED_SEARCH_RETURN_INSTALLED__=true;
})();
