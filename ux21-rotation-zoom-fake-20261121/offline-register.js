/* UX21 fake-only offline readiness indicator. Does not access patient data. */
(function(){
'use strict';
if(!('serviceWorker' in navigator))return;
function status(msg){
  var target=document.getElementById('testNotice');
  if(!target)return;
  var tag=document.getElementById('ux21OfflineState');
  if(!tag){tag=document.createElement('span');tag.id='ux21OfflineState';tag.style.cssText='display:inline-block;padding:4px 7px;margin-left:7px;border:1px solid #768c74;border-radius:7px;font-size:12px;';target.appendChild(tag)}
  tag.textContent=msg;
}
window.addEventListener('load',function(){
  status('オフライン準備を確認中');
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(function(reg){
    reg.update().catch(function(){});
    navigator.serviceWorker.ready.then(function(ready){
      if(ready.scope===new URL('./',location.href).href && ready.active){
        status('オフライン準備完了');
      }else status('オフライン状態は未確認');
    }).catch(function(){status('オフライン状態は未確認')});
  }).catch(function(){status('オフライン状態は未確認')});
},{once:true});
})();
