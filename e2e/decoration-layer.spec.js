import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const ARTIFACT_DIR = "artifacts/release-visual";

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.describe("Research Drive RC2.1 transient decoration layer", () => {
  test("Ask presents operation-only semantic phase progress", async ({ page }) => {
    await mockV2Api(page);
    await page.unroute("**/api/library/chat/stream");
    await page.unroute("**/api/library/chat");
    const delayedChat = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2400));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "decoration-test",
          reply: "The selected asset is grounded in the current Research Drive context.",
          action: "answer",
        }),
      });
    };
    await page.route("**/api/library/chat/stream", delayedChat);
    await page.route("**/api/library/chat", delayedChat);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const rail = page.locator("aside.rd-v2-rail");
    await rail.getByRole("tab", { name: "Ask" }).click();
    await rail.getByTestId("ask-composer").fill("Explain what this asset can safely support.");
    await rail.getByRole("button", { name: "Send" }).click();

    const progress = rail.getByTestId("interaction-progress");
    const phaseBar = progress.getByRole("progressbar", { name: "Research assistant progress phases" });
    await expect(progress).toBeVisible();
    await expect(progress.locator("li")).toHaveCount(4);
    await expect(phaseBar).toHaveAttribute("aria-valuemax", "4");
    await expect(phaseBar).toHaveAttribute("aria-valuetext", /Phase [1-4] of 4/);
    await expect(progress).toContainText(/Phase [1-4] of 4 · \d+s/);

    await page.waitForTimeout(1150);
    const activeStep = Number(await progress.getAttribute("data-active-step"));
    expect(activeStep).toBeGreaterThanOrEqual(2);

    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/decoration-ask-phase-progress-1440x900.png`, fullPage: true });

    await expect(progress).toHaveCount(0, { timeout: 10_000 });
    await expect(rail).toContainText("grounded in the current Research Drive context");
    await expect(rail.getByRole("progressbar")).toHaveCount(0);
  });

  test("hover decoration appears, clears, and is disabled by reduced motion", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const search = page.locator(".rd-v2-search-pill input");
    await search.fill("mops");
    const candidate = page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" });
    await expect(candidate).toBeVisible();

    await candidate.hover();
    await page.waitForTimeout(180);
    const hoverTransform = await candidate.evaluate((node) => getComputedStyle(node).transform);
    expect(hoverTransform).not.toBe("none");

    await search.hover();
    await page.waitForTimeout(220);
    const restingTransform = await candidate.evaluate((node) => getComputedStyle(node).transform);
    expect(restingTransform).toBe("none");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const reducedSearch = page.locator(".rd-v2-search-pill input");
    await reducedSearch.fill("mops");
    const reducedCandidate = page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" });
    await reducedCandidate.hover();

    const reducedStyles = await reducedCandidate.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { transform: computed.transform, transitionDuration: computed.transitionDuration };
    });
    expect(reducedStyles.transform).toBe("none");
    expect(reducedStyles.transitionDuration).toMatch(/0s|0ms/);

    const pageAnimation = await page.locator("main.rd-v2-shell-main > :first-child").evaluate(
      (node) => getComputedStyle(node).animationName,
    );
    expect(pageAnimation).toBe("none");

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/decoration-reduced-motion-mobile-390x844.png`, fullPage: false });
  });
});