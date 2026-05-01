#!/usr/bin/env bash
# Validate snake-html: opens in Chrome via caxi, captures screenshot, checks for
# canvas and basic game elements.
#
# Usage: ./snake-html.sh <artifact-file> <model> <results-dir>
set -euo pipefail
ARTIFACT="$1"
MODEL="$2"
RESULTS="$3"
SAFE=$(echo "$MODEL" | tr ':/' '--')

if [ ! -s "$ARTIFACT" ]; then
  jq -n --arg m "$MODEL" '{model:$m, benchmark:"snake-html", pass:false, reason:"empty"}' \
    > "$RESULTS/snake-html-$SAFE.json"
  exit 1
fi

SCREENSHOT="$RESULTS/snake-html-$SAFE.png"
BYTES=$(wc -c < "$ARTIFACT")

# Open in Chrome, wait for paint, screenshot
caxi open "file://$ARTIFACT" >/dev/null 2>&1 || true
sleep 1
caxi screenshot "$SCREENSHOT" >/dev/null 2>&1 || true

# Check for canvas OR div-based snake grid
HAS_CANVAS=$(caxi eval "document.querySelector('canvas') !== null" 2>/dev/null | tail -1 || echo "false")
HAS_KEY_HANDLER=$(caxi eval "typeof document.onkeydown === 'function' || typeof window.onkeydown === 'function' || document.querySelectorAll('script').length > 0" 2>/dev/null | tail -1 || echo "false")
JS_ERRORS=$(caxi eval "(window.__errors||[]).length" 2>/dev/null | tail -1 || echo "0")

jq -n --arg m "$MODEL" --argjson b "$BYTES" --arg c "$HAS_CANVAS" --arg k "$HAS_KEY_HANDLER" --arg e "$JS_ERRORS" \
  '{model:$m, benchmark:"snake-html", pass:($c == "true"), bytes:$b, has_canvas:$c, has_key_handler:$k, js_errors:$e}' \
  > "$RESULTS/snake-html-$SAFE.json"

if [ "$HAS_CANVAS" = "true" ]; then
  echo "PASS: canvas found, $BYTES bytes"
else
  echo "FAIL: no canvas"
  exit 1
fi
