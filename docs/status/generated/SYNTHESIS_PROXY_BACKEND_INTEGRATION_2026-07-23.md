# Synthesis proxy-design backend integration — 2026-07-23

## Product authority

Faculty-facing Synthesis is a proxy-measurement and derived-dataset construction workspace:

```text
target construct
→ controlled source datasets and analytical roles
→ recommended proxy recipe
→ alternative recipes and validity tradeoffs
→ accepted synthesis recipe
→ bounded preview
→ governed build
→ verified and registered Library asset
```

`Research Construction` remains the durable backend ontology. The interface must not collapse the product into generic study management or make Discover the default response to an imperfect direct measure.

## Proven current backend capability

The current repository and synthesis cleanliness audit prove:

- durable Synthesis thread create/list/get;
- explicit proposal acceptance with proposal identity/hash;
- revision-bound execution specification storage;
- governed execution request and approval lifecycle;
- real executor transforms including hydration, filter, join, select, aggregation, and output materialisation;
- Drive/archive and registry proof after successful execution;
- honest materialisation states (`not_materialised`, `registered`, `query_ready` remain distinct);
- Discover handoff and collection submission for resolvable missing evidence;
- reload persistence and execution polling;
- registered output opening in Library.

## Not yet proven as canonical S-04 capability

The repository does not yet prove a complete generalized API for:

- structured intent interpretation attached to the durable thread;
- one recommended proxy design with evidence roles and validity profile;
- queryable alternative proxy designs;
- accepted-construction identity separate from method acceptance;
- generalized semantic-method compiler endpoint;
- supported/unsupported operation classification for arbitrary recipes;
- bounded preview endpoint with sample rows, field lineage, missingness, match rates, leakage checks, and interpreted warnings;
- durable structured comparison scores for conceptual fidelity, coverage, temporal precision, reproducibility, leakage risk, and assumptions.

The existing audit explicitly describes the implemented ceiling as a gated workspace with curated profiles rather than open LLM-invented joins.

## Frontend compatibility contract

The proxy-first frontend consumes these fields when supplied:

```json
{
  "state": {
    "recommendation": {
      "recommendation_id": "rec_...",
      "title": "Control-event proxy",
      "construct": {
        "name": "Controlling-ownership regime, firm-month",
        "description": "...",
        "construct_boundary": "proxy, not direct monthly ownership"
      },
      "evidence_roles": [
        {
          "dataset_id": "...",
          "semantic_role": "treatment anchor",
          "contribution": "...",
          "grain": "firm-year",
          "coverage": "2015–2025",
          "availability": "registered"
        }
      ],
      "unavailable_ideal_evidence": [
        {"id": "...", "label": "...", "reason": "..."}
      ],
      "method_outline": ["..."],
      "expected_output": {
        "dataset_id": "...",
        "grain": "firm × month",
        "coverage": "2015–2025",
        "destination": "Library"
      },
      "why_recommended": ["..."],
      "main_limitation": "...",
      "validity_profile": {
        "conceptual_fidelity": "high|medium|low",
        "coverage": "high|medium|low",
        "temporal_precision": "high|medium|low",
        "reproducibility": "high|medium|low",
        "leakage_risk": "high|medium|low"
      },
      "alternatives": []
    },
    "accepted_construction": {},
    "method_spec": {},
    "compiled_plan": null,
    "preview": null,
    "execution_spec": null,
    "execution": null
  }
}
```

## Truth behavior

When structured recommendation or alternatives are absent, the frontend must say they have not been generated. It must not derive validity scores, claim executable support, or invent alternative recipes from labels alone.

When an execution specification already exists, the frontend may show the current executable recipe and its actual operations, while clearly stating that structured construct-validity tradeoffs are not recorded.

Discover remains a secondary escalation path when additional evidence would materially improve the proxy or no defensible recipe exists.

## Grok integration priority

1. Persist `state.recommendation` and `state.alternative_constructions` on the durable thread.
2. Add accepted-construction identity and revision semantics.
3. Return evidence roles and unavailable ideal evidence from structured interpretation/recommendation.
4. Implement compiler capability truth before exposing arbitrary recipes as executable.
5. Implement bounded preview and diagnostics as real execution, not a full build renamed preview.
6. Preserve the existing proposal-hash, approval, execution, archive, registry, and query-readiness truth contracts.
