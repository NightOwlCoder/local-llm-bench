#!/usr/bin/env bash
# Validate snake-html: opens in Chrome via caxi, captures screenshot, checks for
# canvas and basic game elements.
#
# Usage: ./snake-html.sh <artifact-file> <model> <results-dir>
set -uo pipefail
ARTIFACT="$1"
MODEL="$2"
RESULTS="$3"
SAFE=$(echo "$MODEL" | tr ':/' '--')

if [ ! -s "$ARTIFACT" ]; then
  jq -n --arg m "$MODEL" '{model:$m, benchmark:"snake-html", pass:false, reason:"empty"}' \
    > "$RESULTS/snake-html-$SAFE.json"
  exit 1
fi

ABS_ARTIFACT="$(cd "$(dirname "$ARTIFACT")" && pwd)/$(basename "$ARTIFACT")"
SCREENSHOT="$RESULTS/snake-html-$SAFE.png"
BYTES=$(wc -c < "$ARTIFACT" | tr -d ' ')

caxi open "file://$ABS_ARTIFACT" >/dev/null 2>&1 || true
sleep 1
caxi screenshot "$SCREENSHOT" >/dev/null 2>&1 || true

caxi_bool() { caxi eval "$1" 2>/dev/null | grep -oE '^(true|false)$' | tail -1 || echo "false"; }

HAS_CANVAS=$(caxi_bool "document.querySelector('canvas') !== null")
HAS_SCRIPT=$(caxi_bool "document.querySelectorAll('script').length > 0")

jq -n --arg m "$MODEL" --argjson b "$BYTES" --arg c "$HAS_CANVAS" --arg s "$HAS_SCRIPT" \
  '{model:$m, benchmark:"snake-html", pass:($c == "true"), bytes:$b, has_canvas:$c, has_script:$s}' \
  > "$RESULTS/snake-html-$SAFE.json"

if [ "$HAS_CANVAS" = "true" ]; then
  echo "PASS: canvas found, $BYTES bytes"
else
  echo "FAIL: no canvas"
  exit 1
fi
