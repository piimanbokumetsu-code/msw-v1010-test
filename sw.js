/* Layout release 2026-10-13a: network-first, offline fallback; does not touch IndexedDB. */
const CACHE_PREFIX='msw-v1010-test-only-';
const CACHE=CACHE_PREFIX+'20261015b';
const ASSETS=['./','./index.html','./styles.css?v=preview-20261015b','./app.js?v=preview-20261015b','./manifest.webmanifest','./icon.svg','./icon-apple.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==self.location.origin||!u.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
   if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}));}
   return r;
 }).catch(async()=>{
   const previewCache=await caches.open(CACHE);
   const cached=await previewCache.match(e.request);
   if(cached)return cached;
   if(e.request.mode==='navigate')return (await previewCache.match('./index.html'))||Response.error();
   return Response.error();
 }));
});
