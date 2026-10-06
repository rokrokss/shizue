#!/usr/bin/env bash
# Renders the Chrome Web Store images (and the GitHub social preview) in store/src to exact-size PNGs in store/out.
# Usage: store/render.sh [name ...]   (no args = render everything)
# Needs network: base.css/article.css load Bricolage Grotesque, Silkscreen and Newsreader from Google Fonts.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR/out"

# name:width:height
TARGETS=(
  "screenshot-1-hero:1280:800"
  "screenshot-2-translate:1280:800"
  "screenshot-3-youtube:1280:800"
  "screenshot-4-context-menu:1280:800"
  "screenshot-5-models:1280:800"
  "promo-small-440x280:440:280"
  "promo-marquee-1400x560:1400:560"
  "store-icon-128:128:128"
  "github-social-1280x640:1280:640"
)

for t in "${TARGETS[@]}"; do
  IFS=: read -r name w h <<<"$t"
  if [[ $# -gt 0 && ! " $* " == *" $name "* ]]; then continue; fi
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$w,$h" \
    --default-background-color=00000000 \
    --virtual-time-budget=10000 \
    --screenshot="$DIR/out/$name.png" "file://$DIR/src/$name.html" >/dev/null 2>&1
  echo "rendered out/$name.png ($w x $h)"
done
