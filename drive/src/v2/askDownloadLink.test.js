import assert from "node:assert/strict";
import { test } from "node:test";
import { askDownloadLink } from "./askDownloadLink.js";

test("saved data links remain actionable after reply formatting", () => {
  assert.deepEqual(askDownloadLink("[Download CSV](/library/datasets/public_bundle/download?revision=r1)"),
    { label: "Download CSV", href: "/library/datasets/public_bundle/download?revision=r1" });
});

test("reply text cannot turn arbitrary navigation or executable URLs into downloads", () => {
  for (const target of ["javascript:alert(1)", "//example.com/file", "/library/jobs/job/approve", "/library/datasets/../download", "/library/datasets/a/download?evil=1"]) {
    assert.equal(askDownloadLink(`[Download CSV](${target})`), null);
  }
});
