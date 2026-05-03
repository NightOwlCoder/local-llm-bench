#!/opt/homebrew/bin/bash
# Build final RESULTS.md from LEADERBOARD.json + raw data.
#
# Usage: ./build-results-md.sh

set -uo pipefail
BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEADERBOARD="$BENCH_DIR/caxi-results/LEADERBOARD.json"
OUT="$BENCH_DIR/RESULTS.md"

if [ ! -s "$LEADERBOARD" ]; then
  echo "ERROR: $LEADERBOARD not found. Run build-leaderboard.mjs first." >&2
  exit 1
fi

cat > "$OUT" <<'HEADER'
# Results

Benchmarking local coder LLMs on real tasks with objective validation.

**Methodology:** Each model generates artifacts for 7 prompts. Every artifact is
driven by Playwright (games + apps), syntax-checked (pygame), and judged by
Claude Opus 4.7 for visual polish (pairwise), code quality (pygame review), and
text quality (oi greeting).

**Scoring (100 pts total):**
- Functional (30): Playwright tier checks on each app + pygame syntax
- Visual polish (30): Opus 4.7 pairwise Elo across 5 web benchmarks
- Pygame code review (15): Opus 4.7 rubric on correctness, style, architecture, robustness, UX
- Oi text quality (10): Opus 4.7 on language, conciseness, tone, cleanliness
- Efficiency (15): tokens used per functional point earned (lower is better)

HEADER

# Master leaderboard
echo "## 🏆 Leaderboard" >> "$OUT"
echo "" >> "$OUT"
echo "| # | Model | Func /30 | Visual /30 | PyCR /15 | Oi /10 | Effi /15 | **Total /100** |" >> "$OUT"
echo "|---|---|---|---|---|---|---|---|" >> "$OUT"
jq -r '
  to_entries | .[] |
  "| \(.key + 1) | `\(.value.model)` | \(.value.functional_score|round * 10 / 10) | \(.value.visual_score|round * 10 / 10) | \(.value.pygame_review_score|round * 10 / 10) | \(.value.oi_quality_score|round * 10 / 10) | \(.value.efficiency_score|round * 10 / 10) | **\(.value.total|round * 10 / 10)** |"
' "$LEADERBOARD" >> "$OUT"
echo "" >> "$OUT"

# Per-benchmark functional
echo "## Functional scores per benchmark" >> "$OUT"
echo "" >> "$OUT"
echo "| Model | Todo /8 | Snake /6 | Tetris /8 | Calc /7 | Markdown /8 | Pygame |" >> "$OUT"
echo "|---|---|---|---|---|---|---|" >> "$OUT"
jq -r '
  .[] |
  "| `\(.model)` | \(.functional.todo.score)/8 | \(.functional["snake-html"].score)/6 | \(.functional.tetris.score)/8 | \(.functional.calc.score)/7 | \(.functional.markdown.score)/8 | \(if .pygame_syntax_ok then "✅" else "❌" end) |"
' "$LEADERBOARD" >> "$OUT"
echo "" >> "$OUT"

# Elo table per benchmark
echo "## Visual polish — Elo ratings (higher = better)" >> "$OUT"
echo "" >> "$OUT"
echo "Via Opus 4.7 pairwise comparisons across all model combinations." >> "$OUT"
echo "" >> "$OUT"
echo "| Model | Snake HTML | Tetris | Todo | Calc | Markdown |" >> "$OUT"
echo "|---|---|---|---|---|---|" >> "$OUT"
jq -r '
  .[] |
  "| `\(.model)` | \(.elo["snake-html"]|round) | \(.elo.tetris|round) | \(.elo.todo|round) | \(.elo.calc|round) | \(.elo.markdown|round) |"
' "$LEADERBOARD" >> "$OUT"
echo "" >> "$OUT"

# Pygame code review
echo "## Pygame code review — Opus 4.7 rubric" >> "$OUT"
echo "" >> "$OUT"
echo "Each dimension scored 0-10; total out of 50." >> "$OUT"
echo "" >> "$OUT"
echo "| Model | Total /50 | Notes |" >> "$OUT"
echo "|---|---|---|" >> "$OUT"
for f in "$BENCH_DIR"/caxi-results/snake-pygame-review-*.json; do
  [ -s "$f" ] || continue
  model=$(jq -r '.model' "$f")
  total=$(jq -r '.total' "$f")
  notes=$(jq -r '.notes' "$f" | tr '\n' ' ' | sed 's/|/\\|/g')
  echo "| \`$model\` | $total | $notes |" >> "$OUT"
done
echo "" >> "$OUT"

# Oi quality
echo "## Oi text quality — Opus 4.7 rubric" >> "$OUT"
echo "" >> "$OUT"
echo "Greetings in Portuguese. Scored on language, conciseness, tone, cleanliness." >> "$OUT"
echo "" >> "$OUT"
echo "| Model | Total /40 | Tokens | Notes |" >> "$OUT"
echo "|---|---|---|---|" >> "$OUT"
for f in "$BENCH_DIR"/caxi-results/oi-quality-*.json; do
  [ -s "$f" ] || continue
  model=$(jq -r '.model' "$f")
  total=$(jq -r '.total' "$f")
  tokens=$(jq -r '.tokens_used' "$f")
  notes=$(jq -r '.notes' "$f" | tr '\n' ' ' | sed 's/|/\\|/g')
  echo "| \`$model\` | $total | $tokens | $notes |" >> "$OUT"
done
echo "" >> "$OUT"

# Generation timings
echo "## Generation timings" >> "$OUT"
echo "" >> "$OUT"
echo "Cold-loaded per benchmark. Total = cold load + prompt eval + generation." >> "$OUT"
echo "" >> "$OUT"
echo "| Model | Oi | Snake.py | Snake.html | Tetris | Todo | Calc | Markdown | Tokens total |" >> "$OUT"
echo "|---|---|---|---|---|---|---|---|---|" >> "$OUT"
jq -r '
  .[] |
  "| `\(.model)` | \((.timings.oi.total_s // 0)|tostring[0:5])s | \((.timings["snake-pygame"].total_s // 0)|tostring[0:5])s | \((.timings["snake-html"].total_s // 0)|tostring[0:5])s | \((.timings.tetris.total_s // 0)|tostring[0:5])s | \((.timings.todo.total_s // 0)|tostring[0:5])s | \((.timings.calc.total_s // 0)|tostring[0:5])s | \((.timings.markdown.total_s // 0)|tostring[0:5])s | \(.total_tokens) |"
' "$LEADERBOARD" >> "$OUT"
echo "" >> "$OUT"

echo "## Methodology notes" >> "$OUT"
cat >> "$OUT" <<'TAIL'

### Why pairwise vision?
Independent 0-5 scoring from small vision models (qwen3.6-plus) couldn't
reliably distinguish polished UIs from plain ones — every app scored 3/5.
Switching to pairwise comparisons with Opus 4.7 produced consistent,
distinguishing rankings that aligned with human judgment.

### Why Elo?
Pairwise comparisons need an aggregation method. Elo gives each model a
continuous skill rating that captures both how often they win AND who they beat
— beating a strong model counts more than beating a weak one.

### Why efficiency as a score component?
A model that scores 20/30 functional with 30K tokens is less useful than one
scoring 18/30 with 10K tokens. The 15-point efficiency factor rewards models
that produce working code without rambling.

### Why "make it beautiful" without specifying?
If you have to ask for glassmorphism and gradients by name, you're testing
instruction following, not design taste. A good 2026 coder LLM should know
what "modern web app" means without a checklist.

TAIL

echo "✓ Generated $OUT"
echo "Preview:"
head -40 "$OUT"
