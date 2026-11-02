import { CONTENT_CACHE } from '#lib/offline/routes.ts';
import type { RequestHandler } from './$types';

// Repairs a device with a faulty service worker. The service worker never
// handles this path (it is not on the allowlist), so the request always
// reaches the server.
//
//   /reset      unregisters the service worker and deletes the app shell and
//               the pages, but keeps the stored content.
//   /reset?all  also deletes the stored content.
//
// The app registers a fresh service worker on the next load.
export const GET: RequestHandler = ({ url }) => {
  const all = url.searchParams.has('all');

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  // Browsers that support this header clear everything before the script
  // runs. The script does the same work for browsers that do not.
  if (all) headers['Clear-Site-Data'] = '"cache", "storage"';

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset</title>
  <style>body { background: black; color: white; font-family: system-ui, sans-serif; }</style>
</head>
<body>
  <p>Resetting offline data…</p>
  <script>
    (async () => {
      const all = ${JSON.stringify(all)};
      try {
        const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
        await Promise.all(registrations.map((registration) => registration.unregister()));
        for (const name of await caches.keys()) {
          if (all || name !== ${JSON.stringify(CONTENT_CACHE)}) await caches.delete(name);
        }
      } finally {
        location.replace('/');
      }
    })();
  </script>
</body>
</html>`,
    { headers }
  );
};
