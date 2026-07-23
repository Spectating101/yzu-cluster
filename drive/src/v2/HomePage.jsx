import { useMemo } from "react";
import { buildHomeBriefing } from "@/v2/homeBriefing";
import { PageShell } from "@/v2/ui";

function BriefingRow({ item, onOpen, onApproveSafeJobs }) {
  const actionName = `${item.label || item.kind}: ${item.title || item.label}`;
  return (
    <article
      className={`rd-v2-home-attention-row${item.warn ? " warn" : ""}`}
      data-kind={item.kind}
      aria-label={actionName}
    >
      <span className="rd-v2-home-attention-label">{item.label || item.kind}</span>
      <div className="rd-v2-home-attention-main">
        <strong>{item.title || item.label}</strong>
        <span>{item.detail}</span>
      </div>
      {item.metric ? <span className="rd-v2-home-attention-metric">{item.metric}</span> : <span />}
      <div className="rd-v2-home-attention-actions">
        {item.kind === "approval" && onApproveSafeJobs ? (
          <button
            type="button"
            className="rd-v2-btn sm primary"
            aria-label="Approve safe pending jobs"
            onClick={() => onApproveSafeJobs()}
          >
            Approve safe
          </button>
        ) : null}
        <button
          type="button"
          className="rd-v2-btn sm"
          aria-label={`Open ${actionName}`}
          onClick={() => onOpen(item)}
        >
          Open
        </button>
      </div>
    </article>
  );
}

function EmptyBlock({ title, detail }) {
  return (
    <div className="rd-v2-home-empty" role="status">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function HomePage({
  datasets = [],
  health,
  profile = null,
  acquisitions = [],
  jobs = [],
  onGoTab,
  onOpenAttention,
  onSelectDataset,
  onPreviewDataset,
  onSuggestSearch,
  onApproveSafeJobs,
  onOpenDiscoverHistory,
  onOpenInLibrary,
}) {
  const briefing = useMemo(
    () => buildHomeBriefing({ datasets, jobs, acquisitions, health, profile }),
    [datasets, jobs, acquisitions, health, profile],
  );

  const openItem = (item) => {
    if (!item) return;
    if (item.discoverMode === "history") {
      onOpenDiscoverHistory?.(item);
      return;
    }
    if (item.kind === "approval" || item.discoverFilter || item.resourceRow?.job) {
      onOpenAttention?.(item);
      return;
    }
    if (item.dataset) {
      if (onOpenInLibrary) onOpenInLibrary(item.dataset);
      else {
        onSelectDataset?.(item.dataset);
        onGoTab("library");
      }
      return;
    }
    if (item.searchQuery) {
      onSuggestSearch?.(item.searchQuery);
      return;
    }
    onGoTab(item.tab || "library");
  };

  const { continueWork, needsJudgment, evidence, nextActions, empty } = briefing;

  return (
    <PageShell
      className="rd-v2-home-page"
      title="Home"
      lead="Continue · judgment · evidence — research state, not a dashboard"
      footer={null}
    >
      <section className="rd-v2-home-continue" aria-label="Continue work" data-testid="home-continue">
        {continueWork ? (
          <>
            <div className="rd-v2-home-continue-copy">
              <span>Continue work</span>
              <h2>{continueWork.title}</h2>
              <p className="rd-v2-home-continue-id mono">{continueWork.detail}</p>
              <p>{continueWork.readiness}</p>
            </div>
            <div className="rd-v2-home-continue-actions">
              <button
                type="button"
                className="rd-v2-btn sm"
                onClick={() => {
                  if (onOpenInLibrary) onOpenInLibrary(continueWork.dataset);
                  else {
                    onSelectDataset?.(continueWork.dataset);
                    onGoTab("library");
                  }
                }}
              >
                Open in Library
              </button>
              {continueWork.previewAllowed ? (
                <button
                  type="button"
                  className="rd-v2-btn sm primary"
                  onClick={() => onPreviewDataset?.(continueWork.dataset)}
                >
                  Preview rows
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyBlock
            title="No resume point yet"
            detail="Open Library or search Discover when you have a holding or research need."
          />
        )}
      </section>

      <section className="rd-v2-home-attention" aria-label="Needs judgment" data-testid="home-judgment">
        <div className="rd-v2-home-attention-head">
          <h2>Needs judgment</h2>
          <span>{needsJudgment.length || "none"}</span>
        </div>
        <div className="rd-v2-home-attention-body">
          {empty.judgment ? (
            <EmptyBlock title="Nothing waiting on you" detail="Pending approvals and recovery jobs appear here when the desk reports them." />
          ) : (
            needsJudgment.map((item) => (
              <BriefingRow
                key={item.id}
                item={item}
                onOpen={openItem}
                onApproveSafeJobs={onApproveSafeJobs}
              />
            ))
          )}
        </div>
      </section>

      <section className="rd-v2-home-recent" aria-label="Recently changed evidence" data-testid="home-evidence">
        <div className="rd-v2-home-attention-head">
          <h2>Recently changed / available</h2>
          <button type="button" className="rd-v2-linkish" onClick={() => onGoTab("library")}>
            Library →
          </button>
        </div>
        {empty.evidence ? (
          <EmptyBlock title="No holdings observed" detail="Registered assets will list here once the catalog returns rows." />
        ) : (
          <ul className="rd-v2-home-recent-list">
            {evidence.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="rd-v2-home-recent-row"
                  onClick={() => openItem(row)}
                >
                  <span className="rd-v2-home-recent-main">
                    <strong>{row.title}</strong>
                    <em className="mono">{row.detail}</em>
                  </span>
                  <span className="rd-v2-pill">
                    {row.freshnessUnknown ? `${row.metric} · freshness unknown` : row.metric}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rd-v2-home-gaps" aria-label="Next valid actions" data-testid="home-actions">
        <div className="rd-v2-home-attention-head">
          <h2>Next valid actions</h2>
        </div>
        {empty.actions ? (
          <EmptyBlock title="No derived actions" detail="Actions appear from live jobs, holdings, and research-context recommendations." />
        ) : (
          <div className="rd-v2-home-action-list">
            {nextActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="rd-v2-home-action-row"
                onClick={() => openItem(action)}
              >
                <strong>{action.label}</strong>
                <span>{action.detail}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
