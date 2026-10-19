import { expect, test } from "@playwright/test";

/**
 * Boot order was previously asserted by reading App.jsx, which cannot tell you
 * whether the desk behaves. These exercise the two properties that matter:
 *
 *   - the visible research estate does not wait on aggregate health, which is
 *     what made the Library sit on "Organizing shelves…" for 13s
 *   - a failed /health is reported as unmeasured and retried, rather than
 *     rendered as readiness or as an outage
 *
 * Run against a candidate build:
 *   python3 scripts/serve_candidate.py --port 8790 --dir <build>
 *   YZU_DESK_URL=http://127.0.0.1:8790 npm run test:boot-recovery
 */
test.use({ viewport: { width: 1920, height: 961 } });
test.describe.configure({ mode: "serial" });

// Absence of "Organizing" is also true before the surface has rendered at all,
// so wait for the shelf count the estate actually publishes.
const shelvesReady = (page) =>
  page.waitForFunction(
    () => /\d+\s+shel(f|ves)/i.test((document.querySelector("main") || document.body).innerText || ""),
    null,
    { timeout: 60_000 },
  );

test("the library estate does not wait on aggregate health", async ({ page }) => {
  // /health never answers; the estate must still arrive.
  await page.route("**/health*", () => {});
  const started = Date.now();
  await page.goto("/?tab=library");
  await shelvesReady(page);
  const elapsed = Date.now() - started;
  const shown = await page.evaluate(
    () => (document.querySelector("main") || document.body).innerText || "",
  );
  expect(shown).toMatch(/\d+\s+shel(f|ves)/i);
  expect(elapsed, `estate took ${elapsed}ms with health hung`).toBeLessThan(20_000);
});

test("the library estate does not wait on the resources rollup", async ({ page }) => {
  await page.route("**/library/desk/resources*", () => {});
  const started = Date.now();
  await page.goto("/?tab=library");
  await shelvesReady(page);
  expect(Date.now() - started).toBeLessThan(20_000);
});

test("a failed health read is neither readiness nor an outage", async ({ page }) => {
  await page.route("**/health*", (route) => route.abort());
  await page.goto("/?tab=home");
  await page.waitForTimeout(9000);
  const text = await page.evaluate(
    () => (document.querySelector("main") || document.body).innerText || "",
  );
  expect(text, "claimed readiness with no health measurement").not.toMatch(/Composer ready/i);
  expect(text.length, "home rendered nothing when health failed").toBeGreaterThan(300);
});

test("health is retried after the initial read fails", async ({ page }) => {
  let attempts = 0;
  await page.route("**/health*", (route) => {
    attempts += 1;
    // fail the boot read, then let the retry through
    return attempts <= 1 ? route.abort() : route.continue();
  });
  await page.goto("/?tab=home");
  await page.waitForFunction(() => true, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(20_000);
  expect(attempts, "health was never retried after failing at boot").toBeGreaterThan(1);
});
