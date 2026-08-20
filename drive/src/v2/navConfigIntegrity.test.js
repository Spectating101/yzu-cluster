import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A regex meant to remove ClusterIcon ran past its terminator and took five
// other icon definitions with it. Vite compiled the result without complaint and
// every bundle string check passed, but the app did not mount: an undefined
// identifier inside JSX is a runtime error, invisible to a build or a grep.
//
// nav-config.jsx imports through the @/v2 alias, which node cannot resolve, so
// this reads the source rather than the module.
const SOURCE = readFileSync(new URL("./nav-config.jsx", import.meta.url), "utf8");

const referenced = [...new Set([...SOURCE.matchAll(/Icon:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
const defined = [...new Set([...SOURCE.matchAll(/^const\s+([A-Za-z_$][\w$]*Icon)\s*=/gm)].map((m) => m[1]))];

test("every icon the sidebar references is defined in the same file", () => {
  const missing = referenced.filter((name) => !defined.includes(name));
  assert.deepEqual(missing, [], `referenced but never defined: ${missing.join(", ")}`);
});

test("no icon survives a removal without a reference", () => {
  const orphan = defined.filter((name) => !referenced.includes(name));
  assert.deepEqual(orphan, [], `defined but unreferenced: ${orphan.join(", ")}`);
});

test("the sidebar still names every destination it is supposed to", () => {
  for (const id of ["home", "library", "browse", "resources", "profile", "settings"]) {
    assert.ok(new RegExp(`id:\\s*"${id}"`).test(SOURCE), `${id} tab is missing`);
  }
});

test("Cluster is gone from the sidebar", () => {
  assert.equal(/Cluster/.test(SOURCE), false, "nav-config still mentions Cluster");
  assert.equal(/id:\s*"cluster"/.test(SOURCE), false);
});

test("the guard would have caught the defect it exists for", () => {
  const broken = SOURCE.replace(/^const\s+SynthesisIcon\s*=[\s\S]*?^\);\n/m, "");
  const stillReferenced = /Icon:\s*SynthesisIcon/.test(broken);
  const stillDefined = /^const\s+SynthesisIcon\s*=/m.test(broken);
  assert.equal(stillReferenced && !stillDefined, true, "the fixture no longer reproduces the bug");
});
