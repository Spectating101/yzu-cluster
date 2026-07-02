/** Browse row state pills — frozen in WIREFRAME_V2_FROZEN.md */

function lower(value) {
  return String(value || "").toLowerCase();
}

function isInLab(row, labIds) {
  const id = row?.dataset_id || row?.id;
  return Boolean((id && labIds?.has?.(id)) || row?.local_ready || row?.in_vault || row?.local_root);
}

function isQueued(row) {
  return Boolean(row?.queued || row?.stage === "queued" || row?.procureability === "queued");
}

function isOpenAccess(row) {
  const text = lower(`${row?.license || ""} ${row?.access || ""} ${row?.access_mode || ""}`);
  return /open|public|government|cc-|creative commons|free/.test(text);
}

function accessLabel(row) {
  if (isInLab(row)) return "Vaulted";
  if (isOpenAccess(row)) return "Public";
  if (row?.license) return row.license;
  if (row?.access_mode || row?.access) return row.access_mode || row.access;
  return "Needs terms check";
}

function probeLabel(row, labIds) {
  if (isInLab(row, labIds)) return "Archived";
  if (isQueued(row)) return "Plan queued";
  if (row?.probe_state) return row.probe_state;
  if (row?.collect_via || row?.source_route) return "Connector ready";
  if (row?.doi || row?.url) return "Probe needed";
  return "Registry only";
}

function fitLabel(row) {
  if (row?.fit_label) return row.fit_label;
  if (row?.fit_score != null) return `${Math.round(Number(row.fit_score) * 100)}% fit`;
  const text = lower(`${row?.title || ""} ${row?.description || ""} ${row?.grain || ""} ${row?.source || ""}`);
  if (/filing|financial|issuer|mops|twse|governance/.test(text)) return "Faculty finance fit";
  if (/incident|stablecoin|crypto|defi/.test(text)) return "Faculty crypto fit";
  if (/registry|doi|datacite/.test(text)) return "Source-discovery fit";
  return "Needs fit review";
}

function destinationLabel(row) {
  return row?.destination || row?.vault_target || "Lab root";
}

export function discoverCandidateState(row, labIds) {
  const inLab = isInLab(row, labIds);
  const queued = isQueued(row);
  const probe = probeLabel(row, labIds);
  const stage = inLab
    ? { key: "in_lab", label: "In lab", className: "lab" }
    : queued
      ? { key: "queued", label: "Queued", className: "queue" }
      : /connector ready|probe needed/i.test(probe)
        ? { key: "probe_ready", label: "Probe ready", className: "ext" }
        : { key: "external", label: "External", className: "ext" };

  return {
    ...stage,
    access: accessLabel(row),
    fit: fitLabel(row),
    probe,
    destination: destinationLabel(row),
    nextAction: inLab ? "Open in Library" : queued ? "Review queued job" : "Probe and add to lab",
  };
}

export function browseRowState(row, labIds) {
  const state = discoverCandidateState(row, labIds);
  return { label: state.label, className: state.className };
}

export function decorateDiscoverCandidate(row, labIds) {
  const state = discoverCandidateState(row, labIds);
  const description = [state.access, state.fit, state.probe].filter(Boolean).join(" · ");
  return {
    ...row,
    discover_state: state,
    description: row?.description ? `${row.description} · ${description}` : description,
  };
}

export function discoverStageCounts(rows, labIds) {
  const counts = { total: rows.length, probeReady: 0, queued: 0, inLab: 0, external: 0 };
  for (const row of rows) {
    const state = discoverCandidateState(row, labIds);
    if (state.key === "probe_ready") counts.probeReady += 1;
    else if (state.key === "queued") counts.queued += 1;
    else if (state.key === "in_lab") counts.inLab += 1;
    else counts.external += 1;
  }
  return counts;
}
