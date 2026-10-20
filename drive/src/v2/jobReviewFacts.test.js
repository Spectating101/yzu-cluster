import assert from "node:assert/strict";
import { test } from "node:test";
import { jobReviewFacts } from "./jobReviewFacts.js";

test("review exposes each provider's distinct bounds and identities", () => {
  const facts = jobReviewFacts({
    parts: [
      { source_id: "fred_observations", request: { series_ids: ["UNRATE"], start: "2023-01-01", end: "2023-02-28" } },
      { source_id: "world_bank_indicators", request: { indicator_ids: ["SP.POP.TOTL"], countries: ["USA"], start: "2022", end: "2023" } },
    ],
    output_format: "csv",
  });
  const values = Object.fromEntries(facts.map(({ label, value }) => [label, value]));
  assert.equal(values["Part 1 · Source"], "FRED");
  assert.equal(values["Part 1 · Period"], "2023-01-01 → 2023-02-28");
  assert.equal(values["Part 1 · Series"], "UNRATE");
  assert.equal(values["Part 2 · Source"], "World Bank");
  assert.equal(values["Part 2 · Period"], "2022 → 2023");
  assert.equal(values["Part 2 · Countries"], "USA");
  assert.equal(values["Output format"], "csv");
  assert.ok(facts.every(({ value }) => !value.includes("[object Object]")));
});

test("single-provider review retains its bounds and readable structured options", () => {
  const facts = jobReviewFacts({ start: "2023", end: "2024", instruments: ["AAPL.O"], options: { currency: "USD" } });
  assert.equal(facts.find(({ label }) => label === "Period").value, "2023 → 2024");
  assert.equal(facts.find(({ label }) => label === "Series").value, "AAPL.O");
  assert.equal(facts.find(({ label }) => label === "Options").value, '{"currency":"USD"}');
});
