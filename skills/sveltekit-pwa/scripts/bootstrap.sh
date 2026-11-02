#!/usr/bin/env bash
# Creates an offline-capable SvelteKit PWA with a Docker image in a new local
# git repository. Usage:
#
#   bootstrap.sh <target-dir> "<App Title>"
#
# <target-dir> must not exist or must be empty. The script stages the files but
# does not commit, so the caller commits with its own attribution rules.
set -euo pipefail

TARGET="${1:?Usage: bootstrap.sh <target-dir> \"<App Title>\"}"
TITLE="${2:?Usage: bootstrap.sh <target-dir> \"<App Title>\"}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$SKILL_DIR/templates"

# The npm package name: lower-case letters, digits and hyphens.
NAME="$(basename "$TARGET" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
[ -n "$NAME" ] || { echo "Cannot derive a package name from '$TARGET'" >&2; exit 1; }

for tool in node pnpm git npx; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET")" ]; then
  echo "$TARGET exists and is not empty" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
PNPM_MAJOR="$(pnpm -v | cut -d. -f1)"

# 1. Scaffold with the current `sv` CLI: minimal template, TypeScript, and the
#    prettier, adapter-node and vitest add-ons.
npx --yes sv@latest create "$TARGET" \
  --template minimal --types ts --no-install \
  --add prettier "sveltekit-adapter=adapter:node" "vitest=usages:unit"

cd "$TARGET"

# 2. Remove the scaffold's demo files.
rm -rf src/lib/vitest-examples src/lib/assets/favicon.svg

# 3. Copy the templates, filling the placeholders.
copy() { # copy <relative path> [destination]
  local src="$TEMPLATES/$1" dest="${2:-$1}"
  mkdir -p "$(dirname "$dest")"
  sed -e "s/__APP_NAME__/$NAME/g" \
      -e "s/__APP_TITLE__/${TITLE//\//\\/}/g" \
      -e "s/__NODE_MAJOR__/$NODE_MAJOR/g" \
      -e "s/__PNPM_MAJOR__/$PNPM_MAJOR/g" "$src" > "$dest"
}
while IFS= read -r file; do
  case "$file" in optional/*) continue ;; esac
  copy "$file"
done < <(cd "$TEMPLATES" && find . -type f | sed 's|^\./||' | sort)
chmod +x scripts/deploy.sh

# 4. Wire the scripts and dependencies.
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
Object.assign(pkg.scripts, {
  check: "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json && tsc -p src/service-worker/tsconfig.json",
  dev: "vite dev --host 0.0.0.0",
  test: "vitest run",
  icons: "node scripts/generate-icons.ts",
  "verify:offline": "node scripts/verify-offline.ts",
  "docker:build": `docker build -t ${pkg.name}:latest . && docker save ${pkg.name}:latest -o ${pkg.name}.tar`,
  "docker:deploy": "bash scripts/deploy.sh"
});
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
printf '\n# Docker\n*.tar\n\n# Playwright\ntest-results\n' >> .gitignore
rm -f .npmrc && printf 'engine-strict=true\n' > .npmrc

pnpm add -D sharp playwright

# 5. Draw the icons (a placeholder until src/lib/assets/app-icon.png exists),
#    format everything and stage it in a new repository.
node scripts/generate-icons.ts "$TITLE"
pnpm install
pnpm format
git init -q -b main
git add -A

echo
echo "Created $TARGET (package '$NAME'). Staged, not committed."
