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

async function openHomeAt(page, width, height) {
  await mockV2Api(page);
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

async function scrollHomeToEnd(page) {
  const frame = page.locator(".rd-v2-home-page");
  const scroller = page.locator(".rd-v2-home-page .rd-v2-body-scroll");
  const trail = page.getByRole("region", { name: "Recent trail" });
  await expect(frame).toBeVisible();
  await expect(scroller).toBeVisible();
  await expect(trail).toBeAttached();

  const before = await page.evaluate(() => {
    const frameElement = document.querySelector(".rd-v2-home-page");
    const scrollerElement = document.querySelector(".rd-v2-home-page .rd-v2-body-scroll");
    return {
      frameOverflowY: getComputedStyle(frameElement).overflowY,
      scrollerOverflowY: getComputedStyle(scrollerElement).overflowY,
      clientHeight: scrollerElement.clientHeight,
      scrollHeight: scrollerElement.scrollHeight,
    };
  });
  expect(before.frameOverflowY).toBe("hidden");
  expect(["auto", "scroll"]).toContain(before.scrollerOverflowY);
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(50);

  return page.evaluate(() => {
    const scrollerElement = document.querySelector(".rd-v2-home-page .rd-v2-body-scroll");
    const trailElement = document.querySelector('.rd-v2-home-trail[aria-label="Recent trail"]');
    const railElement = document.querySelector(".yzu-inspector");
    const navElement = document.querySelector(".yzu-sidebar");
    const scrollerRect = scrollerElement?.getBoundingClientRect();
    const trailRect = trailElement?.getBoundingClientRect();
    const railRect = railElement?.getBoundingClientRect();
    const navRect = navElement?.getBoundingClientRect();
    return {
      scrollTop: scrollerElement?.scrollTop || 0,
      maxScrollTop: Math.max(0, (scrollerElement?.scrollHeight || 0) - (scrollerElement?.clientHeight || 0)),
      scrollerTop: scrollerRect?.top ?? -Infinity,
      scrollerBottom: scrollerRect?.bottom ?? Infinity,
      trailBottom: trailRect?.bottom ?? Infinity,
      railTop: railRect?.top ?? Infinity,
      navTop: navRect?.top ?? Infinity,
      viewportHeight: window.innerHeight,
    };
  });
}

test.describe("v2 Home Iteration 10 freeze", () => {
  test("Pick Up is the primary resume object", async ({ page }) => {
    await openHome(page);
    const pick = page.getByTestId("home-continue");
    await expect(pick).toBeVisible();
    await expect(pick).toContainText(/Pick up/i);
    await expect(pick).toHaveAttribute("data-kind", /library_asset|synthesis_thread/);
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

  test("mobile Home can expose its final content above fixed research chrome", async ({ page }) => {
    await openHomeAt(page, 390, 844);
    const geometry = await scrollHomeToEnd(page);

    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(geometry.maxScrollTop - geometry.scrollTop)).toBeLessThanOrEqual(2);
    expect(geometry.trailBottom).toBeLessThanOrEqual(geometry.scrollerBottom + 1);
    expect(geometry.scrollerBottom).toBeLessThanOrEqual(Math.min(geometry.railTop, geometry.navTop) + 1);
  });

  test("short desktop Home uses one scroll frame and exposes its final content", async ({ page }) => {
    await openHomeAt(page, 1366, 768);
    const geometry = await scrollHomeToEnd(page);

    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(geometry.maxScrollTop - geometry.scrollTop)).toBeLessThanOrEqual(2);
    expect(geometry.trailBottom).toBeLessThanOrEqual(geometry.scrollerBottom + 1);
    expect(geometry.scrollerTop).toBeGreaterThanOrEqual(0);
    expect(geometry.scrollerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  });

  test("Continue opens dataset preview and keeps rail grounded", async ({ page }) => {
    await openHome(page);
    const pick = page.getByTestId("home-continue");
    await expect(pick).toHaveAttribute("data-kind", "library_asset");
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
    // Library preserves the currently selected asset as an inspection sheet.
    // Close that sheet through its current explicit control before selecting
    // the different asset used to prove Home's resume replacement contract.
    const closeInspector = page.getByRole("button", { name: "Close asset inspector" });
    if (await closeInspector.isVisible().catch(() => false)) await closeInspector.click();
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
