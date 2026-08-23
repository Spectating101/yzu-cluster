import { expect, test } from "@playwright/test";

/**
 * Candidate UI + real backend, deliberately read-only.
 *
 * scripts/serve_candidate.py injects authentication server-side and rejects
 * every live mutation except session bootstrap. This file therefore proves the
 * integration boundary without creating jobs, intents, threads, or datasets.
 */

async function openDiscover(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".rd-v2-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Search or describe a research need")).toBeVisible();
  expect(errors).toEqual([]);
}

async function search(page, query) {
  await page.getByLabel("Search or describe a research need").fill(query);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  return page.getByTestId("discover-result-summary");
}

test.describe("candidate UI against the real backend", () => {
  test.use({ viewport: { width: 1920, height: 961 } });

  test("a live weak Library match continues into a specific external route", async ({ page }) => {
    await openDiscover(page);
    const summary = await search(page, "clinical trial outcomes");

    await expect(summary).toContainText(/Library evidence\s*·\s*\d+/, { timeout: 30_000 });
    await expect(summary.getByRole("status")).toContainText("Checking broader sources", {
      timeout: 30_000,
    });
    await expect(
      page.getByText(/Clinical[- ]Trial[- ]Outcomes/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(summary).toContainText(/Available\s*·\s*[1-9]\d*/);
    await expect(summary.getByRole("status")).toHaveCount(0);
  });

  test("a live strong short match stays on the fast path", async ({ page }) => {
    let widerRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.endsWith("/library/discover/sources")
        && (url.searchParams.get("live") === "1" || url.searchParams.get("semantic") === "1")
      ) widerRequests += 1;
    });

    await openDiscover(page);
    const summary = await search(page, "stablecoin");
    await expect(summary).toContainText(/Library evidence\s*·\s*[1-9]\d*/, { timeout: 30_000 });
    await page.waitForTimeout(2_000);
    expect(widerRequests).toBe(0);
    await expect(summary.getByText("Checking broader sources")).toHaveCount(0);
  });
});
