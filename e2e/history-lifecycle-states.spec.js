import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

/**
 * Live data only ever produces a few history states, so failed, blocked,
 * pending_approval, paused and stopped were never seen rendered. Two defects
 * hid there: stopped read as an active schedule, and blocked was sent after an
 * execution failure when a licence gate had refused the collection.
 *
 * The shared v2 fixture establishes the same authorized desk boundary as the
 * rest of the browser contracts, while this fixture supplies the lifecycle rows.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/history-lifecycle.json"),
    "utf8",
  ),
);

const EXPECTED = [
  { status: "failed", label: "failed — needs recovery", next: /inspect the failure/i },
  { status: "blocked", label: "blocked — needs recovery", next: /access|licens/i },
  { status: "pending_approval", label: "approval required", next: /review the source/i },
  { status: "running", label: "collecting", next: null },
  { status: "queued", label: "queued", next: null },
  { status: "paused", label: "refresh paused", next: /resume/i },
  { status: "stopped", label: "refresh stopped", next: /start a new refresh/i },
];

async function openHistory(page) {
  await mockV2Api(page, { historyBody: FIXTURE });
  await page.goto("/?tab=discover", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("TWSE daily quotes", { exact: false }).first()).toBeVisible();
}

test.use({ viewport: { width: 1920, height: 961 } });
test.describe.configure({ mode: "serial" });

test("every lifecycle state renders its own label", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openHistory(page);
  const text = (
    await page.evaluate(() => (document.querySelector("main") || document.body).innerText || "")
  ).toLowerCase();
  const missing = EXPECTED.filter((s) => !text.includes(s.label)).map((s) => s.status);
  expect(missing, `states not rendered: ${missing.join(", ")}`).toEqual([]);
  expect(errors, "history threw while rendering lifecycle states").toEqual([]);
});

test("no state renders its raw status as the label", async ({ page }) => {
  await openHistory(page);
  const text = (
    await page.evaluate(() => (document.querySelector("main") || document.body).innerText || "")
  ).toLowerCase();
  for (const raw of ["pending_approval", "collection_run", "registered_not_queryable"]) {
    expect(text.includes(raw), `raw token "${raw}" leaked into the panel`).toBe(false);
  }
});

test("a blocked collection is not sent after an execution failure", async ({ page }) => {
  await openHistory(page);
  await page.getByText("CRSP monthly file", { exact: false }).first().click();
  await page.waitForTimeout(4000);
  const detail = await page.evaluate(() => document.body.innerText || "");
  expect(detail).toMatch(/access|licens/i);
  expect(detail).not.toMatch(/inspect the failure/i);
});

test("a failed run keeps the execution remedy", async ({ page }) => {
  await openHistory(page);
  await page.getByText("TWSE daily quotes", { exact: false }).first().click();
  await page.waitForTimeout(4000);
  const detail = await page.evaluate(() => document.body.innerText || "");
  expect(detail).toMatch(/inspect the failure/i);
});

test("an uncollected row never claims a query-ready holding", async ({ page }) => {
  await openHistory(page);
  for (const row of ["TWSE daily quotes", "Add Yahoo Finance daily prices"]) {
    await page.getByText(row, { exact: false }).first().click();
    await page.waitForTimeout(3500);
    const detail = await page.evaluate(() => document.body.innerText || "");
    const holding = (detail.match(/HOLDING TRUTH\s*\n?\s*([^\n]+)/i) || [])[1] || "";
    expect(holding.toLowerCase(), `${row} claimed: ${holding}`).not.toMatch(/query-ready/);
  }
});
