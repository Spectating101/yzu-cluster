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
  let acquisitionLedgerRequests = 0;
  await mockV2Api(page);
  await page.unroute("**/yzu/acquisitions*").catch(() => {});
  await page.route("**/yzu/acquisitions*", (route) => {
    acquisitionLedgerRequests += 1;
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Forbidden" }),
    });
  });
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
  await expect.poll(() => acquisitionLedgerRequests).toBe(0);
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

test("opening Ask primes and reuses the exact research-context session", async ({ page }) => {
  const warms = [];
  const chats = [];
  await mockV2Api(page);
  await page.unroute("**/library/desk/warm").catch(() => {});
  await page.route("**/library/desk/warm", async (route) => {
    warms.push(route.request().postDataJSON?.() || {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ primed: true, session_id: "warm-home-context" }),
    });
  });
  await page.unroute("**/api/library/chat").catch(() => {});
  await page.unroute("**/api/library/chat/stream").catch(() => {});
  const captureChat = async (route) => {
    const body = route.request().postDataJSON?.() || {};
    chats.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session_id: body.session_id, reply: "Grounded answer", action: "answer" }),
    });
  };
  await page.route("**/api/library/chat", captureChat);
  await page.route("**/api/library/chat/stream", captureChat);

  await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.waitForTimeout(450);
  expect(warms).toEqual([]);

  await page.getByRole("tab", { name: /^Ask/ }).click();
  await page.waitForTimeout(450);
  expect(warms).toEqual([]);
  await page.getByTestId("ask-composer").click();
  await expect.poll(() => warms.length).toBe(1);
  await page.getByTestId("ask-composer").fill("Which evidence can I use?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("ask-messages")).toContainText("Grounded answer");

  expect(warms).toHaveLength(1);
  expect(warms[0].background).toBe(false);
  expect(chats).toHaveLength(1);
  expect(chats[0].session_id).toBe("warm-home-context");
});
