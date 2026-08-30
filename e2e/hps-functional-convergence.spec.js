import { test, expect } from "@playwright/test";
import { MOCK_HEALTH, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const QUIET_HEALTH = {
  ...MOCK_HEALTH,
  desk: {
    ...MOCK_HEALTH.desk,
    jobs: {
      ...MOCK_HEALTH.desk.jobs,
      running: 0,
      pending_approval: 0,
    },
  },
};

const PROPOSAL_THREAD = {
  id: "thread-home-proposal",
  created_at: "2026-08-27T12:00:00Z",
  updated_at: "2026-08-27T12:30:00Z",
  title: "Weekly trust panel",
  objective: "Aggregate held stablecoin evidence at weekly grain.",
  materialisation: "not_materialised",
  state: {
    title: "Weekly trust panel",
    objective: "Aggregate held stablecoin evidence at weekly grain.",
    required_grain: "asset × week",
    nodes: [{ id: "held", dataset_id: "gdelt_asia_daily_country_panel", type: "source", layer: "evidence", label: "Held evidence", status: "held" }],
    edges: [],
    proposal: {
      id: "proposal-home-v1",
      proposal_hash: "sha256:home-v1",
      title: "Aggregate weekly",
      summary: "Aggregate the exact held evidence by week.",
      execution_preflight: { ok: true },
      operations: [],
      execution_spec: { input_dataset_id: "gdelt_asia_daily_country_panel", output_dataset_id: "weekly_trust_panel", group_by: ["week"] },
    },
    execution_spec: null,
    execution: null,
  },
};

const GAP_THREAD = {
  id: "thread-evidence-gap",
  created_at: "2026-08-27T13:00:00Z",
  updated_at: "2026-08-27T13:10:00Z",
  title: "Stablecoin sentiment gap",
  objective: "Construct a weekly stablecoin sentiment signal while preserving the missing-source boundary.",
  materialisation: "not_materialised",
  state: {
    title: "Stablecoin sentiment gap",
    objective: "Construct a weekly stablecoin sentiment signal while preserving the missing-source boundary.",
    required_grain: "asset × week",
    nodes: [
      { id: "target", type: "target", layer: "target", label: "Stablecoin sentiment signal", interpretation: "Weekly research target" },
      { id: "missing-source", dataset_id: "missing-source", type: "source", layer: "evidence", label: "Missing weekly sentiment", role: "Needed evidence", status: "missing", grain: "asset-week" },
    ],
    edges: [],
    proposal: null,
    execution_spec: null,
    execution: null,
  },
};

async function installSynthesisMock(page, threads = [PROPOSAL_THREAD], handoffs = {}, { failFirstList = false } = {}) {
  const byId = new Map(threads.map((thread) => [thread.id, structuredClone(thread)]));
  let listReads = 0;
  await page.route("**/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const id = parts[index + 1] || "";
    const suffix = parts.slice(index + 2).join("/");
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!id && route.request().method() === "GET") {
      listReads += 1;
      if (failFirstList && listReads === 1) return respond({ error: "temporary thread-store outage" }, 503);
      return respond({ threads: [...byId.values()], total: byId.size });
    }
    const thread = byId.get(id);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix) return respond(thread);
    if (suffix === "measurements") return respond({ thread_id: id, writes: false, measured_inputs: 0, input_dataset_ids: [], unmeasured: [], column_profiles: [] });
    if (suffix === "evidence-map") return respond({ thread_id: id, nodes: [], reason: "No additional held evidence proposed", review_required: true, writes: false });
    if (suffix === "discover-handoff") {
      return respond(handoffs[id] || { thread_id: id, missing_evidence: [], collect_intents: [] });
    }
    if (suffix === "materialisation") return respond({ thread_id: id, status: "not_materialised" });
    return respond({});
  });
}

const PROFILE = {
  found: true,
  profile: {
    name_en: "Kong, De-Rong",
    title: "Assistant Professor",
    discipline: "Finance",
    email: "drkong@saturn.yzu.edu.tw",
    paper_count_parsed: 18,
    specialties: ["empirical asset pricing", "FinTech"],
    domain_tags: ["fintech"],
    research_tracks: [{ id: "token", title: "Token taxonomy — on-chain and off-chain data", phase: "active_grant", weight: 10 }],
    method_tags: ["panel_data"],
    publication_highlights: ["Kong, D.-R. (2021). Alternative investments in the FinTech era."],
    lab_fintech_stack: [
      { id: "held-link", label: "GDELT evidence relationship", route: "vault", registry_dataset_ids: ["gdelt_asia_daily_country_panel"] },
      { id: "recorded-only", label: "Unconfirmed private panel", route: "vault", registry_dataset_ids: ["not_in_current_library"] },
    ],
    procurement_recommendations: [{ dataset: "MOPS financial statements", source_route: "mops", search_query: "MOPS" }],
  },
};

test("Home chooses reviewable Synthesis ahead of passive Library recency and resumes the exact thread", async ({ page }) => {
  await mockV2Api(page, { jobsBody: { jobs: [] }, healthBody: QUIET_HEALTH });
  await installSynthesisMock(page);
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const pick = page.getByTestId("home-continue");
  await expect(pick).toHaveAttribute("data-kind", "synthesis_thread");
  await expect(pick).toContainText("Weekly trust panel");
  await expect(pick).toContainText(/Proposal review/i);
  await pick.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("synthesis-studio")).toBeVisible();
  const exactThread = page.getByTestId("synthesis-thread-item").filter({ hasText: "Weekly trust panel" });
  await expect(exactThread).toHaveClass(/active/);
  await expect(page.locator(".s04-head h1")).toHaveText("Weekly trust panel");
});

test("Home retries one transient Synthesis read so a durable review is not lost behind Library recency", async ({ page }) => {
  await mockV2Api(page, { jobsBody: { jobs: [] }, healthBody: QUIET_HEALTH });
  await installSynthesisMock(page, [PROPOSAL_THREAD], {}, { failFirstList: true });
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const pick = page.getByTestId("home-continue");
  await expect(pick).toHaveAttribute("data-kind", "synthesis_thread", { timeout: 5000 });
  await expect(pick).toContainText("Weekly trust panel");
});

test("explicit researcher decision still outranks active Synthesis", async ({ page }) => {
  await mockV2Api(page);
  await installSynthesisMock(page);
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const pick = page.getByTestId("home-continue");
  await expect(pick).toHaveAttribute("data-kind", "decision");
  await expect(pick).toContainText("MOPS financial statements");
  await pick.getByRole("button", { name: "Review" }).click();
  await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^History/ })).toHaveAttribute("aria-selected", "true");
});

test("Profile separates registry relationships from Library possession and excludes suggestions from researcher facts", async ({ page }) => {
  await mockV2Api(page, { profileBody: PROFILE, jobsBody: { jobs: [] } });
  await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await expect(page.getByText("What Research Drive currently knows about this researcher")).toBeVisible();
  await expect(page.getByText(/Source · faculty registry/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research context on record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research evidence relationships" })).toBeVisible();
  await expect(page.getByText("Held in Library")).toBeVisible();
  await expect(page.getByText("Recorded link · holding not confirmed")).toBeVisible();
  await expect(page.getByTestId("profile-suggestion-boundary")).toContainText("not a researcher fact");
  await expect(page.getByRole("button", { name: /Edit research memory|Add research focus/i })).toHaveCount(0);
  await expect(page.getByText("Suggested", { exact: true })).toHaveCount(0);
});

test("Settings evidence policy changes Library selection and Keep current preserves Ask", async ({ page }) => {
  await mockV2Api(page, { jobsBody: { jobs: [] } });
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await page.getByLabel("When evidence is selected").selectOption("ask");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const row = page.getByTestId("library-evidence-row").first();
  await expect(row).toBeVisible();
  await row.click();
  const situation = page.getByTestId("research-situation");
  await expect(situation.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("When evidence is selected").selectOption("keep");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByTestId("library-evidence-row").nth(1).click();
  await expect(page.getByTestId("research-situation").getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
});

test("Settings wide Discover policy starts live semantic federation immediately", async ({ page }) => {
  const seen = [];
  await mockV2Api(page, { jobsBody: { jobs: [] }, discoverBody: { sections: [], total: 0 } });
  await page.route("**/library/discover/sources?*", async (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByLabel("Discover search").selectOption("wide");

  await page.getByRole("button", { name: "Discover", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search or describe a research need" });
  await expect(search).toBeVisible();
  await search.fill("stablecoin depeg evidence");
  await search.press("Enter");
  await expect.poll(() => seen.some((url) => url.includes("live=1") && url.includes("semantic=1"))).toBeTruthy();
});

test("Synthesis evidence-gap handoff overrides wide preference and begins known-first", async ({ page }) => {
  const seen = [];
  await mockV2Api(page, { jobsBody: { jobs: [] }, discoverBody: { sections: [], total: 0 } });
  await page.route("**/library/discover/sources?*", async (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem("rd_v2_settings", JSON.stringify({ startup: "home", onSelect: "detail", discoverScope: "wide", email: "" }));
  });
  await installSynthesisMock(page, [GAP_THREAD], {
    [GAP_THREAD.id]: {
      thread_id: GAP_THREAD.id,
      required_grain: "asset-week",
      missing_evidence: [{ id: "missing-source", dataset_id: "missing-source", label: "Missing weekly sentiment" }],
      collect_intents: [{ id: "missing-source", query: "Missing weekly sentiment" }],
    },
  });

  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("synthesis-studio")).toBeVisible();
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "Stablecoin sentiment gap" }).click();
  await expect(page.getByTestId("synthesis-evidence-state")).toBeVisible();
  await page.locator(".s04-map-node").filter({ hasText: "Missing weekly sentiment" }).click();
  const routeToDiscover = page.getByRole("button", { name: "Route to Discover" });
  await expect(routeToDiscover).toBeVisible();
  await routeToDiscover.click();

  await expect(page.getByTestId("synthesis-discover-handoff")).toBeVisible();
  await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
  await expect.poll(() => seen.some((url) => {
    const params = new URL(url).searchParams;
    return !params.has("semantic") && !params.has("live");
  })).toBeTruthy();
  expect(seen.some((url) => url.includes("semantic=1") && url.includes("live=1"))).toBeFalsy();
});
