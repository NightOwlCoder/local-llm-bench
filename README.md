# local-llm-bench

Extensible benchmark framework for local coder LLMs running on [Ollama](https://ollama.com).

Prompts each model, captures real code artifacts, and runs validators (syntax checks, headless Chrome automation) to measure what actually matters: **does the generated code work, and does it look good?**

## Why

Most LLM benchmarks are synthetic multiple-choice tests. This one:
- Asks the model to **actually build something** (todo app, Tetris, snake)
- Saves the output as a real file you can run
- Validates automatically via [caxi](https://github.com/kunchenguid/axi) (headless Chrome DevTools Protocol)
- Tracks load time, generation time, token count, and pass/fail per benchmark

Results across runs are directly comparable. Add a new model, run the bench, see where it lands.

## Quick start

```bash
# Pull repo
git clone https://github.com/NightOwlCoder/local-llm-bench
cd local-llm-bench

# Install deps (macOS)
brew install jq ollama
# caxi optional but recommended for web benchmarks
npm install -g @kunchenguid/chrome-devtools-axi

# Edit bench.config.json — pick your models
# Run
./bench.sh
```

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

Re-runs are cheap: outputs already generated are skipped unless you pass `--force`.

## Benchmarks

| Name | Prompt | Ext | Validator checks |
|---|---|---|---|
| `oi` | "oi" | txt | Non-empty response. Captures cold load time. |
| `snake-pygame` | "give me a snake pygame please" | py | Python syntax valid |
| `snake-html` | "build me a snake game as a single HTML file. make it beautiful." | html | Loads in Chrome, canvas present, no JS errors |
| `tetris` | "build me tetris as a single HTML file. make it beautiful." | html | Loads, canvas present, survives arrow key input |
| `todo` | "build me a modern todo app as a single HTML file. make it beautiful." | html | Functional (input + button + localStorage + filter) + polish (CSS vars, border-radius, shadows, gradient, transitions) |

**Why such short prompts?** If you have to spec "use glassmorphism" the model is cheating. A good 2026-era coder LLM should know what "modern" and "beautiful" mean without being told.

## Adding a new benchmark

1. Drop `prompts/my-bench.txt` with your prompt
2. Drop `validators/my-bench.sh` (optional — contract below)
3. Add `{"name": "my-bench", "ext": "html"}` to `bench.config.json`
4. Run `./bench.sh`

### Validator contract

```
Usage: validators/<name>.sh <artifact-file> <model> <results-dir>
Stdout: human-readable status line
Exit: 0 = pass, non-zero = fail
Must write: <results-dir>/<benchmark>-<safe-model>.json
```

See `validators/todo.sh` for the full pattern (function + polish scoring).

## Adding a new model

Just append to `models` in `bench.config.json`. Must be a valid tag on [ollama.com/library](https://ollama.com/library).

Check availability before adding:
```bash
curl -s -o /dev/null -w "%{http_code}" https://ollama.com/library/<tag-base>
# 200 = exists
```

## Output layout

```
output/<benchmark>/<model>.<ext>   — generated code artifacts (committed)
logs/<benchmark>-<model>.log       — formatted timing logs (committed)
raw/<benchmark>-<model>.json       — raw API response (gitignored — big)
caxi-results/                      — validator JSONs + screenshots (committed)
screenshots/                       — manual screenshots of working games
```

## CLI flags

```bash
./bench.sh                        # respects skip_if_exists
./bench.sh --force                # regenerate everything
./bench.sh --only todo            # only the todo benchmark
./bench.sh --model glm-4.7-flash  # only one model
```

Flags combine:
```bash
./bench.sh --only todo --model laguna-xs.2 --force
```

## Results so far

See [RESULTS.md](RESULTS.md) for the current leaderboard and notes on each model.

## License

MIT
