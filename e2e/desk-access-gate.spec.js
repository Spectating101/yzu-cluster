import { expect, test } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

test("an unavailable desk session fails closed behind one honest access boundary", async ({ page }) => {
  await mockV2Api(page);

  await page.route("**/library/desk/capabilities", (route) => {
    const token = route.request().headers()["x-desk-token"] || "";
    const authenticated = token === "review-token-for-test";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        authenticated,
        server_configured: true,
        access: authenticated ? "operator" : "locked",
        permissions: { view_research_data: authenticated, use_ask: authenticated },
      }),
    });
  });
  await page.route("**/library/desk/session", (route) => {
    const token = route.request().headers()["x-desk-token"] || "";
    return route.fulfill({
      status: token === "review-token-for-test" ? 200 : 403,
      contentType: "application/json",
      body: JSON.stringify(
        token === "review-token-for-test"
          ? { ok: true, authorized: true }
          : { ok: false, error: "Forbidden" },
      ),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("desk-access-gate")).toBeVisible();
  await expect(page.locator(".rd-v2-shell")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Research data stays inside the desk." })).toBeVisible();
  const boundary = page.getByLabel("Access boundary");
  await expect(boundary).toContainText("Interface shell");
  await expect(boundary).toContainText("Research data");
  await expect(boundary).toContainText("Ask and collection");
  await expect(boundary).toContainText("Operations");
  await expect(page.getByRole("heading", { name: "Opening your desk…" })).toHaveCount(0);
});

test("protected Discover history waits for session bootstrap", async ({ page }) => {
  await mockV2Api(page);

  let releaseSession;
  const sessionReady = new Promise((resolve) => { releaseSession = resolve; });
  let sessionEstablished = false;
  let historyRequests = 0;
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: 2,
      authenticated: sessionEstablished,
      server_configured: true,
      access: sessionEstablished ? "operator" : "locked",
      permissions: sessionEstablished
        ? {
            view_research_data: true,
            view_faculty_profile: true,
            view_operations: true,
            use_ask: true,
            submit_collection: true,
            approve_jobs: true,
          }
        : {},
    }),
  }));
  await page.route("**/library/desk/session", async (route) => {
    await sessionReady;
    sessionEstablished = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, authorized: true }),
    });
  });
  await page.route("**/library/discover/history*", (route) => {
    historyRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ history: [] }),
    });
  });

  await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("desk-session-bootstrap")).toBeVisible();
  await page.waitForTimeout(300);
  expect(historyRequests).toBe(0);

  releaseSession();
  await expect(page.locator(".rd-v2-shell")).toBeVisible();
  await expect.poll(() => historyRequests).toBeGreaterThan(0);
});
