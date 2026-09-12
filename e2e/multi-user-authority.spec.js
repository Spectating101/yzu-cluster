import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";


test("account menu names the authenticated person and simple role", async ({ page }) => {
  await mockV2Api(page);
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  await page.getByRole("button", { name: "Account" }).click();
  const menu = page.getByRole("menu", { name: "Account destinations" });
  await expect(menu).toContainText("Researcher One");
  await expect(menu).toContainText("Operator");
  await expect(menu).not.toContainText("methods-lab");
});


test("member can research but does not receive operator approval controls", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 2,
        authenticated: true,
        access: "member",
        principal: {
          id: "member-1",
          email: "member@example.test",
          display_name: "Research Member",
          role: "member",
        },
        permissions: {
          view_research_data: true,
          view_faculty_profile: true,
          view_operations: false,
          use_ask: true,
          submit_collection: true,
          approve_jobs: false,
        },
      }),
    }),
  );
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("header-pending-link")).toHaveCount(0);
  await page.getByRole("button", { name: /^Ask/ }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("menu", { name: "Account destinations" })).toContainText("Member");
});

test("a Home Ask answer survives passive Pick Up hydration", async ({ page }) => {
  const answer = "Resources context received.";
  await mockV2Api(page, { datasetsDelayMs: 1_000 });
  await page.route("**/api/library/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    const body = route.request().postDataJSON?.() || {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session_id: body.session_id || "home-stable-session", reply: answer, action: "answer" }),
    });
  });

  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("tab", { name: /^Ask/ }).click();
  await expect(page.getByTestId("ask-composer")).toBeVisible();
  await page.getByTestId("ask-composer").fill("Which held datasets support stablecoin research?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByTestId("ask-messages")).toContainText(answer, { timeout: 5_000 });
  await expect(page.getByTestId("ask-messages")).toContainText("Which held datasets support stablecoin research?");
});
