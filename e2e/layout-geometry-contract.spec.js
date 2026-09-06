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

function geometryProbe() {
  const shell = document.querySelector(".rd-v2-shell");
  const main = document.querySelector("main.yzu-main");
  const pageRoot = main?.querySelector(".rd-v2-page") || null;

  const visible = (node) => {
    if (!node) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  };
  const overflowClaim = (node) => {
    if (!node) return false;
    const value = getComputedStyle(node).overflowY;
    return value === "auto" || value === "scroll" || value === "overlay";
  };
  const actualVerticalScroll = (node) => overflowClaim(node) && node.scrollHeight > node.clientHeight + 2;

  const allMainNodes = [main, ...(main?.querySelectorAll("*") || [])].filter(visible);
  const activeScrollers = allMainNodes
    .filter(actualVerticalScroll)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { node, score: rect.width * rect.height };
    })
    .sort((a, b) => b.score - a.score);

  // Prefer the largest scrollable region that is actually overflowing. This
  // correctly models PageShell pages, but also Library's short-phone evidence
  // ledger and Synthesis workbench panes when their outer page is intentionally
  // frozen. If nothing is overflowing, retain the largest PageShell body as a
  // containment probe rather than inventing a scroll authority.
  let primary = activeScrollers[0]?.node || null;
  if (!primary) {
    primary = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
      .filter(visible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      })[0] || null;
  }

  const primaryRect = primary?.getBoundingClientRect() || null;
  const ancestorClaims = [];
  if (primary) {
    for (let node = primary.parentElement; node; node = node.parentElement) {
      if (node === main?.parentElement) break;
      if (overflowClaim(node)) {
        const rect = node.getBoundingClientRect();
        ancestorClaims.push({
          tag: node.tagName.toLowerCase(),
          className: String(node.className || ""),
          overflowY: getComputedStyle(node).overflowY,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          actualScroll: actualVerticalScroll(node),
          width: rect.width,
          height: rect.height,
        });
      }
      if (node === main) break;
    }
  }

  const fixedChrome = [document.querySelector(".yzu-sidebar"), document.querySelector(".yzu-inspector")]
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

  return {
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
    primary: primary && primaryRect && {
      tag: primary.tagName.toLowerCase(),
      className: String(primary.className || ""),
      testId: primary.getAttribute("data-testid") || "",
      left: primaryRect.left,
      right: primaryRect.right,
      top: primaryRect.top,
      bottom: primaryRect.bottom,
      width: primaryRect.width,
      height: primaryRect.height,
      overflowY: getComputedStyle(primary).overflowY,
      scrollTop: primary.scrollTop,
      scrollHeight: primary.scrollHeight,
      clientHeight: primary.clientHeight,
      actualScroll: actualVerticalScroll(primary),
    },
    activeScrollerCount: activeScrollers.length,
    activeScrollers: activeScrollers.slice(0, 8).map(({ node }) => {
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName.toLowerCase(),
        className: String(node.className || ""),
        testId: node.getAttribute("data-testid") || "",
        overflowY: getComputedStyle(node).overflowY,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        width: rect.width,
        height: rect.height,
      };
    }),
    ancestorClaims,
    fixedChrome,
  };
}

async function measureGeometry(page) {
  return page.evaluate(geometryProbe);
}

async function scrollPrimaryToEnd(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const overflowClaim = (node) => {
      const value = getComputedStyle(node).overflowY;
      return value === "auto" || value === "scroll" || value === "overlay";
    };
    const active = [main, ...(main?.querySelectorAll("*") || [])]
      .filter((node) => node && visible(node) && overflowClaim(node) && node.scrollHeight > node.clientHeight + 2)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    let scroller = active[0]?.node || null;
    if (!scroller) {
      scroller = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
        .filter(visible)
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (br.width * br.height) - (ar.width * ar.height);
        })[0] || null;
    }
    if (!scroller) return null;
    scroller.scrollTop = scroller.scrollHeight;
    return {
      className: String(scroller.className || ""),
      maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
    };
  });
}

async function measureEndGeometry(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.yzu-main");
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    };
    const overflowClaim = (node) => {
      if (!node) return false;
      const value = getComputedStyle(node).overflowY;
      return value === "auto" || value === "scroll" || value === "overlay";
    };
    const active = [main, ...(main?.querySelectorAll("*") || [])]
      .filter((node) => node && visible(node) && overflowClaim(node) && node.scrollHeight > node.clientHeight + 2)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    let scroller = active[0]?.node || null;
    if (!scroller) {
      scroller = [...(main?.querySelectorAll(".rd-v2-body-scroll") || [])]
        .filter(visible)
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (br.width * br.height) - (ar.width * ar.height);
        })[0] || null;
    }
    if (!scroller) return null;

    const flowChildren = [...scroller.children].filter((node) => {
      if (!visible(node)) return false;
      const position = getComputedStyle(node).position;
      return position !== "fixed" && position !== "absolute";
    });
    const childBottom = flowChildren.length
      ? Math.max(...flowChildren.map((node) => node.getBoundingClientRect().bottom))
      : scroller.getBoundingClientRect().top;

    const scrollerRect = scroller.getBoundingClientRect();
    const fixedChrome = [document.querySelector(".yzu-sidebar"), document.querySelector(".yzu-inspector")]
      .filter((node) => node && visible(node) && getComputedStyle(node).position === "fixed")
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.top >= scrollerRect.top - 2);

    return {
      className: String(scroller.className || ""),
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

  if (initial.primary) {
    // A primary scroller may be nested (Library ledger, Synthesis workbench),
    // but none of its ancestors up to main may independently claim scrolling.
    expect(initial.ancestorClaims, `${surface.label}: primary scroller must have no competing scroll-owning ancestor`).toEqual([]);

    // If the chosen containment region is clipped, there must be a real inner
    // active scroller instead. Otherwise content is hidden with no way to reach it.
    if (!initial.primary.actualScroll && initial.primary.scrollHeight > initial.primary.clientHeight + 2) {
      throw new Error(`${surface.label}: clipped primary region has no active scroll authority`);
    }

    await scrollPrimaryToEnd(page);
    await page.waitForTimeout(40);
    const end = await measureEndGeometry(page);
    await testInfo.attach(`layout-${viewport.name}-${surface.tab}-end`, {
      body: Buffer.from(JSON.stringify(end, null, 2)),
      contentType: "application/json",
    });

    expect(Math.abs(end.maxScrollTop - end.scrollTop), `${surface.label}: primary scroller must reach its true end`).toBeLessThanOrEqual(2);
    expect(end.finalFlowBottom, `${surface.label}: final in-flow content must remain inside the primary scroller`).toBeLessThanOrEqual(end.scrollerBottom + 2);

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
    for (const surface of SURFACES) {
      test(`${viewport.name} ${viewport.width}x${viewport.height} · ${surface.label}`, async ({ page }, testInfo) => {
        await openSurface(page, surface, viewport);
        await assertSurfaceGeometry(page, testInfo, surface, viewport);
      });
    }
  }
});
