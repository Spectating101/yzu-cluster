import assert from "node:assert/strict";
import { test } from "node:test";
import { storageFree, storageUsed } from "./storageFormat.js";

test("storage reads in one sensible unit", () => {
  assert.equal(storageUsed(0.939, 3, "TB"), "0.94 of 3 TB used");
  assert.equal(storageUsed(1231.76, 1863.01, "GB"), "1.23 of 1.86 TB used");
  assert.equal(storageUsed(403, 444, "GB"), "403 of 444 GB used");
  assert.equal(storageFree(631.25), "631 GB free");
  assert.equal(storageFree(2.061, "TB"), "2.06 TB free");
  assert.equal(storageUsed(null, 3, "TB"), "");
});
