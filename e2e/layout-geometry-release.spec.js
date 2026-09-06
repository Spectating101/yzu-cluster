import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const surfaces = ["home", "library", "discover", "synthesis", "resources", "profile", "settings"];
const viewports = [
  ["phone-short", 360, 640],
  ["phone-canonical", 390, 844],
  ["tablet-portrait", 768, 1024],
  ["tablet-landscape", 1024, 768],
  ["laptop-short", 1366, 768],
  ["desktop-wide", 1920, 1080],
];

const route = (surface) => surface === "home" ? "/" : `/?tab=${surface}`;

async function openSurface(page, surface, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(route(surface), { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.locator("main.yzu-main")).toBeVisible();
  if (surface === "synthesis") {
    await expect(page.locator('[data-testid="synthesis-home-state"], .rd-v2-synthesis-page').first()).toBeVisible();
  } else {
    await expect(page.locator(".rd-v2-page").first()).toBeVisible();
  }
}

async function snapshotGeometry(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const shell = document.querySelector(".rd-v2-shell");
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const claimsY = (node) => ["auto", "scroll", "overlay"].includes(getComputedStyle(node).overflowY);
    const actuallyScrollsY = (node) => claimsY(node) && node.scrollHeight > node.clientHeight + 2;
    const rectOf = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };

    const nodes = [main, ...(main?.querySelectorAll("*") || [])].filter(visible);
    const active = nodes.filter(actuallyScrollsY);
    const bodies = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])].filter(visible);

    const nestedActualScroll = active.flatMap((node) => {
      const conflicts = [];
      for (let parent = node.parentElement; parent && parent !== main?.parentElement; parent = parent.parentElement) {
        if (parent !== node && visible(parent) && actuallyScrollsY(parent)) {
          conflicts.push({ child: String(node.className || node.tagName), parent: String(parent.className || parent.tagName) });
        }
        if (parent === main) break;
      }
      return conflicts;
    });

    const clippedBodies = bodies
      .filter((body) => {
        const style = getComputedStyle(body);
        return ["hidden", "clip"].includes(style.overflowY) && body.scrollHeight > body.clientHeight + 2;
      })
      .map((body) => ({
        node: body,
        className: String(body.className || ""),
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
        hasActiveDescendant: active.some((candidate) => candidate !== body && body.contains(candidate)),
      }));

    const primary = [...active]
      .map((node) => ({ node, area: node.clientWidth * node.clientHeight }))
      .sort((a, b) => b.area - a.area)[0]?.node
      || [...bodies].sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0]
      || null;

    const fixedChrome = [document.querySelector(".yzu-sidebar"), document.querySelector(".yzu-inspector")]
      .filter((node) => visible(node) && getComputedStyle(node).position === "fixed")
      .map((node) => ({ className: String(node.className || ""), ...rectOf(node) }));

    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      },
      shell: shell ? rectOf(shell) : null,
      main: main ? { ...rectOf(main), scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
      activeScrollers: active.map((node) => ({
        className: String(node.className || ""),
        testId: node.getAttribute("data-testid") || "",
        overflowY: getComputedStyle(node).overflowY,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        ...rectOf(node),
      })),
      nestedActualScroll,
      clippedBodies: clippedBodies.map(({ node: _node, ...row }) => row),
      primary: primary ? {
        className: String(primary.className || ""),
        testId: primary.getAttribute("data-testid") || "",
        scrollTop: primary.scrollTop,
        scrollHeight: primary.scrollHeight,
        clientHeight: primary.clientHeight,
        ...rectOf(primary),
      } : null,
      fixedChrome,
    };
  });
}

async function scrollPrimaryToEnd(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const active = [main, ...(main?.querySelectorAll("*") || [])]
      .filter((node) => node && visible(node) && ["auto", "scroll", "overlay"].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2)
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    const body = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
      .filter(visible)
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    const target = active[0] || body || null;
    if (!target) return null;
    target.scrollTop = target.scrollHeight;
    return { className: String(target.className || "") };
  });
}

async function endGeometry(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const visible = (node) => {
      if (!node) return false;
      const s = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 1 && r.height > 1;
    };
    const active = [main, ...(main?.querySelectorAll("*") || [])]
      .filter((node) => node && visible(node) && ["auto", "scroll", "overlay"].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 2)
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    const body = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
      .filter(visible)
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    const target = active[0] || body || null;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const flow = [...target.children].filter((node) => {
      if (!visible(node)) return false;
      return !["fixed", "absolute"].includes(getComputedStyle(node).position);
    });
    const finalFlowBottom = flow.length ? Math.max(...flow.map((node) => node.getBoundingClientRect().bottom)) : rect.top;
    const chromeTop = [document.querySelector(".yzu-sidebar"), document.querySelector(".yzu-inspector")]
      .filter((node) => visible(node) && getComputedStyle(node).position === "fixed")
      .map((node) => node.getBoundingClientRect().top)
      .filter((top) => top >= rect.top - 2);
    return {
      scrollTop: target.scrollTop,
      maxScrollTop: Math.max(0, target.scrollHeight - target.clientHeight),
      top: rect.top,
      bottom: rect.bottom,
      finalFlowBottom,
      fixedChromeTop: chromeTop.length ? Math.min(...chromeTop) : null,
    };
  });
}

async function assertGeometry(page, info, surface, width, height) {
  const initial = await snapshotGeometry(page);
  await info.attach("geometry-initial", { body: Buffer.from(JSON.stringify(initial, null, 2)), contentType: "application/json" });

  expect(initial.shell, `${surface}: shell exists`).toBeTruthy();
  expect(initial.main, `${surface}: main exists`).toBeTruthy();
  expect(initial.document.width, `${surface}: no document horizontal overflow`).toBeLessThanOrEqual(width + 2);
  expect(initial.document.bodyWidth, `${surface}: no body horizontal overflow`).toBeLessThanOrEqual(width + 2);
  expect(initial.document.height, `${surface}: document remains viewport-sized`).toBeLessThanOrEqual(height + 2);
  expect(initial.document.bodyHeight, `${surface}: body remains viewport-sized`).toBeLessThanOrEqual(height + 2);
  expect(initial.main.scrollWidth, `${surface}: main does not leak horizontally`).toBeLessThanOrEqual(initial.main.clientWidth + 2);

  for (const rect of [initial.shell, initial.main, ...initial.fixedChrome]) {
    expect(rect.left).toBeGreaterThanOrEqual(-2);
    expect(rect.right).toBeLessThanOrEqual(width + 2);
    expect(rect.top).toBeGreaterThanOrEqual(-2);
    expect(rect.bottom).toBeLessThanOrEqual(height + 2);
  }

  expect(initial.nestedActualScroll, `${surface}: no nested pair may both actually scroll vertically`).toEqual([]);
  expect(initial.clippedBodies.filter((row) => !row.hasActiveDescendant), `${surface}: clipped PageShell content must delegate to a real descendant scroller`).toEqual([]);

  if (!initial.primary) return;
  await scrollPrimaryToEnd(page);
  await page.waitForTimeout(40);
  const end = await endGeometry(page);
  await info.attach("geometry-end", { body: Buffer.from(JSON.stringify(end, null, 2)), contentType: "application/json" });

  expect(Math.abs(end.maxScrollTop - end.scrollTop), `${surface}: primary scroll authority reaches its true end`).toBeLessThanOrEqual(2);
  expect(end.finalFlowBottom, `${surface}: final in-flow content stays inside its scroll authority`).toBeLessThanOrEqual(end.bottom + 2);
  if (width <= 720 && end.fixedChromeTop != null) {
    expect(end.bottom, `${surface}: primary mobile content ends above fixed chrome`).toBeLessThanOrEqual(end.fixedChromeTop + 2);
  }
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath("layout-failure.png"), fullPage: false }).catch(() => {});
  }
});

test.describe("Research Drive release geometry", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const [viewportName, width, height] of viewports) {
    for (const surface of surfaces) {
      test(`${viewportName} ${width}x${height} · ${surface}`, async ({ page }, info) => {
        await openSurface(page, surface, width, height);
        await assertGeometry(page, info, surface, width, height);
      });
    }
  }
});
