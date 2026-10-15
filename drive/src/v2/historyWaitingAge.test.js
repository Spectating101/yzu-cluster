import assert from "node:assert/strict";
import { test } from "node:test";
import { waitingAge } from "./historyAge.js";

test("waiting requests show how long they have waited", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(waitingAge("2026-10-15T08:00:00Z", now), "waiting since today");
  assert.equal(waitingAge("2026-10-14T08:00:00Z", now), "waiting 1 day");
  assert.equal(waitingAge("2026-10-05T12:00:00Z", now), "waiting 10 days");
  assert.equal(waitingAge("2026-09-08T11:59:00Z", now), "waiting 5 weeks");
  assert.equal(waitingAge("2026-06-01T00:00:00Z", now), "waiting 4 months");
  assert.equal(waitingAge("", now), "");
});
