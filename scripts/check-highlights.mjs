#!/usr/bin/env node
// Checks queries/lingrep/highlights.scm against the fixtures in test/highlight:
// every alphabetic literal in src/grammar.json is captured under a face other
// than the plain-text ones below, and no span is captured twice. Engines
// resolve a doubly captured span differently: the lingrep-web editor keeps the
// earlier pattern's capture, while the tree-sitter CLI highlighter keeps the
// later one and drops the earlier match's remaining captures.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const plainFaces = new Set(['comment', 'string', 'variable']);

const keywords = new Set();
(function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === 'object') {
    if (node.type === 'STRING' && /^[A-Za-z_]+$/.test(node.value)) keywords.add(node.value);
    Object.values(node).forEach(walk);
  }
})(JSON.parse(readFileSync('src/grammar.json', 'utf8')).rules);

const fixtures = readdirSync('test/highlight').map((name) => join('test/highlight', name));
const output = execFileSync(
  'tree-sitter',
  ['query', '--captures', 'queries/lingrep/highlights.scm', ...fixtures],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
);

const captured = new Set();
const facesBySpan = new Map();
let file;
for (const line of output.split('\n')) {
  if (!line.startsWith(' ')) {
    file = line;
    continue;
  }
  const match = line.match(/capture: \d+ - ([\w.]+), start: (\(\d+, \d+\)), end: (\(\d+, \d+\)), text: `([^`]*)`/);
  if (!match) continue;
  const [, face, start, end, text] = match;
  const span = `${file} ${start}-${end} \`${text}\``;
  facesBySpan.set(span, (facesBySpan.get(span) ?? []).concat(face));
  if (plainFaces.has(face)) continue;
  for (const word of text.split(/[^A-Za-z_]+/)) captured.add(word);
}

let failed = false;
const missing = [...keywords].filter((keyword) => !captured.has(keyword)).sort();
if (missing.length > 0) {
  console.error(`keywords without a highlight capture in test/highlight: ${missing.join(' ')}`);
  failed = true;
}
for (const [span, faces] of facesBySpan) {
  if (faces.length > 1) {
    console.error(`${span} is captured ${faces.length} times: ${faces.join(', ')}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`${keywords.size} keywords captured; no span is captured twice`);
