import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

/**
 * No live thread carries every execution status, so this fixture proves the
 * researcher-visible post-approval lifecycle across queued, running,
 * registering, archiving, registered, query_ready, and failed states.
 *
 * Run against a candidate build:
 *   python3 scripts/serve_candidate.py --port 8790 --dir <build>
 *   YZU_DESK_URL=http://127.0.0.1:8790 npm run test:synthesis-states
 */
const FIXTURE = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/synthesis-execution.json"),
    "utf8",
  ),
);
const THREADS = FIXTURE.threads;

const visibleExecutionTrack = (page) =>
  page.locator('ol.s04-exec-track[aria-label="Synthesis execution lifecycle"]:visible');

async function installExecutionStateMock(page) {
  const threads = new Map(THREADS.map((thread) => [thread.id, structuredClone(thread)]));
  await page.route("**/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const threadIndex = parts.lastIndexOf("threads");
    const threadId = parts[threadIndex + 1] || "";
    const suffix = parts.slice(threadIndex + 2).join("/");
    const method = route.request().method();
    const respond = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (!threadId && method === "GET") {
      return respond({ threads: [...threads.values()], total: threads.size });
    }

    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix && method === "GET") return respond(thread);

    // Keep read-only companion requests well-formed if this surface asks for
    // them while selecting a fixture thread. The state test does not invent
    // evidence or materialisation beyond what the thread itself declares.
    if (suffix === "measurements" && method === "GET") {
      const inputDatasetIds = (thread.state?.nodes || [])
        .map((node) => node.dataset_id)
        .filter(Boolean);
      return respond({
        thread_id: thread.id,
        writes: false,
        measurement_basis: "mapped_evidence",
        input_dataset_ids: inputDatasetIds,
        measured_inputs: inputDatasetIds.length,
        unmeasured: [],
        column_profiles: [],
      });
    }
    if (suffix === "evidence-map" && method === "GET") {
      return respond({
        thread_id: thread.id,
        objective: thread.objective,
        nodes: [],
        reason: "all held matches are already mapped to this construction",
        review_required: true,
        writes: false,
      });
    }
    if (suffix === "discover-handoff" && method === "GET") {
      return respond({ thread_id: thread.id, missing_evidence: [], collect_intents: [] });
    }

    return respond({ error: `unexpected synthesis fixture route: ${suffix || method}` }, 404);
  });
}

async function openThread(page, status) {
  const thread = THREADS.find((t) => t.state.execution.status === status);
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  // The thread item leads with a status glyph, not the title, so select on the
  // item that contains the title rather than on its first line.
  const item = page
    .locator('[data-testid="synthesis-thread-item"]')
    .filter({ hasText: thread.title })
    .first();
  await expect(item).toBeVisible();
  await item.click();
  // Wait until this exact thread owns the active detail before sampling the
  // durable execution lifecycle. A previous/default thread may already have
  // rendered while React is switching the selected construction.
  await expect(item).toHaveClass(/\bactive\b/);
  await expect(visibleExecutionTrack(page)).toHaveCount(1);
  await expect(visibleExecutionTrack(page)).toBeVisible();
  return thread;
}

const steps = (page) =>
  visibleExecutionTrack(page)
    .locator("li")
    .evaluateAll((items) =>
      items.map((li) => ({
        label: li.querySelector("strong")?.textContent?.trim() || "",
        detail: li.querySelector("small")?.textContent?.trim() || "",
        state: li.className.trim(),
      })),
    );

test.use({ viewport: { width: 1920, height: 961 } });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await mockV2Api(page);
  await installExecutionStateMock(page);
});

test("every post-approval state renders its execution lifecycle", async ({ page }) => {
  const missing = [];
  for (const status of ["queued", "running", "registering", "archiving", "registered", "query_ready", "failed"]) {
    await openThread(page, status);
    const track = await steps(page);
    if (!track.length) missing.push(status);
  }
  expect(missing, `no execution lifecycle rendered for: ${missing.join(", ")}`).toEqual([]);
});

test("a failed worker build is not marked as in progress", async ({ page }) => {
  await openThread(page, "failed");
  const failedTrack = await steps(page);
  await openThread(page, "running");
  const runningTrack = await steps(page);
  const build = (track) => track.find((step) => /^worker build/i.test(step.label));
  expect(build(failedTrack), "no worker-build lifecycle step rendered").toBeTruthy();
  expect(build(runningTrack), "no running worker-build lifecycle step rendered").toBeTruthy();
  expect(build(failedTrack).state).not.toEqual(build(runningTrack).state);
  expect(build(failedTrack).state).toContain("failed");
  expect(build(runningTrack).state).toContain("now");
});

test("a failure does not advance archive or Library handoff", async ({ page }) => {
  await openThread(page, "failed");
  const track = await steps(page);
  for (const label of ["Archive + registry", "Library handoff"]) {
    const step = track.find((candidate) => candidate.label === label);
    expect(step, `${label} missing`).toBeTruthy();
    expect(step.state, `${label} advanced despite a failure`).not.toContain("done");
  }
});

test("registered and query-ready complete archive and Library handoff", async ({ page }) => {
  for (const status of ["registered", "query_ready"]) {
    await openThread(page, status);
    const track = await steps(page);
    for (const label of ["Archive + registry", "Library handoff"]) {
      const step = track.find((candidate) => candidate.label === label);
      expect(step, `${status}: ${label} missing`).toBeTruthy();
      expect(step.state, `${status}: ${label} not completed`).toContain("done");
    }
  }
});

test("the failed surface is identified for the researcher", async ({ page }) => {
  await openThread(page, "failed");
  const found = await page.locator('[data-testid="synthesis-failed-state"]').count();
  expect(found, "failed threads render no distinct execution surface").toBeGreaterThan(0);
});
