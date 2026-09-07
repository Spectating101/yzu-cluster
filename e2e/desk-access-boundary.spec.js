import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

// The authenticated desk mock is deliberately replaced with the public
// capabilities contract.  This is the state an anonymous browser actually
// receives from the live front door: UI files and capability booleans are
// public; research data is not.
test("a locked desk has one honest boundary, not zero-shaped data", async ({ page }, testInfo) => {
  await mockV2Api(page);
  for (const path of ["**/library/desk/capabilities", "**/library/desk/session"]) {
    await page.unroute(path).catch(() => {});
  }
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: 2,
      authenticated: false,
      server_configured: true,
      permissions: { view_research_data: false, use_ask: false, view_operations: false },
      session: { bootstrap_available: true, public_guest_available: true },
    }),
  }));
  await page.route("**/library/desk/session", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({
      error: "Forbidden",
      message: "Desk session bootstrap is not permitted for this request",
    }),
  }));

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  const gate = page.getByTestId("desk-access-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("Research data stays inside the desk.");
  await expect(gate).toContainText("This browser is not on a trusted desk entry.");
  await expect(gate.getByRole("button", { name: "Check access again" })).toBeVisible();
  await expect(page.getByText(/0 datasets|Nothing else in this folder|Syncing…/)).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("locked-desk-1440x900.png"), fullPage: false });
});

test("a pending capability check never paints a misleading empty page", async ({ page }) => {
  await mockV2Api(page);
  await page.unroute("**/library/desk/capabilities").catch(() => {});
  await page.route("**/library/desk/capabilities", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 2,
        authenticated: false,
        server_configured: true,
        permissions: { view_research_data: false },
        session: { bootstrap_available: false },
      }),
    });
  });

  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("desk-access-gate")).toBeVisible();
  await expect(page.getByText("No curated source routes yet")).toHaveCount(0);
});

test("a public guest can browse shared evidence but must sign in to Ask", async ({ page }) => {
  await mockV2Api(page);
  await page.unroute("**/library/desk/capabilities").catch(() => {});
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: 2,
      authenticated: true,
      access: "public_guest",
      principal: { id: "guest-test", display_name: "Guest researcher", role: "public_guest" },
      permissions: {
        view_research_data: true,
        view_faculty_profile: false,
        view_operations: false,
        use_ask: false,
        submit_collection: false,
        approve_jobs: false,
      },
      session: { bootstrap_available: true, public_guest_available: true },
    }),
  }));

  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("desk-access-gate")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  // The guest can evaluate shared evidence, but must not be offered an action
  // that only a collection-capable member can submit.
  await expect(page.getByRole("button", { name: "Add to collection" })).toHaveCount(0);
  await expect(page.getByTestId("discover-craft-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("menu", { name: "Account destinations" })).toContainText("Guest");
  await page.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("note")).toContainText("Sign in to ask Research Drive.");
  await expect(page.getByRole("note")).toContainText("Browse Library and Discover freely");
  await expect(page.getByTestId("ask-composer")).toHaveCount(0);
});
