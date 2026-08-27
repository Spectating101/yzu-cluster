import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibrarySearchAskPrompt,
  rankLibraryHoldings,
  scoreLibraryAsset,
} from "./librarySearch.js";

const rows = [
  {
    dataset_id: "gdelt_asia_daily_country_panel",
    name: "Asia daily news-risk panel",
    source: "GDELT GKG",
    grain: "country_day",
    coverage: "2018–2024",
    join_keys: ["date", "country_iso3"],
    description: "Daily country-level news intensity and risk measures for Asian economies.",
    analysis_readiness: "instant",
  },
  {
    dataset_id: "issuer_weekly_panel",
    name: "Issuer weekly fundamentals",
    source: "MOPS",
    grain: "issuer_week",
    coverage: "2015–2026",
    join_keys: ["issuer_id", "week"],
    description: "Taiwan issuer fundamentals aligned to weekly market observations.",
    analysis_readiness: "instant",
  },
  {
    dataset_id: "paper_attention_methods",
    name: "Measuring public attention with news data",
    asset_kind: "scholarly_work",
    source: "DataCite",
    doi: "10.1234/attention",
    description: "Scholarly methods paper on public attention proxies.",
    analysis_readiness: "registered",
  },
];

test("natural-language retrieval ranks evidence by multiple recorded dimensions", () => {
  const ranked = rankLibraryHoldings(rows, "daily Asian news risk");
  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
  assert.equal(ranked[0].search_match.confidence, "high");
  assert.ok(ranked[0].search_match.reasons.some((reason) => reason.kind === "identity" || reason.kind === "topic"));
});

test("field-name lookup reaches join keys even when the title never mentions them", () => {
  const ranked = rankLibraryHoldings(rows, "country_iso3");
  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
  const structure = ranked[0].search_match.reasons.find((reason) => reason.kind === "structure");
  assert.equal(structure?.value, "country_iso3");
  assert.deepEqual(ranked[0].search_match.matched_terms, ["country_iso3"]);
});

test("coverage and source are first-class retrieval evidence", () => {
  const ranked = rankLibraryHoldings(rows, "GDELT 2018 2024");
  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
  assert.ok(ranked[0].search_match.reasons.some((reason) => reason.kind === "source"));
  assert.ok(ranked[0].search_match.reasons.some((reason) => reason.kind === "coverage"));
});

test("collection navigation context can retrieve an asset without changing its identity", () => {
  const nav = new Map([["issuer_weekly_panel", "Markets Taiwan equities fundamentals"]]);
  const ranked = rankLibraryHoldings(rows, "Taiwan markets", nav);
  assert.equal(ranked[0].dataset_id, "issuer_weekly_panel");
  assert.ok(ranked[0].search_match.reasons.some((reason) => reason.kind === "organization" || reason.kind === "topic"));
});

test("paper and literature vocabulary reaches scholarly assets", () => {
  const ranked = rankLibraryHoldings(rows, "attention literature");
  assert.equal(ranked[0].dataset_id, "paper_attention_methods");
});

test("multi-token nonsense does not surface an asset from one accidental fragment", () => {
  const ranked = rankLibraryHoldings(rows, "weekly plutonium avocado telescope");
  assert.equal(ranked.length, 0);
});

test("scoring exposes evidence rather than a mysterious relevance number", () => {
  const match = scoreLibraryAsset(rows[0], "country daily GDELT");
  assert.ok(match.score > 0);
  assert.ok(match.coverage >= 2 / 3);
  assert.ok(match.reasons.length >= 2);
});

test("Ask handoff preserves instant candidates but explicitly keeps possession boundaries", () => {
  const ranked = rankLibraryHoldings(rows, "daily Asian news");
  const handoff = buildLibrarySearchAskPrompt("daily Asian news", ranked);
  assert.match(handoff.displayText, /Find in Library/);
  assert.match(handoff.prompt, /already held in my Library/i);
  assert.match(handoff.prompt, /Do not treat external Discover candidates as held Library evidence/i);
  assert.match(handoff.prompt, /gdelt_asia_daily_country_panel/);
});
