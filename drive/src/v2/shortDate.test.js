import test from "node:test";
import assert from "node:assert/strict";
import { shortDate } from "./shortDate.js";

const now = new Date("2026-10-22T12:00:00Z");

test("a date in another year carries its year, one in this year does not", () => {
  assert.match(shortDate("2025-09-10T08:00:00Z", { now }), /2025/);
  assert.doesNotMatch(shortDate("2026-09-10T08:00:00Z", { now }), /2026/);
});

test("time is optional and an invalid date gives an empty string", () => {
  assert.match(shortDate("2026-09-10T08:30:00Z", { now, time: true }), /\d{1,2}:\d{2}/);
  assert.equal(shortDate("not a date", { now }), "");
});
