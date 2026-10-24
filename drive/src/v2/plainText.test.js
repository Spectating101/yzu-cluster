import assert from "node:assert/strict";
import { test } from "node:test";
import { grainAfterBuild, plainAccess, plainGrain, plainRoute } from "./plainText.js";

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
  assert.equal(plainAccess("http_manifest"), "File download");
  assert.equal(plainAccess("local_json_file"), "Local file");
  assert.equal(plainAccess("some_new_mode"), "Some new mode");
  assert.equal(plainAccess(""), "");
});

test("only dimension words form crossed units of observation", () => {
  for (const dimension of [
    "country", "county", "state", "region", "city", "year", "quarter", "month", "week", "day", "date", "hour", "minute",
    "firm", "company", "issuer", "ticker", "symbol", "security", "asset", "instrument", "index", "constituent",
    "industry", "sector", "measure", "series", "interval", "product", "person", "household",
  ]) {
    assert.equal(plainGrain(`${dimension}_year`), `${dimension} × year`);
    assert.equal(plainGrain(`${dimension}-month`), `${dimension} × month`);
  }
  assert.equal(plainGrain("county-month_measure"), "county × month × measure");
  for (const grain of ["time_series", "firm_level", "scholarly_work", "not_documented", "time-series"]) {
    assert.equal(plainGrain(grain), grain.replace(/[_-]/g, " "));
  }
  assert.equal(plainGrain("country_year_total"), "country year total");
  assert.equal(plainGrain(" county_month "), "county × month");
  assert.equal(plainGrain("One row per firm"), "One row per firm");
});

test("internal collection grains stay hidden", () => {
  for (const grain of ["procured_snapshot", "catalog_harvest", "scrape_snapshot"]) {
    assert.equal(plainGrain(grain), "");
  }
});

test("written-out grain keeps its dates, and a built output drops the not-yet wording", () => {
  const prose = "Intended output: one row per calendar month from 2016-09 onward; not yet constructed.";
  assert.equal(plainGrain(prose), prose);
  assert.equal(grainAfterBuild(prose, false), prose);
  assert.equal(grainAfterBuild(prose, true), "one row per calendar month from 2016-09 onward");
});
