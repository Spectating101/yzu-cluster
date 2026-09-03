import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-storage-filter";

async function setup(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await mockV2Api(page);
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-estate")).toBeVisible();
  await page.getByTestId("library-folders-root").click();
  await expect(page.getByTestId("library-directory")).toBeVisible();
}

async function injectLocationFilter(page, value = "all") {
  await page.evaluate((selected) => {
    document.querySelector('[data-testid="prototype-location-filter"]')?.remove();
    const filters = document.querySelector(".rd-v2-library-toolbar-filters");
    if (!filters) return;
    const label = document.createElement("label");
    label.className = "rd-v2-library-filter-control";
    label.setAttribute("data-testid", "prototype-location-filter");
    label.innerHTML = `
      <span>Location</span>
      <select aria-label="Filter folders by connected location">
        <option value="all">All</option>
        <option value="gdrive">Google Drive</option>
        <option value="dropbox">Dropbox</option>
      </select>
    `;
    const select = label.querySelector("select");
    select.value = selected;
    filters.appendChild(label);
  }, value);
}

test("Folders uses the same compact filter chrome for connected storage accounts", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await setup(page);
  await injectLocationFilter(page, "all");
  const location = page.getByTestId("prototype-location-filter");
  await expect(location).toBeVisible();
  await expect(location.locator("select")).toHaveValue("all");
  await page.screenshot({ path: `${OUT}/01-location-all-1440.png`, fullPage: false });

  await injectLocationFilter(page, "gdrive");
  await expect(location.locator("select")).toHaveValue("gdrive");
  await page.screenshot({ path: `${OUT}/02-location-google-drive-1440.png`, fullPage: false });

  await setup(page, { width: 390, height: 1200 });
  await injectLocationFilter(page, "all");
  await expect(page.getByTestId("prototype-location-filter")).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-location-all-mobile.png`, fullPage: false });
});
