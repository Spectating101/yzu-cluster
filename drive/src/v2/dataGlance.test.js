import test from "node:test";
import assert from "node:assert/strict";
import { formatGlanceCell, glanceColumns, glanceHeader } from "./dataGlance.js";

test("numeric strings are formatted and right-alignable", () => {
  assert.deepEqual(formatGlanceCell("8182"), { text: "8182", numeric: true });
  assert.deepEqual(formatGlanceCell("-1.0866283711609246"), { text: "-1.087", numeric: true });
  assert.equal(formatGlanceCell("1638364033638.5").text, "1.64e+12");
  assert.deepEqual(formatGlanceCell(""), { text: "—", numeric: false });
  assert.equal(formatGlanceCell("AUS").numeric, false);
});

test("columns lead with time and entity, skip identifiers, cap at four", () => {
  const rows = [{
    run_id: "x", source_file: "a.zip", date: "2018-01-01", country_iso3: "AUS",
    rows: "8182", unique_urls: "8159", mean_tone: "-1.08", note: "short",
  }];
  const cols = glanceColumns(rows, { time_field: "date", entity_fields: ["country_iso3"] });
  assert.deepEqual(cols, ["date", "country_iso3", "rows", "unique_urls"]);
});

test("nothing is chosen from an empty sample", () => {
  assert.deepEqual(glanceColumns([], {}), []);
  assert.equal(glanceHeader("country_iso3"), "country");
});
