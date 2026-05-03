#!/usr/bin/env node
// Markdown previewer validator — tests parser quality + live updates.
//
// Tiers (/8):
//   0. loads_clean       — no JS errors
//   1. dual_pane         — has editor + preview (two distinct areas)
//   2. renders_h1        — "# Title" → <h1>Title</h1>
//   3. renders_bold      — "**text**" → <strong> or <b>
//   4. renders_italic    — "*text*" → <em> or <i>
//   5. renders_link      — "[x](url)" → <a href="url">
//   6. renders_code      — fenced code block → <pre><code>
//   7. live_updates      — typing updates preview without refresh

import { chromium } from 'playwright';
import { resolve, join } from 'path';

const [, , artifactArg, resultsDir, safeName] = process.argv;
const artifact = resolve(artifactArg);
const url = `file://${artifact}`;
const screenshot = join(resultsDir, `markdown-${safeName}.png`);

const result = {
  benchmark: 'markdown',
  url: "file://<artifact>",
  tiers: {
    loads_clean: false,
    dual_pane: false,
    renders_h1: false,
    renders_bold: false,
    renders_italic: false,
    renders_link: false,
    renders_code: false,
    live_updates: false,
  },
  score: 0,
  samples: {},
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

  // Find the editor (textarea usually)
  const editor = await findEditor(page);
  if (!editor) {
    result.notes.push('no editor textarea found');
    await page.screenshot({ path: screenshot, fullPage: true });
    finish();
  }

  // Find the preview container — the element that changes when we type
  // We'll detect it by diffing outerHTML after typing
  const preview = await findPreviewArea(page, editor);
  result.tiers.dual_pane = !!preview;

  // Feed a comprehensive markdown sample
  const sample = [
    '# Big Header',
    '',
    'Some **bold text** and *italic text* in a paragraph.',
    '',
    '[a link](https://example.com)',
    '',
    '```',
    'code block here',
    '```',
    '',
    '- list item one',
    '- list item two',
  ].join('\n');

  await editor.fill('');
  await editor.type(sample, { delay: 5 });
  // Many previewers debounce — give them time
  await page.waitForTimeout(600);

  // Capture the preview HTML (the rendered side)
  const previewHTML = preview
    ? await preview.evaluate((el) => el.innerHTML).catch(() => '')
    : await page.content();

  result.samples.preview_len = previewHTML.length;

  // Tier checks via rendered HTML inspection
  result.tiers.renders_h1     = /<h1[^>]*>[^<]*Big Header/i.test(previewHTML);
  result.tiers.renders_bold   = /<(strong|b)[^>]*>\s*bold text\s*<\/(strong|b)>/i.test(previewHTML);
  result.tiers.renders_italic = /<(em|i)[^>]*>\s*italic text\s*<\/(em|i)>/i.test(previewHTML);
  result.tiers.renders_link   = /<a[^>]*href=["']https:\/\/example\.com["']/i.test(previewHTML);

  // Code block detection — must handle syntax-highlighted output where text is wrapped in spans.
  // Extract text inside any <code>...</code>, strip all tags, check for our sample.
  result.tiers.renders_code = false;
  const codeMatches = previewHTML.match(/<code[^>]*>([\s\S]*?)<\/code>/gi) || [];
  for (const cm of codeMatches) {
    const text = cm.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (/code block here/i.test(text)) { result.tiers.renders_code = true; break; }
  }

  // Live update: type one more char, check preview changes
  if (preview) {
    const before = previewHTML;
    await editor.type('\n\nLIVE_UPDATE_MARKER', { delay: 5 });
    await page.waitForTimeout(500);
    const after = await preview.evaluate((el) => el.innerHTML).catch(() => '');
    result.tiers.live_updates = after !== before && after.includes('LIVE_UPDATE_MARKER');
  }

  await page.screenshot({ path: screenshot, fullPage: true });
} catch (err) {
  result.errors.push(`fatal: ${err.message}`);
} finally {
  finish();
}

function finish() {
  result.score = Object.values(result.tiers).filter(Boolean).length;
  result.pass = result.tiers.renders_h1 && result.tiers.renders_bold && result.tiers.live_updates;
  console.log(JSON.stringify(result));
  browser.close().then(() => process.exit(0), () => process.exit(0));
}

async function findEditor(page) {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) return el;
  }
  return null;
}

async function findPreviewArea(page, editor) {
  // Strategy: try known selectors first (fast), fall back to differential detection.
  for (const sel of ['#preview', '.preview', '#output', '.output', '#rendered', '.rendered',
                     '.markdown-body', '[class*="preview"]', '[class*="output"]',
                     '[id*="preview"]', '[id*="output"]', '[id*="rendered"]']) {
    const el = await page.$(sel);
    if (el) return el;
  }

  // Fallback: find element that changes when we type into editor
  await editor.fill('');
  const snapshotBefore = await page.$$eval('div, section, article, main, aside', (els) =>
    els.map((el) => ({
      id: el.id || null,
      cls: el.className || null,
      tag: el.tagName,
      len: el.innerHTML.length,
    })),
  );
  await editor.fill('TESTING_XYZ_123');
  await page.waitForTimeout(400);
  const snapshotAfter = await page.$$eval('div, section, article, main, aside', (els) =>
    els.map((el) => ({
      id: el.id || null,
      cls: el.className || null,
      tag: el.tagName,
      len: el.innerHTML.length,
    })),
  );

  // Find element whose length changed (and isn't the editor's own container)
  for (let i = 0; i < snapshotBefore.length; i++) {
    const b = snapshotBefore[i];
    const a = snapshotAfter[i];
    if (!a || !b) continue;
    if (a.len !== b.len) {
      // Get this element
      const query = a.id
        ? `#${CSS.escape(a.id)}`
        : (a.cls ? `.${a.cls.split(/\s+/).filter(Boolean).map((c) => CSS.escape(c)).join('.')}` : null);
      if (query) {
        const found = await page.$(query);
        if (found) return found;
      }
    }
  }

  return null;
}
