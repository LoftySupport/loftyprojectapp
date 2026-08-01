#!/usr/bin/env bash
# Assemble the deploy.
#
#   /app/              the React build — what / redirects to.
#   /binding-template  the prototype with every data property tokenised. Kept as
#                      the LAYOUT reference: its field set predates the schema
#                      decisions, so it is not the field reference.
#   /prototype.html    the original prototype, with its dummy data.
set -euo pipefail

rm -rf dist
mkdir -p dist

# The root is a redirect to /app/ (netlify.toml), so index.html is only a
# fallback for anyone serving dist/ statically without those rules.
cp supabase-template.html   dist/binding-template.html
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
