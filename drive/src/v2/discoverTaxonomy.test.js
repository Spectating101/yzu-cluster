import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDiscoverResult,
  orderDiscoverResults,
  taxonomyMatchesFilter,
} from "./discoverTaxonomy.js";

describe("discover taxonomy (D1)", () => {
  it("classifies query-ready local holdings", () => {
    const lab = new Set(["gdelt_asia"]);
    const c = classifyDiscoverResult(
      { dataset_id: "gdelt_asia", analysis_readiness: "instant", local_root: "panels/gdelt" },
      lab,
    );
    assert.equal(c.key, "local-query-ready");
    assert.match(c.label, /Query ready/i);
  });

  it("does not call connected local holdings query-ready", () => {
    const lab = new Set(["vault_csv"]);
    const c = classifyDiscoverResult(
      { dataset_id: "vault_csv", local_root: "vault/csv", in_vault: true },
      lab,
    );
    assert.equal(c.key, "local-connected");
    assert.notEqual(c.key, "local-query-ready");
  });

  it("marks registry metadata-only when no connection or query path", () => {
    const lab = new Set(["meta_only"]);
    const c = classifyDiscoverResult({ dataset_id: "meta_only", title: "Card only" }, lab);
    assert.equal(c.key, "local-metadata");
  });

  it("does not treat bare URL as probed or verified", () => {
    const c = classifyDiscoverResult({
      title: "Open page",
      url: "https://example.com/data",
      source: "Web",
    });
    assert.equal(c.key, "external-discoverable");
    assert.doesNotMatch(c.label, /Verified|Probed|Faculty finance/i);
  });

  it("promotes candidate-bound probe to External · Probed", () => {
    const c = classifyDiscoverResult({
      title: "Open page",
      url: "https://example.com/data",
      probe_snapshot: { connector: { id: "x" } },
    });
    assert.equal(c.key, "external-probed");
  });

  it("does not treat probe success alone as acquisition available", () => {
    const c = classifyDiscoverResult({
      title: "Open page",
      url: "https://example.com/data",
      probed: true,
      probe_result: { ok: true },
    });
    assert.equal(c.key, "external-probed");
    assert.notEqual(c.key, "external-acquirable");
  });

  it("uses explicit collection route for acquisition available", () => {
    const c = classifyDiscoverResult({
      title: "MOPS",
      url: "https://mops.twse.com.tw",
      collect_via: "mops_tw",
    });
    assert.equal(c.key, "external-acquirable");
  });

  it("keeps licensed/manual out of immediate acquisition", () => {
    const c = classifyDiscoverResult({
      title: "Vendor feed",
      manual_access: true,
      access_mode: "licensed",
      collect_via: "should_not_override",
    });
    assert.equal(c.key, "licensed-manual");
  });

  it("orders groups while preserving API order within each group", () => {
    const lab = new Set(["local_a", "local_a2"]);
    const rows = [
      { title: "ext-b", url: "https://b.example", source: "B" },
      { dataset_id: "local_a", analysis_readiness: "instant", title: "local-first" },
      { title: "ext-a", url: "https://a.example", source: "A" },
      { title: "licensed", manual_access: true, access_mode: "licensed" },
      { dataset_id: "local_a2", title: "local-meta", in_lab: true },
    ];
    const ordered = orderDiscoverResults(rows, lab);
    assert.equal(ordered[0].title, "local-first");
    assert.equal(ordered[1].title, "local-meta");
    assert.equal(ordered[2].title, "ext-b");
    assert.equal(ordered[3].title, "ext-a");
    assert.equal(ordered[4].title, "licensed");
  });

  it("maps filters to taxonomy membership", () => {
    const qr = classifyDiscoverResult(
      { dataset_id: "x", analysis_readiness: "instant" },
      new Set(["x"]),
    );
    assert.equal(taxonomyMatchesFilter(qr, "query_ready"), true);
    assert.equal(taxonomyMatchesFilter(qr, "in_lab"), true);
    assert.equal(taxonomyMatchesFilter(qr, "external"), false);

    const ext = classifyDiscoverResult({ title: "e", url: "https://e.example" });
    assert.equal(taxonomyMatchesFilter(ext, "external"), true);
    assert.equal(taxonomyMatchesFilter(ext, "needs_access"), false);

    const lic = classifyDiscoverResult({ title: "l", manual_access: true });
    assert.equal(taxonomyMatchesFilter(lic, "needs_access"), true);
  });
});
