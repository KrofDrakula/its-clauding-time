---
name: sveltekit-pwa
description: Scaffold a new SvelteKit app as an installable, offline-capable PWA with a Docker image, in a new local git repo. Use when starting a SvelteKit/PWA project, or when adding offline caching, install icons, Web Audio, wake lock, media session or range-request media serving to one.
---

# SvelteKit PWA

Bootstrap a SvelteKit project that installs on phones, works offline, and ships as a small Docker image. `scripts/bootstrap.sh` does the deterministic work; the steps below surround it.

## Steps

1. **Read the current docs.** Fetch these and keep them in view:
   - `https://svelte.dev/docs/kit/llms.txt`, sections "Creating a project", "Service workers", "Adapter-node" and "Environment variables"
   - `https://svelte.dev/docs/cli/llms.txt`, sections `sv create`, `sv add`, `prettier`, `vitest`, `sveltekit-adapter`

   Compare them with `scripts/bootstrap.sh` (the `sv create` flags, the add-ons) and with `templates/src/service-worker/index.ts` (imports from `$app/*`, registration, tsconfig). Done when you can name each drift between docs and skill, or state "no drift". Apply a drift to the new project and tell the user which file in this skill is stale.

2. **Collect inputs.** Target directory and app title. Ask only for what is missing. The directory must not exist or must be empty.

3. **Run the script:**

   ```
   bash ${CLAUDE_SKILL_DIR}/scripts/bootstrap.sh <target-dir> "<App Title>"
   ```

   It scaffolds with `npx sv@latest create` (minimal template, TypeScript, add-ons `prettier`, `sveltekit-adapter=adapter:node`, `vitest=usages:unit`), removes the demo files, copies `templates/` with placeholders filled, adds `sharp` and `playwright`, draws placeholder icons, formats, runs `git init -b main` and stages everything. It does not commit.

4. **Verify** in the new directory. Every line must pass before you go on:
   - `pnpm check` reports 0 errors, including the service worker
   - `pnpm lint` and `pnpm test` pass
   - `pnpm build`, then `PORT=3111 node server.js &`, then `pnpm exec playwright install chromium` (first time only) and `node scripts/verify-offline.ts http://localhost:3111/` prints `PASS`
   - `curl -I localhost:3111/service-worker.js` shows `cache-control: no-cache`
   - `pnpm docker:build` exits 0; the container reports `healthy` and serves the same header (see `references/docker.md`)

   Stop the server and remove the test image afterwards.

5. **Add features the app needs.** Read the reference only when its branch applies:
   - Offline content, extra pages, update banner, install or icon changes: `references/offline.md`
   - Audio, wake lock, vibration, media serving with ranges, touch or Safari quirks: `references/media.md`
   - Native dependencies, Deno, volumes, deploy: `references/docker.md`

   Copy modules from `templates/optional/` into `src/lib/`, and add a test for each pure module.

6. **Commit locally.** Create the first commit yourself, so the user's attribution rules apply. Add no remote and push nothing. Report the directory, the verification results and any drift from step 1.

## What the template gives you

- `vite.config.ts` holds all SvelteKit config (adapter-node, runes mode, test setup). There is no `svelte.config.js`.
- `src/service-worker/index.ts` is bundled and registered by SvelteKit. Its routing allowlist is `src/lib/offline/routes.ts`; edit `OFFLINE_PAGES` and `CONTENT_PREFIXES` there.
- `/reset` repairs a device with a faulty worker (`/reset?all` also drops stored content).
- `scripts/generate-icons.ts` makes hashed 192, 512, maskable and Apple icons from `src/lib/assets/app-icon.png` and rewrites the manifest and `app.html`.
- `server.js`, `Dockerfile`, `.dockerignore`, `scripts/deploy.sh` for the image.

## Rules

- The app's `check` script type-checks the worker separately; the root `tsconfig.json` excludes `src/service-worker`.
- Keep every cache write for pages tolerant of failure, and keep the worker's fetch handler falling back to the network on any error.
- Replace the placeholder icon by writing `src/lib/assets/app-icon.png` and running `pnpm icons`.
