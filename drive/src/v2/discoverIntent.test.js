import test from "node:test";
import assert from "node:assert/strict";
import {
  canSubmitDiscoverIntent,
  discoverIntentCandidate,
  procurementEngineeringSummary,
  proposalFromDiscoverCandidate,
  selectedIntentRoute,
} from "./discoverIntent.js";

test("intent candidate preserves descriptions and observed connector identity", () => {
  const candidate = discoverIntentCandidate(
    {
      candidate_key: "source:bigquery",
      title: "BigQuery public blockchain datasets",
      description: "Public transaction and token-transfer tables.",
      recommended_use: "Aggregate transaction flows into daily measures.",
      grain: "transaction",
      url: "https://console.cloud.google.com/bigquery",
    },
    {
      connector: { connector_id: "bigquery_public" },
      observed_at: "2026-07-28T00:00:00Z",
    },
  );

  assert.equal(candidate.candidate_key, "source:bigquery");
  assert.equal(candidate.connector_id, "bigquery_public");
  assert.equal(candidate.description, "Public transaction and token-transfer tables.");
  assert.equal(candidate.recommended_use, "Aggregate transaction flows into daily measures.");
});

test("declared collection route survives normalization as connector authority", () => {
  const candidate = discoverIntentCandidate({
    candidate_key: "dataset:mops",
    title: "MOPS filings",
    collect_via: "mops_tw",
  });

  assert.equal(candidate.connector_id, "mops_tw");
  assert.equal(proposalFromDiscoverCandidate(candidate)?.routes?.[0]?.connector_id, "mops_tw");
});

test("declared connector creates a factual route proposal without a score", () => {
  const proposal = proposalFromDiscoverCandidate({
    candidate_key: "source:bigquery",
    connector_id: "bigquery_public",
    title: "BigQuery public blockchain datasets",
    description: "Public transaction tables.",
    coverage: "",
    grain: "transaction",
  });

  assert.ok(proposal);
  assert.equal(proposal.routes.length, 1);
  assert.equal(proposal.routes[0].connector_id, "bigquery_public");
  assert.equal(proposal.routes[0].grain, "transaction");
  assert.equal("score" in proposal, false);
  assert.equal("fit_score" in proposal, false);
});

test("unknown route remains unproposed instead of inventing procurement", () => {
  assert.equal(
    proposalFromDiscoverCandidate({
      candidate_key: "reference:paper",
      title: "Reference-only record",
    }),
    null,
  );
});

test("procurement engineering summary renders only backend-compiled truth", () => {
  assert.equal(procurementEngineeringSummary({ id: "connector_only" }), null);

  const summary = procurementEngineeringSummary({
    id: "craft_primary",
    collect_plan: {
      cluster_execution: {
        contract_hash: "abc123",
        engineering_summary: {
          status: "compiled",
          primitive: "http_manifest",
          required_capabilities: ["http"],
          resource_basis: "baseline_only",
          placement: "runtime",
          parallelism_hint: 4,
          preflight: "recommended",
          post_acquisition_reassessment: true,
        },
      },
    },
  });

  assert.deepEqual(summary, {
    status: "compiled",
    primitive: "http_manifest",
    primitiveLabel: "HTTP acquisition",
    capabilities: ["http"],
    capabilityLabel: "http",
    placementLabel: "runtime placement",
    sizingLabel: "baseline sizing",
    preflight: "recommended",
    preflightLabel: "preflight recommended",
    parallelismLabel: "up to 4 parallel claims",
    postAcquisitionReassessment: true,
    contractHash: "abc123",
  });
});

test("bounded browser engineering summary stays explicit about required preflight", () => {
  const summary = procurementEngineeringSummary({
    collect_plan: {
      cluster_execution: {
        engineering_summary: {
          status: "compiled",
          primitive: "scraper_run",
          required_capabilities: ["browser"],
          resource_basis: "bounded",
          placement: "runtime",
          parallelism_hint: 1,
          preflight: "required",
          post_acquisition_reassessment: true,
        },
      },
    },
  });

  assert.equal(summary.primitiveLabel, "Browser acquisition");
  assert.equal(summary.capabilityLabel, "browser");
  assert.equal(summary.sizingLabel, "bounded sizing");
  assert.equal(summary.preflightLabel, "preflight required");
  assert.equal(summary.parallelismLabel, "single claim");
});

test("intent submits only after reviewed route selection and before job linkage", () => {
  const intent = {
    state: {
      status: "ready_for_review",
      routes: [{ id: "connector_bigquery", title: "BigQuery" }],
      selected_route_id: "connector_bigquery",
      collection: { job_id: "" },
    },
  };
  assert.equal(canSubmitDiscoverIntent(intent), true);
  assert.equal(selectedIntentRoute(intent)?.title, "BigQuery");

  intent.state.collection.job_id = "job_123";
  assert.equal(canSubmitDiscoverIntent(intent), false);
});
