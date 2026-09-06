#!/usr/bin/env bash
# Assemble the deploy for Vercel.
#
#   /                  the React build — the app IS the site, not a subfolder of it.
#   /binding-template  the prototype with every data property tokenised. Kept as
#                      the LAYOUT reference: its field set predates the schema
#                      decisions, so it is not the field reference.
#   /prototype.html    the original prototype, with its dummy data.
#
# The two prototypes and the images they reference live in prototypes/. They are copied
# to the ROOT of dist/ because their markup references the images relatively — moving the
# sources into a folder did not move the URLs they are served from.
set -euo pipefail

rm -rf dist
mkdir -p dist

cp prototypes/binding-template.html  dist/binding-template.html
cp prototypes/prototype.html         dist/prototype.html
cp prototypes/lofty_logo_orange.png  dist/
cp prototypes/faivcon.png            dist/

cd app
npm ci
npm run build
cd ..
# Last, and into the root: the app owns dist/index.html. Anything above that shares a
# name with a build output would be overwritten here rather than silently winning, which
# is why this copy goes at the end where it is visible.
cp -r app/dist/* dist/
