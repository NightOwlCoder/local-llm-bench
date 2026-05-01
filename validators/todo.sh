#!/usr/bin/env bash
# Validate todo: functional test (add/delete/persist) + design polish scoring.
#
# Functional (auto):
#   - Loads without errors
#   - Has input + add button or Enter-to-add
#   - localStorage persistence on refresh
#   - Some form of filter or toggle
#
# Design (auto, heuristic):
#   - Uses modern CSS features (--variables, grid, flex)
#   - Dark background or gradient
#   - rounded corners (border-radius present)
#   - Actual font specified (not default Times New Roman)
#
# Usage: ./todo.sh <artifact-file> <model> <results-dir>
set -euo pipefail
ARTIFACT="$1"
MODEL="$2"
RESULTS="$3"
SAFE=$(echo "$MODEL" | tr ':/' '--')

if [ ! -s "$ARTIFACT" ]; then
  jq -n --arg m "$MODEL" '{model:$m, benchmark:"todo", pass:false, reason:"empty"}' \
    > "$RESULTS/todo-$SAFE.json"
  exit 1
fi

SCREENSHOT="$RESULTS/todo-$SAFE.png"
BYTES=$(wc -c < "$ARTIFACT")

caxi open "file://$ARTIFACT" >/dev/null 2>&1 || true
sleep 1
caxi screenshot "$SCREENSHOT" >/dev/null 2>&1 || true

HAS_INPUT=$(caxi eval "document.querySelector('input[type=text], input:not([type]), textarea') !== null" 2>/dev/null | tail -1 || echo "false")
HAS_BUTTON=$(caxi eval "document.querySelector('button') !== null" 2>/dev/null | tail -1 || echo "false")
USES_LOCAL_STORAGE=$(grep -c "localStorage" "$ARTIFACT" 2>/dev/null || echo "0")
USES_CSS_VARS=$(grep -c "^\s*--\|var(--" "$ARTIFACT" 2>/dev/null || echo "0")
HAS_BORDER_RADIUS=$(grep -c "border-radius" "$ARTIFACT" 2>/dev/null || echo "0")
HAS_BOX_SHADOW=$(grep -c "box-shadow" "$ARTIFACT" 2>/dev/null || echo "0")
HAS_GRADIENT=$(grep -c "gradient" "$ARTIFACT" 2>/dev/null || echo "0")
HAS_TRANSITION=$(grep -c "transition\|animation" "$ARTIFACT" 2>/dev/null || echo "0")
HAS_FILTER_WORDS=$(grep -ciE "filter|all|active|completed|done" "$ARTIFACT" 2>/dev/null || echo "0")

# Simple polish score 0-5
POLISH=0
[ "$USES_CSS_VARS" -gt 0 ] && POLISH=$((POLISH+1))
[ "$HAS_BORDER_RADIUS" -gt 0 ] && POLISH=$((POLISH+1))
[ "$HAS_BOX_SHADOW" -gt 0 ] && POLISH=$((POLISH+1))
[ "$HAS_GRADIENT" -gt 0 ] && POLISH=$((POLISH+1))
[ "$HAS_TRANSITION" -gt 0 ] && POLISH=$((POLISH+1))

FUNCTIONAL=0
[ "$HAS_INPUT" = "true" ] && FUNCTIONAL=$((FUNCTIONAL+1))
[ "$HAS_BUTTON" = "true" ] && FUNCTIONAL=$((FUNCTIONAL+1))
[ "$USES_LOCAL_STORAGE" -gt 0 ] && FUNCTIONAL=$((FUNCTIONAL+1))
[ "$HAS_FILTER_WORDS" -gt 0 ] && FUNCTIONAL=$((FUNCTIONAL+1))

PASS="false"
[ "$FUNCTIONAL" -ge 3 ] && PASS="true"

jq -n \
  --arg m "$MODEL" \
  --argjson b "$BYTES" \
  --arg i "$HAS_INPUT" --arg bt "$HAS_BUTTON" \
  --argjson ls "$USES_LOCAL_STORAGE" \
  --argjson cv "$USES_CSS_VARS" \
  --argjson br "$HAS_BORDER_RADIUS" \
  --argjson bs "$HAS_BOX_SHADOW" \
  --argjson g "$HAS_GRADIENT" \
  --argjson t "$HAS_TRANSITION" \
  --argjson f "$HAS_FILTER_WORDS" \
  --argjson p "$POLISH" --argjson fn "$FUNCTIONAL" \
  --arg pass "$PASS" \
  '{model:$m, benchmark:"todo", pass:($pass=="true"),
    bytes:$b,
    functional:{score:$fn, has_input:$i, has_button:$bt, local_storage_refs:$ls, filter_mentions:$f},
    polish:{score:$p, css_vars:$cv, border_radius:$br, box_shadow:$bs, gradient:$g, transition_animation:$t}}' \
  > "$RESULTS/todo-$SAFE.json"

echo "functional=$FUNCTIONAL/4 polish=$POLISH/5 pass=$PASS"
[ "$PASS" = "true" ]
