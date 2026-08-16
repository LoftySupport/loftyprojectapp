#!/usr/bin/env bash
# Assemble the deploy.
#
#   /                  the React build — the app IS the site, not a subfolder of it.
#   /binding-template  the prototype with every data property tokenised. Kept as
#                      the LAYOUT reference: its field set predates the schema
#                      decisions, so it is not the field reference.
#   /prototype.html    the original prototype, with its dummy data.
set -euo pipefail

rm -rf dist
mkdir -p dist

cp supabase-template.html   dist/binding-template.html
cp lofty_logo_orange.png    dist/
cp faivcon.png              dist/
cp "circle triangle.png"    dist/ 2>/dev/null || true

# the prototype as it stands, for comparison
cp index.html               dist/prototype.html

cd app
npm ci
npm run build
cd ..
# Last, and into the root: the app owns dist/index.html. Anything above that shares a
# name with a build output would be overwritten here rather than silently winning, which
# is why this copy goes at the end where it is visible.
cp -r app/dist/* dist/
