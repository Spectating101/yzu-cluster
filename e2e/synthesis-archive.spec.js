import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const FIXTURE = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/synthesis-execution.json"), "utf8"),
);

async function installArchiveMock(page) {
  const threads = new Map(FIXTURE.threads.map((thread) => [thread.id, { ...structuredClone(thread), archived_at: "" }]));
  const archiveCalls = [];
  await page.route("**/library/synthesis/threads**", (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts.lastIndexOf("threads");
    const threadId = parts[at + 1] || "";
    const suffix = parts.slice(at + 2).join("/");
    const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const all = [...threads.values()];
    if (!threadId && method === "GET") {
      const includeArchived = url.searchParams.get("include_archived") === "1";
      const listed = includeArchived ? all : all.filter((thread) => !thread.archived_at);
      return respond({ threads: listed, total: listed.length, archived_count: all.filter((thread) => thread.archived_at).length });
    }
    const thread = threads.get(threadId);
    if (!thread) return respond({ error: "not found" }, 404);
    if (suffix === "archive" && method === "POST") {
      const { archived } = JSON.parse(route.request().postData() || "{}");
      archiveCalls.push({ threadId, archived });
      thread.archived_at = archived ? "2026-10-14T00:00:00Z" : "";
      return respond({ thread });
    }
    if (!suffix && method === "GET") return respond(thread);
    if (suffix === "measurements") return respond({ thread_id: threadId, writes: false, input_dataset_ids: [], measured_inputs: 0, unmeasured: [], column_profiles: [] });
    if (suffix === "evidence-map") return respond({ thread_id: threadId, nodes: [], review_required: true, writes: false });
    if (suffix === "discover-handoff") return respond({ thread_id: threadId, missing_evidence: [], collect_intents: [] });
    return respond({ error: `unexpected route ${suffix}` }, 404);
  });
  return archiveCalls;
}

test("a researcher can archive a build and restore it from Synthesis home", async ({ page }) => {
  await mockV2Api(page);
  const calls = await installArchiveMock(page);
  const target = FIXTURE.threads[0];
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const item = page.locator('[data-testid="synthesis-thread-item"]').filter({ hasText: target.title }).first();
  await item.click();
  await page.getByTestId("synthesis-archive-build").click();

  await expect.poll(() => calls).toEqual([{ threadId: target.id, archived: true }]);
  await expect(page.getByTestId("synthesis-home-state")).toBeVisible();
  await expect(page.locator('[data-testid="synthesis-thread-item"]').filter({ hasText: target.title })).toHaveCount(0);

  const archived = page.getByTestId("synthesis-home-archived");
  await expect(archived).toContainText("Archived builds");
  await page.getByTestId("synthesis-show-archived").click();
  await archived.getByRole("button", { name: "Restore" }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ threadId: target.id, archived: false });
  await expect(page.locator('[data-testid="synthesis-thread-item"]').filter({ hasText: target.title }).first()).toBeVisible();
});
