import { test, expect } from "@playwright/test";
import { MOCK_HEALTH, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const viewports = [
  ["phone-short", 360, 640],
  ["phone-canonical", 390, 844],
  ["laptop-short", 1366, 768],
];

const QUIET_HEALTH = {
  ...MOCK_HEALTH,
  desk: {
    ...MOCK_HEALTH.desk,
    jobs: {
      ...MOCK_HEALTH.desk.jobs,
      running: 0,
      pending_approval: 0,
    },
  },
};

async function open(page, path, width, height, mockOptions = {}) {
  await mockV2Api(page, mockOptions);
  await page.setViewportSize({ width, height });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForShell(page);
}

async function geometry(page, selector) {
  return page.locator(selector).first().evaluate((node) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const rect = node.getBoundingClientRect();
    const candidates = [node, ...node.querySelectorAll("*")]
      .filter((el) => visible(el) && ["auto", "scroll", "overlay"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2);
    const scrollables = candidates.map((el) => ({
      className: String(el.className || ""),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    const clippedWithoutScroller = [node, ...node.querySelectorAll("*")]
      .filter((el) => visible(el) && ["hidden", "clip"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2)
      .filter((el) => !candidates.some((candidate) => candidate !== el && el.contains(candidate)))
      .map((el) => ({ className: String(el.className || ""), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      scrollables,
      clippedWithoutScroller,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
}

async function assertContained(page, info, selector, width, height, label) {
  const data = await geometry(page, selector);
  await info.attach(`${label}-geometry`, { body: Buffer.from(JSON.stringify(data, null, 2)), contentType: "application/json" });
  expect(data.rect.left, `${label}: left`).toBeGreaterThanOrEqual(-2);
  expect(data.rect.right, `${label}: right`).toBeLessThanOrEqual(width + 2);
  expect(data.rect.top, `${label}: top`).toBeGreaterThanOrEqual(-2);
  expect(data.rect.bottom, `${label}: bottom`).toBeLessThanOrEqual(height + 2);
  expect(data.documentWidth, `${label}: document width`).toBeLessThanOrEqual(width + 2);
  expect(data.documentHeight, `${label}: document height`).toBeLessThanOrEqual(height + 2);
  expect(data.clippedWithoutScroller, `${label}: clipped content delegates to a real scroller`).toEqual([]);
}

for (const [name, width, height] of viewports) {
  test(`${name} · account menu stays inside viewport`, async ({ page }, info) => {
    await open(page, "/", width, height);
    await page.getByRole("button", { name: "Account" }).click();
    await expect(page.locator(".rd-v2-account-menu")).toBeVisible();
    await assertContained(page, info, ".rd-v2-account-menu", width, height, "account-menu");
  });

  test(`${name} · expanded research context stays above navigation`, async ({ page }, info) => {
    await open(page, "/", width, height);
    const show = page.getByRole("button", { name: /Show research context/i });
    if (await show.isVisible().catch(() => false)) await show.click();
    const inspector = page.locator(".yzu-inspector");
    await expect(inspector).toBeVisible();
    await assertContained(page, info, ".yzu-inspector", width, height, "research-context");
    if (width <= 720) {
      const overlap = await page.evaluate(() => {
        const rail = document.querySelector(".yzu-inspector")?.getBoundingClientRect();
        const nav = document.querySelector(".yzu-sidebar")?.getBoundingClientRect();
        return rail && nav ? Math.max(0, rail.bottom - nav.top) : 0;
      });
      expect(overlap, "expanded research context must not overlap mobile nav").toBeLessThanOrEqual(2);
    }
  });

  test(`${name} · Home preview stays contained and closable`, async ({ page }, info) => {
    // Force the same dataset-resume state as v2-home.spec. The default fixture
    // contains a pending decision, whose Review action correctly routes to
    // Discover History instead of opening PreviewModal.
    await open(page, "/", width, height, {
      jobsBody: { jobs: [] },
      healthBody: QUIET_HEALTH,
    });
    const pick = page.getByTestId("home-continue");
    await expect(pick).toBeVisible();
    await expect(pick).toHaveAttribute("data-kind", "library_asset");
    const title = (await pick.locator("h2").innerText()).trim();
    await pick.getByRole("button", { name: "Continue" }).click();
    const preview = page.getByRole("dialog", { name: `${title} preview` });
    await expect(preview).toBeVisible();
    await assertContained(page, info, ".rd-preview-shell", width, height, "preview");
    await expect(preview.getByRole("button", { name: "Close preview" })).toBeVisible();
  });

  test(`${name} · Library asset inspector stays contained`, async ({ page }, info) => {
    await open(page, "/?tab=library", width, height);
    const row = page.getByTestId("library-evidence-row").first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("library-asset-inspector")).toBeVisible();
    await expect(page.locator(".rd-v2-library-inspector-shell")).toBeVisible();
    await assertContained(page, info, ".rd-v2-library-inspector-shell", width, height, "library-inspector");
    await expect(page.getByRole("button", { name: /Close asset inspector/i })).toBeVisible();
  });
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath("overlay-layout-failure.png"), fullPage: false }).catch(() => {});
  }
});
