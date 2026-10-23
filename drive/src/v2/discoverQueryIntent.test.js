import test from "node:test";
import assert from "node:assert/strict";
import { hasNeedShape } from "./discoverQueryIntent.js";

test("plain keywords and dataset names have no need shape", () => {
  for (const query of ["", "stablecoin", "inflation", "exchange rates", "stablecoin exchange volume", "TWSE daily prices", "unemployment across countries"]) {
    assert.equal(hasNeedShape(query), false, query);
  }
});

test("evidence needs with two dimensions have a need shape", () => {
  for (const query of ["monthly unemployment rate by country", "firm-level ESG scores 2010-2020", "weekly news shocks across Asian markets"]) {
    assert.equal(hasNeedShape(query), true, query);
  }
});
