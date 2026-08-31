/**
 * Pick the inventory that the running desk has reconciled for this request.
 *
 * Resources used to prefer the cluster's nested platform snapshot. That
 * snapshot can lag the registry reconciliation that powers Library and the
 * current rollup, producing a confident but obsolete estate count. The live
 * inventory is the authority whenever it is available; older contracts remain
 * a deliberate fallback for degraded/legacy desk responses.
 */
export function researchEstateSummary(rollup, cluster, catalogSummary) {
  const inventory = rollup?.inventory && typeof rollup.inventory === "object" ? rollup.inventory : null;
  const totals = inventory?.totals && typeof inventory.totals === "object" ? inventory.totals : {};
  const readiness = inventory?.by_materialization_query_ready?.visible_to_desk ||
    inventory?.by_materialization_query_ready?.registered ||
    {};
  const platform = cluster?.platform_state || cluster || {};

  return {
    // The researcher-facing Resources surface excludes operational/test cards,
    // matching the rollup's `visible_to_desk` contract.
    registered: totals.visible_to_desk ?? totals.registered ?? platform.registry_datasets ?? catalogSummary?.registry_datasets,
    // This is materialisation/query authority, not the looser `instant`
    // analysis-readiness count carried by older platform snapshots.
    queryReady: readiness.true ?? readiness["true"] ?? platform.query_ready_datasets ?? catalogSummary?.query_ready_datasets,
    partitions: inventory?.partitions?.total ?? platform.professor_partitions ?? catalogSummary?.partitions,
    inventoryBacked: Boolean(inventory),
  };
}
