import { useState } from "react";

function routeStatus(job = {}) {
  const status = String(job.status || "unknown").toLowerCase();
  if (status === "failed" || status === "cancelled" || status === "pending_approval") return { group: "attention", label: status === "pending_approval" ? "Needs approval" : "Needs attention" };
  if (status === "running" || status === "queued") return { group: "active", label: "Collecting" };
  if (job?.request?.schedule_id) return { group: "scheduled", label: "Scheduled" };
  const registered = job.registered_dataset_id || job.result?.dataset_id || job.result?.drive_finalize?.archives?.length;
  return { group: "complete", label: registered ? "Registered" : "Completed" };
}

function routeTitle(job = {}) {
  return job.title || job.plan?.title || job.request?.schedule_id || "Collection route";
}

function routeSource(job = {}) {
  return job.plan?.connector_id || job.request?.connector_id || job.request?.schedule_id || job.plan?.job_type || "Source route";
}

function routeDestination(job = {}) {
  return job.result?.drive_finalize?.archives?.[0]?.remote_suffix || job.result?.dataset_id || job.registered_dataset_id || "Library destination pending";
}

function routeTime(job = {}) {
  const raw = job.updated_at || job.created_at;
  if (!raw) return "Time not reported";
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? String(raw) : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function routeGroups(jobs) {
  const groups = [
    ["attention", "Needs attention", "Failures or approvals that change what the lab can collect."],
    ["active", "Collecting now", "Work that is queued or currently running."],
    ["scheduled", "Scheduled / monitored", "Recurring collection routes and their latest run."],
    ["complete", "Completed collection", "Recent routes, including assets already registered to the lab."],
  ];
  return groups
    .map(([id, title, description]) => ({ id, title, description, rows: jobs.filter((job) => routeStatus(job).group === id) }))
    .filter((group) => group.rows.length);
}

function RouteDetail({ job, onClose, onAskRoute }) {
  return (
    <aside className="rd-v2-route-detail" aria-live="polite">
      <div className="rd-v2-route-detail-head"><div><p>Selected route</p><h3>{routeTitle(job)}</h3></div><button type="button" aria-label="Close route detail" onClick={onClose}>×</button></div>
      <dl>
        <div><dt>Current state</dt><dd>{routeStatus(job).label}</dd></div>
        <div><dt>Source route</dt><dd className="mono">{routeSource(job)}</dd></div>
        <div><dt>Library destination</dt><dd className="mono">{routeDestination(job)}</dd></div>
        <div><dt>Latest event</dt><dd>{job.events?.at(-1)?.message || job.error || "No event reported"}</dd></div>
      </dl>
      {job.error ? <p className="rd-v2-route-error">{job.error}</p> : null}
      <div className="rd-v2-route-detail-actions"><button type="button" className="rd-v2-btn sm primary" onClick={() => onAskRoute?.(job)}>Ask about this route</button></div>
    </aside>
  );
}

export function DiscoverRoutes({ jobs = [], onAskRoute }) {
  const groups = routeGroups(Array.isArray(jobs) ? jobs : []);
  const [selectedId, setSelectedId] = useState("");

  return (
    <section className="rd-v2-routes" data-testid="discover-routes-mode">
      <header className="rd-v2-routes-intro">
        <div>
          <p>Collection routes</p>
          <h2>Evidence entering the lab</h2>
          <span>Collection state and Library destination, without exposing connector administration.</span>
        </div>
        <strong>{jobs.length} tracked</strong>
      </header>

      {groups.length ? (
        <div className="rd-v2-routes-groups">
          {groups.map((group) => (
            <section key={group.id} className="rd-v2-route-group" aria-label={group.title}>
              <header><div><h3>{group.title}</h3><p>{group.description}</p></div><span>{group.rows.length}</span></header>
              <div className="rd-v2-route-list">
                {group.rows.slice(0, 6).map((job) => {
                  const selectedRow = selectedId === job.id;
                  return (
                    <div key={job.id} className="rd-v2-route-item">
                      <button data-testid="discover-route-row" type="button" className={selectedRow ? "is-selected" : ""} onClick={() => setSelectedId(selectedRow ? "" : job.id)}>
                        <span className={`rd-v2-route-state is-${routeStatus(job).group}`} />
                        <span><strong>{routeTitle(job)}</strong><small>{routeSource(job)} · {routeTime(job)}</small></span>
                        <em>{routeStatus(job).label}</em>
                      </button>
                      {selectedRow ? <RouteDetail job={job} onClose={() => setSelectedId("")} onAskRoute={onAskRoute} /> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : <p className="rd-v2-routes-empty">No collection routes have been recorded yet. Explore evidence first, then approve a source route when it is needed.</p>}
    </section>
  );
}
