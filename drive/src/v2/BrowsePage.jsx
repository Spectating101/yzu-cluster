import { useEffect, useMemo, useState } from "react";
import { discoverSearch, discoverSources, unifiedSearch, webDiscover } from "@/v2/api";
import { sourcesResponseToRows } from "@/v2/discoverAdapters";
import { DiscoverHistoryPanel } from "@/v2/DiscoverHistoryPanel";
import { jobToCandidateRow, pendingApprovalJobs } from "@/v2/procurementJobs";
import {
  classifyDiscoverResult,
  coverageLine,
  descriptiveLine,
  discoverCandidateState,
  exceptionalRowPill,
  orderDiscoverResults,
  taxonomyMatchesFilter,
  taxonomyStageCounts,
} from "@/v2/browseMeta";
import { discoverCandidateUrl, webHitsToRows } from "@/v2/discoverActions";
import { candidateKey, isCandidateQueued, withCandidateKey } from "@/v2/candidateKey";
import { buildDiscoverLifecycle, projectDiscoverCandidateLifecycle } from "@/v2/discoverLifecycle";
import { groupDiscoverBrowseRows } from "@/v2/discoverComposition";
import { assessLocalSufficiency } from "@/v2/discoverSufficiency";
import { loadUserEmail } from "@/v2/deskSession";
import { discoverDemoSearch } from "@/v2/deskSeed";
import { DiscoverEmptyState } from "@/v2/DiscoverEmptyState";
import { Chip, PageShell, SourceRibbon } from "@/v2/ui";

const FILTERS = [
  { id: "all", label: "All results" },
  { id: "in_lab", label: "In lab" },
  { id: "query_ready", label: "Query ready" },
  { id: "external", label: "Beyond your lab" },
  { id: "needs_access", label: "Needs access" },
];

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function candidateTitle(row) {
  return row?.title || row?.name || row?.dataset_id || row?.doi || row?.url || "External dataset";
}

function hostLabel(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function short(value, max = 110) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function DiscoverModeTabs({ mode = "explore", pendingCount = 0, onChange }) {
  const tabs = [
    { id: "explore", label: "Explore" },
    { id: "history", label: pendingCount ? `History · ${pendingCount}` : "History" },
  ];
  return (
    <div className="rd-v2-discover-modes" role="tablist" aria-label="Discover mode">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          className={mode === tab.id ? "on" : ""}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CandidateMini({ row, onSelect, selected }) {
  const taxonomy = row.discover_taxonomy || {};
  const description = descriptiveLine(row) || coverageLine(row) || "Metadata has not been described.";
  return (
    <button
      type="button"
      className={`rd-rc3-discover-mini${selected ? " selected" : ""}`}
      onClick={() => onSelect?.(row)}
    >
      <span>
        <SourceRibbon source={row.source || row.publisher || row.backend || hostLabel(row.url)} />
        <em>{taxonomy.label || "Candidate"}</em>
      </span>
      <strong>{candidateTitle(row)}</strong>
      <small>{short(description, 96)}</small>
    </button>
  );
}

function SemanticResearchState({ query, rows, labIds, selectedId, onSelectRow, onSearchWeb }) {
  const held = rows.filter((row) => {
    const tax = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
    return tax.key?.startsWith("local-") || Number(tax.group) <= 2;
  });
  const access = rows.filter((row) => {
    const tax = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
    return tax.key === "needs-access" || /access|credential|license/i.test(String(row.access || row.status || ""));
  });
  const wider = rows.filter((row) => !held.includes(row) && !access.includes(row));
  const incomplete = rows.filter((row) => {
    const sufficiency = row.discover_sufficiency;
    return sufficiency && !/sufficient|complete|strong/i.test(String(sufficiency.state || sufficiency.browseLine || ""));
  });
  const topHeld = held.slice(0, 3);
  const topWider = wider.slice(0, 4);
  const topAccess = access.slice(0, 2);
  const unknowns = [
    incomplete.length ? `${incomplete.length} candidate${incomplete.length === 1 ? "" : "s"} still need coverage or grain validation.` : null,
    wider.length ? "External candidates are not owned evidence until collection, archive, and registration succeed." : null,
    access.length ? `${access.length} route${access.length === 1 ? "" : "s"} require access review before acquisition.` : null,
  ].filter(Boolean);

  return (
    <section className="rd-rc3-discover-state" aria-label="Semantic research state">
      <header>
        <div>
          <span>Current exploration</span>
          <h2>{query}</h2>
          <p>
            Research Drive is showing the evidence space around this question—not claiming that every relevant source is complete, accessible, or sufficient.
          </p>
        </div>
        <div className="rd-rc3-discover-state-metrics">
          <strong>{held.length}</strong><span>held</span>
          <strong>{wider.length}</strong><span>wider</span>
          <strong>{access.length}</strong><span>access review</span>
        </div>
      </header>

      <div className="rd-rc3-discover-columns">
        <section>
          <div className="rd-rc3-discover-column-head">
            <span>01</span>
            <div><strong>Held evidence</strong><small>What the lab can already inspect or query</small></div>
          </div>
          <div className="rd-rc3-discover-column-body">
            {topHeld.length ? topHeld.map((row) => (
              <CandidateMini
                key={candidateKey(row)}
                row={row}
                selected={selectedId === candidateKey(row)}
                onSelect={onSelectRow}
              />
            )) : <p>No current holding explicitly matches this question.</p>}
          </div>
        </section>

        <section>
          <div className="rd-rc3-discover-column-head">
            <span>02</span>
            <div><strong>Source space</strong><small>What may broaden coverage or change the design</small></div>
          </div>
          <div className="rd-rc3-discover-column-body">
            {topWider.length ? topWider.map((row) => (
              <CandidateMini
                key={candidateKey(row)}
                row={row}
                selected={selectedId === candidateKey(row)}
                onSelect={onSelectRow}
              />
            )) : <p>No wider candidate is currently indexed.</p>}
          </div>
          {onSearchWeb ? (
            <button type="button" className="rd-rc3-inline-command" onClick={() => onSearchWeb(query)}>
              Search beyond the current source index →
            </button>
          ) : null}
        </section>

        <section>
          <div className="rd-rc3-discover-column-head">
            <span>03</span>
            <div><strong>Research decisions</strong><small>What remains unresolved before evidence can be trusted</small></div>
          </div>
          <div className="rd-rc3-discover-unknowns">
            {unknowns.length ? unknowns.map((item) => <p key={item}>{item}</p>) : <p>No material uncertainty has been classified yet.</p>}
            {topAccess.map((row) => (
              <CandidateMini
                key={candidateKey(row)}
                row={row}
                selected={selectedId === candidateKey(row)}
                onSelect={onSelectRow}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function DiscoverCandidateRow({ row, labIds, selectedId, onSelectRow }) {
  const taxonomy = row.discover_taxonomy || classifyDiscoverResult(row, labIds);
  const state = row.discover_state || discoverCandidateState(row, labIds);
  const selected = selectedId === candidateKey(row);
  const ribbonSource = row.source || row.collect_via || row.source_route || row.publisher || row.backend || hostLabel(row.url);
  const exceptionPill = exceptionalRowPill(row, taxonomy, state);
  const showSufficiency = Number(taxonomy.group) >= 3 && row.discover_sufficiency?.browseLine;
  const evidenceLine = String(row?.description || row?.recommended_use || row?.subtitle || "").trim()
    ? descriptiveLine(row)
    : "";
  const coverage = coverageLine(row);
  const showCoverage = coverage && coverage !== "Coverage not described";

  return (
    <li className={selected ? "rd-v2-row-on" : undefined}>
      <button
        type="button"
        className={`row rd-v2-discover-candidate${selected ? " selected" : ""}${exceptionPill ? " has-exception" : ""}`}
        data-kind={taxonomy.key}
        data-state={state.key}
        data-sufficiency={showSufficiency ? row.discover_sufficiency.state : undefined}
        aria-pressed={selected}
        onClick={() => onSelectRow(row)}
      >
        <span className="rd-v2-discover-candidate-source">
          <SourceRibbon source={ribbonSource} />
          {exceptionPill ? <span className={`rd-v2-pill ${exceptionPill.className}`}>{exceptionPill.label}</span> : null}
        </span>
        <span className="rd-v2-discover-candidate-main">
          <span className="rd-v2-discover-candidate-heading">
            <strong className="rd-v2-discover-candidate-title">
              {selected ? <span className="rd-v2-discover-selected-mark" aria-hidden="true" /> : null}
              {candidateTitle(row)}
            </strong>
            <em className="rd-v2-discover-possession">{taxonomy.label}</em>
          </span>
          {evidenceLine ? <span className="rd-v2-discover-evidence">{evidenceLine}</span> : null}
          {showCoverage ? <span className="rd-v2-discover-coverage">{coverage}</span> : null}
          {showSufficiency ? (
            <span
              className={`rd-v2-discover-sufficiency rd-v2-discover-sufficiency-${row.discover_sufficiency.state}`}
              data-testid="discover-sufficiency-line"
            >
              {row.discover_sufficiency.browseLine}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function DiscoverCandidateList({ rows, labIds, selectedId, onSelectRow }) {
  return (
    <ul className="rd-v2-catalog rd-v2-discover-candidates" aria-label="Discover candidates">
      {rows.map((row) => (
        <DiscoverCandidateRow
          key={candidateKey(row) || candidateTitle(row)}
          row={row}
          labIds={labIds}
          selectedId={selectedId}
          onSelectRow={onSelectRow}
        />
      ))}
    </ul>
  );
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const stamped = withCandidateKey(row);
    const key = candidateKey(stamped);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(stamped);
  }
  return out;
}

export function BrowsePage({
  labIds,
  catalog = [],
  selectedId,
  onSelectRow,
  searchQuery,
  jobs = [],
  usingSeed = false,
  probeSnapshots = {},
  onSuggestSearch,
  onSearchWeb,
  discoverMode = "explore",
  onDiscoverModeChange,
  discoverFocusAwaiting = false,
  historyEvents = [],
  selectedHistoryId = "",
  onSelectHistoryEvent,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [demoFallback, setDemoFallback] = useState(false);
  const [stateFilter, setStateFilter] = useState("all");
  const [indexMiss, setIndexMiss] = useState(false);

  const pendingRows = useMemo(
    () => pendingApprovalJobs(jobs).map((job) => jobToCandidateRow(job)).filter(Boolean),
    [jobs],
  );
  const isExplore = discoverMode === "explore" || discoverMode === "search";
  const showHistory = discoverMode === "history";

  useEffect(() => {
    if (!isExplore || !pendingRows.length || selectedId || !discoverFocusAwaiting) return;
    onSelectRow?.(pendingRows[0]);
  }, [isExplore, pendingRows, selectedId, onSelectRow, discoverFocusAwaiting]);

  useEffect(() => {
    let cancelled = false;
    const q = (searchQuery || "").trim();
    const email = loadUserEmail();
    const immediateDemo = discoverDemoSearch(q);
    setLoading(true);
    setError("");
    setSource("");
    setDemoFallback(false);
    setRows([]);
    setStateFilter("all");
    setIndexMiss(false);

    const flattenRows = (data) => {
      const fromApi = (data.sections || []).flatMap((section) => section.rows || []);
      return fromApi.length ? fromApi : data.results || data.hits || [];
    };

    const apply = (data, label) => {
      if (cancelled) return 0;
      const flat = flattenRows(data);
      setRows(flat);
      setSource(label);
      if (label !== "demo") setDemoFallback(false);
      return flat.length;
    };

    const run = async () => {
      try {
        if (discoverMode === "history") {
          setRows([]);
          setSource("");
          setLoading(false);
          return;
        }
        if (!q) {
          setRows([]);
          setSource("");
          return;
        }
        try {
          const sources = await discoverSources(q, { limit: 12 });
          const sourceRows = sourcesResponseToRows(sources);
          if (sourceRows.length) {
            apply({ results: sourceRows }, sources.demo ? "demo" : "sources");
            if (sources.demo) setDemoFallback(true);
            return;
          }
        } catch {
          // The sources contract is optional on older desks.
        }

        const discover = await discoverSearch(q, 12, email);
        const discoverRows = flattenRows(discover);
        const needsUnified = discoverRows.length === 0 || Boolean(discover.index_miss || discover.weak_match);
        let mergedRows = discoverRows;
        let label = discoverRows.length ? "discover" : "";
        let miss = Boolean(discover.index_miss) && discoverRows.length === 0;

        if (needsUnified) {
          const search = await unifiedSearch(q, 12, email);
          const searchRows = flattenRows(search);
          if (searchRows.length) {
            mergedRows = dedupeRows([...discoverRows, ...searchRows]);
            label = discoverRows.length ? "discover" : "search";
          }
          if (!discoverRows.length) {
            miss = Boolean(discover.index_miss || search.index_miss || search.discover_index_miss || !searchRows.length);
          }
        }

        const hasAcquireCandidate = mergedRows.some((row) => {
          const tax = classifyDiscoverResult(row, labIds);
          return !tax.key.startsWith("local-") && Boolean(discoverCandidateUrl(row));
        });

        if (mergedRows.length && !hasAcquireCandidate) {
          const web = await webDiscover(q, 8);
          mergedRows = dedupeRows([...mergedRows, ...webHitsToRows(web)]);
        }

        if (mergedRows.length) {
          apply({ sections: [{ id: label || "discover", rows: mergedRows }] }, label || "discover");
          return;
        }
        if (immediateDemo.length) {
          apply({ sections: [{ id: "demo", rows: immediateDemo }] }, "demo");
          return;
        }
        const webRows = webHitsToRows(await webDiscover(q, 8));
        if (webRows.length) {
          apply({ sections: [{ id: "web", rows: webRows }] }, "web");
          return;
        }
        setIndexMiss(miss);
      } catch (cause) {
        if (cancelled) return;
        if (immediateDemo.length) {
          setRows(immediateDemo);
          setSource("demo");
          setDemoFallback(true);
        } else {
          setError("Catalog search unavailable. Check the query engine and retry.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, discoverMode, labIds]);

  const merged = useMemo(() => {
    const seen = new Set();
    const stampedRows = [];
    for (const row of rows) {
      const stamped = withCandidateKey(row);
      const key = candidateKey(stamped);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const queued = isCandidateQueued(stamped, jobs);
      const withProbe = probeSnapshots[key] && !stamped.probe_snapshot
        ? { ...stamped, probe_snapshot: { ...probeSnapshots[key], candidate_key: probeSnapshots[key].candidate_key || key } }
        : stamped;
      const base = queued ? { ...withProbe, queued: true } : withProbe;
      const lifecycle = buildDiscoverLifecycle({ row: base, jobs, catalog, labIds });
      const projected = projectDiscoverCandidateLifecycle(base, lifecycle);
      const taxonomy = projected.discover_taxonomy || classifyDiscoverResult(projected, labIds);
      const sufficiency = Number(taxonomy.group) >= 3 ? assessLocalSufficiency(projected, catalog) : null;
      stampedRows.push({ ...projected, discover_taxonomy: taxonomy, discover_sufficiency: sufficiency });
    }
    return orderDiscoverResults(stampedRows, labIds);
  }, [rows, jobs, labIds, catalog, probeSnapshots]);

  const filtered = useMemo(() => {
    if (stateFilter === "all") return merged;
    return merged.filter((row) => taxonomyMatchesFilter(row.discover_taxonomy || classifyDiscoverResult(row, labIds), stateFilter));
  }, [merged, stateFilter, labIds]);
  const browseGroups = useMemo(() => groupDiscoverBrowseRows(filtered), [filtered]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((item) => [
      item.id,
      item.id === "all"
        ? merged.length
        : merged.filter((row) => taxonomyMatchesFilter(row.discover_taxonomy || classifyDiscoverResult(row, labIds), item.id)).length,
    ])),
    [merged, labIds],
  );
  const stageCounts = useMemo(() => taxonomyStageCounts(merged, labIds), [merged, labIds]);
  const q = (searchQuery || "").trim();
  const demoMode = demoFallback || (usingSeed && source === "demo");
  const activeFilter = FILTERS.find((item) => item.id === stateFilter) || FILTERS[0];
  const scopeSummary = [
    stageCounts.inLab ? `${plural(stageCounts.inLab, "holding")} in the lab` : null,
    stageCounts.external ? `${plural(stageCounts.external, "candidate")} beyond it` : null,
    stageCounts.needsAccess ? `${plural(stageCounts.needsAccess, "route")} need access review` : null,
  ].filter(Boolean).join(" · ");

  const modeTabs = (
    <DiscoverModeTabs
      mode={showHistory ? "history" : "explore"}
      pendingCount={pendingRows.length}
      onChange={onDiscoverModeChange}
    />
  );

  if (showHistory) {
    return (
      <PageShell
        className="rd-v2-discover-page rd-v2-discover-page--history rd-rc3-discover-page"
        title="Discover"
        lead="Trace exploration, sourcing decisions, collection, and registration without losing the originating research question."
        headExtra={modeTabs}
      >
        <DiscoverHistoryPanel
          events={historyEvents}
          selectedId={selectedHistoryId}
          onSelectEvent={onSelectHistoryEvent}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      className="rd-v2-discover-page rd-rc3-discover-page"
      title="Discover"
      lead="Browse freely, understand the evidence space, then formalize acquisition only when the research need becomes concrete."
      headExtra={modeTabs}
      toolbar={demoMode ? <Chip warn>Demo preview · static sample</Chip> : null}
    >
      <div className="rd-v2-discover-browse" data-testid="discover-browse-mode" data-mode="browse">
        {!q ? (
          <div className="rd-rc3-discover-empty">
            <section>
              <span>Semantic source investigation</span>
              <h2>Start with a research question, a half-formed idea, or a missing field.</h2>
              <p>
                Discover searches held evidence first, broadens into external source space, and keeps uncertainty visible. You do not need a finished specification to begin.
              </p>
            </section>
            <DiscoverEmptyState onSuggest={onSuggestSearch} />
          </div>
        ) : (
          <>
            <SemanticResearchState
              query={q}
              rows={merged}
              labIds={labIds}
              selectedId={selectedId}
              onSelectRow={onSelectRow}
              onSearchWeb={onSearchWeb}
            />

            <section
              className="rd-v2-discover-result-summary rd-rc3-source-index-head"
              aria-label="Discover result summary"
              data-testid="discover-result-summary"
            >
              <div className="rd-v2-discover-result-copy">
                <p className="rd-v2-discover-result-eyebrow">Source index</p>
                <h2 className="rd-v2-discover-result-title">
                  {stateFilter === "all" ? `${plural(merged.length, "result")} for “${q}”` : `${plural(filtered.length, "result")} · ${activeFilter.label}`}
                </h2>
                <p className="rd-v2-discover-result-scope">{scopeSummary || "No classified source or holding is available yet."}</p>
              </div>
              <details className="rd-v2-discover-filter-menu" data-testid="discover-filter-menu">
                <summary><span>Filter</span>{stateFilter !== "all" ? <strong>{activeFilter.label}</strong> : null}</summary>
                <div className="rd-v2-discover-filter-popover" role="group" aria-label="Filter Discover results">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={stateFilter === item.id ? "on" : ""}
                      aria-pressed={stateFilter === item.id}
                      onClick={(event) => {
                        setStateFilter(item.id);
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <span>{item.label}</span><b>{filterCounts[item.id] || 0}</b>
                    </button>
                  ))}
                </div>
              </details>
            </section>

            {loading ? <p className="rd-v2-browse-loading">Searching the lab and wider sources…</p> : null}
            {!loading && error ? <div className="rd-v2-discover-error"><p>{error}</p></div> : null}
            {!loading && !error && filtered.length === 0 ? (
              <div className="rd-v2-discover-miss">
                <p className="rd-v2-empty-inline">No {stateFilter === "all" ? "" : `${activeFilter.label.toLowerCase()} `}matches for “{q}”{indexMiss ? " in the current research index." : "."}</p>
                {indexMiss && onSearchWeb ? <button type="button" className="rd-v2-btn sm" onClick={() => onSearchWeb(q)}>Ask Research Drive to search wider →</button> : null}
              </div>
            ) : null}

            {browseGroups.length ? (
              <div className="rd-v2-discover-browse-groups rd-rc3-source-index">
                {browseGroups.map((group) => (
                  <section key={group.id} className="rd-v2-discover-group" data-group={group.id} aria-label={group.title}>
                    <header className="rd-v2-discover-group-head">
                      <div><h3 className="rd-v2-discover-group-title">{group.title}</h3><p className="rd-v2-discover-group-description">{group.description}</p></div>
                      <span className="rd-v2-discover-group-count" aria-label={`${group.rows.length} results`}>{group.rows.length}</span>
                    </header>
                    <DiscoverCandidateList rows={group.rows} labIds={labIds} selectedId={selectedId} onSelectRow={onSelectRow} />
                  </section>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
