/* Local-only real-journal OCR preflight. Static assets only; no server submissions. */
'use strict';
const VERSION='msw-realjournal-focus-v2-20261029-01';
const SCOPE='/msw-v1010-test/msw-ocr-field-focus-v2-20261029/';
const OCR='/msw-v1010-test/msw-ocr-field-focus-v2-20261029/ocr/';
const PATHS=[
 SCOPE+'index.html',SCOPE+'style.css',SCOPE+'app.js',SCOPE+'sw.js',
 OCR+'tesseract.min.js',OCR+'worker.min.js',OCR+'lang/jpn.traineddata.gz',
 ...['tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'].flatMap(x=>[OCR+'core/'+x+'.wasm',OCR+'core/'+x+'.wasm.js'])
];
const allowed=new Set(PATHS);
const fullPath=p=>self.location.origin+p;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  if(self.registration.scope!==fullPath(SCOPE))throw Error('Unapproved scope');
  const c=await caches.open(VERSION);
  // Installation fails closed unless every code/model asset is cached.
  await c.addAll(PATHS.map(p=>new Request(fullPath(p),{cache:'reload',credentials:'omit'})));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('msw-realjournal-focus-v2-')&&k!==VERSION).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 const wanted=u.pathname===SCOPE?SCOPE+'index.html':u.pathname;
 if(u.origin!==self.location.origin||event.request.method!=='GET'||!allowed.has(wanted)){
  event.respondWith(new Response('Request blocked by offline-only OCR policy',{status:403,headers:{'Content-Type':'text/plain'}}));return;
 }
 event.respondWith((async()=>{
  const c=await caches.open(VERSION);
  // Never use network fallback after installation. Also covers requests while online.
  return await c.match(fullPath(wanted)) || new Response('Offline asset missing. Do not use real journals.',{status:503});
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_STATUS')return;
 event.waitUntil((async()=>{
  const c=await caches.open(VERSION);
  let missing=[];
  for(const p of PATHS)if(!await c.match(fullPath(p)))missing.push(p);
  event.source?.postMessage({type:'CACHE_STATUS',version:VERSION,ok:missing.length===0,items:PATHS.length,missing:missing.length});
 })());
});
