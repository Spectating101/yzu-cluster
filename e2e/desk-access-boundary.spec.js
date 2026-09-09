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
      session: {
        bootstrap_available: true,
        public_guest_available: true,
        member_sign_in_available: true,
        member_access_code_available: true,
      },
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
  await expect(page.getByTestId("desk-session-bootstrap")).toBeVisible();
  await expect(page.getByTestId("desk-access-gate")).toHaveCount(0);
  await expect(page.getByText("Opening Research Drive")).toBeVisible();
  await expect(page.getByText("No curated source routes yet")).toHaveCount(0);
});

test("a public guest can browse shared evidence but must sign in to Ask", async ({ page }, testInfo) => {
  const facultyRequests = [];
  const privateSurfaceRequests = [];
  const forbiddenStartupRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/library/faculty/profile")) facultyRequests.push(request.url());
    if (/\/library\/(?:synthesis\/threads|desk\/resources)|\/health(?:\?|$)/.test(request.url())) {
      privateSurfaceRequests.push(request.url());
    }
    if (/\/library\/seed(?:\?|$)|\/yzu\/acquisitions(?:\?|$)/.test(request.url())) {
      forbiddenStartupRequests.push(request.url());
    }
  });
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
      session: {
        bootstrap_available: true,
        public_guest_available: true,
        member_sign_in_available: true,
        member_access_code_available: true,
      },
    }),
  }));

  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("desk-access-gate")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resources", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Synthesis", exact: true })).toHaveCount(0);
  // The guest can evaluate shared evidence, but must not be offered an action
  // that only a collection-capable member can submit.
  await expect(page.getByRole("button", { name: "Add to collection" })).toHaveCount(0);
  await expect(page.getByTestId("discover-craft-form")).toHaveCount(0);
  await page.getByLabel("Search or describe a research need").fill("MOPS filings");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByTestId("discover-result-summary")).toBeVisible();
  const rankedResults = page.getByTestId("discover-ranked-results");
  await rankedResults.getByRole("button", { name: /MOPS financial statements/ }).click();
  const signInToRequest = page.locator("aside.rd-v2-rail").getByRole("button", {
    name: "Sign in to request evidence",
  });
  await expect(signInToRequest).toBeVisible();
  await signInToRequest.click();
  await expect(page.getByTestId("ask-sign-in-gate")).toContainText("Sign in to ask Research Drive.");
  await expect(page.getByTestId("discover-intent-workspace")).toHaveCount(0);
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("menu", { name: "Account destinations" })).toContainText("Guest");
  await expect(page.getByTestId("member-sign-in")).toContainText("Sign in to Ask");
  // The account menu is intentionally a modal interaction layer. Close it
  // before exercising the inspector tab beneath it, as a real keyboard user
  // would; otherwise the test asks Playwright to click through the menu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Account destinations" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Ask · sign in" }).click();
  await expect(page.getByTestId("ask-sign-in-gate")).toContainText("Sign in to ask Research Drive.");
  await expect(page.getByTestId("ask-sign-in-gate")).toContainText("Shared Library and Discover evidence remain available");
  await expect(page.getByLabel("Member access code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to Ask" })).toBeVisible();
  await expect(page.getByTestId("ask-composer")).toHaveCount(0);

  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Resource headroom")).toHaveCount(0);
  await expect.poll(() => privateSurfaceRequests).toEqual([]);
  await expect.poll(() => forbiddenStartupRequests).toEqual([]);

  await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Research profile access")).toContainText("Profiles are personal workspaces");
  await expect(page.getByLabel("Research profile access")).toContainText("Sign in to keep a research profile");
  await expect(page.getByText(/Bind example identity|Loading example profile|Use EXAMPLE/)).toHaveCount(0);
  await expect.poll(() => facultyRequests).toEqual([]);
  if (process.env.YZU_CAPTURE_VISUALS === "1") {
    await page.screenshot({ path: testInfo.outputPath("public-profile-1440x900.png"), fullPage: false });
    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Public browsing session", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("public-settings-1440x900.png"), fullPage: false });
  }
});
