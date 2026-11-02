# Stage 1: build the SvelteKit app into a standalone server bundle.
# @sveltejs/adapter-node bundles the devDependencies into build/. Runtime
# "dependencies" stay plain imports that must resolve at runtime; this app
# has none, so the runtime stage needs no node_modules. If you add one, add a
# stage that runs `pnpm install --prod --frozen-lockfile` and copy its
# node_modules into the runtime stage.
FROM node:__NODE_MAJOR__-alpine AS build

WORKDIR /app

# Node 25 and later do not ship corepack.
RUN npm install -g pnpm@__PNPM_MAJOR__

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: run the bundle with Node. Alpine's own nodejs-current package
# links to shared system libraries and ships no npm, which makes the image
# about 80 MB smaller than the node image. The build and runtime stages both
# use musl, so native binaries fetched in stage 1 also load here.
FROM alpine:3.24

RUN apk add --no-cache nodejs-current

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/build ./build
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# Behind a TLS-terminating reverse proxy, adapter-node derives the origin from
# these headers. Without them, form posts fail the CSRF origin check.
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

USER 65532:65532

CMD ["node", "server.js"]
