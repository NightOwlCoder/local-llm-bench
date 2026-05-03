# local-llm-bench

Extensible benchmark framework for local coder LLMs running on [Ollama](https://ollama.com).

It prompts each model to build real apps/games, saves the generated artifacts, drives them with Playwright, and optionally uses Claude Opus via Bedrock for visual/code/text judging.

## Why

Most LLM benchmarks are synthetic. This one:

- Asks the model to **actually build something**: todo app, Tetris, snake, calculator, markdown previewer
- Saves the output as real files you can open and run
- Validates behavior with **Playwright**, not screenshots or HTML greps
- Scores visual polish with pairwise Opus judgments
- Tracks cold load time, generation time, token count, functional pass/fail, visual ranking, and efficiency

## Quick start

```bash
git clone https://github.com/NightOwlCoder/local-llm-bench
cd local-llm-bench

brew install jq ollama
npm install
npx playwright install chromium

# Edit bench.config.json if you want different models
./bench.sh
```

For the full leaderboard with Opus judgments:

```bash
export AWS_PROFILE=your-bedrock-profile
./scripts/run-full-benchmark.sh
```

If you only want local functional validation, run `./bench.sh`. The Opus judging step is optional.

## Configuration

Edit `bench.config.json`:

```json
{
  "models": [
    "laguna-xs.2",
    "qwen3-coder:30b",
    "your-new-model-here"
  ],
  "benchmarks": [
    {"name": "oi", "ext": "txt"},
    {"name": "todo", "ext": "html"}
  ],
  "runtime": {
    "keep_alive": "10m",
    "timeout_secs": 7200,
    "ollama_url": "http://localhost:11434",
    "skip_if_exists": true
  }
}
```

Re-runs skip existing outputs unless you pass `--force`.

## Benchmarks

| Name | Prompt | Ext | Validator checks |
|---|---|---|---|
| `oi` | `oi` | txt | Non-empty response. Captures cold load time. |
| `snake-pygame` | `give me a snake pygame please` | py | Python syntax valid; Opus code review in full run |
| `snake-html` | `build me a snake game as a single HTML file. make it beautiful.` | html | Playwright drives movement, score, canvas/game state |
| `tetris` | `build me tetris as a single HTML file. make it beautiful.` | html | Playwright validates board, movement, rotation, line/score behavior |
| `todo` | `build me a modern todo app as a single HTML file. make it beautiful.` | html | Playwright adds/completes/filters/deletes todos and checks persistence/counters |
| `calc` | See `prompts/calc.txt` | html | Playwright checks precedence, parentheses, decimals, clear behavior |
| `markdown` | See `prompts/markdown.txt` | html | Playwright checks live preview, headings, bold/italic, links, code blocks |

**Why short prompts?** If you have to spec every UI detail, you're testing instruction-following more than model taste. A strong coder model should infer what “modern” and “beautiful” mean.

## Scoring

`./bench.sh` produces functional scores and screenshots.

`./scripts/run-full-benchmark.sh` adds:

- Opus pairwise visual judgments for web artifacts
- Opus code review for pygame artifacts
- Opus text-quality judging for `oi`
- Aggregated leaderboard in `caxi-results/LEADERBOARD.json`
- Rendered `RESULTS.md`

Current score weighting:

- Functional: 30 pts
- Visual polish: 30 pts
- Pygame code review: 15 pts
- Oi response quality: 10 pts
- Efficiency: 15 pts

## Adding a new benchmark

1. Add `prompts/<name>.txt`
2. Add `validators/<name>.sh`
3. Add a Playwright driver under `drivers/<name>.mjs` if it is a web artifact
4. Add `{ "name": "<name>", "ext": "html" }` to `bench.config.json`
5. Smoke test:

```bash
./bench.sh --only <name> --model qwen3:1.7b --force
```

### Validator contract

```
Usage: validators/<name>.sh <artifact-file> <model> <results-dir>
Stdout: human-readable status line
Exit: 0 = pass, non-zero = fail
Must write: <results-dir>/<benchmark>-<safe-model>.json
```

Minimum JSON:

```json
{"model":"<tag>","benchmark":"<name>","pass":true}
```

## Adding a new model

Add it to `models` in `bench.config.json`. Must be a valid Ollama tag.

Check the model page exists:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ollama.com/library/<tag-base>
```

For `devstral:24b`, the tag base is `devstral`.

## Output layout

```
output/<benchmark>/<model>.<ext>   — generated artifacts
logs/<benchmark>-<model>.log       — formatted timing logs
raw/<benchmark>-<model>.json       — raw API response (gitignored)
caxi-results/                      — validator JSONs + screenshots + leaderboard
screenshots/                       — manual screenshots from early exploratory runs
```

`caxi-results/` kept its historical name, but validators now use Playwright.

## CLI flags

```bash
./bench.sh                        # respects skip_if_exists
./bench.sh --force                # regenerate everything
./bench.sh --only todo            # only one benchmark
./bench.sh --model qwen3-coder:30b # only one model
```

Flags combine:

```bash
./bench.sh --only todo --model laguna-xs.2 --force
```

## Results

See [RESULTS.md](RESULTS.md).

## License

MIT
