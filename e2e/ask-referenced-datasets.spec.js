import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

test("datasets an Ask answer discusses open in the Library", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/chat/stream", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${JSON.stringify({
        type: "complete",
        result: {
          session_id: "referenced-datasets",
          reply: "The Asia daily news-risk panel records daily country news shocks you can use.",
          referenced_datasets: [{ dataset_id: "gdelt_asia_daily_country_panel", title: "Asia daily news-risk panel" }],
        },
      })}\n`,
    });
  });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("research-situation").getByRole("tab", { name: "Ask" }).click();
  await page.getByTestId("ask-composer").fill("Which panel tracks news shocks?");
  await page.getByRole("button", { name: "Send" }).click();
  const links = page.getByTestId("ask-referenced-datasets");
  await expect(links).toContainText("Asia daily news-risk panel");
  await links.getByRole("button", { name: /Asia daily news-risk panel/ }).click();
  await expect(page).toHaveURL(/dataset=gdelt_asia_daily_country_panel/);
});
