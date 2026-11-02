// Decides which requests the service worker answers, and how. This module is
// shared by the service worker and the page, so it must not use the DOM.

/** Stored user content (media, images); survives a deploy. `/reset` keeps it. */
export const CONTENT_CACHE = 'content';
/** The pages listed in `OFFLINE_PAGES`, so the app can start offline. */
export const PAGES_CACHE = 'pages';
/** One shell cache per build: `shell-<version>`. */
export const SHELL_PREFIX = 'shell-';

/**
 * Pages that open offline. Add every route that must work offline. A page is
 * also stored under `<path>/__data.json`, the data SvelteKit loads on a
 * client-side navigation.
 */
export const OFFLINE_PAGES = ['/'];

/**
 * URL prefixes whose files the content cache serves, for example `/files/`.
 * Requests under them may carry a `Range` header, which the worker answers
 * from the stored file.
 */
export const CONTENT_PREFIXES: string[] = [];

export type Route =
  // A build or `static/` file: cache first, from the shell cache.
  | { kind: 'shell' }
  // A page in `OFFLINE_PAGES`: network first, with a copy in the pages cache.
  | { kind: 'page' }
  // A file under a content prefix: from the content cache if stored, else the network.
  | { kind: 'content' };

/** The parts of a `Request` the decision reads. */
export type RequestLike = Pick<Request, 'method' | 'url' | 'headers'>;

/**
 * Returns `null` for every request the service worker must leave to the
 * network, as if there were no worker. Only an explicit allowlist is handled,
 * so a fault in the worker cannot break a route it does not know. `/reset` and
 * any API route stay off the list and always reach the server.
 */
export function routeRequest(
  request: RequestLike,
  origin: string,
  shell: ReadonlySet<string>
): Route | null {
  if (request.method !== 'GET') return null;

  const url = new URL(request.url);
  if (url.origin !== origin) return null;

  // Media elements ask for ranges; the worker slices them from the stored file.
  if (CONTENT_PREFIXES.some((prefix) => url.pathname.startsWith(prefix) && url.pathname !== prefix)) {
    return { kind: 'content' };
  }

  // Only media requests carry a range; anything else with one goes to the server.
  if (request.headers.has('range')) return null;

  if (shell.has(url.pathname)) return { kind: 'shell' };
  if (OFFLINE_PAGES.some((page) => url.pathname === page || url.pathname === dataPath(page))) {
    return { kind: 'page' };
  }

  return null;
}

function dataPath(page: string) {
  return page.endsWith('/') ? `${page}__data.json` : `${page}/__data.json`;
}
