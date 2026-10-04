import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const providers = [{ id: "bps", label: "BPS Indonesia", source_id: "bps_dynamic_table", signup_url: "https://webapi.bps.go.id/developer/register", fields: { BPS_API_KEY: "API key" }, note: "Register your named BPS account." }];

async function setup(page) {
  await mockV2Api(page);
  await page.route("**/library/accounts", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ accounts: [], providers: [], storage_model: {} }) }));
  const rows = [];
  const calls = [];
  await page.route("**/library/provider-connections**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    calls.push({ path, body });
    let result;
    if (route.request().method() === "GET") result = { ok: true, providers, connections: rows, worker: "fixture-worker" };
    else if (path.endsWith("/prepare")) {
      rows.push({ id: "pc_fixture", provider: "bps", label: "BPS Indonesia", state: "prepared", signup_url: providers[0].signup_url, registration: body.registration, worker: "fixture-worker" });
      result = { ok: true, connection: rows[0] };
    } else if (path.endsWith("/confirm")) {
      rows[0].state = "verification_required";
      result = { ok: true, connection: rows[0] };
    } else if (path.endsWith("/credentials")) {
      rows[0].state = "unverified";
      result = { ok: true, connection: rows[0] };
    } else if (path.endsWith("/verify")) {
      rows[0].state = "connected";
      rows[0].verified_at = 1791060000;
      rows[0].verification = { rows: 1, usable_cells: 1, coverage: "complete" };
      result = { ok: true, connection: rows[0] };
    } else if (path.endsWith("/plan")) result = { ok: true, plan: { title: "BPS variable 145, 2023" } };
    else if (path.endsWith("/collect")) result = { ok: true, job: { id: "job-fixture", status: "pending_approval" } };
    else if (path.endsWith("/revoke")) { rows[0].state = "revoked"; result = { ok: true, connection: rows[0] }; }
    else result = { ok: false, code: "browser_unavailable", error: "The worker needs an interactive desktop." };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto("/?tab=settings");
  await waitForShell(page);
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("bps");
  return calls;
}

test("registration checkpoints, verified collection and revocation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const calls = await setup(page);
  await page.getByLabel("Registration email (optional)").fill("researcher@example.test");
  await page.getByLabel("Institution (optional)").fill("Test University");
  await page.getByRole("button", { name: "Set up connection", exact: true }).click();
  await expect(page.getByText("Review registration", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare collection", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm setup details" }).click();
  await expect(page.getByText("Verification required", { exact: true }).first()).toBeVisible();
  await page.getByLabel("API key", { exact: true }).fill("fixture-secret");
  await page.getByRole("button", { name: "Save credentials", exact: true }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Prepare collection", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Verify access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prepare collection", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Prepare collection", exact: true }).click();
  await expect(page.getByText("BPS variable 145, 2023", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit collection for approval", exact: true }).click();
  await expect(page.getByText("Collection submitted for approval. Track its progress in Library.")).toBeVisible();
  expect(calls.find(call => call.path.endsWith("/collect")).body.request).toMatchObject({ domain: "0000", variable_id: "145", start: "2023", end: "2023", max_rows: 10000 });
  expect(JSON.stringify(calls.find(call => call.path.endsWith("/collect")))).not.toContain("fixture-secret");
  await page.getByRole("button", { name: "Disconnect and erase credentials", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set up connection", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("browser failure remains actionable without marking the account connected", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Set up connection", exact: true }).click();
  await page.getByRole("button", { name: "Confirm setup details" }).click();
  await page.getByRole("button", { name: "Open managed browser", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "interactive desktop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare collection", exact: true })).toBeDisabled();
});

test("provider setup fits desktop and mobile", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Set up connection", exact: true }).click();
  await page.getByRole("button", { name: "Confirm setup details" }).click();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByText("Data provider accounts", { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const folder = process.env.RD_PROVIDER_EVIDENCE || "/tmp/rd-provider-evidence";
    await page.getByRole("button", { name: "Verify access", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${folder}/${viewport.width === 1440 ? "desktop" : "mobile"}.png`, fullPage: true });
  }
});
