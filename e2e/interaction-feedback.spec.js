import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell, MOCK_DATASETS, MOCK_HEALTH } from "./fixtures/v2MockApi.js";

const ARTIFACT_DIR = "artifacts/release-visual";

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

test.describe("Research Drive interaction feedback convergence", () => {
  test("Home preserves its working-brief layout while desk context loads", async ({ page }) => {
    await mockV2Api(page);
    await page.unroute("**/datasets");
    await page.unroute("**/health*");
    await page.route("**/datasets", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DATASETS) });
    });
    await page.route("**/health*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1250));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HEALTH) });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const continuation = page.getByTestId("home-continue");
    await expect(continuation).toBeVisible();
    await expect(continuation).toHaveAttribute("aria-busy", "true");
    await expect(continuation.getByTestId("interaction-skeleton")).toBeVisible();
    await expect(page.getByRole("region", { name: "Research context summary" })).toBeVisible();
    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/feedback-home-loading-1440x900.png` });

    await expect(continuation.getByRole("button", { name: "Continue", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(continuation).toHaveAttribute("aria-busy", "false");
  });

  test("selected-object Detail explains readiness without nested interactive status controls", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const row = page.locator(".rd-v2-home-recent button.row").first();
    await expect(row.locator("button")).toHaveCount(0);
    await row.click();
    const rail = page.getByRole("complementary", { name: "Inspector" });
    await expect(rail.getByRole("tab", { name: "Detail" })).toHaveAttribute("aria-selected", "true");
    await expect(rail).toContainText(/Query ready|Registered|Connected/);
    await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();
    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/feedback-selected-detail-1440x900.png` });
  });

  test("Ask exposes staged progress while retaining the conversation", async ({ page }) => {
    await mockV2Api(page);
    await page.unroute("**/api/library/chat/stream");
    await page.unroute("**/api/library/chat");
    const delayedChat = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "feedback-test",
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
    const composer = rail.getByTestId("ask-composer");
    await composer.fill("Explain whether this asset is ready for analysis.");
    await rail.getByRole("button", { name: "Send" }).click();

    const progress = rail.getByTestId("interaction-progress");
    await expect(progress).toBeVisible();
    await expect(progress.locator("li")).toHaveCount(4);
    await expect(rail).toContainText("Explain whether this asset is ready for analysis.");
    await expect(rail.getByRole("button", { name: /Working/ })).toBeDisabled();
    ensureArtifactDir();
    await page.screenshot({ path: `${ARTIFACT_DIR}/feedback-ask-progress-1440x900.png` });

    await expect(progress).toHaveCount(0, { timeout: 10_000 });
    await expect(rail).toContainText("grounded in the current Research Drive context");
  });
});
