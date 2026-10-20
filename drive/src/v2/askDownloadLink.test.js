import assert from "node:assert/strict";
import { test } from "node:test";
import { askDownloadLink, datasetDownloadHref } from "./askDownloadLink.js";

test("saved data links remain actionable after reply formatting", () => {
  assert.deepEqual(askDownloadLink("[Download CSV](/library/datasets/public_bundle/download?revision=r1)"),
    { label: "Download CSV", href: "/library/datasets/public_bundle/download?revision=r1" });
});

test("reply text cannot turn arbitrary navigation or executable URLs into downloads", () => {
  for (const target of ["javascript:alert(1)", "//example.com/file", "/library/jobs/job/approve", "/library/datasets/../download", "/library/datasets/a/download?evil=1"]) {
    assert.equal(askDownloadLink(`[Download CSV](${target})`), null);
  }
});

test("a dataset offers a full download only for the server's own download route", () => {
  assert.equal(datasetDownloadHref({ full_download: "/library/datasets/craft_x/download?revision=r%201" }), "/library/datasets/craft_x/download?revision=r%201");
  for (const full_download of [undefined, "", "https://example.com/x.csv", "/library/jobs/1/approve", 42]) {
    assert.equal(datasetDownloadHref({ full_download }), "");
  }
});
