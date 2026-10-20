#!/usr/bin/env node
/** Opt-in live proof of the reviewed evidence → measured facts transition. */

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = String(process.env.YZU_DESK_URL || "http://100.127.141.44:8765").replace(/\/$/, "");
const threadNeedle = String(process.env.YZU_SYNTHESIS_THREAD || "JKSE PIT");
const requestedIds = String(
  process.env.YZU_SYNTHESIS_INPUTS
    || "jkse_pit_idn_microstructure_revisions,idn_fry_daily_cross_section",
).split(",").map((value) => value.trim()).filter(Boolean);
const outDir = process.env.YZU_AUDIT_OUT
  || path.join(os.tmpdir(), `research-drive-synthesis-live-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const report = {
  base_url: baseUrl,
  thread_needle: threadNeedle,
  requested_inputs: requestedIds,
  output_dir: outDir,
  console_errors: [],
  page_errors: [],
  request_failures: [],
};

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => {
  if (message.type() === "error") report.console_errors.push(message.text());
});
page.on("pageerror", (error) => report.page_errors.push(String(error?.stack || error)));
page.on("requestfailed", (request) => report.request_failures.push({
  url: request.url(),
  method: request.method(),
  error: request.failure()?.errorText || "request failed",
}));

async function browserJson(url, options = {}) {
  return page.evaluate(async ({ requestUrl, requestOptions }) => {
    const response = await fetch(requestUrl, { credentials: "same-origin", ...requestOptions });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { requestUrl: url, requestOptions: options });
}

async function shot(name, locator = null) {
  if (locator) await locator.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

try {
  await page.goto(`${baseUrl}/healthz`, { waitUntil: "load", timeout: 30_000 });
  report.session = await browserJson("/library/desk/session", { method: "POST" });
  if (report.session.status !== 200) throw new Error(`desk session bootstrap returned ${report.session.status}`);

  const listed = await browserJson("/library/synthesis/threads?limit=30");
  const threads = Array.isArray(listed.body?.threads) ? listed.body.threads : [];
  const thread = threads.find((item) => String(item?.title || "").includes(threadNeedle));
  if (!thread?.id) throw new Error(`no Synthesis thread matched ${threadNeedle}`);
  report.thread = { id: thread.id, title: thread.title };

  const before = await browserJson(`/library/synthesis/threads/${encodeURIComponent(thread.id)}`);
  const beforeNodes = Array.isArray(before.body?.state?.nodes) ? before.body.state.nodes : [];
  report.before = { mapped_inputs: beforeNodes.map((node) => node?.dataset_id).filter(Boolean) };

  await page.goto(`${baseUrl}/?tab=synthesis`, { waitUntil: "load", timeout: 30_000 });
  await page.locator("[data-testid='synthesis-studio']").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("synthesis-thread-item").filter({ hasText: thread.title }).click();

  const missingIds = requestedIds.filter((id) => !report.before.mapped_inputs.includes(id));
  if (missingIds.length) {
    const proposed = await browserJson(`/library/synthesis/threads/${encodeURIComponent(thread.id)}/evidence-map`);
    const proposalNodes = Array.isArray(proposed.body?.nodes) ? proposed.body.nodes : [];
    const missingProposal = missingIds.filter(
      (id) => !proposalNodes.some((node) => String(node?.dataset_id || node?.id || "") === id),
    );
    if (missingProposal.length) throw new Error(`requested inputs absent from proposal: ${missingProposal.join(", ")}`);

    const next = page.getByLabel("What happens next");
    await next.getByRole("button", { name: "Find held evidence" }).click();
    const proposal = page.getByTestId("synthesis-evidence-proposal");
    await proposal.waitFor({ state: "visible", timeout: 30_000 });
    for (const id of missingIds) {
      const node = proposalNodes.find((item) => String(item?.dataset_id || item?.id || "") === id);
      await proposal.getByRole("checkbox", { name: String(node?.label || id) }).check();
    }
    await proposal.getByRole("button", { name: `Add ${missingIds.length} selected input${missingIds.length === 1 ? "" : "s"}` }).click();
  }

  const status = page.getByTestId("synthesis-measurement-status");
  await status.getByText(/mapped inputs? measured from held bytes/i).waitFor({ state: "visible", timeout: 60_000 });
  const measured = await browserJson(`/library/synthesis/threads/${encodeURIComponent(thread.id)}/measurements`);
  report.measurements = {
    status: measured.status,
    writes: measured.body?.writes,
    basis: measured.body?.measurement_basis,
    inputs: measured.body?.input_dataset_ids || [],
    measured_inputs: measured.body?.measured_inputs,
    columns: Array.isArray(measured.body?.column_profiles) ? measured.body.column_profiles.length : 0,
    flagged_columns: Array.isArray(measured.body?.column_profiles)
      ? measured.body.column_profiles.filter((row) => Array.isArray(row?.flags) && row.flags.length).length
      : 0,
    joins: Array.isArray(measured.body?.join_candidates) ? measured.body.join_candidates.length : 0,
    unmeasured: measured.body?.unmeasured || [],
  };

  await shot("01-desktop-measurement-status", status);
  const method = page.getByTestId("synthesis-method-surface");
  await method.waitFor({ state: "visible", timeout: 30_000 });
  await shot("02-desktop-measured-columns", method);

  await page.setViewportSize({ width: 390, height: 844 });
  await shot("03-mobile-measurement-status", status);
  await shot("04-mobile-measured-columns", method);
  report.horizontal_overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  report.ok = measured.status === 200
    && measured.body?.writes === false
    && measured.body?.measurement_basis === "mapped_evidence"
    && report.measurements.columns > 0
    && !report.horizontal_overflow
    && !report.console_errors.length
    && !report.page_errors.length
    && !report.request_failures.length;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack || error);
} finally {
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
