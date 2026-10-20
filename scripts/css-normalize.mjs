#!/usr/bin/env node
// Snap typography in drive/src/v2/styles onto the desk's type system:
// sizes to the --rd-text-* scale (11px floor), weights to 400/500/600/700,
// letter-spacing to four steps, and uppercase labels onto the sans face.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const write = process.argv.includes("--write");
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drive", "src", "v2", "styles");

const SCALE = [
  [11.75, "2xs", 11], [12.75, "xs", 12], [13.5, "sm", 13], [15, "md", 14], [17, "lg", 16],
  [19, "xl", 18], [22, "2xl", 20], [26, "3xl", 24], [31, "4xl", 28],
];
const sizeToken = (px) => SCALE.find(([limit]) => px < limit);
const weight = (w) => (w < 450 ? 400 : w < 550 ? 500 : w <= 650 ? 600 : 700);
const counts = { size: 0, weight: 0, spacing: 0, labelFace: 0 };

function snapSpacing(value, fontPx, uppercase) {
  const m = /^(-?[\d.]+)(px|em|rem)$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const em = m[2] === "px" ? n / (fontPx || 12) : m[2] === "rem" ? (n * 16) / (fontPx || 12) : n;
  if (uppercase && em > 0) return "0.06em";
  if (em <= -0.005) return "-0.01em";
  if (Math.abs(em) < 0.005) return "normal";
  return em < 0.035 ? "0.02em" : "0.06em";
}

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".css"))) {
  const full = path.join(dir, file);
  const ast = postcss.parse(fs.readFileSync(full, "utf8"));
  ast.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const decl = (prop) => rule.nodes.filter((n) => n.type === "decl" && n.prop === prop).at(-1);
    const uppercase = /uppercase/.test(decl("text-transform")?.value || "");
    let fontPx = null;
    rule.walkDecls("font-size", (d) => {
      const m = /^([\d.]+)(px|rem)$/.exec(d.value.trim());
      if (!m) return;
      const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
      fontPx = px;
      const step = sizeToken(px);
      if (!step) return;
      const next = `var(--rd-text-${step[1]})`;
      if (d.value !== next) {
        d.value = next;
        counts.size += 1;
      }
      fontPx = step[2];
    });
    rule.walkDecls("font", (d) => {
      const m = /^(\d{3})\s+([\d.]+)px(\/[\d.]+)?\s+(.+)$/.exec(d.value.trim());
      if (!m) return;
      const step = sizeToken(Number(m[2]));
      const size = step ? `${step[2]}px` : `${m[2]}px`;
      const next = `${weight(Number(m[1]))} ${size}${m[3] || ""} ${m[4]}`;
      if (next !== d.value.trim()) {
        d.value = next;
        counts.size += 1;
      }
    });
    rule.walkDecls("font-weight", (d) => {
      const n = Number(d.value.trim());
      if (!Number.isFinite(n)) return;
      const next = String(weight(n));
      if (next !== d.value.trim()) {
        d.value = next;
        counts.weight += 1;
      }
    });
    rule.walkDecls("letter-spacing", (d) => {
      const next = snapSpacing(d.value, fontPx, uppercase);
      if (next && next !== d.value.trim()) {
        d.value = next;
        counts.spacing += 1;
      }
    });
    if (uppercase) {
      rule.walkDecls("font-family", (d) => {
        if (/--rd-mono|Plex Mono/.test(d.value)) {
          d.value = "var(--rd-font)";
          counts.labelFace += 1;
        }
      });
    }
  });
  if (write) fs.writeFileSync(full, ast.toString());
}
console.log(`${write ? "normalized" : "would normalize"}: ${counts.size} sizes, ${counts.weight} weights, ${counts.spacing} letter-spacings, ${counts.labelFace} uppercase labels to sans`);
