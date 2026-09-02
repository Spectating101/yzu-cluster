import "./discover-cockpit.css";

function text(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

function rowId(row) {
  return row?.dataset_id || row?.id || row?.candidate_key || row?.doi || row?.url || row?.title || row?.name || "";
}

function rowTitle(row) {
  return row?.title || row?.name || row?.dataset_id || row?.doi || row?.url || "Untitled source";
}

function rowSource(row) {
  const direct = row?.source || row?.publisher || row?.provider || row?.backend || row?.collect_via;
  if (direct) return text(direct);
  const raw = row?.url || row?.source_url || row?.resolved_url;
  if (!raw) return "Unattributed";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "Unattributed";
  }
}

function isQueryReady(row) {
  const direct = row?.query_ready ?? row?.queryReady ?? row?.query_ready_declared;
  if (direct === true) return true;
  const state = [
    row?.materialization_status,
    row?.materialization?.status,
    row?.evidence_state?.materialization?.status,
    row?.readiness,
    row?.status,
  ].filter(Boolean).join(" ").toLowerCase();
  return state.includes("query_ready") || state.includes("query-ready") || state.includes("query ready");
}

function isPendingJob(job) {
  return ["pending_approval", "awaiting_approval", "needs_approval"].includes(String(job?.status || "").toLowerCase());
}

function isActiveJob(job) {
  return ["queued", "running", "collecting", "processing", "submitted"].includes(String(job?.status || "").toLowerCase());
}

function sourceFamilies(rows, limit = 6) {
  const counts = new Map();
  for (const row of rows || []) {
    const source = rowSource(row);
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function measuredCapacity(resourcesRollup) {
  if (!resourcesRollup || typeof resourcesRollup !== "object") return [];
  const usage = resourcesRollup.usage || {};
  const hero = resourcesRollup.hero || {};
  const metered = resourcesRollup.metered || {};
  const workers = hero.workers || {};
  const out = [];

  const workerValue = workers.available ?? workers.online ?? workers.ready ?? workers.idle;
  if (workerValue != null) out.push({ label: "Workers", value: String(workerValue), note: "measured" });

  const vault = usage.vault || hero.vault;
  if (vault && typeof vault === "object") {
    const used = vault.used_tb ?? vault.used_gb ?? vault.used;
    const total = vault.total_tb ?? vault.total_gb ?? vault.total;
    if (used != null || total != null) {
      out.push({
        label: "Vault",
        value: used != null && total != null ? `${used}/${total}` : String(used ?? total),
        note: used != null && total != null ? "used / total" : "measured",
      });
    }
  }

  const bigQuery = metered.bigquery;
  if (bigQuery && typeof bigQuery === "object") {
    const remaining = bigQuery.remaining ?? bigQuery.remaining_bytes ?? bigQuery.quota_remaining;
    const status = bigQuery.status || bigQuery.state;
    if (remaining != null || status) {
      out.push({ label: "BigQuery", value: text(remaining ?? status), note: remaining != null ? "remaining" : "state" });
    }
  }

  return out.slice(0, 3);
}

function metric(label, value, note) {
  return { label, value: String(value), note };
}

function MiniMetric({ item }) {
  return (
    <div className="rd-v2-cockpit-metric">
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      {item.note ? <em>{item.note}</em> : null}
    </div>
  );
}

function SourceNetwork({ rows, title = "Source network", compact = false }) {
  const families = sourceFamilies(rows, compact ? 5 : 7);
  const max = Math.max(1, ...families.map((item) => item.count));
  return (
    <section className={`rd-v2-cockpit-network${compact ? " is-compact" : ""}`}>
      <header>
        <span className="rd-v2-eyebrow">{title}</span>
        <strong>{families.length ? `${families.length} visible families` : "No families measured"}</strong>
      </header>
      {families.length ? (
        <div className="rd-v2-cockpit-network-list">
          {families.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <i style={{ "--rd-cockpit-fill": `${Math.max(12, Math.round((item.count / max) * 100))}%` }} />
              <b>{item.count}</b>
            </div>
          ))}
        </div>
      ) : (
        <p>No source-family metadata has been returned yet.</p>
      )}
    </section>
  );
}

export function DiscoverResearchRadar({
  catalog = [],
  labIds,
  knownRows = [],
  jobs = [],
  partitions = [],
  shelves = [],
  resourcesRollup,
  onSearch,
}) {
  const held = catalog.filter((row) => labIds?.has?.(rowId(row)));
  const ready = held.filter(isQueryReady);
  const pending = jobs.filter(isPendingJob);
  const active = jobs.filter(isActiveJob);
  const capacity = measuredCapacity(resourcesRollup);
  const sourceRows = [...knownRows, ...catalog.filter((row) => !labIds?.has?.(rowId(row)))];
  const starterRows = sourceRows.slice(0, 4);
  const metrics = [
    metric("Library", held.length, "held evidence"),
    metric("Query-ready", ready.length, held.length ? "declared / observed" : "none measured"),
    metric("Known routes", knownRows.length, "outside Library"),
    metric("Collections", pending.length + active.length, pending.length ? `${pending.length} awaiting approval` : active.length ? `${active.length} active` : "none active"),
  ];

  return (
    <section className="rd-v2-discover-radar" data-testid="discover-research-radar">
      <header className="rd-v2-discover-radar-head">
        <div>
          <span className="rd-v2-eyebrow">Research radar</span>
          <h2>Your evidence universe before the next search</h2>
          <p>Held evidence, known source routes, collection state, and measurable execution capacity in one desk view.</p>
        </div>
        <div className="rd-v2-discover-radar-state">
          <span>{shelves.length || partitions.length ? "Library mapped" : "Library index"}</span>
          <strong>{sourceFamilies(sourceRows).length} source families visible</strong>
        </div>
      </header>

      <div className="rd-v2-discover-radar-metrics">
        {metrics.map((item) => <MiniMetric key={item.label} item={item} />)}
      </div>

      <div className="rd-v2-discover-radar-grid">
        <section className="rd-v2-discover-radar-panel rd-v2-discover-radar-panel--routes">
          <header>
            <span className="rd-v2-eyebrow">Known evidence routes</span>
            <strong>{knownRows.length ? "Ready to investigate" : "Populate through discovery"}</strong>
          </header>
          {starterRows.length ? (
            <ul>
              {starterRows.map((row) => (
                <li key={rowId(row)}>
                  <button type="button" onClick={() => onSearch?.(rowTitle(row))}>
                    <span>{rowSource(row)}</span>
                    <strong>{rowTitle(row)}</strong>
                    <em>{text(row?.access_mode || row?.collect_via || row?.kind || row?.type, "route metadata available")}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Search a research need to populate source routes from the catalogue and wider adapters.</p>
          )}
        </section>

        <SourceNetwork rows={sourceRows} />

        <section className="rd-v2-discover-radar-panel rd-v2-discover-radar-panel--execution">
          <header>
            <span className="rd-v2-eyebrow">Acquisition &amp; execution</span>
            <strong>From evidence gap to Library object</strong>
          </header>
          <div className="rd-v2-cockpit-flow" aria-label="Discover acquisition flow">
            <span><b>1</b> Find</span>
            <i>→</i>
            <span><b>2</b> Verify</span>
            <i>→</i>
            <span><b>3</b> Review</span>
            <i>→</i>
            <span><b>4</b> Register</span>
          </div>
          <div className="rd-v2-cockpit-execution-facts">
            <div><span>Awaiting approval</span><strong>{pending.length}</strong></div>
            <div><span>Active collections</span><strong>{active.length}</strong></div>
            <div><span>Library groups</span><strong>{shelves.length || partitions.length || "—"}</strong></div>
          </div>
          {capacity.length ? (
            <div className="rd-v2-cockpit-capacity">
              {capacity.map((item) => (
                <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><em>{item.note}</em></div>
              ))}
            </div>
          ) : (
            <p className="rd-v2-cockpit-capacity-empty">Execution capacity is not measured in this response yet; Discover will not infer it.</p>
          )}
        </section>
      </div>

      <div className="rd-v2-discover-capability-ledger" aria-label="Discover capabilities">
        <span><b>Library evidence</b><em>held + query-ready state</em></span>
        <span><b>Source catalogues</b><em>known and live routes</em></span>
        <span><b>Open web context</b><em>explicit wider search</em></span>
        <span><b>URL / DOI inspection</b><em>probe before collection</em></span>
        <span><b>Acquisition review</b><em>approval-gated</em></span>
        <span><b>History</b><em>durable request trail</em></span>
      </div>
    </section>
  );
}

export function DiscoverEvidenceCockpit({
  query,
  rows = [],
  resultGroups = {},
  filterCounts = {},
  stateFilter = "all",
  onFilterChange,
  assessmentActive = false,
  assessmentResult = null,
  pendingCount = 0,
  lookupProgress = {},
  resourcesRollup,
  onSearchWider,
  onAssess,
}) {
  const available = resultGroups.available?.length || 0;
  const external = resultGroups.external?.length || 0;
  const held = resultGroups.held?.length || 0;
  const context = resultGroups.context?.length || 0;
  const capacity = measuredCapacity(resourcesRollup);
  const verdict = text(assessmentResult?.verdict, assessmentActive ? "Assessing" : "Not assessed")
    .replaceAll("_", " ");
  const gap = assessmentResult?.gap?.statement;
  const facets = [
    ["all", "All evidence", filterCounts.all || rows.length],
    ["in_lab", "In Library", filterCounts.in_lab || held],
    ["query_ready", "Query ready", filterCounts.query_ready || 0],
    ["external", "Beyond Library", filterCounts.external || available + external + context],
    ["needs_access", "Needs access", filterCounts.needs_access || 0],
  ];
  const stages = [
    ["Library", held],
    ["Acquirable", available],
    ["Verify", external],
    ["Context", context],
  ];
  const maxStage = Math.max(1, ...stages.map(([, count]) => count));

  return (
    <aside className="rd-v2-discover-evidence-cockpit" data-testid="discover-evidence-cockpit" aria-label="Evidence cockpit">
      <header className="rd-v2-cockpit-head">
        <span className="rd-v2-eyebrow">Evidence cockpit</span>
        <h3>{query}</h3>
        <p>Search position, evidence territory, source families, and decision state.</p>
      </header>

      <section className="rd-v2-cockpit-stage-map" aria-label="Evidence landscape">
        <div className="rd-v2-cockpit-section-head">
          <span>Evidence landscape</span>
          <strong>{rows.length} observed rows</strong>
        </div>
        {stages.map(([label, count]) => (
          <div key={label} className="rd-v2-cockpit-stage-row">
            <span>{label}</span>
            <i style={{ "--rd-cockpit-fill": `${count ? Math.max(12, Math.round((count / maxStage) * 100)) : 0}%` }} />
            <b>{count}</b>
          </div>
        ))}
        <div className="rd-v2-cockpit-live-state">
          <span>Library index</span><b>{lookupProgress.library === "done" ? "checked" : text(lookupProgress.library, "waiting")}</b>
          <span>Source routes</span><b>{lookupProgress.routes === "done" ? "checked" : text(lookupProgress.routes, "waiting")}</b>
        </div>
      </section>

      <nav className="rd-v2-cockpit-facets" aria-label="Evidence facets">
        <div className="rd-v2-cockpit-section-head"><span>Facets</span><strong>live counts</strong></div>
        {facets.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={stateFilter === id ? "on" : ""}
            aria-pressed={stateFilter === id}
            onClick={() => onFilterChange?.(id)}
          >
            <span>{label}</span><b>{count}</b>
          </button>
        ))}
      </nav>

      <SourceNetwork rows={rows} title="Search universe" compact />

      <section className="rd-v2-cockpit-assessment">
        <div className="rd-v2-cockpit-section-head"><span>Coverage assessment</span><strong>{verdict}</strong></div>
        {gap ? <p><b>Open gap</b>{gap}</p> : <p>{assessmentActive ? "Evidence brief is being evaluated against held records." : "Run a research-question assessment to name the evidence gap explicitly."}</p>}
        <button type="button" onClick={() => onAssess?.(query)} disabled={assessmentActive && !assessmentResult}>
          {assessmentActive ? "Review assessment" : "Assess coverage"}
        </button>
      </section>

      <section className="rd-v2-cockpit-execution">
        <div className="rd-v2-cockpit-section-head"><span>Decision state</span><strong>{pendingCount ? `${pendingCount} pending` : "clear"}</strong></div>
        {capacity.length ? (
          <div className="rd-v2-cockpit-capacity is-compact">
            {capacity.map((item) => (
              <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
            ))}
          </div>
        ) : <p>Capacity remains unmeasured here until the desk reports it.</p>}
        <button type="button" onClick={() => onSearchWider?.(query)}>Search wider sources</button>
      </section>
    </aside>
  );
}
