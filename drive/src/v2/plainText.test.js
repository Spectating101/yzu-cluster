import assert from "node:assert/strict";
import { test } from "node:test";
import { plainAccess, plainGrain, plainRoute } from "./plainText.js";

test("backend and collection method names read as plain words", () => {
  assert.equal(plainRoute("local_json_file"), "Local file");
  assert.equal(plainRoute("procurement_catalog"), "Catalogue record");
  assert.equal(plainRoute("http_manifest"), "File download");
  assert.equal(plainRoute("some_new_backend"), "Some new backend");
  assert.equal(plainRoute("Not recorded"), "Not recorded");
  assert.equal(plainRoute(""), "");
});

test("units of observation and access modes read as plain words", () => {
  assert.equal(plainGrain("county_month_measure"), "county × month × measure");
  assert.equal(plainGrain("country_year"), "country × year");
  assert.equal(plainGrain("procured_snapshot"), "");
  assert.equal(plainGrain(""), "");
  assert.equal(plainAccess("procurement_catalog"), "Collected on request");
  assert.equal(plainAccess("live_connector"), "Searched live");
  assert.equal(plainAccess("some_new_mode"), "Some new mode");
  assert.equal(plainAccess(""), "");
});
