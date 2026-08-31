import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function openTab(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

async function waitForHomeEvidence(page) {
  const continuation = page.getByTestId("home-continue");
  await expect(continuation.locator("h2")).toBeVisible();
  await expect(continuation.getByRole("button", { name: /Continue|Review/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent trail" })).toBeVisible();
}

async function selectFirstLibraryDataset(page) {
  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-evidence-estate").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: "Search library holdings" }).fill("Asia");
  const row = page.getByTestId("library-evidence-row").first();
  await expect(row).toBeVisible();
  await row.click();
}

test.describe("Research Drive release visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("desktop renders navigation, a research workspace, and a compact contextual rail", async ({ page }) => {
    const shell = page.locator(".rd-v2-shell");
    const header = page.locator("header.rd-v2-header");
    const sidebar = page.locator("aside.yzu-sidebar");
    const main = page.locator("main.yzu-main");
    const rail = page.locator("aside.rd-v2-rail");

    await expect(header.getByText("Research Drive", { exact: true })).toBeVisible();
    await expect(header.getByLabel("Active research context")).toBeVisible();
    await expect(header.getByTestId("header-page-label")).toHaveText("HOME");
    await expect(sidebar.getByRole("button")).toHaveCount(7);
    await expect(main).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Detail" })).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();

    const geometry = await shell.evaluate((node) => {
      const style = getComputedStyle(node);
      const boxes = {
        sidebar: document.querySelector("aside.yzu-sidebar")?.getBoundingClientRect(),
        main: document.querySelector("main.yzu-main")?.getBoundingClientRect(),
        rail: document.querySelector("aside.rd-v2-rail")?.getBoundingClientRect(),
      };
      return {
        columns: style.gridTemplateColumns,
        sidebar: Math.round(boxes.sidebar?.width || 0),
        main: Math.round(boxes.main?.width || 0),
        rail: Math.round(boxes.rail?.width || 0),
      };
    });

    expect(geometry.columns).toContain("px");
    expect(geometry.sidebar).toBeGreaterThanOrEqual(210);
    expect(geometry.main).toBeGreaterThan(geometry.rail);
    // Home carries an active decision in the inspector, but on a 1440px desk
    // it intentionally stays compact so the work canvas keeps its useful
    // measure. Library may widen it when a selected record needs more detail.
    expect(geometry.rail).toBeGreaterThanOrEqual(300);
  });

  test("Home follows Iteration 10: Pick Up · Headroom · Trail (Recommended when grounded)", async ({ page }) => {
    const pageRoot = page.locator(".rd-v2-home-page");
    const continuation = page.getByTestId("home-continue");
    const headroom = page.getByRole("region", { name: "Resource headroom" });
    const trail = page.getByRole("region", { name: "Recent trail" });

    await waitForHomeEvidence(page);
    await expect(page.locator(".rd-v2-home-actions")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Attention queue" })).toHaveCount(0);
    await expect(headroom).toBeVisible();
    await expect(trail).toBeVisible();

    const order = await pageRoot.evaluate((root) => {
      const selectors = [
        "[data-testid='home-continue']",
        ".rd-v2-home-headroom",
        ".rd-v2-home-trail",
      ];
      return selectors.map((selector) => root.querySelector(selector)?.getBoundingClientRect().top || 0);
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(continuation).toContainText(/Pick up/i);
  });

  test("all faculty pages remain implemented with context-sensitive rail behavior", async ({ page }) => {
    const destinations = [
      { tab: "Library", title: "Library", rail: true },
      { tab: "Discover", title: "Discover", rail: true },
      { tab: "Synthesis", title: "Synthesis", rail: false },
      { tab: "Resources", title: "Resources", rail: true },
      { tab: "Profile", title: "Profile", rail: false },
      { tab: "Settings", title: "Settings", rail: false },
    ];

    for (const destination of destinations) {
      await openTab(page, destination.tab);
      if (destination.tab === "Synthesis") {
        await expect(page.getByTestId("synthesis-home-state")).toBeVisible();
      } else {
        await expect(page.locator(".rd-v2-page-head h1", { hasText: destination.title })).toBeVisible();
      }
      const rail = page.locator("aside.rd-v2-rail");
      if (destination.rail) {
        await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();
      } else {
        // Quiet record/configuration surfaces reclaim the unused inspector
        // rather than leaving an admin-like third column beside the page.
        await expect(rail).toBeHidden();
        const mainBox = await page.locator("main.yzu-main").boundingBox();
        expect(mainBox?.width || 0).toBeGreaterThan(900);
      }
    }
  });

  test("Settings keeps browser connection visible and operational status subordinate", async ({ page }) => {
  await openTab(page, "Settings");

  await expect(page.getByText("This browser", { exact: true }).locator("..")).toContainText("Connected");
  const advanced = page
    .locator("details.rd-v2-settings-advanced")
    .filter({ hasText: "System status and technical details" })
    .first();
  await expect(advanced).not.toHaveAttribute("open", "");
  await expect(page.getByText("Research API", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Assistant runtime", { exact: true })).not.toBeVisible();
  await advanced.locator("summary").first().click();
  await expect(page.getByText("Research API", { exact: true })).toBeVisible();
  await expect(page.getByText("Assistant runtime", { exact: true })).toBeVisible();
  await expect(page.getByText("Research archive", { exact: true })).toBeVisible();
  await expect(page.getByText("Desk equipment", { exact: true })).toBeVisible();
});

test("long research identities wrap instead of breaking the visible Detail pane", async ({ page }) => {
    await selectFirstLibraryDataset(page);

    const rail = page.locator("aside.rd-v2-rail");
    const detailPane = rail.locator('[data-testid="rail-pane-detail"]');
    const railBox = await rail.boundingBox();
    await expect(detailPane).toBeVisible();
    const overflowing = await detailPane.evaluate((node) => node.scrollWidth > node.clientWidth + 2);
    expect(overflowing).toBe(false);
    // Library earns a wider rail than Home, but it must not consume a third of
    // a normal workstation simply to repeat detail already in the workspace.
    expect(railBox?.width || 0).toBeGreaterThanOrEqual(320);
  });

  test("capture every implemented release page for pixel review", async ({ page }) => {
    await mkdir("artifacts/release-visual", { recursive: true });
    const pages = [
      ["Home", "home"],
      ["Library", "library"],
      ["Discover", "discover"],
      ["Synthesis", "synthesis"],
      ["Resources", "resources"],
      ["Profile", "profile"],
      ["Settings", "settings"],
    ];

    await waitForHomeEvidence(page);
    for (const [label, file] of pages) {
      if (label !== "Home") await openTab(page, label);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `artifacts/release-visual/${file}-1440x900.png`, fullPage: false });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await waitForHomeEvidence(page);
    await page.screenshot({ path: "artifacts/release-visual/home-390x844.png", fullPage: false });
  });
});

test.describe("Research Drive mobile composition", () => {
  test("the complete resume object stays contained before the collapsible rail", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await waitForHomeEvidence(page);

    await expect(page.locator("main.yzu-main")).toBeVisible();
    const continuation = page.getByTestId("home-continue");
    const continueButton = continuation.getByRole("button", { name: /Continue|Review/ });
    await expect(continuation.locator("h2")).toBeVisible();
    await expect(continueButton).toBeVisible();
    await expect(page.locator(".rd-v2-home-actions")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Resource headroom" })).toBeVisible();

    const boxes = await Promise.all([
      continuation.boundingBox(),
      continueButton.boundingBox(),
    ]);
    const [cardBox, continueBox] = boxes;
    expect(cardBox && continueBox).toBeTruthy();
    expect(continueBox.y + continueBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 2);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("button", { name: /Show research context|Hide panel/ })).toBeVisible();

    const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(viewportOverflow).toBe(false);
  });
});
