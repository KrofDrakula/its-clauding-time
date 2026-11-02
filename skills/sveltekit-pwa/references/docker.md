# Docker image and deployment

`templates/Dockerfile` is the default. This file explains the choices and the variants.

## Default image

- Stage 1 builds with `node:<major>-alpine` and pnpm. Pin pnpm with `npm install -g pnpm@<major>`: Node 25 and later do not ship corepack. `bootstrap.sh` fills both majors from the local `node` and `pnpm`.
- Copy `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` first and run `pnpm install --frozen-lockfile`, so the dependency layer caches.
- `@sveltejs/adapter-node` bundles every devDependency into `build/`. Only `dependencies` stay as plain imports that must resolve at runtime. Keep runtime code free of `dependencies` when you can.
- Stage 2 is `alpine` plus `apk add nodejs-current`. This links to shared system libraries and ships no npm, which makes the image about 80 MB smaller than the node image.
- Run as `USER 65532:65532`. Match this user id when files on a mounted volume must stay writable between images.
- `HEALTHCHECK` uses `node -e "fetch(...)"`, since alpine has no curl.
- Set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` when a TLS-terminating proxy sits in front. Without them adapter-node builds the wrong origin and the CSRF check rejects form posts. Set `ORIGIN` instead when the public URL is fixed.
- `CMD ["node", "server.js"]`. `server.js` imports the adapter's `server` export and adds `Cache-Control: no-cache` to every response. Without it, `/service-worker.js` and the manifest can sit in HTTP caches and a deploy never reaches installed apps.

## Variants

- **Native runtime dependency** (for example `sharp`, which ships a libvips binary): add a `deps` stage on the same base as the build stage that runs `pnpm install --prod --frozen-lockfile`, and copy its `node_modules` into the runtime stage. Both stages must use musl so pnpm fetches the binary the runtime loads. The runtime also needs `libstdc++`, which `nodejs-current` installs.
- **Deno runtime**: replace stage 2 with `denoland/deno:distroless-<version>`, copy `build/`, and use `CMD ["run", "--allow-net", "--allow-env", "--allow-read=/app,/resources", "build/index.js"]` with `USER nonroot`. The permission flags are an allowlist: a new path, write access or native addon needs a matching flag. After such a change, build the image, run it with a mounted volume and request a file.
- **User content volume**: declare `VOLUME ["/resources"]` and `ENV RESOURCES_DIR=/resources`. Mount read-only (`:ro`) when the app only reads; mount read-write when it writes derived files such as thumbnails. Keep the app's behavior and the mount mode in agreement.
- **Cross-architecture build**: add `--platform linux/amd64` to `docker build` when the build machine and the host differ.

## Build and deploy scripts

- `pnpm docker:build` builds `<name>:latest` and writes `<name>.tar` with `docker save`. Ignore `*.tar` in git and Docker.
- `scripts/deploy.sh` streams the tar over SSH into `docker load` on the host, then recreates the container with `docker rm -f` and `docker run -d --restart unless-stopped`. No file stays on the host. Set `DEPLOY_HOST` and, if needed, `DEPLOY_NETWORK` and volume flags. Hosts with a non-standard `docker` path need a `PATH` line in the remote command.

## Verify the image

1. `pnpm docker:build` exits 0.
2. `docker run -d --rm -p 3000:3000 <name>:latest`, then `curl -I localhost:3000/service-worker.js` shows `200` and `cache-control: no-cache`.
3. `docker inspect --format '{{.State.Health.Status}}' <container>` prints `healthy` after the start period.

## SvelteKit 3 notes that affect the image

- Configuration lives in `vite.config.ts` (`sveltekit({ adapter, compilerOptions, paths, serviceWorker })`). There is no `svelte.config.js`.
- Import app code with `#lib/...` and the file extension (`#lib/server/x.ts`), through the `imports` map in `package.json`. `$lib` does not exist.
- Declare environment variables in `src/env.ts` with `defineEnvVars` from `@sveltejs/kit/env`. Import them from `$app/env/private` (server) or `$app/env/public`. `$env/*` is deprecated. Give each variable a `schema` default so a container can set it at start.
- Service worker imports: `version` from `$app/env`; `assets`, `immutable`, `prerendered` from `$app/manifest`; `self` from `$app/service-worker`.
- When unsure, read `node_modules/@sveltejs/kit/types/index.d.ts`.
