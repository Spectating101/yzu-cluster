import test from "node:test";
import assert from "node:assert/strict";
import { webHitsToRows } from "./discoverActions.js";

test("web context descriptions are rendered as plain text", () => {
  const [row] = webHitsToRows({
    sections: [{ rows: [{
      title: "Forest fire evidence",
      url: "https://example.test/fire",
      description: "<p>Fire&nbsp;has <em>economic</em> consequences.</p>",
    }] }],
  });

  assert.equal(row.description, "Fire has economic consequences.");
  assert.doesNotMatch(row.description, /<\/?[a-z]/i);
});
