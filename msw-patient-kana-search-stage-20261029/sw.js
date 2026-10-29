'use strict';
// Separate scope and static-only caches: never cache patient records.
const PREFIX='msw-kana-search-stage-';
const CACHE=PREFIX+'20261029-02';
const RESOURCES=['./','./index.html','./app.js?v=layout02','./styles.css?v=layout02','./rx035-addon.js','./rx036-master-editor.js','./rx037-structured-editor.js','./rx038-multiple-originals.js','./rx039-layout.js','./rx042-five-line-list.js','./rx043-compact-editor.js','./rx045-patient-brand-search.js','./rx046-strength-sort.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(RESOURCES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url),allowed=new Set(RESOURCES.map(r=>new URL(r,self.registration.scope).href));
 if(u.origin!==self.location.origin||!allowed.has(u.href))return;
 e.respondWith(fetch(e.request).then(r=>{if(!r.ok)throw Error('asset fetch failed');const cp=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,cp)));return r;}).catch(()=>caches.match(e.request)));
});
