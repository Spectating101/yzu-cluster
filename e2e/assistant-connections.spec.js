import { expect, test } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const actor = { version: 2, authenticated: true, principal: { id: "alice", role: "public_member", display_name: "Alice" },
  permissions: { use_ask: true, view_research_data: true, manage_research_profile: true },
  session: { member_sign_in_available: true, member_access_code_available: true } };
const expiry = Math.floor(Date.now() / 1000) + 86400;

test("personal secrets are shown once; revocation and assistant disconnect require confirmation", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", route => fulfill(route, actor));
  const document = { configured: true, oauth_enabled: true, resource: "https://drive.example/mcp", tokens: [],
    connections: [{ id: "grant1", label: "Research client", active: true, scopes: ["catalog:read"], expires_at: expiry }] };
  const mutations = [];
  await page.route("**/library/account/tokens", route => {
    if (route.request().method() === "GET") return fulfill(route, document);
    const payload = route.request().postDataJSON(); mutations.push(payload);
    if (payload.action === "create") {
      document.tokens.push({ id: "pat1", label: payload.label, scopes: payload.scopes, active: true, expires_at: expiry });
      return fulfill(route, { id: "pat1", token: "fixture-secret-shown-once" });
    }
    const row = (payload.action === "revoke" ? document.tokens : document.connections).find(item => item.id === payload.id);
    row.active = false;
    return fulfill(route, { revoked: true });
  });
  await page.goto("/?tab=settings"); await waitForShell(page);
  const form = page.getByRole("form", { name: "Create personal token" });
  await form.getByLabel("Client label").fill("My client");
  await form.getByRole("button", { name: "Create personal token", exact: true }).click();
  expect(mutations[0].scopes).toEqual(["catalog:read"]);
  await expect(page.getByLabel("Personal token", { exact: true })).toHaveValue("fixture-secret-shown-once");
  await page.getByRole("button", { name: "I’ve saved the token" }).click();
  await expect(page.getByLabel("Personal token", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke token", exact: true }).click();
  await page.getByRole("group", { name: "Confirm disconnect" }).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Revoke token", exact: true }).click();
  await page.getByRole("button", { name: "Confirm disconnect", exact: true }).click();
  await expect(page.getByRole("list", { name: "Personal tokens", exact: true })).toContainText("Revoked or expired");
  await page.getByRole("list", { name: "Connected assistants" }).getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Confirm disconnect", exact: true }).click();
  await expect(page.getByRole("list", { name: "Connected assistants" })).toContainText("Disconnected or expired");
  expect(mutations.slice(1)).toEqual([{ action: "revoke", id: "pat1" }, { action: "revoke_connection", id: "grant1" }]);
});

test("stale authentication offers sign-in again and does not display a token", async ({ page }) => {
  await mockV2Api(page);
  await page.route("**/library/desk/capabilities", route => fulfill(route, actor));
  await page.route("**/library/account/tokens", route => route.request().method() === "POST"
    ? fulfill(route, { error: "reauthentication_required", message: "Sign in again before changing account access or personal tokens." }, 403)
    : fulfill(route, { configured: true, oauth_enabled: true, resource: "https://drive.example/mcp", tokens: [], connections: [] }));
  await page.goto("/?tab=settings"); await waitForShell(page);
  await page.getByRole("form", { name: "Create personal token" }).getByLabel("Client label").fill("My client");
  await page.getByRole("button", { name: "Create personal token", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in again", exact: true })).toBeVisible();
  await expect(page.getByLabel("Personal token", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in again", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Research Drive", exact: true })).toBeVisible();
});

for (const role of ["member", "operator"]) {
  test(`${role} can reauthenticate without signing out or losing the pending connector`, async ({ page }) => {
    await mockV2Api(page);
    await page.route("**/library/desk/capabilities", route => fulfill(route, { ...actor, principal: { ...actor.principal, role } }));
    await page.goto(`/?tab=settings&access=signin&connect_request=${"a".repeat(43)}`);
    await waitForShell(page);
    await expect(page.getByRole("dialog", { name: "Sign in to Research Drive", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Invitation code", exact: true })).toBeVisible();
  });
}
