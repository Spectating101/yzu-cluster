import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const outDir = "artifacts/synthesis-robustness";

const NODES = [
  {
    id: "returns",
    dataset_id: "returns",
    type: "source",
    layer: "evidence",
    label: "Long-form return decomposition panel",
    role: "Held input",
    status: "held",
    grain: "issuer-day",
    coverage: "2010–2026",
  },
  {
    id: "rates",
    dataset_id: "rates",
    type: "source",
    layer: "evidence",
    label: "Risk-free rate history",
    role: "Supporting input",
    status: "held",
    grain: "day",
    coverage: "2010–2026",
  },
];

const UNIT_CONFLICT = {
  left: {
    column: "issuer_adjusted_forward_excess_return_fractional_daily_measurement",
    typical: 0.00062,
  },
  right: {
    column: "published_risk_free_reference_rate_percentage_points_daily",
    typical: 0.0124,
  },
  outcomes: [
    {
      id: "rescale",
      label: "Rescale published reference rate ÷100 before subtraction",
      result: -0.000204,
      recommended: true,
    },
    {
      id: "asis",
      label: "Leave both recorded magnitudes unchanged",
      result: -0.02018,
    },
  ],
};

function openingThread() {
  return {
    id: "robust-opening",
    created_at: "2026-09-02T12:00:00Z",
    updated_at: "2026-09-02T12:00:00Z",
    title: "Cross-provider unit reconciliation",
    objective: "Reconcile return and reference-rate units before constructing an issuer-week research measure.",
    materialisation: "not_materialised",
    state: {
      title: "Cross-provider unit reconciliation",
      objective: "Reconcile return and reference-rate units before constructing an issuer-week research measure.",
      required_grain: "issuer × week",
      target_period: "2010–2026",
      intended_use: "Reusable empirical panel",
      maturity: "exploring",
      maturityLabel: "Evidence mapping",
      nodes: structuredClone(NODES),
      edges: [],
      proposal: null,
      execution_spec: null,
      execution: null,
      unit_conflict: structuredClone(UNIT_CONFLICT),
    },
  };
}

function buildingThread() {
  return {
    id: "robust-building",
    created_at: "2026-09-02T11:00:00Z",
    updated_at: "2026-09-02T12:30:00Z",
    title: "Issuer-week return panel",
    objective: "Build the accepted issuer-week excess-return panel from reviewed evidence.",
    materialisation: "planned",
    state: {
      title: "Issuer-week return panel",
      objective: "Build the accepted issuer-week excess-return panel from reviewed evidence.",
      required_grain: "issuer × week",
      maturity: "accepted",
      maturityLabel: "Accepted method",
      nodes: structuredClone(NODES),
      edges: [],
      proposal: null,
      execution_spec: {
        input_dataset_id: "returns",
        output_dataset_id: "issuer_week_excess_return",
        group_by: ["issuer_id", "week"],
        metrics: [{ function: "mean", column: "excess_return", as: "weekly_excess_return" }],
      },
      preview: {
        status: "succeeded",
        bounded: true,
        materialised: false,
        registered: false,
        rows: { preview_input: 5000, after_transforms: 4988, output: 312 },
      },
      execution: {
        status: "running",
        job_id: "robust-job",
        output_dataset_id: "issuer_week_excess_return",
      },
    },
  };
}

function measurementFor(thread) {
  return {
    thread_id: thread.id,
    writes: false,
    measurement_basis: "mapped_library_bytes",
    input_dataset_ids: NODES.map((row) => row.dataset_id),
    measured_inputs: 2,
    unmeasured: [],
    column_profiles: [
      {
        dataset_id: "returns",
        column: "issuer_adjusted_forward_excess_return_fractional_daily_measurement",
        kind: "measurement",
        rows: 2_500_000,
        blanks: 10_000,
        distinct: 2_300_000,
        flags: ["unit_twin"],
      },
      {
        dataset_id: "rates",
        column: "published_risk_free_reference_rate_percentage_points_daily",
        kind: "measurement",
        rows: 5_900,
        blanks: 0,
        distinct: 4_800,
        flags: ["unit_twin"],
      },
    ],
    unit_conflict: thread.state.unit_conflict || null,
  };
}

async function installThread(page, thread) {
  await mockV2Api(page);
  await page.route("**/api/library/synthesis/threads**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/measurements")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(measurementFor(thread)),
      });
    }
    if (url.pathname.endsWith("/discover-handoff")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread_id: thread.id, missing_evidence: [], collect_intents: [] }),
      });
    }
    const body = url.pathname.endsWith(`/${thread.id}`)
      ? thread
      : { threads: [thread], total: 1 };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function openThread(page, thread) {
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("synthesis-thread-item").filter({ hasText: thread.title }).click({ force: true });
  await expect(page.getByTestId("synthesis-home-state")).toHaveCount(0);
}

async function screenshot(page, name) {
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

async function expectStyledCard(locator) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      display: computed.display,
      borderTopWidth: computed.borderTopWidth,
      borderRadius: computed.borderRadius,
    };
  });
  expect(style.display).not.toBe("contents");
  expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThanOrEqual(1);
  expect(Number.parseFloat(style.borderRadius)).toBeGreaterThanOrEqual(6);
}

test("1440 opening Inspector is a structured decision ledger", async ({ page }) => {
  const thread = openingThread();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installThread(page, thread);
  await openThread(page, thread);

  const openingRail = page.getByTestId("synthesis-opening-rail");
  await expectStyledCard(openingRail.locator(".s04-rail-context"));
  await expectStyledCard(openingRail.locator(".s04-rail-gates"));
  await expectStyledCard(openingRail.locator(".s04-rail-evidence-ledger"));
  await expectStyledCard(openingRail.locator(".s04-rail-measurement"));
  await expect(openingRail.locator(".s04-rail-gates li").first()).toHaveCSS("display", "grid");
  await expect(openingRail.locator(".rd-v2-rail-fieldgrid")).toBeHidden();

  await screenshot(page, "opening-rail-1440");
});

test("1440 mature Inspector preserves authority proof hierarchy", async ({ page }) => {
  const thread = buildingThread();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installThread(page, thread);
  await openThread(page, thread);

  const proof = page.locator("aside.rd-v2-rail .s04-rail-proof");
  await expectStyledCard(proof);
  await expect(proof.locator("li")).toHaveCount(4);
  await expect(proof.locator("li").first()).toHaveCSS("display", "grid");
  await expect(proof).toContainText("Accepted revision");
  await expect(proof).toContainText("Passed for current revision");

  await screenshot(page, "authority-proof-1440");
});

test("1920 long unit labels cannot invade the Ask lane or clip their evidence context", async ({ page }) => {
  const thread = openingThread();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installThread(page, thread);
  await openThread(page, thread);

  const decision = page.getByTestId("synthesis-unit-conflict");
  const options = decision.locator(".s04-options");
  const ask = decision.locator(".s04-actions");
  await expect(options).toBeVisible();
  await expect(ask).toBeVisible();

  const geometry = await decision.evaluate((element) => {
    const option = element.querySelector(".s04-options");
    const askLane = element.querySelector(".s04-actions");
    const optionButtons = [...element.querySelectorAll(".s04-options .rd-v2-btn")];
    const optionRect = option?.getBoundingClientRect();
    const askRect = askLane?.getBoundingClientRect();
    const buttonRects = optionButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth,
      };
    });
    return {
      optionRight: optionRect?.right || 0,
      askLeft: askRect?.left || 0,
      buttonRects,
    };
  });

  expect(geometry.askLeft).toBeGreaterThan(geometry.optionRight);
  for (const rect of geometry.buttonRects) {
    expect(rect.right).toBeLessThanOrEqual(geometry.optionRight + 1);
    expect(rect.scrollWidth).toBeLessThanOrEqual(rect.clientWidth + 1);
    expect(rect.right).toBeLessThan(geometry.askLeft);
  }

  const evidenceSidecards = page.getByTestId("synthesis-evidence-state").locator(".s04-pairs article");
  if (await evidenceSidecards.count()) {
    const fit = await evidenceSidecards.evaluateAll((cards) => cards.every(
      (card) => card.scrollHeight <= card.clientHeight + 1 && card.scrollWidth <= card.clientWidth + 1,
    ));
    expect(fit).toBeTruthy();
  }

  await screenshot(page, "unit-long-labels-1920");
});
