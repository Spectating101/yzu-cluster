import assert from "node:assert/strict";
import test from "node:test";

import { synthesisDraftBrief } from "./synthesisDraft.js";

test("difference-in-differences states an intended research use", () => {
  const brief = synthesisDraftBrief(
    "Build a county × year panel for 2000–2025 linking wildfire exposure to " +
      "employment outcomes for a difference-in-differences study.",
  );

  assert.equal(brief.cues.find((cue) => cue.id === "use")?.ready, true);
  assert.equal(brief.complete, 4);
  assert.equal(brief.values.targetGrain, "county × year");
  assert.equal(brief.values.targetPeriod, "2000–2025");
  assert.equal(brief.values.intendedUse, "for a difference-in-differences study");
});
