import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const access = (role) => ({
  version: 2,
  authenticated: true,
  principal: { id: `${role}-fixture`, role, display_name: role, email: role === "public_guest" ? null : "alice@example.test" },
  permissions: { view_research_data: true, use_ask: role !== "public_guest", manage_research_profile: role !== "public_guest", view_operations: false, submit_collection: false, view_faculty_profile: false },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
});

test("a signed-out visitor is told what Research Drive does and where to start", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("public_guest")));
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  const welcome = page.getByTestId("home-welcome");
  await expect(welcome).toContainText("Research data you can use, with where it came from");
  await expect(welcome.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("home-continue")).toHaveCount(0);
  await expect(welcome.getByRole("button", { name: "Create account" })).toBeVisible();
  await welcome.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("access-screen").getByRole("heading", { name: "Sign in to Research Drive" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("access-screen")).toHaveCount(0);

  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("home-welcome").getByRole("button", { name: "Browse the Library" }).click();
  await expect(page).toHaveURL(/tab=library/);
});

test("a signed-in researcher still gets their pick-up card instead of the welcome", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("member")));
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByTestId("home-continue")).toBeVisible();
  await expect(page.getByTestId("home-welcome")).toHaveCount(0);
});
