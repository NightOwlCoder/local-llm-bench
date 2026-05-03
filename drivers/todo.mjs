#!/usr/bin/env node
// Todo app validator — behavior-based tiers, no regex guessing.
// Each test actually drives the UI and observes real DOM/visual state changes.
//
// Usage: node drivers/todo.mjs <artifact.html> <results-dir> <model-safe-name>

import { chromium } from 'playwright';
import { resolve, join } from 'path';

const [, , artifactArg, resultsDir, safeName] = process.argv;
if (!artifactArg || !resultsDir || !safeName) {
  console.error('usage: todo.mjs <artifact> <results-dir> <safe-name>');
  process.exit(2);
}

const artifact = resolve(artifactArg);
const url = `file://${artifact}`;
const screenshot = join(resultsDir, `todo-${safeName}.png`);

const result = {
  benchmark: 'todo',
  url: "file://<artifact>",
  tiers: {
    loads_clean: false,
    add_one: false,
    add_multiple: false,
    mark_complete: false,
    filter_works: false,
    persists_refresh: false,
    delete_works: false,
    counter_updates: false,
  },
  score: 0,
  errors: [],
  notes: [],
};

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') jsErrors.push(msg.text()); });

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 });
  await page.waitForTimeout(500);
  result.tiers.loads_clean = jsErrors.length === 0;
  if (jsErrors.length) result.errors.push(...jsErrors.slice(0, 3));

  const input = await findInput(page);
  if (!input) {
    result.notes.push('no text input found');
  } else {
    const text1 = 'buy milk';
    const added1 = await addTodo(page, input, text1);
    result.tiers.add_one = added1;

    if (added1) {
      const added2 = await addTodo(page, input, 'walk dog');
      const added3 = await addTodo(page, input, 'write tests');
      if (added2 && added3) {
        const bodyText = await page.textContent('body');
        result.tiers.add_multiple = bodyText.includes('buy milk')
          && bodyText.includes('walk dog')
          && bodyText.includes('write tests');
      }

      // Counter BEFORE completing — capture baseline numbers on page
      const numbersBefore = await readNumbersInTodoArea(page);

      // Tier 3 — mark complete (observes visual state change on first item)
      result.tiers.mark_complete = await markComplete(page);

      // Tier 7 — counter: compare numbers after mark_complete. Any drift = counter is alive.
      const numbersAfter = await readNumbersInTodoArea(page);
      result.tiers.counter_updates = numbersChanged(numbersBefore, numbersAfter);

      // Tier 4 — filter: try every clickable in the todo area, see if visible count changes
      result.tiers.filter_works = await testFilter(page);

      // Tier 5 — persist
      await page.reload({ waitUntil: 'networkidle', timeout: 10_000 });
      await page.waitForTimeout(500);
      const afterReload = await page.textContent('body');
      result.tiers.persists_refresh = afterReload.includes('buy milk');

      // Tier 6 — delete: count visible items, try deletion strategies, recount
      result.tiers.delete_works = await testDelete(page);
    } else {
      result.notes.push('could not add first todo');
    }
  }

  await page.screenshot({ path: screenshot, fullPage: true });
} catch (err) {
  result.errors.push(`fatal: ${err.message}`);
} finally {
  await browser.close();
}

result.score = Object.values(result.tiers).filter(Boolean).length;
result.pass = result.score >= 5;

console.log(JSON.stringify(result));
process.exit(0);

// ---------- helpers ----------

async function findInput(page) {
  const selectors = [
    'input[type="text"]',
    'input:not([type])',
    'input[placeholder*="todo" i]',
    'input[placeholder*="task" i]',
    'input[placeholder*="add" i]',
    'input[placeholder*="what" i]',
    'textarea',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

async function addTodo(page, input, text) {
  try {
    await input.fill('');
    await input.type(text, { delay: 10 });
    await input.press('Enter');
    await page.waitForTimeout(250);
    let body = await page.textContent('body');
    if (body.includes(text)) return true;

    const btn = await page.$('button[type="submit"], button:has-text("Add"), button:has-text("+"), button:has-text("Save")');
    if (btn) {
      await input.fill('');
      await input.type(text, { delay: 10 });
      await btn.click();
      await page.waitForTimeout(250);
      body = await page.textContent('body');
      return body.includes(text);
    }
    return false;
  } catch {
    return false;
  }
}

// Find the first visible todo item. Covers li, divs with todo/task classes, etc.
async function firstItemHandle(page) {
  const selectors = [
    'li:visible',
    '[class*="todo-item"]:visible',
    '[class*="task-item"]:visible',
    '.todo:visible',
    '.task:visible',
    '[data-testid*="todo"]:visible',
    // Fallback: any element that contains our seeded text
    ':has-text("buy milk"):not(body):not(html):not(input):not(textarea)',
  ];
  for (const sel of selectors) {
    try {
      const handle = await page.$(sel);
      if (handle) return handle;
    } catch {}
  }
  return null;
}

// Measure visual completion state of the first item.
// Real completion looks like: strikethrough, reduced opacity, or a checked checkbox.
async function itemCompletionState(page, item) {
  if (!item) return null;
  try {
    return await item.evaluate((el) => {
      const snapshot = {
        strike: false,
        opacity: 1,
        checked: false,
        classes: el.className || '',
      };
      // Check ALL descendants + self for text-decoration
      const all = [el, ...el.querySelectorAll('*')];
      for (const n of all) {
        const cs = window.getComputedStyle(n);
        if ((cs.textDecorationLine || cs.textDecoration || '').includes('line-through')) {
          snapshot.strike = true;
        }
        const op = parseFloat(cs.opacity || '1');
        if (!Number.isNaN(op) && op < snapshot.opacity) snapshot.opacity = op;
      }
      const cb = el.querySelector('input[type="checkbox"]');
      if (cb) snapshot.checked = cb.checked;
      return snapshot;
    });
  } catch {
    return null;
  }
}

async function markComplete(page) {
  const item = await firstItemHandle(page);
  if (!item) return false;

  const before = await itemCompletionState(page, item);
  if (!before) return false;

  // Strategy 1: checkbox inside item
  const cb = await item.$('input[type="checkbox"]');
  if (cb) {
    await cb.click().catch(() => {});
    await page.waitForTimeout(300);
    const after = await itemCompletionState(page, item);
    if (stateChanged(before, after)) return true;
  }

  // Strategy 2: a toggle button/circle inside the item
  const toggle = await item.$(
    '[class*="toggle"]:visible, [class*="complete"]:visible, [class*="check"]:visible, ' +
    '[role="checkbox"]:visible, button:has-text("✓"):visible, button:has-text("◯"):visible, ' +
    '.circle, .dot'
  );
  if (toggle) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(300);
    const after = await itemCompletionState(page, item);
    if (stateChanged(before, after)) return true;
  }

  // Strategy 3: click on the item text itself (some apps toggle on click)
  await item.click().catch(() => {});
  await page.waitForTimeout(300);
  const after = await itemCompletionState(page, item);
  return stateChanged(before, after);
}

function stateChanged(a, b) {
  if (!a || !b) return false;
  if (a.checked !== b.checked) return true;
  if (a.strike !== b.strike) return true;
  if (Math.abs(a.opacity - b.opacity) > 0.1) return true;
  // Class change often signals completion via CSS
  if (a.classes !== b.classes) return true;
  return false;
}

// Count items matching the "buy milk / walk dog / write tests" seed text that are actually visible.
// visible = bounding box > 0 and CSS display/visibility not hidden.
async function countVisibleSeedItems(page) {
  return await page.evaluate(() => {
    const seeds = ['buy milk', 'walk dog', 'write tests'];
    let count = 0;
    for (const seed of seeds) {
      // Find all nodes containing this text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.includes(seed)) {
          const el = n.parentElement;
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0
              && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0) {
            count++;
            break;  // one match per seed is enough
          }
        }
      }
    }
    return count;
  });
}

// Collect all clickable elements in the todo area. We'll try each as a potential filter.
async function collectFilterCandidates(page) {
  return await page.$$(
    'button:visible, a:visible, [role="tab"]:visible, [role="button"]:visible, ' +
    '[class*="filter"]:visible, [class*="tab"]:visible, ' +
    '[data-filter]:visible'
  );
}

async function testFilter(page) {
  try {
    const initialVisible = await countVisibleSeedItems(page);
    if (initialVisible === 0) return false;

    const candidates = await collectFilterCandidates(page);
    // We're looking for a click that REDUCES visible items (showing subset).
    // Skip obvious non-filters: the input's submit button, add, delete, reset/clear all
    for (const el of candidates) {
      const text = ((await el.textContent()) || '').trim().toLowerCase();
      // Skip common non-filter buttons
      if (!text) continue;
      if (/^(add|submit|save|create|new|clear all|delete all|reset|\+|×|✕)$/i.test(text)) continue;

      // Try the click
      try { await el.click({ timeout: 1000 }); } catch { continue; }
      await page.waitForTimeout(250);

      const afterVisible = await countVisibleSeedItems(page);
      if (afterVisible < initialVisible) {
        // Found it. Click again to restore (or click an "All" filter) so downstream tests aren't polluted.
        const restore = await page.$('button:has-text("All"):visible, a:has-text("All"):visible, [role="tab"]:has-text("All"):visible');
        if (restore) await restore.click().catch(() => {});
        else await el.click().catch(() => {});  // toggle back
        await page.waitForTimeout(200);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Read all numeric values displayed in the todo area (counters, stats, etc).
async function readNumbersInTodoArea(page) {
  return await page.evaluate(() => {
    const nums = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      // Skip empty and skip if inside an input
      if (!t) continue;
      if (n.parentElement && n.parentElement.closest('input, textarea, script, style')) continue;
      // Find bare integers 0-999 (not part of a larger number like a date)
      const matches = t.match(/\b\d{1,3}\b/g);
      if (matches) nums.push(...matches.map(Number));
    }
    return nums.sort((a, b) => a - b);
  });
}

function numbersChanged(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

async function testDelete(page) {
  try {
    const beforeCount = await countVisibleSeedItems(page);
    if (beforeCount === 0) return false;

    // Strategy A: explicit delete button
    const explicitSelectors = [
      'button:visible:has-text("×")',
      'button:visible:has-text("✕")',
      'button:visible:has-text("Delete")',
      'button:visible:has-text("Remove")',
      'button:visible[aria-label*="delete" i]',
      'button:visible[aria-label*="remove" i]',
      '[class*="delete"]:visible',
      '[class*="remove"]:visible',
      '[class*="trash"]:visible',
    ];
    for (const sel of explicitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(300);
        const afterCount = await countVisibleSeedItems(page);
        if (afterCount < beforeCount) return true;
      }
    }

    // Strategy B: hover item → reveal delete button
    const item = await firstItemHandle(page);
    if (item) {
      await item.hover().catch(() => {});
      await page.waitForTimeout(200);
      for (const sel of explicitSelectors) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(300);
          const afterCount = await countVisibleSeedItems(page);
          if (afterCount < beforeCount) return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
