# Offline design

The template service worker follows these rules. Keep them when you extend it.

## Caches

| Cache            | Holds                                                          | Lifetime                                  |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `shell-<version>` | `immutable` + `assets` + `prerendered` from `$app/manifest`   | One per build; `activate` deletes the old |
| `pages`          | Pages in `OFFLINE_PAGES` and their `__data.json`               | Overwritten on each online visit          |
| `content`        | User content (media, images) plus one metadata entry           | Survives deploys; only the user removes it |

- Key page copies by `origin + pathname`. SvelteKit adds query parameters to data requests, and one copy must serve them all.
- Cache a page only when `response.ok && !response.redirected`. Safari cannot answer a navigation with a redirected response.
- Wrap every `cache.put` in `.catch(() => {})` for pages. A full device must not fail a page that loaded.
- Store content with one atomic write per file. Map `QuotaExceededError` to one app error so the UI shows one message.
- `Cache.put` rejects a `206`. Store full `200` responses and slice ranges on the way out (`range.ts`).

## Strategy per route

- Shell files: cache first.
- Pages: network first, so a deploy shows at once; the copy serves offline starts.
- Content: cache first when stored, else the network unchanged (`Range` header included).
- Everything else: `return` from the `fetch` handler without `respondWith`. The allowlist is the safety net: a fault in the worker cannot break a route it does not know.
- Catch every error in the handler and fall back to `fetch(event.request)`.
- Keep `/reset` and API routes off the allowlist. Add a new top-level route name to any reserved set, or a slug matcher treats it as content.

## Updates

`install` calls `skipWaiting()` and `activate` calls `clients.claim()`, so a fixed deploy replaces a faulty worker on the next navigation. `activate` also refetches `/`, because the stored page links to the previous build's hashed files and a new worker installs only while online.

SvelteKit does not check for a new worker on client-side navigation. Add this in the root layout when deploys must arrive sooner:

```ts
import { afterNavigate } from '$app/navigation';
afterNavigate(async () => (await navigator.serviceWorker?.getRegistration())?.update());
```

### Variant: wait for the user

Use this when a reload would destroy work in progress (a timer, a form, a player).

1. Omit `skipWaiting()` from `install`.
2. Handle `message` in the worker: `if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();`.
3. Register the worker yourself with `navigator.serviceWorker.register('/service-worker.js', { type: 'module' })` and set `serviceWorker: { register: false }` under the `sveltekit()` options (see the "Manual registration" section of the docs).
4. Show a banner when `registration.waiting` exists, or a worker reaches `installed` while `navigator.serviceWorker.controller` is set. Show it only on screens where a reload is safe.
5. On tap, `registration.waiting.postMessage({ type: 'SKIP_WAITING' })`; reload once on `controllerchange` (and only if the page had a controller before).
6. Call `registration.update()` on `visibilitychange` to visible, at most once an hour.

Name every cache with an app prefix (`app-<version>`) in this variant and delete stale names by prefix.

## Client-only shell

For an app with no server data, set `export const prerender = true; export const ssr = false;` in the root `+layout.ts`. The worker then serves the prerendered `/` for every navigation that misses the cache. Set `paths: { relative: false }` in the `sveltekit()` options, or the shell's asset URLs break on nested routes such as `/run/1`.

## Stored content design

Use this when the app lets the user keep media for offline use.

- Serve a manifest of files from an API route: `{ url, size, mtime }` per file. Compare `size` and `mtime` with the metadata entry to find changed files.
- Keep one metadata entry in the content cache under a key outside the content prefix (for example `/__app__/meta.json`): the last good manifest and each stored file's version.
- Download with a small pool (3 workers), report byte progress, and resume on the `online` event and at start.
- Delete stored files that the manifest no longer lists, but never the file that plays now.
- Ask `navigator.storage.persist()` once downloads start, and show `navigator.storage.estimate()` usage. Without persistence the browser may evict the data.
- Do not store video. Eviction and quota make large files a poor fit; stream them.
- A per-item layout (one cache per favorite, named `item:<slug>`) lets the user delete one item by deleting its cache. A single `content` cache is simpler when the whole set syncs together.
- A change to a cache name or to the metadata format needs code that reads the old format, or deletes it, at store start. Devices keep old caches across deploys. The same holds for `localStorage` entries.

## Install and icons

- The manifest needs `name`, `start_url`, `scope`, `display: standalone`, a 192 px and a 512 px icon, and a maskable 512 px icon. Add a stable `id`.
- Draw the maskable icon with the art at 70 % size on a solid background. Android crops it to a circle.
- Put a content hash in each icon file name (`generate-icons.ts` does). A changed manifest is what makes Chrome on Android update an installed icon.
- iOS uses `apple-touch-icon` (180 px) and the `apple-mobile-web-app-*` tags, and reads them only when the app is added to the Home Screen. Remove the app and add it again to test a change.
- `black-translucent` status bar plus `viewport-fit=cover` lets the page draw under the status bar; pad with `env(safe-area-inset-*)`.
- Do not lock orientation in the manifest unless the app needs it.
- Chrome installs only from a secure origin. A plain-HTTP LAN host name serves the app but not the worker; use `localhost` or HTTPS.
- `vite dev` does not bundle the worker or build its file list. Test offline with `pnpm build` and `node server.js`; `scripts/verify-offline.ts` automates the check.

## Checklist for a change

- New route that must work offline: add it to `OFFLINE_PAGES` and extend `routes.test.ts`.
- New route that must not be cached: leave it off the list.
- New URL shape for stored content: build those URLs in one function, and derive the list of URLs to store from the same function.
- App name or colors: change the manifest and the `theme-color` and Apple tags together. Chrome reads the manifest; Safari reads the tags.
