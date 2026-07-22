import { useMemo, useState } from "react";
import { buildActivityRows, spendingPeriodLabel } from "@/v2/resourcesSpending";
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

function rowStatus(row) {
  if (row?.warn) return "Attention";
  if (row?.ok === false) return "Unavailable";
  return "Available";
}

function CapabilityRow({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`rd-rc3-capability-row${selected ? " selected" : ""}${row?.warn ? " warn" : ""}`}
      data-kind={row?.kind || "resource"}
      onClick={() => onSelect?.(row)}
    >
      <span>
        <strong>{row?.label || "Unnamed resource"}</strong>
        <small>{row?.detail || row?.endpoint || row?.section || "Research infrastructure"}</small>
      </span>
      <em>{row?.metric || "Not reported"}</em>
      <b>{rowStatus(row)}</b>
    </button>
  );
}

function CapabilitySection({ index, title, lead, rows, selectedKey, onSelect }) {
  return (
    <section className="rd-rc3-capability-section">
      <header>
        <span>{String(index).padStart(2, "0")}</span>
        <div><h2>{title}</h2><p>{lead}</p></div>
        <em>{rows.length}</em>
      </header>
      <div>
        {rows.length ? rows.map((row) => (
          <CapabilityRow key={row.key || `${row.kind}-${row.label}`} row={row} selected={selectedKey === row.key} onSelect={onSelect} />
        )) : <p className="rd-rc3-resource-empty">No capability record is available in this response.</p>}
      </div>
    </section>
  );
}

function CapabilityOverview({ panels, selectedKey, onSelect }) {
  const sourceRows = [...(panels.providers || []), ...(panels.layers || []), ...(panels.metered || [])];
  const executionRows = [...(panels.compute || []), ...(panels.ai || [])];
  const estateRows = panels.usage || [];
  const attention = [...sourceRows, ...executionRows, ...estateRows].filter((row) => row?.warn || row?.ok === false);

  return (
    <div className="rd-rc3-capabilities" aria-label="Research capabilities">
      <section className="rd-rc3-capability-hero">
        <div>
          <span>What the lab can support now</span>
          <h2>Source access, execution, and storage are shown as research capability—not as a second ownership layer for Discover or Synthesis.</h2>
        </div>
        <dl>
          <div><dt>Source routes</dt><dd>{sourceRows.length}</dd></div>
          <div><dt>Execution services</dt><dd>{executionRows.length}</dd></div>
          <div><dt>Needs attention</dt><dd>{attention.length}</dd></div>
        </dl>
      </section>

      <div className="rd-rc3-capability-grid" role="region" aria-label="Capacity and access">
        <CapabilitySection
          index={1}
          title="Source access"
          lead="Providers, external indexes, metered accounts, and intake routes available to Discover."
          rows={sourceRows}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
        <CapabilitySection
          index={2}
          title="Execution"
          lead="Composer, MCP, query services, and workers that can support acquisition or construction."
          rows={executionRows}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
        <CapabilitySection
          index={3}
          title="Evidence estate"
          lead="Archive, working storage, and other capacity that constrains durable research work."
          rows={estateRows}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
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
      {metrics.map(([label, value, detail]) => (
        <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
      ))}
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

function UsageLog({ rows, selectedKey, onSelect }) {
  return (
    <section className="rd-rc3-usage-log">
      <header><div><span>Attributable activity</span><h2>What research work consumed the desk</h2></div><em>{rows.length} events</em></header>
      <div>
        {rows.length ? rows.map((row, index) => (
          <button
            type="button"
            key={row.key || `${row.label}-${index}`}
            className={selectedKey === row.key ? "selected" : ""}
            onClick={() => onSelect?.(row)}
          >
            <span><strong>{row.label || "Research activity"}</strong><small>{row.target || row.sublabel || row.actionLabel || "No research object reported"}</small></span>
            <em>{row.actionLabel || row.metric || "Activity"}</em>
            <b>{eventCost(row)}</b>
          </button>
        )) : <p>No usage event is available for this view.</p>}
      </div>
    </section>
  );
}

function UsageView({ rollup, activityFilter, selectedKey, onSelectRow }) {
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
      <UsageLog rows={rows} selectedKey={selectedKey} onSelect={onSelectRow} />
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
      className="rd-rc3-resources-page"
      title="Resources"
      lead="Understand what Research Drive can access and execute, then trace the capacity consumed by research work."
      toolbar={
        <div className="rd-rc3-resource-toolbar">
          <button type="button" aria-pressed={mode === "spending"} className={mode === "spending" ? "on" : ""} onClick={() => onModeChange?.("spending")}>Capabilities</button>
          <button type="button" aria-pressed={mode === "activity"} className={mode === "activity" ? "on" : ""} onClick={() => onModeChange?.("activity")}>Usage</button>
          <span>{period}</span>
          {activityFilter ? <button type="button" onClick={() => onClearActivityFilter?.()}>Filtered usage ×</button> : null}
          {freshness ? <span>Updated {freshness}</span> : null}
          <button type="button" onClick={() => onRefresh?.()}>Refresh</button>
        </div>
      }
    >
      {rollup === null && !rollupLoading ? <p className="rd-v2-res-offline" role="status">Desk API unreachable — live capability cannot be verified.</p> : null}
      {initialLoading ? <p className="rd-v2-res-loading" role="status">Loading resources…</p> : mode === "spending" ? (
        <CapabilityOverview panels={panels} selectedKey={selectedKey} onSelect={onSelectRow} />
      ) : (
        <UsageView rollup={viewRollup} activityFilter={activityFilter} selectedKey={selectedKey} onSelectRow={onSelectRow} />
      )}
    </PageShell>
  );
}
