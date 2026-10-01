#!/usr/bin/env bash
# Safe build entry point for the Vite webapp.
#
# Because this repo deploys to GitHub Pages via branch-root serving, the
# repo-root index.html alternates between the Vite SOURCE template and the
# BUILT artifact. If a prior deploy left the BUILT index.html at root, a plain
# `vite build` silently treats that already-built html as static input and just
# re-copies the OLD bundle — data goes stale forever. The submitted template
# (index.html.source) always wins, so restore it before building.
set -euo pipefail

cd "$(dirname "$0")/.."

test -f index.html.source || {
  echo "ERROR: index.html.source (the Vite source template) is missing." >&2
  exit 1
}

# Replace the root index.html with the source template so every build compiles
# a fresh bundle from src/ and data/ regardless of what the previous deploy
# left there.
cp index.html.source index.html
echo "Restored index.html from index.html.source"

npm run build