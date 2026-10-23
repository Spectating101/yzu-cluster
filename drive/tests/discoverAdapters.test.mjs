import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceResultToCandidate,
  searchHitToCandidate,
  sourcesResponseToRows,
  durableHistoryToEvents,
  normalizeDiscoverMode,
  reconcileDiscoverRegistryRows,
  cleanDescription,
} from "../src/v2/discoverAdapters.js";
import { descriptiveLine } from "../src/v2/browseMeta.js";
import { webHitsToRows } from "../src/v2/discoverActions.js";

test("Discover reconciles stale internal hits by ID while preserving equally named current inputs", () => {
  const hits = [
    { kind: "registry_dataset", dataset_id: "old", source: "collection_index", local_ready: false, title: "County panel" },
    { kind: "registry_dataset", dataset_id: "old_ready", source: "collection_index", local_ready: true, title: "County panel" },
    { kind: "registry_dataset", dataset_id: "current", title: "County panel" },
    { kind: "registry_dataset", dataset_id: "different", title: "County panel" },
    { kind: "catalog", source: "procured", title: "County panel" },
    { kind: "source", source_id: "bls", title: "BLS" },
  ];
  const catalog = [{ dataset_id: "current", analysis_readiness: "instant" }, { dataset_id: "different", analysis_readiness: "instant" }];
  assert.deepEqual(reconcileDiscoverRegistryRows(hits, catalog, true).map(r => r.dataset_id || r.source_id), ["current", "different", "bls"]);
  assert.equal(reconcileDiscoverRegistryRows(hits, [], false).length, 5);
  assert.equal(reconcileDiscoverRegistryRows([{ kind: "registry_dataset", dataset_id: "new", local_ready: true }], catalog, true).length, 1);
});

test("a registry record without a DOI cannot offer DataCite collection", () => {
  const row = searchHitToCandidate({ kind: "registry_dataset", dataset_id: "internal", collect_via: "datacite", procureability_label: "Collect now" });
  assert.equal(row.collect_via, "");
  assert.equal(row.collectable, false);
});

test("sourceResultToCandidate maps Explore source rows for Discover UI", () => {
  const row = sourceResultToCandidate({
    kind: "source",
    source_id: "gdelt",
    provider: "GDELT Project",
    label: "GDELT news graph",
    title: "GDELT news graph",
    connector_id: "gdelt",
    access_mode: "materialized_bulk",
    capabilities: ["country_news_shocks"],
    endpoint: "gdeltproject.org",
    candidate_key: "source:gdelt_project:gdelt",
    preview_supported: true,
    collect_via: ["pipeline", "queue"],
  });
  assert.equal(row.source_id, "gdelt");
  assert.equal(row.candidate_key, "source:gdelt_project:gdelt");
  assert.equal(row.title, "GDELT news graph");
  assert.equal(row.url, "https://gdeltproject.org");
  assert.equal(row.external, true);
});

test("durableHistoryToEvents adapts backend history items to trail events", () => {
  const events = durableHistoryToEvents({
    items: [
      {
        kind: "intent",
        id: "abc",
        title: "Smoke intent",
        status: "ready_for_review",
        updated_at: "2026-07-13T19:17:34+00:00",
        summary: "stablecoin transfers",
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "abc");
  assert.equal(events[0].action, "intent");
  assert.equal(events[0].target, "Smoke intent");
  assert.equal(events[0].meta.status, "ready_for_review");
  assert.ok(events[0].ts);
});

test("durableHistoryToEvents preserves verified registered asset identity", () => {
  const [event] = durableHistoryToEvents({
    items: [
      {
        kind: "registered_asset",
        id: "day2_deploy_smoke_20260720",
        title: "Day-2 deploy smoke",
        status: "registered",
        dataset_id: "day2_deploy_smoke_20260720",
        registry_id: "day2_deploy_smoke_20260720",
        manifest_id: "collection_manifest_day2-deploy-smoke-20260720a",
        job_id: "day2-deploy-smoke-20260720a",
        archive_verified: true,
        registry_readback: true,
        vault_path: "gdrive:Research-Drive/day2_deploy_smoke_20260720",
        catalog_reconciliation: { state: "receipt_only", query_allowed: false },
      },
    ],
  });

  assert.equal(event.kind, "registered_asset");
  assert.equal(event.dataset_id, "day2_deploy_smoke_20260720");
  assert.equal(event.meta.registry_id, "day2_deploy_smoke_20260720");
  assert.equal(event.meta.manifest_id, "collection_manifest_day2-deploy-smoke-20260720a");
  assert.equal(event.meta.job_id, "day2-deploy-smoke-20260720a");
  assert.equal(event.meta.readiness, "registered");
  assert.equal(event.meta.archive_verified, true);
  assert.equal(event.meta.registry_readback, true);
  assert.equal(event.meta.catalog_reconciliation.query_allowed, false);
});

test("normalizeDiscoverMode maps legacy Search/Activity to Explore/History", () => {
  assert.equal(normalizeDiscoverMode("search"), "explore");
  assert.equal(normalizeDiscoverMode("activity"), "explore");
  assert.equal(normalizeDiscoverMode("approvals"), "explore");
  assert.equal(normalizeDiscoverMode("awaiting"), "explore");
  assert.equal(normalizeDiscoverMode("history"), "history");
  assert.equal(normalizeDiscoverMode("explore"), "explore");
  assert.equal(normalizeDiscoverMode(""), "explore");
});

test("sourceResultToCandidate strips catalogue markup out of descriptions", () => {
  const row = sourceResultToCandidate({
    source_id: "openalex",
    description: "<p>Daily <b>events</b>&nbsp;coverage &amp; tone</p>",
  });
  assert.equal(row.description, "Daily events coverage & tone");
});

test("webHitsToRows strips catalogue markup from section and result payloads", () => {
  const [section] = webHitsToRows({
    sections: [{ rows: [{ title: "Forest fire", description: '<p><span lang="en">Economic &amp; social costs</span></p>' }] }],
  });
  const [result] = webHitsToRows({
    results: [{ title: "Forest fire", snippet: "<em>Burned area</em>&nbsp;by region" }],
  });

  assert.equal(section.description, "Economic & social costs");
  assert.equal(result.description, "Burned area by region");
});

test("Discover adapters erase explicit no-route sentinels before evaluation", () => {
  const source = sourceResultToCandidate({ title: "Known record", collect_via: "none" });
  const [search] = webHitsToRows({
    sections: [{ rows: [{ title: "Known record", collect_via: "none" }] }],
  });
  const indexed = searchHitToCandidate({
    kind: "registry_dataset",
    dataset_id: "known-record",
    collect_via: "none",
  });

  assert.equal(source.collect_via, "");
  assert.equal(search.collect_via, "");
  assert.equal(indexed.collect_via, "");
});

test("sourceResultToCandidate falls back when description is markup-only", () => {
  const row = sourceResultToCandidate({
    source_id: "x",
    description: "<p>  </p>",
    access_mode: "open_api",
    capabilities: ["bulk"],
  });
  // Stripping must not manufacture an empty description — the access/capability
  // summary is the documented fallback.
  assert.equal(row.description, "open_api · bulk");
});

test("sourceResultToCandidate preserves recorded connector notes for result rows", () => {
  const row = sourceResultToCandidate({
    title: "Google BigQuery (public datasets)",
    access_mode: "live_connector",
    capabilities: ["onchain_crypto"],
    notes: "Live remote SQL; USDT Ethereum flow pack is already materialized.",
  });

  assert.match(row.description, /Live remote SQL/);
  assert.doesNotMatch(row.description, /^live_connector/);
});

test("Discover prefers a researcher description, then connector notes", () => {
  assert.match(
    descriptiveLine({ notes: "Live remote SQL; USDT Ethereum flow pack is available." }),
    /USDT Ethereum flow pack/,
  );
  assert.equal(
    descriptiveLine({
      description: "Daily market and fundamentals panel.",
      notes: "internal route id=bulk_42",
    }),
    "Daily market and fundamentals panel.",
  );
});

test("sourcesResponseToRows collapses duplicate sources on identity", () => {
  const rows = sourcesResponseToRows({
    results: [
      { source_id: "gdelt", title: "GDELT", capabilities: ["a"] },
      { source_id: "gdelt", title: "GDELT", capabilities: ["b"] },
      { source_id: "openalex", title: "OpenAlex" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.source_id),
    ["gdelt", "openalex"],
  );
});

test("sourcesResponseToRows keeps rows that carry no identity at all", () => {
  // An empty dedupe key must not collapse distinct unidentified rows into one.
  const rows = sourcesResponseToRows({ results: [{}, {}] });
  assert.equal(rows.length, 2);
});

test("sourcesResponseToRows still attaches search metadata after dedupe", () => {
  const rows = sourcesResponseToRows({
    results: [{ source_id: "gdelt" }, { source_id: "gdelt" }],
    search_mode: "semantic",
    query: "tone",
    cached: true,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].search_meta.search_mode, "semantic");
  assert.equal(rows[0]._search_meta.query, "tone");
  assert.equal(rows[0].cached, true);
});

test("cleanDescription strips tags without eating prose comparisons", () => {
  const d = (s) => sourceResultToCandidate({ source_id: "s", description: s }).description;
  assert.equal(d("<p>Real <b>markup</b></p>"), "Real markup");
  // A naive /<[^>]*>/ collapsed this to "Firms where mktcap 1M".
  assert.equal(
    d("Firms where mktcap < 5B and volume > 1M"),
    "Firms where mktcap < 5B and volume > 1M",
  );
  assert.equal(d("Temperature <10 degrees"), "Temperature <10 degrees");
  assert.equal(d("a &amp; b &lt;tag&gt;"), "a & b <tag>");
  assert.equal(d("<div class='x'>Nested <span>text</span></div>"), "Nested text");
});

test("catalogue text decodes named and numeric HTML entities", () => {
  assert.equal(cleanDescription("En menos de un a&ntilde;o, Bolivia ha pasado"), "En menos de un año, Bolivia ha pasado");
  assert.equal(cleanDescription("investigaci&oacute;n &amp; an&aacute;lisis"), "investigación & análisis");
  assert.equal(cleanDescription("caf&#233; &#x2014; ok"), "café — ok");
  assert.equal(cleanDescription("keeps &unknownentity; as written"), "keeps &unknownentity; as written");
  assert.equal(cleanDescription("mktcap < 5B and volume > 1M"), "mktcap < 5B and volume > 1M");
});

test("search hits arrive with decoded titles and descriptions", () => {
  const row = searchHitToCandidate({ title: "Volatilidad en Bitcoin: An&aacute;lisis", description: "Un a&ntilde;o", url: "https://zenodo.org/x" });
  assert.equal(row.title, "Volatilidad en Bitcoin: Análisis");
  assert.equal(row.description, "Un año");
});

test("web results collapse a paper listed under both its concept and version DOI", () => {
  const rows = webHitsToRows({ sections: [{ rows: [
    { title: "USDC Stablecoin Market Analysis 2022-2025", url: "https://zenodo.org/doi/10.5281/zenodo.17270012", kind: "web_hit" },
    { title: "USDC Stablecoin Market Analysis 2022-2025 ", url: "https://zenodo.org/doi/10.5281/zenodo.17270013", kind: "web_hit" },
    { title: "USDC Stablecoin Market Analysis 2022-2025", url: "https://www.example.org/usdc", kind: "web_hit" },
  ] }] });
  assert.deepEqual(rows.map((row) => row.url), ["https://zenodo.org/doi/10.5281/zenodo.17270012", "https://www.example.org/usdc"]);
});
