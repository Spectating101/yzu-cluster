/**
 * Discover result taxonomy (D1).
 *
 * Machine keys → human labels:
 *   local-query-ready      → In lab · Query ready
 *   local-connected        → In lab · Connected
 *   local-metadata         → In lab · Metadata only
 *   external-discoverable  → External · Available to inspect
 *   external-probed        → External · Probed
 *   external-acquirable    → External · Acquisition available
 *   external-unavailable   → External · Acquisition unavailable
 *   licensed-manual        → Licensed / manual access
 *
 * Precedence (first match wins):
 * 1. local-query-ready — lab holding + explicit query readiness
 * 2. local-connected — lab holding + storage/path connection, not query-ready
 * 3. local-metadata — lab/registry membership without connection or query path
 * 4. licensed-manual — explicit entitlement/manual/licensed signal
 * 5. external-unavailable — explicit inaccessible/unsupported acquisition
 * 6. external-acquirable — explicit collect route / connector (URL alone is not enough)
 * 7. external-probed — candidate-bound probe evidence on the row
 * 8. external-discoverable — default external inspectable candidate
 *
 * Unknown/missing fields never invent readiness, probe, or acquisition.
 * Group order for lists: 1 → 2 → 3 → 4 (see TAXONOMY.group); API order preserved within group.
 */

export const TAXONOMY = {
  "local-query-ready": {
    label: "In lab · Query ready",
    possession: "In lab",
    readiness: "Query ready",
    className: "lab",
    group: 1,
    filter: ["in_lab", "query_ready"],
  },
  "local-connected": {
    label: "In lab · Connected",
    possession: "In lab",
    readiness: "Connected",
    className: "lab",
    group: 2,
    filter: ["in_lab"],
  },
  "local-metadata": {
    label: "In lab · Metadata only",
    possession: "In lab",
    readiness: "Metadata only",
    className: "lab",
    group: 2,
    filter: ["in_lab"],
  },
  "external-discoverable": {
    label: "External · Available to inspect",
    possession: "External",
    readiness: "Available to inspect",
    className: "ext",
    group: 3,
    filter: ["external"],
  },
  "external-probed": {
    label: "External · Probed",
    possession: "External",
    readiness: "Probed",
    className: "ext",
    group: 3,
    filter: ["external"],
  },
  "external-acquirable": {
    label: "External · Acquisition available",
    possession: "External",
    readiness: "Acquisition available",
    className: "ext",
    group: 3,
    filter: ["external"],
  },
  "external-unavailable": {
    label: "External · Acquisition unavailable",
    possession: "External",
    readiness: "Acquisition unavailable",
    className: "warn",
    group: 4,
    filter: ["external", "needs_access"],
  },
  "licensed-manual": {
    label: "Licensed / manual access",
    possession: "Licensed",
    readiness: "Manual access",
    className: "warn",
    group: 4,
    filter: ["needs_access"],
  },
};

function lower(value) {
  return String(value || "").toLowerCase();
}

function trim(value) {
  return String(value ?? "").trim();
}

/** Lab-owned / registry-local possession. */
export function isLocalHolding(row, labIds) {
  if (!row || typeof row !== "object") return false;
  const id = row.dataset_id || row.id;
  if (id && labIds?.has?.(id)) return true;
  if (row.local_ready || row.in_vault || row.local_root) return true;
  const kind = lower(row.kind);
  if (kind === "local_registry" || kind === "lab") return true;
  if (row.local === true || row.in_lab === true) return true;
  return false;
}

/**
 * Explicit query readiness — not inferred from a URL or title.
 * Missing readiness → not query-ready.
 */
export function isQueryReady(row) {
  if (!row || typeof row !== "object") return false;
  if (row.query_ready === true || row.queryable === true) return true;
  const readiness = lower(row.analysis_readiness || row.readiness);
  if (readiness === "instant" || readiness === "query_ready" || readiness === "queryable") return true;
  const caps = row.capabilities;
  if (Array.isArray(caps) && caps.some((c) => /query|filter|sql|panel/i.test(String(c)))) {
    return true;
  }
  return false;
}

/** Known storage/source connection without proven query path. */
export function isLocalConnected(row) {
  if (!row || typeof row !== "object") return false;
  if (row.local_ready || row.local_root || row.local_path || row.in_vault) return true;
  const access = lower(row.access_shape || row.source_access_mode || "");
  if (access.includes("materialized") || access.includes("local_file") || access.includes("connected")) {
    return true;
  }
  return false;
}

/**
 * Licensed / manual / entitlement — requires an explicit signal.
 * Do not infer from a generic license string alone unless it clearly marks restricted access.
 */
export function isLicensedManual(row) {
  if (!row || typeof row !== "object") return false;
  if (row.manual_access === true || row.requires_manual === true) return true;
  const mode = lower(row.access_mode || row.acquisition_mode || row.entitlement);
  if (/licensed|manual|entitlement|restricted|paywall|login_required|credential/.test(mode)) return true;
  const procure = lower(row.procureability || row.procureability_label);
  if (/manual|licensed|entitlement|restricted|unavailable_without/.test(procure)) return true;
  const license = lower(row.license);
  if (/all rights reserved|proprietary|commercial license|requires approval/.test(license)) return true;
  return false;
}

/** Explicit inaccessible / unsupported acquisition — never from a missing optional field. */
export function isAcquisitionUnavailable(row) {
  if (!row || typeof row !== "object") return false;
  if (row.acquisition_available === false || row.collectable === false) return true;
  const mode = lower(row.access_mode || row.acquisition_mode);
  if (/inaccessible|unsupported|blocked|forbidden|unavailable/.test(mode)) return true;
  const procure = lower(row.procureability || row.procureability_label);
  if (/^unavailable$|not collectable|cannot collect|blocked/.test(procure)) return true;
  return false;
}

/**
 * Explicit collection route / connector capable of submission.
 * A bare URL is not enough.
 */
export function hasAcquisitionRoute(row) {
  if (!row || typeof row !== "object") return false;
  if (row.acquisition_available === true || row.collectable === true) return true;
  if (trim(row.connector_id) || trim(row.probe_connector_id)) return true;
  if (trim(row.collect_via) || trim(row.source_route)) return true;
  const connector = row.connector;
  if (connector && (connector.connector_id || connector.id)) return true;
  const procure = lower(row.procureability || row.procureability_label);
  if (/collect|manifest|connector|queue|acquir/.test(procure) && !/unavail|manual|licens/.test(procure)) {
    return true;
  }
  return false;
}

/** Candidate-bound probe evidence on the row (not a global stale probe). */
export function hasBoundProbe(row) {
  if (!row || typeof row !== "object") return false;
  if (row.probe_snapshot || row.probe_result) return true;
  if (trim(row.probe_state) && !/needed|pending|none/i.test(String(row.probe_state))) return true;
  if (row.probed === true) return true;
  return false;
}

/**
 * @returns {{ key: string, label: string, possession: string, readiness: string, className: string, group: number }}
 */
export function classifyDiscoverResult(row, labIds) {
  const meta = (key) => {
    const t = TAXONOMY[key];
    return {
      key,
      label: t.label,
      possession: t.possession,
      readiness: t.readiness,
      className: t.className,
      group: t.group,
    };
  };

  if (isLocalHolding(row, labIds)) {
    if (isQueryReady(row)) return meta("local-query-ready");
    if (isLocalConnected(row)) return meta("local-connected");
    return meta("local-metadata");
  }

  if (isLicensedManual(row)) return meta("licensed-manual");
  if (isAcquisitionUnavailable(row)) return meta("external-unavailable");
  if (hasAcquisitionRoute(row)) return meta("external-acquirable");
  if (hasBoundProbe(row)) return meta("external-probed");
  return meta("external-discoverable");
}

export function taxonomyMatchesFilter(classification, filterId) {
  if (!filterId || filterId === "all") return true;
  const t = TAXONOMY[classification.key];
  return Boolean(t?.filter?.includes(filterId));
}

/**
 * Group by taxonomy, preserve relative API order within each group.
 * @param {object[]} rows
 * @param {Set} labIds
 */
export function orderDiscoverResults(rows, labIds) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const decorated = rows.map((row, index) => ({
    row,
    index,
    classification: classifyDiscoverResult(row, labIds),
  }));
  decorated.sort((a, b) => {
    if (a.classification.group !== b.classification.group) {
      return a.classification.group - b.classification.group;
    }
    return a.index - b.index;
  });
  return decorated.map((d) => ({
    ...d.row,
    discover_taxonomy: d.classification,
  }));
}

export function taxonomyStageCounts(rows, labIds) {
  const counts = {
    total: rows.length,
    inLab: 0,
    queryReady: 0,
    external: 0,
    needsAccess: 0,
    probed: 0,
    acquirable: 0,
  };
  for (const row of rows) {
    const c = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
    if (c.key.startsWith("local-")) counts.inLab += 1;
    if (c.key === "local-query-ready") counts.queryReady += 1;
    if (c.key.startsWith("external-") || c.key === "licensed-manual") counts.external += 1;
    if (c.key === "licensed-manual" || c.key === "external-unavailable") counts.needsAccess += 1;
    if (c.key === "external-probed") counts.probed += 1;
    if (c.key === "external-acquirable") counts.acquirable += 1;
  }
  return counts;
}
