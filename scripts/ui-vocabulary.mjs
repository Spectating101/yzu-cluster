#!/usr/bin/env node
// Inventory static UI copy. Run from any directory with node scripts/ui-vocabulary.mjs.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = fileURLToPath(new URL('../', import.meta.url));
const uiDirectory = path.join(root, 'drive/src/v2');
const attributeNames = new Set([
  'label', 'title', 'eyebrow', 'kicker', 'placeholder', 'aria-label',
  'description', 'lead', 'metric', 'detail', 'headline', 'status', 'empty', 'sublabel',
]);
const propertyNames = new Set([
  'label', 'title', 'headline', 'status', 'detail', 'decision', 'risk', 'next',
  'lead', 'displayText', 'metric', 'eyebrow', 'kicker', 'action', 'empty', 'description',
]);
const kinds = ['jsx-text', 'jsx-attr', 'object-label', 'template', 'css-content'];
const counts = Object.fromEntries(kinds.map(kind => [kind, 0]));
const inventory = new Map();

function collect(value, kind, file) {
  const term = value.replace(/\s+/gu, ' ').trim();
  if (!term) return;
  const key = JSON.stringify([term, kind]);
  if (!inventory.has(key)) inventory.set(key, { term, kind, count: 0, files: new Set() });
  const entry = inventory.get(key);
  entry.count += 1;
  entry.files.add(path.relative(root, file).split(path.sep).join('/'));
  counts[kind] += 1;
}

async function* sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (entry.isFile() && /\.jsx?$/u.test(entry.name) && !entry.name.endsWith('.test.js')) yield file;
  }
}

function collectPosition(value, kind, file) {
  if (value?.type === 'JSXExpressionContainer') value = value.expression;
  if (value?.type === 'StringLiteral') {
    if (kind !== 'object-label' || /\s|\p{Lu}/u.test(value.value)) {
      collect(value.value, kind, file);
    }
  } else if (value?.type === 'TemplateLiteral') {
    collect(value.quasis.map(quasi => quasi.value.cooked ?? quasi.value.raw).join('{…}'), 'template', file);
  }
}

// Traverse Babel nodes directly; no traversal package is needed.
function walk(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXText' && /[\p{L}\p{N}]/u.test(node.value)) {
    collect(node.value, 'jsx-text', file);
  } else if (node.type === 'JSXAttribute' && attributeNames.has(node.name?.name)) {
    collectPosition(node.value, 'jsx-attr', file);
  } else if (node.type === 'ObjectProperty') {
    const name = node.key.type === 'StringLiteral' ? node.key.value
      : !node.computed && node.key.type === 'Identifier' ? node.key.name : null;
    if (propertyNames.has(name)) collectPosition(node.value, 'object-label', file);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) walk(child, file);
    } else if (value?.type) walk(value, file);
  }
}

for await (const file of sourceFiles(uiDirectory)) {
  const source = await readFile(file, 'utf8');
  try {
    walk(parse(source, { sourceType: 'module', plugins: ['jsx'] }), file);
  } catch (error) {
    throw new Error(`Cannot parse ${path.relative(root, file)}: ${error.message}`, { cause: error });
  }
}

const stylesDirectory = path.join(uiDirectory, 'styles');
for (const name of (await readdir(stylesDirectory)).sort()) {
  if (!name.endsWith('.css')) continue;
  const file = path.join(stylesDirectory, name);
  const source = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//gu, '');
  const content = /(?:^|[;{])\s*content\s*:\s*(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1/giu;
  for (const match of source.matchAll(content)) {
    const value = match[2].replace(/\\([\da-f]{1,6})\s?|\\(\r\n|[\n\r\f])|\\([\s\S])/giu,
      (_, hex, newline, escaped) => hex
        ? String.fromCodePoint(Number.parseInt(hex, 16) || 0xfffd)
        : newline ? '' : escaped);
    if (value.trim().split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length >= 2) {
      collect(value, 'css-content', file);
    }
  }
}

function csv(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

const entries = [...inventory.values()].sort((a, b) =>
  b.count - a.count || a.term.localeCompare(b.term) || a.kind.localeCompare(b.kind));
const rows = entries.map(entry => [
  entry.term, entry.kind, entry.count, [...entry.files].sort().slice(0, 3).join(' | '),
].map(csv).join(','));
const output = path.join(root, 'docs/status/generated/ui-vocabulary.csv');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, ['term,kind,count,files', ...rows].join('\n') + '\n');
console.log(`Total unique terms: ${new Set(entries.map(entry => entry.term)).size}`);
console.log('Per-kind counts (occurrences):');
for (const kind of kinds) console.log(`${kind}: ${counts[kind]}`);
