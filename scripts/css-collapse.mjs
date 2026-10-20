#!/usr/bin/env node
// Delete declarations that can never win: a later declaration of the same property,
// on the same selector, in the same (or an unconditional) context, at equal or higher
// importance. Nothing is moved, so the cascade is otherwise unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const [, , orderFile, ...flags] = process.argv;
if (!orderFile) {
  console.error("usage: css-collapse.mjs <bundle-order.txt> [--write]");
  process.exit(2);
}
const write = flags.includes("--write");
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drive", "src");
const order = fs.readFileSync(orderFile, "utf8").split("\n").filter(Boolean);
const norm = (s) => s.replace(/\s+/g, " ").trim();

const sheets = order.map((rel) => ({ rel, file: path.join(src, rel), ast: postcss.parse(fs.readFileSync(path.join(src, rel), "utf8")) }));
const decls = [];
for (const sheet of sheets) {
  sheet.ast.walkDecls((decl) => {
    const rule = decl.parent;
    if (rule?.type !== "rule") return;
    const chain = [];
    let unsafe = false;
    for (let node = rule.parent; node && node.type !== "root"; node = node.parent) {
      if (node.type === "atrule") {
        if (/keyframes|font-face|page/.test(node.name)) unsafe = true;
        chain.unshift(`@${node.name} ${norm(node.params)}`);
      } else if (node.type === "rule") unsafe = true;
    }
    if (unsafe) return;
    decls.push({ decl, rule, context: chain.join(" | "), prop: decl.prop.toLowerCase(), important: decl.important, selectors: rule.selectors.map(norm) });
  });
}

// Latest position per (context, selector, prop) at each importance level.
const latest = new Map();
decls.forEach((d, i) => {
  for (const s of d.selectors) {
    const key = `${d.context}\u0000${s}\u0000${d.prop}`;
    const slot = latest.get(key) || { normal: -1, important: -1 };
    slot[d.important ? "important" : "normal"] = i;
    latest.set(key, slot);
  }
});
const sides = ["top", "right", "bottom", "left"];
const SHORTHANDS = {
  overflow: ["overflow-x", "overflow-y"],
  padding: sides.map((x) => `padding-${x}`),
  margin: sides.map((x) => `margin-${x}`),
  inset: sides,
  gap: ["row-gap", "column-gap"],
  "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "grid-column": ["grid-column-start", "grid-column-end"],
  "grid-row": ["grid-row-start", "grid-row-end"],
  background: ["background-color", "background-image", "background-position", "background-size", "background-repeat", "background-attachment", "background-origin", "background-clip"],
  "border-width": sides.map((x) => `border-${x}-width`),
  "border-style": sides.map((x) => `border-${x}-style`),
  "border-color": sides.map((x) => `border-${x}-color`),
  border: [...sides.flatMap((x) => [`border-${x}-width`, `border-${x}-style`, `border-${x}-color`, `border-${x}`]), "border-width", "border-style", "border-color"],
  ...Object.fromEntries(sides.map((x) => [`border-${x}`, [`border-${x}-width`, `border-${x}-style`, `border-${x}-color`]])),
};
const coveredBy = new Map();
for (const [short, longs] of Object.entries(SHORTHANDS)) for (const l of longs) coveredBy.set(l, [...(coveredBy.get(l) || []), short]);
const vendor = /-webkit-|-moz-|-ms-/;
let removed = 0;
const touched = new Set();
decls.forEach((d, i) => {
  if (vendor.test(d.decl.value) || vendor.test(d.prop)) return;
  const props = [d.prop, ...(coveredBy.get(d.prop) || [])];
  const beaten = d.selectors.every((s) => {
    for (const ctx of new Set([d.context, ""])) {
      for (const prop of props) {
        const slot = latest.get(`${ctx}\u0000${s}\u0000${prop}`);
        if (!slot) continue;
        const winner = d.important ? slot.important : Math.max(slot.normal, slot.important);
        if (winner > i && decls[winner].rule !== d.rule && !/var\(/.test(decls[winner].decl.value)) return true;
      }
    }
    return false;
  });
  if (!beaten) return;
  removed += 1;
  touched.add(d.decl.root());
  d.decl.remove();
});
for (const sheet of sheets) {
  sheet.ast.walkRules((rule) => {
    if (!rule.nodes.some((n) => n.type === "decl")) rule.remove();
  });
  sheet.ast.walkAtRules((at) => {
    if (at.nodes && !at.nodes.some((n) => n.type !== "comment")) at.remove();
  });
  if (write && touched.has(sheet.ast)) fs.writeFileSync(sheet.file, sheet.ast.toString());
}
console.log(`${write ? "removed" : "would remove"} ${removed} of ${decls.length} declarations across ${touched.size} files`);
