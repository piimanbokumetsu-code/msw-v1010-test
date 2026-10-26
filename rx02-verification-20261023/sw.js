/* RX02-TEST-0.43 - isolated, static-asset-only offline support.
   Never touch IndexedDB, user data, or caches from sibling MSW apps. */
'use strict';
const RX_CACHE_PREFIX='msw-rx02-verification-static-';
const RX_CACHE=RX_CACHE_PREFIX+'0.43';
const RX_SCOPE=new URL('./',self.registration.scope);
const RX_SHARED=new URL('../msw-basic-ui-d.js?v=20261022d',RX_SCOPE);
const RX_FILES=[
 new URL('./index.html',RX_SCOPE),
 new URL('./app.js?v=rx02-043',RX_SCOPE),
 new URL('./styles.css?v=rx02-043',RX_SCOPE),
 RX_SHARED
];
const RX_URLS=new Set(RX_FILES.map(x=>x.href));
function rxAllowed(request){
 if(request.method!=='GET')return false;
 const url=new URL(request.url);
 if(url.origin!==RX_SCOPE.origin)return false;
 return request.mode==='navigate'?url.pathname.startsWith(RX_SCOPE.pathname):RX_URLS.has(url.href);
}
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(RX_CACHE).then(cache=>cache.addAll(RX_FILES.map(url=>new Request(url.href,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(n=>n.startsWith(RX_CACHE_PREFIX)&&n!==RX_CACHE).map(n=>caches.delete(n)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 if(!rxAllowed(event.request))return;
 event.respondWith((async()=>{
  const cache=await caches.open(RX_CACHE);
  try{
   const response=await fetch(event.request,{cache:'no-store'});
   if(response.ok&&response.type!=='opaque'&&RX_URLS.has(new URL(event.request.url).href)){
    event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
   }
   return response;
  }catch(error){
   const direct=await cache.match(event.request);
   if(direct)return direct;
   if(event.request.mode==='navigate'){
    const offline=await cache.match(new URL('./index.html',RX_SCOPE).href);
    if(offline)return offline;
   }
   return Response.error();
  }
 })());
});
