import test from "node:test";
import assert from "node:assert/strict";
import { libraryVerification } from "./libraryVerification.js";

test("verification is not inferred from query readiness", () => {
  const verification = libraryVerification({ analysis_readiness: "instant" });
  assert.equal(verification.label, "Not checked");
  assert.equal(verification.kind, "unchecked");
});

test("explicit verification state and receipt detail are preserved", () => {
  const verification = libraryVerification({
    analysis_readiness: "metadata_search",
    verification_status: "verified",
    verification: {
      status: "verified",
      summary: "Source identity and archive manifest were checked.",
      checks: ["Source identity matched", "Archive manifest matched", "Source identity matched"],
    },
  });
  assert.equal(verification.label, "Verified");
  assert.equal(verification.body, "Source identity and archive manifest were checked.");
  assert.deepEqual(verification.checks, ["Source identity matched", "Archive manifest matched"]);
});

test("partial verification keeps unresolved evidence explicit", () => {
  const verification = libraryVerification({
    source_match: {
      state: "partial",
      reason: "Identity corresponds but field coverage is incomplete.",
      unknowns: ["Field completeness not established"],
    },
  });
  assert.equal(verification.label, "Partial");
  assert.deepEqual(verification.unknowns, ["Field completeness not established"]);
});

test("unknown verification tokens fail closed to not checked", () => {
  const verification = libraryVerification({ verification_status: "probably_ok" });
  assert.equal(verification.label, "Not checked");
  assert.equal(verification.explicit, true);
});
