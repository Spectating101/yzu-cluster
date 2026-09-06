import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const v2 = path.join(root, "drive", "src", "v2");
const mainPath = path.join(v2, "main.jsx");
const main = fs.readFileSync(mainPath, "utf8");

const imports = [...main.matchAll(/import\s+["']\.\/(.+?\.css)["'];?/g)].map((match) => match[1]);
if (!imports.length) throw new Error("No v2 CSS imports found in main.jsx");

const problems = [];
const warnings = [];
const rootToken = /\.rd-v2-(?:home|library|discover|synthesis|resources|profile|settings)-page\b|\.rd-v2-page\b/g;
const scrollValuePattern = /overflow(?:-y)?\s*:\s*(?:auto|scroll|overlay)\b/i;

function stripComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

function selectorTargetsPageRoot(selector) {
  return selector.split(",").some((raw) => {
    const part = raw.trim();
    const matches = [...part.matchAll(rootToken)];
    if (!matches.length) return false;
    const last = matches[matches.length - 1];
    const tail = part.slice((last.index || 0) + last[0].length);
    // Same-element qualifiers are fine (.foo, :has(), :hover). A combinator or
    // whitespace means the selector targets a descendant, not the page frame.
    return !/(?:\s|>|\+|~)/.test(tail);
  });
}

for (const file of imports) {
  const filePath = path.join(v2, file);
  if (!fs.existsSync(filePath)) {
    problems.push(`${file}: imported CSS file does not exist`);
    continue;
  }
  const css = stripComments(fs.readFileSync(filePath, "utf8"));
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const body = match[2];
    if (!scrollValuePattern.test(body) || !selectorTargetsPageRoot(selector)) continue;

    // Historical release-visual Home rules are explicitly quarantined until
    // that large visual layer is consolidated. The final Home closure rejects
    // their scroll ownership and must stay last in the import order meanwhile.
    const documentedLegacyHome = file === "release-visual.css"
      && selector.split(",").every((part) => part.trim().startsWith(".rd-v2-home-page"));
    if (!documentedLegacyHome) {
      problems.push(`${file}: page-root selector claims vertical scrolling: ${selector.replace(/\s+/g, " ")}`);
    }
  }
}

const closureIndex = imports.indexOf("home-release-closure.css");
if (closureIndex < 0) {
  problems.push("main.jsx: home-release-closure.css must remain imported until legacy Home release rules are removed at source");
} else if (closureIndex !== imports.length - 1) {
  problems.push("main.jsx: home-release-closure.css must be the final CSS authority while legacy Home overflow exists");
}

const homeClosure = fs.readFileSync(path.join(v2, "home-release-closure.css"), "utf8");
if (!/\.rd-v2-home-page[\s\S]*?overflow\s*:\s*hidden/.test(homeClosure)) {
  problems.push("home-release-closure.css: Home root must explicitly reject outer scrolling");
}
if (!/\.rd-v2-home-page\s+\.rd-v2-body-scroll[\s\S]*?padding-bottom/.test(homeClosure)) {
  problems.push("home-release-closure.css: Home body must retain bottom scroll clearance");
}

const libraryAuto = fs.readFileSync(path.join(v2, "library-auto-catalog.css"), "utf8");
if (!/\.rd-v2-library-page\s+\.rd-v2-body-scroll[\s\S]*?overflow-y\s*:\s*auto/.test(libraryAuto)) {
  problems.push("library-auto-catalog.css: sparse Library must explicitly restore PageShell body scrolling");
}
if (!/\.rd-v2-library-page\s+\.rd-v2-cap-ledger-body[\s\S]*?overflow\s*:\s*visible/.test(libraryAuto)) {
  problems.push("library-auto-catalog.css: sparse Library ledger must not compete with its PageShell scroll owner");
}

const scale = fs.readFileSync(path.join(v2, "release-scale.css"), "utf8");
if (!/@media\s*\(max-width:\s*720px\)[\s\S]*?\.yzu-main\s*\{[\s\S]*?padding-bottom\s*:\s*132px[\s\S]*?overflow\s*:\s*hidden/.test(scale)) {
  problems.push("release-scale.css: mobile main must reserve fixed chrome and remain non-scrolling");
}

const releaseVisual = stripComments(fs.readFileSync(path.join(v2, "release-visual.css"), "utf8"));
const legacyHomeScrolls = [...releaseVisual.matchAll(/\.rd-v2-home-page[^,{]*\s*\{[^}]*overflow-y\s*:\s*auto/gi)].length;
if (legacyHomeScrolls) {
  warnings.push(`release-visual.css contains ${legacyHomeScrolls} quarantined Home page-root overflow rule(s); do not copy them into new layers`);
}

if (warnings.length) console.warn("Layout authority warnings:\n- " + warnings.join("\n- "));
if (problems.length) {
  console.error("Layout authority violations:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Layout authority OK across ${imports.length} ordered CSS layers.`);
