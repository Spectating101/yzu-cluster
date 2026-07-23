/** Library intake capability honesty — only fields present on existing FE adapters. */

/**
 * Server staging is considered present when the resources rollup reports
 * `usage.staging_disk_free_gb`. Absence means local upload must stay unavailable.
 */
export function serverStagingPresent(resourcesRollup) {
  if (!resourcesRollup || resourcesRollup._placeholder) return false;
  const free = resourcesRollup?.usage?.staging_disk_free_gb;
  return free != null && Number.isFinite(Number(free));
}

export function libraryUploadCapability(resourcesRollup) {
  const staging = serverStagingPresent(resourcesRollup);
  return {
    stagingPresent: staging,
    uploadAvailable: staging,
    uploadLabel: staging ? "Upload file..." : "Upload unavailable (no server staging)",
    uploadHint: staging
      ? "Stage local files to controller staging, then hand ingestion to Ask."
      : "Local file upload stays unavailable until the desk reports controller staging.",
  };
}

export function libraryUrlIntakeCapability() {
  return {
    available: true,
    label: "Add URL / DOI...",
    promise:
      "Ask-assisted draft only until a durable backend intake job id exists — never a fake vault registration success.",
    submitLabel: "Queue draft intake",
  };
}
