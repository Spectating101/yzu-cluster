import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { MOCK_DISCOVER_HIT, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const ARTIFACT_DIR = "artifacts/release-visual";

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.describe("Research Drive RC2.1 decoration layer", () => {
  test("Ask presents semantic phase progress with restrained visual feedback", async ({ page }) => {
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
    await expect(progress.locator(".rd-v2-progress-phase-fill")).toBeVisible();

    await page.waitForTimeout(1150);
    const activeStep = Number(await progress.getAttribute("data-active-step"));
    expect(activeStep).toBeGreaterThanOrEqual(2);

    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/decoration-ask-phase-progress-1440x900.png`, fullPage: true });

    await expect(progress).toHaveCount(0, { timeout: 10_000 });
    await expect(rail).toContainText("grounded in the current Research Drive context");
  });

  test("selected lifecycle surfaces stay polished and static under reduced motion", async ({ page }) => {
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const search = page.locator(".rd-v2-search-pill input");
    await search.fill("mops");
    const candidate = page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" });
    await candidate.click();
    await expect(candidate).toHaveClass(/selected/);

    const styles = await candidate.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        boxShadow: computed.boxShadow,
        transitionDuration: computed.transitionDuration,
      };
    });
    expect(styles.boxShadow).not.toBe("none");
    expect(styles.transitionDuration).toMatch(/0s|0ms/);

    const pageAnimation = await page.locator("main.rd-v2-shell-main > :first-child").evaluate(
      (node) => getComputedStyle(node).animationName,
    );
    expect(pageAnimation).toBe("none");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/decoration-mobile-selected-390x844.png`, fullPage: false });
  });
});
