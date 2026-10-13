import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

function access(id, role = "public_member") {
  const member = role === "member" || role === "operator";
  return { version: 2, authenticated: true, access: role,
    principal: { id, display_name: id, email: `${id}@example.test`, role },
    permissions: { view_research_data: true, use_ask: role !== "public_guest", manage_research_profile: role !== "public_guest", view_faculty_profile: member, submit_collection: member, view_operations: role === "operator", approve_jobs: role === "operator" },
    session: { member_sign_in_available: true, member_access_code_available: true, member_sign_in_mode: "invite_code" },
    assistant_runtime: { status: "ready", verified: true, configured: true },
  };
}
const fulfill = (route, doc, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(doc) });
const usage = { hourly_remaining: 59, daily_remaining: 239, running_requests: 0, limits: { hourly_requests: 60, daily_requests: 240 } };

test("operator issues an individual invitation and can review access changes", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("operator-fixture", "operator")));
  let accounts = [];
  const mutations = [];
  await page.route("**/library/admin/accounts", (route) => {
    if (route.request().method() === "GET") return fulfill(route, { configured: true, accounts });
    const payload = route.request().postDataJSON(); mutations.push(payload);
    const account = { id: payload.id, display_name: payload.display_name || "New researcher", role: payload.role || "public_member", enabled: payload.enabled ?? true };
    accounts = [account];
    return fulfill(route, { account, access_code: payload.action === "create" ? "synthetic-invitation-only" : undefined });
  });
  await page.route("**/library/account/usage", (route) => fulfill(route, usage));
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByLabel("Account ID", { exact: true }).fill("new-researcher");
  await page.getByLabel("Display name", { exact: true }).fill("New researcher");
  await page.getByRole("button", { name: "Issue invitation", exact: true }).click();
  await expect(page.getByLabel("Member access code", { exact: true })).toHaveValue("synthetic-invitation-only");
  expect(mutations[0].role).toBe("public_member");
  await page.getByRole("button", { name: "I’ve saved the invitation", exact: true }).click();
  await expect(page.getByLabel("Member access code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Disable access", exact: true }).click();
  expect(mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm change", exact: true }).click();
  await expect(page.getByRole("list", { name: "Desk accounts" })).toContainText("Disabled");
  expect(mutations[1]).toEqual({ action: "update", id: "new-researcher", enabled: false });
  await page.screenshot({ path: test.info().outputPath("account-administration.png"), fullPage: true });
});

test("new researcher gets personal onboarding and no operator account controls", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("new-researcher")));
  await page.route("**/library/profile", (route) => fulfill(route, { configured: false, principal: access("new-researcher").principal, profile: {}, memory: { memories: [], settings: {} } }));
  await page.route("**/library/account/usage", (route) => fulfill(route, usage));
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Welcome, new-researcher" })).toBeVisible();
  await page.getByRole("button", { name: "Set up my research context", exact: true }).click();
  await expect(page.getByTestId("personal-research-profile")).toContainText("new-researcher");
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Issue invitation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Shared assistant allowance", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("researcher-account.png"), fullPage: true });
});

test("sign-out returns to guest browsing and removes member actions", async ({ page }) => {
  await mockV2Api(page);
  let actor = access("signed-in-researcher");
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, actor));
  await page.route("**/library/profile", (route) => fulfill(route, { configured: true, principal: actor.principal, profile: {} }));
  await page.route("**/library/account/usage", (route) => fulfill(route, usage));
  await page.route("**/library/desk/session", (route) => {
    if (route.request().postDataJSON()?.action === "clear") actor = access("guest-fixture", "public_guest");
    return fulfill(route, { ok: true, authorized: true, cleared: true });
  });
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("button", { name: "Sign out of this browser", exact: true }).click();
  await expect(page.getByText("Guest browsing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out of this browser", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Shared assistant allowance", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true, level: 1 })).toBeVisible();
});

test("account change in another tab removes the prior researcher's visible conversation", async ({ page, context }) => {
  await mockV2Api(page);
  let actor = access("alice");
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, actor));
  await page.route("**/library/profile", (route) => fulfill(route, { configured: true, principal: actor.principal, profile: {} }));
  await page.route("**/api/library/chat/stream", (route) => fulfill(route, { session_id: "alice-session", reply: "Alice private research answer", action: "answer" }));
  await page.route("**/api/library/chat", (route) => fulfill(route, { session_id: "alice-session", reply: "Alice private research answer", action: "answer" }));
  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("tab", { name: /^Ask/ }).click();
  await page.getByTestId("ask-composer").fill("Alice private question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("ask-messages")).toContainText("Alice private research answer");
  const other = await context.newPage();
  await other.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  actor = access("bob");
  await page.evaluate(() => history.replaceState(null, "", "/?tab=home&q=alice-private-question&thread_id=alice-thread"));
  await other.evaluate(() => localStorage.setItem("rd_desk_identity_changed", `${Date.now()}:bob`));
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Account destinations" })).toContainText("bob");
  await expect(page.getByText("Alice private research answer", { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  expect(new URL(page.url()).searchParams.has("thread_id")).toBe(false);
  const pointers = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("chat_session:user:")));
  expect(pointers.some((key) => key.includes("alice"))).toBe(true);
  expect(pointers.some((key) => key.includes("bob"))).toBe(false);
  await other.close();
});


test("operator sees delivery failures and must reauthenticate before issuing an invitation", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", (route) => fulfill(route, access("operator-fixture", "operator")));
  await page.route("**/library/account/usage", (route) => fulfill(route, usage));
  let created = 0;
  await page.route("**/library/admin/accounts", (route) => {
    if (route.request().method() === "POST") {
      created += 1;
      return fulfill(route, { message: "Sign in again before changing accounts." }, 403);
    }
    return fulfill(route, { configured: true, accounts: [], invalid_account_count: 1,
      mail: { configured: true, available: true, accepted_last_24h: 2, failed_last_24h: 1,
        last_send: { accepted: false, category: "provider_rejected", http_status: 403 } } });
  });
  await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await expect(page.getByText(/Latest send failed: provider_rejected/)).toBeVisible();
  await expect(page.getByText(/account entries failed validation/)).toBeVisible();
  await page.getByLabel("Account ID", { exact: true }).fill("new-researcher");
  await page.getByLabel("Display name", { exact: true }).fill("New researcher");
  await page.getByRole("button", { name: "Issue invitation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sign in again" })).toBeVisible();
  await expect(page.getByLabel("Member access code", { exact: true })).toHaveCount(0);
  expect(created).toBe(1);
  await page.screenshot({ path: test.info().outputPath("account-mail-status.png"), fullPage: true });
});
