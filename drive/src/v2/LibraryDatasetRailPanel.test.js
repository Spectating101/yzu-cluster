import test from "node:test";
import assert from "node:assert/strict";
import { canIUseDecision, statusPillKind } from "./datasetMeta.js";
import { hasReproductionMethod, librarySourceReceipt } from "./libraryProvenance.js";

test("registered datasets never fall through to Readiness unknown", () => {
  const decision = canIUseDecision({
    dataset_id: "day2_deploy_smoke_20260720",
    analysis_readiness: "registered",
  });
  assert.equal(statusPillKind({ analysis_readiness: "registered" }).label, "Registered");
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /archived research asset/i);
  assert.match(decision.body, /querying has not yet been proven/i);
  assert.doesNotMatch(decision.headline, /unknown/i);
});

test("registered scholarly work uses bibliographic semantics instead of query semantics", () => {
  const decision = canIUseDecision({
    dataset_id: "paper",
    asset_kind: "scholarly_work",
    analysis_readiness: "registered",
  });
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /reusable scholarly work/i);
  assert.match(decision.body, /source verification remains a separate claim/i);
  assert.doesNotMatch(decision.body, /querying/i);
});

test("registered operational records use recorded-state semantics", () => {
  const decision = canIUseDecision({
    dataset_id: "manifest",
    asset_kind: "operational",
    analysis_readiness: "registered",
  });
  assert.equal(decision.headline, "Registered");
  assert.match(decision.body, /reusable operational record/i);
  assert.match(decision.body, /recorded evidence/i);
  assert.doesNotMatch(decision.body, /querying/i);
});

test("query ready remains distinct from registered", () => {
  const ready = canIUseDecision({ analysis_readiness: "instant" });
  assert.equal(ready.headline, "Query ready");
  const registered = canIUseDecision({ analysis_readiness: "registered" });
  assert.notEqual(registered.headline, ready.headline);
});

test("provenance receipt preserves the exact recorded source URL and reproduction command", () => {
  const receipt = librarySourceReceipt({
    source_url: "https://data.example.org/releases/panel-2026.csv?download=1",
    collect_via: "http_manifest",
    reproduction_command: "python3 scripts/fetch_panel.py --release 2026",
  });
  assert.equal(receipt.sourceUrl, "https://data.example.org/releases/panel-2026.csv?download=1");
  assert.equal(receipt.sourceUrlKind, "Exact source URL");
  assert.equal(receipt.method, "http_manifest");
  assert.equal(receipt.command, "python3 scripts/fetch_panel.py --release 2026");
  assert.equal(hasReproductionMethod(receipt), true);
});

test("provider names and generic source labels never manufacture an exact URL", () => {
  const receipt = librarySourceReceipt({
    source: "GDELT GKG",
    source_system: "GDELT news graph",
    collect_via: "pipeline",
  });
  assert.equal(receipt.sourceUrl, "");
  assert.equal(receipt.sourceUrlKind, "");
  assert.equal(receipt.method, "pipeline");
});

test("DOI becomes an explicitly labelled resolver rather than a fabricated acquisition URL", () => {
  const receipt = librarySourceReceipt({ doi: "10.1234/example.2026" });
  assert.equal(receipt.sourceUrl, "https://doi.org/10.1234/example.2026");
  assert.equal(receipt.sourceUrlKind, "DOI resolver");
});

test("nested acquisition evidence survives as method, script, route, and upstream lineage", () => {
  const receipt = librarySourceReceipt({
    acquisition: {
      source_url: "https://api.example.org/v1/export?id=42",
      collect_via: "api_export",
      script_path: "scripts/collect_example.py",
    },
    provenance: { route: "example_export_v1" },
    lineage: { upstream_dataset_ids: ["raw_a", "raw_b"] },
  });
  assert.equal(receipt.sourceUrl, "https://api.example.org/v1/export?id=42");
  assert.equal(receipt.method, "api_export");
  assert.equal(receipt.script, "scripts/collect_example.py");
  assert.equal(receipt.route, "example_export_v1");
  assert.equal(receipt.upstream, "raw_a · raw_b");
});