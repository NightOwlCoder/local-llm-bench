#!/usr/bin/env node
// Opus text quality judgment for the "oi" response.
// Scores: Portuguese/language appropriateness, conciseness, tone, artifacts.
//
// Usage: node drivers/opus-text-quality.mjs <raw-json> <model-safe-name> <results-dir>

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const [, , rawJsonArg, safeName, resultsDir] = process.argv;
if (!rawJsonArg || !safeName || !resultsDir) {
  console.error('usage: opus-text-quality.mjs <raw.json> <safe-name> <results-dir>');
  process.exit(2);
}

const rawData = JSON.parse(readFileSync(resolve(rawJsonArg), 'utf8'));
const response = rawData.response || '';
const evalCount = rawData.eval_count || 0;

const rubric = `You are judging the quality of a local LLM's response to the simple Portuguese greeting "oi" (= "hi").

A good response should:
- Reply in Portuguese (since "oi" is a Portuguese greeting)
- Be friendly and conversational
- Be appropriately short (a greeting back, maybe asks how to help — NOT a thinking dump or monologue)
- Have no weird artifacts (thinking tags leaked into output, debug text, incomplete sentences)

Scoring (each 0-10, integer only):
- language: replied in Portuguese (10) vs English-only (3) vs mixed (6)
- conciseness: 1 short sentence (10), short paragraph (8), long rambling or thinking dump (2-4)
- tone: warm and natural (10), robotic or weird (5), alien or clearly AI-generated (3)
- cleanliness: no artifacts (10), minor issues (7), visible thinking tags or debug text (3)

Return ONLY valid JSON (no markdown fences):
{
  "language": N,
  "conciseness": N,
  "tone": N,
  "cleanliness": N,
  "total": N (sum, 0-40),
  "notes": "1-2 sentences justification"
}

Also note: the response generated ${evalCount} tokens. A good "oi" reply should use 5-50 tokens. More than 200 is a red flag.`;

const body = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 500,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: rubric },
        { type: 'text', text: `\n\nThe model's response:\n\n---\n${response}\n---` },
      ],
    },
  ],
};

const client = new BedrockRuntimeClient({ region: 'us-east-1' });
const modelId = 'global.anthropic.claude-opus-4-7';

try {
  const resp = await client.send(new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  }));
  const decoded = JSON.parse(new TextDecoder().decode(resp.body));
  const raw = decoded.content?.[0]?.text?.trim() || '';
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  let json;
  try { json = JSON.parse(candidate); }
  catch {
    const m = candidate.match(/\{[\s\S]*\}/);
    if (m) json = JSON.parse(m[0]);
    else throw new Error(`could not parse: ${raw.slice(0, 300)}`);
  }
  const out = {
    model: safeName.replace(/--/g, ':'),
    benchmark: 'oi-quality',
    tokens_used: evalCount,
    ...json,
    _model: modelId,
    _usage: decoded.usage || null,
  };
  writeFileSync(join(resultsDir, `oi-quality-${safeName}.json`), JSON.stringify(out, null, 2));
  console.log(`total=${json.total}/40  tokens=${evalCount}`);
} catch (err) {
  console.error(`fatal: ${err.name}: ${err.message}`);
  process.exit(5);
}
