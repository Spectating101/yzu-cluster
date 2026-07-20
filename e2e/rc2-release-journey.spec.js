import { test, expect } from "@playwright/test";
import {
  MOCK_DISCOVER_HIT,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

async function openTab(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

function isMaterialRequest(request) {
  if (request.method() === "GET" || request.method() === "HEAD") return false;
  const url = new URL(request.url());
  return [
    /\/library\/discover\/collect$/,
    /\/library\/synthesis\/(run|pair)$/,
    /\/library\/jobs(?:\/|$)/,
    /\/approve(?:\/|$)/,
    /\/yzu\/jobs(?:\/|$)/,
  ].some((pattern) => pattern.test(url.pathname));
}

test.describe("Research Drive RC2 release journey", () => {
  test("complete professor journey remains usable and read-only", async ({ page }) => {
    const materialRequests = [];
    page.on("request", (request) => {
      if (isMaterialRequest(request)) {
        materialRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });

    await mockV2Api(page, {
      discoverBody: MOCK_DISCOVER_HIT,
      jobsBody: { jobs: [] },
    });
    await page.unroute("**/api/library/chat/stream");
    await page.unroute("**/api/library/chat");
    const delayedReadOnlyChat = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "rc2-release-read-only",
          reply: "The selected asset is grounded in the current Research Drive context.",
          action: "answer",
        }),
      });
    };
    await page.route("**/api/library/chat/stream", delayedReadOnlyChat);
    await page.route("**/api/library/chat", delayedReadOnlyChat);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    // Home: resume context and inspect the lifecycle explanation.
    await expect(page.getByTestId("home-continue")).toBeVisible();
    const explain = page.getByRole("button", { name: /^Explain / }).first();
    await explain.click();
    const popover = page.getByTestId("rich-context-popover");
    await expect(popover).toBeVisible();
    await expect(popover.locator("li")).toHaveCount(3);
    await expect(popover).toContainText("Safest next step");
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);

    const continuation = page.getByTestId("home-continue");
    const continuedTitle = (await continuation.locator("h2").innerText()).trim();
    await continuation.getByRole("button", { name: "Continue" }).click();
    const preview = page.getByRole("dialog", { name: `${continuedTitle} preview` });
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Close preview" }).click();

    // Library + Ask: drill to a dataset and complete one grounded read-only turn.
    await openTab(page, "Library");
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Library" })).toBeVisible();
    await page.locator('[data-testid="library-collection"][data-kind="folder"]', { hasText: "Research panels" }).click();
    await page.locator('[data-testid="library-collection"][data-kind="folder"]', { hasText: "gdelt" }).click();
    const firstAsset = page.locator('.rd-v2-library-asset[data-kind="dataset"]', { hasText: "Asia daily news-risk panel" });
    await expect(firstAsset).toBeVisible();
    await firstAsset.click();

    const rail = page.locator("aside.rd-v2-rail");
    await rail.getByRole("tab", { name: "Ask" }).click();
    const composer = rail.getByTestId("ask-composer");
    await composer.fill("Summarize what this selected asset can safely support.");
    await rail.getByRole("button", { name: "Send" }).click();
    await expect(rail.getByTestId("interaction-progress")).toBeVisible();
    await expect(rail).toContainText("Summarize what this selected asset can safely support.");
    await expect(rail.getByTestId("interaction-progress")).toHaveCount(0, { timeout: 10_000 });
    await expect(rail).toContainText("grounded in the current Research Drive context");

    // Discover: inspect an external candidate without probing or collecting it.
    await openTab(page, "Discover");
    const search = page.locator(".rd-v2-search-pill input");
    await search.fill("mops");
    const candidate = page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" });
    await candidate.click();
    const evaluation = page.locator("aside.rd-v2-rail").getByTestId("discover-eval-surface");
    await expect(evaluation).toBeVisible();
    await expect(evaluation).toContainText("Can I use this?");
    await expect(evaluation).toContainText("Still unknown");

    // Remaining destinations: prove the whole release surface still opens.
    for (const label of ["Synthesis", "Resources", "Profile", "Settings"]) {
      await openTab(page, label);
      await expect(page.locator(".rd-v2-page-head h1", { hasText: label })).toBeVisible();
    }
    const status = page.getByRole("region", { name: "Research desk status" });
    await expect(status).toContainText("Research assistant");
    await expect(status).toContainText("Ready");

    expect(materialRequests).toEqual([]);
  });

  test("mobile release journey keeps popovers and the workspace inside the viewport", async ({ page }) => {
    await mockV2Api(page, { jobsBody: { jobs: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await page.getByRole("button", { name: /^Explain / }).first().click();
    const popover = page.getByTestId("rich-context-popover");
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    await page.keyboard.press("Escape");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);
  });
});
