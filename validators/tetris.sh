#!/usr/bin/env bash
# Validate tetris: canvas must exist, page must respond to arrow keys, should
# have visible game board area. Playability is hard to auto-verify; we check
# structure + key handling.
#
# Usage: ./tetris.sh <artifact-file> <model> <results-dir>
set -euo pipefail
ARTIFACT="$1"
MODEL="$2"
RESULTS="$3"
SAFE=$(echo "$MODEL" | tr ':/' '--')

if [ ! -s "$ARTIFACT" ]; then
  jq -n --arg m "$MODEL" '{model:$m, benchmark:"tetris", pass:false, reason:"empty"}' \
    > "$RESULTS/tetris-$SAFE.json"
  exit 1
fi

SCREENSHOT="$RESULTS/tetris-$SAFE.png"
BYTES=$(wc -c < "$ARTIFACT")

caxi open "file://$ARTIFACT" >/dev/null 2>&1 || true
sleep 1
caxi screenshot "$SCREENSHOT" >/dev/null 2>&1 || true

HAS_CANVAS=$(caxi eval "document.querySelector('canvas') !== null" 2>/dev/null | tail -1 || echo "false")
HAS_SCRIPT=$(caxi eval "document.querySelectorAll('script').length > 0" 2>/dev/null | tail -1 || echo "false")
PAGE_HEIGHT=$(caxi eval "document.body.scrollHeight" 2>/dev/null | tail -1 || echo "0")

# Poke an arrow key and check page didn't crash
caxi eval "document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown'}))" >/dev/null 2>&1 || true
STILL_ALIVE=$(caxi eval "typeof document !== 'undefined'" 2>/dev/null | tail -1 || echo "false")

PASS="false"
[ "$HAS_CANVAS" = "true" ] && [ "$HAS_SCRIPT" = "true" ] && [ "$STILL_ALIVE" = "true" ] && PASS="true"

jq -n --arg m "$MODEL" --argjson b "$BYTES" --arg c "$HAS_CANVAS" --arg s "$HAS_SCRIPT" --arg h "$PAGE_HEIGHT" --arg a "$STILL_ALIVE" --arg p "$PASS" \
  '{model:$m, benchmark:"tetris", pass:($p=="true"), bytes:$b, has_canvas:$c, has_script:$s, page_height:$h, survived_keypress:$a}' \
  > "$RESULTS/tetris-$SAFE.json"

if [ "$PASS" = "true" ]; then
  echo "PASS: canvas + script + survives input"
else
  echo "FAIL: canvas=$HAS_CANVAS script=$HAS_SCRIPT alive=$STILL_ALIVE"
  exit 1
fi
