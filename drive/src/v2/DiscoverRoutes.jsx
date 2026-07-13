import { useEffect, useMemo, useState } from "react";

function value(input, fallback = "Not specified") {
  const text = String(input ?? "").trim();
  return text || fallback;
}

function routeTitle(job = {}) {
  return job.title || job.plan?.title || job.request?.schedule_id || "Collection route";
}

function routeTime(job = {}) {
  const raw = job.updated_at || job.created_at;
  if (!raw) return "Time not reported";
  const date = new Date(raw);
  return Number.isNaN(date.valueOf())
    ? String(raw)
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function routeId(job = {}) {
  return String(job.id || `${routeTitle(job)}-${routeTime(job)}`);
}

function registeredDatasetId(job = {}) {
  return value(
    job.registered_dataset_id ||
      job.result?.registered_dataset_id ||
      (Array.isArray(job.result?.registry_promotion)
        ? job.result.registry_promotion.find((row) => row?.dataset_id)?.dataset_id
        : ""),
    "",
  );
}

function driveArchive(job = {}) {
  const archives = Array.isArray(job.result?.drive_finalize?.archives)
    ? job.result.drive_finalize.archives
    : [];
  return archives.find((row) => row?.remote_suffix || row?.remote || row?.path) || null;
}

function routeStatus(job = {}) {
  const status = String(job.status || "unknown").toLowerCase();
  if (status === "failed" || status === "cancelled") {
    return {
      group: "attention",
      label: status === "failed" ? "Needs attention" : "Cancelled",
      tone: "danger",
    };
  }
  if (status === "pending_approval") {
    return { group: "attention", label: "Needs approval", tone: "warn" };
  }
  if (status === "running" || status === "queued") {
    return {
      group: "active",
      label: status === "running" ? "Collecting" : "Queued",
      tone: "active",
    };
  }
  if (job?.request?.schedule_id && !["completed", "failed", "cancelled"].includes(status)) {
    return { group: "scheduled", label: "Scheduled", tone: "muted" };
  }
  const registered = registeredDatasetId(job);
  if (registered) return { group: "registered", label: "Registered", tone: "ready" };
  if (driveArchive(job)) {
    return { group: "pending", label: "Archived · registration pending", tone: "warn" };
  }
  if (status === "completed" || status === "succeeded") {
    return {
      group: "pending",
      label: "Collection complete · registration pending",
      tone: "warn",
    };
  }
  return { group: "unknown", label: "State unverified", tone: "muted" };
}

function routeSource(job = {}) {
  return (
    job.plan?.connector_id ||
    job.request?.connector_id ||
    job.connector_id ||
    job.request?.schedule_id ||
    job.plan?.job_type ||
    "Source route not specified"
  );
}

function routeDestination(job = {}) {
  const registered = registeredDatasetId(job);
  if (registered) return registered;
  const archive = driveArchive(job);
  if (archive) {
    return value(archive.remote_suffix || archive.remote || archive.path, "Drive archive recorded");
  }
  return job.result?.dataset_id || job.plan?.output_dataset_id || "Library destination pending";
}

function routeScope(job = {}) {
  const request = job.request || {};
  const parts = [
    request.limit != null ? `${request.limit} item limit` : null,
    request.dataset_id ? `dataset ${request.dataset_id}` : null,
    request.doi ? `DOI ${request.doi}` : null,
    request.candidate_key ? `candidate ${request.candidate_key}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Collection scope not specified";
}

function routeAccess(job = {}) {
  const status = String(job.status || "").toLowerCase();
  if (status === "pending_approval") return "Human approval required before execution";
  if (["queued", "running", "completed"].includes(status)) return "Execution approval recorded";
  if (status === "failed") return "Review failure before retrying";
  return job.plan?.license || job.request?.license || "Access terms not recorded";
}

function routeRefresh(job = {}) {
  if (job.request?.schedule_id) return `Scheduled route · ${job.request.schedule_id}`;
  if (job.plan?.refresh_strategy) return job.plan.refresh_strategy;
  if (job.request?.refresh_strategy) return job.request.refresh_strategy;
  return "One-time collection unless a refresh plan is approved";
}

function routeEvidence(job = {}) {
  const latest = job.events?.at(-1)?.message || job.error || job.result?.message;
  if (latest) return latest;
  const manifest =
    job.output_manifest_id || job.result?.output_manifest_id || job.result?.manifest_id;
  if (manifest) return `Output manifest ${manifest}`;
  return "No execution evidence reported yet";
}

function routeGroups(jobs) {
  const groups = [
    ["attention", "Needs attention", "Approval or recovery"],
    ["active", "In progress", "Queued or collecting"],
    ["scheduled", "Scheduled", "Recurring acquisition"],
    ["registered", "Registered", "Reusable Library assets"],
    ["pending", "Registration pending", "Output exists; identity unproven"],
    ["unknown", "State unresolved", "Evidence cannot verify the state"],
  ];
  return groups
    .map(([id, title, description]) => ({
      id,
      title,
      description,
      rows: jobs.filter((job) => routeStatus(job).group === id),
    }))
    .filter((group) => group.rows.length);
}

function summaryCounts(jobs) {
  const counts = { attention: 0, active: 0, registered: 0, pending: 0 };
  for (const job of jobs) {
    const group = routeStatus(job).group;
    if (group in counts) counts[group] += 1;
  }
  return counts;
}

function summaryText(counts) {
  return [
    `${counts.attention} decision${counts.attention === 1 ? "" : "s"}`,
    `${counts.active} active`,
    `${counts.registered} registered`,
    `${counts.pending} pending`,
  ].join(" · ");
}

function FactRow({ label, children, mono = false }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

function RouteDetail({ job, onAskRoute }) {
  const state = routeStatus(job);
  const registered = registeredDatasetId(job);
  const archive = driveArchive(job);

  return (
    <aside className="rd-v2-acquisition-detail" aria-live="polite">
      <header className="rd-v2-acquisition-detail-head">
        <div className="rd-v2-acquisition-detail-title">
          <p>Selected route</p>
          <h3>{routeTitle(job)}</h3>
          <span className={`rd-v2-acquisition-status is-${state.tone}`}>{state.label}</span>
        </div>
        <button
          type="button"
          className="rd-v2-acquisition-ask"
          onClick={() => onAskRoute?.(job)}
        >
          Ask about route
        </button>
      </header>

      <dl className="rd-v2-acquisition-facts">
        <FactRow label="Source" mono>{routeSource(job)}</FactRow>
        <FactRow label="Access">{routeAccess(job)}</FactRow>
        <FactRow label="Scope">{routeScope(job)}</FactRow>
        <FactRow label="Refresh">{routeRefresh(job)}</FactRow>
        <FactRow label={registered ? "Registered asset" : archive ? "Drive archive" : "Destination"} mono>
          {routeDestination(job)}
        </FactRow>
        <FactRow label="Evidence">{routeEvidence(job)}</FactRow>
        <FactRow label="Updated">{routeTime(job)}</FactRow>
      </dl>

      {archive && !registered ? (
        <p className="rd-v2-route-warning">
          Drive archival is recorded, but this route remains unregistered until a registry dataset identity is reported.
        </p>
      ) : null}
      {job.error ? <p className="rd-v2-route-error">{job.error}</p> : null}
    </aside>
  );
}

function RouteList({ groups, selectedId, onSelect }) {
  return (
    <div className="rd-v2-acquisition-groups">
      {groups.map((group) => (
        <section key={group.id} className="rd-v2-route-group" aria-label={group.title}>
          <header>
            <div>
              <h3>{group.title}</h3>
              <p>{group.description}</p>
            </div>
            <span>{group.rows.length}</span>
          </header>

          <div className="rd-v2-route-list">
            {group.rows.slice(0, 8).map((job) => {
              const id = routeId(job);
              const selected = selectedId === id;
              const state = routeStatus(job);
              return (
                <button
                  key={id}
                  data-testid="discover-route-row"
                  type="button"
                  className={`rd-v2-acquisition-route${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(id)}
                >
                  <span className={`rd-v2-route-state is-${state.group}`} />
                  <span className="rd-v2-acquisition-row-copy">
                    <strong>{routeTitle(job)}</strong>
                    <small>{routeSource(job)} · {routeTime(job)}</small>
                    <small className="rd-v2-acquisition-row-meta">{routeScope(job)}</small>
                  </span>
                  <em>{state.label}</em>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DiscoverRoutes({ jobs = [], onAskRoute }) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const groups = useMemo(() => routeGroups(rows), [rows]);
  const counts = useMemo(() => summaryCounts(rows), [rows]);
  const orderedRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!orderedRows.length) {
      setSelectedId("");
      return;
    }
    if (!orderedRows.some((job) => routeId(job) === selectedId)) {
      setSelectedId(routeId(orderedRows[0]));
    }
  }, [orderedRows, selectedId]);

  const selectedJob = orderedRows.find((job) => routeId(job) === selectedId) || null;

  return (
    <section className="rd-v2-routes rd-v2-acquisition-workspace" data-testid="discover-routes-mode">
      <header className="rd-v2-acquisition-bar">
        <div>
          <strong>Acquisition plan</strong>
          <span>Choose a route, inspect the exact design, then act.</span>
        </div>
        <p>{summaryText(counts)}</p>
      </header>

      {groups.length ? (
        <div className="rd-v2-acquisition-layout">
          <section className="rd-v2-acquisition-list-pane" aria-label="Acquisition routes">
            <RouteList groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
          </section>
          {selectedJob ? (
            <RouteDetail job={selectedJob} onAskRoute={onAskRoute} />
          ) : (
            <aside className="rd-v2-acquisition-detail rd-v2-acquisition-detail-empty">
              <strong>Select a route to inspect its acquisition design.</strong>
            </aside>
          )}
        </div>
      ) : (
        <div className="rd-v2-routes-empty rd-v2-acquisition-empty">
          <strong>No acquisition plan has been submitted yet.</strong>
          <span>
            Explore evidence, evaluate a candidate, and submit an approval-gated route only when the lab genuinely needs new data.
          </span>
        </div>
      )}
    </section>
  );
}
