#!/usr/bin/env node
// Snake-html validator — smarter startup.
//
// Tiers:
//   0. loads_clean    — no JS errors
//   1. has_canvas     — <canvas> OR grid-based (divs) rendering detected
//   2. game_starts    — after trying start patterns, something rendered non-blank
//   3. loop_alive     — after an initial direction key, screen changes over 2s
//   4. input_responds — additional arrow keys further change the screen
//   5. has_score      — visible score text
//
// Smart startup: tries click Start button, Space, Enter, each arrow, click canvas.
// Stops trying when screenshot hash changes.

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { resolve, join } from 'path';

const [, , artifactArg, resultsDir, safeName] = process.argv;
const artifact = resolve(artifactArg);
const url = `file://${artifact}`;
const screenshot = join(resultsDir, `snake-html-${safeName}.png`);

const result = {
  benchmark: 'snake-html',
  url: "file://<artifact>",
  tiers: {
    loads_clean: false,
    has_canvas: false,
    game_starts: false,
    loop_alive: false,
    input_responds: false,
    has_score: false,
  },
  score: 0,
  hashes: {},
  start_method: null,
  errors: [],
  notes: [],
};

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') jsErrors.push(m.text()); });

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 });
  await page.waitForTimeout(500);
  result.tiers.loads_clean = jsErrors.length === 0;
  if (jsErrors.length) result.errors.push(...jsErrors.slice(0, 3));

  // Canvas OR grid detection — many snakes use divs or CSS grid
  result.tiers.has_canvas = await page.evaluate(() => {
    if (document.querySelector('canvas')) return true;
    // div-grid fallback: look for many small same-sized elements
    const cells = document.querySelectorAll('.cell, .snake-cell, [class*="grid"] > div');
    return cells.length >= 50;
  });

  await focusGame(page);

  const h0 = await hash(page);
  result.hashes.before_start = h0.slice(0, 12);
  result.tiers.game_starts = !(await isFullyBlank(page));

  // Smart start — try everything until screen changes
  const started = await tryStart(page, h0, result);
  if (started) result.start_method = started;

  const h1 = await hash(page);
  result.hashes.after_start = h1.slice(0, 12);

  // For snake, we also need an initial direction before the loop shows movement
  if (h0 === h1) {
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      const h = await hash(page);
      if (h !== h0) { result.hashes.after_start = h.slice(0, 12); break; }
    }
  }

  // Game loop — wait 2s and check again
  const hBefore = await hash(page);
  await page.waitForTimeout(2000);
  const hAfter = await hash(page);
  result.hashes.after_2s = hAfter.slice(0, 12);

  if (hBefore !== hAfter) {
    result.tiers.loop_alive = true;
  } else {
    // Maybe snake died — check for game-over and restart
    const gameOver = await detectGameOver(page);
    if (gameOver) {
      result.notes.push(`died immediately: "${gameOver}" — restarting`);
      await restart(page);
      await page.keyboard.press('ArrowRight');  // give it a direction
      await page.waitForTimeout(300);
      const hRestart = await hash(page);
      await page.waitForTimeout(2000);
      const hAfterRestart = await hash(page);
      result.hashes.after_restart_2s = hAfterRestart.slice(0, 12);
      result.tiers.loop_alive = hRestart !== hAfterRestart;
    }
  }

  // Input response — send different direction, check hash
  const hBeforeInput = await hash(page);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  const hAfterInput = await hash(page);
  result.hashes.after_input = hAfterInput.slice(0, 12);
  result.tiers.input_responds = hBeforeInput !== hAfterInput;

  const bodyText = await page.textContent('body');
  result.tiers.has_score = /\b(score|points)\s*:?\s*\d+/i.test(bodyText || '');

  await page.screenshot({ path: screenshot, fullPage: true });
} catch (err) {
  result.errors.push(`fatal: ${err.message}`);
} finally {
  await browser.close();
}

result.score = Object.values(result.tiers).filter(Boolean).length;
// Pass: loop runs and input works. game_starts is diagnostic (often false-negative from getImageData timing).
result.pass = result.tiers.loop_alive && result.tiers.input_responds;

console.log(JSON.stringify(result));
process.exit(0);

// ---------- helpers ----------

async function hash(page) {
  const buf = await page.screenshot({ fullPage: false });
  return createHash('sha256').update(buf).digest('hex');
}

async function focusGame(page) {
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (c) { c.tabIndex = 0; c.focus(); }
    document.body.focus();
  });
}

async function tryStart(page, initialHash, result) {
  // 1. Find and click a start-like button
  const startBtn = await page.$(
    'button:has-text("Start"), button:has-text("Play"), button:has-text("New Game"), button:has-text("Begin"), button:has-text("Go")'
  );
  if (startBtn) {
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(400);
    const h = await hash(page);
    if (h !== initialHash) return 'button-click';
  }

  // 2. Try Space
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  let h = await hash(page);
  if (h !== initialHash) return 'space';

  // 3. Try Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  h = await hash(page);
  if (h !== initialHash) return 'enter';

  // 4. Click canvas center
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      h = await hash(page);
      if (h !== initialHash) return 'canvas-click';
    }
  }

  return null;
}

async function detectGameOver(page) {
  try {
    const text = (await page.textContent('body')) || '';
    const patterns = [
      /\b(game\s*over)\b/i,
      /\byou\s*(lost|died|lose)\b/i,
      /\btry\s*again\b/i,
      /\bplay\s*again\b/i,
      /\brestart\b/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function restart(page) {
  // Common restart triggers
  for (const key of ['r', 'R', 'Space', 'Enter']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(200);
  }
  // Also try clicking a restart button
  const btn = await page.$(
    'button:has-text("Restart"), button:has-text("Play Again"), button:has-text("Try Again"), button:has-text("New Game")'
  );
  if (btn) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function isFullyBlank(page) {
  try {
    return await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (c) {
        const ctx = c.getContext('2d');
        if (!ctx) return false;
        const w = Math.min(c.width, 100);
        const h = Math.min(c.height, 100);
        const data = ctx.getImageData(0, 0, w, h).data;
        const first = [data[0], data[1], data[2]];
        for (let i = 4; i < data.length; i += 4) {
          if (data[i] !== first[0] || data[i+1] !== first[1] || data[i+2] !== first[2]) return false;
        }
        return true;
      }
      // No canvas — check if body has non-trivial content
      return document.body.textContent.trim().length < 10 && document.body.children.length < 3;
    });
  } catch {
    return false;
  }
}
