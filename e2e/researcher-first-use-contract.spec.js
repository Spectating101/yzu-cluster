/**
 * Researcher first-use contract.
 *
 * This is not a substitute for human usability evidence. It protects the
 * interface conditions a researcher pilot depends on: orientation, a clear
 * evidence path, selected-object continuity, and mobile containment.
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

// The shared v2 fixture intentionally represents an active desk: it has held
// datasets and an approval waiting in /health. First-use guidance is only the
// truthful Home state when there is no durable/recent work to resume, so the
// Home contract must create that state explicitly rather than calling the
// default fixture a cold start.
const COLD_START_OPTIONS = {
  datasetsBody: { datasets: [] },
  jobsBody: { jobs: [] },
  healthBody: {
    ...MOCK_HEALTH,
    datasets: 0,
    desk: {
      ...MOCK_HEALTH.desk,
      jobs: {
        ...(MOCK_HEALTH.desk?.jobs || {}),
        running: 0,
        pending_approval: 0,
        gdelt_progress: "",
      },
    },
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

  // Protect the researcher mental model, not a particular tense or copy edit.
  // Each named surface must retain its role: Library is held evidence, Ask
  // reasons over context, Discover closes evidence gaps, and Synthesis keeps
  // approved work durable.
  await expect(path).toContainText(/Library\s+is\s+what\s+the\s+desk\s+holds/i);
  await expect(path).toContainText(/Ask\s+reason\w*\s+over\s+current\s+research\s+context/i);
  await expect(path).toContainText(/Discover\s+close\w*\s+(?:evidence\s+)?gaps/i);
  await expect(path).toContainText(/Synthesis\s+preserv\w*\s+approved\s+methods?\s+and\s+outputs?/i);

  // First use remains evidence-honest: guidance may orient, but it must not
  // invent a resume object or durable work that is not present in the mock.
  await expect(page.getByTestId("home-continue")).toContainText(/No resume point|No durable research work/i);

  // Keep an exact-head visual record of the state this contract protects.
  await page.screenshot({
    path: testInfo.outputPath("home-first-use-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
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
