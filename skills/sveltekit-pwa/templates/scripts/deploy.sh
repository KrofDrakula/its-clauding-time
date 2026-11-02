#!/usr/bin/env bash
# Sends the built image to a Docker host, imports it and recreates the
# container, all over one SSH connection (one password prompt, no file left on
# the host). Run `pnpm docker:build` first. Set DEPLOY_HOST to `user@host`.
set -euo pipefail

HOST="${DEPLOY_HOST:?Set DEPLOY_HOST to user@host}"
NAME="__APP_NAME__"
# Docker network that the reverse proxy shares with the container.
NETWORK="${DEPLOY_NETWORK:-proxy}"

# The tar file goes in on stdin and `docker load` reads it from there.
ssh "$HOST" "
  set -e
  docker load
  docker rm -f $NAME || true
  docker run -d --name $NAME --restart unless-stopped --network $NETWORK $NAME:latest
  docker ps --filter name=$NAME
" < "$NAME.tar"
