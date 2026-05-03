#!/usr/bin/env node
// Tetris validator — smarter startup.
//
// Tiers:
//   0. loads_clean    — no JS errors
//   1. has_canvas     — canvas or grid rendering
//   2. game_starts    — after start patterns, non-blank
//   3. gravity_alive  — piece falls without input (hash changes over 3s)
//   4. left_moves     — ArrowLeft changes the screen
//   5. right_moves    — ArrowRight changes the screen
//   6. rotate_works   — ArrowUp (or X) changes the screen
//   7. has_score      — visible score/lines/level

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { resolve, join } from 'path';

const [, , artifactArg, resultsDir, safeName] = process.argv;
const artifact = resolve(artifactArg);
const url = `file://${artifact}`;
const screenshot = join(resultsDir, `tetris-${safeName}.png`);

const result = {
  benchmark: 'tetris',
  url: "file://<artifact>",
  tiers: {
    loads_clean: false,
    has_canvas: false,
    game_starts: false,
    gravity_alive: false,
    left_moves: false,
    right_moves: false,
    rotate_works: false,
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

  result.tiers.has_canvas = await page.evaluate(() => {
    if (document.querySelector('canvas')) return true;
    const cells = document.querySelectorAll('.cell, [class*="block"], [class*="grid"] > div');
    return cells.length >= 100;
  });

  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (c) { c.tabIndex = 0; c.focus(); }
    document.body.focus();
  });

  const h0 = await hash(page);
  result.hashes.before_start = h0.slice(0, 12);
  result.tiers.game_starts = !(await isFullyBlank(page));

  // Smart start
  const started = await tryStart(page, h0);
  if (started) result.start_method = started;

  let hStart = await hash(page);
  result.hashes.after_start = hStart.slice(0, 12);

  // Gravity test — 3s wait
  await page.waitForTimeout(3000);
  const hGravity = await hash(page);
  result.hashes.after_3s = hGravity.slice(0, 12);
  result.tiers.gravity_alive = hStart !== hGravity;

  if (!result.tiers.gravity_alive) {
    // Maybe game over already — try restart
    const over = await detectGameOver(page);
    if (over) {
      result.notes.push(`game over detected: "${over}"`);
      await restart(page);
      await page.waitForTimeout(500);
      hStart = await hash(page);
      await page.waitForTimeout(3000);
      const hAfter = await hash(page);
      result.hashes.after_restart_3s = hAfter.slice(0, 12);
      result.tiers.gravity_alive = hStart !== hAfter;
    }
  }

  // Input tests
  let hCurrent = await hash(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  const hLeft = await hash(page);
  result.hashes.after_left = hLeft.slice(0, 12);
  result.tiers.left_moves = hCurrent !== hLeft;

  hCurrent = hLeft;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const hRight = await hash(page);
  result.hashes.after_right = hRight.slice(0, 12);
  result.tiers.right_moves = hCurrent !== hRight;

  // Rotate — try ArrowUp first, fall back to X
  hCurrent = hRight;
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  let hRotate = await hash(page);
  if (hRotate === hCurrent) {
    await page.keyboard.press('x');
    await page.waitForTimeout(400);
    hRotate = await hash(page);
  }
  result.hashes.after_rotate = hRotate.slice(0, 12);
  result.tiers.rotate_works = hCurrent !== hRotate;

  const bodyText = await page.textContent('body');
  result.tiers.has_score = /\b(score|points|lines|level)\s*:?\s*\d+/i.test(bodyText || '');

  await page.screenshot({ path: screenshot, fullPage: true });
} catch (err) {
  result.errors.push(`fatal: ${err.message}`);
} finally {
  await browser.close();
}

result.score = Object.values(result.tiers).filter(Boolean).length;
// Pass: gravity ticks and at least one input works. game_starts is diagnostic (often false-negative from getImageData timing).
result.pass = result.tiers.gravity_alive
  && (result.tiers.left_moves || result.tiers.right_moves || result.tiers.rotate_works);

console.log(JSON.stringify(result));
process.exit(0);

async function hash(page) {
  const buf = await page.screenshot({ fullPage: false });
  return createHash('sha256').update(buf).digest('hex');
}

async function tryStart(page, initialHash) {
  const startBtn = await page.$(
    'button:has-text("Start"), button:has-text("Play"), button:has-text("New Game"), button:has-text("Begin"), button:has-text("Go")'
  );
  if (startBtn) {
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(400);
    const h = await hash(page);
    if (h !== initialHash) return 'button-click';
  }

  for (const method of ['Space', 'Enter']) {
    await page.keyboard.press(method);
    await page.waitForTimeout(300);
    const h = await hash(page);
    if (h !== initialHash) return method.toLowerCase();
  }

  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      const h = await hash(page);
      if (h !== initialHash) return 'canvas-click';
    }
  }
  return null;
}

async function detectGameOver(page) {
  try {
    const text = (await page.textContent('body')) || '';
    const patterns = [/\bgame\s*over\b/i, /\byou\s*(lost|died)\b/i, /\btry\s*again\b/i, /\bplay\s*again\b/i];
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
  for (const key of ['r', 'R', 'Space', 'Enter']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(150);
  }
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
      return document.body.textContent.trim().length < 10 && document.body.children.length < 3;
    });
  } catch {
    return false;
  }
}
