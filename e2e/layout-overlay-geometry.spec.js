import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const viewports = [
  ["phone-short", 360, 640],
  ["phone-canonical", 390, 844],
  ["laptop-short", 1366, 768],
];

async function open(page, path, width, height) {
  await mockV2Api(page);
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
    const scrollables = [node, ...node.querySelectorAll("*")]
      .filter((el) => visible(el) && ["auto", "scroll", "overlay"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2)
      .map((el) => ({
        className: String(el.className || ""),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
    const clippedWithoutScroller = [node, ...node.querySelectorAll("*")]
      .filter((el) => visible(el) && ["hidden", "clip"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2)
      .filter((el) => !scrollables.some((_, index) => {
        const candidates = [node, ...node.querySelectorAll("*")]
          .filter((candidate) => visible(candidate) && ["auto", "scroll", "overlay"].includes(getComputedStyle(candidate).overflowY) && candidate.scrollHeight > candidate.clientHeight + 2);
        return candidates[index] && el.contains(candidates[index]);
      }))
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
    await open(page, "/", width, height);
    const pick = page.getByTestId("home-continue");
    await expect(pick).toBeVisible();
    await pick.getByRole("button", { name: /Continue|Review/ }).click();
    const preview = page.locator(".rd-preview-shell");
    await expect(preview).toBeVisible();
    await assertContained(page, info, ".rd-preview-shell", width, height, "preview");
    await expect(preview.getByRole("button", { name: /Close preview/i })).toBeVisible();
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
