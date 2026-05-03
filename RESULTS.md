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

## 🏆 Leaderboard

| # | Model | Func /30 | Visual /30 | PyCR /15 | Oi /10 | Effi /15 | **Total /100** |
|---|---|---|---|---|---|---|---|
| 1 | `gemma4-26b-mlx-bf16` | 27 | 21 | 9 | 10 | 12 | **79** |
| 2 | `qwen3-coder-next` | 28 | 14 | 9 | 10 | 15 | **76** |
| 3 | `laguna-xs.2` | 18 | 22 | 7 | 8 | 9 | **64** |
| 4 | `qwen3.5-35b-a3b-coding-nvfp4` | 26 | 6 | 9 | 10 | 13 | **64** |
| 5 | `qwen3-coder-30b` | 24 | 5 | 12 | 10 | 12 | **63** |
| 6 | `gpt-oss-20b` | 19 | 16 | 13 | 10 | 0 | **58** |

## Functional scores per benchmark

| Model | Todo /8 | Snake /6 | Tetris /8 | Calc /7 | Markdown /8 | Pygame |
|---|---|---|---|---|---|---|
| `gemma4-26b-mlx-bf16` | 7/8 | 4/6 | 7/8 | 7/7 | 8/8 | ✅ |
| `qwen3-coder-next` | 8/8 | 5/6 | 7/8 | 7/7 | 7/8 | ✅ |
| `laguna-xs.2` | 7/8 | 4/6 | 3/8 | 6/7 | 1/8 | ✅ |
| `qwen3.5-35b-a3b-coding-nvfp4` | 7/8 | 4/6 | 6/8 | 7/7 | 8/8 | ✅ |
| `qwen3-coder-30b` | 7/8 | 6/6 | 8/8 | 7/7 | 1/8 | ✅ |
| `gpt-oss-20b` | 5/8 | 4/6 | 7/8 | 3/7 | 2/8 | ✅ |

## Visual polish — Elo ratings (higher = better)

Via Opus 4.7 pairwise comparisons across all model combinations.

| Model | Snake HTML | Tetris | Todo | Calc | Markdown |
|---|---|---|---|---|---|
| `gemma4-26b-mlx-bf16` | 1030 | 1017 | 994 | 1056 | 1002 |
| `qwen3-coder-next` | 1032 | 965 | 1004 | 981 | 1020 |
| `laguna-xs.2` | 987 | 1020 | 1052 | 996 | 1032 |
| `qwen3.5-35b-a3b-coding-nvfp4` | 1018 | 971 | 971 | 967 | 973 |
| `qwen3-coder-30b` | 948 | 993 | 972 | 973 | 993 |
| `gpt-oss-20b` | 984 | 1034 | 1008 | 1026 | 981 |

## Pygame code review — Opus 4.7 rubric

Each dimension scored 0-10; total out of 50.

| Model | Total /50 | Notes |
|---|---|---|
| `gemma4-26b-mlx-bf16` | 31 | The game works and covers the basics (controls, food, self-collision, restart, score), but uses recursive gameLoop() for restart which risks stack growth, and mixes float coordinates with equality checks for food collision that work only because of grid alignment. Naming is inconsistent (snake_List, Length_of_snake vs snake_head), magic numbers like 20.0 are hardcoded instead of using BLOCK_SIZE, and there's little separation of concerns with one large function holding all state.  |
| `gpt-oss-20b` | 44 | Clean class-based structure with proper separation of input/update/render, correct use of deque, 180° turn prevention, and collision logic. Minor issues: font is re-created every draw_text call (inefficient), no pygame.quit() on normal loop exit paths beyond sys.exit, and the pending_dir check only blocks reversal relative to current direction (fast multi-key presses within one tick could still reverse). Overall a solid, playable implementation with good docstrings and UX (restart, speed scaling, clear game over screen).  |
| `laguna-xs.2` | 24 | Critical bug: calls `your_score()` on the game-over screen but the function is defined as `our_score()`, causing a NameError the moment the player loses. Restart via recursive `game_loop()` call risks stack growth and leaves outer loops dangling. Magic numbers, inconsistent naming (snake_List, Length_of_snake), and no grid alignment for the starting position mean food collision via `==` can be fragile.  |
| `qwen3-coder-30b` | 39 | Clean OOP structure with Snake/Food/Game classes and solid direction-reversal prevention. Notable weaknesses: food randomize-on-snake check only loops once (could still spawn on snake), unused imports (math, sys partially), and no handling of key presses during the same tick that could still cause 180° turns if two keys pressed between updates. UX is good with eyes, grid, score, and restart, though fixed FPS=10 never increases difficulty.  |
| `qwen3-coder-next` | 29 | The game works for basic play but has bugs: snake_speed is modified as a local variable despite being a global (UnboundLocalError will occur when eating food), and restart uses recursion instead of a loop which could stack overflow. Mixed naming conventions (snake_List, Length_of_snake, gameLoop), many magic numbers, and globals scattered throughout hurt architecture. UX is decent with score display, restart prompt, and reverse-direction prevention, but using `quit()` after pygame.quit() and the recursive restart are questionable.  |
| `qwen3.5-35b-a3b-coding-nvfp4` | 31 | Classic working snake implementation with proper event handling, collision detection, and restart functionality. Weaknesses include inconsistent naming (snake_List, Length_of_snake mixing conventions), recursive gameLoop() call on restart which grows the stack, magic number 20 hardcoded instead of using BLOCK_SIZE, and heavy reliance on local state rather than a Snake/Game class. No food-on-snake check when respawning food, and quit() after pygame.quit() is redundant.  |

## Oi text quality — Opus 4.7 rubric

Greetings in Portuguese. Scored on language, conciseness, tone, cleanliness.

| Model | Total /40 | Tokens | Notes |
|---|---|---|---|
| `gemma4-26b-mlx-bf16` | 40 | 166 | Perfect short, warm Portuguese greeting that offers help. No artifacts, though the token count seems high for such a brief output.  |
| `gpt-oss-20b` | 39 | 73 | Clean, friendly Portuguese greeting with a natural follow-up offer to help. Token count seems high for such a short output, but the visible response itself is ideal.  |
| `laguna-xs.2` | 30 | 13 | The response is clean, short, and polite, but it replies entirely in English instead of Portuguese, which mismatches the 'oi' greeting.  |
| `qwen3-coder-30b` | 40 | 12 | Perfect concise Portuguese greeting with a friendly offer to help. No artifacts or issues.  |
| `qwen3-coder-next` | 40 | 14 | Perfect short, friendly Portuguese reply with a warm emoji and offer to help. No artifacts.  |
| `qwen3.5-35b-a3b-coding-nvfp4` | 40 | 999 | Perfect friendly Portuguese greeting with a natural follow-up question. However, the 999 token generation count is suspicious given the short visible output — possible hidden content, but the displayed response itself is ideal.  |

## Generation timings

Cold-loaded per benchmark. Total = cold load + prompt eval + generation.

| Model | Oi | Snake.py | Snake.html | Tetris | Todo | Calc | Markdown | Tokens total |
|---|---|---|---|---|---|---|---|---|
| `gemma4-26b-mlx-bf16` | 39.70s | 75.64s | 122.3s | 179.2s | 137.9s | 112.3s | 97.15s | 24448 |
| `qwen3-coder-next` | 12.19s | 44.12s | 102.3s | 149.6s | 117.2s | 121.1s | 93.78s | 20615 |
| `laguna-xs.2` | 8.541s | 30.09s | 80.04s | 135.6s | 67.91s | 50.13s | 69.61s | 18749 |
| `qwen3.5-35b-a3b-coding-nvfp4` | 14.33s | 23.65s | 48.60s | 53.83s | 55.99s | 52.22s | 60.02s | 22762 |
| `qwen3-coder-30b` | 5.151s | 27.52s | 48.83s | 68.39s | 41.35s | 31.33s | 50.81s | 21379 |
| `gpt-oss-20b` | 4.763s | 27.95s | 33.05s | 35.10s | 42.31s | 37.81s | 259.8s | 28381 |

## Methodology notes

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

