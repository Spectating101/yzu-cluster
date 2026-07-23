import { useMemo } from "react";
import {
  buildAccountSummaryRows,
} from "@/v2/resourcesSpending";
import { buildResourcesPanels } from "@/v2/resourcesFromRollup";
import { statusPillKind } from "@/v2/datasetMeta";
import { Chip, PageShell } from "@/v2/ui";

const PLACEHOLDER_ROLLUP = {
  hero: {
    composer: { model: "", configured: false, legacy_configured: false },
    workers: {},
    vault: {},
    query_engine: { port: 8765, up: false },
  },
  ai: { composer_model: "", mcp_tools: {} },
  metered: {
    bigquery: { configured: false },
    tavily: { keys_loaded: 0 },
  },
  spending: {
    period: { totals: {}, daily: [] },
    today: {},
    drivers: [],
  },
  activity: { events: [] },
  motion: { jobs: {} },
  issues: [],
  _placeholder: true,
};

function facultyOpsLabel(label, key) {
  const map = {
    "Ask / model turns": "Ask usage",
    Workers: "Collection workers",
    Vault: "Lab vault",
    "Query engine": "Desk connection",
  };
  return map[label] || label;
}

function facultyOpsSub(label, key, sub) {
  if (key === "statement-ask") return "Procurement chat this month";
  if (label === "Query engine") return "Catalog and query service";
  return sub;
}

function StatusStripCell({ label, value, sub, tone = "" }) {
  return (
    <div className={`rd-v2-res-status-cell${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{sub}</em>
    </div>
  );
}

function ResourcesStatusStrip({ rollup }) {
  const rows = buildAccountSummaryRows(rollup);
  const qe = rollup?.hero?.query_engine || {};
  if (!rows.length && qe.port == null) return null;

  return (
    <section className="rd-v2-res-status-strip" aria-label="Operations status">
      {rows.map((row) => (
        <StatusStripCell
          key={row.key}
          label={facultyOpsLabel(row.label, row.key)}
          value={row.metric}
          sub={facultyOpsSub(row.label, row.key, row.detail || row.sublabel)}
          tone={row.warn ? "warn" : ""}
        />
      ))}
      <StatusStripCell
        label="Desk connection"
        value={qe.up ? "Connected" : "Offline"}
        sub="Catalog and query service"
        tone={qe.up === false ? "off" : ""}
      />
    </section>
  );
}

function WorkersToolbarStat({ workers }) {
  const online = workers?.online ?? workers?.joined;
  const busy = workers?.busy;
  const total = workers?.total;
  if (online == null && busy == null && total == null) return null;

  const count = online ?? busy ?? total;
  const qualifier = online != null ? "online" : busy != null ? "busy" : "configured";
  const value = total != null && count !== total ? `${count}/${total} ${qualifier}` : `${count} ${qualifier}`;

  return (
    <span className="rd-v2-toolbar-stat" aria-label={`Collection workers ${value}`}>
      <span>Collectors</span>
      <strong>{value}</strong>
    </span>
  );
}

function resourceStatus(row) {
  if (row.warn) return "Check";
  if (row.ok === false) return "Offline";
  return null;
}

function resourceTone(row) {
  if (row.warn) return " warn";
  if (row.ok === false) return " off";
  return "";
}

const PINNED_STORAGE_KEYS = new Set(["vault", "nvme"]);
const PINNED_ACCOUNT_KEYS = new Set(["bigquery", "tavily", "collect-tokens"]);

function needsAttention(row) {
  return row.warn || row.ok === false;
}

function sourceGroupRow({ rows, keys, key, label, endpoint, metric, detail }) {
  const members = keys.map((id) => rows.find((row) => row.key === id)).filter(Boolean);
  if (!members.length) return null;
  return {
    kind: "source",
    key,
    section: "Source routes",
    group: true,
    label,
    endpoint,
    metric,
    detail,
    ok: members.some((row) => row.ok !== false),
    warn: members.every((row) => needsAttention(row)),
    members: members.map((row) => row.label),
  };
}

function buildPinnedSourceRows(providers = [], layers = []) {
  return [
    sourceGroupRow({
      rows: providers,
      keys: ["source-sec_edgar", "source-twse", "source-mops", "source-yfinance", "source-coingecko"],
      key: "source-market-filings",
      label: "Market data & filings",
      endpoint: "SEC · TWSE · MOPS · Yahoo · CoinGecko",
      metric: "Official filings, market series, crypto prices",
      detail: "Structured public finance routes",
    }),
    sourceGroupRow({
      rows: providers,
      keys: ["source-datacite", "source-huggingface", "source-open_research"],
      key: "source-research-catalogs",
      label: "Catalog APIs",
      endpoint: "DataCite · Hugging Face · Zenodo/OpenAlex",
      metric: "DOI and dataset catalog search",
      detail: "Academic dataset discovery",
    }),
    sourceGroupRow({
      rows: layers,
      keys: ["layer-discover_search", "layer-web_discover", "layer-probe_url"],
      key: "route-discovery-intake",
      label: "Discovery & intake",
      endpoint: "Discover search · Web discover · Source probe",
      metric: "Find candidates, classify URLs",
      detail: "Before collection",
    }),
    sourceGroupRow({
      rows: providers,
      keys: ["source-web_generic"],
      key: "source-public-web",
      label: "Public web",
      endpoint: "Public URL",
      metric: "Probe, then collect",
      detail: "One-off URLs and pages",
    }),
    sourceGroupRow({
      rows: providers,
      keys: ["source-bigquery"],
      key: "source-remote-tables",
      label: "Remote tables",
      endpoint: "BigQuery public datasets",
      metric: "Dry-run, then query",
      detail: "Remote datasets without local download",
    }),
  ].filter(Boolean);
}

function resourceDetail(row) {
  if (row.kind === "usage") {
    if (row.key === "vault") return "Long-term archive";
    if (row.key === "nvme") return "Local working space";
    if (row.key === "bulk-cache") return "Large downloads";
    if (row.key === "staging-disk") return "Before archiving";
  }
  if (row.kind === "metered") {
    if (row.key === "bigquery") return "Remote table queries";
    if (row.key === "tavily") return "Web search";
    if (row.key === "huggingface") return "Dataset discovery";
    if (row.key === "collect-tokens") return "External account access";
  }
  if (row.kind === "source") {
    if (row.key === "source-route-summary") return "Known provider routes from desk health — select a row for rail detail";
    if (row.key === "source-market-filings") return "Official market data and filings";
    if (row.key === "source-research-catalogs") return "Academic metadata and dataset APIs";
    if (row.key === "route-discovery-intake") return "Candidate discovery and URL classification";
    if (row.key === "source-public-web") return "Probe and browser collect";
    if (row.key === "source-remote-tables") return "Dry-run protected remote query";
    if (row.key === "source-sec_edgar") return "Company filings";
    if (row.key === "source-twse") return "Taiwan market data";
    if (row.key === "source-mops") return "Taiwan company filings";
    if (row.key === "source-coingecko") return "Crypto market data";
    if (row.key === "source-bigquery") return "Remote tables";
    if (row.key === "source-datacite") return "Research datasets";
    if (row.key === "source-huggingface") return "Community datasets";
    if (row.key === "source-web_generic") return "Any public URL";
  }
  return row.endpoint || row.detail || row.layers || row.collect_via || row.sublabel || row.section || "—";
}

function cleanCapText(value) {
  return value.replace("/query cap", " cap per query").replace("/procure cap", " per request");
}

function resourceQuota(row) {
  if (row.progress != null) {
    if (row.key === "bulk-cache") {
      const usage = String(row.metric || "").match(/([\d.]+)\/([\d.]+) GB/);
      if (usage) {
        const free = Math.round(Number(usage[2]) - Number(usage[1]));
        if (Number.isFinite(free) && free >= 0) return `${free} GB free · ${row.progress}% used`;
      }
    }
    return `${row.metric || "—"} · ${row.progress}% used`;
  }
  if (row.kind === "usage" && row.key === "vault" && String(row.metric || "").startsWith("?/")) {
    return `${String(row.metric).slice(2)} cap · usage pending`;
  }
  if (row.kind === "metered") {
    if (row.key === "bigquery") {
      const parts = String(row.metric || "")
        .split(" · ")
        .filter((part) => part.includes("GiB") || part.includes("today"))
        .map(cleanCapText);
      return parts.join(" · ") || "Dry-run protected";
    }
    if (row.key === "tavily") {
      const raw = String(row.metric || "");
      const keys = raw.match(/(\d+) keys/)?.[1];
      const today = raw.match(/(\d+) today/)?.[1];
      return [
        keys ? `${keys} keys ready` : null,
        today ? `${today} today` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Search access";
    }
    if (row.key === "huggingface") return row.metric === "token configured" ? "Token ready" : "Public access";
    if (row.key === "collect-tokens") {
      const profiles = String(row.metric || "").match(/(\d+)\/(\d+) profiles/);
      if (profiles) return `${profiles[1]} of ${profiles[2]} accounts ready`;
    }
  }
  if (row.kind === "source") {
    if (row.key === "source-route-summary") return row.metric || "Configured source routes";
    if (row.key === "source-market-filings") return "Official feeds and queue scripts";
    if (row.key === "source-research-catalogs") return "DOI lookup and dataset import";
    if (row.key === "route-discovery-intake") return "Search and probe before collect";
    if (row.key === "source-public-web") return "Probe, then collect";
    if (row.key === "source-remote-tables") return "Query with dry-run limit";
    if (row.key === "source-sec_edgar") return "Download queue";
    if (row.key === "source-twse") return "Download queue";
    if (row.key === "source-mops") return "Browser collector";
    if (row.key === "source-coingecko") return "API fetch";
    if (row.key === "source-bigquery") return "Remote query";
    if (row.key === "source-datacite") return "DOI lookup";
    if (row.key === "source-huggingface") return "Dataset import";
    if (row.key === "source-web_generic") return "Probe, then collect";
    return row.collect_via || row.layers || "Available";
  }
  return row.metric || row.routes || "—";
}

function resourceName(row) {
  if (row.key === "vault") return "Drive vault";
  if (row.key === "nvme") return "Working disk";
  if (row.key === "bulk-cache") return "Bulk cache";
  if (row.key === "staging-disk") return "Staging space";
  if (row.key === "tavily") return "Web discovery";
  if (row.key === "huggingface") return "Hugging Face";
  if (row.key === "collect-tokens") return "Collector accounts";
  if (row.key === "source-route-summary") return "Source routes";
  if (row.key === "source-market-filings") return "Market & filings";
  if (row.key === "source-research-catalogs") return "Catalog APIs";
  if (row.key === "route-discovery-intake") return "Discovery & intake";
  if (row.key === "source-public-web") return "Open web";
  if (row.key === "source-remote-tables") return "Remote tables";
  if (row.key === "source-twse") return "TWSE";
  if (row.key === "source-bigquery") return "BigQuery";
  if (row.key === "source-web_generic") return "Public web";
  return row.label;
}

function resourceType(row, fallback) {
  if (row.key === "vault") return "Archive";
  if (row.key === "nvme") return "Workspace";
  if (row.key === "bulk-cache") return "Cache";
  if (row.key === "staging-disk") return "Staging";
  if (row.key === "bigquery") return "Query account";
  if (row.key === "tavily") return "Search account";
  if (row.key === "huggingface") return "Dataset account";
  if (row.key === "collect-tokens") return "Credentials";
  if (row.kind === "source") return row.endpoint || fallback;
  return fallback;
}

function inventorySection(id, title, rows, type, description) {
  return {
    id,
    title,
    description,
    rows: rows.map((row) => ({
      id: `${id}-${row.key || row.label}`,
      type: resourceType(row, type),
      row,
      name: resourceName(row),
      quota: resourceQuota(row),
      source: resourceDetail(row),
      status: resourceStatus(row),
    })),
  };
}

function buildCapabilityInventorySections(panels) {
  const storage = (panels.usage || []).filter((row) => PINNED_STORAGE_KEYS.has(row.key) || needsAttention(row));
  const metered = (panels.metered || []).filter((row) => PINNED_ACCOUNT_KEYS.has(row.key) || needsAttention(row));
  const workers = (panels.compute || []).filter((row) => row.key?.includes("worker") || row.label?.toLowerCase().includes("worker"));
  const query = (panels.ai || []).filter((row) => row.key === "query-engine" || /query/i.test(row.label || ""));
  const sources = buildPinnedSourceRows(panels.providers || [], panels.layers || []).slice(0, 3);
  const sourceSummary = sources.length
    ? [
        {
          kind: "source",
          key: "source-route-summary",
          section: "Source routes",
          label: "Source routes",
          endpoint: "Finance, catalogs, and intake",
          metric: `${sources.length} routes configured`,
          detail: "Known provider routes from desk health and catalog summary.",
          ok: sources.some((row) => row.ok !== false),
          warn: sources.every((row) => needsAttention(row)),
          members: sources.map((row) => resourceName(row)),
        },
      ]
    : [];
  return [
    inventorySection(
      "workers",
      "Workers & query",
      [...workers, ...query],
      "Runtime",
      "Live worker and query-engine facts when the desk reports them.",
    ),
    inventorySection(
      "storage",
      "Storage",
      storage,
      "Storage",
      "Where collected data is archived or staged. Unknown capacity stays blank.",
    ),
    inventorySection(
      "metered",
      "Accounts & limits",
      metered,
      "Account",
      "Configured provider accounts and observed limits only.",
    ),
    inventorySection(
      "sources",
      "Source routes",
      sourceSummary,
      "Route",
      "Known capability routes — not a research lifecycle ledger.",
    ),
  ].filter((section) => section.rows.length);
}

function buildUsageInventorySections(panels) {
  const usage = panels.usage || [];
  const metered = panels.metered || [];
  return [
    inventorySection(
      "usage-storage",
      "Storage usage",
      usage,
      "Storage",
      "Observed vault, hot desk, cache, and staging figures from the resources rollup.",
    ),
    inventorySection(
      "usage-metered",
      "Metered usage",
      metered,
      "Account",
      "Observed spend and call counts when the rollup includes them.",
    ),
  ].filter((section) => section.rows.length);
}

function DatabankStatusStrip({ cluster, health, catalogSummary, datasets = [], partitions = [] }) {
  const inv = cluster?.platform_state;
  const summary = catalogSummary?.summary || catalogSummary || {};
  const instantFromDatasets = datasets.filter((d) => statusPillKind(d).kind === "query-ready").length;
  const partitionCount = partitions.length;
  const registryValue = cluster?.registry_datasets ?? inv?.registry_datasets ?? summary.registry_datasets ?? health?.datasets;
  if (registryValue == null && !inv) return null;
  const registry = registryValue ?? "—";
  const instant = cluster?.instant_datasets ?? inv?.instant_datasets ?? summary.instant_datasets ?? (instantFromDatasets || "syncing");
  const partitionTotal = cluster?.professor_partitions ?? inv?.professor_partitions ?? summary.professor_partitions ?? (partitionCount || "syncing");
  const refinitiv = inv?.refinitiv_datasets ?? 0;
  const unassigned = inv?.unassigned_registry_ids ?? 0;
  const incomplete = cluster?.incomplete_items?.length ?? 0;
  return (
    <section className="rd-v2-res-databank" aria-label="Databank inventory">
      <div className="rd-v2-res-databank-head">
        <h2>Databank</h2>
        <span>
          {registry} registry · {instant} instant · {partitionTotal} partitions
          {refinitiv ? ` · ${refinitiv} Refinitiv` : ""}
          {unassigned === 0 ? " · fully mapped" : ` · ${unassigned} unmapped`}
        </span>
      </div>
      <p className="rd-v2-res-databank-note">
        {cluster?.refinitiv_frozen
          ? "Refinitiv harvest frozen (2026-07-06-complete) — query-ready institutional spine."
          : "Neutral catalog inventory from platform_progress."}
        {incomplete ? ` ${incomplete} activation item(s) tracked.` : ""}
      </p>
    </section>
  );
}

function ResourceInventoryRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`rd-v2-res-inventory-row${selected ? " on" : ""}${resourceTone(item.row)}`}
      data-kind={item.row.kind}
      onClick={() => onSelect?.(item.row)}
    >
      <span className="rd-v2-res-inventory-name">
        <strong>{item.name}</strong>
        <em>{item.type}</em>
      </span>
      <span className="rd-v2-res-inventory-quota">{item.quota}</span>
      <span className="rd-v2-res-inventory-source">{item.source}</span>
      {item.status ? <span className="rd-v2-res-inventory-status">{item.status}</span> : null}
    </button>
  );
}

function ResourceInventory({ sections, selectedKey, onSelect }) {
  if (!sections.length) return null;
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const sourceSection = sections.find((section) => section.id === "sources");
  const sourceRoutes = sourceSection?.rows[0]?.row?.members?.length || sourceSection?.rows.length || 0;
  return (
    <section className="rd-v2-res-inventory" aria-label="Key resources">
      <div className="rd-v2-res-inventory-head">
        <h2>Key resources</h2>
        <span>{total} shown · {sourceRoutes} source routes</span>
      </div>
      {sections.map((section) => (
        <div key={section.id} className="rd-v2-res-inventory-section">
          <div className="rd-v2-res-inventory-section-head">
            <div className="rd-v2-res-inventory-section-title">
              <span>{section.title}</span>
              {section.description ? <em>{section.description}</em> : null}
            </div>
            <small>{section.rows.length}</small>
          </div>
          <div className="rd-v2-res-inventory-body">
            {section.rows.map((item) => (
              <ResourceInventoryRow
                key={item.id}
                item={item}
                selected={selectedKey === item.row.key}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function JobRecoveryStrip({ jobs = [], onOpenDiscoverHistory }) {
  const pending = jobs.filter((job) => /pending|approval|hold|awaiting/i.test(String(job.status || job.state || "")));
  const recovery = jobs.filter((job) => /fail|error|recover|blocked|stalled/i.test(String(job.status || job.state || "")));
  if (!pending.length && !recovery.length) return null;
  const focusJob = recovery[0] || pending[0] || null;
  const parts = [];
  if (pending.length) parts.push(`${pending.length} awaiting approval`);
  if (recovery.length) parts.push(`${recovery.length} need recovery`);
  return (
    <section className="rd-v2-res-job-handoff" aria-label="Job handoff to Discover">
      <div>
        <strong>Collection jobs live in Discover History</strong>
        <p>{parts.join(" · ")}. Resources no longer owns the research lifecycle ledger.</p>
      </div>
      <button
        type="button"
        className="rd-v2-btn sm primary"
        onClick={() => onOpenDiscoverHistory?.(focusJob ? { job: focusJob } : undefined)}
      >
        Open Discover History
      </button>
    </section>
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
  datasets = [],
  partitions = [],
  mode = "capabilities",
  onModeChange,
  selectedKey,
  onRefresh,
  refreshedAt = null,
  onSelectRow,
  onOpenDiscoverHistory,
  rollupError = null,
}) {
  const hasEarlyContext = Boolean(health || ops || jobs.length || catalogSummary || cluster);
  const isInitialLoading = rollupLoading && rollup === undefined && !hasEarlyContext;
  const viewRollup = isInitialLoading ? null : rollup || PLACEHOLDER_ROLLUP;
  const panels = useMemo(
    () =>
      buildResourcesPanels({
        rollup,
        rollupLoading,
        health,
        ops,
        jobs,
        catalogSummary,
        cluster,
      }),
    [rollup, rollupLoading, health, ops, jobs, catalogSummary, cluster],
  );
  const viewMode = mode === "usage" ? "usage" : "capabilities";
  const inventorySections = useMemo(
    () =>
      viewMode === "usage"
        ? buildUsageInventorySections(panels)
        : buildCapabilityInventorySections(panels),
    [panels, viewMode],
  );
  const freshness =
    refreshedAt != null ? `${Math.max(0, Math.round((Date.now() - refreshedAt) / 1000))}s ago` : null;
  const offline = rollup === null && !rollupLoading;
  const emptyInventory = !isInitialLoading && !offline && inventorySections.length === 0;

  return (
    <PageShell
      className="rd-v2-resources-page"
      title="Resources"
      lead="Capabilities and usage — live desk facts only"
      toolbar={
        <>
          <Chip active={viewMode === "capabilities"} onClick={() => onModeChange?.("capabilities")}>
            Capabilities
          </Chip>
          <Chip active={viewMode === "usage"} onClick={() => onModeChange?.("usage")}>
            Usage
          </Chip>
          <WorkersToolbarStat workers={viewRollup?.hero?.workers} />
          {freshness ? <span className="rd-v2-toolbar-meta">Updated {freshness}</span> : null}
          {rollupLoading ? <span className="rd-v2-toolbar-meta">Refreshing…</span> : null}
          <Chip onClick={() => onRefresh?.()}>Refresh</Chip>
        </>
      }
    >
      {offline || rollupError ? (
        <p className="rd-v2-res-offline" role="alert" data-testid="resources-error">
          {rollupError ||
            "Desk API unreachable — start python -m scripts.research_query_engine.server on :8765."}
        </p>
      ) : null}

      {isInitialLoading ? (
        <p className="rd-v2-res-loading" role="status" data-testid="resources-loading">
          Loading resources…
        </p>
      ) : (
        <>
          <JobRecoveryStrip jobs={jobs} onOpenDiscoverHistory={onOpenDiscoverHistory} />
          {viewMode === "capabilities" ? <ResourcesStatusStrip rollup={viewRollup} /> : null}
          {viewMode === "capabilities" ? (
            <DatabankStatusStrip
              cluster={health?.cluster || cluster}
              health={health}
              catalogSummary={catalogSummary}
              datasets={datasets}
              partitions={partitions}
            />
          ) : null}
          {emptyInventory ? (
            <p className="rd-v2-res-idle" role="status" data-testid="resources-empty">
              No live {viewMode === "usage" ? "usage" : "capability"} facts reported yet.
            </p>
          ) : (
            <ResourceInventory
              sections={inventorySections}
              selectedKey={selectedKey}
              onSelect={onSelectRow}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
