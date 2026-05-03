#!/usr/bin/env node
// Build leaderboard from all collected data.
//
// Inputs:
//   caxi-results/{bench}-{model}.json         — Playwright functional scores
//   caxi-results/pairwise-{bench}-A-vs-B.json — Opus pairwise judgments
//   caxi-results/snake-pygame-review-*.json   — Opus code reviews
//   caxi-results/oi-quality-*.json            — Opus text quality
//   raw/{bench}-{model}.json                  — Ollama timings + eval_count
//   output/snake-pygame/{model}.py            — syntax check
//
// Outputs:
//   caxi-results/LEADERBOARD.json             — structured data
//   Console table

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const BENCH_DIR = join(import.meta.dirname, '..');
const RESULTS = join(BENCH_DIR, 'caxi-results');
const RAW = join(BENCH_DIR, 'raw');
const OUTPUT = join(BENCH_DIR, 'output');

const WEB_BENCHES = ['snake-html', 'tetris', 'todo', 'calc', 'markdown'];

function jsonRead(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

// ---------- discover models from oi raw files ----------
const models = readdirSync(RAW)
  .filter((f) => f.startsWith('oi-') && f.endsWith('.json'))
  .map((f) => f.replace(/^oi-/, '').replace(/\.json$/, ''))
  .sort();

if (models.length === 0) {
  console.error('no models found — run bench.sh first');
  process.exit(1);
}

// ---------- aggregate per-model data ----------
const data = {};
for (const m of models) {
  data[m] = {
    model: m.replace(/--/g, ':'),
    safe: m,

    // Functional scores + max possible
    functional: {
      'snake-html': { score: 0, max: 6 },
      'tetris':     { score: 0, max: 8 },
      'todo':       { score: 0, max: 8 },
      'calc':       { score: 0, max: 7 },
      'markdown':   { score: 0, max: 8 },
    },
    // Pygame
    pygame_syntax_ok: false,
    pygame_review: null,   // Opus score 0-50
    // oi
    oi_quality: null,      // Opus score 0-40
    oi_tokens: 0,

    // Ollama timings (seconds)
    timings: {},   // benchmark → { load_s, total_s, eval_count }

    // Elo ratings per benchmark
    elo: {},
  };

  // functional
  for (const b of Object.keys(data[m].functional)) {
    const f = jsonRead(join(RESULTS, `${b}-${m}.json`));
    if (f) data[m].functional[b].score = f.score || 0;
  }

  // pygame syntax check
  const pyPath = join(OUTPUT, 'snake-pygame', `${m}.py`);
  if (existsSync(pyPath)) {
    try {
      execSync(`python3 -c "import ast; ast.parse(open('${pyPath}').read())"`, { stdio: 'pipe' });
      data[m].pygame_syntax_ok = true;
    } catch {}
  }

  // pygame review (opus)
  const review = jsonRead(join(RESULTS, `snake-pygame-review-${m}.json`));
  if (review) data[m].pygame_review = review.total || 0;

  // oi quality (opus)
  const oi = jsonRead(join(RESULTS, `oi-quality-${m}.json`));
  if (oi) {
    data[m].oi_quality = oi.total || 0;
    data[m].oi_tokens = oi.tokens_used || 0;
  }

  // timings
  for (const b of ['oi', 'snake-pygame', 'snake-html', 'tetris', 'todo', 'calc', 'markdown']) {
    const r = jsonRead(join(RAW, `${b}-${m}.json`));
    if (r) {
      data[m].timings[b] = {
        load_s: (r.load_duration || 0) / 1e9,
        total_s: (r.total_duration || 0) / 1e9,
        eval_count: r.eval_count || 0,
      };
    }
  }
}

// ---------- Elo per benchmark from pairwise comparisons ----------
const K = 32;
function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

for (const b of WEB_BENCHES) {
  for (const m of models) data[m].elo[b] = 1000;

  // Load all pairwise results for this benchmark
  const pairFiles = readdirSync(RESULTS).filter((f) => f.startsWith(`pairwise-${b}-`) && f.endsWith('.json'));
  for (const f of pairFiles) {
    const p = jsonRead(join(RESULTS, f));
    if (!p || !p.winner) continue;
    const match = f.match(new RegExp(`pairwise-${b}-(.+)-vs-(.+)\\.json`));
    if (!match) continue;
    const [, A, B] = match;
    if (!data[A] || !data[B]) continue;

    // Score: winner=1, tie=0.5. Scale K by delta (0=tie, 1=slight, 2=clear, 3=landslide)
    let scoreA;
    const delta = Math.max(0, Math.min(3, p.delta || 0));
    const effectiveK = K * ((delta + 1) / 4);  // delta=0 → K/4, delta=3 → K
    if (p.winner === 'A')       scoreA = 1;
    else if (p.winner === 'B')  scoreA = 0;
    else                        scoreA = 0.5;

    const expA = expected(data[A].elo[b], data[B].elo[b]);
    const expB = 1 - expA;
    data[A].elo[b] += effectiveK * (scoreA - expA);
    data[B].elo[b] += effectiveK * ((1 - scoreA) - expB);
  }
}

// ---------- Composite scoring ----------
// Weighting (must sum to ~100):
//   Functional total       → 30 pts
//     todo/8*6 + snake/6*4 + tetris/8*6 + calc/7*4 + markdown/8*6 + pygame_syntax(4)
//   Opus visual (Elo)      → 30 pts
//     Scale each benchmark's Elo from [min, max] across all models → 0-6, sum = 30 max
//   Opus pygame review     → 15 pts (total / 50 * 15)
//   Opus oi quality        → 10 pts (total / 40 * 10)
//   Efficiency             → 15 pts (lower tokens per functional point = better)

for (const m of models) {
  const d = data[m];
  const f = d.functional;

  // Functional: normalize each to its max, weight
  const funcScore =
    (f.todo.score / f.todo.max) * 6 +
    (f['snake-html'].score / f['snake-html'].max) * 4 +
    (f.tetris.score / f.tetris.max) * 6 +
    (f.calc.score / f.calc.max) * 4 +
    (f.markdown.score / f.markdown.max) * 6 +
    (d.pygame_syntax_ok ? 4 : 0);

  d.functional_score = funcScore;  // 0-30

  d.pygame_review_score = d.pygame_review != null ? (d.pygame_review / 50) * 15 : 0;
  d.oi_quality_score    = d.oi_quality != null ? (d.oi_quality / 40) * 10 : 0;

  // Efficiency: total tokens across benchmarks / total functional points earned
  let tokens = 0;
  for (const b of WEB_BENCHES) tokens += d.timings[b]?.eval_count || 0;
  tokens += d.timings['snake-pygame']?.eval_count || 0;
  d.total_tokens = tokens;
}

// Normalize Elo per benchmark → 0-6 pts
for (const b of WEB_BENCHES) {
  const elos = models.map((m) => data[m].elo[b]);
  const min = Math.min(...elos);
  const max = Math.max(...elos);
  const range = max - min || 1;
  for (const m of models) {
    data[m][`visual_${b}`] = ((data[m].elo[b] - min) / range) * 6;
  }
}

for (const m of models) {
  const d = data[m];
  d.visual_score = WEB_BENCHES.reduce((s, b) => s + (d[`visual_${b}`] || 0), 0);  // 0-30
}

// Efficiency: lower tokens per functional point = better. Normalize to 0-15.
const effRaw = models.map((m) => {
  const d = data[m];
  return d.functional_score > 0 ? d.total_tokens / d.functional_score : Infinity;
});
const effMin = Math.min(...effRaw.filter((x) => isFinite(x)));
const effMax = Math.max(...effRaw.filter((x) => isFinite(x)));
for (let i = 0; i < models.length; i++) {
  const d = data[models[i]];
  const r = effRaw[i];
  if (!isFinite(r) || effMax === effMin) {
    d.efficiency_score = 0;
  } else {
    // Invert: lower raw is better
    d.efficiency_score = ((effMax - r) / (effMax - effMin)) * 15;
  }
}

// Total
for (const m of models) {
  const d = data[m];
  d.total = d.functional_score + d.visual_score + d.pygame_review_score + d.oi_quality_score + d.efficiency_score;
}

// ---------- Output ----------
const ranked = models.map((m) => data[m]).sort((a, b) => b.total - a.total);

writeFileSync(join(RESULTS, 'LEADERBOARD.json'), JSON.stringify(ranked, null, 2));

console.log('\n🏆 LEADERBOARD (out of 100)\n');
console.log('  #  Model                                Func  Visual  PyCR   Oi   Effi  TOTAL');
console.log('  ' + '-'.repeat(85));
ranked.forEach((d, i) => {
  console.log(
    `  ${String(i+1).padStart(2)}  ${d.model.padEnd(35)} ` +
    `${d.functional_score.toFixed(1).padStart(4)}/30 ` +
    `${d.visual_score.toFixed(1).padStart(5)}/30 ` +
    `${d.pygame_review_score.toFixed(1).padStart(4)}/15 ` +
    `${d.oi_quality_score.toFixed(1).padStart(4)}/10 ` +
    `${d.efficiency_score.toFixed(1).padStart(4)}/15 ` +
    `${d.total.toFixed(1).padStart(5)}/100`
  );
});

console.log(`\nSaved: ${join(RESULTS, 'LEADERBOARD.json')}`);
