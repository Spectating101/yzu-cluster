import test from "node:test";
import assert from "node:assert/strict";
import { listDescription } from "./listDescription.js";

test("list descriptions drop the boilerplate opening", () => {
  assert.equal(listDescription("This dataset is a country-by-week panel for Asia."), "Country-by-week panel for Asia.");
  assert.equal(listDescription("This dataset tracks day-by-day changes in news."), "Tracks day-by-day changes in news.");
  assert.equal(listDescription("This dataset links company names to tickers."), "Links company names to tickers.");
  assert.equal(listDescription("Official U.S. Bureau of Labor Statistics observations."), "Official U.S. Bureau of Labor Statistics observations.");
  assert.equal(listDescription(""), "");
});
