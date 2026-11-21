/* UX21 faithful-layout fake PWA test. No storage, authentication, patient calls or network access. */
(function(){
'use strict';
const meta=document.querySelector('meta[name="viewport"]');
const initial=meta?meta.content:'width=device-width,initial-scale=1,viewport-fit=cover';
const lock=document.getElementById('lockScreen');
const patients=document.getElementById('patientScreen');
const badge=document.getElementById('ux21State');
const sizes=document.getElementById('ux21Numbers');
let orientation=matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
let resizeTimer=0,pulse=0,last='起動';
function measure(){
 const vv=window.visualViewport;
 return {scale:Number(vv?.scale||1),layout:document.documentElement.clientWidth,
 overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
 visual:Number(vv?.width||innerWidth)};
}
function render(){
 const d=measure();
 const mode=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true?'PWA':'Safari';
 badge.textContent=d.scale>1.06||d.overflow>3?'表示を目視確認してください':'倍率・横幅：正常範囲';
 sizes.textContent=mode+'／'+(orientation==='landscape'?'横':'縦')+'／倍率 '+d.scale.toFixed(2)+'／横幅 '+d.layout+'／はみ出し '+d.overflow+'px ／'+last;
}
function stabilize(reason){
 last=reason;
 const d=measure();
 if(!meta||d.scale<=1.06){render();return}
 const id=++pulse;
 // Temporary viewport re-evaluation for an unexpected zoom on boot or physical rotation.
 // Always restore the original meta tag, keeping normal user-initiated pinch zoom available.
 meta.content=initial+',minimum-scale=1,maximum-scale=1';
 setTimeout(function(){if(id!==pulse)return;meta.content=initial;requestAnimationFrame(render)},130);
}
function orientationChanged(){
 const curr=matchMedia('(orientation: landscape)').matches?'landscape':'portrait';
 if(curr!==orientation){
   orientation=curr;
   setTimeout(()=>stabilize('回転後チェック'),280);
   setTimeout(()=>stabilize('回転後再チェック'),830);
 }else render();
}
document.getElementById('authForm').addEventListener('submit',function(e){
 e.preventDefault();lock.style.display='none';patients.hidden=false;
 window.scrollTo(0,0);last='架空患者一覧へ';render();
});
document.getElementById('backLock').addEventListener('click',function(){
 patients.hidden=true;lock.style.display='';window.scrollTo(0,0);last='架空PIN画面へ';render();
});
window.addEventListener('orientationchange',orientationChanged,{passive:true});
window.addEventListener('resize',function(){clearTimeout(resizeTimer);resizeTimer=setTimeout(orientationChanged,110)},{passive:true});
window.visualViewport?.addEventListener('resize',render,{passive:true});
setTimeout(()=>stabilize('起動時チェック'),300);
render();
})();