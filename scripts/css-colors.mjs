#!/usr/bin/env node
// Colour hygiene for drive/src/v2/styles: merge perceptually identical literals,
// give neutral uppercase labels one ink, and warm the cool near-white surfaces.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const write = process.argv.includes("--write");
const report = process.argv.includes("--report");
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drive", "src", "v2", "styles");
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const LABEL_INK = "#5b6578";
const MERGE_DE = 3;

function parse(text) {
  if (text.startsWith("#")) {
    let h = text.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const parts = text.replace(/rgba?\(|\)/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => p.includes("%") || Number.isNaN(Number(p)))) return null;
  const a = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a };
}
function lab({ r, g, b }) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const format = (c, alpha) => (alpha >= 1 ? hex(c) : `rgba(${c.r}, ${c.g}, ${c.b}, ${+alpha.toFixed(3)})`);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => ({ f, ast: postcss.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
const colorProp = (p) => /color|background|border|outline|shadow|fill|stroke|^--/.test(p);

// Frequency of each opaque RGB triple.
const freq = new Map();
for (const { ast } of files) ast.walkDecls((d) => {
  if (!colorProp(d.prop)) return;
  for (const m of d.value.match(COLOR_RE) || []) {
    const c = parse(m);
    if (!c) continue;
    const key = hex(c);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
});
const clusters = [];
const canonical = new Map();
for (const [key, n] of [...freq].sort((a, b) => b[1] - a[1])) {
  const c = parse(key);
  const L = lab(c);
  const home = clusters.find((cl) => dE(cl.lab, L) < MERGE_DE);
  if (home) {
    canonical.set(key, home.key);
    home.members.push([key, n]);
  } else {
    clusters.push({ key, lab: L, members: [[key, n]] });
    canonical.set(key, key);
  }
}

const isNeutral = (c) => {
  const [, a, b] = lab(c);
  return Math.hypot(a, b) < 14;
};
const coolSurface = (c) => {
  const [L, a, b] = lab(c);
  return L > 95 && b < -0.8 && Math.hypot(a, b) < 6;
};
const WARM_SURFACE = { r: 255, g: 253, b: 246 };
const counts = { merged: 0, label: 0, warmed: 0 };

for (const { f, ast } of files) {
  ast.walkRules((rule) => {
    const uppercase = rule.nodes.some((n) => n.type === "decl" && n.prop === "text-transform" && /uppercase/.test(n.value));
    rule.walkDecls((d) => {
      if (!colorProp(d.prop)) return;
      let value = d.value.replace(COLOR_RE, (m) => {
        const c = parse(m);
        if (!c) return m;
        let target = parse(canonical.get(hex(c)) || hex(c));
        if (/background/.test(d.prop) && coolSurface(target)) {
          target = WARM_SURFACE;
          counts.warmed += 1;
        }
        const out = format(target, c.a);
        if (out.toLowerCase() !== m.toLowerCase() && hex(target) !== hex(c)) counts.merged += 1;
        return hex(target) === hex(c) ? m : out;
      });
      if (uppercase && d.prop === "color") {
        const only = value.match(COLOR_RE);
        const c = only && only.length === 1 ? parse(only[0]) : null;
        if (c && c.a >= 0.6 && isNeutral(c) && lab(c)[0] > 30 && lab(c)[0] < 75 && value.trim() === only[0]) {
          if (value.toLowerCase() !== LABEL_INK) {
            value = LABEL_INK;
            counts.label += 1;
          }
        }
      }
      d.value = value;
    });
  });
  if (write) fs.writeFileSync(path.join(dir, f), ast.toString());
}
if (report) for (const cl of clusters.filter((c) => c.members.length > 1).slice(0, 25)) console.log(cl.key, "←", cl.members.slice(1).map(([k, n]) => `${k}×${n}`).join(" "));
console.log(`${freq.size} distinct colours → ${clusters.length} after merging ΔE<${MERGE_DE}; ${write ? "rewrote" : "would rewrite"} ${counts.merged} literals, ${counts.label} label inks, ${counts.warmed} cool surfaces`);
