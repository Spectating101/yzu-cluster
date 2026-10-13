import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const access = (id = "guest-fixture", role = "public_guest") => ({ version: 2, authenticated: true,
  principal: { id, role, display_name: id, email: role === "public_guest" ? null : "alice@example.test" },
  permissions: { view_research_data: true, use_ask: role !== "public_guest", manage_research_profile: role !== "public_guest", view_operations: false, submit_collection: false, view_faculty_profile: false },
  session: { member_sign_in_available: true, email_sign_in_available: true, email_signup_available: true },
});

test("guest can create an account, request another link and accept an invitation without storing the code", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access()));
  const requests = [];
  await page.route("**/library/desk/email/request", (route) => {
    requests.push(route.request().postDataJSON());
    return fulfill(route, { ok: true, message: "If this address can use the requested account option, a sign-in link will arrive shortly. Check your inbox and spam folder." });
  });
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByTestId("member-sign-in").click();
  const form = page.getByRole("form", { name: "Email account access" });
  await expect(form).toBeVisible();
  await form.getByLabel("Account option").selectOption("signup");
  await form.getByLabel("Account email").fill("alice@example.test");
  await form.getByLabel("Your name").fill("Alice");
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(form.getByRole("status")).toContainText("Check your inbox");
  expect(requests[0]).toEqual({ email: "alice@example.test", purpose: "signup", display_name: "Alice" });
  await form.getByRole("button", { name: "Request another link" }).click();
  await expect.poll(() => requests.length).toBe(2);
  await form.getByLabel("Account option").selectOption("invite");
  await form.getByLabel("Invitation or existing access code").fill("synthetic-invitation");
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(form.getByLabel("Invitation or existing access code")).toHaveValue("");
  expect(requests[2]).toEqual({ email: "alice@example.test", purpose: "invite", invitation: "synthetic-invitation" });
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain("synthetic-invitation");
  await page.screenshot({ path: test.info().outputPath("guest-email-access.png"), fullPage: true });
});

test("email callback shows its account, removes the fragment and requires explicit confirmation before activation", async ({ page }) => {
  await mockV2Api(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const token = "a".repeat(43);
  let signedIn = false, consumes = 0;
  const urls = [];
  page.on("request", (request) => urls.push(request.url()));
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, signedIn ? access("stable-alice", "public_member") : access()));
  await page.route("**/library/desk/email/inspect", (route) => fulfill(route, { email: "alice@example.test", purpose: "signup" }));
  await page.route("**/library/desk/email/consume", (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    signedIn = true; consumes += 1;
    return fulfill(route, { ok: true });
  });
  await page.route("**/library/profile", (route) => fulfill(route, { configured: false, principal: access("stable-alice", "public_member").principal, profile: {} }));
  await page.goto(`/#desk-email=${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("alice@example.test", { exact: true })).toBeVisible();
  expect(page.url()).not.toContain(token);
  expect(consumes).toBe(0);
  await page.screenshot({ path: test.info().outputPath("email-link-confirmation.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue to Research Drive", exact: true }).click();
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Welcome, stable-alice", exact: true })).toBeVisible();
  expect(consumes).toBe(1);
  expect(urls.some((url) => url.includes(token))).toBe(false);
  expect(errors).toEqual([]);
});

test("expired email link does not activate an account and returns to sign in", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access()));
  let consumes = 0;
  await page.route("**/library/desk/email/inspect", (route) => fulfill(route, { message: "This link is invalid or expired. Request a new link." }, 400));
  await page.route("**/library/desk/email/consume", (route) => { consumes += 1; return fulfill(route, {}, 400); });
  await page.goto(`/#desk-email=${"b".repeat(43)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await expect(page.getByRole("button", { name: "Continue to Research Drive", exact: true })).toBeDisabled();
  expect(consumes).toBe(0);
  await page.getByRole("button", { name: "Return to sign in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Email account access" })).toBeVisible();
});

test("verified researcher can request recovery without account administration", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("alice", "public_member")));
  let requested = null;
  await page.route("**/library/desk/email/request", (route) => { requested = route.request().postDataJSON(); return fulfill(route, { ok: true, message: "Check your inbox." }); });
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByText("Verify email, sign in again or recover access", { exact: true }).click();
  const form = page.getByRole("form", { name: "Email account access" });
  await form.getByLabel("Account option").selectOption("recover");
  await form.getByLabel("Account email").fill("alice@example.test");
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(form.getByRole("status")).toContainText("Check your inbox");
  expect(requested).toEqual({ email: "alice@example.test", purpose: "recover" });
  await expect(page.getByRole("button", { name: "Issue invitation", exact: true })).toHaveCount(0);
});


test("email service failure remains actionable without claiming a link was sent", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access()));
  await page.route("**/library/desk/email/request", (route) => fulfill(route, { message: "Email account access is temporarily unavailable. Try again shortly." }, 503));
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const form = page.getByRole("form", { name: "Email account access" });
  await form.getByLabel("Account option").selectOption("signup");
  await expect(form).toContainText("visible to you and desk operators");
  await form.getByLabel("Account email").fill("alice@example.test");
  await form.getByLabel("Your name").fill("Alice");
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(form.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(form.getByRole("status")).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
});

test("a link invalidated after inspection cannot complete or change the browser account", async ({ page }) => {
  await mockV2Api(page);
  let consumes = 0;
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access()));
  await page.route("**/library/desk/email/inspect", (route) => fulfill(route, { email: "alice@example.test", purpose: "signup" }));
  await page.route("**/library/desk/email/consume", (route) => { consumes += 1; return fulfill(route, { message: "This link is invalid or expired. Request a new link." }, 400); });
  await page.goto(`/#desk-email=${"c".repeat(43)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("alice@example.test", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Research Drive", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await expect(page.getByRole("button", { name: "Continue to Research Drive", exact: true })).toBeDisabled();
  expect(consumes).toBe(1);
  await page.getByRole("button", { name: "Return to sign in", exact: true }).click();
  await expect(page.getByText("Guest browsing", { exact: true })).toBeVisible();
});


test("email confirmation fits a phone viewport and is usable from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockV2Api(page);
  await page.route("**/library/desk/email/inspect", (route) => fulfill(route, { email: "alice@example.test", purpose: "signup" }));
  await page.goto(`/#desk-email=${"d".repeat(43)}`, { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: "Continue to Research Drive", exact: true });
  await expect(button).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  const box = await button.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("email-confirmation-phone.png"), fullPage: true });
});
