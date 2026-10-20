#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const [, , pattern, ...flags] = process.argv;
if (!pattern) {
  console.error("usage: css-prune.mjs <selector-substring-or-/regex/> [--write]");
  process.exit(2);
}
const write = flags.includes("--write");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drive", "src", "v2");
const match = pattern.startsWith("/") && pattern.endsWith("/")
  ? ((re) => (s) => re.test(s))(new RegExp(pattern.slice(1, -1)))
  : (s) => s.includes(pattern);

let rulesRemoved = 0;
let selectorsRemoved = 0;
const touched = [];
for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".css"))) {
  const full = path.join(root, file);
  const ast = postcss.parse(fs.readFileSync(full, "utf8"));
  let changed = false;
  ast.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const kept = rule.selectors.filter((s) => !match(s));
    if (kept.length === rule.selectors.length) return;
    changed = true;
    selectorsRemoved += rule.selectors.length - kept.length;
    if (kept.length) rule.selectors = kept;
    else {
      rule.remove();
      rulesRemoved += 1;
    }
  });
  ast.walkAtRules((at) => {
    if (at.nodes && !at.nodes.some((n) => n.type !== "comment")) at.remove();
  });
  if (changed) {
    touched.push(file);
    if (write) fs.writeFileSync(full, ast.toString());
  }
}
console.log(`${write ? "removed" : "would remove"} ${selectorsRemoved} selectors (${rulesRemoved} whole rules) in ${touched.length} files: ${touched.join(", ")}`);
