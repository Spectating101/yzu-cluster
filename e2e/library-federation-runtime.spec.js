import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-federation-runtime";

function accountDocument() {
  return {
    providers: [
      { id: "google_drive", label: "Google Drive", configured: true, rclone_available: true, directory_browse_available: true },
      { id: "dropbox", label: "Dropbox", configured: true, rclone_available: true, directory_browse_available: false },
    ],
    accounts: [
      { id: "acct-gdrive", provider: "google_drive", email: "prof@example.edu", access_mode: "read", verified_at: "2026-09-04T12:00:00Z" },
    ],
  };
}

function directoryPayload(url) {
  const parent = url.searchParams.get("parent_id") || "";
  const cursor = url.searchParams.get("cursor") || "";
  if (!parent && cursor === "page-2") {
    return {
      items: [
        { id: "shared", kind: "folder", name: "Shared with me", path: "Google Drive / Shared with me", child_count: 3, content_access: "available" },
      ],
      next_cursor: "",
      has_more: false,
    };
  }
  if (!parent) {
    return {
      items: [
        { id: "my-drive", kind: "folder", name: "My Drive", path: "Google Drive / My Drive", child_count: 2, content_access: "available" },
        { id: "known-gdelt", kind: "file", name: "gdelt_asia_daily.csv", logical_asset_id: "gdelt_asia_daily_country_panel", path: "Google Drive / My Drive / Research / gdelt_asia_daily.csv", content_access: "available" },
        { id: "forgotten", kind: "file", name: "forgotten_survey.csv", path: "Google Drive / My Drive / Archive / forgotten_survey.csv", content_access: "available", mime_type: "text/csv" },
      ],
      next_cursor: "page-2",
      has_more: true,
    };
  }
  if (parent === "my-drive") {
    return {
      items: [
        { id: "research", kind: "folder", name: "Research projects", parent_id: "my-drive", path: "Google Drive / My Drive / Research projects", child_count: 1, content_access: "available" },
        { id: "issuer", kind: "file", name: "issuer_weekly.parquet", parent_id: "my-drive", logical_asset_id: "issuer_weekly_panel", path: "Google Drive / My Drive / issuer_weekly.parquet", content_access: "available" },
      ],
      next_cursor: "",
      has_more: false,
    };
  }
  return { items: [], next_cursor: "", has_more: false };
}

test("connected Google Drive lazily browses provider folders and converges known files on canonical dossiers", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.route("**/library/accounts", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountDocument()) }),
  );
  await page.route("**/library/folders?*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryPayload(url)) });
  });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();

  const location = page.getByTestId("library-location-filter");
  await expect(location).toBeVisible();
  await expect(location.locator('option[value="google_drive"]')).not.toHaveAttribute("disabled", "");
  await expect(location.locator('option[value="dropbox"]')).toHaveAttribute("disabled", "");
  await location.selectOption("google_drive");

  await expect(page.getByText("My Drive", { exact: true })).toBeVisible();
  await expect(page.getByText("Asia daily news-risk panel", { exact: true })).toBeVisible();
  await expect(page.getByText("forgotten_survey.csv", { exact: true })).toBeVisible();
  await expect(page.getByText("Not in Library", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Google Drive");
  await page.screenshot({ path: `${OUT}/01-google-drive-root-1440.png`, fullPage: false });

  await page.locator('button.row[data-kind="folder"]').filter({ hasText: "My Drive" }).click();
  await expect(page.getByText("Research projects", { exact: true })).toBeVisible();
  await expect(page.getByText("Issuer weekly fundamentals", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("My Drive");
  await page.screenshot({ path: `${OUT}/02-google-drive-my-drive-1440.png`, fullPage: false });

  await page.getByText("Issuer weekly fundamentals", { exact: true }).click();
  await expect(page.getByTestId("library-asset-inspector")).toBeVisible();
  await expect(page.getByTestId("library-asset-inspector")).toContainText("Issuer weekly fundamentals");

  await page.getByRole("button", { name: /Close|Back/i }).first().click().catch(() => {});
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(location).toHaveValue("google_drive");
  await page.screenshot({ path: `${OUT}/03-google-drive-mobile.png`, fullPage: false });
});
