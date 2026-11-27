'use strict';

// The fixture server injects the SHA-256 manifest computed from the test assets.
const manifest = /* fixture-manifest */ null;
const cacheName = 'insight-quick-start-fixture-' + Object.values(manifest).join('-');

async function verified(response, expected) {
  if (!response?.ok) return false;
  const digest = await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('') === expected;
}

async function verifiedBundle(cache) {
  for (const [path, hash] of Object.entries(manifest)) {
    if (!await verified(await cache.match(path),hash)) return false;
  }
  return true;
}

self.addEventListener('install',event=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(cacheName);
    for (const [path, hash] of Object.entries(manifest)) {
      const response = await fetch(path,{cache:'no-store',redirect:'error'});
      if (!await verified(response,hash)) throw new Error('Unverified test asset');
      await cache.put(path,response);
    }
  })());
});

self.addEventListener('fetch',event=>{
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname) || url.search) return;
  const path = url.pathname.slice(scope.pathname.length) || 'index.html';
  if (!Object.hasOwn(manifest,path)) return;
  event.respondWith((async ()=>{
    const cache = await caches.open(cacheName);
    if (await verifiedBundle(cache)) return cache.match(path);
    return new Response('下書き画面のファイルを確認できません。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
