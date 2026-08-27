from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


workspace_path = Path("drive/src/v2/DiscoverIntentWorkspace.jsx")
workspace = workspace_path.read_text(encoding="utf-8")
workspace = replace_once(
    workspace,
    '''import {
  canSubmitDiscoverIntent,
  intentCollection,
  intentState,
  selectedIntentRoute,
} from "@/v2/discoverIntent";''',
    '''import {
  canSubmitDiscoverIntent,
  intentCollection,
  intentState,
  procurementEngineeringSummary,
  selectedIntentRoute,
} from "@/v2/discoverIntent";''',
    "workspace import",
)
workspace = replace_once(
    workspace,
    '''function RouteCard({ route, sourceTitle, selected, recommended = false, disabled, onSelect }) {
  const highlighted = selected || recommended;
  return (''',
    '''function RouteCard({ route, sourceTitle, selected, recommended = false, disabled, onSelect }) {
  const highlighted = selected || recommended;
  const engineering = procurementEngineeringSummary(route);
  return (''',
    "route engineering normalization",
)
workspace = replace_once(
    workspace,
    '''      {route.summary ? <p>{route.summary}</p> : null}
      <dl>''',
    '''      {route.summary ? <p>{route.summary}</p> : null}
      {engineering ? (
        <div
          className={`rd-v2-intent-engineering${engineering.preflight === "required" ? " needs-review" : ""}`}
          data-testid="discover-procurement-engineering"
        >
          <span>Procurement engineering</span>
          <strong>Compiled · {engineering.primitiveLabel}</strong>
          <p>{engineering.capabilityLabel} · {engineering.placementLabel} · {engineering.sizingLabel}</p>
          <em>{engineering.preflightLabel} · {engineering.parallelismLabel}</em>
          {engineering.postAcquisitionReassessment ? <small>Evidence fit will be rechecked after collection.</small> : null}
        </div>
      ) : null}
      <dl>''',
    "route engineering strip",
)
workspace_path.write_text(workspace, encoding="utf-8")

fixture_path = Path("e2e/fixtures/v2MockApi.js")
fixture = fixture_path.read_text(encoding="utf-8")
fixture = replace_once(
    fixture,
    '''  await page.route("**/library/discover/intents", handleDiscoverIntent);
  await page.route("**/library/discover/intents/**", handleDiscoverIntent);
  await page.route("**/library/discover/web*", (route) =>''',
    '''  await page.route("**/library/discover/intents", handleDiscoverIntent);
  await page.route("**/library/discover/intents/**", handleDiscoverIntent);
  await page.route("**/library/craft/discover-proposal", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    let body = {};
    try {
      body = route.request().postDataJSON?.() || JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const current = liveIntents.get(body.intent_id || "");
    if (!current) {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "intent not found" }) });
    }
    const proposal = {
      id: "craft_example_e2e",
      summary: `Custom acquisition plan for ${body.title || "public source"}.`,
      reason: "A concrete public URL can be compiled into a bounded generic acquisition.",
      routes: [{
        id: "craft_primary",
        title: "Custom HTTP acquisition",
        summary: "Bounded HTTP manifest for the selected public source.",
        access: "http_manifest",
        destination: "data_lake/procured/example_public",
        cost: "cluster worker · researcher approval",
        limitation: "Transfer size is not measured yet.",
        url: body.url || "https://example.com/data.csv",
        pipeline: "custom",
        crafted: true,
        collect_plan: {
          job_type: "http_manifest",
          required_capabilities: ["http"],
          resource_requirements: { cpu_cores: 0.5, memory_mb: 256 },
          cluster_execution: {
            contract_hash: "compiled-contract-e2e",
            engineering_summary: {
              status: "compiled",
              primitive: "http_manifest",
              required_capabilities: ["http"],
              capability_count: 1,
              resource_basis: "baseline_only",
              placement: "runtime",
              parallelism_hint: 1,
              preflight: "recommended",
              post_acquisition_reassessment: true,
            },
          },
        },
      }],
      recommended_route_id: "craft_primary",
      proposal_hash: "proposal-hash-crafted-e2e",
    };
    const next = {
      ...current,
      state: { ...current.state, status: "proposal_ready", proposal },
    };
    liveIntents.set(current.id, next);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ intent: next, proposal }),
    });
  });
  await page.route("**/library/discover/web*", (route) =>''',
    "mock crafted proposal",
)
fixture_path.write_text(fixture, encoding="utf-8")

spec_path = Path("e2e/v2-discover-evidence.spec.js")
spec = spec_path.read_text(encoding="utf-8")
spec = replace_once(
    spec,
    '''  test("mobile research brief, results, and bottom navigation do not collide", async ({ page }) => {''',
    '''  test("compiled procurement engineering stays brief, truthful, and approval-gated", async ({ page }) => {
    await mockV2Api(page, {
      discoverBody: { sections: [], total: 0 },
      discoverSourcesBody: {
        results: [{
          kind: "source",
          source_id: "example_public",
          candidate_key: "source:example_public",
          title: "Example public research files",
          description: "Public CSV files for a concrete research source.",
          url: "https://example.com/data.csv",
          access_mode: "public_http",
          query_relevance: 2,
        }],
        total: 1,
      },
    });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await search(page, "example public research files");

    await page.getByTestId("discover-ranked-results").getByRole("button", { name: "Add to collection" }).click();
    const workspace = page.getByTestId("discover-intent-workspace");
    await expect(workspace).toBeVisible();
    const engineering = workspace.getByTestId("discover-procurement-engineering");
    await expect(engineering).toBeVisible();
    await expect(engineering).toContainText("Procurement engineering");
    await expect(engineering).toContainText("Compiled · HTTP acquisition");
    await expect(engineering).toContainText("http · runtime placement · baseline sizing");
    await expect(engineering).toContainText("preflight recommended · single claim");
    await expect(engineering).toContainText("Evidence fit will be rechecked after collection");
    await expect(engineering).not.toContainText(/worker-[0-9]|assigned worker|contract hash/i);
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);

    await workspace.getByRole("button", { name: "Continue to route selection" }).click();
    await expect(workspace.getByTestId("discover-procurement-engineering")).toBeVisible();
    await expect(workspace.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
  });

  test("mobile research brief, results, and bottom navigation do not collide", async ({ page }) => {''',
    "compiled engineering e2e",
)
spec_path.write_text(spec, encoding="utf-8")

css_path = Path("drive/src/v2/discover-visual-freeze.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Discover procurement engineering summary: backend truth, not an ops dashboard. */"
if marker not in css:
    css += '''\n\n/* Discover procurement engineering summary: backend truth, not an ops dashboard. */
.rd-v2-intent-engineering {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 10px;
  align-items: baseline;
  margin: 8px 0 2px;
  padding: 8px 10px;
  border-block: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 72%, transparent);
  background: color-mix(in srgb, #edf4ef 48%, transparent);
}
.rd-v2-intent-engineering > span {
  grid-row: 1 / span 3;
  align-self: start;
  padding-top: 2px;
  color: #557064;
  font: 720 8.5px/1.2 var(--rd-mono, ui-monospace, monospace);
  letter-spacing: .07em;
  text-transform: uppercase;
}
.rd-v2-intent-engineering > strong {
  min-width: 0;
  color: var(--rd-text, #182033);
  font-size: 10.5px;
  line-height: 1.3;
}
.rd-v2-intent-engineering > p,
.rd-v2-intent-engineering > em,
.rd-v2-intent-engineering > small {
  grid-column: 2;
  min-width: 0;
  margin: 0;
  color: var(--rd-muted, #6e7685);
  font-size: 9px;
  font-style: normal;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.rd-v2-intent-engineering > em { color: #587163; font-weight: 650; }
.rd-v2-intent-engineering.needs-review > em { color: #9a650e; }
.rd-v2-intent-engineering > small { opacity: .88; }
@media (max-width: 640px) {
  .rd-v2-intent-engineering { grid-template-columns: 1fr; }
  .rd-v2-intent-engineering > span,
  .rd-v2-intent-engineering > p,
  .rd-v2-intent-engineering > em,
  .rd-v2-intent-engineering > small { grid-column: 1; grid-row: auto; }
}
'''
    css_path.write_text(css, encoding="utf-8")

print("staged Discover procurement engineering UI and browser proof")
