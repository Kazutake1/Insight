/* Synthetic legacy PWA, served only to the IndexedDB draft browser test. */
'use strict';

const legacyPage=new URL('legacy-pwa-fixture',self.registration.scope).href;
const cacheName='insight-fictional-legacy-pwa';

self.addEventListener('install',event=>{
  event.waitUntil((async ()=>{
    const cache=await caches.open(cacheName);
    await cache.put(legacyPage,new Response(
      '<!doctype html><title>Fictional cached legacy PWA</title>',
      {headers:{'Content-Type':'text/html'}}
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate'&&event.request.url===legacyPage){
    event.respondWith(caches.match(legacyPage,{cacheName}));
  }
});
