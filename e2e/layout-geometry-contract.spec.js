import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const SURFACES = [
  { tab: "home", label: "Home" },
  { tab: "library", label: "Library" },
  { tab: "discover", label: "Discover" },
  { tab: "synthesis", label: "Synthesis" },
  { tab: "resources", label: "Resources" },
  { tab: "profile", label: "Profile" },
  { tab: "settings", label: "Settings" },
];

const VIEWPORTS = [
  { name: "phone-short", width: 360, height: 640 },
  { name: "phone-canonical", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop-short", width: 1366, height: 768 },
  { name: "desktop-wide", width: 1920, height: 1080 },
];

function routeFor(tab) {
  return tab === "home" ? "/" : `/?tab=${encodeURIComponent(tab)}`;
}

async function openSurface(page, surface, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(routeFor(surface.tab), { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.locator("main.yzu-main")).toBeVisible();

  if (surface.tab === "synthesis") {
    await expect(page.locator('[data-testid="synthesis-home-state"], .rd-v2-synthesis-page').first()).toBeVisible();
  } else {
    await expect(page.locator(".rd-v2-page").first()).toBeVisible();
  }
}

async function measureGeometry(page) {
  return page.evaluate(() => {
    const epsilon = 2;
    const shell = document.querySelector(".rd-v2-shell");
    const main = document.querySelector("main.yzu-main");
    const pageRoot = main?.querySelector(".rd-v2-page") || null;
    const bodyScrollers = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])];

    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };

    const scrollOverflow = (node) => {
      if (!node) return false;
      const value = getComputedStyle(node).overflowY;
      return value === "auto" || value === "scroll" || value === "overlay";
    };

    const activeBodyScroller = bodyScrollers
      .filter(visible)
      .sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth))[0] || null;

    const scrollerRect = activeBodyScroller?.getBoundingClientRect() || null;
    const scrollerAncestors = [];
    if (activeBodyScroller) {
      for (let node = activeBodyScroller.parentElement; node; node = node.parentElement) {
        if (node === main?.parentElement) break;
        if (scrollOverflow(node)) {
          scrollerAncestors.push({
            tag: node.tagName.toLowerCase(),
            className: String(node.className || ""),
            overflowY: getComputedStyle(node).overflowY,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
          });
        }
        if (node === main) break;
      }
    }

    const fixedChrome = [
      document.querySelector(".yzu-sidebar"),
      document.querySelector(".yzu-inspector"),
    ]
      .filter(visible)
      .filter((node) => getComputedStyle(node).position === "fixed")
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          className: String(node.className || ""),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });

    const shellRect = shell?.getBoundingClientRect() || null;
    const mainRect = main?.getBoundingClientRect() || null;
    const pageRect = pageRoot?.getBoundingClientRect() || null;

    const directFlowChildren = activeBodyScroller
      ? [...activeBodyScroller.children].filter((node) => {
          if (!visible(node)) return false;
          const position = getComputedStyle(node).position;
          return position !== "fixed" && position !== "absolute";
        })
      : [];

    return {
      epsilon,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      },
      shell: shellRect && {
        left: shellRect.left,
        right: shellRect.right,
        top: shellRect.top,
        bottom: shellRect.bottom,
        width: shellRect.width,
        height: shellRect.height,
      },
      main: mainRect && {
        left: mainRect.left,
        right: mainRect.right,
        top: mainRect.top,
        bottom: mainRect.bottom,
        width: mainRect.width,
        height: mainRect.height,
        scrollWidth: main.scrollWidth,
        clientWidth: main.clientWidth,
      },
      page: pageRect && {
        left: pageRect.left,
        right: pageRect.right,
        top: pageRect.top,
        bottom: pageRect.bottom,
        width: pageRect.width,
        height: pageRect.height,
        overflowY: getComputedStyle(pageRoot).overflowY,
        scrollHeight: pageRoot.scrollHeight,
        clientHeight: pageRoot.clientHeight,
      },
      scroller: activeBodyScroller && scrollerRect && {
        className: String(activeBodyScroller.className || ""),
        left: scrollerRect.left,
        right: scrollerRect.right,
        top: scrollerRect.top,
        bottom: scrollerRect.bottom,
        width: scrollerRect.width,
        height: scrollerRect.height,
        overflowY: getComputedStyle(activeBodyScroller).overflowY,
        scrollTop: activeBodyScroller.scrollTop,
        scrollHeight: activeBodyScroller.scrollHeight,
        clientHeight: activeBodyScroller.clientHeight,
        directFlowChildCount: directFlowChildren.length,
      },
      scrollerAncestors,
      fixedChrome,
    };
  });
}

async function scrollPrimaryToEnd(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const candidates = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && rect.width > 1 && rect.height > 1;
      })
      .sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
    const scroller = candidates[0] || null;
    if (!scroller) return null;
    scroller.scrollTop = scroller.scrollHeight;
    return {
      maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
    };
  });
}

async function measureEndGeometry(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const candidates = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && rect.width > 1 && rect.height > 1;
      })
      .sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
    const scroller = candidates[0] || null;
    if (!scroller) return null;

    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const flowChildren = [...scroller.children].filter((node) => {
      if (!visible(node)) return false;
      const position = getComputedStyle(node).position;
      return position !== "fixed" && position !== "absolute";
    });
    const childBottom = flowChildren.length
      ? Math.max(...flowChildren.map((node) => node.getBoundingClientRect().bottom))
      : scroller.getBoundingClientRect().top;

    const fixedChrome = [document.querySelector(".yzu-sidebar"), document.querySelector(".yzu-inspector")]
      .filter((node) => node && visible(node) && getComputedStyle(node).position === "fixed")
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.top >= scroller.getBoundingClientRect().top - 2);

    const scrollerRect = scroller.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      scrollerTop: scrollerRect.top,
      scrollerBottom: scrollerRect.bottom,
      finalFlowBottom: childBottom,
      fixedChromeTop: fixedChrome.length ? Math.min(...fixedChrome.map((rect) => rect.top)) : null,
    };
  });
}

async function assertSurfaceGeometry(page, testInfo, surface, viewport) {
  const initial = await measureGeometry(page);
  await testInfo.attach(`layout-${viewport.name}-${surface.tab}-initial`, {
    body: Buffer.from(JSON.stringify(initial, null, 2)),
    contentType: "application/json",
  });

  expect(initial.shell, `${surface.label}: shell must exist`).toBeTruthy();
  expect(initial.main, `${surface.label}: main must exist`).toBeTruthy();
  expect(initial.document.width, `${surface.label}: document must not overflow horizontally`).toBeLessThanOrEqual(viewport.width + 2);
  expect(initial.document.bodyWidth, `${surface.label}: body must not overflow horizontally`).toBeLessThanOrEqual(viewport.width + 2);
  expect(initial.document.height, `${surface.label}: fixed desk shell must own document height`).toBeLessThanOrEqual(viewport.height + 2);
  expect(initial.document.bodyHeight, `${surface.label}: body must not become a second vertical page`).toBeLessThanOrEqual(viewport.height + 2);

  expect(initial.shell.left).toBeGreaterThanOrEqual(-2);
  expect(initial.shell.top).toBeGreaterThanOrEqual(-2);
  expect(initial.shell.right).toBeLessThanOrEqual(viewport.width + 2);
  expect(initial.shell.bottom).toBeLessThanOrEqual(viewport.height + 2);
  expect(initial.main.left).toBeGreaterThanOrEqual(initial.shell.left - 2);
  expect(initial.main.right).toBeLessThanOrEqual(initial.shell.right + 2);
  expect(initial.main.top).toBeGreaterThanOrEqual(initial.shell.top - 2);
  expect(initial.main.bottom).toBeLessThanOrEqual(initial.shell.bottom + 2);

  for (const fixed of initial.fixedChrome) {
    expect(fixed.left, `${surface.label}: fixed chrome left edge`).toBeGreaterThanOrEqual(-2);
    expect(fixed.right, `${surface.label}: fixed chrome right edge`).toBeLessThanOrEqual(viewport.width + 2);
    expect(fixed.top, `${surface.label}: fixed chrome top edge`).toBeGreaterThanOrEqual(-2);
    expect(fixed.bottom, `${surface.label}: fixed chrome bottom edge`).toBeLessThanOrEqual(viewport.height + 2);
  }

  if (initial.scroller) {
    expect(initial.scrollerAncestors, `${surface.label}: primary body scroller must have no competing scrolling ancestor`).toEqual([]);
    if (initial.scroller.scrollHeight > initial.scroller.clientHeight + 2) {
      expect(["auto", "scroll", "overlay"]).toContain(initial.scroller.overflowY);
    }

    await scrollPrimaryToEnd(page);
    await page.waitForTimeout(40);
    const end = await measureEndGeometry(page);
    await testInfo.attach(`layout-${viewport.name}-${surface.tab}-end`, {
      body: Buffer.from(JSON.stringify(end, null, 2)),
      contentType: "application/json",
    });

    expect(Math.abs(end.maxScrollTop - end.scrollTop), `${surface.label}: primary scroller must reach its true end`).toBeLessThanOrEqual(2);
    expect(end.finalFlowBottom, `${surface.label}: final flow content must remain inside the primary scroller`).toBeLessThanOrEqual(end.scrollerBottom + 2);

    if (viewport.width <= 720 && end.fixedChromeTop != null) {
      expect(end.scrollerBottom, `${surface.label}: mobile primary scroller must end above fixed chrome`).toBeLessThanOrEqual(end.fixedChromeTop + 2);
    }
  }
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: testInfo.outputPath("layout-failure.png"), fullPage: false }).catch(() => {});
  }
});

test.describe("Research Drive release layout geometry", () => {
  test.beforeEach(async ({ page }) => {
    await mockV2Api(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}x${viewport.height} keeps every release surface contained and reachable`, async ({ page }, testInfo) => {
      for (const surface of SURFACES) {
        await test.step(surface.label, async () => {
          await openSurface(page, surface, viewport);
          await assertSurfaceGeometry(page, testInfo, surface, viewport);
        });
      }
    });
  }
});
