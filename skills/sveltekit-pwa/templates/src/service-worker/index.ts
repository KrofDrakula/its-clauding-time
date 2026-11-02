// Serves the app shell, the pages in OFFLINE_PAGES and the stored content
// offline. It handles only the routes of `routeRequest`; every other request
// goes to the network as if there were no service worker.
// `/reset` repairs a device with a faulty worker.
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self as sw } from '$app/service-worker';
import { CONTENT_CACHE, PAGES_CACHE, SHELL_PREFIX, routeRequest, type Route } from '#lib/offline/routes.ts';
import { rangeResponse } from '#lib/offline/range.ts';

const SHELL_CACHE = SHELL_PREFIX + version;
// Manifest paths are relative to the base path; `routeRequest` compares them
// with URL pathnames. Change the prefix if the app uses `paths.base`.
const shell = new Set([...immutable, ...assets, ...prerendered].map(({ path }) => `/${path}`));

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([...shell]);
      // A new version, which may fix a faulty one, starts at once.
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Old shells go; the stored content and the pages stay.
      for (const name of await caches.keys()) {
        if (name.startsWith(SHELL_PREFIX) && name !== SHELL_CACHE) await caches.delete(name);
      }
      await sw.clients.claim();
      // The stored pages link to the old shell's build files. A new worker only
      // installs while online, so this is the time to replace them.
      try {
        await networkFirst(new Request('/'));
      } catch {
        // The next online visit replaces the page instead.
      }
    })()
  );
});

sw.addEventListener('fetch', (event) => {
  const route = routeRequest(event.request, sw.location.origin, shell);
  if (!route) return;

  event.respondWith(
    handle(route, event.request).catch((error) => {
      // A fault in this file must never block the app while it is online.
      console.warn('Service worker fault; using the network', error);
      return fetch(event.request);
    })
  );
});

async function handle(route: Route, request: Request): Promise<Response> {
  switch (route.kind) {
    case 'shell':
      return (
        (await caches.match(request, { cacheName: SHELL_CACHE, ignoreVary: true })) ??
        fetch(request)
      );
    case 'page':
      return networkFirst(request);
    case 'content': {
      // One match per request: a consumed `Response` is never shared.
      const stored = await caches.match(request.url, {
        cacheName: CONTENT_CACHE,
        ignoreVary: true
      });
      // Not stored (yet): the network, unchanged, `Range` included. The
      // response is never stored here: `Cache.put` rejects a `206`.
      if (!stored) return fetch(request);
      const range = request.headers.get('range');
      return range ? rangeResponse(stored, range) : stored;
    }
  }
}

// Pages come from the server while it can be reached, so a new deploy shows at
// once. The stored copy is only for offline use.
async function networkFirst(request: Request): Promise<Response> {
  // SvelteKit adds query parameters to data requests; one copy serves them all.
  const url = new URL(request.url, sw.location.origin);
  const key = url.origin + url.pathname;

  try {
    const response = await fetch(request);
    // A redirected response cannot answer a navigation in Safari.
    if (response.ok && !response.redirected) {
      // A failed write (a full device) must not fail a page that loaded.
      await caches
        .open(PAGES_CACHE)
        .then((cache) => cache.put(key, response.clone()))
        .catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(key, { cacheName: PAGES_CACHE, ignoreVary: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return offlinePage();
    throw error;
  }
}

function offlinePage() {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title>Offline</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: black;
      color: white; font-family: system-ui, sans-serif; text-align: center; }
    a { color: white; }
  </style>
</head>
<body>
  <main>
    <h1>You are offline</h1>
    <p>This page is not stored on this device.</p>
    <p><a href="/">Go to the start page</a></p>
  </main>
</body>
</html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
