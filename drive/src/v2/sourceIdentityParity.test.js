import assert from "node:assert/strict";
import test from "node:test";

import { assessLocalSufficiency, candidateComparableSignals } from "./discoverSufficiency.js";

/**
 * Discover candidates arrive as sources and carry source_id only. Library rows
 * carry a human source_system as well. Comparing one precedence-picked field
 * matched a stable id against a display label, so a dataset the desk already
 * held reported as "No local alternative found".
 */
const CANDIDATE = { kind: "source", source_id: "yfinance_public", title: "Yahoo Finance (yfinance)" };
const HELD = {
  dataset_id: "public_equity_us_sp500_yfinance_daily",
  name: "S&P 500 daily stock prices",
  source_id: "yfinance_public",
  source_system: "Yahoo Finance (public proxy)",
};

test("a held dataset with the same source_id is not reported as absent", () => {
  const r = assessLocalSufficiency(CANDIDATE, [HELD]);
  assert.notEqual(r.state, "no-local-alternative", `reported ${r.label} despite an identical source_id`);
  assert.equal(r.bestLocal?.dataset_id, HELD.dataset_id);
});

test("a display label on one side only does not break identity", () => {
  const r = assessLocalSufficiency({ ...CANDIDATE }, [{ ...HELD, source_system: "" }]);
  assert.notEqual(r.state, "no-local-alternative");
});

test("matching on the label alone still works", () => {
  const r = assessLocalSufficiency(
    { kind: "source", source_system: "Yahoo Finance (public proxy)", title: "Yahoo" },
    [HELD],
  );
  assert.notEqual(r.state, "no-local-alternative");
});

test("an unrelated source is still reported as no alternative", () => {
  const r = assessLocalSufficiency(CANDIDATE, [
    { dataset_id: "climate_x", name: "Ocean heat", source_id: "noaa_public", source_system: "NOAA" },
  ]);
  assert.equal(r.state, "no-local-alternative");
});

test("an empty catalog is unknown, never a denial", () => {
  assert.equal(assessLocalSufficiency(CANDIDATE, []).state, "comparison-unknown");
});

test("source identity is still a comparable signal", () => {
  assert.ok(candidateComparableSignals(CANDIDATE).includes("source_identity"));
});
