'use strict';

// SHA-256 of each exact static asset in this offline release.
const assets = new Map([
  [
    "index.html",
    "785b74b526cd2cc58252794c2d0832c1be445b7304b7773bbd49a326bdca721c"
  ],
  [
    "offline.css",
    "c17acdaff915eb5a9565ce0d0d08c9925ebe0dd957567819202dc4b7456bb668"
  ],
  [
    "vendor/chart.umd.min.js",
    "81ffafe13c37e1b25793b020d446f4d9739b949dadb7f9f79d709a0cad781c2f"
  ],
  [
    "viewer.js",
    "e0922b652851abed4d1721e59139a8356d7262ce92359b19ca348eddb76d4954"
  ],
  [
    "../insight_indexeddb_storage_v1.js",
    "3921fd162bcf8e3e05069957a682ef6a817065727a5e4897212cc409809e1bfa"
  ]
]);

const scope = new URL(self.registration.scope);
const manifest = new Map(Array.from(assets, ([path, hash]) => [new URL(path, scope).href, hash]));
const entry = new URL('index.html', scope).href;
const installKey = Array.from(assets.values()).join(':');
const cacheName = crypto.subtle.digest('SHA-256', new TextEncoder().encode(installKey))
  .then(hash => 'insight-offline-view-' + hex(hash));

function hex(hash) {
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verified(response, hash) {
  return Boolean(response?.ok && hex(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer())) === hash);
}

async function complete(cache) {
  for (const [url, hash] of manifest) {
    if (!(await verified(await cache.match(url), hash))) return false;
  }
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const name = await cacheName;
    const cache = await caches.open(name);
    if (await complete(cache)) return;
    // An installation only succeeds when all responses match. The existing worker uses its own cache.
    for (const [url, hash] of manifest) {
      const response = await fetch(url, {cache:'no-store', redirect:'error'});
      if (!(await verified(response, hash))) throw new Error('Offline asset verification failed');
      await cache.put(url, response);
    }
    if (!(await complete(cache))) throw new Error('Offline cache verification failed');
  })());
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const navigation = request.mode === 'navigate' && [scope.href, entry].includes(request.url);
  const key = navigation ? entry : request.url;
  if (!manifest.has(key)) return;
  if (!navigation && !['script','style'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(await cacheName);
    const response = await cache.match(key);
    if ((!navigation || await complete(cache)) && await verified(response, manifest.get(key)))
      return response;
    return new Response(navigation
      ? '<!doctype html><html lang="ja"><meta charset="utf-8"><title>Insight オフライン</title><p>オフライン用のファイルを確認できません。通信できる状態で通常のInsightを開いてください。</p></html>'
      : null, {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
  })());
});

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || event.data !== 'insight-offline-verify-bundle' ||
      ![scope.href, entry].includes(event.source?.url)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(await cacheName);
      port.postMessage(await complete(cache) ? 'insight-offline-bundle-ready' : 'offline-bundle-unavailable');
    } catch {
      port.postMessage('offline-bundle-unavailable');
    }
  })());
});
