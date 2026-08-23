import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const surface = (page) => page.locator("main.yzu-main .rd-v2-page");

test.describe("primary surface lifecycle contract", () => {
  test("loading, partial, ready, idle, and empty stay distinguishable", async ({ page }) => {
    await mockV2Api(page, {
      datasetsDelayMs: 900,
      libraryNavDelayMs: 2_000,
      discoverDelayMs: 1_200,
      resourcesDelayMs: 4_000,
      jobsBody: { jobs: [] },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(surface(page)).toHaveAttribute("data-surface-state", "loading");
    await expect(page.locator(".rd-v2-header-meta-count")).toHaveText("Loading Library…");
    await expect(page.locator(".rd-v2-header-meta-count")).not.toContainText("0 Library assets");
    await expect(surface(page)).toHaveAttribute("data-surface-state", "ready", { timeout: 5_000 });

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Library", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "partial");
    await expect(surface(page)).toHaveAttribute("data-surface-state", "ready", { timeout: 5_000 });

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Discover", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "idle");
    await page.getByLabel("Search or describe a research need").fill("no matching held evidence");
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "loading");
    await expect(surface(page)).toHaveAttribute("data-surface-state", "empty", { timeout: 5_000 });

    await page.getByRole("tab", { name: "History", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "empty");

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Resources", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", /partial|ready/);
    await expect(surface(page)).toHaveAttribute("data-surface-state", "ready", { timeout: 7_000 });
  });

  test("Resources checks telemetry without inventing a not-configured state", async ({ page }) => {
    await mockV2Api(page, { healthDelayMs: 2_000, resourcesDelayMs: 2_000, jobsBody: { jobs: [] } });
    await page.goto("/?tab=resources", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const capacity = page.getByTestId("resources-capacity-grid");
    await expect(capacity).toContainText("Checking…");
    await expect(capacity).not.toContainText("Not configured");
    await expect(surface(page)).toHaveAttribute("data-surface-state", "ready", { timeout: 5_000 });
    await expect(capacity).not.toContainText("Checking…");
  });

  test("the Library estate paints before the slower aggregate health probe", async ({ page }) => {
    await mockV2Api(page, { healthDelayMs: 2_000, jobsBody: { jobs: [] } });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.locator(".rd-v2-header-meta-count")).toContainText("3 Library assets", {
      timeout: 1_500,
    });
    await expect(page.getByTestId("desk-integration-strip")).toBeVisible();
  });

  test("a successful empty registry is empty, not demo fallback", async ({ page }) => {
    await mockV2Api(page, { datasetsBody: { datasets: [] }, jobsBody: { jobs: [] } });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(surface(page)).toHaveAttribute("data-surface-state", "empty");
    await expect(page.locator(".rd-v2-header-meta-count")).toContainText("0 Library assets");
    await expect(page.getByText(/Demo preview|OFFLINE/i)).toHaveCount(0);
    await expect(page.getByTestId("desk-error")).toHaveCount(0);
  });

  test("failed refreshes retain facts as stale instead of impersonating empty", async ({ page }) => {
    await mockV2Api(page, {
      datasetsStatus: 503,
      resourcesStatus: 503,
      jobsBody: { jobs: [] },
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(surface(page)).toHaveAttribute("data-surface-state", "stale");
    await expect(page.getByTestId("desk-error")).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Library", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "stale");
    await expect(page.getByTestId("desk-error")).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Discover", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "stale");
    await expect(page.getByTestId("desk-error")).toBeVisible();

    await page.locator("aside.yzu-sidebar").getByRole("button", { name: "Resources", exact: true }).click();
    await expect(surface(page)).toHaveAttribute("data-surface-state", "stale", { timeout: 5_000 });
    await expect(page.getByTestId("desk-error")).toBeVisible();
  });

  test("Synthesis distinguishes a successful empty store from a failed store", async ({ page }) => {
    await mockV2Api(page);
    await page.route("**/library/synthesis/threads**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [], total: 0 }) });
    });
    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
    await expect(surface(page)).toHaveAttribute("data-surface-state", "loading");
    await waitForShell(page);
    await expect(surface(page)).toHaveAttribute("data-surface-state", "empty");
    await expect(page.getByTestId("synthesis-empty-state")).toBeVisible();

    await page.unroute("**/library/synthesis/threads**");
    await page.route("**/library/synthesis/threads**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "thread store unavailable" }) }),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(surface(page)).toHaveAttribute("data-surface-state", "error");
    await expect(page.getByTestId("desk-error")).toBeVisible();
  });
});
