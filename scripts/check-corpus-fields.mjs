#!/usr/bin/env node
// Fails unless every field in src/node-types.json is asserted on its parent
// node kind in the expected tree of at least one test/corpus case. A corpus
// tree cannot show a field whose value is an anonymous token, so those fields
// are pinned in tokenFields instead.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const tokenFields = new Set([
  'attribute_comparison.operator',
  'relation_constraint.boundary',
  'relation_constraint.path',
  'schema_entry.required',
]);

const expected = new Set();
const actualTokenFields = new Set();
for (const type of JSON.parse(readFileSync('src/node-types.json', 'utf8'))) {
  for (const [field, { types }] of Object.entries(type.fields ?? {})) {
    const key = `${type.type}.${field}`;
    if (types.some((child) => child.named)) expected.add(key);
    else actualTokenFields.add(key);
  }
}

// Tokens of an expected tree: `(`, `)`, `field:` and node kinds.
const asserted = new Set();
for (const name of readdirSync('test/corpus')) {
  const text = readFileSync(join('test/corpus', name), 'utf8');
  for (const [, tree] of text.matchAll(/^-{3,}[ \t]*\n([\s\S]*?)(?=^={3,}|(?![\s\S]))/gm)) {
    const stack = [];
    let field = null;
    for (const [token] of tree.matchAll(/\(|\)|[\w.]+:|[\w.]+/g)) {
      if (token === '(') stack.push(null);
      else if (token === ')') stack.pop();
      else if (token.endsWith(':')) field = token.slice(0, -1);
      else if (stack.length > 0 && stack[stack.length - 1] === null) {
        stack[stack.length - 1] = token;
        const parent = stack[stack.length - 2];
        if (field && parent) asserted.add(`${parent}.${field}`);
        field = null;
      }
    }
  }
}

let failed = false;
const missing = [...expected].filter((key) => !asserted.has(key)).sort();
if (missing.length > 0) {
  console.error(`fields not asserted in any test/corpus tree:\n  ${missing.join('\n  ')}`);
  failed = true;
}
const drift = [...new Set([...tokenFields, ...actualTokenFields])].filter(
  (key) => tokenFields.has(key) !== actualTokenFields.has(key),
);
if (drift.length > 0) {
  console.error(`anonymous-token fields differ from tokenFields: ${drift.join(' ')}`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`${expected.size} fields asserted; ${tokenFields.size} anonymous-token fields pinned`);
