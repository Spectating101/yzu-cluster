import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";
const nodes = [
  { id: "gdelt_asia_daily_country_panel", dataset_id: "gdelt_asia_daily_country_panel", type: "source", layer: "evidence", label: "Daily news shock panel for Asian countries (GDELT)", status: "registered", query_ready: true, grain: "country_day" },
  { id: "asia_country_week_news_market_primary", dataset_id: "asia_country_week_news_market_primary", type: "source", layer: "evidence", label: "Asia weekly news and market panel by country", status: "registered", query_ready: true, grain: "country_week" },
];
const spec = { input_dataset_id: "gdelt_asia_daily_country_panel", output_dataset_id: "asia_news_shocks_weekly", transforms: [{ op: "join", right_dataset_id: "asia_country_week_news_market_primary", on: ["country", "week"], how: "inner" }], group_by: ["country", "week"], metrics: [{ field: "shock_index", aggregate: "mean" }, { field: "ret_next_week", aggregate: "last" }] };
const join = [{ left_dataset_id: "gdelt_asia_daily_country_panel", right_dataset_id: "asia_country_week_news_market_primary", left_key: "country", right_key: "country", key_parts: ["country", "week"], matched: 5865, left_distinct: 6240, match_rate_pct: 94, right_duplicate_rows: 0, usable: true, complete_identity_domain: true }];
const base = (id, extra) => ({ id, created_at: "2026-10-22T08:00:00+00:00", updated_at: "2026-10-22T09:00:00+00:00", title: "Asia news shocks", objective: "Weekly news-shock measures for Asian markets, to test whether shocks lead returns.", materialisation: "not_materialised",
  state: { title: "Asia news shocks", objective: "Weekly news-shock measures for Asian markets, to test whether shocks lead returns.", required_grain: "country × week", join_candidate_dataset_id: "asia_country_week_news_market_primary", maturity: "review", maturityLabel: "Method review", nodes, edges: [], join_candidates: join, ...extra } });
const proposal = base("t-prop", { proposal: { id: "p1", proposal_hash: "sha256:p1", title: "Aggregate and join weekly", summary: "Average daily shocks to weeks, then join the market panel on country and week.", execution_preflight: { ok: true }, operations: [{ op: "update_spec", patch: { limitations: ["The market panel's date range is not reported."], unavailable: [] } }], execution_spec: spec } });
const built = base("t-built", { maturity: "registered", maturityLabel: "Registered output", execution_spec: spec, proposal: null, execution: { status: "registered", job_id: "j1", output_dataset_id: "asia_news_shocks_weekly", rows: 5200, drive_verified: true } });
built.materialisation = "registered";
async function install(page) {
  await mockV2Api(page);
  await page.route("**/library/synthesis/threads**", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/").filter(Boolean);
    const i = parts.lastIndexOf("threads"); const id = parts[i + 1] || ""; const suffix = parts.slice(i + 2).join("/");
    const respond = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (!id) return respond({ threads: [proposal, built], total: 2 });
    const t = id === "t-built" ? built : proposal;
    if (!suffix) return respond(t);
    if (suffix === "measurements") return respond({ thread_id: t.id, writes: false, measured_inputs: 2, input_dataset_ids: nodes.map((n) => n.dataset_id), unmeasured: [], column_profiles: [], join_candidates: join });
    return respond({});
  });
}

for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  test("proposal diagram keeps its nodes legible, ordered and apart at " + w, async ({ page }) => {
    await install(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Asia news shocks" }).first().click();
    const diagram = page.getByTestId("synthesis-method-diagram");
    await expect(diagram).toBeVisible();
    await expect(page.getByTestId("method-node-join-1")).toContainText("94% of keys match");
    const join = await page.getByTestId("method-node-join-1").boundingBox();
    const aggregate = await page.getByTestId("method-node-aggregate").boundingBox();
    expect(join.y, "join comes before the aggregate it feeds").toBeLessThan(aggregate.y);
    const boxes = [];
    for (const node of await diagram.locator(".s04-diagram-node").all()) boxes.push(await node.boundingBox());
    expect(boxes.length).toBe(5);
    for (const box of boxes) expect(box.width, "a node is wide enough to read").toBeGreaterThan(180);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]; const b = boxes[j];
        const apart = a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
        expect(apart, "nodes " + i + " and " + j + " must not overlap").toBe(true);
      }
    }
    const diagramBox = await diagram.boundingBox();
    const main = await page.locator(".s04-main").boundingBox();
    expect(diagramBox.width, "the diagram spans the centre column").toBeGreaterThan(main.width * 0.85);
    const proposal = await page.getByTestId("synthesis-proposal-state").boundingBox();
    expect(diagramBox.y, "the diagram leads the proposal").toBeLessThan(proposal.y);
  });

  test("built diagram leads the result and its finished-build line stays on one line at " + w, async ({ page }) => {
    await install(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Asia news shocks" }).nth(1).click();
    const diagram = page.getByTestId("synthesis-method-diagram");
    await expect(diagram).toBeVisible();
    const result = await page.getByTestId("synthesis-registered-state").boundingBox();
    expect((await diagram.boundingBox()).y).toBeLessThan(result.y);
    await expect(diagram.getByTestId("method-node-output")).toContainText("5,200 rows");
    const done = await page.getByTestId("synthesis-exec-done").boundingBox();
    expect(done.height, "the finished-build line is a single line").toBeLessThan(40);
  });
}
