import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const v2 = path.join(root, "drive", "src", "v2");
const main = fs.readFileSync(path.join(v2, "main.jsx"), "utf8");

const imports = [...main.matchAll(/import\s+["']\.\/(.+?\.css)["'];?/g)].map((match) => match[1]);
if (!imports.length) throw new Error("No v2 CSS imports found in main.jsx");

const problems = [];
const rootToken = /\.rd-v2-(?:home|library|discover|synthesis|resources|profile|settings)-page\b|\.rd-v2-page\b/g;
const scrollValuePattern = /overflow(?:-y)?\s*:\s*(?:auto|scroll|overlay)\b/i;
const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, "");

function selectorTargetsPageRoot(selector) {
  return selector.split(",").some((raw) => {
    const part = raw.trim();
    const matches = [...part.matchAll(rootToken)];
    if (!matches.length) return false;
    const last = matches[matches.length - 1];
    const tail = part.slice((last.index || 0) + last[0].length);
    return !/(?:\s|>|\+|~)/.test(tail);
  });
}

const sheets = [];
for (const file of imports) {
  const filePath = path.join(v2, file);
  if (!fs.existsSync(filePath)) {
    problems.push(`${file}: imported CSS file does not exist`);
    continue;
  }
  sheets.push({ file, css: stripComments(fs.readFileSync(filePath, "utf8")) });
}

// PageShell's body owns vertical scrolling; a page root that scrolls creates a second scrollbar.
for (const { file, css } of sheets) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    if (scrollValuePattern.test(match[2]) && selectorTargetsPageRoot(selector)) {
      problems.push(`${file}: page-root selector claims vertical scrolling: ${selector.replace(/\s+/g, " ")}`);
    }
  }
}

const all = sheets.map((s) => s.css).join("\n");
const require = (pattern, message) => {
  if (!pattern.test(all)) problems.push(message);
};
require(/\.rd-v2-home-page[^{]*\{[^}]*overflow\s*:\s*hidden/, "Home root must explicitly reject outer scrolling");
require(/\.rd-v2-home-page\s+\.rd-v2-body-scroll[^{]*\{[^}]*padding-bottom/, "Home body must retain bottom scroll clearance");
require(/\.rd-v2-library-page\s+\.rd-v2-body-scroll[^{]*\{[^}]*overflow-y\s*:\s*auto/, "sparse Library must restore PageShell body scrolling");
require(/\.rd-v2-library-page\s+\.rd-v2-cap-ledger-body[^{]*\{[^}]*overflow\s*:\s*visible/, "sparse Library ledger must not compete with its PageShell scroll owner");

if (problems.length) {
  console.error("Layout authority violations:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Layout authority OK across ${imports.length} ordered CSS layers.`);
