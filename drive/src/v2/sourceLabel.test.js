import assert from "node:assert/strict";
import { test } from "node:test";
import { shortSourceLabel } from "./sourceLabel.js";

test("source labels are short names, not cut-off words", () => {
  assert.equal(shortSourceLabel("Wharton Research Data Services"), "WRDS");
  assert.equal(shortSourceLabel("CRSP / Chicago Booth"), "CRSP");
  assert.equal(shortSourceLabel("Yahoo Finance"), "YAHOO");
  assert.equal(shortSourceLabel("Binance"), "BINANCE");
  assert.equal(shortSourceLabel("Eurostat"), "EUROSTAT");
  assert.equal(shortSourceLabel("U.S. Census Bureau"), "UCB");
});
