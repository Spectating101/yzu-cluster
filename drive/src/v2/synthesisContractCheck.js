import { readFileSync } from "node:fs";
import { EXAMPLE_STATE, FIELDS, validateThreadState, contractCoverage } from "./synthesisContract.js";

const arg = process.argv[2];

if (!arg || arg === "--help") {
  console.log("usage: node drive/src/v2/synthesisContractCheck.js <thread.json>");
  console.log("       node drive/src/v2/synthesisContractCheck.js --example > thread.json");
  console.log("       node drive/src/v2/synthesisContractCheck.js --fields\n");
  console.log("Reads a synthesis thread (or its .state) and reports which panels it lights up");
  console.log("and what the desk would have to fix. Exit 1 if any field is malformed.");
  process.exit(arg ? 0 : 2);
}

if (arg === "--example") {
  console.log(JSON.stringify({ state: EXAMPLE_STATE }, null, 2));
  process.exit(0);
}

if (arg === "--fields") {
  for (const [field, spec] of Object.entries(FIELDS)) {
    console.log(`${field.padEnd(20)} -> ${spec.panel.padEnd(30)} ${spec.produces}`);
  }
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(arg, "utf8"));
} catch (error) {
  console.error(`cannot read ${arg}: ${error.message}`);
  process.exit(2);
}

const state = parsed?.state && typeof parsed.state === "object" ? parsed.state : parsed;
const coverage = contractCoverage(state);
const problems = validateThreadState(state);

console.log(`panels this thread renders : ${coverage.panels.length ? coverage.panels.join(", ") : "none"}`);
console.log(`fields present             : ${coverage.present.join(", ") || "none"}`);
console.log(`fields absent              : ${coverage.absent.join(", ") || "none"}`);

if (!problems.length) {
  console.log("\nno contract problems.");
  process.exit(0);
}

console.log(`\n${problems.length} contract problem(s):`);
for (const problem of problems) {
  console.log(`  ${problem.field} (${problem.panel})\n    ${problem.problem}`);
}
process.exit(1);
