import { test, expect } from "@playwright/test";

// Prints what the built components actually render, so a reader sees the code's
// output rather than a drawing of it.
const STATE = {
  title: "IDN weekly factor exposure",
  objective: "Weekly excess return per Indonesian listed equity",
  maturity: "exploring", maturityLabel: "Exploring", lastActivity: "Thread created.",
  nodes: [], edges: [], proposal: null,
  spec: { input_dataset_id: "idn_fry_daily_cross_section" },
  scope_block: {
    rows: 1043042, limit: 1000000,
    options: [
      { id: "2020", from: "2020-01-01", rows: 969392 },
      { id: "2021", from: "2021-01-01", rows: 816932 },
      { id: "2023", from: "2023-01-01", rows: 506163 },
      { id: "all", label: "keep everything", rows: 1043042 },
    ],
  },
  unit_conflict: {
    left: { column: "return_1d", typical: 0.0006 },
    right: { column: "rf", typical: 0.012 },
    outcomes: [
      { id: "rescale", label: "rescale rf ÷100", result: -0.0002, recommended: true },
      { id: "asis", label: "leave them as they are", result: -0.02 },
    ],
  },
  columns_in_use: ["date", "yahoo_symbol", "return_1d"],
  column_profiles: [
    { column: "date", kind: "date", rows: 1043042, blanks: 0, distinct: 1653, flags: [] },
    { column: "yahoo_symbol", kind: "name", rows: 1043042, blanks: 0, distinct: 635, flags: [] },
    { column: "return_1d", kind: "measurement", rows: 1043042, blanks: 1265, distinct: 112892,
      flags: ["unit_twin"], twin_of: "return_1d_pct" },
    { column: "return_1d_pct", kind: "measurement", rows: 1043042, blanks: 1265, distinct: 112892,
      flags: ["unit_twin"], twin_of: "return_1d" },
    ...["fwd_1d", "fwd_2d", "fwd_5d"].map((c) => ({
      column: c, kind: "measurement", rows: 1043042, blanks: 635, distinct: 112970, flags: ["lookahead"] })),
    { column: "days_to_10pct", kind: "score", rows: 1043042, blanks: 966487, distinct: 5, flags: ["sparse"] },
    { column: "close", kind: "measurement", rows: 1043042, blanks: 0, distinct: 49819, flags: [] },
  ],
  join_candidate_dataset_id: "refinitiv_entity_market_spine_expanded",
  join_candidate_rows: 570,
  join_candidates: [
    { left_key: "yahoo_symbol", right_key: "yahoo_symbol", matched: 50, left_distinct: 635,
      match_rate_pct: 7.874, right_duplicate_rows: 0, usable: true, reason: null },
    { left_key: "yahoo_symbol", right_key: "isin", matched: 0, left_distinct: 635,
      match_rate_pct: 0, right_duplicate_rows: 0, usable: false,
      reason: "the column is empty on the right side" },
  ],
  settled_decisions: [
    { id: "grain", authority: "observed", summary: "target grain yahoo_symbol × week",
      evidence: "from the input's own keys" },
    { id: "asof", authority: "desk", summary: "align in time: as-of backward 5D",
      evidence: "100.0% matched · no lookahead" },
    { id: "scope", authority: "researcher", summary: "scope from 2020-01-01", evidence: "−7.1%" },
  ],
  excursions: [
    { id: "e1", at: "2026-08-18", searched: "regulatory filings", found: 1,
      verdict: "grain incompatible — issuer·quarter is coarser than asset·week" },
  ],
  provenance: {
    method_hash: "sha256:dd997b185c521d70e38557b5119f58cd", built_at: "2026-08-18 19:43 UTC",
    job_id: "job-synthesis-42", manifest_id: "mft_s04_0726", archive_verified: true,
    inputs: [
      { dataset_id: "idn_fry_daily_cross_section", fingerprint: "aa312a7412ff", files: 1, bytes: 35388 },
      { dataset_id: "public_macro_ff_factors_daily", fingerprint: "1d254213aa01", files: 1, bytes: 8697 },
    ],
    code_excerpt: "# step 2: align in time\nframe = pd.merge_asof(frame, ff, on='date',\n                      direction='backward',\n                      tolerance=pd.Timedelta('5D'))",
  },
  reuse_from: {
    method_hash: "sha256:dd997b185c521d70", output_dataset_id: "idn_weekly_factor_exposure",
    decisions: [
      { id: "grain", authority: "observed", summary: "asset × week" },
      { id: "asof", authority: "desk", summary: "as-of backward 5D" },
      { id: "scope", authority: "researcher", summary: "from 2020-01-01" },
    ],
  },
  reuse_changes: [
    { id: "metrics", label: "metrics", before: "5 defined", after: "7 defined" },
    { id: "scope", label: "scope", before: "2020-01-01", after: "2020-01-01" },
  ],
};

test("dump what the built panels render", async ({ page }) => {
  const thread = {
    id: "thread-dump", created_at: "2026-07-19T09:00:00+00:00",
    updated_at: "2026-07-19T09:00:00+00:00", title: STATE.title,
    objective: STATE.objective, materialisation: "not_materialised", state: STATE,
  };
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("thread-dump")
        ? thread : { threads: [thread], total: 1 }),
    }));
  await page.goto("/?tab=synthesis");
  await page.getByTestId("synthesis-thread-item").first().click();
  await page.getByTestId("synthesis-method-surface").waitFor();

  const ids = ["synthesis-scope-block", "synthesis-unit-conflict", "synthesis-method-surface",
               "synthesis-join-decision", "synthesis-settled-decisions",
               "synthesis-excursion-record", "synthesis-provenance", "synthesis-reuse"];
  const out = [];
  for (const id of ids) {
    const node = page.getByTestId(id);
    if (!(await node.count())) { out.push(`### ${id}\n(not rendered)`); continue; }
    const text = (await node.first().innerText()).split("\n").map((l) => "  " + l).join("\n");
    const box = await node.first().boundingBox();
    out.push(`### ${id}   ${box ? `${Math.round(box.width)}×${Math.round(box.height)}px` : ""}\n${text}`);
  }
  console.log("\n\n=== RENDERED BY THE BUILT COMPONENTS ===\n\n" + out.join("\n\n"));
  expect(out.length).toBe(8);
});
