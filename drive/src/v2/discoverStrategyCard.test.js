import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscoverEvaluation } from "./discoverEvaluation.js";
import {
  buildDiscoverStrategyCard,
  WITHDRAWN_STRATEGY_VOCABULARY,
} from "./discoverStrategyCard.js";

function card(row, { labIds = new Set(), probeState = null, ...options } = {}) {
  const evaluation = buildDiscoverEvaluation(row, labIds, probeState);
  return buildDiscoverStrategyCard(row, evaluation, options);
}

function block(built, id) {
  return built.blocks.find((b) => b.id === id) || null;
}

function omitted(built, id) {
  return built.omitted.find((b) => b.id === id) || null;
}

test("a row with no measured shape emits no strategy blocks, only omission reasons", () => {
  const built = card({ title: "Reference-only record" });

  assert.equal(built.hasStrategy, false);
  assert.equal(block(built, "what_you_will_get"), null);
  assert.equal(block(built, "how_it_answers"), null);
  assert.equal(block(built, "how_we_build"), null);
  assert.ok(omitted(built, "what_you_will_get"));
  assert.ok(omitted(built, "how_it_answers"));
  assert.ok(omitted(built, "how_we_build"));
  for (const entry of built.omitted) {
    assert.match(entry.reason, /not recorded|no .*recorded|not described|not declared|no .*declared/i);
  }
});

test("what you will get repeats measured grain and coverage, inventing no fields", () => {
  const built = card({
    title: "SEC EDGAR evidence offering 4",
    grain: "issuer-quarter",
    coverage: "2015–2026",
  });

  const shape = block(built, "what_you_will_get");
  assert.ok(shape);
  assert.equal(shape.grain, "issuer-quarter");
  assert.deepEqual(shape.coverage, ["2015–2026"]);
  assert.deepEqual(shape.fields, []);
  assert.equal(shape.line, "issuer-quarter · 2015–2026");
});

test("declared schema columns become measured fields, never a planned field list", () => {
  const built = card({
    title: "Taiwan governance archive",
    grain: "entity-date",
    columns: ["entity", "date", "role", "source reference"],
  });

  assert.deepEqual(block(built, "what_you_will_get").fields, [
    "entity",
    "date",
    "role",
    "source reference",
  ]);
});

test("nested schema properties become declared product fields without inventing rows", () => {
  const built = card({
    title: "Governance panel",
    schema: { properties: { issuer_id: {}, quarter: {}, governance_score: {} } },
    row_count: 18420,
    format: "parquet",
  });
  const shape = block(built, "what_you_will_get");
  assert.deepEqual(shape.fields, ["issuer_id", "quarter", "governance_score"]);
  assert.match(shape.line, /parquet/i);
  assert.match(shape.line, /18,420 rows declared/i);
});

test("how it answers the question exists only when an evidence need is recorded", () => {
  const row = { title: "BigQuery public blockchain datasets", collect_via: "BigQuery" };

  assert.equal(block(card(row), "how_it_answers"), null);
  assert.match(omitted(card(row), "how_it_answers").reason, /evidence need/i);

  const withNeed = card(row, {
    intent: {
      state: {
        evidence_need:
          "Transaction-level stablecoin evidence around market stress events before 2020.",
      },
    },
  });
  const answers = block(withNeed, "how_it_answers");
  assert.ok(answers);
  assert.equal(
    answers.need,
    "Transaction-level stablecoin evidence around market stress events before 2020.",
  );
  assert.equal(answers.source, "intent.state.evidence_need");
});

test("the live durable intent record supplies the research need it actually stores", () => {
  const row = { title: "Taiwan governance archive", collect_via: "mops_tw" };

  const fromIntent = card(row, {
    intent: { id: "intent_1", research_need: "Point-in-time governance records for Taiwan firms." },
  });
  assert.equal(
    block(fromIntent, "how_it_answers").need,
    "Point-in-time governance records for Taiwan firms.",
  );
  assert.equal(block(fromIntent, "how_it_answers").source, "intent.research_need");

  const fromRecord = card(row, {
    intent: {
      intent: { id: "intent_1", state: { collection: { job_id: "job_9" } } },
      researchNeed: "Point-in-time governance records for Taiwan firms.",
    },
  });
  assert.equal(
    block(fromRecord, "how_it_answers").need,
    "Point-in-time governance records for Taiwan firms.",
  );
  assert.equal(block(fromRecord, "how_it_answers").source, "record.researchNeed");
  assert.equal(block(fromRecord, "how_we_build").steps.at(-1).detail, "job_9");
});

test("offering marketing copy never becomes the researcher question", () => {
  const built = card({
    title: "GDELT evidence offering 5",
    description: "country-day news intensity; entity-resolved news features.",
    recommended_use: "Great for measuring attention around de-peg events.",
  });

  assert.equal(block(built, "how_it_answers"), null);
});

test("acquisition path is the declared route and stops at the request boundary", () => {
  const built = card({
    title: "Taiwan governance archive",
    collect_via: "mops_tw",
    grain: "entity-date",
  });

  const build = block(built, "how_we_build");
  assert.ok(build);
  assert.deepEqual(
    build.steps.map((s) => s.label),
    ["Collection route declared", "Normalize to entity-date"],
  );
  assert.equal(build.steps.every((s) => s.evidence === "declared"), true);
  assert.match(build.boundary, /no acquisition request has been created yet/i);
});

test("verify and register enter the path only when a collection job is recorded", () => {
  const built = card(
    { title: "Taiwan governance archive", collect_via: "mops_tw", grain: "entity-date" },
    { intent: { state: { collection: { job_id: "job_123" } } } },
  );

  const build = block(built, "how_we_build");
  assert.deepEqual(
    build.steps.map((s) => s.label),
    ["Collection route declared", "Normalize to entity-date", "Verify + register"],
  );
  assert.equal(build.steps.at(-1).evidence, "measured");
  assert.equal(build.steps.at(-1).detail, "job_123");
  assert.equal(build.boundary, "");
});

test("source check access is unknown when nothing declares or observes a route", () => {
  const built = card({ title: "Reference-only record" });
  const check = block(built, "source_check");

  assert.ok(check);
  assert.equal(check.row.source, "Not described");
  assert.equal(check.row.access, "unknown");
  assert.equal(check.row.coverage, "unknown");
  assert.equal(check.row.nextCheck, "Inspect schema / fields");
});

test("source inspection probes a reachable endpoint before asking for missing schema", () => {
  const row = {
    title: "Taiwan governance archive",
    candidate_key: "source:taiwan-gov",
    source: "Government web records",
    access_mode: "direct_file",
    coverage: "2015–2026",
    url: "https://example.test/archive",
  };

  const declared = card(row);
  assert.equal(block(declared, "source_check").row.access, "proposed");
  assert.equal(block(declared, "source_check").row.coverage, "2015–2026");
  assert.equal(block(declared, "source_check").row.nextCheck, "Probe source endpoint");

  const probed = card(row, {
    probeState: {
      result: {
        candidate_key: "source:taiwan-gov",
        http_status: 200,
        resolved_url: "https://example.test/archive",
      },
    },
  });
  const probedRow = block(probed, "source_check").row;
  assert.equal(probedRow.access, "observed");
  assert.match(probedRow.accessDetail, /HTTP endpoint responded \(200\)/);
  assert.equal(probedRow.nextCheck, "Inspect schema / fields");
});

test("source check translates registry access tokens into researcher-facing language", () => {
  const built = card({
    title: "TWSE Open API",
    source: "Taiwan Stock Exchange",
    source_access_mode: "materialized_instant",
  });
  const check = block(built, "source_check");

  assert.equal(check.row.access, "proposed");
  assert.equal(check.row.accessDetail, "Direct collection");
  assert.doesNotMatch(check.row.accessDetail, /_/);
});

test("still unknown mirrors the measured unknowns and is never emptied for polish", () => {
  const built = card({ title: "GDELT offering", collect_via: "an API query" });
  const unknown = block(built, "still_unknown");

  assert.ok(unknown.items.length);
  assert.ok(unknown.items.includes("Source endpoint not probed"));
  assert.equal(omitted(built, "still_unknown"), null);
});

test("next valid action is the supported primary action, never a fabricated promise", () => {
  const row = { title: "SEC EDGAR offering", collect_via: "a file manifest" };
  const evaluation = buildDiscoverEvaluation(row, new Set(), null);
  const built = buildDiscoverStrategyCard(row, evaluation);

  assert.deepEqual(built.nextValidAction, evaluation.actions.primary);
  assert.equal(/will |guarantee|automatically/i.test(built.nextValidAction.label), false);

  const overridden = buildDiscoverStrategyCard(row, evaluation, {
    primaryAction: { id: "review_approval", label: "Review approval" },
  });
  assert.deepEqual(overridden.nextValidAction, { id: "review_approval", label: "Review approval" });
});

test("the card carries no withdrawn discover-centre vocabulary", () => {
  const serialized = JSON.stringify(
    card(
      {
        title: "Taiwan governance archive",
        source: "Government web records",
        collect_via: "mops_tw",
        grain: "entity-date",
        coverage: "2015–2026",
        access_mode: "direct_file",
      },
      { intent: { state: { evidence_need: "Point-in-time governance records." } } },
    ),
  ).toLowerCase();

  for (const phrase of WITHDRAWN_STRATEGY_VOCABULARY) {
    assert.equal(serialized.includes(phrase.toLowerCase()), false, `leaked: ${phrase}`);
  }
});
