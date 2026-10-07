#!/bin/sh
# Assembles the shizue.net landing page into _site/ (the GitHub Pages artifact).
# Images come from store/out so they stay in sync with the Chrome Web Store listing.
set -e
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site/img
node site/render.mjs
cp src/public/icon.svg _site/
cp store/out/screenshot-*.png store/out/github-social-1280x640.png _site/img/
