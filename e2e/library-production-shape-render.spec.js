import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const SHELVES = [
  ["acquired", "Acquired", 55, "Procured one-offs"],
  ["catalog", "Catalog", 11, "Registered catalog"],
  ["derived", "Derived", 20, "Derived research panels"],
  ["markets", "Markets", 11, "Market datasets"],
  ["news", "News", 2, "News and events"],
  ["official", "Official", 1, "Official releases"],
  ["reference", "Reference", 5, "Reference data"],
  ["social", "Social", 0, "Social signals"],
  ["project_downloads", "Your project downloads", 24, "Other holdings"],
];

function productionFixture() {
  const shelves = [];
  const partitions = [];
  const datasets = [];

  for (const [shelfId, label, count, folderLabel] of SHELVES) {
    const partitionId = `${shelfId}.primary`;
    const ids = [];
    shelves.push({
      id: shelfId,
      label,
      blurb: `${label} evidence held by the research desk.`,
      sort: shelves.length + 1,
      partition_ids: [partitionId],
    });

    for (let index = 0; index < count; index += 1) {
      const id = `${shelfId}_asset_${String(index + 1).padStart(3, "0")}`;
      ids.push(id);
      datasets.push({
        dataset_id: id,
        registry_id: id,
        registered: true,
        display_name: `${label} evidence ${String(index + 1).padStart(2, "0")}`,
        description: `Production-shape ${label.toLowerCase()} evidence used to verify Library density and directory scaling.`,
        partition_id: partitionId,
        local_root: `data_lake/${shelfId}/${id}`,
        analysis_readiness: index % 5 === 0 ? "metadata_search" : "instant",
        source: index % 3 === 0 ? "registered_collection" : `${label} source`,
        source_system: `${label} source system`,
        grain: index % 2 === 0 ? "entity-day" : "entity-week",
        coverage: "2019–2026",
        join_keys: ["entity_id", index % 2 === 0 ? "date" : "week"],
      });
    }

    partitions.push({
      partition_id: partitionId,
      shelf_id: shelfId,
      professor_label: folderLabel,
      professor_blurb: shelfId === "acquired"
        ? "Everything the research desk downloaded on your behalf: DataCite DOIs, web collects, and campaign artifacts. Each subfolder is one dataset_id."
        : `${folderLabel} grouped for direct Library navigation.`,
      professor_sort: partitions.length + 1,
      detail: { registry_dataset_ids: ids },
    });
  }

  return {
    datasetsBody: { datasets },
    libraryNavBody: {
      nav_mode: "professor_shelves",
      shelves,
      partitions,
      guide: { start_here: ["acquired", "markets", "derived"] },
    },
  };
}

async function openProductionLibrary(page, width, height) {
  const fixture = productionFixture();
  await mockV2Api(page, fixture);
  await page.setViewportSize({ width, height });
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("library-evidence-row").first()).toBeVisible();
  await expect(page.getByTestId("library-collection-filter")).toHaveCount(9);
  await expect(page.locator(".rd-v2-toolbar-count")).toContainText("129 assets");
}

test("production-shape Library root at 1920", async ({ page }) => {
  await openProductionLibrary(page, 1920, 1080);
  await page.screenshot({ path: "artifacts/library-renders/23-production-root-1920.png", fullPage: true });
});

test("production-shape Library root at 1440", async ({ page }) => {
  await openProductionLibrary(page, 1440, 900);
  await page.screenshot({ path: "artifacts/library-renders/24-production-root-1440.png", fullPage: true });
});

test("production-shape Acquired directory at 1920", async ({ page }) => {
  await openProductionLibrary(page, 1920, 1080);
  await page.getByTestId("library-collection-filter").filter({ hasText: "Acquired" }).click();
  await expect(page).toHaveURL(/folder=acquired/);
  await expect(page.getByTestId("library-directory")).toContainText("Procured one-offs");
  await page.screenshot({ path: "artifacts/library-renders/25-production-acquired-1920.png", fullPage: true });
});
