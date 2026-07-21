/**
 * Live bind contract at the 8767 preview.
 * Requires a reachable desk API + local front-door token.
 * Does not mock faculty profile — asserts real Kong context resolves.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE_BASE = process.env.YZU_LIVE_BIND_URL || "http://100.127.141.44:8767";
const TOKEN_FILE =
  process.env.YZU_DESK_TOKEN_FILE ||
  path.join(process.env.HOME || "", ".config/research-drive/front-door.desk-token");
const EMAIL = "drkong@saturn.yzu.edu.tw";

function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

test.describe("Live account bind @8767", () => {
  test.beforeEach(() => {
    test.skip(!process.env.YZU_LIVE_BIND, "Set YZU_LIVE_BIND=1 to run against the live 8767 preview");
    const token = readToken();
    test.skip(!token, `Missing desk token at ${TOKEN_FILE}`);
  });

  test("local email + desk token resolve Kong Research context", async ({ browser }) => {
    const token = readToken();
    const context = await browser.newContext({ baseURL: LIVE_BASE });
    const page = await context.newPage();

    const profileResponses = [];
    page.on("response", (res) => {
      if (res.url().includes("/library/faculty/profile")) {
        profileResponses.push({ status: res.status(), url: res.url() });
      }
    });

    await page.addInitScript(
      ({ email, deskToken }) => {
        try {
          localStorage.setItem("procure_user_email", email);
          localStorage.setItem(
            "rd_v2_settings",
            JSON.stringify({ defaultTab: "home", onSelect: "detail", email }),
          );
          sessionStorage.setItem("desk_access_token", deskToken);
        } catch {
          /* ignore */
        }
      },
      { email: EMAIL, deskToken: token },
    );

    await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
    await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });

    // Wait for the real faculty profile request to succeed (not mocked).
    await expect
      .poll(
        () => profileResponses.some((r) => r.status === 200),
        { timeout: 20_000 },
      )
      .toBeTruthy();

    const cluster = page.getByTestId("sidebar-account-menu");
    await expect(cluster).toBeVisible({ timeout: 15_000 });
    await expect(cluster).toContainText(/Kong/i);
    await expect(cluster).toContainText(/Bound on this browser/i);
    await expect(cluster).not.toContainText(/^Unbound$/);

    await cluster.click();
    await page.getByTestId("account-menu-profile").click();

    const overlay = page.getByTestId("research-context-overlay");
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay.getByRole("heading", { name: "Research context" })).toBeVisible();
    await expect(overlay.locator(".rd-v2-profile-name")).toContainText(/Kong,\s*De-Rong/i);
    await expect(overlay.getByTestId("profile-bound-badge")).toBeVisible();
    await expect(overlay.getByTestId("profile-understanding")).toBeVisible();
    await expect(overlay.getByTestId("profile-understanding-synthesis")).not.toBeEmpty();
    await expect(overlay.getByTestId("profile-unbound-badge")).toHaveCount(0);

    await context.close();
  });
});
