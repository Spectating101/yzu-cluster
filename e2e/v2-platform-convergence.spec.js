import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/platform-convergence";

async function capture(page, name) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function openAccountDestination(page, destination) {
  await page.getByRole("button", { name: "Account" }).click();
  const menu = page.getByRole("menu", { name: "Account destinations" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: new RegExp(destination, "i") }).click();
}

const MATRIX_DESTINATIONS = [
  { slug: "library", url: "/?tab=library", heading: "Library" },
  { slug: "discover", url: "/?tab=browse", heading: "Discover" },
  { slug: "synthesis", url: "/?tab=synthesis", synthesis: true },
  { slug: "resources", url: "/?tab=resources", heading: "Resources" },
  { slug: "profile", url: "/?tab=profile", heading: "Profile" },
  { slug: "settings", url: "/?tab=settings", heading: "Settings" },
];

const MATRIX_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

function synthesisSeedThread({ id, title, objective, kind, updatedAt, output }) {
  const base = {
    id,
    created_at: "2026-08-20T04:00:00Z",
    updated_at: updatedAt,
    title,
    objective,
    materialisation: "not_materialised",
    state: {
      title,
      objective,
      required_grain: "asset × week",
      maturity: "exploring",
      maturityLabel: "Evidence mapping",
      lastActivity: "Durable construction updated.",
      nodes: [
        {
          id: `${id}-source`,
          dataset_id: `${id}-source`,
          type: "source",
          layer: "evidence",
          label: "Held research evidence",
          role: "Core signal",
          status: "held",
          grain: "asset-week",
          coverage: "2021–2026",
        },
      ],
      edges: [],
      proposal: null,
      execution_spec: null,
      execution: null,
    },
  };

  if (kind === "review") {
    base.state.maturity = "review";
    base.state.maturityLabel = "Method review";
    base.state.lastActivity = "A method proposal needs review.";
    base.state.proposal = {
      id: `${id}-proposal`,
      proposal_hash: `sha256:${id}-proposal`,
      title: `${title} method`,
      summary: "A reviewable construction is ready for researcher acceptance.",
      operations: [{ op: "append_activity", message: "Review construction." }],
    };
  }

  if (kind === "build") {
    base.materialisation = "planned";
    base.state.maturity = "accepted";
    base.state.maturityLabel = "Accepted method";
    base.state.execution_spec = {
      input_dataset_id: `${id}-input`,
      output_dataset_id: output,
      group_by: ["asset_id", "week"],
      metrics: [{ function: "mean", column: "value", as: "weekly_value" }],
    };
    base.state.execution = {
      status: "running",
      job_id: `${id}-job`,
      output_dataset_id: output,
    };
  }

  if (kind === "result") {
    base.materialisation = "query_ready";
    base.state.maturity = "registered";
    base.state.maturityLabel = "Registered";
    base.state.execution_spec = {
      input_dataset_id: `${id}-input`,
      output_dataset_id: output,
      group_by: ["asset_id", "week"],
      metrics: [{ function: "mean", column: "value", as: "weekly_value" }],
    };
    base.state.execution = {
      status: "query_ready",
      job_id: `${id}-job`,
      output_dataset_id: output,
      rows: 18240,
      manifest_id: `${id}-manifest`,
      drive_verified: true,
    };
  }

  return base;
}

const SYNTHESIS_SEED_THREADS = [
  synthesisSeedThread({
    id: "seed-attention",
    title: "Historical stablecoin attention",
    objective: "Construct a defensible longitudinal attention signal from search, community, and news evidence.",
    kind: "active",
    updatedAt: "2026-09-02T09:20:00Z",
  }),
  synthesisSeedThread({
    id: "seed-reserve",
    title: "Issuer reserve transparency score",
    objective: "Construct an issuer-week transparency score from reserve attestations and disclosure evidence.",
    kind: "active",
    updatedAt: "2026-09-02T08:50:00Z",
  }),
  synthesisSeedThread({
    id: "seed-trust",
    title: "Stablecoin trust deterioration",
    objective: "Separate security incidents, liquidity stress, and attention into one reviewable trust panel.",
    kind: "review",
    updatedAt: "2026-09-02T10:10:00Z",
  }),
  synthesisSeedThread({
    id: "seed-depeg",
    title: "De-peg event severity panel",
    objective: "Review an event-window construction linking price dislocations, liquidity, and recovery time.",
    kind: "review",
    updatedAt: "2026-09-02T09:55:00Z",
  }),
  synthesisSeedThread({
    id: "seed-flow",
    title: "Exchange flow stress panel",
    objective: "Construct weekly exchange-flow stress features from registered transaction evidence.",
    kind: "build",
    updatedAt: "2026-09-02T10:30:00Z",
    output: "exchange_flow_stress_weekly",
  }),
  synthesisSeedThread({
    id: "seed-basis",
    title: "Cross-exchange basis monitor",
    objective: "Build a weekly basis-stress asset from synchronized exchange price and liquidity evidence.",
    kind: "build",
    updatedAt: "2026-09-02T10:22:00Z",
    output: "cross_exchange_basis_weekly",
  }),
  synthesisSeedThread({
    id: "seed-liquidity",
    title: "Issuer liquidity weekly panel",
    objective: "Build an issuer-week liquidity panel from registered market evidence.",
    kind: "result",
    updatedAt: "2026-09-02T07:40:00Z",
    output: "issuer_liquidity_weekly",
  }),
  synthesisSeedThread({
    id: "seed-event-window",
    title: "Stablecoin event-window panel",
    objective: "Reuse a registered event-window construction for empirical de-peg analysis.",
    kind: "result",
    updatedAt: "2026-09-02T07:15:00Z",
    output: "stablecoin_event_window_panel",
  }),
];

async function installSynthesisWorkspaceSeed(page) {
  await page.route("**/library/synthesis/threads**", (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();

    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const threadId = parts[index + 1] || "";
    const suffix = parts.slice(index + 2).join("/");
    const fulfill = (payload, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });

    if (!threadId) {
      return fulfill({ threads: SYNTHESIS_SEED_THREADS, total: SYNTHESIS_SEED_THREADS.length });
    }

    const thread = SYNTHESIS_SEED_THREADS.find((item) => item.id === threadId);
    if (!thread) return fulfill({ error: "not found" }, 404);

    if (suffix === "measurements") {
      return fulfill({
        thread_id: thread.id,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: thread.state.nodes.map((node) => node.dataset_id),
        measured_inputs: thread.state.nodes.length,
        unmeasured: [],
        column_profiles: [],
      });
    }

    return fulfill(thread);
  });
}

async function expectDestinationReady(page, destination) {
  if (destination.synthesis) {
    await expect(page.getByTestId("synthesis-home-state").getByText("Synthesis workspace", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Start or continue Synthesis work" })).toBeVisible();
    return;
  }
  await expect(page.getByRole("heading", { name: destination.heading, exact: true }).first()).toBeVisible();
}

test.describe("converged platform shell", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await installSynthesisWorkspaceSeed(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("keeps Home, Library, Resources, Profile, Settings, and the rail connected", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByTestId("home-continue")).toBeVisible();
    await capture(page, "01-home-desktop");

    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
    const firstDataset = page.getByTestId("library-evidence-row").first();
    await expect(firstDataset).toBeVisible();
    await firstDataset.click();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Can I use this?");
    await capture(page, "02-library-evidence-desktop");

    await page.getByRole("button", { name: "Resources", exact: true }).click();
    await expect(page.getByRole("region", { name: "Sources overview" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Source capabilities" })).toBeVisible();
    await capture(page, "03-resources-sources-desktop");

    await openAccountDestination(page, "Profile");
    await expect(page.locator("main.yzu-main").getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await expect(page.getByTestId("profile-detail-rail")).toBeVisible();
    await capture(page, "04-profile-memory-desktop");

    await openAccountDestination(page, "Settings");
    await expect(page.locator("main.yzu-main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Desk setup");
    await capture(page, "05-settings-desktop");
  });

  test("keeps five work destinations legible and account pages reachable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const primaryNav = page.locator(".rd-v2-sidebar-nav");
    await expect(primaryNav.getByRole("button")).toHaveCount(5);
    await expect(page.locator(".rd-v2-sidebar-foot-nav")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
    await capture(page, "06-home-mobile-shell");

    await openAccountDestination(page, "Profile");
    await expect(page.locator("main.yzu-main").getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show research context", exact: true }).click();
    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByTestId("profile-detail-rail")).toBeVisible();
    await rail.getByRole("tab", { name: "Ask" }).click();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.getByTestId("rail-pane-detail")).toBeHidden();
    await expect(rail).toContainText("What research context do you remember?");
    await expect(rail.getByTestId("ask-composer")).toBeVisible();
    await capture(page, "07-profile-ask-mobile");

    await page.getByRole("button", { name: "Hide panel", exact: true }).click();
    await openAccountDestination(page, "Settings");
    await expect(page.locator("main.yzu-main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await capture(page, "08-settings-mobile");
  });

  test("carries one researcher session from Library through Discover, Synthesis, and Resources without stale authority", async ({ page }) => {
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByTestId("library-evidence-estate")).toBeVisible();

    const collection = page.getByTestId("library-collection-filter").first();
    await collection.click();
    await expect(page).toHaveURL(/folder=/);

    // Cross the shell boundary deliberately. Component-level Library tests own
    // the separate Search-wider affordance; this convergence gate proves that
    // collection URL/rail authority does not leak into Discover.
    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Discover", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/folder=/);

    const discoverComposer = page.getByLabel("Search or describe a research need");
    await discoverComposer.fill("MOPS financial statements");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(page.getByTestId("discover-result-summary")).toBeVisible();
    await expect(page.getByLabel("Discover next actions")).toContainText(/declared route|Search wider/i);
    await expect(page.getByTestId("research-situation")).toContainText("Discover");
    await expect(page.getByTestId("research-situation")).not.toContainText("In this collection");
    await expect(page.locator("body")).not.toContainText("public_http");
    await expect(page.locator("body")).not.toContainText("materialized_instant");
    await capture(page, "09-library-to-discover-desktop");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Synthesis", exact: true }).click();
    await expect(page.getByTestId("synthesis-home-state").getByText("Synthesis workspace", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Start or continue Synthesis work" })).toBeVisible();
    await expect(page.getByTestId("research-situation")).toContainText("Synthesis");
    await expect(page.getByTestId("research-situation")).not.toContainText("In this collection");
    await capture(page, "10-discover-to-synthesis-desktop");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Resources", exact: true }).click();
    await expect(page.locator("main.yzu-main").getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Sources overview" })).toBeVisible();
    await expect(page.getByTestId("research-situation")).toContainText("Resources");
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail).toContainText("Library capacity");
    await expect(rail).not.toContainText("MOPS financial statements");
    await capture(page, "11-synthesis-to-resources-desktop");
  });

  test("holds the combined product to a six-width cross-page overflow and vocabulary matrix", async ({ page }) => {
    test.setTimeout(240_000);

    for (const viewport of MATRIX_VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const destination of MATRIX_DESTINATIONS) {
        await page.goto(destination.url, { waitUntil: "domcontentloaded" });
        await waitForShell(page);
        await expectDestinationReady(page, destination);

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const shell = document.querySelector(".rd-v2-shell");
          const main = document.querySelector("main.yzu-main");
          return {
            document: Math.max(0, doc.scrollWidth - doc.clientWidth),
            shell: shell ? Math.max(0, shell.scrollWidth - shell.clientWidth) : 0,
            main: main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0,
          };
        });
        expect(overflow.document, `${destination.slug} document overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
        expect(overflow.shell, `${destination.slug} shell overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
        expect(overflow.main, `${destination.slug} main overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);

        const bodyText = await page.locator("body").innerText();
        expect(bodyText, `${destination.slug} leaked an object string at ${viewport.width}px`).not.toContain("[object Object]");
        expect(bodyText, `${destination.slug} leaked public_http at ${viewport.width}px`).not.toContain("public_http");
        expect(bodyText, `${destination.slug} leaked materialized_instant at ${viewport.width}px`).not.toContain("materialized_instant");

        if (viewport.width === 390 || viewport.width === 1920) {
          await capture(page, `matrix-${viewport.width}-${destination.slug}`);
        }
      }
    }
  });
});