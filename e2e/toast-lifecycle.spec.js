import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test.describe("Research Drive transient toast lifecycle", () => {
  test("an advisory message enters, remains readable, exits, and unmounts", async ({ page }) => {
    await mockV2Api(page);
    await page.unroute("**/api/library/chat/stream");
    await page.unroute("**/api/library/chat");
    const queuedResponse = (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "toast-lifecycle-test",
          reply: "The collection request is ready for the next lifecycle step.",
          action: "queue",
        }),
      });
    await page.route("**/api/library/chat/stream", queuedResponse);
    await page.route("**/api/library/chat", queuedResponse);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const rail = page.locator("aside.rd-v2-rail");
    await rail.getByRole("tab", { name: "Ask" }).click();
    await rail.getByTestId("ask-composer").fill("Queue this source for collection.");
    await rail.getByRole("button", { name: "Send" }).click();

    const toast = page.locator(".rd-v2-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText("Queued for collection");
    await expect(toast).toHaveAttribute("role", "status");
    await expect(toast).toHaveAttribute("aria-live", "polite");
    await expect(toast).toHaveAttribute("aria-atomic", "true");

    const entrance = await toast.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { name: computed.animationName, duration: computed.animationDuration };
    });
    expect(entrance).toEqual({ name: "rd-toast-enter", duration: "0.24s" });

    await page.waitForFunction(
      () => document.querySelector(".rd-v2-toast.exiting"),
      null,
      { timeout: 4300, polling: "raf" },
    );
    const exitName = await toast.evaluate((node) => getComputedStyle(node).animationName);
    expect(exitName).toBe("rd-toast-exit");
    await expect(toast).toHaveCount(0, { timeout: 1000 });
  });
});
