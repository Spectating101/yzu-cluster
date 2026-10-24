import test from "node:test";
import assert from "node:assert/strict";
import { discoverGroupOf, rowCitation, rowDescription, rowFacts } from "./discoverRowText.js";

test("descriptions are cleaned of HTML and entities", () => {
  assert.equal(
    rowDescription({ title: "Sobre el dinero", notes: "<p>I present in this text some aspects of inflation.<br>Money is debt.</p>" }),
    "I present in this text some aspects of inflation. Money is debt.",
  );
  assert.equal(
    rowDescription({ title: "PEP Survey", notes: "The purpose of this survey was to explore pay.&lt;br&gt;" }),
    "The purpose of this survey was to explore pay.",
  );
});

test("code, year-only notes and title echoes are not descriptions", () => {
  assert.equal(rowDescription({ title: "inflation", notes: 'load_dataset("davidberg/inflation")' }), "");
  assert.equal(rowDescription({ title: "Inflation (CPI)", notes: "2014" }), "");
  assert.equal(
    rowDescription({ title: "FRED series observations", public_summary: "FRED series observations. Bounded official API collection requires approval; no local mirror is implied." }),
    "",
  );
});

test("a later field is used when an earlier one is unusable", () => {
  assert.equal(
    rowDescription({ title: "X", description: "2019", notes: "Quarterly wage settlements by industry." }),
    "Quarterly wage settlements by industry.",
  );
});

test("catalogue facts read as grain, frequency, geography and licence", () => {
  assert.deepEqual(
    rowFacts({
      grain: "country_indicator_year",
      frequency: "annual",
      geography: "country global",
      licence: "IMF DataMapper; cite IMF",
    }),
    ["country × indicator × year", "annual", "country, global", "IMF DataMapper"],
  );
  assert.deepEqual(
    rowFacts({ frequency: "daily monthly quarterly annual; series-specific", geography: "US and international; series-specific" }),
    ["daily monthly quarterly annual", "US and international"],
  );
  assert.deepEqual(rowFacts({}), []);
});

test("citations name the repository and year, never an internal id", () => {
  assert.equal(rowCitation({ repository: "UK Data Service", publication_year: 1981 }), "UK Data Service · 1981");
  assert.equal(rowCitation({ source: "zenodo_api", publication_year: "2023" }), "Zenodo · 2023");
  assert.equal(rowCitation({ source: "collection_index" }), "");
  assert.equal(rowCitation({ provider: "Hugging Face" }), "Hugging Face");
  assert.equal(rowCitation({ source: "tavily", url: "https://en.wikipedia.org/wiki/Inflation" }), "en.wikipedia.org");
});

test("rows fall into the four Discover groups", () => {
  assert.equal(discoverGroupOf("local-query-ready").id, "library");
  assert.equal(discoverGroupOf("external-acquirable").id, "collectable");
  assert.equal(discoverGroupOf("licensed-manual").id, "access");
  assert.equal(discoverGroupOf("external-discoverable").id, "web");
  assert.equal(discoverGroupOf("").id, "web");
});

test("the same work listed twice collapses into the copy that has a description", async () => {
  const { collapseSameWork } = await import("./discoverRowText.js");
  const rows = collapseSameWork([
    { title: "PEP Survey on Inflation, 1975", source: "datacite", url: "https://ukds/1496" },
    { title: "inflation", provider: "Hugging Face" },
    { title: "PEP Survey on Inflation, 1975", repository: "UK Data Service", publication_year: 1981, notes: "The purpose of this survey was to explore pay." },
    { title: "inflation", repository: "OpenAlex", publication_year: 2023 },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].repository, "UK Data Service");
  assert.equal(rows[0].notes, "The purpose of this survey was to explore pay.");
});

test("rows already shown elsewhere are dropped; different years stay apart", async () => {
  const { collapseSameWork } = await import("./discoverRowText.js");
  const centre = [{ title: "Inflation (CPI)", repository: "OpenAlex", publication_year: 2014 }];
  assert.equal(collapseSameWork([{ title: "Inflation (CPI)", provider: "OpenAlex" }], centre).length, 0);
  assert.equal(collapseSameWork([
    { title: "Survey of household finances in Europe", publication_year: 2010 },
    { title: "Survey of household finances in Europe", publication_year: 2014 },
  ]).length, 2);
});
