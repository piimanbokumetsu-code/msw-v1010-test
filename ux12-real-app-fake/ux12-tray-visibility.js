/* UX12: empty tray auto-hide, preserve transfer target, reveal matching search bed.
 * UI-only addon; never writes patient or drug data. */
(function(){
'use strict';
if(window.__MSW_UX12_INSTALLED__)return;
window.__MSW_UX12_INSTALLED__=true;
const style=document.createElement('style');
style.textContent=`body.ux12-tray-hidden #ux10Tray{display:none!important}
body.ux10-active.ux12-tray-hidden .shell{padding-bottom:calc(94px + env(safe-area-inset-bottom,0px))}
body.ux10-active:not(.ux12-tray-hidden) #patientList{scroll-padding-bottom:180px}
body.ux10-active.ux12-searching:not(.ux12-tray-hidden) .shell{padding-bottom:calc(350px + env(safe-area-inset-bottom,0px))}
@media print{body.ux10-active.ux12-tray-hidden .shell{padding-bottom:0!important}}`;
document.head.appendChild(style);
let queued=false,searchToken=0,hadMoveConfirm=false;
function refresh(){
  const tray=document.getElementById('ux10Tray');
  document.body.classList.toggle('ux12-searching',!!document.getElementById('q')?.value.trim());
  if(!tray||!document.body.classList.contains('ux10-active')){
    document.body.classList.remove('ux12-tray-hidden');return;
  }
  // UX10 refreshes the count and the cards independently. Read the patient count
  // and any currently rendered cards; after an actual redraw both must be empty.
  // UX10 clears its internal selection when opening a move confirmation,
  // but the old .ux10-selected marker can remain after 'やめる'.
  // Only clear that stale marker after the confirmation dialog closes.
  const confirmOpen=!!document.getElementById('ux10Confirm');
  if(confirmOpen)hadMoveConfirm=true;
  else if(hadMoveConfirm){
    hadMoveConfirm=false;
    document.querySelectorAll('.ux10-selected').forEach(node=>node.classList.remove('ux10-selected'));
  }
  const countText=tray.querySelector('.ux10-count')?.textContent?.trim()||'';
  const countMatch=countText.match(/^(\d+)人/);
  const cardCount=tray.querySelectorAll('.ux10-person').length;
  const occupied=(countMatch?Number(countMatch[1]):cardCount)>0||cardCount>0;
  const moving=!!document.querySelector('#ux10Ghost,#patientList .ux10-selected,.ux10-person.ux10-selected');
  const hide=!occupied&&!moving;
  document.body.classList.toggle('ux12-tray-hidden',hide);
  // Safari sometimes retains the fixed layer after a class/style recalculation.
  // Apply display directly as well, and remove it as soon as moving starts.
  if(hide)tray.style.setProperty('display','none','important');
  else tray.style.removeProperty('display');
  // Never hide existing unplaced patients behind a collapsed row.
  if(occupied&&tray.classList.contains('ux10-folded')){
    tray.querySelector('.ux10-toggle')?.click();
  }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()});}
const observer=new MutationObserver(schedule);
observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
schedule();
function revealSearchHit(){
  const q=document.getElementById('q');
  const tray=document.getElementById('ux10Tray');
  const list=document.getElementById('patientList');
  if(!q?.value.trim()||!list||!document.body.classList.contains('ux10-active'))return;
  // The app shows complete rooms, not just the matching beds. Check the LAST
  // displayed room (e.g. 207 after 201/202/205) instead of the first match.
  const rooms=[...list.querySelectorAll('.search-room-map .standard-room, .icu-map .room-block')];
  const last=rooms[rooms.length-1];
  if(!last)return;
  const trayVisible=tray&&getComputedStyle(tray).display!=='none';
  const lower=trayVisible?tray.getBoundingClientRect().top-14:window.innerHeight-94;
  const rect=last.getBoundingClientRect();
  if(rect.bottom<=lower)return;
  const scroller=document.scrollingElement||document.documentElement;
  const max=Math.max(0,scroller.scrollHeight-window.innerHeight);
  const available=Math.max(0,max-scroller.scrollTop);
  const delta=Math.min(available,Math.max(0,rect.bottom-lower+12));
  if(delta>0)window.scrollTo(0,scroller.scrollTop+delta);
}
document.addEventListener('input',e=>{
  if(e.target?.id!=='q')return;
  const token=++searchToken;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===searchToken){refresh();revealSearchHit()}}));
},true);
})();
