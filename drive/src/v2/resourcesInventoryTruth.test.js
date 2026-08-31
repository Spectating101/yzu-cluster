import test from "node:test";
import assert from "node:assert/strict";
import { researchEstateSummary } from "./resourcesInventoryTruth.js";

test("live reconciled inventory wins over a stale nested platform snapshot", () => {
  const summary = researchEstateSummary(
    {
      inventory: {
        totals: { registered: 168, visible_to_desk: 164 },
        by_materialization_query_ready: { visible_to_desk: { true: 92 } },
        partitions: { total: 15 },
      },
    },
    { platform_state: { registry_datasets: 158, instant_datasets: 94, professor_partitions: 24 } },
    { registry_datasets: 168 },
  );

  assert.deepEqual(summary, { registered: 164, queryReady: 92, partitions: 15, inventoryBacked: true });
});

test("legacy Resources responses retain their explicit fallback path", () => {
  const summary = researchEstateSummary(
    null,
    { platform_state: { registry_datasets: 158, query_ready_datasets: 91, professor_partitions: 24 } },
    { registry_datasets: 168 },
  );

  assert.deepEqual(summary, { registered: 158, queryReady: 91, partitions: 24, inventoryBacked: false });
});
