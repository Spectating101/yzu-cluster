import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const providers = [
  {
    id: "google_drive",
    label: "Google Drive",
    configured: true,
    rclone_available: true,
    access_modes: ["index", "read", "write"],
    default_access_mode: "read",
    supports_index_only: true,
  },
  {
    id: "dropbox",
    label: "Dropbox",
    configured: true,
    rclone_available: true,
    access_modes: ["index", "read", "write"],
    default_access_mode: "read",
    supports_index_only: true,
  },
  {
    id: "onedrive",
    label: "OneDrive",
    configured: false,
    rclone_available: true,
    access_modes: ["index", "read", "write"],
    default_access_mode: "read",
    supports_index_only: false,
  },
];

function accountDocument(accounts) {
  return {
    version: 1,
    principal: {
      id: "researcher-1",
      email: "researcher@example.test",
      display_name: "Researcher One",
      role: "operator",
    },
    accounts,
    providers,
    storage_model: {
      mode: "federated",
      bytes_move_by_default: false,
      credentials_returned_to_browser: false,
      multiple_accounts_per_provider: true,
    },
  };
}

test.describe("Connected storage accounts", () => {
  test("Settings treats cloud accounts as principal-owned storage connections", async ({ page }) => {
    await mockV2Api(page);
    const accounts = [
      {
        id: "g-personal",
        provider: "google_drive",
        label: "Personal Drive",
        email: "personal@example.test",
        access_mode: "read",
        status: "connected",
        verified_at: "2026-08-29T01:00:00+00:00",
      },
      {
        id: "g-lab",
        provider: "google_drive",
        label: "Lab Drive",
        email: "lab@example.test",
        access_mode: "index",
        status: "connected",
        verified_at: null,
      },
    ];

    await page.route("**/library/accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(accountDocument(accounts)),
      }),
    );

    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    await expect(page.getByText("Connected storage", { exact: true })).toBeVisible();
    await expect(page.getByText("Researcher One", { exact: true })).toBeVisible();
    await expect(page.getByText("Personal Drive", { exact: true })).toBeVisible();
    await expect(page.getByText("Lab Drive", { exact: true })).toBeVisible();
    await expect(page.getByText(/Library indexing and materialisation remain separate/i)).toBeVisible();
    await expect(page.getByText(/Lab Drive · Metadata/i)).toBeVisible();

    const google = page.locator('[data-provider="google_drive"]');
    await expect(google).toContainText("2 connected");
    await expect(google.getByRole("option", { name: "Metadata only" })).toHaveCount(1);
    await expect(google.getByRole("button", { name: "Connect another" })).toBeEnabled();

    const oneDrive = page.locator('[data-provider="onedrive"]');
    await expect(oneDrive).toContainText("Server setup required");
    await expect(oneDrive.getByRole("button", { name: "Connect" })).toBeDisabled();

    await expect(page.getByText("Faculty email", { exact: true })).toBeVisible();
    await expect(page.getByText(/faculty identity below is a research record/i)).toBeVisible();
  });

  test("OAuth callback is completed server-side and scrubbed from the browser URL", async ({ page }) => {
    await mockV2Api(page);
    let completed = false;

    await page.route("**/library/accounts/oauth/complete", async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        provider: "google_drive",
        state: "state-123",
        code: "code-123",
      });
      completed = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          account: {
            id: "g-new",
            provider: "google_drive",
            label: "New Drive",
            email: "new@example.test",
            access_mode: "read",
            status: "connected",
          },
        }),
      });
    });

    await page.route("**/library/accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          accountDocument(
            completed
              ? [
                  {
                    id: "g-new",
                    provider: "google_drive",
                    label: "New Drive",
                    email: "new@example.test",
                    access_mode: "read",
                    status: "connected",
                  },
                ]
              : [],
          ),
        ),
      }),
    );

    await page.goto(
      "/?tab=settings&rd_storage_oauth=google_drive&code=code-123&state=state-123",
      { waitUntil: "domcontentloaded" },
    );
    await waitForShell(page);

    await expect(page.getByText("New Drive", { exact: true })).toBeVisible();
    await expect.poll(() => page.url()).not.toContain("code=code-123");
    await expect.poll(() => page.url()).not.toContain("state=state-123");
    await expect(page).toHaveURL(/\?tab=settings$/);
  });

  test("Verify and disconnect act on one exact connected account", async ({ page }) => {
    await mockV2Api(page);
    let current = [
      {
        id: "dropbox-work",
        provider: "dropbox",
        label: "Work Dropbox",
        email: "work@example.test",
        access_mode: "read",
        status: "connected",
        verified_at: null,
      },
    ];

    await page.route("**/library/accounts/dropbox-work/verify", (route) => {
      current = [{ ...current[0], verified_at: "2026-08-29T02:00:00+00:00" }];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, account: current[0] }),
      });
    });
    await page.route("**/library/accounts/dropbox-work/disconnect", (route) => {
      current = [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, disconnected: "dropbox-work" }),
      });
    });
    await page.route("**/library/accounts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(accountDocument(current)),
      }),
    );

    await page.goto("/?tab=settings", { waitUntil: "domcontentloaded" });
    await waitForShell(page);

    const account = page.getByTestId("connected-account-dropbox-work");
    await expect(account).toBeVisible();
    await account.getByRole("button", { name: "Verify" }).click();
    await expect(account).toContainText("Verified");

    await account.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByTestId("connected-account-dropbox-work")).toHaveCount(0);
    await expect(page.locator('[data-provider="dropbox"]')).toContainText("Ready to connect");
  });
});
