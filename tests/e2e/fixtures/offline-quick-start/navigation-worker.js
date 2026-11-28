'use strict';

const entrances = new Set(['/Insight/', '/Insight/Index.html']);

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || !entrances.has(url.pathname)) return;

  event.respondWith(fetch(request).catch(() => {
    const draftUrl = new URL('isolated-quick-start/', self.registration.scope);
    return Response.redirect(draftUrl.href, 302);
  }));
});
