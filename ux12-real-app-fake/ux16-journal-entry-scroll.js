/* UX16 (2026-11-18): When the user opens the Journal manual-admission
 * form, automatically reveal it immediately above the fixed bottom nav.
 * UI-only. No changes to patient data, storage or existing form handlers.
 */
(function(){
  'use strict';
  if(window.__MSW_UX16_JOURNAL_ENTRY_SCROLL_INSTALLED__)return;
  if(typeof window.renderJournalPreview!=='function')return;
  window.__MSW_UX16_JOURNAL_ENTRY_SCROLL_INSTALLED__=true;

  let requestedOpen=false;
  let scrollRequest=0;

  // Capture the user's intention before the original click handler redraws
  // the button and form. Do not scroll on close, save, or routine navigation.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#journalEntryToggle');
    if(!button||!document.getElementById('main')?.contains(button))return;
    if(typeof screen==='undefined'||screen!=='journal')return;
    requestedOpen=!document.querySelector('#main .journal-entry');
  },true);

  function revealForm(form){
    if(!form?.isConnected||typeof screen==='undefined'||screen!=='journal')return;
    const nav=document.querySelector('.bottomnav');
    const topbar=document.querySelector('.topbar');
    const viewport=window.visualViewport;
    const visibleTop=viewport?.offsetTop||0;
    const visibleHeight=viewport?.height||window.innerHeight;
    const navHeight=nav?.getBoundingClientRect().height||0;
    const headerHeight=topbar?.getBoundingClientRect().height||0;
    const margin=10;
    const availableTop=visibleTop+headerHeight+margin;
    const availableBottom=visibleTop+visibleHeight-navHeight-margin;
    const rect=form.getBoundingClientRect();

    if(!Number.isFinite(rect.height)||availableBottom<=availableTop)return;
    // Prefer to align the bottom of the entire form just above the nav.
    // On a small screen, start at the form heading instead of hiding it.
    const delta=rect.height<=availableBottom-availableTop
      ? rect.bottom-availableBottom
      : rect.top-availableTop;
    const scroller=document.scrollingElement||document.documentElement;
    const current=window.scrollY||scroller.scrollTop||0;
    const maxScroll=Math.max(0,document.documentElement.scrollHeight,document.body?.scrollHeight||0)-window.innerHeight;
    const destination=Math.max(0,Math.min(Math.max(0,maxScroll),current+delta));
    if(Math.abs(destination-current)>2)window.scrollTo({top:destination,behavior:'auto'});
  }

  const previous=window.renderJournalPreview;
  window.renderJournalPreview=function(...args){
    const value=previous.apply(this,args);
    if(requestedOpen){
      requestedOpen=false;
      const form=document.querySelector('#main .journal-entry');
      if(form&&typeof screen!=='undefined'&&screen==='journal'){
        const token=++scrollRequest;
        window.requestAnimationFrame(()=>{
          if(token===scrollRequest)revealForm(form);
        });
      }
    }
    return value;
  };
})();
