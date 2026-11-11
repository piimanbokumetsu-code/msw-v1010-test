'use strict';
// App updates never force reload during a patient edit. A user-approved
// reload is available from the "更新可能" badge once the current sheet is closed.
window.MSW_PWA_UPDATE_PENDING=false;
(function(){
  if(!('serviceWorker' in navigator))return;
  function offerUpdate(){
    window.MSW_PWA_UPDATE_PENDING=true;
    window.dispatchEvent(new Event('msw-pwa-update-available'));
  }
  window.addEventListener('load',function(){
    navigator.serviceWorker.getRegistration(new URL('./',location.href).href).then(function(reg){
      if(!reg||reg.scope!==new URL('./',location.href).href)return;
      if(reg.waiting)offerUpdate();
      reg.update().catch(function(){});
      reg.addEventListener('updatefound',function(){
        const installing=reg.installing;
        if(!installing)return;
        installing.addEventListener('statechange',function(){
          if(installing.state==='installed'&&navigator.serviceWorker.controller)offerUpdate();
        });
      });
    }).catch(function(){});
  });
})();
