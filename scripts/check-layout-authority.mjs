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
const pageRootPattern = /\.rd-v2-(?:home|library|discover|synthesis|resources|profile|settings)-page\b/;
const genericPagePattern = /\.rd-v2-page(?:\b|[\s,{.:#>+~])/;
const scrollValuePattern = /overflow(?:-y)?\s*:\s*(?:auto|scroll|overlay)\b/i;

function stripComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
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
    if (!scrollValuePattern.test(body)) continue;

    // Page roots are frames. Scrolling belongs to a designated descendant
    // (.rd-v2-body-scroll, evidence ledger, workbench pane), never the root.
    if ((pageRootPattern.test(selector) || genericPagePattern.test(selector)) && !selector.includes(".rd-v2-body-scroll")) {
      problems.push(`${file}: page-root selector claims vertical scrolling: ${selector.replace(/\s+/g, " ")}`);
    }
  }
}

const closureIndex = imports.indexOf("home-release-closure.css");
if (closureIndex < 0) {
  problems.push("main.jsx: home-release-closure.css must remain imported until the legacy Home release rule is removed at source");
} else if (closureIndex !== imports.length - 1) {
  problems.push("main.jsx: home-release-closure.css must be the final CSS authority while legacy release-visual Home overflow exists");
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

// Keep an explicit warning for the known legacy rule. It is neutralized by the
// final Home authority and runtime gate, but should be removed when release-visual
// is next consolidated rather than copied into any new layer.
const releaseVisual = fs.readFileSync(path.join(v2, "release-visual.css"), "utf8");
if (/\.rd-v2-home-page\s*\{[^}]*overflow-y\s*:\s*auto/i.test(stripComments(releaseVisual))) {
  warnings.push("release-visual.css still contains the historical Home overflow-y:auto; home-release-closure.css must remain final until that source layer is consolidated");
}

if (warnings.length) {
  console.warn("Layout authority warnings:\n- " + warnings.join("\n- "));
}
if (problems.length) {
  console.error("Layout authority violations:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Layout authority OK across ${imports.length} ordered CSS layers.`);
