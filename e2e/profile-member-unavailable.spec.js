import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const member = {
  version: 2,
  authenticated: true,
  principal: { id: "member-fixture", role: "member", display_name: "Prof. Lin", email: "lin@example.test" },
  permissions: { view_research_data: true, use_ask: true, manage_research_profile: true, view_operations: false, submit_collection: true, view_faculty_profile: false },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
};

test("a signed-in member whose profile fails to load is not told to sign in", async ({ page }) => {
  let attempts = 0;
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(member) }));
  await page.route(/\/library\/profile(\?.*)?$/, (route) => {
    attempts += 1;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "profile store unavailable" }) });
  });
  await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const unavailable = page.getByTestId("profile-unavailable");
  await expect(unavailable).toContainText("Your profile could not be loaded right now");
  await expect(page.locator("main").first()).not.toContainText("as a guest");
  await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Sign in to keep a personal research profile");
  const before = attempts;
  await unavailable.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => attempts).toBeGreaterThan(before);
});
