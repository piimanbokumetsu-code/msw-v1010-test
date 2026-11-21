/* UX21 fake-only home-screen PWA offline experiment, no storage access. */
(function(){
'use strict';
if(!('serviceWorker' in navigator))return;
window.addEventListener('load',function(){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(function(reg){
    reg.update().catch(function(){});
  }).catch(function(){});
},{once:true});
})();
