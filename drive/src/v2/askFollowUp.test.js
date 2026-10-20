import assert from "node:assert/strict";
import { test } from "node:test";
import { awaitsFullAnswer, lateAssistantRows } from "./askFollowUp.js";

test("a fast Library answer waits for the assistant's fuller reply", () => {
  assert.equal(awaitsFullAnswer({ action: "fast_lookup" }), true);
  assert.equal(awaitsFullAnswer({ artifacts: { full_answer_pending: true } }), true);
  assert.equal(awaitsFullAnswer({ action: "composer" }), false);
});

test("only assistant rows after the quick answer count as the late answer", () => {
  const rows = [
    { role: "user", content: "stablecoin data" },
    { role: "assistant", content: "Quick list" },
    { role: "assistant", content: "Fuller answer" },
    { role: "assistant", content: "  " },
  ];
  assert.deepEqual(lateAssistantRows(rows, "Quick list").map((row) => row.content), ["Fuller answer"]);
  assert.deepEqual(lateAssistantRows(rows.slice(0, 2), "Quick list"), []);
  assert.deepEqual(lateAssistantRows(rows, "not in history"), []);
});
