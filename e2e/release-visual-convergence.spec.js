import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

async function openTab(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

async function waitForHomeEvidence(page) {
  const continuation = page.getByTestId("home-continue");
  await expect(continuation.locator("h2")).toBeVisible();
  await expect(continuation.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await expect(page.locator(".rd-v2-home-recent .rd-v2-catalog button.row").first()).toBeVisible();
}

test.describe("Research Drive recovered visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
  });

  test("desktop preserves five research destinations, dominant workspace, rail, and account context", async ({ page }) => {
    const shell = page.locator(".rd-v2-shell");
    const header = page.locator("header.rd-v2-header");
    const sidebar = page.locator("aside.yzu-sidebar");
    const main = page.locator("main.yzu-main");
    const rail = page.locator("aside.rd-v2-rail");

    await expect(header.getByText("Research Drive", { exact: true })).toBeVisible();
    await expect(header.getByRole("textbox", { name: "Search Research Drive" })).toBeVisible();
    await expect(sidebar.getByRole("button")).toHaveCount(5);
    await expect(sidebar.getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
    await expect(main).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Detail" })).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();

    const account = header.getByTestId("header-account-menu");
    await account.click();
    await expect(header.getByRole("menuitem", { name: /Research context/ })).toBeVisible();
    await expect(header.getByRole("menuitem", { name: /Workspace preferences/ })).toBeVisible();

    const geometry = await shell.evaluate((node) => {
      const style = getComputedStyle(node);
      const sidebarBox = document.querySelector("aside.yzu-sidebar")?.getBoundingClientRect();
      const mainBox = document.querySelector("main.yzu-main")?.getBoundingClientRect();
      const railBox = document.querySelector("aside.rd-v2-rail")?.getBoundingClientRect();
      return {
        columns: style.gridTemplateColumns,
        sidebar: Math.round(sidebarBox?.width || 0),
        main: Math.round(mainBox?.width || 0),
        rail: Math.round(railBox?.width || 0),
      };
    });

    expect(geometry.columns).toContain("px");
    expect(geometry.sidebar).toBeGreaterThanOrEqual(184);
    expect(geometry.sidebar).toBeLessThanOrEqual(208);
    expect(geometry.rail).toBeGreaterThanOrEqual(318);
    expect(geometry.rail).toBeLessThanOrEqual(352);
    expect(geometry.main).toBeGreaterThanOrEqual(880);
    expect(geometry.main).toBeGreaterThan(geometry.rail * 2);
  });

  test("Home follows context, continuation, attention, recent work, and suggested gaps", async ({ page }) => {
    const root = page.locator(".rd-v2-home-page");
    await waitForHomeEvidence(page);
    await expect(page.getByRole("region", { name: "Research context summary" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Attention queue" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent research assets" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Suggested gaps" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Research lifecycle" })).toHaveCount(0);

    const order = await root.evaluate((node) => {
      const selectors = [
        ".rd-recovery-home-context",
        "[data-testid='home-continue']",
        ".rd-v2-home-attention",
        ".rd-v2-home-recent",
        ".rd-recovery-home-gaps",
      ];
      return selectors.map((selector) => node.querySelector(selector)?.getBoundingClientRect().top || 0);
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("research pages remain implemented with context-sensitive rail behavior", async ({ page }) => {
    const destinations = [
      { tab: "Library", title: "Library", rail: true },
      { tab: "Discover", title: "Discover", rail: false },
      { tab: "Synthesis", title: "Synthesis", rail: true },
      { tab: "Resources", title: "Resources", rail: true },
    ];

    for (const destination of destinations) {
      await openTab(page, destination.tab);
      await expect(page.locator(".rd-v2-page-head h1", { hasText: destination.title })).toBeVisible();
      const rail = page.locator("aside.rd-v2-rail");
      if (destination.rail) await expect(rail.getByRole("tab", { name: "Ask" })).toBeVisible();
      else {
        await expect(page.locator(".rd-v2-shell.no-rail")).toBeVisible();
        await expect(rail).not.toBeVisible();
      }
    }
  });

  test("Synthesis uses two internal columns and gives the construction the recovered space", async ({ page }) => {
    await openTab(page, "Synthesis");
    const studio = page.getByTestId("synthesis-studio");
    await expect(studio).toBeVisible();
    const geometry = await studio.evaluate((node) => {
      const style = getComputedStyle(node);
      const threads = node.querySelector(".s04-threads")?.getBoundingClientRect();
      const workspace = node.querySelector(".s04-main")?.getBoundingClientRect();
      return {
        columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
        threads: Math.round(threads?.width || 0),
        workspace: Math.round(workspace?.width || 0),
      };
    });
    expect(geometry.columns).toBe(2);
    expect(geometry.threads).toBeLessThanOrEqual(205);
    expect(geometry.workspace).toBeGreaterThanOrEqual(600);
  });

  test("account destinations remain routable without entering primary navigation", async ({ page }) => {
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Profile" })).toBeVisible();
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.locator(".rd-v2-page-head h1", { hasText: "Settings" })).toBeVisible();
  });

  test("long research identities wrap instead of breaking the Detail pane", async ({ page }) => {
    await page.goto("/?tab=library&folder=research_panels/gdelt", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const firstDataset = page.locator('.rd-v2-library-asset[data-kind="dataset"]').first();
    await expect(firstDataset).toBeVisible();
    await firstDataset.click();
    const rail = page.locator("aside.rd-v2-rail");
    const detailPane = rail.locator('[data-testid="rail-pane-detail"]');
    const railBox = await rail.boundingBox();
    await expect(detailPane).toBeVisible();
    const overflowing = await detailPane.evaluate((node) => node.scrollWidth > node.clientWidth + 2);
    expect(overflowing).toBe(false);
    expect(railBox?.width || 0).toBeGreaterThanOrEqual(318);
  });

  test("capture every implemented page for pixel review", async ({ page }) => {
    await mkdir("artifacts/release-visual", { recursive: true });
    const pages = [["Home", "home"], ["Library", "library"], ["Discover", "discover"], ["Synthesis", "synthesis"], ["Resources", "resources"]];
    await waitForHomeEvidence(page);
    for (const [label, file] of pages) {
      if (label !== "Home") await openTab(page, label);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `artifacts/release-visual/${file}-1440x900.png`, fullPage: false });
    }
    for (const [tab, file] of [["profile", "profile"], ["settings", "settings"]]) {
      await page.goto(`/?tab=${tab}`, { waitUntil: "domcontentloaded" });
      await waitForShell(page);
      await page.screenshot({ path: `artifacts/release-visual/${file}-1440x900.png`, fullPage: false });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await waitForHomeEvidence(page);
    await page.screenshot({ path: "artifacts/release-visual/home-390x844.png", fullPage: false });
  });
});

test.describe("Research Drive narrow-screen containment", () => {
  test("Home remains horizontally contained and vertically scrollable", async ({ page }) => {
    await mockV2Api(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await waitForHomeEvidence(page);

    await expect(page.locator("main.yzu-main")).toBeVisible();
    const continuation = page.getByTestId("home-continue");
    await expect(continuation.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
    await expect(continuation.getByRole("button", { name: "Open in Library" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Suggested gaps" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      rootOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 2);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.innerHeight + 100);
    expect([dimensions.rootOverflowY, dimensions.bodyOverflowY]).not.toEqual(["hidden", "hidden"]);

    const rail = page.locator("aside.rd-v2-rail");
    await expect(rail.getByRole("button", { name: /Show Detail · Ask|Hide panel/ })).toBeVisible();
  });
});
