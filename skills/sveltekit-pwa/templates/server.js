// Production entry point: starts the adapter-node server, then adds the cache
// headers that adapter-node's static handler does not set. Every response is
// `no-cache`: the browser revalidates through the ETag, which also gives 304
// and Range support. This keeps `/service-worker.js` and `/manifest.webmanifest`
// fresh, so a deploy reaches installed apps. adapter-node marks
// /_app/immutable/* as `public,max-age=31536000,immutable`, which overrides
// this default for the hashed build files.
// Offline availability comes from the service worker, not HTTP lifetimes.
import { server } from './build/index.js';

server.prependListener('request', (_req, res) => {
  res.setHeader('cache-control', 'no-cache');
});
