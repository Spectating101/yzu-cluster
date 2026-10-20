import test from "node:test";
import assert from "node:assert/strict";
import { initials } from "./reachText.js";

test("sources without a logo get initials from their plain name", () => {
  assert.equal(initials("FRED, St. Louis Fed"), "FS");
  assert.equal(initials("US Census, American Community Survey"), "UC");
  assert.equal(initials("IMF"), "I");
  assert.equal(initials("Kenneth French Data Library"), "KF");
  assert.equal(initials("SEC company financials (XBRL)"), "SC");
});
