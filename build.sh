#!/usr/bin/env bash
# Assemble the deploy.
#
#   /        the prototype with every data property tokenised — the whole app,
#            every page, the filters and the job panel, with {{table.column}}
#            wherever a value will come from Supabase. This is the build
#            reference.
#   /app/    the React build in progress. Structure only, reading through the
#            data seam.
#
# Both ship, so the reference and the real thing are side by side.
set -euo pipefail

rm -rf dist
mkdir -p dist

cp supabase-template.html   dist/index.html
cp lofty_logo_orange.png    dist/
cp faivcon.png              dist/
cp "circle triangle.png"    dist/ 2>/dev/null || true

# the prototype as it stands, for comparison
cp index.html               dist/prototype.html

cd app
npm ci
npm run build
cd ..
mkdir -p dist/app
cp -r app/dist/* dist/app/
