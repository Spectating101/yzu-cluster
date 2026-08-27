import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { MOCK_HEALTH, mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const VIEWPORTS = [
  { name: "desktop-wide", width: 1920, height: 905 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1180, height: 820 },
  { name: "compact", width: 900, height: 760 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const PROFILE = {
  found: true,
  profile: {
    name_en: "Kong, De-Rong",
    title: "Assistant Professor",
    discipline: "Finance",
    email: "drkong@saturn.yzu.edu.tw",
    paper_count_parsed: 18,
    specialties: ["empirical asset pricing", "investment", "FinTech", "corporate finance"],
    domain_tags: ["asia_pacific", "corporate_finance", "equities", "fintech", "machine_learning", "nft", "on_chain", "taiwan_market"],
    research_tracks: [
      { id: "token", title: "Token taxonomy — on-chain and off-chain data", phase: "active_grant", weight: 10 },
      { id: "momentum", title: "Taiwan equity momentum with machine learning", weight: 7 },
    ],
    method_tags: ["machine_learning", "panel_data"],
    publication_highlights: [
      "Kong, D.-R. (2021). Alternative investments in the FinTech era.",
      "Bui et al. (2023). Momentum in machine learning: Evidence from the Taiwan stock market.",
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

const PROPOSAL_THREAD = {
  id: "thread-home-proposal",
  created_at: "2026-08-27T12:00:00Z",
  updated_at: "2026-08-27T12:30:00Z",
  title: "Weekly trust panel",
  objective: "Aggregate held stablecoin evidence at weekly grain.",
  materialisation: "not_materialised",
  state: {
    title: "Weekly trust panel",
    objective: "Aggregate held stablecoin evidence at weekly grain.",
    required_grain: "asset × week",
    nodes: [
      {
        id: "held",
        dataset_id: "gdelt_asia_daily_country_panel",
        type: "source",
        layer: "evidence",
        label: "Held evidence",
        status: "held",
      },
    ],
    edges: [],
    proposal: {
      id: "proposal-home-v1",
      proposal_hash: "sha256:home-v1",
      title: "Aggregate weekly",
      summary: "Aggregate the exact held evidence by week.",
      execution_preflight: { ok: true },
      operations: [],
      execution_spec: {
        input_dataset_id: "gdelt_asia_daily_country_panel",
        output_dataset_id: "weekly_trust_panel",
        group_by: ["week"],
      },
    },
    execution_spec: null,
    execution: null,
  },
};

const SURFACES = [
  { tab: "home", label: "Home", ready: "[data-testid='home-continue']" },
  { tab: "profile", label: "Profile", ready: ".rd-v2-profile-identity" },
  { tab: "settings", label: "Settings", ready: ".rd-v2-settings-statement" },
];

function queryFor(tab) {
  return tab === "home" ? "/" : `/?tab=${tab}`;
}

function noPendingHealth() {
  return {
    ...MOCK_HEALTH,
    desk: {
      ...MOCK_HEALTH.desk,
      jobs: {
        ...(MOCK_HEALTH.desk?.jobs || {}),
        pending_approval: 0,
        running: 0,
      },
    },
  };
}

async function installSynthesisThreads(page, threads = [PROPOSAL_THREAD]) {
  const byId = new Map(threads.map((thread) => [thread.id, structuredClone(thread)]));
  await page.route("**/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("threads");
    const id = parts[index + 1] || "";
    const suffix = parts.slice(index + 2).join("/");
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (!id && route.request().method() === "GET") {
      return respond({ threads: [...byId.values()], total: byId.size });
    }
    const thread = byId.get(id);
    if (!thread) return respond({ error: "not found" }, 404);
    if (!suffix) return respond(thread);
    if (suffix === "measurements") {
      return respond({ thread_id: id, writes: false, measured_inputs: 0, input_dataset_ids: [], unmeasured: [], column_profiles: [] });
    }
    if (suffix === "evidence-map") {
      return respond({ thread_id: id, nodes: [], reason: "No additional held evidence proposed", review_required: true, writes: false });
    }
    if (suffix === "discover-handoff") {
      return respond({ thread_id: id, missing_evidence: [], collect_intents: [] });
    }
    if (suffix === "materialisation") {
      return respond({ thread_id: id, status: "not_materialised" });
    }
    return respond({});
  });
}

function geometrySample({ tab, width, height }) {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
    };
  };
  const style = (selector, prop) => {
    const node = document.querySelector(selector);
    return node ? getComputedStyle(node)[prop] : null;
  };
  return {
    tab,
    viewport: { width, height },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
    shell: box(".rd-v2-shell"),
    main: box("main.yzu-main"),
    rail: box("aside.rd-v2-rail"),
    page: box(".rd-v2-page"),
    pageHead: box(".rd-v2-page-head"),
    body: box(".rd-v2-body-scroll"),
    bodyScrollHeight: document.querySelector(".rd-v2-body-scroll")?.scrollHeight ?? null,
    bodyClientHeight: document.querySelector(".rd-v2-body-scroll")?.clientHeight ?? null,
    homeTopband: box(".rd-v2-home-topband"),
    homePickup: box(".rd-v2-home-pickup"),
    homeHeadroom: box(".rd-v2-home-headroom"),
    homeRecommended: box(".rd-v2-home-recommended"),
    homeTrail: box(".rd-v2-home-trail"),
    homeGrid: style(".rd-v2-home-topband", "gridTemplateColumns"),
    profileIdentity: box(".rd-v2-profile-identity"),
    profileMemory: box(".rd-v2-profile-memory-layout"),
    profileLab: box(".rd-v2-profile-lab-grid"),
    profileGrid: style(".rd-v2-profile-memory-layout", "gridTemplateColumns"),
    settingsSummary: box(".rd-v2-settings-summary"),
    settingsSection: box(".rd-v2-statement-section"),
    settingsGrid: style(".rd-v2-settings-summary", "gridTemplateColumns"),
  };
}

test.describe("HPS final visual certification", () => {
  test("renders rich HPS states cleanly across all supported target viewports", async ({ page }) => {
    await mockV2Api(page, { profileBody: PROFILE });
    await mkdir("artifacts/hps-final-visual", { recursive: true });
    const metrics = [];

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const surface of SURFACES) {
        await page.goto(queryFor(surface.tab), { waitUntil: "domcontentloaded" });
        await waitForShell(page);
        await expect(page.locator(surface.ready).first()).toBeVisible({ timeout: 20_000 });
        if (surface.tab === "profile") {
          await expect(page.locator(".rd-v2-profile-name")).toContainText("Kong", { timeout: 20_000 });
        }
        await page.waitForTimeout(120);

        const sample = await page.evaluate(geometrySample, { tab: surface.tab, width: viewport.width, height: viewport.height });
        metrics.push({ viewport: viewport.name, state: "rich", surface: surface.tab, ...sample });

        expect(sample.document.scrollWidth, `${surface.label} ${viewport.name}: horizontal viewport overflow`).toBeLessThanOrEqual(sample.document.clientWidth + 2);
        expect(sample.main?.width || 0, `${surface.label} ${viewport.name}: main workspace collapsed`).toBeGreaterThan(240);
        expect(sample.page?.width || 0, `${surface.label} ${viewport.name}: page collapsed`).toBeGreaterThan(220);

        if (surface.tab === "home") {
          const resume = page.getByTestId("home-continue");
          const action = resume.getByRole("button", { name: /Continue|Review/ }).first();
          const [cardBox, actionBox] = await Promise.all([resume.boundingBox(), action.boundingBox()]);
          expect(cardBox && actionBox, `${surface.label} ${viewport.name}: resume action missing`).toBeTruthy();
          expect(actionBox.x + actionBox.width, `${surface.label} ${viewport.name}: resume action spills right`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 2);
          expect(actionBox.y + actionBox.height, `${surface.label} ${viewport.name}: resume action spills bottom`).toBeLessThanOrEqual(cardBox.y + cardBox.height + 2);
          await expect(page.getByRole("region", { name: "Recommended evidence" })).toBeVisible();
        }

        if (surface.tab === "profile") {
          await expect(page.getByTestId("profile-memory")).toBeVisible();
          await expect(page.getByTestId("profile-works")).toBeVisible();
          await expect(page.getByTestId("profile-lab")).toBeVisible();
          const profileBox = await page.locator(".rd-v2-profile-identity").boundingBox();
          const bodyBox = await page.locator(".rd-v2-body-scroll").boundingBox();
          expect(profileBox && bodyBox, `${surface.label} ${viewport.name}: profile geometry missing`).toBeTruthy();
          expect(profileBox.x + profileBox.width, `${surface.label} ${viewport.name}: identity spills body`).toBeLessThanOrEqual(bodyBox.x + bodyBox.width + 2);
        }

        await page.screenshot({
          path: `artifacts/hps-final-visual/${surface.tab}-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
          animations: "disabled",
        });

        if (surface.tab === "settings") {
          const advanced = page.locator("details.rd-v2-settings-advanced").filter({ hasText: "System status and technical details" }).first();
          await expect(advanced).toBeVisible();
          await expect(advanced).not.toHaveAttribute("open", "");
          await advanced.locator("summary").click();
          await expect(advanced).toHaveAttribute("open", "");
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `${surface.label} ${viewport.name}: advanced details create horizontal overflow`).toBeLessThanOrEqual(2);
          await page.screenshot({
            path: `artifacts/hps-final-visual/settings-advanced-${viewport.name}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
            animations: "disabled",
          });
        }
      }
    }

    await writeFile("artifacts/hps-final-visual/metrics.json", JSON.stringify(metrics, null, 2));
  });

  test("Synthesis resume remains visually contained as Home primary at every target viewport", async ({ page }) => {
    await mockV2Api(page, {
      profileBody: PROFILE,
      jobsBody: { jobs: [] },
      healthBody: noPendingHealth(),
    });
    await installSynthesisThreads(page);
    await mkdir("artifacts/hps-final-visual", { recursive: true });
    const metrics = [];

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/?tab=home", { waitUntil: "domcontentloaded" });
      await waitForShell(page);

      const resume = page.getByTestId("home-continue");
      await expect(resume).toHaveAttribute("data-kind", "synthesis_thread");
      await expect(resume).toContainText("Weekly trust panel");
      await expect(resume).toContainText(/Proposal review/i);
      const action = resume.getByRole("button", { name: "Continue" });
      const [cardBox, actionBox] = await Promise.all([resume.boundingBox(), action.boundingBox()]);
      expect(cardBox && actionBox, `Synthesis Home ${viewport.name}: resume action missing`).toBeTruthy();
      expect(actionBox.x + actionBox.width, `Synthesis Home ${viewport.name}: resume action spills right`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 2);
      expect(actionBox.y + actionBox.height, `Synthesis Home ${viewport.name}: resume action spills bottom`).toBeLessThanOrEqual(cardBox.y + cardBox.height + 2);

      const sample = await page.evaluate(geometrySample, { tab: "home", width: viewport.width, height: viewport.height });
      expect(sample.document.scrollWidth, `Synthesis Home ${viewport.name}: horizontal viewport overflow`).toBeLessThanOrEqual(sample.document.clientWidth + 2);
      metrics.push({ viewport: viewport.name, state: "synthesis-resume", surface: "home", ...sample });

      await page.screenshot({
        path: `artifacts/hps-final-visual/home-synthesis-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }

    await writeFile("artifacts/hps-final-visual/synthesis-home-metrics.json", JSON.stringify(metrics, null, 2));
  });
});
