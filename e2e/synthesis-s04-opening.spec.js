import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

/**
 * The S-04 opening state, populated.
 *
 * No backend writes a recommended construction, so the populated composition
 * cannot be seen on the live desk — which is exactly how it shipped unstyled
 * once already. This mounts the construction the spec's own §6 example
 * describes so the card can be looked at before anyone claims it renders.
 */
const outDir = "artifacts/synthesis-s04";

const CONSTRUCTION = {
  recommended: true,
  title: "Composite weekly attention index",
  validation_role: "GDELT news · external visibility",
  nodes: [
    { id: "trends", role: "Search intent", source: "Google Trends", grain: "asset-week" },
    { id: "reddit", role: "Community activity", source: "Reddit activity", grain: "asset-week" },
    { id: "wiki", role: "Public visibility", source: "Wikipedia views", grain: "asset-day" },
  ],
  ideal_direct_measure: {
    label: "Historical X follower growth",
    unavailable_because: "no verified history",
  },
  expected_output: {
    label: "Stablecoin attention weekly panel",
    grain: "asset-week",
    period: "estimated 2021–2026",
  },
  ai_resolved: ["source roles", "target grain", "validation role", "initial entity strategy"],
  method_will_resolve: ["component weighting", "missing-component rule"],
};

const thread = {
  id: "thread-s04",
  title: "Historical stablecoin attention",
  objective:
    "A reusable longitudinal measure of observable public attention to individual stablecoins, constructed from held and reachable evidence.",
  materialisation: "not_materialised",
  state: {
    title: "Historical stablecoin attention",
    objective:
      "A reusable longitudinal measure of observable public attention to individual stablecoins, constructed from held and reachable evidence.",
    required_grain: "asset × week",
    target_period: "2021 onward",
    intended_use: "reusable input for later empirical studies",
    maturity: "exploring",
    maturityLabel: "Exploring",
    lastActivity: "Thread created.",
    nodes: [],
    edges: [],
    proposal: null,
    constructions: [CONSTRUCTION, { title: "Event-only panel" }, { title: "Single-source proxy" }],
  },
};

test("the opening state renders its recommended construction", async ({ page }) => {
  mkdirSync(outDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().includes("thread-s04") ? thread : { threads: [thread], total: 1 },
      ),
    }));
  await page.goto("/?tab=synthesis");
  await page.getByTestId("synthesis-thread-item").first().click();
  await page.waitForTimeout(400);

  const centre = page.locator("main.s04-main");
  await expect(centre.getByText("Composite weekly attention index")).toBeVisible();
  await expect(centre.getByText("Search intent")).toBeVisible();
  await expect(centre.getByText("2 alternative constructions available")).toBeVisible();
  // Both closing actions become live once there is something to act on.
  await expect(centre.getByRole("button", { name: /Accept & design method/i })).toBeEnabled();
  await expect(centre.getByRole("button", { name: /Compare alternatives/i })).toBeEnabled();

  await page.screenshot({ path: `${outDir}/opening-populated.png`, scale: "css" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/opening-populated-1920.png`, scale: "css" });
});
