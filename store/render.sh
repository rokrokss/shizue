#!/usr/bin/env bash
# Renders the Chrome Web Store images (and the GitHub social preview) in store/src to exact-size PNGs in store/out.
# Usage: store/render.sh [--lang <code>|all] [--check] [name ...]   (no names = render everything)
#   --lang ko   the store images in another language, to out/ko/: the extension's own words from
#               src/locales/ko.json, the rest from src/i18n/ko.js (see src/i18n.js)
#   --lang all  every language in src/locales; English stays in out/
#   --check     also list words that are missing, run out of their box or the image, or overlap
# Needs network: base.css/article.css load Bricolage Grotesque, Silkscreen and Newsreader from Google Fonts.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"

LANGS=(en)
CHECK=0
NAMES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang)
      shift
      if [[ "$1" == all ]]; then
        LANGS=()
        for f in "$ROOT"/src/locales/*.json; do LANGS+=("$(basename "$f" .json)"); done
      else
        LANGS=("$1")
      fi
      ;;
    --check) CHECK=1 ;;
    *) NAMES+=("$1") ;;
  esac
  shift
done

# name:width:height
TARGETS=(
  "screenshot-1-netflix:1280:800"
  "screenshot-2-browser-control:1280:800"
  "screenshot-3-hero:1280:800"
  "screenshot-4-translate:1280:800"
  "screenshot-5-context-menu:1280:800"
  "screenshot-6-youtube:1280:800"
  "screenshot-7-twitch:1280:800"
  "screenshot-8-models:1280:800"
  "promo-small-440x280:440:280"
  "promo-marquee-1400x560:1400:560"
  "store-icon-128:128:128"
  "github-social-1280x640:1280:640"
)
# Made in English only: the icon has no words, and the social preview is GitHub's.
ENGLISH_ONLY=" store-icon-128 github-social-1280x640 "

for lang in "${LANGS[@]}"; do
  out="$DIR/out"
  if [[ $lang != en ]]; then
    out="$DIR/out/$lang"
    [[ -f "$DIR/src/i18n/$lang.js" ]] || { echo "no store/src/i18n/$lang.js" >&2; exit 1; }
    { printf 'window.STORE_UI = '; cat "$ROOT/src/locales/$lang.json"; printf ';\n'; } >"$DIR/src/i18n/ui-$lang.js"
  fi
  mkdir -p "$out"
  for t in "${TARGETS[@]}"; do
    IFS=: read -r name w h <<<"$t"
    if [[ ${#NAMES[@]} -gt 0 && ! " ${NAMES[*]} " == *" $name "* ]]; then continue; fi
    if [[ $lang != en && $ENGLISH_ONLY == *" $name "* ]]; then continue; fi
    url="file://$DIR/src/$name.html?lang=$lang"
    flags=(--headless=new --disable-gpu --hide-scrollbars
      --force-device-scale-factor=1 --window-size="$w,$h"
      --default-background-color=00000000
      --virtual-time-budget=10000)
    "$CHROME" "${flags[@]}" --screenshot="$out/$name.png" "$url" >/dev/null 2>&1
    echo "rendered ${out#"$DIR"/}/$name.png ($w x $h)"
    if [[ $CHECK == 1 ]]; then
      "$CHROME" "${flags[@]}" --dump-dom "$url&check=1" 2>/dev/null |
        sed -n '/<pre id="i18n-report"/,/<\/pre>/p' | sed -e 's/<[^>]*>//g' -e '/^ *$/d' -e "s|^|  $lang/$name: |"
    fi
  done
done
