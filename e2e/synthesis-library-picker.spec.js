import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const THREAD = {
  id: "thread-picker",
  created_at: "2026-10-25T00:00:00+00:00",
  updated_at: "2026-10-25T00:00:00+00:00",
  title: "Picker thread",
  objective: "Build a weekly news-risk panel from held research evidence.",
  materialisation: "not_materialised",
  state: { title: "Picker thread", objective: "Build a weekly news-risk panel from held research evidence.", maturity: "exploring", nodes: [], edges: [], proposal: null, execution_spec: null, execution: null },
};

test("Add from Library finds a held dataset the input finder missed and adds it to the build", async ({ page }) => {
  await mockV2Api(page);
  const writes = [];
  await page.route("**/library/synthesis/threads**", async (route) => {
    const request = route.request();
    const parts = new URL(request.url()).pathname.split("/").filter(Boolean);
    const at = parts.lastIndexOf("threads");
    const id = parts[at + 1] || "";
    const suffix = parts.slice(at + 2).join("/");
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!id) return respond({ threads: [THREAD], total: 1 });
    if (!suffix) return respond(THREAD);
    if (suffix === "measurements") return respond({ thread_id: id, writes: false, input_dataset_ids: [], measured_inputs: 0, unmeasured: [], column_profiles: [] });
    if (suffix === "evidence-map" && request.method() === "GET") return respond({ thread_id: id, nodes: [], reason: "No held evidence proposed", review_required: true, writes: false });
    if (suffix === "evidence-map" && request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push(body.dataset_ids);
      const node = { id: body.dataset_ids[0], dataset_id: body.dataset_ids[0], layer: "evidence", type: "source", label: "Asia daily news-risk panel", grain: "country_day" };
      return respond({ thread: { ...THREAD, state: { ...THREAD.state, nodes: [node] } }, added: [node] });
    }
    if (suffix === "materialisation") return respond({ thread_id: id, materialisation: "not_materialised", output_registered: false });
    return respond({ error: `unsupported ${suffix}` }, 400);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("synthesis-thread-item").filter({ hasText: "Picker thread" }).click();

  const evidence = page.getByTestId("synthesis-evidence-state");
  await evidence.getByRole("button", { name: "Add from Library" }).click();
  const picker = page.getByTestId("synthesis-library-picker");
  await picker.getByRole("searchbox", { name: "Search your Library" }).fill("asia news");
  await expect(picker.getByRole("listitem")).toHaveCount(1);
  await expect(picker).toContainText("Asia daily news-risk panel");
  await picker.getByRole("checkbox").check();
  await picker.getByRole("button", { name: "Add 1 input" }).click();

  await expect.poll(() => writes).toEqual([["gdelt_asia_daily_country_panel"]]);
  await expect(evidence).toContainText("1 mapped inputs");
  await expect(page.getByTestId("synthesis-library-picker")).toHaveCount(0);
});
