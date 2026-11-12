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
/* Search: tray belongs to document flow above results, never covers rooms. */
body.ux10-active.ux12-searching #ux10Tray{position:relative;inset:auto;left:auto;right:auto;bottom:auto;max-height:none;margin:12px 0 16px;width:100%;box-shadow:0 2px 8px #16383922;border:2px solid #0f766e;border-radius:10px}
body.ux10-active.ux12-searching .shell{padding-bottom:calc(94px + env(safe-area-inset-bottom,0px))}
@media print{body.ux10-active.ux12-tray-hidden .shell{padding-bottom:0!important}}`;
document.head.appendChild(style);
let queued=false,searchToken=0,hadMoveConfirm=false;
function refresh(){
  const tray=document.getElementById('ux10Tray');
  document.body.classList.toggle('ux12-searching',!!document.getElementById('q')?.value.trim());
  if(!tray||!document.body.classList.contains('ux10-active')){
    document.body.classList.remove('ux12-tray-hidden');return;
  }
  // While searching, move the tray into document flow just ABOVE the results.
  // A fixed footer otherwise covers the last room even with scroll padding.
  // When search ends, restore UX10's original fixed body-level placement.
  const searchList=document.getElementById('patientList');
  const inSearch=!!document.getElementById('q')?.value.trim()&&!!searchList;
  if(inSearch){
    const targetParent=searchList.parentNode;
    if(tray.parentNode!==targetParent||tray.nextSibling!==searchList)
      targetParent.insertBefore(tray,searchList);
  }else if(tray.parentNode!==document.body){
    document.body.appendChild(tray);
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
// With the tray in normal flow, search results can never sit behind it.
function revealSearchHit(){refresh();}
document.addEventListener('input',e=>{
  if(e.target?.id!=='q')return;
  const token=++searchToken;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===searchToken){refresh();revealSearchHit()}}));
},true);
})();
