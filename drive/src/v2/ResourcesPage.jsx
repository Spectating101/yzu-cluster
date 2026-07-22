import { useMemo, useState } from "react";
import { buildAccountSummaryRows, buildActivityRows, spendingPeriodLabel } from "@/v2/resourcesSpending";
import { buildResourcesPanels } from "@/v2/resourcesFromRollup";
import { PageShell } from "@/v2/ui";

const PLACEHOLDER_ROLLUP = {
  hero: { workers: {}, vault: {}, query_engine: {} },
  spending: { period: { totals: {} }, today: {} },
  activity: { events: [] },
};

function formatGiB(value) {
  const number = Number(value || 0);
  if (!number) return "0 GiB";
  if (number < 0.01) return "<0.01 GiB";
  return `${number} GiB`;
}

function friendlySummaryLabel(label, key) {
  if (key === "statement-ask" || label === "Ask / model turns") return "Ask usage";
  if (label === "Workers") return "Collection workers";
  if (label === "Vault") return "Lab vault";
  if (label === "Query engine") return "Desk connection";
  return label || "Resource";
}

function OperationalStrip({ rollup }) {
  const rows = buildAccountSummaryRows(rollup);
  const queryEngine = rollup?.hero?.query_engine || {};
  const normalized = rows.slice(0, 4).map((row) => ({
    ...row,
    label: friendlySummaryLabel(row.label, row.key),
  }));
  if (!normalized.some((row) => row.label === "Desk connection")) {
    normalized.push({
      key: "desk-connection",
      label: "Desk connection",
      metric: queryEngine.up ? "Connected" : "Offline",
      detail: "Catalog and query service",
      warn: queryEngine.up === false,
    });
  }
  return (
    <section className="rd-recovery-resources-strip" aria-label="Operations status">
      {normalized.slice(0, 5).map((row) => (
        <article key={row.key || row.label} className={row.warn ? "warn" : ""}>
          <span>{row.label}</span>
          <strong>{row.metric || "—"}</strong>
          <small>{row.detail || row.sublabel || "Current desk state"}</small>
        </article>
      ))}
    </section>
  );
}

function CompactResourceRow({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`rd-recovery-resource-row${selected ? " selected" : ""}${row?.warn ? " warn" : ""}`}
      data-kind={row?.kind || "resource"}
      onClick={() => onSelect?.(row)}
    >
      <span><strong>{row?.label || "Unnamed resource"}</strong><small>{row?.detail || row?.endpoint || row?.section || "Research infrastructure"}</small></span>
      <em>{row?.metric || "Not reported"}</em>
    </button>
  );
}

function ResourceGroup({ title, lead, rows, selectedKey, onSelect }) {
  if (!rows.length) return null;
  return (
    <section className="rd-recovery-resource-group" aria-label={title}>
      <header><div><h2>{title}</h2><p>{lead}</p></div><span>{rows.length}</span></header>
      <div>{rows.map((row) => <CompactResourceRow key={row.key || `${row.kind}-${row.label}`} row={row} selected={selectedKey === row.key} onSelect={onSelect} />)}</div>
    </section>
  );
}

function Overview({ rollup, panels, catalogSummary, selectedKey, onSelect }) {
  const storageRows = panels.usage || [];
  const accountRows = [...(panels.metered || []), ...(panels.ai || [])];
  const routeRows = [...(panels.providers || []), ...(panels.layers || []), ...(panels.compute || [])];
  const summary = catalogSummary || {};
  const registryCount = summary.registry ?? summary.datasets ?? summary.total ?? "—";
  const instantCount = summary.instant ?? summary.query_ready ?? summary.ready ?? "—";

  return (
    <div className="rd-recovery-resources-overview" data-testid="resources-overview">
      <OperationalStrip rollup={rollup} />

      <section className="rd-recovery-databank" aria-label="Databank status">
        <div><span>Databank</span><h2>{registryCount} registered · {instantCount} query-ready</h2><p>Institutional evidence index and query service. Registration, possession, and analytical readiness remain separate claims.</p></div>
        <button type="button" onClick={() => onSelect?.({ key: "databank", kind: "capacity", label: "Databank", metric: `${registryCount} registered`, detail: `${instantCount} query-ready`, section: "overview" })}>Inspect →</button>
      </section>

      <div className="rd-recovery-resource-groups" role="region" aria-label="Key resources">
        <ResourceGroup title="Storage" lead="Archive and working capacity for durable research evidence." rows={storageRows} selectedKey={selectedKey} onSelect={onSelect} />
        <ResourceGroup title="Accounts & limits" lead="Metered or configured services that can constrain agent work." rows={accountRows} selectedKey={selectedKey} onSelect={onSelect} />
        <ResourceGroup title="Source routes & execution" lead="Connectors, workers, and supported routes available when research work needs them." rows={routeRows} selectedKey={selectedKey} onSelect={onSelect} />
      </div>
    </div>
  );
}

function UsageSummary({ rollup }) {
  const period = rollup?.spending?.period?.totals || {};
  const today = rollup?.spending?.today || {};
  const metrics = [
    ["Remote tables", formatGiB(period.bq_gib_billed), `${formatGiB(today.bq_gib_billed)} today`],
    ["Web discovery", `${Number(period.tavily_calls || 0)} calls`, `${Number(today.tavily_calls || 0)} today`],
    ["Ask", `${Number(period.composer_turns || 0)} turns`, `${Number(today.composer_turns || 0)} today`],
    ["Source probes", `${Number(period.probe_calls || 0)} probes`, `${Number(today.probe_calls || 0)} today`],
  ];
  return (
    <section className="rd-rc3-usage-summary" aria-label="Usage report">
      {metrics.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
    </section>
  );
}

function eventCost(row) {
  const cost = row?.event?.cost || {};
  const parts = [];
  if (cost.bq_gib) parts.push(`${formatGiB(cost.bq_gib)} remote tables`);
  if (cost.tavily) parts.push(`${cost.tavily} web`);
  if (cost.composer) parts.push(`${cost.composer} Ask`);
  return parts.join(" · ") || "No metered cost reported";
}

function ActivityView({ rollup, activityFilter, selectedKey, onSelectRow }) {
  const [filter, setFilter] = useState("all");
  const effectiveFilter = useMemo(() => {
    if (activityFilter) return activityFilter;
    if (filter === "ask") return { action: "ask" };
    if (filter === "discovery") return { actions: ["discover"] };
    if (filter === "query") return { actions: ["query", "bq_dry_run", "bq_read", "preview"] };
    if (filter === "metered") return { hasCost: true };
    return null;
  }, [activityFilter, filter]);
  const rows = useMemo(() => buildActivityRows(rollup, effectiveFilter), [rollup, effectiveFilter]);
  const filters = [["all", "All"], ["ask", "Ask"], ["discovery", "Discovery"], ["query", "Query"], ["metered", "Metered"]];

  return (
    <div className="rd-rc3-usage-view">
      <UsageSummary rollup={rollup} />
      <div className="rd-rc3-usage-filters" role="group" aria-label="Usage filters">
        {filters.map(([id, label]) => <button key={id} type="button" className={!activityFilter && filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <section className="rd-rc3-usage-log">
        <header><div><span>Activity</span><h2>What research work consumed the desk</h2></div><em>{rows.length} events</em></header>
        <div>
          {rows.length ? rows.map((row, index) => (
            <button type="button" key={row.key || `${row.label}-${index}`} className={selectedKey === row.key ? "selected" : ""} onClick={() => onSelectRow?.(row)}>
              <span><strong>{row.label || "Research activity"}</strong><small>{row.target || row.sublabel || row.actionLabel || "No research object reported"}</small></span>
              <em>{row.actionLabel || row.metric || "Activity"}</em>
              <b>{eventCost(row)}</b>
            </button>
          )) : <p>No usage event is available for this view.</p>}
        </div>
      </section>
    </div>
  );
}

export function ResourcesPage({
  rollup,
  rollupLoading = false,
  health,
  ops,
  jobs = [],
  catalogSummary,
  cluster,
  mode = "spending",
  onModeChange,
  activityFilter = null,
  onClearActivityFilter,
  selectedKey,
  onRefresh,
  refreshedAt = null,
  onSelectRow,
}) {
  const initialLoading = rollupLoading && rollup === undefined;
  const viewRollup = initialLoading ? null : rollup || PLACEHOLDER_ROLLUP;
  const panels = useMemo(() => buildResourcesPanels({ rollup, rollupLoading, health, ops, jobs, catalogSummary, cluster }), [rollup, rollupLoading, health, ops, jobs, catalogSummary, cluster]);
  const period = useMemo(() => spendingPeriodLabel(viewRollup), [viewRollup]);
  const freshness = refreshedAt == null ? null : `${Math.max(0, Math.round((Date.now() - refreshedAt) / 1000))}s ago`;

  return (
    <PageShell
      className="rd-rc3-resources-page rd-recovery-resources-page"
      title="Resources"
      lead="Storage, account limits, worker availability, and procurement routes."
      toolbar={
        <div className="rd-rc3-resource-toolbar">
          <button type="button" aria-pressed={mode === "spending"} className={mode === "spending" ? "on" : ""} onClick={() => onModeChange?.("spending")}>Overview</button>
          <button type="button" aria-pressed={mode === "activity"} className={mode === "activity" ? "on" : ""} onClick={() => onModeChange?.("activity")}>Activity</button>
          <span>{period}</span>
          {activityFilter ? <button type="button" onClick={() => onClearActivityFilter?.()}>Filtered activity ×</button> : null}
          {freshness ? <span>Updated {freshness}</span> : null}
          <button type="button" onClick={() => onRefresh?.()}>Refresh</button>
        </div>
      }
    >
      {rollup === null && !rollupLoading ? <p className="rd-v2-res-offline" role="status">Desk API unreachable — live capability cannot be verified.</p> : null}
      {initialLoading ? <p className="rd-v2-res-loading" role="status">Loading resources…</p> : mode === "spending" ? (
        <Overview rollup={viewRollup} panels={panels} catalogSummary={catalogSummary} selectedKey={selectedKey} onSelect={onSelectRow} />
      ) : (
        <ActivityView rollup={viewRollup} activityFilter={activityFilter} selectedKey={selectedKey} onSelectRow={onSelectRow} />
      )}
    </PageShell>
  );
}
