import assert from "node:assert/strict";
import { test } from "node:test";
import { plainRoute } from "./plainText.js";

test("backend and collection method names read as plain words", () => {
  assert.equal(plainRoute("local_json_file"), "Local file");
  assert.equal(plainRoute("procurement_catalog"), "Catalogue record");
  assert.equal(plainRoute("http_manifest"), "File download");
  assert.equal(plainRoute("some_new_backend"), "Some new backend");
  assert.equal(plainRoute("Not recorded"), "Not recorded");
  assert.equal(plainRoute(""), "");
});
