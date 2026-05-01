# AGENTS.md — local-llm-bench

Rules for AI coding assistants working on this repo.

## Core principle

This is a **benchmark framework for LOCAL LLMs**. Everything runs via Ollama's local HTTP API, no cloud dependencies in the runtime. Keep it that way.

## Repo rules

### No PII

This repo is **public**. Before committing anything:

- No absolute paths like `/Users/<username>/...` — use `$HOME` or relative paths
- No internal company URLs, Slack channels, internal tool names
- No personal contact info, real names in prose
- Keep commit messages professional and neutral ("Add tetris benchmark" not "Sergio's Tetris test")

### File layout

```
bench.sh                  — orchestrator (bash, uses jq)
bench.config.json         — models + benchmarks list
prompts/<name>.txt        — one prompt per benchmark
validators/<name>.sh      — validator per benchmark (optional)
output/<bench>/<model>.ext — generated artifacts (committed)
logs/<bench>-<model>.log   — human-readable timing logs (committed)
raw/<bench>-<model>.json   — raw API responses (gitignored — too noisy)
caxi-results/             — validator output + screenshots (committed)
screenshots/              — manual screenshots (committed)
```

### When adding a new benchmark

ALL of:
1. `prompts/<name>.txt` — short, test-what-model-knows prompt
2. `validators/<name>.sh` — see validator contract in README
3. Entry in `bench.config.json` `benchmarks` array
4. Brief row in README benchmark table
5. Verify `./bench.sh --only <name> --model laguna-xs.2 --force` works

Don't commit without all 5.

### When adding a new model

1. Verify tag exists: `curl -s -o /dev/null -w "%{http_code}" https://ollama.com/library/<tag-base>`
2. Append to `models` array in `bench.config.json`
3. Run `./bench.sh --model <tag>` to populate outputs
4. Update RESULTS.md with the new model's row

### Validator rules

Validators are BASH, not Python. Dependencies: `jq`, `caxi` (for web), `python3` (for pygame syntax). No node, no npm packages beyond what `caxi` brings.

Output JSON MUST have at minimum:
```json
{"model": "<tag>", "benchmark": "<name>", "pass": true|false}
```

## Code style

- Bash: `set -uo pipefail`, shellcheck-clean
- Functions use lowercase_with_underscores
- Constants UPPERCASE
- Comment WHY, not WHAT

## Git hygiene

- Never `git add -A` or `git add .` — stage files explicitly
- `raw/` is gitignored (too big, regenerable)
- `screenshots/` IS committed (manual captures, hard to regenerate)
- Commit messages: `feat:`, `fix:`, `docs:` conventional prefix

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
cat caxi-results/todo-qwen3-coder--30b.json
```
