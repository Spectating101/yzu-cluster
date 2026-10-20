/**
 * Compound questions: partial matches are labelled and ranked after full matches.
 * Run: node --test drive/src/v2/discoverPartialMatches.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { partialFitLine, sourcesResponseToRows } from "./discoverAdapters.js";
import { orderDiscoverResults } from "./discoverTaxonomy.js";

const response = {
  results: [{ kind: "source", source_id: "coingecko", title: "CoinGecko", candidate_key: "source:coingecko" }],
  partial_matches: [
    {
      kind: "live_candidate",
      title: "Stablecoin Depeg Detection",
      candidate_key: "doi:depeg",
      covers: ["stablecoin de-peg events search attention"],
      missing: ["crypto volatility"],
    },
  ],
};

describe("Discover partial matches", () => {
  it("maps partial matches into rows with their fit", () => {
    const rows = sourcesResponseToRows(response);
    assert.deepEqual(rows.map((row) => row.candidate_key), ["source:coingecko", "doi:depeg"]);
    assert.equal(rows[0].partial_fit, undefined);
    assert.deepEqual(rows[1].partial_fit.missing, ["crypto volatility"]);
  });

  it("orders partial rows after every full match", () => {
    const rows = sourcesResponseToRows(response);
    const ordered = orderDiscoverResults([rows[1], rows[0]], new Set());
    assert.equal(ordered.at(-1).candidate_key, "doi:depeg");
  });

  it("states what a partial row covers and misses", () => {
    const [, partial] = sourcesResponseToRows(response);
    assert.equal(
      partialFitLine(partial),
      "Covers stablecoin de-peg events search attention · missing crypto volatility",
    );
    assert.equal(partialFitLine({}), null);
  });
});
