#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "drive", "src");
const write = process.argv.includes("--write");
const verbose = process.argv.includes("--list");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(srcDir);
const code = files.filter((f) => /\.(jsx?|tsx?|html)$/.test(f) && !/\.test\./.test(f)).map((f) => fs.readFileSync(f, "utf8"));
code.push(fs.readFileSync(path.join(root, "index.html"), "utf8"));
const tokens = new Set();
const prefixes = new Set();
for (const text of code) {
  for (const m of text.matchAll(/[A-Za-z_][\w-]*/g)) tokens.add(m[0]);
  for (const m of text.matchAll(/([A-Za-z_][\w-]*-)\$\{/g)) prefixes.add(m[1]);
  for (const m of text.matchAll(/["'`]([A-Za-z_][\w-]*-)["'`]\s*\+/g)) prefixes.add(m[1]);
}
const live = (cls) => tokens.has(cls) || [...prefixes].some((p) => cls.startsWith(p));

function stripNot(selector) {
  let out = "";
  for (let i = 0; i < selector.length; i += 1) {
    if (selector.startsWith(":not(", i)) {
      let depth = 0;
      let j = i + 4;
      for (; j < selector.length; j += 1) {
        if (selector[j] === "(") depth += 1;
        else if (selector[j] === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      i = j;
      continue;
    }
    out += selector[i];
  }
  return out;
}

function deadClassesOutsideNot(selector) {
  if (selector.includes("\\")) return [];
  return [...stripNot(selector).matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !live(c));
}

const cssFiles = files.filter((f) => f.endsWith(".css"));
let total = 0;
let deadSelectors = 0;
let deadRules = 0;
const perFile = [];
const deadNames = new Map();
for (const file of cssFiles) {
  const ast = postcss.parse(fs.readFileSync(file, "utf8"));
  let fileDead = 0;
  ast.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const selectors = rule.selectors;
    total += selectors.length;
    const kept = [];
    for (const s of selectors) {
      let dead = [];
      try {
        dead = deadClassesOutsideNot(s);
      } catch {
        dead = [];
      }
      if (dead.length) {
        deadSelectors += 1;
        fileDead += 1;
        for (const d of dead) deadNames.set(d, (deadNames.get(d) || 0) + 1);
      } else kept.push(s);
    }
    if (kept.length === selectors.length) return;
    if (kept.length) rule.selectors = kept;
    else {
      rule.remove();
      deadRules += 1;
    }
  });
  ast.walkAtRules((at) => {
    if (at.nodes && !at.nodes.some((n) => n.type !== "comment")) at.remove();
  });
  if (fileDead) {
    perFile.push([path.relative(root, file), fileDead]);
    if (write) fs.writeFileSync(file, ast.toString());
  }
}
perFile.sort((a, b) => b[1] - a[1]);
console.log(`${deadSelectors} of ${total} selectors can never match (${deadRules} whole rules) across ${perFile.length} files${write ? " — removed" : ""}`);
for (const [f, n] of perFile.slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${f}`);
if (verbose) {
  console.log("\nmost-cited dead classes:");
  for (const [c, n] of [...deadNames].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(n).padStart(4)}  .${c}`);
}
