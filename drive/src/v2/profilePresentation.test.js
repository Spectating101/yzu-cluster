import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_SECTION_ORDER,
  assertNoExamplePrimary,
  buildProfileRailState,
  profileCentreMode,
  profilePrimaryCommand,
} from "./profilePresentation.js";
import { buildWorks } from "./profileViewModel.js";

test("Profile centre model is exactly Memory → Works → Lab", () => {
  assert.deepEqual(PROFILE_SECTION_ORDER, ["memory", "works", "lab"]);
});

test("unbound profile is not shown as primary EXAMPLE bind", () => {
  assert.equal(profileCentreMode(null), "unbound");
  const cmd = profilePrimaryCommand("unbound");
  assert.equal(cmd?.tab, "settings");
  assert.equal(assertNoExamplePrimary("unbound", cmd), true);
});

test("Profile Detail rail never says Loading when profile data exists", () => {
  const unbound = buildProfileRailState({ profile: { unknown: true }, profileResolved: true });
  assert.equal(unbound.loadingLabel, null);
  assert.match(unbound.judgement, /Connect a faculty email/i);

  const bound = buildProfileRailState({
    profile: {
      name_en: "Kong, De-Rong",
      email: "drkong@saturn.yzu.edu.tw",
      discipline: "Finance",
    },
    profileResolved: true,
  });
  assert.equal(bound.status, "context");
  assert.equal(bound.primaryAction, null);

  const work = buildProfileRailState({
    profile: { name_en: "Kong, De-Rong" },
    profileResolved: true,
    selectedWork: { title: "NFT risk", type: "Publication", relationship: "FinTech", raw: "x" },
  });
  assert.equal(work.primaryAction?.id, "ask-work");
});

test("Works capped at three", () => {
  const works = buildWorks({
    paper_count: 18,
    publication_highlights: [
      "Kong (2023). One.",
      "Kong (2022). Two.",
      "Kong (2021). Three.",
      "Kong (2020). Four.",
    ],
  });
  assert.ok(works.items.length <= 3);
});
