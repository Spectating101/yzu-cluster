/**
 * Live Discover search-engine contract — identity + handoff without inventing data.
 * Mirrors shapes probed from desk :8765 (sources, discover, semantic, web, history, jobs).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { browseTargetKey, webHitsToRows } from "./discoverActions.js";
import {
  durableHistoryToEvents,
  enrichHistoryEventsFromJobs,
  searchHitToCandidate,
  sourceResultToCandidate,
  sourcesResponseToRows,
} from "./discoverAdapters.js";
import { bindJobsToCandidates, jobToCandidateRow } from "./procurementJobs.js";

test("sourcesResponseToRows keeps catalogue identity for selection/preview", () => {
  const rows = sourcesResponseToRows({
    results: [
      {
        kind: "source",
        source_id: "gdelt",
        connector_id: "gdelt",
        desk_connector_id: "gdelt",
        candidate_key: "source:gdelt_project:gdelt",
        title: "GDELT news graph",
        provider: "GDELT Project",
        endpoint: "gdeltproject.org",
        preview_supported: true,
      },
    ],
    total: 1,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].candidate_key, "source:gdelt_project:gdelt");
  assert.equal(browseTargetKey(rows[0]), "source:gdelt_project:gdelt");
  assert.equal(rows[0].url, "https://gdeltproject.org");
});

test("searchHitToCandidate preserves BE candidate_key and derives dataset: only from dataset_id", () => {
  const stamped = searchHitToCandidate({
    kind: "registry_dataset",
    dataset_id: "gdelt_asia_daily_country_panel",
    title: "Asia Daily News Shock Panel",
    candidate_key: "dataset:gdelt_asia_daily_country_panel",
  });
  assert.equal(stamped.candidate_key, "dataset:gdelt_asia_daily_country_panel");
  assert.equal(browseTargetKey(stamped), "dataset:gdelt_asia_daily_country_panel");

  const unified = searchHitToCandidate({
    kind: "local_registry",
    id: "asia_country_week_news_market_primary",
    dataset_id: "asia_country_week_news_market_primary",
    title: "Asia Country-Week News-Market Panel",
  });
  assert.equal(unified.candidate_key, "dataset:asia_country_week_news_market_primary");
  assert.equal(browseTargetKey(unified), "dataset:asia_country_week_news_market_primary");

  const bare = searchHitToCandidate({ title: "No id row" });
  assert.equal(bare.candidate_key, "");
  assert.equal(browseTargetKey(bare), "No id row");
});

test("webHitsToRows keeps section candidate_key and stamps url results without inventing keys", () => {
  const fromSections = webHitsToRows({
    sections: [
      {
        rows: [
          {
            kind: "web_hit",
            title: "Replication data",
            url: "https://dataverse.harvard.edu/x",
            candidate_key: "url:https://dataverse.harvard.edu/x",
          },
        ],
      },
    ],
  });
  assert.equal(fromSections[0].candidate_key, "url:https://dataverse.harvard.edu/x");
  assert.equal(browseTargetKey(fromSections[0]), "url:https://dataverse.harvard.edu/x");

  const fromResults = webHitsToRows({
    results: [{ title: "CSV mirror", url: "https://example.com/data.csv", source: "web", snippet: "Public" }],
  });
  assert.equal(fromResults[0].url, "https://example.com/data.csv");
  assert.equal(fromResults[0].candidate_key, "url:https://example.com/data.csv");
  assert.equal(fromResults[0].kind, "web_hit");
});

test("bindJobsToCandidates resolves bindings stored under browseTargetKey/candidate_key", () => {
  const row = sourceResultToCandidate({
    source_id: "mops_taiwan",
    connector_id: "mops",
    candidate_key: "source:twse_mops:mops_taiwan",
    title: "Taiwan MOPS / governance procured",
    provider: "TWSE MOPS",
  });
  const key = browseTargetKey(row);
  assert.equal(key, "source:twse_mops:mops_taiwan");
  const bound = bindJobsToCandidates([row], [{ id: "job-1", status: "pending_approval", plan: { title: "MOPS" } }], {
    [key]: "job-1",
  });
  assert.equal(bound[0].bound_job_id, "job-1");
  assert.equal(bound[0].bound_job.id, "job-1");
});

test("jobToCandidateRow carries job identity fields into Explore queue rows", () => {
  const row = jobToCandidateRow({
    id: "0ab9e1eb8ef5",
    status: "pending_approval",
    title: "Discover scrape · Taiwan MOPS",
    candidate_key: "source:twse_mops:mops_taiwan",
    connector_id: "src_2a56039b0fd3",
    plan: {
      title: "Discover scrape · Taiwan MOPS",
      candidate_key: "source:twse_mops:mops_taiwan",
      source_id: "mops_taiwan",
      catalog_connector_id: "mops",
      connector_id: "src_2a56039b0fd3",
    },
    request: { candidate_key: "source:twse_mops:mops_taiwan", connector_id: "src_2a56039b0fd3" },
  });
  assert.equal(row.candidate_key, "source:twse_mops:mops_taiwan");
  assert.equal(row.source_id, "mops_taiwan");
  assert.equal(row.connector_id, "src_2a56039b0fd3");
  assert.equal(browseTargetKey(row), "source:twse_mops:mops_taiwan");
});

test("enrichHistoryEventsFromJobs fills missing source/connector from matching jobs only", () => {
  const events = durableHistoryToEvents({
    items: [
      {
        id: "0ab9e1eb8ef5",
        kind: "collection_run",
        status: "cancelled",
        title: "Discover scrape · Taiwan MOPS",
        job_id: "0ab9e1eb8ef5",
        candidate_key: "source:twse_mops:mops_taiwan",
        updated_at: "2026-07-23T00:00:00+00:00",
      },
    ],
  });
  assert.equal(events[0].meta.source_id, "");
  assert.equal(events[0].meta.connector_id, "");

  const enriched = enrichHistoryEventsFromJobs(events, [
    {
      id: "0ab9e1eb8ef5",
      candidate_key: "source:twse_mops:mops_taiwan",
      connector_id: "src_2a56039b0fd3",
      plan: {
        source_id: "mops_taiwan",
        catalog_connector_id: "mops",
        connector_id: "src_2a56039b0fd3",
        candidate_key: "source:twse_mops:mops_taiwan",
      },
    },
  ]);
  assert.equal(enriched[0].meta.source_id, "mops_taiwan");
  assert.equal(enriched[0].meta.connector_id, "src_2a56039b0fd3");
  assert.equal(enriched[0].source_id, "mops_taiwan");
  assert.equal(enriched[0].connector_id, "src_2a56039b0fd3");
  // Does not invent dataset_id when job has none
  assert.equal(enriched[0].meta.dataset_id, "");
});
