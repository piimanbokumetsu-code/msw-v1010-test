/* UX21 FAKE-ONLY OFFLINE TEST WORKER.
   Scoped to this folder; no data import, no app DB, no patient information.
   Never clear caches outside UX21-specific prefix. */
'use strict';
const PREFIX='ux21-fake-offline-';
const CACHE=PREFIX+'20261121-v2';
const ASSETS=[
  './','./index.html','./test.css','./test.js','./offline-register.js',
  './real-layout.html','./real-layout-fix.css','./real-layout.js',
  './production-styles.css','./manifest.webmanifest'
];
const ALLOWED=new Set(ASSETS.map(x=>new URL(x,self.registration.scope).href));
const HOME=new URL('./index.html',self.registration.scope).href;
const ROOT=new URL('./',self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin||!ALLOWED.has(url.href))return;
  if(e.request.mode==='navigate'&&url.href!==HOME&&url.href!==ROOT&&url.href!==new URL('./real-layout.html',self.registration.scope).href)return;
  e.respondWith(fetch(e.request,{cache:'no-store',redirect:'error'}).then(response=>{
    if(!response.ok||response.type!=='basic'||response.redirected||new URL(response.url).origin!==self.location.origin)throw Error('unexpected response');
    const copy=response.clone();
    e.waitUntil(caches.open(CACHE).then(cache=>cache.put(e.request,copy)).catch(()=>{}));
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE);
    const stored=await cache.match(e.request);
    if(stored)return stored;
    if(e.request.mode==='navigate')return await cache.match(HOME)||Response.error();
    return Response.error();
  }));
});
