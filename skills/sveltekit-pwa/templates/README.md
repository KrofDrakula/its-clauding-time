# __APP_TITLE__

SvelteKit 3 app, installable as a PWA, with offline support and a Docker image.

## Develop

```sh
pnpm install
pnpm dev          # all interfaces, port 5173
pnpm check        # types, including the service worker
pnpm test
pnpm lint
```

## Offline support

A service worker (`src/service-worker/index.ts`) stores the app shell and the pages
listed in `OFFLINE_PAGES` (`src/lib/offline/routes.ts`). The service worker and the
Cache API need a secure origin: use `localhost` or HTTPS. The dev server does not
build the shell list, so test offline behavior against a production build:

```sh
pnpm build && PORT=3000 node server.js   # in one terminal
pnpm verify:offline                      # in another; needs `pnpm exec playwright install chromium`
```

Repair a device with a faulty service worker: open `/reset` (keeps stored content)
or `/reset?all` (deletes everything). The next load registers a fresh worker.

## App icon

`src/lib/assets/app-icon.png` is the only source. A placeholder is drawn if it is
missing. After a change, run `pnpm icons` and commit the PNGs in `static/`, the
favicon copy, `static/manifest.webmanifest` and `src/app.html`. Do not edit the
PNGs by hand.

## Docker

```sh
pnpm docker:build                          # writes __APP_NAME__.tar
DEPLOY_HOST=user@host pnpm docker:deploy   # loads the image and recreates the container
```

The container listens on port 3000 and expects a reverse proxy that sets
`x-forwarded-proto` and `x-forwarded-host`.
