import { describe, expect, it } from 'vitest';
import { routeRequest } from './routes.ts';

const origin = 'https://app.test';
const shell = new Set(['/_app/immutable/entry/start.js', '/manifest.webmanifest']);
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => ({
  method,
  url: origin + path,
  headers: new Headers(headers)
});

describe('routeRequest', () => {
  it('serves build and static files from the shell', () => {
    expect(routeRequest(get('/_app/immutable/entry/start.js'), origin, shell)).toEqual({
      kind: 'shell'
    });
  });

  it('treats the index and its data request as a page', () => {
    expect(routeRequest(get('/'), origin, shell)).toEqual({ kind: 'page' });
    expect(routeRequest(get('/__data.json'), origin, shell)).toEqual({ kind: 'page' });
  });

  it('leaves everything off the allowlist to the network', () => {
    expect(routeRequest(get('/reset'), origin, shell)).toBeNull();
    expect(routeRequest(get('/api/anything'), origin, shell)).toBeNull();
  });

  it('ignores other methods, other origins and ranged non-content requests', () => {
    expect(routeRequest(get('/', {}, 'POST'), origin, shell)).toBeNull();
    expect(routeRequest({ ...get('/'), url: 'https://other.test/' }, origin, shell)).toBeNull();
    expect(routeRequest(get('/', { range: 'bytes=0-' }), origin, shell)).toBeNull();
  });
});
