#!/usr/bin/env node
// Compare two css-snapshot runs: every element, box and computed property.
import fs from "node:fs";
import path from "node:path";

const [, , a, b, limitArg] = process.argv;
if (!a || !b) {
  console.error("usage: css-snap-diff.mjs <before-dir> <after-dir> [max-lines-per-state]");
  process.exit(2);
}
const limit = Number(limitArg || 12);
let total = 0;
for (const vp of fs.readdirSync(a).sort()) {
  for (const file of fs.readdirSync(path.join(a, vp)).filter((f) => f.endsWith(".json")).sort()) {
    const other = path.join(b, vp, file);
    if (!fs.existsSync(other)) {
      console.log(`${vp}/${file}: missing in after`);
      total += 1;
      continue;
    }
    const before = JSON.parse(fs.readFileSync(path.join(a, vp, file), "utf8"));
    const after = JSON.parse(fs.readFileSync(other, "utf8"));
    const lines = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const x = before[key];
      const y = after[key];
      if (!x || !y) {
        lines.push(`${x ? "-" : "+"} ${key}`);
        continue;
      }
      for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const vx = JSON.stringify(x[prop]);
        const vy = JSON.stringify(y[prop]);
        if (vx !== vy) lines.push(`  ${key.split(">").slice(-2).join(">")}  ${prop}: ${vx} → ${vy}`);
      }
    }
    if (lines.length) {
      total += lines.length;
      console.log(`${vp}/${file}: ${lines.length} differences`);
      for (const line of lines.slice(0, limit)) console.log(line);
    }
  }
}
console.log(total ? `${total} differences` : "identical");
process.exit(total ? 1 : 0);
