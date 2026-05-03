#!/usr/bin/env node
// Calculator validator — surgical tie-breaker tests.
//
// Tiers:
//   0. loads_clean    — no JS errors
//   1. has_buttons    — has clickable number buttons
//   2. basic_math     — 2+3=5
//   3. precedence     — 2+3*4=14 (NOT 20)  ← KEY TIE-BREAKER
//   4. parentheses    — (2+3)*4=20
//   5. float_ok       — 0.1+0.2 displays as 0.3 (not 0.30000000000000004)
//   6. clear_works    — AC/C button resets display

import { chromium } from 'playwright';
import { resolve, join } from 'path';

const [, , artifactArg, resultsDir, safeName] = process.argv;
const artifact = resolve(artifactArg);
const url = `file://${artifact}`;
const screenshot = join(resultsDir, `calc-${safeName}.png`);

const result = {
  benchmark: 'calc',
  url: "file://<artifact>",
  tiers: {
    loads_clean: false,
    has_buttons: false,
    basic_math: false,
    precedence: false,
    parentheses: false,
    float_ok: false,
    clear_works: false,
  },
  score: 0,
  input_method: null,
  reads: {},
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

  // Check for number buttons
  const hasButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, [role="button"], .btn, .button, div[onclick], span[onclick]');
    let nums = 0;
    for (const b of btns) {
      const t = (b.textContent || '').trim();
      if (/^[0-9]$/.test(t)) nums++;
    }
    return nums >= 5;  // at least half the digits
  });
  result.tiers.has_buttons = hasButtons;

  // Test 1: basic addition
  await clearCalc(page);
  let r = await runExpression(page, ['2', '+', '3']);
  result.reads.basic = r;
  result.tiers.basic_math = matches(r, 5);

  // Test 2: precedence (THE KEY TEST)
  await clearCalc(page);
  r = await runExpression(page, ['2', '+', '3', '*', '4']);
  result.reads.precedence = r;
  result.tiers.precedence = matches(r, 14);
  if (matches(r, 20)) result.notes.push('precedence FAIL — returned 20 (left-to-right evaluation)');

  // Test 3: parentheses
  await clearCalc(page);
  r = await runExpression(page, ['(', '2', '+', '3', ')', '*', '4']);
  result.reads.parens = r;
  result.tiers.parentheses = matches(r, 20);

  // Test 4: float precision display
  await clearCalc(page);
  r = await runExpression(page, ['0', '.', '1', '+', '0', '.', '2']);
  result.reads.float = r;
  // Accept clean 0.3 display. Reject the ugly 0.30000000000000004 (raw JS float)
  if (r) {
    const nums = r.toString().match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
    const last = nums && nums[nums.length - 1];
    const n = last ? parseFloat(last) : NaN;
    if (!isNaN(n) && Math.abs(n - 0.3) < 0.01) {
      // Pass if displayed result is short/rounded (e.g. "0.3", "0.30"). Fail on raw JS precision bug.
      result.tiers.float_ok = last.length <= 4;
      if (!result.tiers.float_ok) result.notes.push(`float display issue: "${last}"`);
    }
  }

  // Test 5: clear button resets display
  await clearCalc(page);
  await press(page, ['5', '+', '5', '=']);
  const beforeClear = await readDisplay(page);
  await clearCalc(page);
  const afterClear = await readDisplay(page);
  result.reads.before_clear = beforeClear;
  result.reads.after_clear = afterClear;
  // Clear works if display became "0", empty, or any short string != result
  if (beforeClear && afterClear !== beforeClear) {
    const a = (afterClear || '').trim();
    result.tiers.clear_works = a === '' || a === '0' || a === '0.' || a.length <= 2;
  }

  await page.screenshot({ path: screenshot, fullPage: true });
} catch (err) {
  result.errors.push(`fatal: ${err.message}`);
} finally {
  await browser.close();
}

result.score = Object.values(result.tiers).filter(Boolean).length;
result.pass = result.tiers.basic_math && result.tiers.precedence;

console.log(JSON.stringify(result));
process.exit(0);

// ---------- helpers ----------

function matches(read, expected) {
  if (read == null) return false;
  // Displays often show "expression = result" or "expression\nresult".
  // Match ALL numbers and take the LAST one (the result).
  const nums = read.toString().match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
  if (!nums || nums.length === 0) return false;
  const n = parseFloat(nums[nums.length - 1]);
  return !isNaN(n) && Math.abs(n - expected) < 0.0001;
}

async function readDisplay(page) {
  try {
    const selectors = [
      'input[readonly]',
      'input[type="text"]:not([placeholder*="search" i])',
      '.display', '.result', '.output', '.screen',
      '[id*="display" i]', '[id*="result" i]', '[id*="output" i]', '[id*="screen" i]',
      '[class*="display" i]', '[class*="result" i]', '[class*="output" i]', '[class*="screen" i]',
    ];
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (!el) continue;
      const tag = await el.evaluate((e) => e.tagName);
      let val;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        val = await el.inputValue();
      } else {
        val = await el.textContent();
      }
      if (val != null && val.trim() !== '') return val.trim();
    }
    // Last resort — look for big text in document
    const body = await page.textContent('body');
    const match = body && body.match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

async function press(page, keys) {
  for (const k of keys) {
    const clicked = await tryClick(page, k);
    if (!clicked) {
      await tryKeyboard(page, k);
    }
    await page.waitForTimeout(100);
  }
}

async function runExpression(page, keys) {
  // Always press = at end
  await press(page, keys);
  // Try equals in multiple forms
  await pressEquals(page);
  await page.waitForTimeout(200);
  return readDisplay(page);
}

async function pressEquals(page) {
  for (const sym of ['=', 'Equals', 'equals', 'Enter']) {
    if (await tryClick(page, sym)) return;
  }
  // Fall back to Enter key
  await page.keyboard.press('Enter').catch(() => {});
}

async function clearCalc(page) {
  for (const sym of ['AC', 'C', 'CE', 'Clear', 'clear', 'Reset']) {
    if (await tryClick(page, sym)) { await page.waitForTimeout(150); return; }
  }
  // Fall back: press Escape or Delete
  await page.keyboard.press('Escape').catch(() => {});
  await page.keyboard.press('Delete').catch(() => {});
}

async function tryClick(page, text) {
  const variants = buttonVariants(text);
  for (const v of variants) {
    try {
      // Exact text match first
      const btn = await page.$(`button:text-is("${v}"), [role="button"]:text-is("${v}"), .btn:text-is("${v}"), div[onclick]:text-is("${v}")`);
      if (btn) {
        await btn.click({ timeout: 1000 });
        return true;
      }
    } catch {}
  }
  // Fallback: contains match (for longer button text)
  for (const v of variants) {
    try {
      const btn = await page.$(`button:has-text("${v}")`);
      if (btn) {
        const actual = (await btn.textContent() || '').trim();
        if (actual.length <= 3 || actual === v) {  // avoid matching "Clear entry" when we want "CE"
          await btn.click({ timeout: 1000 });
          return true;
        }
      }
    } catch {}
  }
  return false;
}

function buttonVariants(text) {
  // Map logical key → possible displayed chars
  const map = {
    '*': ['*', '×', 'x', 'X', '⨯'],
    '/': ['/', '÷', '∕'],
    '-': ['-', '−', '–'],
    '+': ['+'],
    '=': ['=', 'Equals'],
    '(': ['('],
    ')': [')'],
    '.': ['.', ','],
  };
  return map[text] || [text];
}

async function tryKeyboard(page, key) {
  // Keyboard equivalents
  const map = {
    '*': '*',
    '/': '/',
    '=': 'Enter',
  };
  const k = map[key] || key;
  await page.keyboard.press(k).catch(() => {});
}
