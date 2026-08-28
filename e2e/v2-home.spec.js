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

async function openHome(page, { pendingDecision = false } = {}) {
  if (pendingDecision) {
    await mockV2Api(page);
  } else {
    await mockV2Api(page, { jobsBody: { jobs: [] }, healthBody: QUIET_HEALTH });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

test.describe("v2 Home Iteration 10 freeze", () => {
  test("Pick Up is the primary resume object", async ({ page }) => {
    await openHome(page);
    const pick = page.getByTestId("home-continue");
    await expect(pick).toBeVisible();
    await expect(pick).toContainText(/Pick up/i);
    await expect(pick).toHaveAttribute("data-kind", /dataset|synthesis_thread/);
    await expect(pick.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.locator(".rd-v2-home-actions")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Attention queue" })).toHaveCount(0);
  });

  test("Resource headroom and trail bands exist; recommended only when grounded", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("region", { name: "Resource headroom" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent trail" })).toBeVisible();
    const recommended = page.getByRole("region", { name: "Recommended evidence" });
    if ((await recommended.count()) > 0) {
      expect(await recommended.locator(".rd-v2-home-recommended-row").count()).toBeGreaterThan(0);
    }
  });

  test("Continue opens dataset preview and keeps rail grounded", async ({ page }) => {
    await openHome(page);
    const pick = page.getByTestId("home-continue");
    await expect(pick).toHaveAttribute("data-kind", "dataset");
    await expect(pick.locator(".rd-v2-home-continue-id")).toBeAttached();
    const title = (await pick.locator("h2").innerText()).trim();
    const datasetId = (await pick.locator(".rd-v2-home-continue-id").innerText()).trim();
    await pick.getByRole("button", { name: "Continue" }).click();

    const preview = page.getByRole("dialog", { name: `${title} preview` });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(title);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Home" })).toBeVisible();

    await preview.getByRole("button", { name: "Close preview" }).click();
    await expect(preview).toHaveCount(0);

    const rail = page.locator("aside.rd-v2-rail");
    const situation = rail.getByTestId("research-situation");
    await expect(situation).toContainText(title);
    await expect(situation.getByRole("tab", { name: "Detail" })).toBeVisible();
    await expect(situation.getByRole("tab", { name: "Ask" })).toBeVisible();
    await situation.getByRole("tab", { name: "Ask" }).click();
    await expect(situation.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await expect(rail.locator(".rd-v2-ask-ctx")).toContainText(datasetId);
    await expect(situation).toContainText(title);
  });

  test("Home replaces a Library selection with its exact Pick Up object", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const allAssets = page.getByRole("button", { name: "← All Library assets" });
    if (await allAssets.isVisible().catch(() => false)) await allAssets.click();
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Ticker week");
    const libraryRow = page.getByTestId("library-evidence-row").filter({ hasText: "Ticker week panel" });
    await expect(libraryRow).toBeVisible();
    const libraryTitle = "Ticker week panel";
    await libraryRow.click();
    await expect(page.locator("aside.rd-v2-rail")).toContainText(libraryTitle);

    await page.getByRole("button", { name: "Home", exact: true }).click();
    const pick = page.getByTestId("home-continue");
    const resumeTitle = (await pick.locator("h2").innerText()).trim();
    const situation = page.getByTestId("research-situation");
    await expect(situation).toContainText(resumeTitle);
    if (libraryTitle !== resumeTitle) {
      await expect(situation).not.toContainText(libraryTitle);
    }
  });

  test("explicit researcher decision is primary and reviews into Discover History", async ({ page }) => {
    await openHome(page, { pendingDecision: true });
    const pick = page.getByTestId("home-continue");
    await expect(pick).toHaveAttribute("data-kind", "decision");
    await expect(pick).toContainText("MOPS financial statements");
    await pick.getByRole("button", { name: "Review" }).click();
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Discover" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^History/ })).toHaveAttribute("aria-selected", "true");
  });
});
