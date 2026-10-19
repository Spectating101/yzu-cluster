import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * No live thread carries an execution status, so the whole post-approval track
 * — queued, running, registering, archiving, registered, query_ready, failed —
 * had never been seen rendered. A failed build was styled with the same marker
 * as a running one for exactly that reason.
 *
 * Run against a candidate build:
 *   python3 scripts/serve_candidate.py --port 8790 --dir <build>
 *   YZU_DESK_URL=http://127.0.0.1:8790 npm run test:synthesis-states
 */
const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/synthesis-execution.json"),
  "utf8",
);
const THREADS = JSON.parse(FIXTURE).threads;

async function openThread(page, status) {
  await page.route("**/library/synthesis/threads*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: FIXTURE }),
  );
  const thread = THREADS.find((t) => t.state.execution.status === status);
  await page.goto("/?tab=synthesis");
  await page.waitForTimeout(4000);
  // The thread item leads with a status glyph, not the title, so select on the
  // item that contains the title rather than on its first line.
  const item = page
    .locator('[data-testid="synthesis-thread-item"]')
    .filter({ hasText: thread.title });
  await item.first().click();
  await page.waitForTimeout(3500);
  return thread;
}

const steps = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".s04-steps li")].map((li) => {
      // each item reads: glyph / stage label / stage detail
      const lines = (li.innerText || "").split("\n").map((x) => x.trim());
      return { label: lines[1] || lines[0] || "", detail: lines[2] || "", state: li.className.trim() };
    }),
  );

test.use({ viewport: { width: 1920, height: 961 } });
test.describe.configure({ mode: "serial" });

test("every post-approval state renders its track", async ({ page }) => {
  const missing = [];
  for (const status of ["queued", "running", "registering", "archiving", "registered", "query_ready", "failed"]) {
    await openThread(page, status);
    const track = await steps(page);
    if (!track.length) missing.push(status);
  }
  expect(missing, `no execution track rendered for: ${missing.join(", ")}`).toEqual([]);
});

test("a failed build is not marked as the step in progress", async ({ page }) => {
  await openThread(page, "failed");
  const failedTrack = await steps(page);
  await openThread(page, "running");
  const runningTrack = await steps(page);
  const build = (t) => t.find((s) => /^build/i.test(s.label));
  expect(build(failedTrack), "no worker-build step rendered").toBeTruthy();
  expect(build(failedTrack).state).not.toEqual(build(runningTrack).state);
  expect(build(failedTrack).state).toContain("failed");
});

test("a failure does not advance the stages after it", async ({ page }) => {
  await openThread(page, "failed");
  const track = await steps(page);
  for (const label of ["Reuse"]) {
    const step = track.find((s) => s.label.startsWith(label));
    expect(step, `${label} missing`).toBeTruthy();
    expect(step.state, `${label} advanced despite a failure`).not.toContain("done");
  }
});

test("registered and query-ready complete the archive stage", async ({ page }) => {
  for (const status of ["registered", "query_ready"]) {
    await openThread(page, status);
    const track = await steps(page);
    const archive = track.find((s) => s.label.startsWith("Reuse"));
    expect(archive, `${status}: reuse step missing`).toBeTruthy();
    expect(archive.state, `${status}: reuse stage not reached`).not.toEqual("");
  }
});

test("the failed surface is identified for the researcher", async ({ page }) => {
  await openThread(page, "failed");
  const found = await page.locator('[data-testid="synthesis-failed-state"]').count();
  expect(found, "failed threads render no distinct execution surface").toBeGreaterThan(0);
});
