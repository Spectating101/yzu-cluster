/**
 * Profile freeze — Understanding + Memory→Works→Lab, research context on Profile,
 * Settings absent from primary nav.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/status/generated/profile-settings-visual");

const PROFILE = {
  found: true,
  profile: {
    name_en: "Kong, De-Rong",
    title: "Assistant Professor",
    discipline: "Finance",
    email: "drkong@saturn.yzu.edu.tw",
    paper_count_parsed: 18,
    specialties: ["empirical asset pricing", "investment", "FinTech", "corporate finance"],
    research_tracks: [
      { id: "token", title: "Token taxonomy — on-chain and off-chain data", phase: "active_grant", weight: 10 },
      { id: "momentum", title: "Taiwan equity momentum with machine learning", weight: 7 },
    ],
    method_tags: ["machine_learning", "panel_data"],
    publication_highlights: [
      "Kong, D.-R. (2021). Alternative investments in the FinTech era.",
      "Bui et al. (2023). Momentum in machine learning: Evidence from the Taiwan stock market.",
      "Kong (2022). NFT liquidity and market quality.",
    ],
    lab_fintech_stack: [
      { id: "coingecko", label: "CoinGecko prices", route: "vault" },
      { id: "stablecoin", label: "USDT on-chain flows", route: "bigquery" },
    ],
    procurement_recommendations: [
      { dataset: "TWSE daily prices", source_route: "vault", search_query: "TWSE daily prices" },
      { dataset: "MOPS financial statements", source_route: "mops", search_query: "MOPS financial statements" },
    ],
  },
};

test.describe("Profile freeze showcase", () => {
  test("bound Understanding Memory Works Lab and context control", async ({ page }) => {
    await mockV2Api(page, { profileBody: PROFILE });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("procure_user_email", "drkong@saturn.yzu.edu.tw");
      } catch {
        /* ignore */
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".rd-v2-profile-name")).toContainText(/Kong/i);
    await expect(page.locator(".yzu-sidebar nav").getByRole("button", { name: /^Settings$/i })).toHaveCount(0);

    const understanding = page.getByTestId("profile-understanding");
    const memory = page.getByTestId("profile-memory");
    const works = page.getByTestId("profile-works");
    const lab = page.getByTestId("profile-lab");
    await expect(understanding).toBeVisible();
    await expect(understanding.getByTestId("profile-understanding-synthesis")).toBeVisible();
    await expect(understanding.getByTestId("profile-understanding-threads")).toBeVisible();
    await expect(page.getByTestId("profile-memory-edit-focus")).toHaveCount(0);
    await expect(memory.getByTestId("profile-memory-statement")).toBeVisible();
    await expect(page.getByTestId("profile-manage-context")).toHaveCount(0);
    await expect(page.getByTestId("profile-research-context-toggle")).toBeVisible();
    await expect(works.locator(".rd-v2-profile-work-row")).toHaveCount(3);

    const understandingBox = await understanding.boundingBox();
    const memoryBox = await memory.boundingBox();
    const worksBox = await works.boundingBox();
    expect(understandingBox.y).toBeLessThan(memoryBox.y);
    expect(memoryBox.y).toBeLessThan(worksBox.y);

    const detail = page.getByTestId("profile-detail-rail");
    await expect(detail.getByText(/Derivation/i)).toBeVisible();
    await expect(page.getByTestId("profile-rail-provenance")).toBeVisible();
    await expect(page.getByTestId("profile-ask-about-context-rail")).toBeVisible();

    await works.locator(".rd-v2-profile-work-row").first().click();
    await expect(page.getByRole("button", { name: /Ask about this work/i })).toBeVisible();

    await page.screenshot({
      path: path.join(OUT, "bound_profile_desktop.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(OUT, "bound_profile_mobile.png"),
      fullPage: false,
    });
  });

  test("Profile context bind updates bound identity without Settings nav", async ({ page }) => {
    await mockV2Api(page, { profileBody: PROFILE });
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("procure_user_email");
        localStorage.setItem("rd_v2_settings", JSON.stringify({ defaultTab: "home", onSelect: "detail", email: "" }));
      } catch {
        /* ignore */
      }
    });
    await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await expect(page.getByTestId("profile-unbound-badge")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("profile-understanding")).toHaveCount(0);
    await expect(page.locator(".yzu-sidebar").getByRole("button", { name: /^Settings$/i })).toHaveCount(0);

    await page.getByTestId("profile-research-context-toggle").click();
    await page.getByTestId("profile-context-email").fill("drkong@saturn.yzu.edu.tw");
    await page.getByTestId("profile-context-save").click();
    await expect(page.locator(".rd-v2-profile-name")).toContainText(/Kong/i, { timeout: 15_000 });
    await expect(page.getByTestId("profile-bound-badge")).toBeVisible();
    await expect(page.getByTestId("profile-understanding")).toBeVisible();
  });
});
