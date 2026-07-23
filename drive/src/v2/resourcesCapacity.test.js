import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCapacityAccessPairs,
  groupSourceCapabilities,
  providerIdentityMark,
} from "./resourcesCapacity.js";

test("empty rollup capacity meters stay truthful (no fabricated headroom)", () => {
  const pairs = buildCapacityAccessPairs({});
  const vault = pairs.find((p) => p.id === "storage")?.meters.find((m) => m.id === "vault");
  assert.ok(vault);
  assert.match(String(vault.metric), /NOT OBSERVED|capacity/i);
  assert.equal(vault.pct, null);
});

test("provider identity mark uses deterministic initials for known curated sources", () => {
  const mark = providerIdentityMark({
    kind: "source",
    key: "source-sec_edgar",
    label: "SEC EDGAR",
    manifest: { id: "sec_edgar", label: "SEC EDGAR" },
  });
  assert.deepEqual(mark, {
    text: "SE",
    title: "SEC EDGAR",
    label: "Provider SEC EDGAR",
  });
});

test("provider identity mark is omitted for layers and unknown rows", () => {
  assert.equal(
    providerIdentityMark({
      kind: "layer",
      key: "layer-registry_catalog",
      label: "Registry catalog",
    }),
    null,
  );
  assert.equal(providerIdentityMark({ label: "Mystery feed" }), null);
  assert.equal(providerIdentityMark(null), null);
});

test("source capability grouping preserves row for identity marks", () => {
  const families = groupSourceCapabilities([
    {
      rows: [
        {
          kind: "source",
          key: "source-lseg_edp",
          label: "LSEG Workspace / EDP (YZU seat)",
          metric: "entitlement probes",
          manifest: { id: "lseg_edp", label: "LSEG Workspace / EDP (YZU seat)" },
        },
      ],
    },
  ]);
  assert.equal(families[0].rows[0].name, "LSEG Workspace / EDP (YZU seat)");
  assert.ok(families[0].rows[0].row?.manifest?.id);
  const mark = providerIdentityMark(families[0].rows[0].row);
  assert.equal(mark?.text, "LW");
});
