# AGENTS.md — local-llm-bench

Rules and hard-won knowledge for AI coding assistants working on this repo.

## Core principle

This is a **benchmark framework for LOCAL LLMs**. Everything runs via Ollama's local HTTP API, no cloud dependencies in the runtime. Keep it that way.

---

## Architecture decisions (read before changing anything)

### Why HTTP API, not `ollama run`

**Critical — do NOT "simplify" this back to piping prompts through `ollama run`.**

We tried `ollama run` first. It failed in three different ways:

1. **Stdin piping concatenates prompts into ONE.** Piping `oi\ngive me a snake pygame\n/bye\n` to `ollama run --verbose` does NOT produce two sequential responses — the model sees the whole thing as a single user turn and replies once (often echoing the prompt back: "User said: oi, give me a snake..."). This destroys the cold/warm timing split.
2. **ANSI escape codes pollute everything.** Even with stdin redirection, `ollama run --verbose` emits terminal cursor codes (`\u001b[?25l\u001b[?25h`) between every token, interleaved into the "log". Extracting ```python code blocks breaks because ` ```python ` becomes ` ```\u001b[?25l\u001b[?25hpython\u001b[?25l\u001b[?25h`.
3. **No reliable way to get per-prompt timings.** You get one combined timing block at the end, not one per prompt.

The HTTP API (`POST /api/generate`) solves all three:
- One API call = one prompt = one JSON response with clean `response`, `load_duration`, `total_duration`, `eval_count`, `prompt_eval_count`, `eval_duration`, `prompt_eval_duration`
- No TTY, no ANSI
- `keep_alive` keeps the model loaded between calls → sequential API calls to the same model capture the cold/warm split naturally

### Why the cold/warm timing split matters

Every benchmark sequence does:

```
1. ollama stop <all models>   — guarantees cold state
2. API call 1 (e.g. "oi")     — load_duration = cold load cost
3. API call 2 (e.g. snake)    — load_duration ~50ms because model still loaded via keep_alive
```

This gives you TWO useful numbers per model:
- **Cold load time** — how fast can you START using this model?
- **Warm generation time** — how fast does actual work happen?

Users care about both. Raw speed ignores that a "fast" model with a 1-minute cold load is painful for short interactions. The historical data in `RESULTS.md` treats these as separate axes.

### Why JSON config, not YAML

We started with YAML. Swapped to JSON because:
- `yq` is not in Homebrew core (need tap or GitHub release)
- `pyyaml` would add a Python dependency just for config
- `jq` is already required for parsing API responses, and every dev machine has it
- JSON is good enough — we don't need YAML's multiline strings or anchors

If you're tempted to add `yq`: don't. Stay with `jq`.

### Why bash, not Python

The whole runner is bash. Reasoning:
- No venv, no pip, no pyproject.toml — just `brew install jq ollama` and go
- `curl | jq` is the dominant pattern; bash is the natural fit
- Validators are also bash — one language to maintain
- Python shows up ONLY where necessary: syntax-checking pygame artifacts (`python3 -c "import ast; ast.parse(...)"`)

If you want Python for something: first ask whether `jq`, `awk`, or `sed` can do it. Usually yes.

### Why short prompts

Prompts are deliberately underspecified:
- "build me a modern todo app as a single HTML file. make it beautiful."
- NOT: "build me a todo app with localStorage persistence, dark mode toggle, glassmorphism, gradient accents, smooth animations..."

**If you have to spec "use glassmorphism", you're testing instruction-following, not coding skill.** A good 2026-era coder LLM should know what "modern" and "beautiful" mean. That's the actual benchmark — does the model have the right priors?

If you add a benchmark with a long checklist prompt, you're measuring a different thing. That's fine, but call it out in the README.

---

## Hard-won knowledge (gotchas)

### Ollama

- `ollama pull` is idempotent. Re-running a benchmark won't re-download an already-cached model. Don't skip the pull step as an "optimization" — it's cheap and it's the clearest place to fail fast on a bad tag.
- Some models require a specific Ollama version. `laguna-xs.2` needs 0.22+. If pull fails with `412`, read the error — it'll tell you to upgrade. Don't silently retry.
- `ollama ps | awk 'NR>1 {print $1}'` gives you loaded models. Stop them all before a benchmark run to guarantee cold state.
- Models stay loaded for `keep_alive` duration after last use. Default is 5m; we set 10m to survive benchmark sequences with slow intermediate steps.

### Model tag verification

Before adding to `bench.config.json`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ollama.com/library/<tag-base>
# 200 = exists, 404 = doesn't exist
```

`<tag-base>` is everything BEFORE the colon. For `devstral:24b`, probe `devstral` (not `devstral:24b`). The HTML page lists available tags.

**Do not guess tags.** Models named like `qwen3.6-coder:30b` might sound plausible but not exist. Verify.

### Disk space

Ollama model cache grows fast. Real observations:
- `qwen3.6:27b-mlx-bf16` = 54 GB
- `qwen3-coder-next` = 51 GB
- `gemma4:26b-mlx-bf16` = 51 GB

A full `./bench.sh` run with 10 models can eat 200+ GB. Before kicking off an overnight run:

```bash
df -h /
du -sh ~/.ollama/models
```

If `df` shows <50 GB free, abort and clean up. Our past run hit "no space left on device" mid-benchmark and silently failed 3/4 models.

### Python global declaration bug (LLM classic)

Common failure pattern in generated snake/tetris code:

```python
def main():
    FPS = 10          # or reads from module scope
    while running:
        clock.tick(FPS)
        # ...
        if score % 5 == 0:
            global FPS    # <-- TOO LATE — FPS already used above in this scope
            FPS += 1
```

`SyntaxError: name 'FPS' is used prior to global declaration`.

Fix: move `global FPS` to the top of the function. Some models (gpt-oss:20b) produce this exact bug. Syntax validators catch it.

### caxi gotchas

Full reference lives in the main ilha `AGENTS.md`, but the essentials for validators:

- `caxi eval` wraps input as `() => (<expr>)`. **Semicolons break it.**
- Single expression: `caxi eval "document.title"` — works
- Multi-statement: use function declaration — `caxi eval "function f() { const x=1; return x }"` (auto-invoked)
- Broken: `caxi eval "const x = 1; return x"` — fails with `Unexpected token ';'`
- Comma operator works: `caxi eval "(window.x = 42, window.x)"`
- Installation: `npm install -g @kunchenguid/chrome-devtools-axi`. Some dev machines that use a restricted npm registry may need a wrapper that swaps `~/.npmrc` to the public registry before invocation (common in enterprise setups where the default registry is internal).
- File URLs for local HTML: `caxi open "file://$(pwd)/output/todo/laguna-xs.2.html"` — absolute path required.

### Token counts are more honest than tok/s

A model that generates at 80 tok/s but burns 3,000 "thinking" tokens before coding is SLOWER than a model at 40 tok/s that writes 1,000 direct tokens. Always look at `eval_count` alongside `eval_rate`.

Examples from our runs:
- `glm-4.7-flash`: 63 tok/s but 3,309 tokens for a snake → 53s total
- `laguna-xs.2`: 58 tok/s, 1,198 tokens → 21s total

Per-token speed looks similar. Total time is 2.5x different.

---

## Benchmark design principles

### Correctness > speed, always

The first time we shipped results, we called `gpt-oss:20b` the "fastest snake" at 15.58s. Then tried to run the generated code. `SyntaxError`. It didn't even execute.

Speed rankings are MEANINGLESS without a correctness gate. Every benchmark MUST have a validator that checks the artifact actually works. No exceptions.

Minimum validator bar:
- Non-empty artifact
- Syntax-valid (for code files)
- Loads without errors (for web files)
- Basic structural checks (has_canvas, has_input, etc.)

### Why we validate BOTH function and polish (todo benchmark)

Functional-only checks produce boring rankings — every half-decent model will pass basic snake/todo functional tests. Polish scoring differentiates the winners.

Our polish signals (easy to grep from HTML):
- `--css-variables` / `var(--x)` — modern CSS
- `border-radius` — rounded corners, default-ugly rejection
- `box-shadow` — depth, not flat
- `linear-gradient` / `radial-gradient` — modern backgrounds
- `transition` / `animation` — micro-interactions
- `localStorage` — actual state management, not just UI

These are CHEAP checks (grep) but they differentiate well. A model that returns Times-New-Roman-on-white-with-blue-underlines fails every signal. A model that returns glassmorphic-gradient-animated-with-dark-mode passes them all.

### What NOT to benchmark

- **Synthetic multiple-choice tests** — we're not HumanEval. We care if code runs.
- **One-liners** — tests trivia, not engineering. Single prompt = at least a full file worth of output.
- **Prompts the model has memorized** — classic FizzBuzz, basic fibonacci. Too much training data, zero discrimination.
- **Anything requiring one-person's subjective taste** — if only one human can grade it, it's not automatable.

### When to retire a benchmark

If 9/10 models pass with a perfect score, the benchmark is too easy. Replace it or raise the bar.

Snake-pygame is already showing this pattern — most models pass functionally, only the worst fail. That's why we added Tetris (harder — piece rotation and gravity are LLM bug-magnets) and Todo (polish scoring differentiates).

---

## Repo rules

### No PII

This repo is **public**. Before committing:

- No absolute paths like `/Users/<username>/...` — use `$HOME`, `~`, or relative paths
- No internal company URLs, Slack channels, internal tool names
- No personal contact info or real names in prose
- Commit messages neutral and professional — "Add tetris benchmark" not "<name>'s tetris test"

### File layout

```
bench.sh                      — orchestrator (bash, uses jq)
bench.config.json             — models + benchmarks list
prompts/<name>.txt            — one prompt per benchmark
validators/<name>.sh          — validator per benchmark (optional)
output/<bench>/<model>.<ext>  — generated artifacts (committed)
logs/<bench>-<model>.log      — human-readable timing logs (committed)
raw/<bench>-<model>.json      — raw API responses (gitignored — too noisy)
caxi-results/                 — validator output + screenshots (committed)
screenshots/                  — manual screenshots (committed)
```

### When adding a new benchmark

ALL of these, or don't commit:

1. `prompts/<name>.txt` — short, test-what-model-knows prompt
2. `validators/<name>.sh` — see validator contract below
3. Entry in `bench.config.json` `benchmarks` array
4. Brief row in README benchmark table
5. Verify `./bench.sh --only <name> --model qwen3:1.7b --force` works end-to-end on a tiny cached model

### When adding a new model

1. Verify tag exists (see "Model tag verification" above)
2. Append to `models` array in `bench.config.json`
3. Run `./bench.sh --model <tag>` to populate outputs
4. Update RESULTS.md with the new model's row and timings

### Validator contract

```
Usage: validators/<name>.sh <artifact-file> <model> <results-dir>
Stdout: human-readable status line (printed during run)
Exit: 0 = pass, non-zero = fail
Must write: <results-dir>/<benchmark>-<safe-model>.json
Must contain at minimum:
  {"model": "<tag>", "benchmark": "<name>", "pass": true|false}
```

Validators are BASH, not Python. Dependencies: `jq`, `caxi` (for web), `python3` (for pygame syntax). No node, no npm packages beyond what `caxi` brings.

The `<safe-model>` is the model tag with `:` and `/` replaced by `-`. The main script does this; validators just use `$2 | tr ':/' '--'`.

### Code style

- Bash: `set -uo pipefail`, shellcheck-clean
- Functions: `lowercase_with_underscores`
- Constants: `UPPERCASE`
- Comment WHY, not WHAT
- No `echo "===== starting ====="` debug spam. Use the `log()` helper.

### Git hygiene

- Never `git add -A` or `git add .` — stage explicitly
- `raw/` is gitignored (too big, regenerable)
- `screenshots/` IS committed (manual captures, hard to regenerate)
- Commit messages: `feat:`, `fix:`, `docs:`, `chore:` conventional prefix
- One logical change per commit. Don't bundle "add tetris" with "refactor timing logic".

---

## Debug checklist

When a benchmark run fails or produces weird results, check in this order:

1. **Disk space**: `df -h /` — if <20 GB free, that's your problem
2. **Ollama version**: `ollama --version` — if a new model fails with 412, upgrade
3. **Is Ollama running?**: `curl -s http://localhost:11434/api/version` should return JSON
4. **Model actually loaded?**: `ollama ps` before and after a run
5. **Raw response intact?**: `jq . raw/<bench>-<model>.json` — should show full response + timings
6. **Code extraction worked?**: check `output/<bench>/<model>.<ext>` is non-empty
7. **Validator ran?**: check `caxi-results/<bench>-<model>.json` exists

### Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error: pull model manifest: 412` | Ollama too old | `brew upgrade ollama` |
| `No space left on device` | Disk full | `ollama rm <big-model>`, then retry |
| Empty `output/<bench>/<model>.ext` | Model didn't use expected code fence | Check `logs/<bench>-<model>.log` manually, relax extraction regex |
| Validator always fails | Artifact malformed OR validator too strict | Run validator manually with `-x` shell trace |
| Timings look wrong (load=0ms) | Model was already warm | `ollama stop` before the run |
| Many models fail at once | Ollama crashed | Restart the ollama app, check `ollama ps` |

---

## Testing changes

Before committing a change to `bench.sh`:

```bash
# Smoke test: tiny cached model, one benchmark
./bench.sh --model qwen3:1.7b --only oi --force
```

Before committing a validator:

```bash
# Against a known-good artifact
./validators/todo.sh output/todo/qwen3-coder--30b.html qwen3-coder:30b caxi-results
cat caxi-results/todo-qwen3-coder--30b.json | jq .
```

Before pushing a config change:

```bash
# Must parse without error
jq . bench.config.json > /dev/null && echo OK
```

---

## Historical context

### v1 runner (deprecated)

The first `bench.sh` used `printf '%s' "$PROMPT" | ollama run '$MODEL' --verbose`. It failed in three different overnight runs before we converted to the HTTP API approach. Artifacts from that era:

- `bench-run.log` / `bench-run-v2.log` in `raw/` — both show the failure modes
- Old logs for `devstral-24b`, `qwen3-coder-next`, `glm-4.7-flash` from 2026-04-28 had ANSI escape codes and single combined responses; they were re-run with the HTTP API on 2026-04-29.

Don't resurrect the `ollama run` approach. It is a trap.

### Why `RESULTS.md` mixes old and new data

The older models (qwen3-coder:30b, gpt-oss:20b, both gemma4 variants, qwen3.5, qwen3.6) were benchmarked manually before the runner existed, by copy-pasting `ollama run` output into Obsidian notes. Those timings are accurate because they came from a real interactive session (two separate prompts, model stayed loaded naturally).

The newer models (laguna-xs.2, qwen3-coder-next, devstral:24b, glm-4.7-flash) were benchmarked via the HTTP API runner.

Both approaches produce comparable cold/warm timings. Re-running the old models through the runner should produce similar numbers ±10%. If they diverge significantly, investigate.
