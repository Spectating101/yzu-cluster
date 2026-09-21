/**
 * Researcher first-use contract.
 *
 * This is not a substitute for human usability evidence. It protects the
 * interface conditions a researcher pilot depends on: orientation, a clear
 * evidence path, truthful Home posture, selected-object continuity, and mobile
 * containment.
 */
import { expect, test } from "@playwright/test";
import {
  MOCK_DISCOVER_HIT,
  MOCK_HEALTH,
  mockV2Api,
  waitForShell,
} from "./fixtures/v2MockApi.js";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const QUIET_HEALTH = {
  ...MOCK_HEALTH,
  desk: {
    ...MOCK_HEALTH.desk,
    jobs: {
      ...(MOCK_HEALTH.desk?.jobs || {}),
      running: 0,
      pending_approval: 0,
      gdelt_progress: "",
    },
  },
};

// The shared v2 fixture intentionally represents an active desk: it has held
// datasets and an approval waiting in /health. First-use guidance is only the
// truthful Home state when there is no durable/recent work to resume, so the
// Home contract must create that state explicitly rather than calling the
// default fixture a cold start.
const COLD_START_OPTIONS = {
  datasetsBody: { datasets: [] },
  jobsBody: { jobs: [] },
  healthBody: {
    ...QUIET_HEALTH,
    datasets: 0,
  },
};

async function open(page, url, viewport = DESKTOP, options = {}) {
  await page.setViewportSize(viewport);
  await mockV2Api(page, options);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForShell(page).catch(() => {});
}

test("Home cold start explains the research path without pretending work exists", async ({ page }, testInfo) => {
  await open(page, "/?tab=home", DESKTOP, COLD_START_OPTIONS);

  const path = page.getByTestId("home-first-use-path");
  await expect(path).toBeVisible();

  // Protect the researcher mental model, not a particular sentence shape.
  // Each named surface must retain its role: Library is held evidence, Ask
  // reasons over context, Discover closes evidence gaps, and Synthesis keeps
  // approved work durable.
  await expect(path).toContainText(/Library[\s\S]*desk[\s\S]*holds[\s\S]*evidence/i);
  await expect(path).toContainText(/Discover[\s\S]*evidence[\s\S]*missing/i);
  await expect(path).toContainText(/Ask[\s\S]*reason\w*[\s\S]*current\s+research\s+context/i);
  await expect(path).toContainText(/Synthesis[\s\S]*preserv\w*[\s\S]*approved\s+methods?\s+and\s+outputs?[\s\S]*durable/i);

  // First use remains evidence-honest: guidance may orient, but it must not
  // invent a resume object or durable work that is not present in the mock.
  const pickup = page.getByTestId("home-continue");
  await expect(pickup).toHaveAttribute("data-posture", "cold");
  await expect(pickup).toContainText(/Pick up\s*·\s*Start/i);
  await expect(pickup).toContainText(/No resume point|No durable research work/i);
  await expect(page.locator(".rd-v2-home-topband")).toHaveAttribute("data-home-posture", "cold");
  await expect(page.locator(".rd-v2-page-head")).toContainText(/Start with held evidence/i);

  // Keep an exact-head visual record of the state this contract protects.
  await page.screenshot({
    path: testInfo.outputPath("home-first-use-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("Home distinguishes held evidence from an empty desk", async ({ page }) => {
  await open(page, "/?tab=home", DESKTOP, {
    jobsBody: { jobs: [] },
    healthBody: QUIET_HEALTH,
  });

  const pickup = page.getByTestId("home-continue");
  await expect(pickup).toHaveAttribute("data-kind", "library_asset");
  await expect(pickup).toHaveAttribute("data-posture", "held-evidence");
  await expect(pickup).toContainText(/Pick up\s*·\s*Evidence/i);
  await expect(page.locator(".rd-v2-home-topband")).toHaveAttribute("data-home-posture", "held-evidence");
  await expect(page.locator(".rd-v2-page-head")).toContainText(/Evidence is on hand/i);
});

test("Home elevates an explicit researcher decision above generic resume copy", async ({ page }) => {
  await open(page, "/?tab=home", DESKTOP);

  const pickup = page.getByTestId("home-continue");
  await expect(pickup).toHaveAttribute("data-kind", "decision");
  await expect(pickup).toHaveAttribute("data-posture", "decision");
  await expect(pickup).toContainText(/Pick up\s*·\s*Decision/i);
  await expect(page.locator(".rd-v2-home-topband")).toHaveAttribute("data-home-posture", "decision");
  await expect(page.locator(".rd-v2-page-head")).toContainText(/researcher decision is waiting/i);
});

test("Home identifies a durable Synthesis thread as resumable research work", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockV2Api(page, COLD_START_OPTIONS);
  await page.route("**/api/library/synthesis/threads**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threads: [
          {
            id: "thread-first-use-resume",
            title: "Cross-country ECI robustness",
            updated_at: "2026-09-21T12:00:00Z",
            state: {
              nodes: [{ id: "held-evidence-1", layer: "evidence", type: "source" }],
              execution: { status: "" },
            },
          },
        ],
      }),
    }),
  );
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page).catch(() => {});

  const pickup = page.getByTestId("home-continue");
  await expect(pickup).toHaveAttribute("data-kind", "synthesis_thread");
  await expect(pickup).toHaveAttribute("data-posture", "synthesis");
  await expect(pickup).toContainText(/Pick up\s*·\s*Synthesis/i);
  await expect(pickup).toContainText("Cross-country ECI robustness");
  await expect(page.locator(".rd-v2-page-head")).toContainText(/Durable research work is ready to resume/i);
});

test("Discover keeps the selected object visually bound to its inspector", async ({ page }) => {
  await open(page, "/?tab=browse&q=stablecoin", DESKTOP, { discoverBody: MOCK_DISCOVER_HIT });

  const firstRow = page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate").first();
  await expect(firstRow).toBeVisible();
  const title = String(await firstRow.locator(".rd-v2-discover-candidate-title").textContent()).trim();
  expect(title.length).toBeGreaterThan(0);

  await firstRow.click();
  await expect(firstRow).toHaveClass(/selected/);

  const rail = page.getByRole("complementary", { name: "Inspector" });
  await expect(rail).toContainText(title);
  await expect(rail).toContainText(/Can I use this|Selected candidate/i);
});

test("first-use guidance remains compact on a phone", async ({ page }, testInfo) => {
  await open(page, "/?tab=home", MOBILE, COLD_START_OPTIONS);

  const path = page.getByTestId("home-first-use-path");
  await expect(path).toBeVisible();
  const dims = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
  }));
  expect(dims.body).toBeLessThanOrEqual(dims.viewport);
  expect(dims.doc).toBeLessThanOrEqual(dims.viewport);

  const box = await path.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width);

  await page.screenshot({
    path: testInfo.outputPath("home-first-use-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});
